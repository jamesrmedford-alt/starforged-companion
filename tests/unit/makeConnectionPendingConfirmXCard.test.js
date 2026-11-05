/**
 * STARFORGED COMPANION
 * tests/unit/makeConnectionPendingConfirmXCard.test.js
 *
 * MAKE-CONNECTION-PENDING-CONFIRM-UNSTAMPED (issue #338's open items). An
 * earlier narration names Vex; its capture queues her on a ◈ New Entities
 * card, pending. A Make a Connection hit's narration then names her: the
 * detection leaves a pending name out, so routeEntityDrafts confirms the
 * named pending row as the roller's connection (confirmNamedPendingConnection,
 * issue #325 W23). That connection carried no `createdFromNarrationId`, so an
 * X-Card on the Make a Connection narration kept the NPC card and its bond
 * (issue #338 D6(ii) reaches only a stamped one) and the row stayed confirmed.
 *
 * The confirm now stamps the narration (and the row it confirmed); the
 * X-Card's finish removes the connection while unused — D6(ii)'s rules — and
 * puts the row back to pending: the NPC was the earlier narration's, which
 * the X-Card kept. The earlier narration's facts about her, promoted to the
 * card when it was made, go back to her name.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { applyNarratorSidecar, postNarrationCard, runPostNarrationPasses } from '../../src/narration/narrator.js';
import { routeEntityDrafts, registerDraftCardHooks } from '../../src/entities/entityExtractor.js';
import { suppressScene } from '../../src/context/safety.js';
import { listConnections } from '../../src/entities/connection.js';
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
const SMUGGLES = 'Smuggles medical supplies';
const MEETS    = 'Agreed to meet under the gantry';

const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

// The chat-render shim unwraps `html instanceof HTMLElement ? html : html[0]`.
let origHTMLElement;
beforeAll(() => {
  origHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  registerDraftCardHooks();
});
afterAll(() => {
  if (origHTMLElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = origHTMLElement;
});

let kira, origActorCreate, origItemCreate;
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
  kira = makeTestActor({ id: 'pc-kira', name: 'Kira', type: 'character', ownership: { 'pl-1': 3 } });
  game.actors._set('pc-kira', kira);
  // The Make a Connection narration's detection leaves the pending name out (its prompt says to).
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const user = String(body?.messages?.[0]?.content ?? '');
    if (/You are analysing an Ironsworn: Starforged narration/.test(user)) return reply(JSON.stringify(NOTHING_NEW));
    return reply('{"contradictions":[]}');
  });

  // Foundry's Document#delete for the Actors and Items the confirm creates.
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

/** A narration as the narrator makes one: its sidecar applied with its id, then its card. */
async function narrate(narrationId, prose, newTruths, resolution) {
  const cs = stored();
  const text = applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify({ newTruths, stateChanges: [] })}\n\`\`\``,
    cs, { narrationId, matchedEntityIds: [] });
  await postNarrationCard(text, resolution, cs, { playerText: resolution.playerNarration, playerName: 'Kira', narrationId });
  return text;
}

/** The earlier narration names Vex; its capture queues her on a draft card, pending. */
async function earlierNarrationQueuesVex() {
  await narrate('nar-0', 'A dock hand mutters that Vex smuggles medical supplies past the patrols.',
    [{ subject: 'Vex', fact: SMUGGLES }], { _id: 'res-0', moveId: 'gather_information', outcome: 'weak_hit', playerNarration: 'I ask around the docks.' });
  await routeEntityDrafts([VEX], stored(), { actorId: 'pc-kira', narrationId: 'nar-0', sessionId: SESSION });
  syncChat();
  expect(draftRow()?.status).toBe('pending');
}

/** A Make a Connection hit whose narration names the pending Vex — its synchronous capture confirms her. */
async function makeAConnectionWithVex() {
  await ChatMessage.create({ content: 'I go find Vex.', flags: {} });   // someone spoke: a new beat
  const resolution = { _id: 'res-mac', moveId: 'make_a_connection', outcome: 'strong_hit', playerNarration: 'I look for Vex under the gantry.' };
  const text = await narrate('nar-mac', 'Vex steps out from behind a crate and agrees to meet you under the gantry.',
    [{ subject: 'Vex', fact: MEETS }], resolution);
  syncChat();
  await runPostNarrationPasses(text, resolution,
    { resolvedClass: 'discovery', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: false, referenceType: 'none' },
    stored(), { actorId: 'pc-kira', narrationId: 'nar-mac' });
  syncChat();
}

