/**
 * STARFORGED COMPANION
 * tests/unit/deletedNarrationSurvivesReload.test.js
 *
 * Issue #347 residual DELETED-NARRATION-MEMORY-PAGE-ONLY (AB22's). The X-Card
 * answers the newest narration, read from the chat as it was: AB22 made each
 * client remember the chat messages deleted since its page loaded, so a
 * narration whose card a GM deleted is still the one the X-Card removes. The
 * record lived in the page — after a reload the X-Card answered the kept beat
 * before it again, and the deleted narration's facts stayed binding. The
 * canonical GM now keeps the newest deleted messages the pick reads on
 * campaignState (`deletedChatMessages`, capped, without their text), which the
 * pick reads too; a deleted card the X-Card removed is marked there, as a
 * removed card in chat is.
 */
/* global makeTestActor */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import {
  applyNarratorSidecar, postNarrationCard, registerDeletedChatHook, _resetDeletedMessagesForTests,
} from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

let vex;
beforeAll(() => { registerDeletedChatHook(); });

beforeEach(() => {
  ChatMessage._reset();
  _resetDeletedMessagesForTests();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];

  vex = makeTestActor({ id: 'npc-vex', name: 'Vex', type: 'character', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { name: 'Vex', generativeTier: [] } } } });
  game.actors._set(vex.id, vex);

  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: ['npc-vex'], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
});

const DEAL = {
  newTruths: [{ subject: 'Vex', fact: 'Agreed to carry the crew to Ironway for half the salvage' }],
  stateChanges: [{ subject: 'Vex', attribute: 'location', value: 'the cargo bay' }],
  sceneFrame: { location: 'the cargo bay', present: ['Vex'], situation: 'The deal is struck' },
};
const TORCH = {
  newTruths: [{ subject: 'the prisoner', fact: 'His hand was burned with a cutting torch' }],
  stateChanges: [{ subject: 'Vex', attribute: 'location', value: 'the interrogation cell' }],
  sceneFrame: { location: 'the interrogation cell', present: ['Vex', 'the prisoner'], situation: 'The torch hovers over his hand' },
};
const DOCKS = {
  newTruths: [{ subject: 'Vex', fact: 'Bought the crew a round at the docks' }],
  stateChanges: [],
  sceneFrame: { location: 'the docks', present: ['Vex'], situation: 'Drinks all round' },
};

/** Each message a moment after the last, as Foundry stamps them. */
let clock = Date.UTC(2026, 10, 11, 20, 0, 0);
const tick = () => { clock += 1000; vi.setSystemTime(clock); return clock; };

/** A narration as the narrator makes one: the sidecar applied with its id, then its card. */
async function narrate(narrationId, prose, sidecar) {
  tick();
  const text = applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``, stored(),
    { narrationId, matchedEntityIds: ['npc-vex'] });
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: `res-${narrationId}` }, stored(),
    { playerText: 'A line.', playerName: 'Kira', narrationId });
  await new Promise(r => setTimeout(r, 0));   // the chained sidecar persist lands
}
const someoneSpeaks = (content) => ChatMessage.create({ content, flags: {}, timestamp: tick() });
const cardOf  = (narrationId) => ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.narrationId === narrationId);
const truthOf = (narrationId) => stored().sceneTruths.find(t => t.narrationId === narrationId);
/** The GM deletes a chat message: it leaves the chat log, and every client's deleteChatMessage hook fires. */
function deleteMessage(message) {
  const i = ChatMessage._created.indexOf(message);
  ChatMessage._created.splice(i, 1);
  Hooks.call('deleteChatMessage', message, {}, 'gm-1');
}
const deleteCard = (narrationId) => deleteMessage(cardOf(narrationId));

async function twoBeats() {
  await someoneSpeaks('I offer Vex half the salvage for passage.');
  await narrate('nar-deal', 'Vex spits, then shakes on it.', DEAL);
  await someoneSpeaks('I press the prisoner for the code.');
  await narrate('nar-torch', 'Vex pins his wrist while the torch comes down.', TORCH);
}

const reload = () => _resetDeletedMessagesForTests();   // a page load: the page's record starts empty
const settleChain = () => new Promise(r => setTimeout(r, 0));

