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
 * Adds extraction is regex-based ("add +1", "+2", etc.). An add naming a
 * value the module holds is resolved to its number: "add +heart" from the
 * roller's sheet, "add +its health" from the companion asset's own track
 * (issue #336 Y22 — the confirm dialog has no adds input, issue #322 V02),
 * "add +integrity" from the vehicle asset's (the Hoverbike —
 * VALUE-ADD-INTEGRITY).
 * When no add is found — or it names a value the module does not hold
 * ("+cargo", "add that amount") — the ability still surfaces with zero adds
 * and its text is shown.
 *
 * Asset sources:
 *   - Character actor: paths, companions, deeds, support vehicles
 *     (all stored as `asset`-typed Items, distinguished by
 *      system.category).
 *   - Command vehicle starship actor: modules (also `asset`-typed
 *     Items, on a different Actor).
 */

import { apiPost } from "../api-proxy.js";
import { moveRollKind } from "../schemas.js";
import { listShips, isLoneShipCandidate } from "../entities/ship.js";
import { readCharacterSnapshot, readCompanionHealth, readAssetIntegrity } from "../character/actorBridge.js";
import { assetMatchMove } from "./sceneChallenge.js";

const MODULE_ID    = "starforged-companion";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL  = "claude-haiku-5-5";

// Categories surfaced from the character actor. The system uses these
// (capitalised) on asset.system.category. We accept any non-empty
// category — the list is for display, not filtering.
const KNOWN_CHARACTER_CATEGORIES = [
  "Path", "Companion", "Deed", "Support Vehicle", "Combat Talent", "Ritual",
];

const MAX_ABILITY_TEXT_CHARS = 600;

// What an asset ability may let a move roll instead of its listed stat: the
// five action stats (Empath's "roll +heart in place of the listed stat") and
// the meters the vendored assets name — the roller's +supply (Trader on
// Sojourn / Compel, Weapon Master) and +spirit (Seer, Empath), a vehicle's
// +integrity (Rover, Skiff, Snub Fighter, Service Pod, Overseer, Sensor
// Array, Ace) and a companion's "+its health" (Banshee, Combat Bot, Survey
// Bot, Utility Bot; Sidekick's "+their health"), read as companion_health. A
// code comment here once ruled the meters out — "they never substitute" —
// against the text: an asset substitutes where it says so (issue #331 X23),
// and the confirm dialog has no stat picker, so the ability's roll could
// never be made (issue #345 AA10). A vehicle's or companion's own track is
// read for its roll (statEnrichment, `statSubstitutedAssetId`).
const SUBSTITUTABLE_STATS = ["edge", "heart", "iron", "shadow", "wits", "supply", "spirit", "integrity", "companion_health"];

// How an ability's text names each one it may be rolled with: a companion's
// health is "+its health" / "+their health".
const STAT_CUE = Object.freeze({ companion_health: "(?:its|their)\\s+health" });

