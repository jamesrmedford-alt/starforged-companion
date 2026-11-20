/**
 * STARFORGED COMPANION
 * tests/unit/emptyLastSessionGivesWayWhenNothingComes.test.js
 *
 * Issue #364 LATE-ROUND-NO-LAST-SESSION-RECORD — the mint's side.
 *
 * A begun session with no summary of its own whose Batch Mode round is still
 * to be narrated is recorded at the mint as LAST SESSION's session with no
 * text, the record LAST SESSION told kept behind it (`displaced`), and marked
 * owed (`unsummarisedSession`), so the round's late narration has a record to
 * build into. Nothing is made up, and the empty record never displaces a real
 * older LAST SESSION when nothing comes: the older one is what the narrator is
 * told meanwhile (lastSessionToTell), and a later mint that finds nothing more
 * to come — the round closed unnarrated, nothing owed — puts it back before it
 * carries the closing session's summary (lastSessionSettled). A record still
 * owed — a keyless GM's catch-up never ran — stays, still owed.
 *
 * The lifecycle unit harness of tests/unit/lastSessionOwedSurvivesNextMint.test.js.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mintSession, rollSessionIfDue, lastSessionToTell } from '../../src/session/lifecycle.js';
import { collectWorldUnits } from '../../src/narration/worldSnapshot.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const T0 = Date.parse('2026-11-20T12:00:00.000Z');
const HOUR = 3_600_000;
const OLDER = { sessionId: 'sess-0', sessionNumber: 3, text: 'Summary: older.', updatedAt: '2026-11-01T00:00:00.000Z' };
const FOLD = 'Narrated between sessions, while no session was begun: The crew drilled in the hold.';
/** The mint's record of session 4, whose round was left to be narrated. */
const RECORDED = { sessionId: 'sess-1', sessionNumber: 4, text: '', updatedAt: null, displaced: OLDER };
const roundOf = (sessionId, phase) => ({ id: 'round-1', number: 2, phase, sessionId, entries: {} });
const setRound = (round) => game.settings._store.set(`${MODULE_ID}.batchMode.round`, round);

/** Session 4, begun and ended, nothing of it narrated. */
const session4Ended = (extra = {}) => ({
  currentSessionId: 'sess-1', sessionNumber: 4, sessionStartedId: 'sess-1', sessionActive: false, sessionEndedId: 'sess-1',
  previousSessionSummary: OLDER, unsummarisedSession: null, sessionSummary: null, ...extra,
});
/** Session 5 — minted over session 4 with the mint's record — begun and ended. */
const session5Ended = (extra = {}) => ({
  currentSessionId: 'sess-2', sessionNumber: 5, sessionStartedId: 'sess-2', sessionActive: false, sessionEndedId: 'sess-2',
  previousSessionSummary: RECORDED, unsummarisedSession: null, sessionSummary: null, ...extra,
});
/** Session 5 nobody began: the world was opened to prepare, four hours ago and more. */
const session5Unbegun = (extra = {}) => session5Ended({ sessionStartedId: 'sess-1', sessionEndedId: null,
  lastSessionTimestamp: new Date(T0 - 6 * HOUR).toISOString(), ...extra });

let journals;
beforeEach(() => {
  journals = installJournalMock();
  ChatMessage._reset();
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
});
afterEach(() => { journals.restore(); });

