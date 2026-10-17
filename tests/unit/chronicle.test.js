/**
 * STARFORGED COMPANION
 * tests/unit/chronicle.test.js
 *
 * Unit tests for src/character/chronicle.js
 * Chronicle operates on JournalEntry flags — fully mocked.
 */

import {
  addChronicleEntry,
  getChronicleEntries,
  updateChronicleEntry,
} from '../../src/character/chronicle.js';
import * as chronicle from '../../src/character/chronicle.js';

const MODULE_ID     = 'starforged-companion';
const CHRONICLE_KEY = 'chronicle';
const ACTOR_ID      = 'actor-1';
const ACTOR_NAME    = 'Kira';


// ─────────────────────────────────────────────────────────────────────────────
// Journal mock helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeChronPage(initialEntries = []) {
  const flagStore = { [MODULE_ID]: { [CHRONICLE_KEY]: [...initialEntries] } };
  return {
    flags: flagStore,
    getFlag: (mod, key) => flagStore[mod]?.[key],
    setFlag: async (mod, key, val) => {
      if (!flagStore[mod]) flagStore[mod] = {};
      flagStore[mod][key] = val;
    },
  };
}

function makeChronJournal(actorName, initialEntries = []) {
  const page = makeChronPage(initialEntries);
  return {
    name: `Chronicle — ${actorName}`,
    pages: { contents: [page] },
    createEmbeddedDocuments: async () => [],
  };
}

function setupActor(actorId = ACTOR_ID, actorName = ACTOR_NAME) {
  const actor = makeTestActor({ id: actorId, name: actorName });
  game.actors._set(actorId, actor);
  return actor;
}

function setupExistingJournal(actorName = ACTOR_NAME, initialEntries = []) {
  const journal = makeChronJournal(actorName, initialEntries);
  const originalGetName = game.journal.getName;
  game.journal.getName = (name) => {
    if (name === `Chronicle — ${actorName}`) return journal;
    return originalGetName(name);
  };
  return journal;
}

beforeEach(() => {
  game.actors._reset();
  // Reset journal.getName to default no-op
  game.journal.getName = () => null;
  // Reset JournalEntry.create to return a journal with a mocked page
  game.journal._chronicles = {};
  JournalEntry.create = async (data) => {
    const flagStore = {};
    const page = {
      name: 'Chronicle',
      flags: { [MODULE_ID]: { [CHRONICLE_KEY]: [] } },
      getFlag: (mod, key) => page.flags[mod]?.[key],
      setFlag: async (mod, key, val) => {
        if (!page.flags[mod]) page.flags[mod] = {};
        page.flags[mod][key] = val;
      },
    };
    const journal = {
      id: foundry.utils.randomID(),
      name: data.name,
      flags: data.flags ?? {},
      pages: { contents: [page] },
      createEmbeddedDocuments: async () => [page],
      getFlag: (mod, key) => flagStore[`${mod}.${key}`],
      setFlag: async (mod, key, val) => { flagStore[`${mod}.${key}`] = val; },
    };
    // Make the journal findable by name for subsequent calls in the same test
    const originalGetName = game.journal.getName;
    game.journal.getName = (name) => {
      if (name === data.name) return journal;
      return originalGetName(name);
    };
    return journal;
  };
});


// ─────────────────────────────────────────────────────────────────────────────
// addChronicleEntry
// ─────────────────────────────────────────────────────────────────────────────

