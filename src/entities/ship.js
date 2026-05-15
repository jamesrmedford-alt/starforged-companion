/**
 * STARFORGED COMPANION
 * src/entities/ship.js — Ship records, hosted on foundry-ironsworn `starship`
 * Actor documents (Entity → Actor Migration Phase 2).
 *
 * The native starship schema (vendor/foundry-ironsworn/src/module/actor/
 * subtypes/starship.ts) carries `notes` (HTMLField) and `debility.{battered,
 * cursed}` (ImpactField — booleans). Everything else in the Starforged-side
 * Ship schema lives in `actor.flags["starforged-companion"].ship`.
 *
 * Field placement:
 *   actor.name                            ← ship.name (also kept on the flag)
 *   actor.img                             ← portrait dataUri (set by art pipeline)
 *   actor.system.notes                    ← ship.notes
 *   actor.system.debility.battered        ← ship.battered (clearable)
 *   actor.system.debility.cursed          ← ship.cursed (permanent, command vehicle only)
 *   actor.flags[MODULE].ship              ← full Starforged payload (see ShipSchema)
 *   actor.flags[MODULE].entityType        ← "ship" (routing crumb)
 *   actor.flags[MODULE].entityId          ← the Ship _id (preserved across migrations)
 *
 * Source: Starforged Reference Guide p.121 / Rulebook pp.55-65
 */

import {
  getOrCreateActorFolder,
} from "./folder.js";
import {
  getEntityDocument,
  readEntityFlag,
  writeEntityFlag,
} from "./registry.js";

const MODULE_ID = "starforged-companion";
const FLAG_KEY  = "ship";

export const ShipSchema = {
  _id:      "",
  name:     "",
  active:   true,
  isCommandVehicle: false,  // true = the STARSHIP asset; shared by all players

  // Oracle-derived details
  type:         "",    // Starship type oracle result
  firstLook:    "",    // Starship First Look oracle result
  mission:      "",    // Current mission

  // Condition meters
  integrity:    5,     // 0–5. Command vehicle and support vehicles.
  integrityMax: 5,

  // Vehicle impacts
  battered: false,     // Cleared by Repair. Can't raise integrity until cleared.
  cursed:   false,     // Permanent. Command vehicle only. Never cleared.

  // Narrative
  description:  "",
  history:      "",
  notes:        "",

  // Art
  portraitId:                null,
  portraitSourceDescription: "",

  // Crew / ownership
  ownerCharacterId: "",    // Primary owner (null for command vehicle — shared)

  // Support vehicles nested under a command vehicle
  supportVehicleIds: [],

  // Narrator entity-discovery flags (see narrator-entity-discovery scope §3)
  canonicalLocked: false,
  generativeTier:  [],

  createdAt: null,
  updatedAt: null,
};


export async function createShip(data, campaignState) {
  const now = new Date().toISOString();
  const id  = generateId();

  const ship = {
    ...ShipSchema,
    ...data,
    _id:       id,
    createdAt: now,
    updatedAt: now,
  };

  const folderId = await getOrCreateActorFolder("Starships");

  const actor = await Actor.create({
    name:   ship.name || "Unknown Ship",
    type:   "starship",
    folder: folderId,
    system: {
      notes: ship.notes ?? "",
      debility: {
        battered: !!ship.battered,
        cursed:   !!ship.cursed,
      },
    },
    flags:  {
      [MODULE_ID]: {
        [FLAG_KEY]:  ship,
        entityType:  "ship",
        entityId:    id,
      },
    },
  });

  if (!campaignState.shipIds) campaignState.shipIds = [];
  if (!campaignState.shipIds.includes(actor.id)) {
    campaignState.shipIds.push(actor.id);
    await persistCampaignState(campaignState);
  }

  return ship;
}

export function getShip(actorId) {
  try {
    const document = getEntityDocument("ship", actorId);
    return readEntityFlag("ship", document);
  } catch {
    return null;
  }
}

export function listShips(campaignState) {
  return (campaignState.shipIds ?? [])
    .map(id => getShip(id))
    .filter(Boolean);
}

export function getCommandVehicle(campaignState) {
  return listShips(campaignState).find(s => s.isCommandVehicle) ?? null;
}

