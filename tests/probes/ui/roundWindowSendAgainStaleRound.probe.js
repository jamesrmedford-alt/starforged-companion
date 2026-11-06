/**
 * UI-5 ROUND-SEND-AGAIN-STALE-ROUND (eleventh audit, ui).
 *
 * A Round window submission is "Sent" once the round shows it; not there
 * after RELAY_RECOVERY_MS, the window says "Your action wasn't received" and
 * offers Send again — "the same submission — it lands once" — re-sending the
 * pending payload, round id included. When the round it was sent to is gone
 * (the GM refused it because the round was being resolved or had ended — "your
 * action is kept in your Round window for the next one" — and the next round
 * opened), the pending submission is never dropped: onRoundUpdate keeps it
 * while the new round's entry has another submission id, the not-received
 * banner carries into the new round, and Send again relays the old round's id
 * — refused again ("That round has ended"), whispered again, and 15 s later
 * "wasn't received" again. Submit, beside it, would work.
 *
 * Correct: what the window offers lands — a pending submission for a round
 * that is no longer the open one is dropped (its text is the draft), or Send
 * again sends to the open round.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { StubElement } from '../../helpers/cardDom.js';

const relayed = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../../src/multiplayer/gmRelay.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requestGmAction: vi.fn(async (kind, payload) => { relayed.calls.push({ kind, payload }); return { ok: true, relayed: true }; }),
}));

const MODULE_ID = 'starforged-companion';
const NOW = '2026-11-06T10:00:00.000Z';
let RoundWindowApp, registerBatchModeSettings, R, RELAY_RECOVERY_MS;
let savedDocument;

beforeAll(async () => {
  ({ RoundWindowApp } = await import('../../../src/ui/roundWindow.js'));
  ({ registerBatchModeSettings } = await import('../../../src/batch/driver.js'));
  ({ RELAY_RECOVERY_MS } = await import('../../../src/moves/burnMomentum.js'));
  R = await import('../../../src/batch/round.js');
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

describe('UI-5: Send again after the round moved on', () => {
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
      // The finding: Send again re-sends to round 1, which has ended.
      expect(relayed.calls.at(-1).payload.roundId).toBe('r2');
    }
    // Submit, beside it, sends to round 2 (control of the sibling path).
    await RoundWindowApp.DEFAULT_OPTIONS.actions.submit.call(app, null, null);
    expect(relayed.calls.at(-1).payload.roundId).toBe('r2');
    await app._onClose({});
  });
});
