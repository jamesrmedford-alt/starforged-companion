/**
 * STARFORGED COMPANION
 * src/sectors/sceneBuilder.js — Foundry Scene creation for sectors
 *
 * Creates a live Foundry scene with:
 *   - Generated background image (if available)
 *   - Journal Note pins for each settlement
 *   - Drawing lines for passages
 *
 * The scene is NOT automatically activated after creation. The GM navigates
 * to it manually. Automatic activation would disrupt mid-session clients.
 *
 * Foundry v13 API references:
 *   - Scene.create(): docs/foundry-api-reference.md §Scene
 *   - createEmbeddedDocuments("Note", ...): docs/foundry-api-reference.md §NoteDocument
 *   - createEmbeddedDocuments("Drawing", ...): docs/foundry-api-reference.md §DrawingDocument
 */

import {
  iconForPlanetType,
  iconForStellarObject,
  pickStarshipIcon,
} from "../system/ironswornAssets.js";

const MODULE_ID = "starforged-companion";

const SCENE_CONFIG = {
  gridCellSize: 100,
  gridWidth:    17,    // ceil(1792 / 100) — covers full image width
  gridHeight:   10,    // ceil(1024 / 100) — covers full image height
  sceneWidth:   1792,
  sceneHeight:  1024,
  padding:      0,     // no padding — image fills the canvas edge to edge
};


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Foundry Scene for the sector.
 *
 * @param {SectorResult} sector
 * @param {string|null}  backgroundPath — Foundry data file path, or null
 * @param {Object}       entityActors   — { settlementId: Actor }
 *   Phase 3 (commit b65175a) migrated Settlement entities from JournalEntry
 *   to a location-typed Actor. The value at each key is now an Actor, not
 *   a JournalEntry. Notes link via flag.actorId (see registerSectorSceneHooks)
 *   rather than the native entryId, since Notes only accept JournalEntry ids.
 * @returns {Promise<Scene>}
 */
