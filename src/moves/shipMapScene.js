/**
 * STARFORGED COMPANION
 * src/moves/shipMapScene.js — Battle Stations! ship-map deck-plan Scene.
 *
 * Phase A of the shipboard-combat mini-game (docs/combat/shipboard-combat-
 * minigame.md). On command-vehicle creation — or on demand via `!shipmap` —
 * generate a Foundry Scene that is a deck plan of the crew's ship. The map
 * pins three kinds of "deck feature":
 *   - the 11 shipboard-combat STATIONS (rulebook crew tasks, from
 *     battleStations.js SHIPBOARD_ROLES — Gunnery at the turret, Piloting at
 *     the cockpit, …),
 *   - the GALLEY (the crew's mess / common area — every ship has one), and
 *   - the ship's installed MODULES (the `asset`/Module Items actually on the
 *     starship Actor — Medbay, Heavy Cannons, Expanded Hold, …), so the map
 *     reflects the real vessel, not a generic hull.
 *
 * The map is a play-aid and a narrator-grounding device, NOT a tactical grid:
 * Starforged combat is fictional, there is no range/position-on-a-board, and
 * the stations are examples a crew adopts and switches between, not fixed roles.
 *
 * Design choices (see the scope doc's Open Questions):
 *   - FIXED layout is the spine. Every feature has deterministic grid
 *     coordinates so pins are always placeable; modules without a known deck
 *     hint go to a fallback "module bay" band.
 *   - When deck-plan art is generated, a vision pass (shipMapVision.js) returns
 *     per-feature coordinates and the pins move onto the compartments the art
 *     drew; the fixed layout backstops any feature the vision misses.
 *   - The canonical station list lives in battleStations.js; STATION_LAYOUT
 *     only adds geometry/icons (a unit test asserts they stay in lock-step).
 *
 * The Scene/Note/Drawing pipeline mirrors src/sectors/sceneBuilder.js,
 * including the PLAYTEST-1712 A scene-rectangle inset fix.
 *
 * This module owns the pure builders + the (Foundry-touching) orchestrator.
 * The chat-command IO and hook registration are called from src/index.js.
 *
 * Foundry v13 API references:
 *   - Scene.create(): docs/foundry-reference/foundry-api-reference.md §Scene
 *   - createEmbeddedDocuments("Note"/"Drawing"): same doc, §NoteDocument / §DrawingDocument
 */

import { SHIPBOARD_ROLES } from "./battleStations.js";

const MODULE_ID = "starforged-companion";

// Same canvas dimensions as the sector scene so the inset/padding maths and the
// camera framing behave identically (sceneBuilder.js SCENE_CONFIG).
const SHIP_MAP_SCENE_CONFIG = {
  gridCellSize: 100,
  sceneWidth:   1792,
  sceneHeight:  1024,
  padding:      0.1,
};

/**
 * Deterministic deck-plan geometry for each of the 11 shipboard stations.
 * Fore is to the LEFT, aft to the right; the central spine sits at gridY 5
 * with flanks at gridY 3 (dorsal) and gridY 7 (ventral). Coordinates are in
 * grid cells (×100 px) and are offset by the scene-rect inset at placement.
 *
 * `icon` paths are long-standing Foundry core SVGs (stable since v9). A
 * missing icon degrades to a broken-image pin — non-fatal; the label and the
 * click handler still work. `deckLabel` is the in-fiction location shown on
 * click.
 *
 * INVARIANT: every id here MUST exist in SHIPBOARD_ROLES and vice-versa
 * (asserted by tests/unit/shipMapSceneBuilder.test.js → "layout parity").
 */
