/**
 * STARFORGED COMPANION
 * tests/unit/rewardTextCutAtAWord.test.js
 *
 * Known-issues REWARD-TEXT-CUT-MID-WORD — the long haul's third and fourth
 * live runs (issue #383, `explorations/long-haul-live-20261124-213912/`, a2):
 * the vow's reward card offered "…installed on your ship by a grateful" and
 * "…where the raiders refit and sell their p". The proposals were cut at 120
 * characters wherever the 120th fell (rewards.js parseRewardProposals). A
 * description longer than that is cut at the last whole word that fits and
 * marked as cut; and the model is asked for descriptions short enough to fit.
 *
 * The replies are the run's own (a2, callRewardModel > proposeRewards).
 */

import { describe, it, expect } from 'vitest';
import { parseRewardProposals, proposeRewards } from '../../src/moves/rewards.js';

const SHIELD = 'A salvaged Expanse-class shield emitter, tuned to cut the raiders\' targeting lock, installed on your ship by a grateful convoy engineer.';
const LOG = 'Lodged in a pirate captain\'s private log: the coordinates of the hidden station where the raiders refit and sell their plunder, plus the name of the broker who buys it.';
const RUN_REPLY = JSON.stringify({ rewards: [{ description: SHIELD, form: 'asset' }, { description: LOG, form: 'knowledge' }] });

describe('a reward option too long for its card is cut at a word, never in one (REWARD-TEXT-CUT-MID-WORD)', () => {
  it('the run\'s two proposals: each ends on a whole word of its own text, marked as cut, within the card\'s 120 characters', () => {
    const out = parseRewardProposals(RUN_REPLY);
    expect(out.map(o => o.form)).toEqual(['asset', 'knowledge']);
    for (const [o, full] of [[out[0], SHIELD], [out[1], LOG]]) {
      expect(o.description.length).toBeLessThanOrEqual(120);
      expect(o.description.endsWith('…')).toBe(true);
      const kept = o.description.slice(0, -1);
      expect(full.startsWith(kept)).toBe(true);
      // The next character of the full text is a space: the last word kept is whole.
      expect(full.charAt(kept.length)).toMatch(/\s/);
      expect(kept).not.toMatch(/[\s,;:—–-]$/);
    }
    expect(out[0].description).toBe('A salvaged Expanse-class shield emitter, tuned to cut the raiders\' targeting lock, installed on your ship by a grateful…');
    expect(out[1].description).not.toMatch(/\bsell their p\b/);
  });

  it('a description that fits is kept whole, unmarked', () => {
    const [o] = parseRewardProposals(JSON.stringify({ rewards: [{ description: 'Safe passage through the Bleakhold blockade.', form: 'gear' }] }));
    expect(o.description).toBe('Safe passage through the Bleakhold blockade.');
  });

  it('one long word with no space to cut at is cut where it must be, still marked', () => {
    const [o] = parseRewardProposals(JSON.stringify({ rewards: [{ description: 'x'.repeat(200), form: 'gear' }] }));
    expect(o.description.length).toBeLessThanOrEqual(120);
    expect(o.description.endsWith('…')).toBe(true);
  });

  it('the model is asked for descriptions that fit', async () => {
    let prompt = '';
    await proposeRewards({ kind: 'vow', target: 'Find who is raiding the Cinder Expanse lanes', apiKey: 'sk-ant-test' },
      { _call: async (p) => { prompt = p; return RUN_REPLY; } });
    expect(prompt).toMatch(/at most 15 words/);
  });
});
