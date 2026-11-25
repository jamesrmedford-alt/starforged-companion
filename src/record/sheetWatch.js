/**
 * STARFORGED COMPANION
 * src/record/sheetWatch.js — every change to a character's sheet, recorded where the sheet changes (issue #382)
 *
 * `sheet.changed` is observed, not reported: one hook sees every writer of a
 * player character's meters, impacts, legacies and XP, of a companion's health
 * and of a vehicle's integrity — the move's meters, a suffer choice, a card's
 * payoff, the shared-supply mirror, and a player's own edit of their sheet
 * (decision D9: that is something that happened at the table). A new write
 * path cannot forget it.
 *
 *   - **Before** — every client stamps what the sheet held into the update's
 *     options where the update is requested (`preUpdateActor` /
 *     `preUpdateItem` run there only), with whether the write is the module's
 *     (actorBridge.js `moduleWriteInFlight`) — as the shared supply stamps a
 *     sheet's supply (multiplayer/sharedSupply.js).
 *   - **After** — the canonical GM, on the update, reads the sheet again and
 *     records each value that moved.
 *   - **Cause** — a module writer that knows what caused its change passes it
 *     in the update's options (`recordCause`): the move, a card's choice, an
 *     upgrade, the session. A module write that passes none is recorded
 *     `module`; a write that is not the module's, `sheet`; the crew-supply and
 *     shared-legacy mirrors' sibling writes, `mirror` (each PC's sheet did
 *     change — a view shows the change once).
 *
 * The same hooks see a PC's vows (issue #382, slice 2) — a progress Item of
 * subtype vow on a player character's sheet, however it got there (the
 * pipeline's Swear an Iron Vow, a card, the sheet by hand): `vow.sworn` as it
 * is created, `progress.marked` as its track moves, `vow.closed` as it is
 * completed (`forsaken` when Forsake Your Vow flags it so), `vow.linked` as it
 * is tied to a connection. A shared vow's copies each fire; the read counts
 * them once by the vow's stable id (`vowId`).
 *
 * Every sheet read is actorBridge.js's (`readSheetFacts`, `readAssetTrackFact`,
 * `readVowFact`). State is never folded from these events: a view's "where
 * things stand" is read live from the sheet.
 */

import { recordEvent } from './record.js';
import { isCanonicalGM } from '../multiplayer/gmGate.js';
import { isPlayerCharacterActor, moduleWriteInFlight, readAssetTrackFact, readSheetFacts, readVowFact } from '../character/actorBridge.js';

const MODULE_ID = 'starforged-companion';

const BEFORE_OPTION = 'recordBefore';
const CAUSE_OPTION = 'recordCause';

/**
 * The update options the mirrors mark their sibling writes with
 * (multiplayer/sharedSupply.js, multiplayer/sharedLegacies.js — each a
 * `MIRROR_OPTION`; tests/unit/sessionRecordSheetWatch.test.js fails when one
 * is renamed there and not here).
 */
export const MIRROR_OPTIONS = Object.freeze(['sharedSupplyMirror', 'legacySheetMirror']);

const CAUSE_KINDS = new Set(['move', 'choice', 'upgrade', 'session']);

/**
 * Update options that say what caused a sheet change, for a module writer
 * that knows: pass them to the bridge's write (`applyMeterChanges(actor,
 * changes, recordCause({ kind: "move", res }))`).
 *
 * @param {{ kind: "move"|"choice"|"upgrade"|"session", move?: string|null, res?: string|null, card?: string|null }} cause
 *   — `move`: the move's id, for the `by` of a move-only state change (a
 *   vow's progress, its close — overhaul 4, D12)
 * @returns {Object}
 */
export function recordCause(cause) {
  const kind = CAUSE_KINDS.has(cause?.kind) ? cause.kind : 'move';
  return {
    [MODULE_ID]: {
      [CAUSE_OPTION]: {
        kind,
        ...(typeof cause?.move === 'string' && cause.move ? { move: cause.move } : {}),
        ...(typeof cause?.res === 'string' && cause.res ? { res: cause.res } : {}),
        ...(typeof cause?.card === 'string' && cause.card ? { card: cause.card } : {}),
      },
    },
  };
}

