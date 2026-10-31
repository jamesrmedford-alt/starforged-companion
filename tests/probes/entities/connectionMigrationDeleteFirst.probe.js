/**
 * PROBE — CONN-MIGRATION-DELETES-BEFORE-PERSIST
 *
 * migrateJournalConnectionsToActors (src/entities/migrator.js, run by every
 * GM client at ready) creates an NPC-card Actor for each journal-backed
 * connection, swaps the id in campaignState.connectionIds — in place, on
 * the cached setting object — and DELETES the source journal right away;
 * the swapped ids are persisted in one write after the loop. If that write
 * fails (a refused or dropped write, the GM reloading while the ready pass
 * runs), the world still lists the journal ids, but the journals are gone:
 * on the next load each id resolves to neither an Actor nor a journal, the
 * pass skips it as a dangling id, and the new NPC cards are registered
 * nowhere — the connections drop out of listConnections (Develop / Forge a
 * Bond / !bond / !sever / the picker). The ship migration in the same file
 * keeps its journals for a 7-day `--cleanup` for exactly this reason.
 *
 * Correct behaviour (asserted): when the swap could not be saved, the
 * legacy journal is still there, so the next load can migrate it again.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { migrateJournalConnectionsToActors } from '../../../src/entities/migrator.js';
import { _resetFolderCache } from '../../../src/entities/folder.js';

const MODULE = 'starforged-companion';

let world;   // what the server holds (JSON) — a refused write leaves it as it was
let cached;  // what this client's game.settings.get returns (by reference)

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset();
  _resetFolderCache();
  global.game.user = { isGM: true, id: 'test-user-gm' };

  const items = [];
  global.game.journal = {
    get:  (id) => items.find(j => j.id === id) ?? null,
    find: (fn) => items.find(fn) ?? null,
    [Symbol.iterator]() { return items[Symbol.iterator](); },
    _items: items,
  };
  const payload = { _id: 'c1', name: 'Sable', role: 'Navigator', rank: 'dangerous', relationshipTicks: 12 };
  const pageFlags = { [MODULE]: { connection: payload } };
  items.push({
    id: 'j-conn', name: 'Sable',
    flags: { [MODULE]: { entityType: 'connection', entityId: 'c1' } },
    pages: { contents: [{ flags: pageFlags, getFlag: (m, k) => pageFlags?.[m]?.[k] }] },
    delete: async () => { const i = items.findIndex(j => j.id === 'j-conn'); if (i >= 0) items.splice(i, 1); },
  });

  world  = JSON.stringify({ connectionIds: ['j-conn'] });
  cached = JSON.parse(world);
  global.game.settings.get = (mod, key) => (key === 'campaignState' ? cached : null);
  global.game.settings.set = async () => { throw new Error('The server refused the write (connection lost)'); };
});

describe('PROBE CONN-MIGRATION-DELETES-BEFORE-PERSIST', () => {
  it('keeps the legacy journal when the id swap could not be saved', async () => {
    silenceConsoleErrors();   // the refused write is logged by design
    await migrateJournalConnectionsToActors(global.game.settings.get(MODULE, 'campaignState'));

    const newCard = global.game.actors.find(a => a.flags?.[MODULE]?.entityType === 'connection');
    expect(newCard).toBeTruthy();                                  // the Actor was made
    expect(JSON.parse(world).connectionIds).toEqual(['j-conn']);   // the world never got its id

    // Expected: the journal survives so the next ready pass can migrate it.
    expect(global.game.journal.get('j-conn')).not.toBeNull();
  });
});
