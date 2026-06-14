/**
 * STARFORGED COMPANION
 * src/factContinuity/shipPosition.js
 *
 * Persistent position record for the player's command vehicle.
 * See docs/fact-continuity/fact-continuity-scope.md §20.
 *
 * The narrator has no way to know where the ship physically is unless we
 * tell it. This module owns the inference: given a seed reference
 * (a name string, an entity id, or a `currentLocationId`), it resolves
 * the seed to a settlement / planet / location entity and produces a
 * populated position record. The actual write to the Ship Actor flag
 * lives at the call site (`updateShip(commandVehicleId, { position })`)
 * so this module stays pure.
 *
 * Sidecar special case: `{ subject: "ship", attribute: "position",
 * value: <destination> }` calls `inferShipPosition` and writes to the
 * ship entity rather than `sceneState` (§20.4). The caller is
 * responsible for filtering those state changes out of the ledger
 * before `applySidecar` runs.
 */

import { buildNameIndex } from "../context/relevanceResolver.js";
import { getEntityDocument, readEntityFlag } from "../entities/registry.js";

const SOURCE_VALUES = new Set([
  "at_command",
  "set_a_course",
  "expedition",          // finish_an_expedition arrival (Cluster C)
  "narrator_sidecar",
  "scene_token",
  "manual",
]);

/**
 * The empty / "no position" record. Returned when no seed resolves
 * and no free text was supplied — callers can decide whether to skip
 * writing or persist the cleared state.
 *
 * @returns {Object}
 */
export function emptyPosition() {
  return {
    sectorId:            null,
    nearestPlanetId:     null,
    nearestSettlementId: null,
    freeText:            "",
    updatedAt:           null,
    updatedBy:           null,
  };
}

/**
 * Infer a position record from a free-text seed reference and the
 * current campaign state. Pure — no I/O.
 *
 * The seed is matched against the same name index the relevance
 * resolver uses (settlements, planets, locations, ships, factions,
 * connections, creatures, characters). When a settlement matches, the
 * planet that owns it is also resolved if discoverable. When a planet
 * matches, the active sector is used as the sector. When a location
 * (derelict, station, anomaly) matches, the location's `sectorId` is
 * used. Otherwise the seed is treated as free text.
 *
 * @param {string} seedRef
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {"at_command"|"set_a_course"|"narrator_sidecar"|"scene_token"|"manual"} [options.source]
 * @returns {Object} position record (always returns; never throws)
 */
export function inferShipPosition(seedRef, campaignState, options = {}) {
  const source = SOURCE_VALUES.has(options.source) ? options.source : "manual";
  const now    = new Date().toISOString();
  const out    = emptyPosition();
  out.updatedAt = now;
  out.updatedBy = source;

  const ref = typeof seedRef === "string" ? seedRef.trim() : "";
  if (!ref || !campaignState) {
    out.freeText = ref;
    return out;
  }

  // Build a single name index across the seven entity kinds the
  // relevance resolver tracks. We do not pass `dismissedEntities`
  // here — a settlement the GM dismissed from a draft card still
  // exists as a real location once the GM accepts it, and we want a
  // best-effort match against everything currently present.
  // `options.entities` lets tests (or pre-hydrated callers) inject the
  // roster directly.
  const entities = Array.isArray(options.entities)
    ? options.entities
    : collectEntitiesForIndex(campaignState);
  const index    = buildNameIndex(entities, []);

  const hit = matchSeedAgainstIndex(index, ref);
  if (!hit) {
    out.freeText = ref;
    return out;
  }

  switch (hit.entityType) {
    case "settlement": {
      out.nearestSettlementId = hit.journalId ?? hit._id ?? null;
      out.nearestPlanetId     = resolvePlanetForSettlement(hit, campaignState);
      out.sectorId            = resolveSectorForRecord(hit, campaignState);
      return out;
    }
    case "planet": {
      out.nearestPlanetId = hit.journalId ?? hit._id ?? null;
      out.sectorId        = resolveSectorForRecord(hit, campaignState);
      return out;
    }
    case "location": {
      out.sectorId = resolveSectorForRecord(hit, campaignState);
      out.freeText = hit.name ?? ref;
      return out;
    }
    default: {
      // Ship / faction / connection / creature / character — none of
      // these are spatial anchors. Fall through to free-text capture.
      out.freeText = hit.name ?? ref;
      return out;
    }
  }
}

