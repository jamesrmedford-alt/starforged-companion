/**
 * STARFORGED COMPANION
 * src/entities/entityExtractor.js — Combined detection pass
 *
 * One Haiku call per narration that serves both entity extraction (per
 * narrator-entity-discovery scope §9) and World Journal updates (per
 * world-journal scope §5). The single prompt asks for both at once, the
 * single response is parsed, then routed to the entity draft-card pipeline
 * and to the World Journal write functions.
 *
 * Routing rule (world-journal scope §4):
 *   - Lore   → WJ when salience clears the lore floor, else the running session log
 *   - Threat → WJ when salience clears the threat floor, else the running session log
 *   - Faction → WJ only if no entity record with that name exists, else
 *     handled via the entity generative tier
 *   - Location → same rule as faction
 *   - NPC / ship / creature → entity only, never WJ
 *
 * The detector rates each lore/threat candidate's salience (see
 * src/world/salience.js); per-channel floors keep transient scene beats out of
 * the World Journal (findings F15 / F17 / F21). Below-threshold beats append to
 * one running session-log page (D7 / F18) rather than being dropped. Fail-open —
 * an unrated item is recorded as durable, never rerouted.
 *
 * For interaction-class moves with matched entities, a separate Haiku call
 * (`appendGenerativeTierUpdates`) extracts narrator-added details and
 * appends them to the entity generativeTier flags.
 *
 * The Haiku call is injectable via options.callDetectionAPI for testing —
 * default uses apiPost from src/api-proxy.js.
 */

import { apiPost } from "../api-proxy.js";
import { getEntityDocument, readEntityFlag, writeEntityFlag } from "./registry.js";

import { getConnection, createConnection } from "./connection.js";
import { getPlayerActors, createCharacterBondItem } from "../character/actorBridge.js";
import { getSettlement, createSettlement } from "./settlement.js";
import { getFaction,    createFaction }    from "./faction.js";
import { getShip,       createShip }       from "./ship.js";
import { getPlanet,     createPlanet }     from "./planet.js";
import { getLocation,   createLocation }   from "./location.js";
import { getCreature,   createCreature }   from "./creature.js";
import { rollOracle }                      from "../oracles/roller.js";
import { onChatMessageRender }             from "../system/chatHooks.js";

import {
  recordLoreDiscovery,
  recordThreat,
  recordFactionIntelligence,
  recordLocation,
  promoteLoreToConfirmed,
  applyStateTransition as wjApplyStateTransition,
  appendSessionLogBeat,
  getConfirmedLore,
  getNarratorAssertedLore,
  getActiveThreats,
  getFactionLandscape,
} from "../world/worldJournal.js";
import { passesSalience, getSalienceThreshold } from "../world/salience.js";

const MODULE_ID     = "starforged-companion";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL   = "claude-haiku-4-5-20251001";

const ENTITY_GETTERS = {
  connection: getConnection,
  settlement: getSettlement,
  faction:    getFaction,
  ship:       getShip,
  planet:     getPlanet,
  location:   getLocation,
  creature:   getCreature,
};

const ENTITY_ID_FIELDS = {
  connection: "connectionIds",
  settlement: "settlementIds",
  faction:    "factionIds",
  ship:       "shipIds",
  planet:     "planetIds",
  location:   "locationIds",
  creature:   "creatureIds",
};

// Honorifics that the detector may strip when extracting a name from prose.
// We strip the same set so "Dr. Chen" stored as a connection matches a "Chen"
// detection on the next narration, instead of being treated as a new NPC.
const HONORIFIC_PREFIXES = new Set([
  "dr", "mr", "mrs", "ms", "mx", "miss",
  "cmdr", "commander", "captain", "capt", "cap", "cpt",
  "lt", "lieutenant", "sgt", "sergeant",
  "gen", "general", "col", "colonel", "maj", "major",
  "prof", "professor", "rev", "reverend",
  "sir", "dame", "lord", "lady",
]);

/**
 * Reduce an entity name to a canonical form for dedup comparisons.
 * Lowercases, trims, collapses interior whitespace, and strips a single
 * leading honorific (with optional trailing period). Returns `""` for
 * non-string / empty input.
 */
export function normalizeEntityName(name) {
  if (typeof name !== "string") return "";
  let n = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return "";
  const m = n.match(/^([a-z]+)\.?\s+(.+)$/);
  if (m && HONORIFIC_PREFIXES.has(m[1])) n = m[2];
  return n.trim();
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the combined detection pass for one narration. Returns the parsed
 * detection result (entities + worldJournal sections). Does not route
 * anywhere — call routeEntityDrafts and routeWorldJournalResults to apply.
 *
 * @param {string} narrationText
 * @param {string} moveId
 * @param {string} outcome
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {Function} [options.callDetectionAPI] — async (prompt, system) => raw text.
 *   Override for tests. Default posts to Anthropic via apiPost.
 * @returns {Promise<Object>} — { entities, worldJournal }
 */
// Detection API resilience (PLAYTEST-1717 B). The Haiku call can fail
// transiently (rate limit, network blip); a bounded retry recovers those. A
// *persistent* failure must not be silent — it means the narration's new
// entities / lore / factions are dropped, which is exactly how an inciting
// incident captured nothing while the only signal was a swallowed console line.
// On final failure we raise to console.error AND surface a GM-only toast.
const DETECTION_API_RETRIES      = 1;    // total attempts = retries + 1
const DETECTION_RETRY_BACKOFF_MS = 500;  // multiplied by the attempt number

export async function runCombinedDetectionPass(
  narrationText, moveId, outcome, campaignState, options = {},
) {
  const prompt   = buildCombinedDetectionPrompt(narrationText, moveId, outcome, campaignState);
  const callAPI  = options.callDetectionAPI ?? defaultCallDetectionAPI;
  const retries  = Number.isInteger(options.detectionRetries) ? options.detectionRetries : DETECTION_API_RETRIES;
  const backoff  = Number.isInteger(options.retryBackoffMs)   ? options.retryBackoffMs   : DETECTION_RETRY_BACKOFF_MS;

  let raw;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      raw = await callAPI(prompt);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && backoff > 0) {
        await new Promise(resolve => setTimeout(resolve, backoff * (attempt + 1)));
      }
    }
  }

  if (lastErr) {
    console.error(
      `${MODULE_ID} | entityExtractor: detection API failed after ${retries + 1} attempt(s):`,
      lastErr,
    );
    notifyDetectionFailure();
    return emptyDetection();
  }

  return parseDetectionResponse(raw, campaignState);
}


// ─────────────────────────────────────────────────────────────────────────────
// PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sentinel `moveId` value used by the paced-narrative detection path
 * (narrator-suggestion-loop remediation §C). Triggers the conditional
 * "no move was rolled" framing in `buildCombinedDetectionPrompt`. Not a
 * real foundry-ironsworn move id; using a snake_case sentinel keeps the
 * shape compatible with the existing string parameter without changing
 * the call signature.
 */
export const PACED_NARRATIVE_MOVE_ID = "paced_narrative";

/**
 * Sentinel `outcome` value paired with PACED_NARRATIVE_MOVE_ID. The
 * paced path has no roll outcome; the prompt builder omits the
 * `Outcome:` line entirely when this sentinel is seen so the model
 * doesn't get confused by `Outcome: n/a` masquerading as a real result.
 */
export const PACED_NARRATIVE_OUTCOME = "n/a";

