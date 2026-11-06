/**
 * Each sector's trouble stays its own threat (issue #342 Z65,
 * SECTOR-TROUBLE-THREAT-SHARED-BY-NAME).
 *
 * storeSector records each new sector's trouble as an ACTIVE THREAT (World
 * Journal, `recordThreat(…, { summary: "Trouble in <sector>: …" })` — the
 * threat the narrator's ACTIVE THREATS block lists). recordThreat upserts by
 * the threat's NAME, and the name was the trouble's text alone: the Sector
 * Trouble table has 20 rows, so a second sector rolls the first one's trouble
 * 1 time in 20 (a quarter of four-sector campaigns). The second store
 * overwrote the page's summary with its own sector — "Trouble in Outlands
 * Mark: Energy storms are rampant" — so the first sector's trouble was told to
 * the narrator as the second sector's, and a GM resolving it for one sector
 * resolved both. The threat is now named by its trouble and its sector.
 *
 * Production wiring: the real storeSector and the World Journal writers on the
 * in-memory journal tests/unit/worldJournal.test.js installs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/entities/finalize.js', () => ({ finalizeEntityArtOnly: vi.fn() }));

import { storeSector } from '../../src/sectors/sectorGenerator.js';
import { getActiveThreats } from '../../src/world/worldJournal.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const TROUBLE = 'Energy storms are rampant';

function makePage(doc) {
  const page = {
    id: `page-${doc.name}-${Math.random().toString(36).slice(2, 8)}`,
    name: doc.name, type: doc.type ?? 'text', text: doc.text ?? null,
    flags: JSON.parse(JSON.stringify(doc.flags ?? {})),
    setFlag: async (mod, key, val) => { page.flags[mod] = page.flags[mod] ?? {}; page.flags[mod][key] = val; },
    getFlag: (mod, key) => page.flags?.[mod]?.[key],
    update: async (data) => {
      for (const [k, v] of Object.entries(data)) {
        if (k.startsWith('flags.')) {
          const [, mod, key] = k.split('.');
          page.flags[mod] = page.flags[mod] ?? {};
          page.flags[mod][key] = v;
        } else if (k === 'flags') {
          for (const [mod, block] of Object.entries(v)) page.flags[mod] = { ...(page.flags[mod] ?? {}), ...block };
        } else if (k === 'text.content') page.text = { ...(page.text ?? {}), content: v };
        else page[k] = v;
      }
      return page;
    },
    delete: async () => {},
  };
  return page;
}
function makeJournal(name) {
  const pages = [];
  const journal = {
    id: `journal-${name}`, name, flags: {},
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
    createEmbeddedDocuments: async (_type, docs) => { const created = docs.map(makePage); pages.push(...created); return created; },
    setFlag: async (mod, key, val) => { journal.flags[mod] = journal.flags[mod] ?? {}; journal.flags[mod][key] = val; },
    getFlag: (mod, key) => journal.flags?.[mod]?.[key],
  };
  return journal;
}

function sector(id, name) {
  return {
    id, name, region: 'outlands', regionLabel: 'Outlands', trouble: TROUBLE, faction: null,
    settlements: [], sites: [], passages: [], createdAt: new Date().toISOString(),
    connection: { id: `c-${id}`, name: 'Kael Volkov', role: 'Smuggler', goal: 'Gain riches', aspect: 'Bold', firstLook: [], homeSettlement: 'the sector' },
    mapData: { sectorId: id, gridWidth: 10, gridHeight: 8, settlements: [], passages: [], discoveries: [] },
  };
}

let journals;
let saved;
beforeEach(() => {
  journals = new Map();
  saved = { get: game.journal.get, getName: game.journal.getName, find: game.journal.find, JournalEntry: global.JournalEntry };
  game.journal.get = (id) => [...journals.values()].find(j => j.id === id) ?? null;
  game.journal.getName = (n) => journals.get(n) ?? null;
  game.journal.find = (fn) => [...journals.values()].find(fn) ?? null;
  global.JournalEntry = { create: async (data) => { const j = makeJournal(data.name); journals.set(data.name, j); return j; } };
  game.settings._store.set(KEY, { ...JSON.parse(JSON.stringify(CampaignStateSchema)), currentSessionId: 'sess-1', sectors: [], activeSectorId: null });
});
afterEach(() => {
  game.journal.get = saved.get; game.journal.getName = saved.getName; game.journal.find = saved.find;
  global.JournalEntry = saved.JournalEntry;
});

describe('each sector\'s trouble stays its own threat', () => {
  it('after a second sector rolls the same trouble, the first sector\'s trouble is still told as its own', async () => {
    await storeSector(sector('sec-a', "Devil's Reach"), {}, { ...game.settings.get(MODULE_ID, 'campaignState') });
    // control: the first sector's trouble is an active threat, attributed to it
    expect(getActiveThreats().map(t => t.summary)).toEqual([`Trouble in Devil's Reach: ${TROUBLE}`]);

    await storeSector(sector('sec-b', 'Outlands Mark'), {}, { ...game.settings.get(MODULE_ID, 'campaignState') });

    const summaries = getActiveThreats().map(t => t.summary).join(' | ');
    expect(summaries).toContain('Outlands Mark');
    // It was "Trouble in Outlands Mark: Energy storms are rampant" alone — Devil's Reach's was gone.
    expect(summaries).toContain("Devil's Reach");
    // Two threats, one per sector, each resolvable on its own.
    expect(getActiveThreats().map(t => t.name).sort()).toEqual([
      `${TROUBLE} — Devil's Reach`,
      `${TROUBLE} — Outlands Mark`,
    ]);
  });

  it('a retried creation of the same sector updates its own threat, not a second one (SECTOR-CREATE-PARTIAL)', async () => {
    await storeSector(sector('sec-a', "Devil's Reach"), {}, { ...game.settings.get(MODULE_ID, 'campaignState') });
    await storeSector(sector('sec-a', "Devil's Reach"), {}, { ...game.settings.get(MODULE_ID, 'campaignState') });

    expect(getActiveThreats().map(t => t.summary)).toEqual([`Trouble in Devil's Reach: ${TROUBLE}`]);
  });

  it('control: a second sector with a different trouble adds its own threat beside the first', async () => {
    await storeSector(sector('sec-a', "Devil's Reach"), {}, { ...game.settings.get(MODULE_ID, 'campaignState') });
    await storeSector({ ...sector('sec-b', 'Outlands Mark'), trouble: 'Supernova is imminent' }, {}, { ...game.settings.get(MODULE_ID, 'campaignState') });

    expect(getActiveThreats().map(t => t.summary).sort()).toEqual([
      `Trouble in Devil's Reach: ${TROUBLE}`,
      'Trouble in Outlands Mark: Supernova is imminent',
    ]);
  });
});
