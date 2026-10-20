/**
 * STARFORGED COMPANION
 * tests/unit/sessionManagement.test.js
 *
 * Unit tests for initSessionId() (src/index.js), the session boundaries in
 * src/session/lifecycle.js, and CampaignStateSchema session-related fields
 * (src/schemas.js).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initSessionId, isNewSessionStart } from '../../src/index.js';
import { sessionNeedsMint, mintSession, touchSessionActivity, SESSION_IDLE_HOURS } from '../../src/session/lifecycle.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function makeState(overrides = {}) {
  return {
    currentSessionId:     '',
    sessionNumber:        0,
    lastSessionTimestamp: null,
    ...overrides,
  };
}

/** ISO string for a timestamp N hours in the past */
function hoursAgo(n) {
  return new Date(Date.now() - n * 3_600_000).toISOString();
}


// ─────────────────────────────────────────────────────────────────────────────
// initSessionId()
// ─────────────────────────────────────────────────────────────────────────────

describe('initSessionId()', () => {
  it('generates a new sessionId when none exists', async () => {
    const state = makeState();
    const result = await initSessionId(state);
    expect(result.currentSessionId).toBeTruthy();
    expect(typeof result.currentSessionId).toBe('string');
    expect(result.currentSessionId.length).toBeGreaterThan(0);
  });

  it('generates a new sessionId when lastSessionTimestamp is more than 4 hours ago', async () => {
    const oldId = 'old-session-id';
    const state  = makeState({
      currentSessionId:     oldId,
      lastSessionTimestamp: hoursAgo(5),
    });
    const result = await initSessionId(state);
    expect(result.currentSessionId).not.toBe(oldId);
    expect(result.currentSessionId.length).toBeGreaterThan(0);
  });

  it('reuses existing sessionId when lastSessionTimestamp is less than 4 hours ago', async () => {
    const existingId = 'existing-session';
    const state = makeState({
      currentSessionId:     existingId,
      lastSessionTimestamp: hoursAgo(1),
    });
    const result = await initSessionId(state);
    expect(result.currentSessionId).toBe(existingId);
  });

  it('increments sessionNumber on a new session', async () => {
    const state = makeState({ sessionNumber: 3 });
    const result = await initSessionId(state);
    expect(result.sessionNumber).toBe(4);
  });

  it('increments from 0 when sessionNumber is missing', async () => {
    const state = { currentSessionId: '', lastSessionTimestamp: null };
    const result = await initSessionId(state);
    expect(result.sessionNumber).toBe(1);
  });

  it('preserves sessionNumber on resume', async () => {
    const state = makeState({
      currentSessionId:     'abc123',
      sessionNumber:        7,
      lastSessionTimestamp: hoursAgo(2),
    });
    const result = await initSessionId(state);
    expect(result.sessionNumber).toBe(7);
  });

  it('sets lastSessionTimestamp on a new session', async () => {
    const before = new Date().toISOString();
    const state  = makeState();
    const result = await initSessionId(state);
    expect(result.lastSessionTimestamp).toBeTruthy();
    expect(new Date(result.lastSessionTimestamp) >= new Date(before)).toBe(true);
  });

  it('returns the mutated campaignState object', async () => {
    const state  = makeState();
    const result = await initSessionId(state);
    expect(result).toBe(state);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// isNewSessionStart()
// ─────────────────────────────────────────────────────────────────────────────

describe('isNewSessionStart()', () => {
  beforeEach(() => {
    game.settings._store.delete(`${MODULE_ID}.sessionGapHours`);
  });

  it('returns false when lastSessionTimestamp is null', () => {
    const state = makeState({ lastSessionTimestamp: null });
    expect(isNewSessionStart(state)).toBe(false);
  });

  it('returns false when gap is less than sessionGapHours', () => {
    const state = makeState({ lastSessionTimestamp: hoursAgo(2) });
    expect(isNewSessionStart(state, 4)).toBe(false);
  });

  it('returns true when gap exceeds sessionGapHours', () => {
    const state = makeState({ lastSessionTimestamp: hoursAgo(6) });
    expect(isNewSessionStart(state, 4)).toBe(true);
  });

  it('uses sessionGapHours from settings when no override is passed', () => {
    game.settings._store.set(`${MODULE_ID}.sessionGapHours`, 10);
    // Gap of 8 hours; threshold 10 → should be false
    const state = makeState({ lastSessionTimestamp: hoursAgo(8) });
    expect(isNewSessionStart(state)).toBe(false);
    // Gap of 12 hours; threshold 10 → should be true
    const state2 = makeState({ lastSessionTimestamp: hoursAgo(12) });
    expect(isNewSessionStart(state2)).toBe(true);
  });

  it('defaults to 4 hours when sessionGapHours not set', () => {
    // Gap of 5 hours, default threshold 4 → true
    const state = makeState({ lastSessionTimestamp: hoursAgo(5) });
    expect(isNewSessionStart(state)).toBe(true);
    // Gap of 3 hours, default threshold 4 → false
    const state2 = makeState({ lastSessionTimestamp: hoursAgo(3) });
    expect(isNewSessionStart(state2)).toBe(false);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// CampaignStateSchema — session fields
// ─────────────────────────────────────────────────────────────────────────────

describe('CampaignStateSchema', () => {
  it('includes currentSessionId field (empty string default)', () => {
    expect(Object.prototype.hasOwnProperty.call(CampaignStateSchema, 'currentSessionId')).toBe(true);
    expect(CampaignStateSchema.currentSessionId).toBe('');
  });

  it('includes sessionNumber field (0 default)', () => {
    expect(Object.prototype.hasOwnProperty.call(CampaignStateSchema, 'sessionNumber')).toBe(true);
    expect(CampaignStateSchema.sessionNumber).toBe(0);
  });

  it('includes lastSessionTimestamp field (null default)', () => {
    expect(Object.prototype.hasOwnProperty.call(CampaignStateSchema, 'lastSessionTimestamp')).toBe(true);
    expect(CampaignStateSchema.lastSessionTimestamp).toBeNull();
  });

  it('includes campaignRecapCache field with expected shape', () => {
    const cache = CampaignStateSchema.campaignRecapCache;
    expect(cache).toBeDefined();
    expect(cache.text).toBe('');
    expect(cache.generatedAt).toBeNull();
    expect(cache.chronicleLength).toBe(0);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Session boundaries (issue #286 C3, C4) — src/session/lifecycle.js
// ─────────────────────────────────────────────────────────────────────────────

describe('session boundaries (issue #286 C3, C4)', () => {
  const MIN = 60_000;

  beforeEach(() => {
    game.settings._store.delete(`${MODULE_ID}.campaignState`);
  });

  it('a session End a Session marked is over, however recent', () => {
    const state = makeState({ currentSessionId: 's1', lastSessionTimestamp: hoursAgo(0.1), sessionEndedId: 's1' });
    expect(sessionNeedsMint(state)).toBe(true);
    expect(sessionNeedsMint({ ...state, sessionEndedId: 's0' })).toBe(false);
  });

  it('the idle limit is measured from the last activity, not the mint', () => {
    expect(sessionNeedsMint(makeState({ currentSessionId: 's1', lastSessionTimestamp: hoursAgo(3.9) }))).toBe(false);
    expect(sessionNeedsMint(makeState({ currentSessionId: 's1', lastSessionTimestamp: hoursAgo(SESSION_IDLE_HOURS) }))).toBe(true);
  });

  it('End → Begin (no reload) starts a new session: initSessionId mints on the End marker', async () => {
    const state = makeState({ currentSessionId: 's1', sessionNumber: 4, lastSessionTimestamp: hoursAgo(0.2), sessionEndedId: 's1' });
    await initSessionId(state);
    expect(state.currentSessionId).not.toBe('s1');
    expect(state.sessionNumber).toBe(5);
    expect(state.sessionEndedId).toBeNull();
  });

  it('the mint keeps the closing session\'s summary as previousSessionSummary', () => {
    const state = makeState({
      currentSessionId: 's1', sessionNumber: 4,
      sessionSummary: { sessionId: 's1', text: ' The crew paid Vex 300 credits. ', coveredCount: 9, updatedAt: '2026-10-01T00:00:00Z' },
    });
    mintSession(state);
    expect(state.previousSessionSummary).toEqual({
      sessionId: 's1', sessionNumber: 4, text: 'The crew paid Vex 300 credits.', updatedAt: '2026-10-01T00:00:00Z',
    });
  });

  it('a closing session with no summary of its own leaves the older one in place', () => {
    const older = { sessionId: 's0', sessionNumber: 3, text: 'Earlier.', updatedAt: null };
    const state = makeState({
      currentSessionId: 's1', sessionNumber: 4, previousSessionSummary: older,
      sessionSummary: { sessionId: 's0', text: 'Stale — another session.', coveredCount: 2 },
    });
    mintSession(state);
    expect(state.previousSessionSummary).toBe(older);
  });

  it('chat activity refreshes the timestamp at most every 10 minutes', async () => {
    const now = Date.now();
    game.settings._store.set(`${MODULE_ID}.campaignState`,
      makeState({ currentSessionId: 's1', lastSessionTimestamp: new Date(now - 5 * MIN).toISOString(), pendingMove: true }));
    expect(await touchSessionActivity(now)).toBe(false);

    game.settings._store.set(`${MODULE_ID}.campaignState`,
      makeState({ currentSessionId: 's1', lastSessionTimestamp: new Date(now - 11 * MIN).toISOString(), pendingMove: true }));
    expect(await touchSessionActivity(now)).toBe(true);
    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored.lastSessionTimestamp).toBe(new Date(now).toISOString());
    expect(stored.pendingMove).toBe(true);   // written onto the latest store, nothing else touched
  });

  it('activity never revives a session that is over — idle past the limit, or ended', async () => {
    const now = Date.now();
    game.settings._store.set(`${MODULE_ID}.campaignState`,
      makeState({ currentSessionId: 's1', lastSessionTimestamp: hoursAgo(5) }));
    expect(await touchSessionActivity(now)).toBe(false);

    game.settings._store.set(`${MODULE_ID}.campaignState`,
      makeState({ currentSessionId: 's1', lastSessionTimestamp: hoursAgo(1), sessionEndedId: 's1' }));
    expect(await touchSessionActivity(now)).toBe(false);
  });
});
