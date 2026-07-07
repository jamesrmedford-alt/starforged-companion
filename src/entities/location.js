/**
 * STARFORGED COMPANION
 * src/entities/location.js — Location-of-interest records (derelicts, vaults,
 * stations, anomalies, ruins), hosted on foundry-ironsworn `location` Actor
 * documents with `system.subtype` carrying our custom type discriminator
 * (Phase 3 of the Entity → Actor Migration).
 *
 * Native location-actor schema (vendor/foundry-ironsworn/src/module/actor/
 * subtypes/location.ts) carries `subtype`, `klass`, `description` only. Our
 * `type` (derelict / vault / station / anomaly / ruin / other) maps to
 * `system.subtype`. Everything else lives in flags.
 *
 * Field placement (per issue #228 (Entity → Actor Migration) §3.2):
 *   actor.system.subtype  = location.type
 *   actor.system.klass    = null
 *   actor.system.description ← location.description
 *   actor.flags[MODULE].location  ← full Starforged payload
 *   actor.flags[MODULE].entityType ← "location"
 *   actor.flags[MODULE].entityId   ← preserved _id
 */

import { getOrCreateSectorActorFolder } from "./folder.js";
import {
  getEntityDocument,
  readEntityFlag,
  writeEntityFlag,
} from "./registry.js";

const MODULE_ID = "starforged-companion";
const FLAG_KEY  = "location";

export const LocationSchema = {
  _id:    "",
  name:   "",
  active: true,

  type:    "",  // "derelict" | "vault" | "station" | "anomaly" | "ruin" | "other"
  region:  "",  // sector/region label
  status:  "",  // "unexplored" | "visited" | "cleared" | "destroyed" | "unknown"

  firstLook:   "",
  feature:     "",
  peril:       "",
  opportunity: "",

  description: "",
  history:     "",
  notes:       "",

  // Art
  portraitId:                null,
  portraitSourceDescription: "",

  // Context injection
  sceneRelevant:  false,
  narratorNotes:  "",

  // Optional parent links — sectorId drives per-sector folder placement
  sectorId:     null,
  settlementId: null,

  // Narrator entity-discovery flags
  canonicalLocked: false,
  generativeTier:  [],

  createdAt: null,
  updatedAt: null,
};


export async function createLocation(data, campaignState, { persist = true } = {}) {
  const now = new Date().toISOString();
  const id  = generateId();

  const location = {
    ...LocationSchema,
    ...data,
    _id:       id,
    sectorId:  data.sectorId ?? campaignState?.activeSectorId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const folderId = await getOrCreateSectorActorFolder(location.sectorId, campaignState);

  const actor = await Actor.create({
    name:   location.name || "Unknown Location",
    type:   "location",
    folder: folderId,
    system: {
      subtype:     location.type || "other",
      klass:       null,
      description: location.description ?? "",
    },
    flags:  {
      [MODULE_ID]: {
        [FLAG_KEY]:  location,
        entityType:  "location",
        entityId:    id,
      },
    },
  });

  if (!campaignState.locationIds) campaignState.locationIds = [];
  if (!campaignState.locationIds.includes(actor.id)) {
    campaignState.locationIds.push(actor.id);
    if (persist) await persistCampaignState(campaignState);
  }

  return location;
}

export function getLocation(actorId) {
  try {
    return readEntityFlag("location", getEntityDocument("location", actorId));
  } catch {
    return null;
  }
}

/**
 * When the campaign's current location is a precursor vault or derelict,
 * return `{ kind, name, status }` (kind: "vault" | "derelict") — else null.
 * Used to make explore_a_waypoint's oracle seeds site-aware
 * (SITE-WAYPOINT-BLIND fix, 2026-07). Never throws.
 *
 * @param {Object} campaignState
 * @returns {{ kind: string, name: string, status: string } | null}
 */
export function getCurrentSiteKind(campaignState) {
  try {
    if (campaignState?.currentLocationType !== "location") return null;
    const loc = getLocation(campaignState.currentLocationId);
    if (!loc) return null;
    const kind = String(loc.type ?? "").toLowerCase();
    if (kind !== "vault" && kind !== "derelict") return null;
    return { kind, name: loc.name ?? "", status: loc.status ?? "" };
  } catch {
    return null;
  }
}

export function listLocations(campaignState) {
  return (campaignState.locationIds ?? [])
    .map(id => getLocation(id))
    .filter(Boolean);
}

export async function updateLocation(actorId, updates) {
  const document = getEntityDocument("location", actorId);
  if (!document) throw new Error(`Location actor not found: ${actorId}`);

  const current = readEntityFlag("location", document) ?? {};
  const updated = {
    ...current,
    ...updates,
    _id:       current._id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const systemPatch = {};
  if (updates.type !== undefined)        systemPatch["system.subtype"]     = updated.type || "other";
  if (updates.description !== undefined) systemPatch["system.description"] = updated.description ?? "";
  if (Object.keys(systemPatch).length) await document.update(systemPatch);

  await writeEntityFlag("location", document, updated);

  if (updates.name && updates.name !== document.name) {
    await document.update({ name: updates.name });
  }

  return updated;
}

export async function setSceneRelevant(actorId, value) {
  return updateLocation(actorId, { sceneRelevant: value });
}

export async function setPortraitId(actorId, artAssetId) {
  return updateLocation(actorId, { portraitId: artAssetId });
}

export function isReadyForArtGeneration(location) {
  return location.active && !!location.portraitSourceDescription && !location.portraitId;
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
