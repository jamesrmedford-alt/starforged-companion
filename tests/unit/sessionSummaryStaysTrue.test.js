/**
 * STARFORGED COMPANION
 * tests/unit/sessionSummaryStaysTrue.test.js
 *
 * The session summary is a view of the session record (issue #382 slice 3,
 * record/summaryView.js): valid while the span it was made from reads the
 * same, behind when the record holds more, stale once a correction reaches
 * it. That one rule replaces the per-store drops, marks, checks and catch-ups
 * a dozen playtest findings each added to the summary kept in campaignState.
 * Each finding's own case is here, through the real writers — the record's
 * removal (`recordNarrationsRemoved`), the summary's maker
 * (`getRollingSessionSummary`), the catch-up of an earlier session
 * (`refreshStaleSummaries`), the GM's store of a relayed summary
 * (`applyRelayedSessionSummary`), LAST SESSION's one accessor
 * (`lastSessionToTell`) and the Session Log page's render:
 *
 *   - a beat narrated into a session after it closed — a Batch Mode round End
 *     let finish, a narration landing after End's refresh, or one while no
 *     keyed GM could make the summary (issue #345 AA21, issue #364
 *     LATE-ROUND-NOT-IN-LAST-SESSION / -NOT-IN-SESSION-LOG-STORY /
 *     -NO-LAST-SESSION-RECORD / -KEYLESS-GM, issue #347 AB15,
 *     LAST-SESSION-OWED-LOST-AT-MINT): the summary is behind, and the keyed
 *     canonical GM makes it again; LAST SESSION and the page then tell it;
 *   - an X-Card after End, paused at the mint or not (issue #342 Z41, issue
 *     #345 AA27 / AA57, issue #325 W06): the summary that told the removed beat
 *     is stale — not shown — and made again from what remains; a reply made
 *     while the X-Card landed is never stored (AA25);
 *   - an upgrade's supersede (issue #345 AA24): the same, for the replaced telling;
 *   - a session nobody began never replaces LAST SESSION (issue #331 X65,
 *     EMPTIED-LAST-SESSION-PREP-ONLY-MINT): what it played comes after, as facts;
 *   - a table whose GMs hold no key (SUMMARY-KEYLESS-GM): a keyed player's
 *     summary is stored only while the GM's own read of its span agrees;
 *   - the catch-up's one-at-a-time memo is released however its body ends
 *     (CATCHUP-MEMOISED-SETTLED-PROMISE), and a write the server never answers
 *     wedges nothing (issue #347 AB05).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getRollingSessionSummary, refreshStaleSummaries, applyRelayedSessionSummary,
} from '../../src/narration/narrator.js';
import { lastSessionToTell } from '../../src/session/lifecycle.js';
import { recordNarrationsRemoved, recordSettled, _resetRecordForTests } from '../../src/record/record.js';
import { renderSessionLog } from '../../src/record/sessionLogView.js';
import { summaryState, summarySourceThrough, _resetSummaryViewForTests } from '../../src/record/summaryView.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import {
  seedSessionRecord, playedBeats, recordedEvent, storedSummaryOf, sessionPageOf, citedSummaryReply,
} from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

let journals;
let answers;
let calls;
/** Claude answers the summary's calls with the cited sentences queued, each once; the last given repeats. */
function stubClaude() {
  calls = [];
  answers = [];
  let last = ['A summary.'];
  global.fetch = vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (answers.length) last = answers.shift();
    const next = last;
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: citedSummaryReply(next) }] }), text: async () => '' };
  });
}
const answer = (...replies) => { answers.push(...replies); };
const userOf = (call) => call.messages.at(-1).content;

/** Session 3 played, ended and summarised; session 4 is current. */
async function sessionThreeClosed() {
  await seedSessionRecord('s3', playedBeats('s3', ['I pay Vex for the beacon code.', 'I sign the berth papers.'], { number: 3 }), { number: 3, createdAt: 1000 });
  game.settings._store.set(KEY, { currentSessionId: 's3', sessionNumber: 3, sessionStartedId: 's3' });
  answer(['Kira paid Vex for the beacon code and took a berth.']);
  await getRollingSessionSummary({ currentSessionId: 's3' }, { forceRefresh: true });   // End a Session's
  game.settings._store.set(KEY, { currentSessionId: 's4', sessionNumber: 4, sessionStartedId: null });
  _resetSummaryViewForTests();
}

