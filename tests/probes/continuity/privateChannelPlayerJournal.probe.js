/**
 * PROBE — PC-TRANSCRIPT-PLAYER-CREATE (src/private-channel/transcript.js)
 *
 * A player's Private Channel transcript is written from the PLAYER's client:
 * getOrCreatePrivateJournal calls JournalEntry.create there. Foundry gates
 * JournalEntry creation on the JOURNAL_CREATE user permission, whose default
 * role is Trusted Player — a plain Player (CONST.USER_ROLES.PLAYER) is refused.
 * Nothing relays the create to the GM, so for a default Player every flush
 * fails ("journal create failed", "turn(s) kept for a retry"), the retries run
 * out, and the conversation is gone when the window closes or the page
 * reloads — although the help says "Each player's conversation is saved to
 * their own journal".
 *
 * The JournalEntry.create double below enforces Foundry's default rule (the
 * permission-faithful stubs in tests/helpers/foundryPermissions.js model
 * settings / ChatMessage / Actor writes, but not document creation).
 *
 * Asserts the CORRECT behaviour (a default Player's transcript is saved);
 * fails today.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  appendToBuffer,
  flushNow,
  loadCurrentSessionTranscript,
  _resetBuffers,
} from '../../../src/private-channel/transcript.js';

const MODULE_ID = 'starforged-companion';
const ROLES = { NONE: 0, PLAYER: 1, TRUSTED: 2, ASSISTANT: 3, GAMEMASTER: 4 };
let saved, journals, restoreUser;

function makeJournal(data) {
  const pages = [];
  const journal = {
    id: `je-${data.name}`, name: data.name, ownership: data.ownership ?? {},
    flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    pages: { get contents() { return pages; } },
    createEmbeddedDocuments: async (_t, docs) => {
      const made = docs.map(d => ({
        ...d, id: `pg-${pages.length}`, flags: JSON.parse(JSON.stringify(d.flags ?? {})),
        update: async (u) => { Object.assign(made[0], u); },
      }));
      pages.push(...made);
      return made;
    },
    setFlag: async (m, k, v) => { (journal.flags[m] ??= {})[k] = v; },
    update: async () => {},
  };
  return journal;
}

beforeEach(() => {
  _resetBuffers();
  journals = [];
  saved = { journal: global.game.journal, users: global.game.users, JE: global.JournalEntry, folders: global.game.folders };
  global.game.journal = {
    get contents() { return journals; },
    getName: (n) => journals.find(j => j.name === n) ?? null,
    find: (fn) => journals.find(fn) ?? null,
  };
  const users = new Map([
    ['player-1', { id: 'player-1', name: 'Sam', isGM: false, active: true, role: ROLES.PLAYER }],
    ['gm-1',     { id: 'gm-1',     name: 'GM',  isGM: true,  active: true, role: ROLES.GAMEMASTER }],
  ]);
  global.game.users = { get: (id) => users.get(id) ?? null, get contents() { return [...users.values()]; } };
  global.game.folders = { find: () => ({ id: 'folder-sfc' }) };
  // Foundry: JournalEntry creation needs JOURNAL_CREATE (default: Trusted Player and up).
  global.JournalEntry = {
    create: async (data) => {
      const u = game.user;
      if (!u?.isGM && (u?.role ?? ROLES.PLAYER) < ROLES.TRUSTED) {
        throw new Error(`User ${u?.name ?? u?.id} lacks permission to create JournalEntry [${data.name}]`);
      }
      const j = makeJournal(data);
      journals.push(j);
      return j;
    },
  };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 'ses-1' });
  restoreUser = withUser({ isGM: false, id: 'player-1', name: 'Sam', role: ROLES.PLAYER });
});

afterEach(() => {
  restoreUser();
  _resetBuffers();
  global.game.journal = saved.journal;
  global.game.users = saved.users;
  global.game.folders = saved.folders;
  global.JournalEntry = saved.JE;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

describe("a default Player's Private Channel transcript", () => {
  it('is saved when the window flushes', async () => {
    expectConsoleError(/journal create failed/);
    appendToBuffer('player-1', { who: 'player', name: 'Dax', text: 'I never told anyone about the ring.' });
    await flushNow('player-1');
    expect(await loadCurrentSessionTranscript('player-1', 'ses-1')).toContain('about the ring');
  });
});
