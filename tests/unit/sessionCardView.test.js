/* global makeTestActor -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/sessionCardView.test.js — the `!recap session` card is a view of the session record (issue #382, slice 5)
 *
 * The card read the session's narrator cards in chat (narrator.js
 * postSessionRecap, `sessionNarratorCards(…, { forRecap: true })`) and found
 * session N by scanning them for its number (`recapSessionFor`): a cleared
 * chat log left it nothing, and what it counted was what the cards carried.
 * It reads the record now (record/sessionCardView.js): a line a move — who
 * rolled it, the move, its outcome — the counts, the match; the session found
 * by its `session.begun` number. The table's corrections reach it as they
 * reach every view of the record.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { postSessionRecap } from '../../src/narration/narrator.js';
import { sessionCardOf, sessionCardTarget, sessionCardMessage } from '../../src/record/sessionCardView.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { playedBeats, recordedEvent, seedLegacySessionPage, seedSessionRecord } from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';
const KIRA = { actor: 'pc-kira' };
const REN  = { actor: 'pc-ren' };

/** A rolled move as rollMove records it (`move.resolved`), its resolution `res`. */
const rolled = (s, res, moveId, outcome, { who = KIRA, match = false, round = null } = {}) =>
  recordedEvent(s, 'move.resolved', { who, ref: { res, ...(round ? { round } : {}) }, d: { moveId, outcome, isMatch: match, rollKind: 'action' } });
/** A narration as the card hook records it. */
const told = (s, nar, text, { res = null, mode = 'move', who = KIRA, upgradeOf = null } = {}) =>
  recordedEvent(s, 'narration', { who, ref: { nar, ...(res ? { res } : {}) }, d: { mode, ...(upgradeOf ? { upgradeOf } : {}) }, text });

/** What readRecord reads: the given pages, each a session's events. */
function source(sessions, { names = { 'pc-kira': 'Kira', 'pc-ren': 'Ren' }, current = null } = {}) {
  return {
    pages: sessions.map(([sessionId, number, events], i) => ({
      pageId: `p-${sessionId}`, sessionId, number, name: number ? `Session ${number}` : 'Session', createdAt: i + 1, story: '',
      record: events === null ? null : { v: 1, sessionId, createdAt: i + 1, seq: 0, events: Object.fromEntries(events.map(e => [e.id, e])), views: {} },
    })),
    currentSessionId: current ?? sessions.at(-1)?.[0] ?? null,
    nameOf: (id) => names[id] ?? null,
    otherNames: Object.values(names),
  };
}

const begun = (s, number) => recordedEvent(s, 'session.begun', { d: { number } });
const cardOf = (src, cs, ask = {}) => sessionCardMessage(sessionCardOf(sessionCardTarget(cs, ask, src), src));

describe('the card: a line a move, the counts, the match', () => {
  it('who rolled each move, the move by its title, its outcome; how many moves and strong hits; the match', () => {
    const src = source([['sess-3', 3, [
      begun('sess-3', 3),
      rolled('sess-3', 'r1', 'face_danger', 'strong_hit', { match: true }),
      rolled('sess-3', 'r2', 'face_danger_scene_challenge', 'miss', { who: REN }),
      rolled('sess-3', 'r3', 'strike', 'strong_hit'),
    ]]]);
    const { content, flags } = cardOf(src, { currentSessionId: 'sess-3', sessionNumber: 3 });
    expect(content).toContain('Session 3');
    expect(content).toContain('• Kira — Face Danger → Strong Hit<br>• Ren — Face Danger (Scene Challenge) → Miss<br>• Kira — Strike → Strong Hit');
    expect(content).toContain('3 moves resolved. 2 strong hits. A match was rolled — Face Danger.');
    expect(flags).toEqual({ recapCard: true, recapType: 'session', sessionId: 'sess-3', sessionNumber: 3 });
  });

  it('says nothing of a match when none was rolled; names each when several were', () => {
    const none = cardOf(source([['s', 1, [rolled('s', 'r1', 'clash', 'miss')]]]), { currentSessionId: 's', sessionNumber: 1 });
    expect(none.content).toContain('1 move resolved.');
    expect(none.content).not.toMatch(/match/i);
    const two = cardOf(source([['s', 1, [rolled('s', 'r1', 'clash', 'miss', { match: true }), rolled('s', 'r2', 'strike', 'weak_hit', { match: true })]]]),
      { currentSessionId: 's', sessionNumber: 1 });
    expect(two.content).toContain('2 matches were rolled — Clash, Strike.');
  });
});

