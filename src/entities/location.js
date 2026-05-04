/**
 * STARFORGED COMPANION
 * src/entities/location.js — Location records
 *
 * Locations are named specific places that are not settlements or planets:
 * derelicts, precursor vaults, named structures, battlefields, relay
 * stations, anomalies, ruins.
 *
 * They have:
 * — A type classification (derelict, vault, station, anomaly, ruin, other)
 * — Status (unexplored / visited / cleared / destroyed / unknown)
 * — Oracle-derived first look, feature, peril, opportunity
 * — Optional links to a sector and a parent settlement
 *
 * Locations don't have progress tracks or mechanical meters — they're
 * primarily narrative and context-injection entities.
 *
 * Storage: JournalEntry + JournalEntryPage, same pattern as planets.
 */

const MODULE_ID = "starforged-companion";
const FLAG_KEY  = "location";

export const LocationSchema = {
  _id:    "",
  name:   "",
  active: true,

  type:    "",  // "derelict" | "vault" | "station" | "anomaly" | "ruin" | "other"
  region:  "",  // sector/region
  status:  "",  // "unexplored" | "visited" | "cleared" | "destroyed" | "unknown"

  firstLook:   "",   // Derelict First Look / initial description
  feature:     "",   // Most recent significant feature
  peril:       "",   // Most recent peril
  opportunity: "",   // Most recent opportunity

  description: "",
  history:     "",
  notes:       "",

  // Art
  portraitId:                null,
  portraitSourceDescription: "",

  // Context injection
  sceneRelevant:  false,
  narratorNotes:  "",

  // Optional parent links
  sectorId:     null,
  settlementId: null,

  // Narrator entity-discovery flags (see narrator-entity-discovery scope §3)
  canonicalLocked: false,
  generativeTier:  [],

  createdAt: null,
  updatedAt: null,
};


export async function createLocation(data, campaignState) {
  const now = new Date().toISOString();
  const id  = generateId();

  const location = {
    ...LocationSchema,
    ...data,
    _id:       id,
    createdAt: now,
    updatedAt: now,
  };

  const entry = await JournalEntry.create({
    name:  location.name || "Unknown Location",
    flags: { [MODULE_ID]: { entityType: "location", entityId: id } },
  });

  await entry.createEmbeddedDocuments("JournalEntryPage", [{
    name:  "Location Data",
    type:  "text",
    flags: { [MODULE_ID]: { [FLAG_KEY]: location } },
  }]);

  if (!campaignState.locationIds) campaignState.locationIds = [];
  if (!campaignState.locationIds.includes(entry.id)) {
    campaignState.locationIds.push(entry.id);
    await persistCampaignState(campaignState);
  }

  return location;
}

export function getLocation(journalEntryId) {
  try {
    const entry = game.journal?.get(journalEntryId);
    const page  = entry?.pages?.contents?.[0];
    return page?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? null;
  } catch {
    return null;
  }
}

export function listLocations(campaignState) {
  return (campaignState.locationIds ?? [])
    .map(id => getLocation(id))
    .filter(Boolean);
}

export async function updateLocation(journalEntryId, updates) {
  const entry = game.journal?.get(journalEntryId);
  if (!entry) throw new Error(`Location journal entry not found: ${journalEntryId}`);

  const page    = entry.pages?.contents?.[0];
  const current = page?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? {};
  const updated = {
    ...current,
    ...updates,
    _id:       current._id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };

  await page.setFlag(MODULE_ID, FLAG_KEY, updated);

  if (updates.name && updates.name !== entry.name) {
    await entry.update({ name: updates.name });
  }

  return updated;
}

export async function setSceneRelevant(journalEntryId, value) {
  return updateLocation(journalEntryId, { sceneRelevant: value });
}

export async function setPortraitId(journalEntryId, artAssetId) {
  return updateLocation(journalEntryId, { portraitId: artAssetId });
}

export function isReadyForArtGeneration(location) {
  return location.active && !!location.portraitSourceDescription && !location.portraitId;
}

/**
 * Format a Location for narrator context injection.
 *
 * @param {Object} location
 * @returns {string}
 */
export function formatForContext(location) {
  const parts = [`**${location.name || "Unknown Location"}**`];

  if (location.type)   parts.push(location.type);
  if (location.status) parts.push(`Status: ${location.status}`);
  if (location.region) parts.push(`Region: ${location.region}`);

  if (location.feature)     parts.push(`Feature: ${location.feature}`);
  if (location.peril)       parts.push(`Peril: ${location.peril}`);
  if (location.opportunity) parts.push(`Opportunity: ${location.opportunity}`);

  if (location.description)   parts.push(location.description);
  if (location.narratorNotes) parts.push(`Note: ${location.narratorNotes}`);

  return parts.join(" | ");
}

function generateId() {
  try { return foundry.utils.randomID(); }
  catch { return Math.random().toString(36).slice(2, 10); }
}

async function persistCampaignState(campaignState) {
  try {
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
  } catch (err) {
    console.error(`${MODULE_ID} | location: persistCampaignState failed:`, err);
    throw err;
  }
}
