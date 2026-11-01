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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TRUTH_CATEGORIES } from '../../src/truths/tables.js';
import {
  rollCategory,
  rollWorldTruths,
  storeWorldTruths,
  formatForContext,
} from '../../src/truths/generator.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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

// ---------------------------------------------------------------------------
// 6. buildSessionZeroTruths
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 7. storeWorldTruths (the Playtest Quickstart's World Truths phase)
// ---------------------------------------------------------------------------

// Issue #321 U67: storeWorldTruths never set worldTruthsSet /
// worldTruthsJournalId — only the system-dialog hooks did, and they skip a
// journal carrying this module's flags — so every world load still said "No
// World Truths have been established". It also found its journal by name and
// rewrote the first page of a GM's own "World Truths" notes.
describe('storeWorldTruths', () => {
  const KEY = 'starforged-companion.campaignState';
  const MODULE_ID = 'starforged-companion';
  const savedJournal = game.journal;
  const savedCreate  = JournalEntry.create;

  /** A journal collection holding `docs`, with JournalEntry.create adding to it. */
  function journalWorld(docs = []) {
    const created = [];
    game.journal = {
      get:      (id) => docs.find(d => d.id === id) ?? null,
      getName:  (name) => docs.find(d => d.name === name) ?? null,
      contents: docs,
    };
    JournalEntry.create = async (data) => {
      const entry = makeJournal(`j-new-${created.length + 1}`, data.name, data.flags ?? {}, []);
      docs.push(entry);
      created.push(entry);
      return entry;
    };
    return { created };
  }

  function makeJournal(id, name, flags, pages) {
    const entry = {
      id, name, flags, pages: { contents: pages },
      createEmbeddedDocuments: async (_type, data) => {
        const made = data.map((d, i) => makePage(`${id}-p${pages.length + i}`, d.name, d.text?.content ?? '', d.flags ?? {}));
        pages.push(...made);
        return made;
      },
    };
    return entry;
  }

  function makePage(id, name, content, flags) {
    const page = {
      id, name, flags, text: { content },
      update: async (changes) => {
        if (changes['text.content'] !== undefined) page.text.content = changes['text.content'];
        if (changes.flags) page.flags = changes.flags;
        return page;
      },
    };
    return page;
  }

  beforeEach(() => {
    game.settings._store.set(KEY, JSON.parse(JSON.stringify(CampaignStateSchema)));
  });
  afterEach(() => {
    game.journal = savedJournal;
    JournalEntry.create = savedCreate;
  });

  it('records the truths as established: worldTruthsSet and worldTruthsJournalId alongside worldTruths', async () => {
    journalWorld();
    const campaignState = game.settings.get(MODULE_ID, 'campaignState');
    const journal = await storeWorldTruths(rollWorldTruths(), campaignState);

    const stored = game.settings._store.get(KEY);
    expect(Object.keys(stored.worldTruths)).toHaveLength(14);
    expect(journal?.id).toBeTruthy();
    expect(stored.worldTruthsSet).toBe(true);
    expect(stored.worldTruthsJournalId).toBe(journal.id);
  });

  it('a GM journal named "World Truths" (no module flag) keeps its content — the module writes its own', async () => {
    const gmNotes = makePage('p-gm', 'My setting notes', "<p>The GM's own truths, written by hand.</p>", {});
    const gmJournal = makeJournal('j-gm-notes', 'World Truths', {}, [gmNotes]);
    const { created } = journalWorld([gmJournal]);

    const journal = await storeWorldTruths(rollWorldTruths(), game.settings.get(MODULE_ID, 'campaignState'));
    expect(gmNotes.text.content).toBe("<p>The GM's own truths, written by hand.</p>");
    expect(created).toHaveLength(1);
    expect(journal).toBe(created[0]);
    expect(game.settings._store.get(KEY).worldTruthsJournalId).toBe(created[0].id);
  });

  it('a second run rewrites the module\'s own journal — found by the recorded id, though the GM renamed it — and keeps its other pages', async () => {
    const { created } = journalWorld();
    const first = await storeWorldTruths(rollWorldTruths(), game.settings.get(MODULE_ID, 'campaignState'));
    await first.createEmbeddedDocuments('JournalEntryPage', [{ name: 'The Story So Far', text: { content: '<p>Lore.</p>' } }]);
    first.name = 'Our Setting';

    const again = rollWorldTruths();
    const second = await storeWorldTruths(again, game.settings.get(MODULE_ID, 'campaignState'));
    expect(second).toBe(first);
    expect(created).toHaveLength(1);
    const [truthsPage, lorePage] = first.pages.contents;
    expect(truthsPage.flags[MODULE_ID].worldTruths).toBe(again);
    expect(truthsPage.text.content).toContain(again.cataclysm.title);
    expect(lorePage.text.content).toBe('<p>Lore.</p>');
  });

  it('found by its flag when the recorded id names another journal; a lost truths page is re-created, never written over the lore page', async () => {
    const lore = makePage('p-lore', 'The Story So Far', '<p>Lore.</p>', {});
    const ours = makeJournal('j-ours', 'World Truths', { [MODULE_ID]: { entityType: 'worldTruths' } }, [lore]);
    const systemTruths = makeJournal('j-system', 'Setting Truths', {}, [makePage('p-sys', 'Setting Truths', '<h2>Cataclysm</h2><h2>Exodus</h2>', {})]);
    const { created } = journalWorld([systemTruths, ours]);
    game.settings._store.set(KEY, { ...game.settings._store.get(KEY), worldTruthsSet: true, worldTruthsJournalId: 'j-system' });

    const truthSet = rollWorldTruths();
    const journal = await storeWorldTruths(truthSet, game.settings.get(MODULE_ID, 'campaignState'));
    expect(journal).toBe(ours);
    expect(created).toHaveLength(0);
    expect(lore.text.content).toBe('<p>Lore.</p>');
    expect(ours.pages.contents.map(p => p.name)).toEqual(['The Story So Far', 'World Truths']);
    expect(ours.pages.contents[1].flags[MODULE_ID].worldTruths).toBe(truthSet);
    expect(systemTruths.pages.contents[0].text.content).toBe('<h2>Cataclysm</h2><h2>Exodus</h2>');
    expect(game.settings._store.get(KEY).worldTruthsJournalId).toBe('j-ours');
  });

  it('writes only the truths fields — a write that lands while the journal is created is kept', async () => {
    journalWorld();
    const create = JournalEntry.create;
    JournalEntry.create = async (data) => {
      const latest = game.settings.get(MODULE_ID, 'campaignState');
      await game.settings.set(MODULE_ID, 'campaignState', { ...latest, xCardActive: true });   // an X-Card relayed meanwhile
      return create(data);
    };
    const snapshot = { ...game.settings.get(MODULE_ID, 'campaignState') };
    await storeWorldTruths(rollWorldTruths(), snapshot);
    expect(game.settings._store.get(KEY)).toMatchObject({ xCardActive: true, worldTruthsSet: true });
  });
});

// ---------------------------------------------------------------------------
// 8. hasTruths
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 9. formatForContext
// ---------------------------------------------------------------------------

describe('formatForContext', () => {
  it('returns empty string for null input', () => {
    expect(formatForContext(null)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 10. formatSingleTruth
// ---------------------------------------------------------------------------