/** What caused a write, from its options: the cause it passed, a mirror's, the module's, or the sheet's. */
function causeOf(options) {
  const ours = options?.[MODULE_ID] ?? {};
  const given = ours[CAUSE_OPTION];
  if (given && CAUSE_KINDS.has(given.kind)) return given;
  if (MIRROR_OPTIONS.some(key => ours[key] === true)) return { kind: 'mirror' };
  return { kind: ours[BEFORE_OPTION]?.module === true ? 'module' : 'sheet' };
}

/**
 * What made a move-only state change, for its event's `by` (overhaul 4, D12):
 * a move's (`{ move, res }` — the cause a module writer passed), the table's
 * own hand (`"hand"` — the sheet's edit), or null when nothing says (a module
 * write that passed no cause, a mirror).
 */
function byOfCause(cause) {
  if (cause?.kind === 'sheet') return 'hand';
  if (cause?.kind === 'move' || cause?.kind === 'choice' || cause?.kind === 'upgrade') {
    return { move: typeof cause.move === 'string' && cause.move ? cause.move : null, res: cause.res ?? null };
  }
  return null;
}

/** Stamp a value into an update's options, beside whatever the module already put there. */
function stamp(options, before, actorId) {
  options[MODULE_ID] = { ...(options[MODULE_ID] ?? {}), [BEFORE_OPTION]: { ...before, module: moduleWriteInFlight(actorId) } };
}

function touchesSystem(change) {
  return !!change && typeof change === 'object' && Object.prototype.hasOwnProperty.call(change, 'system');
}

/** Each value that moved between two readings of a sheet: `[what, from, to]`. */
function movedFacts(before, after) {
  const moved = [];
  for (const key of ['health', 'spirit', 'supply', 'momentum', 'xp']) {
    if (after[key] !== before?.[key]) moved.push([key, before?.[key] ?? null, after[key]]);
  }
  for (const [key, on] of Object.entries(after.impacts ?? {})) {
    const was = before?.impacts?.[key];
    if (on !== !!was) moved.push([`impact:${key}`, before?.impacts ? !!was : null, on]);
  }
  for (const [track, ticks] of Object.entries(after.legacies ?? {})) {
    const was = before?.legacies?.[track];
    if (ticks !== (was ?? 0)) moved.push([`legacy:${track}`, before?.legacies ? (was ?? 0) : null, ticks]);
  }
  return moved;
}

function onPreUpdateActor(actor, change, options) {
  try {
    if (!options || !touchesSystem(change) || !isPlayerCharacterActor(actor)) return;
    const facts = readSheetFacts(actor);
    if (facts) stamp(options, { facts }, actor.id);
  } catch (err) {
    console.warn(`${MODULE_ID} | session record: a sheet's values before an edit could not be noted:`, err?.message ?? err);
  }
}