describe('issue #364 LATE-ROUND-NO-LAST-SESSION-RECORD — the mint records a session whose round is still to be narrated', () => {
  it('a begun session with no summary of its own: recorded with no text, the older record behind it, and owed', async () => {
    setRound(roundOf('sess-1', 'upgrading'));
    const cs = session4Ended();

    expect(await rollSessionIfDue(cs, { now: T0 })).toBe(true);

    expect(cs.previousSessionSummary).toEqual(RECORDED);
    expect(cs.unsummarisedSession).toEqual({ sessionId: 'sess-1', sessionNumber: 4 });
    expect(cs.sessionNumber).toBe(5);
    expect(lastSessionToTell(cs.previousSessionSummary), 'the older record is told meanwhile').toEqual(OLDER);
  });

  it('the world snapshot tells the older record meanwhile too, as the per-beat LAST SESSION block does', () => {
    const memory = collectWorldUnits({ currentSessionId: 'sess-2', sessionNumber: 5, previousSessionSummary: RECORDED }, {})
      .filter(u => u.section === 'memory');
    expect(memory.map(u => u.text)).toEqual(['- Session 3: Summary: older.']);
  });

  it('controls: no round of it waiting, a round already closed, a summary of its own, a session nobody began — as before', () => {
    expect(mintSession(session4Ended(), T0).previousSessionSummary, 'no round waiting').toEqual(OLDER);
    const own = mintSession(session4Ended({ sessionSummary: { sessionId: 'sess-1', text: 'Summary: earlier.', updatedAt: null } }),
      T0, { roundUnnarrated: true });
    expect(own.previousSessionSummary, 'its own summary').toEqual({ sessionId: 'sess-1', sessionNumber: 4, text: 'Summary: earlier.', updatedAt: null });
    const unbegun = mintSession(session4Ended({ sessionStartedId: 'sess-0', sessionEndedId: null }), T0, { roundUnnarrated: true });
    expect(unbegun.previousSessionSummary, 'nobody began it').toEqual(OLDER);
  });

  it('a round of it already closed is nothing to wait for: no record, nothing owed', async () => {
    setRound(roundOf('sess-1', 'closed'));
    const cs = session4Ended();

    expect(await rollSessionIfDue(cs, { now: T0 })).toBe(true);

    expect(cs.previousSessionSummary).toEqual(OLDER);
    expect(cs.unsummarisedSession ?? null).toBeNull();
  });
});

describe('issue #364 LATE-ROUND-NO-LAST-SESSION-RECORD — the next mint, when nothing came', () => {
  it('the closing session brings nothing: LAST SESSION is the older record again', async () => {
    setRound(roundOf('sess-1', 'closed'));
    const cs = session5Ended();

    expect(await rollSessionIfDue(cs, { now: T0 })).toBe(true);

    expect(cs.previousSessionSummary).toEqual(OLDER);
    expect(cs.unsummarisedSession ?? null).toBeNull();
  });

  it('a closing session nobody began folds its summary onto the older record, as it would have', async () => {
    setRound(roundOf('sess-1', 'closed'));
    const cs = session5Unbegun({ sessionSummary: { sessionId: 'sess-2', text: 'The crew drilled in the hold.', updatedAt: null } });

    expect(await rollSessionIfDue(cs, { now: T0 })).toBe(true);

    expect(cs.previousSessionSummary).toEqual({ ...OLDER, text: `Summary: older.\n\n${FOLD}` });
    expect(cs.sessionNumber, 'its number passes on').toBe(5);
  });

  it('a begun closing session with a summary of its own replaces it, as any mint does', async () => {
    setRound(roundOf('sess-1', 'closed'));
    const cs = session5Ended({ sessionSummary: { sessionId: 'sess-2', text: 'Summary: session five.', updatedAt: null } });

    expect(await rollSessionIfDue(cs, { now: T0 })).toBe(true);

    expect(cs.previousSessionSummary).toEqual({ sessionId: 'sess-2', sessionNumber: 5, text: 'Summary: session five.', updatedAt: null });
  });

  it('with no older record behind it, nothing is left: LAST SESSION none', async () => {
    setRound(roundOf('sess-1', 'closed'));
    const cs = session5Ended({ previousSessionSummary: { ...RECORDED, displaced: null } });

    expect(await rollSessionIfDue(cs, { now: T0 })).toBe(true);

    expect(cs.previousSessionSummary ?? null).toBeNull();
  });

  it('a record still owed — its round still waits, or a keyless GM never caught it up — stays, still owed', async () => {
    setRound(roundOf('sess-1', 'upgrading'));
    const waiting = session5Ended();
    expect(await rollSessionIfDue(waiting, { now: T0 })).toBe(true);
    expect(waiting.previousSessionSummary, 'its round still waits').toEqual(RECORDED);

    setRound(roundOf('sess-1', 'closed'));
    const marked = session5Ended({ unsummarisedSession: { sessionId: 'sess-1', sessionNumber: 4 } });
    expect(await rollSessionIfDue(marked, { now: T0 })).toBe(true);
    expect(marked.previousSessionSummary, 'owed by its mark').toEqual(RECORDED);
    expect(marked.unsummarisedSession).toEqual({ sessionId: 'sess-1', sessionNumber: 4 });
    expect(lastSessionToTell(marked.previousSessionSummary), 'the older record is still what is told').toEqual(OLDER);
  });
});