const draftCard = () => game.messages.contents.find(m => m.flags?.[MODULE_ID]?.draftEntityCard);
const draftRow  = () => (game.messages.get(draftCard()?.id)?.flags?.[MODULE_ID]?.drafts ?? []).find(d => d.name === 'Vex');
const vexActors = () => game.actors.contents.filter(a => a.flags?.[MODULE_ID]?.entityType === 'connection');
const vexRecord = () => listConnections(stored()).find(c => c.name === 'Vex') ?? null;
const kiraBonds = () => kira.items.contents.filter(i => i.system?.subtype === 'bond');
const truthOf   = (fact) => stored().sceneTruths.find(t => t.fact === fact);

describe('MAKE-CONNECTION-PENDING-CONFIRM-UNSTAMPED — a Make a Connection that confirms an earlier pending draft', () => {
  it('control: the hit confirms the pending Vex as the roller\'s connection, and her earlier facts move onto her card', async () => {
    await earlierNarrationQueuesVex();
    await makeAConnectionWithVex();
    expect(draftRow().status).toBe('confirmed');
    expect(vexActors()).toHaveLength(1);
    expect(kiraBonds().map(i => i.name)).toEqual(['Vex']);
    expect(truthOf(SMUGGLES).subject).toMatchObject({ kind: 'entity', entityId: vexActors()[0].id });
  });

  it('the confirmed connection carries the narration that made it', async () => {
    await earlierNarrationQueuesVex();
    await makeAConnectionWithVex();
    expect(vexRecord().createdFromNarrationId).toBe('nar-mac');
  });

  it('the X-Card on the Make a Connection narration removes the unused connection and puts the row back to pending', async () => {
    await earlierNarrationQueuesVex();
    await makeAConnectionWithVex();
    const vexId = vexActors()[0].id;

    expect(await suppressScene({}, { local: true })).toBe(true);
    syncChat();

    expect(stored().xCardedNarrationIds).toEqual(['nar-mac']);
    expect(vexActors(), 'the NPC card').toEqual([]);
    expect(kiraBonds(), 'the bond on the roller\'s sheet').toEqual([]);
    expect(stored().connectionIds).not.toContain(vexId);
    // The NPC is the earlier, kept narration's: her row is pending again, Confirm and Dismiss back.
    expect(draftRow().status).toBe('pending');
    expect(game.messages.get(draftCard().id).content).toMatch(/data-action="sf-draft-confirm"/);
    // The kept narration's fact about her is hers by name again — not keyed to a card that is gone.
    expect(truthOf(SMUGGLES)).toMatchObject({ retracted: false, subject: { kind: 'text', text: 'Vex' } });
    expect(truthOf(MEETS)).toMatchObject({ retracted: true, retractedBy: 'xcard' });
  });

  it('a later Confirm of the reopened row makes her again, with her earlier facts', async () => {
    await earlierNarrationQueuesVex();
    await makeAConnectionWithVex();
    expect(await suppressScene({}, { local: true })).toBe(true);
    syncChat();

    // The GM presses the reopened row's Confirm on the rendered card.
    const card = game.messages.get(draftCard().id);
    const root = parseHTML(card.content);
    Hooks.call('renderChatMessageHTML', card, [root]);
    root.querySelector(`[data-action="sf-draft-confirm"][data-index="${draftRow().index}"]`).click();
    await vi.waitFor(() => expect(draftRow().status).toBe('confirmed'));
    syncChat();
    expect(vexActors()).toHaveLength(1);
    expect(vexRecord().createdFromNarrationId).toBeUndefined();   // the GM's Confirm, not a narration's
    expect(truthOf(SMUGGLES).subject).toMatchObject({ kind: 'entity', entityId: vexActors()[0].id });
  });

  it('used since — a tick on her bond — she stays, the row stays confirmed, and the GMs are told', async () => {
    await earlierNarrationQueuesVex();
    await makeAConnectionWithVex();
    kiraBonds()[0].system.current = 4;
    const before = ChatMessage._created.length;

    expect(await suppressScene({}, { local: true })).toBe(true);
    syncChat();

    expect(vexActors()).toHaveLength(1);
    expect(kiraBonds()).toHaveLength(1);
    expect(draftRow().status).toBe('confirmed');
    const notice = ChatMessage._created.slice(before).filter(m => m.flags?.[MODULE_ID]?.xcardConnectionNotice);
    expect(notice).toHaveLength(1);
    expect(notice[0].content).toMatch(/\bVex\b/);
  });

  it('with a paragraph the GM wrote on her Notes tab since, she stays (sheetWrittenByTable)', async () => {
    await earlierNarrationQueuesVex();
    await makeAConnectionWithVex();
    const actor = vexActors()[0];
    actor.system = { ...(actor.system ?? {}), notes: '<p>Owes Kira a favour from the blockade.</p>' };

    expect(await suppressScene({}, { local: true })).toBe(true);
    syncChat();
    expect(vexActors()).toHaveLength(1);
    expect(draftRow().status).toBe('confirmed');
  });
});
