/**
 * STARFORGED COMPANION
 * tests/unit/sharedVowSyncLostUpdate.test.js
 *
 * Issue #322 V32 (the audit's sharedVowSyncLostUpdate probe): the shared-vow
 * lockstep (registerSharedVowSyncHook) lost a change that landed while a sync
 * pass was writing siblings — the race issue #300 F05 / #306 R03 fixed for
 * the shared supply, never fixed here:
 *   - the pass planned every sibling's update up front, copying all four
 *     synced fields (current, clockTicks, completed, rank) from the source;
 *   - an independent change on another copy, landing while the pass awaited a
 *     write, hit the in-flight guard and was dropped;
 *   - the pass's planned write then landed on that copy with the source's
 *     older values, reverting the change there too.
 * Kira marks progress (current 4 → 12) while Tomas's deadline clock ticks
 * (clockTicks 0 → 1): every copy now ends at current 12 AND clockTicks 1.
 * Changes are queued per vow, newest value per field; a pass copies only the
 * fields that differ, and its sibling writes are marked as its own.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { expandUpdate, applyUpdate } from '../helpers/documentStubs.js';
import { registerSharedVowSyncHook } from '../../src/session/swearVow.js';

const MODULE_ID = 'starforged-companion';

function vowCopy(id) {
  const item = {
    id, type: 'progress', name: 'Bring Vance home',
    flags:  { [MODULE_ID]: { sharedVow: true, vowId: 'inc-1' } },
    system: { subtype: 'vow', current: 4, clockTicks: 0, completed: false, rank: 2, hasClock: true, clockMax: 6 },
    hold:   null,   // when set, the next update waits on it (a write in flight)
  };
  // Foundry: an update applies, then fires updateItem (on the canonical GM's client too).
  item.update = async (changes) => {
    if (item.hold) { const h = item.hold; item.hold = null; await h; }
    applyUpdate(item, changes);
    Hooks.call('updateItem', item, expandUpdate(changes), {}, 'test-user-gm');
    return item;
  };
  return item;
}

function pcWith(id, item) {
  const a = makeTestActor({ id, name: id, items: { contents: [item] } });
  item.parent = a;
  return a;
}

beforeEach(() => {
  game.actors._reset();
  game.user.isGM = true;
});

async function run({ held }) {
  const kiraVow = vowCopy('v-kira'), tomasVow = vowCopy('v-tomas'), ilseVow = vowCopy('v-ilse');
  game.actors._setAll([pcWith('pc-kira', kiraVow), pcWith('pc-tomas', tomasVow), pcWith('pc-ilse', ilseVow)]);
  const byName = { tomas: tomasVow, ilse: ilseVow };
  let release;
  byName[held].hold = new Promise(r => { release = r; });   // that sibling write of the pass is in flight

  // 1. Kira marks progress on her sheet → the GM's sync pass starts (plans Tomas + Ilse from Kira's copy)
  applyUpdate(kiraVow, { 'system.current': 12 });
  Hooks.call('updateItem', kiraVow, { system: { current: 12 } }, {}, 'pl-1');
  for (let i = 0; i < 5; i++) await Promise.resolve();

  // 2. meanwhile the deadline clock is ticked on Tomas's copy (its updateItem reaches the GM mid-pass)
  applyUpdate(tomasVow, { 'system.clockTicks': 1 });
  Hooks.call('updateItem', tomasVow, { system: { clockTicks: 1 } }, {}, 'pl-2');

  release();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  return [kiraVow, tomasVow, ilseVow].map(v => ({ current: v.system.current, clockTicks: v.system.clockTicks }));
}

const LOCKSTEP = [
  { current: 12, clockTicks: 1 },
  { current: 12, clockTicks: 1 },
  { current: 12, clockTicks: 1 },
];

describe('a shared vow keeps both of two edits made within one round trip (SHARED-VOW-SYNC-LOST-UPDATE)', () => {
  beforeEach(() => registerSharedVowSyncHook());

  it("the pass's write to Tomas still in flight: the tick is reverted on Tomas and never reaches the others", async () => {
    expect(await run({ held: 'tomas' })).toEqual(LOCKSTEP);   // was clockTicks 0 on all three
  });

  it("the pass's write to Ilse in flight: the tick is dropped by the in-flight guard — the copies diverge", async () => {
    expect(await run({ held: 'ilse' })).toEqual(LOCKSTEP);    // was clockTicks [0, 1, 0]
  });
});
