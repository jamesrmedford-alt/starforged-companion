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
 *
 * A sheet edit moves the crew's supply by what it changed on that sheet: the
 * client that makes the edit stamps the sheet's value before it into the
 * update's options, as the shared legacies do (sharedLegacies.js, issue #347
 * AB07), and the canonical GM applies the difference to the supply most of
 * the crew's sheets hold. A sheet that lagged the crew's — a PC made since,
 * an imported one, a mirror write refused — set every PC to its own value
 * (issue #347 SUPPLY-LAGGING-SHEET). A PC created mid-session starts at the
 * crew's supply.
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
//
// `next` is `{ source, absolute, delta, first }`: an edit whose sheet value
// before it is known adds its change to `delta` (two quick ◂ are two), and
// one whose value before is unknown — made where this module did not stamp it
// — sets `absolute` (the newest wins), with the changes queued after it added
// on top. `first` is the first stamped edit's `{ source, before }`, read for
// the crew's supply before the pass's changes.
const _sync = { running: false, next: null };

// A sheet edit's supply before it was made — stamped into the update's options
// by the client making the edit (preUpdateActor runs there while the document
// still holds the old value); the options reach the canonical GM's updateActor
// with the change.
const BEFORE_OPTION = "sharedSupplyBefore";

// A condition meter's range (foundry-ironsworn ConditionMeterField; actorBridge clamps to it).
const SUPPLY_MIN = 0;
const SUPPLY_MAX = 5;

/** Read an actor's supply value (system.supply.value), or null if unreadable. */
function supplyOf(actor) {
  const v = Number(actor?.system?.supply?.value);
  return Number.isFinite(v) ? v : null;
}

/** The supply value an update sets — expanded or flattened — or undefined. */
function supplyChange(change) {
  const expanded = change?.system?.supply?.value;
  return expanded !== undefined ? expanded : change?.["system.supply.value"];
}

/** The value most of `values` hold — a tie going to `preferred`'s count when it ties. */
function mostHeld(values, preferred) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = preferred;
  for (const [v, n] of counts) if (n > (counts.get(best) ?? 0)) best = v;
  return best;
}

/**
 * The crew's supply before an edit: the value most of the crew's sheets hold —
 * the other PCs' now, and the edited sheet's before the edit — a tie going to
 * the edited sheet's. In lockstep that is every sheet's value.
 *
 * @param {Actor} source — the edited PC
 * @param {number} before — its supply before the edit
 * @param {Actor[]} allActors
 * @returns {number}
 */
function crewSupplyBefore(source, before, allActors) {
  const others = supplyAllies(source, allActors).map(supplyOf).filter(v => v !== null);
  return mostHeld([before, ...others], before);
}

// The last pass this GM ran: the crew's supply it started from and the one it
// set. An edit made against either — its sheet in step with the crew then,
// whether or not that pass's write had reached it — moves the crew's supply
// from the one the pass set: two players who each spend one at once spend
// two. Forgotten when the supply moves where this GM did not move it.
let _lastPass = null;   // { base: number, target: number }

/** Test seam — this GM has run no pass. */
export function _resetSharedSupplyForTests() {
  _lastPass = null;
}

/** The crew's supply a stamped edit moves (see `_lastPass`, crewSupplyBefore). */
function editBase(first, allActors) {
  if (_lastPass && (first.before === _lastPass.base || first.before === _lastPass.target)) return _lastPass.target;
  return crewSupplyBefore(first.source, first.before, allActors);
}

/** Fold a newly arrived edit into the queued pass (see `_sync`). */
function queueSupplyEdit(queued, edit) {
  if (edit.absolute !== undefined) return { source: edit.source, absolute: edit.absolute, delta: 0, first: null };
  return {
    source:   edit.source,
    absolute: queued?.absolute ?? null,
    delta:    (queued?.delta ?? 0) + edit.delta,
    first:    queued?.first ?? (queued?.absolute == null ? { source: edit.source, before: edit.before } : null),
  };
}

/** The supply a queued pass sets every PC to — remembered as this GM's last pass. */
function passTarget(pass, allActors) {
  const base = pass.absolute ?? editBase(pass.first, allActors);
  const target = pass.absolute !== null && pass.delta === 0
    ? pass.absolute
    : Math.min(SUPPLY_MAX, Math.max(SUPPLY_MIN, base + pass.delta));
  _lastPass = { base, target };
  return target;
}

/**
 * The allies sharing a player character's supply: every other player
 * character (NPC cards are not crew). [] in solo play, or for an actor that
 * is no PC. The one definition of the crew — the sync below mirrors the
 * value to them, and the zero-supply impact marks them unprepared with it
 * (sufferExecutor.js markUnprepared — issue #315 S07).
 *
 * @param {Actor} actor
 * @param {Actor[]} [allActors]  the roster to look in (every PC by default)
 * @returns {Actor[]}
 */
