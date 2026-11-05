// STARFORGED COMPANION
// tests/unit/sharedSupplyRefusedWrite.test.js
//
// A refused sibling write in the crew-shared supply sync is that PC's alone
// (issue #331 X52).
//
// The canonical GM mirrors one PC's supply change to the rest of the crew in
// one loop. A write the world refused threw out of that loop into the hook's
// catch, which only logged: every PC after the refused one kept the old value
// (the crew's one supply track read two numbers) and a change queued during
// the pass was stranded — `running` was cleared, but nothing ran it. Each
// write now stands alone, as the legacy mirror's does: the refusal is named,
// the other PCs are still mirrored, and the queued change gets its pass.

/* global makeTestActor */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { registerSharedSupplyHook } from '../../src/multiplayer/sharedSupply.js';

let onUpdate;
beforeAll(() => {
  registerSharedSupplyHook();
  onUpdate = Hooks._handlers.get('updateActor').at(-1);
});
beforeEach(() => game.actors._reset());

function livePc(id, supply) {
  const actor = makeTestActor({ id, name: id, type: 'character', system: { supply: { value: supply } } });
  game.actors._set(id, actor);
  return actor;
}
const supplyChange = (value) => ({ system: { supply: { value } } });
const refused = (id) => new Error(`User lacks permission to update Actor [${id}] (test fault)`);

describe('a refused sibling write during the shared-supply sync (issue #331 X52)', () => {
  it('control: with no refusal, both siblings are mirrored to the changed value', async () => {
    const a = livePc('pc-a', 2);
    const b = livePc('pc-b', 5);
    const c = livePc('pc-c', 5);
    await onUpdate(a, supplyChange(2), {});
    expect([b.system.supply.value, c.system.supply.value]).toEqual([2, 2]);
  });

  it("is that sibling's alone: the next sibling is still mirrored, and the refusal names the PC", async () => {
    const a = livePc('pc-a', 2);
    const b = livePc('pc-b', 5);
    const c = livePc('pc-c', 5);
    b.update = vi.fn(async () => { throw refused('pc-b'); });   // the world refuses B's write
    const notify = vi.spyOn(ui.notifications, 'warn');

    await onUpdate(a, supplyChange(2), {});

    expect(c.system.supply.value).toBe(2);
    expect(b.update).toHaveBeenCalledTimes(1);                   // attempted once, not retried in a loop
    expect(getCapturedWarns().some(w => /shared-supply sync: pc-b's supply was not set to 2/.test(w))).toBe(true);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/pc-b's supply could not be set to 2/));
  });

  it('does not strand a change queued during the pass: the newer value still reaches everyone', async () => {
    const a = livePc('pc-a', 2);
    const b = livePc('pc-b', 5);
    const c = livePc('pc-c', 5);
    const realUpdate = b.update.bind(b);
    let rejectB;
    // The world refuses B's first write (a transient fault); its next lands.
    b.update = vi.fn(realUpdate);
    b.update.mockImplementationOnce(() => new Promise((_, reject) => { rejectB = () => reject(refused('pc-b')); }));

    const pass = onUpdate(a, supplyChange(2), {});                 // pass 1 is writing B (held)
    await vi.waitFor(() => expect(b.update).toHaveBeenCalledTimes(1));
    a.system.supply.value = 3;
    await onUpdate(a, supplyChange(3), {});                        // a newer change: queued as the next pass
    rejectB();                                                     // the world refuses B's write
    await pass;

    expect([a.system.supply.value, b.system.supply.value, c.system.supply.value]).toEqual([3, 3, 3]);
  });
});
