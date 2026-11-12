/**
 * STARFORGED COMPANION
 * tests/unit/sessionManagement.test.js
 *
 * Unit tests for initSessionId() (src/index.js), the session boundaries in
 * src/session/lifecycle.js, and CampaignStateSchema session-related fields
 * (src/schemas.js).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initSessionId } from '../../src/index.js';
import { sessionNeedsMint, mintSession, touchSessionActivity, sessionLastSeenAt, SESSION_IDLE_HOURS, SESSION_MINT_FIELDS } from '../../src/session/lifecycle.js';
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
    expect(cache.chronicleHash).toBeNull();   // the chronicle a recap was made from (issue #301 B04)
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Session boundaries (issue #286 C3, C4) — src/session/lifecycle.js
// ─────────────────────────────────────────────────────────────────────────────

describe('session boundaries (issue #286 C3, C4)', () => {
  const MIN = 60_000;

  beforeEach(() => {
    game.settings._store.delete(`${MODULE_ID}.campaignState`);
    game.settings._store.delete(`${MODULE_ID}.sessionActivity`);
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
    const state = makeState({ currentSessionId: 's1', sessionNumber: 4, sessionStartedId: 's1', lastSessionTimestamp: hoursAgo(0.2), sessionEndedId: 's1' });
    await initSessionId(state);
    expect(state.currentSessionId).not.toBe('s1');
    expect(state.sessionNumber).toBe(5);
    expect(state.sessionEndedId).toBeNull();
  });

  it('the mint keeps the closing session\'s summary as previousSessionSummary', () => {
    const state = makeState({
      currentSessionId: 's1', sessionNumber: 4, sessionStartedId: 's1',
      sessionSummary: { sessionId: 's1', text: ' The crew paid Vex 300 credits. ', coveredCount: 9, updatedAt: '2026-10-01T00:00:00Z' },
    });
    mintSession(state);
    expect(state.previousSessionSummary).toEqual({
      sessionId: 's1', sessionNumber: 4, text: 'The crew paid Vex 300 credits.', updatedAt: '2026-10-01T00:00:00Z',
    });
  });

  // Issue #321 U12: a session nobody ended handed its open gate to the next
  // one — the panel read "Active" since last week and Begin was disabled.
  it('a new session starts with its session-active gate closed, and its caller persists the gate', () => {
    const state = makeState({
      currentSessionId: 's1', sessionNumber: 4, sessionStartedId: 's1', lastSessionTimestamp: hoursAgo(170),
      sessionActive: true, sessionActiveStartedAt: hoursAgo(173),
    });
    mintSession(state);
    expect(state).toMatchObject({ sessionNumber: 5, sessionActive: false, sessionActiveStartedAt: null });
    expect(SESSION_MINT_FIELDS).toEqual(expect.arrayContaining(['sessionActive', 'sessionActiveStartedAt']));
  });

  // DELETED-MESSAGES-KEPT: the deleted chat messages the X-Card's pick reads
  // after a reload (issue #347 DELETED-NARRATION-MEMORY-PAGE-ONLY) are the
  // closing session's — the new session's pick reads its own alone. They
  // were kept for good.
  it('a new session lets go of the closing session\'s deleted chat messages, and its caller persists that', () => {
    const state = makeState({
      currentSessionId: 's1', sessionNumber: 4, sessionStartedId: 's1', lastSessionTimestamp: hoursAgo(170),
      deletedChatMessages: [{ id: 'm-1', deleted: true, flags: { [MODULE_ID]: { narratorCard: true, sessionId: 's1', narrationId: 'nar-1' } } }],
    });
    mintSession(state);
    expect(state.deletedChatMessages).toEqual([]);
    expect(SESSION_MINT_FIELDS).toContain('deletedChatMessages');
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

  it('chat activity refreshes the activity stamp at most every 10 minutes', async () => {
    const now = Date.now();
    game.settings._store.set(`${MODULE_ID}.campaignState`,
      makeState({ currentSessionId: 's1', lastSessionTimestamp: new Date(now - 5 * MIN).toISOString(), pendingMove: true }));
    expect(await touchSessionActivity(now)).toBe(false);

    const minted = new Date(now - 11 * MIN).toISOString();
    const state = makeState({ currentSessionId: 's1', lastSessionTimestamp: minted, pendingMove: true });
    game.settings._store.set(`${MODULE_ID}.campaignState`, state);
    expect(await touchSessionActivity(now)).toBe(true);
    // Its own setting (issue #342 Z01): campaignState is not written at all —
    // a whole-object write from this client's cache carried back what it
    // had not seen yet.
    expect(game.settings.get(MODULE_ID, 'sessionActivity')).toEqual({ sessionId: 's1', at: new Date(now).toISOString() });
    expect(game.settings.get(MODULE_ID, 'campaignState')).toBe(state);
    expect(state.lastSessionTimestamp).toBe(minted);
    expect(sessionLastSeenAt(state)).toBe(new Date(now).toISOString());
    // The next message within ten minutes of the stamp writes nothing.
    expect(await touchSessionActivity(now + 5 * MIN)).toBe(false);
  });

  it('the idle limit counts the activity stamp of this session only', () => {
    const state = makeState({ currentSessionId: 's2', lastSessionTimestamp: hoursAgo(5) });
    game.settings._store.set(`${MODULE_ID}.sessionActivity`, { sessionId: 's2', at: hoursAgo(1) });
    expect(sessionNeedsMint(state)).toBe(false);
    // A stamp left by the session before is not this one's activity.
    game.settings._store.set(`${MODULE_ID}.sessionActivity`, { sessionId: 's1', at: hoursAgo(1) });
    expect(sessionNeedsMint(state)).toBe(true);
    expect(sessionLastSeenAt(state)).toBe(state.lastSessionTimestamp);
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
