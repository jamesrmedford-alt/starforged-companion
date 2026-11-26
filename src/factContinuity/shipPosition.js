/**
 * STARFORGED COMPANION
 * src/factContinuity/shipPosition.js
 *
 * Persistent position record for the player's command vehicle.
 * See issue #227 (Fact Continuity) §20.
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

import { buildNameIndex, resolveEntityName, activeSectorNamesakeFirst, hasCapitalForm, wholeWordPattern } from "../context/relevanceResolver.js";
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
 * The records a ship can be at — a position's anchors. A person, a ship, a
 * faction, a creature is not one: the word scan reads past their names to
 * the first place named (matchSeedAgainstIndex, issue #364
 * SHIP-SEED-NONSPATIAL-HIT-FIRST).
 */
const PLACE_TYPES = new Set(["settlement", "planet", "location"]);

/**
 * The empty / "no position" record. Returned when no seed resolves
 * and no free text was supplied — callers can decide whether to skip
 * writing or persist the cleared state.
 *
 * Every key is written, `narrationId` and `previous` included: the record
 * reaches the ship through `updateShip` → `setFlag`, which merges key by key
 * (the issue #321 U40 shape), so a key left out keeps the old record's value.
 * A narrator-sidecar move's `narrationId` and `previous` (issue #325 W07)
 * survived a later `!at`, Set a Course, expedition or token move, and an
 * X-Card on that narration then reverted the GM's move
 * (restoreShipPositionAfterXCard — SHIP-POSITION-FLAG-MERGE). Only a
 * narration's move sets them — and `tokenBefore`, where the sector-map token
 * stood before that narration's sync moved it (`{ sceneId, tokenId, x, y }`),
 * so the X-Card puts the token back too (issue #342 Z12).
 *
 * @returns {Object}
 */
export function emptyPosition() {
  return {
    sectorId:            null,
    nearestPlanetId:     null,
    nearestSettlementId: null,
    nearestLocationId:   null,
    freeText:            "",
    updatedAt:           null,
    updatedBy:           null,
    narrationId:         null,
    previous:            null,
    tokenBefore:         null,
  };
}

/** The words that name where a ship is going, not where she is. */
const DESTINATION_WORDS = /\b(?:bound\s+for|headed\s+(?:for|to|toward|towards)|heading\s+(?:for|to|toward|towards)|en\s+route\s+(?:to|for)|on\s+(?:a\s+)?course\s+(?:for|to)|making\s+for|toward|towards|on\s+(?:the|her|its)\s+way\s+to)\b/i;

/**
 * The part of a position phrase that says where the ship is: the words before
 * a destination's ("docked at Hollow Spire, bound for Bleakhold" → "docked at
 * Hollow Spire, "). The whole phrase when it names no destination.
 *
 * @param {string} ref
 * @returns {string}
 */
