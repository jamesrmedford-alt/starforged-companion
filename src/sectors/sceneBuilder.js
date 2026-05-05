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
  gridWidth:    17,    // ceil(1792 / 100) — covers full image width
  gridHeight:   10,    // ceil(1024 / 100) — covers full image height
  sceneWidth:   1792,
  sceneHeight:  1024,
  padding:      0,     // no padding — image fills the canvas edge to edge
};

const PLANET_BASE  = "systems/foundry-ironsworn/assets/planets";
const STELLAR_BASE = "systems/foundry-ironsworn/assets/stellar-objects";


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
      const journal      = entityJournals?.[s.id] ?? null;
      const locationType = s.locationType ?? s.type;
      noteData.push({
        entryId:    journal?.id ?? null,
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
            locationType,
          },
        },
      });

      const full = fullSettlementById[s.id];

      // FIX 3: Planet note — offset (+70, +40) from settlement pin
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
            },
          },
        });
      }

      // FIX 4: Stellar object note — offset (-60, +30) from settlement pin
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
            },
          },
        });
      }
    }

    await scene.createEmbeddedDocuments("Note", noteData, { render: false });
  }

  // Place Drawing lines for passages
  const passages = sector.mapData?.passages ?? [];
  if (passages.length) {
    const drawingData = passages
      .map(p => {
        const from = mapSettlements.find(s => s.id === p.fromId || String(s.id) === String(p.fromId));
        if (!from) return null;

        // FIX 1: Use grid cell origin — no +0.5 centre offset
        const fromX = from.gridX * gridCellSize;
        const fromY = from.gridY * gridCellSize;

        // FIX 2: Edge passages draw from settlement to nearest scene boundary
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
          return {
            x:           fromX,
            y:           fromY,
            shape: {
              type:   "p",
              width:  Math.max(Math.abs(ex), 1),
              height: Math.max(Math.abs(ey), 1),
              points: [0, 0, ex, ey],
            },
            strokeWidth: 1,
            strokeColor: "#7EB8F7",
            strokeAlpha: 0.4,
            fillType:    0,
            fillAlpha:   0,
            hidden:      false,
            flags: {
              [MODULE_ID]: { sectorPassage: true, toEdge: true, fromId: p.fromId },
            },
          };
        }

        const to = mapSettlements.find(s => s.id === p.toId || String(s.id) === String(p.toId));
        if (!to) return null;

        const toX = to.gridX * gridCellSize;
        const toY = to.gridY * gridCellSize;
        return makePassageLine(fromX, fromY, toX, toY, p);
      })
      .filter(Boolean);

    if (drawingData.length) {
      await scene.createEmbeddedDocuments("Drawing", drawingData, { render: false });
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

function makePassageLine(x1, y1, x2, y2, passage) {
  // v13 BaseDrawing rejects shapes whose bounding box has zero width AND height
  // even when stroke is visible — so derive shape.width/shape.height from the
  // segment deltas. Math.max(..., 1) guards against degenerate same-point pairs.
  const dx = x2 - x1;
  const dy = y2 - y1;
  return {
    x:           x1,
    y:           y1,
    shape: {
      type:   "p",
      width:  Math.max(Math.abs(dx), 1),
      height: Math.max(Math.abs(dy), 1),
      points: [0, 0, dx, dy],
    },
    strokeWidth: 2,
    strokeColor: "#7EB8F7",
    strokeAlpha: 0.8,
    fillType:    0,
    fillAlpha:   0,
    hidden:      false,
    flags: {
      [MODULE_ID]: {
        sectorPassage: true,
        fromId: passage.fromId,
        toId:   passage.toId ?? null,
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

// Planet type keys are the raw oracle result strings from PLANET_TYPE table
// (e.g. "Desert World", "Jovian World"). Token files confirmed from
// systems/foundry-ironsworn/assets/planets/ — do NOT apply texture.tint.
function iconForPlanetType(type) {
  const typeMap = {
    "Desert World":    `${PLANET_BASE}/Starforged-Planet-Token-Desert-01.webp`,
    "Furnace World":   `${PLANET_BASE}/Starforged-Planet-Token-Furnace-01.webp`,
    "Grave World":     `${PLANET_BASE}/Starforged-Planet-Token-Grave-01.webp`,
    "Ice World":       `${PLANET_BASE}/Starforged-Planet-Token-Ice-01.webp`,
    "Jovian World":    `${PLANET_BASE}/Starforged-Planet-Token-Jovian-01.webp`,
    "Jungle World":    `${PLANET_BASE}/Starforged-Planet-Token-Jungle-01.webp`,
    "Ocean World":     `${PLANET_BASE}/Starforged-Planet-Token-Ocean-01.webp`,
    "Rocky World":     `${PLANET_BASE}/Starforged-Planet-Token-Rocky-01.webp`,
    "Shattered World": `${PLANET_BASE}/Starforged-Planet-Token-Shattered-01.webp`,
    "Vital World":     `${PLANET_BASE}/Starforged-Planet-Token-Vital-01.webp`,
    // "Tainted World" has no confirmed token in foundry-ironsworn assets
  };
  return typeMap[type] ?? "icons/svg/circle.svg";
}

// Oracle result strings are the full strings from the STELLAR_OBJECT table.
// Token files confirmed from systems/foundry-ironsworn/assets/stellar-objects/
// — do NOT apply texture.tint.
function iconForStellarObject(oracleResult) {
  const stellarMap = {
    "Smoldering red star":
      `${STELLAR_BASE}/Starforged-Stellar-Token-Red-Star-01.webp`,
    "Glowing orange star":
      `${STELLAR_BASE}/Starforged-Stellar-Token-Orange-Star-01.webp`,
    "Burning yellow star":
      `${STELLAR_BASE}/Starforged-Stellar-Token-Yellow-Star-01.webp`,
    "Blazing blue star":
      `${STELLAR_BASE}/Starforged-Stellar-Token-Blue-Star-01.webp`,
    "Young star incubating in a molecular cloud":
      `${STELLAR_BASE}/Starforged-Stellar-Token-Star-In-Incubating-Cloud-01.webp`,
    "White dwarf shining with spectral light":
      `${STELLAR_BASE}/Starforged-Stellar-Token-White-Dwarf-01.webp`,
    "Corrupted star radiating with unnatural light":
      `${STELLAR_BASE}/Starforged-Stellar-Token-Corrupted-Star-01.webp`,
    "Neutron star surrounded by intense magnetic fields":
      `${STELLAR_BASE}/Starforged-Stellar-Token-Neutron-Star-01.webp`,
    "Two stars in close orbit connected by fiery tendrils of energy":
      `${STELLAR_BASE}/Starforged-Stellar-Token-Binary-Star-01.webp`,
    "Black hole allows nothing to escape—not even light":
      `${STELLAR_BASE}/Starforged-Stellar-Token-Black-Hole-01.webp`,
    "Hypergiant star generating turbulent solar winds":
      `${STELLAR_BASE}/Starforged-Stellar-Token-Hypergiant-01.webp`,
    "Unstable star showing signs of impending supernova":
      `${STELLAR_BASE}/Starforged-Stellar-Token-Unstable-Star-01.webp`,
    // "Artificial star constructed by a long-dead civilization" has no confirmed token
  };
  const key = Object.keys(stellarMap).find(
    k => k.toLowerCase() === oracleResult?.toLowerCase()
  );
  return key ? stellarMap[key] : "icons/svg/sun.svg";
}