export async function createSectorScene(sector, backgroundPath, entityActors) {
  const { sceneWidth, sceneHeight, gridCellSize, padding } = SCENE_CONFIG;

  // Foundry v13 scene background.src requires a path from the server root.
  // FilePicker.upload returns a relative path (no leading slash); add one.
  const imgPath = backgroundPath
    ? (backgroundPath.startsWith("/") ? backgroundPath : `/${backgroundPath}`)
    : null;
  console.log(`${MODULE_ID} | createSectorScene: backgroundPath = ${backgroundPath}, imgPath = ${imgPath}`);

  const scene = await Scene.create({
    name:            sector.name,
    background:      { src: imgPath },
    width:           sceneWidth,
    height:          sceneHeight,
    backgroundColor: "#000000",
    grid: {
      type:  1,        // square grid
      size:  gridCellSize,
      color: "#222244",
      alpha: 0.15,
    },
    tokenVision:    false,
    fogExploration: false,
    globalLight:    false,
    padding,
    flags: {
      [MODULE_ID]: {
        sectorScene: true,
        sectorId:    sector.id,
      },
    },
  });

  // Build lookup from full settlement objects (which carry planet and stellar)
  const fullSettlementById = Object.fromEntries(
    (sector.settlements ?? []).map(s => [s.id, s])
  );

  // Place Journal Note pins for each settlement, plus planet and stellar notes
  const mapSettlements = sector.mapData?.settlements ?? [];
  if (mapSettlements.length) {
    const noteData = [];

    for (const s of mapSettlements) {
      // entityActors[s.id] is the location-typed settlement Actor created by
      // createEntityJournals. We deliberately do NOT pass actor.id as
      // `entryId` — Foundry v13 validates entryId against game.journal and
      // rejects the whole createEmbeddedDocuments batch on the first
      // mismatch. Pre-Phase-3 this slot held a JournalEntry id; post-Phase-3
      // it would resolve to nothing, abort the Note batch, and also block
      // the Drawing batch below (which is the v1.3.4 "Sector Creator failed
      // to populate map" bug). Link via flag.actorId instead — the click
      // handler in registerSectorSceneHooks() opens the Actor sheet.
      const settlementActor = entityActors?.[s.id] ?? null;
      const locationType    = s.locationType ?? s.type;
      noteData.push({
        x:          s.gridX * gridCellSize,
        y:          s.gridY * gridCellSize,
        texture: {
          src:  iconPathForLocationType(locationType),
          tint: tintForLocationType(locationType),
        },
        iconSize:   40,
        text:       s.name,
        fontSize:   24,
        textColor:  "#FFFFFF",
        textAnchor: 1,   // BOTTOM (CONST.TEXT_ANCHOR_POINTS.BOTTOM)
        global:     true,
        flags: {
          [MODULE_ID]: {
            sectorNote:   true,
            settlementId: s.id,
            actorId:      settlementActor?.id ?? null,
            locationType,
          },
        },
      });

      const full = fullSettlementById[s.id];

      // Planet note — offset (+70, +40) from settlement pin. The sector
      // generator embeds planet metadata on the settlement Actor's flag
      // (no separate Planet Actor is created in this flow), so the planet
      // pin's click target is the parent settlement Actor.
      if (full?.planet) {
        noteData.push({
          x:         (s.gridX * gridCellSize) + 70,
          y:         (s.gridY * gridCellSize) + 40,
          texture:   { src: iconForPlanetType(full.planet.type) },
          iconSize:  52,
          text:      full.planet.name,
          fontSize:  18,
          textColor: "#CCCCCC",
          flags: {
            [MODULE_ID]: {
              sectorNote:   true,
              planetNote:   true,
              planetType:   full.planet.type,
              settlementId: s.id,
              actorId:      settlementActor?.id ?? null,
            },
          },
        });
      }

      // Stellar object note — offset (-60, +30) from settlement pin.
      // Stellar objects have no Actor representation (decorative only);
      // the click handler intentionally no-ops on these.
      if (full?.stellar) {
        noteData.push({
          x:         (s.gridX * gridCellSize) - 60,
          y:         (s.gridY * gridCellSize) + 30,
          texture:   { src: iconForStellarObject(full.stellar) },
          iconSize:  44,
          text:      full.stellar,
          fontSize:  16,
          textColor: "#DDDDDD",
          flags: {
            [MODULE_ID]: {
              sectorNote:   true,
              stellarNote:  true,
              settlementId: s.id,
              // No actorId: stellar objects have no Actor representation.
            },
          },
        });
      }
    }

    // Each batch in its own try/catch — pre-v1.3.5 a Note validation error
    // (Actor id passed as entryId after Phase 3) threw out of the whole
    // function, taking the Drawing batch with it. Even after that root cause
    // was fixed (entryId is now omitted; flag.actorId carries the link), the
    // independent batches must not block one another for any future v13
    // schema tightening. Log loudly so the next failure surfaces in console
    // instead of silently leaving the scene empty.
    try {
      await scene.createEmbeddedDocuments("Note", noteData, { render: false });
      console.log(`${MODULE_ID} | createSectorScene: ${noteData.length} Notes placed`);
    } catch (err) {
      console.error(
        `${MODULE_ID} | createSectorScene: Note batch failed (${noteData.length} pins) — see error for v13 schema mismatch:`,
        err,
      );
    }
  }

  // Place Drawing lines for passages
  const passages = sector.mapData?.passages ?? [];
  if (passages.length) {
    const drawingData = passages
      .map(p => {
        const from = mapSettlements.find(s => s.id === p.fromId || String(s.id) === String(p.fromId));
        if (!from) return null;

        const fromX = from.gridX * gridCellSize;
        const fromY = from.gridY * gridCellSize;

        if (p.toEdge) {
          const cx     = SCENE_CONFIG.sceneWidth  / 2;
          const cy     = SCENE_CONFIG.sceneHeight / 2;
          const dx     = fromX - cx;
          const dy     = fromY - cy;
          const scaleX = dx !== 0 ? (SCENE_CONFIG.sceneWidth  / 2) / Math.abs(dx) : Infinity;
          const scaleY = dy !== 0 ? (SCENE_CONFIG.sceneHeight / 2) / Math.abs(dy) : Infinity;
          const scale  = Math.min(scaleX, scaleY);
          const edgeX  = cx + dx * scale;
          const edgeY  = cy + dy * scale;
          const ex     = edgeX - fromX;
          const ey     = edgeY - fromY;
          return makeDrawingData({
            x: fromX, y: fromY, dx: ex, dy: ey, strokeAlpha: 0.4,
            flags: { sectorPassage: true, toEdge: true, fromId: p.fromId },
          });
        }

        const to = mapSettlements.find(s => s.id === p.toId || String(s.id) === String(p.toId));
        if (!to) return null;

        const toX = to.gridX * gridCellSize;
        const toY = to.gridY * gridCellSize;
        return makeDrawingData({
          x: fromX, y: fromY, dx: toX - fromX, dy: toY - fromY, strokeAlpha: 0.8,
          flags: { sectorPassage: true, fromId: p.fromId, toId: p.toId ?? null },
        });
      })
      .filter(Boolean);

    if (drawingData.length) {
      try {
        await scene.createEmbeddedDocuments("Drawing", drawingData, { render: false });
        console.log(`${MODULE_ID} | createSectorScene: ${drawingData.length} passage Drawings placed`);
      } catch (err) {
        console.error(
          `${MODULE_ID} | createSectorScene: Drawing batch failed (${drawingData.length} passages) — likely a v13 DrawingDocument schema mismatch. First entry payload:`,
          drawingData[0],
          err,
        );
      }
    }
  }

  // Fact-continuity scope §20.4b — place a Token for the command vehicle
  // if one is registered. Subsequent drags onto a settlement Note pin
  // trigger a Set a Course pipeline. Failure here never breaks the sector
  // creation; the Token is a parallel input affordance and the position
  // still updates from `!at` / `set_a_course` regardless.
  try {
    await placeCommandVehicleTokenIfPresent(scene, sector);
  } catch (err) {
    console.warn(`${MODULE_ID} | createSectorScene: command-vehicle Token placement failed:`, err);
  }

  // Note: scene.activate() is intentionally NOT called.
  // The GM navigates to the new scene manually.
  // Auto-activation would disrupt all connected clients mid-session.

  return scene;
}


