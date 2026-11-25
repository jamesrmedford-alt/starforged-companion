// tests/unit/pacing.test.js
// Coverage for src/pacing/classifier.js and src/pacing/router.js.
//
// The classifier's Claude call is exercised via apiPost — that's mocked
// here so we control the JSON response.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  PACING_DECISION,
  PACING_CATEGORIES,
  effectiveDial,
} from '../../src/pacing/dials.js';

import {
  routePacedInput,
  decidePacing,
  applyPaceCommand,
  markForceNextAsMove,
  readPacingConfig,
  recordRecentDecision,
  resetRecentDensity,
  getRecentMoveDensity,
} from '../../src/pacing/router.js';

vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(),
}));

vi.mock('../../src/narration/narrator.js', () => ({
  narratePacedInput: vi.fn(async () => 'mocked narration'),
  getRecentSceneForReading: vi.fn(() => ''),
  // The fellow-PC rule on a MOVE decision (issue #354 P2-06) has its own test
  // file (moveRoutingNoMove.test.js); here no line is spoken to a fellow PC.
  lineIsToAFellowPlayerCharacter: vi.fn(() => false),
}));

vi.mock('../../src/pacing/telemetry.js', () => ({
  logPacingDecision: vi.fn(async () => {}),
}));

vi.mock('../../src/ui/progressTracks.js', () => ({
  listProgressTracks: vi.fn(async () => []),
}));

import { addConnectionEntity } from '../helpers/fullStateFixture.js';
import { apiPost } from '../../src/api-proxy.js';
import { narratePacedInput, getRecentSceneForReading } from '../../src/narration/narrator.js';
import { logPacingDecision } from '../../src/pacing/telemetry.js';
import { listProgressTracks } from '../../src/ui/progressTracks.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeApiResponse(parsed) {
  return { content: [{ type: 'text', text: JSON.stringify(parsed) }] };
}

// Defaults after suggestion-loop remediation §B3 (exploration 5→6, social 3→5).
const BASE_PACING_CFG = {
  dials: { combat: 9, investigation: 6, exploration: 6, social: 5, downtime: 1 },
  sceneOverride: null,
};

const BASE_STATE = {
  currentSessionId: 'test-session',
  sessionNumber:    1,
  connectionIds:    [],
  pacing:           { sceneOverride: null, forceNextAsMove: false },
};

// ---------------------------------------------------------------------------
// effectiveDial
// ---------------------------------------------------------------------------

