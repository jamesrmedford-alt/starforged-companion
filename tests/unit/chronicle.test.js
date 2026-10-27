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
  saveChronicleEntries,
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


// ─────────────────────────────────────────────────────────────────────────────
// Identity — the journal is the actor's by id, never by name (issue #301 B03)
// ─────────────────────────────────────────────────────────────────────────────

describe('identity by actor id, not by name (issue #301 B03)', () => {
  // A listable journal collection (Foundry's game.journal is one): getName
  // returns the FIRST journal with the name, as Foundry's does.
  let journals, savedJournal;

  function makeJournal({ name, owner = null, entries = [] }) {
    const page = {
      name: 'Chronicle',
      flags: { [MODULE_ID]: { [CHRONICLE_KEY]: entries.map(e => ({ ...e })) } },
      setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
    };
    const journal = {
      id: `j-${journals.length + 1}`, name,
      flags: owner ? { [MODULE_ID]: { chronicleActorId: owner } } : {},
      pages: { contents: [page] },
      setFlag: async (mod, key, val) => { (journal.flags[mod] ??= {})[key] = val; },
      update: async (changes) => { if (changes.name) journal.name = changes.name; },
      createEmbeddedDocuments: async () => [],
    };
    journals.push(journal);
    return journal;
  }

  beforeEach(() => {
    journals = [];
    savedJournal = game.journal;
    game.journal = {
      get contents() { return [...journals]; },
      get: (id) => journals.find(j => j.id === id) ?? null,
      getName: (n) => journals.find(j => j.name === n) ?? null,
      [Symbol.iterator]: () => journals[Symbol.iterator](),
    };
    JournalEntry.create = async (data) => {
      const owner = data.flags?.[MODULE_ID]?.chronicleActorId ?? null;
      return makeJournal({ name: data.name, owner });
    };
  });
  afterEach(() => { game.journal = savedJournal; });

  const texts = async (actorId) => (await getChronicleEntries(actorId)).map(e => e.text);
  const stored = (journal) => journal.pages.contents[0].flags[MODULE_ID][CHRONICLE_KEY].map(e => e.text);

  it('a rename keeps the history in one journal, relabelled with the new name', async () => {
    const ash = setupActor('pc-1', 'Ash');
    await addChronicleEntry('pc-1', { text: 'We found the vault.' });
    ash.name = 'Ash Renamed';
    await addChronicleEntry('pc-1', { text: 'We opened the vault.' });

    expect(await texts('pc-1')).toEqual(['We found the vault.', 'We opened the vault.']);
    expect(journals).toHaveLength(1);
    expect(journals[0].name).toBe('Chronicle — Ash Renamed');
  });

  it('characters who share a name keep separate chronicles', async () => {
    setupActor('pc-a', 'Ash');
    setupActor('pc-b', 'Ash');
    await addChronicleEntry('pc-a', { text: 'Ash A found a vault.' });
    await addChronicleEntry('pc-b', { text: 'Ash B met Sable.' });

    expect(await texts('pc-a')).toEqual(['Ash A found a vault.']);
    expect(await texts('pc-b')).toEqual(['Ash B met Sable.']);
    expect(journals).toHaveLength(2);
  });

  it('a history an earlier rename split reads as one, and the next write folds it into one journal', async () => {
    setupActor('pc-1', 'Ash Renamed');
    const old  = makeJournal({ name: 'Chronicle — Ash', owner: 'pc-1', entries: [
      { id: 'e1', timestamp: '2026-01-01T00:00:00Z', text: 'We found the vault.' },
      { id: 'e3', timestamp: '2026-01-03T00:00:00Z', text: 'We lost the map.' },
    ] });
    const made = makeJournal({ name: 'Chronicle — Ash Renamed', owner: 'pc-1', entries: [
      { id: 'e2', timestamp: '2026-01-02T00:00:00Z', text: 'We opened the vault.' },
    ] });

    expect(await texts('pc-1')).toEqual(['We found the vault.', 'We opened the vault.', 'We lost the map.']);

    await addChronicleEntry('pc-1', { text: 'We sealed it again.' });
    expect(stored(made)).toEqual(['We found the vault.', 'We opened the vault.', 'We lost the map.', 'We sealed it again.']);
    expect(stored(old)).toEqual([]);
    expect(await texts('pc-1')).toHaveLength(4);
  });

  it('an edit and a panel save reach an entry wherever a split left it — and a delete sticks', async () => {
    setupActor('pc-1', 'Ash Renamed');
    makeJournal({ name: 'Chronicle — Ash', owner: 'pc-1', entries: [
      { id: 'e1', timestamp: '2026-01-01T00:00:00Z', text: 'Vex died.' },
    ] });
    makeJournal({ name: 'Chronicle — Ash Renamed', owner: 'pc-1', entries: [
      { id: 'e2', timestamp: '2026-01-02T00:00:00Z', text: 'We opened the vault.' },
    ] });

    await updateChronicleEntry('pc-1', 'e1', 'Vex survived.');
    expect(await texts('pc-1')).toEqual(['Vex survived.', 'We opened the vault.']);

    const kept = (await getChronicleEntries('pc-1')).filter(e => e.id !== 'e1');
    expect(await saveChronicleEntries('pc-1', kept)).toBe(true);
    expect(await texts('pc-1')).toEqual(['We opened the vault.']);
  });

  it('never attaches a journal that belongs to another character, whatever its name', async () => {
    setupActor('pc-a', 'Ash');
    setupActor('pc-b', 'Bex');
    makeJournal({ name: 'Chronicle — Bex', owner: 'pc-a', entries: [{ id: 'e1', text: 'Ash\'s secret.' }] });

    expect(await texts('pc-b')).toEqual([]);
    await addChronicleEntry('pc-b', { text: 'Bex met Sable.' });
    expect(await texts('pc-b')).toEqual(['Bex met Sable.']);
    expect(await texts('pc-a')).toEqual(['Ash\'s secret.']);
  });

  it('adopts an unflagged journal under the name when one character has it, and stamps it on write', async () => {
    setupActor('pc-1', 'Kira');
    const legacy = makeJournal({ name: 'Chronicle — Kira', entries: [{ id: 'e1', text: 'Old entry.' }] });

    expect(await texts('pc-1')).toEqual(['Old entry.']);
    await addChronicleEntry('pc-1', { text: 'New entry.' });
    expect(legacy.flags[MODULE_ID].chronicleActorId).toBe('pc-1');
    expect(journals).toHaveLength(1);
  });

  it('no code outside chronicle.js finds a Chronicle journal by its name (the panel and Quench did)', async () => {
    const fs = await import('node:fs');
    const root = new URL('../../src/', import.meta.url);
    const offenders = fs.readdirSync(root, { recursive: true })
      .filter(f => String(f).endsWith('.js') && !String(f).replace(/\\/g, '/').endsWith('character/chronicle.js'))
      .filter(f => /Chronicle — \$\{/.test(fs.readFileSync(new URL(String(f), root), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('attaches an unflagged journal to neither of two characters who share its name', async () => {
    setupActor('pc-a', 'Kira');
    setupActor('pc-b', 'Kira');
    makeJournal({ name: 'Chronicle — Kira', entries: [{ id: 'e1', text: 'Whose is this?' }] });

    expect(await texts('pc-a')).toEqual([]);
    expect(await texts('pc-b')).toEqual([]);
    expect(getCapturedWarns().some(w => /not attached to either/.test(String(w)))).toBe(true);
  });
});
