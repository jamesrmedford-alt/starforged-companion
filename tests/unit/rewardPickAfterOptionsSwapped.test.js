/**
 * STARFORGED COMPANION
 * tests/unit/rewardPickAfterOptionsSwapped.test.js
 *
 * Issue #364 VOW-CARD-RENAME-NO-GM, the second half (left open by
 * VOW-CARD-GENERIC-UNTIL-NAMED). A reward-choice card's options are replaced
 * in place the first time its vow gets a name (reproposeVowRewards). A pick
 * carried only the option's index, so a click made on the card as a client
 * still showed it — the old options — and landing after the swap promised
 * whatever now sat at that index: the player pressed "A crate of sealed
 * rations" and was promised "The name of who stole it".
 *
 * The click now carries the option's text as that render of the card showed
 * it, and the canonical GM refuses a pick whose text is not the card's option
 * at that index: nothing is promised, the card stays open, and the clicker is
 * told to choose again. The reward itself is always the card's own option
 * (its flags) — the click's text is only compared, never promised.
 *
 * On a booted table: the real createItem / updateItem hooks, the real cards
 * rendered on the player's client, the real click through the relay; only the
 * Claude endpoint is scripted.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable } from '../helpers/skeletonTable.js';

const REAL_NAME = 'Recover the stolen reactor core';
const GENERIC   = [{ description: 'A favour owed by a stranger', form: 'contact' }, { description: 'A crate of sealed rations', form: 'supply' }];
const NAMED     = [{ description: 'The reactor core\'s spare coupling', form: 'gear' }, { description: 'The name of who stole it', form: 'knowledge' }];

let table, restore, kira;
const rewardCards = () => table.cards(f => f.rewardChoiceCard);
const notices     = () => table.cards(f => f.vowWriteRefusedNotice);
const rewardSet   = () => table.cards(f => f.rewardSetCard);
const flagsOf     = (m) => m.flags[MODULE_ID];
const idOf        = (m) => m.id ?? m._id;
const PICK        = '[data-action="sf-reward-pick"]';

function sheetVow(id, name, rank = 1) {
  const item = {
    id, type: 'progress', name, parent: kira, flags: {},
    system: { subtype: 'vow', rank, current: 0, completed: false },
    async update(changes) { if (typeof changes?.name === 'string') item.name = changes.name; return item; },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  kira.items.contents.push(item);
  return item;
}

async function fire(hook, ...args) {
  for (const c of table.connectedClients) c.run(() => Hooks.callAll(hook, ...args));
  await table.settle(); await table.drain();
}
const created = (item) => fire('createItem', item, {}, 'pl-1');
async function renamed(item, name) {
  item.name = name;
  await fire('updateItem', item, { name, _id: item.id }, {}, 'pl-1');
}
const settled = async () => { await table.settle(); await table.drain(); };

/** A pick sent straight to the canonical GM's handler, as the relay delivers it from pl-1. */
async function gmReceives(payload) {
  const gm = table.client('gm-1');
  const sv = await gm.import('../../src/session/swearVow.js');
  const res = await gm.run(() => sv.applyRewardPickFromRelay(payload, { requesterId: 'pl-1' }));
  await settled();
  return res;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  restore = await resetSkeletonTable(table, {}, { connectionIds: [] });
  kira = table.actors.get('pc-kira');
  table.script.when(c => /has just sworn a vow/.test(c.userText ?? '') && c.userText.includes(REAL_NAME),
    JSON.stringify({ rewards: NAMED }), { times: -1 });
  table.script.when(c => /has just sworn a vow/.test(c.userText ?? ''), JSON.stringify({ rewards: GENERIC }), { times: -1 });
  globalThis.silenceConsoleErrors();
});
afterEach(() => restore?.());

