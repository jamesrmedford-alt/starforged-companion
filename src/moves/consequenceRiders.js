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

import { applyMeterChanges, readCharacterSnapshot, invalidateActorCache } from "../character/actorBridge.js";
import { markUnprepared, crewUnpreparedNote, isUnprepared } from "./sufferExecutor.js";
import { assetMatchMove } from "./sceneChallenge.js";

const MODULE_ID    = "starforged-companion";
const HAIKU_MODEL  = "claude-haiku-5-5";
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
    // The "choose one" option it belongs to, as the text names it ("Pin them
    // down") — what a choice made before the roll is settled by (issue #345 AA12).
    option:      typeof raw.option === "string" && raw.option.trim() ? raw.option.trim().slice(0, 80) : null,
    label:       String(raw.label ?? "").slice(0, 120) || defaultLabel(resource, amount),
    assetName:   String(assetName ?? ""),
  };
}

/**
 * Settle the "choose one" an ability's add decided before the roll (issue
 * #345 AA12). Gunner: "When you Strike, choose one (before rolling). Pin them
 * down: Add +1 and take +1 momentum on a hit. Make them hurt: Mark progress
 * on a hit." The confirm dialog pre-checks Pin them down's +1 and the roll
 * takes it — that is the choice; the outcome prompt then offered both options
 * again, so the player took the +1 and, seeing the hit, Make them hurt's mark
 * as well. For each ability whose add is one option's (the scanner's
 * `preRollChoice`):
 *   - its add taken (the ability checked — `appliedAbilityKeys`): the riders
 *     of that option are the outcome's own (no longer a choice), and the
 *     other options' are dropped;
 *   - not taken: that option's riders are dropped, and the others stay the
 *     choice (or Neither).
 * A rider's option is the one it names (`option`), else the one its label
 * names. A rider in the choice that names none, with the add taken, cannot be
 * shown to be the chosen option's: it is dropped — never doubled, as the
 * extraction is conservative. A rider outside the choice (no choiceGroup, no
 * option — Sensor Array's "choose one and take +1 momentum on a hit") stands.
 * Abilities with no such choice are returned as they are.
 *
 * @param {Array} extracted — extractRiders' [{ key, assetName, riders }]
 * @param {Array} abilities — the scan's applicable abilities (`key`, `preRollChoice`)
 * @param {string[]} appliedKeys — the abilities the confirm kept checked
 * @returns {Array} extracted, with each settled choice's riders
 */
export function settlePreRollChoices(extracted, abilities, appliedKeys) {
  if (!Array.isArray(extracted)) return [];
  const choices = new Map((Array.isArray(abilities) ? abilities : [])
    .filter(a => a?.key && a.preRollChoice?.option)
    .map(a => [a.key, a.preRollChoice]));
  if (!choices.size) return extracted;
  const taken = new Set(Array.isArray(appliedKeys) ? appliedKeys : []);
  const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return extracted.map(entry => {
    const choice = choices.get(entry?.key);
    if (!choice) return entry;
    const names = (choice.options ?? []).map(norm).filter(Boolean);
    const optionOf = (r) => {
      const own = norm(r?.option);
      if (own && names.includes(own)) return own;
      const label = norm(r?.label);
      return names.find(n => label.includes(n)) ?? null;
    };
    const chosen = norm(choice.option);
    const settled = taken.has(entry.key);
    const riders = (Array.isArray(entry.riders) ? entry.riders : []).flatMap(r => {
      const option = optionOf(r);
      if (option === chosen) return settled ? [{ ...r, choiceGroup: null }] : [];
      if (option) return settled ? [] : [r];
      return settled && r?.choiceGroup ? [] : [r];
    });
    return { ...entry, riders };
  });
}

/**
 * Keep only the riders of the abilities the confirm kept checked
 * (RIDERS-IGNORE-UNCHECKED). A box the player unchecks says the ability does
 * not apply this turn — its effects on the outcome included: the Hoverbike's
 * "+2 momentum on a strong hit" fired with its add left unchecked. The
 * confirm pre-checks an ability that carries riders (`hasRiders`, stamped by
 * the pre-roll pass), so leaving the box alone keeps them.
 *
 * An ability whose "choose one (before rolling)" its add decides
 * (`preRollChoice`) stays whatever its box: unchecked, it chose another
 * option, which settlePreRollChoices still offers (issue #345 AA12).
 *
 * With no confirm read (`appliedKeys` not an array — a round rebuilt after a
 * reload, a confirm whose form could not be read) every rider stands, as
 * before.
 *
 * @param {Array} extracted — extractRiders' [{ key, assetName, riders }]
 * @param {Array} abilities — the scan's applicable abilities (`key`, `preRollChoice`)
 * @param {string[]|undefined} appliedKeys — the abilities the confirm kept checked
 * @returns {Array} the extracted entries whose ability applies
 */
