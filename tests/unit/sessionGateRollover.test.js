/**
 * STARFORGED COMPANION
 * tests/unit/sessionGateRollover.test.js
 *
 * A session nobody ended rolls over at the next world load (rollSessionIfDue:
 * four idle hours) — and the new session starts with its session-active gate
 * closed, so the Session panel offers Begin a Session for it (issue #321 U12).
 *
 * The mint used to leave `sessionActive` / `sessionActiveStartedAt` alone, so
 * the new session inherited the old one's open gate: the panel read
 * "Active · 10260 min" (counted from last week's Begin) with Begin disabled
 * ("Session already active — end it first"), and the campaign-clock advance,
 * the Spotlight Vignette and the foci never ran unless the GM first ended the
 * empty new session. Not ending a session is the common case — the table just
 * closes Foundry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';

vi.mock('../../src/narration/narrator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  finalizeSessionSummary: vi.fn(async () => {}),
}));

import { rollSessionIfDue, SESSION_MINT_FIELDS } from '../../src/session/lifecycle.js';
import { mergeOwnedFields } from '../../src/factContinuity/sceneLifecycle.js';
import { SessionPanelApp } from '../../src/ui/sessionPanel.js';

const MODULE_ID = 'starforged-companion';
const HOUR = 3_600_000;

let savedDocument;
beforeEach(() => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  const now = Date.now();
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    currentSessionId:       'S1',
    sessionNumber:          1,
    sessionStartedId:       'S1',                                   // last week's Begin a Session
    sessionActive:          true,
    sessionActiveStartedAt: new Date(now - 7 * 24 * HOUR - 3 * HOUR).toISOString(),
    lastSessionTimestamp:   new Date(now - 7 * 24 * HOUR).toISOString(), // …and nobody pressed End
  });
  game.user.isGM = true;
});
afterEach(() => { globalThis.document = savedDocument; });

describe('a session nobody ended rolls over with its gate closed (issue #321 U12)', () => {
  it('the session minted at world load is not "already active" since last week, and can be begun from the panel', async () => {
    // index.js ready (canonical GM): initSessionId → persist SESSION_MINT_FIELDS
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    expect(await rollSessionIfDue(cs)).toBe(true);
    await game.settings.set(MODULE_ID, 'campaignState', mergeOwnedFields(cs, ['pendingMove', ...SESSION_MINT_FIELDS], 'session start'));

    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored.currentSessionId).not.toBe('S1');
    expect(stored.sessionStartedId).not.toBe(stored.currentSessionId); // this session was never begun
    expect(stored).toMatchObject({ sessionActive: false, sessionActiveStartedAt: null });

    const app = new SessionPanelApp();
    const ctx = await app._prepareContext({});
    const el = await app._renderHTML(ctx, {});
    const begin = el.querySelector('[data-action="beginSession"]');
    expect({ minutes: ctx.minutes, beginDisabled: begin.hasAttribute('disabled'), title: begin.getAttribute('title') })
      .toEqual({ minutes: expect.any(Number), beginDisabled: false, title: null });
    expect(ctx.minutes).toBeLessThan(5);
  });

  it('a reload mid-session keeps the gate open — only a new session closes it', async () => {
    const live = {
      currentSessionId:       'S2',
      sessionNumber:          2,
      sessionStartedId:       'S2',
      sessionActive:          true,
      sessionActiveStartedAt: new Date(Date.now() - 2 * HOUR).toISOString(),
      lastSessionTimestamp:   new Date(Date.now() - HOUR).toISOString(),
    };
    game.settings._store.set(`${MODULE_ID}.campaignState`, live);
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    expect(await rollSessionIfDue(cs)).toBe(false);
    await game.settings.set(MODULE_ID, 'campaignState', mergeOwnedFields(cs, ['pendingMove', ...SESSION_MINT_FIELDS], 'session start'));
    expect(game.settings.get(MODULE_ID, 'campaignState')).toMatchObject({
      currentSessionId: 'S2', sessionActive: true, sessionActiveStartedAt: live.sessionActiveStartedAt,
    });
  });
});