/**
 * Build the single Haiku prompt covering both entity extraction (scope §9)
 * and World Journal state updates (WJ scope §5). The base entity-extraction
 * prompt is prefixed with the current WJ state so the model can detect
 * state transitions. Scopes for established entity names + dismissed names
 * are appended so the model does not re-suggest them.
 *
 * When `moveId === PACED_NARRATIVE_MOVE_ID` the move/outcome lines are
 * rendered as a "no move was rolled" framing instead of literal values,
 * so paced-narrative detection calls get a clearer prompt without
 * confusing the model with a fake move id (suggestion-loop remediation §C).
 */
export function buildCombinedDetectionPrompt(narrationText, moveId, outcome, campaignState) {
  const established = collectEstablishedEntityNames(campaignState);
  const dismissed   = (campaignState?.dismissedEntities ?? []).filter(Boolean);
  const pending     = collectPendingDraftNames();

  const wjState = describeWorldJournalState(campaignState);

  const isPaced = moveId === PACED_NARRATIVE_MOVE_ID;
  const moveLine = isPaced
    ? `Move: (paced narration — no move was rolled).`
    : `Move: ${moveId}.`;
  const outcomeLine = isPaced || outcome === PACED_NARRATIVE_OUTCOME
    ? null
    : `Outcome: ${outcome}.`;

  return [
    `You are analysing an Ironsworn: Starforged narration.`,
    moveLine,
    ...(outcomeLine ? [outcomeLine] : []),
    ``,
    `ENTITY TYPES TO DETECT:`,
    `- connection: named individual (NPC, person, AI)`,
    `- ship: named vessel or craft`,
    `- settlement: named community, station, outpost`,
    `- faction: named organisation, order, or power`,
    `- location: named specific place (derelict, vault, structure, site)`,
    `- creature: named or distinctly described creature type`,
    ``,
    `ESTABLISHED ENTITIES (do not return these as new entities):`,
    established.length ? established.join(", ") : "(none)",
    `Treat honorifics and titles as equivalent to the bare name —`,
    `"Dr. Chen" and "Chen" refer to the same person; "Captain Reyes" and`,
    `"Reyes" refer to the same person. Match against this list by stripping`,
    `any leading title before comparing.`,
    ``,
    `PENDING DRAFTS (already proposed in earlier narration, not yet confirmed —`,
    `do not return these again, the GM has them under review):`,
    pending.length ? pending.join(", ") : "(none)",
    ``,
    `DISMISSED NAMES (do not return these — the GM has already rejected them):`,
    dismissed.length ? dismissed.join(", ") : "(none)",
    ``,
    `CURRENT WORLD JOURNAL STATE (for state transition detection):`,
    `Confirmed lore: ${wjState.confirmedLore.join("; ") || "(none)"}`,
    `Narrator-asserted lore: ${wjState.assertedLore.join("; ") || "(none)"}`,
    `Active threats: ${wjState.threats.join("; ") || "(none)"}`,
    `Faction attitudes: ${wjState.factions.join("; ") || "(none)"}`,
    ``,
    `Return a single JSON object with this exact shape (no prose):`,
    `{`,
    `  "entities": [`,
    `    { "type": string, "name": string, "description": string,`,
    `      "confidence": "high"|"medium"|"low" }`,
    `  ],`,
    `  "worldJournal": {`,
    `    "lore": [`,
    `      { "title": string, "category": string, "text": string,`,
    `        "salience": "trivial"|"scene"|"notable"|"significant"|"defining",`,
    `        "narratorAsserted": true, "confirmed": false }`,
    `    ],`,
    `    "threats": [`,
    `      { "name": string, "type": string, "severity": string, "summary": string,`,
    `        "salience": "trivial"|"scene"|"notable"|"significant"|"defining" }`,
    `    ],`,
    `    "factionUpdates": [`,
    `      { "name": string, "attitude": string, "summary": string, "isNew": boolean }`,
    `    ],`,
    `    "locationUpdates": [`,
    `      { "name": string, "type": string, "summary": string, "isNew": boolean }`,
    `    ],`,
    `    "stateTransitions": [`,
    `      { "entryType": "threat"|"lore"|"faction", "name": string,`,
    `        "change": "resolved"|"escalated"|"contradicted"|"attitudeShift",`,
    `        "newValue": string }`,
    `    ]`,
    `  }`,
    `}`,
    ``,
    `SALIENCE — rate how durable each lore and threat item is, so transient`,
    `scene beats do not become permanent World Journal entries:`,
    `  - "defining":    a world truth, a faction's overarching agenda, or a`,
    `                   revelation that reshapes the campaign.`,
    `  - "significant": a durable world or character fact that will still matter`,
    `                   in later sessions (e.g. the cargo is actually wartime munitions).`,
    `  - "notable":     a meaningful clue or complication that may matter beyond`,
    `                   the current scene.`,
    `  - "scene":       matters only within the current encounter (a sensor blip,`,
    `                   a description, an immediate observation).`,
    `  - "trivial":     atmospheric flavour with no lasting weight.`,
    `Be sparing: most moment-to-moment narration is "scene" or "trivial". Reserve`,
    `"significant" and "defining" for facts worth remembering next session.`,
    ``,
    `Lore rules: only extract concrete narrative facts, not atmosphere.`,
    `Threat rules: only named or distinctly typed dangers with narrative weight.`,
    `Entity rules: only return entities clearly named or distinctly typed.`,
    `Do NOT return generic references ("a guard", "the station", "some raiders").`,
    `State transitions: compare narration against the CURRENT WORLD JOURNAL STATE`,
    `above. Threat resolved/escalated, lore contradicted, faction attitude shift.`,
    `Return empty arrays for any section with nothing to report.`,
    ``,
    `Narration:`,
    narrationText ?? "",
  ].join("\n");
}


// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE PARSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the raw Haiku response. Filters out:
 *   - low-confidence entity results
 *   - entities whose names match an established entity record
 *   - entities whose names appear in campaignState.dismissedEntities
 *
 * Returns the empty detection shape on any parse error so callers don't have
 * to special-case missing fields.
 *
 * @param {string} text — raw JSON-wrapped string
 * @param {Object} campaignState
 * @returns {{ entities, worldJournal }}
 */
