/**
 * PROBE — PC-REOPEN-FORGETS (src/private-channel/app.js)
 *
 * The Private Channel window shows the whole session's private conversation —
 * on first render it loads the session page from the player's journal
 * (`resumedHtml`) — but the narrator is sent only `this.turns`, "since this
 * window opened". context.js documents `transcriptTurns` as "verbatim prior
 * turns this session" under a "PRIVATE TRANSCRIPT THIS SESSION" heading, and
 * the private narrator writes no sidecar (decisions.md), so the transcript is
 * its ONLY memory of the aside. After the player closes the window (or
 * Foundry reloads) and reopens it, the earlier exchange is on screen but the
 * narrator has never heard of it.
 *
 * Asserts the CORRECT behaviour (the resumed session's turns reach the
 * narrator); fails today.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/private-channel/narrate.js', () => ({
  requestPrivateNarration: vi.fn(async () => ({ ok: true, text: 'She would be proud, and afraid for you.' })),
}));

import { PrivateChannelApp } from '../../../src/private-channel/app.js';
import { requestPrivateNarration } from '../../../src/private-channel/narrate.js';
import { renderTurnsHtml, _resetBuffers } from '../../../src/private-channel/transcript.js';

const MODULE_ID = 'starforged-companion';
let saved;

beforeEach(() => {
  saved = { journal: global.game.journal, users: global.game.users };
  const earlier = renderTurnsHtml([
    { who: 'player',   name: 'Dax',      text: "Do you remember my mother's ring?" },
    { who: 'narrator', name: 'Narrator', text: 'The ring she pressed into your palm the night the Ascent burned.' },
  ]);
  const journal = {
    id: 'je-pc-1', name: 'Private Channel — Sam',
    flags: { [MODULE_ID]: { privateChannelOwner: 'player-1' } },
    pages: { contents: [{
      id: 'pg-1', name: 'Session ses-1',
      flags: { [MODULE_ID]: { privateChannelPage: { sessionId: 'ses-1', createdAt: '2026-10-30T20:00:00Z' } } },
      text: { format: 1, content: earlier },
    }] },
  };
  global.game.journal = {
    get contents() { return [journal]; },
    getName: (n) => (n === journal.name ? journal : null),
    find: (fn) => [journal].find(fn) ?? null,
  };
  const users = new Map([['player-1', { id: 'player-1', name: 'Sam', isGM: false, active: true, character: { id: 'pc-dax', name: 'Dax' } }]]);
  global.game.users = { get: (id) => users.get(id) ?? null, get contents() { return [...users.values()]; } };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 'ses-1' });
});

afterEach(() => {
  _resetBuffers();
  PrivateChannelApp._resetInstances();
  global.game.journal = saved.journal;
  global.game.users   = saved.users;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
  vi.clearAllMocks();
});

describe('Private Channel reopened in the same session', () => {
  it("sends the narrator the session's earlier private turns it is showing", async () => {
    const app = await PrivateChannelApp.open({ userId: 'player-1' });
    await app._prepareContext({});                 // ApplicationV2.render → loads the session page
    expect(app.resumedHtml).toContain("my mother&#39;s ring");   // the window shows the earlier exchange

    app.element = { querySelector: (sel) => (sel === '[data-pc-input]' ? { value: 'What would she think of me now?' } : null) };
    await PrivateChannelApp.DEFAULT_OPTIONS.actions.send.call(app, {}, null);

    expect(requestPrivateNarration).toHaveBeenCalledTimes(1);
    const { transcriptTurns } = requestPrivateNarration.mock.calls[0][0];
    expect(transcriptTurns.join('\n')).toContain("my mother's ring");
  });
});
