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
  buildClassifierContext,
  classifyInput,
} from '../../src/pacing/classifier.js';

import {
  routePacedInput,
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
}));

vi.mock('../../src/pacing/telemetry.js', () => ({
  logPacingDecision: vi.fn(async () => {}),
}));

import { apiPost } from '../../src/api-proxy.js';
import { narratePacedInput } from '../../src/narration/narrator.js';
import { logPacingDecision } from '../../src/pacing/telemetry.js';

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

describe('buildClassifierContext()', () => {
  it('includes all five dials', () => {
    const { userMessage } = buildClassifierContext({
      playerText: 'I draw my sword',
      campaignState: BASE_STATE,
      character: { name: 'Kira' },
      recentMoveDensity: { count: 0, window: 5 },
      pacingConfig: BASE_PACING_CFG,
    });
    for (const cat of PACING_CATEGORIES) {
      expect(userMessage).toContain(cat);
    }
  });

  it('shows scene override label and modifier', () => {
    const { userMessage } = buildClassifierContext({
      playerText: 'I move quietly',
      campaignState: BASE_STATE,
      character: null,
      recentMoveDensity: { count: 0, window: 5 },
      pacingConfig: { ...BASE_PACING_CFG, sceneOverride: { modifier: 3, label: 'hot' } },
    });
    expect(userMessage).toContain('Scene override: hot');
  });

  it('includes player input verbatim', () => {
    const { userMessage } = buildClassifierContext({
      playerText: 'I throw myself into the airlock',
      campaignState: BASE_STATE,
      character: null,
      recentMoveDensity: { count: 0, window: 5 },
      pacingConfig: BASE_PACING_CFG,
    });
    expect(userMessage).toContain('I throw myself into the airlock');
  });

  it('separates cacheable system prompt from volatile user message', () => {
    const result = buildClassifierContext({
      playerText: 'test',
      campaignState: BASE_STATE,
      character: null,
      recentMoveDensity: { count: 0, window: 5 },
      pacingConfig: BASE_PACING_CFG,
    });
    expect(result.systemPrompt).toContain('MOVE CATALOG');
    expect(result.systemPrompt).not.toContain('PLAYER INPUT');
    expect(result.userMessage).toContain('PLAYER INPUT');
  });

  it('reports density correctly', () => {
    const { userMessage } = buildClassifierContext({
      playerText: 'test',
      campaignState: BASE_STATE,
      character: null,
      recentMoveDensity: { count: 4, window: 5 },
      pacingConfig: BASE_PACING_CFG,
    });
    expect(userMessage).toContain('Last 5 inputs in current scene: 4 were moves');
  });
});

// ---------------------------------------------------------------------------
// Classifier system prompt — dial-driven decision guidance
// ---------------------------------------------------------------------------

describe('classifier system prompt — dial-driven decision guidance', () => {
  const baseArgs = () => ({
    playerText: 'I take a moment to look out the viewport',
    campaignState: BASE_STATE,
    character: null,
    recentMoveDensity: { count: 0, window: 5 },
    pacingConfig: BASE_PACING_CFG,
  });

  it('does not reference the mischief dial or interpretation posture', () => {
    const { systemPrompt } = buildClassifierContext(baseArgs());
    expect(systemPrompt).not.toMatch(/mischief/i);
    expect(systemPrompt).not.toMatch(/INTERPRETATION POSTURE/);
    expect(systemPrompt).not.toMatch(/posture wins/);
  });

  it('declares the dial value as the primary signal for the MOVE/NARRATIVE decision', () => {
    const { systemPrompt } = buildClassifierContext(baseArgs());
    expect(systemPrompt).toMatch(/dials below are the primary signal/i);
  });

  it('describes high-dial behaviour as "almost always a move"', () => {
    const { systemPrompt } = buildClassifierContext(baseArgs());
    expect(systemPrompt).toMatch(/9[–-]10:\s*classify as MOVE/);
  });

  it('describes low-dial behaviour as "almost never a move"', () => {
    const { systemPrompt } = buildClassifierContext(baseArgs());
    expect(systemPrompt).toMatch(/0[–-]2:\s*classify as NARRATIVE/);
  });

  it('explicitly limits the classifier to the IF-a-move question', () => {
    const { systemPrompt } = buildClassifierContext(baseArgs());
    expect(systemPrompt).toMatch(/only IF a move is invoked/i);
  });
});

// ---------------------------------------------------------------------------
// classifyInput — parses model output, applies fallbacks
// ---------------------------------------------------------------------------

