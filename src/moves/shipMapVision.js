/**
 * STARFORGED COMPANION
 * src/moves/shipMapVision.js — Vision-based deck-feature placement.
 *
 * After the deck-plan background art is generated, send it to a vision-capable
 * Claude model (through src/api-proxy.js, per the architecture constraint) and
 * ask where each deck feature appears — the 11 shipboard-combat stations, the
 * galley, and the ship's installed modules. The model returns normalized 0–1
 * coordinates; createShipMapScene maps them onto the scene so the pins land on
 * the consoles/compartments the art actually drew, rather than at the fixed
 * schematic positions.
 *
 * This is best-effort: VLM coordinate estimates are approximate and
 * non-deterministic. The 11 stations are REQUIRED (all present, in range, not
 * collapsed) — if they fail the gate, the whole result is rejected and the
 * caller falls back to the fixed layout. The galley and modules are OPTIONAL:
 * any with a valid coordinate are used, and any the model misses fall back to
 * their fixed deck position per-feature. The fixed layout is the safety net,
 * never discarded.
 */

import { SHIPBOARD_ROLES } from "./battleStations.js";
import { STATION_LAYOUT } from "./shipMapScene.js";

const MODULE_ID = "starforged-companion";

const ROLE_BY_ID = Object.fromEntries(SHIPBOARD_ROLES.map(r => [r.id, r]));
const STATION_IDS = STATION_LAYOUT.map(s => s.id);


// ─────────────────────────────────────────────────────────────────────────────
// PURE — parse + validate
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
 * Required ids (the 11 stations by default) must ALL be present with finite x/y
 * in [0,1], and the required set must not be degenerate (collapsed onto one
 * point) — both are signals the model guessed badly and we should fall back to
 * the fixed layout entirely. Optional ids (galley, modules) are included when
 * valid and skipped silently otherwise (they fall back per-feature).
 *
 * @param {Object} raw
 * @param {{ requiredIds?: string[], optionalIds?: string[] }} [opts]
 * @returns {Object|null} { featureId: {x,y} } or null
 */
export function validateVisionCoords(raw, { requiredIds = STATION_IDS, optionalIds = [] } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};

  for (const id of requiredIds) {
    const c = raw[id];
    const x = Number(c?.x);
    const y = Number(c?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    out[id] = { x, y };
  }

  // Spread gate over the required set only.
  const xs = requiredIds.map(i => out[i].x);
  const ys = requiredIds.map(i => out[i].y);
  if (requiredIds.length >= 2) {
    if ((Math.max(...xs) - Math.min(...xs)) < 0.25) return null;   // collapsed horizontally
    if ((Math.max(...ys) - Math.min(...ys)) < 0.15) return null;   // collapsed vertically
  }

  for (const id of optionalIds) {
    const c = raw[id];
    const x = Number(c?.x);
    const y = Number(c?.y);
    if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      out[id] = { x, y };
    }
  }

  return out;
}


// ─────────────────────────────────────────────────────────────────────────────
// IO — the vision call
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ask a vision model to locate deck features on a deck-plan image. Returns a
 * validated normalized-coordinate map, or null on any failure of the required
 * (station) set — the caller then falls back to the fixed layout. Never throws.
 *
 * @param {string} b64 — PNG image bytes, base64-encoded (no data: prefix)
 * @param {{ apiKey?:string, model?:string, features?:Array<Object> }} [opts]
 *   features — deck-feature descriptors ({id,kind,label,description}); defaults
 *   to the 11 stations.
 * @returns {Promise<Object|null>} { featureId: {x,y} } normalized, or null
 */
export async function resolveStationCoordsFromImage(b64, opts = {}) {
  if (!b64) return null;

  const apiKey = opts.apiKey ?? readClaudeKey();
  if (!apiKey) return null;

  const model = opts.model
    ?? readModuleSetting("narrationModel")
    ?? "claude-sonnet-4-5-20250929";

  const targets = (Array.isArray(opts.features) && opts.features.length)
    ? opts.features
    : defaultStationTargets();

  const requiredIds = targets.filter(t => t.kind === "station").map(t => t.id);
  const optionalIds = targets.filter(t => t.kind !== "station").map(t => t.id);

  const targetList = targets
    .map(t => `- ${t.id} (${shortDesc(t.label, t.description)})`)
    .join("\n");

  const system =
    "You are a precise vision assistant analysing a top-down starship deck-plan " +
    "blueprint. Return ONLY a JSON object mapping each requested feature id to the " +
    "normalized centre of the matching compartment on the image, in this shape:\n" +
    '{"<feature_id>": {"x": <0..1>, "y": <0..1>}, ...}\n' +
    "Coordinate frame: x=0 is the far LEFT edge (the ship's nose / fore), x=1 is the " +
    "far RIGHT edge (engines / aft); y=0 is the TOP edge, y=1 is the BOTTOM edge. " +
    "Give your best estimate for EVERY feature even if you are uncertain. Use the " +
    "exact ids given (including any 'module:' prefix). Output JSON only — no prose, " +
    "no code fences.";

  const userContent = [
    { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
    {
      type: "text",
      text:
        `Locate these ${targets.length} deck features on the ship deck plan and return ` +
        `their normalized centres as JSON:\n${targetList}`,
    },
  ];

  const body = {
    model,
    max_tokens: 1500,
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
    const coords = validateVisionCoords(parseJsonObject(text), { requiredIds, optionalIds });
    if (coords) {
      console.log(`${MODULE_ID} | shipMapVision: placed deck features from deck-plan art`);
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

/** Default vision targets: the 11 stations with their deck labels + glosses. */
function defaultStationTargets() {
  return STATION_LAYOUT.map(st => {
    const role = ROLE_BY_ID[st.id];
    return {
      id: st.id,
      kind: "station",
      label: role?.label ?? st.id,
      description: `${st.deckLabel}: ${role ? firstClause(role.description) : ""}`,
    };
  });
}

function shortDesc(label, description) {
  const l = String(label ?? "").trim();
  const d = String(description ?? "").trim();
  if (l && d) return `${l} — ${d}`;
  return l || d || "feature";
}

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
