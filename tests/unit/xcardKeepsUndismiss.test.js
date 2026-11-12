/**
 * STARFORGED COMPANION
 * tests/unit/xcardKeepsUndismiss.test.js
 *
 * XCARD-KEEPS-UNDISMISS (issue #345 AA19 / AA55's residual). A Make a
 * Connection hit whose narration names an NPC the GM had dismissed from a
 * draft card takes the name off the Dismissed list and confirms the row as
 * the roller's (AA19); an identity reveal onto a dismissed name takes it off
 * too (AA55). The X-Card on that narration removed the connection while
 * unused and put the row back (or the placeholder's name back), but left the
 * name off the list — the GM's dismissal was gone for good. The un-dismissal
 * is now logged with its narration id and the X-Card's finish dismisses the
 * name again (and a dismissed row goes back to dismissed), unless a record
 * still holds the name.
 *
 * Harness: makeConnectionPendingConfirmXCard.test.js's.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { applyNarratorSidecar, postNarrationCard, runPostNarrationPasses } from '../../src/narration/narrator.js';
import { routeEntityDrafts, registerDraftCardHooks, applyEntityRenames, restoreNarrationDismissals } from '../../src/entities/entityExtractor.js';
import { suppressScene } from '../../src/context/safety.js';
import { parseHTML, StubElement } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-9';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => {
  const contents = ChatMessage._created.slice();
  global.game.messages = { contents, get: (id) => contents.find(m => m.id === id) ?? null };
};

const GM = { id: 'gm-1', isGM: true, active: true };
const PL = { id: 'pl-1', isGM: false, active: true };

const VEX = { type: 'connection', name: 'Vex', description: 'A smuggler who runs the lower docks.', pronouns: 'she/her', role: 'smuggler', goal: null, confidence: 'high' };
const NOTHING_NEW = { entities: [], renames: [], worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] } };

const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

let origHTMLElement;
beforeAll(() => {
  origHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  registerDraftCardHooks();
});
afterAll(() => {
  if (origHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = origHTMLElement;
});

let origActorCreate, origItemCreate;
beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [], get: () => null };
  global.game.users = Object.assign([GM, PL], { get: (id) => [GM, PL].find(u => u.id === id) ?? null, filter: (fn) => [GM, PL].filter(fn) });
  global.game.user = GM;
  global.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 9, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: [], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
  game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character', ownership: { 'pl-1': 3 } }));
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const user = String(body?.messages?.[0]?.content ?? '');
    if (/You are analysing an Ironsworn: Starforged narration/.test(user)) return reply(JSON.stringify(NOTHING_NEW));
    return reply('{"contradictions":[]}');
  });
  origActorCreate = global.Actor.create;
  origItemCreate  = global.Item.create;
  global.Actor.create = async (data) => {
    const actor = await origActorCreate(data);
    actor.delete = async () => { game.actors._setAll(game.actors.contents.filter(a => a !== actor)); };
    return actor;
  };
  global.Item.create = async (data, options) => {
    const item = await origItemCreate(data, options);
    item.delete = async () => {
      const list = options?.parent?.items?.contents;
      const i = list?.indexOf(item) ?? -1;
      if (i >= 0) list.splice(i, 1);
    };
    return item;
  };
});
afterEach(() => {
  delete global.ui;
  global.Actor.create = origActorCreate;
  global.Item.create  = origItemCreate;
});

async function narrate(narrationId, prose, resolution) {
  const cs = stored();
  const text = applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [] })}\n\`\`\``,
    cs, { narrationId, matchedEntityIds: [] });
  await postNarrationCard(text, resolution, cs, { playerText: resolution.playerNarration, playerName: 'Kira', narrationId });
  return text;
}

const draftCard = () => game.messages.contents.find(m => m.flags?.[MODULE_ID]?.draftEntityCard);
const draftRow  = () => (game.messages.get(draftCard()?.id)?.flags?.[MODULE_ID]?.drafts ?? []).find(d => d.name === 'Vex');
const vexActors = () => game.actors.contents.filter(a => a.flags?.[MODULE_ID]?.entityType === 'connection');

/** An earlier narration queues Vex on a draft card; the GM presses its Dismiss. */
async function gmDismissesVex() {
  await narrate('nar-0', 'A dock hand mutters about Vex and her smuggling.',
    { _id: 'res-0', moveId: 'gather_information', outcome: 'weak_hit', playerNarration: 'I ask around the docks.' });
  await routeEntityDrafts([VEX], stored(), { actorId: 'pc-kira', narrationId: 'nar-0', sessionId: SESSION });
  syncChat();
  const card = game.messages.get(draftCard().id);
  const root = parseHTML(card.content);
  Hooks.call('renderChatMessageHTML', card, [root]);
  root.querySelector(`[data-action="sf-draft-dismiss"][data-index="${draftRow().index}"]`).click();
  await vi.waitFor(() => expect(draftRow().status).toBe('dismissed'));
  expect(stored().dismissedEntities).toEqual(['Vex']);
}

