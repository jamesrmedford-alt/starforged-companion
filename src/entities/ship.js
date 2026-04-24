/**
 * STARFORGED COMPANION
 * src/entities/ship.js — Ship records (command vehicle + support vehicles)
 *
 * Ships have an integrity meter, can suffer battered/cursed impacts,
 * and may have support vehicles nested under the command vehicle.
 *
 * The command ship (STARSHIP asset) is a special case:
 * — It's shared across all players
 * — It can suffer the permanent "cursed" impact
 * — It has a name and portrait that persist across the campaign
 *
 * Support vehicles are secondary ships launched from the command vehicle.
 * They can be battered but not cursed.
 *
 * Incidental vehicles are not tracked here — they're ephemeral.
 *
 * Source: Starforged Reference Guide p.121 / Rulebook pp.55-65
 */

import { foundry } from "../foundry-shim.js";

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

  const entry = await JournalEntry.create({
    name:  ship.name || "Unknown Ship",
    flags: { [MODULE_ID]: { entityType: "ship", entityId: id } },
  });

  await entry.createEmbeddedDocuments("JournalEntryPage", [{
    name:  "Ship Data",
    type:  "text",
    flags: { [MODULE_ID]: { [FLAG_KEY]: ship } },
  }]);

  if (!campaignState.shipIds) campaignState.shipIds = [];
  if (!campaignState.shipIds.includes(entry.id)) {
    campaignState.shipIds.push(entry.id);
    await persistCampaignState(campaignState);
  }

  return ship;
}

export function getShip(journalEntryId) {
  try {
    const entry = game.journal?.get(journalEntryId);
    const page  = entry?.pages?.contents?.[0];
    return page?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? null;
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

export async function updateShip(journalEntryId, updates) {
  const entry = game.journal?.get(journalEntryId);
  if (!entry) throw new Error(`Ship journal entry not found: ${journalEntryId}`);

  const page    = entry.pages?.contents?.[0];
  const current = page?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? {};
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

  await page.setFlag(MODULE_ID, FLAG_KEY, updated);

  if (updates.name && updates.name !== entry.name) {
    await entry.update({ name: updates.name });
  }

  return updated;
}

/**
 * Apply damage to a ship's integrity.
 * Clamps to 0. If integrity reaches 0, the caller should trigger
 * Withstand Damage.
 *
 * @param {string} journalEntryId
 * @param {number} amount — Damage to apply (positive number)
 * @returns {Promise<Object>}
 */
export async function sufferDamage(journalEntryId, amount) {
  const ship = getShip(journalEntryId);
  if (!ship) throw new Error(`Ship not found: ${journalEntryId}`);

  const newIntegrity = Math.max(0, ship.integrity - amount);
  return updateShip(journalEntryId, { integrity: newIntegrity });
}

/**
 * Repair integrity (e.g. after a successful Repair move).
 * Does not clear battered — that requires spending repair points.
 *
 * @param {string} journalEntryId
 * @param {number} amount — Points to restore
 * @returns {Promise<Object>}
 */
export async function repairIntegrity(journalEntryId, amount) {
  const ship = getShip(journalEntryId);
  if (!ship) throw new Error(`Ship not found: ${journalEntryId}`);

  if (ship.battered) {
    console.warn(`${MODULE_ID} | Ship is battered — integrity cannot be raised until battered is cleared.`);
    return ship;
  }

  const newIntegrity = Math.min(ship.integrityMax ?? 5, ship.integrity + amount);
  return updateShip(journalEntryId, { integrity: newIntegrity });
}

/**
 * Clear the battered impact (costs 2 repair points in the Repair move).
 *
 * @param {string} journalEntryId
 * @returns {Promise<Object>}
 */
export async function clearBattered(journalEntryId) {
  return updateShip(journalEntryId, { battered: false });
}

export async function setPortraitId(journalEntryId, artAssetId) {
  return updateShip(journalEntryId, { portraitId: artAssetId });
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
  try { await game.settings.set(MODULE_ID, "campaignState", campaignState); }
  catch { /* non-Foundry context */ }
}
