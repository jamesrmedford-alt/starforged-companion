/**
 * STARFORGED COMPANION
 * tests/unit/worldJournalFolderFoundByStamp.test.js
 *
 * Issue #362 AC48 WJ-FOLDER-BY-NAME-RECREATED — the GM renames the journal
 * folder the companion made ("Starforged Companion" → "Campaign Notes") with
 * the six World Journal journals still in it, and reloads. initWorldJournals
 * looked the folder up by its display name alone, found none, and made an
 * empty "Starforged Companion" folder beside the renamed one — and again at
 * every load once the GM deleted it. The folder is now looked for only when
 * a journal is about to be made, and found by the stamp the module gives it
 * (else by its name, else as the folder a World Journal journal sits in);
 * the Pacing Telemetry journal and the Private Channel transcripts find it
 * the same way.
 */

/* global structuredClone */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

const MODULE_ID = 'starforged-companion';
const CATEGORY_NAMES = {
  lore: 'World Journal — Lore', threats: 'World Journal — Threats', factions: 'World Journal — Factions',
  locations: 'World Journal — Locations', sessionLog: 'World Journal — Session Log', secrets: 'World Journal — Secrets',
};

let wj, telemetry;
let journals, folders, createdJournals, createdFolders, saved;

function makeJournal(name, category, folder, extraFlags = {}) {
  const j = {
    id: `j-${journals.length + 1}`, name, folder,
    flags: { [MODULE_ID]: { ...(category ? { worldJournalCategory: category } : {}), ...structuredClone(extraFlags) } },
    pages: { contents: [] },
    getFlag: (m, k) => j.flags?.[m]?.[k],
    setFlag: async (m, k, v) => { (j.flags[m] ??= {})[k] = v; return j; },
    createEmbeddedDocuments: async (_type, docs) => {
      for (const doc of docs) {
        const flags = structuredClone(doc.flags ?? {});
        j.pages.contents.push({
          name: doc.name,
          getFlag: (scope, key) => flags[scope]?.[key],
          setFlag: async (scope, key, value) => { (flags[scope] ??= {})[key] = structuredClone(value); },
          update: async () => {},
        });
      }
    },
  };
  return j;
}

beforeAll(async () => {
  wj = await import('../../src/world/worldJournal.js');
  telemetry = await import('../../src/pacing/telemetry.js');
});

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
  globalThis.JournalEntry = { create: async (data) => {
    const j = makeJournal(data.name, data.flags?.[MODULE_ID]?.worldJournalCategory, data.folder, data.flags?.[MODULE_ID] ?? {});
    journals.push(j); createdJournals.push(j); return j;
  } };
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

/** A world made before the stamp: an unstamped "Starforged Companion" folder holding every category journal. */
function legacyWorld() {
  const folder = { id: 'folder-1', type: 'JournalEntry', name: 'Starforged Companion' };
  folders.push(folder);
  for (const [category, name] of Object.entries(CATEGORY_NAMES)) journals.push(makeJournal(name, category, folder.id));
  return folder;
}

describe('issue #362 AC48 — a load after the GM renames the companion\'s journal folder', () => {
  it('control: with the folder under its own name, a load makes no folder and no journal', async () => {
    legacyWorld();
    await wj.initWorldJournals();
    expect(createdFolders).toEqual([]);
    expect(createdJournals).toEqual([]);
  });

  it('control: a renamed journal is still found by its category — the load makes no second one', async () => {
    legacyWorld();
    journals[0].name = 'Lore';
    await wj.initWorldJournals();
    expect(createdJournals.map(j => j.name)).toEqual([]);
  });

  it('the folder renamed, every journal still in it: the load makes no second folder', async () => {
    legacyWorld().name = 'Campaign Notes';
    await wj.initWorldJournals();
    expect(createdJournals.map(j => j.name), 'no journal is missing').toEqual([]);
    expect(createdFolders.map(f => f.name), 'folders created by the load').toEqual([]);
  });

  it('the folder renamed and one journal missing: it is made in the renamed folder, and no folder is made', async () => {
    legacyWorld().name = 'Campaign Notes';
    journals.splice(journals.findIndex(j => j.name === CATEGORY_NAMES.secrets), 1);
    await wj.initWorldJournals();
    expect(createdFolders).toEqual([]);
    expect(createdJournals.map(j => [j.name, j.folder])).toEqual([[CATEGORY_NAMES.secrets, 'folder-1']]);
  });

  it('a new world: the load makes one folder, stamped, and every journal in it — a rename later is followed', async () => {
    await wj.initWorldJournals();
    expect(createdFolders).toHaveLength(1);
    const [folder] = createdFolders;
    expect(folder).toMatchObject({ name: 'Starforged Companion', type: 'JournalEntry' });
    expect(folder.flags?.[MODULE_ID]?.companionJournalFolder).toBe(true);
    expect(createdJournals.every(j => j.folder === folder.id)).toBe(true);

    // Renamed, and every journal moved out of it: still the module's folder by its stamp.
    folder.name = 'Campaign Notes';
    for (const j of journals) j.folder = null;
    expect(await wj.companionJournalFolderId()).toBe(folder.id);
    expect(await wj.companionJournalFolderId({ create: true })).toBe(folder.id);
    expect(createdFolders).toHaveLength(1);
  });

  it('the Pacing Telemetry journal is made in the renamed folder, and makes none', async () => {
    legacyWorld().name = 'Campaign Notes';
    await telemetry.logPacingDecision({
      playerText: 'I scan the hull.', decision: 'NARRATIVE', suggestedMove: null, category: 'exploration',
      confidence: 0.8, reasoning: 'test', fallback: false, sessionId: 's1', sessionNumber: 1,
    });
    expect(createdFolders).toEqual([]);
    expect(createdJournals.map(j => [j.name, j.folder])).toEqual([['Pacing Telemetry', 'folder-1']]);
  });

  it('a player\'s Private Channel journal is made in the renamed folder, and makes none', async () => {
    legacyWorld().name = 'Campaign Notes';
    const player = { id: 'pl-1', name: 'Pia', isGM: false, active: true };
    game.users = Object.assign([game.user, player], { get: (id) => [game.user, player].find(u => u.id === id) ?? null });
    const { applyPrivateJournalCreate } = await import('../../src/private-channel/transcript.js');
    await applyPrivateJournalCreate({}, { requesterId: 'pl-1' });
    expect(createdFolders).toEqual([]);
    expect(createdJournals.map(j => [j.name, j.folder])).toEqual([['Private Channel — Pia', 'folder-1']]);
  });
});