export function parseDetectionResponse(text, campaignState) {
  if (!text || typeof text !== "string") return emptyDetection();
  const slice = (text.match(/\{[\s\S]*\}/) ?? [text])[0];

  let parsed;
  try {
    parsed = JSON.parse(slice);
  } catch {
    return emptyDetection();
  }

  const entities = Array.isArray(parsed?.entities) ? parsed.entities : [];
  const wj       = parsed?.worldJournal && typeof parsed.worldJournal === "object"
    ? parsed.worldJournal
    : {};

  const dismissed = new Set(
    (campaignState?.dismissedEntities ?? [])
      .filter(n => typeof n === "string")
      .map(normalizeEntityName)
      .filter(Boolean),
  );
  const established = new Set(
    collectEstablishedEntityNames(campaignState)
      .map(normalizeEntityName)
      .filter(Boolean),
  );
  const pending = new Set(
    collectPendingDraftNames().map(normalizeEntityName).filter(Boolean),
  );

  const filteredEntities = entities
    .filter(e => e && typeof e.name === "string" && e.name.trim())
    .filter(e => (e.confidence ?? "high") !== "low")
    .filter(e => !dismissed.has(normalizeEntityName(e.name)))
    .filter(e => !established.has(normalizeEntityName(e.name)))
    .filter(e => !pending.has(normalizeEntityName(e.name)));

  return {
    entities: filteredEntities,
    worldJournal: {
      lore:             Array.isArray(wj.lore)             ? wj.lore             : [],
      threats:          Array.isArray(wj.threats)          ? wj.threats          : [],
      factionUpdates:   Array.isArray(wj.factionUpdates)   ? wj.factionUpdates   : [],
      locationUpdates:  Array.isArray(wj.locationUpdates)  ? wj.locationUpdates  : [],
      stateTransitions: Array.isArray(wj.stateTransitions) ? wj.stateTransitions : [],
    },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// ROUTING — entities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route entity drafts to either an auto-create path (for make_a_connection
 * connection drafts) or a GM-only draft chat card listing the candidates.
 *
 * @param {Array}  entities
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {boolean} [options.autoCreateConnection]  — when true, the first
 *   connection-typed draft is auto-created via createConnection() rather
 *   than queued on the GM card. Used by make_a_connection on a hit.
 *   The paced-narrative detection path explicitly sets this to false
 *   so detected NPCs always go through GM review (suggestion-loop
 *   remediation §C — see docs/narrator/narrator-suggestion-loop-group-c-design-memo.md).
 * @param {string}  [options.sessionId]
 * @param {string}  [options.source]  — telemetry flag attached to the
 *   GM draft card. "paced_narrative" for paced-path detection;
 *   anything else / omitted is treated as "move_resolution" (default).
 * @returns {Promise<{ created: Array, queued: Array }>}
 */
export async function routeEntityDrafts(entities, campaignState, options = {}) {
  const created = [];
  const queued  = [];
  const pendingNormalized = new Set(
    collectPendingDraftNames().map(normalizeEntityName).filter(Boolean),
  );

  for (const entity of entities ?? []) {
    if (!entity?.name || !entity?.type) continue;
    if (!ENTITY_GETTERS[entity.type]) continue;
    // Cross-type dedup. A name that already exists anywhere in
    // campaignState — settlement, location, faction, anything — should not
    // be re-proposed as a different entity type. The detector classifies
    // entities by surface form ("Oxidized Kettle cantina" can read as a
    // Location even though the parent settlement is also called Oxidized
    // Kettle), so the type-scoped entityExistsForName(name, type, …) lets
    // duplicates through. entityExistsAnyType catches the cross-type case.
    if (entityExistsAnyType(entity.name, campaignState)) continue;
    // Skip names already sitting in an unresolved draft card — the GM is
    // already reviewing them; re-flagging causes the suggestion loop.
    if (pendingNormalized.has(normalizeEntityName(entity.name))) continue;

    if (options.autoCreateConnection && entity.type === "connection" && !created.length) {
      try {
        const seedData = buildConnectionSeedData(entity, options.connectionSeed ?? null);
        const record = await createConnection({
          name:                      seedData.name,
          description:               seedData.description,
          role:                      seedData.role,
          motivation:                seedData.motivation,
          portraitSourceDescription: seedData.portraitSource,
          firstAppearance:           options.sessionId ?? "",
        }, campaignState);
        await postCreationEnrichment("connection", record, campaignState);
        await registerConnectionOnActiveCharacter(record).catch(err =>
          console.warn(`${MODULE_ID} | entityExtractor: bond item registration failed:`, err));
        created.push({ entity, record });
      } catch (err) {
        console.error(`${MODULE_ID} | entityExtractor: auto-create connection failed:`, err);
        queued.push(entity);
      }
      continue;
    }
    queued.push(entity);
  }

  if (queued.length) {
    await postDraftEntityCard(queued, campaignState, { source: options.source });
  }

  return { created, queued };
}


// ─────────────────────────────────────────────────────────────────────────────
// SEED ENRICHMENT — oracle backfill + silent portrait generation
// ─────────────────────────────────────────────────────────────────────────────
//
// New entities created from a detector draft (or auto-created on a
// make_a_connection hit) carry only the detector's surface description.
// The journal records would otherwise sit with empty role / motivation /
// description and no portrait. To give the GM a minimal sketch to work
// with, we backfill the structured fields from the Starforged oracle
// tables and trigger a silent portrait generation. Output never goes to
// chat — the resulting detail lives only on the journal/actor record
// and in the entity panel.

/**
 * Build connection-creation fields from a draft and an oracle seed.
 * Re-uses the rolls made by buildOracleSeeds() when a fresh seed is
 * not provided (e.g. confirm-from-draft path).
 *
 * @param {Object} draft           — { name, description }
 * @param {Object|null} seed       — { role, goal, firstLook, givenName }
 * @returns {{ name, description, role, motivation, portraitSource }}
 */
export function buildConnectionSeedData(draft, seed) {
  const s = seed ?? {};
  const name = (draft?.name && draft.name.trim()) || s.givenName || "Unknown Connection";
  const descriptorParts = [];
  if (draft?.description && draft.description.trim()) descriptorParts.push(draft.description.trim());
  if (s.firstLook) descriptorParts.push(`First look: ${s.firstLook}.`);
  const description = descriptorParts.join(" ");
  // Portrait source must contain enough visual detail to render. Combine
  // the detector description (if any) with the first-look oracle so the
  // model has something concrete to render even when the narrator's prose
  // was abstract.
  const portraitParts = [];
  if (draft?.description && draft.description.trim()) portraitParts.push(draft.description.trim());
  if (s.firstLook) portraitParts.push(s.firstLook);
  if (s.role)      portraitParts.push(`role: ${s.role}`);
  return {
    name,
    description,
    role:           s.role  ?? "",
    motivation:     s.goal  ?? "",
    portraitSource: portraitParts.join(". "),
  };
}

/**
 * Build ship-creation fields from a draft and an oracle seed.
 *
 * @param {Object} draft  — { name, description }
 * @param {Object} seed   — { type, firstLook, name }
 * @returns {{ name, description, type, firstLook, portraitSource }}
 */
export function buildShipSeedData(draft, seed) {
  const s = seed ?? {};
  const name = (draft?.name && draft.name.trim()) || s.name || "Unknown Ship";
  const descriptorParts = [];
  if (draft?.description && draft.description.trim()) descriptorParts.push(draft.description.trim());
  if (s.firstLook) descriptorParts.push(`First look: ${s.firstLook}.`);
  if (s.type)      descriptorParts.push(`Type: ${s.type}.`);
  const description = descriptorParts.join(" ");
  const portraitParts = [];
  if (draft?.description && draft.description.trim()) portraitParts.push(draft.description.trim());
  if (s.firstLook) portraitParts.push(s.firstLook);
  if (s.type)      portraitParts.push(s.type);
  return {
    name,
    description,
    type:           s.type      ?? "",
    firstLook:      s.firstLook ?? "",
    portraitSource: portraitParts.join(". "),
  };
}

function rollFreshConnectionSeed() {
  return {
    role:      safeOracleRoll("character_role"),
    goal:      safeOracleRoll("character_goal"),
    firstLook: safeOracleRoll("character_first_look"),
    givenName: safeOracleRoll("given_name"),
  };
}

function rollFreshShipSeed() {
  return {
    type:      safeOracleRoll("starship_type"),
    firstLook: safeOracleRoll("starship_first_look"),
    name:      safeOracleRoll("starship_name"),
  };
}

function safeOracleRoll(tableId) {
  try {
    const r = rollOracle(tableId);
    return r?.result && r.result !== "—" ? r.result : "";
  } catch {
    return "";
  }
}

/**
 * After a connection or ship is created with `portraitSourceDescription`
 * already on the record, silently trigger portrait generation. Gated on
 * the OpenRouter key being configured — when absent, this is a no-op (no
 * notification, no chat surface).
 *
 * The portraitSourceDescription itself is written by the caller as part
 * of the create-call data so the journal/actor entry persists atomically
 * — earlier versions did the portraitSource write here in a follow-up
 * step, which raced with tests (and other readers) that observed the
 * journal after createXxx() returned but before this function landed.
 *
 * Lives here (not in connection.js / ship.js) so the portrait-generation
 * policy is applied consistently regardless of which create path runs.
 */
// Exported for the inciting-incident ⚔ Swear this vow flow (Cluster B),
// which creates the vow-target connection through the exact same
// pipeline as the make_a_connection auto-create above.
export async function postCreationEnrichment(typeKey, record, campaignState) {
  if (!record || !record.portraitSourceDescription) return;
  if (!hasOpenRouterKey()) return;

  const hostId = findHostDocumentId(typeKey, record._id, campaignState);
  if (!hostId) return;

  try {
    const { generatePortrait } = await import("../art/generator.js");
    await generatePortrait(hostId, typeKey, record, campaignState ?? {});
  } catch (err) {
    console.warn(`${MODULE_ID} | postCreationEnrichment: portrait generation failed:`, err);
  }
}

function findHostDocumentId(typeKey, recordId, campaignState) {
  if (!recordId) return null;
  const idsField = ENTITY_ID_FIELDS[typeKey];
  const getter   = ENTITY_GETTERS[typeKey];
  if (!idsField || !getter) return null;
  const ids = campaignState?.[idsField] ?? [];
  for (const hostId of ids) {
    let rec = null;
    try { rec = getter(hostId); } catch { continue; }
    if (rec?._id === recordId) return hostId;
  }
  return null;
}

function hasOpenRouterKey() {
  try {
    return !!globalThis.game?.settings?.get(MODULE_ID, "openRouterApiKey");
  } catch {
    return false;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// ROUTING — World Journal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route the World Journal section of the detection response to the
 * worldJournal.js write functions. Per WJ scope §4 the routing rule is:
 *   - Lore:    always → recordLoreDiscovery
 *   - Threat:  always → recordThreat
 *   - Faction: only when no entity record exists → recordFactionIntelligence
 *   - Location: only when no entity record exists → recordLocation
 *   - State transitions: applyStateTransition (delegates by entryType)
 *
 * @param {Object} wj — parsed worldJournal section
 * @param {Object} campaignState
 * @returns {Promise<void>}
 */
export async function routeWorldJournalResults(wj, campaignState) {
  if (!wj) return;

  // Below-threshold lore/threat items are transient scene beats: route them to
  // the running session log (D7 / F18) instead of spawning a WJ entry each.
  // Fail-open items (unrated salience) clear the gate and are recorded as
  // durable, never rerouted.
  const loreThreshold = getSalienceThreshold("lore");
  for (const lore of wj.lore ?? []) {
    if (!lore?.title) continue;
    if (!passesSalience(lore.salience, loreThreshold)) {
      await appendSessionLogBeat(campaignState, { kind: "lore", title: lore.title, text: lore.text ?? "" });
      continue;
    }
    await recordLoreDiscovery(lore.title, {
      ...lore,
      narratorAsserted: true,
      confirmed:        lore.confirmed === true,
    }, campaignState);
  }

  const threatThreshold = getSalienceThreshold("threats");
  for (const threat of wj.threats ?? []) {
    if (!threat?.name) continue;
    if (!passesSalience(threat.salience, threatThreshold)) {
      await appendSessionLogBeat(campaignState, { kind: "threat", title: threat.name, text: threat.summary ?? "" });
      continue;
    }
    await recordThreat(threat.name, threat, campaignState);
  }

  for (const faction of wj.factionUpdates ?? []) {
    if (!faction?.name) continue;
    if (entityExistsForName(faction.name, "faction", campaignState)) continue;
    await recordFactionIntelligence(faction.name, faction, campaignState);
  }

  for (const location of wj.locationUpdates ?? []) {
    if (!location?.name) continue;
    if (entityExistsForName(location.name, "location", campaignState)) continue;
    await recordLocation(location.name, location, campaignState);
  }

  for (const transition of wj.stateTransitions ?? []) {
    await applyStateTransition(transition, campaignState);
  }
}

/**
 * Apply a state transition. Delegates to worldJournal.applyStateTransition
 * for threat / faction / lore-contradicted, and adds a "lore confirmed"
 * change that promotes a soft entry to canonical.
 */
export async function applyStateTransition(transition, campaignState) {
  if (!transition?.entryType) return null;

  if (transition.entryType === "lore" && transition.change === "confirmed") {
    return promoteLoreToConfirmed(transition.name, campaignState);
  }

  return wjApplyStateTransition(transition, campaignState);
}


// ─────────────────────────────────────────────────────────────────────────────
// entityExistsForName
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when an entity record of the given type with the given name
 * (case-insensitive, trimmed) already exists in the campaign. Used by the
 * routing layer to suppress duplicate WJ entries when the entity record is
 * authoritative.
 */
export function entityExistsForName(name, type, campaignState) {
  if (!name || !type) return false;
  const idsField = ENTITY_ID_FIELDS[type];
  const getter   = ENTITY_GETTERS[type];
  if (!idsField || !getter) return false;

  const target = normalizeEntityName(name);
  if (!target) return false;
  const ids    = campaignState?.[idsField] ?? [];
  for (const journalId of ids) {
    let rec = null;
    try { rec = getter(journalId); }
    catch { continue; }
    if (rec?.name && normalizeEntityName(rec.name) === target) return true;
  }
  return false;
}

/**
 * Cross-type variant of entityExistsForName — returns true if any entity of
 * any type already carries this name. Used as the primary dedup gate in
 * routeEntityDrafts so the detector's type classification cannot smuggle a
 * duplicate through (e.g. proposing Location "Oxidized Kettle" when the
 * Settlement of the same name is already established in the active sector).
 *
 * The WJ routing rules in routeWorldJournalResults still use the type-scoped
 * entityExistsForName because faction/location WJ entries are deliberately
 * scoped — a faction WJ note about "Blue Star Compact" should not be blocked
 * by an unrelated settlement-typed entity that happens to share a name.
 *
 * @param {string} name
 * @param {Object} campaignState
 * @returns {boolean}
 */
export function entityExistsAnyType(name, campaignState) {
  const target = normalizeEntityName(name);
  if (!target) return false;

  // The detector's "what's known" set is built from several layers. Any
  // single layer missed creates the F14 defect class — we keep flagging
  // already-known entities as new because we only checked our own
  // bookkeeping IDs and not the canonical Foundry sources.
  //
  // 1. Player characters (foundry-ironsworn `character` Actors).
  if (isPlayerCharacterName(target)) return true;

  // 2. Active sector + all peer sectors. The Sector Creator writes sector
  //    names into campaignState.sectors[] but doesn't add them to any
  //    entityIds list — so a narration that mentioned the active sector
  //    by name (e.g. "Delphian Anvil") was being proposed as a new
  //    Location every time.
  if (sectorNameMatches(target, campaignState)) return true;

  // 3. Our own bookkeeping ID lists (connection/settlement/faction/ship/
  //    planet/location/creature). This was the only check before F14.
  for (const [type, idsField] of Object.entries(ENTITY_ID_FIELDS)) {
    const getter = ENTITY_GETTERS[type];
    if (!getter) continue;
    const ids = campaignState?.[idsField] ?? [];
    for (const journalId of ids) {
      let rec = null;
      try { rec = getter(journalId); }
      catch { continue; }
      if (rec?.name && normalizeEntityName(rec.name) === target) return true;
    }
  }

  // 4. Live Actor surfaces. After the Entity → Actor migration, starships
  //    / settlements / planets / locations live as Foundry Actors; an
  //    Actor that exists but isn't in campaignState.{shipIds,settlementIds,…}
  //    (manually-created, vendor-seeded, or migrated out-of-band) was
  //    invisible to the dedup gate. Walk game.actors directly so the
  //    bookkeeping list isn't load-bearing for "what exists in Foundry".
  if (actorNameMatches(target)) return true;

  return false;
}

/**
 * @param {string} normalisedName
 * @param {Object} campaignState
 * @returns {boolean} true if any sector in campaignState.sectors[] has a
 *   name matching this (normalised). Covers both the active sector and
 *   peer sectors so the detector never re-proposes an already-named sector
 *   as a "new" location.
 */
function sectorNameMatches(normalisedName, campaignState) {
  if (!normalisedName) return false;
  const sectors = campaignState?.sectors ?? [];
  for (const s of sectors) {
    if (s?.name && normalizeEntityName(s.name) === normalisedName) return true;
  }
  return false;
}

/**
 * @param {string} normalisedName
 * @returns {boolean} true if any non-character Actor in game.actors
 *   (starship, location-typed settlement/planet/location subtypes) matches
 *   this name. Character actors are handled by isPlayerCharacterName.
 *
 * Catches the F14 case where a starship Actor (e.g. the PC's command
 * vehicle) was named in narration but wasn't in campaignState.shipIds,
 * so the bookkeeping-only dedup missed it.
 */
function actorNameMatches(normalisedName) {
  if (!normalisedName) return false;
  try {
    const actors = globalThis.game?.actors ?? [];
    for (const a of actors) {
      if (!a?.name) continue;
      if (a?.type === "character") continue; // covered by isPlayerCharacterName
      if (a?.type !== "starship" && a?.type !== "location") continue;
      if (normalizeEntityName(a.name) === normalisedName) return true;
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | actorNameMatches: actor lookup failed:`, err?.message ?? err);
  }
  return false;
}

/**
 * @param {string} normalisedName — output of normalizeEntityName(rawName)
 * @returns {boolean} true if any character-type Actor in the world
 *   matches this name (case-insensitive, honorific-stripped).
 *
 * Includes both player-owned PCs and any GM-created character actor
 * (e.g. an Ironsworn co-op campaign with multiple PC actors not all
 * formally "owned" by a player User). The detector's existing
 * normalizeEntityName already strips honorifics and lowercases, so a
 * PC named "Doctor Chen" matches a detection of "Chen" or "Dr. Chen".
 */
function isPlayerCharacterName(normalisedName) {
  if (!normalisedName) return false;
  try {
    const actors = globalThis.game?.actors ?? [];
    for (const a of actors) {
      if (a?.type !== "character") continue;
      // NPC/connection cards are `character` actors too (FOLDER-002) — they are
      // entities, not player characters, and are deduped via the entity registry.
      if (a?.flags?.[MODULE_ID]?.entityType) continue;
      if (!a?.name) continue;
      if (normalizeEntityName(a.name) === normalisedName) return true;
    }
  } catch (err) {
    // Test environments without game.actors land here. Best-effort dedup —
    // returning false just lets the detector propose the entity, which the
    // GM can dismiss; not catastrophic.
    console.warn(`${MODULE_ID} | isPlayerCharacterName: actor lookup failed:`, err?.message ?? err);
  }
  return false;
}


// ─────────────────────────────────────────────────────────────────────────────
// GENERATIVE TIER UPDATES — interaction-class moves with matched entities
// ─────────────────────────────────────────────────────────────────────────────

// Salience floor for generative-tier capture. The tier records an entity's
// durable developments/actions, so trivia and incidental motion are dropped
// while character-relevant beats ("may echo later") and up are kept — a more
// permissive floor than the chronicle/lore channels by design. Fail-open via
// passesSalience: an unrated update still lands (degrades to capture-all), so
// model format drift never silently empties the tier.
const TIER_SALIENCE_FLOOR = "notable";

/**
 * Run a Haiku pass to identify narrator-added details about known entities
 * present in the scene, then append them to the corresponding generativeTier
 * flag arrays. Skips entries whose `detail` already appears (case-insensitive
 * substring match) so we don't restate the same observation.
 *
 * Pinned entries are never trimmed. The display cap (5 entries in the
 * prompt) is enforced by formatEntityCard, not here.
 *
 * @param {string}   narrationText
 * @param {Array}    entityRefs   — [{ journalId, type, name, ... }] from the resolver
 * @param {string}   sessionId
 * @param {number}   sessionNum
 * @param {Object}   [options]
 * @param {Function} [options.callTierAPI]  — async (prompt) => raw JSON text
 * @returns {Promise<Array>}                — list of applied { journalId, detail }
 */
export async function appendGenerativeTierUpdates(
  narrationText, entityRefs, sessionId, sessionNum, options = {},
) {
  if (!Array.isArray(entityRefs) || !entityRefs.length) return [];

  const records = entityRefs
    .map(ref => {
      const getter = ENTITY_GETTERS[ref?.type];
      if (!getter || !ref?.journalId) return null;
      let rec = null;
      try { rec = getter(ref.journalId); } catch { return null; }
      if (!rec) return null;
      return { ...ref, record: rec };
    })
    .filter(Boolean);

  if (!records.length) return [];

  const prompt   = buildTierUpdatePrompt(narrationText, records);
  const callAPI  = options.callTierAPI ?? defaultCallTierAPI;
  let raw;
  try {
    raw = await callAPI(prompt);
  } catch (err) {
    console.warn(`${MODULE_ID} | entityExtractor: generative tier API failed:`, err);
    return [];
  }

  const parsed = parseTierUpdateResponse(raw);
  const applied = [];

  for (const update of parsed.updates ?? []) {
    if (!update?.entityId || !update?.detail) continue;
    // Salience gate (fail-open) — keep consequential developments, drop trivia.
    if (!passesSalience(update.salience, TIER_SALIENCE_FLOOR)) continue;
    const matched = records.find(r =>
      r.journalId === update.entityId
      || r.record?._id === update.entityId
      || r.record?.name === update.entityId,
    );
    if (!matched) continue;
    const ok = await appendDetailToTier(matched, update.detail, sessionId, sessionNum);
    if (ok) applied.push({ journalId: matched.journalId, detail: update.detail });
  }

  return applied;
}

/**
 * Append a generative-tier detail to an entity record. Returns true on
 * success, false when the detail was deduplicated.
 */
export async function appendDetailToTier(entityRef, detail, sessionId, sessionNum) {
  const cleanDetail = detail?.trim();
  if (!cleanDetail || !entityRef?.record || !entityRef?.journalId) return false;

  const tier = Array.isArray(entityRef.record.generativeTier)
    ? entityRef.record.generativeTier
    : [];

  const lc = cleanDetail.toLowerCase();
  const seen = tier.some(e => {
    const existing = (e?.detail ?? "").toLowerCase();
    if (!existing) return false;
    return existing === lc || existing.includes(lc) || lc.includes(existing);
  });
  if (seen) return false;

  const newEntry = {
    sessionId:  sessionId ?? "",
    sessionNum: sessionNum ?? null,
    detail:     cleanDetail,
    source:     "narrator_extraction",
    pinned:     false,
    promoted:   false,
    promotedAt: null,
  };

  const updated = [...tier, newEntry];
  await persistGenerativeTier(entityRef, updated);
  entityRef.record.generativeTier = updated; // keep ref consistent for return value
  return true;
}

function buildTierUpdatePrompt(narrationText, records) {
  const formatted = records.map(r => {
    const rec = r.record;
    return [
      `## ${rec.name} — ${r.type}  (id: ${r.journalId})`,
      rec.description ? `Description: ${rec.description}` : "",
      rec.role        ? `Role: ${rec.role}`               : "",
      rec.notes       ? `Notes: ${rec.notes}`             : "",
      Array.isArray(rec.generativeTier) && rec.generativeTier.length
        ? `Existing details: ${rec.generativeTier.map(e => e.detail).filter(Boolean).join(" | ")}`
        : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  return [
    `Given the following established entity records and a passage of narration,`,
    `capture any SIGNIFICANT new development about each entity that is NOT already`,
    `in the record below — what the character did, decided, or revealed; how their`,
    `disposition, allegiance, or relationship to the player character shifted; a`,
    `durable new trait or piece of history. Record consequential beats, not`,
    `incidental motion, passing scenery, or restatements of what is already known.`,
    ``,
    formatted,
    ``,
    `Rate each update with a "salience" — one of trivial, scene, notable,`,
    `significant, defining — for how much it matters to that entity's ongoing`,
    `story. Be conservative: most narration is "scene" or "trivial" and should be`,
    `omitted entirely.`,
    ``,
    `Return a single JSON object (no prose):`,
    `{ "updates": [ { "entityId": string, "detail": string, "salience": string } ] }`,
    ``,
    `entityId must match the id shown in the record header (e.g. "id: ABC123").`,
    `detail should be one short sentence — the new development only.`,
    ``,
    `Narration:`,
    narrationText ?? "",
  ].join("\n");
}

export function parseTierUpdateResponse(text) {
  if (!text || typeof text !== "string") return { updates: [] };
  const slice = (text.match(/\{[\s\S]*\}/) ?? [text])[0];
  try {
    const parsed = JSON.parse(slice);
    return { updates: Array.isArray(parsed?.updates) ? parsed.updates : [] };
  } catch {
    return { updates: [] };
  }
}

async function persistGenerativeTier(entityRef, tier) {
  try {
    const entry = game.journal?.get(entityRef.journalId);
    const page  = entry?.pages?.contents?.[0];
    if (!page) return;
    const existingFlags = page.flags?.[MODULE_ID]?.[entityRef.type] ?? {};
    const updated = {
      ...existingFlags,
      generativeTier: tier,
      updatedAt:      new Date().toISOString(),
    };
    await page.setFlag(MODULE_ID, entityRef.type, updated);
  } catch (err) {
    console.error(`${MODULE_ID} | entityExtractor: persistGenerativeTier failed:`, err);
  }
}

/**
 * Append a fact-continuity scene-end migration entry to an entity's
 * generative tier. See docs/fact-continuity/fact-continuity-scope.md §9.2 step 1.
 *
 * Lower-level than `appendDetailToTier` — does not dedupe against existing
 * entries (migration entries are tagged source: "scene_truth_migration"
 * and may legitimately repeat narrator-extracted detail wording).
 *
 * Returns true on success, false when the entity's journal/page cannot be
 * resolved.
 *
 * @param {string} journalId
 * @param {string} type — "connection" | "ship" | "settlement" | …
 * @param {Object} entry — fully-formed generative-tier entry
 * @returns {Promise<boolean>}
 */
export async function appendMigratedTruthToTier(journalId, type, entry) {
  if (!journalId || !type || !entry) return false;
  try {
    // Registry-dispatch — PR #100 moved ship/planet/location/settlement onto
    // native Actor documents while connection/faction/creature stayed
    // journal-backed. The "journalId" argument name is preserved for
    // back-compat (Phase C callers built around the old shape) but the value
    // is the host document id of either flavour. See src/entities/registry.js.
    const document = getEntityDocument(type, journalId);
    if (!document) return false;

    const existingFlags = readEntityFlag(type, document) ?? {};
    const tier          = Array.isArray(existingFlags.generativeTier)
      ? existingFlags.generativeTier
      : [];
    const updated = {
      ...existingFlags,
      generativeTier: [...tier, entry],
      updatedAt:      new Date().toISOString(),
    };
    await writeEntityFlag(type, document, updated);
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | entityExtractor: appendMigratedTruthToTier failed:`, err);
    return false;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// DRAFT CARD
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_GLYPHS = {
  connection: "⬡",
  ship:       "◈",
  settlement: "⬟",
  faction:    "⬢",
  planet:     "◉",
  location:   "◧",
  creature:   "⬣",
};

const TYPE_LABELS = {
  connection: "Connection",
  ship:       "Ship",
  settlement: "Settlement",
  faction:    "Faction",
  planet:     "Planet",
  location:   "Location",
  creature:   "Creature",
};

async function postDraftEntityCard(entities, _campaignState, options = {}) {
  if (!globalThis.ChatMessage?.create) return null;
  if (!entities?.length) return null;

  // Stable index lets click handlers identify the right draft after re-render.
  // We never reorder the array so the index in the flag matches the index in
  // the rendered DOM.
  const drafts = entities.map((e, idx) => ({ ...e, index: idx, status: "pending" }));

  const html = renderDraftCardHtml(drafts);

  const whisper = collectGmIds();

  // `source` is purely a telemetry flag — "paced_narrative" when the drafts
  // came from runPacedDetection, otherwise defaults to "move_resolution"
  // (the legacy / Path 2 path). Lets operators audit how often paced
  // detection is firing and what the GM does with those drafts without
  // adding an explicit UI.
  const source = options.source === "paced_narrative" ? "paced_narrative" : "move_resolution";

  try {
    return await ChatMessage.create({
      content: html,
      whisper,
      flags: {
        [MODULE_ID]: {
          draftEntityCard: true,
          drafts,
          source,
        },
      },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | entityExtractor: postDraftEntityCard failed:`, err);
    return null;
  }
}

/**
 * Render the HTML body of the draft entity card from a `drafts` array.
 * Pure / re-runnable so the renderChatMessage hook can rebuild after each
 * Confirm/Dismiss click.
 */
function renderDraftCardHtml(drafts) {
  const items = drafts.map((e) => {
    const glyph = TYPE_GLYPHS[e.type] ?? "◇";
    const label = TYPE_LABELS[e.type] ?? e.type;
    const desc  = e.description ? ` — ${escapeHtml(e.description)}` : "";
    const status = e.status ?? "pending";

    let actions;
    if (status === "confirmed") {
      actions = `<span class="sf-draft-status sf-draft-status-confirmed">✓ Confirmed</span>`;
    } else if (status === "dismissed") {
      actions = `<span class="sf-draft-status sf-draft-status-dismissed">✕ Dismissed</span>`;
    } else {
      actions =
        `<button class="sf-draft-btn sf-draft-confirm" ` +
        `data-action="sf-draft-confirm" data-index="${e.index}">Confirm</button>` +
        `<button class="sf-draft-btn sf-draft-dismiss" ` +
        `data-action="sf-draft-dismiss" data-index="${e.index}">Dismiss</button>`;
    }

    const rowClass = `sf-draft-row sf-draft-row-${status}`;
    return (
      `<li class="${rowClass}">` +
      `<div class="sf-draft-row-info">` +
      `[${glyph} ${escapeHtml(label)}] <strong>${escapeHtml(e.name)}</strong>${desc}` +
      `</div>` +
      `<div class="sf-draft-row-actions">${actions}</div>` +
      `</li>`
    );
  }).join("");

  const allResolved = drafts.every(d => d.status && d.status !== "pending");
  const hint = allResolved
    ? `<div class="sf-draft-entity-hint sf-draft-entity-hint-done">All entities reviewed.</div>`
    : `<div class="sf-draft-entity-hint">Confirm to add to the Entities panel; Dismiss to suppress this name.</div>`;

  return (
    `<div class="sf-draft-entity-card">` +
    `<div class="sf-draft-entity-label">◈ New Entities Detected</div>` +
    `<ul class="sf-draft-entity-list">${items}</ul>` +
    hint +
    `</div>`
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// DRAFT CARD — Confirm / Dismiss handlers
// ─────────────────────────────────────────────────────────────────────────────

const ENTITY_CREATORS = {
  connection: createConnection,
  ship:       createShip,
  settlement: createSettlement,
  faction:    createFaction,
  planet:     createPlanet,
  location:   createLocation,
  creature:   createCreature,
};

/**
 * Wire Confirm/Dismiss button clicks on draft entity chat cards. Idempotent:
 * registers a single chat-render hook that re-attaches listeners every
 * render. Call once at module ready.
 */
export function registerDraftCardHooks() {
  onChatMessageRender((message, root) => {
    const f = message?.flags?.[MODULE_ID];
    if (!f?.draftEntityCard) return;

    // Non-GMs see the card (they're whispered in) but cannot mutate state.
    // Hide buttons rather than wire dead handlers.
    if (!globalThis.game?.user?.isGM) {
      root.querySelectorAll(".sf-draft-btn").forEach(btn => { btn.style.display = "none"; });
      return;
    }

    root.querySelectorAll('[data-action="sf-draft-confirm"]').forEach(btn => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const idx = Number(btn.dataset.index);
        handleDraftConfirm(message, idx).catch(err =>
          console.error(`${MODULE_ID} | draft confirm failed:`, err));
      });
    });

    root.querySelectorAll('[data-action="sf-draft-dismiss"]').forEach(btn => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const idx = Number(btn.dataset.index);
        handleDraftDismiss(message, idx).catch(err =>
          console.error(`${MODULE_ID} | draft dismiss failed:`, err));
      });
    });
  });
}

