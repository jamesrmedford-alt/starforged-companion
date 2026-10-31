/**
 * STARFORGED COMPANION
 * tests/unit/sharedSupply.test.js
 *
 * Pure-logic coverage for the crew-shared supply sync (#co-op supply rule).
 * computeSupplySyncUpdates is the core of the updateActor hook — it decides
 * which other player characters need their supply brought into lockstep.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { computeSupplySyncUpdates, registerSharedSupplyHook, supplyAllies } from '../../src/multiplayer/sharedSupply.js';
import { sacrificeResources } from '../../src/moves/sufferExecutor.js';

const MODULE_ID = 'starforged-companion';

function pc(id, supply) {
  return { id, type: 'character', flags: {}, system: { supply: { value: supply } } };
}
function npcCard(id, supply) {
  return { id, type: 'character', flags: { [MODULE_ID]: { entityType: 'connection' } }, system: { supply: { value: supply } } };
}

describe('computeSupplySyncUpdates', () => {
  it('returns [] in solo play (only the source PC)', () => {
    const a = pc('a', 3);
    expect(computeSupplySyncUpdates(a, [a])).toEqual([]);
  });

  it('targets other PCs whose supply differs, set to the source value', () => {
    const a = pc('a', 3);
    const b = pc('b', 5);
    const out = computeSupplySyncUpdates(a, [a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].actor).toBe(b);
    expect(out[0].value).toBe(3);
  });

  it('skips PCs already in lockstep', () => {
    const a = pc('a', 2);
    const inSync = pc('b', 2);
    const behind = pc('c', 5);
    const out = computeSupplySyncUpdates(a, [a, inSync, behind]);
    expect(out).toHaveLength(1);
    expect(out[0].actor).toBe(behind);
  });

  it('never targets the source actor itself', () => {
    const a = pc('a', 4);
    expect(computeSupplySyncUpdates(a, [a])).toEqual([]);
  });

  it('ignores NPC cards (character-type actors flagged as entities)', () => {
    const a = pc('a', 3);
    const npc = npcCard('npc', 5);   // would differ, but is not a PC
    expect(computeSupplySyncUpdates(a, [a, npc])).toEqual([]);
  });

  it('returns [] when the source supply is unreadable', () => {
    const a = { id: 'a', type: 'character', flags: {}, system: {} };
    const b = pc('b', 5);
    expect(computeSupplySyncUpdates(a, [a, b])).toEqual([]);
  });

  it('returns [] when every PC is already in lockstep', () => {
    expect(computeSupplySyncUpdates(pc('a', 4), [pc('a', 4), pc('b', 4)])).toEqual([]);
  });
});


// Issue #300 F05: one in-flight flag discarded every supply update while a
// sync was writing, so a second edit made during it never reached the other
// PCs (A at 3, B left at 4). The hook now marks its own sibling writes and
// queues independent changes, newest wins.
describe('the updateActor hook (canonical GM)', () => {
  let onUpdate;
  beforeAll(() => {
    registerSharedSupplyHook();
    onUpdate = Hooks._handlers.get('updateActor').at(-1);
  });
  beforeEach(() => game.actors._reset());

  function livePc(id, supply) {
    const actor = makeTestActor({ id, type: 'character', system: { supply: { value: supply } } });
    game.actors._set(id, actor);
    return actor;
  }
  const supplyChange = (value) => ({ system: { supply: { value } } });
  const MIRROR = { [MODULE_ID]: { sharedSupplyMirror: true } };

  it('a second edit made while a sync is writing still reaches every PC — once, with no cascade', async () => {
    const a = livePc('pc-a', 4);   // A just went 5 → 4
    const b = livePc('pc-b', 5);
    const aUpdate = vi.spyOn(a, 'update');
    const write = b.update;
    let release;
    b.update = vi.fn((changes, options) => (b.update.mock.calls.length === 1
      ? new Promise((r) => { release = () => r(write(changes, options)); })
      : write(changes, options)));

    const sync = onUpdate(a, supplyChange(4), {});
    await vi.waitFor(() => expect(b.update).toHaveBeenCalledTimes(1));
    a.system.supply.value = 3;                 // A edited again while B's write is pending
    await onUpdate(a, supplyChange(3), {});
    release();
    await sync;

    expect(b.system.supply.value).toBe(3);
    expect(b.update).toHaveBeenCalledTimes(2);
    expect(b.update.mock.calls.map(c => c[1])).toEqual([MIRROR, MIRROR]);
    expect(aUpdate).not.toHaveBeenCalled();
  });

  it('its own sibling writes never start another pass', async () => {
    const a = livePc('pc-a', 5);
    const b = livePc('pc-b', 4);
    const aUpdate = vi.spyOn(a, 'update');
    await onUpdate(b, supplyChange(4), MIRROR);
    expect(aUpdate).not.toHaveBeenCalled();
  });

  // Issue #306 R03: a pass planned all its writes up front. An independent edit
  // to a PC the pass hadn't reached yet was overwritten by the pass's older
  // value, and the queued pass then read that overwritten value — A's 2 beat
  // B's newer 4.
  it('a newer edit to a PC the pass has not reached yet wins', async () => {
    const a = livePc('pc-a', 2);               // A just went to 2
    const c = livePc('pc-c', 5);
    const b = livePc('pc-b', 5);               // roster order A, C, B
    const write = c.update;
    let release;
    c.update = vi.fn((changes, options) => (c.update.mock.calls.length === 1
      ? new Promise((r) => { release = () => r(write(changes, options)); })
      : write(changes, options)));

    const sync = onUpdate(a, supplyChange(2), {});
    await vi.waitFor(() => expect(c.update).toHaveBeenCalledTimes(1));
    await b.update({ 'system.supply.value': 4 });   // B's player edits while C's write is pending
    await onUpdate(b, supplyChange(4), {});
    release();
    await sync;

    expect([a, c, b].map(x => x.system.supply.value)).toEqual([4, 4, 4]);
  });

  it('a PC whose own edit an older pass overwrote is set back to its edit', async () => {
    const a = livePc('pc-a', 2);               // A just went to 2
    const b = livePc('pc-b', 5);
    const c = livePc('pc-c', 5);               // roster order A, B, C
    const write = b.update;
    let release;
    b.update = vi.fn((changes, options) => (b.update.mock.calls.length === 1
      ? new Promise((r) => { release = () => r(write(changes, options)); })
      : write(changes, options)));

    const sync = onUpdate(a, supplyChange(2), {});
    await vi.waitFor(() => expect(b.update).toHaveBeenCalledTimes(1));
    b.system.supply.value = 4;                 // B's own edit lands first …
    await onUpdate(b, supplyChange(4), {});
    release();                                 // … then the pass's older write (B → 2)
    await sync;

    expect([a, b, c].map(x => x.system.supply.value)).toEqual([4, 4, 4]);
  });

  it('an independent edit on any PC is mirrored to the others', async () => {
    livePc('pc-a', 5);
    const b = livePc('pc-b', 2);
    const c = livePc('pc-c', 5);
    await onUpdate(b, supplyChange(2), {});
    expect(game.actors.get('pc-a').system.supply.value).toBe(2);
    expect(c.system.supply.value).toBe(2);
  });
});

// Issue #315 S07: the sync mirrors the supply value; the impact that comes
// with 0 is the crew's too — "because you and your allies share the same
// supply value, you mark unprepared together" — but only the PC who paid was
// marked. Sacrifice Resources' zero-supply mark (sufferExecutor.js
// markUnprepared) now marks the allies supplyAllies names.
describe('the crew shares the zero-supply impact (issue #315 S07)', () => {
  let onUpdate;
  beforeAll(() => {
    registerSharedSupplyHook();
    onUpdate = Hooks._handlers.get('updateActor').at(-1);
  });
  beforeEach(() => game.actors._reset());

  function livePc(id, name, supply) {
    const actor = makeTestActor({ id, name, type: 'character', system: { supply: { value: supply } } });
    game.actors._set(id, actor);
    return actor;
  }
  const unprepared = (...actors) => actors.map(a => a.system.debility.unprepared);

  it('supplyAllies: every other PC, no NPC card, none for a non-PC', () => {
    const a = livePc('pc-a', 'Kira', 1), b = livePc('pc-b', 'Ren', 1);
    game.actors._set('npc-1', makeTestActor({ id: 'npc-1', type: 'character', flags: { [MODULE_ID]: { entityType: 'connection' } } }));
    expect(supplyAllies(a).map(x => x.id)).toEqual(['pc-b']);
    expect(supplyAllies(b).map(x => x.id)).toEqual(['pc-a']);
    expect(supplyAllies(game.actors.get('npc-1'))).toEqual([]);
  });

  it('two PCs at supply 1: A sacrifices 1 — supply [0, 0] once synced, both unprepared, both momentum bounds lowered', async () => {
    const a = livePc('pc-a', 'Kira', 1), b = livePc('pc-b', 'Ren', 1);

    await sacrificeResources(a, 1);
    await onUpdate(a, { system: { supply: { value: 0 } } }, {});   // the sync's expanded updateActor delta

    expect([a, b].map(x => x.system.supply.value)).toEqual([0, 0]);
    expect(unprepared(a, b)).toEqual([true, true]);
    expect([a, b].map(x => [x.system.momentum.max, x.system.momentum.resetValue])).toEqual([[9, 1], [9, 1]]);
  });

  it('control: raising the supply by a sheet edit mirrors the value and clears no one — a recovery move clears it', async () => {
    const a = livePc('pc-a', 'Kira', 1), b = livePc('pc-b', 'Ren', 1);
    await sacrificeResources(a, 1);

    await b.update({ 'system.supply.value': 2 });
    await onUpdate(b, { system: { supply: { value: 2 } } }, {});

    expect([a, b].map(x => x.system.supply.value)).toEqual([2, 2]);
    expect(unprepared(a, b)).toEqual([true, true]);
  });
});
