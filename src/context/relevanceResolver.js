/**
 * STARFORGED COMPANION
 * src/context/relevanceResolver.js — Resolve entity matches and hybrid move class
 *
 * Two-phase resolver per narrator-entity-discovery scope §13.
 *
 *   Phase 1: string matching against entity names (no API call).
 *   Phase 2: Haiku classification for implicit references when no name match
 *            on a hybrid move only.
 *
 * The output drives:
 *   - The narrator permission block (discovery / interaction / embellishment)
 *   - Which entity cards are injected into the narrator system prompt
 *   - Whether the pipeline must pause for a clarification card before narrating
 *
 * This module reads entity records but never writes — it is safe to call from
 * any client. The Haiku classification call is routed through src/api-proxy.js.
 *
 * Pure logic for Phase 1; Phase 2 is async but the classifier function is
 * injectable so unit tests can stub it.
 */

import { getConnection } from "../entities/connection.js";
import { getSettlement } from "../entities/settlement.js";
import { getFaction }    from "../entities/faction.js";
import { getShip }       from "../entities/ship.js";
import { getPlanet }     from "../entities/planet.js";
import { getLocation }   from "../entities/location.js";
import { getCreature }   from "../entities/creature.js";
import { MOVES }         from "../schemas.js";
import { apiPost }       from "../api-proxy.js";

const MODULE_ID     = "starforged-companion";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL   = "claude-haiku-5-5";

/**
 * @typedef {Object} EntityRef
 * @property {string} _id
 * @property {string} journalId
 * @property {string} name
 * @property {string} entityType
 */

/**
 * @typedef {Object} RelevanceResult
 * @property {"discovery"|"interaction"|"embellishment"} resolvedClass
 * @property {string[]}  entityIds          — JournalEntry IDs of matched entities
 * @property {string[]}  entityTypes        — corresponding entity type strings
 * @property {string[]}  matchedNames       — names that triggered the match
 * @property {boolean}   needsClarification — true if implicit reference detected
 * @property {string}    referenceType      — "pronoun" | "role" | "possessive" | "none"
 */

/**
 * Honorifics and titles. A leading one is stripped when two entity names are
 * compared for dedup (normalizeEntityName, entityExtractor.js), and none is
 * ever a name key on its own (buildNameIndex).
 */
export const HONORIFIC_PREFIXES = new Set([
  "dr", "mr", "mrs", "ms", "mx", "miss",
  "cmdr", "commander", "captain", "capt", "cap", "cpt",
  "lt", "lieutenant", "sgt", "sergeant",
  "gen", "general", "col", "colonel", "maj", "major",
  "prof", "professor", "rev", "reverend",
  "sir", "dame", "lord", "lady",
]);

/**
 * Words that never stand for an entity on their own: the honorifics, a few
 * more titles, and articles, prepositions and determiners. The first or last
 * word of a multi-word name is not indexed when it is one of these (issue
 * #286 A5): "The Covenant" claimed every "the" in the fiction, and "Captain
 * Mora" claimed "Captain Vance". The full name is still indexed.
 */
const NAME_NOISE_WORDS = new Set([
  ...HONORIFIC_PREFIXES,
  "doctor", "admiral", "chief", "elder", "old", "young",
  "a", "an", "the", "of", "in", "on", "at", "to", "for", "from", "by", "with",
  "and", "or", "but", "nor", "into", "onto", "upon",
  "this", "that", "these", "those", "his", "her", "its", "their", "our", "my", "your",
]);

function isNameNoiseWord(word) {
  return NAME_NOISE_WORDS.has(String(word ?? "").toLowerCase().replace(/[.,]+$/u, ""));
}