describe('classifyInput()', () => {
  beforeEach(() => {
    apiPost.mockReset();
  });

  const baseArgs = () => ({
    playerText: 'I attempt to read his expression',
    campaignState: BASE_STATE,
    character: { name: 'Kira' },
    recentMoveDensity: { count: 0, window: 5 },
    pacingConfig: BASE_PACING_CFG,
    apiKey: 'sk-ant-test',
  });

  it('parses a MOVE decision', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      decision: 'MOVE',
      suggestedMove: 'gather_information',
      category: 'investigation',
      confidence: 0.85,
      reasoning: 'player signalled intent',
    }));

    const result = await classifyInput(baseArgs());
    expect(result.decision).toBe(PACING_DECISION.MOVE);
    expect(result.suggestedMove).toBe('gather_information');
    expect(result.category).toBe('investigation');
    expect(result.confidence).toBe(0.85);
    expect(result.fallback).toBeUndefined();
  });

  it('parses a NARRATIVE decision', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      decision: 'NARRATIVE',
      suggestedMove: null,
      category: 'social',
      confidence: 0.7,
      reasoning: 'casual conversation',
    }));

    const result = await classifyInput(baseArgs());
    expect(result.decision).toBe(PACING_DECISION.NARRATIVE);
    expect(result.suggestedMove).toBe(null);
  });

  it('parses NARRATIVE_WITH_MOVE_AVAILABLE and preserves suggestedMove', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      decision: 'NARRATIVE_WITH_MOVE_AVAILABLE',
      suggestedMove: 'compel',
      category: 'social',
      confidence: 0.6,
      reasoning: 'could push',
    }));

    const result = await classifyInput(baseArgs());
    expect(result.decision).toBe(PACING_DECISION.NARRATIVE_WITH_MOVE_AVAILABLE);
    expect(result.suggestedMove).toBe('compel');
  });

  it('strips ``` fences from JSON responses', async () => {
    apiPost.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n{"decision":"NARRATIVE","suggestedMove":null,"category":"downtime","confidence":0.5,"reasoning":"x"}\n```' }],
    });
    const result = await classifyInput(baseArgs());
    expect(result.decision).toBe(PACING_DECISION.NARRATIVE);
  });

  it('falls back to MOVE on malformed JSON', async () => {
    apiPost.mockResolvedValue({ content: [{ type: 'text', text: 'not json at all' }] });
    const result = await classifyInput(baseArgs());
    expect(result.decision).toBe(PACING_DECISION.MOVE);
    expect(result.fallback).toBe(true);
  });

  it('falls back to MOVE on unknown decision string', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      decision: 'GARBAGE',
      category: 'social',
      confidence: 1,
    }));
    const result = await classifyInput(baseArgs());
    expect(result.decision).toBe(PACING_DECISION.MOVE);
    expect(result.fallback).toBe(true);
  });

  it('falls back to MOVE when apiPost throws', async () => {
    apiPost.mockRejectedValue(new Error('network down'));
    const result = await classifyInput(baseArgs());
    expect(result.decision).toBe(PACING_DECISION.MOVE);
    expect(result.fallback).toBe(true);
    expect(result.errorMessage).toContain('network down');
  });

  it('falls back when api key missing', async () => {
    const result = await classifyInput({ ...baseArgs(), apiKey: '' });
    expect(result.decision).toBe(PACING_DECISION.MOVE);
    expect(result.fallback).toBe(true);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('falls back when playerText is empty', async () => {
    const result = await classifyInput({ ...baseArgs(), playerText: '   ' });
    expect(result.decision).toBe(PACING_DECISION.MOVE);
    expect(result.fallback).toBe(true);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('clamps out-of-range confidence', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      decision: 'MOVE', suggestedMove: 'face_danger',
      category: 'combat', confidence: 99,
    }));
    const result = await classifyInput(baseArgs());
    expect(result.confidence).toBe(1);
  });

  it('defaults unknown category to exploration', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      decision: 'MOVE', suggestedMove: 'face_danger',
      category: 'mystery', confidence: 0.5,
    }));
    const result = await classifyInput(baseArgs());
    expect(result.category).toBe('exploration');
  });

  it('does not render any mischief-dial text into the classifier system prompt', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      decision: 'MOVE', suggestedMove: 'face_danger',
      category: 'exploration', confidence: 0.5,
    }));
    await classifyInput(baseArgs());
    expect(apiPost).toHaveBeenCalledTimes(1);
    const body = apiPost.mock.calls[0][2];
    const systemText = body.system[0].text;
    expect(systemText).not.toMatch(/mischief/i);
    expect(systemText).not.toMatch(/LAWFUL|CHAOTIC/);
    expect(systemText).not.toMatch(/INTERPRETATION POSTURE/);
  });
});

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

describe('routePacedInput()', () => {
  beforeEach(() => {
    apiPost.mockReset();
    narratePacedInput.mockReset();
    logPacingDecision.mockReset();
    resetRecentDensity();

    game.settings._store.clear();
    game.settings._store.set('starforged-companion.pacing.enabled', true);
    game.settings._store.set('starforged-companion.pacing.densityWindow', 5);
    game.settings._store.set('starforged-companion.pacing.dial.combat', 9);
    game.settings._store.set('starforged-companion.pacing.dial.investigation', 6);
    game.settings._store.set('starforged-companion.pacing.dial.exploration', 6);
    game.settings._store.set('starforged-companion.pacing.dial.social', 5);
    game.settings._store.set('starforged-companion.pacing.dial.downtime', 1);
  });

  afterEach(() => {
    resetRecentDensity();
  });

  it('runs the move pipeline on MOVE', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      decision: 'MOVE',
      suggestedMove: 'face_danger',
      category: 'combat',
      confidence: 0.9,
      reasoning: 'attack action',
    }));

    const result = await routePacedInput({
      playerText: 'I attack the guard',
      campaignState: { ...BASE_STATE, pacing: { sceneOverride: null, forceNextAsMove: false } },
      character: { name: 'Kira' },
      apiKey: 'sk-ant-test',
    });

    expect(result.runMove).toBe(true);
    expect(narratePacedInput).not.toHaveBeenCalled();
  });

  it('runs narrator-only on NARRATIVE', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      decision: 'NARRATIVE',
      suggestedMove: null,
      category: 'social',
      confidence: 0.8,
      reasoning: 'casual',
    }));

    const result = await routePacedInput({
      playerText: 'I sip my drink and watch the room',
      campaignState: { ...BASE_STATE, pacing: { sceneOverride: null, forceNextAsMove: false } },
      character: { name: 'Kira' },
      apiKey: 'sk-ant-test',
    });

    expect(result.runMove).toBe(false);
    expect(narratePacedInput).toHaveBeenCalledTimes(1);
    expect(narratePacedInput.mock.calls[0][2]).toEqual({ suggestedMove: null });
  });

  it('passes suggestedMove to narrator on NARRATIVE_WITH_MOVE_AVAILABLE', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      decision: 'NARRATIVE_WITH_MOVE_AVAILABLE',
      suggestedMove: 'compel',
      category: 'social',
      confidence: 0.7,
      reasoning: 'could push',
    }));

    const result = await routePacedInput({
      playerText: 'I lean across the table',
      campaignState: { ...BASE_STATE, pacing: { sceneOverride: null, forceNextAsMove: false } },
      character: { name: 'Kira' },
      apiKey: 'sk-ant-test',
    });

    expect(result.runMove).toBe(false);
    expect(narratePacedInput.mock.calls[0][2]).toEqual({ suggestedMove: 'compel' });
  });

  it('does not forward any mischief signal to the classifier', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      decision: 'MOVE',
      suggestedMove: 'face_danger',
      category: 'combat',
      confidence: 0.8,
      reasoning: 'attack',
    }));

    await routePacedInput({
      playerText: 'I attack the guard',
      campaignState: { ...BASE_STATE, pacing: { sceneOverride: null, forceNextAsMove: false } },
      character: { name: 'Kira' },
      apiKey: 'sk-ant-test',
    });

    expect(apiPost).toHaveBeenCalledTimes(1);
    const body = apiPost.mock.calls[0][2];
    const systemText = body.system[0].text;
    expect(systemText).not.toMatch(/mischief/i);
    expect(systemText).not.toMatch(/INTERPRETATION POSTURE/);
    expect(systemText).not.toMatch(/posture wins/);
  });

  it('records every decision in telemetry', async () => {
    apiPost.mockResolvedValue(makeApiResponse({
      decision: 'NARRATIVE',
      suggestedMove: null,
      category: 'downtime',
      confidence: 0.6,
      reasoning: 'quiet moment',
    }));

    await routePacedInput({
      playerText: 'I check my gear',
      campaignState: { ...BASE_STATE, pacing: { sceneOverride: null, forceNextAsMove: false } },
      character: null,
      apiKey: 'sk-ant-test',
    });

    // logPacingDecision is dispatched fire-and-forget; await its resolution.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(logPacingDecision).toHaveBeenCalledTimes(1);
    const call = logPacingDecision.mock.calls[0][0];
    expect(call.decision).toBe('NARRATIVE');
    expect(call.category).toBe('downtime');
  });

  it('short-circuits to MOVE when pacing is disabled', async () => {
    game.settings._store.set('starforged-companion.pacing.enabled', false);

    const result = await routePacedInput({
      playerText: 'anything',
      campaignState: { ...BASE_STATE, pacing: { sceneOverride: null, forceNextAsMove: false } },
      character: null,
      apiKey: 'sk-ant-test',
    });

    expect(result.runMove).toBe(true);
    expect(apiPost).not.toHaveBeenCalled();
    expect(narratePacedInput).not.toHaveBeenCalled();
  });

  it('honours forceNextAsMove and clears the flag', async () => {
    const state = {
      ...BASE_STATE,
      pacing: { sceneOverride: null, forceNextAsMove: true },
    };

    const result = await routePacedInput({
      playerText: 'anything',
      campaignState: state,
      character: null,
      apiKey: 'sk-ant-test',
    });

    expect(result.runMove).toBe(true);
    expect(apiPost).not.toHaveBeenCalled();
    expect(state.pacing.forceNextAsMove).toBe(false);
  });
});

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
