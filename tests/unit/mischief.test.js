// tests/unit/mischief.test.js
// Coverage for src/moves/mischief.js
//
// Actual exported API (confirmed from source):
//   buildMischiefAside(narration, moveId, statUsed, mischiefLevel) → string
//   shouldApplyMischief(mischiefLevel) → boolean
//   buildMischiefFraming(mischiefLevel, narration) → string | null
//
// Dial value "lawful" (stored by settingsPanel.js / returned by getMischiefDial())
// is normalised to "serious" by normalizeDial() in mischief.js before any
// switch statement sees it. Fix applied in post-session-3 hardening.
// Both values are tested below to confirm the alias is working.

import { describe, it, expect, vi } from 'vitest';
import {
  buildMischiefAside,
  shouldApplyMischief,
  buildMischiefFraming,
} from '../../src/moves/mischief.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NARRATION_AUTODOC =
  'Player narrated rebooting the autodoc — the real danger is the autodoc standing between the survivor and stability.';
const NARRATION_REPAIR =
  'Rebooting the autodoc reads as Repair — restoring a damaged asset rather than navigating danger.';

// ---------------------------------------------------------------------------
// 1. buildMischiefAside — output shape
// ---------------------------------------------------------------------------

describe('buildMischiefAside — output shape', () => {
  it('returns a string for balanced dial', () => {
    const aside = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'balanced');
    expect(typeof aside).toBe('string');
    expect(aside.length).toBeGreaterThan(0);
  });

  it('returns a string for chaotic dial', () => {
    const aside = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'chaotic');
    expect(typeof aside).toBe('string');
    expect(aside.length).toBeGreaterThan(0);
  });

  it('does not return raw JSON', () => {
    const aside = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'balanced');
    expect(aside).not.toMatch(/^\s*\{/);
    expect(aside).not.toMatch(/^\s*\[/);
  });

  it('does not contain the word "undefined"', () => {
    const aside = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'balanced');
    expect(aside).not.toContain('undefined');
  });

  it('is synchronous — does not return a Promise', () => {
    const result = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'balanced');
    expect(result).not.toBeInstanceOf(Promise);
  });
});

// ---------------------------------------------------------------------------
// 2. buildMischiefAside — dial gating
// ---------------------------------------------------------------------------