/** The stat a cue in ability text names ("Heart" → "heart", "its health" → "companion_health"). */
function statNamed(cue) {
  const s = String(cue ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  return s === "its health" || s === "their health" ? "companion_health" : s;
}


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
        // Per-ability clock (foundry-ironsworn AssetAbilityField) — the cost
        // some post-roll abilities pay (e.g. Fugitive's 4-segment clock).
        hasClock:      !!ab.hasClock,
        clockTicks:    Number(ab.clockTicks ?? 0),
        clockMax:      Number(ab.clockMax ?? 4),
        // A "choose one"'s options, by name (issue #345 AA12).
        options:       choiceOptions(ab.description),
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

/**
 * The options of an ability's "choose one": the items of the list after a
 * "choose …" in its HTML ("choose one (before rolling)", "choose an
 * approach"), each "Name: text" — Gunner's "Pin them down: Add +1 and take +1
 * momentum on a hit." and "Make them hurt: Mark progress on a hit." Text is
 * HTML-stripped with its move links kept. [] for an ability with none (a list
 * of outcomes is no choice: Veteran's "On a strong hit with a match, …").
 *
 * @param {string} html — the ability's description
 * @returns {Array<{ name: string, text: string }>}
 */
function choiceOptions(html) {
  const s = String(html ?? "");
  const at = s.search(/<ul\b/i);
  if (at < 0 || !/\bchoose\b/i.test(stripHtml(s.slice(0, at)))) return [];
  const end = s.indexOf("</ul>", at);
  return [...s.slice(at, end < 0 ? undefined : end).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map(m => stripHtml(m[1]))
    .map(item => {
      const colon = item.indexOf(":");
      return colon > 0 && colon <= 40 ? { name: item.slice(0, colon).trim(), text: item.slice(colon + 1).trim() } : null;
    })
    .filter(Boolean);
}

/**
 * A "choose one" the ability's add settles before the roll (issue #345 AA12):
 * the add is one option's — Gunner's "Pin them down: Add +1 and take +1
 * momentum on a hit" against "Make them hurt: Mark progress on a hit";
 * Navigator's "Follow the safest path: Add +1"; Service Pod's "Careful: Add +2
 * and Lose Momentum (-1)". Taking the add is choosing that option: its other
 * effects are the outcome's, and the other options are not offered again
 * after the roll (consequenceRiders.settlePreRollChoices). Null when the add
 * is not an option's — the ability's lead gives it (Bounty Hunter's "add +1
 * … and choose one"), or no option, or more than one, carries an add.
 *
 * @param {Object} ab — a collectEnabledAbilities entry (`text`, `options`)
 * @param {Object} values — heldValuesFor's
 * @returns {{ option: string, options: string[] }|null}
 */
function preRollChoiceOf(ab, values) {
  const options = Array.isArray(ab?.options) ? ab.options : [];
  if (options.length < 2) return null;
  const hasAdd = (text) => String(text ?? "").split(/(?<=[.!?])\s+/)
    .some(sentence => clausesOf(sentence).some(c => firstAddIn(c.text, values).add > 0));
  const text = String(ab.text ?? "");
  const lead = text.slice(0, Math.max(0, text.indexOf(`${options[0].name}:`)));
  if (hasAdd(lead)) return null;
  const adding = options.filter(o => hasAdd(o.text));
  return adding.length === 1 ? { option: adding[0].name, options: options.map(o => o.name) } : null;
}


// ─────────────────────────────────────────────────────────────────────────────
// DETECTION — STRUCTURED PASS
// ─────────────────────────────────────────────────────────────────────────────

const MOVE_LINK = /@Compendium\[[^\]]*\]\{([^}]+)\}/g;

/**
 * True when a move link names its move as a COST of another trigger, not as
 * a move the ability applies to (issue #329 X04): "… take +2 fire but
 * [Endure Harm] (-2)", "On a weak hit, also [Endure Stress] (-1)", "the
 * augment is broken; you must [Repair] and spend 3 repair points". A "must"
 * in a trigger's own condition names the trigger: "When you must [Endure
 * Harm], you may instead let your armor take the hit" (Armored), "When you
 * … must [Endure Stress], you may …" (Survivor).
 *
 * @param {string} text
 * @param {number} index — the link's offset in `text`
 * @param {number} length — the link's length
 * @returns {boolean}
 */
function isCostMention(text, index, length) {
  if (/^\s*\(\s*-\s*\d/.test(text.slice(index + length, index + length + 8))) return true;
  if (!/\b(?:must|also)\s+$/i.test(text.slice(Math.max(0, index - 8), index))) return false;
  // The clause the link sits in (a link's compendium id holds dots, so ids
  // are dropped before looking for the clause's start).
  const head   = text.slice(0, index).replace(/@Compendium\[[^\]]*\]/g, "@");
  const clause = head.slice(head.search(/[.!?;][^.!?;]*$/) + 1);
  return !(/^\s*(?:when|if)\b/i.test(clause) && !clause.includes(","));
}

/**
 * The moves a text names as moves it applies to: its `@Compendium[…]{Move}`
 * links, normalised, less the cost mentions (isCostMention).
 *
 * @param {string} text
 * @returns {string[]}
 */
function namedMoves(text) {
  const s = String(text ?? "");
  return [...s.matchAll(MOVE_LINK)]
    .filter(m => !isCostMention(s, m.index, m[0].length))
    .map(m => normaliseName(m[1]));
}

