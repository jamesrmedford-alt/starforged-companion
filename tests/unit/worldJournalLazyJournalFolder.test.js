/**
 * STARFORGED COMPANION
 * tests/unit/worldJournalLazyJournalFolder.test.js
 *
 * Issue #364 WJ-LAZY-JOURNAL-NO-FOLDER (left open by issue #362 AC48). The
 * load makes a missing category journal in the module's journal folder
 * (initWorldJournals → companionJournalFolderId). A category journal made
 * mid-session — the first write to a category whose journal is gone, e.g. the
 * GM deleted "World Journal — Threats" and the next narration records a
 * threat — went through getOrCreateJournal, which made it with no folder at
 * all: loose in the sidebar, beside the folder its siblings sit in.
 *
 * The lazy path now asks the same lookup: the stamped folder, else the one of
 * its name, else the folder a World Journal journal sits in; made — stamped —
 * only when there is none. A refused folder still leaves the journal made.
 *
 * Harness: worldJournalFolderFoundByStamp.test.js's journal / folder stubs,
 * driven through the real writers (recordThreat, recordLoreDiscovery,
 * getOrCreateWorldJournal).
 */

/* global structuredClone */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

const MODULE_ID = 'starforged-companion';
const CATEGORY_NAMES = {
  lore: 'World Journal — Lore', threats: 'World Journal — Threats', factions: 'World Journal — Factions',
  locations: 'World Journal — Locations', sessionLog: 'World Journal — Session Log', secrets: 'World Journal — Secrets',
};
const STATE = { currentSessionId: 'sess-1', sessionNumber: 2 };

let wj;
let journals, folders, createdJournals, createdFolders, saved;

function makeJournal(data) {
  const pages = [];
  const j = {
    id: `j-${journals.length + 1}`, name: data.name, folder: data.folder, ownership: data.ownership,
    hadFolderKey: Object.hasOwn(data, 'folder'),
    flags: structuredClone(data.flags ?? {}),
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn), [Symbol.iterator]: function* () { yield* pages; } },
    getFlag: (m, k) => j.flags?.[m]?.[k],
    setFlag: async (m, k, v) => { (j.flags[m] ??= {})[k] = v; return j; },
    createEmbeddedDocuments: async (_type, docs) => docs.map((doc) => {
      const page = {
        id: `p-${pages.length + 1}`, name: doc.name, flags: structuredClone(doc.flags ?? {}),
        getFlag: (scope, key) => page.flags[scope]?.[key],
        setFlag: async (scope, key, value) => { (page.flags[scope] ??= {})[key] = structuredClone(value); },
        update: async () => {},
      };
      pages.push(page);
      return page;
    }),
  };
  return j;
}

beforeAll(async () => { wj = await import('../../src/world/worldJournal.js'); });

beforeEach(() => {
  saved = { journal: game.journal, create: globalThis.JournalEntry, user: game.user, users: game.users, folders: game.folders, Folder: globalThis.Folder };
  folders = [];
  journals = [];
  createdJournals = [];
  createdFolders = [];
  game.user = { ...(saved.user ?? {}), id: 'gm-1', isGM: true, active: true };
  game.users = [game.user];
  game.folders = { find: (fn) => folders.find(fn) ?? undefined, get: (id) => folders.find(f => f.id === id) ?? undefined, contents: folders };
  game.journal = {
    ...saved.journal,
    getName: (n) => journals.find(j => j.name === n) ?? undefined,
    find: (fn) => journals.find(fn) ?? undefined,
    get: (id) => journals.find(j => j.id === id) ?? undefined,
    get contents() { return journals; },
    [Symbol.iterator]: function* () { yield* journals; },
  };
  globalThis.JournalEntry = { create: async (data) => { const j = makeJournal(data); journals.push(j); createdJournals.push(j); return j; } };
  globalThis.Folder = { create: async (data) => { const f = { id: `folder-${folders.length + 1}`, ...structuredClone(data) }; folders.push(f); createdFolders.push(f); return f; } };
});

afterEach(() => {
  game.journal = saved.journal;
  globalThis.JournalEntry = saved.create;
  game.user = saved.user;
  game.users = saved.users;
  game.folders = saved.folders;
  globalThis.Folder = saved.Folder;
});

