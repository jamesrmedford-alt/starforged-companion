/**
 * STARFORGED COMPANION
 * tests/unit/beatShapeAfterDeletedCard.test.js
 *
 * Issue #364 BEAT-SHAPE-AFTER-DELETED-CARD. Each beat (a move, a paced line,
 * a round) is given one of five shapes "by its place in the session, so two
 * in a row never share one" (issue #354 P2-27). The place was the count of
 * the session's beat cards in chat (issue #362 AC72), so a GM who deleted an
 * earlier beat's card took the count back one and the next beat was given
 * the shape of the beat before it; a Clear Chat Log started the cycle over,
 * which is the last beat's shape again after every fifth beat.
 *
 * Each beat's card now carries the shape it was written in (`beatShape`),
 * and the next beat takes the one after the newest written beat's — read
 * from the chat as it was (a deleted card is still the beat before), on this
 * page and, for the canonical GM's stored record, after a reload.
 *
 * Production path: the real narratePacedInput / narrateResolution /
 * narrateRound build the prompt (buildNarratorExtras → beatVariety), call the
 * (mocked) API and post the beat's card; the shape is read off the prompt
 * the API was sent.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const sent = [];
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const model = String(body?.model ?? '');
    if (model.includes('haiku')) return { content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
    sent.push(JSON.stringify(body?.system ?? ''));
    const text = 'The deck hums underfoot.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
  }),
}));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import {
  narratePacedInput, narrateResolution, narrateRound, registerDeletedChatHook, _resetDeletedMessagesForTests,
} from '../../src/narration/narrator.js';
import { BEAT_SHAPES } from '../../src/narration/proseVariety.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const state = () => game.settings.get(MODULE_ID, 'campaignState');
const flagsOf = (m) => m?.flags?.[MODULE_ID] ?? {};

/** The shape the newest narration request was told to use, by its hint in the prompt. */
function shapeLastSent() {
  const system = sent[sent.length - 1] ?? '';
  const shape = BEAT_SHAPES.find(s => system.includes(JSON.stringify(`How this narration is built: ${s.hint}`).slice(1, -1)));
  expect(shape, 'the request names a shape').toBeTruthy();
  return shape.id;
}

let clock = Date.UTC(2026, 10, 19, 20, 0, 0);
const tick = () => { clock += 1000; vi.setSystemTime(clock); };

/** A paced line narrated for real: its request's shape, and the card it posted. */
async function pacedBeat(line = 'I wait by the airlock.') {
  tick();
  const before = ChatMessage._created.length;
  await narratePacedInput(line, state(), {});
  const card = ChatMessage._created.slice(before).find(m => flagsOf(m).pacedNarrative);
  expect(card, 'the paced card posted').toBeTruthy();
  return { shape: shapeLastSent(), card };
}

/** The GM deletes a chat message: it leaves the log, and every client's deleteChatMessage hook fires. */
function deleteMessage(message) {
  const i = ChatMessage._created.indexOf(message);
  if (i >= 0) ChatMessage._created.splice(i, 1);
  Hooks.call('deleteChatMessage', message, {}, 'gm-1');
}

beforeAll(() => { registerDeletedChatHook(); });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  sent.length = 0;
  ChatMessage._reset();
  _resetDeletedMessagesForTests();
  game.actors._reset();
  // The chat log is the cards the narrator posted.
  global.game.messages = { get contents() { return ChatMessage._created; } };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  const store = game.settings._store;
  store.clear();
  store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  store.set(`${MODULE_ID}.worldSnapshot`, false);
  store.set(KEY, {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
    currentSceneId: 'sc-1', sceneTruths: [],
  });
  game.actors._set('a-actor', makeTestActor({ id: 'a-actor', name: 'Isaac Sutton' }));
});

