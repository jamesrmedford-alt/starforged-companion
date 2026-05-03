/**
 * STARFORGED COMPANION
 * src/sectors/sectorMap.js — SVG sector map renderer
 *
 * Generates an abstract grid map representing sector settlements and passages.
 * The grid does not represent literal distances — it is a planning and tracking
 * tool per the Starforged rulebook.
 *
 * Grid cells are 60×60px. Settlement markers vary by location type.
 * Passages are drawn as lines between markers.
 */

const CELL  = 60;   // pixels per grid cell
const ICONS = {
  orbital:    "○→",
  planetside: "⊕",
  deep_space: "□",
};


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render the sector map as an SVG string.
 *
 * @param {SectorMapData} mapData
 * @returns {string} — SVG markup
 */
export function renderSectorMap(mapData) {
  const { gridWidth = 10, gridHeight = 8, settlements = [], passages = [] } = mapData;

  const svgW = gridWidth  * CELL;
  const svgH = gridHeight * CELL;

  const gridLines   = buildGridLines(gridWidth, gridHeight);
  const passageLines = buildPassageLines(passages, settlements, gridWidth, gridHeight);
  const markers     = buildMarkers(settlements);

  return `<svg
    xmlns="http://www.w3.org/2000/svg"
    class="sf-sector-map"
    viewBox="0 0 ${svgW} ${svgH}"
    width="${svgW}"
    height="${svgH}"
    style="background:#0a0a1a;border:1px solid #334;"
  >
    ${gridLines}
    ${passageLines}
    ${markers}
  </svg>`.trim();
}

/**
 * Add a passage to mapData.
 * @param {SectorMapData} mapData
 * @param {string|number} fromId
 * @param {string|number} toId
 * @param {boolean} [toEdge=false]
 * @returns {SectorMapData} — mutated mapData
 */
export function addPassage(mapData, fromId, toId, toEdge = false) {
  mapData.passages = mapData.passages ?? [];
  mapData.passages.push({ fromId, toId: toEdge ? null : toId, toEdge });
  return mapData;
}


// ─────────────────────────────────────────────────────────────────────────────
// BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function buildGridLines(gridWidth, gridHeight) {
  const lines = [];
  for (let x = 0; x <= gridWidth; x++) {
    lines.push(`<line x1="${x * CELL}" y1="0" x2="${x * CELL}" y2="${gridHeight * CELL}"
      stroke="#1a1a3a" stroke-width="1"/>`);
  }
  for (let y = 0; y <= gridHeight; y++) {
    lines.push(`<line x1="0" y1="${y * CELL}" x2="${gridWidth * CELL}" y2="${y * CELL}"
      stroke="#1a1a3a" stroke-width="1"/>`);
  }
  return lines.join("\n    ");
}

function buildPassageLines(passages, settlements, gridWidth, _gridHeight) {
  return passages.map(p => {
    const from = settlements.find(s => s.id === p.fromId || s.id === String(p.fromId));
    if (!from) return "";

    const x1 = (from.gridX + 0.5) * CELL;
    const y1 = (from.gridY + 0.5) * CELL;

    if (p.toEdge) {
      return `<line x1="${x1}" y1="${y1}" x2="${gridWidth * CELL}" y2="${y1}"
        stroke="#4477aa" stroke-width="2" stroke-dasharray="6 3" opacity="0.7"/>`;
    }

    const to = settlements.find(s => s.id === p.toId || s.id === String(p.toId));
    if (!to) return "";
    const x2 = (to.gridX + 0.5) * CELL;
    const y2 = (to.gridY + 0.5) * CELL;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke="#4477aa" stroke-width="2" opacity="0.8"/>`;
  }).filter(Boolean).join("\n    ");
}

function buildMarkers(settlements) {
  return settlements.map(s => {
    const cx = (s.gridX + 0.5) * CELL;
    const cy = (s.gridY + 0.5) * CELL;
    const icon = ICONS[s.type] ?? "·";
    const dimmed = s.visited === false ? ' opacity="0.4"' : "";
    const nameY = cy + 28;

    return `<g class="sf-settlement-marker"${dimmed} data-id="${s.id}">
      <circle cx="${cx}" cy="${cy}" r="14" fill="#0d1b2a" stroke="#5588cc" stroke-width="2"/>
      <text x="${cx}" y="${cy + 5}" text-anchor="middle"
        font-size="14" font-family="monospace" fill="#88aaee">${escapeXml(icon)}</text>
      <text x="${cx}" y="${nameY}" text-anchor="middle"
        font-size="9" font-family="sans-serif" fill="#aabbdd">${escapeXml(s.name)}</text>
    </g>`;
  }).join("\n    ");
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
