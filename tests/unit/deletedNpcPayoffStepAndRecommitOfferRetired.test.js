/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/deletedNpcPayoffStepAndRecommitOfferRetired.test.js
 *
 * Issue #364 PAYOFF-CARD-DEEPEN-DELETED-NPC (left open by issue #364
 * WON-FIGHT-CARD-DELETED-NPC).
 *
 * A GM's delete of an NPC card retires the "🤝 Deepen your bond with …" of the
 * victory cards already in chat. Two more leftovers of the deleted NPC stayed
 * live in chat:
 *
 *   - a payoff failure card (whispered to the GMs) listing a deepen with that
 *     NPC: its "↻ Retry these steps" ran the deepen again for a connection
 *     nobody could find, which failed again — onto a fresh card, with its own
 *     Retry;
 *   - a Forge a Bond miss's "🔁 Recommit to the Bond" offer for that NPC:
 *     pressed, it claimed the offer and told the presser the connection "is
 *     no longer a connection".
 *
 * The delete's reference clearing (connection.js
 * clearDeletedConnectionReferences) now retires both, as the Deepen button is
 * retired: on the canonical GM, a flag on the card, the button rendered
 * disabled with its reason, the GM-side handler applying nothing. The payoff
 * card loses only the step that names the deleted NPC — its other steps keep
 * their Retry — and not while a namesake's card is left (a step names its
 * connection by name). The offer names its NPC by the card's id.
 *
 * On a booted GM / player table: the real sheet fulfilment whose deepen and
 * legacy writes the world refuses (the failure card), the real deleteActor
 * hook as index.js registers it, the cards' real render hooks and relays.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const VOW = 'Find the archive';
const RETRY = '[data-action="sf-payoff-retry"]';
const RECOMMIT = '[data-action="sf-bond-recommit"]';

let table, vow, rook;
const world     = () => table.world.campaignState();
const quests    = () => world().legacyTracks?.quests?.ticks ?? 0;
const failCards = () => table.cards(f => f.payoffFailureCard);
const flagsOf   = (id) => table.world.messages().find(m => (m.id ?? m._id) === id).flags[MODULE_ID];
const rendered  = (clientId, id) => table.client(clientId).render(id);

/** Kira's vow: dangerous, linked to Rook. */
function vowItem() {
  const item = {
    id: 'v-archive', name: VOW, type: 'progress',
    system: { subtype: 'vow', rank: 'dangerous', current: 40, completed: true },
    flags: { [MODULE_ID]: { vowId: 'vid-archive', linkedConnectionName: 'Rook' } },
    update: async (changes) => { if ('system.completed' in changes) item.system.completed = changes['system.completed']; },
    setFlag: async (mod, key, value) => { (item.flags[mod] ??= {})[key] = value; },
  };
  return item;
}

function npc(id, name) {
  return table.addActor({ id, name, flags: { [MODULE_ID]: { entityType: 'connection',
    connection: { _id: id, name, rank: 'dangerous', relationshipTicks: 0, bonded: false, active: true, history: [] } } } });
}

/** Refuse the next world write `match` selects — once. */
function refuseNext(match) {
  let spent = false;
  return table.interceptWrites((w) => {
    if (spent || !match(w)) return undefined;
    spent = true;
    return new Error('refused by the test');
  });
}
const legacyWrite = (w) => w.kind === 'setting' && String(w.key).includes('campaignState');
const rookWrite   = (w) => w.kind === 'actor.update' && w.id === 'npc-rook';

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narrativeSkeletons: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [], connectionIds: ['npc-rook', 'npc-dace'],
      legacyTracks: { quests: { ticks: 2, cleared: false } } },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  vow = vowItem();
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
  rook = npc('npc-rook', 'Rook');
  npc('npc-dace', 'Dace');
  scriptClaude(table);
  silenceConsoleErrors();
});

/** The canonical GM pays the vow fulfilled on the sheet; the world refuses the writes `refused` selects. */
async function fulfilWithRefused(...refused) {
  for (const match of refused) refuseNext(match);
  const gm = table.client('gm-1');
  const { payFulfilledVowNative } = await gm.import('../../src/index.js');
  await gm.run(() => payFulfilledVowNative(VOW, 'strong_hit', { actorId: 'pc-pat' }));
  await table.settle(); await table.drain();
  const cards = failCards();
  expect(cards, 'one payoff failure card (setup)').toHaveLength(1);
  return cards[0];
}

