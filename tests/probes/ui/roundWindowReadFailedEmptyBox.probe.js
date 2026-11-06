/**
 * UI-10 ROUND-READ-FAILED-EMPTY-BOX (eleventh audit, ui).
 *
 * A Round window submission is "Sent" once the round shows it, and its draft
 * goes then (onRoundUpdate clears the box's text). When the canonical GM's
 * reading of it fails — a Claude error, an overloaded or rate-limited key —
 * the entry keeps its text and status and gains `error`; the window switches
 * back to the action box ("Couldn't read your action — try again.") — but
 * the box is the cleared draft: empty. The submitted text is not shown (the
 * quote is only for a non-writing entry), no Edit / Retry is offered there,
 * and Submit with an empty box does nothing. "Try again" means typing the
 * action again from memory.
 *
 * Correct: the box offers the submitted text back, so trying again is one
 * press (the round still holds it: `entry.text`).
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
const ACTION = 'I splice the lift controls and ride it down to the reactor deck before the drones turn.';
let RoundWindowApp, registerBatchModeSettings, R;
let savedDocument;

beforeAll(async () => {
  ({ RoundWindowApp } = await import('../../../src/ui/roundWindow.js'));
  ({ registerBatchModeSettings } = await import('../../../src/batch/driver.js'));
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
const store = (r) => game.settings._store.set(`${MODULE_ID}.batchMode.round`, r);
const box = (app) => app.element.querySelector('textarea[name="sf-round-text"]');

beforeEach(() => {
  relayed.calls.length = 0;
  registerBatchModeSettings();
  game.settings._store.set(`${MODULE_ID}.batchMode.enabled`, true);
  game.settings._store.set(`${MODULE_ID}.batchMode.draft`, '');
  game.settings._store.set(`${MODULE_ID}.campaignState`, { sessionActive: true, currentSessionId: 's1' });
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
});

afterEach(() => {
  globalThis.document = savedDocument;
  for (const k of ['batchMode.enabled', 'batchMode.round', 'batchMode.draft', 'campaignState']) game.settings._store.delete(`${MODULE_ID}.${k}`);
});

describe('UI-10: a reading that failed', () => {
  it('gives the player their action back in the box to try again', async () => {
    const r1 = R.createRound({ id: 'r1', number: 1, sessionId: 's1', now: NOW, participants: [
      { userId: ME(), userName: 'Me', actorId: 'pc-me', actorName: 'Kira' },
    ] });
    store(r1);
    const app = await RoundWindowApp.open();
    await app.draftFromOutside(ACTION);
    await RoundWindowApp.DEFAULT_OPTIONS.actions.submit.call(app, null, null);
    const { submissionId } = relayed.calls[0].payload;

    // The canonical GM takes it: the round shows it — Sent, the draft goes.
    const submitted = R.submitEntry(r1, { userId: ME(), text: ACTION, submissionId, now: NOW });
    store(submitted);
    await app.onRoundUpdate(submitted);
    expect(app.draft).toBe('');                                                       // control: by design
    expect(app.element.textContent).toContain('Reading your action');                 // control

    // Its reading fails (a Claude error on the GM's key).
    const failed = R.readingFailed(submitted, { userId: ME(), submissionId, error: 'HTTP 529 overloaded' });
    store(failed);
    await app.onRoundUpdate(failed);
    expect(app.element.textContent).toContain("Couldn't read your action — try again.");   // control
    expect(failed.entries[ME()].text).toBe(ACTION);                                     // control: the round holds it

    // The finding: the box is empty — the action must be typed again.
    expect(box(app)?.value ?? null).toBe(ACTION);
    await app._onClose({});
  });
});
