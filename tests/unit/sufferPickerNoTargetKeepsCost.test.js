/**
 * STARFORGED COMPANION
 * tests/unit/sufferPickerNoTargetKeepsCost.test.js
 *
 * Issue #362 AC28 SUFFER-PICKER-NO-TARGET-FREE. On a "make a suffer move
 * (-N)" card (Face Danger's weak hit, a Pay the Price "any" route, a
 * redirected loss) a character with no companion could press "Companion
 * Takes a Hit" — and a crew with no command vehicle "Withstand Damage": the
 * card was claimed before its effect (sufferCard.js handleSufferPick), the
 * executor found nothing to change, and the card stayed resolved — "Not
 * applied: Companion Takes a Hit (-2) — no companion to change". Nothing was
 * paid, the move's Burn / Improve were closed by the "choice", and there was
 * no Retry. With several companions and none named, the executor hit none and
 * said "apply it on the sheet". Now the two buttons are unavailable when
 * there is nothing to take the hit (as Sacrifice Resources is while
 * unprepared), several companions ask which, and a pick that still finds
 * nothing leaves its card open.
 *
 * Booted GM + player table (tests/helpers/multiClient.js); the first block
 * from the audit's probe (tests/probes/movb/sufferPickerNoTargetFree.probe.js).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { applyPayThePriceSufferFromRelay } from '../../src/index.js';

let table, kira;
const gm = () => table.client('gm-1');
const pickers = () => table.cards(f => f.sufferCard && f.sufferPrompt);
const flagsOf = (card) => table.world.message(card._id).flags[MODULE_ID];
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
function companion(id = 'asset-glowcat', name = 'Glowcat', health = 3) {
  const item = { id, name, type: 'asset',
    system: { category: 'Companion', track: { enabled: true, name: 'Health', value: health, min: 0, max: 4 }, conditions: [] },
    async update(changes) { if ('system.track.value' in changes) item.system.track.value = changes['system.track.value']; return item; } };
  return item;
}

async function anyPicker() {
  const ctx = () => ({ requesterId: 'pl-1', requester: globalThis.game.users.get('pl-1'), requesterIsGM: false });
  await gm().run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: 'any', amount: 2 }], actorId: 'pc-kira' }, ctx()));
  await table.settle(); await table.drain();
  return pickers().at(-1);
}
async function press(card, index) {
  // A greyed-out button does nothing when pressed.
  await Promise.resolve(table.client('pl-1').click(card._id, '[data-action="sf-suffer-pick"]', { index })).catch(() => {});
  await table.settle(); await table.drain();
}
/** The pick relayed straight to the GM, as a hand-made relay could send it (no button). */
async function relayPick(card, sufferId) {
  const c = table.client('pl-1');
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  await c.run(() => gmRelay.requestGmAction('suffer.pick', { messageId: card._id, pickKind: 'any', sufferId }));
  await table.settle(); await table.drain();
}

describe('issue #362 AC28 — a suffer move with nothing to suffer it does not settle the cost', () => {
  it('control: with a companion, Companion Takes a Hit takes its health and resolves the card', async () => {
    const glow = companion();
    addKira([glow]);
    const card = await anyPicker();
    await press(card, COMPANION_TAKES_A_HIT);
    expect(glow.system.track.value).toBe(1);
    expect(flagsOf(card).resolved).toBe(true);
  }, 30_000);

  it('with no companion, Companion Takes a Hit is unavailable and the cost is still owed', async () => {
    addKira();
    const card = await anyPicker();
    expect(table.world.message(card._id).content).toMatch(/Companion Takes a Hit \(-2\) \(unavailable\)/);
    const before = meters();
    await press(card, COMPANION_TAKES_A_HIT);
    expect(meters(), 'nothing was paid').toEqual(before);
    // It closed "Not applied: … — no companion to change", the cost gone (AC28).
    expect(flagsOf(card).resolved, 'the cost is still owed: the picker is open for another suffer move').toBe(false);
    // A relayed pick of it is refused before the card is claimed.
    await relayPick(card, 'companion_takes_a_hit');
    expect(flagsOf(card).resolved).toBe(false);
  }, 30_000);

  it('with no command vehicle, Withstand Damage is unavailable and the cost is still owed', async () => {
    addKira();
    const card = await anyPicker();
    expect(table.world.message(card._id).content).toMatch(/Withstand Damage \(-2\) \(unavailable\)/);
    const before = meters();
    await press(card, WITHSTAND_DAMAGE);
    expect(meters(), 'nothing was paid').toEqual(before);
    expect(flagsOf(card).resolved, 'the cost is still owed: the picker is open for another suffer move').toBe(false);
    await relayPick(card, 'withstand_damage');
    expect(flagsOf(card).resolved).toBe(false);
  }, 30_000);
});

describe('issue #362 AC28 — several companions, none named: the player is asked which', () => {
  it('Companion Takes a Hit posts a "which companion?" card, and its pick takes that companion\'s health', async () => {
    const glow = companion('asset-glowcat', 'Glowcat', 3);
    const rock = companion('asset-rockhorn', 'Rockhorn', 4);
    addKira([glow, rock]);
    const card = await anyPicker();
    await press(card, COMPANION_TAKES_A_HIT);
    expect(flagsOf(card).resolved, 'the picker is the choice made').toBe(true);
    expect(table.world.message(card._id).content).toMatch(/choose which companion/i);
    const which = pickers().at(-1);
    expect(which._id).not.toBe(card._id);
    expect(which.flags[MODULE_ID].sufferPrompt.options.map(o => o.label))
      .toEqual(['Glowcat takes the hit (-2)', 'Rockhorn takes the hit (-2)']);
    expect({ glow: glow.system.track.value, rock: rock.system.track.value }, 'nothing paid yet').toEqual({ glow: 3, rock: 4 });

    await table.client('pl-1').click(which._id, '[data-action="sf-suffer-pick"][data-option-index="1"]');
    await table.settle(); await table.drain();
    expect({ glow: glow.system.track.value, rock: rock.system.track.value }).toEqual({ glow: 3, rock: 2 });
    expect(flagsOf(which).resolved).toBe(true);
  }, 30_000);

  it('a pick that finds its companion gone since leaves its card open, saying why', async () => {
    const glow = companion('asset-glowcat', 'Glowcat', 3);
    const rock = companion('asset-rockhorn', 'Rockhorn', 4);
    addKira([glow, rock]);
    const card = await anyPicker();
    await press(card, COMPANION_TAKES_A_HIT);
    const which = pickers().at(-1);
    // The Glowcat is discarded before its button is pressed.
    kira.items.contents.splice(kira.items.contents.indexOf(glow), 1);
    await table.client('pl-1').click(which._id, '[data-action="sf-suffer-pick"][data-option-index="0"]');
    await table.settle(); await table.drain();
    expect(flagsOf(which).resolved, 'nothing was paid: the card is open').toBe(false);
    expect(table.world.message(which._id).content).toMatch(/no companion to change\. Choose another\./);
    expect(rock.system.track.value).toBe(4);
  }, 30_000);
});