async function handleDraftConfirm(message, draftIndex) {
  const drafts = Array.isArray(message?.flags?.[MODULE_ID]?.drafts)
    ? [...message.flags[MODULE_ID].drafts]
    : [];
  const draft = drafts.find(d => d.index === draftIndex);
  if (!draft || draft.status !== "pending") return;

  const creator = ENTITY_CREATORS[draft.type];
  if (!creator) {
    console.warn(`${MODULE_ID} | draft confirm: no creator for type "${draft.type}"`);
    return;
  }

  const campaignState = globalThis.game?.settings?.get(MODULE_ID, "campaignState") ?? {};

  let record = null;
  try {
    if (draft.type === "connection") {
      const seedData = buildConnectionSeedData(
        { name: draft.name, description: draft.description ?? "" },
        rollFreshConnectionSeed(),
      );
      record = await creator({
        name:                      seedData.name,
        description:               seedData.description,
        role:                      seedData.role,
        motivation:                seedData.motivation,
        portraitSourceDescription: seedData.portraitSource,
      }, campaignState);
      await registerConnectionOnActiveCharacter(record).catch(err =>
        console.warn(`${MODULE_ID} | entityExtractor: bond item registration failed:`, err));
    } else if (draft.type === "ship") {
      const seedData = buildShipSeedData(
        { name: draft.name, description: draft.description ?? "" },
        rollFreshShipSeed(),
      );
      record = await creator({
        name:                      seedData.name,
        description:               seedData.description,
        type:                      seedData.type,
        firstLook:                 seedData.firstLook,
        portraitSourceDescription: seedData.portraitSource,
      }, campaignState);
    } else {
      record = await creator({
        name:                      draft.name,
        description:               draft.description ?? "",
        // Seed the portrait source from the detected description so the entity
        // can generate art immediately instead of showing "Awaiting description".
        portraitSourceDescription: draft.description ?? "",
      }, campaignState);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | draft confirm: createXxx failed:`, err);
    if (globalThis.ui?.notifications?.warn) {
      globalThis.ui.notifications.warn(`Failed to create ${draft.type} "${draft.name}". See console.`);
    }
    return;
  }

  if (record) {
    await postCreationEnrichment(draft.type, record, campaignState);

    // Mirror a confirmed faction into the World Journal — Factions page so it
    // lands as established lore. The WJ faction loop (routeWorldJournalResults)
    // skips any faction that already has an entity record, so without this the
    // entity and the journal stay disconnected and the Factions page stays
    // empty (playtest finding).
    if (draft.type === "faction") {
      try {
        await recordFactionIntelligence(draft.name, {
          attitude: "unknown",
          summary:  draft.description ?? "",
          entityId: record._id,
        }, campaignState);
      } catch (err) {
        console.warn(`${MODULE_ID} | draft confirm: faction World Journal mirror failed:`, err?.message ?? err);
      }
    }

    // Promote any free-text fact-continuity ledger entries that were
    // captured against this name into entity-scoped entries pointing at
    // the new record. Without this rewrite, truths captured before the
    // entity existed stay text-bound forever and never migrate at scene
    // end. Idempotent — promoteTextSubject is a no-op when no matching
    // text subjects exist. (Priority 6 of the behaviour-coverage audit.)
    try {
      const { promoteTextSubject } = await import("../factContinuity/ledgers.js");
      const rewritten = promoteTextSubject(
        draft.name,
        { entityId: record._id, entityType: draft.type },
        campaignState,
      );
      if (rewritten > 0) {
        await globalThis.game?.settings?.set?.(MODULE_ID, "campaignState", campaignState);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | draft confirm: promoteTextSubject failed:`, err?.message ?? err);
    }
  }

  drafts.splice(drafts.indexOf(draft), 1, { ...draft, status: "confirmed" });
  await updateDraftCard(message, drafts);
}

