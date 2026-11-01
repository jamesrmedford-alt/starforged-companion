/**
 * The Private Channel window keeps one transcript — the one it shows is the
 * one it sends the narrator (issue #321 U42).
 *
 * The window held two copies: `resumedHtml`, the session page's HTML loaded on
 * render, for display, and `this.turns`, "since this window opened", for the
 * narrator. So after a player closed the window (or Foundry reloaded) and
 * reopened it, the earlier exchange was on screen but the narrator — whose
 * only memory of the aside is that transcript (the private narrator writes no
 * sidecar) — had never heard of it. And because the page was re-read on every
 * render while the first read was empty, the session's first exchange was
 * loaded back from the page once the 5 s save landed, and shown twice.
 *
 * Every ApplicationV2 render runs _prepareContext; the tests call it where the
 * window renders (the stub ApplicationV2.render is a no-op).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/private-channel/narrate.js', () => ({
  requestPrivateNarration: vi.fn(async () => ({ ok: true, text: 'The narrator answers.' })),
}));

import { PrivateChannelApp } from '../../src/private-channel/app.js';
import { requestPrivateNarration } from '../../src/private-channel/narrate.js';
import { renderTurnsHtml, flushNow, _resetBuffers } from '../../src/private-channel/transcript.js';

const MODULE_ID = 'starforged-companion';
let saved, journals;

function makeJournal(data) {
  const pages = [];
  const journal = {
    id: `je-${journals.length}`, name: data.name, ownership: data.ownership ?? {},
    flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    pages: { get contents() { return pages; } },
    createEmbeddedDocuments: async (_t, docs) => {
      const made = docs.map((d) => {
        const page = { ...d, id: `pg-${pages.length}`, flags: JSON.parse(JSON.stringify(d.flags ?? {})) };
        page.update = async (u) => { Object.assign(page, u); };
        return page;
      });
      pages.push(...made);
      return made;
    },
    setFlag: async (m, k, v) => { (journal.flags[m] ??= {})[k] = v; },
    update: async () => {},
  };
  return journal;
}

const typed = (app, text) => { app.element = { querySelector: (s) => (s === '[data-pc-input]' ? { value: text } : null) }; };
const send  = (app, text) => { typed(app, text); return PrivateChannelApp.DEFAULT_OPTIONS.actions.send.call(app, {}, null); };
const count = (haystack, needle) => haystack.split(needle).length - 1;

beforeEach(() => {
  _resetBuffers();
  journals = [];
  saved = { journal: global.game.journal, users: global.game.users, JE: global.JournalEntry, folders: global.game.folders };
  global.game.journal = {
    get contents() { return journals; },
    getName: (n) => journals.find(j => j.name === n) ?? null,
    find: (fn) => journals.find(fn) ?? null,
  };
  global.JournalEntry = { create: async (data) => { const j = makeJournal(data); journals.push(j); return j; } };
  global.game.folders = { find: () => ({ id: 'folder-sfc' }) };
  const users = new Map([['player-1', { id: 'player-1', name: 'Sam', isGM: false, active: true, character: { id: 'pc-dax', name: 'Dax' } }]]);
  global.game.users = { get: (id) => users.get(id) ?? null, get contents() { return [...users.values()]; } };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 'ses-1' });
});

afterEach(() => {
  _resetBuffers();
  PrivateChannelApp._resetInstances();
  global.game.journal = saved.journal;
  global.game.users = saved.users;
  global.JournalEntry = saved.JE;
  global.game.folders = saved.folders;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
  vi.clearAllMocks();
});

describe('Private Channel reopened in the same session', () => {
  beforeEach(() => {
    // The session's earlier exchange, saved to the player's journal before the window closed.
    const journal = makeJournal({ name: 'Private Channel — Sam', flags: { [MODULE_ID]: { privateChannelOwner: 'player-1' } } });
    journal.pages.contents.push({
      id: 'pg-1', name: 'Session ses-1',
      flags: { [MODULE_ID]: { privateChannelPage: { sessionId: 'ses-1', createdAt: '2026-10-30T20:00:00Z' } } },
      text: { format: 1, content: renderTurnsHtml([
        { who: 'player',   name: 'Dax',      text: "Do you remember my mother's ring?" },
        { who: 'narrator', name: 'Narrator', text: 'The ring she pressed into your palm the night the Ascent burned.' },
      ]) },
    });
    journals.push(journal);
  });

  it("sends the narrator the session's earlier private turns it is showing", async () => {
    const app = await PrivateChannelApp.open({ userId: 'player-1' });
    const { transcriptHtml } = await app._prepareContext({});   // the window shows the earlier exchange
    expect(transcriptHtml).toContain('my mother&#39;s ring');

    await send(app, 'What would she think of me now?');

    expect(requestPrivateNarration).toHaveBeenCalledTimes(1);
    const { transcriptTurns } = requestPrivateNarration.mock.calls[0][0];
    expect(transcriptTurns).toEqual([
      "Dax: Do you remember my mother's ring?",
      'Narrator: The ring she pressed into your palm the night the Ascent burned.',
      'You: What would she think of me now?',
    ]);
  });
});

describe("the session's first Private Channel conversation", () => {
  it('shows each turn once after the debounced save lands', async () => {
    const app = await PrivateChannelApp.open({ userId: 'player-1' });
    await app._prepareContext({});                         // first render: no page yet

    await send(app, 'Tell me about the ring.');
    await app._prepareContext({});                         // the render after the reply

    await flushNow('player-1');                            // the 5 s debounce fires

    await send(app, 'And my mother?');
    const { transcriptHtml } = await app._prepareContext({});   // the render after the reply

    expect(count(transcriptHtml, 'Tell me about the ring.')).toBe(1);
    expect(count(transcriptHtml, 'The narrator answers.')).toBe(2);   // one reply per message
  });
});