/** Lowercased full name with whitespace collapsed — the full-name key. */
function fullNameKey(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** The same entity, whichever id space a roster entry carries. */
function sameEntity(a, b) {
  if (a === b) return true;
  const idA = a?.journalId ?? a?._id;
  const idB = b?.journalId ?? b?._id;
  if (idA && idA === idB) return true;
  return !!(a?._id && a._id === b?._id);
}

/**
 * The two halves of the name index. `full`: every entity's full name. `parts`:
 * the first and last word of each multi-word name — except noise words, a word
 * that is some entity's full name, and a word two entities share (no guessing
 * which one is meant).
 */
function indexNames(entities, dismissedEntities) {
  const dismissed = new Set(
    (dismissedEntities ?? [])
      .filter(n => typeof n === "string")
      .map(n => n.trim().toLowerCase())
      .filter(Boolean),
  );
  const live = (entities ?? []).filter(e => {
    const key = fullNameKey(e?.name);
    return key && !dismissed.has(key);
  });

  const full = new Map();
  for (const entity of live) {
    const key = fullNameKey(entity.name);
    if (!full.has(key)) full.set(key, entity);
  }

  const claims = new Map();   // name part → entity, or null when shared
  for (const entity of live) {
    const words = entity.name.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) continue;
    for (const word of [words[0], words[words.length - 1]]) {
      const key = word.toLowerCase();
      if (isNameNoiseWord(key) || full.has(key)) continue;
      if (!claims.has(key)) claims.set(key, entity);
      else if (claims.get(key) && !sameEntity(claims.get(key), entity)) claims.set(key, null);
    }
  }
  const parts = new Map();
  for (const [key, entity] of claims) if (entity) parts.set(key, entity);
  return { full, parts };
}

/**
 * Build a lookup index from entity records to their host document IDs. Keys:
 * every lowercased full name, then the first and last word of multi-word
 * names — not articles, titles or other noise words, and not a word two
 * entities share. A full name always wins over another entity's name part.
 *
 * Dismissed names are excluded so misclicked entities don't keep returning.
 *
 * @param {EntityRef[]} entities
 * @param {string[]}    [dismissedEntities]
 * @returns {Map<string, EntityRef>}
 */
export function buildNameIndex(entities, dismissedEntities = []) {
  const { full, parts } = indexNames(entities, dismissedEntities);
  const index = new Map(full);
  for (const [key, entity] of parts) index.set(key, entity);
  return index;
}

/**
 * Resolve one name as the fiction writes it ("Kael", "Captain Vance",
 * "Dockmaster Kael Dros") to the entity it names. For writes that file a fact
 * under an entity: sidecar subjects, `!truth` / `!state`, the scene frame's
 * present list. A bounded ladder that stops before guessing
 * (rules/reachability.md §6), because a fact filed under the wrong entity is
 * worse than one kept as text:
 *
 *   1. the full name, any case ("kael dros");
 *   2. the full name once leading titles and articles are dropped
 *      ("Captain Mora" → "Mora");
 *   3. a multi-word full name after one or two leading title words
 *      ("Dockmaster Kael Dros");
 *   4. one capitalised first or last name that a single entity has ("Kael";
 *      "Captain Vance" → "Vance"). A lowercase word ("the station") never
 *      matches a name part.
 *
 * A trailing possessive is dropped first ("Kael's" → "Kael").
 *
 * @param {string}      name
 * @param {EntityRef[]} entities — the roster (collectAllEntities)
 * @param {string[]}    [dismissedEntities]
 * @returns {EntityRef|null}
 */
