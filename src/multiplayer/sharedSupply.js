/**
 * STARFORGED COMPANION
 * src/multiplayer/sharedSupply.js — crew-shared supply track.
 *
 * Ironsworn: Starforged co-op / guided play shares ONE supply track across the
 * whole crew (health, spirit, and momentum stay per-character). The module
 * stores supply per-actor (`system.supply.value`), so we keep every player
 * character's supply in lockstep: when one changes — from a move, a suffer
 * outcome, Resupply, or a manual sheet edit — the canonical GM writes the new
 * value to the others. Solo play (a single PC) is a no-op. Mirrors the
 * shared-vow updateItem sync in swearVow.js.
 */

import { getPlayerActors, isPlayerCharacterActor } from "../character/actorBridge.js";
import { isCanonicalGM } from "./gmGate.js";

const MODULE_ID = "starforged-companion";

// Re-entrancy guard: the GM's sibling-writes must not cascade back through this
// same updateActor hook. Supply is one shared value, so a single flag suffices.
const _supplySyncInFlight = { active: false };

/** Read an actor's supply value (system.supply.value), or null if unreadable. */
function supplyOf(actor) {
  const v = Number(actor?.system?.supply?.value);
  return Number.isFinite(v) ? v : null;
}

/**
 * Pure: given the actor whose supply just changed and the full PC roster, return
 * the other player characters whose supply differs, paired with the value to set
 * them to. Skips the source actor and non-PC actors (NPC cards). Returns [] in
 * solo play or when everyone is already in lockstep. Exported for tests.
 *
 * @param {Actor} source
 * @param {Actor[]} allActors
 * @returns {Array<{ actor: Actor, value: number }>}
 */
export function computeSupplySyncUpdates(source, allActors) {
  const value = supplyOf(source);
  if (value === null) return [];
  const out = [];
  for (const actor of allActors ?? []) {
    if (!actor || actor.id === source?.id) continue;
    if (!isPlayerCharacterActor(actor)) continue;
    if (supplyOf(actor) !== value) out.push({ actor, value });
  }
  return out;
}

/**
 * Register the crew-shared supply sync. Single-writer via isCanonicalGM (the GM
 * holds write perms on every PC); a re-entrancy guard stops the sibling-writes
 * from cascading. Register once on ready (all clients; non-canonical no-op).
 */
export function registerSharedSupplyHook() {
  if (registerSharedSupplyHook._installed) return;
  registerSharedSupplyHook._installed = true;
  Hooks.on("updateActor", async (actor, change) => {
    try {
      if (!isCanonicalGM()) return;
      if (!isPlayerCharacterActor(actor)) return;
      if (change?.system?.supply?.value === undefined) return;  // only supply changes
      if (_supplySyncInFlight.active) return;                   // sibling-write cascade guard
      _supplySyncInFlight.active = true;
      try {
        for (const u of computeSupplySyncUpdates(actor, getPlayerActors())) {
          await u.actor.update({ "system.supply.value": u.value });
        }
      } finally {
        _supplySyncInFlight.active = false;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | shared-supply sync failed:`, err?.message ?? err);
    }
  });
}

