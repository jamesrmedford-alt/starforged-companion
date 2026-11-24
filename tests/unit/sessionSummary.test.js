/**
 * STARFORGED COMPANION
 * tests/unit/sessionSummary.test.js
 *
 * The session summary (narrator-memory architecture §8.6) — a view of the
 * session record since issue #382 slice 3 (record/summaryView.js). A
 * debounced, session-scoped "story so far", made from the session's record
 * read with the table's corrections — numbered beats, the facts of each and
 * TOLD AS the narrator's prose — and kept on the session's Session Log page
 * (`sessionRecord.views.summary`), valid while the span it was made from
 * reads the same.
 *
 *   rollingSummaryThreshold(N)   — debounce derived from ring depth (round(1.5×N))
 *   getRollingSessionSummary()   — debounce / make / store / fail-open, cited sentences
 *   buildNarratorSystemPrompt()  — renders the §[4c] block (non-meta only)
 *   earlier sessions (#286 C3)   — LAST SESSION from the record, the session-start recap
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  rollingSummaryThreshold,
  getRollingSessionSummary,
  buildNarratorExtras,
  campaignRecapCacheKey,
} from '../../src/narration/narrator.js';
import { buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';
import { _resetSummaryViewForTests } from '../../src/record/summaryView.js';
import { _resetRecordForTests } from '../../src/record/record.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import {
  seedSessionRecord, seedLegacySessionPage, playedBeats, recordedEvent, storedSummaryOf, sessionPageOf, citedSummaryReply,
} from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const beats = (n, sessionId = 'sess-1') => Array.from({ length: n }, (_, i) => `Beat ${i + 1}.`);

/** A session played as `n` beats, on its Session Log page. */
const playSession = (n, sessionId = 'sess-1', opts = {}) => seedSessionRecord(sessionId, playedBeats(sessionId, beats(n, sessionId), opts), opts);

/** More beats of a session, appended to its page as the record appends them. */
async function playMore(sessionId, lines) {
  const page = sessionPageOf(sessionId);
  const rec = page.flags[MODULE_ID].sessionRecord;
  const more = playedBeats(sessionId, lines, { begun: false });
  for (const e of more) rec.events[e.id] = e;
  rec.seq = Math.max(rec.seq, ...more.map(e => e.seq));
}

function makeState(overrides = {}) {
  return { currentSessionId: 'sess-1', ...overrides };
}

/** Stub fetch to answer with the cited sentences given; records the request body. */
function stubFetch(sentences = ['The crew chased the signal to Bleakhold.']) {
  const calls = [];
  const texts = Array.isArray(sentences) && Array.isArray(sentences[0]) ? sentences : [sentences];
  global.fetch = vi.fn(async (_url, init) => {
    calls.push(init?.body ? JSON.parse(init.body) : null);
    const answer = texts[Math.min(calls.length - 1, texts.length - 1)];
    const text = typeof answer === 'string' ? answer : citedSummaryReply(answer);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text }] }), text: async () => '' };
  });
  return calls;
}
const userOf = (call) => call.messages.at(-1).content;