/** A narration recorded into a session's page as the record writes it. */
function appendToRecord(sessionId, events) {
  const rec = sessionPageOf(sessionId).flags[MODULE_ID].sessionRecord;
  for (const e of events) rec.events[e.id] = e;
  rec.seq = Math.max(rec.seq, ...events.map(e => e.seq));
  _resetSummaryViewForTests();
}

beforeEach(() => {
  journals = installJournalMock();
  _resetSummaryViewForTests();
  _resetRecordForTests();
  game.user = { isGM: true, id: 'test-user-gm' };
  game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
  game.settings._store.set(`${MODULE_ID}.narratorContextCards`, 3);
  stubClaude();
});
afterEach(() => {
  journals.restore();
  game.settings._store.delete(KEY);
  game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
  game.settings._store.delete(`${MODULE_ID}.narratorContextCards`);
  vi.restoreAllMocks();
});

describe('a beat narrated into a session after it closed reaches LAST SESSION', () => {
  it('the summary is behind; the keyed canonical GM makes it again — LAST SESSION and the Session Log page tell it', async () => {
    await sessionThreeClosed();
    expect(lastSessionToTell(game.settings.get(MODULE_ID, 'campaignState'))).toMatchObject({ sessionId: 's3', sessionNumber: 3,
      text: 'Kira paid Vex for the beacon code and took a berth.' });

    // A Batch Mode round End let finish is narrated into session 3 after it closed.
    appendToRecord('s3', playedBeats('s3', [{ said: 'I cut the docking clamps.', told: 'The clamps part; the Wake drifts free.' }], { begun: false }));
    expect(summaryState('s3')).toMatchObject({ valid: true, behind: true });

    answer(['Kira paid Vex, took a berth, and cut the docking clamps.']);
    expect(await refreshStaleSummaries()).toBe(1);
    expect(userOf(calls.at(-1))).toContain('I cut the docking clamps.');
    _resetSummaryViewForTests();
    expect(lastSessionToTell(game.settings.get(MODULE_ID, 'campaignState')).text).toBe('Kira paid Vex, took a berth, and cut the docking clamps.');

    await recordSettled();
    await renderSessionLog('s3');
    expect(sessionPageOf('s3').text.content).toContain('cut the docking clamps.</p>');
  });

  it('with no key, nothing is made and nothing is marked — the summary that stands is told; a keyed GM makes it later', async () => {
    await sessionThreeClosed();
    appendToRecord('s3', playedBeats('s3', ['I cut the docking clamps.'], { begun: false }));
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
    const before = calls.length;
    expect(await refreshStaleSummaries()).toBe(0);
    expect(calls).toHaveLength(before);
    expect(lastSessionToTell(game.settings.get(MODULE_ID, 'campaignState')).text).toBe('Kira paid Vex for the beacon code and took a berth.');
    expect(game.settings.get(MODULE_ID, 'campaignState')).not.toHaveProperty('unsummarisedSession');

    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');   // a keyed GM, later
    answer(['Kira paid Vex and cut the docking clamps.']);
    expect(await refreshStaleSummaries()).toBe(1);
  });

  it('a session closed on a browser with no key at all has no summary yet — the next keyed GM makes it', async () => {
    await seedSessionRecord('s3', playedBeats('s3', ['I pay Vex.'], { number: 3 }), { number: 3, createdAt: 1000 });
    game.settings._store.set(KEY, { currentSessionId: 's4', sessionNumber: 4 });
    expect(lastSessionToTell(game.settings.get(MODULE_ID, 'campaignState'))).toBeNull();
    answer(['Kira paid Vex.']);
    expect(await refreshStaleSummaries()).toBe(1);
    _resetSummaryViewForTests();
    expect(lastSessionToTell(game.settings.get(MODULE_ID, 'campaignState'))).toMatchObject({ sessionId: 's3', text: 'Kira paid Vex.' });
  });
});

