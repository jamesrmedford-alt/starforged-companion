/**
 * STARFORGED COMPANION
 * tests/unit/factContinuityConsistencyCheck.test.js
 *
 * Unit tests for the Phase E consistency-check audit pass.
 * The Haiku call is mocked via apiPost; we exercise the parser, the
 * gating, the prompt builder, and the high-confidence dispatch path.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// vi.mock is hoisted — must precede the import of the module under test.
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })),
}));

vi.mock('../../src/entities/entityExtractor.js', () => ({
  applyStateTransition: vi.fn(async () => null),
}));

vi.mock('../../src/pacing/telemetry.js', () => ({
  logConsistencyDecision: vi.fn(async () => {}),
}));

import {
  runConsistencyCheck,
  parseAuditResponse,
  buildAuditPrompt,
  contradictionDedupKey,
} from '../../src/factContinuity/consistencyCheck.js';
import { apiPost }                from '../../src/api-proxy.js';
import { applyStateTransition }   from '../../src/entities/entityExtractor.js';
import { logConsistencyDecision } from '../../src/pacing/telemetry.js';
import { applySidecar }           from '../../src/factContinuity/ledgers.js';


function makeCampaignState(overrides = {}) {
  return {
    currentSessionId:  'ssn-test',
    currentSceneId:    'sc-test',
    dismissedEntities: [],
    sceneTruths:       [],
    sceneState:        { bySubject: {}, sceneId: 'sc-test' },
    ...overrides,
  };
}

function withSetting(value, fn) {
  const prev = global.game?.settings?.get;
  global.game.settings.get = (mod, key) => {
    if (key === 'factContinuity.consistencyCheck') return value;
    if (key === 'claudeApiKey') return 'sk-test';
    return prev?.call(global.game.settings, mod, key);
  };
  return Promise.resolve(fn()).finally(() => { global.game.settings.get = prev; });
}


// ─────────────────────────────────────────────────────────────────────────────
// parseAuditResponse
// ─────────────────────────────────────────────────────────────────────────────

// The table's facts (overhaul 2 §5.1): what a scene's end files, and the block's
// WHAT BINDS. The narrator's own colour fades with its scene (colourNotFiled.test.js).
const BOUND = () => 'player';

describe('parseAuditResponse', () => {
  it('parses a clean JSON object', () => {
    const out = parseAuditResponse(JSON.stringify({
      contradictions: [
        { subject: 'Vance', violated: 'limp', evidence: 'sprinted up the ramp', kind: 'truth', confidence: 'high' },
      ],
    }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      subject: 'Vance', violated: 'limp', kind: 'truth', confidence: 'high',
    });
  });

  it('strips a fenced ```json block and parses the body', () => {
    const text = '```json\n{"contradictions":[{"subject":"X","violated":"Y","evidence":"Z","confidence":"low"}]}\n```';
    const out  = parseAuditResponse(text);
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe('low');
    expect(out[0].kind).toBe('truth');         // default when omitted
  });

  it('falls back to the first {...} block when surrounding prose is present', () => {
    const text = 'Audit complete.\n\n{"contradictions":[{"subject":"a","violated":"b","evidence":"c","confidence":"medium"}]}\nthanks.';
    const out  = parseAuditResponse(text);
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe('medium');
  });

  it('coerces unknown confidence to "low"', () => {
    const out = parseAuditResponse(JSON.stringify({
      contradictions: [{ subject: 'a', violated: 'b', evidence: 'c', confidence: 'extreme' }],
    }));
    expect(out[0].confidence).toBe('low');
  });

  it('drops entries missing subject or violated', () => {
    const out = parseAuditResponse(JSON.stringify({
      contradictions: [
        { subject: '',  violated: 'x' },
        { subject: 'a', violated: '' },
        { subject: 'b', violated: 'c' },
      ],
    }));
    expect(out).toHaveLength(1);
    expect(out[0].subject).toBe('b');
  });

  it('returns [] for malformed input', () => {
    expect(parseAuditResponse('')).toEqual([]);
    expect(parseAuditResponse(null)).toEqual([]);
    expect(parseAuditResponse('not json at all')).toEqual([]);
  });

  it('returns [] for valid JSON without a contradictions array', () => {
    expect(parseAuditResponse('{"other":[]}')).toEqual([]);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// buildAuditPrompt — sanity
// ─────────────────────────────────────────────────────────────────────────────

describe('buildAuditPrompt', () => {
  it('embeds the truths, state, and narration in the prompt body', () => {
    const prompt = buildAuditPrompt(
      'WHAT BINDS — …:\n  scene — wind has died (the GM)',
      'STANDING NOW:\n  scene — lighting: dim (the GM)',
      'Vance sprints up the ramp.',
    );
    expect(prompt).toMatch(/WHAT BINDS \(what the player said, the dice decided or the GM set\):\n.*wind has died/s);
    expect(prompt).toMatch(/STANDING NOW:\n.*lighting: dim/s);
    expect(prompt).toMatch(/NARRATION:\nVance sprints up the ramp\./);
    expect(prompt).toMatch(/"contradictions":/);
  });

  it('renders "(none)" when a ledger section is empty', () => {
    const prompt = buildAuditPrompt('', '', 'prose');
    expect(prompt).toMatch(/WHAT BINDS \(what the player said, the dice decided or the GM set\):\n\(none\)/);
    expect(prompt).toMatch(/STANDING NOW:\n\(none\)/);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// runConsistencyCheck — gating + dispatch
// ─────────────────────────────────────────────────────────────────────────────

describe('runConsistencyCheck', () => {
  beforeEach(() => {
    apiPost.mockClear();
    applyStateTransition.mockClear();
    logConsistencyDecision.mockClear();
  });

  it('is a no-op when the setting is false', async () => {
    await withSetting(false, async () => {
      const cs = makeCampaignState();
      applySidecar(
        { newTruths: [{ subject: 'scene', fact: 'a' }], stateChanges: [] },
        { campaignState: cs, basisOf: BOUND },
      );
      const out = await runConsistencyCheck('prose', cs);
      expect(out).toEqual({ contradictions: [], dispatched: false });
      expect(apiPost).not.toHaveBeenCalled();
      expect(applyStateTransition).not.toHaveBeenCalled();
    });
  });

  it('short-circuits when the active ledger is empty (nothing to audit against)', async () => {
    await withSetting(true, async () => {
      const out = await runConsistencyCheck('prose', makeCampaignState());
      expect(out.contradictions).toEqual([]);
      expect(apiPost).not.toHaveBeenCalled();
    });
  });

  it('calls Haiku once and logs telemetry for an empty result', async () => {
    apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text: '{"contradictions":[]}' }] });
    await withSetting(true, async () => {
      const cs = makeCampaignState();
      applySidecar(
        { newTruths: [{ subject: 'scene', fact: 'wind has died' }], stateChanges: [] },
        { campaignState: cs, basisOf: BOUND },
      );
      const out = await runConsistencyCheck('prose', cs);
      expect(apiPost).toHaveBeenCalledTimes(1);
      expect(out.contradictions).toEqual([]);
      expect(out.dispatched).toBe(false);
      expect(applyStateTransition).not.toHaveBeenCalled();
      expect(logConsistencyDecision).toHaveBeenCalledTimes(1);
      const tel = logConsistencyDecision.mock.calls[0][0];
      expect(tel.dispatched).toBe(false);
      expect(tel.contradictions).toEqual([]);
    });
  });

  it('dispatches each high-confidence contradiction to applyStateTransition', async () => {
    apiPost.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({
        contradictions: [
          { subject: 'Vance', violated: 'limp', evidence: 'sprinted up the ramp',
            kind: 'truth', confidence: 'high', truthId: 'tr-abc12345' },
          { subject: 'scene', violated: 'wind dead', evidence: 'wind howled',
            kind: 'truth', confidence: 'medium' },
        ],
      })}],
    });
    await withSetting(true, async () => {
      const cs = makeCampaignState();
      applySidecar(
        { newTruths: [{ subject: 'scene', fact: 'wind has died' }], stateChanges: [] },
        { campaignState: cs, basisOf: BOUND },
      );
      const out = await runConsistencyCheck('prose', cs, { matchedEntityIds: ['JE.x7'] });
      expect(applyStateTransition).toHaveBeenCalledTimes(1);
      const transition = applyStateTransition.mock.calls[0][0];
      expect(transition).toMatchObject({
        entryType:        'factContinuity',
        change:           'contradicted',
        name:             'Vance',
        // The ledger's own truth, found by the finding's words — never the id
        // the model gave, which the ledger never showed it (issue #399's audit N24).
        truthId:          null,
        matchedEntityIds: ['JE.x7'],
      });
      expect(out.dispatched).toBe(true);
      expect(out.contradictions).toHaveLength(2);
      // Telemetry records ALL confidence levels, not just dispatched ones.
      expect(logConsistencyDecision.mock.calls[0][0].contradictions).toHaveLength(2);
    });
  });

  it('does not dispatch medium/low-confidence contradictions', async () => {
    apiPost.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({
        contradictions: [
          { subject: 'a', violated: 'b', evidence: 'c', confidence: 'medium' },
          { subject: 'd', violated: 'e', evidence: 'f', confidence: 'low' },
        ],
      })}],
    });
    await withSetting(true, async () => {
      const cs = makeCampaignState();
      applySidecar(
        { newTruths: [{ subject: 'scene', fact: 'x' }], stateChanges: [] },
        { campaignState: cs, basisOf: BOUND },
      );
      const out = await runConsistencyCheck('prose', cs);
      expect(applyStateTransition).not.toHaveBeenCalled();
      expect(out.dispatched).toBe(false);
      expect(out.contradictions).toHaveLength(2);
    });
  });

  it('survives an apiPost throw without throwing back', async () => {
    apiPost.mockRejectedValueOnce(new Error('network down'));
    await withSetting(true, async () => {
      const cs = makeCampaignState();
      applySidecar(
        { newTruths: [{ subject: 'scene', fact: 'x' }], stateChanges: [] },
        { campaignState: cs, basisOf: BOUND },
      );
      const out = await runConsistencyCheck('prose', cs);
      expect(out).toEqual({ contradictions: [], dispatched: false });
      expect(applyStateTransition).not.toHaveBeenCalled();
      // Telemetry still records the empty result.
      expect(logConsistencyDecision).toHaveBeenCalled();
    });
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Broadened audit scope (narrator-context audit 2026-07): retracted facts and
// the ship join truths + state; since overhaul 2 (§5.8, D15) what binds
// alone — THE PLACE (THE SCENE's Place and Ship lines), never the frame.
// ─────────────────────────────────────────────────────────────────────────────

describe('buildAuditPrompt — broadened sections', () => {
  it('includes the place, the corrections and what binds when provided — never the frame', () => {
    const prompt = buildAuditPrompt('WHAT BINDS — …:\n  scene — x (the GM)', 'STANDING NOW:', 'Some prose.', {
      place:        '  Place:    Bleakhold — where the characters are, by the table\'s record\n  Ship:     Kobayashi IV docked at Bleakhold',
      corrections:  'CORRECTED …:\n  Vance — Betrayed the crew',
    });
    expect(prompt).toMatch(/THE PLACE \(where the characters are and where their ship is, by the table's record\):/);
    expect(prompt).toMatch(/Ship: {5}Kobayashi IV docked at Bleakhold/);
    expect(prompt).toMatch(/RETRACTED FACTS/);
    expect(prompt).toMatch(/Betrayed the crew/);
    expect(prompt).not.toMatch(/SCENE FRAME/);
    expect(prompt).toMatch(/"retraction"/);
    expect(prompt).toMatch(/"place"/);
  });

  it('renders (none) for absent sections', () => {
    const prompt = buildAuditPrompt('', '', 'Prose.');
    const noneCount = (prompt.match(/\(none\)/g) ?? []).length;
    expect(noneCount).toBe(6); // place, identities, what binds, corrections, standing, obligations (overhaul 4)
  });

  it('includes recorded identities when provided', () => {
    const prompt = buildAuditPrompt('', '', 'Prose.', {
      identities: '  Kira Vex — she/her\n  Vance — he/him',
    });
    expect(prompt).toMatch(/RECORDED IDENTITIES/);
    expect(prompt).toMatch(/Kira Vex — she\/her/);
    expect(prompt).toMatch(/misgenders one of them IS a contradiction/);
    expect(prompt).toMatch(/"identity"/);
  });
});

describe('parseAuditResponse — broadened kinds', () => {
  it('reads frame / ship as place (overhaul 2 §5.8), keeps retraction, and defaults unknown to truth', () => {
    const raw = JSON.stringify({
      contradictions: [
        { subject: 'a', violated: 'v', kind: 'frame',      confidence: 'high' },
        { subject: 'b', violated: 'v', kind: 'ship',       confidence: 'low'  },
        { subject: 'c', violated: 'v', kind: 'retraction', confidence: 'high' },
        { subject: 'd', violated: 'v', kind: 'banana',     confidence: 'high' },
      ],
    });
    const out = parseAuditResponse(raw);
    expect(out.map(c => c.kind)).toEqual(['place', 'place', 'retraction', 'truth']);
    const idOut = parseAuditResponse(JSON.stringify({
      contradictions: [{ subject: 'x', violated: 'v', kind: 'identity', confidence: 'high' }],
    }));
    expect(idOut[0].kind).toBe('identity');
  });
});


describe('contradictionDedupKey — cross-turn review-card dedup (2026-07)', () => {
  it('is stable and case-insensitive per scene + subject + violated fact', () => {
    const a = contradictionDedupKey('sc-1', { subject: 'Vance', violated: 'Walks with a limp' });
    const b = contradictionDedupKey('sc-1', { subject: 'vance', violated: 'walks with a LIMP' });
    expect(a).toBe(b);
    const other = contradictionDedupKey('sc-1', { subject: 'Vance', violated: 'different fact' });
    expect(other).not.toBe(a);
  });

  it('scopes keys by scene', () => {
    const a = contradictionDedupKey('sc-1', { subject: 'Vance', violated: 'x' });
    const b = contradictionDedupKey('sc-2', { subject: 'Vance', violated: 'x' });
    expect(a).not.toBe(b);
  });
});