export function whereSheIsOf(ref) {
  const text = String(ref ?? "");
  const m = DESTINATION_WORDS.exec(text);
  return m ? text.slice(0, m.index) : text;
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
 * used. A name that is not a place's — a person, a ship, a faction, a
 * creature — is read past to the first place the seed names after it
 * (matchSeedAgainstIndex), and the record is that place's, as when the
 * place is named first: "alongside Kael's tug at Bleakhold" is a position
 * at Bleakhold, its free text empty (issue #364
 * SHIP-SEED-NONSPATIAL-HIT-FIRST — the connection Kael Dros was the hit, so
 * no place was recorded). Otherwise the seed is treated as free text.
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
  // roster directly. The index keeps the first entity of a name, so a name
  // several places share is the active sector's (activeSectorNamesakeFirst).
  const entities = activeSectorNamesakeFirst(
    Array.isArray(options.entities) ? options.entities : collectEntitiesForIndex(campaignState),
    campaignState.activeSectorId ?? null,
  );
  const index    = buildNameIndex(entities, []);

  // The first place the seed names, read on past any name that is not one —
  // but never past a destination's words: "leaving the clipped hauler, bound
  // for Bleakhold Station" says where she is going, not where she is, and it
  // was recorded "near Bleakhold Station" (issue #389 #8,
  // SHIP-BOUND-FOR-READ-AS-NEAR — the ARRIVAL-LOCATION-PHRASE-SPLIT family).
  // A seed that names no place before them is kept as its words.
  const hit = matchSeedAgainstIndex(index, whereSheIsOf(ref));
  switch (hit?.entityType) {
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
      // A recorded place (a derelict, vault, station): by its id, with the
      // name kept as text for older readers — it printed as bare free text,
      // "Wayfinder Derelict Kovash" (issue #326 W65).
      out.nearestLocationId = hit.journalId ?? hit._id ?? null;
      out.sectorId = resolveSectorForRecord(hit, campaignState);
      out.freeText = hit.name ?? ref;
      return out;
    }
    default: {
      // No place named — no name at all, or only a ship's, a faction's, a
      // connection's or a creature's, none of them spatial anchors. Keep the
      // narrated phrase as free text: the bare name dropped where the ship
      // is ("alongside the Covenant flagship" became "The Covenant" — issue
      // #321 U43).
      out.freeText = ref;
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
  // A recorded location, by its current name (the record's text if it is
  // gone): it gets the settlement treatment (issue #326 W65).
  const location   = position.nearestLocationId
    ? (lookupRecordName(position.nearestLocationId, campaignState, "location", "locations") || free)
    : "";
  if (!settlement && !planet && !sector && !free && !location) return "";

  const ship      = (shipName ?? "").trim() || "Command vehicle";
  const source    = position.updatedBy ?? null;
  // These recorders write the position only after ARRIVAL is confirmed:
  // set_a_course and finish_an_expedition hits mean "you reach your
  // destination" (play kit; the pipeline gates the write on a non-miss and
  // snaps the token) — scene_token is the Set a Course a token dropped ON a
  // pin starts — and !at is declarative. So they read as stationary. The
  // token's own place on the map (token_placement: placed, or moved off a
  // pin, no move made) reads "near" its nearest pin (decisions.md
  // 2026-06-12; issue #321 U53), as do the narrator sidecar, a manual entry
  // and an unknown source. (SHIP-TRANSIT-LINE fix — set_a_course used to
  // render "in transit to" after the ship had already arrived.)
  const docked = source === "set_a_course"
    || (source === "scene_token" && !isLegacyTokenPlacement(position))
    || source === "at_command" || source === "expedition";

  const parts = [];
  if (settlement) {
    if (docked) parts.push(`docked at ${settlement}`);
    else        parts.push(`near ${settlement}`);
  } else if (location) {
    parts.push(docked ? `docked at ${location}` : `near ${location}`);
  } else if (planet) {
    parts.push(`in orbit of ${planet}`);
  } else if (free) {
    parts.push(free);
  }

  const scope = [];
  if (planet && settlement) scope.push(planet);
  if (sector)               scope.push(sector);
  const scopeStr = scope.length ? ` (${scope.join(", ")})` : "";

  return `SHIP POSITION: ${ship} ${parts.join(" ")}${scopeStr}`.trim();
}

/**
 * A token's own place on the map recorded before issue #321 U53, which gave
 * it the `token_placement` source: it was written `scene_token`, the source a
 * Set a Course started by dropping the token on a pin writes, so the ship
 * read "docked at" a settlement it was only parked near until the token moved
 * again (known-issues OLD-SCENE-TOKEN-DOCKED). Such a record carries its pin's
 * label as free text beside the settlement id; an arrival never does — the
 * record a settlement arrival builds (inferShipPositionFromEntityId, or
 * inferShipPosition by name) leaves a settlement's free text empty. Pure.
 *
 * @param {Object|null} position
 * @returns {boolean}
 */
function isLegacyTokenPlacement(position) {
  return position?.updatedBy === "scene_token"
    && !!position.nearestSettlementId
    && typeof position.freeText === "string" && position.freeText.trim() !== "";
}

/**
 * The position record for an arrival at a place known by its host document
 * id — a token dropped on a sector pin names the settlement Actor the pin
 * links — rather than by a name, which a rename leaves behind and a namesake
 * in another sector matches first (issue #321 U52). The record is the one
 * inferShipPosition builds when a name resolves to that same entity. Pure.
 *
 * @param {string} entityId — a settlement, planet or location host document id
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {string} [options.source] — as inferShipPosition's
 * @returns {Object|null} the position record, or null when the id is not a
 *   settlement, planet or location (the caller falls back to the name)
 */
export function inferShipPositionFromEntityId(entityId, campaignState, options = {}) {
  if (!entityId) return null;
  for (const entityType of ["settlement", "planet", "location"]) {
    let record = null;
    try {
      record = readEntityFlag(entityType, getEntityDocument(entityType, entityId));
    } catch (err) {
      console.warn(`starforged-companion | shipPosition: read ${entityType} ${entityId} failed:`, err?.message ?? err);
    }
    if (!record) continue;

    const out = emptyPosition();
    out.updatedAt = new Date().toISOString();
    out.updatedBy = SOURCE_VALUES.has(options.source) ? options.source : "manual";
    const hit = { ...record, journalId: entityId };
    if (entityType === "settlement") {
      out.nearestSettlementId = entityId;
      out.nearestPlanetId     = resolvePlanetForSettlement(hit, campaignState);
    } else if (entityType === "planet") {
      out.nearestPlanetId = entityId;
    } else {
      out.nearestLocationId = entityId;
      out.freeText = record.name ?? "";
    }
    out.sectorId = resolveSectorForRecord(hit, campaignState);
    return out;
  }
  return null;
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
 * The multi-word names a seed holds whole: every indexed full name of two or
 * more words that occurs in it as whole words, in any case — as
 * relevanceResolver.matchNamesInNarration reads a name of more than one word
 * — as character spans in the seed's order, the longer kept where two
 * overlap. `asName`: the seed writes it as a name, each word the name
 * capitalises (a leading article aside) capitalised as written — "the
 * derelict starship" holds the site Derelict Starship's name in prose case.
 * For matchSeedAgainstIndex's word scan (issue #364
 * SHIP-SEED-PLACE-NAME-PREFIX-OF-SHIP).
 *
 * @param {Map<string, Object>} index — buildNameIndex's
 * @param {string} ref
 * @returns {Array<{ start: number, end: number, hit: Object, asName: boolean }>}
 */
function multiWordNamesIn(index, ref) {
  const capital = (w) => /^\p{Lu}/u.test(w);
  const asName  = (written, name) => {
    const said = written.split(/\s+/);
    return String(name ?? "").trim().split(/\s+/).every((w, i) => !capital(w)
      || (i === 0 && /^(?:the|a|an)$/iu.test(w)) || capital(said[i] ?? "") || !hasCapitalForm(said[i] ?? ""));
  };
  const found = [];
  for (const [key, entity] of index) {
    if (!/\s/u.test(key)) continue;
    for (const m of ref.matchAll(wholeWordPattern(key, "gi"))) {
      found.push({ start: m.index, end: m.index + m[0].length, hit: entity, asName: asName(m[0], entity?.name) });
    }
  }
  found.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const kept = [];
  for (const span of found) {
    if (!kept.some(k => span.start < k.end && k.start < span.end)) kept.push(span);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/**
 * Match a free-text seed against the name index with tolerance for the
 * phrasing narrators and players actually use (Cluster C / F5 gap 3):
 *
 *   "Lyra"                         → exact
 *   "Lyra's orbital graveyard"     → word scan → "Lyra"
 *   "the Vault of Tears"           → its whole name, read before its words
 *   "a derelict station above Kaan" → word scan → "Kaan", never "station"
 *   "holding off 734"              → word scan → "734" (Relay 734's part)
 *
 * Precedence: full ref → possessive-stripped full ref (exact index keys) →
 * a scan of the seed's capitalised words, leftmost first, each resolved
 * through resolveEntityName's bounded ladder: a full name, or one name part
 * a single entity has. A lowercase word is never looked up, so a common noun
 * cannot match a name part (issue #321 U43: "a derelict station" docked the
 * ship at Bleakhold Station). A word with no capital to write — a number, a
 * name in a script without case — is no lowercase word, and is looked up as
 * written (relevanceResolver.hasCapitalForm, the resolver's own rule for a
 * name part): the scan asked every word for a capital before the resolver
 * was asked, so "holding off 734" named no place — free text, and the
 * sector token stayed (issue #364 SHIP-SEED-NUMERIC-PART). Such words are
 * asked after the capitalised ones, leftmost first again: a capital says a
 * word is written as a name, and a number may be a quantity — "12 hours out
 * from Kaan" is Kaan's with an Outpost 12 on the map, as it was.
 *
 * Returns the first PLACE named — a settlement, a planet or a location — or
 * null. A name that is not a place's (a person, a ship, a faction, a
 * creature) is read past, in the same order, to the first place named after
 * it: "alongside Kael's tug at Bleakhold" is Bleakhold's — it was the
 * connection Kael Dros's, and inferShipPosition keeps a non-place hit's seed
 * as free text, so the position named no place (issue #364
 * SHIP-SEED-NONSPATIAL-HIT-FIRST, the maintainer's decision). A seed that is
 * such a name whole — "Kael Dros", "Kael's" — has nothing past it: null, as
 * does a phrase that names no place ("alongside the Covenant flagship", issue
 * #321 U43).
 *
 * A name of two or more words the seed holds whole is read whole before its
 * words (multiWordNamesIn): a non-place's words are taken out of the scan,
 * and a place's name, written as a name, is a hit where it stands in the
 * capitalised pass. Word by word, a ship or a person whose name holds a
 * one-word place's was that place — with a ship "Bleakhold Runner",
 * "alongside the Bleakhold Runner" put the ship at Bleakhold — and "orbiting
 * Kaan Deep" was the planet Kaan's (issue #364
 * SHIP-SEED-PLACE-NAME-PREFIX-OF-SHIP). Now the first names no place (free
 * text), "alongside the Bleakhold Runner at Kaan" is Kaan's, and the second
 * is Kaan Deep's. A place's name in prose case is left to the word scan, as
 * its lowercase words were: "the derelict starship off Kaan" is Kaan's.
 * Exported for unit testing.
 */
export function matchSeedAgainstIndex(index, ref) {
  const lookup = String(ref ?? "").toLowerCase();
  if (!lookup) return null;
  const stripPossessive = (s) => s.replace(/[’']s\b/gu, "");

  const isPlace = (hit) => PLACE_TYPES.has(hit?.entityType);

  // The seed whole: a place's name, or another's, with nothing past it.
  for (const candidate of [lookup, stripPossessive(lookup).trim()]) {
    const hit = index.get(candidate);
    if (hit) return isPlace(hit) ? hit : null;
  }

  const entities = [...new Set(index.values())];
  // The multi-word names it holds whole — a place's in prose case aside.
  const spans = multiWordNamesIn(index, String(ref)).filter(span => !isPlace(span.hit) || span.asName);
  const words = [...String(ref).matchAll(/\S+/gu)]
    .map(m => ({ word: m[0].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""), at: m.index, end: m.index + m[0].length }))
    .filter(w => w.word);
  // The capitalised words, then the words with no capital to write. A
  // lowercase word is in neither pass. A name that is not a place's is read
  // past; a multi-word name is read whole where it stands, in the first pass.
  for (const [pass, asked] of [(w) => /^\p{Lu}/u.test(w), (w) => !hasCapitalForm(w)].entries()) {
    for (const { word, at, end } of words) {
      const span = spans.find(s => at < s.end && s.start < end);
      if (span) {
        if (pass === 0 && isPlace(span.hit)) return span.hit;
        continue;
      }
      if (!asked(word)) continue;
      const hit = resolveEntityName(word, entities);
      if (isPlace(hit)) return hit;
    }
  }
  return null;
}
