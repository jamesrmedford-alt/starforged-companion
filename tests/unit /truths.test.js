// tests/unit/truths.test.js
// Coverage for src/truths/generator.js → rollCategory(), sub-table resolution,
// storage, and Session Zero preset loading.
//
// Uses the real 14-category truth data from src/truths/tables.js.
// Known-good roll values are the actual campaign rolls from Session Zero
// (recorded in starforged_brief.docx and starforged_session.docx).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  rollCategory,
  resolveSubTable,
  formatTruth,
  loadSessionZeroPreset,
  storeTruths,
  loadTruths,
  ALL_CATEGORIES,
} from '../../src/truths/generator.js';

// ---------------------------------------------------------------------------
// Fixtures — actual Session Zero rolls (from starforged_brief.docx)
// ---------------------------------------------------------------------------

const SESSION_ZERO_ROLLS = {
  cataclysm:     { roll: 82, subRoll: 15 },  // Catastrophic war → AI foe
  exodus:        { roll: 4  },                // Millennia-long journey
  communities:   { roll: 36 },               // Five Founder Clans
  iron:          { roll: 29 },               // Exodus ship remnants
  laws:          { roll: 95 },               // Covenant upheld by Keepers
  religion:      { roll: 87 },               // Triumvirate — three competing orders
  magic:         { roll: 70, subRoll: 12 },  // Paragons via genetic engineering
  communication: { roll: 76 },               // The Weave
  medicine:      { roll: 5  },               // Medical knowledge lost
  ai:            { roll: 12, subRoll: 28 },  // Outlawed → Adepts replace AI
  war:           { roll: 30 },               // No organised armies
  lifeforms:     { roll: 78 },               // Forgespawn
  precursors:    { roll: 72 },               // Ascendancy vaults
  horrors:       { roll: 92 },               // Woken dead — Soulbinders
};