export const STATION_LAYOUT = [
  // Forward section — cockpit, bridge, sensor array, EW suite
  { id: "piloting",        gridX: 2,  gridY: 5, icon: "icons/svg/clockwork.svg",  tint: "#7EB8F7", deckLabel: "Cockpit (fore)" },
  { id: "sensors",         gridX: 3,  gridY: 3, icon: "icons/svg/radiation.svg",  tint: "#7EF7C4", deckLabel: "Forward sensor array" },
  { id: "command",         gridX: 4,  gridY: 5, icon: "icons/svg/eye.svg",        tint: "#F7E07E", deckLabel: "Bridge" },
  { id: "countermeasures", gridX: 4,  gridY: 7, icon: "icons/svg/net.svg",        tint: "#B87EF7", deckLabel: "Electronic-warfare suite" },
  // Midships — turret, computer core, boarding airlock
  { id: "gunnery",         gridX: 7,  gridY: 3, icon: "icons/svg/explosion.svg",  tint: "#F77E7E", deckLabel: "Dorsal weapon turret" },
  { id: "systems",         gridX: 7,  gridY: 5, icon: "icons/svg/lightning.svg",  tint: "#7EE0F7", deckLabel: "Computer / comms core" },
  { id: "infantry",        gridX: 8,  gridY: 7, icon: "icons/svg/sword.svg",      tint: "#F7A87E", deckLabel: "Boarding airlock" },
  // Aft section — med bay, amidships repair, support bay, drive
  { id: "medical",         gridX: 11, gridY: 3, icon: "icons/svg/heal.svg",       tint: "#8FCF7E", deckLabel: "Medical bay" },
  { id: "damage_control",  gridX: 10, gridY: 5, icon: "icons/svg/fire.svg",       tint: "#F7C44E", deckLabel: "Amidships (damage control)" },
  { id: "escort",          gridX: 13, gridY: 7, icon: "icons/svg/wing.svg",       tint: "#C4C4C4", deckLabel: "Support-vehicle bay" },
  { id: "engineering",     gridX: 14, gridY: 5, icon: "icons/svg/cog.svg",        tint: "#C4A45A", deckLabel: "Drive section (aft)" },
];

/**
 * Fixed non-combat deck locations always present on the map. The galley is the
 * crew's mess / common area (the same room the Begin-Session galley vignette
 * pictures) — not a combat station, so deliberately separate from
 * STATION_LAYOUT / SHIPBOARD_ROLES.
 */
export const AMENITY_LAYOUT = [
  {
    id: "galley",
    label: "Galley",
    description: "The crew's mess and common area — where the ship gathers between the hard moments.",
    icon: "icons/svg/tankard.svg",
    tint: "#E0B57E",
    gridX: 10,
    gridY: 7,
  },
];

/**
 * Preferred deck cell for each canonical Module slug, placed near the station
 * it relates to (Medbay by Medical, Heavy Cannons by Gunnery, …) and clear of
 * every station/galley cell. Modules not listed here — or whose hint cell is
 * already taken — fall back to the module bay band (MODULE_FALLBACK_CELLS).
 */
const MODULE_DECK_HINTS = {
  sensor_array:    { gridX: 2,  gridY: 2 },
  research_lab:    { gridX: 2,  gridY: 7 },
  internal_refit:  { gridX: 6,  gridY: 3 },
  overseer:        { gridX: 5,  gridY: 5 },
  expanded_hold:   { gridX: 6,  gridY: 5 },
  grappler:        { gridX: 5,  gridY: 3 },
  heavy_cannons:   { gridX: 8,  gridY: 2 },
  missile_array:   { gridX: 9,  gridY: 3 },
  stealth_tech:    { gridX: 8,  gridY: 5 },
  shields:         { gridX: 12, gridY: 5 },
  reinforced_hull: { gridX: 12, gridY: 7 },
  medbay:          { gridX: 12, gridY: 3 },
  workshop:        { gridX: 13, gridY: 5 },
  engine_upgrade:  { gridX: 15, gridY: 5 },
  vehicle_bay:     { gridX: 14, gridY: 7 },
};

// Fallback "module bay" band (ventral strip) for un-hinted / custom modules.
const MODULE_FALLBACK_CELLS = [
  { gridX: 4,  gridY: 9 }, { gridX: 6,  gridY: 9 }, { gridX: 8,  gridY: 9 },
  { gridX: 10, gridY: 9 }, { gridX: 12, gridY: 9 }, { gridX: 14, gridY: 9 },
  { gridX: 5,  gridY: 9 }, { gridX: 7,  gridY: 9 }, { gridX: 9,  gridY: 9 },
  { gridX: 11, gridY: 9 }, { gridX: 13, gridY: 9 },
];