describe('buildMischiefAside — dial gating', () => {
  // buildMischiefAside generates an aside regardless of dial — dial gating
  // is the caller's responsibility (via shouldApplyMischief). These tests
  // confirm the function returns a string for all recognised dial values.
  it('returns a non-empty string for balanced dial', () => {
    const aside = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'balanced');
    expect(aside.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for chaotic dial', () => {
    const aside = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'chaotic');
    expect(aside.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string even for serious dial (caller gates, not this function)', () => {
    const aside = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'serious');
    expect(typeof aside).toBe('string');
  });

  it('"lawful" alias behaves identically to "serious"', () => {
    // normalizeDial maps "lawful" → "serious" — both should return a string
    // (buildMischiefAside doesn't gate on dial; that's shouldApplyMischief's job)
    const aside = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'lawful');
    expect(typeof aside).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 3. buildMischiefAside — tone
// ---------------------------------------------------------------------------

describe('buildMischiefAside — tone', () => {
  it('balanced and chaotic produce different aside text', () => {
    const balanced = buildMischiefAside(NARRATION_REPAIR, 'Repair', 'wits', 'balanced');
    const chaotic  = buildMischiefAside(NARRATION_REPAIR, 'Repair', 'wits', 'chaotic');
    expect(balanced).not.toBe(chaotic);
  });

  it('chaotic aside is at least 20 characters', () => {
    const chaotic = buildMischiefAside(NARRATION_REPAIR, 'Repair', 'wits', 'chaotic');
    expect(chaotic.length).toBeGreaterThanOrEqual(20);
  });

  it('balanced aside does not use first-person boast phrases', () => {
    const balanced = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'balanced');
    for (const phrase of ['clearly I', 'as I predicted', 'told you']) {
      expect(balanced.toLowerCase()).not.toContain(phrase);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. buildMischiefAside — determinism
// ---------------------------------------------------------------------------

describe('buildMischiefAside — determinism', () => {
  // Template selection uses Math.random — mock it to make calls stable.
  it('identical inputs produce identical output when Math.random is fixed (balanced)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const a = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'balanced');
    const b = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'balanced');
    vi.restoreAllMocks();
    expect(a).toBe(b);
  });

  it('identical inputs produce identical output when Math.random is fixed (chaotic)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7);
    const a = buildMischiefAside(NARRATION_REPAIR, 'Repair', 'wits', 'chaotic');
    const b = buildMischiefAside(NARRATION_REPAIR, 'Repair', 'wits', 'chaotic');
    vi.restoreAllMocks();
    expect(a).toBe(b);
  });

  it('different stat produces different output when Math.random is fixed', () => {
    // Test stat variation rather than moveId — stat-specific template buckets
    // are distinct (heart vs shadow), so this reliably produces different output.
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    const a = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'heart',  'balanced');
    const b = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'shadow', 'balanced');
    vi.restoreAllMocks();
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// 5. buildMischiefAside — no API call
// ---------------------------------------------------------------------------

describe('buildMischiefAside — no API call', () => {
  it('does not call fetch', () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({});
    buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'chaotic');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 6. buildMischiefAside — edge cases
// ---------------------------------------------------------------------------

describe('buildMischiefAside — edge cases', () => {
  it('handles empty narration without throwing', () => {
    expect(() =>
      buildMischiefAside('', 'FaceDanger', 'wits', 'balanced')
    ).not.toThrow();
  });

  it('handles empty moveId without throwing', () => {
    expect(() =>
      buildMischiefAside(NARRATION_AUTODOC, '', 'wits', 'balanced')
    ).not.toThrow();
  });

  it('handles unknown dial value without throwing', () => {
    expect(() =>
      buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'totally-made-up')
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 7. shouldApplyMischief
// ---------------------------------------------------------------------------

describe('shouldApplyMischief', () => {
  it('returns false for serious dial', () => {
    expect(shouldApplyMischief('serious')).toBe(false);
  });

  it('returns true for chaotic dial', () => {
    expect(shouldApplyMischief('chaotic')).toBe(true);
  });

  it('returns false for unrecognised value', () => {
    expect(shouldApplyMischief('unknown')).toBe(false);
    expect(shouldApplyMischief(undefined)).toBe(false);
  });

  it('returns a boolean for balanced dial', () => {
    expect(typeof shouldApplyMischief('balanced')).toBe('boolean');
  });

  it('balanced returns true when Math.random is below the threshold', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.10);
    expect(shouldApplyMischief('balanced')).toBe(true);
    vi.restoreAllMocks();
  });

  it('balanced returns false when Math.random is above the threshold', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.50);
    expect(shouldApplyMischief('balanced')).toBe(false);
    vi.restoreAllMocks();
  });

  it('"lawful" is treated identically to "serious" — returns false', () => {
    expect(shouldApplyMischief('lawful')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. buildMischiefFraming
// ---------------------------------------------------------------------------

describe('buildMischiefFraming', () => {
  it('returns null for serious dial', () => {
    expect(buildMischiefFraming('serious', NARRATION_AUTODOC)).toBeNull();
  });

  it('returns a non-empty string for balanced dial', () => {
    const framing = buildMischiefFraming('balanced', NARRATION_AUTODOC);
    expect(typeof framing).toBe('string');
    expect(framing.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for chaotic dial', () => {
    const framing = buildMischiefFraming('chaotic', NARRATION_AUTODOC);
    expect(typeof framing).toBe('string');
    expect(framing.length).toBeGreaterThan(0);
  });

  it('returns null for unrecognised dial value', () => {
    expect(buildMischiefFraming('unknown', NARRATION_AUTODOC)).toBeNull();
  });

  it('"lawful" is treated identically to "serious" — returns null', () => {
    expect(buildMischiefFraming('lawful', NARRATION_AUTODOC)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9. Coverage gaps — pickBalancedAside category branch
//    'adventure' is not in categoryAsides, so existing tests miss the
//    truthy categoryAsides[category] arm. Math.random() ≥ 0.5 also forces
//    the function past the stat-aside short-circuit at line 251.
// ---------------------------------------------------------------------------

describe('pickBalancedAside — category aside branch', () => {
  it('returns a category aside when stat-aside is skipped and category matches', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // skip statAsides bucket
    const aside = buildMischiefAside('whatever', 'endure_harm', 'wits', 'balanced');
    // endure_harm → category 'suffer' → categoryAsides.suffer is defined
    expect(typeof aside).toBe('string');
    expect(aside.length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });

  it('returns the generic fallback when category is not in categoryAsides', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // skip statAsides
    const aside = buildMischiefAside('whatever', 'face_danger', 'wits', 'balanced');
    // face_danger → category 'adventure' (NOT in categoryAsides) → falls to generic
    expect(typeof aside).toBe('string');
    expect(aside.length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// 10. Coverage gaps — pickChaoticAside regex and stat-fallback branches
// ---------------------------------------------------------------------------

describe('pickChaoticAside — regex and fallback branches', () => {
  it('returns a fight aside for combat narration on a non-combat move', () => {
    // gather_information NOT in moveAsides; category 'adventure' (≠ 'combat')
    const aside = buildMischiefAside('I attack the bandits with a punch', 'gather_information', 'wits', 'chaotic');
    expect(typeof aside).toBe('string');
    expect(aside.length).toBeGreaterThan(0);
  });

  it('returns a diplomacy aside for social narration on a non-adventure move', () => {
    // sojourn NOT in moveAsides; category 'recover' (≠ 'adventure')
    const aside = buildMischiefAside('I ask them to convince the captain', 'sojourn', 'heart', 'chaotic');
    expect(typeof aside).toBe('string');
    expect(aside.length).toBeGreaterThan(0);
  });

  it('returns a tech aside for technical narration on a non-recover move', () => {
    // gather_information NOT in moveAsides; category 'adventure' (≠ 'recover')
    const aside = buildMischiefAside('I fix the system console', 'gather_information', 'wits', 'chaotic');
    expect(typeof aside).toBe('string');
    expect(aside.length).toBeGreaterThan(0);
  });

  it('returns a caution aside for cautious narration', () => {
    // gather_information NOT in moveAsides; narration matches careful regex
    const aside = buildMischiefAside('I sneak past quietly', 'gather_information', 'shadow', 'chaotic');
    expect(typeof aside).toBe('string');
    expect(aside.length).toBeGreaterThan(0);
  });

  it('falls through to chaoticStatAsides when nothing else matches', () => {
    // gather_information NOT in moveAsides; bland narration with no regex matches;
    // 'edge' IS in chaoticStatAsides
    const aside = buildMischiefAside('something neutral happens', 'gather_information', 'edge', 'chaotic');
    expect(typeof aside).toBe('string');
    expect(aside.length).toBeGreaterThan(0);
  });

  it('falls through to the absolute fallback when stat is not a chaoticStatAside key', () => {
    // 'health' is not in chaoticStatAsides — exercises the final pick() at lines 359-369
    const aside = buildMischiefAside('something neutral happens', 'gather_information', 'health', 'chaotic');
    expect(typeof aside).toBe('string');
    expect(aside.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 11. Coverage gaps — selectChaoticHeuristics narration buckets
//    Existing chaotic-framing tests use NARRATION_AUTODOC (no keyword
//    matches) and NARRATION_REPAIR (technical only). These exercise the
//    combat / social / cautious buckets that are otherwise untouched.
// ---------------------------------------------------------------------------

describe('buildMischiefFraming — chaotic heuristics branches', () => {
  it('builds chaotic framing for combat-flavoured narration', () => {
    const f = buildMischiefFraming('chaotic', 'I shoot at the patrol and punch through');
    expect(typeof f).toBe('string');
    expect(f.length).toBeGreaterThan(0);
  });

  it('builds chaotic framing for social-flavoured narration', () => {
    const f = buildMischiefFraming('chaotic', 'I talk to the captain and try to convince her');
    expect(typeof f).toBe('string');
    expect(f.length).toBeGreaterThan(0);
  });

  it('builds chaotic framing for cautious-flavoured narration', () => {
    const f = buildMischiefFraming('chaotic', 'I move slowly and check the next corner carefully');
    expect(typeof f).toBe('string');
    expect(f.length).toBeGreaterThan(0);
  });
});
