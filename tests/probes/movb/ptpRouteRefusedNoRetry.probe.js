/**
 * MOVB-01 · PTP-ROUTE-REFUSED-NO-RETRY (INCOMPLETE-FIX of SUFFER-RETRY-WHOLE-AFTER-METER /
 * PTP-ANY-ROUTE-PICKER-REFUSED-SILENT)
 *
 * Scenario: a Pay the Price row routes straight to a suffer move ("You are
 * harmed" → Endure Harm) — a move's miss, or a relayed `!ptp`. The world
 * refuses one of the executor's writes on the canonical GM.
 *
 *   a) The second write (the harm past 0 health, taken as momentum) is refused:
 *      the executor's own card says "not saved (the GMs have a Retry)".
 *   b) The first write (the health itself) is refused: the executor throws.
 *
 * Correct: as for the same refusal on a suffer card's pick (sufferCard.js
 * reportRefusedCalls) — the GMs get a payoff failure card whose Retry applies
 * the refused write once.
 * Today: index.js dispatchPayThePriceSufferRoutes logs to the console and
 * goes on. (a) the card promises a Retry that is never posted; (b) nothing is
 * posted at all — the price's cost is lost in silence under a Pay the Price
 * card that says "Routes to Endure Harm".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { failWrites } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { applyPayThePriceSufferFromRelay } from '../../../src/index.js';

let table, kira;
const gm = () => table.client('gm-1');
const failCards = () => table.cards(f => f.payoffFailureCard);
const harmCards = () => table.cards(f => f.sufferCard && f.suffer === 'endure_harm');
const pickers   = () => table.cards(f => f.sufferCard && f.sufferPrompt);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: false } } } });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { health: { value: 1, max: 5 }, momentum: { value: 5 } } });
});

const ctx = () => ({ requesterId: 'pl-1', requester: globalThis.game.users.get('pl-1'), requesterIsGM: false });
async function payRoutes(routes) {
  const res = await gm().run(() => applyPayThePriceSufferFromRelay({ routes, actorId: 'pc-kira' }, ctx()));
  await table.settle(); await table.drain();
  return res;
}
const momentumWrite = (w) => w.kind === 'actor.update' && w.id === 'pc-kira'
  && Object.keys(w.changes ?? {}).some(k => k.startsWith('system.momentum'));
const healthWrite = (w) => w.kind === 'actor.update' && w.id === 'pc-kira'
  && Object.keys(w.changes ?? {}).some(k => k.startsWith('system.health'));

describe('MOVB-01 PTP-ROUTE-REFUSED-NO-RETRY', () => {
  it('control: an unrefused route lands the harm and its overflow, with no failure card', async () => {
    await payRoutes([{ move: 'endure_harm', amount: 2 }]);
    expect({ health: kira.system.health.value, momentum: kira.system.momentum.value }).toEqual({ health: 0, momentum: 4 });
    expect(harmCards()).toHaveLength(1);
    expect(failCards()).toEqual([]);
  }, 30_000);

  it('control: the same refusal on a suffer card pick does give the GMs a Retry', async () => {
    await payRoutes([{ move: 'any', amount: 2 }]);
    const refused = failWrites(table, momentumWrite);
    await table.client('pl-1').click(pickers().at(-1)._id, '[data-action="sf-suffer-pick"]', { index: 0 });   // Endure Harm
    await table.settle(); await table.drain();
    expect(refused.refused).toBe(1);
    expect(failCards()).toHaveLength(1);
    expect(failCards()[0].flags[MODULE_ID].steps).toMatchObject([{ step: 'suffer', call: { kind: 'meter', meterKey: 'momentum', delta: -1 } }]);
  }, 30_000);

  it("a route's refused second write: the card says the GMs have a Retry — and they must have one", async () => {
    const refused = failWrites(table, momentumWrite);
    await payRoutes([{ move: 'endure_harm', amount: 2 }]);
    expect(refused.refused).toBe(1);
    // The harm landed, the momentum did not, and the executor's card says where to go for it.
    expect({ health: kira.system.health.value, momentum: kira.system.momentum.value }).toEqual({ health: 0, momentum: 5 });
    expect(harmCards()[0].content).toMatch(/not saved<\/strong> \(the GMs have a Retry\)/);
    // FAILS today: no payoff failure card is posted on the Pay the Price route.
    expect(failCards(), 'the Retry the card promises').toHaveLength(1);
    expect(failCards()[0]?.flags?.[MODULE_ID]?.steps).toMatchObject([{ step: 'suffer', call: { kind: 'meter', meterKey: 'momentum', delta: -1 } }]);
  }, 30_000);

  it("a route's refused first write is told to the GMs, with a Retry — not lost in the console", async () => {
    const refused = failWrites(table, healthWrite);
    const res = await payRoutes([{ move: 'endure_harm', amount: 1 }]);
    expect(refused.refused).toBe(1);
    expect(res).toMatchObject({ applied: true });
    expect(kira.system.health.value, 'the harm did not land').toBe(1);
    // FAILS today: nothing at all is posted — no suffer card, no failure card.
    expect(failCards(), 'a payoff failure card for the refused route').toHaveLength(1);
  }, 30_000);
});
