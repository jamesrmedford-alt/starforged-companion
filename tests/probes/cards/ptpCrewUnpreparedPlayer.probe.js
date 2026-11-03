/**
 * PROBE — IC PTP-PLAYER-CREW-UNPREPARED
 *
 * What the user does: a player types `!ptp` (or `!pay-the-price`) and the d100
 * lands on "You waste resources" — a Sacrifice Resources (-1) route — with the
 * crew's shared supply at 1.
 *
 * What happens: `!ptp` runs on the typist's client (CHAT_COMMAND_ROUTES
 * RUN_ON.AUTHOR, src/index.js ~607); handlePayThePriceCommand dispatches the
 * route there (dispatchPayThePriceSufferRoutes ~3492 →
 * dispatchPayThePriceSufferRoute ~5451 → executeSuffer). The supply reaches 0
 * and sufferExecutor.markUnprepared marks the typist's PC and every ally
 * sharing the supply (issue #315 S04/S07: "you mark unprepared together") —
 * but the allies are other players' Actors, which a player's client may not
 * update: every ally write is refused, systematically, and the card tells the
 * table to "mark it on the sheet". Only the clock advance was relayed
 * (`payThePrice.advanceClocks`); the routed suffer was left on the typist's
 * client on the reasoning that "the player owns it" — true of the typist's
 * PC, not of the crew's impact added later.
 *
 * What should happen: the crew is marked unprepared together, as it is when
 * the same route comes from the move pipeline (canonical GM) — the route's
 * crew writes relayed to the canonical GM.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/oracles/roller.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    rollOracle: vi.fn((id, ...rest) => id === 'pay_the_price'
      ? { roll: 70, result: 'You waste resources', sufferRoutes: [{ move: 'sacrifice_resources', amount: 1 }] }
      : original.rollOracle(id, ...rest)),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, kira, ren;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1' },
  } } });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { supply: { value: 1 } } });
  ren  = table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, system: { supply: { value: 1 } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table);
  silenceConsoleErrors();
});

describe('PROBE IC PTP-PLAYER-CREW-UNPREPARED', () => {
  it('a player\'s !ptp that takes the shared supply to 0 marks the whole crew unprepared', async () => {
    await table.client('pl-1').chat('!ptp', { speaker: { actor: 'pc-kira', alias: 'Kira' } });
    await table.settle(); await table.drain();

    expect(kira.system.supply.value).toBe(0);
    expect(kira.system.debility.unprepared).toBe(true);
    // Expected: Ren, sharing the supply, is marked too. Today: the write is refused on Pat's client.
    expect(ren.system.debility.unprepared).toBe(true);
  }, 30_000);

  it('control: the GM typing the same !ptp for Kira marks both', async () => {
    await table.client('gm-1').chat('!ptp', { speaker: { actor: 'pc-kira', alias: 'Kira' } });
    await table.settle(); await table.drain();

    expect(kira.system.debility.unprepared).toBe(true);
    expect(ren.system.debility.unprepared).toBe(true);
  }, 30_000);
});
