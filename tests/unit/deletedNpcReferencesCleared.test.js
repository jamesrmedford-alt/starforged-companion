/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/deletedNpcReferencesCleared.test.js
 *
 * Issue #364 DELETED-NPC-NAME-REFERENCES, the delete teardown's half (issue
 * #362 D10 (3) took down a deleted NPC card's id, facts, bond Items, plan and
 * portraits). A reference to the NPC outlived the card: a vow linked to them
 * — the link is the connection's name (`linkedConnectionName`), so the next
 * fight won for the vow still offered "🤝 Deepen your bond with Sable", and
 * fulfilling the vow listed a deepen that could never land, with a Retry that
 * failed again.
 *
 * A GM's delete of the card now clears the link — unless another card of that
 * name is left, which a name-based link then means — and tells the GMs which
 * vows no longer serve a connection.
 *
 * The sector record's own reference to its local connection is retired (issue
 * #364 SECTOR-CONNECTION-ID-UNREAD — written at creation, read by nothing), so
 * the delete leaves the sector records as they are: an older world's record
 * that still carries the field is not rewritten.
 *
 * On a booted GM / player table: the real deleteActor hook as index.js
 * registers it, then the real won-fight card and the sheet fulfilment's
 * payoff.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const VOW = "Free Sable's crew";

let table, kira, ren, sable;
const stored    = () => table.client('gm-1').run(() => game.settings.get(MODULE_ID, 'campaignState'));
const failCards = () => table.cards(f => f.payoffFailureCard);
const notices   = () => table.cards(f => f.vowLinkClearedNotice);

function vowItem(id, name, linked, { completed = false } = {}) {
  const item = {
    id, name, type: 'progress',
    system: { subtype: 'vow', rank: 'formidable', current: 40, completed },
    flags: { [MODULE_ID]: { vowId: id, vowSetupOffered: true, ...(linked ? { linkedConnectionName: linked } : {}) } },
    update: async (changes) => { if ('system.completed' in changes) item.system.completed = changes['system.completed']; },
    setFlag: async (mod, key, value) => { (item.flags[mod] ??= {})[key] = value; },
  };
  return item;
}
const linkOf = (item) => item.flags[MODULE_ID].linkedConnectionName ?? null;

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
      connectionIds: ['conn-sable', 'conn-dace'], legacyTracks: { quests: { ticks: 0, cleared: false } },
      sectors: [
        // sec-1 is an older world's record: it still carries the retired field.
        { id: 'sec-1', name: 'Devil\'s Maw', connectionId: 'conn-sable', settlementIds: [] },
        { id: 'sec-2', name: 'Ashen Reach', settlementIds: [] },
      ] },
  } } });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [
    vowItem('v-crew', VOW, 'Sable'),
    vowItem('v-debt', 'Repay Dace', 'Dace'),
    vowItem('v-old', 'Find Sable\'s ship', 'sable', { completed: true }),
  ] } });
  ren = table.addActor({ id: 'pc-ren', name: 'Ren', items: { contents: [vowItem('v-crew-ren', VOW, 'Sable'), vowItem('v-none', 'Chart the Maw', null)] } });
  sable = npc('conn-sable', 'Sable', 'rec-sable');
  npc('conn-dace', 'Dace', 'rec-dace');
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table);
  silenceConsoleErrors();
});

/** A GM deletes the NPC card in the Actors sidebar: Foundry removes it, then fires deleteActor on every client. */
async function gmDeletes(actor) {
  table.actors.delete(actor.id);
  table.fireDocumentHook('gm-1', 'deleteActor', actor, {});
  await table.settle(); await table.drain();
}

/** The pipeline's won-fight branch: Kira won a fight serving the vow. */
async function postVictoryCard() {
  const gm = table.client('gm-1');
  const { postFightVowMilestoneCard } = await gm.import('../../src/index.js');
  await gm.run(() => postFightVowMilestoneCard(VOW, 2, 'pc-kira'));
  await table.settle();
  return table.cards(f => f.fightVowCard).at(-1);
}

