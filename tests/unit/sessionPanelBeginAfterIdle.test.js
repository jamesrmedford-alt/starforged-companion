/**
 * STARFORGED COMPANION
 * tests/unit/sessionPanelBeginAfterIdle.test.js
 *
 * Issue #345 AA59 PANEL-BEGIN-DISABLED-IDLE-SESSION (the twelfth audit's
 * SESS-5) — the no-reload residual of issue #321 U12
 * (SESSION-GATE-CARRIES-OVER).
 *
 * A session is over after four hours with no chat (sessionNeedsMint — the
 * later of the mint and the `sessionActivity` stamp, issue #342 Z01), and
 * "the next world load or Begin a Session, whichever comes first, starts the
 * new one" (decisions.md, "A session ends at End Session or after four idle
 * hours"). U12 fixed the load: the mint closes the gate. With the GM's game
 * still loaded (a tab left open over a long break or overnight) nothing
 * mints, the session that went idle keeps its open gate, and the Session
 * panel decided Begin by the gate alone: it read "Active · 1800 min" and
 * disabled Begin Session ("Session already active — end it first"), though
 * the Begin dialog itself agrees the session is over (sessionAlreadyBegun →
 * sessionNeedsMint). The panel now reads the session over and offers Begin;
 * End stays offered while the gate is open.
 *
 * Driven through the panel's own _prepareContext / _renderHTML, as
 * tests/unit/sessionGateRollover.test.js does for U12.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';
import { SessionPanelApp } from '../../src/ui/sessionPanel.js';
import { sessionNeedsMint, registerSessionActivitySetting } from '../../src/session/lifecycle.js';

const MODULE_ID = 'starforged-companion';
const HOUR = 3_600_000;
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString();

let savedDocument;
beforeEach(() => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  game.settings._store.clear();
  try { registerSessionActivitySetting(); } catch { /* the stub store needs no registration */ }
  game.user.isGM = true;
});
afterEach(() => { globalThis.document = savedDocument; });

/** The world as the table left it: begun, played, nobody pressed End, the GM's tab still open. */
function seed(lastChatHoursAgo) {
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    currentSessionId: 'pbi-s1', sessionNumber: 5, sessionStartedId: 'pbi-s1', sessionEndedId: null,
    sessionActive: true, sessionActiveStartedAt: ago(lastChatHoursAgo + 4),
    lastSessionTimestamp: ago(lastChatHoursAgo + 4),
  });
  game.settings._store.set(`${MODULE_ID}.sessionActivity`, { sessionId: 'pbi-s1', at: ago(lastChatHoursAgo) });
}

async function renderPanel() {
  const app = new SessionPanelApp();
  const ctx = await app._prepareContext({});
  const el  = await app._renderHTML(ctx, {});
  const begin = el.querySelector('[data-action="beginSession"]');
  const end   = el.querySelector('[data-action="endSession"]');
  const badge = el.querySelector('.badge');
  return { ctx, beginDisabled: begin.hasAttribute('disabled'), title: begin.getAttribute('title'),
    endDisabled: end.hasAttribute('disabled'), badge: badge?.textContent ?? '' };
}

describe('issue #345 AA59 — the Session panel for a session that went idle while the GM stayed loaded', () => {
  it('offers Begin Session for the session that is over (and does not call it Active)', async () => {
    seed(26);                                                   // last chat a day ago
    expect(sessionNeedsMint(game.settings.get(MODULE_ID, 'campaignState')), 'sanity: the session is over').toBe(true);
    const view = await renderPanel();
    expect.soft(view.badge, 'the badge').not.toMatch(/^Active/);
    expect(view.beginDisabled, `Begin Session disabled ("${view.title}") for a session that is over`).toBe(false);
    expect(view.badge).toMatch(/^Over/);
    expect(view.endDisabled, 'End Session stays offered while the gate is open').toBe(false);
  });

  it('control: a live session (chat an hour ago) — Begin stays disabled, the badge reads Active', async () => {
    seed(1);
    expect(sessionNeedsMint(game.settings.get(MODULE_ID, 'campaignState'))).toBe(false);
    const view = await renderPanel();
    expect(view.beginDisabled).toBe(true);
    expect(view.badge).toMatch(/^Active/);
  });
});
