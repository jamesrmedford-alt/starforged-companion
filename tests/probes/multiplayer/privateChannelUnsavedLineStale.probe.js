/**
 * Eleventh audit — multiplayer probe (MP-2).
 *
 * Issue #337 Y41 (PRIVATE-TRANSCRIPT-NO-GM-SILENT) was fixed with a one-time
 * toast and "a line in the window" that says the conversation is not being
 * saved "while it lasts" (decisions.md, the tenth audit's Y41 row;
 * transcript.js noteTranscriptSaved: "the window's line goes"). The line is
 * computed in PrivateChannelApp._prepareContext from isTranscriptUnsaved —
 * but nothing re-renders the open window when that state changes. The
 * window renders on the player's Send (before the narrator call) and after
 * the reply; the transcript flush that finds no journal runs 5 s later (the
 * debounce), and the flush that saves runs 5 s after a later reply. So:
 *
 *   - the line never appears after the first failed flush — only the
 *     transient toast says so; a player who missed it and reloads loses the
 *     conversation the window said nothing about;
 *   - once a GM has joined and a flush saves, the line stays ("not saved yet
 *     … Don't reload") beside the "saved now" toast until the next Send.
 *
 * Correct: the open window re-renders when the unsaved state flips.
 */

/* global expectConsoleError */
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
  if (levelOf(journal, game.user) < OWNER) throw new Error(`User ${game.user?.id} lacks permission to ${what} [${journal.name}]`);
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
      if (!user?.isGM && (user?.role ?? ROLES.PLAYER) < ROLES.TRUSTED) {
        throw new Error(`User ${user?.id} lacks permission to create JournalEntry [${data.name}]`);
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
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, currentSessionId: 'sess-1' } } } });
});
afterEach(async () => {
  for (const id of ['gm-1', 'pl-1']) {
    const client = table.client(id);
    const transcript = await client.import('../../src/private-channel/transcript.js');
    client.run(() => transcript._resetBuffers());
    const { PrivateChannelApp } = await client.import('../../src/private-channel/app.js');
    client.run(() => PrivateChannelApp._resetInstances());
  }
});

/** Pat's Private Channel window, open on his client, with its renders counted. */
async function openWindow() {
  const c = table.client('pl-1');
  const { PrivateChannelApp } = await c.import('../../src/private-channel/app.js');
  const app = await c.run(() => PrivateChannelApp.open({ userId: 'pl-1' }));
  const renders = [];
  app.render = async function render(options) {
    renders.push(await this._prepareContext(options ?? {}));
    return this;
  };
  return { app, renders };
}

/** A turn of Pat's, then the transcript flush the window's debounce fires. */
async function sayAndFlush(text) {
  const c = table.client('pl-1');
  const transcript = await c.import('../../src/private-channel/transcript.js');
  const flushed = c.run(() => {
    transcript.appendToBuffer('pl-1', { who: 'player', name: 'Kira', text });
    return transcript.flushNow('pl-1');
  });
  await table.settle();
  await flushed;
  await table.settle();
}

describe('MP-2 — the Private Channel window says "not saved" while it lasts (issue #337 Y41)', () => {
  it('control: the state the window would show is right — unsaved after a flush with no GM', async () => {
    expectConsoleError(/journal create failed/);
    await table.leave('gm-1');
    try {
      await openWindow();
      await sayAndFlush('I never told anyone about the ring.');
      const transcript = await table.client('pl-1').import('../../src/private-channel/transcript.js');
      expect(table.client('pl-1').run(() => transcript.isTranscriptUnsaved('pl-1'))).toBe(true);
    } finally {
      await table.join('gm-1');
    }
  }, 30_000);

  it('the open window shows the line once a flush finds no journal', async () => {
    expectConsoleError(/journal create failed/);
    await table.leave('gm-1');
    try {
      const { renders } = await openWindow();
      renders.length = 0;
      await sayAndFlush('I never told anyone about the ring.');
      // Correct: the window re-renders with the line. Today nothing renders it.
      expect(renders.map(r => r.unsaved)).toContain(true);
    } finally {
      await table.join('gm-1');
    }
  }, 30_000);

  it('the line goes once a later flush saves the conversation', async () => {
    expectConsoleError(/journal create failed/);
    await table.leave('gm-1');
    const { app, renders } = await openWindow();
    await sayAndFlush('I never told anyone about the ring.');
    await table.join('gm-1');
    // A send renders the window — the line is shown (still unsaved) …
    await app.render();
    expect(renders.at(-1).unsaved).toBe(true);
    renders.length = 0;
    // … then the debounced flush lands with a GM connected: "saved now".
    await sayAndFlush('Or about the debt.');
    const saved = table.client('pl-1').notifications.filter(n => /saved now/.test(n.message));
    expect(saved).toHaveLength(1);
    // Correct: the window's line goes with it. Today the last render still
    // says "not saved yet … Don't reload".
    expect(renders.map(r => r.unsaved)).toContain(false);
  }, 30_000);
});