export function supplyAllies(actor, allActors = getPlayerActors()) {
  if (!isPlayerCharacterActor(actor)) return [];
  return (allActors ?? []).filter(a => a && a.id !== actor.id && isPlayerCharacterActor(a));
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
  return supplyAllies(source, allActors)
    .filter(actor => supplyOf(actor) !== value)
    .map(actor => ({ actor, value }));
}

/**
 * Register the crew-shared supply sync. Single-writer via isCanonicalGM (the GM
 * holds write perms on every PC); its sibling writes carry an update option so
 * they never cascade back through this hook, and independent changes that
 * land mid-sync are queued (see `_sync`). Register once on ready, on all
 * clients: every client stamps a sheet's supply before an edit it makes
 * (preUpdateActor); only the canonical GM writes.
 */
export function registerSharedSupplyHook() {
  if (registerSharedSupplyHook._installed) return;
  registerSharedSupplyHook._installed = true;
  // Every client, where an update is requested: stamp the sheet's supply
  // before the edit into its options (BEFORE_OPTION). Never cancels.
  Hooks.on("preUpdateActor", (actor, change, options) => {
    try {
      if (!options || !isPlayerCharacterActor(actor)) return;
      if (options[MODULE_ID]?.[MIRROR_OPTION]) return;           // our own sibling write
      if (supplyChange(change) === undefined) return;
      const before = supplyOf(actor);
      if (before === null) return;
      options[MODULE_ID] = { ...(options[MODULE_ID] ?? {}), [BEFORE_OPTION]: before };
    } catch (err) {
      console.warn(`${MODULE_ID} | shared-supply sync: could not note a sheet's supply before an edit:`, err?.message ?? err);
    }
  });
  // A PC made mid-session starts at the crew's supply: its sheet's own value
  // was taken as the crew's at its first edit.
  Hooks.on("createActor", (actor) => {
    try {
      if (!isCanonicalGM() || !isPlayerCharacterActor(actor)) return;
      const own = supplyOf(actor);
      const held = supplyAllies(actor, getPlayerActors()).map(supplyOf).filter(v => v !== null);
      if (!held.length || own === null) return;
      const crew = mostHeld(held, held[0]);
      if (crew === own) return;
      Promise.resolve(actor.update({ "system.supply.value": crew }, { [MODULE_ID]: { [MIRROR_OPTION]: true } }))
        .catch(err => console.warn(`${MODULE_ID} | shared-supply sync: ${actor.name ?? actor.id}'s supply was not set to the crew's ${crew}:`, err?.message ?? err));
    } catch (err) {
      console.warn(`${MODULE_ID} | shared-supply sync: a new character's supply was not set:`, err?.message ?? err);
    }
  });
  Hooks.on("updateActor", async (actor, change, options, userId) => {
    try {
      if (!isPlayerCharacterActor(actor)) return;
      if (supplyChange(change) === undefined) return;           // only supply changes
      if (options?.[MODULE_ID]?.[MIRROR_OPTION]) {              // a sibling write: ours, or another GM's pass
        if (userId !== game.user?.id) _lastPass = null;
        return;
      }
      if (!isCanonicalGM()) { _lastPass = null; return; }       // moved where this GM does not move it
      const value = Number(supplyChange(change));
      if (!Number.isFinite(value)) return;
      const before = Number(options?.[MODULE_ID]?.[BEFORE_OPTION]);
      _sync.next = queueSupplyEdit(_sync.next, Number.isFinite(before)
        ? { source: actor, delta: value - before, before }
        : { source: actor, absolute: value });
      if (_sync.running) return;                                // the running pass picks it up
      _sync.running = true;
      try {
        while (_sync.next) {
          const pass = _sync.next;
          _sync.next = null;
          const source = pass.source;
          const target = passTarget(pass, getPlayerActors());
          const writes = computeSupplySyncUpdates(source, getPlayerActors(), target);
          // The source too, when an older pass's write landed after its own edit.
          if (supplyOf(source) !== target) writes.unshift({ actor: source, value: target });
          for (const u of writes) {
            if (_sync.next) break;                              // a newer change: its pass writes everyone
            // Each PC's write stands alone, as the legacy mirror's does: a
            // refused write is named and the pass goes on. It threw out of the
            // loop, so every PC after it kept the old value and a change
            // queued meanwhile was never run (issue #331 X52).
            try {
              await u.actor.update({ "system.supply.value": u.value }, { [MODULE_ID]: { [MIRROR_OPTION]: true } });
            } catch (err) {
              const name = u.actor?.name ?? u.actor?.id;
              console.warn(`${MODULE_ID} | shared-supply sync: ${name}'s supply was not set to ${u.value}:`, err?.message ?? err);
              globalThis.ui?.notifications?.warn?.(`Shared supply: ${name}'s supply could not be set to ${u.value} — set it on their sheet.`);
            }
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

