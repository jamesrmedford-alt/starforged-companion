/**
 * STARFORGED COMPANION
 * tests/unit/shipMapSceneBuilder.test.js
 *
 * Battle Stations! ship-map deck-plan Scene (shipboard-combat mini-game
 * Phase A). Covers the pure builders, the Scene creation pipeline, the
 * vision-coordinate override + fixed-layout fallback, the layout/role parity
 * invariant, the !shipmap command matcher, and the station-pin click handler.
 *
 * The Scene/Note/Drawing pipeline mirrors sectorSceneBuilder.test.js — the
 * same mock Scene shape and the same PLAYTEST-1712 A scene-rect inset.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  STATION_LAYOUT,
  AMENITY_LAYOUT,
  buildStationNoteData,
  buildModuleFeatures,
  buildDeckFeatures,
  buildHullOutlineDrawing,
  createShipMapScene,
  findShipMapScene,
  isShipMapCommand,
  handleShipDeckNoteClick,
} from "../../src/moves/shipMapScene.js";
import { SHIPBOARD_ROLES } from "../../src/moves/battleStations.js";

const MODULE_ID = "starforged-companion";

// Foundry insets the background ("scene rectangle") by (sceneX, sceneY) within
// the larger padded canvas. With 1792×1024 / grid 100 / padding 0.1 the inset
// is (200, 200) — the value real scene.dimensions returns.
const SCENE_X = 200;
const SCENE_Y = 200;
const SCENE_W = 1792;
const SCENE_H = 1024;

let createdNotes;
let createdDrawings;
let mockScene;

beforeEach(() => {
  createdNotes    = null;
  createdDrawings = null;

  mockScene = {
    id:   "ship-scene-1",
    uuid: "Scene.ship-scene-1",
    name: "Kestrel — Deck Plan",
    dimensions: { sceneX: SCENE_X, sceneY: SCENE_Y, sceneWidth: SCENE_W, sceneHeight: SCENE_H },
    update: vi.fn(async () => mockScene),
    createEmbeddedDocuments: vi.fn(async (type, data) => {
      if (type === "Note")    createdNotes    = data;
      if (type === "Drawing") createdDrawings = data;
      return data;
    }),
  };

  global.Scene = { create: vi.fn(async () => mockScene) };
});

afterEach(() => {
  delete global.Scene;
  delete global.game;
  delete global.ui;
  vi.restoreAllMocks();
});

function makeShipActor({ modules = [] } = {}) {
  const items = modules.map(name => ({
    type: "asset",
    name,
    system: { category: "Module" },
  }));
  return { id: "actor-ship-1", name: "Kestrel", items };
}

// ---------------------------------------------------------------------------
// Layout / role parity — the invariant
// ---------------------------------------------------------------------------

describe("STATION_LAYOUT ↔ SHIPBOARD_ROLES parity", () => {
  it("has exactly one layout entry per canonical role and no extras", () => {
    const layoutIds = STATION_LAYOUT.map(s => s.id).sort();
    const roleIds   = SHIPBOARD_ROLES.map(r => r.id).sort();
    expect(layoutIds).toEqual(roleIds);
  });

  it("places all 11 stations within the scene rectangle (no pin in the void)", () => {
    for (const st of STATION_LAYOUT) {
      expect(st.gridX).toBeGreaterThanOrEqual(1);
      expect(st.gridX).toBeLessThanOrEqual(16);   // ×100 must stay within 1792
      expect(st.gridY).toBeGreaterThanOrEqual(1);
      expect(st.gridY).toBeLessThanOrEqual(9);     // ×100 must stay within 1024
      expect(typeof st.icon).toBe("string");
      expect(st.icon).toMatch(/^icons\/svg\//);
    }
  });
});

// ---------------------------------------------------------------------------
// buildStationNoteData — pure
// ---------------------------------------------------------------------------

describe("buildStationNoteData()", () => {
  const offset = { x: SCENE_X, y: SCENE_Y, sceneWidth: SCENE_W, sceneHeight: SCENE_H };

  it("places all 11 pins at fixed grid coords, offset by the scene rect", () => {
    const notes = buildStationNoteData("actor-ship-1", offset);
    expect(notes).toHaveLength(11);

    const gunnery = notes.find(n => n.flags[MODULE_ID].stationId === "gunnery");
    const layout  = STATION_LAYOUT.find(s => s.id === "gunnery");
    expect(gunnery.x).toBe(SCENE_X + layout.gridX * 100);
    expect(gunnery.y).toBe(SCENE_Y + layout.gridY * 100);
    expect(gunnery.flags[MODULE_ID].shipStationNote).toBe(true);
    expect(gunnery.flags[MODULE_ID].shipActorId).toBe("actor-ship-1");
    expect(gunnery.flags[MODULE_ID].placedByVision).toBe(false);
  });

  it("labels each pin with the canonical role label", () => {
    const notes = buildStationNoteData("actor-ship-1", offset);
    const piloting = notes.find(n => n.flags[MODULE_ID].stationId === "piloting");
    expect(piloting.text).toBe("Piloting");
  });

  it("uses normalized vision coords when supplied, mapped onto the scene rect", () => {
    const coords = { gunnery: { x: 0.5, y: 0.25 } };   // partial — only gunnery
    const notes  = buildStationNoteData("actor-ship-1", offset, coords);

    const gunnery = notes.find(n => n.flags[MODULE_ID].stationId === "gunnery");
    expect(gunnery.x).toBe(Math.round(SCENE_X + 0.5 * SCENE_W));
    expect(gunnery.y).toBe(Math.round(SCENE_Y + 0.25 * SCENE_H));
    expect(gunnery.flags[MODULE_ID].placedByVision).toBe(true);

    // A station absent from the partial map falls back to its fixed position.
    const piloting = notes.find(n => n.flags[MODULE_ID].stationId === "piloting");
    const pLayout  = STATION_LAYOUT.find(s => s.id === "piloting");
    expect(piloting.x).toBe(SCENE_X + pLayout.gridX * 100);
    expect(piloting.flags[MODULE_ID].placedByVision).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildHullOutlineDrawing — pure, v13-mandatory fields
// ---------------------------------------------------------------------------

describe("buildHullOutlineDrawing()", () => {
  it("carries every v13-mandatory Drawing field and a non-zero bounding box", () => {
    const d = buildHullOutlineDrawing({ x: SCENE_X, y: SCENE_Y });
    expect(d.shape.type).toBe("p");
    expect(d.shape.width).toBeGreaterThan(0);
    expect(d.shape.height).toBeGreaterThan(0);
    expect(Array.isArray(d.shape.points)).toBe(true);
    expect(typeof d.text).toBe("string");          // required string field
    expect(typeof d.fontFamily).toBe("string");
    expect(typeof d.fillColor).toBe("string");
    expect(d.flags[MODULE_ID].shipMapHull).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createShipMapScene — pipeline
// ---------------------------------------------------------------------------

describe("createShipMapScene()", () => {
  it("creates the scene with the 11 stations + galley pinned, and flags the scene to the ship", async () => {
    const scene = await createShipMapScene(makeShipActor(), {});
    expect(global.Scene.create).toHaveBeenCalledOnce();

    const createArg = global.Scene.create.mock.calls[0][0];
    expect(createArg.flags[MODULE_ID].shipMapScene).toBe(true);
    expect(createArg.flags[MODULE_ID].shipActorId).toBe("actor-ship-1");
    expect(createArg.name).toBe("Kestrel — Deck Plan");

    expect(createdNotes).not.toBeNull();
    const stations = createdNotes.filter(n => n.flags[MODULE_ID].deckFeatureKind === "station");
    const galley   = createdNotes.find(n => n.flags[MODULE_ID].deckFeatureId === "galley");
    expect(stations).toHaveLength(11);
    expect(galley).toBeDefined();
    expect(galley.text).toBe("Galley");
    expect(createdNotes).toHaveLength(12);   // 11 stations + galley, no modules
    expect(scene).toBe(mockScene);
  });

  it("pins the ship's installed modules too", async () => {
    await createShipMapScene(makeShipActor({ modules: ["Medbay", "Heavy Cannons"] }), {});
    const modules = createdNotes.filter(n => n.flags[MODULE_ID].deckFeatureKind === "module");
    expect(modules.map(n => n.text).sort()).toEqual(["Heavy Cannons", "Medbay"]);
    expect(createdNotes).toHaveLength(14);   // 11 stations + galley + 2 modules
  });

  it("draws the schematic hull when there is no background art", async () => {
    await createShipMapScene(makeShipActor(), { backgroundPath: null });
    expect(createdDrawings).not.toBeNull();
    expect(createdDrawings).toHaveLength(1);
    expect(createdDrawings[0].flags[MODULE_ID].shipMapHull).toBe(true);
  });

  it("skips the schematic hull when background art is present and adds the leading slash", async () => {
    await createShipMapScene(makeShipActor(), { backgroundPath: "worlds/w/scenes/ship-map-x.png" });
    expect(createdDrawings).toBeNull();              // art replaces the schematic backdrop

    const createArg = global.Scene.create.mock.calls[0][0];
    expect(createArg.background.src).toBe("/worlds/w/scenes/ship-map-x.png");
  });

  it("never sets entryId on station notes (would fail v13 NoteDocument validation)", async () => {
    await createShipMapScene(makeShipActor(), {});
    for (const note of createdNotes) {
      expect(note.entryId == null).toBe(true);
    }
  });

  it("passes vision coords through to the pins when supplied", async () => {
    const coords = Object.fromEntries(STATION_LAYOUT.map((s, i) => [s.id, { x: 0.1 + i * 0.07, y: 0.5 }]));
    await createShipMapScene(makeShipActor(), { backgroundPath: "/bg.png", stationCoords: coords });
    const visionPlaced = createdNotes.filter(n => n.flags[MODULE_ID].placedByVision);
    expect(visionPlaced).toHaveLength(11);
  });
});

// ---------------------------------------------------------------------------
// findShipMapScene
// ---------------------------------------------------------------------------

describe("findShipMapScene()", () => {
  it("returns the scene flagged for the ship actor, or null", () => {
    const target = { flags: { [MODULE_ID]: { shipMapScene: true, shipActorId: "a-1" } } };
    const other  = { flags: { [MODULE_ID]: { shipMapScene: true, shipActorId: "a-2" } } };
    const sector = { flags: { [MODULE_ID]: { sectorScene: true } } };
    global.game = { scenes: { contents: [other, sector, target] } };

    expect(findShipMapScene("a-1")).toBe(target);
    expect(findShipMapScene("a-3")).toBeNull();
    expect(findShipMapScene(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isShipMapCommand
// ---------------------------------------------------------------------------

describe("isShipMapCommand()", () => {
  it("matches the command and its aliases", () => {
    for (const c of ["!shipmap", "!ship-map", "!deckplan", "!shipmap rebuild", "!SHIPMAP"]) {
      expect(isShipMapCommand({ content: c })).toBe(true);
    }
  });

  it("does not match unrelated input or the space-delimited !ship command", () => {
    for (const c of ["!ship envision", "!ship history", "!stations", "shipmap", "hello"]) {
      expect(isShipMapCommand({ content: c })).toBe(false);
    }
  });

  it("ignores re-posts of its own card", () => {
    expect(isShipMapCommand({ content: "!shipmap", flags: { [MODULE_ID]: { shipMapCard: true } } })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleShipStationNoteClick
// ---------------------------------------------------------------------------

describe("handleShipDeckNoteClick()", () => {
  it("surfaces the feature description and suppresses the default for deck pins", () => {
    const info = vi.fn();
    global.ui = { notifications: { info } };
    const note = { document: { flags: { [MODULE_ID]: {
      shipDeckNote: true, deckFeatureId: "gunnery", deckFeatureLabel: "Gunnery",
      deckFeatureDescription: "Fire weapons", stationId: "gunnery",
    } } } };

    expect(handleShipDeckNoteClick(note)).toBe(false);
    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0][0]).toMatch(/Gunnery/);
  });

  it("works for a galley / module pin (no station role)", () => {
    const info = vi.fn();
    global.ui = { notifications: { info } };
    const note = { document: { flags: { [MODULE_ID]: {
      shipDeckNote: true, deckFeatureId: "galley", deckFeatureLabel: "Galley",
      deckFeatureDescription: "The crew's mess and common area.",
    } } } };

    expect(handleShipDeckNoteClick(note)).toBe(false);
    expect(info.mock.calls[0][0]).toMatch(/Galley/);
  });

  it("ignores notes that are not ship deck pins", () => {
    const note = { document: { flags: { [MODULE_ID]: { sectorNote: true } } } };
    expect(handleShipDeckNoteClick(note)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildModuleFeatures + buildDeckFeatures
// ---------------------------------------------------------------------------

describe("buildModuleFeatures()", () => {
  it("returns one feature per installed Module asset, with deck cells assigned", () => {
    const actor = makeShipActor({ modules: ["Medbay", "Heavy Cannons", "Expanded Hold"] });
    const features = buildModuleFeatures(actor);
    expect(features).toHaveLength(3);
    expect(features.every(f => f.kind === "module")).toBe(true);
    expect(features.map(f => f.label).sort()).toEqual(["Expanded Hold", "Heavy Cannons", "Medbay"]);
    // Canonical slugs land on their hint cells (clear of every station cell).
    const stationCells = new Set([...STATION_LAYOUT, ...AMENITY_LAYOUT].map(s => `${s.gridX},${s.gridY}`));
    for (const f of features) {
      expect(stationCells.has(`${f.gridX},${f.gridY}`)).toBe(false);
    }
  });

  it("ignores non-Module items and returns [] for a ship with none", () => {
    const actor = { id: "x", name: "Y", items: [{ type: "asset", name: "Some Path", system: { category: "Path" } }] };
    expect(buildModuleFeatures(actor)).toEqual([]);
  });
});

describe("buildDeckFeatures()", () => {
  it("combines the 11 stations, the galley, and the modules", () => {
    const features = buildDeckFeatures(makeShipActor({ modules: ["Shields"] }));
    expect(features.filter(f => f.kind === "station")).toHaveLength(11);
    expect(features.filter(f => f.kind === "amenity")).toHaveLength(1);
    expect(features.filter(f => f.kind === "module")).toHaveLength(1);
  });
});
