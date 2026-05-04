// tests/unit/truths.test.js
// Coverage for src/truths/generator.js
//
// IMPORTANT — published tables vs campaign notes:
//   The Session Zero roll values in starforged_brief.docx describe the GM's
//   custom interpretation of the results. The actual published table entries
//   at those roll values differ in some categories. Tests here assert against
//   what the tables.js source actually contains at each roll value.
//
//   Discrepancies (roll → actual table entry, not campaign note):
//     magic roll 70     → 68-100 "Unnatural energies / mystics" (not Paragons)
//                          68-100 has NO sub-table; subResult is null for this roll
//     lifeforms roll 78 → 68-100 "Essentia" (not Forgespawn)
//     precursors roll 72→ 68-100 "remnants / biomechanical" (not Ascendancy)
//     ai sub-roll 28    → ai_reason 1-33 "energies corrupt" (sub-result, not main title)
//                          main title (roll 12, 1-33) contains "Adepts"

import { describe, it, expect, beforeEach } from 'vitest';
import { TRUTH_CATEGORIES } from '../../src/truths/tables.js';
import {
  rollCategory,
  applyRoll,
  buildSessionZeroTruths,
  storeWorldTruths,
  loadWorldTruths,
  formatForContext,
  formatSingleTruth,
  hasTruths,
} from '../../src/truths/generator.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function fullText(result) {
  return `${result.title ?? ''} ${result.description ?? ''}`.toLowerCase();
}

// ---------------------------------------------------------------------------
// 1. TRUTH_CATEGORIES — completeness
// ---------------------------------------------------------------------------

