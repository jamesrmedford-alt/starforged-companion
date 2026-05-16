/**
 * STARFORGED COMPANION
 * src/moves/abilityScanner.js — Asset ability discovery for a chosen move.
 *
 * After the move interpreter has chosen a move (and before the player
 * confirms / the dice are rolled), this module scans the active
 * character's asset Items and the command vehicle's modules for
 * abilities that apply to the chosen move. The Confirm Move
 * Interpretation dialog surfaces matches with checkboxes so the player
 * can opt-in any +N adds before the roll.
 *
 * Detection is hybrid (per scope decision):
 *   1. Structured pass — ironsworn's asset.system.abilities[].description
 *      embeds `@Compendium[…]{MoveName}` links when an ability is keyed
 *      to a specific move. Display-name match against the chosen move
 *      is unambiguous.
 *   2. Haiku fallback — when no structured match exists, a single
 *      Haiku call reads the enabled abilities + chosen move + narration
 *      and returns applicable items with one-line summaries. Catches
 *      implicit phrasing like "when you attack" or "when you draw on
 *      this energy" that pattern matching can't reliably identify.
 *
 * Adds extraction is regex-based ("add +1", "+2", etc.); when no number
 * is found the ability still surfaces but contributes zero adds — the
 * player reads the text and decides what to do.
 *
 * Asset sources:
 *   - Character actor: paths, companions, deeds, support vehicles
 *     (all stored as `asset`-typed Items, distinguished by
 *      system.category).
 *   - Command vehicle starship actor: modules (also `asset`-typed
 *     Items, on a different Actor).
 */

import { apiPost } from "../api-proxy.js";
import { listShips } from "../entities/ship.js";

const MODULE_ID    = "starforged-companion";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL  = "claude-haiku-4-5-20251001";

// Categories surfaced from the character actor. The system uses these
// (capitalised) on asset.system.category. We accept any non-empty
// category — the list is for display, not filtering.
const KNOWN_CHARACTER_CATEGORIES = [
  "Path", "Companion", "Deed", "Support Vehicle", "Combat Talent", "Ritual",
];

const MAX_ABILITY_TEXT_CHARS = 600;


// ─────────────────────────────────────────────────────────────────────────────
// COLLECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collect all enabled asset abilities from the character actor and the
 * command vehicle. Returns a flat list of ability descriptors with the
 * source actor noted so the dialog can group / label.
 *
 * @param {Actor} characterActor
 * @param {Actor|null} commandShipActor
 * @returns {Array<{ key, assetId, assetName, category, source, abilityIndex, abilityName, text }>}
 */
export function collectEnabledAbilities(characterActor, commandShipActor) {
  const out = [];

  for (const ab of readAssetAbilities(characterActor, "character")) {
    out.push(ab);
  }
  for (const ab of readAssetAbilities(commandShipActor, "command_vehicle")) {
    out.push(ab);
  }

  return out;
}

function readAssetAbilities(actor, source) {
  if (!actor) return [];
  const items = actor.items?.contents ?? (Array.isArray(actor.items) ? actor.items : []);
  const out = [];
  for (const item of items) {
    if (item?.type !== "asset") continue;
    const abilities = item.system?.abilities ?? [];
    abilities.forEach((ab, idx) => {
      if (!ab?.enabled) return;
      const text = stripHtml(ab.description ?? "");
      if (!text) return;
      out.push({
        key:           `${item.id}:${idx}`,
        assetId:       item.id,
        assetName:     item.name ?? "",
        category:      item.system?.category ?? "",
        source,                  // "character" | "command_vehicle"
        abilityIndex:  idx,
        abilityName:   ab.name ?? "",
        text:          text.slice(0, MAX_ABILITY_TEXT_CHARS),
      });
    });
  }
  return out;
}