// Fast lookup of the canonical role record (label + description) by id.
const ROLE_BY_ID = Object.fromEntries(SHIPBOARD_ROLES.map(r => [r.id, r]));


// ─────────────────────────────────────────────────────────────────────────────
// DECK FEATURES — stations + galley + installed modules
// ─────────────────────────────────────────────────────────────────────────────

/** The 11 combat stations as deck-feature descriptors. */
function stationFeatures() {
  return STATION_LAYOUT.map(st => {
    const role = ROLE_BY_ID[st.id] ?? { label: st.id, description: "" };
    return {
      id: st.id,
      kind: "station",
      label: role.label,
      description: `${st.deckLabel} — ${role.description}`,
      icon: st.icon,
      tint: st.tint,
      gridX: st.gridX,
      gridY: st.gridY,
    };
  });
}

/** Fixed amenities (the galley) as deck-feature descriptors. */
function amenityFeatures() {
  return AMENITY_LAYOUT.map(a => ({ ...a, kind: "amenity" }));
}

/**
 * The ship's installed Module assets as deck-feature descriptors, with a deck
 * cell assigned (preferred hint, else the module bay). Pure read over the
 * Actor's embedded Items.
 *
 * @param {Actor} shipActor
 * @returns {Array<Object>}
 */
export function buildModuleFeatures(shipActor) {
  const raw = shipActor?.items?.contents ?? shipActor?.items ?? [];
  const items = Array.isArray(raw) ? raw : [];
  const modules = items.filter(
    it => it?.type === "asset" && /module/i.test(String(it?.system?.category ?? "")),
  );
  if (!modules.length) return [];

  // Reserve every cell the stations and amenities already occupy so a module
  // never lands on a station pin.
  const used = new Set(
    [...STATION_LAYOUT, ...AMENITY_LAYOUT].map(f => `${f.gridX},${f.gridY}`),
  );
  const fallback = [...MODULE_FALLBACK_CELLS];

  const features = [];
  for (const it of modules) {
    const slug = slugFromModuleName(it.name);
    let cell = MODULE_DECK_HINTS[slug];
    if (!cell || used.has(`${cell.gridX},${cell.gridY}`)) {
      cell = nextFreeCell(fallback, used);
    }
    if (!cell) break;   // out of room (an implausibly module-heavy ship) — stop
    used.add(`${cell.gridX},${cell.gridY}`);
    const { icon, tint } = moduleIcon(slug);
    features.push({
      id: `module:${slug || normalizeId(it.name)}`,
      kind: "module",
      label: it.name || "Module",
      description: moduleDescription(it),
      icon,
      tint,
      gridX: cell.gridX,
      gridY: cell.gridY,
    });
  }
  return features;
}

/**
 * Every deck feature for a ship: the 11 stations, the galley, and the ship's
 * installed modules. Pure.
 *
 * @param {Actor} shipActor
 * @returns {Array<Object>}
 */
export function buildDeckFeatures(shipActor) {
  return [...stationFeatures(), ...amenityFeatures(), ...buildModuleFeatures(shipActor)];
}


// ─────────────────────────────────────────────────────────────────────────────
// PURE BUILDERS — Note + Drawing payloads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the Note payloads for a list of deck features, offset into the scene
 * rectangle. Pure — no Foundry globals.
 *
 * When `normalizedCoords` is supplied (a vision result mapping featureId →
 * {x,y} in 0–1 over the background image), each pin is placed at that fraction
 * of the scene rectangle so it lands on the compartment the art drew. Any
 * feature missing from the map falls back to its fixed grid position — so a
 * partial result never drops a pin.
 *
 * @param {Array<Object>} features — deck-feature descriptors (buildDeckFeatures)
 * @param {string} shipActorId
 * @param {{x:number,y:number,sceneWidth?:number,sceneHeight?:number}} offset — scene-rect inset (PLAYTEST-1712 A)
 * @param {Object|null} [normalizedCoords] — { featureId: {x,y} } in 0–1, or null
 * @returns {Array<Object>} NoteDocument creation payloads
 */
