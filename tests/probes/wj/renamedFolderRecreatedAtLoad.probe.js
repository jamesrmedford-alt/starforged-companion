/**
 * WJ-05 · WJ-FOLDER-BY-NAME-RECREATED
 *
 * Scenario: the GM renames the journal folder the companion made —
 * "Starforged Companion" → "Campaign Notes" — with the six World Journal
 * journals still in it. The world is reloaded.
 *
 * Correct: the journals are found by their category flag (issue #345 AA63),
 * every one exists, and they already sit in a folder: the load makes nothing.
 *
 * Today: `initWorldJournals` looks the folder up by its display name alone,
 * finds none, and creates an empty "Starforged Companion" folder beside the
 * renamed one — the name-lookup AA63 fixed for the journals, left on the
 * folder. A GM who deletes the stray empty folder gets it back at the next
 * load, every load.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

const MODULE_ID = 'starforged-companion';
const CATEGORY_NAMES = {
  lore: 'World Journal — Lore', threats: 'World Journal — Threats', factions: 'World Journal — Factions',
  locations: 'World Journal — Locations', sessionLog: 'World Journal — Session Log', secrets: 'World Journal — Secrets',
};

let wj;
let journals;
let folders;
let createdJournals;
let createdFolders;
let saved;

function makeJournal(name, category, folder) {
  const j = {
    id: `j-${category}`, name, folder,
    flags: { [MODULE_ID]: { worldJournalCategory: category } },
    pages: { contents: [] },
    getFlag: (m, k) => j.flags?.[m]?.[k],
    setFlag: async (m, k, v) => { (j.flags[m] ??= {})[k] = v; return j; },
  };
  return j;
}

beforeAll(async () => { wj = await import('../../../src/world/worldJournal.js'); });

beforeEach(() => {
  saved = { journal: game.journal, create: globalThis.JournalEntry, user: game.user, users: game.users, folders: game.folders, Folder: globalThis.Folder };
  const folder = { id: 'folder-1', type: 'JournalEntry', name: 'Starforged Companion' };
  folders = [folder];
  journals = Object.entries(CATEGORY_NAMES).map(([category, name]) => makeJournal(name, category, folder.id));
  createdJournals = [];
  createdFolders = [];
  game.user = { ...(saved.user ?? {}), id: 'gm-1', isGM: true, active: true };
  game.users = [game.user];
  game.folders = { find: (fn) => folders.find(fn) ?? undefined, contents: folders };
  game.journal = {
    ...saved.journal,
    getName: (n) => journals.find(j => j.name === n) ?? undefined,
    find: (fn) => journals.find(fn) ?? undefined,
    get: (id) => journals.find(j => j.id === id) ?? undefined,
    contents: journals,
    [Symbol.iterator]: function* () { yield* journals; },
  };
  globalThis.JournalEntry = { create: async (data) => { const j = makeJournal(data.name, data.flags?.[MODULE_ID]?.worldJournalCategory, data.folder); journals.push(j); createdJournals.push(j); return j; } };
  globalThis.Folder = { create: async (data) => { const f = { id: `folder-${folders.length + 1}`, ...data }; folders.push(f); createdFolders.push(f); return f; } };
});

afterEach(() => {
  game.journal = saved.journal;
  globalThis.JournalEntry = saved.create;
  game.user = saved.user;
  game.users = saved.users;
  game.folders = saved.folders;
  globalThis.Folder = saved.Folder;
});

describe('WJ-05 — a load after the GM renames the companion\'s journal folder', () => {
  it('control: with the folder under its own name, a load makes no folder and no journal', async () => {
    await wj.initWorldJournals();
    expect(createdFolders).toEqual([]);
    expect(createdJournals).toEqual([]);
  });

  it('control: a renamed journal is still found by its category — the load makes no second one', async () => {
    journals[0].name = 'Lore';
    await wj.initWorldJournals();
    expect(createdJournals.map(j => j.name)).toEqual([]);
  });

  it('the folder renamed, every journal still in it: the load makes no second folder', async () => {
    folders[0].name = 'Campaign Notes';
    await wj.initWorldJournals();
    expect(createdJournals.map(j => j.name), 'no journal is missing').toEqual([]);
    expect(createdFolders.map(f => f.name), 'folders created by the load').toEqual([]);
  });
});
