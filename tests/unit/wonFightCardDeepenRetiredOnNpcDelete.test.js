/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/wonFightCardDeepenRetiredOnNpcDelete.test.js
 *
 * Issue #364 WON-FIGHT-CARD-DELETED-NPC (left open by issue #364
 * DELETED-NPC-NAME-REFERENCES).
 *
 * A fight won for a vow that serves a connection posts the victory card with
 * "🤝 Deepen your bond with <the NPC>". A GM's delete of that NPC's card
 * clears the vow's link, so the next won fight offers no bond — but the
 * victory cards already in chat kept their `connectionName` and a live
 * button: a press relayed to the GM, found no such connection, and whispered
 * the GMs a "Not applied … not found" card for a bond nobody could deepen.
 *
 * The delete teardown now retires that button on the cards already in chat
 * (`deepenRetired`, stamped by the canonical GM): on every client it renders
 * disabled and says why. The card's other buttons are the vow's and stay. A
 * namesake card left behind keeps the button — the name then means them. A
 * card the teardown did not reach still reports "not found" when pressed.
 *
 * On a booted GM / player table: the real deleteActor hook as index.js
 * registers it, the real won-fight card, its real render hook and relay.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const VOW = "Free Sable's crew";
const DEEPEN = '[data-action="sf-deepen-bond"]';

let table, kira, sable;
const failCards = () => table.cards(f => f.payoffFailureCard);
const card      = (id) => table.cards(f => f.fightVowCard).find(m => m._id === id);
const flagsOf   = (id) => card(id).flags[MODULE_ID];

function vowItem(id, name, linked) {
  const item = {
    id, name, type: 'progress',
    system: { subtype: 'vow', rank: 'formidable', current: 8, completed: false },
    flags: { [MODULE_ID]: { vowId: id, vowSetupOffered: true, ...(linked ? { linkedConnectionName: linked } : {}) } },
    update: async (changes) => { if ('system.completed' in changes) item.system.completed = changes['system.completed']; },
    setFlag: async (mod, key, value) => { (item.flags[mod] ??= {})[key] = value; },
  };
  return item;
}

function npc(id, name, recordId) {
  return table.addActor({
    id, name, type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: recordId, name, rank: 'dangerous', role: 'Pilot', relationshipTicks: 0, bonded: false, active: true, history: [],
    } } },
  });
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narrativeSkeletons: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      connectionIds: ['conn-sable', 'conn-dace'], legacyTracks: { quests: { ticks: 0, cleared: false } } },
  } } });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [
    vowItem('v-crew', VOW, 'Sable'),
    vowItem('v-debt', 'Repay Dace', 'Dace'),
  ] } });
  sable = npc('conn-sable', 'Sable', 'rec-sable');
  npc('conn-dace', 'Dace', 'rec-dace');
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table);
  silenceConsoleErrors();
});

/** A GM deletes the NPC card in the Actors sidebar: Foundry removes it, then fires deleteActor on every client. */
async function gmDeletes(actor, options = {}) {
  table.actors.delete(actor.id);
  table.fireDocumentHook('gm-1', 'deleteActor', actor, options);
  await table.settle(); await table.drain();
}

/** The pipeline's won-fight branch: Kira won a fight serving a vow. Rendered on both clients, as the chat log has it. */
async function postVictoryCard(vow = VOW) {
  const gm = table.client('gm-1');
  const { postFightVowMilestoneCard } = await gm.import('../../src/index.js');
  await gm.run(() => postFightVowMilestoneCard(vow, 2, 'pc-kira'));
  await table.settle();
  const posted = table.cards(f => f.fightVowCard).at(-1);
  for (const id of ['gm-1', 'pl-1']) table.client(id).render(posted._id);
  return posted;
}

const deepenButton = (clientId, id) => table.client(clientId).rendered.get(id).querySelector(DEEPEN);

async function press(clientId, id) {
  table.client(clientId).click(id, DEEPEN);
  await table.settle(); await table.drain();
}