export function buildDeckFeatureNoteData(features, shipActorId, offset = { x: 0, y: 0 }, normalizedCoords = null) {
  const { gridCellSize, sceneWidth, sceneHeight } = SHIP_MAP_SCENE_CONFIG;
  const rectW = Number(offset.sceneWidth)  || sceneWidth;
  const rectH = Number(offset.sceneHeight) || sceneHeight;

  return features.map(f => {
    const frac = normalizedCoords?.[f.id];
    const usesVision = frac && Number.isFinite(frac.x) && Number.isFinite(frac.y);
    const x = usesVision
      ? Math.round(offset.x + (frac.x * rectW))
      : offset.x + (f.gridX * gridCellSize);
    const y = usesVision
      ? Math.round(offset.y + (frac.y * rectH))
      : offset.y + (f.gridY * gridCellSize);

    const isStation = f.kind === "station";
    return {
      x,
      y,
      texture:    { src: f.icon, tint: f.tint },
      iconSize:   isStation ? 40 : (f.kind === "amenity" ? 36 : 32),
      text:       f.label,
      fontSize:   isStation ? 22 : (f.kind === "amenity" ? 20 : 16),
      textColor:  "#FFFFFF",
      textAnchor: 1,    // BOTTOM (CONST.TEXT_ANCHOR_POINTS.BOTTOM)
      global:     true,
      flags: {
        [MODULE_ID]: {
          shipDeckNote:           true,          // universal marker (click + hooks)
          deckFeatureId:          f.id,
          deckFeatureKind:        f.kind,
          deckFeatureLabel:       f.label,
          deckFeatureDescription: f.description ?? "",
          shipActorId:            shipActorId ?? null,
          placedByVision:         !!usesVision,
          // Back-compat marker so station-specific reads/tests still resolve.
          ...(isStation ? { shipStationNote: true, stationId: f.id } : {}),
        },
      },
    };
  });
}

/**
 * Convenience wrapper: Note payloads for the 11 stations only. Pure.
 * @param {string} shipActorId
 * @param {Object} offset
 * @param {Object|null} [normalizedCoords]
 */
export function buildStationNoteData(shipActorId, offset = { x: 0, y: 0 }, normalizedCoords = null) {
  return buildDeckFeatureNoteData(stationFeatures(), shipActorId, offset, normalizedCoords);
}

/**
 * Build a schematic hull-outline Drawing — a stretched hexagon silhouette the
 * deck pins sit inside. Used as the backdrop when no AI deck-plan art is
 * available so the bare Scene still reads as a ship. Pure.
 *
 * Every v13-mandatory Drawing field is set explicitly (mirrors
 * sceneBuilder.makeDrawingData): a payload missing text/font fields or with a
 * zero-area bounding box is rejected by v13 BaseDrawing validation.
 *
 * @param {{x:number,y:number}} offset — scene-rect inset
 * @returns {Object} DrawingDocument creation payload
 */
