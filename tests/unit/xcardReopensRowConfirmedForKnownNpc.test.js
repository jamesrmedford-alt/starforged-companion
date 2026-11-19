/**
 * STARFORGED COMPANION
 * tests/unit/xcardReopensRowConfirmedForKnownNpc.test.js
 *
 * Issue #364 XCARD-BOND-DRAFT-ROW-CONFIRMED (left open by issue #364
 * DELETED-NPC-NAME-REFERENCES, the X-Card's half).
 *
 * An earlier narration names Vex; its capture queues her on a ◈ New Entities
 * card, pending. She gets a card another way meanwhile (the GM's ＋ New NPC),
 * so the row waits for an NPC who exists. A Make a Connection hit then names
 * her: the pending row is the hit's (confirmDraft), which makes no second
 * card — it puts the roller's bond on the known NPC and marks the row
 * confirmed. The X-Card on that hit's narration takes the bond back (its
 * `bondedByNarrationId`), but the row stayed "confirmed": the card went on
 * saying the table had dealt with a row whose only confirmation was a beat
 * the table removed.
 *
 * The bond the hit creates now carries the row it confirmed
 * (`bondedFromDraft` — the card's id and the row's index, never a name), and
 * the X-Card reopens that row with the bond (reopenConfirmedDraftRow, the
 * path a removed NPC's row already takes): Confirm and Dismiss are back. A
 * bond the table has marked since stays, and so does its row.
 *
 * Single GM client: the real narration cards, the real post-narration passes
 * (routeEntityDrafts → connectNamedFigure → confirmDraft) and the real
 * suppressScene; only the Claude endpoint is scripted.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { applyNarratorSidecar, postNarrationCard, runPostNarrationPasses } from '../../src/narration/narrator.js';
import { routeEntityDrafts, registerDraftCardHooks } from '../../src/entities/entityExtractor.js';
import { suppressScene } from '../../src/context/safety.js';
import { createCharacterBondItem } from '../../src/character/actorBridge.js';
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
const RELEVANCE = { resolvedClass: 'discovery', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: false, referenceType: 'none' };

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

let kira, ren, vex, origItemCreate;
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
  ren  = makeTestActor({ id: 'pc-ren', name: 'Ren', type: 'character' });
  for (const a of [kira, ren]) game.actors._set(a.id, a);
  // The Make a Connection narration's detection leaves a known or pending name out (its prompt says to).
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const user = String(body?.messages?.[0]?.content ?? '');
    if (/You are analysing an Ironsworn: Starforged narration/.test(user)) return reply(JSON.stringify(NOTHING_NEW));
    return reply('{"contradictions":[]}');
  });
  // Foundry's Document#delete for the bond Items the hit creates.
  origItemCreate = global.Item.create;
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
  global.Item.create = origItemCreate;
});

/** A narration as the narrator makes one: its sidecar applied with its id, then its card. */
async function narrate(narrationId, prose, resolution, playerName) {
  const cs = stored();
  const text = applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [] })}\n\`\`\``,
    cs, { narrationId, matchedEntityIds: [] });
  await postNarrationCard(text, resolution, cs, { playerText: resolution.playerNarration, playerName, narrationId });
  return text;
}

/** Kira's earlier narration names Vex; its capture queues her on a draft card, pending. */
async function earlierNarrationQueuesVex() {
  await narrate('nar-0', 'A dock hand mutters that Vex smuggles medical supplies past the patrols.',
    { _id: 'res-0', moveId: 'gather_information', outcome: 'weak_hit', playerNarration: 'I ask around the docks.' }, 'Kira');
  await routeEntityDrafts([VEX], stored(), { actorId: 'pc-kira', narrationId: 'nar-0', sessionId: SESSION });
  syncChat();
  expect(draftRow()?.status, 'Vex waits on the draft card (setup)').toBe('pending');
}

/** Vex gets a card another way meanwhile (the GM's ＋ New NPC): the row now waits for an NPC who exists. */
function gmMakesVexACard() {
  vex = makeTestActor({ id: 'npc-vex', name: 'Vex', type: 'character', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-vex', name: 'Vex', rank: 'dangerous', role: 'Smuggler', relationshipTicks: 0, bonded: false, active: true, history: [],
    } } } });
  game.actors._set(vex.id, vex);
  game.settings._store.set(KEY, { ...stored(), connectionIds: ['npc-vex'] });
}

/** A Make a Connection hit, as the move pipeline narrates and captures one, for the PC `actorId`. */
async function hitWithVex(actorId, playerName) {
  await ChatMessage.create({ content: 'I go find Vex.', flags: {} });   // someone spoke: a new beat
  const resolution = { _id: 'res-mac', moveId: 'make_a_connection', outcome: 'strong_hit', playerNarration: 'I ask Vex to keep a berth open for me.' };
  const text = await narrate('nar-mac', 'Vex steps out from behind a crate and agrees: a berth will be kept.', resolution, playerName);
  syncChat();
  await runPostNarrationPasses(text, resolution, RELEVANCE, stored(), { actorId, narrationId: 'nar-mac' });
  syncChat();
}
const playXCard = async () => { expect(await suppressScene({}, { local: true })).toBe(true); syncChat(); };

const draftCard = () => game.messages.contents.find(m => m.flags?.[MODULE_ID]?.draftEntityCard);
const draftRow  = () => (game.messages.get(draftCard()?.id)?.flags?.[MODULE_ID]?.drafts ?? []).find(d => d.name === 'Vex');
const npcCards  = () => game.actors.contents.filter(a => a.flags?.[MODULE_ID]?.entityType === 'connection');
const bonds     = (actor) => actor.items.contents.filter(i => i.type === 'progress' && i.system?.subtype === 'bond');
const flagsOf   = (item) => item?.flags?.[MODULE_ID] ?? {};