describe('an X-Card after End takes its beat out of LAST SESSION and the Session Log page', () => {
  it('the summary that told it is stale — not told — and is made again from what remains', async () => {
    await sessionThreeClosed();
    await recordNarrationsRemoved(['nar-s3-2'], { session: 's3' });
    await recordSettled();
    _resetSummaryViewForTests();
    expect(summaryState('s3').valid).toBe(false);
    expect(lastSessionToTell(game.settings.get(MODULE_ID, 'campaignState'))).toBeNull();
    await renderSessionLog('s3');
    expect(sessionPageOf('s3').text.content).not.toContain('took a berth');

    answer(['Kira paid Vex for the beacon code.']);
    expect(await refreshStaleSummaries()).toBe(1);
    expect(userOf(calls.at(-1))).not.toContain('The narrator tells it: I sign the berth papers.');
    _resetSummaryViewForTests();
    expect(lastSessionToTell(game.settings.get(MODULE_ID, 'campaignState')).text).toBe('Kira paid Vex for the beacon code.');
  });

  it('a reply made while the X-Card landed is never stored (issue #345 AA25)', async () => {
    await seedSessionRecord('s3', playedBeats('s3', ['Beat 1.', 'Beat 2.', 'Beat 3.', 'Beat 4.', 'Beat 5.'], { number: 3 }), { number: 3 });
    game.settings._store.set(KEY, { currentSessionId: 's3', sessionNumber: 3, sessionStartedId: 's3' });
    global.fetch = vi.fn(async () => {
      await recordNarrationsRemoved(['nar-s3-5'], { session: 's3' });
      await recordSettled();
      _resetSummaryViewForTests();
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: citedSummaryReply(['It told beat five.']) }] }), text: async () => '' };
    });
    expect(await getRollingSessionSummary({ currentSessionId: 's3' })).toBe('');
    expect(storedSummaryOf('s3')).toBeNull();
  });
});

describe('an upgrade\'s supersede takes the replaced telling out of the summary (issue #345 AA24)', () => {
  it('the summary that told the replaced outcome is stale; the next one tells the re-narration', async () => {
    const res = { ref: { res: 'r1' } };
    await seedSessionRecord('s3', [
      recordedEvent('s3', 'session.begun', { d: { number: 3 } }),
      recordedEvent('s3', 'line', { who: { actor: 'pc-kira' }, ref: { line: 'm1' }, d: { via: 'typed' }, text: 'I strike at the raider.' }),
      recordedEvent('s3', 'move.resolved', { who: { actor: 'pc-kira' }, ...res, d: { moveId: 'strike', moveName: 'Strike', outcome: 'miss' } }),
      recordedEvent('s3', 'narration', { who: { actor: 'pc-kira' }, ref: { nar: 'n-miss', res: 'r1' }, d: { mode: 'move' }, text: 'Your blow goes wide.' }),
      ...playedBeats('s3', ['Beat 2.', 'Beat 3.', 'Beat 4.', 'Beat 5.'], { begun: false }),
    ], { number: 3 });
    game.settings._store.set(KEY, { currentSessionId: 's3', sessionNumber: 3, sessionStartedId: 's3' });
    answer(['Kira\'s blow went wide.']);
    await getRollingSessionSummary({ currentSessionId: 's3' });
    _resetSummaryViewForTests();
    expect(summaryState('s3').valid).toBe(true);

    // Burn Momentum: a strong hit, and its re-narration; the miss's telling superseded.
    appendToRecord('s3', [
      recordedEvent('s3', 'move.upgraded', { ...res, d: { from: 'miss', to: 'strong_hit', how: 'burn' } }),
      recordedEvent('s3', 'narration.removed', { ...res, d: { narrationIds: ['n-miss'], by: 'superseded' } }),
      recordedEvent('s3', 'narration', { ref: { nar: 'n-hit', res: 'r1' }, d: { mode: 'move', upgradeOf: 'r1' }, text: 'Your blade bites deep.' }),
    ]);
    expect(summaryState('s3').valid).toBe(false);
    answer(['Kira\'s blade bit deep.']);
    expect(await getRollingSessionSummary({ currentSessionId: 's3' })).toBe('Kira\'s blade bit deep.');
    expect(userOf(calls.at(-1))).toContain('Your blade bites deep.');
    expect(userOf(calls.at(-1))).not.toContain('Your blow goes wide.');
  });
});

