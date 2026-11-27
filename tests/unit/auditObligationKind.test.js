/**
 * STARFORGED COMPANION
 * tests/unit/auditObligationKind.test.js
 *
 * Overhaul 4 (design §8, D9's logged class): the post-narration audit
 * (factContinuity/consistencyCheck.js) is given the narration's obligation
 * lines — what it was told it must tell and must not — and may answer kind
 * `obligation`. Since issue #399 it is given only the lines of the kinds
 * that passed its measure, and a finding on one of them posts a ◈ Narrative
 * Review card (D7, D10); a finding naming any other line is returned and
 * logged, and posts none. Round 9's audit was given every line but a
 * certain-class one, and its six obligation cards were all wrong.
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

  // Issue #399, D10: the audit is asked only what its measure passed. A
  // plain move's lines — [outcome], [sheet] (certain since D9), [apparatus]
  // (certain) — are none of them, and a finding that names one is held.
  it('an audit the ledger calls for is sent no line of a kind it may not act on; a finding naming one is logged, and no card', async () => {
    apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text:
      '{"contradictions":[{"subject":"[outcome]","violated":"the weak hit\'s cost","evidence":"without a scratch","kind":"obligation","confidence":"high"}]}' }] });
    const state = campaignState();
    // A truth that binds (the player's word — overhaul 2 §5.8 audits what binds alone).
    applySidecar({ newTruths: [{ subject: 'scene', fact: 'the bay doors are sealed' }], stateChanges: [] }, { campaignState: state, basisOf: () => 'player' });
    const out = await withAuditOn(() => runConsistencyCheck('She is through without a scratch.', state, { obligations: moveLines() }));
    expect(apiPost).toHaveBeenCalledTimes(1);
    const system = apiPost.mock.calls[0][2].system;
    expect(moveLines().map(o => o.kind)).toEqual(['outcome', 'sheet', 'apparatus']);
    expect(system).toMatch(/AND MUST NOT — numbered lines\.\n[^\n]*\n[^\n]*\n\(none\)\n/);
    for (const kind of ['outcome', 'sheet', 'apparatus']) expect(system).not.toContain(`[${kind}] `);
    expect(out.contradictions).toEqual([expect.objectContaining({ kind: 'obligation', subject: '[outcome]', confidence: 'high' })]);
    expect(out.dispatched).toBe(false);
    expect(applyStateTransition).not.toHaveBeenCalled();
  });

  it('a line of a kind the audit\'s measure passed is sent in its judge sentence, and a high-confidence breach of it posts the card', async () => {
    const lines = obligationsFor({ mode: 'move', resolution: { moveId: 'face_danger', outcome: 'weak_hit', openChoice: { kind: 'any', count: 1, amount: 1 } } });
    const cost = lines.find(o => o.kind === 'cost');
    expect(cost).toBeTruthy();
    apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify({ contradictions: [{ line: 1, subject: '[cost]',
      violated: 'the cost is the player\'s to choose', evidence: 'the effort costs you a gash along your arm', kind: 'obligation', confidence: 'high' }] }) }] });
    const state = campaignState();
    applySidecar({ newTruths: [{ subject: 'scene', fact: 'the bay doors are sealed' }], stateChanges: [] }, { campaignState: state, basisOf: () => 'player' });
    const out = await withAuditOn(() => runConsistencyCheck('You are through, and the effort costs you a gash along your arm.', state, { obligations: lines }));
    const system = apiPost.mock.calls[0][2].system;
    expect(system).toContain(`1. BREACH [cost] ${cost.judge}`);
    expect(system).not.toContain(cost.text);
    expect(out.dispatched).toBe(true);
    expect(applyStateTransition).toHaveBeenCalledWith(expect.objectContaining({ kind: 'obligation', change: 'contradicted' }), expect.anything());
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