describe('the table\'s corrections reach the card', () => {
  it('a burned move is one line, at its final outcome; the superseded telling and the re-narration are not on it', () => {
    const src = source([['s', 1, [
      rolled('s', 'r1', 'strike', 'miss'),
      told('s', 'n1', 'Your shot goes wide and the raider closes in.', { res: 'r1' }),
      recordedEvent('s', 'move.upgraded', { ref: { res: 'r1' }, d: { how: 'burn', from: 'miss', to: 'strong_hit' } }),
      recordedEvent('s', 'narration.removed', { ref: { res: 'r1' }, d: { narrationIds: ['n1'], by: 'superseded' } }),
      told('s', 'n2', 'You drop the raider with a clean shot.', { res: 'r1', upgradeOf: 'r1' }),
    ]]]);
    const { content } = cardOf(src, { currentSessionId: 's', sessionNumber: 1 });
    expect(content).toContain('• Kira — Strike → Strong Hit');
    expect(content).not.toContain('Strike → Miss');
    expect(content).toContain('1 move resolved. 1 strong hit.');
    expect(content).not.toMatch(/shot goes wide|clean shot/);
  });

  it('a move whose telling the X-Card removed still counts — it happened — and nothing of the telling is on the card', () => {
    const src = source([['s', 1, [
      rolled('s', 'r1', 'compel', 'miss'),
      told('s', 'n1', 'The interrogator lifts the cutting torch.', { res: 'r1' }),
      recordedEvent('s', 'narration.removed', { d: { narrationIds: ['n1'], by: 'xcard' } }),
    ]]]);
    const { content } = cardOf(src, { currentSessionId: 's', sessionNumber: 1 });
    expect(content).toContain('• Kira — Compel → Miss');
    expect(content).toContain('1 move resolved.');
    expect(content).not.toMatch(/torch|removed/);
  });

  it('a move whose narration failed is a move: its roll is on the record; a paced line, an @scene question and a vignette are not', () => {
    const src = source([['s', 1, [
      rolled('s', 'r1', 'face_danger', 'weak_hit'),                       // "narration unavailable": no narration recorded
      recordedEvent('s', 'line', { who: KIRA, d: { via: 'typed' }, text: 'I walk the corridor.' }),
      told('s', 'n2', 'The corridor smells of ozone.', { mode: 'paced' }),
      recordedEvent('s', 'question', { ref: { nar: 'n3' }, text: 'Is the hold dark?' }),
      told('s', 'n3', 'The hold is dark.', { mode: 'scene_answer' }),
      told('s', 'n4', 'The ship ticks as it cools.', { mode: 'vignette_open', who: {} }),
    ]]]);
    const { content } = cardOf(src, { currentSessionId: 's', sessionNumber: 1 });
    expect(content).toContain('• Kira — Face Danger → Weak Hit');
    expect(content).toContain('1 move resolved.');
    expect(content).not.toMatch(/corridor|ozone|hold|ticks/);
  });

  it('a Batch Mode round\'s moves are each a line, credited to their rollers', () => {
    const src = source([['s', 1, [
      rolled('s', 'r1', 'face_danger', 'weak_hit', { round: 'round-1' }),
      rolled('s', 'r2', 'strike', 'miss', { who: REN, round: 'round-1' }),
      recordedEvent('s', 'narration', { ref: { nar: 'n1', round: 'round-1' }, d: { mode: 'round' }, text: 'Kira slips through; Ren misses.' }),
    ]]]);
    const { content } = cardOf(src, { currentSessionId: 's', sessionNumber: 1 });
    expect(content).toContain('• Kira — Face Danger → Weak Hit<br>• Ren — Strike → Miss');
    expect(content).toContain('2 moves resolved.');
  });

  it('the roller is named as their sheet names them now, and every name is text', () => {
    const src = source([['s', 1, [rolled('s', 'r1', 'face_danger', 'strong_hit')]]], { names: { 'pc-kira': 'Kira <b>Vale</b> & Co' } });
    const { content } = cardOf(src, { currentSessionId: 's', sessionNumber: 1 });
    expect(content).toContain('• Kira &lt;b&gt;Vale&lt;/b&gt; &amp; Co — Face Danger → Strong Hit');
  });
});