function stripHtml(s) {
  return String(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


// ─────────────────────────────────────────────────────────────────────────────
// DETECTION — STRUCTURED PASS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find abilities that explicitly reference the chosen move via a
 * `@Compendium[…]{MoveName}` link. Display-name match is
 * case-insensitive and ignores punctuation/whitespace.
 *
 * @param {Array} abilities — output of collectEnabledAbilities
 * @param {string} moveName — display name e.g. "Gather Information"
 * @returns {Array} subset of abilities whose text references this move
 */
export function structuredMatches(abilities, moveName) {
  const target = normaliseName(moveName);
  if (!target) return [];

  const re = /@Compendium\[[^\]]*\]\{([^}]+)\}/g;
  const matches = [];
  for (const ab of abilities) {
    // Stored text has already had HTML stripped; @Compendium tokens survive.
    re.lastIndex = 0;
    let m;
    let hit = false;
    while ((m = re.exec(ab.text ?? "")) !== null) {
      if (normaliseName(m[1]) === target) { hit = true; break; }
    }
    if (hit) matches.push(ab);
  }
  return matches;
}

function normaliseName(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}


// ─────────────────────────────────────────────────────────────────────────────
// DETECTION — HAIKU FALLBACK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ask Haiku to identify abilities applicable to the chosen move.
 * Returns ability descriptors annotated with a short summary; called
 * only when the structured pass returns nothing.
 *
 * @param {Array}  abilities
 * @param {string} moveId
 * @param {string} moveName
 * @param {string} narration
 * @param {string} apiKey
 * @returns {Promise<Array<{key, summary}>>}
 */
export async function haikuFallback(abilities, moveId, moveName, narration, apiKey, { _call = callHaiku } = {}) {
  if (!apiKey || !abilities.length) return [];

  const prompt = buildHaikuPrompt(abilities, moveId, moveName, narration);
  let raw;
  try {
    raw = await _call(prompt, apiKey);
  } catch (err) {
    console.warn(`${MODULE_ID} | abilityScanner: Haiku call failed:`, err.message);
    return [];
  }

  const parsed = parseHaikuResponse(raw);
  // Map LLM-returned keys back to the original ability records.
  const byKey = new Map(abilities.map(a => [a.key, a]));
  return parsed
    .map(({ key, summary }) => {
      const ab = byKey.get(key);
      return ab ? { ...ab, summary: summary ?? "" } : null;
    })
    .filter(Boolean);
}

function buildHaikuPrompt(abilities, moveId, moveName, narration) {
  const list = abilities.map(a => (
    `- key="${a.key}" asset="${a.assetName}" category="${a.category}" ability="${a.abilityName || "(unnamed)"}"\n  text: ${a.text}`
  )).join("\n");
  return [
    `You are scanning a Starforged player character's asset abilities to decide which (if any) apply to the move they are about to roll.`,
    ``,
    `Chosen move: ${moveName} (id: ${moveId})`,
    `Player narration: "${narration}"`,
    ``,
    `Enabled abilities:`,
    list,
    ``,
    `Return ONLY a JSON object of the form:`,
    `{ "matches": [ { "key": "<ability key>", "summary": "<one short sentence: what the ability does for this move>" }, ... ] }`,
    ``,
    `Rules:`,
    `- Include an ability only when its trigger condition genuinely applies to this move and this narration.`,
    `- Do NOT include abilities whose trigger is unrelated (e.g. an "Endure Harm" ability when the move is "Gather Information").`,
    `- "matches" may be an empty array. Prefer false negatives over false positives.`,
    `- Output JSON only, no prose, no markdown fences.`,
  ].join("\n");
}

