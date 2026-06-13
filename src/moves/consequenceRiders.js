/**
 * STARFORGED COMPANION
 * src/moves/consequenceRiders.js — auto-apply asset "consequence riders".
 *
 * Many Starforged assets layer resource effects onto a move's outcome —
 * "take +1 momentum on a strong hit", "suffer -1 supply", "mark progress on a
 * hit", "on a strong hit with a match, +1 health or +1 momentum". The Foundry
 * asset model stores these only as free-text ability descriptions (no
 * structured effect data), and historically the player applied them by hand.
 *
 * This module reads riders out of the prose via a single Haiku extraction pass
 * (the descriptions are too compound/conditional for regex — "on a strong hit
 * with a match", "you may", "choose one"), filters them by the rolled outcome,
 * and applies the resource deltas so the player never manipulates meters
 * manually. Optional ("you may") and "choose one" riders are routed to a prompt
 * first (see riderDialog.js); automatic riders apply silently.
 *
 * SAFETY: a wrong auto-apply silently corrupts game state, which is worse than
 * the manual status quo. So extraction is conservative and every rider is
 * validated (known resource, small integer amount); anything malformed is
 * dropped, and on a missing key / parse failure the whole pass yields nothing
 * and the caller falls back to surfacing the ability text as before. Meter and
 * progress writes are world-scoped — the caller GM-gates application.
 */

import { applyMeterChanges } from "../character/actorBridge.js";

