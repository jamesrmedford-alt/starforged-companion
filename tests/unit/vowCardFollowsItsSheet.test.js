/**
 * STARFORGED COMPANION
 * tests/unit/vowCardFollowsItsSheet.test.js
 *
 * Issue #364 VOW-CARD-GENERIC-UNTIL-NAMED (issue #362 AC23's conservative
 * choice, taken up). The foundry-ironsworn sheet's "+ Vow" creates the Item
 * as "Vow" and only then opens it to be named, so the canonical GM's
 * createItem hook posts the "🆕 New vow recorded" card for a vow still to be
 * named — no name, no rank's stakes — and proposes its rewards for no name.
 * Nothing followed the sheet afterwards: the card stayed generic once the
 * player typed the vow, and its two reward options stayed the generic ones.
 *
 * The canonical GM now follows the vow's sheet until the vow is sworn from
 * the card: a rename or a rank change re-renders the card with the vow's
 * name, rank and that rank's stakes, and the first time the vow gets a name
 * of its own its rewards are proposed again, for that name, on the same
 * reward-choice card.
 *
 * On a booted table: the real createItem / updateItem hooks, the real cards,
 * the real reward pick through the relay; only the Claude endpoint is
 * scripted.
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
const vowCards    = () => table.cards(f => f.playerVowCard);
const rewardCards = () => table.cards(f => f.rewardChoiceCard);
const rewardCalls = () => table.claude.calls.filter(c => /has just sworn a vow/.test(c.userText ?? ''));
const flagsOf     = (m) => m.flags[MODULE_ID];

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

/** A document hook as Foundry fires it: on every client. */
async function fire(hook, ...args) {
  for (const c of table.connectedClients) c.run(() => Hooks.callAll(hook, ...args));
  await table.settle(); await table.drain();
}
const created = (item) => fire('createItem', item, {}, 'pl-1');
/** The player types the vow's name on its sheet. */
async function renamed(item, name) {
  item.name = name;
  await fire('updateItem', item, { name, _id: item.id }, {}, 'pl-1');
}
/** The player sets the vow's rank on its sheet (the vendor's ChallengeRank number). */
async function reranked(item, rank) {
  item.system.rank = rank;
  await fire('updateItem', item, { system: { rank }, _id: item.id }, {}, 'pl-1');
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  restore = await resetSkeletonTable(table, {}, { connectionIds: [] });
  kira = table.actors.get('pc-kira');
  // The reward proposals: generic for a vow with no name, the named ones once it has one.
  table.script.when(c => /has just sworn a vow/.test(c.userText ?? '') && c.userText.includes(REAL_NAME),
    JSON.stringify({ rewards: NAMED }), { times: -1 });
  table.script.when(c => /has just sworn a vow/.test(c.userText ?? ''), JSON.stringify({ rewards: GENERIC }), { times: -1 });
  globalThis.silenceConsoleErrors();
});
afterEach(() => restore?.());

