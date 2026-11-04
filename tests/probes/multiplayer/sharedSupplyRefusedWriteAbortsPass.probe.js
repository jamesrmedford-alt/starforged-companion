/**
 * PROBE — MP-03 SUPPLY-SYNC-REFUSED-WRITE-ABORTS-PASS (ninth audit, area multiplayer)
 *
 * What the user does: a crew of three. Kira's supply drops (a move's cost, a
 * Sacrifice Resources, or her player's sheet edit). The canonical GM's
 * shared-supply sync mirrors the new value to the other two PCs — and the
 * world refuses the write to one of them (a transient server error, a
 * permission hiccup on one Actor).
 *
 * What happens: the sync pass writes the siblings in one `for` loop with no
 * per-write guard (src/multiplayer/sharedSupply.js:103–106). The refused
 * `actor.update` throws out of the loop into the outer catch (:111), which
 * only logs "shared-supply sync failed". Every sibling after the refused one
 * is skipped — the crew's one supply track now reads two different numbers —
 * and a change queued during the pass (`_sync.next`, :93) is stranded: the
 * `finally` clears `running` (:109) but nothing runs the queued pass, so that
 * newer value reaches nobody until some later supply edit happens to fire the
 * hook again.
 *
 * What should happen: decisions.md "Crew-shared supply track in multiplayer"
 * — the crew shares ONE supply track, kept in lockstep by the canonical GM;
 * issue #300 F05 / #306 R03 made a change that lands mid-pass "the next pass
 * instead of being dropped". A refused write to one PC is that PC's alone:
 * the others are still mirrored (as the legacy mirror does — sharedLegacies.js
 * mirrorLegacyToSheets: "Each sheet stands alone: a refused write is
 * returned, the others still made"), the refusal is named, and the queued
 * change still runs.
 *
 * Controls: with no refusal both siblings mirror; the refused PC is reported.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { registerSharedSupplyHook } from '../../../src/multiplayer/sharedSupply.js';

const MODULE_ID = 'starforged-companion';

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

describe('MP-03 a refused sibling write during the shared-supply sync', () => {
  it('control: with no refusal, both siblings are mirrored to the changed value', async () => {
    const a = livePc('pc-a', 2);
    const b = livePc('pc-b', 5);
    const c = livePc('pc-c', 5);
    await onUpdate(a, supplyChange(2), {});
    expect([b.system.supply.value, c.system.supply.value]).toEqual([2, 2]);
  });

  it('is that sibling\'s alone: the next sibling is still mirrored, and the refusal names the PC', async () => {
    const a = livePc('pc-a', 2);
    const b = livePc('pc-b', 5);
    const c = livePc('pc-c', 5);
    b.update = vi.fn(async () => { throw refused('pc-b'); });   // the world refuses B's write

    await onUpdate(a, supplyChange(2), {});

    // FAILS today: the throw leaves the loop at B — C keeps 5, the crew's one track reads 2 and 5.
    expect.soft(c.system.supply.value).toBe(2);
    expect.soft(b.update).toHaveBeenCalledTimes(1);   // B's write was attempted once
  });

  it('does not strand a change queued during the pass: the newer value still reaches everyone', async () => {
    const a = livePc('pc-a', 2);
    const b = livePc('pc-b', 5);
    const c = livePc('pc-c', 5);
    let rejectB;
    b.update = vi.fn(() => new Promise((_, reject) => { rejectB = () => reject(refused('pc-b')); }));

    const pass = onUpdate(a, supplyChange(2), {});                 // pass 1 is writing B (held)
    await vi.waitFor(() => expect(b.update).toHaveBeenCalledTimes(1));
    a.system.supply.value = 3;
    await onUpdate(a, supplyChange(3), {});                        // a newer change: queued as the next pass
    rejectB();                                                     // the world refuses B's write
    await pass;

    // FAILS today: the throw aborts pass 1; `_sync.next` (the 3) is stranded with `running` false — C never hears of it.
    expect(c.system.supply.value).toBe(3);
  });
});