/**
 * Render the position record as a short, prompt-injectable line for
 * Section 6.5 of the narrator system prompt.
 *
 *   SHIP POSITION: Pioneer's Pride near Bleakhold Station (Bleakhold,
 *   Outlands)
 *
 * Returns the empty string when the record carries no information.
 *
 * @param {Object|null} position
 * @param {Object} campaignState
 * @param {string} [shipName]
 * @returns {string}
 */
export function formatShipPositionLine(position, campaignState, shipName = "") {
  if (!position || typeof position !== "object") return "";
  const settlement = lookupSettlement(position.nearestSettlementId, campaignState);
  const planet     = lookupPlanet(position.nearestPlanetId, campaignState);
  const sector     = lookupSector(position.sectorId, campaignState);
  const free       = (position.freeText ?? "").trim();
  if (!settlement && !planet && !sector && !free) return "";

  const ship      = (shipName ?? "").trim() || "Command vehicle";
  const source    = position.updatedBy ?? null;
  // Derive mobility status from how the position was last recorded.
  // set_a_course means DESTINATION (ship hasn't arrived yet → in transit).
  // scene_token / at_command / expedition mean ARRIVAL (ship is stationary).
  const inTransit = source === "set_a_course";
  const docked    = source === "scene_token" || source === "at_command" || source === "expedition";

  const parts = [];
  if (settlement) {
    if (docked)         parts.push(`docked at ${settlement}`);
    else if (inTransit) parts.push(`in transit to ${settlement}`);
    else                parts.push(`near ${settlement}`);
  } else if (planet) {
    if (inTransit)      parts.push(`in transit to ${planet}`);
    else                parts.push(`in orbit of ${planet}`);
  } else if (free) {
    if (inTransit)      parts.push(`in transit (${free})`);
    else                parts.push(free);
  }

  const scope = [];
  if (planet && settlement) scope.push(planet);
  if (sector)               scope.push(sector);
  const scopeStr = scope.length ? ` (${scope.join(", ")})` : "";

  return `SHIP POSITION: ${ship} ${parts.join(" ")}${scopeStr}`.trim();
}

// ─────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────

// Per entity kind: the campaignState id list that locates its host document
// (registry.js), and the legacy in-state record array kept for callers/tests
// that pass pre-hydrated state. Production campaignState carries ONLY the
// `*Ids` arrays — the original implementation read `campaignState.settlements`
// etc., which the schema never stored, so the name index was always empty in
// live worlds and every position degraded to free text (finding #5).
const INDEX_SOURCES = [
  { entityType: "settlement", idsField: "settlementIds", recordsField: "settlements" },
  { entityType: "planet",     idsField: "planetIds",     recordsField: "planets"     },
  { entityType: "location",   idsField: "locationIds",   recordsField: "locations"   },
  { entityType: "ship",       idsField: "shipIds",       recordsField: "ships"       },
  { entityType: "faction",    idsField: "factionIds",    recordsField: "factions"    },
  { entityType: "connection", idsField: "connectionIds", recordsField: "connections" },
  { entityType: "creature",   idsField: "creatureIds",   recordsField: "creatures"   },
];

function collectEntitiesForIndex(campaignState) {
  const out = [];
  for (const { entityType, idsField, recordsField } of INDEX_SOURCES) {
    // Live documents first — `journalId` is the host document id, the id
    // space getSettlement / the scene-pin actorId flags / updateShip share.
    const ids = Array.isArray(campaignState?.[idsField]) ? campaignState[idsField] : [];
    for (const id of ids) {
      let record = null;
      try {
        record = readEntityFlag(entityType, getEntityDocument(entityType, id));
      } catch { record = null; }
      if (record) pushOne(out, record, entityType, id);
    }
    // Pre-hydrated record arrays second (legacy callers, unit fixtures).
    const records = campaignState?.[recordsField];
    if (Array.isArray(records)) {
      for (const e of records) pushOne(out, e, entityType, null);
    }
  }
  return out;
}

function pushOne(out, e, entityType, documentId) {
  if (!e || typeof e !== "object") return;
  out.push({
    _id:           e._id,
    journalId:     documentId ?? e.journalId ?? e._id,
    name:          e.name,
    entityType,
    // The buildNameIndex output preserves the entity object verbatim,
    // so anything we pass through here is reachable to the resolver
    // (sectorId for location-class records, settlementIds for planets).
    sectorId:      e.sectorId      ?? null,
    settlementIds: Array.isArray(e.settlementIds) ? e.settlementIds : null,
  });
}

