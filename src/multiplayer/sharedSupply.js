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
// still to propagate — its actor and the value that change set. A change that
// lands mid-pass becomes the next pass instead of being dropped (issue #300
// F05) — a single in-flight flag used to discard every supply update while a
// sync ran, so a second edit during one never reached the other PCs. The value
// is captured with the change, and a pass stops writing once a newer change
// is queued (issue #306 R03): an older pass's planned write used to land on a
// PC edited meanwhile, and the queued pass then read that PC's overwritten
// value, so the older value won.
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
 * @param {number} [value]  the value to sync to — the one the change set; the
 *   source's current supply when omitted
 * @returns {Array<{ actor: Actor, value: number }>}
 */
export function computeSupplySyncUpdates(source, allActors, value = supplyOf(source)) {
  if (!Number.isFinite(value)) return [];
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
      const value = Number(change.system.supply.value);
      if (!Number.isFinite(value)) return;
      _sync.next = { source: actor, value };
      if (_sync.running) return;                                // the running pass picks it up
      _sync.running = true;
      try {
        while (_sync.next) {
          const { source, value: target } = _sync.next;
          _sync.next = null;
          const writes = computeSupplySyncUpdates(source, getPlayerActors(), target);
          // The source too, when an older pass's write landed after its own edit.
          if (supplyOf(source) !== target) writes.unshift({ actor: source, value: target });
          for (const u of writes) {
            if (_sync.next) break;                              // a newer change: its pass writes everyone
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

