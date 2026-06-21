/**
 * STARFORGED COMPANION
 * tests/unit/sessionSummary.test.js
 *
 * Rolling session summary (narrator-memory architecture §8.6) — the fifth
 * memory surface. A debounced, session-scoped "story so far" summarised from
 * the full session card feed (never summary-of-summary), maintained the whole
 * session and archived to the Session Log at End Session.
 *
 *   rollingSummaryThreshold(N)   — debounce derived from ring depth (round(1.5×N))
 *   getRollingSummaryText(state) — pure read of the cached summary
 *   getRollingSessionSummary()   — debounce / regen / GM-gate / fail-open
 *   buildNarratorSystemPrompt()  — renders the §[4c] block (non-meta only)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  rollingSummaryThreshold,
  getRollingSummaryText,
  getRollingSessionSummary,
} from '../../src/narration/narrator.js';
import { buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCard(narrationText, sessionId = 'sess-1', extraFlags = {}) {
  return {
    flags: { [MODULE_ID]: { narratorCard: true, sessionId, narrationText, ...extraFlags } },
  };
}

/** Put N narrator cards for a session into game.messages. */
function setCards(n, sessionId = 'sess-1') {
  const cards = [];
  for (let i = 0; i < n; i++) cards.push(makeCard(`Beat ${i + 1}.`, sessionId));
  global.game.messages = { contents: cards };
}

function makeState(overrides = {}) {
  return { currentSessionId: 'sess-1', ...overrides };
}

/** Stub fetch to return canned summary prose; records the request body. */
function stubFetch(text = 'The crew chased the signal to Bleakhold.') {
  const calls = [];
  global.fetch = vi.fn(async (_url, init) => {
    calls.push(init?.body ? JSON.parse(init.body) : null);
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text }] }),
      text: async () => '',
    };
  });
  return calls;
}

