/**
 * Issue #345 AA02 (PRIVATE-CHANNEL-WINDOW-RENDERS-NOTHING) — the ✦ Private
 * Channel window puts what it renders into the window, and keeps the line
 * being typed when it re-renders.
 *
 * Foundry's ApplicationV2 renders in two steps: `_renderHTML(context)` builds
 * the result and `_replaceHTML(result, content)` puts it into the window's
 * content element. The base class implements neither (foundry-vtt-types
 * 13.346, applications/api/application.d.mts:693-710: a subclass "should
 * implement this method in order for the Application to be renderable").
 * PrivateChannelApp built its element and had no `_replaceHTML`, so in a live
 * world the window opened with an empty content area — no transcript, no
 * text box, no Send or Publish. The unit stub's render() is a no-op, so no
 * test saw it.
 *
 * The fix must keep typed input (R2T-2): issue #342 Z66 re-renders the open
 * window when its "not saved yet" line flips — on the 5 s flush timer, while
 * the player types their next line — so the replacement goes through
 * replaceKeepingInput (decisions.md "A panel's re-render keeps what the user
 * is typing"). And a sent line must not be carried back into the box.
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { StubElement } from '../helpers/cardDom.js';
import { CampaignStateSchema } from '../../src/schemas.js';

vi.mock('../../src/private-channel/narrate.js', () => ({
  requestPrivateNarration: vi.fn(async () => ({ ok: true, text: 'The narrator answers.' })),
}));

const ROOT = path.resolve(__dirname, '../..');

/** Foundry's two-step render, with the base class's own (empty) _replaceHTML. */
async function renderLikeFoundryBase(app) {
  const context = await app._prepareContext({});
  const result  = await app._renderHTML(context, {});
  const content = document.createElement('section');
  content.className = 'window-content';
  // Own or inherited from a module class — the stub base defines none, as Foundry's base defines an empty one.
  let replace = null;
  for (let p = Object.getPrototypeOf(app); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    if (Object.prototype.hasOwnProperty.call(p, '_replaceHTML')) { replace = p._replaceHTML; break; }
  }
  if (replace) replace.call(app, result, content, {});
  return content;
}

describe('issue #345 AA02 — the Private Channel window renders its content', () => {
  let savedDocument;
  beforeAll(() => {
    savedDocument = globalThis.document;
    globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  });
  afterAll(() => { globalThis.document = savedDocument; });

  it('source: every ApplicationV2 window in src/ implements _replaceHTML (Foundry\'s base does not)', () => {
    const missing = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith('.js') && !p.includes(`${path.sep}integration${path.sep}`)) {
          const src = fs.readFileSync(p, 'utf8');
          const direct = /extends\s+(?:foundry\.applications\.api\.)?ApplicationV2\b/.test(src);
          if (direct && !/_replaceHTML\s*\(/.test(src)) missing.push(path.relative(ROOT, p));
        }
      }
    };
    walk(path.join(ROOT, 'src'));
    expect(missing, 'windows with no _replaceHTML render an empty content area in Foundry').toEqual([]);
  });

  it("the ✦ Private Channel window's content holds the transcript and the input after it opens", async () => {
    const { PrivateChannelApp } = await import('../../src/private-channel/app.js');
    const app = new PrivateChannelApp({ userId: 'pl-1' });
    app.loaded = true;   // skip the saved-transcript read; the render is what is under test
    const content = await renderLikeFoundryBase(app);
    expect(content.querySelector('[data-pc-transcript]'), 'the transcript').not.toBeNull();
    expect(content.querySelector('[data-pc-input]'), "the Private Channel's text box").not.toBeNull();
    expect(content.querySelector('[data-action="send"]'), 'the Send button').not.toBeNull();
    expect(content.querySelector('[data-action="publish"]'), 'the Publish button').not.toBeNull();
  });

  it('control: a window that implements _replaceHTML (the reference\'s pattern) shows its content under the same model', async () => {
    const { PrivateChannelApp } = await import('../../src/private-channel/app.js');
    class WithReplace extends PrivateChannelApp {
      _replaceHTML(result, content) { content.innerHTML = ''; content.append(result); }
    }
    const app = new WithReplace({ userId: 'pl-2' });
    app.loaded = true;
    const content = await renderLikeFoundryBase(app);
    expect(content.querySelector('[data-pc-input]'), 'the text box').not.toBeNull();
  });
});

// ── the typed line across a re-render (R2T-2), on the multi-client table ─────

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

/** What ApplicationV2.render does: prepare → render → the class's _replaceHTML (the base's inserts nothing). */
async function renderLikeFoundry(app) {
  const ctx = await app._prepareContext({});
  const result = await app._renderHTML(ctx, {});
  if (!app.element) app.element = new StubElement('div');
  if (typeof app._replaceHTML === 'function') app._replaceHTML(result, app.element, {});
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
  expect(box(app), 'the window shows its text box').not.toBeNull();
  return app;
}

function box(app) { return app.element.querySelector('[data-pc-input]'); }

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

describe("issue #345 AA02 — Z66's refresh of the open Private Channel window keeps the line being typed", () => {
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

  it('no GM connected: the flush that finds no journal re-renders the window — the half-typed line stays in the box', async () => {
    expectConsoleError(/journal create failed/);
    await table.leave('gm-1');
    try {
      const app = await openWindow();
      box(app).value = HALF_TYPED;                       // Pat is typing his next line
      expect(app.element.querySelector('.pc-unsaved')?.hasAttribute('hidden')).toBe(true);

      await flushReply();                                // the debounced flush: no journal

      // Z66 re-rendered the window: the line now says "not saved yet" …
      expect(app.element.querySelector('.pc-unsaved')?.hasAttribute('hidden'), 'the window re-rendered').toBe(false);
      // … and what Pat was typing is still there.
      expect(box(app).value).toBe(HALF_TYPED);
    } finally {
      await table.join('gm-1');
    }
  }, 30_000);

  it('a sent line leaves the box: the re-renders around the Send do not carry it back', async () => {
    const app = await openWindow();
    const c = table.client('pl-1');
    const { PrivateChannelApp } = await c.import('../../src/private-channel/app.js');
    box(app).value = 'Do I still have the ring?';
    await c.run(() => PrivateChannelApp.DEFAULT_OPTIONS.actions.send.call(app, {}, null));
    await table.settle();
    expect(app.element.querySelector('[data-pc-transcript]').textContent).toContain('Do I still have the ring?');
    expect(app.element.querySelector('[data-pc-transcript]').textContent).toContain('The narrator answers.');
    expect(box(app).value).toBe('');
  }, 30_000);

  it('control: with the GM connected the flush saves, nothing re-renders, and the line being typed stays', async () => {
    const app = await openWindow();
    box(app).value = HALF_TYPED;
    await flushReply();
    expect(app.element.querySelector('.pc-unsaved')?.hasAttribute('hidden')).toBe(true);
    expect(box(app).value).toBe(HALF_TYPED);
  }, 30_000);
});
