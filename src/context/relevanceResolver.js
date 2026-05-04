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
const HAIKU_MODEL   = "claude-haiku-4-5-20251001";

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
 * Build a lookup index from entity records to JournalEntry IDs.
 * Indexes by lowercased full name, first word, and last word.
 * Single-word names appear once (full / first / last collapse).
 *
 * Dismissed names are excluded so misclicked entities don't keep returning.
 *
 * @param {EntityRef[]} entities
 * @param {string[]}    [dismissedEntities]
 * @returns {Map<string, EntityRef>}
 */
export function buildNameIndex(entities, dismissedEntities = []) {
  const dismissed = new Set(
    (dismissedEntities ?? [])
      .filter(n => typeof n === "string")
      .map(n => n.trim().toLowerCase())
      .filter(Boolean),
  );

  const index = new Map();
  for (const entity of entities ?? []) {
    const raw = entity?.name?.trim();
    if (!raw) continue;
    if (dismissed.has(raw.toLowerCase())) continue;

    const full = raw.toLowerCase();
    if (!index.has(full)) index.set(full, entity);

    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const first = words[0].toLowerCase();
      const last  = words[words.length - 1].toLowerCase();
      if (!index.has(first)) index.set(first, entity);
      if (!index.has(last))  index.set(last,  entity);
    }
  }
  return index;
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
    const re = new RegExp(`\\b${escapeRegExp(token)}\\b`, "i");
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
 * @param {string} outcome  — "strong_hit" | "weak_hit" | "miss"
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {Function} [options.classifyImplicit] — async (narration, moveId) =>
 *   { impliedEntity: boolean, referenceType: string } — for Phase 2 classification.
 *   Defaults to a Haiku call via apiPost.
 * @param {Function} [options.collectEntities]  — async (campaignState) => EntityRef[].
 *   Override for tests; defaults to scanning all entity collections.
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

  // No name match + hit → invoke Phase 2 classification
  const classify = options.classifyImplicit ?? defaultClassifyImplicit;
  let classification = { impliedEntity: false, referenceType: "none" };
  try {
    classification = await classify(playerNarration, moveId);
  } catch (err) {
    console.warn(`${MODULE_ID} | relevanceResolver: classifyImplicit failed:`, err);
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
 * of { _id, journalId, name, entityType } refs. Per scope §6, all connection
 * entities (and any other named entity record) are eligible for matching.
 */
function collectAllEntities(campaignState) {
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
      });
    }
  }
  return refs;
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
    max_tokens: 80,
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

  const data = await apiPost(ANTHROPIC_URL, headers, body);
  const text = (data?.content ?? [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();

  return parseClassificationJson(text);
}

function parseClassificationJson(text) {
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