/**
 * Place a Token on the sector Scene representing the command vehicle, if
 * one exists. Idempotent — does nothing when the scene already carries a
 * command-vehicle Token, or when no command vehicle has been registered
 * yet. Exported so a `ready`-hook retrofit can add the Token to scenes
 * that were created before this feature shipped.
 *
 * Position: centered on the settlement Note matching
 * `position.nearestSettlementId` if present, else the scene's centre.
 *
 * @param {Scene} scene
 * @param {Object} sector — the SectorResult the scene was built from
 * @returns {Promise<TokenDocument|null>}
 */
export async function placeCommandVehicleTokenIfPresent(scene, sector) {
  if (!scene || !game?.settings) return null;

  // Skip when the feature is disabled or the Token affordance is off.
  // Reads are defensive — settings may be unregistered in tests.
  try {
    const positioningEnabled =
      game.settings.get(MODULE_ID, "factContinuity.shipPositioning") !== false;
    const tokenEnabled =
      game.settings.get(MODULE_ID, "factContinuity.shipTokenEnabled") !== false;
    if (!positioningEnabled || !tokenEnabled) return null;
  } catch (err) {
    // Settings not registered (unit tests, very early init). Default-on
    // behaviour matches the module's setting defaults; log at debug.
    console.debug?.(`${MODULE_ID} | placeCommandVehicleTokenIfPresent: settings read failed:`, err?.message ?? err);
  }

  // Existing Token? Don't duplicate.
  const tokens = scene.tokens?.contents ?? scene.tokens ?? [];
  const existing = Array.isArray(tokens)
    ? tokens.find(t => t?.flags?.[MODULE_ID]?.commandVehicle)
    : null;
  if (existing) return existing;

  const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
  const cvIds         = Array.isArray(campaignState.shipIds) ? campaignState.shipIds : [];
  let commandActorId  = null;
  let commandPayload  = null;
  for (const id of cvIds) {
    const actor = game.actors?.get?.(id);
    const ship  = actor?.flags?.[MODULE_ID]?.ship;
    if (ship?.isCommandVehicle) { commandActorId = actor.id; commandPayload = ship; break; }
  }
  if (!commandActorId) return null;             // No command vehicle yet — skip.

  // Anchor coordinates: the matching settlement pin, or scene centre.
  const mapSettlements   = sector?.mapData?.settlements ?? [];
  const anchorSettlement = commandPayload?.position?.nearestSettlementId
    ? mapSettlements.find(s => s.id === commandPayload.position.nearestSettlementId)
    : null;

  const { gridCellSize, sceneWidth, sceneHeight } = SCENE_CONFIG;
  const tokenX = anchorSettlement
    ? anchorSettlement.gridX * gridCellSize
    : Math.floor(sceneWidth  / 2 / gridCellSize) * gridCellSize;
  const tokenY = anchorSettlement
    ? anchorSettlement.gridY * gridCellSize
    : Math.floor(sceneHeight / 2 / gridCellSize) * gridCellSize;

  const cvActor = game.actors?.get?.(commandActorId);
  const iconSrc = cvActor?.img && !cvActor.img.endsWith("mystery-man.svg")
    ? cvActor.img
    : pickStarshipIcon(commandActorId);

  const tokenData = {
    name:        cvActor?.name ?? commandPayload?.name ?? "Command Vehicle",
    actorId:     commandActorId,
    actorLink:   true,           // Drag-on-scene updates the prototype, not a copy.
    x:           tokenX,
    y:           tokenY,
    width:       1,
    height:      1,
    texture:     { src: iconSrc },
    disposition: 1,              // Friendly (CONST.TOKEN_DISPOSITIONS.FRIENDLY)
    flags: {
      [MODULE_ID]: {
        commandVehicle: true,
        sectorId:       sector?.id ?? null,
      },
    },
  };

  try {
    const created = await scene.createEmbeddedDocuments("Token", [tokenData], { render: false });
    console.log(`${MODULE_ID} | createSectorScene: command-vehicle Token placed`);
    return Array.isArray(created) ? created[0] : created;
  } catch (err) {
    console.error(`${MODULE_ID} | createSectorScene: Token placement failed:`, err);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a passage Drawing payload with every v13-mandatory field set.
 *
 * v13 BaseDrawing has tightened validation: a payload missing
 * `text`/`fontFamily`/`fontSize` (even for non-text shapes), or with
 * `shape.width` / `shape.height` left at 0 for a polygon, is rejected with
 * "Drawings must have visible text, a visible fill, or a visible line." The
 * underlying invariant is that the bounding box must be non-zero AND every
 * field the schema declares as required must be present. We default every
 * required field rather than relying on Foundry's defaults — defaults have
 * changed twice between v11 → v12 → v13.
 */
function makeDrawingData({ x, y, dx, dy, strokeAlpha = 0.8, flags }) {
  return {
    x,
    y,
    shape: {
      type:   "p",                          // polygon (used for lines)
      width:  Math.max(Math.abs(dx), 1),
      height: Math.max(Math.abs(dy), 1),
      points: [0, 0, dx, dy],
    },
    strokeWidth: 2,
    strokeColor: "#7EB8F7",
    strokeAlpha: strokeAlpha,
    fillType:    0,                         // no fill
    fillColor:   "#000000",                 // v13: required even when fillType is 0
    fillAlpha:   0,
    text:        "",                        // v13: required string field
    fontFamily:  "Signika",
    fontSize:    48,
    textColor:   "#FFFFFF",
    textAlpha:   1,
    rotation:    0,
    z:           0,
    bezierFactor: 0,
    locked:      false,
    hidden:      false,
    flags: { [MODULE_ID]: flags },
  };
}

function iconPathForLocationType(locationType) {
  switch (locationType) {
    case "orbital":    return "icons/svg/circle.svg";
    case "planetside": return "icons/svg/target.svg";
    default:           return "icons/svg/aura.svg";   // deep_space
  }
}

function tintForLocationType(locationType) {
  switch (locationType) {
    case "orbital":    return "#7EB8F7";   // cool blue — station lights
    case "planetside": return "#8FCF7E";   // warm green — habitable world
    default:           return "#C4A45A";   // amber — isolated outpost
  }
}

// Planet and stellar icon lookups are sourced from the central system-asset
// module so every consumer reads from one place if foundry-ironsworn relocates
// its assets in a future version. See src/system/ironswornAssets.js.
