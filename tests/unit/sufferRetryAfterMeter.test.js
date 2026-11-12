/**
 * STARFORGED COMPANION
 * tests/unit/sufferRetryAfterMeter.test.js
 *
 * SUFFER-RETRY-WHOLE-AFTER-METER — a suffer pick's executor writes the meter,
 * then a second write: Endure Harm / Stress the harm past 0 as momentum,
 * Sacrifice Resources the unprepared mark at 0 supply. A refused second write
 * threw past the landed meter write: the call was reported refused whole, and
 * its `suffer` Retry ran the executor again — Endure Harm at 0 health the
 * second time is all momentum (-2, not the -1 owed), Sacrifice Resources took
 * the supply again. The second write is reported apart now: the card says the
 * meter landed and that write did not, and the GMs' Retry applies it alone.
 *
 * The booted table: a GM and a player; an "any" suffer picker posted by a
 * relayed Pay the Price route ("make a suffer move (-2)"); the world refuses
 * the second write once.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { applyPayThePriceSufferFromRelay } from '../../src/index.js';

let table, kira, ren;
const gm = () => table.client('gm-1');
const pickers = () => table.cards(f => f.sufferCard && f.sufferPrompt);
const failCards = () => table.cards(f => f.payoffFailureCard);
const ENDURE_HARM = 0;            // the any-picker's buttons, in order
const SACRIFICE_RESOURCES = 3;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: true } } } });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { health: { value: 1, max: 5 }, momentum: { value: 5 }, supply: { value: 1 } } });
  ren = table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 }, system: { supply: { value: 1 } } });
});

async function pickFromAnyPrice(index) {
  const ctx = () => ({ requesterId: 'pl-1', requester: globalThis.game.users.get('pl-1'), requesterIsGM: false });
  await gm().run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: 'any', amount: 2 }], actorId: 'pc-kira' }, ctx()));
  await table.settle(); await table.drain();
  const card = pickers().at(-1);
  await table.client('pl-1').click(card._id, '[data-action="sf-suffer-pick"]', { index });
  await table.settle(); await table.drain();
  return card;
}

async function retry(card) {
  gm().click(card._id, '[data-action="sf-payoff-retry"]');
  await table.settle(); await table.drain();
}

const pickerContent = (card) => table.cards(f => f.sufferCard).find(m => m._id === card._id).content;

describe('SUFFER-RETRY-WHOLE-AFTER-METER', () => {
  it('Endure Harm (-2) at health 1: the momentum past 0 is refused; the Retry takes that -1 alone, never the harm again', async () => {
    const refused = failWrites(table, w => w.kind === 'actor.update' && w.id === 'pc-kira'
      && Object.keys(w.changes ?? {}).some(k => k.startsWith('system.momentum')));
    const card = await pickFromAnyPrice(ENDURE_HARM);
    expect(refused.refused).toBe(1);
    expect({ health: kira.system.health.value, momentum: kira.system.momentum.value }).toEqual({ health: 0, momentum: 5 });
    // The card says the harm landed, and the momentum did not.
    expect(pickerContent(card)).toMatch(/Applied: Endure Harm \(-2\)/);
    expect(pickerContent(card)).toMatch(/Not applied: Momentum -1 — the world did not save it/);

    const [failure] = failCards();
    expect(failCards()).toHaveLength(1);
    expect(failure.flags[MODULE_ID].steps).toMatchObject([{ step: 'suffer', call: { kind: 'meter', meterKey: 'momentum', delta: -1 } }]);
    await retry(failure);
    expect({ health: kira.system.health.value, momentum: kira.system.momentum.value }).toEqual({ health: 0, momentum: 4 });
  }, 30_000);

  it('Sacrifice Resources (-2) at supply 1: the unprepared mark is refused; the Retry marks the crew alone, never the supply again', async () => {
    const refused = failWrites(table, w => w.kind === 'actor.update' && w.id === 'pc-kira'
      && w.changes?.['system.debility.unprepared'] === true);
    const card = await pickFromAnyPrice(SACRIFICE_RESOURCES);
    expect(refused.refused).toBe(1);
    expect(kira.system.supply.value).toBe(0);
    expect(kira.system.debility?.unprepared ?? false).toBe(false);
    expect(pickerContent(card)).toMatch(/Applied: Sacrifice Resources \(-2\)/);
    expect(pickerContent(card)).toMatch(/Not applied: marked Unprepared — the world did not save it/);

    const [failure] = failCards();
    expect(failure.flags[MODULE_ID].steps).toMatchObject([{ step: 'suffer', call: { kind: 'mark', debility: 'unprepared' } }]);
    await retry(failure);
    expect(kira.system.supply.value).toBe(0);
    expect({ kira: kira.system.debility.unprepared, ren: ren.system.debility.unprepared }).toEqual({ kira: true, ren: true });
    // No second Sacrifice Resources: no redirect picker was posted for an unprepared loss.
    expect(pickers()).toHaveLength(1);
  }, 30_000);
});
