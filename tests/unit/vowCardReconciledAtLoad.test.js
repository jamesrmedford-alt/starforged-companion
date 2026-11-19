/**
 * STARFORGED COMPANION
 * tests/unit/vowCardReconciledAtLoad.test.js
 *
 * Issue #364 VOW-CARD-RENAME-NO-GM, the first half (left open by
 * VOW-CARD-GENERIC-UNTIL-NAMED). The "🆕 New vow recorded" card follows its
 * vow's sheet through the canonical GM's updateItem listener — so a vow named
 * or re-ranked while no GM was connected (the GM's page reloading as the
 * player types the name) was followed by nobody: the card stayed "A new vow —
 * name it and set its rank on its sheet", and its rewards the generic ones,
 * until the next edit of the vow.
 *
 * The canonical GM now brings the unsworn vow cards in step with their vows
 * at load: the newest cards only (a bounded tail of the chat log), a write
 * only for a card that does not show its vow's name and rank, and a reward
 * proposal only under the listener's own condition — the vow's first name,
 * its reward not yet chosen. A card in step costs nothing: no write, no call.
 *
 * On a booted table: the real createItem / updateItem hooks, a GM page that
 * leaves and loads again (`table.reload`), the real cards; only the Claude
 * endpoint is scripted.
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
const UNNAMED_WORDING = 'name it and set its rank on its sheet';

let table, restore, kira;
const vowCards    = () => table.cards(f => f.playerVowCard);
const rewardCards = () => table.cards(f => f.rewardChoiceCard);
const rewardCalls = () => table.claude.calls.filter(c => /has just sworn a vow/.test(c.userText ?? ''));
const flagsOf     = (m) => m.flags[MODULE_ID];
const idOf        = (m) => m.id ?? m._id;

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

/** A document hook as Foundry fires it: on every connected client. */
async function fire(hook, ...args) {
  for (const c of table.connectedClients) c.run(() => Hooks.callAll(hook, ...args));
  await table.settle(); await table.drain();
}
const created = (item) => fire('createItem', item, {}, 'pl-1');
async function renamed(item, name) {
  item.name = name;
  await fire('updateItem', item, { name, _id: item.id }, {}, 'pl-1');
}
async function reranked(item, rank) {
  item.system.rank = rank;
  await fire('updateItem', item, { system: { rank }, _id: item.id }, {}, 'pl-1');
}
/** The GM's page loads again: a fresh page, booted through `ready`. */
async function gmLoads() {
  await table.reload('gm-1');
  await table.settle(); await table.drain();
}
/** Every update of a chat message from here on, as the harness reports the write ({ kind, id, client, changes }). */
function watchCardWrites() {
  const writes = [];
  const stop = table.interceptWrites((w) => { if (w?.kind === 'message.update') writes.push(w); });
  return { writes, stop };
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

describe('issue #364 VOW-CARD-RENAME-NO-GM — a vow named while no GM was connected is followed when the GM loads', () => {
  it('control: with no GM connected, the rename is followed by nobody — the card stays generic', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    await table.leave('gm-1');

    await renamed(vow, REAL_NAME);

    expect(vowCards()[0].content).toContain(UNNAMED_WORDING);
    expect(flagsOf(rewardCards()[0]).rewardOptions).toEqual(GENERIC);
    expect(rewardCalls()).toHaveLength(1);
  }, 60_000);

  it('the GM loads: the card names the vow, with its rank and that rank\'s stakes', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    const cardId = idOf(vowCards()[0]);
    await table.leave('gm-1');
    await renamed(vow, REAL_NAME);
    await reranked(vow, 3);

    await gmLoads();

    expect(vowCards(), 'still the one card').toHaveLength(1);
    const card = vowCards()[0];
    expect(idOf(card)).toBe(cardId);
    expect(card.content).toContain(`"${REAL_NAME}"`);
    expect(card.content).toContain('(formidable)');
    expect(card.content).toContain('sf-stakes');
    expect(card.content).not.toContain(UNNAMED_WORDING);
    expect(card.content).toContain('sf-player-vow-swear');
    expect(flagsOf(card)).toMatchObject({ playerVowCard: true, vowId: 'vow-new', vowName: REAL_NAME, actorId: 'pc-kira' });
  }, 60_000);

  it('its rewards are proposed again for the name, on the same reward card', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    const rewardId = idOf(rewardCards()[0]);
    await table.leave('gm-1');
    await renamed(vow, REAL_NAME);

    await gmLoads();

    expect(rewardCalls()).toHaveLength(2);
    expect(rewardCalls()[1].userText).toContain(`involving "${REAL_NAME}"`);
    expect(rewardCards(), 'one vow, one reward card').toHaveLength(1);
    expect(idOf(rewardCards()[0])).toBe(rewardId);
    expect(flagsOf(rewardCards()[0]).rewardOptions).toEqual(NAMED);
    expect(rewardCards()[0].content).toContain('The name of who stole it');

    // …and the player's pick from the card as it now is promises that reward.
    table.client('pl-1').click(rewardId, '[data-action="sf-reward-pick"][data-idx="1"]');
    await table.settle(); await table.drain();
    expect(vow.flags[MODULE_ID].reward).toMatchObject({ status: 'promised', description: 'The name of who stole it' });
  }, 60_000);

  it('a rank set with no GM connected is shown when the GM loads — and asks for no rewards', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    await renamed(vow, REAL_NAME);                   // followed live: the GM is here
    expect(vowCards()[0].content).toContain('(troublesome)');
    const calls = rewardCalls().length;
    await table.leave('gm-1');
    await reranked(vow, 4);
    expect(vowCards()[0].content).toContain('(troublesome)');

    await gmLoads();

    expect(vowCards()[0].content).toContain('(extreme)');
    expect(vowCards()[0].content).not.toContain('(troublesome)');
    expect(rewardCalls()).toHaveLength(calls);
  }, 60_000);

  it('a reward already chosen from the generic card stands: the card is named, the reward card left alone', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    table.client('pl-1').click(idOf(rewardCards()[0]), '[data-action="sf-reward-pick"][data-idx="0"]');
    await table.settle(); await table.drain();
    expect(vow.flags[MODULE_ID].reward).toMatchObject({ description: 'A favour owed by a stranger' });
    await table.leave('gm-1');
    await renamed(vow, REAL_NAME);

    await gmLoads();

    expect(vowCards()[0].content).toContain(`"${REAL_NAME}"`);
    expect(rewardCalls(), 'no second proposal').toHaveLength(1);
    expect(flagsOf(rewardCards()[0]).rewardOptions).toEqual(GENERIC);
  }, 60_000);
});