describe('a session nobody began never replaces LAST SESSION (issue #331 X65)', () => {
  it('what it played is told after the last begun session\'s summary, as facts — and no summary is made for it', async () => {
    await sessionThreeClosed();
    await seedSessionRecord('prep', playedBeats('prep', ['I ask the oracle where the Wake went.'], { begun: false, number: null }), { number: null, createdAt: 2000 });
    game.settings._store.set(KEY, { currentSessionId: 's4', sessionNumber: 4 });
    _resetSummaryViewForTests();
    const last = lastSessionToTell(game.settings.get(MODULE_ID, 'campaignState'));
    expect(last).toMatchObject({ sessionId: 's3', sessionNumber: 3 });
    expect(last.text).toMatch(/^Kira paid Vex for the beacon code and took a berth\.\n\nPlayed between sessions, while no session was begun: /);
    expect(last.text).toContain('I ask the oracle where the Wake went.');
    const before = calls.length;
    expect(await refreshStaleSummaries()).toBe(0);
    expect(calls).toHaveLength(before);
  });
});

describe('a table whose GMs hold no key (SUMMARY-KEYLESS-GM)', () => {
  it('a keyed player\'s summary is stored while the GM\'s read of its span agrees — and refused once a correction landed', async () => {
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);   // the GM's own browser
    await seedSessionRecord('s3', playedBeats('s3', ['Beat 1.', 'Beat 2.'], { number: 3 }), { number: 3 });
    game.settings._store.set(KEY, { currentSessionId: 's3', sessionNumber: 3, sessionStartedId: 's3' });
    const span = summaryState('s3').source;
    const relayed = { sessionId: 's3', text: 'Kira did two things.', cites: [['1', '2']], through: span.through, sourceHash: span.hash };
    expect(await applyRelayedSessionSummary(relayed)).toEqual({ stored: true });
    expect(storedSummaryOf('s3')).toMatchObject({ text: 'Kira did two things.', through: span.through, sourceHash: span.hash });

    await recordNarrationsRemoved(['nar-s3-1'], { session: 's3' });
    await recordSettled();
    _resetSummaryViewForTests();
    expect(summarySourceThrough('s3', span.through).hash).not.toBe(span.hash);
    expect(await applyRelayedSessionSummary({ ...relayed, text: 'Again.' })).toEqual({ stored: false, reason: 'stale' });
    expect(await applyRelayedSessionSummary({ sessionId: 's3', text: 'x', through: 'no', sourceHash: 'zz' })).toMatchObject({ stored: false, reason: 'malformed' });
  });

  it('a GM with a key of its own makes its own and ignores a relayed one', async () => {
    await seedSessionRecord('s3', playedBeats('s3', ['Beat 1.'], { number: 3 }), { number: 3 });
    expect(await applyRelayedSessionSummary({ sessionId: 's3', text: 'x', through: 1, sourceHash: '00000000' })).toEqual({ stored: false, reason: 'keyed-gm' });
  });
});

describe('the catch-up wedges nothing', () => {
  it('its one-at-a-time memo is released however its body ends (CATCHUP-MEMOISED-SETTLED-PROMISE)', async () => {
    await seedSessionRecord('s3', playedBeats('s3', ['I pay Vex.'], { number: 3 }), { number: 3 });
    game.settings._store.set(KEY, { currentSessionId: 's4', sessionNumber: 4 });
    global.fetch = vi.fn(async () => { throw new Error('the API is down'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await refreshStaleSummaries()).toBe(0);
    stubClaude();
    answer(['Kira paid Vex.']);
    expect(await refreshStaleSummaries()).toBe(1);
  });

  it('a summary write the server never answers is given up after its bound (issue #347 AB05)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await seedSessionRecord('s3', playedBeats('s3', ['Beat 1.', 'Beat 2.'], { number: 3 }), { number: 3 });
      game.settings._store.set(KEY, { currentSessionId: 's3', sessionNumber: 3, sessionStartedId: 's3' });
      const page = sessionPageOf('s3');
      page.update = () => new Promise(() => {});   // never answered
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      answer(['Kira did two things.']);
      const made = getRollingSessionSummary({ currentSessionId: 's3' }, { forceRefresh: true });
      await vi.advanceTimersByTimeAsync(31_000);
      await expect(made).resolves.toBe('Kira did two things.');
    } finally {
      vi.useRealTimers();
    }
  });
});
