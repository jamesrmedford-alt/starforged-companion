/**
 * SESS-03 · PRIVATE-REOPEN-DROPS-UNSAVED-TURNS
 *
 * Scenario: Pat (a default Player with his own Claude key) uses the Private
 * Channel while no GM is connected. Its journal cannot be made (Foundry lets
 * only a Trusted Player create one; a GM's game makes it otherwise), so the
 * turns are "kept in this browser" (transcript.js's buffer) and the window
 * says so: "This conversation is not saved yet — it is kept in this browser
 * until its journal can be written". Pat closes the window and opens it again
 * — no reload.
 *
 * Correct: the reopened window shows the conversation it says is kept in this
 * browser, and the private narrator's next turn is sent it (decisions.md "The
 * Private Channel reads the shared story": "it is sent the session's whole
 * private transcript — the saved turns read back when the window reopens").
 *
 * Today: the reopened window reads only the saved page (app.js #syncSession →
 * loadCurrentSessionTranscript). The turns still waiting in the buffer are not
 * read, so the window opens empty under its own "kept in this browser" line,
 * and the narrator answers the next message with no memory of the exchange.
 * When a GM joins, the flush writes the old turns to the page — the open
 * window still never shows them.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const ROLES = { PLAYER: 1, TRUSTED: 2 };
const OWNER = 3;
let table, savedJournalEntry;

function levelOf(doc, user) {
  if (user?.isGM) return OWNER;
  const o = doc.ownership ?? {};
  return Math.max(Number(o[user?.id] ?? 0), Number(o.default ?? 0));
}
function refuseUnlessOwner(journal, what) {
  const user = game.user;
  if (levelOf(journal, user) < OWNER) throw new Error(`User ${user?.name ?? user?.id} lacks permission to ${what} [${journal.name}]`);
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
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });   // P1 is a default Player
  savedJournalEntry = globalThis.JournalEntry;
  globalThis.JournalEntry = {
    create: async (data) => {
      const user = game.user;
      // Foundry: JOURNAL_CREATE defaults to Trusted Player and up.
      if (!user?.isGM && (user?.role ?? ROLES.PLAYER) < ROLES.TRUSTED) {
        throw new Error(`User ${user?.name ?? user?.id} lacks permission to create JournalEntry [${data.name}]`);
      }
      const journal = makeJournal(data);
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
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, currentSessionId: 'sess-1', sessionNumber: 1, lastSessionTimestamp: new Date().toISOString(),
  } } } });
  await table.setClaudeKey('pl-1', 'sk-ant-pat');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.claude.respond(() => 'You never did. The ring is still in the locker.');
  silenceConsoleErrors();
});

afterEach(async () => {
  const client = table.client('pl-1');
  const transcript = await client.import('../../src/private-channel/transcript.js');
  client.run(() => transcript._resetBuffers());
  const { PrivateChannelApp } = await client.import('../../src/private-channel/app.js');
  client.run(() => PrivateChannelApp._resetInstances());
  if (!table.client('gm-1').connected) await table.join('gm-1');
});

const pat = () => table.client('pl-1');

async function openWindow() {
  const { PrivateChannelApp } = await pat().import('../../src/private-channel/app.js');
  return pat().run(() => PrivateChannelApp.open({ userId: 'pl-1' }));
}

/** Pat types `text` in the window and sends it; the private narrator answers. */
async function say(app, text) {
  const { PrivateChannelApp } = await pat().import('../../src/private-channel/app.js');
  const box = { value: text };
  app.element = { querySelector: (s) => (s === '[data-pc-input]' ? box : null) };
  await pat().run(() => PrivateChannelApp.DEFAULT_OPTIONS.actions.send.call(app, {}, null));
  await table.settle();
}

/** The debounced save (5 s after the reply) runs now. */
async function flush() {
  const transcript = await pat().import('../../src/private-channel/transcript.js');
  await pat().run(() => transcript.flushNow('pl-1'));
  await table.settle();
  return transcript;
}

/** Pat closes the window (Foundry's close runs _onClose) and opens it again. */
async function closeAndReopen(app) {
  pat().run(() => app._onClose({}));
  await table.settle();
  const reopened = await openWindow();
  const context = await pat().run(() => reopened._prepareContext({}));
  return { reopened, context };
}

describe('SESS-03 — a Private Channel window closed and reopened while its conversation is unsaved', () => {
  it('control: with a GM connected the conversation is saved, and the reopened window shows it', async () => {
    const app = await openWindow();
    await say(app, 'I never told anyone about the ring.');
    const transcript = await flush();
    expect(pat().run(() => transcript.isTranscriptUnsaved('pl-1'))).toBe(false);

    const { context } = await closeAndReopen(app);
    expect(context.transcriptHtml).toContain('about the ring');
    expect(context.transcriptHtml).toContain('still in the locker');
  }, 30_000);

  it('no GM connected: the reopened window shows the conversation it says is kept in this browser', async () => {
    await table.leave('gm-1');
    const app = await openWindow();
    await say(app, 'I never told anyone about the ring.');
    expect(app.turns.map(t => t.who), 'the exchange happened in the window').toEqual(['player', 'narrator']);
    const transcript = await flush();
    expect(pat().run(() => transcript.isTranscriptUnsaved('pl-1')), 'kept in this browser only').toBe(true);

    const { context } = await closeAndReopen(app);
    expect(context.unsaved, 'the window still says the conversation is kept in this browser').toBe(true);
    expect(context.transcriptHtml).toContain('about the ring');
  }, 30_000);

  it('no GM connected: the narrator\'s next turn in the reopened window is sent the earlier exchange', async () => {
    await table.leave('gm-1');
    const app = await openWindow();
    await say(app, 'I never told anyone about the ring.');
    await flush();

    const { reopened } = await closeAndReopen(app);
    await say(reopened, 'Should I tell Ren?');
    const last = table.claude.calls.at(-1);
    expect(last.userText).toContain('Should I tell Ren?');
    expect(last.userText).toContain('about the ring');
  }, 30_000);
});