function parseHaikuResponse(raw) {
  if (!raw) return [];
  try {
    const cleaned = String(raw).replace(/```(?:json)?|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed?.matches) ? parsed.matches : [];
    return arr
      .filter(m => m && typeof m.key === "string")
      .map(m => ({ key: m.key, summary: String(m.summary ?? "").trim() }));
  } catch (err) {
    console.warn(`${MODULE_ID} | abilityScanner: Haiku JSON parse failed:`, err.message);
    return [];
  }
}

async function callHaiku(userPrompt, apiKey) {
  const body = {
    model:      HAIKU_MODEL,
    max_tokens: 600,
    messages:   [{ role: "user", content: userPrompt }],
  };
  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
  };
  const data = await apiPost(ANTHROPIC_URL, headers, body);
  return (data?.content ?? [])
    .filter(b => b?.type === "text")
    .map(b => b.text)
    .join("");
}


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hybrid scan. Tries structured matches first. If none, falls back to
 * Haiku. Annotates each result with a numeric `adds` extracted via
 * regex (best-effort) and a `source` flag ("structured" | "haiku").
 *
 * @param {Object} args
 * @param {string} args.moveId
 * @param {string} args.moveName
 * @param {string} args.narration
 * @param {Actor}  args.characterActor
 * @param {Actor|null} args.commandShipActor
 * @param {string} args.apiKey
 * @returns {Promise<Array<{ key, assetName, category, source, abilityName, summary, text, adds, detection }>>}
 */
export async function scanForApplicableAbilities({
  moveId, moveName, narration, characterActor, commandShipActor, apiKey,
}) {
  const all = collectEnabledAbilities(characterActor, commandShipActor);
  if (!all.length) return [];

  const structured = structuredMatches(all, moveName);
  if (structured.length > 0) {
    return structured.map(annotate("structured"));
  }

  const llm = await haikuFallback(all, moveId, moveName, narration, apiKey);
  return llm.map(annotate("haiku"));
}

function annotate(detection) {
  return (ab) => ({
    key:          ab.key,
    assetName:    ab.assetName,
    category:     ab.category,
    source:       ab.source,
    abilityName:  ab.abilityName,
    summary:      ab.summary ?? "",
    text:         ab.text,
    adds:         extractAdds(ab.text),
    detection,
  });
}

/**
 * Best-effort numeric adds extraction. Looks for "add +N" or "+N add"
 * patterns. Returns 0 when no clear match — the ability still surfaces
 * in the dialog, but contributes nothing to the roll unless the player
 * sets adds manually.
 *
 * Skips momentum / fire / heat references — those are resource changes,
 * not roll modifiers.
 */
export function extractAdds(text) {
  const s = String(text ?? "");
  // Direct "add +N" or "+N add"
  const pattern = /(?:\badds?\s+\+?(\d+)|\+(\d+)\s+add)/gi;
  let m;
  let total = 0;
  let found = false;
  while ((m = pattern.exec(s)) !== null) {
    const n = Number(m[1] ?? m[2] ?? 0);
    if (n > 0 && n <= 5) { total += n; found = true; }
  }
  return found ? total : 0;
}


// ─────────────────────────────────────────────────────────────────────────────
// COMMAND VEHICLE LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the command vehicle starship Actor from campaign state.
 * Returns null when no command vehicle has been registered yet.
 *
 * @param {Object} campaignState
 * @returns {Actor|null}
 */
export function getCommandVehicleActor(campaignState) {
  try {
    const ids = campaignState?.shipIds ?? [];
    for (const id of ids) {
      const actor = globalThis.game?.actors?.get?.(id);
      if (!actor) continue;
      const ship = actor.flags?.[MODULE_ID]?.ship;
      if (ship?.isCommandVehicle) return actor;
    }
    // Fallback via listShips (handles older flag layouts).
    const ship = (listShips(campaignState) ?? []).find(s => s?.isCommandVehicle);
    if (!ship) return null;
    // listShips returns flag payloads; map back via shipIds whose actor has
    // the matching ship._id.
    for (const id of ids) {
      const actor = globalThis.game?.actors?.get?.(id);
      const payload = actor?.flags?.[MODULE_ID]?.ship;
      if (payload?._id && payload._id === ship._id) return actor;
    }
    return null;
  } catch (err) {
    console.warn(`${MODULE_ID} | abilityScanner: getCommandVehicleActor failed:`, err);
    return null;
  }
}

// Exported for completeness; consumers expect KNOWN_CHARACTER_CATEGORIES
// for grouping labels on the confirm dialog.
export { KNOWN_CHARACTER_CATEGORIES };
