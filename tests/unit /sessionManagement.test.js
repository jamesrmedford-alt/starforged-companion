/**
 * STARFORGED COMPANION
 * tests/unit/sessionManagement.test.js
 *
 * Unit tests for initSessionId() (src/index.js) and CampaignStateSchema
 * session-related fields (src/schemas.js).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initSessionId } from '../../src/index.js';
import { CampaignStateSchema } from '../../src/schemas.js';


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
  it('generates a new sessionId when none exists', () => {
    const state = makeState();
    const result = initSessionId(state);
    expect(result.currentSessionId).toBeTruthy();
    expect(typeof result.currentSessionId).toBe('string');
    expect(result.currentSessionId.length).toBeGreaterThan(0);
  });

  it('generates a new sessionId when lastSessionTimestamp is more than 4 hours ago', () => {
    const oldId = 'old-session-id';
    const state  = makeState({
      currentSessionId:     oldId,
      lastSessionTimestamp: hoursAgo(5),
    });
    const result = initSessionId(state);
    expect(result.currentSessionId).not.toBe(oldId);
    expect(result.currentSessionId.length).toBeGreaterThan(0);
  });

  it('reuses existing sessionId when lastSessionTimestamp is less than 4 hours ago', () => {
    const existingId = 'existing-session';
    const state = makeState({
      currentSessionId:     existingId,
      lastSessionTimestamp: hoursAgo(1),
    });
    const result = initSessionId(state);
    expect(result.currentSessionId).toBe(existingId);
  });

  it('increments sessionNumber on a new session', () => {
    const state = makeState({ sessionNumber: 3 });
    const result = initSessionId(state);
    expect(result.sessionNumber).toBe(4);
  });

  it('increments from 0 when sessionNumber is missing', () => {
    const state = { currentSessionId: '', lastSessionTimestamp: null };
    const result = initSessionId(state);
    expect(result.sessionNumber).toBe(1);
  });

  it('preserves sessionNumber on resume', () => {
    const state = makeState({
      currentSessionId:     'abc123',
      sessionNumber:        7,
      lastSessionTimestamp: hoursAgo(2),
    });
    const result = initSessionId(state);
    expect(result.sessionNumber).toBe(7);
  });

  it('sets lastSessionTimestamp on a new session', () => {
    const before = new Date().toISOString();
    const state  = makeState();
    const result = initSessionId(state);
    expect(result.lastSessionTimestamp).toBeTruthy();
    expect(new Date(result.lastSessionTimestamp) >= new Date(before)).toBe(true);
  });

  it('returns the mutated campaignState object', () => {
    const state  = makeState();
    const result = initSessionId(state);
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
  });
});