export function buildHullOutlineDrawing(offset = { x: 0, y: 0 }) {
  const s = SHIP_MAP_SCENE_CONFIG.gridCellSize;
  const points = [
    0,    3 * s,   // nose (1,5)
    2 * s, 0,      // dorsal-fore (3,2)
    12 * s, 0,     // dorsal-aft (13,2)
    14 * s, 2 * s, // tail-top (15,4)
    14 * s, 4 * s, // tail-bottom (15,6)
    12 * s, 6 * s, // ventral-aft (13,8)
    2 * s, 6 * s,  // ventral-fore (3,8)
    0,    3 * s,   // close at nose
  ];
  return {
    x: offset.x + (1 * s),
    y: offset.y + (2 * s),
    shape: {
      type:   "p",          // polygon
      width:  14 * s,
      height: 6 * s,
      points,
    },
    strokeWidth: 3,
    strokeColor: "#7EB8F7",
    strokeAlpha: 0.6,
    fillType:    1,         // solid fill (low alpha — a faint hull tint)
    fillColor:   "#0E1A2E",
    fillAlpha:   0.18,
    text:        "",        // v13 required string field
    fontFamily:  "Signika",
    fontSize:    48,
    textColor:   "#FFFFFF",
    textAlpha:   1,
    rotation:    0,
    z:           0,
    bezierFactor: 0,
    locked:      true,      // backdrop — not meant to be dragged
    hidden:      false,
    flags: { [MODULE_ID]: { shipMapHull: true } },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// SCENE CREATION (Foundry-touching)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the deck-plan Scene for a ship Actor: background (AI art path or
 * schematic), the deck-feature Note pins (stations + galley + modules), and —
 * in schematic mode — a hull outline. The Scene is NOT activated (the GM
 * navigates to it manually, same as sector scenes).
 *
 * @param {Actor} shipActor
 * @param {{ backgroundPath?: string|null, stationCoords?: Object|null, features?: Array<Object>|null }} [opts]
 *   stationCoords — validated vision result ({ featureId: {x,y} } in 0–1), or null.
 *   features — pre-built deck features (so the vision pass and the scene share
 *   the exact same set); defaults to buildDeckFeatures(shipActor).
 * @returns {Promise<Scene>}
 */
export async function createShipMapScene(shipActor, { backgroundPath = null, stationCoords = null, features = null } = {}) {
  const { sceneWidth, sceneHeight, gridCellSize, padding } = SHIP_MAP_SCENE_CONFIG;
  const shipActorId = shipActor?.id ?? null;
  const shipName    = shipActor?.name || "Ship";
  const deckFeatures = features ?? buildDeckFeatures(shipActor);

  // Initial-view zoom: frame the whole padded scene on load (sceneBuilder
  // finding D). Centre is set post-create once the scene-rect inset is known.
  const REFERENCE_VIEWPORT_W = 1600;
  const initialScale = Number(
    Math.min(1, REFERENCE_VIEWPORT_W / (sceneWidth * (1 + padding * 2))).toFixed(3),
  );

  // FilePicker.upload returns a relative path; Scene background.src wants a
  // server-root path. (sceneBuilder.js note.)
  const imgPath = backgroundPath
    ? (backgroundPath.startsWith("/") ? backgroundPath : `/${backgroundPath}`)
    : null;

  const scene = await Scene.create({
    name:            `${shipName} — Deck Plan`,
    background:      { src: imgPath },
    width:           sceneWidth,
    height:          sceneHeight,
    backgroundColor: "#05080F",
    grid: {
      type:  1,
      size:  gridCellSize,
      color: "#22324A",
      alpha: 0.18,
    },
    tokenVision:    false,
    fogExploration: false,
    globalLight:    true,    // a deck plan is fully lit — no vision puzzle
    padding,
    initial:        { scale: initialScale },
    flags: {
      [MODULE_ID]: {
        shipMapScene: true,
        shipActorId,
      },
    },
  });

  const offset = sceneRectOffset(scene, SHIP_MAP_SCENE_CONFIG);

  // Schematic backdrop — only when there is no AI art to sit behind the pins.
  if (!imgPath) {
    try {
      await scene.createEmbeddedDocuments("Drawing", [buildHullOutlineDrawing(offset)], { render: false });
    } catch (err) {
      console.warn(`${MODULE_ID} | createShipMapScene: hull Drawing failed (non-fatal):`, err?.message ?? err);
    }
  }

  // Deck-feature Note pins — independent try/catch so a schema hiccup never
  // leaves the Scene empty (sceneBuilder lesson).
  try {
    const noteData = buildDeckFeatureNoteData(deckFeatures, shipActorId, offset, stationCoords);
    await scene.createEmbeddedDocuments("Note", noteData, { render: false });
    const how = stationCoords ? "vision-placed" : "fixed-layout";
    const modCount = deckFeatures.filter(f => f.kind === "module").length;
    console.log(`${MODULE_ID} | createShipMapScene: ${noteData.length} ${how} deck pins for ${shipName} (${modCount} modules)`);
  } catch (err) {
    console.error(`${MODULE_ID} | createShipMapScene: deck Note batch failed:`, err);
  }

  // Frame the captured initial view on the padded scene-rect centre.
  try {
    await scene.update({
      initial: {
        x:     Math.round(offset.x + (offset.sceneWidth  / 2)),
        y:     Math.round(offset.y + (offset.sceneHeight / 2)),
        scale: initialScale,
      },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | createShipMapScene: initial-view centre update failed:`, err);
  }

  return scene;
}

/**
 * Find an existing deck-plan Scene for a ship Actor. Pure read over
 * game.scenes. Returns null when none exists or game.scenes is unavailable.
 *
 * @param {string} shipActorId
 * @returns {Scene|null}
 */
export function findShipMapScene(shipActorId) {
  if (!shipActorId) return null;
  const scenes = globalThis.game?.scenes?.contents ?? globalThis.game?.scenes ?? [];
  if (!Array.isArray(scenes)) return null;
  return scenes.find(s =>
    s?.flags?.[MODULE_ID]?.shipMapScene
    && s.flags[MODULE_ID].shipActorId === shipActorId,
  ) ?? null;
}


// ─────────────────────────────────────────────────────────────────────────────
// ORCHESTRATION — art + vision + scene + flag link (auto path and !shipmap)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate (or regenerate) the deck-plan Scene for a command-vehicle Actor:
 * resolve the deck-plan background art when enabled, run the vision pass to
 * place pins on the art, create the Scene, and link it back onto the ship
 * record (`shipMapSceneId`). Never throws — every failure path logs and
 * returns null so it can't break ship creation.
 *
 * @param {Actor} shipActor
 * @param {Object} ship — the ship flag payload (for art seeding)
 * @param {Object} [campaignState]
 * @param {{ force?: boolean }} [opts] — force=true regenerates even if a Scene exists
 * @returns {Promise<Scene|null>}
 */
export async function generateShipMapForActor(shipActor, ship, campaignState, { force = false } = {}) {
  if (!shipActor?.id) return null;

  // Idempotency — reuse the existing Scene unless the caller forces a rebuild.
  if (!force) {
    const existing = findShipMapScene(shipActor.id);
    if (existing) return existing;
  }

  // Build the deck features once so the vision targets and the placed pins are
  // the exact same set (stations + galley + the ship's modules).
  const features = buildDeckFeatures(shipActor);

  // Background art (gated). generateShipMapBackground handles its own
  // key/disabled/failure notifications and returns null on any miss; the
  // Scene then falls back to the schematic hull. Returns { path, b64 } so the
  // vision pass can locate features on the freshly-generated bytes.
  let backgroundPath = null;
  let backgroundB64  = null;
  if (readShipMapArtEnabled()) {
    try {
      const { generateShipMapBackground } = await import("./shipMapArt.js");
      const art = await generateShipMapBackground(ship ?? {}, shipActor);
      backgroundPath = art?.path ?? null;
      backgroundB64  = art?.b64  ?? null;
    } catch (err) {
      console.warn(`${MODULE_ID} | generateShipMapForActor: art failed (using schematic):`, err?.message ?? err);
    }
  }

  // Vision-based placement (gated). Only meaningful when there is art to read;
  // a null result falls back to the fixed layout inside createShipMapScene.
  let stationCoords = null;
  if (backgroundB64 && readShipMapVisionEnabled()) {
    try {
      const { resolveStationCoordsFromImage } = await import("./shipMapVision.js");
      stationCoords = await resolveStationCoordsFromImage(backgroundB64, { features });
    } catch (err) {
      console.warn(`${MODULE_ID} | generateShipMapForActor: vision placement failed (using fixed layout):`, err?.message ?? err);
    }
  }

  let scene;
  try {
    scene = await createShipMapScene(shipActor, { backgroundPath, stationCoords, features });
  } catch (err) {
    console.error(`${MODULE_ID} | generateShipMapForActor: scene creation failed:`, err);
    return null;
  }

  // Link the Scene id onto the ship record for fast lookup / navigation.
  try {
    const { updateShip } = await import("../entities/ship.js");
    await updateShip(shipActor.id, { shipMapSceneId: scene?.id ?? null });
  } catch (err) {
    console.debug?.(`${MODULE_ID} | generateShipMapForActor: shipMapSceneId link failed:`, err?.message ?? err);
  }

  return scene ?? null;
}

/**
 * Gated auto-generation entry point, called from seedStarshipActor after a
 * command vehicle is populated. No-op unless the ship is the command vehicle,
 * the feature setting is on, and no Scene exists yet. Never throws.
 *
 * @param {Actor} shipActor
 * @param {Object} ship — the ship flag payload
 * @param {Object} [campaignState]
 * @returns {Promise<Scene|null>}
 */
export async function maybeCreateShipMapScene(shipActor, ship, campaignState) {
  try {
    if (!ship?.isCommandVehicle) return null;
    if (!readShipMapEnabled()) return null;
    return await generateShipMapForActor(shipActor, ship, campaignState, { force: false });
  } catch (err) {
    console.warn(`${MODULE_ID} | maybeCreateShipMapScene failed:`, err?.message ?? err);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// !shipmap CHAT COMMAND (matcher only — IO lives in index.js)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Match the `!shipmap` (aliases `!ship-map` / `!deckplan`) command. Distinct
 * from the space-delimited `!ship envision|history` command in shipEnvision.js.
 * Re-posts of our own confirmation card are excluded via the card flag.
 *
 * @param {{content?:string, flags?:Object}} message
 * @returns {boolean}
 */
export function isShipMapCommand(message) {
  const text = message?.content?.trim() ?? "";
  if (message?.flags?.[MODULE_ID]?.shipMapCard) return false;
  return /^!(shipmap|ship-map|deckplan)(\s|$)/i.test(text);
}


// ─────────────────────────────────────────────────────────────────────────────
// DECK-PIN CLICK (show the station role / amenity / module description)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Click handler for ship deck-plan Note pins (stations, galley, modules).
 * Surfaces the feature's label + description as a notification. Returns false
 * to suppress Foundry's default journal-open path (these pins have no entryId,
 * like sector pins).
 *
 * @param {Note} note — the clicked Note placeable
 * @returns {boolean|undefined} false when handled, undefined otherwise
 */
export function handleShipDeckNoteClick(note) {
  const flags = note?.document?.flags?.[MODULE_ID];
  if (!flags?.shipDeckNote) return undefined;   // not ours — let core handle

  const label = flags.deckFeatureLabel
    ?? ROLE_BY_ID[flags.stationId]?.label
    ?? null;
  const desc  = flags.deckFeatureDescription
    ?? ROLE_BY_ID[flags.stationId]?.description
    ?? "";
  if (label) {
    globalThis.ui?.notifications?.info?.(`${label}${desc ? ` — ${desc}` : ""}`);
  }
  return false;
}

/**
 * Register ship deck-pin click handling. Mirrors registerSectorSceneHooks:
 * both candidate hook names plus a prototype wrapper on Note#_onClickLeft2
 * (the v13 hook is not reliably fired on every build). Idempotent; the
 * prototype wrapper chains with the sector one regardless of install order
 * because each captures the then-current method.
 */
export function registerShipMapSceneHooks() {
  if (registerShipMapSceneHooks._installed) return;
  registerShipMapSceneHooks._installed = true;

  globalThis.Hooks?.on?.("clickNote",    handleShipDeckNoteClick);
  globalThis.Hooks?.on?.("activateNote", handleShipDeckNoteClick);

  installDeckNoteClickOverride();
}

function installDeckNoteClickOverride() {
  const NoteCtor =
    globalThis.foundry?.canvas?.placeables?.Note   // v13 namespace
    ?? globalThis.Note                              // v12 / v13 alias
    ?? null;
  if (!NoteCtor?.prototype) {
    console.warn(`${MODULE_ID} | shipMapScene: could not locate Note prototype; deck-pin clicks rely on hooks alone.`);
    return;
  }
  const proto = NoteCtor.prototype;
  if (proto._sfShipDeckClickPatched) return;     // idempotent
  proto._sfShipDeckClickPatched = true;

  const original = proto._onClickLeft2;
  proto._onClickLeft2 = function patchedDeckOnClickLeft2(event) {
    try {
      if (handleShipDeckNoteClick(this) === false) return;   // ours — suppress default
    } catch (err) {
      console.error(`${MODULE_ID} | ship deck-pin click handler threw:`, err);
    }
    return original?.call(this, event);
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize a module Item name to its canonical slug ("Heavy Cannons" → "heavy_cannons"). */
function slugFromModuleName(name) {
  return String(name ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** A stable id fragment for a non-canonical module name. */
function normalizeId(name) {
  return slugFromModuleName(name) || "unknown";
}

/** Icon + tint for a module pin, by canonical slug (generic fallback otherwise). */
function moduleIcon(slug) {
  if (slug === "heavy_cannons" || slug === "missile_array") return { icon: "icons/svg/explosion.svg", tint: "#F77E7E" };
  if (slug === "shields" || slug === "reinforced_hull")     return { icon: "icons/svg/shield.svg",    tint: "#7EB8F7" };
  if (slug === "medbay")                                     return { icon: "icons/svg/heal.svg",      tint: "#8FCF7E" };
  if (slug === "sensor_array" || slug === "research_lab")    return { icon: "icons/svg/radiation.svg", tint: "#7EF7C4" };
  if (slug === "engine_upgrade")                             return { icon: "icons/svg/cog.svg",       tint: "#C4A45A" };
  if (slug === "stealth_tech")                               return { icon: "icons/svg/blind.svg",     tint: "#B87EF7" };
  if (slug === "vehicle_bay")                                return { icon: "icons/svg/wing.svg",      tint: "#C4C4C4" };
  return { icon: "icons/svg/chest.svg", tint: "#9AD0E0" };   // generic module
}

/** A short, HTML-free description line for a module pin. */
function moduleDescription(item) {
  const raw = item?.system?.description ?? item?.system?.requirement ?? "";
  const text = String(raw).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? truncate(text, 160) : "Installed ship module.";
}

function truncate(s, n) {
  return typeof s === "string" && s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Pop the next unused cell from a fallback list; null when exhausted. */
function nextFreeCell(cells, used) {
  while (cells.length) {
    const c = cells.shift();
    if (!used.has(`${c.gridX},${c.gridY}`)) return c;
  }
  return null;
}

/**
 * The scene rectangle's top-left inset within the padded canvas — the offset
 * every embedded-document coordinate needs so it lands on the background image
 * rather than the black padding void (PLAYTEST-1712 A). Duplicated from
 * sceneBuilder.js so the two scene builders stay independent.
 */
function sceneRectOffset(scene, { sceneWidth, sceneHeight, gridCellSize, padding }) {
  const dims = scene?.dimensions ?? scene?.getDimensions?.() ?? null;
  const sx = Number(dims?.sceneX);
  const sy = Number(dims?.sceneY);
  if (Number.isFinite(sx) && Number.isFinite(sy)) {
    return {
      x: sx,
      y: sy,
      sceneWidth:  Number(dims?.sceneWidth)  || sceneWidth,
      sceneHeight: Number(dims?.sceneHeight) || sceneHeight,
    };
  }
  return {
    x: Math.ceil((padding * sceneWidth)  / gridCellSize) * gridCellSize,
    y: Math.ceil((padding * sceneHeight) / gridCellSize) * gridCellSize,
    sceneWidth,
    sceneHeight,
  };
}

function readShipMapEnabled() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, "shipMapEnabled") === true;
  } catch {
    return false;
  }
}

function readShipMapArtEnabled() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, "shipMapArtEnabled") !== false;
  } catch {
    return true;
  }
}

function readShipMapVisionEnabled() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, "shipMapVisionEnabled") !== false;
  } catch {
    return true;
  }
}