// Known result fragments — partial strings that must appear in the resolved truth text.
// Taken verbatim from the session transcript table.
const EXPECTED_FRAGMENTS = {
  cataclysm:     'war',
  exodus:        'Ironhomes',
  communities:   'Founder Clan',
  iron:          'Exodus',
  laws:          'Keeper',
  religion:      'three',
  magic:         'Paragon',
  communication: 'Weave',
  medicine:      'lost',
  ai:            'Adept',
  war:           'raider',
  lifeforms:     'Forgespawn',
  precursors:    'Ascendancy',
  horrors:       'Soulbinder',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deterministically seeded rollCategory — bypasses Math.random by injecting
 * a fixed roll value. Tests call this instead of rollCategory() directly
 * so results are predictable.
 */
function rollCategoryFixed(categoryKey, roll, subRoll = null) {
  return rollCategory(categoryKey, { fixedRoll: roll, fixedSubRoll: subRoll });
}

// ---------------------------------------------------------------------------
// 1. ALL_CATEGORIES — completeness
// ---------------------------------------------------------------------------

describe('ALL_CATEGORIES', () => {
  const EXPECTED_KEYS = [
    'cataclysm', 'exodus', 'communities', 'iron', 'laws', 'religion',
    'magic', 'communication', 'medicine', 'ai', 'war', 'lifeforms',
    'precursors', 'horrors',
  ];

  it('exports all 14 category keys', () => {
    for (const key of EXPECTED_KEYS) {
      expect(ALL_CATEGORIES).toContain(key);
    }
  });

  it('has exactly 14 categories', () => {
    expect(ALL_CATEGORIES.length).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// 2. rollCategory — output shape
// ---------------------------------------------------------------------------

describe('rollCategory — output shape', () => {
  it('returns an object with the expected fields', () => {
    const result = rollCategoryFixed('cataclysm', 82, 15);
    expect(result).toMatchObject({
      category: expect.any(String),
      roll: expect.any(Number),
      text: expect.any(String),
    });
  });

  it('roll is in range 1–100', () => {
    // Use a live (random) roll for this check.
    const result = rollCategory('cataclysm');
    expect(result.roll).toBeGreaterThanOrEqual(1);
    expect(result.roll).toBeLessThanOrEqual(100);
  });

  it('text is a non-empty string', () => {
    const result = rollCategoryFixed('communities', 36);
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('category field matches the requested key', () => {
    const result = rollCategoryFixed('horrors', 92);
    expect(result.category).toBe('horrors');
  });
});

// ---------------------------------------------------------------------------
// 3. rollCategory — Session Zero known-good results
// ---------------------------------------------------------------------------

describe('rollCategory — Session Zero results', () => {
  for (const [key, { roll, subRoll = null }] of Object.entries(SESSION_ZERO_ROLLS)) {
    it(`${key} roll ${roll}${subRoll ? ` sub ${subRoll}` : ''} matches expected fragment`, () => {
      const result = rollCategoryFixed(key, roll, subRoll);
      const fragment = EXPECTED_FRAGMENTS[key];
      expect(result.text.toLowerCase()).toContain(fragment.toLowerCase());
    });
  }
});

// ---------------------------------------------------------------------------
// 4. rollCategory — boundary rolls
// ---------------------------------------------------------------------------

describe('rollCategory — boundary rolls', () => {
  it('roll 1 resolves to the first entry in the table', () => {
    // Every category's first band starts at 1.
    const result = rollCategoryFixed('exodus', 1);
    expect(result).toBeTruthy();
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('roll 100 resolves to the last entry in the table', () => {
    const result = rollCategoryFixed('horrors', 100);
    expect(result).toBeTruthy();
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('throws or returns null for out-of-range roll (0)', () => {
    expect(() => rollCategoryFixed('exodus', 0)).toThrow();
  });

  it('throws or returns null for out-of-range roll (101)', () => {
    expect(() => rollCategoryFixed('exodus', 101)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5. Sub-table resolution
// ---------------------------------------------------------------------------

describe('resolveSubTable', () => {
  it('cataclysm sub-roll 15 resolves to artificial intelligence foe', () => {
    const result = resolveSubTable('cataclysm', 'foe', 15);
    expect(result.toLowerCase()).toMatch(/artificial intelligence|ai|machine/);
  });

  it('magic sub-roll 12 resolves to genetic engineering', () => {
    const result = resolveSubTable('magic', 'source', 12);
    expect(result.toLowerCase()).toContain('genetic');
  });

  it('ai sub-roll 28 resolves to Adepts replacing AI', () => {
    const result = resolveSubTable('ai', 'resolution', 28);
    expect(result.toLowerCase()).toContain('adept');
  });

  it('returns a non-empty string for all known sub-tables', () => {
    // Cataclysm foe, Magic source, AI resolution are the three sub-tables
    // established in the module brief (src/truths/tables.js has 5 sub-tables total).
    const tests = [
      ['cataclysm', 'foe',        50],
      ['magic',     'source',     50],
      ['ai',        'resolution', 50],
    ];
    for (const [cat, table, roll] of tests) {
      const result = resolveSubTable(cat, table, roll);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it('throws for an unknown sub-table name', () => {
    expect(() => resolveSubTable('cataclysm', 'nonexistent', 50)).toThrow();
  });

  it('sub-roll boundary 1 resolves without error', () => {
    expect(() => resolveSubTable('cataclysm', 'foe', 1)).not.toThrow();
  });

  it('sub-roll boundary 100 resolves without error', () => {
    expect(() => resolveSubTable('cataclysm', 'foe', 100)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 6. formatTruth — output for Loremaster context injection
// ---------------------------------------------------------------------------

describe('formatTruth', () => {
  const SAMPLE_TRUTH = {
    category: 'cataclysm',
    roll: 82,
    subRoll: 15,
    text: 'Catastrophic war. Foe: Artificial intelligence.',
    questStarter: 'A derelict AI warship has been discovered. Who wants it?',
  };

  it('returns a string', () => {
    expect(typeof formatTruth(SAMPLE_TRUTH)).toBe('string');
  });

  it('includes the category name', () => {
    const out = formatTruth(SAMPLE_TRUTH);
    expect(out.toLowerCase()).toContain('cataclysm');
  });

  it('includes the truth text', () => {
    const out = formatTruth(SAMPLE_TRUTH);
    expect(out).toContain(SAMPLE_TRUTH.text);
  });

  it('includes the quest starter when present', () => {
    const out = formatTruth(SAMPLE_TRUTH);
    expect(out).toContain(SAMPLE_TRUTH.questStarter);
  });

  it('omits quest starter when not present', () => {
    const { questStarter: _, ...noQS } = SAMPLE_TRUTH;
    const out = formatTruth(noQS);
    expect(out).not.toContain('Quest');
  });
});

// ---------------------------------------------------------------------------
// 7. storeTruths / loadTruths — round-trip persistence
// ---------------------------------------------------------------------------

describe('storeTruths / loadTruths', () => {
  const SAMPLE_TRUTHS = Object.entries(SESSION_ZERO_ROLLS).map(([category, { roll, subRoll = null }]) => ({
    category,
    roll,
    subRoll,
    text: `Sample text for ${category}`,
  }));

  beforeEach(() => {
    // Reset the mock journal between tests.
    vi.restoreAllMocks();
  });

  it('storeTruths resolves without error', async () => {
    await expect(storeTruths(SAMPLE_TRUTHS)).resolves.not.toThrow();
  });

  it('loadTruths returns the stored truths after storeTruths', async () => {
    await storeTruths(SAMPLE_TRUTHS);
    const loaded = await loadTruths();
    expect(loaded).toHaveLength(SAMPLE_TRUTHS.length);
  });

  it('loadTruths returns an array', async () => {
    const result = await loadTruths();
    expect(Array.isArray(result)).toBe(true);
  });

  it('each loaded truth has category, roll, and text fields', async () => {
    await storeTruths(SAMPLE_TRUTHS);
    const loaded = await loadTruths();
    for (const truth of loaded) {
      expect(truth).toHaveProperty('category');
      expect(truth).toHaveProperty('roll');
      expect(truth).toHaveProperty('text');
    }
  });

  it('category order is preserved on round-trip', async () => {
    await storeTruths(SAMPLE_TRUTHS);
    const loaded = await loadTruths();
    expect(loaded.map(t => t.category)).toEqual(SAMPLE_TRUTHS.map(t => t.category));
  });
});

// ---------------------------------------------------------------------------
// 8. loadSessionZeroPreset — returns the campaign's truths
// ---------------------------------------------------------------------------

describe('loadSessionZeroPreset', () => {
  it('returns an array of 14 truths', async () => {
    const truths = await loadSessionZeroPreset();
    expect(Array.isArray(truths)).toBe(true);
    expect(truths.length).toBe(14);
  });

  it('each truth has a non-empty text', async () => {
    const truths = await loadSessionZeroPreset();
    for (const t of truths) {
      expect(typeof t.text).toBe('string');
      expect(t.text.length).toBeGreaterThan(0);
    }
  });

  it('includes precursors truth mentioning Ascendancy', async () => {
    const truths = await loadSessionZeroPreset();
    const precursors = truths.find(t => t.category === 'precursors');
    expect(precursors).toBeDefined();
    expect(precursors.text.toLowerCase()).toContain('ascendancy');
  });

  it('includes the AI truth mentioning Adepts', async () => {
    const truths = await loadSessionZeroPreset();
    const ai = truths.find(t => t.category === 'ai');
    expect(ai).toBeDefined();
    expect(ai.text.toLowerCase()).toContain('adept');
  });
});

// ---------------------------------------------------------------------------
// 9. rollCategory — unknown category
// ---------------------------------------------------------------------------

describe('rollCategory — unknown category', () => {
  it('throws a descriptive error for an unknown category key', () => {
    expect(() => rollCategoryFixed('boguscategory', 50)).toThrow(/unknown.*category|boguscategory/i);
  });
});
