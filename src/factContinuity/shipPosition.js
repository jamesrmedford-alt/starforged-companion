/**
 * STARFORGED COMPANION
 * src/factContinuity/shipPosition.js
 *
 * Persistent position record for the player's command vehicle.
 * See docs/fact-continuity-scope.md §20.
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

const SOURCE_VALUES = new Set([
  "at_command",
  "set_a_course",
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
  const entities = collectEntitiesForIndex(campaignState);
  const index    = buildNameIndex(entities, []);
  const lookup   = ref.toLowerCase();

  const hit = index.get(lookup) ?? index.get(firstWord(lookup));
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

  const ship  = (shipName ?? "").trim() || "Command vehicle";
  const parts = [];
  if (settlement) parts.push(`near ${settlement}`);
  else if (planet) parts.push(`in orbit of ${planet}`);
  else if (free)   parts.push(free);

  const scope = [];
  if (planet && settlement) scope.push(planet);
  if (sector)               scope.push(sector);
  const scopeStr = scope.length ? ` (${scope.join(", ")})` : "";

  return `SHIP POSITION: ${ship} ${parts.join(" ")}${scopeStr}`.trim();
}

// ─────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────

function collectEntitiesForIndex(campaignState) {
  const out = [];
  push(out, campaignState?.settlements, "settlement");
  push(out, campaignState?.planets,     "planet");
  push(out, campaignState?.locations,   "location");
  push(out, campaignState?.ships,       "ship");
  push(out, campaignState?.factions,    "faction");
  push(out, campaignState?.connections, "connection");
  push(out, campaignState?.creatures,   "creature");
  return out;
}

function push(out, list, entityType) {
  if (!Array.isArray(list)) return;
  for (const e of list) {
    if (!e || typeof e !== "object") continue;
    out.push({
      _id:           e._id,
      journalId:     e.journalId ?? e._id,
      name:          e.name,
      entityType,
      // The buildNameIndex output preserves the entity object verbatim,
      // so anything we pass through here is reachable to the resolver
      // (sectorId for location-class records, settlementIds for planets).
      sectorId:      e.sectorId      ?? null,
      settlementIds: Array.isArray(e.settlementIds) ? e.settlementIds : null,
    });
  }
}

function resolvePlanetForSettlement(settlement, campaignState) {
  // Walk planets looking for one whose `settlementIds` contains the
  // settlement's id. Pre-PR #100 settlements lived as JournalEntries
  // and were referenced by `_id`; post-PR #100 they're location-typed
  // Actors with the same shape on the shadow record. Either way the
  // _id field is the join key.
  const planets = Array.isArray(campaignState?.planets) ? campaignState.planets : [];
  const needle  = settlement?._id;
  if (!needle) return null;
  for (const p of planets) {
    const ids = Array.isArray(p?.settlementIds) ? p.settlementIds : [];
    if (ids.includes(needle)) return p._id ?? null;
  }
  return null;
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
  if (!id) return "";
  const list = Array.isArray(campaignState?.settlements) ? campaignState.settlements : [];
  return list.find(s => s?._id === id)?.name ?? "";
}

function lookupPlanet(id, campaignState) {
  if (!id) return "";
  const list = Array.isArray(campaignState?.planets) ? campaignState.planets : [];
  return list.find(p => p?._id === id)?.name ?? "";
}

function lookupSector(id, campaignState) {
  if (!id) return "";
  const list = Array.isArray(campaignState?.sectors) ? campaignState.sectors : [];
  return list.find(s => s?.id === id)?.name ?? "";
}

function firstWord(s) {
  return String(s ?? "").split(/\s+/)[0]?.toLowerCase() ?? "";
}
