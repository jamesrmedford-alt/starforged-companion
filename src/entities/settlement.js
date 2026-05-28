/**
 * STARFORGED COMPANION
 * src/entities/settlement.js — Settlement records, hosted on foundry-ironsworn
 * `location` Actor documents with `system.subtype='settlement'` (Phase 3 of
 * the Entity → Actor Migration).
 *
 * Native location-actor schema (vendor/foundry-ironsworn/src/module/actor/
 * subtypes/location.ts) carries `subtype`, `klass`, `description` only.
 * `klass` carries our location-class enum (Planetside / Orbital / Deep Space);
 * everything else lives in flags.
 *
 * Field placement (per docs/entity-actor-migration-scope.md §3.2):
 *   actor.system.subtype  = "settlement"
 *   actor.system.klass    = settlement.location  (Planetside/Orbital/Deep Space)
 *   actor.system.description ← settlement.description
 *   actor.flags[MODULE].settlement  ← full Starforged payload
 *   actor.flags[MODULE].entityType  ← "settlement"
 *   actor.flags[MODULE].entityId    ← preserved _id
 *
 * Storage moved off of JournalEntry pages — the legacy duplication of
 * settlement-instance fields across the sector-record JournalEntry's embedded
 * pages and the `campaignState.sectors[].settlements[]` array entries is
 * resolved by §3.5: the Actor is now the single mutable source.
 */

import { getOrCreateSectorActorFolder } from "./folder.js";
import {
  getEntityDocument,
  readEntityFlag,
  writeEntityFlag,
} from "./registry.js";

const MODULE_ID = "starforged-companion";
const FLAG_KEY  = "settlement";

export const SettlementSchema = {
  _id:      "",
  name:     "",
  active:   true,

  // Oracle-derived details (populated progressively)
  location:       "",    // "Planetside" | "Orbital" | "Deep Space" — also mirrored to system.klass
  population:     "",    // "Few" | "Dozens" | "Hundreds" | "Thousands" | "Tens of thousands"
  firstLook:      "",
  initialContact: "",
  authority:      "",
  projects:       [],
  trouble:        "",

  // Narrative
  description: "",
  history:     "",
  notes:       "",

  // Art
  portraitId:                  null,
  portraitSourceDescription:   "",

  // Context injection
  sceneRelevant:   false,
  loremasterNotes: "",

  // Linked entities
  connectionIds: [],

  // Sector membership — drives per-sector folder placement
  sectorId: null,

  // Set true when this entity was authored by the sector creator (or any
  // other canonical source) and should not be overwritten by narrator
  // entity discovery.
  canonicalLocked: false,

  // Narrator entity-discovery flags
  generativeTier: [],

  createdAt: null,
  updatedAt: null,
};


/**
 * Create a settlement Actor and register its id in campaignState.settlementIds.
 *
 * @param {Object} data — Partial SettlementSchema fields. `sectorId` (optional)
 *   determines folder placement; defaults to `campaignState.activeSectorId`.
 * @param {Object} campaignState
 * @param {Object} [opts]
 * @param {boolean} [opts.persist=true] — When false, mutate campaignState in
 *   place but skip the game.settings.set write. Used by sectorGenerator's
 *   createEntityJournals so a single batched write happens at the end of
 *   storeSector instead of N+1 sequential writes that race against each other.
 */
export async function createSettlement(data, campaignState, { persist = true } = {}) {
  const now = new Date().toISOString();
  const id  = generateId();

  const settlement = {
    ...SettlementSchema,
    ...data,
    _id:       id,
    projects:  data.projects ?? [],
    sectorId:  data.sectorId ?? campaignState?.activeSectorId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const folderId = await getOrCreateSectorActorFolder(settlement.sectorId, campaignState);

  const actor = await Actor.create({
    name:   settlement.name || "Unknown Settlement",
    type:   "location",
    folder: folderId,
    system: {
      subtype:     "settlement",
      klass:       settlement.location ?? null,
      description: settlement.description ?? "",
    },
    flags:  {
      [MODULE_ID]: {
        [FLAG_KEY]:  settlement,
        entityType:  "settlement",
        entityId:    id,
      },
    },
  });

  if (!campaignState.settlementIds) campaignState.settlementIds = [];
  if (!campaignState.settlementIds.includes(actor.id)) {
    campaignState.settlementIds.push(actor.id);
    if (persist) await persistCampaignState(campaignState);
  }

  return settlement;
}

export function getSettlement(actorId) {
  try {
    return readEntityFlag("settlement", getEntityDocument("settlement", actorId));
  } catch (err) {
    console.error(`${MODULE_ID} | getSettlement(${actorId}) failed:`, err);
    return null;
  }
}

export function listSettlements(campaignState) {
  return (campaignState.settlementIds ?? [])
    .map(id => getSettlement(id))
    .filter(Boolean);
}

export async function updateSettlement(actorId, updates) {
  const document = getEntityDocument("settlement", actorId);
  if (!document) throw new Error(`Settlement actor not found: ${actorId}`);

  const current = readEntityFlag("settlement", document) ?? {};
  const updated = {
    ...current,
    ...updates,
    _id:       current._id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const systemPatch = {};
  if (updates.location !== undefined)    systemPatch["system.klass"]       = updated.location ?? null;
  if (updates.description !== undefined) systemPatch["system.description"] = updated.description ?? "";
  if (Object.keys(systemPatch).length) await document.update(systemPatch);

  await writeEntityFlag("settlement", document, updated);

  if (updates.name && updates.name !== document.name) {
    await document.update({ name: updates.name });
  }

  return updated;
}

export async function setSceneRelevant(actorId, value) {
  return updateSettlement(actorId, { sceneRelevant: value });
}

export async function setPortraitId(actorId, artAssetId) {
  return updateSettlement(actorId, { portraitId: artAssetId });
}

export function isReadyForArtGeneration(settlement) {
  return settlement.active && !!settlement.portraitSourceDescription && !settlement.portraitId;
}

/**
 * Format a Settlement for narrator context injection.
 * Used when the scene is set at this location.
 *
 * @param {Object} settlement
 * @returns {string}
 */
export function formatForContext(settlement) {
  const parts = [`**${settlement.name || "Unknown Settlement"}**`];

  if (settlement.location)   parts.push(`Location: ${settlement.location}`);
  if (settlement.population) parts.push(`Population: ${settlement.population}`);
  if (settlement.authority)  parts.push(`Authority: ${settlement.authority}`);
  if (settlement.trouble)    parts.push(`Current trouble: ${settlement.trouble}`);

  if (settlement.projects?.length) {
    parts.push(`Projects: ${settlement.projects.join(", ")}`);
  }

  if (settlement.description)     parts.push(settlement.description);
  if (settlement.loremasterNotes) parts.push(`Note: ${settlement.loremasterNotes}`);

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
    console.error(`${MODULE_ID} | settlement: persistCampaignState failed:`, err);
    throw err;
  }
}