describe('`!recap session N` — the session the record numbers N', () => {
  const src = () => source([
    ['sess-3', 3, [begun('sess-3', 3), rolled('sess-3', 'r1', 'face_danger', 'strong_hit')]],
    ['sess-4', 4, [begun('sess-4', 4), rolled('sess-4', 'r2', 'gather_information', 'weak_hit')]],
  ]);
  const cs = { currentSessionId: 'sess-4', sessionNumber: 4 };

  it('N names the session its `session.begun` numbers; the current session\'s number, and none, name the current session', () => {
    expect(sessionCardTarget(cs, { sessionNumber: 3 }, src())).toEqual({ sessionId: 'sess-3', number: 3, asked: 3 });
    expect(sessionCardTarget(cs, { sessionNumber: 4 }, src())).toEqual({ sessionId: 'sess-4', number: 4, asked: 4 });
    expect(sessionCardTarget(cs, {}, src())).toEqual({ sessionId: 'sess-4', number: 4, asked: null });
    const three = cardOf(src(), cs, { sessionNumber: 3 });
    expect(three.content).toContain('Session 3');
    expect(three.content).toContain('Face Danger');
    expect(three.content).not.toContain('Gather Information');
    expect(three.flags).toMatchObject({ sessionId: 'sess-3', sessionNumber: 3 });
  });

  it('a number no session has says so, by its number — never another session\'s moves', () => {
    const nine = cardOf(src(), cs, { sessionNumber: 9 });
    expect(nine.flags).toMatchObject({ recapEmpty: true, sessionNumber: 9 });
    expect(nine.content).toContain('No moves are recorded for session 9.');
    expect(nine.content).not.toMatch(/Face Danger|Gather Information/);
  });

  it('a session played before the record says its moves are not recorded', () => {
    const legacy = source([['sess-1', 1, null], ['sess-2', 2, [begun('sess-2', 2)]]]);
    const one = cardOf(legacy, { currentSessionId: 'sess-2', sessionNumber: 2 }, { sessionNumber: 1 });
    expect(one.flags).toMatchObject({ recapEmpty: true, sessionNumber: 1, sessionId: 'sess-1' });
    expect(one.content).toContain('Session 1 was played before the session record was kept: its moves are not recorded.');
  });
});

describe('postSessionRecap posts the card from the record', () => {
  let journals;
  beforeEach(() => {
    journals = installJournalMock();
    ChatMessage._reset();
    game.settings._store.clear();
    game.actors._reset();
    game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira' }));
    global.game.messages = { contents: [] };
  });
  afterEach(() => { journals.restore(); game.actors._reset(); });

  it('survives a cleared chat log: no card in chat, the session\'s moves on its card', async () => {
    await seedSessionRecord('sess-3', [
      ...playedBeats('sess-3', ['I slip past the guards.'], { actor: 'pc-kira', number: 3 }),
      rolled('sess-3', 'r1', 'face_danger', 'strong_hit', { match: true }),
    ], { number: 3 });
    const cs = { currentSessionId: 'sess-3', sessionNumber: 3 };
    game.settings._store.set(`${MODULE_ID}.campaignState`, cs);

    const card = await postSessionRecap(cs);
    expect(game.messages.contents).toEqual([]);                     // the chat holds nothing
    expect(card.flags[MODULE_ID]).toMatchObject({ recapCard: true, recapType: 'session', sessionId: 'sess-3', sessionNumber: 3 });
    expect(card.content).toContain('• Kira — Face Danger → Strong Hit');
    expect(card.content).toContain('A match was rolled — Face Danger.');
    expect(card.content).not.toContain('I slip past the guards');   // the player's words are the Session Log's to show
  });

  it('a session from before the record, asked for by its number', async () => {
    await seedLegacySessionPage('sess-1', 'The crew reached Bleakhold.', { number: 1 });
    const cs = { currentSessionId: 'sess-2', sessionNumber: 2 };
    const card = await postSessionRecap(cs, null, { sessionNumber: 1 });
    expect(card.flags[MODULE_ID]).toMatchObject({ recapEmpty: true, sessionNumber: 1 });
    expect(card.content).toContain('played before the session record was kept');
  });
});
