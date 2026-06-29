/**
 * STARFORGED COMPANION
 * tests/unit/rewards.test.js
 *
 * The "stakes up front" helpers (#241 Phase 1): the rules-defined payoff lines
 * shown on a vow / combat / connection creation card.
 */

import { describe, it, expect } from 'vitest';
import { progressPerMilestoneLine, legacyRewardLine } from '../../src/moves/rewards.js';

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
