// STARFORGED COMPANION
// tests/unit/sharedVowSyncFields.test.js
//
// The shared inciting vow's lockstep, driven through its live updateItem hook
// (registerSharedVowSyncHook) — and the dead pure twin it replaced is gone
// (issue #331 X55).
//
// `computeSharedVowSyncUpdates` was exported as "the pure core of the
// updateItem sync hook", but nothing in production called it: the hook plans
// its writes with the module-private `syncUpdateFor`. Its unit tests pinned a
// function no table ran (rules/reachability.md §1, §4). The export is deleted,
// and the behaviours those tests named are asserted here on the hook itself:
// only the fields that differ are written, only the change's own fields, only
// copies of the same shared vow.

/* global makeTestActor */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import * as swearVow from '../../src/session/swearVow.js';
import { applyUpdate } from '../helpers/documentStubs.js';

const MODULE_ID = 'starforged-companion';

let onUpdate;
beforeAll(() => {
  swearVow.registerSharedVowSyncHook();
  onUpdate = Hooks._handlers.get('updateItem').at(-1);
});
beforeEach(() => {
  game.actors._reset();
  game.user.isGM = true;
});

function vowItem(id, vowId, current, { shared = true, clockTicks } = {}) {
  const flags  = shared ? { sharedVow: true, vowId } : { vowId };
  const system = { current };
  if (clockTicks !== undefined) system.clockTicks = clockTicks;
  const item = { id, type: 'progress', flags: { [MODULE_ID]: flags }, system };
  item.update = vi.fn(async (changes) => { applyUpdate(item, changes); return item; });
  return item;
}
/** One PC per list of Items. */
function crew(...itemLists) {
  game.actors._setAll(itemLists.map((items, i) => {
    const actor = makeTestActor({ id: `pc-${i}`, name: `pc-${i}`, type: 'character', items: { contents: items } });
    for (const item of items) item.parent = actor;
    return actor;
  }));
}
/** A change lands on `item` (its sheet, or the module's vow flow): the GM's hook runs. */
async function changed(item, system) {
  applyUpdate(item, Object.fromEntries(Object.entries(system).map(([k, v]) => [`system.${k}`, v])));
  await onUpdate(item, { system }, {}, 'pl-1');
}

describe('the shared-vow sync hook (issue #331 X55)', () => {
  it('the dead pure twin is no longer exported', () => {
    expect(swearVow.computeSharedVowSyncUpdates).toBeUndefined();
  });

  it('a vow that is not shared syncs nothing', async () => {
    const src = vowItem('i1', 'm1', 4, { shared: false });
    const sib = vowItem('i2', 'm1', 4, { shared: false });
    crew([src], [sib]);
    await changed(src, { current: 8 });
    expect(sib.update).not.toHaveBeenCalled();
  });

  it('a copy that is behind catches up; one in lockstep and an unrelated vow are left alone', async () => {
    const src    = vowItem('i1', 'm1', 4);
    const behind = vowItem('i2', 'm1', 4);   // a different PC's copy
    const synced = vowItem('i3', 'm1', 8);   // already where the change goes
    const other  = vowItem('i4', 'm2', 0);   // an unrelated vow
    crew([src], [behind, synced], [other]);
    await changed(src, { current: 8 });
    expect(behind.update).toHaveBeenCalledTimes(1);
    expect(behind.update.mock.calls[0][0]).toEqual({ 'system.current': 8 });
    expect(synced.update).not.toHaveBeenCalled();
    expect(other.update).not.toHaveBeenCalled();
    expect(src.update).not.toHaveBeenCalled();    // the source already holds its own change
  });

  it("the attached clock's ticks sync on their own", async () => {
    const src = vowItem('i1', 'm1', 8, { clockTicks: 0 });
    const sib = vowItem('i2', 'm1', 8, { clockTicks: 0 });
    crew([src], [sib]);
    await changed(src, { clockTicks: 3 });
    expect(sib.update.mock.calls.map(c => c[0])).toEqual([{ 'system.clockTicks': 3 }]);
  });

  it("only the change's own fields are written — a sibling's own tick is left alone", async () => {
    const src = vowItem('i1', 'm1', 4,  { clockTicks: 0 });
    const sib = vowItem('i2', 'm1', 4,  { clockTicks: 1 });   // the sibling's own tick, made meanwhile
    crew([src], [sib]);
    await changed(src, { current: 12 });
    expect(sib.update.mock.calls.map(c => c[0])).toEqual([{ 'system.current': 12 }]);
    expect(sib.system.clockTicks).toBe(1);
  });
});
