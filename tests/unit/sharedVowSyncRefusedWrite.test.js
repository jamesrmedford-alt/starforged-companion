/**
 * STARFORGED COMPANION
 * tests/unit/sharedVowSyncRefusedWrite.test.js
 *
 * A refused write to one copy of a shared vow is that copy's alone
 * (known-issues SUPPLY-SYNC-TWINS, found while fixing issue #331 X52).
 *
 * The canonical GM keeps every PC's copy of the shared inciting vow in
 * lockstep, one copy write after another. A copy write the world refused
 * threw out of the pass into the hook's catch, which only logged: the copies
 * after it kept the old value, and a change queued during the pass was
 * stranded until the vow's next edit. Each copy's write now stands alone, as
 * the supply sync's does since X52: the refusal is warned and named, and the
 * pass goes on to the other copies and to the queued change.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { applyUpdate } from '../helpers/documentStubs.js';
import { registerSharedVowSyncHook } from '../../src/session/swearVow.js';

const MODULE_ID = 'starforged-companion';
const refused = (who) => new Error(`User lacks permission to update Item on ${who} (test fault)`);

let onUpdate;
beforeAll(() => {
  registerSharedVowSyncHook();
  onUpdate = Hooks._handlers.get('updateItem').at(-1);
});
beforeEach(() => {
  game.actors._reset();
  game.user.isGM = true;
});

function vowCopy(id) {
  const item = {
    id, type: 'progress', name: 'Bring Vance home',
    flags:  { [MODULE_ID]: { sharedVow: true, vowId: 'inc-1' } },
    system: { subtype: 'vow', current: 4, clockTicks: 0, completed: false, rank: 2 },
  };
  item.update = vi.fn(async (changes) => { applyUpdate(item, changes); return item; });
  return item;
}
function crew() {
  const copies = { kira: vowCopy('v-kira'), tomas: vowCopy('v-tomas'), ilse: vowCopy('v-ilse') };
  game.actors._setAll(Object.entries(copies).map(([name, item]) => {
    const actor = makeTestActor({ id: `pc-${name}`, name, type: 'character', items: { contents: [item] } });
    item.parent = actor;
    return actor;
  }));
  return copies;
}
/** A change lands on `item`: the store has it, then the GM's hook runs. */
function changed(item, system) {
  applyUpdate(item, Object.fromEntries(Object.entries(system).map(([k, v]) => [`system.${k}`, v])));
  return onUpdate(item, { system }, {}, 'pl-1');
}

describe('a refused copy write during the shared-vow sync (SUPPLY-SYNC-TWINS)', () => {
  it('control: with no refusal, every copy is brought to the change', async () => {
    const { kira, tomas, ilse } = crew();
    await changed(kira, { current: 12 });
    expect([tomas.system.current, ilse.system.current]).toEqual([12, 12]);
  });

  it("is that copy's alone: the next copy is still updated, and the refusal names whose copy", async () => {
    const { kira, tomas, ilse } = crew();
    tomas.update.mockImplementationOnce(async () => { throw refused('tomas'); });
    const notify = vi.spyOn(ui.notifications, 'warn');

    await changed(kira, { current: 12 });

    expect(ilse.system.current).toBe(12);
    expect(tomas.update).toHaveBeenCalledTimes(1);
    expect(getCapturedWarns().some(w => /shared-vow sync — tomas's copy of "Bring Vance home" was not updated/.test(w))).toBe(true);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/tomas's copy of "Bring Vance home" could not be updated/));
  });

  it('does not strand a change queued during the pass: the newer value still reaches every copy', async () => {
    const { kira, tomas, ilse } = crew();
    let rejectTomas;
    tomas.update.mockImplementationOnce(() => new Promise((_, reject) => { rejectTomas = () => reject(refused('tomas')); }));

    const pass = changed(kira, { current: 12 });                 // the pass is writing Tomas's copy (held)
    await vi.waitFor(() => expect(tomas.update).toHaveBeenCalledTimes(1));
    await changed(kira, { clockTicks: 1 });                      // a newer change: queued as the next pass
    rejectTomas();                                               // the world refuses Tomas's write (a transient fault)
    await pass;

    for (const copy of [kira, tomas, ilse]) expect(copy.system).toMatchObject({ current: 12, clockTicks: 1 });
  });
});