beforeEach(() => {
  global.game.messages = { contents: [] };
  game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
  game.settings._store.delete(`${MODULE_ID}.narratorSessionSummary`);
  game.settings._store.delete(`${MODULE_ID}.narratorContextCards`);
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

afterEach(() => {
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
// 2. getRollingSummaryText — pure read
// ---------------------------------------------------------------------------

describe('getRollingSummaryText (pure read)', () => {
  it('returns the cached text when it matches the current session', () => {
    const state = makeState({ sessionSummary: { text: 'So far…', sessionId: 'sess-1' } });
    expect(getRollingSummaryText(state)).toBe('So far…');
  });

  it('returns "" for a stale summary from a different session', () => {
    const state = makeState({ sessionSummary: { text: 'Old', sessionId: 'sess-0' } });
    expect(getRollingSummaryText(state)).toBe('');
  });

  it('returns "" when there is no summary', () => {
    expect(getRollingSummaryText(makeState())).toBe('');
  });

  it('returns "" when the feature is disabled', () => {
    game.settings._store.set(`${MODULE_ID}.narratorSessionSummary`, false);
    const state = makeState({ sessionSummary: { text: 'So far…', sessionId: 'sess-1' } });
    expect(getRollingSummaryText(state)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 3. getRollingSessionSummary — debounce / regen / persist
// ---------------------------------------------------------------------------

describe('getRollingSessionSummary — gating', () => {
  // Pin context cards to 3 (K=5) so every test in this block uses a
  // predictable debounce threshold regardless of the system default.
  beforeEach(() => {
    game.settings._store.set(`${MODULE_ID}.narratorContextCards`, 3);
  });
  it('returns "" when disabled (no API call)', async () => {
    game.settings._store.set(`${MODULE_ID}.narratorSessionSummary`, false);
    const calls = stubFetch();
    setCards(8);
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    expect(await getRollingSessionSummary(makeState())).toBe('');
    expect(calls).toHaveLength(0);
  });

  it('returns "" when there is no current session', async () => {
    const calls = stubFetch();
    setCards(8);
    expect(await getRollingSessionSummary({})).toBe('');
    expect(calls).toHaveLength(0);
  });

  it('does NOT regenerate below the debounce threshold', async () => {
    const calls = stubFetch();
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    setCards(4);   // K is 5 at ring depth 3 (pinned in beforeEach)
    const state = makeState();
    expect(await getRollingSessionSummary(state)).toBe('');
    expect(calls).toHaveLength(0);
    expect(state.sessionSummary).toBeUndefined();
  });

  it('regenerates from source once the threshold is crossed', async () => {
    const calls = stubFetch('They struck a deal with the dockmaster.');
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    setCards(5);   // == K
    const state = makeState();

    const text = await getRollingSessionSummary(state);
    expect(text).toBe('They struck a deal with the dockmaster.');
    expect(calls).toHaveLength(1);
    // Summarised from SOURCE: every card's prose is in the request.
    const userMsg = calls[0].messages.at(-1).content;
    expect(userMsg).toContain('Beat 1.');
    expect(userMsg).toContain('Beat 5.');
    // Cache records the high-water mark.
    expect(state.sessionSummary.coveredCount).toBe(5);
    expect(state.sessionSummary.sessionId).toBe('sess-1');
  });

  it('GM persists the summary to world settings', async () => {
    stubFetch('Persisted summary.');
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    setCards(5);
    await getRollingSessionSummary(makeState());
    const stored = game.settings._store.get(`${MODULE_ID}.campaignState`);
    expect(stored?.sessionSummary?.text).toBe('Persisted summary.');
  });

  it('a non-GM gets the fresh text but does NOT write world settings', async () => {
    const restore = global.withUser({ isGM: false, id: 'p1' });
    try {
      stubFetch('Player-side summary.');
      game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
      setCards(5);
      const state = makeState();
      expect(await getRollingSessionSummary(state)).toBe('Player-side summary.');
      expect(state.sessionSummary.text).toBe('Player-side summary.');   // in-memory only
      expect(game.settings._store.get(`${MODULE_ID}.campaignState`)).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('respects the debounce after a regen, then regenerates K cards later', async () => {
    const calls = stubFetch('updated');
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    const state = makeState({ sessionSummary: { text: 'prev', sessionId: 'sess-1', coveredCount: 5 } });

    setCards(7);   // 7 - 5 = 2 < 5 → cached
    expect(await getRollingSessionSummary(state)).toBe('prev');
    expect(calls).toHaveLength(0);

    setCards(10);  // 10 - 5 = 5 == K → regen
    expect(await getRollingSessionSummary(state)).toBe('updated');
    expect(calls).toHaveLength(1);
    expect(state.sessionSummary.coveredCount).toBe(10);
  });

  it('forceRefresh ignores the debounce', async () => {
    const calls = stubFetch('forced');
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    setCards(6);
    const state = makeState({ sessionSummary: { text: 'prev', sessionId: 'sess-1', coveredCount: 5 } });
    expect(await getRollingSessionSummary(state, { forceRefresh: true })).toBe('forced');
    expect(calls).toHaveLength(1);
  });

  it('ignores a stale cache from a previous session (covered resets)', async () => {
    const calls = stubFetch('new session summary');
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    setCards(5, 'sess-2');
    // Cache belongs to sess-1 with a high covered count; current session is sess-2.
    const state = { currentSessionId: 'sess-2', sessionSummary: { text: 'old', sessionId: 'sess-1', coveredCount: 99 } };
    expect(await getRollingSessionSummary(state)).toBe('new session summary');
    expect(calls).toHaveLength(1);
    expect(state.sessionSummary.sessionId).toBe('sess-2');
  });
});

describe('getRollingSessionSummary — fail-open', () => {
  it('returns the cached text (no throw) when no API key is set', async () => {
    const calls = stubFetch();
    setCards(8);
    const state = makeState({ sessionSummary: { text: 'kept', sessionId: 'sess-1', coveredCount: 0 } });
    expect(await getRollingSessionSummary(state)).toBe('kept');
    expect(calls).toHaveLength(0);   // no key → never reaches the API
  });

  it('returns the cached text (no throw) when the API call fails', async () => {
    global.fetch = vi.fn(async () => { throw new Error('network down'); });
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    setCards(8);
    const state = makeState({ sessionSummary: { text: 'kept', sessionId: 'sess-1', coveredCount: 0 } });
    await expect(getRollingSessionSummary(state)).resolves.toBe('kept');
  });
});

// ---------------------------------------------------------------------------
// 4. Rendering — buildNarratorSystemPrompt §[4c]
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
});