/** Kira fulfils the vow on her sheet — the canonical GM pays it. */
async function fulfilOnSheet() {
  kira.items.contents.find(i => i.id === 'v-crew').system.completed = true;
  const gm = table.client('gm-1');
  const { payFulfilledVowNative } = await gm.import('../../src/index.js');
  await gm.run(() => payFulfilledVowNative(VOW, 'strong_hit', { actorId: 'pc-kira' }));
  await table.settle(); await table.drain();
}

describe('issue #364 DELETED-NPC-NAME-REFERENCES — a deleted NPC\'s vow links go with the card', () => {
  it('control: before the delete, the vow\'s won fight offers to deepen the bond', async () => {
    const card = await postVictoryCard();
    expect(card.flags[MODULE_ID].connectionName).toBe('Sable');
    expect(card.content).toContain('Deepen your bond with Sable');
  }, 30_000);

  it('every vow linked to the deleted NPC loses its link — each PC\'s copy, open or closed, whatever the name\'s case', async () => {
    await gmDeletes(sable);
    const links = (actor) => Object.fromEntries(actor.items.contents.map(i => [i.id, linkOf(i)]));
    expect(links(kira)).toEqual({ 'v-crew': null, 'v-debt': 'Dace', 'v-old': null });
    expect(links(ren)).toEqual({ 'v-crew-ren': null, 'v-none': null });
  }, 30_000);

  it('the next fight won for the vow offers no bond to deepen', async () => {
    await gmDeletes(sable);
    const card = await postVictoryCard();
    expect(card.flags[MODULE_ID].connectionName).toBeNull();
    expect(card.content).not.toContain('sf-deepen-bond');
    expect(card.content).not.toContain('Deepen your bond');
  }, 30_000);

  it('fulfilling the vow lists no deepen that cannot land', async () => {
    await gmDeletes(sable);
    await fulfilOnSheet();
    // The failure card's Retry list: no deepen with a connection that is gone — no card at all here.
    const deepens = failCards().flatMap(c => c.flags[MODULE_ID].steps ?? []).filter(f => f.step === 'deepen');
    expect(deepens).toEqual([]);
    expect(failCards()).toEqual([]);
  }, 30_000);

  it('the GMs are told which vows no longer serve a connection — once, naming each PC\'s vow', async () => {
    await gmDeletes(sable);
    expect(notices()).toHaveLength(1);
    const notice = notices()[0];
    expect(notice.whisper).toEqual(['gm-1']);
    expect(notice.content).toContain('Sable');
    expect(notice.content).toContain('Kira');
    expect(notice.content).toContain('Ren');
    expect(notice.content).toContain('Free Sable');
    expect(notice.content).not.toContain('Repay Dace');
  }, 30_000);

  it('the card\'s id leaves connectionIds; the sector records are left as they are (SECTOR-CONNECTION-ID-UNREAD)', async () => {
    const before = stored().sectors;
    await gmDeletes(sable);
    expect(stored().connectionIds).toEqual(['conn-dace']);
    // The retired field is neither read nor written: an older record keeps
    // what it had, and a record without it gains nothing.
    expect(stored().sectors).toEqual(before);
    expect(Object.hasOwn(stored().sectors[1], 'connectionId')).toBe(false);
  }, 30_000);

  it('a namesake is left: the name still means someone, so the vows keep their link', async () => {
    npc('conn-sable-2', 'Sable', 'rec-sable-2');
    await table.client('gm-1').run(() => game.settings.set(MODULE_ID, 'campaignState',
      { ...game.settings.get(MODULE_ID, 'campaignState'), connectionIds: ['conn-sable', 'conn-dace', 'conn-sable-2'] }));
    await table.settle();

    await gmDeletes(sable);
    expect(linkOf(kira.items.contents[0])).toBe('Sable');
    expect(notices()).toEqual([]);
    const card = await postVictoryCard();
    expect(card.flags[MODULE_ID].connectionName).toBe('Sable');
  }, 30_000);

  it('control: deleting an NPC no vow is linked to tells the GMs nothing and clears nothing', async () => {
    const dace = table.actors.get('conn-dace');
    kira.items.contents.find(i => i.id === 'v-debt').flags[MODULE_ID].linkedConnectionName = null;
    await gmDeletes(dace);
    expect(notices()).toEqual([]);
    expect(linkOf(kira.items.contents[0])).toBe('Sable');
    expect(stored().connectionIds).toEqual(['conn-sable']);
  }, 30_000);
});
