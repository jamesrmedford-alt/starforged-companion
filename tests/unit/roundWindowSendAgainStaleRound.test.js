/**
 * STARFORGED COMPANION
 * tests/unit/roundWindowSendAgainStaleRound.test.js
 *
 * Issue #342 Z34 (ROUND-SEND-AGAIN-STALE-ROUND; the ui auditor's probe). A
 * Round window submission is "Sent" once the round shows it; not there after
 * RELAY_RECOVERY_MS, the window says "Your action wasn't received" and offers
 * Send again — the pending payload, round id included. When the GM refused
 * it because the round had moved on (resolving, ended, replaced — "your
 * action is kept … for the next round"), the pending submission was never
 * dropped: the not-received banner followed the player into the next round
 * and Send again relayed the dead round's id, refused every time. A pending
 * submission whose round is no longer the one collecting is now dropped (its
 * text stays the draft); and an over-long draft — a long table-talk line —
 * is refused in the window instead of waiting as "not received".
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';

const relayed = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../src/multiplayer/gmRelay.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requestGmAction: vi.fn(async (kind, payload) => { relayed.calls.push({ kind, payload }); return { ok: true, relayed: true }; }),
}));

const MODULE_ID = 'starforged-companion';
const NOW = '2026-11-06T10:00:00.000Z';
let RoundWindowApp, registerBatchModeSettings, R, RELAY_RECOVERY_MS;
let savedDocument;

beforeAll(async () => {
  ({ RoundWindowApp } = await import('../../src/ui/roundWindow.js'));
  ({ registerBatchModeSettings } = await import('../../src/batch/driver.js'));
  ({ RELAY_RECOVERY_MS } = await import('../../src/moves/burnMomentum.js'));
  R = await import('../../src/batch/round.js');
  RoundWindowApp.prototype.render = async function renderLikeFoundry() {
    const context = await this._prepareContext({});
    const result = await this._renderHTML(context, {});
    if (!this.element) this.element = new StubElement('div');
    this._replaceHTML(result, this.element, {});
    this.rendered = true;
    return this;
  };
}, 60_000);

const ME = () => game.user.id;
const roundNumbered = (id, number) => R.createRound({ id, number, sessionId: 's1', now: NOW, participants: [
  { userId: ME(), userName: 'Me', actorId: 'pc-me', actorName: 'Kira' },
  { userId: 'pl-2', userName: 'Quinn', actorId: 'pc-ren', actorName: 'Ren' },
] });
const store = (r) => game.settings._store.set(`${MODULE_ID}.batchMode.round`, r);

beforeEach(() => {
  relayed.calls.length = 0;
  registerBatchModeSettings();
  game.settings._store.set(`${MODULE_ID}.batchMode.enabled`, true);
  game.settings._store.set(`${MODULE_ID}.batchMode.draft`, '');
  game.settings._store.set(`${MODULE_ID}.campaignState`, { sessionActive: true, currentSessionId: 's1' });
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.document = savedDocument;
  for (const k of ['batchMode.enabled', 'batchMode.round', 'batchMode.draft', 'campaignState']) game.settings._store.delete(`${MODULE_ID}.${k}`);
});

describe('Send again after the round moved on (issue #342 Z34)', () => {
  it('what the window offers sends to the open round', async () => {
    store(roundNumbered('r1', 1));
    const app = await RoundWindowApp.open();
    await app.draftFromOutside('I slip through the vent.');
    await RoundWindowApp.DEFAULT_OPTIONS.actions.submit.call(app, null, null);
    expect(relayed.calls.map(c => c.payload.roundId)).toEqual(['r1']);          // control

    // The GM refused it (the round was being resolved — "kept for the next
    // round"); round 1 is narrated and round 2 opens.
    const r2 = roundNumbered('r2', 2);
    store(r2);
    await app.onRoundUpdate(r2);
    await vi.advanceTimersByTimeAsync(RELAY_RECOVERY_MS + 100);

    // Control: the draft is still in the box, for round 2.
    expect(app.draft).toBe('I slip through the vent.');
    const sendAgain = app.element.querySelector('[data-action="sendAgain"]');
    if (sendAgain) {
      await RoundWindowApp.DEFAULT_OPTIONS.actions.sendAgain.call(app, null, sendAgain);
      // Never to round 1, which has ended.
      expect(relayed.calls.at(-1).payload.roundId).toBe('r2');
    }
    // Submit, beside it, sends to round 2 (control of the sibling path).
    await RoundWindowApp.DEFAULT_OPTIONS.actions.submit.call(app, null, null);
    expect(relayed.calls.at(-1).payload.roundId).toBe('r2');
    await app._onClose({});
  });

  it('the round it was sent to starts resolving first: nothing waits as "not received" — the draft is kept for the next round', async () => {
    const r1 = roundNumbered('r1', 1);
    store(r1);
    const app = await RoundWindowApp.open();
    await app.draftFromOutside('I slip through the vent.');
    await RoundWindowApp.DEFAULT_OPTIONS.actions.submit.call(app, null, null);
    const resolving = R.beginResolution(r1, { resolverId: 'gm', now: NOW });   // a GM's Send now landed first
    store(resolving);
    await app.onRoundUpdate(resolving);
    await vi.advanceTimersByTimeAsync(RELAY_RECOVERY_MS + 100);
    expect((await app._prepareContext({})).view.own.notReceived).toBe(false);
    expect(app.element.querySelector('[data-action="sendAgain"]')).toBeNull();
    expect(app.draft).toBe('I slip through the vent.');
    await app._onClose({});
  });

  it('an over-long draft (a long table-talk line) is refused in the window, not relayed to wait as "not received"', async () => {
    const { ROUND_TEXT_MAX } = R;
    store(roundNumbered('r1', 1));
    const app = await RoundWindowApp.open();
    await app.draftFromOutside('x'.repeat(ROUND_TEXT_MAX + 1));
    await RoundWindowApp.DEFAULT_OPTIONS.actions.submit.call(app, null, null);
    expect(relayed.calls).toEqual([]);
    expect(app.element.textContent).toContain(`An action must be 1–${ROUND_TEXT_MAX} characters`);
    await vi.advanceTimersByTimeAsync(RELAY_RECOVERY_MS + 100);
    expect(app.element.querySelector('[data-action="sendAgain"]')).toBeNull();
    await app._onClose({});
  });
});