function resolvePlanetForSettlement(settlement, campaignState) {
  // Walk planets looking for one whose `settlementIds` contains the
  // settlement's id. Records may key the join on either the module GUID
  // (`_id`) or the host document id depending on when they were created,
  // so both are tried.
  const needles = [settlement?._id, settlement?.journalId].filter(Boolean);
  if (!needles.length) return null;
  for (const { record, documentId } of iterRecords(campaignState, "planet", "planetIds", "planets")) {
    const ids = Array.isArray(record?.settlementIds) ? record.settlementIds : [];
    if (needles.some(n => ids.includes(n))) return documentId ?? record._id ?? null;
  }
  return null;
}

/**
 * Yield { record, documentId } for an entity kind — live documents first
 * (via the registry and the campaignState `*Ids` list), then any
 * pre-hydrated in-state record array (legacy callers, unit fixtures).
 */
function* iterRecords(campaignState, entityType, idsField, recordsField) {
  const ids = Array.isArray(campaignState?.[idsField]) ? campaignState[idsField] : [];
  for (const id of ids) {
    let record = null;
    try {
      record = readEntityFlag(entityType, getEntityDocument(entityType, id));
    } catch (err) {
      console.warn(`starforged-companion | shipPosition: read ${entityType} ${id} failed:`, err?.message ?? err);
    }
    if (record) yield { record, documentId: id };
  }
  const records = campaignState?.[recordsField];
  if (Array.isArray(records)) {
    for (const record of records) {
      if (record && typeof record === "object") yield { record, documentId: null };
    }
  }
}

function resolveSectorForRecord(record, campaignState) {
  // Two precedences:
  //   1) An explicit `sectorId` on the location record (sector-creator
  //      authored entities carry this).
  //   2) `campaignState.activeSectorId` as the implicit fallback.
  if (record?.sectorId) return record.sectorId;
  return campaignState?.activeSectorId ?? null;
}

function lookupSettlement(id, campaignState) {
  return lookupRecordName(id, campaignState, "settlement", "settlements");
}

function lookupPlanet(id, campaignState) {
  return lookupRecordName(id, campaignState, "planet", "planets");
}

// A position record's nearest* ids are host document ids (post-#5);
// records written before that fix carried module GUIDs, and unit fixtures
// pass pre-hydrated arrays — so resolve document-first, then scan any
// in-state record array matching on either id space.
function lookupRecordName(id, campaignState, entityType, recordsField) {
  if (!id) return "";
  try {
    const name = readEntityFlag(entityType, getEntityDocument(entityType, id))?.name;
    if (name) return name;
  } catch (err) {
    // Fall through to the in-state scan.
    console.warn(`starforged-companion | shipPosition: lookup ${entityType} ${id} failed:`, err?.message ?? err);
  }
  const list = Array.isArray(campaignState?.[recordsField]) ? campaignState[recordsField] : [];
  return list.find(r => r?._id === id || r?.journalId === id)?.name ?? "";
}

function lookupSector(id, campaignState) {
  if (!id) return "";
  const list = Array.isArray(campaignState?.sectors) ? campaignState.sectors : [];
  return list.find(s => s?.id === id)?.name ?? "";
}

/**
 * Match a free-text seed against the name index with tolerance for the
 * phrasing narrators and players actually use (Cluster C / F5 gap 3):
 *
 *   "Lyra"                     → exact
 *   "Lyra's orbital graveyard" → possessive-stripped word scan → "lyra"
 *   "the Vault of Tears"       → word scan (words ≥ 4 chars; leftmost wins)
 *
 * Precedence: full ref → possessive-stripped full ref → per-word scan
 * (possessives stripped, punctuation trimmed, words shorter than 4 chars
 * skipped so "the"/"of" can't false-positive). Returns the index hit or
 * null. Exported for unit testing.
 */
export function matchSeedAgainstIndex(index, ref) {
  const lookup = String(ref ?? "").toLowerCase();
  if (!lookup) return null;
  const stripPossessive = (s) => s.replace(/[’']s\b/gu, "");

  for (const candidate of [lookup, stripPossessive(lookup).trim()]) {
    const hit = index.get(candidate);
    if (hit) return hit;
  }

  for (const raw of stripPossessive(lookup).split(/\s+/)) {
    const word = raw.replace(/[^\p{L}\p{N}-]/gu, "");
    if (word.length < 4) continue;
    const hit = index.get(word);
    if (hit) return hit;
  }
  return null;
}
