/**
 * PROBE — R2T: PRIVATE-CHANNEL-REFRESH-WIPES-TYPING (twelfth audit, round 2,
 * 2026-11-10). A regression of issue #342 Z66 (PRIVATE-UNSAVED-LINE-NOT-RENDERED).
 *
 * Z66 made the open Private Channel window re-render itself when its "not
 * saved yet" line flips: transcript.js noteTranscriptUnsaved /
 * noteTranscriptSaved (469-482) → notifyUnsavedChange → app.js's module-level
 * listener (285-286) → PrivateChannelApp.refresh (263-275) → `app.render()`.
 * The flips happen on timers, not on anything the player does: the debounced
 * flush 5 s after the narrator's reply (scheduleDebouncedWrite) finds no
 * journal (a default Player with no GM connected — Foundry refuses
 * JOURNAL_CREATE below Trusted), and a later flush lands once a GM is back.
 *
 * Until Z66 the window rendered only from the player's own Send / Publish,
 * which take the input first. Now it re-renders while the player is typing
 * their next line — and the window keeps nothing it renders over:
 * _renderHTML (app.js 132-155) writes the textarea from `initialMessage`
 * (emptied by the Send, 191) and the class has no `_replaceHTML` of its own
 * (the only module window without one — every other one, and the module's
 * Foundry reference, replaces the content node). decisions.md → "A panel's
 * re-render keeps what the user is typing" [Y45] (src/ui/keepTypedInput.js
 * replaceKeepingInput) is the rule the other hook-driven re-renders follow.
 *
 * Scenario: no GM connected; Pat asks the private narrator something, gets
 * the reply, and starts typing his next line; the 5 s flush finds no journal.
 *
 * The window is rendered the way Foundry's ApplicationV2 does it — prepare →
 * _renderHTML → replace the content node (the class's own `_replaceHTML` when
 * it has one, else the documented content.innerHTML = '' + append) — on the
 * multi-client table, with tests/unit/privateTranscriptNoGmNotice.test.js's
 * journal permissions (Z66's own test stubs render out).
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { StubElement } from '../../helpers/cardDom.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const ROLES = { PLAYER: 1, TRUSTED: 2 };
const OWNER = 3;
let table, savedJournalEntry, savedDocument;

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
      if (!user?.isGM && (user?.role ?? ROLES.PLAYER) < ROLES.TRUSTED) {
        throw new Error(`User ${user?.name ?? user?.id} lacks permission to create JournalEntry [${data.name}]`);
      }
      const journal = makeJournal(data);
      table.journal.set(journal.id, journal);
      table.fireDocumentHook(user.id, 'createJournalEntry', journal);
      return journal;
    },
  };
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
}, 30_000);
afterAll(() => {
  globalThis.JournalEntry = savedJournalEntry;
  globalThis.document = savedDocument;
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

/** What ApplicationV2.render does: prepare → render → replace the window's content. */
async function renderLikeFoundry(app) {
  const ctx = await app._prepareContext({});
  const result = await app._renderHTML(ctx, {});
  if (!app.element) app.element = new StubElement('div');
  if (typeof app._replaceHTML === 'function') app._replaceHTML(result, app.element, {});
  else { app.element.innerHTML = ''; app.element.append(result); }
  app.rendered = true;
  return app;
}

/** Pat's Private Channel window, open and rendered on his client. */
async function openWindow() {
  const c = table.client('pl-1');
  const { PrivateChannelApp } = await c.import('../../src/private-channel/app.js');
  const app = await c.run(() => PrivateChannelApp.open({ userId: 'pl-1' }));
  app.render = function render() { return c.run(() => renderLikeFoundry(this)); };
  await app.render({ force: true });
  return app;
}

const box = (app) => app.element.querySelector('[data-pc-input]');

/** The exchange Pat just had, flushed as the window's 5 s debounce flushes it. */
async function flushReply() {
  const c = table.client('pl-1');
  const transcript = await c.import('../../src/private-channel/transcript.js');
  const flushed = c.run(() => {
    transcript.appendToBuffer('pl-1', { who: 'player', name: 'Kira', text: 'Do I still have the ring?' });
    transcript.appendToBuffer('pl-1', { who: 'narrator', name: 'Narrator', text: 'It is cold against your palm, in your pocket.' });
    return transcript.flushNow('pl-1');
  });
  await table.settle();
  await flushed;
  await table.settle();
}

const HALF_TYPED = 'And what about the debt I owe the';

describe("R2T — Z66's refresh of the open Private Channel window keeps the line being typed", () => {
  it('no GM connected: the flush that finds no journal re-renders the window — the half-typed line stays in the box', async () => {
    expectConsoleError(/journal create failed/);
    await table.leave('gm-1');
    try {
      const app = await openWindow();
      box(app).value = HALF_TYPED;                       // Pat is typing his next line
      const before = app.element.querySelector('.pc-unsaved');
      expect(before?.hasAttribute('hidden')).toBe(true);

      await flushReply();                                // the debounced flush: no journal

      // Z66 re-rendered the window: the line now says "not saved yet" …
      expect(app.element.querySelector('.pc-unsaved')?.hasAttribute('hidden'), 'the window re-rendered').toBe(false);
      // … and what Pat was typing must still be there.
      expect(box(app).value).toBe(HALF_TYPED);
    } finally {
      await table.join('gm-1');
    }
  }, 30_000);

  it('control: with the GM connected the flush saves, nothing re-renders, and the line being typed stays', async () => {
    const app = await openWindow();
    box(app).value = HALF_TYPED;
    await flushReply();
    expect(app.element.querySelector('.pc-unsaved')?.hasAttribute('hidden')).toBe(true);
    expect(box(app).value).toBe(HALF_TYPED);
  }, 30_000);
});