/** The module's folder holding every category journal but those in `without` (the GM deleted them mid-session). */
function worldWithout(without, { stamped = true } = {}) {
  const folder = { id: 'folder-1', type: 'JournalEntry', name: 'Starforged Companion',
    ...(stamped ? { flags: { [MODULE_ID]: { companionJournalFolder: true } } } : {}) };
  folders.push(folder);
  for (const [category, name] of Object.entries(CATEGORY_NAMES)) {
    if (without.includes(category)) continue;
    journals.push(makeJournal({ name, folder: folder.id, flags: { [MODULE_ID]: { worldJournalCategory: category } } }));
  }
  return folder;
}

describe('issue #364 WJ-LAZY-JOURNAL-NO-FOLDER — a category journal made mid-session is made in the companion\'s folder', () => {
  it('control: a write to a journal that exists makes no journal and no folder', async () => {
    worldWithout([]);
    const threat = await wj.recordThreat('Raiders', { severity: 'active', summary: 'They hold the gate.' }, STATE);
    expect(threat?.name).toBe('Raiders');
    expect(createdJournals).toEqual([]);
    expect(createdFolders).toEqual([]);
  });

  it('a threat recorded with the Threats journal gone: the journal is made in the folder its siblings sit in', async () => {
    worldWithout(['threats']);
    const threat = await wj.recordThreat('Raiders', { severity: 'active', summary: 'They hold the gate.' }, STATE);
    expect(threat?.name, 'the threat is recorded').toBe('Raiders');
    expect(createdJournals.map(j => [j.name, j.folder]), 'the journal made, and its folder').toEqual([[CATEGORY_NAMES.threats, 'folder-1']]);
    expect(createdFolders, 'no folder is made').toEqual([]);
  });

  it('the folder renamed by the GM (no stamp, found by a sibling journal): the lore journal is made in it, and no folder beside it', async () => {
    worldWithout(['lore'], { stamped: false }).name = 'Campaign Notes';
    await wj.recordLoreDiscovery('The Gate Is Older Than The Settlements', { text: 'Its alloys predate the Exodus.', confirmed: true }, STATE);
    expect(createdJournals.map(j => [j.name, j.folder])).toEqual([[CATEGORY_NAMES.lore, 'folder-1']]);
    expect(createdFolders).toEqual([]);
  });

  it('the Secrets journal made on demand sits in the folder too, still with no player permission', async () => {
    worldWithout(['secrets']);
    const journal = await wj.getOrCreateWorldJournal('secrets');
    expect([journal?.name, journal?.folder]).toEqual([CATEGORY_NAMES.secrets, 'folder-1']);
    expect(journal.ownership).toEqual({ default: 0 });
    expect(journal.flags[MODULE_ID].worldJournalCategory).toBe('secrets');
  });

  it('no folder at all: the first journal made mid-session makes it — stamped — and the next uses it', async () => {
    await wj.recordThreat('Raiders', { severity: 'active', summary: 'They hold the gate.' }, STATE);
    await wj.getOrCreateWorldJournal('factions');
    expect(createdFolders, 'one folder').toHaveLength(1);
    expect(createdFolders[0]).toMatchObject({ name: 'Starforged Companion', type: 'JournalEntry' });
    expect(createdFolders[0].flags?.[MODULE_ID]?.companionJournalFolder).toBe(true);
    expect(createdJournals.map(j => [j.name, j.folder])).toEqual([
      [CATEGORY_NAMES.threats, createdFolders[0].id],
      [CATEGORY_NAMES.factions, createdFolders[0].id],
    ]);
  });

  it('a folder the world refuses: the journal is still made, outside any folder, and the write lands', async () => {
    globalThis.Folder = { create: async () => { throw new Error('User lacks permission to create Folder'); } };
    const threat = await wj.recordThreat('Raiders', { severity: 'active', summary: 'They hold the gate.' }, STATE);
    expect(threat?.name).toBe('Raiders');
    expect(createdJournals.map(j => [j.name, j.hadFolderKey])).toEqual([[CATEGORY_NAMES.threats, false]]);
  });

  it('a player\'s client makes neither', async () => {
    game.user = { ...game.user, id: 'pl-1', isGM: false };
    expect(await wj.getOrCreateWorldJournal('threats')).toBeNull();
    expect(createdJournals).toEqual([]);
    expect(createdFolders).toEqual([]);
  });
});
