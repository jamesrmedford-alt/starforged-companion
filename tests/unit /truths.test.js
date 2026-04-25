// tests/unit/truths.test.js
// Coverage for src/truths/generator.js
//
// Real exported API (confirmed from source):
//   rollCategory(categoryId, {roll?, subRoll?})  → TruthResult
//   applyRoll(categoryId, roll, subRoll?)         → TruthResult
//   buildSessionZeroTruths()                      → Object (keyed by categoryId)
//   storeWorldTruths(truthSet, campaignState)     → Promise
//   loadWorldTruths(campaignState)                → Object|null
//   formatForContext(truthSet)                    → string
//   formatSingleTruth(truth)                      → string
//   hasTruths(campaignState)                      → boolean
//
// Real TruthResult shape:
//   { categoryId, categoryName, roll, title, description, questStarter,
//     subTableId, subTableLabel, subRoll, subResult }
//
// TRUTH_CATEGORIES is exported from tables.js (not generator.js).

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
// Fixtures — Session Zero rolls (from starforged_brief.docx)
// ---------------------------------------------------------------------------

const SESSION_ZERO_ROLLS = {
  cataclysm:     { roll: 82, subRoll: 15 },
  exodus:        { roll: 4 },
  communities:   { roll: 36 },
  iron:          { roll: 29 },
  laws:          { roll: 95 },
  religion:      { roll: 87 },
  magic:         { roll: 70, subRoll: 12 },
  communication: { roll: 76 },
  medicine:      { roll: 5 },
  ai:            { roll: 12, subRoll: 28 },
  war:           { roll: 30 },
  lifeforms:     { roll: 78 },
  precursors:    { roll: 72 },
  horrors:       { roll: 92 },
};

// Expected fragments — searched in title + description combined
const TITLE_FRAGMENTS = {
  cataclysm:     'war',
  exodus:        'Ironhome',
  communities:   'Clan',
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

// Sub-result fragments (only for categories with sub-rolls)
const SUB_FRAGMENTS = {
  cataclysm: /artificial intelligence|ai|machine/i,
  magic:     /genetic/i,
  ai:        /adept/i,
};

// Helper: searchable text from a TruthResult (title + description)
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
});

// ---------------------------------------------------------------------------
// 3. rollCategory — Session Zero known-good results
// ---------------------------------------------------------------------------

describe('rollCategory — Session Zero results', () => {
  for (const [key, { roll, subRoll = null }] of Object.entries(SESSION_ZERO_ROLLS)) {
    it(`${key} roll ${roll}${subRoll ? ` sub ${subRoll}` : ''} matches expected fragment`, () => {
      const result = rollCategory(key, { roll, subRoll: subRoll ?? undefined });
      const fragment = TITLE_FRAGMENTS[key];
      expect(fullText(result)).toContain(fragment.toLowerCase());
    });
  }

  it('cataclysm sub-roll 15 resolves subResult to AI foe', () => {
    const result = rollCategory('cataclysm', { roll: 82, subRoll: 15 });
    expect(result.subResult).not.toBeNull();
    expect(result.subResult.toLowerCase()).toMatch(SUB_FRAGMENTS.cataclysm);
  });

  it('magic sub-roll 12 resolves subResult to genetic engineering', () => {
    const result = rollCategory('magic', { roll: 70, subRoll: 12 });
    expect(result.subResult).not.toBeNull();
    expect(result.subResult.toLowerCase()).toMatch(SUB_FRAGMENTS.magic);
  });

  it('ai sub-roll 28 resolves subResult to Adepts', () => {
    const result = rollCategory('ai', { roll: 12, subRoll: 28 });
    expect(result.subResult).not.toBeNull();
    expect(result.subResult.toLowerCase()).toMatch(SUB_FRAGMENTS.ai);
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

  it('throws a descriptive error for an unknown category', () => {
    expect(() => rollCategory('boguscategory', { roll: 50 }))
      .toThrow(/unknown|boguscategory/i);
  });
});

// ---------------------------------------------------------------------------
// 5. applyRoll
// ---------------------------------------------------------------------------

describe('applyRoll', () => {
  it('produces the same result as rollCategory with the same roll', () => {
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

  it('cataclysm has a subResult (AI foe)', () => {
    const truths = buildSessionZeroTruths();
    expect(truths.cataclysm.subResult).not.toBeNull();
    expect(truths.cataclysm.subResult.toLowerCase())
      .toMatch(/artificial intelligence|ai|machine/i);
  });

  it('precursors truth mentions Ascendancy', () => {
    const truths = buildSessionZeroTruths();
    expect(fullText(truths.precursors)).toContain('ascendancy');
  });

  it('ai truth mentions Adept', () => {
    const truths = buildSessionZeroTruths();
    expect(fullText(truths.ai)).toContain('adept');
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
    const loaded = loadWorldTruths(campaignState);
    expect(loaded).toBe(truths);
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
    const truths = buildSessionZeroTruths();
    const out = formatForContext(truths);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('includes a WORLD TRUTHS header', () => {
    const out = formatForContext(buildSessionZeroTruths());
    expect(out).toMatch(/WORLD TRUTHS/i);
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
    const truth = applyRoll('precursors', 72);
    expect(formatSingleTruth(truth).length).toBeGreaterThan(0);
  });

  it('includes the category name', () => {
    const truth = applyRoll('horrors', 92);
    expect(formatSingleTruth(truth)).toContain(truth.categoryName);
  });

  it('includes the sub-result when present', () => {
    const truth = applyRoll('cataclysm', 82, 15);
    const formatted = formatSingleTruth(truth);
    expect(formatted).toContain(truth.subResult);
  });

  it('returns empty string for null input', () => {
    expect(formatSingleTruth(null)).toBe('');
  });
});