const MODULE_ID    = "starforged-companion";
const HAIKU_MODEL  = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Resources a rider may adjust. `progress` is handled by the caller (it marks
// a progress track, not a meter); the rest go through applyMeterChanges /
// the ship actor. `ammo` and other asset-local resources are intentionally
// excluded — they aren't standard meters and stay surfaced as text.
export const METER_RESOURCES = new Set(["momentum", "health", "spirit", "supply", "integrity"]);
export const RIDER_RESOURCES = new Set([...METER_RESOURCES, "progress"]);

const VALID_CONDITIONS = new Set([
  "any", "hit", "strong_hit", "weak_hit", "miss", "match", "strong_hit_match",
]);

/**
 * Does a rider's trigger condition fire for the rolled outcome?
 *
 * @param {string} condition — one of VALID_CONDITIONS
 * @param {string} outcome   — "strong_hit" | "weak_hit" | "miss"
 * @param {boolean} isMatch
 * @returns {boolean}
 */
export function conditionFires(condition, outcome, isMatch) {
  switch (condition) {
    case "any":              return true;
    case "hit":              return outcome === "strong_hit" || outcome === "weak_hit";
    case "strong_hit":       return outcome === "strong_hit";
    case "weak_hit":         return outcome === "weak_hit";
    case "miss":             return outcome === "miss";
    case "match":            return !!isMatch;
    case "strong_hit_match": return outcome === "strong_hit" && !!isMatch;
    default:                 return false;
  }
}

/**
 * Validate and normalise one raw rider from the extractor. Returns the clean
 * rider or null when it's malformed / out of policy (dropped, never applied).
 */
export function normaliseRider(raw, assetName = "") {
  if (!raw || typeof raw !== "object") return null;
  const resource  = String(raw.resource ?? "").toLowerCase().trim();
  const condition = String(raw.condition ?? "any").toLowerCase().trim();
  const amount    = Number(raw.amount);

  if (!RIDER_RESOURCES.has(resource)) return null;
  if (!VALID_CONDITIONS.has(condition)) return null;
  if (!Number.isInteger(amount) || amount === 0) return null;
  if (Math.abs(amount) > 5) return null;           // sanity bound — no asset grants more

  return {
    resource,
    condition,
    amount,
    optional:    !!raw.optional,
    choiceGroup: raw.choiceGroup != null ? String(raw.choiceGroup) : null,
    label:       String(raw.label ?? "").slice(0, 120) || defaultLabel(resource, amount),
    assetName:   String(assetName ?? ""),
  };
}

function defaultLabel(resource, amount) {
  const sign = amount > 0 ? `+${amount}` : `${amount}`;
  return resource === "progress" ? `mark progress (${amount})` : `${sign} ${resource}`;
}

/**
 * Flatten the extractor output to the riders that fire for this outcome,
 * carrying their asset/optional/choice metadata.
 *
 * @param {Array} extracted — [{ key, assetName, riders: [...] }]
 * @param {string} outcome
 * @param {boolean} isMatch
 * @returns {Array} firing riders (normalised)
 */
export function collectFiringRiders(extracted, outcome, isMatch) {
  if (!Array.isArray(extracted)) return [];
  const out = [];
  for (const entry of extracted) {
    const riders = Array.isArray(entry?.riders) ? entry.riders : [];
    for (const r of riders) {
      const rider = normaliseRider(r, entry.assetName);
      if (rider && conditionFires(rider.condition, outcome, isMatch)) {
        out.push({ ...rider, key: entry.key ?? null });
      }
    }
  }
  return out;
}

/**
 * Split firing riders into those applied automatically and those that need a
 * prompt. A rider is prompted when it's optional, part of a "choose one"
 * group, or marks progress (the player picks which track unless the caller
 * resolves it). Everything else is automatic.
 *
 * @param {Array} firing
 * @returns {{ automatic: Array, prompted: Array }}
 */
export function partitionRiders(firing) {
  const automatic = [];
  const prompted  = [];
  for (const r of firing) {
    if (r.optional || r.choiceGroup || r.resource === "progress") prompted.push(r);
    else automatic.push(r);
  }
  return { automatic, prompted };
}

/**
 * Sum the meter deltas across a set of riders, split by target. Character
 * meters (momentum/health/spirit/supply) vs ship integrity. Progress riders
 * are ignored here — the caller marks tracks separately.
 *
 * @param {Array} riders
 * @returns {{ character: {momentum,health,spirit,supply}, integrity: number }}
 */
export function sumMeterDeltas(riders) {
  const character = { momentum: 0, health: 0, spirit: 0, supply: 0 };
  let integrity = 0;
  for (const r of riders ?? []) {
    if (r.resource === "integrity") integrity += r.amount;
    else if (r.resource in character) character[r.resource] += r.amount;
  }
  return { character, integrity };
}

/**
 * Apply meter riders to the character actor and (for integrity) the command
 * ship actor. GM-gated by the caller. Returns a summary of what was applied.
 *
 * @param {Array} riders
 * @param {Object} ctx
 * @param {Actor} ctx.characterActor
 * @param {Actor|null} [ctx.shipActor]
 * @param {string|null} [ctx.shipActorId] — fallback id to updateShip against
 * @returns {Promise<Array<{label:string, assetName:string}>>} applied summary
 */
export async function applyMeterRiders(riders, { characterActor, shipActorId } = {}) {
  const applied = [];
  const meterRiders = (riders ?? []).filter(r => METER_RESOURCES.has(r.resource));
  if (!meterRiders.length) return applied;

  const { character, integrity } = sumMeterDeltas(meterRiders);

  if (characterActor && (character.momentum || character.health || character.spirit || character.supply)) {
    await applyMeterChanges(characterActor, character);
  }
  if (integrity && shipActorId) {
    try {
      const { getShip, updateShip } = await import("../entities/ship.js");
      const ship = getShip(shipActorId);
      if (ship) {
        const max = ship.integrityMax ?? 5;
        const next = Math.max(0, Math.min(max, Number(ship.integrity ?? max) + integrity));
        await updateShip(shipActorId, { integrity: next });
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | consequenceRiders: integrity write failed:`, err?.message ?? err);
    }
  }

  for (const r of meterRiders) applied.push({ label: r.label, assetName: r.assetName });
  return applied;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTION (Haiku)
// ─────────────────────────────────────────────────────────────────────────────

const EXTRACT_SYSTEM = [
  "You extract MECHANICAL CONSEQUENCE RIDERS from Ironsworn: Starforged asset",
  "ability text — the parts that change a player's resources or mark progress",
  "as a result of a move's OUTCOME. Reply with one JSON object, no prose.",
  "",
  "For each ability, list its riders. A rider is a change to one of these",
  "resources: momentum, health, spirit, supply, integrity, progress.",
  "IGNORE everything else: bonuses added to the roll (+N before rolling),",
  "rerolls, alternate-stat rolls, asset-local resources (ammo), and pure",
  "narrative effects. If an ability has no qualifying rider, give it none.",
  "",
  "Each rider: {",
  '  "condition": one of "any"|"hit"|"strong_hit"|"weak_hit"|"miss"|"match"|"strong_hit_match",',
  '  "resource":  "momentum"|"health"|"spirit"|"supply"|"integrity"|"progress",',
  '  "amount":    integer (positive to gain, negative to lose; progress = marks, usually 1),',
  '  "optional":  true if the text says "you may" / is the player\'s choice,',
  '  "choiceGroup": a short id shared by mutually-exclusive "choose one" options, else null,',
  '  "label":     a short human description, e.g. "+1 momentum"',
  "}",
  "",
  '"on a hit" → "hit"; "on a strong hit" → "strong_hit"; "on a strong hit with',
  'a match" → "strong_hit_match"; "on a match" → "match"; effect with no stated',
  'trigger → "any". Be conservative: when unsure, omit the rider.',
  "",
  'Output shape: {"abilities":[{"key":"<key>","riders":[ ... ]}]}',
].join("\n");

/**
 * Extract structured riders for a set of applicable abilities. Returns
 * `[{ key, assetName, abilityName, riders: [...] }]`. Yields `[]` with no key,
 * on any failure, or when nothing qualifies — the caller then surfaces the
 * ability text as before (never applies a guess).
 *
 * @param {Object} args
 * @param {Array}  args.abilities — scanForApplicableAbilities output (key/assetName/abilityName/text)
 * @param {string} args.moveName
 * @param {string} args.apiKey
 * @param {Function} [args._call] — injectable transport for tests
 * @returns {Promise<Array>}
 */
export async function extractRiders({ abilities, moveName, apiKey, _call = callHaikuExtract }) {
  if (!apiKey) return [];
  const list = (abilities ?? []).filter(a => a && a.text);
  if (!list.length) return [];

  const userPrompt =
    `Move: ${moveName}\n\nAbilities:\n` +
    list.map(a => `[key:${a.key}] ${a.assetName}: ${a.text}`).join("\n");

  let raw;
  try {
    raw = await _call(userPrompt, apiKey);
  } catch (err) {
    console.warn(`${MODULE_ID} | consequenceRiders: extraction call failed:`, err?.message ?? err);
    return [];
  }

  let parsed;
  try {
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    parsed = JSON.parse(json);
  } catch (err) {
    console.warn(`${MODULE_ID} | consequenceRiders: extraction parse failed:`, err?.message ?? err);
    return [];
  }

  const byKey = new Map(list.map(a => [a.key, a]));
  const out = [];
  for (const ab of parsed?.abilities ?? []) {
    const meta = byKey.get(ab?.key);
    if (!meta) continue;
    const riders = (Array.isArray(ab.riders) ? ab.riders : [])
      .map(r => normaliseRider(r, meta.assetName))
      .filter(Boolean);
    if (riders.length) {
      out.push({ key: meta.key, assetName: meta.assetName, abilityName: meta.abilityName ?? "", riders });
    }
  }
  return out;
}

async function callHaikuExtract(userPrompt, apiKey) {
  const { apiPost } = await import("../api-proxy.js");
  const body = {
    model:      HAIKU_MODEL,
    max_tokens: 700,
    system:     [{ type: "text", text: EXTRACT_SYSTEM }],
    messages:   [{ role: "user", content: userPrompt }],
  };
  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
  };
  const data = await apiPost(ANTHROPIC_URL, headers, body);
  return (data?.content ?? []).filter(b => b?.type === "text").map(b => b.text).join("");
}
