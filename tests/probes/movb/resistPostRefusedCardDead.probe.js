/**
 * MOVB-03 · RESIST-POST-REFUSED-CARD-DEAD (the remainder of issue #347 AB06)
 *
 * Scenario: Endure Harm takes a PC to 0 health, so the resist roll is owed —
 * the "🛡 Resist the harm — roll Endure Harm" card (issue #330 D3). The PC's
 * player presses it; the world refuses the forced move's chat message
 * (sufferDialog.js "resist": ChatMessage.create throws).
 *
 * Correct: every other card button "releases the claim when the post fails"
 * (cardActions.js), and AB06 re-opens this card when the posted roll is then
 * not made — a roll that was never even posted leaves the card open to press
 * again.
 * Today: the pick is claimed first (`resolved`), the call comes back
 * `{ ok: false, reason: "post-failed" }`, and the card stays resolved reading
 * "Not applied: Endure Harm rolled to resist — post-failed". There is no
 * message for releaseSourceCard to act on and no Retry (the reason is not
 * "refused"), so the mandatory roll can no longer be made from any card.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { failWrites } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { applyPayThePriceSufferFromRelay } from '../../../src/index.js';

let table, kira;
const gm = () => table.client('gm-1');
const resistCards = () => table.cards(f => f.sufferCard && f.sufferPrompt?.resist === 'health');
const forcedRolls = () => table.cards(f => f.forcedMoveId === 'endure_harm');
const live = (card) => table.cards(f => f.sufferCard).find(m => m._id === card._id);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  // No session begun: a forced move that is posted is held, not rolled (no confirm dialog here).
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: false } } } });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { health: { value: 1, max: 5 }, momentum: { value: 3 } } });
});

async function harmToZero() {
  const ctx = () => ({ requesterId: 'pl-1', requester: globalThis.game.users.get('pl-1'), requesterIsGM: false });
  await gm().run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: 'endure_harm', amount: 1 }], actorId: 'pc-kira' }, ctx()));
  await table.settle(); await table.drain();
  expect(kira.system.health.value).toBe(0);
  return resistCards().at(-1);
}
async function pressResist(card) {
  await table.client('pl-1').click(card._id, '[data-action="sf-suffer-pick"]', { index: 0 });
  await table.settle(); await table.drain();
}

describe('MOVB-03 RESIST-POST-REFUSED-CARD-DEAD', () => {
  it('control: the press posts Endure Harm as the PC, naming the card that owes it', async () => {
    const card = await harmToZero();
    expect(card, 'the resist card was posted at 0 health').toBeTruthy();
    await pressResist(card);
    expect(forcedRolls()).toHaveLength(1);
    expect(forcedRolls()[0].flags[MODULE_ID]).toMatchObject({ owedMove: true, sourceCard: { messageId: card._id, kind: 'suffer' } });
    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
  }, 30_000);

  it('a refused post leaves the resist card open to press again', async () => {
    const card = await harmToZero();
    const refused = failWrites(table, w => w.kind === 'message.create' && w.data?.flags?.[MODULE_ID]?.forcedMoveId === 'endure_harm');
    await pressResist(card);
    expect(refused.refused).toBe(1);
    expect(forcedRolls(), 'no roll was posted').toHaveLength(0);
    // FAILS today: the card stays resolved — "Not applied: Endure Harm rolled to resist — post-failed".
    expect(live(card).flags[MODULE_ID].resolved, 'the owed roll can still be pressed').toBe(false);
  }, 30_000);
});