export function resolveEntityName(name, entities, dismissedEntities = []) {
  const raw = String(name ?? "").trim().replace(/\s+/g, " ").replace(/[’']s$/u, "");
  if (!raw || !Array.isArray(entities) || !entities.length) return null;
  const { full, parts } = indexNames(entities, dismissedEntities);

  const exact = full.get(raw.toLowerCase());
  if (exact) return exact;

  const words = raw.split(" ");
  let lead = 0;
  while (lead < words.length - 1 && isNameNoiseWord(words[lead])) lead += 1;
  const rest = words.slice(lead);
  if (lead > 0) {
    const stripped = full.get(rest.join(" ").toLowerCase());
    if (stripped) return stripped;
  }

  for (let k = 1; k <= 2 && words.length - k >= 2; k += 1) {
    const titled = words.slice(0, k).every(w => isNameNoiseWord(w) || /^\p{Lu}/u.test(w));
    if (!titled) break;
    const hit = full.get(words.slice(k).join(" ").toLowerCase());
    if (hit) return hit;
  }

  if (rest.length === 1 && /^\p{Lu}/u.test(rest[0])) {
    return parts.get(rest[0].toLowerCase()) ?? null;
  }
  return null;
}

/**
 * Phase 1 string match. Scans the narration for any indexed name, returns
 * the matched entities (deduplicated) and the names that triggered the match.
 *
 * @param {string} playerNarration
 * @param {Map<string, EntityRef>} index
 * @returns {{ entities: EntityRef[], matchedNames: string[] }}
 */
export function matchNamesInNarration(playerNarration, index) {
  if (!playerNarration || !index?.size) {
    return { entities: [], matchedNames: [] };
  }

  const text = playerNarration.toLowerCase();
  const seen = new Set();
  const entities = [];
  const matchedNames = [];

  for (const [token, entity] of index.entries()) {
    const re = wholeWordPattern(token);
    if (!re.test(text)) continue;
    const key = entity.journalId ?? entity._id ?? entity.name;
    if (seen.has(key)) continue;
    seen.add(key);
    entities.push(entity);
    matchedNames.push(entity.name);
  }

  return { entities, matchedNames };
}

/**
 * Identify which entity records are scene-relevant based on player narration,
 * and resolve hybrid move class.
 *
 * @param {string} playerNarration
 * @param {string} moveId
 * @param {string|null} outcome  — "strong_hit" | "weak_hit" | "miss"; null before
 *   the dice (a hybrid line naming nobody is then classified, as for a hit)
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {Function} [options.classifyImplicit] — async (narration, moveId) =>
 *   { impliedEntity: boolean, referenceType: string } — for Phase 2 classification.
 *   Defaults to a Haiku call via apiPost.
 * @param {Function} [options.collectEntities]  — async (campaignState) => EntityRef[].
 *   Override for tests; defaults to scanning all entity collections.
 * @param {{ value?: Object }} [options.classificationCache] — holds the Phase 2
 *   classification once made, and answers a later call from it: the move
 *   pipeline reads the line before the dice (to ask "Who are you interacting
 *   with?" then — issue #347 D1) and again with the outcome, with one Claude
 *   call between them.
 * @returns {Promise<RelevanceResult>}
 */
export async function resolveRelevance(
  playerNarration,
  moveId,
  outcome,
  campaignState,
  options = {},
) {
  const baseClass = MOVES?.[moveId]?.narratorClass ?? "embellishment";
  const collect   = options.collectEntities ?? collectAllEntities;

  // Discovery / interaction / embellishment classes do not require resolution
  // beyond name matching. Hybrid moves invoke Phase 2 when no name match is
  // found.
  const entities = await collect(campaignState);
  const index    = buildNameIndex(entities, campaignState?.dismissedEntities ?? []);
  const { entities: matched, matchedNames } = matchNamesInNarration(playerNarration, index);

  const baseResult = {
    resolvedClass:    null,
    entityIds:        matched.map(e => e.journalId ?? e._id),
    entityTypes:      matched.map(e => e.entityType),
    matchedNames,
    needsClarification: false,
    referenceType:    "none",
  };

  // Non-hybrid: class is fixed by the move table. Matches still flow through
  // for use as entity cards in the prompt.
  if (baseClass !== "hybrid") {
    baseResult.resolvedClass = baseClass;
    return baseResult;
  }

  // Hybrid path
  if (matched.length > 0) {
    return { ...baseResult, resolvedClass: "interaction" };
  }

  // No name match → on a miss, fall back to embellishment without an API call.
  if (outcome === "miss") {
    return { ...baseResult, resolvedClass: "embellishment" };
  }

  // No name match + hit (or an outcome not rolled yet) → invoke Phase 2
  // classification, once per cache.
  const classify = options.classifyImplicit ?? defaultClassifyImplicit;
  const cache = options.classificationCache ?? null;
  let classification = { impliedEntity: false, referenceType: "none" };
  if (cache?.value) {
    classification = cache.value;
  } else {
    try {
      classification = await classify(playerNarration, moveId);
      if (cache) cache.value = classification;
    } catch (err) {
      console.warn(`${MODULE_ID} | relevanceResolver: classifyImplicit failed:`, err);
    }
  }

  const referenceType = classification?.referenceType ?? "none";

  if (classification?.impliedEntity) {
    return {
      ...baseResult,
      resolvedClass:      "interaction",
      needsClarification: true,
      referenceType,
    };
  }

  // Implicit reference not detected → resolve as discovery on a hit
  return {
    ...baseResult,
    resolvedClass: "discovery",
    referenceType,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Collect all entity records from the campaign state and return a flat array
 * of { _id, journalId, name, entityType } refs (and `sectorId`, for a record
 * that has one). Per scope §6, all connection
 * entities (and any other named entity record) are eligible for matching.
 * `journalId` is the HOST document id (an Actor id for connections, ships,
 * settlements, planets and locations; a JournalEntry id for factions and
 * creatures) — the id every relevance match, ledger subject and scene-end
 * migration uses. `_id` is the record's own id, kept for back-references.
 *
 * This is the one roster shape. The sidecar apply path, `!truth` / `!state`
 * and the scene-frame resolution all pass it to resolveSubject /
 * resolveEntityName unchanged (issue #286 A1: a second `{ entityId }` shape
 * dropped every recorded entity's id, so their truths and state never
 * rendered).
 *
 * A name several entities share is led by the active sector's
 * (activeSectorNamesakeFirst, issue #342 Z15's rule): the name index keeps the
 * first entity of a name, and generated site names repeat across sectors, so
 * a sidecar subject, a scene's place and a player's line naming "Derelict
 * Starship" took the older sector's derelict while the crew stood in the
 * active sector's (issue #345 AA06).
 */
export function collectAllEntities(campaignState) {
  if (!campaignState) return [];
  const groups = [
    ["connection", getConnection, campaignState.connectionIds ?? []],
    ["settlement", getSettlement, campaignState.settlementIds ?? []],
    ["faction",    getFaction,    campaignState.factionIds    ?? []],
    ["ship",       getShip,       campaignState.shipIds       ?? []],
    ["planet",     getPlanet,     campaignState.planetIds     ?? []],
    ["location",   getLocation,   campaignState.locationIds   ?? []],
    ["creature",   getCreature,   campaignState.creatureIds   ?? []],
  ];

  const refs = [];
  for (const [type, getter, ids] of groups) {
    for (const journalId of ids) {
      let rec = null;
      try {
        rec = getter(journalId);
      } catch (err) {
        console.warn(`${MODULE_ID} | relevanceResolver: get ${type} ${journalId} failed:`, err);
        continue;
      }
      if (!rec?.name) continue;
      refs.push({
        _id:        rec._id ?? "",
        journalId,
        name:       rec.name,
        entityType: type,
        ...(typeof rec.sectorId === "string" && rec.sectorId ? { sectorId: rec.sectorId } : {}),
      });
    }
  }
  return activeSectorNamesakeFirst(refs, campaignState.activeSectorId ?? null);
}

/**
 * The roster with each name several entities share led by the active
 * sector's: generated site names repeat across sectors (every derelict is
 * "Derelict Starship" or "Derelict Settlement", numbered only within one
 * sector), and the name index keeps the first entity of a name — the older
 * sector's. So `!at`, the narrator's ship / position and an arrival by name
 * docked the ship there and moved its token on that sector's map (issue #342
 * Z15; the site ladder's rule, issue #321 U48), and the narrator's own
 * subjects and relevance took its card (issue #345 AA06). Entities of one
 * name stay together, in their order otherwise; the rest keep their order.
 * Pure.
 *
 * @param {Object[]} entities — the roster (each with `name`, and `sectorId` when it has one)
 * @param {string|null} activeSectorId
 * @returns {Object[]}
 */
export function activeSectorNamesakeFirst(entities, activeSectorId) {
  if (!activeSectorId || !Array.isArray(entities)) return entities;
  const nameKey = (e) => String(e?.name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const byName = new Map();
  for (const e of entities) {
    const key = nameKey(e);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(e);
  }
  const out = [];
  for (const [, group] of byName) {
    out.push(...group.filter(e => e?.sectorId === activeSectorId), ...group.filter(e => e?.sectorId !== activeSectorId));
  }
  return out;
}

const CLASSIFY_SYSTEM_PROMPT =
  `You determine whether a short Ironsworn: Starforged player narration ` +
  `implies interaction with a specific known individual, place, or entity ` +
  `even when no name is given. Pronouns ("her", "him", "it"), roles ` +
  `("the captain", "the navigator", "the station"), and possessives ` +
  `("her ship", "the old contact") count as implicit references.\n\n` +
  `Reply with a single JSON object — no prose:\n` +
  `{"impliedEntity": true|false, "referenceType": "pronoun"|"role"|"possessive"|"none"}`;

/**
 * Default Phase 2 classifier — Haiku call via api-proxy.
 * Tests pass an alternative function via options.classifyImplicit.
 *
 * @param {string} narration
 * @param {string} moveId
 * @returns {Promise<{ impliedEntity: boolean, referenceType: string }>}
 */
async function defaultClassifyImplicit(narration, moveId) {
  const apiKey = readApiKey();
  if (!apiKey) {
    return { impliedEntity: false, referenceType: "none" };
  }

  const body = {
    model:      HAIKU_MODEL,
    max_tokens: 110,   // was 80 — Haiku 5.5 counts the same text as about 30% more tokens than Haiku 4.5
    system: [
      { type: "text", text: CLASSIFY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content:
          `Move: ${moveId}\n` +
          `Narration: ${narration}\n\n` +
          `Return only the JSON object.`,
      },
    ],
  };

  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-beta":    "prompt-caching-2024-07-31",
  };

  const data = await apiPost(ANTHROPIC_URL, headers, body, { label: "relevanceResolver" });
  const text = (data?.content ?? [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();

  return parseClassificationJson(text);
}

/**
 * Parse the JSON object returned by the Phase 2 Haiku classifier. Handles
 * extra prose around the JSON, missing fields, and malformed input. Exported
 * for direct testing.
 *
 * @param {string} text
 * @returns {{ impliedEntity: boolean, referenceType: string }}
 */
export function parseClassificationJson(text) {
  if (!text) return { impliedEntity: false, referenceType: "none" };
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const slice = jsonMatch ? jsonMatch[0] : text;
  try {
    const parsed = JSON.parse(slice);
    return {
      impliedEntity: parsed.impliedEntity === true,
      referenceType: typeof parsed.referenceType === "string" ? parsed.referenceType : "none",
    };
  } catch {
    return { impliedEntity: false, referenceType: "none" };
  }
}

function readApiKey() {
  try {
    return globalThis.game?.settings?.get(MODULE_ID, "claudeApiKey") || null;
  } catch {
    return null;
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A whole-word match for a name, Unicode-aware: no letter, digit or
 * underscore on either side. JS `\b` is an ASCII boundary, so a name that
 * starts or ends with a non-ASCII letter — "Zoë", "José", "Élise" — had no
 * boundary beside a space and never matched (issue #322 V19).
 *
 * @param {string} token — the name (any case; the pattern ignores case)
 * @param {string} [flags] — extra flags besides "u" ("i" by default)
 * @returns {RegExp}
 */
export function wholeWordPattern(token, flags = "i") {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(String(token ?? ""))}(?![\\p{L}\\p{N}_])`, `${flags}u`);
}

/**
 * The selection ladders' substring rung: one name inside the other, as whole
 * words, either way — "Captain Ren" and Ren fit each other; "Lorenzo" and Ren
 * do not, nor "Kade is avenged" and the vow "Ade". Raw containment matched a
 * short name inside another word, so the move landed on the wrong connection,
 * vow, fight or expedition (issue #325 W30).
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function wholeWordsFit(a, b) {
  const x = String(a ?? "").trim();
  const y = String(b ?? "").trim();
  if (!x || !y) return false;
  return wholeWordPattern(x).test(y) || wholeWordPattern(y).test(x);
}
