/**
 * STARFORGED COMPANION
 * tests/unit/transcriptChainNotWedgedByHungWrite.test.js
 *
 * A Private Channel page write the server never answers wedges no later turn
 * (issue #347 AB05).
 *
 * A player's transcript writes run one at a time on that player's chain. Behind
 * a page write lost with its connection, every later turn queued in memory,
 * `isTranscriptUnsaved` stayed false so the window never said "not saved yet",
 * and a reload lost every turn since. The page write is now bounded: given up,
 * its turns stay buffered for a retry and the player is told; a retry whose
 * earlier write landed after all does not append the turns twice.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  appendToBuffer, scheduleDebouncedWrite, flushNow, isTranscriptUnsaved, renderTurnsHtml, _resetBuffers,
} from '../../src/private-channel/transcript.js';

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

describe('a Private Channel page write the server never answers (issue #347 AB05)', () => {
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

    expect({ secondWriteAttempted: pageWrites.length > 1, playerTold: !!told() })
      .toEqual({ secondWriteAttempted: true, playerTold: true });
    // Every exchange reaches the page, once.
    for (const n of [1, 2, 3]) {
      expect(page.text.content.split(`Answer ${n}.`).length - 1, `exchange ${n} on the page once`).toBe(1);
    }
  });
});