let journals;
beforeEach(() => {
  journals = installJournalMock();
  _resetSummaryViewForTests();
  _resetRecordForTests();
  global.game.messages = { contents: [] };
  game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
  game.settings._store.delete(`${MODULE_ID}.narratorSessionSummary`);
  game.settings._store.delete(`${MODULE_ID}.narratorContextCards`);
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

afterEach(() => {
  journals.restore();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. rollingSummaryThreshold — K = round(1.5 × N), floor 1
// ---------------------------------------------------------------------------

describe('rollingSummaryThreshold (debounce = 1.5 × N)', () => {
  it('derives K from the ring depth', () => {
    expect(rollingSummaryThreshold(1)).toBe(2);   // round(1.5)
    expect(rollingSummaryThreshold(2)).toBe(3);   // 3.0
    expect(rollingSummaryThreshold(3)).toBe(5);   // round(4.5)
    expect(rollingSummaryThreshold(4)).toBe(6);   // 6.0
    expect(rollingSummaryThreshold(8)).toBe(12);
    expect(rollingSummaryThreshold(10)).toBe(15);
  });

  it('always exceeds the ring depth (a summary only appears once a tail exists)', () => {
    for (let n = 1; n <= 10; n++) expect(rollingSummaryThreshold(n)).toBeGreaterThan(n);
  });

  it('falls back to N=3 for invalid input, floor 1', () => {
    expect(rollingSummaryThreshold(0)).toBe(5);
    expect(rollingSummaryThreshold(NaN)).toBe(5);
    expect(rollingSummaryThreshold(undefined)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 2. getRollingSessionSummary — debounce / make / store, from the record
// ---------------------------------------------------------------------------

describe('getRollingSessionSummary — a view of the session record', () => {
  // Pin context cards to 3 (K=5) so every test in this block uses a
  // predictable debounce threshold regardless of the system default.
  beforeEach(() => {
    game.settings._store.set(`${MODULE_ID}.narratorContextCards`, 3);
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
  });

  it('returns "" when disabled (no API call)', async () => {
    game.settings._store.set(`${MODULE_ID}.narratorSessionSummary`, false);
    const calls = stubFetch();
    await playSession(8);
    expect(await getRollingSessionSummary(makeState())).toBe('');
    expect(calls).toHaveLength(0);
  });

  it('returns "" when there is no current session', async () => {
    const calls = stubFetch();
    await playSession(8);
    expect(await getRollingSessionSummary({})).toBe('');
    expect(calls).toHaveLength(0);
  });

  it('does NOT make one below the debounce threshold', async () => {
    const calls = stubFetch();
    await playSession(4);   // K is 5 at ring depth 3
    expect(await getRollingSessionSummary(makeState())).toBe('');
    expect(calls).toHaveLength(0);
    expect(storedSummaryOf('sess-1')).toBeNull();
  });

  it('makes it from the record once the threshold is crossed — every beat, the player\'s words and TOLD AS — and keeps it on the session\'s page', async () => {
    const calls = stubFetch(['They struck a deal with the dockmaster.']);
    await playSession(5);   // == K

    const text = await getRollingSessionSummary(makeState());
    expect(text).toBe('They struck a deal with the dockmaster.');
    expect(calls).toHaveLength(1);
    const user = userOf(calls[0]);
    expect(user).toMatch(/^## THE SESSION \(oldest first\)/);
    expect(user).toContain('[1] the player wrote “Beat 1.”\nTOLD AS: “The narrator tells it: Beat 1.”');
    expect(user).toContain('[5] the player wrote “Beat 5.”');
    expect(calls[0].system[0].text).toContain('continuity scribe');
    // The view: its text, the beats each sentence cites, the span it was made from.
    expect(storedSummaryOf('sess-1')).toMatchObject({ text: 'They struck a deal with the dockmaster.', cites: [['1']] });
    expect(storedSummaryOf('sess-1').sourceHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('a question asked of the narrator is listed as asked — nothing happened because of it', async () => {
    const calls = stubFetch(['Kira gave the old man her father\'s compass.']);
    await seedSessionRecord('sess-1', [
      ...playedBeats('sess-1', [{ said: 'I give him my father\'s compass.', told: 'The old man turns the compass over.' }, 'Beat 3.', 'Beat 4.', 'Beat 5.', 'Beat 6.']),
      recordedEvent('sess-1', 'question', { who: { actor: 'pc-ren' }, ref: { nar: 'nq' }, text: 'is it raining?' }),
      recordedEvent('sess-1', 'narration', { ref: { nar: 'nq' }, d: { mode: 'scene_answer' }, text: 'Rain needles the canopy.' }),
    ]);
    await getRollingSessionSummary(makeState());
    const user = userOf(calls[0]);
    expect(user).toContain('the player wrote “I give him my father\'s compass.”\nTOLD AS: “The old man turns the compass over.”');
    expect(user).toMatch(/## QUESTIONS — asked of the narrator; nothing happened because one was asked\n\n\[\d\] Asked the narrator “is it raining\?”\nTOLD AS: “Rain needles the canopy\.”/);
  });

  it('a non-GM gets the fresh text but stores nothing', async () => {
    const restore = global.withUser({ isGM: false, id: 'p1' });
    try {
      stubFetch(['Player-side summary.']);
      await playSession(5);
      expect(await getRollingSessionSummary(makeState())).toBe('Player-side summary.');
      expect(storedSummaryOf('sess-1')).toBeNull();
    } finally {
      restore();
    }
  });

  it('respects the debounce after a summary, then makes it again K beats later', async () => {
    const calls = stubFetch([['first'], ['updated']]);
    await playSession(5);
    expect(await getRollingSessionSummary(makeState())).toBe('first');

    await playMore('sess-1', ['Beat 6.', 'Beat 7.']);   // 2 < 5 → the summary there was
    _resetSummaryViewForTests();
    expect(await getRollingSessionSummary(makeState())).toBe('first');
    expect(calls).toHaveLength(1);

    await playMore('sess-1', ['Beat 8.', 'Beat 9.', 'Beat 10.']);   // 5 == K → made again
    _resetSummaryViewForTests();
    expect(await getRollingSessionSummary(makeState())).toBe('updated');
    expect(calls).toHaveLength(2);
    expect(userOf(calls[1])).toContain('[10] the player wrote “Beat 10.”');
  });

  it('forceRefresh makes it whenever the record holds more than it tells — and with nothing new, makes no call', async () => {
    const calls = stubFetch([['all of it'], ['and the rest']]);
    await playSession(2);
    expect(await getRollingSessionSummary(makeState(), { forceRefresh: true })).toBe('all of it');
    _resetSummaryViewForTests();
    expect(await getRollingSessionSummary(makeState(), { forceRefresh: true })).toBe('all of it');
    expect(calls).toHaveLength(1);

    await playMore('sess-1', ['The last round.']);
    _resetSummaryViewForTests();
    expect(await getRollingSessionSummary(makeState(), { forceRefresh: true })).toBe('and the rest');
    expect(calls).toHaveLength(2);
  });

  it('End\'s closing vignette is no beat of the session: a summary that tells every beat before it makes no call', async () => {
    const calls = stubFetch(['The whole session.']);
    await seedSessionRecord('sess-1', [
      ...playedBeats('sess-1', ['Beat 1.', 'Beat 2.']),
    ]);
    expect(await getRollingSessionSummary(makeState(), { forceRefresh: true })).toBe('The whole session.');
    const rec = sessionPageOf('sess-1').flags[MODULE_ID].sessionRecord;
    const vignette = recordedEvent('sess-1', 'narration', { ref: { nar: 'nv' }, d: { mode: 'vignette_close' }, text: 'Vex polishes a rifle in the galley.' });
    rec.events[vignette.id] = vignette;
    rec.seq = vignette.seq;
    _resetSummaryViewForTests();
    expect(await getRollingSessionSummary(makeState(), { forceRefresh: true })).toBe('The whole session.');
    expect(calls).toHaveLength(1);
  });

  it('a session\'s summary is its own: another session\'s view is never this one\'s', async () => {
    const calls = stubFetch(['new session summary']);
    await playSession(5, 'sess-0', { number: 1 });
    await getRollingSessionSummary(makeState({ currentSessionId: 'sess-0' }));
    await playSession(5, 'sess-2', { number: 2 });
    expect(await getRollingSessionSummary({ currentSessionId: 'sess-2' })).toBe('new session summary');
    expect(calls).toHaveLength(2);
    expect(userOf(calls[1])).not.toContain('sess-0');
  });
});

describe('getRollingSessionSummary — cited sentences (decision D11)', () => {
  beforeEach(() => {
    game.settings._store.set(`${MODULE_ID}.narratorContextCards`, 3);
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
  });

  it('a sentence that cites no beat it was sent is left out', async () => {
    stubFetch([[{ text: 'Kira forced the hatch.', because: ['1'] }, { text: 'She was always brave.', because: [] }, { text: 'An invented beat.', because: ['99'] }]]);
    await playSession(5);
    expect(await getRollingSessionSummary(makeState())).toBe('Kira forced the hatch.');
  });

  it('a reply that is not the JSON asked for is asked for once more; then the summary there was stands', async () => {
    const calls = [];
    const raw = ['Just prose, no JSON.', 'Still just prose.'];
    global.fetch = vi.fn(async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: raw[calls.length - 1] }] }), text: async () => '' };
    });
    await playSession(5);
    expect(await getRollingSessionSummary(makeState())).toBe('');
    expect(calls).toHaveLength(2);
    expect(userOf(calls[1])).toMatch(/Your reply was not the JSON asked for/);
  });

  it('a beat marked LASTING that no sentence tells sends it back once, naming it', async () => {
    const calls = stubFetch([[{ text: 'Kira looked around.', because: ['1'] }], [{ text: 'Kira swore to find her sister.', because: ['2'] }]]);
    await seedSessionRecord('sess-1', [
      ...playedBeats('sess-1', ['I look around.']),
      recordedEvent('sess-1', 'line', { who: { actor: 'pc-kira' }, ref: { line: 'mv' }, d: { via: 'typed' }, text: 'I swear to find my sister.' }),
      recordedEvent('sess-1', 'move.resolved', { who: { actor: 'pc-kira' }, ref: { res: 'r-vow' }, d: { moveId: 'swear_an_iron_vow', moveName: 'Swear an Iron Vow', outcome: 'strong_hit' } }),
      ...playedBeats('sess-1', ['Beat 3.', 'Beat 4.', 'Beat 5.'], { begun: false }),
    ]);
    expect(await getRollingSessionSummary(makeState())).toBe('Kira swore to find her sister.');
    expect(userOf(calls[1])).toMatch(/Your summary left out a beat marked LASTING: \[2\]/);
  });

  it('a reply made across a correction is discarded: an X-Card recorded while the call was out', async () => {
    await playSession(5);
    global.fetch = vi.fn(async () => {
      // The X-Card lands while the call is out: its removal goes on the record.
      const rec = sessionPageOf('sess-1').flags[MODULE_ID].sessionRecord;
      const removal = recordedEvent('sess-1', 'narration.removed', { d: { narrationIds: ['nar-sess-1-5'], by: 'xcard' } });
      rec.events[removal.id] = removal;
      rec.seq = removal.seq;
      _resetSummaryViewForTests();
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: citedSummaryReply(['It told the removed beat.']) }] }), text: async () => '' };
    });
    expect(await getRollingSessionSummary(makeState())).toBe('');
    expect(storedSummaryOf('sess-1')).toBeNull();
  });

  it('asks for room for a list of cited sentences', async () => {
    const calls = stubFetch();
    await playSession(5);
    await getRollingSessionSummary(makeState());
    expect(calls[0].max_tokens).toBe(1200);
  });
});

describe('getRollingSessionSummary — fail-open', () => {
  beforeEach(() => { game.settings._store.set(`${MODULE_ID}.narratorContextCards`, 3); });

  it('returns the summary that stands (no throw) when no API key is set, and makes no call', async () => {
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    stubFetch(['kept']);
    await playSession(5);
    await getRollingSessionSummary(makeState());
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
    await playMore('sess-1', ['Beat 6.', 'Beat 7.', 'Beat 8.', 'Beat 9.', 'Beat 10.']);
    _resetSummaryViewForTests();
    const calls = stubFetch();
    expect(await getRollingSessionSummary(makeState())).toBe('kept');
    expect(calls).toHaveLength(0);
  });

  it('returns the summary that stands (no throw) when the API call fails', async () => {
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    stubFetch(['kept']);
    await playSession(5);
    await getRollingSessionSummary(makeState());
    await playMore('sess-1', ['Beat 6.', 'Beat 7.', 'Beat 8.', 'Beat 9.', 'Beat 10.']);
    _resetSummaryViewForTests();
    global.fetch = vi.fn(async () => { throw new Error('network down'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(getRollingSessionSummary(makeState())).resolves.toBe('kept');
  });
});

// ---------------------------------------------------------------------------
// 3. Rendering — buildNarratorSystemPrompt §[4c]
// ---------------------------------------------------------------------------

describe('STORY SO FAR block rendering', () => {
  const SETTINGS = { narrationTone: 'wry', narrationPerspective: 'second_person', narrationLength: 3 };

  it('renders the block for a live prose mode when a summary is present', () => {
    const prompt = buildNarratorSystemPrompt(
      makeState(), SETTINGS, null, '',
      { mode: 'paced_narrative', rollingSummary: 'The crew owes the dockmaster a favour.' },
    );
    expect(prompt).toContain('## STORY SO FAR (THIS SESSION)');
    expect(prompt).toContain('The crew owes the dockmaster a favour.');
  });

  it('omits the block when the summary is empty', () => {
    const prompt = buildNarratorSystemPrompt(
      makeState(), SETTINGS, null, '',
      { mode: 'paced_narrative', rollingSummary: '' },
    );
    expect(prompt).not.toContain('STORY SO FAR');
  });

  it('omits the block for meta modes (campaign_recap)', () => {
    const prompt = buildNarratorSystemPrompt(
      makeState(), SETTINGS, null, '',
      { mode: 'campaign_recap', rollingSummary: 'Should not appear in a recap.' },
    );
    expect(prompt).not.toContain('STORY SO FAR');
  });

  it('STORY SO FAR is the session\'s summary view while it stands — not once a correction makes it stale', async () => {
    game.settings._store.set(`${MODULE_ID}.narratorContextCards`, 3);
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    stubFetch(['The crew owes the dockmaster a favour.']);
    await playSession(5);
    await getRollingSessionSummary(makeState());
    expect((await buildNarratorExtras('paced_narrative', makeState())).rollingSummary).toBe('The crew owes the dockmaster a favour.');

    const rec = sessionPageOf('sess-1').flags[MODULE_ID].sessionRecord;
    const removal = recordedEvent('sess-1', 'narration.removed', { d: { narrationIds: ['nar-sess-1-2'], by: 'xcard' } });
    rec.events[removal.id] = removal;
    rec.seq = removal.seq;
    _resetSummaryViewForTests();
    expect((await buildNarratorExtras('paced_narrative', makeState())).rollingSummary).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 4. Earlier sessions (issue #286 C3) — LAST SESSION from the record, the
//    session-start recap
// ---------------------------------------------------------------------------

describe('earlier sessions reach every prose mode (issue #286 C3)', () => {
  const SETTINGS = { narrationTone: 'wry', narrationPerspective: 'second_person', narrationLength: 3 };
  const PREV = 'The crew paid Vex 300 credits.';

  // The per-beat LAST SESSION block, as a narration without a world snapshot
  // carries it (issue #357: with one, earlier sessions are in the snapshot —
  // worldSnapshotRequest.test.js).
  const withoutSnapshot = () => game.settings._store.set('starforged-companion.worldSnapshot', false);

  it('LAST SESSION renders before STORY SO FAR, with the texture-only caveat', async () => {
    withoutSnapshot();
    await seedLegacySessionPage('sess-0', PREV, { number: 2 });
    const extras = await buildNarratorExtras('paced_narrative', makeState({ sessionNumber: 3 }));
    expect(extras.previousSessionSummary).toEqual({ text: PREV, sessionNumber: 2, isLast: true });
    const prompt = buildNarratorSystemPrompt(makeState(), SETTINGS, null, '',
      { ...extras, rollingSummary: 'This session so far.' });
    expect(prompt).toMatch(/## LAST SESSION \(SESSION 2\)\n\n\(Narrative texture only[^\n]*\n\nThe crew paid Vex 300 credits\.\n\n---\n\n## STORY SO FAR/);
  });

  it('is not called the last session when it is not the one just before this', async () => {
    withoutSnapshot();
    await seedLegacySessionPage('sess-0', PREV, { number: 2 });
    const extras = await buildNarratorExtras('scene_interrogation', makeState({ sessionNumber: 5 }));
    const prompt = buildNarratorSystemPrompt(makeState(), SETTINGS, null, '', extras);
    expect(prompt).toContain('## SESSION 2 (THE LATEST SESSION SUMMARISED)');
    expect(prompt).not.toContain('## LAST SESSION');
  });

  it('is off with the session summary, and never in a recap', async () => {
    await seedLegacySessionPage('sess-0', PREV, { number: 2 });
    const recap = await buildNarratorExtras('campaign_recap', makeState());
    expect(recap.previousSessionSummary).toBeUndefined();
    game.settings._store.set(`${MODULE_ID}.narratorSessionSummary`, false);
    const off = await buildNarratorExtras('paced_narrative', makeState());
    expect(off.previousSessionSummary).toBeNull();
  });

  it('the campaign recap comes from its cache on the session\'s first narration only, in any mode', async () => {
    // A session with one before it (a campaign's first session is told no
    // recap of itself — recapAtFirstBegin.test.js).
    await seedLegacySessionPage('sess-0', PREV, { number: 2 });
    const state = makeState({ campaignRecapCache: {
      text: 'The campaign so far.', generatedAt: null, ...(await campaignRecapCacheKey(makeState())),
    } });
    const first = await buildNarratorExtras('session_vignette', state);
    expect(first.campaignRecap).toBe('The campaign so far.');
    expect(buildNarratorSystemPrompt(state, SETTINGS, null, '', first))
      .toContain('## CAMPAIGN RECAP — SESSION START CONTEXT\n\nThe campaign so far.');

    global.game.messages = { contents: [{ flags: { [MODULE_ID]: { narratorCard: true, sessionId: 'sess-1', narrationText: 'Beat 1.' } } }] };
    expect((await buildNarratorExtras('paced_narrative', state)).campaignRecap).toBe('');
  });

  it('a cache made from another source never opens the session (issue #301 B04)', async () => {
    // With no key to make it again, the session opens with no recap rather than a stale one…
    const stale = makeState({ campaignRecapCache: { text: 'The campaign so far.', sourceHash: 'feedface' } });
    expect((await buildNarratorExtras('session_vignette', stale)).campaignRecap).toBe('');
    // …and a cache from before the record (a Chronicle count) counts as stale.
    const legacy = makeState({ campaignRecapCache: { text: 'The campaign so far.', chronicleLength: 0 } });
    expect((await buildNarratorExtras('session_vignette', legacy)).campaignRecap).toBe('');
  });
});
