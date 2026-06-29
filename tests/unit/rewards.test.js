/**
 * STARFORGED COMPANION
 * tests/unit/rewards.test.js
 *
 * The "stakes up front" helpers (#241 Phase 1): the rules-defined payoff lines
 * shown on a vow / combat / connection creation card.
 */

import { describe, it, expect } from 'vitest';
import {
  progressPerMilestoneLine,
  legacyRewardLine,
  parseRewardProposals,
  planRewardGrant,
  proposeRewards,
  REWARD_FORMS,
} from '../../src/moves/rewards.js';

describe('progressPerMilestoneLine', () => {
  it('describes box-level progress for the low ranks', () => {
    expect(progressPerMilestoneLine('troublesome')).toMatch(/3 boxes \(12 ticks\)/);
    expect(progressPerMilestoneLine('dangerous')).toMatch(/2 boxes \(8 ticks\)/);
    expect(progressPerMilestoneLine('formidable')).toMatch(/1 box \(4 ticks\)/);
  });

  it('describes tick-level progress for the high ranks', () => {
    expect(progressPerMilestoneLine('extreme')).toMatch(/2 ticks/);
    expect(progressPerMilestoneLine('epic')).toMatch(/1 tick\b/);
  });

  it('accepts a numeric ChallengeRank and defaults unknown ranks to formidable', () => {
    expect(progressPerMilestoneLine(2)).toMatch(/2 boxes/);            // dangerous
    expect(progressPerMilestoneLine('nope')).toMatch(/1 box \(4 ticks\)/); // formidable default
  });
});

describe('legacyRewardLine', () => {
  it('states the strong + weak legacy reward for the rank', () => {
    // dangerous: strong = 2 ticks; weak (one rank lower → troublesome) = 1.
    const line = legacyRewardLine('dangerous', 'Quests');
    expect(line).toMatch(/\+2 Quests legacy ticks \(strong hit\)/);
    expect(line).toMatch(/\+1 \(weak hit\)/);
  });

  it('pays nothing on a weak hit at troublesome', () => {
    const line = legacyRewardLine('troublesome', 'Quests');
    expect(line).toMatch(/\+1 Quests legacy tick \(strong hit\)/);
    expect(line).toMatch(/\+0 \(weak hit\)/);
  });
});

// ── Phase 2: concrete promised rewards ──────────────────────────────────────

describe('parseRewardProposals', () => {
  it('parses up to two {description, form} options', () => {
    const raw = JSON.stringify({ rewards: [
      { description: 'A custom raygun', form: 'gear' },
      { description: 'A contact in the arms trade', form: 'contact' },
      { description: 'A third (dropped)', form: 'supply' },
    ]});
    const out = parseRewardProposals(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ description: 'A custom raygun', form: 'gear' });
    expect(out[1].form).toBe('contact');
  });

  it('tolerates code fences and trailing prose, and defaults an unknown form to gear', () => {
    const raw = '```json\n{ "rewards": [ { "description": "A secret", "form": "bogus" } ] }\n```\nHope that helps!';
    const out = parseRewardProposals(raw);
    expect(out).toHaveLength(1);
    expect(out[0].form).toBe('gear');
  });

  it('returns [] for junk or missing rewards', () => {
    expect(parseRewardProposals('not json')).toEqual([]);
    expect(parseRewardProposals(JSON.stringify({ nope: [] }))).toEqual([]);
    expect(parseRewardProposals('')).toEqual([]);
  });
});

describe('planRewardGrant', () => {
  const reward = (form) => ({ description: 'A custom raygun', form });

  it('loses the reward on a miss', () => {
    expect(planRewardGrant(reward('gear'), 'miss')).toMatchObject({ status: 'lost' });
  });

  it('scales a meter reward with the hit', () => {
    expect(planRewardGrant(reward('supply'), 'strong_hit')).toMatchObject({ status: 'granted', amount: 2 });
    expect(planRewardGrant(reward('momentum'), 'weak_hit')).toMatchObject({ status: 'granted', amount: 1 });
  });

  it('delivers non-meter rewards, with a string on a weak hit', () => {
    expect(planRewardGrant(reward('gear'), 'strong_hit')).toMatchObject({ status: 'granted', withString: false });
    expect(planRewardGrant(reward('gear'), 'weak_hit')).toMatchObject({ status: 'granted', withString: true });
  });

  it('is a no-op for a missing reward', () => {
    expect(planRewardGrant(null, 'strong_hit')).toMatchObject({ status: 'lost' });
  });
});

describe('proposeRewards', () => {
  it('returns [] without an API key (no call made)', async () => {
    let called = false;
    const out = await proposeRewards({ kind: 'vow', apiKey: '' }, { _call: async () => { called = true; return ''; } });
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it('parses the model response into reward options', async () => {
    const _call = async () => JSON.stringify({ rewards: [{ description: 'A raygun', form: 'gear' }] });
    const out = await proposeRewards({ kind: 'bond', target: 'the weaponsmith', apiKey: 'k' }, { _call });
    expect(out).toEqual([{ description: 'A raygun', form: 'gear' }]);
  });

  it('returns [] when the call throws', async () => {
    const _call = async () => { throw new Error('network'); };
    expect(await proposeRewards({ kind: 'vow', apiKey: 'k' }, { _call })).toEqual([]);
  });

  it('exposes the known reward forms', () => {
    expect(REWARD_FORMS).toContain('asset');
    expect(REWARD_FORMS).toContain('knowledge');
  });
});
