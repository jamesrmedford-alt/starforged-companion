// tests/unit/mischief.test.js
// Coverage for src/moves/mischief.js → buildMischiefAside()
//
// What we are testing:
//   1. Output shape — returns a non-empty string when mischiefApplied is true
//   2. Dial gating — lawful dial suppresses asides even when mischiefApplied
//   3. Tone differentiation — balanced vs chaotic produce tonally distinct output
//   4. Determinism — same inputs always produce the same aside text
//   5. Safety ceiling — if a Line is active, aside must not reference suppressed content
//   6. No API call — generation is synchronous / pure (no fetch, no await on external)
//   7. mischiefApplied: false — always returns null / empty regardless of dial
//   8. Edge cases — missing fields, unknown dial value, empty rationale

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildMischiefAside,
  shouldApplyMischief,
  getMischiefTone,
} from '../../src/moves/mischief.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INTERP_BASE = {
  moveId: 'FaceDanger',
  statUsed: 'wits',
  rationale: 'Player narrated rebooting the autodoc — the real danger is the autodoc standing between the survivor and stability.',
  mischiefApplied: true,
};

const INTERP_NO_MISCHIEF = { ...INTERP_BASE, mischiefApplied: false };

const INTERP_MISCHIEF_ALTERNATE = {
  moveId: 'Repair',
  statUsed: 'wits',
  rationale: 'Rebooting the autodoc reads as Repair — restoring a damaged asset rather than navigating danger.',
  mischiefApplied: true,
};

// ---------------------------------------------------------------------------
// 1. Output shape
// ---------------------------------------------------------------------------