/** A GM deletes the NPC card in the Actors sidebar: Foundry removes it, then fires deleteActor on every client. */
async function gmDeletes(actor) {
  table.actors.delete(actor.id);
  table.fireDocumentHook('gm-1', 'deleteActor', actor, {});
  await table.settle(); await table.drain();
}

async function press(clientId, id, selector) {
  table.client(clientId).click(id, selector);
  await table.settle(); await table.drain();
}

describe('issue #364 PAYOFF-CARD-DEEPEN-DELETED-NPC — a payoff failure card\'s deepen with a deleted NPC is retired', () => {
  it('control: before the delete the card lists the deepen, and its Retry is live', async () => {
    const card = await fulfilWithRefused(rookWrite);
    expect(card.flags[MODULE_ID].steps).toEqual([{ step: 'deepen', connectionName: 'Rook', marks: 1 }]);
    expect(rendered('gm-1', card._id).querySelector(RETRY).disabled).toBeFalsy();
  }, 30_000);

  it('the only step: after the delete the Retry is disabled on the GM\'s card and says why', async () => {
    const card = await fulfilWithRefused(rookWrite);
    await gmDeletes(rook);

    expect(flagsOf(card._id).retiredSteps, 'the canonical GM stamped the step').toEqual([0]);
    const root = rendered('gm-1', card._id);
    const btn = root.querySelector(RETRY);
    expect(btn.disabled).toBe(true);
    expect(btn.title).toContain('Rook');
    expect(btn.title).toMatch(/deleted/);
    const line = root.querySelector('.sf-payoff-failure').querySelector('ul').children[0];
    expect(line.classList.contains('sf-payoff-step-retired')).toBe(true);
    expect(line.title).toMatch(/Rook.*deleted/);
  }, 30_000);

  it('…and a Retry that reaches the GM anyway applies nothing: no fresh failure card', async () => {
    const card = await fulfilWithRefused(rookWrite);
    await gmDeletes(rook);

    await press('gm-1', card._id, RETRY);
    const gm = table.client('gm-1');
    const { applyPayoffRetry } = await gm.import('../../src/moves/cardActions.js');
    const out = await gm.run(() => applyPayoffRetry({ messageId: card._id }, { requesterId: 'gm-1', requesterIsGM: true }));
    await table.settle(); await table.drain();

    expect(out).toMatchObject({ applied: false, reason: 'nothing-to-retry' });
    expect(failCards(), 'the deepen did not fail again onto a second card').toHaveLength(1);
    expect(flagsOf(card._id).resolved, 'the card is not claimed for nothing').toBe(false);
  }, 30_000);

  it('with another step on the card: only the deepen is retired, and the Retry pays the legacy — once, with no fresh card', async () => {
    const card = await fulfilWithRefused(legacyWrite, rookWrite);
    expect(card.flags[MODULE_ID].steps.map(s => s.step), 'both steps failed (setup)').toEqual(['legacy', 'deepen']);
    expect(quests()).toBe(2);
    await gmDeletes(rook);

    expect(flagsOf(card._id).retiredSteps).toEqual([1]);
    const root = rendered('gm-1', card._id);
    const btn = root.querySelector(RETRY);
    expect(btn.disabled, 'the legacy keeps its Retry').toBeFalsy();
    expect(btn.title).toMatch(/Rook.*deleted/);
    const lines = root.querySelector('.sf-payoff-failure').querySelector('ul').children;
    expect(lines[0].classList.contains('sf-payoff-step-retired')).toBe(false);
    expect(lines[1].classList.contains('sf-payoff-step-retired')).toBe(true);

    await press('gm-1', card._id, RETRY);
    expect(quests(), 'the legacy landed').toBe(4);
    expect(flagsOf(card._id).resolved).toBe(true);
    expect(failCards(), 'the retired deepen was not run again').toHaveLength(1);
  }, 30_000);

  it('a namesake is left: the name still means someone, so the step stays and the Retry deepens their bond', async () => {
    const card = await fulfilWithRefused(rookWrite);
    const namesake = npc('npc-rook-2', 'Rook');
    await table.client('gm-1').run(() => game.settings.set(MODULE_ID, 'campaignState',
      { ...game.settings.get(MODULE_ID, 'campaignState'), connectionIds: ['npc-rook', 'npc-dace', 'npc-rook-2'] }));
    await table.settle();

    await gmDeletes(rook);
    expect(flagsOf(card._id).retiredSteps).toBeUndefined();
    expect(rendered('gm-1', card._id).querySelector(RETRY).disabled).toBeFalsy();

    await press('gm-1', card._id, RETRY);
    expect(failCards()).toHaveLength(1);
    expect(namesake.flags[MODULE_ID].connection.relationshipTicks).toBeGreaterThan(0);
  }, 30_000);

  it('only that NPC\'s step: deleting another NPC leaves the card as it is', async () => {
    const card = await fulfilWithRefused(rookWrite);
    await gmDeletes(table.actors.get('npc-dace'));

    expect(flagsOf(card._id).retiredSteps).toBeUndefined();
    expect(rendered('gm-1', card._id).querySelector(RETRY).disabled).toBeFalsy();
  }, 30_000);
});

