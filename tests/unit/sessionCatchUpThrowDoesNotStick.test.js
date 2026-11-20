/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/sessionCatchUpThrowDoesNotStick.test.js
 *
 * Issue #364 CATCHUP-MEMOISED-SETTLED-PROMISE (found while fixing
 * LATE-ROUND-NO-LAST-SESSION-RECORD).
 *
 * catchUpUnsummarisedSession (narrator.js) runs one catch-up at a time: the
 * call in flight is memoised (`_sessionCatchUp`) and cleared in its body's
 * `finally`. A body that threw — or returned — before its first await ran
 * that `finally` synchronously, before the memo was assigned; the memo then
 * kept the settled promise for the rest of the page load, so every later
 * catch-up returned it and nothing was ever caught up again.
 *
 * Now the memo is assigned before any of the body runs and cleared once the
 * body settles, however it settles. The synchronous throw is injected at the
 * body's first read: the chat log (game.messages.contents), whose getter
 * throws once.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const replies = vi.hoisted(() => ({ summary: 'Kira dug through the rubble of the Bleakhold mine.' }));
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: replies.summary }] })),
}));

import { catchUpUnsummarisedSession } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');

/** A narrator card of session 4 (the flag family). */
const CARD = {
  id: 'card-early', timestamp: Date.now() - 60_000, content: '<p>Kira digs.</p>',
  flags: { [MODULE_ID]: { narratorCard: true, narrationText: 'Kira digs through the rubble of the Bleakhold mine.',
    sessionId: 'sess-4', sessionNumber: 4, narrationId: 'nar-early' } },
};

/** game.messages whose `contents` throws on its first `n` reads. */
function chatLogThrowingFor(n) {
  let left = n;
  return { get contents() {
    if (left > 0) { left -= 1; throw new Error('the chat log could not be read'); }
    return [CARD];
  } };
}

beforeEach(() => {
  game.settings._store.clear();
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-gina');
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-5', sessionNumber: 5, sessionActive: true, sessionStartedId: 'sess-5',
    previousSessionSummary: { sessionId: 'sess-4', sessionNumber: 4, text: '' },
    unsummarisedSession: { sessionId: 'sess-4', sessionNumber: 4 },
    xCardActive: false, xCardPlays: 0, sceneTruths: [], clocks: [],
  });
  silenceConsoleErrors();
});

describe('issue #364 CATCHUP-MEMOISED-SETTLED-PROMISE — a catch-up that throws before its first await', () => {
  it('fails that once; the next catch-up runs and catches LAST SESSION up', async () => {
    global.game.messages = chatLogThrowingFor(1);

    expect(await catchUpUnsummarisedSession(), 'the catch-up that could not read the chat log failed').toBe(false);
    expect(stored().unsummarisedSession, 'and its session is still owed').toMatchObject({ sessionId: 'sess-4' });

    const next = catchUpUnsummarisedSession();
    expect(await next, 'the next catch-up ran').toBe(true);
    expect(stored().previousSessionSummary).toMatchObject({ sessionId: 'sess-4', sessionNumber: 4, text: replies.summary });
    expect(stored().unsummarisedSession ?? null, 'nothing owed now').toBeNull();
  });

  it('one at a time still: a call made while one runs is that one', async () => {
    global.game.messages = chatLogThrowingFor(0);
    const first  = catchUpUnsummarisedSession();
    const second = catchUpUnsummarisedSession();
    expect(second, 'the call in flight is returned').toBe(first);
    expect(await first).toBe(true);
    // Settled and cleared: a later call starts afresh (nothing owed now, so it resolves false at once).
    const later = catchUpUnsummarisedSession();
    expect(later).not.toBe(first);
    expect(await later).toBe(false);
  });
});
