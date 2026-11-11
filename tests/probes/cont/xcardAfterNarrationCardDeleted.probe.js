/**
 * STARFORGED COMPANION — bug-audit probe (area: fact continuity / X-Card)
 * tests/probes/cont/xcardAfterNarrationCardDeleted.probe.js
 *
 * CONT — a narration whose chat card was deleted keeps its facts, and the
 * X-Card played next removes the narration before it instead.
 *
 * Beat 1: the narrator has Vex agree to the deal (a kept narration, nobody
 * objects). Beat 2: a player presses the prisoner; the narration burns his
 * hand with a torch. The GM deletes that card from the chat log (the first
 * thing a GM reaches for) and a player plays the X-Card.
 *
 * `suppressScene` (src/context/safety.js) removes what
 * `applyXCardToNarratorMemory` → `xCardedNarrationCards` picks, and that pick
 * reads chat cards only: the newest narrator card left is beat 1's, across
 * the player's line (the first walk passes a person's message over). So the
 * X-Card retracts beat 1's truths (blocked for the session), undoes its
 * capture and flags its card — while the torch narration's truths, state and
 * frame, which no card names any more, stay binding in every later prompt and
 * are archived as canon at scene end.
 *
 * Correct behaviour asserted here: the X-Card never takes a narration of an
 * earlier beat that is still on screen in place of the removed one, and the
 * deleted narration's ledger entries do not stay live.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { suppressScene } from '../../../src/context/safety.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

let vex;
beforeEach(() => {
  ChatMessage._reset();
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

/** A narration as the narrator makes one: the sidecar applied with its id, then its card. */
async function narrate(narrationId, prose, sidecar) {
  const text = applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``, stored(),
    { narrationId, matchedEntityIds: ['npc-vex'] });
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: `res-${narrationId}` }, stored(),
    { playerText: 'A line.', playerName: 'Kira', narrationId });
  await new Promise(r => setTimeout(r, 0));   // the chained sidecar persist lands
}
const someoneSpeaks = (content) => ChatMessage.create({ content, flags: {} });
const cardOf  = (narrationId) => ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.narrationId === narrationId);
const truthOf = (narrationId) => stored().sceneTruths.find(t => t.narrationId === narrationId);
/** The GM deletes a chat card: it leaves the chat log on every client. */
function deleteCard(narrationId) {
  const i = ChatMessage._created.findIndex(m => m.flags?.[MODULE_ID]?.narrationId === narrationId);
  ChatMessage._created.splice(i, 1);
}

async function twoBeats() {
  await someoneSpeaks('I offer Vex half the salvage for passage.');
  await narrate('nar-deal', 'Vex spits, then shakes on it.', DEAL);
  await someoneSpeaks('I press the prisoner for the code.');
  await narrate('nar-torch', 'Vex pins his wrist while the torch comes down.', TORCH);
}

describe('CONT — the X-Card after the GM deleted the narration\'s chat card', () => {
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

  it('with the torch card deleted first, the X-Card does not remove the deal narration, and the torch narration\'s facts do not stay binding', async () => {
    await twoBeats();
    deleteCard('nar-torch');
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardActive).toBe(true);

    // The kept, earlier beat is not what the table removed.
    expect.soft(cardOf('nar-deal').flags[MODULE_ID].xCarded, 'the deal narration\'s card').toBeUndefined();
    expect.soft(truthOf('nar-deal').retracted, 'the deal narration\'s truth is retracted').toBe(false);
    expect.soft(stored().xCardedNarrationIds ?? [], 'the narrations the X-Card removed').not.toContain('nar-deal');
    // What the deleted narration wrote does not go on binding the narrator.
    expect.soft(truthOf('nar-torch').retracted, 'the torch narration\'s truth is retracted').toBe(true);
    expect(stored().sceneFrame?.location ?? null, 'the scene frame after the X-Card').not.toBe('the interrogation cell');
  });
});