async function handleDraftDismiss(message, draftIndex) {
  const drafts = Array.isArray(message?.flags?.[MODULE_ID]?.drafts)
    ? [...message.flags[MODULE_ID].drafts]
    : [];
  const draft = drafts.find(d => d.index === draftIndex);
  if (!draft || draft.status !== "pending") return;

  const campaignState = globalThis.game?.settings?.get(MODULE_ID, "campaignState") ?? {};
  const list = Array.isArray(campaignState.dismissedEntities)
    ? [...campaignState.dismissedEntities]
    : [];
  if (draft.name && !list.includes(draft.name)) list.push(draft.name);
  campaignState.dismissedEntities = list;

  try {
    await globalThis.game.settings.set(MODULE_ID, "campaignState", campaignState);
  } catch (err) {
    console.error(`${MODULE_ID} | draft dismiss: settings.set failed:`, err);
    return;
  }

  drafts.splice(drafts.indexOf(draft), 1, { ...draft, status: "dismissed" });
  await updateDraftCard(message, drafts);
}

async function updateDraftCard(message, drafts) {
  // The Confirm/Dismiss click handler chains: createEntity → settings.set →
  // updateDraftCard. The first two steps can take multiple socket round-trips
  // on Forge, and a GM (or test cleanup) can delete the draft card during
  // that window. When the message has already been deleted, message.update
  // raises "ChatMessage <id> does not exist!" and the resulting failed
  // ui.notifications.error on Foundry's side throws an uncaught TypeError
  // when no notification host is mounted. Skip silently when the message has
  // been removed from the collection.
  if (!message?.id || !globalThis.game?.messages?.get?.(message.id)) return;

  const content = renderDraftCardHtml(drafts);
  try {
    // Update content first, then flags via setFlag so we don't accidentally
    // clobber sibling flags (draftEntityCard, source) by passing a partial
    // flags object to message.update.
    await message.update({ content });
    await message.setFlag(MODULE_ID, "drafts", drafts);
  } catch (err) {
    // Same race as above — the message may be deleted between the existence
    // check and the update. Swallow "does not exist" quietly and only log
    // other failure modes.
    const msg = String(err?.message ?? err);
    if (msg.includes("does not exist")) return;
    console.error(`${MODULE_ID} | updateDraftCard failed:`, err);
  }
}