function onUpdateActor(actor, change, options, userId) {
  try {
    if (!isCanonicalGM() || !touchesSystem(change) || !isPlayerCharacterActor(actor)) return;
    const before = options?.[MODULE_ID]?.[BEFORE_OPTION]?.facts ?? null;
    // With nothing noted before the write there is no telling what moved.
    if (!before) return;
    const after = readSheetFacts(actor);
    if (!after) return;
    const cause = causeOf(options);
    for (const [what, from, to] of movedFacts(before, after)) {
      recordEvent('sheet.changed', {
        who: { user: userId ?? null, actor: actor.id },
        ref: { res: cause.res ?? null, card: cause.card ?? null },
        d: { actorId: actor.id, name: actor.name ?? '', what, from, to, cause },
      });
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | session record: a sheet change was not recorded:`, err?.message ?? err);
  }
}

/** The Actor an Item's track change is recorded for: a PC (its companion, its vehicle) or a starship (the command vehicle). */
function trackOwner(item) {
  const owner = item?.parent ?? null;
  if (!owner?.id) return null;
  return isPlayerCharacterActor(owner) || owner.type === 'starship' ? owner : null;
}

/** A PC's vow Item's facts, or null for any other Item. */
function pcVow(item) {
  const owner = item?.parent ?? null;
  return owner && isPlayerCharacterActor(owner) ? readVowFact(item) : null;
}

function touchesVow(change) {
  return touchesSystem(change) || !!change?.flags?.[MODULE_ID];
}

function onPreUpdateItem(item, change, options) {
  try {
    if (!options) return;
    const vow = touchesVow(change) ? pcVow(item) : null;
    if (vow) {
      stamp(options, { vow }, item.parent.id);
      return;
    }
    if (!touchesSystem(change)) return;
    const owner = trackOwner(item);
    const track = owner ? readAssetTrackFact(item) : null;
    if (track) stamp(options, { track }, owner.id);
  } catch (err) {
    console.warn(`${MODULE_ID} | session record: an asset's track before an edit could not be noted:`, err?.message ?? err);
  }
}

/** Record what moved on a PC's vow between two readings of it. */
function recordVowChanges(item, before, after, options, userId) {
  const actor = item.parent;
  const cause = causeOf(options);
  const base = {
    who: { user: userId ?? null, actor: actor.id },
    ref: { vow: after.vowId ?? item.id, res: cause.res ?? null },
  };
  // What made it (overhaul 4, D12): a move, or the sheet's own hand.
  const by = byOfCause(cause);
  const made = by ? { by } : {};
  if (after.ticks !== before.ticks) {
    recordEvent('progress.marked', { ...base, d: { label: after.name, rank: after.rank, from: before.ticks, to: after.ticks, ...made } });
  }
  if (after.completed && !before.completed) {
    recordEvent('vow.closed', { ...base, d: { name: after.name, how: after.forsaken ? 'forsaken' : 'fulfilled', ...made } });
  } else if (after.completed && after.forsaken && !before.forsaken) {
    recordEvent('vow.closed', { ...base, d: { name: after.name, how: 'forsaken', ...made } });
  }
  if (after.linkedConnectionName && after.linkedConnectionName !== before.linkedConnectionName) {
    recordEvent('vow.linked', { ...base, ref: { ...base.ref, conn: after.linkedConnectionId ?? null },
      d: { name: after.name, connectionName: after.linkedConnectionName } });
  }
}

function onUpdateItem(item, change, options, userId) {
  try {
    if (!isCanonicalGM()) return;
    const vowBefore = options?.[MODULE_ID]?.[BEFORE_OPTION]?.vow ?? null;
    if (vowBefore) {
      const after = pcVow(item);
      if (after) recordVowChanges(item, vowBefore, after, options, userId);
      return;
    }
    if (!touchesSystem(change)) return;
    const owner = trackOwner(item);
    const before = options?.[MODULE_ID]?.[BEFORE_OPTION]?.track ?? null;
    const after = owner ? readAssetTrackFact(item) : null;
    if (!before || !after || before.value === after.value) return;
    const cause = causeOf(options);
    recordEvent('sheet.changed', {
      who: { user: userId ?? null, actor: owner.id },
      ref: { res: cause.res ?? null, card: cause.card ?? null },
      d: { actorId: owner.id, itemId: item.id ?? null, name: item.name ?? '', what: after.what, from: before.value, to: after.value, cause },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | session record: an asset's track change was not recorded:`, err?.message ?? err);
  }
}

/** A vow sworn onto a PC's sheet — however it was created. */
function onCreateItem(item, options, userId) {
  try {
    if (!isCanonicalGM()) return;
    const vow = pcVow(item);
    if (!vow) return;
    const cause = causeOf(options);
    recordEvent('vow.sworn', {
      who: { user: userId ?? null, actor: item.parent.id },
      ref: { vow: vow.vowId ?? item.id, res: cause.res ?? null },
      d: { itemId: item.id, actorId: item.parent.id, name: vow.name, rank: vow.rank, shared: vow.shared },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | session record: a vow sworn was not recorded:`, err?.message ?? err);
  }
}

/**
 * Register the sheet watch: on every client (each stamps a sheet's values
 * before an edit it makes); only the canonical GM records. Once, at `ready`.
 */
export function registerSheetWatch() {
  if (registerSheetWatch._installed) return;
  registerSheetWatch._installed = true;
  Hooks.on('preUpdateActor', onPreUpdateActor);
  Hooks.on('updateActor', onUpdateActor);
  Hooks.on('preUpdateItem', onPreUpdateItem);
  Hooks.on('updateItem', onUpdateItem);
  Hooks.on('createItem', onCreateItem);
}