describe('issue #364 VOW-CARD-GENERIC-UNTIL-NAMED — the new-vow card follows the vow\'s sheet', () => {
  it('control: + Vow posts the card for a vow still to be named, with generic rewards', async () => {
    await created(sheetVow('vow-new', 'Vow'));
    expect(vowCards()).toHaveLength(1);
    expect(vowCards()[0].content).toContain('name it and set its rank on its sheet');
    expect(rewardCards()).toHaveLength(1);
    expect(flagsOf(rewardCards()[0]).rewardOptions).toEqual(GENERIC);
  }, 60_000);

  it('the player names the vow: the card names it, with its rank and that rank\'s stakes', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    const cardId = vowCards()[0].id ?? vowCards()[0]._id;

    await renamed(vow, REAL_NAME);
    expect(vowCards(), 'still the one card').toHaveLength(1);
    const card = vowCards()[0];
    expect(card.id ?? card._id).toBe(cardId);
    expect(card.content).toContain(`"${REAL_NAME}"`);
    expect(card.content).toContain('(troublesome)');
    expect(card.content).toContain('sf-stakes');
    expect(card.content).not.toContain('name it and set its rank on its sheet');
    expect(card.content).toContain('sf-player-vow-swear');
    expect(flagsOf(card)).toMatchObject({ playerVowCard: true, vowId: 'vow-new', vowName: REAL_NAME, actorId: 'pc-kira' });
  }, 60_000);

  it('its rewards are proposed again for the name, on the same reward card', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    const rewardId = rewardCards()[0].id ?? rewardCards()[0]._id;

    await renamed(vow, REAL_NAME);
    expect(rewardCalls()).toHaveLength(2);
    expect(rewardCalls()[1].userText).toContain(`involving "${REAL_NAME}"`);
    expect(rewardCards(), 'one vow, one reward card').toHaveLength(1);
    const reward = rewardCards()[0];
    expect(reward.id ?? reward._id).toBe(rewardId);
    expect(flagsOf(reward).rewardOptions).toEqual(NAMED);
    expect(reward.content).toContain('The name of who stole it');
    expect(reward.content).not.toContain('A favour owed by a stranger');
  }, 60_000);

  it('picking a re-proposed reward promises that reward on the vow', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    await renamed(vow, REAL_NAME);
    const reward = rewardCards()[0];

    table.client('pl-1').click(reward.id ?? reward._id, '[data-action="sf-reward-pick"][data-idx="1"]');
    await table.settle(); await table.drain();
    expect(vow.flags[MODULE_ID].reward).toMatchObject({ status: 'promised', description: 'The name of who stole it', form: 'knowledge' });
  }, 60_000);

  it('a rank set after the name is shown on the card, with its stakes — and asks for no more rewards', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    await renamed(vow, REAL_NAME);
    const before = vowCards()[0].content;

    await reranked(vow, 3);
    const card = vowCards()[0];
    expect(card.content).toContain('(formidable)');
    expect(card.content).not.toContain('(troublesome)');
    expect(card.content).not.toBe(before);
    expect(rewardCalls(), 'rewards are re-proposed once, at the first name').toHaveLength(2);
  }, 60_000);

  it('a second rename is followed by the card, and re-proposes nothing', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    await renamed(vow, REAL_NAME);
    await renamed(vow, 'Recover the reactor core for Bleakhold');
    expect(vowCards()[0].content).toContain('"Recover the reactor core for Bleakhold"');
    expect(flagsOf(vowCards()[0]).vowName).toBe('Recover the reactor core for Bleakhold');
    expect(rewardCalls()).toHaveLength(2);
    expect(flagsOf(rewardCards()[0]).rewardOptions).toEqual(NAMED);
  }, 60_000);

  it('a reward already chosen from the generic card stands: the card is named, the reward card is left alone', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    const reward = rewardCards()[0];
    table.client('pl-1').click(reward.id ?? reward._id, '[data-action="sf-reward-pick"][data-idx="0"]');
    await table.settle(); await table.drain();
    expect(vow.flags[MODULE_ID].reward).toMatchObject({ description: 'A favour owed by a stranger' });

    await renamed(vow, REAL_NAME);
    expect(vowCards()[0].content).toContain(`"${REAL_NAME}"`);
    expect(rewardCalls(), 'no second proposal').toHaveLength(1);
    expect(flagsOf(rewardCards()[0]).rewardOptions).toEqual(GENERIC);
  }, 60_000);

  it('a name that is still the sheet\'s placeholder changes nothing', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    await renamed(vow, 'New Vow');
    expect(vowCards()[0].content).toContain('name it and set its rank on its sheet');
    expect(rewardCalls()).toHaveLength(1);
  }, 60_000);

  it('control: a vow created with its name keeps its rewards on a rank change, and its card shows the new rank', async () => {
    const vow = sheetVow('vow-named', 'Learn who sent the escort', 2);
    await created(vow);
    expect(vowCards()[0].content).toContain('(dangerous)');
    const calls = rewardCalls().length;

    await reranked(vow, 4);
    expect(vowCards()[0].content).toContain('(extreme)');
    expect(rewardCalls()).toHaveLength(calls);
  }, 60_000);

  it('control: another progress track renamed on the sheet touches no card', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    const other = { id: 'bond-1', type: 'progress', name: 'Kestrel', parent: kira, flags: {}, system: { subtype: 'bond', rank: 1 } };
    kira.items.contents.push(other);
    other.name = 'The Kestrel crew';
    await fire('updateItem', other, { name: other.name, _id: other.id }, {}, 'pl-1');
    expect(vowCards()[0].content).toContain('name it and set its rank on its sheet');
    expect(rewardCalls()).toHaveLength(1);
  }, 60_000);
});