describe('issue #364 XCARD-BOND-DRAFT-ROW-CONFIRMED — the X-Card reopens the draft row a removed hit confirmed for a known NPC', () => {
  it('control: the hit confirms the pending row for the NPC who exists — no second card, Ren\'s bond stamped with the narration and the row', async () => {
    await earlierNarrationQueuesVex();
    gmMakesVexACard();
    await hitWithVex('pc-ren', 'Ren');

    expect(npcCards(), 'no second card').toHaveLength(1);
    expect(draftRow().status).toBe('confirmed');
    expect(bonds(ren).map(i => i.name)).toEqual(['Vex']);
    expect(flagsOf(bonds(ren)[0]).bondedByNarrationId).toBe('nar-mac');
    // The row by its card's id and its index — never by a name.
    expect(flagsOf(bonds(ren)[0]).bondedFromDraft).toEqual({ messageId: draftCard().id, index: draftRow().index });
  });

  it('the X-Card on the hit\'s narration takes the bond back and puts the row back to pending — Confirm and Dismiss on the card again', async () => {
    await earlierNarrationQueuesVex();
    gmMakesVexACard();
    await hitWithVex('pc-ren', 'Ren');
    await playXCard();

    expect(stored().xCardedNarrationIds).toEqual(['nar-mac']);
    expect(bonds(ren), 'the bond the hit added').toEqual([]);
    expect(npcCards(), 'the NPC was there before the hit and stays').toHaveLength(1);
    expect(draftRow().status).toBe('pending');
    const content = game.messages.get(draftCard().id).content;
    expect(content).toMatch(/data-action="sf-draft-confirm"/);
    expect(content).toMatch(/data-action="sf-draft-dismiss"/);
  });

  it('the row is found by its id: renamed since the hit, the NPC\'s bond still reopens the row it confirmed', async () => {
    await earlierNarrationQueuesVex();
    gmMakesVexACard();
    await hitWithVex('pc-ren', 'Ren');
    // The GM renames her; the rename's mirror renames the bond Item.
    vex.name = 'Vex Tannis';
    vex.flags[MODULE_ID].connection.name = 'Vex Tannis';
    bonds(ren)[0].name = 'Vex Tannis';

    await playXCard();
    expect(bonds(ren)).toEqual([]);
    expect(draftRow().status, 'the row still reads "Vex"').toBe('pending');
  });

  it('a later Confirm of the reopened row bonds the card\'s own PC with her, and the row is confirmed again', async () => {
    await earlierNarrationQueuesVex();
    gmMakesVexACard();
    await hitWithVex('pc-ren', 'Ren');
    await playXCard();

    const card = game.messages.get(draftCard().id);
    const root = parseHTML(card.content);
    Hooks.call('renderChatMessageHTML', card, [root]);
    root.querySelector(`[data-action="sf-draft-confirm"][data-index="${draftRow().index}"]`).click();
    await vi.waitFor(() => expect(draftRow().status).toBe('confirmed'));
    syncChat();

    expect(npcCards()).toHaveLength(1);
    expect(bonds(kira).map(i => i.name), 'the earlier narration was Kira\'s').toEqual(['Vex']);
    expect(flagsOf(bonds(kira)[0]).bondedByNarrationId, 'the GM\'s Confirm, not a narration\'s').toBeUndefined();
    expect(bonds(ren)).toEqual([]);
  });

  it('a bond the table has marked since stays, and so does its row', async () => {
    await earlierNarrationQueuesVex();
    gmMakesVexACard();
    await hitWithVex('pc-ren', 'Ren');
    bonds(ren)[0].system.current = 8;   // Ren developed the relationship since

    await playXCard();
    expect(bonds(ren).map(i => [i.name, i.system.current])).toEqual([['Vex', 8]]);
    expect(draftRow().status).toBe('confirmed');
    expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.xcardBondNotice)).toHaveLength(1);
  });

  it('a hit by a PC who already holds the bond adds none: the X-Card takes none back and the row stays confirmed', async () => {
    await earlierNarrationQueuesVex();
    gmMakesVexACard();
    await createCharacterBondItem(kira, { name: 'Vex', rank: 'dangerous', connectionId: 'rec-vex' });   // Kira's, from before the hit
    await hitWithVex('pc-kira', 'Kira');
    expect(draftRow().status).toBe('confirmed');
    expect(flagsOf(bonds(kira)[0]).bondedFromDraft, 'a bond from before the hit carries no row').toBeUndefined();

    await playXCard();
    expect(bonds(kira).map(i => i.name)).toEqual(['Vex']);
    expect(draftRow().status).toBe('confirmed');
  });

  it('control: an X-Card on a later, other narration leaves the bond and the row', async () => {
    await earlierNarrationQueuesVex();
    gmMakesVexACard();
    await hitWithVex('pc-ren', 'Ren');
    await ChatMessage.create({ content: 'I wait.', flags: {} });
    await narrate('nar-later', 'The dock lights flicker.',
      { _id: 'res-later', moveId: 'face_danger', outcome: 'weak_hit', playerNarration: 'I wait.' }, 'Ren');
    syncChat();

    await playXCard();
    expect(bonds(ren).map(i => i.name)).toEqual(['Vex']);
    expect(draftRow().status).toBe('confirmed');
  });
});
