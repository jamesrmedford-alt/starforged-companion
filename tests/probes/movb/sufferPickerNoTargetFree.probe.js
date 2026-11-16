/**
 * MOVB-02 · SUFFER-PICKER-NO-TARGET-FREE
 *
 * Scenario: a "make a suffer move (-N)" picker (Face Danger's weak hit, a Pay
 * the Price "any" route, a redirected loss). The PC has no companion asset —
 * or no command vehicle is registered — and the player presses "Companion
 * Takes a Hit" / "Withstand Damage".
 *
 * Correct: a suffer move with nothing to suffer it is not a way to pay the
 * cost — the pick is not offered (as Sacrifice Resources is greyed while
 * unprepared), or it leaves the card open for another suffer move. Either
 * way the cost is still owed after the press.
 * Today: the card is claimed before its effect (sufferCard.js handleSufferPick),
 * the executor finds no companion / vehicle and applies nothing, and the card
 * stays resolved — "Not applied: Companion Takes a Hit (-2) — no companion to
 * change". Nothing was paid, the move's Burn / Improve were closed by the
 * "choice", and there is no Retry (the reason is not "refused").
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { applyPayThePriceSufferFromRelay } from '../../../src/index.js';

let table, kira;
const gm = () => table.client('gm-1');
const pickers = () => table.cards(f => f.sufferCard && f.sufferPrompt);
const flagsOf = (card) => table.cards(f => f.sufferCard).find(m => m._id === card._id).flags[MODULE_ID];
const meters  = () => ({ health: kira.system.health.value, spirit: kira.system.spirit.value,
  supply: kira.system.supply.value, momentum: kira.system.momentum.value });

const WITHSTAND_DAMAGE = 4;        // the any-picker's buttons, in order
const COMPANION_TAKES_A_HIT = 5;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: false } } } });
});

function addKira(items = []) {
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { health: { value: 4, max: 5 }, spirit: { value: 4, max: 5 }, supply: { value: 4, max: 5 }, momentum: { value: 3 } },
    ...(items.length ? { items: { contents: items } } : {}) });
}
function companion() {
  const glow = { id: 'asset-glowcat', name: 'Glowcat', type: 'asset',
    system: { category: 'Companion', track: { enabled: true, name: 'Health', value: 3, min: 0, max: 4 }, conditions: [] },
    async update(changes) { if ('system.track.value' in changes) glow.system.track.value = changes['system.track.value']; return glow; } };
  return glow;
}

async function anyPicker() {
  const ctx = () => ({ requesterId: 'pl-1', requester: globalThis.game.users.get('pl-1'), requesterIsGM: false });
  await gm().run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: 'any', amount: 2 }], actorId: 'pc-kira' }, ctx()));
  await table.settle(); await table.drain();
  return pickers().at(-1);
}
async function press(card, index) {
  // A fix may grey the button out: a press on it then does nothing, which is correct too.
  await Promise.resolve(table.client('pl-1').click(card._id, '[data-action="sf-suffer-pick"]', { index })).catch(() => {});
  await table.settle(); await table.drain();
}

describe('MOVB-02 SUFFER-PICKER-NO-TARGET-FREE', () => {
  it('control: with a companion, Companion Takes a Hit takes its health and resolves the card', async () => {
    const glow = companion();
    addKira([glow]);
    const card = await anyPicker();
    await press(card, COMPANION_TAKES_A_HIT);
    expect(glow.system.track.value).toBe(1);
    expect(flagsOf(card).resolved).toBe(true);
  }, 30_000);

  it('with no companion, pressing Companion Takes a Hit does not settle the cost for nothing', async () => {
    addKira();
    const card = await anyPicker();
    const before = meters();
    await press(card, COMPANION_TAKES_A_HIT);
    expect(meters(), 'nothing was paid').toEqual(before);
    // FAILS today: the card is resolved ("Not applied: … — no companion to change") and the cost is gone.
    expect(flagsOf(card).resolved, 'the cost is still owed: the picker is open for another suffer move').toBe(false);
  }, 30_000);

  it('with no command vehicle, pressing Withstand Damage does not settle the cost for nothing', async () => {
    addKira();
    const card = await anyPicker();
    const before = meters();
    await press(card, WITHSTAND_DAMAGE);
    expect(meters(), 'nothing was paid').toEqual(before);
    // FAILS today: resolved, "Not applied: Withstand Damage (-2) — no vehicle to change".
    expect(flagsOf(card).resolved, 'the cost is still owed: the picker is open for another suffer move').toBe(false);
  }, 30_000);
});
