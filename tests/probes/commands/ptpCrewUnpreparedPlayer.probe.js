/**
 * PROBE — PTP-CREW-UNPREPARED-PLAYER (eighth audit, area index-commands-hooks)
 *
 * What the user does: two PCs share the crew's supply (both at 1). A player
 * types `!ptp` and rolls 69–74, "You waste resources" (Sacrifice Resources
 * -1).
 *
 * What happens: `!pay-the-price` is RUN_ON.AUTHOR, so handlePayThePriceCommand
 * (src/index.js ~3447) dispatches the suffer route on the typing player's
 * client: dispatchPayThePriceSufferRoute → executeSuffer →
 * sufferExecutor.sacrificeResources → markUnprepared (sufferExecutor.js ~297),
 * which marks the roller AND every ally sharing the supply (issue #315 S07 —
 * "you and your allies … mark unprepared together"). The ally write is an
 * Actor update on another player's PC: refused on a player's client (no
 * OWNER), caught, and the card says "could not be marked unprepared — mark it
 * on the sheet". The crew-shared supply sync (canonical GM) mirrors the 0 to
 * the ally, so the ally sits at supply 0 without the impact. The same price
 * through the move pipeline (canonical GM) marks both. The clock half of `!ptp`
 * was relayed for exactly this reason (payThePrice.advanceClocks); the suffer
 * half never was (rules/reachability.md §8).
 *
 * What should happen: the ally is marked unprepared with the roller, as the
 * move pipeline's own Sacrifice Resources does.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/commands/ptpCrewUnpreparedPlayer.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Roll 70 on Pay the Price ("You waste resources" → sacrifice_resources -1).
vi.mock('../../../src/oracles/roller.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    rollOracle: vi.fn((id, opts = {}) => original.rollOracle(id, id === 'pay_the_price' ? { ...opts, roll: 70 } : opts)),
  };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('PROBE PTP-CREW-UNPREPARED-PLAYER', () => {
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
    // Expected: both unprepared (S07, as the move pipeline does). Today: [true, false].
    expect([pat.system.debility.unprepared, quinn.system.debility.unprepared]).toEqual([true, true]);
  }, 30_000);

  it('control: the GM typing the same !ptp for that PC marks both', async () => {
    await table.client('gm-1').chat('!ptp', { speaker: { actor: 'pc-pat' } });
    await table.settle();

    const pat   = table.actors.get('pc-pat');
    const quinn = table.actors.get('pc-quinn');
    expect([pat.system.debility.unprepared, quinn.system.debility.unprepared]).toEqual([true, true]);
  }, 30_000);
});
