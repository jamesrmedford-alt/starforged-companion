/**
 * STARFORGED COMPANION
 * tests/unit/ptpAnyRoutePickerRefused.test.js
 *
 * PTP-ANY-ROUTE-PICKER-REFUSED-SILENT (ERROR-TEXT-BLAMES-KEY's remainder, at
 * the Pay the Price dispatch). A price routed to "any" suffer move (Take
 * Decisive Action's "make a suffer move (-2)", or a relayed `!ptp` route)
 * posts the player's picker card; `dispatchPayThePriceSufferRoute` ignored a
 * refused post, so the price was lost and nobody was told. The refused picker
 * now goes to the GMs' card as a `choiceCard` step — as persistResolution's
 * refused choice card does — whose Retry posts it, once.
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { applyPayThePriceSufferFromRelay } from '../../src/index.js';

let table;
const gm = () => table.client('gm-1');
const failCards = () => table.cards(f => f.payoffFailureCard);
const pickers = () => table.cards(f => f.sufferCard);
const pickerPost = (w) => w.kind === 'message.create' && w.data?.flags?.[MODULE_ID]?.sufferCard === true;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: true } } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { health: { value: 5 } } });
});

async function anyPrice() {
  // The context is the GM client's: its users (gm().run swaps the globals in).
  const ctx = () => ({ requesterId: 'pl-1', requester: globalThis.game.users.get('pl-1'), requesterIsGM: false });
  const res = await gm().run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: 'any', amount: 2 }], actorId: 'pc-kira' }, ctx()));
  await table.settle();
  return res;
}

describe('PTP-ANY-ROUTE-PICKER-REFUSED-SILENT', () => {
  it('control: the picker posts for the payer', async () => {
    expect(await anyPrice()).toMatchObject({ applied: true });
    expect(pickers()).toHaveLength(1);
    expect(pickers()[0].flags[MODULE_ID]).toMatchObject({ actorId: 'pc-kira' });
    expect(failCards()).toEqual([]);
  }, 30_000);

  it("a refused picker goes to the GMs' card, whose Retry posts it once", async () => {
    expectConsoleError(/picker|post failed|choice card/i);
    const refused = failWrites(table, pickerPost);
    await anyPrice();
    expect(refused.refused).toBe(1);
    expect(pickers()).toHaveLength(0);

    const [card] = failCards();
    expect(failCards()).toHaveLength(1);
    expect(card.flags[MODULE_ID]).toMatchObject({ source: 'suffer', actorId: 'pc-kira' });
    expect(card.flags[MODULE_ID].steps).toMatchObject([{ step: 'choiceCard', pcId: 'pc-kira',
      sufferPrompt: { kind: 'any', amount: 2 } }]);
    expect(card.content).toMatch(/Kira's choice card from Pay the Price — the world did not save it\. Nothing on it has been chosen yet\./);

    gm().click(card._id, '[data-action="sf-payoff-retry"]');
    await table.settle(); await table.drain();
    expect(pickers()).toHaveLength(1);
    expect(pickers()[0].flags[MODULE_ID]).toMatchObject({ actorId: 'pc-kira', resolved: false });

    gm().click(card._id, '[data-action="sf-payoff-retry"]');   // claimed: a second press posts nothing
    await table.settle(); await table.drain();
    expect(pickers()).toHaveLength(1);
  }, 30_000);
});