describe('issue #364 WON-FIGHT-CARD-DELETED-NPC — a victory card already in chat stops offering a bond with a deleted NPC', () => {
  it('control: before the delete the card offers the bond, and a press deepens it', async () => {
    const posted = await postVictoryCard();
    expect(flagsOf(posted._id).connectionName).toBe('Sable');
    expect(deepenButton('pl-1', posted._id).disabled).toBeFalsy();

    await press('pl-1', posted._id);
    expect(failCards()).toEqual([]);
    expect(flagsOf(posted._id).resolvedActions?.deepenBond).toBe(true);
    expect(sable.flags[MODULE_ID].connection.relationshipTicks).toBeGreaterThan(0);
  }, 30_000);

  it('after the GM deletes the NPC, the card\'s 🤝 is retired on every client and says why', async () => {
    const posted = await postVictoryCard();
    await gmDeletes(sable);

    expect(flagsOf(posted._id).deepenRetired, 'the canonical GM stamped the card').toBe(true);
    for (const id of ['gm-1', 'pl-1']) {
      const btn = deepenButton(id, posted._id);
      expect(btn.disabled, `${id} sees the button disabled`).toBe(true);
      expect(btn.title).toContain('Sable');
      expect(btn.title).toMatch(/deleted/);
    }
  }, 30_000);

  it('a press on the retired button does nothing: no "not found" card for the GMs', async () => {
    const posted = await postVictoryCard();
    await gmDeletes(sable);

    await press('pl-1', posted._id);
    await press('gm-1', posted._id);
    expect(failCards()).toEqual([]);
    expect(flagsOf(posted._id).resolvedActions?.deepenBond).toBeUndefined();
  }, 30_000);

  it('…nor does a request that reaches the GM anyway (a window that had not re-rendered)', async () => {
    const posted = await postVictoryCard();
    await gmDeletes(sable);

    const gm = table.client('gm-1');
    const { applyFightVowDeepenBond } = await gm.import('../../src/moves/cardActions.js');
    const out = await gm.run(() => applyFightVowDeepenBond({ messageId: posted._id }, { requesterId: 'pl-1' }));
    await table.settle(); await table.drain();
    expect(out).toMatchObject({ applied: false, reason: 'nothing-to-apply' });
    expect(failCards()).toEqual([]);
  }, 30_000);

  it('the card\'s other buttons are the vow\'s and stay live', async () => {
    const posted = await postVictoryCard();
    await gmDeletes(sable);

    const root = table.client('pl-1').rendered.get(posted._id);
    expect(root.querySelector('[data-action="sf-mark-milestone"]').disabled).toBeFalsy();
    expect(root.querySelector('[data-action="sf-fulfill-vow"]').disabled).toBeFalsy();
  }, 30_000);

  it('only that NPC\'s cards: another NPC\'s victory card, and one whose bond already deepened, are left as they are', async () => {
    const forDace   = await postVictoryCard('Repay Dace');
    const deepened  = await postVictoryCard();
    await press('pl-1', deepened._id);
    expect(flagsOf(deepened._id).resolvedActions?.deepenBond, 'deepened before the delete (setup)').toBe(true);

    await gmDeletes(sable);
    expect(flagsOf(forDace._id).deepenRetired).toBeUndefined();
    expect(deepenButton('pl-1', forDace._id).disabled).toBeFalsy();
    expect(flagsOf(deepened._id).deepenRetired, 'nothing left to retire on an applied button').toBeUndefined();
  }, 30_000);

  it('a namesake is left: the name still means someone, so the button stays and deepens their bond', async () => {
    const namesake = npc('conn-sable-2', 'Sable', 'rec-sable-2');
    await table.client('gm-1').run(() => game.settings.set(MODULE_ID, 'campaignState',
      { ...game.settings.get(MODULE_ID, 'campaignState'), connectionIds: ['conn-sable', 'conn-dace', 'conn-sable-2'] }));
    await table.settle();
    const posted = await postVictoryCard();

    await gmDeletes(sable);
    expect(flagsOf(posted._id).deepenRetired).toBeUndefined();
    expect(deepenButton('pl-1', posted._id).disabled).toBeFalsy();

    await press('pl-1', posted._id);
    expect(failCards()).toEqual([]);
    expect(namesake.flags[MODULE_ID].connection.relationshipTicks).toBeGreaterThan(0);
  }, 30_000);

  it('fallback: a card the teardown did not reach still reports "not found" to the GMs when pressed', async () => {
    const posted = await postVictoryCard();
    // The module's own delete of the card (the X-Card's) carries the torn-down option: this teardown does not run.
    await table.client('gm-1').run(() => game.settings.set(MODULE_ID, 'campaignState',
      { ...game.settings.get(MODULE_ID, 'campaignState'), connectionIds: ['conn-dace'] }));
    await gmDeletes(sable, { [MODULE_ID]: { connectionTornDown: true } });
    expect(flagsOf(posted._id).deepenRetired).toBeUndefined();

    await press('pl-1', posted._id);
    expect(failCards()).toHaveLength(1);
    expect(failCards()[0].content).toContain('Sable');
    expect(kira.items.contents.find(i => i.id === 'v-crew').flags[MODULE_ID].linkedConnectionName, 'the vow keeps its link here').toBe('Sable');
  }, 30_000);
});
