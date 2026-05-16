/**
 * STARFORGED COMPANION
 * tests/unit/burnMomentum.test.js
 *
 * Coverage for the eligibility + click-side meter math in burnMomentum.js.
 * The renderChatMessage wiring is exercised in the live Quench batch; this
 * file pins the pure helpers + the meter delta logic that decides what gets
 * written back to the actor.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildBurnState, renderBurnButtonHtml } from '../../src/moves/burnMomentum.js';

beforeEach(() => {
  game.actors._reset();
});

function makeResolution(overrides = {}) {
  return {
    moveId:        'gather_information',
    outcome:       'weak_hit',
    isMatch:       false,
    isProgressMove: false,
    actionDie:     3,
    actionScore:   3,
    challengeDice: [2, 7],
    consequences:  { momentumChange: 1, healthChange: 0, spiritChange: 0, supplyChange: 0 },
    ...overrides,
  };
}

function actorWithMomentum(value, debility = {}) {
  return makeTestActor({
    id: 'pc-burn',
    type: 'character',
    hasPlayerOwner: true,
    system: {
      momentum: { value, max: 10, min: -6, resetValue: 2 },
      debility,
    },
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// buildBurnState
// ─────────────────────────────────────────────────────────────────────────────

describe('buildBurnState', () => {
  it('returns metadata when burn would upgrade a weak hit to a strong hit', () => {
    // weak hit with action score 3 vs [2, 7]. With 7 momentum after consequence
    // (current 6 + 1 from weak-hit), action score becomes 7+1=8 — beats both
    // challenge dice → strong hit.
    const actor = actorWithMomentum(7); // post-consequence 8 beats both [2,7]
    const burn  = buildBurnState(makeResolution(), actor);
    expect(burn).not.toBeNull();
    expect(burn.canBurn).toBe(true);
    expect(burn.momentum).toBe(8);          // post-consequence momentum (7 + 1)
    expect(burn.previewOutcome).toBe('strong_hit');
    expect(burn.moveId).toBe('gather_information');
    expect(burn.challengeDice).toEqual([2, 7]);
    expect(burn.originalOutcome).toBe('weak_hit');
    expect(burn.originalApplied).toBe(false);
  });

  it('returns null when current momentum is zero or negative', () => {
    const actor = actorWithMomentum(-1);
    expect(buildBurnState(makeResolution(), actor)).toBeNull();
  });

  it('returns null on a strong hit (already optimal)', () => {
    const actor = actorWithMomentum(7);
    expect(buildBurnState(makeResolution({ outcome: 'strong_hit' }), actor)).toBeNull();
  });

  it('returns null on a progress move (rules: cannot burn on progress)', () => {
    const actor = actorWithMomentum(7);
    expect(buildBurnState(makeResolution({ isProgressMove: true }), actor)).toBeNull();
  });

  it('returns null when burn would not actually improve the outcome', () => {
    // current 1 momentum, after weak-hit +1 → 2. Challenge dice are [5, 8].
    // Burn would set score to 2, still a miss — outcome unchanged. Not eligible.
    const actor = actorWithMomentum(1);
    const burn  = buildBurnState(
      makeResolution({ outcome: 'miss', challengeDice: [5, 8], consequences: { momentumChange: 0 } }),
      actor,
    );
    expect(burn).toBeNull();
  });

  it('returns null when actor is missing', () => {
    expect(buildBurnState(makeResolution(), null)).toBeNull();
  });

  it('counts marked impacts to determine the post-burn reset value preview', () => {
    // Two impacts → reset to 0. Implementation detail of applyMomentumBurn,
    // but the metadata must reflect the impact count so the click can
    // compute the same reset value the preview implies.
    const actor = actorWithMomentum(7, { wounded: true, shaken: true });
    const burn  = buildBurnState(makeResolution(), actor);
    expect(burn.markedImpactCount).toBe(2);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// renderBurnButtonHtml
// ─────────────────────────────────────────────────────────────────────────────

describe('renderBurnButtonHtml', () => {
  it('renders an empty string when burn state is missing', () => {
    expect(renderBurnButtonHtml(null)).toBe('');
    expect(renderBurnButtonHtml({ canBurn: false })).toBe('');
  });

  it('renders a button with the preview outcome', () => {
    const html = renderBurnButtonHtml({
      canBurn: true, momentum: 8, previewOutcome: 'strong_hit',
    });
    expect(html).toContain('data-action="sf-burn-momentum"');
    expect(html).toContain('8');
    expect(html).toContain('Strong Hit');
  });
});
