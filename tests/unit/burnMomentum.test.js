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
import {
  buildBurnState,
  renderBurnButtonHtml,
  buildSupersededNarrationContent,
  supersedeOriginalNarration,
} from '../../src/moves/burnMomentum.js';

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

  it('stores ptpReversals when provided', () => {
    const actor = actorWithMomentum(7);
    const ptpReversals = {
      clocksAdvanced: [{ _id: 't1', name: 'Dani', type: 'tension' }],
      sufferMeterDelta: { move: 'endure_harm', amount: 1, meterKey: 'health' },
    };
    const burn = buildBurnState(
      makeResolution({ outcome: 'miss', challengeDice: [2, 5], consequences: { momentumChange: 0 } }),
      actorWithMomentum(8),
      ptpReversals,
    );
    expect(burn?.ptpReversals).toEqual(ptpReversals);
  });

  it('stores null ptpReversals when not provided', () => {
    const actor = actorWithMomentum(7);
    const burn = buildBurnState(makeResolution(), actor);
    expect(burn?.ptpReversals).toBeNull();
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

// F13a: burning momentum supersedes the original (now stale) narration card.
describe('buildSupersededNarrationContent (F13a)', () => {
  const card = (prose) =>
    `<div class="sf-narration-card"><div class="sf-narration-label">◈ Narrator</div>` +
    `<div class="sf-narration-prose">${prose}</div></div>`;

  it('strikes through the prose and adds a superseded note', () => {
    const out = buildSupersededNarrationContent(card('The door jams shut.'));
    expect(out).toContain('sf-narration-superseded');
    expect(out).toContain('<s>The door jams shut.</s>');
    expect(out).toMatch(/Superseded/i);
  });

  it('is idempotent — re-applying does not double-wrap', () => {
    const once  = buildSupersededNarrationContent(card('x'));
    const twice = buildSupersededNarrationContent(once);
    expect(twice).toBe(once);
  });
});

describe('supersedeOriginalNarration (F13a)', () => {
  const MODULE_ID = 'starforged-companion';

  function fakeCard(resolutionId, extraFlags = {}) {
    return {
      content: '<div class="sf-narration-card"><div class="sf-narration-prose">stale prose</div></div>',
      flags: { [MODULE_ID]: { narratorCard: true, resolutionId, ...extraFlags } },
      updated: null,
      async update(data) { this.updated = data; Object.assign(this, { content: data.content ?? this.content }); },
    };
  }

  it('marks the matching narration card superseded', async () => {
    const target = fakeCard('res-1');
    const other  = fakeCard('res-2');
    global.game.messages = { contents: [other, target] };

    await supersedeOriginalNarration({ resolutionId: 'res-1' });

    expect(target.updated).not.toBeNull();
    expect(target.updated[`flags.${MODULE_ID}.burnSuperseded`]).toBe(true);
    expect(target.updated.content).toContain('sf-narration-superseded');
    expect(other.updated).toBeNull(); // untouched
  });

  it('is a no-op when no resolutionId or no match', async () => {
    const card = fakeCard('res-9');
    global.game.messages = { contents: [card] };
    await supersedeOriginalNarration({ resolutionId: null });
    await supersedeOriginalNarration({ resolutionId: 'nope' });
    expect(card.updated).toBeNull();
  });

  it('skips a card already superseded', async () => {
    const card = fakeCard('res-3', { burnSuperseded: true });
    global.game.messages = { contents: [card] };
    await supersedeOriginalNarration({ resolutionId: 'res-3' });
    expect(card.updated).toBeNull();
  });
});