describe('issue #364 VOW-CARD-RENAME-NO-GM — a reward click that lands after the card\'s options were swapped', () => {
  /** + Vow, the player's client showing the generic options, then the vow named: the options are swapped under that render. */
  async function clickOnTheCardAsItWas(idx) {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    const rewardId = idOf(rewardCards()[0]);
    const player = table.client('pl-1');
    const asShown = player.render(rewardId).querySelectorAll(PICK)[idx];   // the button the player is about to press
    expect(asShown.textContent).toBe(GENERIC[idx].description);
    await renamed(vow, REAL_NAME);
    expect(flagsOf(rewardCards()[0]).rewardOptions, 'the options were swapped (setup)').toEqual(NAMED);

    player.run(() => asShown.click());
    await settled();
    return { vow, rewardId, player };
  }

  it('promises nothing: not the option pressed, and not the one now at its index', async () => {
    const { vow } = await clickOnTheCardAsItWas(1);

    expect(vow.flags[MODULE_ID]?.reward, 'it was promised "The name of who stole it"').toBeUndefined();
    expect(rewardSet()).toHaveLength(0);
    expect(flagsOf(rewardCards()[0]).rewardChosen, 'the card stays open').toBeFalsy();
  }, 60_000);

  it('tells the clicker — whispered — to choose again from the card as it is now', async () => {
    await clickOnTheCardAsItWas(0);

    expect(notices()).toHaveLength(1);
    expect(notices()[0].content).toContain('Reward not set');
    expect(notices()[0].content).toMatch(/changed/i);
    expect(notices()[0].whisper).toEqual(expect.arrayContaining(['pl-1', 'gm-1']));
  }, 60_000);

  it('the card as it is now can still be picked from: that reward is promised', async () => {
    const { vow, rewardId, player } = await clickOnTheCardAsItWas(1);

    player.click(rewardId, `${PICK}[data-idx="1"]`);
    await settled();

    expect(vow.flags[MODULE_ID].reward).toMatchObject({ status: 'promised', description: 'The name of who stole it', form: 'knowledge' });
    expect(rewardSet()).toHaveLength(1);
    expect(notices(), 'only the refused click\'s notice').toHaveLength(1);
  }, 60_000);

  it('control: a click on a card whose options did not change promises the option pressed', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);

    table.client('pl-1').click(idOf(rewardCards()[0]), `${PICK}[data-idx="1"]`);
    await settled();

    expect(vow.flags[MODULE_ID].reward).toMatchObject({ status: 'promised', description: 'A crate of sealed rations', form: 'supply' });
    expect(notices()).toHaveLength(0);
  }, 60_000);

  it('control: write-your-own is the clicker\'s own words and is not checked against the options', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    const rewardId = idOf(rewardCards()[0]);
    await renamed(vow, REAL_NAME);

    expect(await gmReceives({ messageId: rewardId, own: 'A berth on the Kestrel' })).toEqual({ applied: true });
    expect(vow.flags[MODULE_ID].reward).toMatchObject({ description: 'A berth on the Kestrel' });
  }, 60_000);
});

describe('issue #364 VOW-CARD-RENAME-NO-GM — the canonical GM checks the click against the card\'s own options', () => {
  async function openRewardCard() {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    return { vow, rewardId: idOf(rewardCards()[0]) };
  }

  it('a text that is not the card\'s option at that index is refused, and is never promised as the reward', async () => {
    const { vow, rewardId } = await openRewardCard();

    expect(await gmReceives({ messageId: rewardId, idx: 0, text: 'A warship of my own' }))
      .toEqual({ applied: false, reason: 'option-changed' });

    expect(vow.flags[MODULE_ID]?.reward).toBeUndefined();
    expect(flagsOf(rewardCards()[0]).rewardChosen).toBeFalsy();
    expect(notices()).toHaveLength(1);
  }, 60_000);

  it('the text of the other option is refused too: the index and the text must name the same option', async () => {
    const { vow, rewardId } = await openRewardCard();

    expect((await gmReceives({ messageId: rewardId, idx: 0, text: GENERIC[1].description })).reason).toBe('option-changed');
    expect(vow.flags[MODULE_ID]?.reward).toBeUndefined();
  }, 60_000);

  it('an index the card no longer has is refused the same way, with the notice', async () => {
    const { vow, rewardId } = await openRewardCard();

    expect((await gmReceives({ messageId: rewardId, idx: 5, text: 'A crate of sealed rations' })).reason).toBe('option-changed');
    expect(vow.flags[MODULE_ID]?.reward).toBeUndefined();
    expect(notices()).toHaveLength(1);
  }, 60_000);

  it('the matching text is accepted — and the reward promised is the card\'s option, form and all', async () => {
    const { vow, rewardId } = await openRewardCard();

    expect(await gmReceives({ messageId: rewardId, idx: 0, text: GENERIC[0].description })).toEqual({ applied: true });
    expect(vow.flags[MODULE_ID].reward).toMatchObject({ status: 'promised', description: 'A favour owed by a stranger', form: 'contact' });
  }, 60_000);

  it('control: a pick with no text (a page from before the click carried it) is taken by its index, as before', async () => {
    const { vow, rewardId } = await openRewardCard();

    expect(await gmReceives({ messageId: rewardId, idx: 1 })).toEqual({ applied: true });
    expect(vow.flags[MODULE_ID].reward).toMatchObject({ description: 'A crate of sealed rations' });
  }, 60_000);
});
