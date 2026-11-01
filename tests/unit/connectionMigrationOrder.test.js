/**
 * STARFORGED COMPANION
 * tests/unit/connectionMigrationOrder.test.js
 *
 * Issue #322 V29 (the audit's connectionMigrationDeleteFirst probe,
 * CONN-MIGRATION-DELETES-BEFORE-PERSIST): the ready-time migration of
 * journal-backed connections to NPC-card Actors deleted each legacy journal
 * inside its loop, before the swapped ids were saved. A refused or
 * interrupted save left connectionIds naming deleted journals — the
 * connection gone from every reader (Forge a Bond, `!bond`, `!sever`, the
 * picker). The swap is saved first now, and only then are the journals
 * deleted; a save that did not land keeps them, and the next load migrates
 * them again, reusing the card it made rather than making a second.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { migrateJournalConnectionsToActors } from '../../src/entities/migrator.js';
import { _resetFolderCache } from '../../src/entities/folder.js';

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

describe('the connection migration saves its swap before deleting (CONN-MIGRATION-DELETES-BEFORE-PERSIST)', () => {
  it('keeps the legacy journal when the id swap could not be saved', async () => {
    silenceConsoleErrors();   // the refused write is logged by design
    await migrateJournalConnectionsToActors(global.game.settings.get(MODULE, 'campaignState'));

    const newCard = global.game.actors.find(a => a.flags?.[MODULE]?.entityType === 'connection');
    expect(newCard).toBeTruthy();                                  // the Actor was made
    expect(JSON.parse(world).connectionIds).toEqual(['j-conn']);   // the world never got its id

    // The journal survives, so the next ready pass can migrate it.
    expect(global.game.journal.get('j-conn')).not.toBeNull();
    // This client's cached setting was not changed by the refused write.
    expect(cached.connectionIds).toEqual(['j-conn']);
  });

  it('the next load, with the save landing: the same card, no second one, and the journal goes', async () => {
    silenceConsoleErrors();
    await migrateJournalConnectionsToActors(global.game.settings.get(MODULE, 'campaignState'));   // refused
    const first = global.game.actors.find(a => a.flags?.[MODULE]?.entityType === 'connection');

    global.game.settings.set = async (_mod, key, value) => {
      if (key !== 'campaignState') return;
      world = JSON.stringify(value);
      cached = JSON.parse(world);
    };
    const summary = await migrateJournalConnectionsToActors(global.game.settings.get(MODULE, 'campaignState'));

    expect(summary.migrated).toBe(1);
    const cards = global.game.actors.filter(a => a.flags?.[MODULE]?.entityType === 'connection');
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe(first.id);
    expect(JSON.parse(world).connectionIds).toEqual([first.id]);
    expect(global.game.journal.get('j-conn')).toBeNull();
  });

  it('control: a save that lands the first time swaps the id, then deletes the journal', async () => {
    global.game.settings.set = async (_mod, key, value) => {
      if (key !== 'campaignState') return;
      world = JSON.stringify(value);
      cached = JSON.parse(world);
    };
    await migrateJournalConnectionsToActors(global.game.settings.get(MODULE, 'campaignState'));
    const card = global.game.actors.find(a => a.flags?.[MODULE]?.entityType === 'connection');
    expect(JSON.parse(world).connectionIds).toEqual([card.id]);
    expect(global.game.journal.get('j-conn')).toBeNull();
  });
});
