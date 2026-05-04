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
 *   - Lore   → WJ always
 *   - Threat → WJ always
 *   - Faction → WJ only if no entity record with that name exists, else
 *     handled via the entity generative tier
 *   - Location → same rule as faction
 *   - NPC / ship / creature → entity only, never WJ
 *
 * For interaction-class moves with matched entities, a separate Haiku call
 * (`appendGenerativeTierUpdates`) extracts narrator-added details and
 * appends them to the entity generativeTier flags.
 *
 * The Haiku call is injectable via options.callDetectionAPI for testing —
 * default uses apiPost from src/api-proxy.js.
 */

import { apiPost } from "../api-proxy.js";

import { getConnection,  createConnection }  from "./connection.js";
import { getSettlement } from "./settlement.js";
import { getFaction }    from "./faction.js";
import { getShip }       from "./ship.js";
import { getPlanet }     from "./planet.js";
import { getLocation }   from "./location.js";
import { getCreature }   from "./creature.js";

import {
  recordLoreDiscovery,
  recordThreat,
  recordFactionIntelligence,
  recordLocation,
  promoteLoreToConfirmed,
  applyStateTransition as wjApplyStateTransition,
  getConfirmedLore,
  getNarratorAssertedLore,
  getActiveThreats,
  getFactionLandscape,
} from "../world/worldJournal.js";

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
export async function runCombinedDetectionPass(
  narrationText, moveId, outcome, campaignState, options = {},
) {
  const prompt   = buildCombinedDetectionPrompt(narrationText, moveId, outcome, campaignState);
  const callAPI  = options.callDetectionAPI ?? defaultCallDetectionAPI;

  let raw;
  try {
    raw = await callAPI(prompt);
  } catch (err) {
    console.warn(`${MODULE_ID} | entityExtractor: detection API failed:`, err);
    return emptyDetection();
  }

  return parseDetectionResponse(raw, campaignState);
}


// ─────────────────────────────────────────────────────────────────────────────
// PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the single Haiku prompt covering both entity extraction (scope §9)
 * and World Journal state updates (WJ scope §5). The base entity-extraction
 * prompt is prefixed with the current WJ state so the model can detect
 * state transitions. Scopes for established entity names + dismissed names
 * are appended so the model does not re-suggest them.
 */
export function buildCombinedDetectionPrompt(narrationText, moveId, outcome, campaignState) {
  const established = collectEstablishedEntityNames(campaignState);
  const dismissed   = (campaignState?.dismissedEntities ?? []).filter(Boolean);

  const wjState = describeWorldJournalState(campaignState);

  return [
    `You are analysing an Ironsworn: Starforged narration.`,
    `Move: ${moveId}.`,
    `Outcome: ${outcome}.`,
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
    `        "narratorAsserted": true, "confirmed": false }`,
    `    ],`,
    `    "threats": [`,
    `      { "name": string, "type": string, "severity": string, "summary": string }`,
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
      .map(n => n.trim().toLowerCase()),
  );
  const established = new Set(
    collectEstablishedEntityNames(campaignState).map(n => n.toLowerCase()),
  );

  const filteredEntities = entities
    .filter(e => e && typeof e.name === "string" && e.name.trim())
    .filter(e => (e.confidence ?? "high") !== "low")
    .filter(e => !dismissed.has(e.name.trim().toLowerCase()))
    .filter(e => !established.has(e.name.trim().toLowerCase()));

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
 * @param {string}  [options.sessionId]
 * @returns {Promise<{ created: Array, queued: Array }>}
 */
export async function routeEntityDrafts(entities, campaignState, options = {}) {
  const created = [];
  const queued  = [];

  for (const entity of entities ?? []) {
    if (!entity?.name || !entity?.type) continue;
    if (!ENTITY_GETTERS[entity.type]) continue;
    if (entityExistsForName(entity.name, entity.type, campaignState)) continue;

    if (options.autoCreateConnection && entity.type === "connection" && !created.length) {
      try {
        const record = await createConnection({
          name:        entity.name,
          description: entity.description ?? "",
          firstAppearance: options.sessionId ?? "",
        }, campaignState);
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
    await postDraftEntityCard(queued, campaignState);
  }

  return { created, queued };
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

  for (const lore of wj.lore ?? []) {
    if (!lore?.title) continue;
    await recordLoreDiscovery(lore.title, {
      ...lore,
      narratorAsserted: true,
      confirmed:        lore.confirmed === true,
    }, campaignState);
  }

  for (const threat of wj.threats ?? []) {
    if (!threat?.name) continue;
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

  const target = name.trim().toLowerCase();
  const ids    = campaignState?.[idsField] ?? [];
  for (const journalId of ids) {
    let rec = null;
    try { rec = getter(journalId); }
    catch { continue; }
    if (rec?.name && rec.name.trim().toLowerCase() === target) return true;
  }
  return false;
}


// ─────────────────────────────────────────────────────────────────────────────
// GENERATIVE TIER UPDATES — interaction-class moves with matched entities
// ─────────────────────────────────────────────────────────────────────────────

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
    `Given the following entity records and a narration, identify any NEW`,
    `detail the narrator added about each entity that is NOT already in the`,
    `record below. Only return genuinely new observations, not restatements.`,
    ``,
    formatted,
    ``,
    `Return a single JSON object (no prose):`,
    `{ "updates": [ { "entityId": string, "detail": string } ] }`,
    ``,
    `entityId must match the id shown in the record header (e.g. "id: ABC123").`,
    `detail should be one short sentence — the new observation only.`,
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

async function postDraftEntityCard(entities, _campaignState) {
  if (!globalThis.ChatMessage?.create) return null;
  if (!entities?.length) return null;

  const items = entities.map(e => {
    const glyph = TYPE_GLYPHS[e.type] ?? "◇";
    const label = TYPE_LABELS[e.type] ?? e.type;
    const desc  = e.description ? ` — ${escapeHtml(e.description)}` : "";
    return `<li>[${glyph} ${escapeHtml(label)}] <strong>${escapeHtml(e.name)}</strong>${desc}</li>`;
  }).join("");

  const html =
    `<div class="sf-draft-entity-card">` +
    `<div class="sf-draft-entity-label">◈ New Entities Detected</div>` +
    `<ul class="sf-draft-entity-list">${items}</ul>` +
    `<div class="sf-draft-entity-hint">Open the Entities panel to confirm or dismiss.</div>` +
    `</div>`;

  const whisper = collectGmIds();

  try {
    return await ChatMessage.create({
      content: html,
      whisper,
      flags: {
        [MODULE_ID]: {
          draftEntityCard: true,
          drafts:          entities,
        },
      },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | entityExtractor: postDraftEntityCard failed:`, err);
    return null;
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

function collectEstablishedEntityNames(campaignState) {
  if (!campaignState) return [];
  const names = new Set();
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