function collectGmIds() {
  try {
    const users = globalThis.game?.users;
    if (!users?.filter) return [];
    return users.filter(u => u.isGM).map(u => u.id);
  } catch {
    return [];
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Default API call (Haiku)
// ─────────────────────────────────────────────────────────────────────────────

async function defaultCallDetectionAPI(prompt) {
  return callHaiku(prompt, "Return only the JSON object — no prose.");
}

async function defaultCallTierAPI(prompt) {
  return callHaiku(prompt, "Return only the JSON object — no prose.");
}

async function callHaiku(userPrompt, systemPrompt) {
  const apiKey = readApiKey();
  if (!apiKey) return "";

  const body = {
    model:      HAIKU_MODEL,
    max_tokens: 600,
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userPrompt }],
  };

  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-beta":    "prompt-caching-2024-07-31",
  };

  const data = await apiPost(ANTHROPIC_URL, headers, body);
  return (data?.content ?? [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();
}

function readApiKey() {
  try {
    return globalThis.game?.settings?.get(MODULE_ID, "claudeApiKey") || null;
  } catch {
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function emptyDetection() {
  return {
    entities: [],
    worldJournal: {
      lore: [], threats: [], factionUpdates: [],
      locationUpdates: [], stateTransitions: [],
    },
  };
}

/**
 * Surface a detection-pipeline API failure to the GM (PLAYTEST-1717 B). Silent
 * loss of detected entities was the failure mode; a one-line toast tells the GM
 * the narration's entities were not captured and to check the console. GM-gated
 * (detection runs GM-side) and never throws — surfacing must not break the
 * pipeline it is reporting on.
 */
function notifyDetectionFailure() {
  try {
    if (!globalThis.game?.user?.isGM) return;
    globalThis.ui?.notifications?.warn?.(
      "Starforged Companion: entity detection failed — new entities from this narration " +
      "were not captured. See the console for details.",
    );
  } catch (err) {
    // Surfacing must never throw — a failed toast is itself a non-event.
    console.debug?.(`${MODULE_ID} | notifyDetectionFailure: notify failed:`, err?.message ?? err);
  }
}

function collectEstablishedEntityNames(campaignState) {
  if (!campaignState) return [];
  const names = new Set();
  // Player characters are established actors and must never be proposed as new
  // Connections (finding F). The downstream gate (entityExistsAnyType) also
  // checks PC names, but it exact-matches the normalized name — so a detection
  // of "Kylar" never matches the actor "Kylar Nazari" and slips through.
  // Listing the PCs here tells the detector model not to return them at all,
  // and it resolves first-name variants the exact gate cannot.
  try {
    for (const a of getPlayerActors()) {
      if (a?.name) names.add(a.name.trim());
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | collectEstablishedEntityNames: PC roster lookup failed:`, err?.message ?? err);
  }
  for (const [type, idsField] of Object.entries(ENTITY_ID_FIELDS)) {
    const getter = ENTITY_GETTERS[type];
    const ids    = campaignState[idsField] ?? [];
    for (const id of ids) {
      let rec = null;
      try { rec = getter(id); } catch { continue; }
      if (rec?.name) names.add(rec.name.trim());
    }
  }
  return [...names];
}

/**
 * Collect names that have been proposed in a still-pending "New Entities
 * Detected" draft card but not yet accepted into an entity record or
 * dismissed. Reading from chat is sufficient — the draft card carries the
 * full `drafts` array as a flag, and deleting the card (the de-facto
 * "dismiss" gesture) naturally drops the names from this list.
 *
 * Suppresses the same NPC being re-flagged on every subsequent narration
 * that mentions them.
 */
function collectPendingDraftNames() {
  try {
    const messages = globalThis.game?.messages?.contents ?? [];
    const names = new Set();
    for (const m of messages) {
      const f = m?.flags?.[MODULE_ID];
      if (!f?.draftEntityCard) continue;
      const drafts = Array.isArray(f.drafts) ? f.drafts : [];
      for (const d of drafts) {
        // Only "pending" drafts should suppress re-detection. Confirmed
        // drafts are now established entities (caught by collectEstablished-
        // EntityNames). Dismissed drafts are now in dismissedEntities.
        if (d?.status && d.status !== "pending") continue;
        if (d?.name && typeof d.name === "string") names.add(d.name.trim());
      }
    }
    return [...names];
  } catch {
    return [];
  }
}

function describeWorldJournalState(campaignState) {
  const safe = (fn) => { try { return fn() ?? []; } catch { return []; } };

  const confirmedLore = safe(() => getConfirmedLore(campaignState))
    .map(e => e.title).filter(Boolean);
  const assertedLore = safe(() => getNarratorAssertedLore(campaignState))
    .map(e => e.title).filter(Boolean);
  const threats = safe(() => getActiveThreats(campaignState))
    .map(t => `${t.name}: ${t.severity}`).filter(Boolean);
  const factions = safe(() => getFactionLandscape(campaignState))
    .map(f => `${f.factionName}: ${f.attitude}`).filter(Boolean);

  return { confirmedLore, assertedLore, threats, factions };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Register a confirmed Connection on the active character Actor as an
 * ironsworn `progress` Item with subtype "bond". This is what makes the
 * Connection appear under the character sheet's Connections tab with its
 * own progress track — mirroring what the system's built-in "+ Connection"
 * button does. With no active character (sector seeding, multi-PC setups
 * with no obvious target), this is a no-op.
 */
// Exported for the inciting-incident ⚔ Swear this vow flow (Cluster B).
export async function registerConnectionOnActiveCharacter(record) {
  if (!record?._id) return;
  const actors = getPlayerActors();
  const actor = actors?.[0];
  if (!actor) return;
  await createCharacterBondItem(actor, {
    name:         record.name,
    rank:         record.rank,
    connectionId: record._id,
  });
}
