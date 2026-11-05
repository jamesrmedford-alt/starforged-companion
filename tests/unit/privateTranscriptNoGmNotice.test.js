/**
 * STARFORGED COMPANION
 * tests/unit/privateTranscriptNoGmNotice.test.js
 *
 * Issue #337 Y41 (PRIVATE-TRANSCRIPT-NO-GM-SILENT) — a player whose Private
 * Channel conversation cannot be saved for want of a journal is told.
 *
 * A default Player with their own Claude key uses the Private Channel while
 * no GM is connected: every turn is answered, and none is saved. With no GM
 * online the flush tries to create the journal locally, Foundry refuses
 * JOURNAL_CREATE below Trusted Player (issue #321 U10), the turns are kept
 * "for a retry" in memory — and only the console said so; a reload lost
 * them. Now the player is told once (a warning, and a line in the window)
 * that the conversation is not being saved and not to reload, and told
 * again — "saved now" — once a later flush lands.
 *
 * (Converted from the tenth audit's probe
 * tests/probes/multiplayer/privateTranscriptNoGmSilent.probe.js.)
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const ROLES = { PLAYER: 1, TRUSTED: 2 };
const OWNER = 3;
let table, savedJournalEntry, created;

/** The user's ownership level on a document, as Foundry computes it (a GM owns everything). */
function levelOf(doc, user) {
  if (user?.isGM) return OWNER;
  const o = doc.ownership ?? {};
  return Math.max(Number(o[user?.id] ?? 0), Number(o.default ?? 0));
}

function refuseUnlessOwner(journal, what) {
  const user = game.user;
  if (levelOf(journal, user) < OWNER) {
    throw new Error(`User ${user?.name ?? user?.id} lacks permission to ${what} [${journal.name}]`);
  }
}

function makeJournal(data) {
  const pages = [];
  const journal = {
    id: `je-${table.journal.size + 1}`, name: data.name, folder: data.folder ?? null,
    ownership: { ...(data.ownership ?? {}) },
    flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    pages: { get contents() { return pages; } },
    createEmbeddedDocuments: async (_type, docs) => {
      refuseUnlessOwner(journal, 'create JournalEntryPage in');
      const made = docs.map((d, i) => {
        const page = {
          ...d, id: `pg-${pages.length + i}`, flags: JSON.parse(JSON.stringify(d.flags ?? {})),
          update: async (changes) => { refuseUnlessOwner(journal, 'update JournalEntryPage in'); Object.assign(page, changes); },
        };
        return page;
      });
      pages.push(...made);
      return made;
    },
    setFlag: async (scope, key, value) => { refuseUnlessOwner(journal, 'update'); (journal.flags[scope] ??= {})[key] = value; },
    update: async (changes) => { refuseUnlessOwner(journal, 'update'); Object.assign(journal, changes); },
  };
  return journal;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });   // P1 is a default Player (role 1)
  savedJournalEntry = globalThis.JournalEntry;
  globalThis.JournalEntry = {
    create: async (data) => {
      const user = game.user;
      // Foundry: JOURNAL_CREATE defaults to Trusted Player and up.
      if (!user?.isGM && (user?.role ?? ROLES.PLAYER) < ROLES.TRUSTED) {
        throw new Error(`User ${user?.name ?? user?.id} lacks permission to create JournalEntry [${data.name}]`);
      }
      const journal = makeJournal(data);
      created.push({ by: user.id, journal });
      table.journal.set(journal.id, journal);
      table.fireDocumentHook(user.id, 'createJournalEntry', journal);
      return journal;
    },
  };
}, 30_000);
afterAll(() => {
  globalThis.JournalEntry = savedJournalEntry;
  table?.teardown();
});

beforeEach(async () => {
  created = [];
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, currentSessionId: 'sess-1' } } } });
});

// The transcript module keeps a retry timer per player; clear it so a refused
// flush does not fire again after the test.
afterEach(async () => {
  for (const id of ['gm-1', 'pl-1']) {
    const client = table.client(id);
    const transcript = await client.import('../../src/private-channel/transcript.js');
    client.run(() => transcript._resetBuffers());
  }
});

const NOT_SAVED = /Private Channel conversation is not being saved/;
const SAVED_NOW = /Private Channel conversation is saved now/;
const notices = (userId, re) => table.client(userId).notifications.filter(n => re.test(n.message));

async function transcriptOn(userId) {
  return table.client(userId).import('../../src/private-channel/transcript.js');
}

/** `userId` says something in their Private Channel and the window flushes. */
async function sayAndFlush(userId, text) {
  const client = table.client(userId);
  const transcript = await transcriptOn(userId);
  const flushed = client.run(() => {
    transcript.appendToBuffer(userId, { who: 'player', name: 'Kira', text });
    return transcript.flushNow(userId);
  });
  await table.settle();
  await flushed;
  return { read: () => client.run(() => transcript.loadCurrentSessionTranscript(userId, 'sess-1')) };
}

describe("issue #337 Y41 — a default Player's Private Channel with no GM connected", () => {
  it('control: with the GM connected the turn is saved through the journal the GM makes, and nothing is said', async () => {
    const { read } = await sayAndFlush('pl-1', 'I never told anyone about the ring.');
    expect(await read()).toContain('about the ring');
    expect(created.map(c => c.by)).toEqual(['gm-1']);
    expect(notices('pl-1', NOT_SAVED)).toHaveLength(0);
  });

  it('the player is told — once — that the conversation is not being saved, and the window says so', async () => {
    expectConsoleError(/journal create failed/);
    await table.leave('gm-1');
    try {
      const { read } = await sayAndFlush('pl-1', 'I never told anyone about the ring.');
      expect(created).toHaveLength(0);                     // nothing could be created …
      expect(await read()).toBe('');                       // … or saved: the turn is in memory only

      expect(notices('pl-1', NOT_SAVED)).toHaveLength(1);
      expect(notices('pl-1', NOT_SAVED)[0].message).toMatch(/no GM is connected.*Don't reload before then/);
      const transcript = await transcriptOn('pl-1');
      expect(table.client('pl-1').run(() => transcript.isTranscriptUnsaved('pl-1'))).toBe(true);

      // The window shows it while it lasts.
      const { PrivateChannelApp } = await table.client('pl-1').import('../../src/private-channel/app.js');
      const context = await table.client('pl-1').run(() => new PrivateChannelApp({ userId: 'pl-1' })._prepareContext({}));
      expect(context.unsaved).toBe(true);

      await sayAndFlush('pl-1', 'Or about the debt.');     // a second refused flush: no second warning
      expect(notices('pl-1', NOT_SAVED)).toHaveLength(1);
    } finally {
      await table.join('gm-1');
    }
  }, 30_000);

  it('once a GM joins the next flush saves every kept turn, and the player is told it is saved', async () => {
    expectConsoleError(/journal create failed/);
    await table.leave('gm-1');
    await sayAndFlush('pl-1', 'I never told anyone about the ring.');
    expect(notices('pl-1', NOT_SAVED)).toHaveLength(1);
    await table.join('gm-1');

    const { read } = await sayAndFlush('pl-1', 'Or about the debt.');

    const saved = await read();
    expect(saved).toContain('about the ring');
    expect(saved).toContain('about the debt');
    expect(notices('pl-1', SAVED_NOW)).toHaveLength(1);
    const transcript = await transcriptOn('pl-1');
    expect(table.client('pl-1').run(() => transcript.isTranscriptUnsaved('pl-1'))).toBe(false);
  }, 30_000);
});