/** A Make a Connection hit whose narration and line name the dismissed Vex. */
async function makeAConnectionWithVex() {
  await ChatMessage.create({ content: 'I go find Vex.', flags: {} });   // someone spoke: a new beat
  const resolution = { _id: 'res-mac', moveId: 'make_a_connection', outcome: 'strong_hit', playerNarration: 'I look for Vex under the gantry.' };
  const text = await narrate('nar-mac', 'Vex steps out from behind a crate and agrees to meet you under the gantry.', resolution);
  syncChat();
  await runPostNarrationPasses(text, resolution,
    { resolvedClass: 'discovery', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: false, referenceType: 'none' },
    stored(), { actorId: 'pc-kira', narrationId: 'nar-mac' });
  syncChat();
}

describe('XCARD-KEEPS-UNDISMISS — the X-Card dismisses again what its narration un-dismissed', () => {
  it('control: the hit takes Vex off the Dismissed list and confirms her row as Kira\'s', async () => {
    await gmDismissesVex();
    await makeAConnectionWithVex();
    expect(vexActors()).toHaveLength(1);
    expect(stored().dismissedEntities).toEqual([]);
    expect(draftRow().status).toBe('confirmed');
    expect(stored().undismissedByNarration).toEqual([{ name: 'Vex', narrationId: 'nar-mac' }]);
  });

  it('the X-Card on the hit removes the unused connection, the row goes back to dismissed and Vex back on the list', async () => {
    await gmDismissesVex();
    await makeAConnectionWithVex();

    expect(await suppressScene({}, { local: true })).toBe(true);
    syncChat();

    expect(stored().xCardedNarrationIds).toEqual(['nar-mac']);
    expect(vexActors(), 'the NPC card').toEqual([]);
    expect(stored().dismissedEntities, 'the GM\'s dismissal stands again').toEqual(['Vex']);
    expect(draftRow().status).toBe('dismissed');
    expect(stored().undismissedByNarration).toEqual([]);
  });

  it('used since — she stays, and her name stays off the list (a record holds it)', async () => {
    await gmDismissesVex();
    await makeAConnectionWithVex();
    const bond = game.actors.get('pc-kira').items.contents.find(i => i.system?.subtype === 'bond');
    bond.system.current = 4;

    expect(await suppressScene({}, { local: true })).toBe(true);
    syncChat();
    expect(vexActors()).toHaveLength(1);
    expect(stored().dismissedEntities).toEqual([]);
  });

  it('an identity reveal onto a dismissed name logs the un-dismissal, which the X-Card\'s restore dismisses again', async () => {
    game.settings._store.set(KEY, { ...stored(), dismissedEntities: ['Vex'], connectionIds: ['conn-fig'] });
    const placeholder = { _id: 'conn-fig', name: 'Unknown Suited Figure' };
    const applied = await applyEntityRenames([{ from: 'Unknown Suited Figure', to: 'Vex' }], stored(), {
      narrationId:     'nar-reveal',
      getConn:         () => placeholder,
      updateConn:      async (_id, data) => { Object.assign(placeholder, data); },
      entityExists:    () => false,
      postNotice:      async () => {},
      promoteSubjects: async () => {},
    });
    expect(applied.map(a => a.to)).toEqual(['Vex']);
    expect(stored().dismissedEntities).toEqual([]);
    expect(stored().undismissedByNarration).toEqual([{ name: 'Vex', narrationId: 'nar-reveal' }]);

    // The X-Card's finish has put the placeholder's name back; no record holds "Vex".
    expect(await restoreNarrationDismissals(['nar-reveal'])).toEqual(['Vex']);
    expect(stored().dismissedEntities).toEqual(['Vex']);
  });

  it('restoreNarrationDismissals dismisses only what the removed narrations un-dismissed, once', async () => {
    game.settings._store.set(KEY, { ...stored(), dismissedEntities: ['Dace'],
      undismissedByNarration: [{ name: 'Vex', narrationId: 'nar-1' }, { name: 'Ilsa', narrationId: 'nar-2' }, { name: 'Dace', narrationId: 'nar-1' }] });
    expect(await restoreNarrationDismissals(['nar-1'])).toEqual(['Vex']);
    expect(stored().dismissedEntities).toEqual(['Dace', 'Vex']);
    expect(stored().undismissedByNarration).toEqual([{ name: 'Ilsa', narrationId: 'nar-2' }]);
    expect(await restoreNarrationDismissals(['nar-1'])).toEqual([]);
  });

  it('a narration the X-Card already removed un-dismisses nothing', async () => {
    await gmDismissesVex();
    game.settings._store.set(KEY, { ...stored(), xCardedNarrationIds: ['nar-mac'] });
    await makeAConnectionWithVex();
    expect(stored().dismissedEntities).toEqual(['Vex']);
  });
});
