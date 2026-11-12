/**
 * STARFORGED COMPANION
 * tests/unit/sessionPanelRerendersAtIdleMark.test.js
 *
 * SESSION-PANEL-OVER-STALE (issue #345 AA59's residual). The Session panel
 * reads a session over after four hours without chat (sessionNeedsMint) — but
 * it re-rendered only on campaignState writes and on open, not when the
 * four-hour mark passed: an open panel kept "Active", Begin disabled, until
 * something re-rendered it. It now re-renders at the mark (the later of the
 * session's mint and its last chat-activity stamp, plus four hours).
 *
 * Driven through the panel's own _prepareContext, as
 * sessionPanelBeginAfterIdle.test.js does.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';
import { SessionPanelApp } from '../../src/ui/sessionPanel.js';
import { registerSessionActivitySetting } from '../../src/session/lifecycle.js';

const MODULE_ID = 'starforged-companion';
const HOUR = 3_600_000;

let savedDocument;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-11-12T20:00:00.000Z'));
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  game.settings._store.clear();
  try { registerSessionActivitySetting(); } catch { /* the stub store needs no registration */ }
  game.user.isGM = true;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  globalThis.document = savedDocument;
});

/** A begun session whose last chat was `hoursAgo` hours ago. */
function seed(hoursAgo) {
  const at = (h) => new Date(Date.now() - h * HOUR).toISOString();
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    currentSessionId: 'spi-s1', sessionNumber: 5, sessionStartedId: 'spi-s1', sessionEndedId: null,
    sessionActive: true, sessionActiveStartedAt: at(hoursAgo + 2), lastSessionTimestamp: at(hoursAgo + 2),
  });
  game.settings._store.set(`${MODULE_ID}.sessionActivity`, { sessionId: 'spi-s1', at: at(hoursAgo) });
}

describe('SESSION-PANEL-OVER-STALE — an open Session panel re-renders when the four idle hours pass', () => {
  it('a live session (chat an hour ago): the panel re-renders at the four-hour mark, and then reads it over', async () => {
    seed(1);
    const rerender = vi.spyOn(SessionPanelApp, 'rerenderIfOpen').mockImplementation(() => {});
    const app = new SessionPanelApp();
    expect((await app._prepareContext({})).over).toBe(false);

    vi.advanceTimersByTime(3 * HOUR - 60_000);
    expect(rerender, 'not before the mark').not.toHaveBeenCalled();
    vi.advanceTimersByTime(2 * 60_000);
    expect(rerender).toHaveBeenCalledTimes(1);
    expect((await app._prepareContext({})).over, 'the re-render reads the session over').toBe(true);
  });

  it('a render before the mark schedules afresh: one re-render, not one per render', async () => {
    seed(1);
    const rerender = vi.spyOn(SessionPanelApp, 'rerenderIfOpen').mockImplementation(() => {});
    const app = new SessionPanelApp();
    await app._prepareContext({});
    vi.advanceTimersByTime(HOUR);
    await app._prepareContext({});
    vi.advanceTimersByTime(2 * HOUR + 60_000);
    expect(rerender).toHaveBeenCalledTimes(1);
  });

  it('control: a session already over, or none active, schedules nothing', async () => {
    seed(26);
    const rerender = vi.spyOn(SessionPanelApp, 'rerenderIfOpen').mockImplementation(() => {});
    const app = new SessionPanelApp();
    expect((await app._prepareContext({})).over).toBe(true);
    vi.advanceTimersByTime(10 * HOUR);
    expect(rerender).not.toHaveBeenCalled();
  });
});