describe('addChronicleEntry', () => {
  it('creates chronicle journal if none exists', async () => {
    setupActor();
    await addChronicleEntry(ACTOR_ID, { type: 'revelation', text: 'First entry.' });

    const journal = game.journal.getName(`Chronicle — ${ACTOR_NAME}`);
    expect(journal).not.toBeNull();
  });

  it('appends entry to existing chronicle', async () => {
    setupActor();
    const existing = [
      { id: 'e0', type: 'annotation', text: 'Old entry.', timestamp: '2024-01-01T00:00:00Z' },
    ];
    setupExistingJournal(ACTOR_NAME, existing);

    await addChronicleEntry(ACTOR_ID, { type: 'revelation', text: 'New entry.' });

    const entries = await getChronicleEntries(ACTOR_ID);
    expect(entries).toHaveLength(2);
    expect(entries[1].text).toBe('New entry.');
  });

  it('assigns unique ID to each entry', async () => {
    setupActor();
    setupExistingJournal(ACTOR_NAME);

    await addChronicleEntry(ACTOR_ID, { type: 'revelation', text: 'Entry A.' });
    await addChronicleEntry(ACTOR_ID, { type: 'scar',       text: 'Entry B.' });

    const entries = await getChronicleEntries(ACTOR_ID);
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBeTruthy();
    expect(entries[1].id).toBeTruthy();
    expect(entries[0].id).not.toBe(entries[1].id);
  });

  it('stores timestamp on each entry', async () => {
    setupActor();
    setupExistingJournal(ACTOR_NAME);

    const before = new Date().toISOString();
    await addChronicleEntry(ACTOR_ID, { type: 'annotation', text: 'Timestamped entry.' });
    const after  = new Date().toISOString();

    const entries = await getChronicleEntries(ACTOR_ID);
    expect(entries[0].timestamp >= before).toBe(true);
    expect(entries[0].timestamp <= after).toBe(true);
  });

  it('stores sessionId when provided', async () => {
    setupActor();
    setupExistingJournal(ACTOR_NAME);

    await addChronicleEntry(ACTOR_ID, {
      type: 'vow', text: 'Swore a vow.', sessionId: 'session-42',
    });

    const entries = await getChronicleEntries(ACTOR_ID);
    expect(entries[0].sessionId).toBe('session-42');
  });

  it('does nothing if actor does not exist', async () => {
    await expect(
      addChronicleEntry('no-such-actor', { type: 'annotation', text: 'Ghost.' })
    ).resolves.toBeUndefined();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// getChronicleEntries
// ─────────────────────────────────────────────────────────────────────────────

describe('getChronicleEntries', () => {
  it('returns empty array when no chronicle journal exists', async () => {
    setupActor();
    expect(await getChronicleEntries(ACTOR_ID)).toEqual([]);
  });

  it('returns stored entries', async () => {
    setupActor();
    const entries = [
      { id: 'e1', type: 'revelation', text: 'A revelation.', timestamp: '2024-01-01T00:00:00Z' },
      { id: 'e2', type: 'scar',       text: 'A scar.',       timestamp: '2024-01-02T00:00:00Z' },
    ];
    setupExistingJournal(ACTOR_NAME, entries);

    const result = await getChronicleEntries(ACTOR_ID);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('e1');
    expect(result[1].id).toBe('e2');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// updateChronicleEntry
// ─────────────────────────────────────────────────────────────────────────────

describe('updateChronicleEntry', () => {
  it('updates text of existing entry', async () => {
    setupActor();
    const entries = [
      { id: 'e1', type: 'revelation', text: 'Original text.', timestamp: '2024-01-01T00:00:00Z', pinned: false, playerEdited: false },
    ];
    setupExistingJournal(ACTOR_NAME, entries);

    await updateChronicleEntry(ACTOR_ID, 'e1', 'Corrected text.');

    const updated = await getChronicleEntries(ACTOR_ID);
    expect(updated[0].text).toBe('Corrected text.');
  });

  it('marks entry as player-edited', async () => {
    setupActor();
    const entries = [
      { id: 'e1', type: 'revelation', text: 'Original.', timestamp: '2024-01-01T00:00:00Z', pinned: false, playerEdited: false },
    ];
    setupExistingJournal(ACTOR_NAME, entries);

    await updateChronicleEntry(ACTOR_ID, 'e1', 'Edited.');

    const updated = await getChronicleEntries(ACTOR_ID);
    expect(updated[0].playerEdited).toBe(true);
  });

  it('does not change type or timestamp', async () => {
    setupActor();
    const ts = '2024-01-01T12:00:00Z';
    const entries = [
      { id: 'e1', type: 'scar', text: 'Original.', timestamp: ts, pinned: false, playerEdited: false },
    ];
    setupExistingJournal(ACTOR_NAME, entries);

    await updateChronicleEntry(ACTOR_ID, 'e1', 'Changed text.');

    const updated = await getChronicleEntries(ACTOR_ID);
    expect(updated[0].type).toBe('scar');
    expect(updated[0].timestamp).toBe(ts);
  });

  it('does nothing for unknown entryId', async () => {
    setupActor();
    const entries = [
      { id: 'e1', type: 'annotation', text: 'Original.', timestamp: '2024-01-01T00:00:00Z', pinned: false },
    ];
    setupExistingJournal(ACTOR_NAME, entries);

    await expect(
      updateChronicleEntry(ACTOR_ID, 'no-such-id', 'Updated.')
    ).resolves.toBeUndefined();

    const unchanged = await getChronicleEntries(ACTOR_ID);
    expect(unchanged[0].text).toBe('Original.');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Error-path coverage for catch blocks in
//   getOrCreateChronicleJournal (console.error)
// ─────────────────────────────────────────────────────────────────────────────

describe('error path coverage', () => {
  it('addChronicleEntry returns silently when JournalEntry.create throws', async () => {
    setupActor();
    expectConsoleError(/failed to create chronicle journal/i);

    JournalEntry.create = async () => { throw new Error('DB write failure'); };

    await expect(
      addChronicleEntry(ACTOR_ID, { type: 'annotation', text: 'Test.' })
    ).resolves.toBeUndefined();
  });

  it('no longer exports the retired-assembler helper getChronicleForContext', () => {
    // Its only consumer (the context assembler) was retired; the narrator
    // reads getChronicleEntries directly. Re-adding it unwired is dead code.
    expect(chronicle).not.toHaveProperty('getChronicleForContext');
  });

  it('builds entry with default fields when omitted (?? branches)', async () => {
    setupActor();
    setupExistingJournal(ACTOR_NAME);

    // Add an entry providing only `type`; text/moveId/sessionId/automated default
    await addChronicleEntry(ACTOR_ID, { type: 'annotation' });

    const updated = await getChronicleEntries(ACTOR_ID);
    expect(updated[0].text).toBe('');
    expect(updated[0].moveId).toBeNull();
    expect(updated[0].sessionId).toBe('');
    expect(updated[0].automated).toBe(false);
  });
});
