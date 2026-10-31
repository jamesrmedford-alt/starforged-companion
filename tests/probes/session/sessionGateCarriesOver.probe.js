/**
 * PROBE — a session nobody ended rolls over (rollSessionIfDue: four idle hours,
 * at the next world load) but the new session inherits the OLD session's
 * active gate: mintSession / rollSessionIfDue never touch `sessionActive` /
 * `sessionActiveStartedAt` (src/session/lifecycle.js), and beginSession() is a
 * no-op while `sessionActive === true`.
 *
 * Result on the Session panel for the brand-new session (src/ui/sessionPanel.js):
 *   - "Active · 10260 min" — counted from LAST week's Begin a Session;
 *   - Begin Session is disabled ("Session already active — end it first"),
 *     although this session was never begun (sessionStartedId is last
 *     session's). The GM must End the new, empty session first (running its
 *     Session Log / closing vignette / summary) or skip Begin a Session, whose
 *     campaign-clock advance, spotlight vignette and foci then never happen.
 * Not ending a session is the common case (the table just closes Foundry).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StubElement } from '../../helpers/cardDom.js';

vi.mock('../../../src/narration/narrator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  finalizeSessionSummary: vi.fn(async () => {}),
}));

import { rollSessionIfDue, SESSION_MINT_FIELDS } from '../../../src/session/lifecycle.js';
import { mergeOwnedFields } from '../../../src/factContinuity/sceneLifecycle.js';
import { SessionPanelApp } from '../../../src/ui/sessionPanel.js';

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

describe('PROBE SESSION-GATE-CARRIES-OVER', () => {
  it('the session minted at world load is not "already active" since last week, and can be begun from the panel', async () => {
    // index.js ready (canonical GM): initSessionId → persist SESSION_MINT_FIELDS
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    expect(await rollSessionIfDue(cs)).toBe(true);
    await game.settings.set(MODULE_ID, 'campaignState', mergeOwnedFields(cs, ['pendingMove', ...SESSION_MINT_FIELDS], 'session start'));

    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored.currentSessionId).not.toBe('S1');
    expect(stored.sessionStartedId).not.toBe(stored.currentSessionId); // this session was never begun

    const app = new SessionPanelApp();
    const ctx = await app._prepareContext({});
    const el = await app._renderHTML(ctx, {});
    const begin = el.querySelector('[data-action="beginSession"]');
    expect({ minutes: ctx.minutes, beginDisabled: begin.hasAttribute('disabled'), title: begin.getAttribute('title') })
      .toEqual({ minutes: expect.any(Number), beginDisabled: false, title: null });   // actual: disabled, "Session already active — end it first"
    expect(ctx.minutes).toBeLessThan(5);                               // actual today: ~10260
  });
});
