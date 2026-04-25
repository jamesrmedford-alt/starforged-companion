// tests/unit/mischief.test.js
// Coverage for src/moves/mischief.js
//
// Actual exported API (confirmed from source):
//   buildMischiefAside(narration, moveId, statUsed, mischiefLevel) → string
//   shouldApplyMischief(mischiefLevel) → boolean
//   buildMischiefFraming(mischiefLevel, narration) → string | null
//
// NOTE — dial naming mismatch (tracked bug):
//   mischief.js uses "serious" | "balanced" | "chaotic"
//   settingsPanel.js stores "lawful" | "balanced" | "chaotic"
//   index.js passes getMischiefDial() → "lawful" to mischief.js which
//   does not recognise it and falls through to default (null / no framing).
//   Tests here use mischief.js actual values until mischief.js is updated
//   to accept "lawful" as an alias for "serious".

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

  it('different moveId produces different output when Math.random is fixed', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const a = buildMischiefAside(NARRATION_AUTODOC, 'FaceDanger', 'wits', 'balanced');
    const b = buildMischiefAside(NARRATION_AUTODOC, 'Repair',     'wits', 'balanced');
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
});