describe('issue #364 PAYOFF-CARD-DEEPEN-DELETED-NPC — a bond recommit offer for a deleted NPC is retired', () => {
  /** Kira's Forge a Bond miss's offer, as postBondRecommitOfferCard posts it. */
  async function bondOffer(hostId = 'npc-rook', name = 'Rook') {
    const card = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: '<div class="sf-ptp-card"><strong>Bond — recommit?</strong><div class="sf-milestone-suggest-row">'
        + '<button type="button" class="sf-followup-btn" data-action="sf-bond-recommit">🔁 Recommit to the Bond</button></div></div>',
      flags: { [MODULE_ID]: { bondRecommitOfferCard: true, hostId, connectionName: name, actorId: 'pc-pat' } },
    }));
    await table.settle();
    return card;
  }
  const idOf = (card) => card._id ?? card.id;

  it('control: before the delete the offer is live for Kira\'s player', async () => {
    const card = await bondOffer();
    expect(rendered('pl-1', idOf(card)).querySelector(RECOMMIT).disabled).toBeFalsy();
  }, 30_000);

  it('after the GM deletes the NPC the offer is disabled on every client and says why', async () => {
    const card = await bondOffer();
    await gmDeletes(rook);

    expect(flagsOf(idOf(card)).offerRetired, 'the canonical GM stamped the offer').toBe(true);
    for (const id of ['gm-1', 'pl-1']) {
      const btn = rendered(id, idOf(card)).querySelector(RECOMMIT);
      expect(btn.disabled, `${id} sees the offer disabled`).toBe(true);
      expect(btn.title).toContain('Rook');
      expect(btn.title).toMatch(/deleted/);
    }
  }, 30_000);

  it('a press on the retired offer does nothing — and neither does a request that reaches the GM anyway', async () => {
    const card = await bondOffer();
    await gmDeletes(rook);
    const before = table.world.messages().length;

    await press('pl-1', idOf(card), RECOMMIT);
    const gm = table.client('gm-1');
    const { applyBondRecommitOffer } = await gm.import('../../src/moves/cardActions.js');
    const out = await gm.run(() => applyBondRecommitOffer({ messageId: idOf(card) }, { requesterId: 'pl-1' }));
    await table.settle(); await table.drain();

    expect(out).toMatchObject({ applied: false, reason: 'retired' });
    expect(flagsOf(idOf(card)).recommitted, 'the offer is not claimed').toBeFalsy();
    expect(table.world.messages().length, 'no "is no longer a connection" card').toBe(before);
  }, 30_000);

  it('the offer names the card by its id: it is retired though a namesake\'s card is left, and the namesake\'s own offer stays', async () => {
    npc('npc-rook-2', 'Rook');
    await table.client('gm-1').run(() => game.settings.set(MODULE_ID, 'campaignState',
      { ...game.settings.get(MODULE_ID, 'campaignState'), connectionIds: ['npc-rook', 'npc-dace', 'npc-rook-2'] }));
    await table.settle();
    const card  = await bondOffer();
    const other = await bondOffer('npc-rook-2', 'Rook');

    await gmDeletes(rook);
    expect(flagsOf(idOf(card)).offerRetired).toBe(true);
    expect(flagsOf(idOf(other)).offerRetired).toBeUndefined();
    expect(rendered('pl-1', idOf(other)).querySelector(RECOMMIT).disabled).toBeFalsy();
  }, 30_000);

  it('an offer already taken, and another NPC\'s offer, are left as they are', async () => {
    const taken = await bondOffer();
    await table.client('gm-1').run(() => game.messages.get(idOf(taken)).update({ [`flags.${MODULE_ID}.recommitted`]: true }));
    const forDace = await bondOffer('npc-dace', 'Dace');
    await table.settle();

    await gmDeletes(rook);
    expect(flagsOf(idOf(taken)).offerRetired).toBeUndefined();
    expect(flagsOf(idOf(forDace)).offerRetired).toBeUndefined();
    expect(rendered('pl-1', idOf(forDace)).querySelector(RECOMMIT).disabled).toBeFalsy();
  }, 30_000);
});
