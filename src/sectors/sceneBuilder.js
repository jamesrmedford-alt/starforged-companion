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

const MODULE_ID = "starforged-companion";

const SCENE_CONFIG = {
  gridCellSize: 100,
  gridWidth:     14,
  gridHeight:    10,
  get sceneWidth()  { return this.gridWidth  * this.gridCellSize; },
  get sceneHeight() { return this.gridHeight * this.gridCellSize; },
  padding: 0.1,
};


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Foundry Scene for the sector.
 *
 * @param {SectorResult} sector
 * @param {string|null}  backgroundPath   — Foundry data file path, or null
 * @param {Object}       entityJournals   — { settlementId: JournalEntry }
 * @returns {Promise<Scene>}
 */
export async function createSectorScene(sector, backgroundPath, entityJournals) {
  const { sceneWidth, sceneHeight, gridCellSize, padding } = SCENE_CONFIG;

  // Foundry v13 scene img requires a path from the server root.
  // FilePicker.upload returns a relative path (no leading slash); add one.
  const imgPath = backgroundPath
    ? (backgroundPath.startsWith("/") ? backgroundPath : `/${backgroundPath}`)
    : null;
  console.log(`${MODULE_ID} | createSectorScene: backgroundPath = ${backgroundPath}, imgPath = ${imgPath}`);

  const scene = await Scene.create({
    name:            sector.name,
    img:             imgPath,
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

  // Place Journal Note pins for each settlement
  const settlements = sector.mapData?.settlements ?? [];
  if (settlements.length) {
    const noteData = settlements.map(s => {
      const journal      = entityJournals?.[s.id] ?? null;
      const locationType = s.locationType ?? s.type;
      return {
        entryId:    journal?.id ?? null,
        x:          s.gridX * gridCellSize,
        y:          s.gridY * gridCellSize,
        icon:       iconPathForLocationType(locationType),
        iconSize:   40,
        iconTint:   tintForLocationType(locationType),
        text:       s.name,
        fontSize:   24,
        textColor:  "#FFFFFF",
        textAnchor: 1,   // BOTTOM (CONST.TEXT_ANCHOR_POINTS.BOTTOM)
        global:     true,
        flags: {
          [MODULE_ID]: {
            sectorNote:   true,
            settlementId: s.id,
            locationType,
          },
        },
      };
    });
    await scene.createEmbeddedDocuments("Note", noteData, { render: false });
  }

  // Place Drawing lines for passages
  const passages = sector.mapData?.passages ?? [];
  if (passages.length) {
    const drawingData = passages
      .map(p => {
        const from = settlements.find(s => s.id === p.fromId || String(s.id) === String(p.fromId));
        if (!from) return null;

        const x1 = (from.gridX + 0.5) * gridCellSize;
        const y1 = (from.gridY + 0.5) * gridCellSize;

        if (p.toEdge) {
          // Passage to the sector edge — draw a dashed line to the right edge
          const x2 = SCENE_CONFIG.gridWidth * gridCellSize;
          return makePassageLine(x1, y1, x2, y1, p, true);
        }

        const to = settlements.find(s => s.id === p.toId || String(s.id) === String(p.toId));
        if (!to) return null;

        const x2 = (to.gridX + 0.5) * gridCellSize;
        const y2 = (to.gridY + 0.5) * gridCellSize;
        return makePassageLine(x1, y1, x2, y2, p, false);
      })
      .filter(Boolean);

    if (drawingData.length) {
      // Passages are visual sugar — a sector without drawn passages is better
      // than a sector that fails to finalise. Swallow validation errors.
      try {
        await scene.createEmbeddedDocuments("Drawing", drawingData, { render: false });
      } catch (err) {
        console.warn(`${MODULE_ID} | createSectorScene: drawing creation failed:`, err.message);
      }
    }
  }

  // Note: scene.activate() is intentionally NOT called.
  // The GM navigates to the new scene manually.
  // Auto-activation would disrupt all connected clients mid-session.

  return scene;
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function makePassageLine(x1, y1, x2, y2, passage, _dashed) {
  return {
    x:           x1,
    y:           y1,
    shape: {
      type:   "p",
      width:  0,
      height: 0,
      points: [0, 0, x2 - x1, y2 - y1],
    },
    strokeWidth: 2,
    strokeColor: "#7EB8F7",
    strokeAlpha: 0.8,
    fillType:    0,   // no fill — important for line drawings
    fillAlpha:   0,
    hidden:      false,
    flags: {
      [MODULE_ID]: {
        passage: true,
        fromId:  passage.fromId,
        toId:    passage.toId ?? null,
        toEdge:  passage.toEdge ?? false,
      },
    },
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
