/**
 * PROBE — MP-02 PRIVATE-TRANSCRIPT-NO-GM-SILENT (tenth audit, area multiplayer)
 *
 * What the user does: Pat, a default Player (Foundry role Player) with their
 * own Claude key, opens the Private Channel between sessions while no GM is
 * connected, and talks with the narrator for a while — the private narrator
 * needs only the player's key (src/private-channel/narrate.js:45), so every
 * turn is answered.
 *
 * What happens: the transcript is never saved. With no GM online the flush
 * tries to create the journal locally (src/private-channel/transcript.js:199
 * `if (game.user?.isGM || !hasActiveGM()) return createPrivateJournal(userId)`),
 * which Foundry refuses for a default Player (JOURNAL_CREATE is Trusted
 * Player and up — the issue #321 U10 finding), so writeBatch keeps the turns
 * "for a retry" (:420), retries three times over 30 s against the same
 * refusal (:406) and then waits for the next flush trigger. Only the console
 * says so. The window shows the conversation while it is open; close it and
 * reopen it, or reload, and the turns are gone from view — and a reload loses
 * them for good (the buffer is memory). Nothing tells Pat the conversation is
 * not being kept.
 *
 * What should happen: the player is told the transcript could not be saved
 * — a notification or the window's error banner — as every other write a
 * player cannot land says so ("no GM is connected, so this change could not
 * be saved", gmRelay.js:349; the dialogs' "was not recorded" footnotes;
 * decisions.md "No silent failures" / issue #329 X13 "No silent no-op on a
 * player's action"). PRIVATE-WINDOW-SESSION-CHANGE (known) is a different
 * loss: a window kept open across a session change.
 *
 * Control: with the GM connected the GM creates the journal and the turn is
 * saved (issue #321 U10).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/multiplayer/privateTranscriptNoGmSilent.probe.js
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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
  return { read: () => client.run(() => transcript.loadCurrentSessionTranscript(userId, 'sess-1')) };
}

describe("MP-02 a default Player's Private Channel with no GM connected", () => {
  it('control: with the GM connected the turn is saved through the journal the GM makes', async () => {
    const { read } = await sayAndFlush('pl-1', 'I never told anyone about the ring.');
    expect(await read()).toContain('about the ring');
    expect(created.map(c => c.by)).toEqual(['gm-1']);
  });

  it('the player is told the conversation is not being saved', async () => {
    expectConsoleError(/journal create failed/);
    await table.leave('gm-1');
    try {
      const { read } = await sayAndFlush('pl-1', 'I never told anyone about the ring.');

      // Sanity: nothing could be created or saved — the turn exists only in memory.
      expect(created).toHaveLength(0);
      expect(await read()).toBe('');

      // Expected: a word to the player — a notification (or the window's banner) that the
      // transcript is not being saved while no GM is connected.
      // Actual: none — only a console warning ("no session page — 1 turn(s) kept for a retry").
      const told = table.client('pl-1').notifications.some(n => /not (be )?saved|could not save|no GM|unsaved|transcript|Private Channel/i.test(n.message));
      expect(told).toBe(true);
    } finally {
      await table.join('gm-1');
    }
  }, 30_000);
});
