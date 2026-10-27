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

// The canonical GM marks its sibling writes with this update option, so the
// hook can tell its own mirror writes from independent changes.
const MIRROR_OPTION = "sharedSupplyMirror";

// A sync pass is writing siblings; `next` is the newest independent change
// still to propagate. A change that lands mid-pass becomes the next pass
// (from its live value) instead of being dropped (issue #300 F05) — a single
// in-flight flag used to discard every supply update while a sync ran, so a
// second edit during one never reached the other PCs.
const _sync = { running: false, next: null };

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
 * holds write perms on every PC); its sibling writes carry an update option so
 * they never cascade back through this hook, and independent changes that
 * land mid-sync are queued, newest wins. Register once on ready (all clients;
 * non-canonical no-op).
 */
export function registerSharedSupplyHook() {
  if (registerSharedSupplyHook._installed) return;
  registerSharedSupplyHook._installed = true;
  Hooks.on("updateActor", async (actor, change, options) => {
    try {
      if (!isCanonicalGM()) return;
      if (!isPlayerCharacterActor(actor)) return;
      if (change?.system?.supply?.value === undefined) return;  // only supply changes
      if (options?.[MODULE_ID]?.[MIRROR_OPTION]) return;        // our own sibling write
      _sync.next = actor;
      if (_sync.running) return;                                // the running pass picks it up
      _sync.running = true;
      try {
        while (_sync.next) {
          const source = _sync.next;
          _sync.next = null;
          for (const u of computeSupplySyncUpdates(source, getPlayerActors())) {
            await u.actor.update({ "system.supply.value": u.value }, { [MODULE_ID]: { [MIRROR_OPTION]: true } });
          }
        }
      } finally {
        _sync.running = false;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | shared-supply sync failed:`, err?.message ?? err);
    }
  });
}

