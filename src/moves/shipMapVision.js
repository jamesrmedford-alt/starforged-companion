/**
 * STARFORGED COMPANION
 * src/moves/shipMapVision.js — Vision-based station placement for the ship map.
 *
 * After the deck-plan background art is generated, send it to a vision-capable
 * Claude model (through src/api-proxy.js, per the architecture constraint) and
 * ask where each of the 11 shipboard-combat compartments appears. The model
 * returns normalized 0–1 coordinates; createShipMapScene maps them onto the
 * scene so the station pins land on the consoles the art actually drew, rather
 * than at the fixed schematic positions.
 *
 * This is best-effort: VLM coordinate estimates are approximate and
 * non-deterministic. Every result passes through validateVisionCoords (all 11
 * ids present, in range, not collapsed onto one point); on any miss — call
 * fails, bad JSON, degenerate layout, no key — the caller falls back to the
 * fixed STATION_LAYOUT. The fixed layout is the safety net, never discarded.
 */

import { SHIPBOARD_ROLES } from "./battleStations.js";
import { STATION_LAYOUT } from "./shipMapScene.js";

const MODULE_ID = "starforged-companion";

const ROLE_BY_ID = Object.fromEntries(SHIPBOARD_ROLES.map(r => [r.id, r]));


// ─────────────────────────────────────────────────────────────────────────────
// PURE — parse + validate + map
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the first balanced JSON object from a model response (tolerates code
 * fences / leading prose). Returns the parsed object, or null.
 */
export function parseJsonObject(text) {
  if (typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Validate a raw vision result into a clean normalized-coordinate map, or null.
 *
 * Requires EVERY station id present with finite x/y in [0,1], and rejects a
 * degenerate result where the points are collapsed (too little spread to be a
 * real layout) — both are signals the model guessed badly and we should fall
 * back to the fixed layout.
 *
 * @param {Object} raw
 * @returns {Object|null} { stationId: {x,y} } or null
 */
export function validateVisionCoords(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ids = STATION_LAYOUT.map(s => s.id);
  const out = {};
  for (const id of ids) {
    const c = raw[id];
    const x = Number(c?.x);
    const y = Number(c?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    out[id] = { x, y };
  }
  const xs = ids.map(i => out[i].x);
  const ys = ids.map(i => out[i].y);
  if ((Math.max(...xs) - Math.min(...xs)) < 0.25) return null;   // collapsed horizontally
  if ((Math.max(...ys) - Math.min(...ys)) < 0.15) return null;   // collapsed vertically
  return out;
}


// ─────────────────────────────────────────────────────────────────────────────
// IO — the vision call
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ask a vision model to locate the 11 stations on a deck-plan image. Returns a
 * validated normalized-coordinate map, or null on any failure (caller falls
 * back to the fixed layout). Never throws.
 *
 * @param {string} b64 — PNG image bytes, base64-encoded (no data: prefix)
 * @param {{ apiKey?:string, model?:string }} [opts]
 * @returns {Promise<Object|null>} { stationId: {x,y} } normalized, or null
 */
export async function resolveStationCoordsFromImage(b64, opts = {}) {
  if (!b64) return null;

  const apiKey = opts.apiKey ?? readClaudeKey();
  if (!apiKey) return null;

  const model = opts.model
    ?? readModuleSetting("narrationModel")
    ?? "claude-sonnet-4-5-20250929";

  const stationList = STATION_LAYOUT.map(st => {
    const role = ROLE_BY_ID[st.id];
    return `- ${st.id} (${st.deckLabel}): ${role ? firstClause(role.description) : st.id}`;
  }).join("\n");

  const system =
    "You are a precise vision assistant analysing a top-down starship deck-plan " +
    "blueprint. Return ONLY a JSON object mapping each requested station id to the " +
    "normalized centre of the matching compartment on the image, in this shape:\n" +
    '{"<station_id>": {"x": <0..1>, "y": <0..1>}, ...}\n' +
    "Coordinate frame: x=0 is the far LEFT edge (the ship's nose / fore), x=1 is the " +
    "far RIGHT edge (engines / aft); y=0 is the TOP edge, y=1 is the BOTTOM edge. " +
    "Give your best estimate for EVERY station even if you are uncertain. Do not omit " +
    "any id. Output JSON only — no prose, no code fences.";

  const userContent = [
    { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
    {
      type: "text",
      text:
        `Locate these ${STATION_LAYOUT.length} shipboard-combat stations on the deck plan ` +
        `and return their normalized centres as JSON:\n${stationList}`,
    },
  ];

  const body = {
    model,
    max_tokens: 1024,
    system:   [{ type: "text", text: system }],
    messages: [{ role: "user", content: userContent }],
  };
  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
  };

  try {
    const { apiPost } = await import("../api-proxy.js");
    const data = await apiPost("https://api.anthropic.com/v1/messages", headers, body);
    const text = (data?.content ?? [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();
    const coords = validateVisionCoords(parseJsonObject(text));
    if (coords) {
      console.log(`${MODULE_ID} | shipMapVision: placed stations from deck-plan art`);
    } else {
      console.log(`${MODULE_ID} | shipMapVision: result rejected — using fixed layout`);
    }
    return coords;
  } catch (err) {
    console.warn(`${MODULE_ID} | shipMapVision: localization call failed:`, err?.message ?? err);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function firstClause(desc) {
  const c = String(desc ?? "").split(",")[0].trim();
  return c || String(desc ?? "").trim();
}

function readClaudeKey() {
  try { return globalThis.game?.settings?.get?.(MODULE_ID, "claudeApiKey") || null; }
  catch { return null; }
}

function readModuleSetting(key) {
  try { return globalThis.game?.settings?.get?.(MODULE_ID, key) || undefined; }
  catch { return undefined; }
}
