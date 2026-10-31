/**
 * PROBE — PC-TRANSCRIPT-DOUBLED (src/private-channel/app.js)
 *
 * _prepareContext loads the session's saved transcript into `resumedHtml`
 * whenever `resumedHtml` is falsy, and renders `resumedHtml + this.turns`.
 * In a session whose page does not exist yet (the first private conversation
 * of every session) resumedHtml stays "" — so after the 5 s debounce writes
 * this window's own turns to the new page, the NEXT render loads them back
 * into resumedHtml while they are still in this.turns: the first exchange is
 * shown twice, for the rest of the window's life.
 *
 * Every ApplicationV2 render runs _prepareContext; the test calls it where the
 * window renders (the stub ApplicationV2.render is a no-op).
 *
 * Asserts the CORRECT behaviour (each turn shown once); fails today.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/private-channel/narrate.js', () => ({
  requestPrivateNarration: vi.fn(async () => ({ ok: true, text: 'The narrator answers.' })),
}));

import { PrivateChannelApp } from '../../../src/private-channel/app.js';
import { flushNow, _resetBuffers } from '../../../src/private-channel/transcript.js';

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
});

describe("the session's first Private Channel conversation", () => {
  it('shows each turn once after the debounced save lands', async () => {
    const app = await PrivateChannelApp.open({ userId: 'player-1' });
    await app._prepareContext({});                         // first render: no page yet

    typed(app, 'Tell me about the ring.');
    await PrivateChannelApp.DEFAULT_OPTIONS.actions.send.call(app, {}, null);
    await app._prepareContext({});                         // the render after the reply

    await flushNow('player-1');                            // the 5 s debounce fires

    typed(app, 'And my mother?');
    await PrivateChannelApp.DEFAULT_OPTIONS.actions.send.call(app, {}, null);
    const { transcriptHtml } = await app._prepareContext({});   // the render after the reply

    expect(count(transcriptHtml, 'Tell me about the ring.')).toBe(1);
  });
});
