/**
 * CREATED-ONTO-DISMISSED-NAME (known-issues; issue #345 AA55's residual).
 *
 * A draft card's Dismiss puts a name on `dismissedEntities`, and the name
 * index leaves out every record whose name is on that list (relevanceResolver
 * indexNames). AA55 took a name off the list when a record was RENAMED onto
 * it; a record CREATED onto it by another path — a vow's target NPC from Swear
 * an Iron Vow, a sector's generated settlement or connection — stayed hidden
 * from the narrator, and a world already in that state stayed so until the
 * GM's Undismiss. Now every creator's registration takes the new record's
 * name off the list (registry.registerEntityId), and the world load's name
 * repair (syncEntityRecordNames) sweeps the listed records.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createConnection } from '../../src/entities/connection.js';
import { createSettlement } from '../../src/entities/settlement.js';
import { createFaction } from '../../src/entities/faction.js';
import { syncEntityRecordNames } from '../../src/entities/migrator.js';
import { collectAllEntities, resolveEntityName } from '../../src/context/relevanceResolver.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE = 'starforged-companion';
const KEY = `${MODULE}.campaignState`;
const cached = () => global.game.settings.get(MODULE, 'campaignState');

let savedJournal;
beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset?.();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.ChatMessage._reset();
  global.game.settings._store.clear();
  global.game.settings._store.set(KEY, {
    ...CampaignStateSchema, currentSessionId: 'sess-1', sessionNumber: 1,
    connectionIds: [], settlementIds: [], factionIds: [], sectors: [],
    dismissedEntities: ['Vex Marrow', 'Bleakhold', 'Iron Syndicate', 'Dace'],
  });
  // Journal-hosted entities (a faction) need journals that keep their pages and resolve by id.
  savedJournal = { get: global.game.journal.get, create: global.JournalEntry?.create };
  const journals = new Map();
  global.game.journal.get = (id) => journals.get(id) ?? null;
  global.JournalEntry = { create: async (data) => {
    const pages = [];
    const j = {
      id: `j-${journals.size + 1}`, name: data.name, flags: JSON.parse(JSON.stringify(data.flags ?? {})),
      pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
      createEmbeddedDocuments: async (_t, docs) => { const made = docs.map((d, i) => ({ id: `p-${i}`, ...d,
        getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
        async setFlag(scope, key, v) { (this.flags[scope] ??= {})[key] = v; } })); pages.push(...made); return made; },
      getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
      async setFlag(scope, key, v) { (this.flags[scope] ??= {})[key] = v; },
    };
    journals.set(j.id, j);
    return j;
  } };
  return () => { global.game.journal.get = savedJournal.get; global.JournalEntry = { create: savedJournal.create }; };
});

/** The narrator's name index finds the record by its name. */
const inIndex = (name) => {
  const cs = cached();
  return !!resolveEntityName(name, collectAllEntities(cs), cs.dismissedEntities ?? []);
};

describe('CREATED-ONTO-DISMISSED-NAME — a record created onto a dismissed name is the table\'s again', () => {
  it('a connection created onto it (the vow target\'s path) takes its name off the list — only its own', async () => {
    expect(inIndex('Vex Marrow')).toBe(false);                     // control: nothing named Vex yet
    await createConnection({ name: 'Vex Marrow', description: 'A smuggler.' }, cached());
    expect(cached().dismissedEntities).toEqual(['Bleakhold', 'Iron Syndicate', 'Dace']);
    expect(inIndex('Vex Marrow')).toBe(true);                       // was: hidden from the narrator
  });

  it('a sector\'s settlement (persist: false, on the generator\'s copy) — the store and the copy both', async () => {
    const copy = foundry.utils.deepClone(cached());
    await createSettlement({ name: 'Bleakhold', location: 'Orbital' }, copy, { persist: false });
    expect(copy.dismissedEntities).not.toContain('Bleakhold');
    expect(cached().dismissedEntities).not.toContain('Bleakhold');
  });

  it('a journal-hosted record (a faction) the same', async () => {
    await createFaction({ name: 'Iron Syndicate' }, cached());
    expect(cached().dismissedEntities).not.toContain('Iron Syndicate');
  });

  it('a world already in that state: the load-time name repair takes the listed record\'s name off', async () => {
    await createConnection({ name: 'Dace', description: 'A bartender.' }, cached());
    // As a world left by a build without the fix: the record listed, its name still dismissed.
    global.game.settings._store.set(KEY, { ...cached(), dismissedEntities: ['Dace', 'Bleakhold'] });
    expect(inIndex('Dace')).toBe(false);
    await syncEntityRecordNames();
    expect(cached().dismissedEntities).toEqual(['Bleakhold']);
    expect(inIndex('Dace')).toBe(true);
  });

  it('control: a player\'s client changes nothing', async () => {
    global.game.user = { isGM: false, id: 'pl-1' };
    expect(await syncEntityRecordNames()).toEqual({ synced: 0 });
    expect(cached().dismissedEntities).toContain('Dace');
  });
});
