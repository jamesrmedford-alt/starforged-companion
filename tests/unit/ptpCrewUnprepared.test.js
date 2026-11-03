/**
 * A player's `!ptp` marks the crew unprepared together (issue #325 W10).
 *
 * Two PCs share the crew's supply (both at 1). A player types `!ptp` and
 * rolls "You waste resources" (Sacrifice Resources -1). `!pay-the-price` runs
 * on its author's client (RUN_ON.AUTHOR) and dispatched its suffer route
 * there: sacrificeResources → markUnprepared marks the roller AND every ally
 * sharing the supply (issue #315 S07), but the ally is another player's
 * Actor, which a player's client may not update — every ally write was
 * refused. Only the clock half was relayed. The routes now go to the
 * canonical GM ("payThePrice.suffer"), with the typist as the roller.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Roll 70 on Pay the Price ("You waste resources" → sacrifice_resources -1).
vi.mock('../../src/oracles/roller.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    rollOracle: vi.fn((id, opts = {}) => original.rollOracle(id, id === 'pay_the_price' ? { ...opts, roll: 70 } : opts)),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { applyPayThePriceSufferFromRelay } from '../../src/index.js';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
  } } } });
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 }, system: { supply: { value: 1 } } });
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 }, system: { supply: { value: 1 } } });
});

describe("a player's !ptp and the crew's shared supply", () => {
  it("a player's !ptp that takes the shared supply to 0 marks the whole crew unprepared", async () => {
    await table.client('pl-1').chat('!ptp', { speaker: { actor: 'pc-pat' } });
    await table.settle();

    const pat   = table.actors.get('pc-pat');
    const quinn = table.actors.get('pc-quinn');
    // The roller paid. (In Foundry the canonical GM's shared-supply sync then
    // mirrors the 0 to the ally; the harness fires updateActor with the raw
    // dotted change, which that hook does not read, so the ally's number is
    // not asserted here — the impact is what this probe is about.)
    expect(pat.system.supply.value).toBe(0);
    // Both unprepared (S07, as the move pipeline does).
    expect([pat.system.debility.unprepared, quinn.system.debility.unprepared]).toEqual([true, true]);
  }, 30_000);

  it('control: the GM typing the same !ptp for that PC marks both', async () => {
    await table.client('gm-1').chat('!ptp', { speaker: { actor: 'pc-pat' } });
    await table.settle();

    const pat   = table.actors.get('pc-pat');
    const quinn = table.actors.get('pc-quinn');
    expect([pat.system.debility.unprepared, quinn.system.debility.unprepared]).toEqual([true, true]);
  }, 30_000);

  it('a player with no PC of their own pays nothing onto another player\'s PC', async () => {
    await table.client('pl-2').run(() => {
      const quinn = globalThis.game.actors.get('pc-quinn');
      quinn.ownership = { 'pl-1': 3 };            // pl-2 owns no PC now
    });
    await table.client('pl-2').chat('!ptp');
    await table.settle();

    const pat   = table.actors.get('pc-pat');
    const quinn = table.actors.get('pc-quinn');
    expect([pat.system.supply.value, quinn.system.supply.value]).toEqual([1, 1]);
  }, 30_000);
});

describe('the payThePrice.suffer relay handler', () => {
  let table;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: true } } } });
    table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 }, system: { supply: { value: 3 }, health: { value: 5 } } });
    table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 }, system: { supply: { value: 3 }, health: { value: 5 } } });
  });

  const asGm = (fn) => table.client('gm-1').run(fn);
  const ctxFor = (userId, isGM = false) => ({ requesterId: userId, requester: globalThis.game.users.get(userId), requesterIsGM: isGM });

  it('refuses a requester who does not own the PC', async () => {
    const res = await asGm(() => applyPayThePriceSufferFromRelay(
      { routes: [{ move: 'endure_harm', amount: 1 }], actorId: 'pc-quinn' }, ctxFor('pl-1')));
    expect(res).toEqual({ applied: false, reason: 'not-owner' });
    expect(table.actors.get('pc-quinn').system.health.value).toBe(5);
  });

  it('drops a route that names no suffer move, or an amount out of range', async () => {
    const res = await asGm(() => applyPayThePriceSufferFromRelay(
      { routes: [{ move: 'awardXP', amount: 1 }, { move: 'endure_harm', amount: 9 }], actorId: 'pc-pat' }, ctxFor('pl-1')));
    expect(res).toEqual({ applied: false, reason: 'no-routes' });
    expect(table.actors.get('pc-pat').system.health.value).toBe(5);
  });

  it("control: the owner's route lands on their PC", async () => {
    const res = await asGm(() => applyPayThePriceSufferFromRelay(
      { routes: [{ move: 'endure_harm', amount: 1 }], actorId: 'pc-pat' }, ctxFor('pl-1')));
    expect(res.applied).toBe(true);
    expect(table.actors.get('pc-pat').system.health.value).toBe(4);
  });
});
