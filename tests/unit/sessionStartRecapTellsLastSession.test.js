/* global makeTestActor -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/sessionStartRecapTellsLastSession.test.js
 *
 * The recap a session's start is told (narrator.js sessionStartRecap, at the
 * session's first narration; the world load's "Previously On") gives the last
 * session before it in full (issue #382 slice 2's defect, found by the slice 4
 * builder). Its source is the session record — each session's turning points
 * and the latest session in full (record/recapView.js recapSource). At a
 * session's start the record already holds that session: its page is made by
 * Begin's `session.begun`, and its first beats are Begin's (a vow sworn in the
 * dialog, a clock's advance, the spotlight's momentum). Read with it, the
 * session under way was "the latest session, in full" — a few Begin beats, or
 * none — and the session just played was an earlier one, cut to its turning
 * points. The lines of play that set things up are in no turning point: a
 * sister's compass, a manifest left with a broker, a promise to be back
 * before the tide (the long haul's F1, F3, F4 — known-issues
 * RECAP-LEAVES-OUT-EARLIER-PLANTED-FACTS) were told to no session's opening.
 *
 * Now the session under way is left out of a session-start recap's source
 * (`sessionStart`): what a session's start is told is what came before it.
 * End a Session's and `!recap`'s recaps still tell the session under way in
 * full — and End's recap, made while the session it ends is under way, is
 * the next session's opening recap, from its cache, when nothing else changed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const RECAP = 'Mira swore to find the lost ark.';
const api = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const user = String(body?.messages?.[0]?.content ?? '');
    api.calls.push({ user });
    if (user.includes('## THE RECORD')) {
      // A recap that cites every line it was sent, so no lasting beat is left untold.
      const ids = [...user.matchAll(/\[(s\d+-\d+)\]/g)].map(m => m[1]);
      return { content: [{ type: 'text', text: JSON.stringify({ paragraphs: [[{ text: 'Mira swore to find the lost ark.', because: ids.length ? ids : ['now-1'] }]] }) }],
        stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
    }
    return { content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
  }),
}));

import { buildNarratorExtras, getCampaignRecap } from '../../src/narration/narrator.js';
import { _resetRecordForTests } from '../../src/record/record.js';
import { _resetSummaryViewForTests } from '../../src/record/summaryView.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { playedBeats, recordedEvent, seedSessionRecord } from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const recapCalls = () => api.calls.filter(c => c.user.includes('## THE RECORD'));
const who = { actor: 'pc-mira' };
const HOUR = 3_600_000;

// Session 1's lines of play, as the long haul's player plants its facts (F1, F3, F4).
const COMPASS  = "I check my sister Ilse's brass star-compass before we undock.";
const MANIFEST = 'I leave the cargo manifest with Tamsin for safekeeping.';
const TIDE     = "I promise Tamsin I'll be back before the next tide of cargo.";

/** Session 1: begun, a vow sworn (its one turning point), and three lines of play. */
const sessionOne = () => [
  ...playedBeats('sess-1', [COMPASS, MANIFEST, TIDE], { actor: 'pc-mira', number: 1 }),
  recordedEvent('sess-1', 'vow.sworn', { who, ref: { vow: 'vow-ark' }, d: { name: 'Find the lost ark', rank: 'dangerous', actorId: 'pc-mira' } }),
];

/** A session's Begin as it is recorded: the session begun, the spotlight's momentum. */
const begun = (sessionId, number) => [
  recordedEvent(sessionId, 'session.begun', { d: { number } }),
  recordedEvent(sessionId, 'sheet.changed', { who, d: { actorId: 'pc-mira', what: 'momentum', from: 2, to: 3, cause: { kind: 'session' } } }),
];

let journals;
beforeEach(() => {
  api.calls.length = 0;
  journals = installJournalMock();
  _resetRecordForTests();
  _resetSummaryViewForTests();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
  game.actors._reset();
  game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
});
afterEach(() => { journals.restore(); game.actors._reset(); });

/** The stored campaignState in session `sessionId`, begun — anything already stored (a recap cache) kept. */
const stateOf = (sessionId, number) => {
  const state = { ...CampaignStateSchema, ...(game.settings._store.get(KEY) ?? {}),
    currentSessionId: sessionId, sessionNumber: number, sessionStartedId: sessionId, sessionActive: true };
  game.settings._store.set(KEY, state);
  return state;
};