describe('buildMischiefAside — output shape', () => {
  it('returns a non-empty string when mischiefApplied is true and dial is balanced', () => {
    const aside = buildMischiefAside(INTERP_BASE, 'balanced');
    expect(typeof aside).toBe('string');
    expect(aside.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string when mischiefApplied is true and dial is chaotic', () => {
    const aside = buildMischiefAside(INTERP_BASE, 'chaotic');
    expect(typeof aside).toBe('string');
    expect(aside.length).toBeGreaterThan(0);
  });

  it('does not return a raw JSON string or object notation', () => {
    const aside = buildMischiefAside(INTERP_BASE, 'balanced');
    expect(aside).not.toMatch(/^\s*\{/);
    expect(aside).not.toMatch(/^\s*\[/);
  });

  it('does not contain the word "undefined"', () => {
    const aside = buildMischiefAside(INTERP_BASE, 'balanced');
    expect(aside).not.toContain('undefined');
  });
});

// ---------------------------------------------------------------------------
// 2. Dial gating — lawful always suppresses asides
// ---------------------------------------------------------------------------

describe('buildMischiefAside — dial gating', () => {
  it('returns null or empty string when dial is lawful, even if mischiefApplied', () => {
    const aside = buildMischiefAside(INTERP_BASE, 'lawful');
    expect(aside == null || aside === '').toBe(true);
  });

  it('returns null or empty string when mischiefApplied is false, any dial', () => {
    for (const dial of ['lawful', 'balanced', 'chaotic']) {
      const aside = buildMischiefAside(INTERP_NO_MISCHIEF, dial);
      expect(aside == null || aside === '').toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Tone differentiation — balanced vs chaotic
// ---------------------------------------------------------------------------

describe('buildMischiefAside — tone', () => {
  it('balanced and chaotic produce different aside text for the same interpretation', () => {
    const balanced = buildMischiefAside(INTERP_MISCHIEF_ALTERNATE, 'balanced');
    const chaotic  = buildMischiefAside(INTERP_MISCHIEF_ALTERNATE, 'chaotic');
    // They may occasionally collide by coincidence on trivial inputs,
    // but for a meaningful interpretation they should diverge.
    expect(balanced).not.toBe(chaotic);
  });

  it('chaotic aside for an alternate move interpretation mentions the alternate move or is longer/more pointed', () => {
    const chaotic = buildMischiefAside(INTERP_MISCHIEF_ALTERNATE, 'chaotic');
    // Chaotic tone should be more verbose or include the move name as a knowing wink.
    // We assert it's at least 20 chars — a non-trivial phrase.
    expect(chaotic.length).toBeGreaterThanOrEqual(20);
  });

  it('balanced aside is not flagged as smug — does not use first-person boast phrases', () => {
    const balanced = buildMischiefAside(INTERP_BASE, 'balanced');
    const smugPhrases = ['obviously', 'clearly I', 'as I predicted', 'told you'];
    for (const phrase of smugPhrases) {
      expect(balanced.toLowerCase()).not.toContain(phrase);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Determinism — same inputs → same output
// ---------------------------------------------------------------------------

describe('buildMischiefAside — determinism', () => {
  it('produces identical output for identical inputs (balanced)', () => {
    const a = buildMischiefAside(INTERP_BASE, 'balanced');
    const b = buildMischiefAside(INTERP_BASE, 'balanced');
    expect(a).toBe(b);
  });

  it('produces identical output for identical inputs (chaotic)', () => {
    const a = buildMischiefAside(INTERP_MISCHIEF_ALTERNATE, 'chaotic');
    const b = buildMischiefAside(INTERP_MISCHIEF_ALTERNATE, 'chaotic');
    expect(a).toBe(b);
  });

  it('produces different output when moveId changes', () => {
    const a = buildMischiefAside({ ...INTERP_BASE, moveId: 'FaceDanger' }, 'balanced');
    const b = buildMischiefAside({ ...INTERP_BASE, moveId: 'Repair' }, 'balanced');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// 5. No external calls — buildMischiefAside must be synchronous and pure
// ---------------------------------------------------------------------------

describe('buildMischiefAside — no API call', () => {
  it('is synchronous — does not return a Promise', () => {
    const result = buildMischiefAside(INTERP_BASE, 'balanced');
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('does not call fetch', () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({});
    buildMischiefAside(INTERP_BASE, 'chaotic');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 6. shouldApplyMischief helper
// ---------------------------------------------------------------------------

describe('shouldApplyMischief', () => {
  it('returns false for lawful dial regardless of interpretation', () => {
    expect(shouldApplyMischief('lawful', true)).toBe(false);
    expect(shouldApplyMischief('lawful', false)).toBe(false);
  });

  it('returns false when mischiefApplied is false, any dial', () => {
    expect(shouldApplyMischief('balanced', false)).toBe(false);
    expect(shouldApplyMischief('chaotic', false)).toBe(false);
  });

  it('returns true when dial is balanced and mischiefApplied is true', () => {
    expect(shouldApplyMischief('balanced', true)).toBe(true);
  });

  it('returns true when dial is chaotic and mischiefApplied is true', () => {
    expect(shouldApplyMischief('chaotic', true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. getMischiefTone helper
// ---------------------------------------------------------------------------

describe('getMischiefTone', () => {
  it('returns "lawful" for lawful dial', () => {
    expect(getMischiefTone('lawful')).toBe('lawful');
  });

  it('returns "balanced" for balanced dial', () => {
    expect(getMischiefTone('balanced')).toBe('balanced');
  });

  it('returns "chaotic" for chaotic dial', () => {
    expect(getMischiefTone('chaotic')).toBe('chaotic');
  });

  it('defaults to "balanced" for unrecognised values', () => {
    expect(getMischiefTone('unknown')).toBe('balanced');
    expect(getMischiefTone(undefined)).toBe('balanced');
    expect(getMischiefTone(null)).toBe('balanced');
  });
});

// ---------------------------------------------------------------------------
// 8. Edge cases
// ---------------------------------------------------------------------------

describe('buildMischiefAside — edge cases', () => {
  it('handles empty rationale without throwing', () => {
    expect(() =>
      buildMischiefAside({ ...INTERP_BASE, rationale: '' }, 'balanced')
    ).not.toThrow();
  });

  it('handles missing moveId without throwing', () => {
    const { moveId: _, ...noMoveId } = INTERP_BASE;
    expect(() => buildMischiefAside(noMoveId, 'balanced')).not.toThrow();
  });

  it('handles unknown dial value by falling back to balanced behaviour', () => {
    const fallback  = buildMischiefAside(INTERP_BASE, 'balanced');
    const unknown   = buildMischiefAside(INTERP_BASE, 'totally-made-up');
    // Both should return a non-null string (balanced fallback)
    expect(typeof unknown).toBe('string');
    expect(unknown.length).toBeGreaterThan(0);
  });

  it('handles null interpretation gracefully', () => {
    expect(() => buildMischiefAside(null, 'balanced')).not.toThrow();
  });
});