describe('effectiveDial()', () => {
  it('returns the base dial when no override', () => {
    expect(effectiveDial('combat', BASE_PACING_CFG)).toBe(9);
    expect(effectiveDial('social', BASE_PACING_CFG)).toBe(5);
  });

  it('applies +3 modifier for hot scene override', () => {
    const cfg = { ...BASE_PACING_CFG, sceneOverride: { modifier: 3, label: 'hot' } };
    expect(effectiveDial('social', cfg)).toBe(8);
  });

  it('applies -3 modifier for quiet scene override', () => {
    const cfg = { ...BASE_PACING_CFG, sceneOverride: { modifier: -3, label: 'quiet' } };
    expect(effectiveDial('combat', cfg)).toBe(6);
  });

  it('clamps to [0, 10]', () => {
    const high = { ...BASE_PACING_CFG, sceneOverride: { modifier: 5, label: 'extreme' } };
    expect(effectiveDial('combat', high)).toBe(10);

    const low = { ...BASE_PACING_CFG, sceneOverride: { modifier: -5, label: 'silent' } };
    expect(effectiveDial('downtime', low)).toBe(0);
  });

  it('treats missing categories as 0', () => {
    expect(effectiveDial('nonexistent', BASE_PACING_CFG)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildClassifierContext
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Classifier system prompt — dial-driven decision guidance
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Combat-active pacing — actions during a fight are forced to MOVE
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// classifyInput — parses model output, applies fallbacks
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// router: density tracking
// ---------------------------------------------------------------------------

describe('router density tracking', () => {
  beforeEach(() => {
    resetRecentDensity();
  });

  it('starts at zero', () => {
    expect(getRecentMoveDensity(5)).toEqual({ count: 0, window: 5 });
  });

  it('counts MOVE decisions in the rolling window', () => {
    recordRecentDecision({ decision: 'MOVE',      sceneTag: 's1', window: 5 });
    recordRecentDecision({ decision: 'MOVE',      sceneTag: 's1', window: 5 });
    recordRecentDecision({ decision: 'NARRATIVE', sceneTag: 's1', window: 5 });
    expect(getRecentMoveDensity(5)).toEqual({ count: 2, window: 5 });
  });

  it('drops entries past the window cap', () => {
    for (let i = 0; i < 8; i++) {
      recordRecentDecision({ decision: 'MOVE', sceneTag: 's1', window: 5 });
    }
    expect(getRecentMoveDensity(5).count).toBe(5);
  });

  it('resets when sceneTag changes', () => {
    recordRecentDecision({ decision: 'MOVE', sceneTag: 's1', window: 5 });
    recordRecentDecision({ decision: 'MOVE', sceneTag: 's1', window: 5 });
    recordRecentDecision({ decision: 'MOVE', sceneTag: 's2', window: 5 });
    expect(getRecentMoveDensity(5).count).toBe(1);
  });

  it('resetRecentDensity clears state', () => {
    recordRecentDecision({ decision: 'MOVE', sceneTag: 's1', window: 5 });
    resetRecentDensity();
    expect(getRecentMoveDensity(5).count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// router: routePacedInput dispatch
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// router: decidePacing — the decision alone (issue #340)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// readPacingConfig — settings + campaignState merge
// ---------------------------------------------------------------------------

describe('readPacingConfig()', () => {
  beforeEach(() => {
    game.settings._store.clear();
  });

  it('falls back to scope defaults when settings unset', () => {
    const cfg = readPacingConfig({});
    // Suggestion-loop remediation §B3 — exploration 5→6, social 3→5.
    expect(cfg.dials).toEqual({ combat: 9, investigation: 6, exploration: 6, social: 5, downtime: 1 });
    expect(cfg.enabled).toBe(true);
    expect(cfg.densityWindow).toBe(5);
    expect(cfg.sceneOverride).toBe(null);
    expect(cfg.forceMove).toBe(false);
  });

  it('reads sceneOverride and forceNextAsMove from campaignState', () => {
    const cfg = readPacingConfig({
      pacing: { sceneOverride: { modifier: -3, label: 'quiet' }, forceNextAsMove: true },
    });
    expect(cfg.sceneOverride).toEqual({ modifier: -3, label: 'quiet' });
    expect(cfg.forceMove).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyPaceCommand — !pace subcommands
// ---------------------------------------------------------------------------

describe('applyPaceCommand()', () => {
  it('sets a hot override', async () => {
    const state = { pacing: {} };
    const result = await applyPaceCommand(state, 'hot');
    expect(state.pacing.sceneOverride).toEqual({ modifier: 3, label: 'hot' });
    expect(result.persisted).toBe(true);
  });

  it('sets a quiet override', async () => {
    const state = { pacing: {} };
    await applyPaceCommand(state, 'quiet');
    expect(state.pacing.sceneOverride).toEqual({ modifier: -3, label: 'quiet' });
  });

  it('clears the override', async () => {
    const state = { pacing: { sceneOverride: { modifier: 3, label: 'hot' } } };
    await applyPaceCommand(state, 'clear');
    expect(state.pacing.sceneOverride).toBe(null);
  });

  it('returns a status string for status subcommand without mutating', async () => {
    const state = { pacing: { sceneOverride: { modifier: 3, label: 'hot' } } };
    const result = await applyPaceCommand(state, 'status');
    expect(result.persisted).toBe(false);
    expect(result.status).toMatch(/Pacing dials/);
    expect(state.pacing.sceneOverride).toEqual({ modifier: 3, label: 'hot' });
  });

  it('rejects unknown subcommands', async () => {
    const state = { pacing: {} };
    const result = await applyPaceCommand(state, 'wild');
    expect(result.persisted).toBe(false);
    expect(result.status).toMatch(/Unknown subcommand/);
  });
});

// ---------------------------------------------------------------------------
// markForceNextAsMove
// ---------------------------------------------------------------------------

describe('markForceNextAsMove()', () => {
  it('sets the flag on campaignState.pacing', async () => {
    const state = {};
    await markForceNextAsMove(state);
    expect(state.pacing.forceNextAsMove).toBe(true);
  });

  it('preserves an existing sceneOverride', async () => {
    const state = { pacing: { sceneOverride: { modifier: 3, label: 'hot' } } };
    await markForceNextAsMove(state);
    expect(state.pacing.forceNextAsMove).toBe(true);
    expect(state.pacing.sceneOverride).toEqual({ modifier: 3, label: 'hot' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cluster D (F9) — movement-with-stakes guidance + category definitions +
// scene-frame context
// ─────────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// The recent scene (alpha 23 playtest): "we're on our way" is travel only to
// a reader who saw the destination being discussed.
// ---------------------------------------------------------------------------