describe('issue #364 VOW-CARD-RENAME-NO-GM — the load-time reconcile is bounded and costs nothing when nothing changed', () => {
  it('a card already in step: the GM loads, and nothing is written and nothing is asked of Claude', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    await renamed(vow, REAL_NAME);
    const before = { content: vowCards()[0].content, reward: rewardCards()[0].content, calls: table.claude.calls.length };
    const watch = watchCardWrites();

    await gmLoads();
    watch.stop();

    expect(vowCards()[0].content).toBe(before.content);
    expect(rewardCards()[0].content).toBe(before.reward);
    expect(table.claude.calls.length, 'no Claude call at load').toBe(before.calls);
    expect(watch.writes.filter(w => [idOf(vowCards()[0]), idOf(rewardCards()[0])].includes(w.id))).toEqual([]);
  }, 60_000);

  it('a vow still to be named: its card is left worded as it is', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    await table.leave('gm-1');
    await renamed(vow, 'New Vow');

    await gmLoads();

    expect(vowCards()[0].content).toContain(UNNAMED_WORDING);
    expect(rewardCalls()).toHaveLength(1);
  }, 60_000);

  it('a vow already sworn from its card is not followed: the swear took it as its sheet had it', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    const card = vowCards()[0];
    await table.client('gm-1').run(() => table.client('gm-1').message(idOf(card)).update({ [`flags.${MODULE_ID}.swearRolled`]: true }));
    await table.settle();
    await table.leave('gm-1');
    await renamed(vow, REAL_NAME);

    await gmLoads();

    expect(vowCards()[0].content).toContain(UNNAMED_WORDING);
    expect(rewardCalls()).toHaveLength(1);
  }, 60_000);

  it('a vow whose Item is gone: its card is left alone', async () => {
    const vow = sheetVow('vow-new', 'Vow');
    await created(vow);
    await table.leave('gm-1');
    kira.items.contents.splice(kira.items.contents.indexOf(vow), 1);

    await gmLoads();

    expect(vowCards()[0].content).toContain(UNNAMED_WORDING);
    expect(rewardCalls()).toHaveLength(1);
  }, 60_000);

  it('only the newest cards are read: a vow card buried under 200 later messages is not looked for', async () => {
    const vow = sheetVow('vow-old', 'Vow');
    await created(vow);
    const gm = table.client('gm-1');
    for (let i = 0; i < 200; i += 1) {
      await gm.run(() => ChatMessage.create({ content: `<p>line ${i}</p>`, flags: { [MODULE_ID]: { vowLinkedCard: true } } }));
    }
    await table.settle(); await table.drain();
    await table.leave('gm-1');
    await renamed(vow, REAL_NAME);

    await gmLoads();

    expect(vowCards()[0].content, 'outside the tail the reconcile reads').toContain(UNNAMED_WORDING);
    expect(rewardCalls()).toHaveLength(1);

    // The next edit of the vow still brings it in step — the listener looks by the vow's id.
    await reranked(vow, 2);
    expect(vowCards()[0].content).toContain(`"${REAL_NAME}"`);
  }, 120_000);
});
