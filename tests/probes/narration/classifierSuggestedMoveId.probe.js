// tests/probes/narration/classifierSuggestedMoveId.probe.test.js
//
// PROBE (audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// PACING-MOVE-NOT-NORMALISED: the classifier's schema asks for
// `"suggestedMove": "<move name or move id>"` and parseDecision
// (src/pacing/classifier.js) passes the string through untouched. Downstream
// it is used as a MOVES id: suppressPcDirectedSocialMove checks a set of ids
// ("compel"), and when the narrator's closing hint names no recognised move,
// reconcileSuggestedMove keeps the raw string for the NWMA card, whose Roll
// button re-posts it as `forcedMoveId` → buildForcedInterpretation → resolveMove
// throws "Unknown move: Gather Information".

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../../src/api-proxy.js';
import { classifyInput } from '../../../src/pacing/classifier.js';
import { suppressPcDirectedSocialMove } from '../../../src/narration/narrator.js';

describe('a move the classifier names by its display name is used as a move id', () => {
  it('normalises "Gather Information" to gather_information', async () => {
    apiPost.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({
      decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'Gather Information',
      category: 'investigation', confidence: 0.7, reasoning: 'probing for clues',
    }) }] });
    const result = await classifyInput({
      playerText: 'I look over the console for anything odd.', campaignState: {}, character: null,
      recentMoveDensity: { count: 0, window: 5 }, pacingConfig: { dials: {}, sceneOverride: null }, apiKey: 'sk-ant-x',
    });
    expect(result.suggestedMove).toBe('gather_information');
  });

  it('a "Compel" aimed at a fellow PC is suppressed whatever its case', () => {
    expect(suppressPcDirectedSocialMove('Compel', 'I lean on Ren until he folds.', 'Kira', [{ name: 'Kira' }, { name: 'Ren' }])).toBeNull();
  });
});