/**
 * Find abilities that explicitly reference the chosen move via a
 * `@Compendium[…]{MoveName}` link. Display-name match is
 * case-insensitive and ignores punctuation/whitespace. A link that names the
 * move only as the cost of another trigger — Firebrand's "On a miss, take +2
 * fire but Endure Harm (-2)", Haunted's "also Endure Stress (-1)",
 * Augmented's "you must Repair" — does not key the ability to it: their add
 * is another move's, and it was offered pre-checked (issue #329 X04).
 *
 * @param {Array} abilities — output of collectEnabledAbilities
 * @param {string} moveName — display name e.g. "Gather Information"
 * @returns {Array} subset of abilities whose text references this move
 */
export function structuredMatches(abilities, moveName) {
  const target = moveTarget(moveName);
  if (!target) return [];
  // Stored text has already had HTML stripped; @Compendium tokens survive.
  return abilities.filter(ab => namedMoves(ab.text).includes(target));
}

function normaliseName(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The normalised name an ability's move links are matched against for the
 * move being made: a scene-challenge variant's is the ordinary move's —
 * "Face Danger (Scene Challenge)" matches an ability linked to Face Danger
 * (sceneChallenge.assetMatchMove — SCENE-VARIANT-ABILITIES-UNKEYED).
 *
 * @param {string|null} moveName
 * @returns {string}
 */
function moveTarget(moveName) {
  return normaliseName(assetMatchMove({ moveName }).moveName);
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
 * @param {{ _call?: Function, madeAs?: { moveId: string, moveName: string }|null }} [opts] — `madeAs`:
 *   the move an Aid Your Ally is made as (sceneChallenge.assetMatchMove), named to the model
 * @returns {Promise<Array<{key, summary}>>}
 */
export async function haikuFallback(abilities, moveId, moveName, narration, apiKey, { _call = callHaiku, madeAs = null } = {}) {
  if (!apiKey || !abilities.length) return [];

  const prompt = buildHaikuPrompt(abilities, moveId, moveName, narration, madeAs);
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
    .map(({ key, summary, statReplacement }) => {
      const ab = byKey.get(key);
      if (!ab) return null;
      return {
        ...ab,
        summary:         summary ?? "",
        // Prefer the LLM's read when present; fall back to regex on the
        // ability text so structured-match abilities also get a clean signal.
        statReplacement: statReplacement ?? extractStatReplacement(ab.text, moveName),
      };
    })
    .filter(Boolean);
}

function buildHaikuPrompt(abilities, moveId, moveName, narration, madeAs = null) {
  const list = abilities.map(a => (
    `- key="${a.key}" asset="${a.assetName}" category="${a.category}" ability="${a.abilityName || "(unnamed)"}"\n  text: ${a.text}`
  )).join("\n");
  return [
    `You are scanning a Starforged player character's asset abilities to decide which (if any) apply to the move they are about to roll.`,
    ``,
    `Chosen move: ${moveName} (id: ${moveId})${madeAs ? `, made as ${madeAs.moveName} (id: ${madeAs.moveId}) — an ability for either move applies` : ""}`,
    `Player narration: "${narration}"`,
    ``,
    `Enabled abilities:`,
    list,
    ``,
    `Return ONLY a JSON object of the form:`,
    `{ "matches": [ { "key": "<ability key>", "summary": "<one short sentence: what the ability does for this move>", "statReplacement": "<one of ${SUBSTITUTABLE_STATS.join("|")}, or null>" }, ... ] }`,
    ``,
    `Rules:`,
    `- Include an ability only when its trigger condition genuinely applies to this move and this narration.`,
    `- Do NOT include abilities whose trigger is unrelated (e.g. an "Endure Harm" ability when the move is "Gather Information").`,
    `- "matches" may be an empty array. Prefer false negatives over false positives.`,
    `- statReplacement: set ONLY when the ability text explicitly lets the player roll a different stat or meter than the move's listed one (e.g. Empath's "roll +heart in place of the listed stat", Trader's "you may roll +supply", a vehicle's "roll +integrity"); a companion's "+its health" is companion_health. Otherwise return null. Numeric +N adds are reported via the adds extractor, not here.`,
    `- Output JSON only, no prose, no markdown fences.`,
  ].join("\n");
}

export function parseHaikuResponse(raw) {
  if (!raw) return [];
  try {
    const stripped = String(raw).replace(/```(?:json)?|```/g, "").trim();
    // Haiku occasionally appends a trailing sentence after the JSON object
    // (despite "JSON only" in the prompt), which made JSON.parse throw
    // "Unexpected non-whitespace character after JSON". Slice to the
    // outermost {...} so trailing prose can't break the parse.
    const first = stripped.indexOf("{");
    const last  = stripped.lastIndexOf("}");
    const cleaned = (first >= 0 && last > first) ? stripped.slice(first, last + 1) : stripped;
    const parsed = JSON.parse(cleaned);
    const arr = Array.isArray(parsed?.matches) ? parsed.matches : [];
    return arr
      .filter(m => m && typeof m.key === "string")
      .map(m => ({
        key:             m.key,
        summary:         String(m.summary ?? "").trim(),
        statReplacement: SUBSTITUTABLE_STATS.includes(m.statReplacement) ? m.statReplacement : null,
      }));
  } catch (err) {
    console.warn(`${MODULE_ID} | abilityScanner: Haiku JSON parse failed:`, err.message);
    return [];
  }
}

async function callHaiku(userPrompt, apiKey) {
  const body = {
    model:      HAIKU_MODEL,
    max_tokens: 800,   // was 600 — Haiku 5.5 counts the same text as about 30% more tokens than Haiku 4.5
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
 * @param {boolean} [args.inFight] — a fight is open: an Aid Your Ally is made as Gain Ground
 * @returns {Promise<Array<{ key, assetName, category, source, abilityName, summary, text, adds, detection }>>}
 */
export async function scanForApplicableAbilities({
  moveId, moveName, narration, characterActor, commandShipActor, apiKey, inFight = false,
}) {
  const all = collectEnabledAbilities(characterActor, commandShipActor);
  if (!all.length) return [];

  // A scene-challenge variant is scanned as the ordinary move it varies — its
  // links, its Haiku pass, its adds and stat (SCENE-VARIANT-ABILITIES-UNKEYED).
  // Aid Your Ally is scanned as itself and as the move it is made as: an
  // ability is matched, and its add and stat read, for the move its links
  // name — Loyalist's for the aid, Veteran's for its Secure an Advantage
  // (issue #345 AA11).
  const move  = assetMatchMove({ moveId, moveName, inFight });
  const moves = move.madeAs ? [move, move.madeAs] : [move];
  const keyedTo = new Map();
  for (const m of moves) {
    for (const ab of structuredMatches(all, m.moveName)) if (!keyedTo.has(ab.key)) keyedTo.set(ab.key, m);
  }
  if (keyedTo.size > 0) {
    return all.filter(ab => keyedTo.has(ab.key)).map(ab => {
      const m = keyedTo.get(ab.key);
      return annotate("structured", m.moveName, m.moveId, characterActor)(ab);
    });
  }

  const llm = await haikuFallback(all, move.moveId, move.moveName, narration, apiKey, { madeAs: move.madeAs });
  return llm.map(annotate("haiku", move.moveName, move.moveId, characterActor));
}

/**
 * The values an ability's add may name that the module holds (issue #336
 * Y22): the roller's stats (Bonded's "add +heart") and, for an asset on the
 * character, that asset's own condition track — a companion's health
 * (Glowcat's "add +its health", readCompanionHealth) or a vehicle's integrity
 * (the Hoverbike's "add +integrity", readAssetIntegrity —
 * VALUE-ADD-INTEGRITY). A command vehicle's module has neither of its own
 * here.
 *
 * @param {Object} ab — a collectEnabledAbilities entry
 * @param {Actor|null} characterActor — the roller
 * @returns {{ stats: Object|null, ownHealth: number|null, ownIntegrity: number|null }}
 */
function heldValuesFor(ab, characterActor) {
  const own = ab.source === "character" && ab.assetId;
  return {
    stats:        readCharacterSnapshot(characterActor)?.stats ?? null,
    ownHealth:    own ? readCompanionHealth(characterActor, ab.assetId) : null,
    ownIntegrity: own ? readAssetIntegrity(characterActor, ab.assetId) : null,
  };
}

function annotate(detection, moveName = null, moveId = null, characterActor = null) {
  // A stat substitution replaces an action roll's stat: a progress move, a
  // no-roll move or a suffer move with none listed has no stat to replace
  // (Outcast's "When you Sacrifice Resources …, roll +wits" is its own roll —
  // issue #331 X23).
  const rollsAStat = !moveId || moveRollKind(moveId) === "action";
  return (ab) => {
    const values = heldValuesFor(ab, characterActor);
    const add    = extractAdds(ab.text, moveName, values);
    const found  = add > 0 ? addFor(ab.text, moveName, values) : null;
    const from   = found?.from ?? null;
    return {
      key:             ab.key,
      assetName:       ab.assetName,
      category:        ab.category,
      source:          ab.source,
      abilityName:     ab.abilityName,
      summary:         ab.summary ?? "",
      text:            ab.text,
      adds:            add,
      // What the add is, when the text names a value the sheet holds — "heart",
      // "its health" — for the confirm dialog's label (issue #336 Y22).
      addsFrom:        from,
      // Taking the add counts a weak hit as a miss (the Hoverbike's
      // afterburner): the confirm dialog shows it beside the add, and the
      // roll applies it when the ability is checked (resolveMove —
      // HOVERBIKE-WEAK-AS-MISS-UNAPPLIED).
      weakHitAsMiss:   !!found?.weakHitAsMiss,
      // The add is one option of a "choose one": taking it (the ability
      // checked) is that choice, made before the roll — its riders are
      // settled by it (consequenceRiders.settlePreRollChoices, issue #345 AA12).
      preRollChoice:   add > 0 ? preRollChoiceOf(ab, values) : null,
      // The Haiku path already populated statReplacement on its return shape;
      // the structured path lands here with no such field, so derive it from
      // the ability text via the regex fallback.
      statReplacement: rollsAStat ? (ab.statReplacement ?? extractStatReplacement(ab.text, moveName)) : null,
      // Post-roll outcome improvement (v1.7.11 finding G) + the per-ability
      // clock that is its cost. Pass these through so the post-roll affordance
      // (improveResult.js) can offer the upgrade and advance the right clock.
      resultImprovement: extractResultImprovement(ab.text),
      hasClock:        !!ab.hasClock,
      clockTicks:      Number(ab.clockTicks ?? 0),
      clockMax:        Number(ab.clockMax ?? 4),
      assetId:         ab.assetId ?? (typeof ab.key === "string" ? ab.key.split(":")[0] : null),
      abilityIndex:    Number.isInteger(ab.abilityIndex)
        ? ab.abilityIndex
        : (typeof ab.key === "string" ? Number(ab.key.split(":")[1]) : null),
      detection,
    };
  };
}

/**
 * Detect a post-roll "improve the result" ability (v1.7.11 finding G).
 * Fugitive: "you may improve the result to a strong hit." The cost (filling a
 * clock) is carried separately via the ability's hasClock/clockMax. Returns
 * the target outcome to upgrade to and the result it improves `from` (null:
 * any result below it), or null when the text doesn't offer one.
 *
 * "Improve … to a strong hit" improves any lower result. "Count (or treat) a
 * weak hit as a strong hit" — Brawler, Heavy Cannons, Rockhorn, Demolitionist,
 * Engine Upgrade — improves a WEAK HIT only (`from: "weak_hit"`): read like
 * Fugitive's, it turned a miss into a strong hit at no cost, two steps, the
 * miss's Pay the Price undone (issue #325 W13). Conservative on purpose: never
 * fires on adds/reroll abilities.
 *
 * @param {string} text — plain-text ability description
 * @returns {{ improveTo: "strong_hit", from: "weak_hit"|null }|null}
 */
export function extractResultImprovement(text) {
  const t = String(text ?? "").toLowerCase();
  if (/\bimprove\b[^.]*\bto a strong hit\b/.test(t)) return { improveTo: "strong_hit", from: null };
  if (/\b(?:count|treat)\b[^.]*\bas a strong hit\b/.test(t)) return { improveTo: "strong_hit", from: "weak_hit" };
  return null;
}

/**
 * The stat an ability lets the player roll for THIS move instead of the
 * move's listed one, or null. "A typed move rolls a stat it lists": the book
 * lets a player roll another stat only when the ability says so for the move
 * being made — Stealth Tech's "When you are poised to Strike from hiding, you
 * may roll +shadow", Vanguard's "When you Endure Stress, you may roll +wits",
 * Scavenger's "When you Check Your Gear, roll +wits or +supply".
 *
 * Read per sentence (issue #331 X23 — any "roll +<stat>" in the ability was a
 * substitution for whatever move matched it: Archer's "To replenish your ammo
 * by crafting projectiles, roll +wits" put a +wits radio on Strike, and Engine
 * Upgrade's "(+edge) … take +2 momentum instead of +1" — "(+edge)" is the
 * condition — offered +edge on Undertake an Expedition):
 *   - the sentence that names the move being made (its `@Compendium[…]{Move}`
 *     link): "roll +<stat>" in it is that move's roll;
 *   - a later sentence that names no move belongs to it, but only an explicit
 *     cue counts there — "may roll +<stat>", "roll +<stat> instead / in place
 *     of", "use +<stat> instead / in place of";
 *   - a sentence naming another move belongs to that move.
 * An ability that names no move at all (a general trigger matched by the
 * fallback pass) takes an explicit cue only: a bare "roll +heart" there is the
 * ability's own roll with its own outcomes (Empath, Shade, Sniper), not this
 * move's. A cost mention ("Lose Momentum (-1)") names no move (namedMoves).
 * Numeric +N adds are extractAdds'.
 *
 * A meter is offered as an action stat is (issue #345 AA10): Trader's "When
 * you Sojourn or Compel, you may roll +supply", Seer's "Gather Information …,
 * roll +spirit", the Snub Fighter's "When you Enter the Fray, you may roll
 * +integrity", Survey Bot's "Face Danger …, roll +its health"
 * (companion_health).
 *
 * @param {string} text — the ability's text (HTML stripped, links kept)
 * @param {string|null} [moveName] — the move being made ("Strike")
 * @returns {"edge"|"heart"|"iron"|"shadow"|"wits"|"supply"|"spirit"|"integrity"|"companion_health"|null}
 */
export function extractStatReplacement(text, moveName = null) {
  const s = String(text ?? "");
  if (!s.trim()) return null;
  const stat     = `(${SUBSTITUTABLE_STATS.map(name => STAT_CUE[name] ?? name).join("|")})\\b`;
  const explicit = new RegExp(`\\bmay\\s+(?:roll|use)\\s+\\+${stat}|\\b(?:roll|use)\\s+\\+${stat}\\s+(?:instead|in\\s+place\\s+of)`, "i");
  const bare     = new RegExp(`\\broll\\s+\\+${stat}`, "i");
  const cued     = (sentence, re) => { const m = sentence.match(re); return m ? statNamed(m[1] ?? m[2]) : null; };

  const target    = moveTarget(moveName);
  const sentences = s.split(/(?<=[.!?])\s+/);
  // With no move named anywhere, the ability's own sentences are the move's.
  let own = !sentences.some(sentence => namedMoves(sentence).length);
  for (const sentence of sentences) {
    const moves = namedMoves(sentence);
    if (moves.length) {
      own = !!target && moves.includes(target);
      if (own) {
        const hit = cued(sentence, explicit) ?? cued(sentence, bare);
        if (hit) return hit;
      }
      continue;
    }
    if (!own) continue;
    const hit = cued(sentence, explicit);
    if (hit) return hit;
  }
  return null;
}

/**
 * The add an ability gives the move being made: "add +N" or "+N add".
 * Returns 0 when no clause gives one — the ability still surfaces in the
 * dialog, but contributes nothing to the roll.
 *
 * An ability's text holds several clauses for different triggers or later
 * rolls, and every "add +N" in it used to be summed (issue #325 W12):
 * Gunner's "When you Clash with it, add +1. When you Enter the Fray … add +1"
 * gave a Clash +2; Diplomat's "add +1 … reroll all dice, and add +2" gave +3;
 * Stealth Tech's "add +1 on your next Strike" landed on this Strike. Now:
 *   1. the first add in a clause that names the move (its
 *      `@Compendium[…]{Move}` link), else
 *   2. the first add in a clause that names no move — a general trigger
 *      ("When you make a move to defuse …") — or, with no move given, the
 *      first add at all.
 * A clause is a sentence, or its part between semicolons or before a
 * mid-sentence "if you <Move>" (clausesOf): Combat Bot's "When you Strike
 * aided by the bot, add +1; if you Clash, take +1 momentum on a hit" is the
 * Strike's +1 and the Clash's momentum — read as one sentence, the Clash was
 * offered the Strike's +1 (issue #336 Y15).
 * An add "on your next …" is for a later roll and never counted here. When
 * the move being made is the ability's own trigger, neither is an add in an
 * outcome's sentence: Scavenger's "When you Secure an Advantage to cobble
 * together … On a hit, you may add +1 when making a move aided by the item"
 * is for the moves the item later aids, not the Secure an Advantage (issue
 * #329 X04). A move named only as a cost ("… and Lose Momentum (-1)") does
 * not make a sentence another move's: Service Pod's "Careful: Add +2 and
 * Lose Momentum (-1)" is its trigger's add.
 *
 * An add may name a value the module holds instead of a number (issue #336
 * Y22): "add +heart" is the roller's heart (Bonded's Set a Course home), "add
 * +its health" the ability's own companion's health (Glowcat, Sprite,
 * Symbiote), "add +integrity" its own vehicle's integrity (the Hoverbike —
 * VALUE-ADD-INTEGRITY) — resolved from `values` (the scanner passes the
 * roller's snapshot stats and the asset's track, heldValuesFor). Unresolved — no
 * value given, or one the module does not hold ("+cargo", "add that
 * amount") — it adds nothing and the text stays on the dialog. "Add +wits
 * instead of +integrity" (Tech) swaps a stat on a reroll; it is no add. A
 * value is a general trigger's only when the ability names the move nowhere
 * (the fallback pass's match): keyed to the move by a link elsewhere, it is
 * another trigger's — Symbiote's "When you make aggressive moves …, add +its
 * health" is not its "choose either the Endure Harm or Companion Takes a Hit
 * move".
 *
 * Skips momentum / fire / heat references — those are resource changes,
 * not roll modifiers.
 *
 * @param {string} text — the ability's text (HTML stripped, links kept)
 * @param {string|null} [moveName] — the move being made ("Clash")
 * @param {{ stats?: Object|null, ownHealth?: number|null, ownIntegrity?: number|null }} [values] — what a
 *   value add resolves to: the roller's stats, the asset's own health or integrity
 * @returns {number}
 */
export function extractAdds(text, moveName = null, values = {}) {
  return addFor(text, moveName, values).add;
}

/**
 * extractAdds' add and what it names ("heart", "its health", "integrity";
 * null for a number) — the scanner's offer and the confirm dialog's label.
 *
 * @param {string} text
 * @param {string|null} moveName
 * @param {{ stats?: Object|null, ownHealth?: number|null, ownIntegrity?: number|null }} [values]
 * @returns {{ add: number, from: string|null }}
 */
function addFor(text, moveName = null, values = {}) {
  const target = moveTarget(moveName);
  const ownTrigger = !!target && namedMoves(text).includes(target);
  const sentences = String(text ?? "").split(/(?<=[.!?])\s+/);
  const clauses = sentences.flatMap((sentence, at) => {
    const outcome = ownTrigger && OUTCOME_SENTENCE.test(sentence);
    return clausesOf(sentence).map(clause => ({
      moves: clause.moves,
      at,
      ...(outcome ? NO_ADD : firstAddIn(clause.text, values)),
    }));
  }).filter(c => c.add > 0);
  const offer = (c) => (c ? { add: c.add, from: c.from, weakHitAsMiss: takingCostsWeakHit(sentences, c.at) } : NO_ADD);
  if (target) {
    const own = clauses.find(c => c.moves.includes(target));
    if (own) return offer(own);
    return offer(clauses.find(c => !c.moves.length && !(c.from && ownTrigger)));
  }
  return offer(clauses[0]);
}

const NO_ADD = Object.freeze({ add: 0, from: null });

const WEAK_HIT_AS_MISS = /\bcount\s+a\s+weak\s+hit\s+as\s+a\s+miss\b/i;

/**
 * True when taking the add in sentence `at` counts a weak hit as a miss: that
 * sentence says so, or the next, opening "If you do". The Hoverbike's
 * afterburner — "you may add +integrity and take +2 momentum on a strong hit.
 * If you do, count a weak hit as a miss." — was offered as a free add
 * (HOVERBIKE-WEAK-AS-MISS-UNAPPLIED).
 *
 * @param {string[]} sentences
 * @param {number} at
 * @returns {boolean}
 */
function takingCostsWeakHit(sentences, at) {
  if (WEAK_HIT_AS_MISS.test(sentences[at] ?? "")) return true;
  const next = sentences[at + 1] ?? "";
  return /^\s*if\s+you\s+do\b/i.test(next) && WEAK_HIT_AS_MISS.test(next);
}

/** A sentence about the trigger roll's outcome — "On a hit, …", "On a strong hit with a match, …": its adds are for later rolls. */
const OUTCOME_SENTENCE = /^\s*on\s+a\s+(?:strong\s+|weak\s+)?(?:hit|miss)\b/i;

/**
 * One sentence's clauses, each with the moves it names: the sentence splits at
 * ";" and before a mid-sentence "if you <Move>" — a second trigger in the same
 * sentence (issue #336 Y15). A clause naming no move continues the one before
 * it: Explorer's "… Soak it all in: Hearten; add +1, and take +1 momentum on a
 * hit" is Hearten's add.
 *
 * @param {string} sentence
 * @returns {Array<{ text: string, moves: string[] }>}
 */
function clausesOf(sentence) {
  const out = [];
  let moves = [];
  for (const text of String(sentence ?? "").split(/;\s*|\s+(?=if\s+you\s+@Compendium\[)/i)) {
    if (!text.trim()) continue;
    const own = namedMoves(text);
    if (own.length) moves = own;
    out.push({ text, moves });
  }
  return out;
}

/**
 * The first add in one clause that is not for a later roll ("… on your next
 * Strike"): "add +N" (1–5), or a value the module holds — "add +<stat>", "add
 * +its health", "add +integrity" — resolved from `values` (an unresolved one
 * is passed over, as before it was never read). `from` names the value; null
 * for a number.
 *
 * @param {string} clause
 * @param {{ stats?: Object|null, ownHealth?: number|null, ownIntegrity?: number|null }} [values]
 * @returns {{ add: number, from: string|null }}
 */
function firstAddIn(clause, values = {}) {
  const pattern = /(?:\badds?\s+\+?(\d+)|\+(\d+)\s+add|\badds?\s+\+(its\s+health|integrity|edge|heart|iron|shadow|wits)\b)/gi;
  let m;
  while ((m = pattern.exec(clause)) !== null) {
    const rest = clause.slice(m.index + m[0].length).split(/[,;]/)[0];
    if (/\bnext\b/i.test(rest)) continue;
    if (m[3]) {
      if (/^\s*(?:instead|in\s+place)\b/i.test(rest)) continue;   // a stat swapped on a reroll, not an add
      const from = m[3].toLowerCase().replace(/\s+/g, " ");
      const n = Number(from === "its health" ? values?.ownHealth
        : from === "integrity" ? values?.ownIntegrity
        : values?.stats?.[from]);
      if (Number.isFinite(n) && n > 0) return { add: n, from };
      continue;
    }
    const n = Number(m[1] ?? m[2] ?? 0);
    if (!(n > 0 && n <= 5)) continue;
    return { add: n, from: null };
  }
  return NO_ADD;
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
    if (!ship) {
      // Lone-ship fallback: a single tracked starship is the command vehicle
      // even when nothing has set the isCommandVehicle flag yet. A confirmed
      // NPC ship is never a candidate (issue #321 U26).
      const starships = ids
        .map(id => globalThis.game?.actors?.get?.(id))
        .filter(a => a?.type === "starship" && isLoneShipCandidate(a.flags?.[MODULE_ID]?.ship));
      return starships.length === 1 ? starships[0] : null;
    }
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
