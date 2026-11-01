/**
 * A default Player's Private Channel history is saved (issue #321 U10).
 *
 * The transcript journal was created from the PLAYER's client:
 * getOrCreatePrivateJournal called JournalEntry.create there. Foundry gates
 * JournalEntry creation on the JOURNAL_CREATE user permission, whose default
 * role is Trusted Player — a plain Player is refused — so for a default Player
 * every flush failed, the retries ran out, and the conversation was gone when
 * the window closed or the page reloaded. The canonical GM now creates the
 * journal (GM relay "privateChannel.createJournal"), naming the player its
 * OWNER, and the player's flush waits for it and writes its pages itself.
 *
 * The journal double enforces Foundry's default rules (tests/helpers/
 * foundryPermissions.js models settings / ChatMessage / Actor writes, not
 * document creation): creating a JournalEntry needs Trusted Player or a GM;
 * creating or writing its pages needs OWNER on the journal. On the
 * multi-client harness, so the relay really crosses to the GM's client.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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

/** `userId` says something in their Private Channel and the window flushes. */
async function sayAndFlush(userId, text) {
  const client = table.client(userId);
  const transcript = await client.import('../../src/private-channel/transcript.js');
  const flushed = client.run(() => {
    transcript.appendToBuffer(userId, { who: 'player', name: 'Kira', text });
    return transcript.flushNow(userId);
  });
  await table.settle();
  await flushed;
  return { transcript, read: () => client.run(() => transcript.loadCurrentSessionTranscript(userId, 'sess-1')) };
}

describe("a default Player's Private Channel transcript", () => {
  it('is saved when the window flushes: the GM creates the journal, owned by the player', async () => {
    const { read } = await sayAndFlush('pl-1', 'I never told anyone about the ring.');

    expect(await read()).toContain('about the ring');
    expect(created.map(c => c.by)).toEqual(['gm-1']);
    expect(created[0].journal.ownership).toMatchObject({ default: 0, 'pl-1': OWNER });
    expect(created[0].journal.flags['starforged-companion'].privateChannelOwner).toBe('pl-1');
  });

  it('a later flush writes to the same journal — one journal per player', async () => {
    await sayAndFlush('pl-1', 'First thought.');
    const { read } = await sayAndFlush('pl-1', 'Second thought.');

    expect(created).toHaveLength(1);
    const text = await read();
    expect(text).toContain('First thought.');
    expect(text).toContain('Second thought.');
  });

  it('the GM serves a repeated create with the journal it already made', async () => {
    const gm = table.client('gm-1');
    const transcript = await gm.import('../../src/private-channel/transcript.js');
    const first  = await gm.run(() => transcript.applyPrivateJournalCreate({}, { requesterId: 'pl-1' }));
    const second = await gm.run(() => transcript.applyPrivateJournalCreate({}, { requesterId: 'pl-1' }));
    expect(second).toBe(first);
    expect(created).toHaveLength(1);
  });

  it('control: the GM creates its own transcript journal on its own client', async () => {
    const { read } = await sayAndFlush('gm-1', 'A note for myself.');
    expect(await read()).toContain('A note for myself.');
    expect(created.map(c => c.by)).toEqual(['gm-1']);
  });
});
