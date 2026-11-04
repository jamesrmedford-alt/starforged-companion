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
import { listShips, isLoneShipCandidate } from "../entities/ship.js";

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

// Stats that an asset ability may substitute for the listed move stat
// (e.g. Empath's "roll +heart in place of the listed stat"). Only the five
// canonical stats are valid substitutions per the play kit — supply /
// integrity / health / spirit / companion_health are situational stats
// scoped to specific moves and never substitute.
const SUBSTITUTABLE_STATS = ["edge", "heart", "iron", "shadow", "wits"];


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
  const target = normaliseName(moveName);
  if (!target) return [];
  // Stored text has already had HTML stripped; @Compendium tokens survive.
  return abilities.filter(ab => namedMoves(ab.text).includes(target));
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
    .map(({ key, summary, statReplacement }) => {
      const ab = byKey.get(key);
      if (!ab) return null;
      return {
        ...ab,
        summary:         summary ?? "",
        // Prefer the LLM's read when present; fall back to regex on the
        // ability text so structured-match abilities also get a clean signal.
        statReplacement: statReplacement ?? extractStatReplacement(ab.text),
      };
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
    `{ "matches": [ { "key": "<ability key>", "summary": "<one short sentence: what the ability does for this move>", "statReplacement": "<one of edge|heart|iron|shadow|wits, or null>" }, ... ] }`,
    ``,
    `Rules:`,
    `- Include an ability only when its trigger condition genuinely applies to this move and this narration.`,
    `- Do NOT include abilities whose trigger is unrelated (e.g. an "Endure Harm" ability when the move is "Gather Information").`,
    `- "matches" may be an empty array. Prefer false negatives over false positives.`,
    `- statReplacement: set to one of the five stats ONLY when the ability text explicitly lets the player roll a different stat than the move's listed one (e.g. Empath's "roll +heart in place of the listed stat"). Otherwise return null. Numeric +N adds are reported via the adds extractor, not here.`,
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
    return structured.map(annotate("structured", moveName));
  }

  const llm = await haikuFallback(all, moveId, moveName, narration, apiKey);
  return llm.map(annotate("haiku", moveName));
}

function annotate(detection, moveName = null) {
  return (ab) => ({
    key:             ab.key,
    assetName:       ab.assetName,
    category:        ab.category,
    source:          ab.source,
    abilityName:     ab.abilityName,
    summary:         ab.summary ?? "",
    text:            ab.text,
    adds:            extractAdds(ab.text, moveName),
    // The Haiku path already populated statReplacement on its return shape;
    // the structured path lands here with no such field, so derive it from
    // the ability text via the regex fallback.
    statReplacement: ab.statReplacement ?? extractStatReplacement(ab.text),
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
  });
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
 * Best-effort stat-substitution extraction. Looks for patterns that signal
 * the ability lets the player roll a different stat than the move's
 * listed one (e.g. Empath: "you may roll +heart in place of the listed
 * stat"). Returns one of the five canonical stat keys
 * (edge / heart / iron / shadow / wits) or null when nothing matches.
 *
 * Patterns recognised:
 *   - "roll +<stat>"                  → Empath's classic phrasing
 *   - "roll +<stat> instead"
 *   - "roll +<stat> in place of"
 *   - "may roll +<stat>"
 *   - "use +<stat> in place of"
 *   - "use <stat> instead"
 *
 * Numeric +N adds are reported by extractAdds — those are roll modifiers,
 * not stat replacements.
 */
export function extractStatReplacement(text) {
  const s = String(text ?? "").toLowerCase();
  if (!s) return null;
  const statRe = SUBSTITUTABLE_STATS.join("|");
  // Cue + "+stat" form — the leading + is what distinguishes a substitute
  // from a casual mention ("heart of the matter"). Strict order of cues
  // matters: longer cues first so "in place of" beats "place".
  const cued = new RegExp(
    `(?:roll|use|may\\s+roll|may\\s+use)\\s+\\+?(${statRe})\\b(?:\\s+(?:instead|in\\s+place\\s+of))?`,
    "i",
  );
  const cuedMatch = s.match(cued);
  if (cuedMatch) return cuedMatch[1];
  // "in place of the listed stat" / "instead of" with a stat earlier in
  // the sentence — looser fallback. Only accepts the +<stat> form so we
  // don't pick up the casual mentions.
  const looseRe = new RegExp(`\\+(${statRe})\\b[^.]*(?:instead|in\\s+place\\s+of)`, "i");
  const loose = s.match(looseRe);
  if (loose) return loose[1];
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
 *   1. the first add in a sentence that names the move (its
 *      `@Compendium[…]{Move}` link), else
 *   2. the first add in a sentence that names no move — a general trigger
 *      ("When you make a move to defuse …") — or, with no move given, the
 *      first add at all.
 * An add "on your next …" is for a later roll and never counted here. When
 * the move being made is the ability's own trigger, neither is an add in an
 * outcome's sentence: Scavenger's "When you Secure an Advantage to cobble
 * together … On a hit, you may add +1 when making a move aided by the item"
 * is for the moves the item later aids, not the Secure an Advantage (issue
 * #329 X04). A move named only as a cost ("… and Lose Momentum (-1)") does
 * not make a sentence another move's: Service Pod's "Careful: Add +2 and
 * Lose Momentum (-1)" is its trigger's add.
 *
 * Skips momentum / fire / heat references — those are resource changes,
 * not roll modifiers.
 *
 * @param {string} text — the ability's text (HTML stripped, links kept)
 * @param {string|null} [moveName] — the move being made ("Clash")
 * @returns {number}
 */
export function extractAdds(text, moveName = null) {
  const target = normaliseName(moveName);
  const ownTrigger = !!target && namedMoves(text).includes(target);
  const clauses = String(text ?? "").split(/(?<=[.!?])\s+/).map(sentence => ({
    moves: namedMoves(sentence),
    add:   ownTrigger && OUTCOME_SENTENCE.test(sentence) ? 0 : firstAddIn(sentence),
  })).filter(c => c.add > 0);
  if (target) {
    const own = clauses.find(c => c.moves.includes(target));
    if (own) return own.add;
    return clauses.find(c => !c.moves.length)?.add ?? 0;
  }
  return clauses[0]?.add ?? 0;
}

/** A sentence about the trigger roll's outcome — "On a hit, …", "On a strong hit with a match, …": its adds are for later rolls. */
const OUTCOME_SENTENCE = /^\s*on\s+a\s+(?:strong\s+|weak\s+)?(?:hit|miss)\b/i;

/** The first "add +N" (1–5) in one sentence that is not for a later roll ("… on your next Strike"); 0 for none. */
function firstAddIn(sentence) {
  const pattern = /(?:\badds?\s+\+?(\d+)|\+(\d+)\s+add)/gi;
  let m;
  while ((m = pattern.exec(sentence)) !== null) {
    const n = Number(m[1] ?? m[2] ?? 0);
    if (!(n > 0 && n <= 5)) continue;
    const rest = sentence.slice(m.index + m[0].length).split(/[,;]/)[0];
    if (/\bnext\b/i.test(rest)) continue;
    return n;
  }
  return 0;
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
