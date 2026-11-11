/**
 * STARFORGED COMPANION
 * tests/unit/xcardAfterNarrationCardDeleted.test.js
 *
 * Issue #347 AB22 (XCARD-AFTER-DELETED-NARRATOR-CARD) — the X-Card after a GM
 * deleted the newest narration's chat card.
 *
 * Beat 1: the narrator has Vex agree to the deal (a kept narration, nobody
 * objects). Beat 2: a player presses the prisoner; the narration burns his
 * hand with a torch. The GM deletes that card from the chat log (the first
 * thing a GM reaches for) and a player plays the X-Card.
 *
 * `suppressScene` (src/context/safety.js) removes what
 * `applyXCardToNarratorMemory` → `xCardedNarrationCards` picks, and that pick
 * read chat cards only: the newest narrator card left was beat 1's, across the
 * player's line (the first walk passes a person's message over). So the
 * X-Card retracted beat 1's truths (blocked for the session), undid its
 * capture and flagged its card — while the torch narration's truths, state and
 * frame, which no card named any more, stayed binding in every later prompt
 * and were archived as canon at scene end.
 *
 * Each client now remembers the chat messages deleted since its page loaded
 * (the `deleteChatMessage` hook, narrator.js registerDeletedChatHook), and the
 * X-Card's pick reads the chat as it was: the deleted narration is still the
 * newest, and it is what the X-Card removes. A deletion alone changes nothing
 * in narrator memory (Clear Chat Log deletes every card).
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

describe('issue #347 AB22 — the X-Card after the GM deleted the narration\'s chat card', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(clock); });
  afterEach(() => { vi.useRealTimers(); });

  it('control: with the card still in chat, the X-Card removes the torch narration and leaves the deal', async () => {
    await twoBeats();
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toEqual(['nar-torch']);
    expect(truthOf('nar-torch')).toMatchObject({ retracted: true, retractedBy: 'xcard' });
    expect(truthOf('nar-deal').retracted).toBe(false);
    expect(cardOf('nar-deal').flags[MODULE_ID].xCarded).toBeUndefined();
    expect(stored().sceneFrame.location).toBe('the cargo bay');
  });

  it('with the torch card deleted first, the X-Card removes the torch narration — not the deal on screen', async () => {
    await twoBeats();
    deleteCard('nar-torch');
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardActive).toBe(true);

    // The kept, earlier beat is not what the table removed.
    expect(cardOf('nar-deal').flags[MODULE_ID].xCarded, 'the deal narration\'s card').toBeUndefined();
    expect(truthOf('nar-deal').retracted, 'the deal narration\'s truth').toBe(false);
    expect(stored().xCardedNarrationIds, 'the narrations the X-Card removed').toEqual(['nar-torch']);
    // What the deleted narration wrote does not go on binding the narrator.
    expect(truthOf('nar-torch')).toMatchObject({ retracted: true, retractedBy: 'xcard' });
    expect(stored().sceneFrame?.location, 'the scene frame goes back to the kept narration\'s').toBe('the cargo bay');
  });

  it('a deletion alone changes nothing in narrator memory — tidying chat does not rewrite the story', async () => {
    await twoBeats();
    deleteCard('nar-torch');
    syncChat();
    await new Promise(r => setTimeout(r, 0));
    expect(truthOf('nar-torch').retracted).toBe(false);
    expect(stored().xCardedNarrationIds ?? []).toEqual([]);
    expect(stored().sceneFrame.location).toBe('the interrogation cell');
  });

  it('a narration posted after the deleted one is the one the X-Card answers', async () => {
    await twoBeats();
    deleteCard('nar-torch');
    await someoneSpeaks('We head for the docks.');
    await narrate('nar-docks', 'Vex buys a round.', DOCKS);
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toEqual(['nar-docks']);
    expect(truthOf('nar-torch').retracted, 'the earlier, deleted beat is not this X-Card\'s').toBe(false);
    expect(truthOf('nar-deal').retracted).toBe(false);
  });

  it('a person\'s deleted line still ends the beat: the X-Card does not reach back into the earlier narration', async () => {
    await someoneSpeaks('I offer Vex half the salvage for passage.');
    await narrate('nar-deal', 'Vex spits, then shakes on it.', DEAL);
    const line = await someoneSpeaks('I press the prisoner for the code.');
    await narrate('nar-torch', 'Vex pins his wrist while the torch comes down.', TORCH);
    deleteMessage(line);
    deleteCard('nar-torch');
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toEqual(['nar-torch']);
    expect(truthOf('nar-deal').retracted).toBe(false);
  });
});
