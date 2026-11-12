/**
 * STARFORGED COMPANION
 * tests/unit/shipTokenAnchorAndLegacyPlacement.test.js
 *
 * TOKEN-ANCHOR-GENERATOR-IDS: the command-vehicle token placed on a sector
 * map anchors on the pin the ship's position names. It was matched against
 * the generator's settlement ids alone, never the Actor ids position records
 * now carry (inferShipPositionFromEntityId, the token's own placement, `!at`),
 * so a ship whose record named its settlement's Actor landed at the map's
 * centre.
 *
 * OLD-SCENE-TOKEN-DOCKED: before issue #321 U53 a token's own placement was
 * recorded `scene_token` — since then the source of a Set a Course started by
 * dropping the token on a pin, which reads "docked at". Such an old record
 * read "docked at" a settlement the ship was only parked near until the token
 * moved again. It reads "near" now; a token-drop arrival still docks.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));

import { createSectorScene } from "../../src/sectors/sceneBuilder.js";
import { createShip, updateShip } from "../../src/entities/ship.js";
import { _resetFolderCache } from "../../src/entities/folder.js";
import { formatShipPositionLine, inferShipPositionFromEntityId } from "../../src/factContinuity/shipPosition.js";

const MODULE_ID = "starforged-companion";
const SCENE_X = 200, SCENE_Y = 200;

function sector() {
  return {
    id: "sec-1", name: "Test Sector",
    settlements: [
      { id: "gen-A", name: "Bleakhold", locationType: "deep_space", planet: null, stellar: null },
      { id: "gen-B", name: "Drift",     locationType: "deep_space", planet: null, stellar: null },
    ],
    mapData: {
      settlements: [
        { id: "gen-A", name: "Bleakhold", locationType: "deep_space", gridX: 3, gridY: 2 },
        { id: "gen-B", name: "Drift",     locationType: "deep_space", gridX: 7, gridY: 5 },
      ],
      passages: [],
      discoveries: [],
    },
  };
}

function sceneRecording() {
  const scene = {
    id: "scene-1", flags: {}, grid: { size: 100 }, notes: [], tokens: [],
    dimensions: { sceneX: SCENE_X, sceneY: SCENE_Y, sceneWidth: 1792, sceneHeight: 1024 },
    update: vi.fn(async () => scene),
    createEmbeddedDocuments: vi.fn(async (type, data) => {
      const docs = data.map((d, i) => ({ id: `${type}-${scene[type === "Note" ? "notes" : "tokens"].length + i}`, ...d }));
      if (type === "Note")  scene.notes.push(...docs);
      if (type === "Token") scene.tokens.push(...docs);
      return docs;
    }),
  };
  global.Scene = { create: vi.fn(async (data) => { scene.flags = data.flags; return scene; }) };
  return scene;
}

async function commandVehicleAt(position) {
  const cs = { sectors: [{ id: "sec-1", name: "Test Sector" }], activeSectorId: "sec-1", shipIds: [], settlementIds: [] };
  game.settings._store.set(`${MODULE_ID}.campaignState`, cs);
  await createShip({ name: "Wayfarer", isCommandVehicle: true }, cs);
  await updateShip(cs.shipIds[0], { position });
}

describe("the ship's token anchors on the pin its position names (TOKEN-ANCHOR-GENERATOR-IDS)", () => {
  beforeEach(() => {
    game.actors._reset();
    game.folders._reset();
    _resetFolderCache();
    game.settings._store.clear();
  });

  it("a record naming the settlement's Actor id places the token on that settlement's pin", async () => {
    await commandVehicleAt({ sectorId: "sec-1", nearestSettlementId: "actor-B", nearestLocationId: null,
      freeText: "", updatedAt: "t0", updatedBy: "set_a_course" });
    const scene = sceneRecording();
    await createSectorScene(sector(), null, { "gen-A": { id: "actor-A" }, "gen-B": { id: "actor-B" } });

    const [token] = scene.tokens;
    expect(token).toBeTruthy();
    // Drift's pin: grid (7, 5) inset by the scene rectangle — not the map's centre.
    expect({ x: token.x, y: token.y }).toEqual({ x: SCENE_X + 700, y: SCENE_Y + 500 });
  });

  it("control: a legacy record naming the generator id still finds its pin", async () => {
    await commandVehicleAt({ sectorId: "sec-1", nearestSettlementId: "gen-A", nearestLocationId: null,
      freeText: "", updatedAt: "t0", updatedBy: "set_a_course" });
    const scene = sceneRecording();
    await createSectorScene(sector(), null, { "gen-A": { id: "actor-A" }, "gen-B": { id: "actor-B" } });
    expect({ x: scene.tokens[0].x, y: scene.tokens[0].y }).toEqual({ x: SCENE_X + 300, y: SCENE_Y + 200 });
  });

  it("control: a record naming no pin of this map places the token at its centre", async () => {
    await commandVehicleAt({ sectorId: "sec-other", nearestSettlementId: "actor-elsewhere", nearestLocationId: null,
      freeText: "", updatedAt: "t0", updatedBy: "set_a_course" });
    const scene = sceneRecording();
    await createSectorScene(sector(), null, { "gen-A": { id: "actor-A" }, "gen-B": { id: "actor-B" } });
    expect({ x: scene.tokens[0].x, y: scene.tokens[0].y }).toEqual({ x: SCENE_X + 800, y: SCENE_Y + 500 });
  });
});

describe("an old scene_token placement record reads near, not docked at (OLD-SCENE-TOKEN-DOCKED)", () => {
  beforeEach(() => {
    game.actors._reset();
    const drift = global.makeTestActor({ id: "actor-B", type: "location", name: "Drift",
      flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: "rec-1", name: "Drift" } } } });
    game.actors._set(drift.id, drift);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { settlementIds: ["actor-B"] });
  });

  it("a token parked near a pin before U53 (scene_token, the pin's label as free text) is near it", () => {
    const legacy = { sectorId: null, nearestSettlementId: "actor-B", nearestPlanetId: null, nearestLocationId: null,
      freeText: "Drift", updatedAt: "t0", updatedBy: "scene_token" };
    const line = formatShipPositionLine(legacy, { settlementIds: ["actor-B"] }, "Wayfarer");
    expect(line).toContain("near Drift");
    expect(line).not.toContain("docked at");
  });

  it("control: a Set a Course started by a token dropped on the pin docks there", () => {
    const arrival = inferShipPositionFromEntityId("actor-B", { settlementIds: ["actor-B"] }, { source: "scene_token" });
    expect(arrival.updatedBy).toBe("scene_token");
    expect(formatShipPositionLine(arrival, { settlementIds: ["actor-B"] }, "Wayfarer")).toContain("docked at Drift");
  });
});