describe('a deleted narration and the X-Card after a reload (issue #347 residual)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(clock); });
  afterEach(() => { vi.useRealTimers(); });

  it('with the torch card deleted and the page reloaded, the X-Card still removes the torch narration — not the deal', async () => {
    await twoBeats();
    deleteCard('nar-torch');
    await settleChain();
    reload();
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toEqual(['nar-torch']);
    expect(truthOf('nar-torch')).toMatchObject({ retracted: true, retractedBy: 'xcard' });
    expect(truthOf('nar-deal').retracted).toBe(false);
    expect(cardOf('nar-deal').flags[MODULE_ID].xCarded).toBeUndefined();
  });

  it('a deleted narration the X-Card removed is marked as removed, and a second X-Card after a reload removes nothing more', async () => {
    await twoBeats();
    deleteCard('nar-torch');
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    await settleChain();
    expect(stored().deletedChatMessages.find(d => d.flags[MODULE_ID].narrationId === 'nar-torch').flags[MODULE_ID].xCarded).toBe(true);

    reload();
    syncChat();
    await suppressScene({}, { local: true });
    expect(truthOf('nar-deal').retracted, 'the deal is not reached').toBe(false);
    expect(stored().xCardedNarrationIds).toEqual(['nar-torch']);
  });

  it('the kept record is small and bounded: the pick\'s flags, no text, the newest twenty', async () => {
    await twoBeats();
    deleteCard('nar-torch');
    await settleChain();
    const [rec] = stored().deletedChatMessages;
    expect(rec).toMatchObject({ deleted: true, flags: { [MODULE_ID]: { narratorCard: true, narrationId: 'nar-torch', sessionId: SESSION } } });
    expect(rec.content, 'no text is kept').toBeUndefined();
    expect(JSON.stringify(rec), 'no prose is kept').not.toMatch(/torch comes down/);

    for (let i = 0; i < 25; i++) {
      await narrate(`nar-extra-${i}`, `Beat ${i}.`, { newTruths: [], stateChanges: [] });
      deleteCard(`nar-extra-${i}`);
      await settleChain();
    }
    expect(stored().deletedChatMessages).toHaveLength(20);
    expect(stored().deletedChatMessages.at(-1).flags[MODULE_ID].narrationId).toBe('nar-extra-24');
  });

  it('a person\'s deleted line is kept without its text, and after a reload still ends the beat', async () => {
    await twoBeats();
    const line = ChatMessage._created.find(m => m.content === 'I press the prisoner for the code.');
    deleteMessage(line);
    await settleChain();
    const rec = stored().deletedChatMessages.find(d => d.id === line.id);
    expect(rec).toMatchObject({ deleted: true, flags: {} });
    expect(JSON.stringify(rec), 'no text is kept').not.toMatch(/prisoner/);

    reload();
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds, 'the torch beat only — the deal before the line is kept').toEqual(['nar-torch']);
    expect(truthOf('nar-deal').retracted).toBe(false);
  });

  it('a Clear Chat Log\'s deletions land in one campaignState write', async () => {
    await twoBeats();
    const set = vi.spyOn(game.settings, 'set');
    try {
      for (const m of ChatMessage._created.slice()) deleteMessage(m);
      await settleChain();
      expect(set.mock.calls.filter(([, key]) => key === 'campaignState')).toHaveLength(1);
    } finally { set.mockRestore(); }
    expect(stored().deletedChatMessages.map(d => d.flags[MODULE_ID]?.narrationId ?? 'line'))
      .toEqual(['line', 'nar-deal', 'line', 'nar-torch']);
  });

  it('control: one of this module\'s other cards, deleted, is not kept — the pick passes it over', async () => {
    const card = await ChatMessage.create({ content: 'A sector map.', flags: { [MODULE_ID]: { sectorCard: true } }, timestamp: tick() });
    deleteMessage(card);
    await settleChain();
    expect(stored().deletedChatMessages ?? []).toEqual([]);
  });

  it('control: on a player\'s client nothing is written', async () => {
    global.game.user = { id: 'pl-1', isGM: false, active: true };
    try {
      await twoBeats();
      const before = stored().deletedChatMessages;
      deleteCard('nar-torch');
      await settleChain();
      expect(stored().deletedChatMessages).toEqual(before);
    } finally { global.game.user = global.game.users[0]; }
  });
});
