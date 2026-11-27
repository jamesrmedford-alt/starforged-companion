/**
 * STARFORGED COMPANION
 * tests/unit/auditObligationKind.test.js
 *
 * Overhaul 4 (design §8, D9's logged class): the post-narration audit
 * (factContinuity/consistencyCheck.js) is given the narration's obligation
 * lines — what it was told it must tell and must not — and may answer kind
 * `obligation`: the lines its own check before posting does not hold it to
 * (an outcome, the stakes, the sheet) are audited after. Since issue #399 a
 * finding of kind `obligation` is returned and logged but posts no ◈
 * Narrative Review card until its kind passes the measure (D7), and the
 * lines the code already held the narration to are not sent (D2).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })),
}));
vi.mock('../../src/entities/entityExtractor.js', () => ({ applyStateTransition: vi.fn(async () => null) }));
vi.mock('../../src/pacing/telemetry.js', () => ({ logConsistencyDecision: vi.fn(async () => {}) }));

import { runConsistencyCheck, parseAuditResponse, buildAuditPrompt } from '../../src/factContinuity/consistencyCheck.js';
import { apiPost } from '../../src/api-proxy.js';
import { applyStateTransition } from '../../src/entities/entityExtractor.js';
import { obligationsFor } from '../../src/moves/contracts/obligations.js';
import { applySidecar } from '../../src/factContinuity/ledgers.js';

const campaignState = () => ({
  currentSessionId: 'ssn-o', currentSceneId: 'sc-o', dismissedEntities: [],
  sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-o' },
});

function withAuditOn(fn) {
  const prev = global.game.settings.get;
  global.game.settings.get = (mod, key) => {
    if (key === 'factContinuity.consistencyCheck') return true;
    if (key === 'claudeApiKey') return 'sk-test';
    return prev?.call(global.game.settings, mod, key);
  };
  return Promise.resolve(fn()).finally(() => { global.game.settings.get = prev; });
}

const moveLines = () => obligationsFor({ mode: 'move', resolution: { moveId: 'face_danger', outcome: 'weak_hit' } });

beforeEach(() => { vi.clearAllMocks(); });

describe('the audit reads a narration\'s obligations', () => {
  it('its prompt carries them, one a line with its list and tag, and offers the kind', () => {
    const prompt = buildAuditPrompt('', '', 'Kira slips the lock.', { obligations: 'TELL [outcome] It is done, at a cost.' });
    expect(prompt).toContain('WHAT THIS NARRATION WAS TOLD IT MUST TELL, AND MUST NOT');
    expect(prompt).toContain('TELL [outcome] It is done, at a cost.');
    expect(prompt).toMatch(/"identity" \| "obligation"/);
  });

  it('an answer of kind obligation is kept as one', () => {
    const [c] = parseAuditResponse('{"contradictions":[{"subject":"[outcome]","violated":"It is done, at a cost.","evidence":"cleanly, no cost","kind":"obligation","confidence":"high"}]}');
    expect(c).toMatchObject({ kind: 'obligation', subject: '[outcome]', confidence: 'high' });
  });

  // Issue #399: the audit is not sent the lines the code already held the
  // narration to (D2 — [apparatus] is certain), and a finding on an
  // obligation line posts no card until its kind passes the measure (D7) —
  // round 9's six obligation cards were all wrong. It is still returned and
  // logged.
  it('an audit the ledger calls for carries the lines the code has not checked; a high-confidence breach of one is logged, and no card', async () => {
    apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text:
      '{"contradictions":[{"subject":"[outcome]","violated":"the weak hit\'s cost","evidence":"without a scratch","kind":"obligation","confidence":"high"}]}' }] });
    const state = campaignState();
    // A truth that binds (the player's word — overhaul 2 §5.8 audits what binds alone).
    applySidecar({ newTruths: [{ subject: 'scene', fact: 'the bay doors are sealed' }], stateChanges: [] }, { campaignState: state, basisOf: () => 'player' });
    const out = await withAuditOn(() => runConsistencyCheck('She is through without a scratch.', state, { obligations: moveLines() }));
    expect(apiPost).toHaveBeenCalledTimes(1);
    const system = apiPost.mock.calls[0][2].system;
    const lines = moveLines();
    expect(lines.map(o => o.kind)).toEqual(['outcome', 'sheet', 'apparatus']);
    for (const o of lines.filter(o => o.kind !== 'apparatus')) expect(system).toContain(`${o.list} [${o.kind}] ${String(o.judge ?? o.text).trim()}`);
    expect(system).not.toContain('[apparatus]');
    expect(out.contradictions).toEqual([expect.objectContaining({ kind: 'obligation', subject: '[outcome]', confidence: 'high' })]);
    expect(out.dispatched).toBe(false);
    expect(applyStateTransition).not.toHaveBeenCalled();
  });

  it('control: a high-confidence breach of what binds still posts the review card', async () => {
    apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text:
      '{"contradictions":[{"subject":"scene","violated":"the bay doors are sealed","evidence":"the bay doors stand open","kind":"truth","confidence":"high"}]}' }] });
    const state = campaignState();
    applySidecar({ newTruths: [{ subject: 'scene', fact: 'the bay doors are sealed' }], stateChanges: [] }, { campaignState: state, basisOf: () => 'player' });
    const out = await withAuditOn(() => runConsistencyCheck('The bay doors stand open.', state, { obligations: moveLines() }));
    expect(out.dispatched).toBe(true);
    expect(applyStateTransition).toHaveBeenCalledWith(expect.objectContaining({ kind: 'truth', change: 'contradicted' }), expect.anything());
  });

  it('they make no audit of their own: an empty ledger is still not audited', async () => {
    const out = await withAuditOn(() => runConsistencyCheck('She is through.', campaignState(), { obligations: moveLines() }));
    expect(apiPost).not.toHaveBeenCalled();
    expect(out.dispatched).toBe(false);
  });
});