describe('issue #364 BEAT-SHAPE-AFTER-DELETED-CARD — a beat follows the one before it, whatever left chat', () => {
  it('each beat\'s card carries the shape its narration was told to use', async () => {
    silenceConsoleErrors();
    const first = await pacedBeat();
    expect(flagsOf(first.card).beatShape).toBe(first.shape);
    const second = await pacedBeat();
    expect(flagsOf(second.card).beatShape).toBe(second.shape);
    expect(second.shape).not.toBe(first.shape);
  });

  it('a GM deletes an earlier beat\'s card: the next beat is still shaped differently from the last one', async () => {
    silenceConsoleErrors();
    const a = await pacedBeat('I check the seals.');
    await pacedBeat('I wait.');
    const c = await pacedBeat('I listen at the hatch.');
    deleteMessage(a.card);
    const d = await pacedBeat('I open it.');
    expect(d.shape).not.toBe(c.shape);   // was C's shape again: the count went back one
  });

  it('a Clear Chat Log after the sixth beat: the next beat does not repeat the sixth\'s shape', async () => {
    silenceConsoleErrors();
    let last = null;
    for (let i = 0; i < 6; i += 1) last = await pacedBeat(`Beat ${i}.`);
    for (const m of [...ChatMessage._created]) deleteMessage(m);
    expect(ChatMessage._created).toHaveLength(0);
    const next = await pacedBeat('And on.');
    expect(next.shape).not.toBe(last.shape);   // was the cycle's first shape — the sixth beat's
  });

  it('the newest beat\'s card is deleted and the page reloads: the next beat still follows the deleted one', async () => {
    silenceConsoleErrors();
    await pacedBeat('I check the seals.');
    const b = await pacedBeat('I wait.');
    deleteMessage(b.card);
    await vi.waitFor(() => expect(state().deletedChatMessages?.some(d => d.id === b.card.id)).toBe(true));
    expect(state().deletedChatMessages.find(d => d.id === b.card.id).flags[MODULE_ID].beatShape).toBe(b.shape);
    _resetDeletedMessagesForTests();   // a reload: the page's own record is gone, campaignState's is kept
    const c = await pacedBeat('I go on.');
    expect(c.shape).not.toBe(b.shape);
  });

  it('a "narration unavailable" card carries no shape, and the beat after it follows the last one written', async () => {
    silenceConsoleErrors();
    const a = await pacedBeat('I check the seals.');
    // A move whose narration fails: its fallback card is a beat card with no shape.
    const { apiPost } = await import('../../src/api-proxy.js');
    apiPost.mockImplementationOnce(async () => { throw new Error('boom'); });
    tick();
    await narrateResolution({ _id: 'res-1', moveId: 'face_danger', moveName: 'Face Danger', outcome: 'miss', outcomeLabel: 'Miss', playerNarration: 'I jump.' }, state(), {});
    const fallback = ChatMessage._created.find(m => flagsOf(m).narrationFallback);
    expect(fallback, 'the fallback card posted').toBeTruthy();
    expect(flagsOf(fallback).beatShape).toBeUndefined();
    const c = await pacedBeat('I go on.');
    expect(c.shape).not.toBe(a.shape);
  });

  it('a move\'s narration card and a round\'s card carry their shape too', async () => {
    silenceConsoleErrors();
    tick();
    await narrateResolution({ _id: 'res-2', moveId: 'face_danger', moveName: 'Face Danger', outcome: 'weak_hit', outcomeLabel: 'Weak hit', playerNarration: 'I jump.' }, state(), {});
    const move = ChatMessage._created.find(m => flagsOf(m).resolutionId === 'res-2' && !flagsOf(m).narrationFallback);
    expect(move, 'the move narration card posted').toBeTruthy();
    const moveShape = shapeLastSent();
    expect(flagsOf(move).beatShape).toBe(moveShape);

    tick();
    const round = {
      id: 'round-1', number: 1, sessionId: 'sess-1', acting: ['gm-1'],
      entries: { 'gm-1': { userId: 'gm-1', actorId: 'a-actor', actorName: 'Isaac Sutton', userName: 'GM', text: 'I hold the line.' } },
    };
    const result = await narrateRound({ round, campaignState: state() });
    expect(result?.posted, 'the round was narrated').toBe('card');
    const roundCard = ChatMessage._created.find(m => flagsOf(m).roundId === 'round-1');
    const roundShape = shapeLastSent();
    expect(flagsOf(roundCard).beatShape).toBe(roundShape);
    expect(roundShape).not.toBe(moveShape);
  });

  it('control: a session whose cards carry no shape (written before they did) is still shaped by its beat count', async () => {
    silenceConsoleErrors();
    const first = await pacedBeat();
    ChatMessage._reset();
    _resetDeletedMessagesForTests();
    const legacy = (text) => ({ timestamp: clock, flags: { [MODULE_ID]: { narratorCard: true, narrationCard: true, pacedNarrative: true, sessionId: 'sess-1', narrationText: text } } });
    // No beat cards: the cycle's first shape, as `first` was.
    expect((await pacedBeat()).shape).toBe(first.shape);
    ChatMessage._reset();
    ChatMessage._created.push(legacy('Beat zero.'));
    expect((await pacedBeat()).shape).not.toBe(first.shape);
  });
});