export function dropUncheckedRiders(extracted, abilities, appliedKeys) {
  if (!Array.isArray(extracted)) return [];
  if (!Array.isArray(appliedKeys)) return extracted;
  const taken = new Set(appliedKeys);
  const choosing = new Set((Array.isArray(abilities) ? abilities : [])
    .filter(a => a?.key && a.preRollChoice?.option)
    .map(a => a.key));
  return extracted.filter(entry => taken.has(entry?.key) || choosing.has(entry?.key));
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
 * ship actor. GM-gated by the caller. The character's meters are one write
 * and the ship's integrity another; each rider's outcome is its write's — a
 * rider is applied only once that write has landed (issue #315 S08: a
 * refused integrity write was summarised as applied).
 *
 * @param {Array} riders
 * @param {Object} ctx
 * @param {Actor} ctx.characterActor
 * @param {string|null} [ctx.shipActorId] — the ship whose integrity changes
 * @param {string|null} [ctx.resolutionId] — the move the riders follow: a
 *   supply loss redirected to another suffer move posts its picker bound to
 *   it, so an upgrade of the move retires the picker
 * @returns {Promise<Array<{ rider: Object, ok: boolean, reason?: string, error?: string, note?: string }>>}
 *   one per meter rider, in order: `reason` is why it was not applied —
 *   `"redirected"` for a supply loss while unprepared, which another suffer
 *   move pays (`"redirect-unposted"` when its picker could not be posted);
 *   `note` (HTML, on the character's riders) is the unprepared mark a supply
 *   loss to 0 made, or what became of a redirected loss
 */
export async function applyMeterRiders(riders, { characterActor, shipActorId, resolutionId = null } = {}) {
  const meterRiders = (riders ?? []).filter(r => METER_RESOURCES.has(r.resource));
  if (!meterRiders.length) return [];

  const { character, integrity } = sumMeterDeltas(meterRiders);
  const onShip = (r) => r.resource === "integrity";
  const characterResult = meterRiders.some(r => !onShip(r)) ? await writeCharacterMeters(characterActor, character, { resolutionId }) : null;
  const shipResult      = meterRiders.some(onShip) ? await writeShipIntegrity(shipActorId, integrity) : null;
  // A redirected supply loss is its riders' own outcome; the rest of the
  // character's riders rode the write.
  const { supplyRedirect = null, ...written } = characterResult ?? {};
  const outcomeOf = (rider) => (onShip(rider) ? shipResult
    : rider.resource === "supply" && supplyRedirect ? supplyRedirect
    : written);
  return meterRiders.map(rider => ({ rider, ...outcomeOf(rider) }));
}

/**
 * The character's summed meter deltas, as one write. A supply loss that
 * leaves the supply exhausted is a loss of resources like any other: "If your
 * supply is exhausted (reduced to 0), mark unprepared" — on the PC and every
 * ally sharing the supply, through the zero-supply impact's one writer
 * (sufferExecutor.markUnprepared, issue #315 S04 / S07; issue #331 X16).
 * `note` is the summary card's line for it.
 *
 * A supply loss while the PC is unprepared is not the supply's: "When you
 * suffer a loss of resources while unprepared … apply the cost to a different
 * suffer move" (vendored Sacrifice Resources; at any supply — issue #338 D3).
 * It posts the picker Sacrifice Resources' executor posts for its own loss
 * (issue #325 W16), and is reported `supplyRedirect` — never applied: the
 * clamp wrote 0 → 0 and the summary listed the cost as settled (issue #336
 * Y19). The other deltas are written as ever.
 */
async function writeCharacterMeters(actor, deltas, { resolutionId = null } = {}) {
  if (!actor) return { ok: false, reason: "no-pc" };
  const lost = deltas?.supply < 0 && isUnprepared(actor) ? -deltas.supply : 0;
  const supplyRedirect = lost ? await redirectSupplyLoss(actor, lost, resolutionId) : null;
  const write = lost ? { ...deltas, supply: 0 } : deltas;
  try {
    await applyMeterChanges(actor, write);
  } catch (err) {
    console.warn(`${MODULE_ID} | consequenceRiders: meter write on ${actor.name ?? actor.id} failed:`, err?.message ?? err);
    return { ok: false, reason: "refused", error: String(err?.message ?? err), ...(supplyRedirect ? { supplyRedirect } : {}) };
  }
  if (supplyRedirect) return { ok: true, supplyRedirect };
  const note = write?.supply < 0 ? await markIfExhausted(actor) : null;
  return note ? { ok: true, note } : { ok: true };
}

/**
 * A rider's supply loss while unprepared, to a different suffer move: the
 * "make a suffer move (-N)" picker without Sacrifice Resources — the W16
 * picker — bound to the move the riders follow. A picker posted once that
 * move's result was already burned or improved is the upgraded outcome's own
 * (`upgraded`): a Batch Mode round runs its riders after its upgrade step,
 * for the final outcome, and the picker was retired as superseded at the
 * first pick — the cost never paid (issue #342 Z28). One posted before an
 * upgrade still leaves with the outcome it superseded (issue #311 P03).
 * Never throws.
 *
 * @param {Actor} actor
 * @param {number} amount — the loss
 * @param {string|null} resolutionId
 * @returns {Promise<{ ok: false, reason: "redirected"|"redirect-unposted", note: string }>}
 */
async function redirectSupplyLoss(actor, amount, resolutionId) {
  const name = escapeHtml(actor.name ?? "The character");
  const bound = typeof resolutionId === "string" && resolutionId ? resolutionId : null;
  let posted = null;
  try {
    const { postSufferChoiceCard } = await import("./sufferCard.js");
    const { upgradeKindFor } = await import("./resultUpgrade.js");
    posted = await postSufferChoiceCard({
      sufferPrompt: { kind: "any", amount, count: 1, exclude: ["sacrifice_resources"] },
      actor,
      executorOpts: {},
      resolutionId: bound,
      upgraded: !!(bound && upgradeKindFor(bound)),
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | consequenceRiders: the redirected supply loss's picker could not be posted:`, err?.message ?? err);
  }
  return posted
    ? { ok: false, reason: "redirected", note: `${name} is <strong>unprepared</strong> — the -${amount} supply goes to another suffer move (choose it on its card)` }
    : { ok: false, reason: "redirect-unposted", note: `${name} is <strong>unprepared</strong> — the -${amount} supply goes to another suffer move: make one on the sheet` };
}

/**
 * After a rider's supply loss: mark unprepared when the supply is now 0, and
 * say so (null when the supply is left above 0). Never throws — the loss has
 * landed either way, as Repair's supply trade has.
 *
 * @param {Actor} actor
 * @returns {Promise<string|null>} HTML
 */
async function markIfExhausted(actor) {
  invalidateActorCache(actor.id);
  if ((readCharacterSnapshot(actor)?.meters?.supply ?? 0) > 0) return null;
  const name = escapeHtml(actor.name ?? "The character");
  try {
    const marks = await markUnprepared(actor);
    const crew  = crewUnpreparedNote(marks);
    const own   = marks.unpreparedMarked ? `Out of supply — ${name} is marked <strong>unprepared</strong>` : "";
    return [own, crew].filter(Boolean).join("; ") || null;
  } catch (err) {
    console.warn(`${MODULE_ID} | consequenceRiders: marking ${actor.name ?? actor.id} unprepared failed:`, err?.message ?? err);
    return `Out of supply, but ${name} could not be marked unprepared — mark it on the sheet`;
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/**
 * The ship's summed integrity delta, as one write, through the ship record's
 * integrity writer: a rise is refused while the vehicle is battered (issue
 * #315 S05 — this path wrote the value directly, so a battered ship at 0
 * gained integrity), and updateShip keeps it within 0..max.
 */
async function writeShipIntegrity(shipActorId, delta) {
  const { getShip, changeIntegrity } = await import("../entities/ship.js");
  if (!shipActorId || !getShip(shipActorId)) return { ok: false, reason: "no-vehicle" };
  if (!delta) return { ok: true };
  const { ok, reason, error, name } = await changeIntegrity(shipActorId, delta);
  if (reason === "refused") console.warn(`${MODULE_ID} | consequenceRiders: integrity write on ${name ?? shipActorId} failed:`, error);
  return ok ? { ok } : { ok, reason, ...(error ? { error } : {}) };
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
  '  "option":    the name of the "choose one" option it belongs to, as the text names it (e.g. "Pin them down"), else null,',
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
 * @param {boolean} [args.inFight] — a fight is open: an Aid Your Ally is made as Gain Ground
 * @param {Function} [args._call] — injectable transport for tests
 * @returns {Promise<Array>}
 */
export async function extractRiders({ abilities, moveName, apiKey, inFight = false, _call = callHaikuExtract }) {
  if (!apiKey) return [];
  const list = (abilities ?? []).filter(a => a && a.text);
  if (!list.length) return [];

  // A scene-challenge variant's riders are its ordinary move's: "When you
  // Face Danger …" holds within the challenge (SCENE-VARIANT-ABILITIES-UNKEYED).
  // Aid Your Ally's are its own and those of the move it is made as (issue
  // #345 AA11).
  const move = assetMatchMove({ moveName, inFight });
  const userPrompt =
    `Move: ${move.moveName}${move.madeAs ? ` (made as ${move.madeAs.moveName})` : ""}\n\nAbilities:\n` +
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
    max_tokens: 920,   // was 700 — Haiku 5.5 counts the same text as about 30% more tokens than Haiku 4.5
    system:     [{ type: "text", text: EXTRACT_SYSTEM }],
    messages:   [{ role: "user", content: userPrompt }],
  };
  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
  };
  const data = await apiPost(ANTHROPIC_URL, headers, body, { label: "consequenceRiders" });
  return (data?.content ?? []).filter(b => b?.type === "text").map(b => b.text).join("");
}