export async function updateShip(actorId, updates) {
  const document = getEntityDocument("ship", actorId);
  if (!document) throw new Error(`Ship actor not found: ${actorId}`);

  const current = readEntityFlag("ship", document) ?? {};
  const updated = {
    ...current,
    ...updates,
    _id:       current._id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };

  // Enforce: cursed can only be set, never cleared
  if (current.cursed && updates.cursed === false) {
    console.warn(`${MODULE_ID} | Attempted to clear 'cursed' impact — this is permanent.`);
    updated.cursed = true;
  }

  // Enforce: integrity never exceeds max
  if (typeof updated.integrity === "number") {
    updated.integrity = Math.max(0, Math.min(updated.integrityMax ?? 5, updated.integrity));
  }

  // Mirror battered/cursed onto the native debility fields so the ironsworn
  // starship sheet renders them correctly (ImpactField widget). The flag
  // payload remains the source of truth for everything else.
  const systemPatch = {};
  if (updates.notes !== undefined)    systemPatch["system.notes"] = updated.notes ?? "";
  if (updates.battered !== undefined) systemPatch["system.debility.battered"] = !!updated.battered;
  if (current.cursed !== updated.cursed) systemPatch["system.debility.cursed"]   = !!updated.cursed;
  if (Object.keys(systemPatch).length) await document.update(systemPatch);

  await writeEntityFlag("ship", document, updated);

  if (updates.name && updates.name !== document.name) {
    await document.update({ name: updates.name });
  }

  return updated;
}

/**
 * Apply damage to a ship's integrity.
 * Clamps to 0. If integrity reaches 0, the caller should trigger
 * Withstand Damage.
 *
 * @param {string} actorId
 * @param {number} amount — Damage to apply (positive number)
 * @returns {Promise<Object>}
 */
export async function sufferDamage(actorId, amount) {
  const ship = getShip(actorId);
  if (!ship) throw new Error(`Ship not found: ${actorId}`);

  const newIntegrity = Math.max(0, ship.integrity - amount);
  return updateShip(actorId, { integrity: newIntegrity });
}

/**
 * Repair integrity (e.g. after a successful Repair move).
 * Does not clear battered — that requires spending repair points.
 *
 * @param {string} actorId
 * @param {number} amount — Points to restore
 * @returns {Promise<Object>}
 */
export async function repairIntegrity(actorId, amount) {
  const ship = getShip(actorId);
  if (!ship) throw new Error(`Ship not found: ${actorId}`);

  if (ship.battered) {
    console.warn(`${MODULE_ID} | Ship is battered — integrity cannot be raised until battered is cleared.`);
    return ship;
  }

  const newIntegrity = Math.min(ship.integrityMax ?? 5, ship.integrity + amount);
  return updateShip(actorId, { integrity: newIntegrity });
}

/**
 * Clear the battered impact (costs 2 repair points in the Repair move).
 *
 * @param {string} actorId
 * @returns {Promise<Object>}
 */
export async function clearBattered(actorId) {
  return updateShip(actorId, { battered: false });
}

export async function setPortraitId(actorId, artAssetId) {
  return updateShip(actorId, { portraitId: artAssetId });
}

export function isReadyForArtGeneration(ship) {
  return ship.active && !!ship.portraitSourceDescription && !ship.portraitId;
}

/**
 * Format a Ship for Loremaster context injection.
 *
 * @param {Object} ship
 * @returns {string}
 */
export function formatForContext(ship) {
  const parts = [`**${ship.name || "Unknown Ship"}**`];

  if (ship.type)        parts.push(`Type: ${ship.type}`);
  if (ship.mission)     parts.push(`Mission: ${ship.mission}`);

  const integrityStr = `Integrity: ${ship.integrity}/${ship.integrityMax ?? 5}`;
  const impacts = [ship.battered && "battered", ship.cursed && "cursed"].filter(Boolean);
  parts.push(impacts.length ? `${integrityStr} [${impacts.join(", ")}]` : integrityStr);

  if (ship.description)     parts.push(ship.description);

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
    console.error(`${MODULE_ID} | ship: persistCampaignState failed:`, err);
    throw err;
  }
}