describe('a session\'s start is told the last session in full', () => {
  it('session 2\'s first narration: session 1 in full — its lines of play, the planted facts among them — and nothing of session 2', async () => {
    await seedSessionRecord('sess-1', sessionOne(), { number: 1, createdAt: Date.now() - 3 * HOUR });
    await seedSessionRecord('sess-2', begun('sess-2', 2), { number: 2, createdAt: Date.now() - HOUR });

    const extras = await buildNarratorExtras('paced_narrative', stateOf('sess-2', 2));

    expect(extras.campaignRecap).toBe(RECAP);
    const [call] = recapCalls();
    expect(call.user).toContain('### Session 1 — the latest session, in full');   // was: "— its turning points"
    expect(call.user).toContain(`the player wrote “${COMPASS}”`);                  // was: not in the source
    expect(call.user).toContain(`the player wrote “${MANIFEST}”`);
    expect(call.user).toContain(`the player wrote “${TIDE}”`);
    expect(call.user).toMatch(/swore the vow “Find the lost ark” \(dangerous\) — LASTING: a vow sworn/);
    expect(call.user).not.toContain('### Session 2');                               // was: "the latest session, in full"
  });

  it('End a Session\'s recap of session 1 opens session 2 from its cache when nothing else changed — no second call', async () => {
    await seedSessionRecord('sess-1', sessionOne(), { number: 1, createdAt: Date.now() - 3 * HOUR });
    // End a Session (narrator.js getCampaignRecap, while session 1 is under way).
    expect(await getCampaignRecap(stateOf('sess-1', 1))).toBe(RECAP);
    expect(recapCalls()).toHaveLength(1);

    // Begin a Session: session 2's page holds its `session.begun`, and nothing on the sheets moved.
    await seedSessionRecord('sess-2', [recordedEvent('sess-2', 'session.begun', { d: { number: 2 } })], { number: 2, createdAt: Date.now() - HOUR });
    const extras = await buildNarratorExtras('paced_narrative', stateOf('sess-2', 2));

    expect(extras.campaignRecap).toBe(RECAP);
    expect(recapCalls()).toHaveLength(1);                                            // was: 2 — session 2 made it another source
  });

  it('control: End a Session\'s and `!recap`\'s recap tell the session under way in full, and session 1 by its turning points', async () => {
    await seedSessionRecord('sess-1', sessionOne(), { number: 1, createdAt: Date.now() - 3 * HOUR });
    await seedSessionRecord('sess-2', [
      ...begun('sess-2', 2),
      ...playedBeats('sess-2', ['I hail the station and ask for a berth.'], { actor: 'pc-mira', number: 2, begun: false }),
    ], { number: 2, createdAt: Date.now() - HOUR });

    expect(await getCampaignRecap(stateOf('sess-2', 2))).toBe(RECAP);
    const [call] = recapCalls();
    expect(call.user).toContain('### Session 2 — the latest session, in full');
    expect(call.user).toContain('I hail the station and ask for a berth.');
    expect(call.user).toContain('### Session 1 — its turning points');
    expect(call.user).not.toContain(COMPASS);
  });

  it('session 3\'s first narration: session 2 in full — and session 1, an earlier session, by its turning points alone: its lines of play are not told (design 8.3)', async () => {
    await seedSessionRecord('sess-1', sessionOne(), { number: 1, createdAt: Date.now() - 5 * HOUR });
    await seedSessionRecord('sess-2', playedBeats('sess-2', ['I hail the station and ask for a berth.'], { actor: 'pc-mira', number: 2 }),
      { number: 2, createdAt: Date.now() - 3 * HOUR });
    await seedSessionRecord('sess-3', begun('sess-3', 3), { number: 3, createdAt: Date.now() - HOUR });

    await buildNarratorExtras('paced_narrative', stateOf('sess-3', 3));

    const [call] = recapCalls();
    expect(call.user).toContain('### Session 2 — the latest session, in full');
    expect(call.user).toContain('I hail the station and ask for a berth.');
    expect(call.user).toMatch(/### Session 1 — its turning points\n\n\[s1-\d+\] Mira Kestrel — swore the vow “Find the lost ark”/);
    expect(call.user).not.toContain(COMPASS);
    expect(call.user).not.toContain('### Session 3');
  });
});