describe('TRUTH_CATEGORIES', () => {
  const EXPECTED_KEYS = [
    'cataclysm', 'exodus', 'communities', 'iron', 'laws', 'religion',
    'magic', 'communication', 'medicine', 'ai', 'war', 'lifeforms',
    'precursors', 'horrors',
  ];

  it('contains all 14 category keys', () => {
    for (const key of EXPECTED_KEYS) {
      expect(TRUTH_CATEGORIES).toContain(key);
    }
  });

  it('has exactly 14 entries', () => {
    expect(TRUTH_CATEGORIES.length).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// 2. rollCategory — output shape
// ---------------------------------------------------------------------------

describe('rollCategory — output shape', () => {
  it('returns a TruthResult with all expected fields', () => {
    const result = rollCategory('cataclysm', { roll: 82, subRoll: 15 });
    expect(result).toMatchObject({
      categoryId:   expect.any(String),
      categoryName: expect.any(String),
      roll:         expect.any(Number),
      title:        expect.any(String),
      description:  expect.any(String),
    });
  });

  it('categoryId matches the requested key', () => {
    const result = rollCategory('horrors', { roll: 92 });
    expect(result.categoryId).toBe('horrors');
  });

  it('roll is preserved on the result', () => {
    const result = rollCategory('exodus', { roll: 4 });
    expect(result.roll).toBe(4);
  });

  it('title is a non-empty string', () => {
    const result = rollCategory('communities', { roll: 36 });
    expect(result.title.length).toBeGreaterThan(0);
  });

  it('roll is in range 1–100 for a random roll', () => {
    const result = rollCategory('cataclysm');
    expect(result.roll).toBeGreaterThanOrEqual(1);
    expect(result.roll).toBeLessThanOrEqual(100);
  });

  it('throws a descriptive error for an unknown category', () => {
    expect(() => rollCategory('boguscategory', { roll: 50 }))
      .toThrow(/unknown|boguscategory/i);
  });
});

// ---------------------------------------------------------------------------
// 3. rollCategory — Session Zero results (actual table values)
// ---------------------------------------------------------------------------

describe('rollCategory — Session Zero results', () => {

  it('cataclysm roll 82 → catastrophic war entry', () => {
    const r = rollCategory('cataclysm', { roll: 82 });
    expect(fullText(r)).toContain('war');
  });

  it('cataclysm sub-roll 15 → Artificial intelligence foe', () => {
    const r = rollCategory('cataclysm', { roll: 82, subRoll: 15 });
    expect(r.subResult).not.toBeNull();
    expect(r.subResult.toLowerCase()).toMatch(/artificial intelligence/i);
  });

  it('exodus roll 4 → first entry resolves without error', () => {
    const r = rollCategory('exodus', { roll: 4 });
    expect(r.title.length).toBeGreaterThan(0);
  });

  it('communities roll 36 → resolves without error', () => {
    const r = rollCategory('communities', { roll: 36 });
    expect(r.title.length).toBeGreaterThan(0);
  });

  it('iron roll 29 → Exodus ships entry', () => {
    const r = rollCategory('iron', { roll: 29 });
    expect(fullText(r)).toContain('exodus');
  });

  it('laws roll 95 → Keepers entry', () => {
    const r = rollCategory('laws', { roll: 95 });
    expect(fullText(r)).toContain('keeper');
  });

  it('religion roll 87 → Triumvirate / three orders', () => {
    const r = rollCategory('religion', { roll: 87 });
    expect(fullText(r)).toContain('three');
  });

  it('magic roll 70 → mystics / unnatural energies entry (68-100)', () => {
    // Roll 70 hits the 68-100 band — "Unnatural energies / mystics", not Paragons
    const r = rollCategory('magic', { roll: 70 });
    expect(fullText(r)).toMatch(/mystic|unnatural|energi/i);
  });

  it('magic roll 70 → subResult is null (68-100 entry has no sub-table)', () => {
    const r = rollCategory('magic', { roll: 70, subRoll: 12 });
    expect(r.subResult).toBeNull();
  });

  it('magic roll 50 (paragons entry) → has subResult when subRoll provided', () => {
    // Roll 50 hits the 34-67 paragons entry which has magic_origin sub-table
    const r = rollCategory('magic', { roll: 50, subRoll: 12 });
    expect(r.subResult).not.toBeNull();
    expect(r.subResult.toLowerCase()).toContain('genetic');
  });

  it('communication roll 76 → resolves without error', () => {
    const r = rollCategory('communication', { roll: 76 });
    expect(r.title.length).toBeGreaterThan(0);
  });

  it('medicine roll 5 → resolves without error', () => {
    const r = rollCategory('medicine', { roll: 5 });
    expect(r.title.length).toBeGreaterThan(0);
  });

  it('ai roll 12 → Adepts entry (1-33)', () => {
    // Roll 12 hits 1-33 which is the "Adepts" entry
    const r = rollCategory('ai', { roll: 12 });
    expect(fullText(r)).toContain('adept');
  });

  it('ai roll 12 sub-roll 28 → sub-result is "energies corrupt"', () => {
    // ai_reason sub-table: 1-33 = "The energies of the Forge corrupt advanced systems"
    const r = rollCategory('ai', { roll: 12, subRoll: 28 });
    expect(r.subResult).not.toBeNull();
    expect(r.subResult.toLowerCase()).toContain('energies');
  });

  it('war roll 30 → raiders entry', () => {
    const r = rollCategory('war', { roll: 30 });
    expect(fullText(r)).toContain('raider');
  });

  it('lifeforms roll 78 → Essentia entry (68-100)', () => {
    // Roll 78 hits 68-100 = "Essentia" — not Forgespawn (which is 34-67)
    const r = rollCategory('lifeforms', { roll: 78 });
    expect(fullText(r)).toContain('essentia');
  });

  it('lifeforms roll 50 → Forgespawn entry (34-67)', () => {
    const r = rollCategory('lifeforms', { roll: 50 });
    expect(fullText(r)).toContain('forgespawn');
  });

  it('precursors roll 72 → 68-100 entry (remnants)', () => {
    // Roll 72 hits 68-100 — Ascendancy is 34-67
    const r = rollCategory('precursors', { roll: 72 });
    expect(fullText(r)).toMatch(/remnant|biomechanical/i);
  });

  it('precursors roll 50 → Ascendancy entry (34-67)', () => {
    const r = rollCategory('precursors', { roll: 50 });
    expect(fullText(r)).toContain('ascendancy');
  });

  it('horrors roll 92 → Soulbinders entry', () => {
    const r = rollCategory('horrors', { roll: 92 });
    expect(fullText(r)).toContain('soulbinder');
  });
});

// ---------------------------------------------------------------------------
// 4. rollCategory — boundary rolls
// ---------------------------------------------------------------------------

describe('rollCategory — boundary rolls', () => {
  it('roll 1 resolves without error', () => {
    const result = rollCategory('exodus', { roll: 1 });
    expect(result.title.length).toBeGreaterThan(0);
  });

  it('roll 100 resolves without error', () => {
    const result = rollCategory('horrors', { roll: 100 });
    expect(result.title.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. applyRoll
// ---------------------------------------------------------------------------

describe('applyRoll', () => {
  it('produces the same result as rollCategory with matching options', () => {
    const a = applyRoll('laws', 95);
    const b = rollCategory('laws', { roll: 95 });
    expect(a.categoryId).toBe(b.categoryId);
    expect(a.title).toBe(b.title);
    expect(a.roll).toBe(b.roll);
  });

  it('resolves sub-roll when provided', () => {
    const result = applyRoll('cataclysm', 82, 15);
    expect(result.subResult).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. buildSessionZeroTruths
// ---------------------------------------------------------------------------

describe('buildSessionZeroTruths', () => {
  it('returns an object with all 14 category keys', () => {
    const truths = buildSessionZeroTruths();
    for (const key of TRUTH_CATEGORIES) {
      expect(truths).toHaveProperty(key);
    }
  });

  it('each truth has categoryId, title, and roll', () => {
    const truths = buildSessionZeroTruths();
    for (const truth of Object.values(truths)) {
      expect(truth).toHaveProperty('categoryId');
      expect(truth).toHaveProperty('title');
      expect(truth).toHaveProperty('roll');
    }
  });

  it('cataclysm has a subResult (AI foe from roll 82 + sub-roll 15)', () => {
    const truths = buildSessionZeroTruths();
    expect(truths.cataclysm.subResult).not.toBeNull();
    expect(truths.cataclysm.subResult.toLowerCase())
      .toContain('artificial intelligence');
  });

  it('ai truth title contains "Adept" (roll 12 hits 1-33)', () => {
    const truths = buildSessionZeroTruths();
    expect(fullText(truths.ai)).toContain('adept');
  });

  it('horrors truth contains "Soulbinder"', () => {
    const truths = buildSessionZeroTruths();
    expect(fullText(truths.horrors)).toContain('soulbinder');
  });

  it('war truth contains "raider"', () => {
    const truths = buildSessionZeroTruths();
    expect(fullText(truths.war)).toContain('raider');
  });
});

// ---------------------------------------------------------------------------
// 7. storeWorldTruths / loadWorldTruths — round-trip
// ---------------------------------------------------------------------------

describe('storeWorldTruths / loadWorldTruths', () => {
  let campaignState;

  beforeEach(() => {
    campaignState = { worldTruths: null };
  });

  it('storeWorldTruths sets worldTruths on campaignState', async () => {
    const truths = buildSessionZeroTruths();
    await storeWorldTruths(truths, campaignState);
    expect(campaignState.worldTruths).toBe(truths);
  });

  it('loadWorldTruths returns null when no truths stored', () => {
    expect(loadWorldTruths(campaignState)).toBeNull();
  });

  it('loadWorldTruths returns truths after they are stored', async () => {
    const truths = buildSessionZeroTruths();
    await storeWorldTruths(truths, campaignState);
    expect(loadWorldTruths(campaignState)).toBe(truths);
  });
});

// ---------------------------------------------------------------------------
// 8. hasTruths
// ---------------------------------------------------------------------------

describe('hasTruths', () => {
  it('returns false when worldTruths is null', () => {
    expect(hasTruths({ worldTruths: null })).toBe(false);
  });

  it('returns false when worldTruths is empty object', () => {
    expect(hasTruths({ worldTruths: {} })).toBe(false);
  });

  it('returns true when all 14 truths are present', async () => {
    const campaignState = { worldTruths: null };
    await storeWorldTruths(buildSessionZeroTruths(), campaignState);
    expect(hasTruths(campaignState)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. formatForContext
// ---------------------------------------------------------------------------

describe('formatForContext', () => {
  it('returns a non-empty string', () => {
    expect(formatForContext(buildSessionZeroTruths()).length).toBeGreaterThan(0);
  });

  it('includes a WORLD TRUTHS header', () => {
    expect(formatForContext(buildSessionZeroTruths())).toMatch(/WORLD TRUTHS/i);
  });

  it('includes all 14 category names', () => {
    const truths = buildSessionZeroTruths();
    const out = formatForContext(truths);
    for (const truth of Object.values(truths)) {
      expect(out).toContain(truth.categoryName);
    }
  });

  it('returns empty string for null input', () => {
    expect(formatForContext(null)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 10. formatSingleTruth
// ---------------------------------------------------------------------------

describe('formatSingleTruth', () => {
  it('returns a non-empty string', () => {
    expect(formatSingleTruth(applyRoll('horrors', 92)).length).toBeGreaterThan(0);
  });

  it('includes the category name', () => {
    const truth = applyRoll('horrors', 92);
    expect(formatSingleTruth(truth)).toContain(truth.categoryName);
  });

  it('includes the sub-result when present', () => {
    const truth = applyRoll('cataclysm', 82, 15);
    expect(formatSingleTruth(truth)).toContain(truth.subResult);
  });

  it('returns empty string for null input', () => {
    expect(formatSingleTruth(null)).toBe('');
  });
});
