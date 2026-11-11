/**
 * PROBE SESS-2 (thirteenth audit, area "session / audio / private channel")
 * — one Private Channel page write the server never answers wedges that
 * player's transcript chain for the rest of the page load: every later turn
 * stays in memory, nothing is written, and the player is not told.
 *
 * flushNow (src/private-channel/transcript.js) serialises a player's flushes:
 *
 *     const run = entry.chain.then(() => writePending(userId, entry));
 *     entry.chain = run.catch(() => {});
 *
 * A write that REJECTS is handled (its batch goes back, three retries, then
 * the next trigger). A write that never settles — `page.update` whose answer
 * is lost: the phone that hides the tab is exactly when the `visibilitychange`
 * flush runs (issue #293) — leaves `entry.chain` pending for good. Every later
 * flush (the 5 s debounce, window close, tab hidden) only queues behind it;
 * `isTranscriptUnsaved` stays false (that notice is the no-journal case), so
 * the window never says "not saved yet". A reload then loses every turn typed
 * since. The module bounds this fault everywhere else it chains writes
 * (campaignStateChain 10 s, the GM relay queue, startScene, the journal
 * relay's own 15 s wait in this file).
 *
 * Correct behaviour asserted: ten minutes after the unanswered write, a new
 * exchange is either written (a second page write is attempted) or the player
 * is told their conversation is not being saved.
 *
 *   npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sess/transcriptChainWedged.probe.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  appendToBuffer, scheduleDebouncedWrite, flushNow, isTranscriptUnsaved, renderTurnsHtml, _resetBuffers,
} from '../../../src/private-channel/transcript.js';

const MODULE_ID = 'starforged-companion';
const USER = 'player-1';
let saved, journals, page, pageWrites, answerWrites;

function makeJournalWithSessionPage() {
  page = {
    id: 'pg-1', name: 'Session ses-1',
    flags: { [MODULE_ID]: { privateChannelPage: { sessionId: 'ses-1', createdAt: '2026-11-11T19:00:00Z' } } },
    text: { format: 1, content: '' },
    update: (u) => {
      pageWrites.push(u.text.content);
      if (!answerWrites()) return new Promise(() => {});      // the server never answers this one
      page.text = u.text;
      return Promise.resolve(page);
    },
  };
  return {
    id: 'je-1', name: 'Private Channel — Sam', ownership: { [USER]: 3 },
    flags: { [MODULE_ID]: { privateChannelOwner: USER } },
    pages: { contents: [page] },
    createEmbeddedDocuments: async () => { throw new Error('no page should be created'); },
    setFlag: async () => {}, update: async () => {},
  };
}

beforeEach(() => {
  _resetBuffers();
  pageWrites = [];
  answerWrites = () => true;
  journals = [makeJournalWithSessionPage()];
  saved = { journal: global.game.journal, users: global.game.users };
  global.game.journal = {
    get contents() { return journals; },
    getName: (n) => journals.find(j => j.name === n) ?? null,
    find: (fn) => journals.find(fn) ?? null,
  };
  const users = new Map([[USER, { id: USER, name: 'Sam', isGM: false, active: true }]]);
  global.game.users = { get: (id) => users.get(id) ?? null, get contents() { return [...users.values()]; } };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 'ses-1' });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  _resetBuffers();
  global.game.journal = saved.journal;
  global.game.users = saved.users;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

const exchange = (n) => {
  appendToBuffer(USER, { who: 'player',   name: 'Dax',      text: `Question ${n}?` });
  appendToBuffer(USER, { who: 'narrator', name: 'Narrator', text: `Answer ${n}.` });
  scheduleDebouncedWrite(USER);
};
const told = () => isTranscriptUnsaved(USER)
  || ui.notifications.warn.mock?.calls?.some(([m]) => /not (being )?saved/i.test(String(m)));

describe('a Private Channel page write the server never answers', () => {
  it('control: two exchanges ten minutes apart are both written to the session page', async () => {
    ui.notifications.warn = vi.fn();
    exchange(1);
    await vi.advanceTimersByTimeAsync(6_000);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    exchange(2);
    await vi.advanceTimersByTimeAsync(6_000);

    expect(pageWrites).toHaveLength(2);
    expect(page.text.content).toBe(renderTurnsHtml([
      { who: 'player', name: 'Dax', text: 'Question 1?' }, { who: 'narrator', name: 'Narrator', text: 'Answer 1.' },
      { who: 'player', name: 'Dax', text: 'Question 2?' }, { who: 'narrator', name: 'Narrator', text: 'Answer 2.' },
    ]));
  });

  it('control: a write the server REFUSES is retried — the chain is not poisoned by a rejection', async () => {
    ui.notifications.warn = vi.fn();
    let refused = 0;
    const answer = page.update;
    page.update = (u) => (refused++ === 0 ? Promise.reject(new Error('refused')) : answer(u));
    exchange(1);
    await vi.advanceTimersByTimeAsync(6_000);     // the refused write
    await vi.advanceTimersByTimeAsync(6_000);     // its first automatic retry (5 s)
    expect(page.text.content).toContain('Answer 1.');
  });

  it('later turns are written — or the player is told — after one write is never answered', async () => {
    ui.notifications.warn = vi.fn();
    answerWrites = () => pageWrites.length > 1;    // only the first write is never answered

    exchange(1);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(pageWrites, 'the first exchange\'s write was sent and is unanswered (setup)').toHaveLength(1);

    // Ten minutes later the player goes on talking; the connection is fine again.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    exchange(2);
    await vi.advanceTimersByTimeAsync(6_000);
    exchange(3);
    await vi.advanceTimersByTimeAsync(6_000);
    // The window is closed (PrivateChannelApp._onClose → flushNow), then ten more minutes pass.
    flushNow(USER).catch(() => {});
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(
      { secondWriteAttempted: pageWrites.length > 1, playerTold: !!told() },
      'exchanges 2 and 3 exist only in memory: no page write was attempted for them and nothing tells the player',
    ).not.toEqual({ secondWriteAttempted: false, playerTold: false });
  });
});
