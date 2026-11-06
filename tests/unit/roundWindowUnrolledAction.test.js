/**
 * STARFORGED COMPANION
 * tests/unit/roundWindowUnrolledAction.test.js
 *
 * Issue #342 Z31 (UNROLLED-ACTION-TEXT-LOST; the Batch Mode auditor's and
 * the ui auditor's probes — BATCH-5's first path, UI-10). A player writes an
 * action in the Round window and submits it. When the round showed the
 * submission the window treated it as Sent and cleared the draft, so the
 * text lived only on the round entry — and when the canonical GM's reading
 * of it failed (Claude overloaded, a timeout), the window went back to the
 * action box ("Couldn't read your action — try again.") with an empty box:
 * the action had to be typed again from memory. The draft now stays until
 * the round takes the action (draftAfterRound), and a failed reading's box
 * falls back to the text the round holds.
 *
 * The table-level paths (a round resolved without the action, a round closed
 * while its author was away) are batchUnrolledActionKept.test.js.
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
const ACTION = 'I climb the antenna mast, clip my tether to the dish, and cut the relay cable before the drones come round.';
let RoundWindowApp, registerRoundWindowHooks, registerBatchModeSettings, R;
let savedDocument;

beforeAll(async () => {
  ({ RoundWindowApp, registerRoundWindowHooks } = await import('../../src/ui/roundWindow.js'));
  ({ registerBatchModeSettings } = await import('../../src/batch/driver.js'));
  R = await import('../../src/batch/round.js');
  // What ApplicationV2.render does: prepare → render → replace the window's content.
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
const store = (r) => { game.settings._store.set(`${MODULE_ID}.batchMode.round`, r); return r; };
const box = (app) => app.element.querySelector('textarea[name="sf-round-text"]');
const tick = () => new Promise(r => setTimeout(r, 0));

/** Everything of the action the window shows: the box's value and any quote of it. */
function shownText(root) {
  const b = root.querySelector('textarea[name="sf-round-text"]');
  const quote = root.querySelector('blockquote.sf-round-line');
  return [b?.value ?? b?.textContent ?? '', quote?.textContent ?? ''].join(' | ');
}

beforeEach(() => {
  relayed.calls.length = 0;
  registerBatchModeSettings();
  game.settings._store.set(`${MODULE_ID}.batchMode.enabled`, true);
  game.settings._store.set(`${MODULE_ID}.batchMode.draft`, '');
  game.settings._store.set(`${MODULE_ID}.campaignState`, { sessionActive: true, currentSessionId: 's1' });
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
});

afterEach(async () => {
  await RoundWindowApp.instance?._onClose({});
  globalThis.document = savedDocument;
  for (const k of ['batchMode.enabled', 'batchMode.round', 'batchMode.draft', 'campaignState']) game.settings._store.delete(`${MODULE_ID}.${k}`);
});

const participants = () => [
  { userId: ME(), userName: 'Me', actorId: 'pc-me', actorName: 'Kira' },
  { userId: 'pl-2', userName: 'Quinn', actorId: 'pc-ren', actorName: 'Ren' },
];

/** The player types the action in the box and submits; the GM's write lands: Sent. */
async function submitAndShow() {
  const round = store(R.createRound({ id: 'r1', number: 1, sessionId: 's1', now: NOW, participants: participants() }));
  const app = await RoundWindowApp.open();
  await app.draftFromOutside(ACTION);
  await RoundWindowApp.DEFAULT_OPTIONS.actions.submit.call(app, null, null);
  const { submissionId } = relayed.calls[0].payload;
  const shown = store(R.submitEntry(round, { userId: ME(), text: ACTION, submissionId, now: NOW }));
  await app.onRoundUpdate(shown);
  return { app, shown, submissionId };
}

describe('a reading that failed gives the action back (BATCH-5, UI-10)', () => {
  it('control: while it is read, the window quotes it — and the draft keeps it (the round may not roll it)', async () => {
    const { app } = await submitAndShow();
    expect(app.element.textContent).toContain('Reading your action');
    expect(shownText(app.element)).toContain(ACTION);
    expect(app.draft).toBe(ACTION);
  });

  it('after "Couldn\'t read your action — try again", the box holds the action to send again', async () => {
    const { app, shown, submissionId } = await submitAndShow();
    const failed = store(R.readingFailed(shown, { userId: ME(), submissionId, error: 'HTTP 529 overloaded' }));
    await app.onRoundUpdate(failed);
    expect(app.element.textContent).toContain("Couldn't read your action — try again.");
    expect(failed.entries[ME()].text).toBe(ACTION);                    // control: the round holds it
    expect(box(app)?.value ?? null).toBe(ACTION);
    expect(shownText(app.element)).toContain(ACTION);
  });

  it('submitted from another window (no draft here), the failed reading\'s box holds the text the round has', async () => {
    let r = store(R.createRound({ id: 'r1', number: 1, sessionId: 's1', now: NOW, participants: participants() }));
    r = R.submitEntry(r, { userId: ME(), text: ACTION, submissionId: 'elsewhere', now: NOW });
    store(R.readingFailed(r, { userId: ME(), submissionId: 'elsewhere', error: 'timeout' }));
    const app = await RoundWindowApp.open();
    expect(app.draft).toBe('');
    expect(box(app)?.value ?? null).toBe(ACTION);
  });
});

describe('the draft follows the round (registerRoundWindowHooks)', () => {
  beforeAll(() => { registerRoundWindowHooks(); });

  async function roundWrittenElsewhere(round) {
    store(round);
    game.settings._registry.get(`${MODULE_ID}.batchMode.round`).onChange(round);
    for (let i = 0; i < 5; i++) await tick();
  }
  const ready = (r) => R.confirmEntry(R.recordReading(R.submitEntry(r, { userId: ME(), text: ACTION, submissionId: 's', now: NOW }),
    { userId: ME(), submissionId: 's', reading: { kind: 'narrative', suggestedMove: null } }), { userId: ME(), submissionId: 's', choices: {}, now: NOW });

  it('the round takes the action — rolled, or narrated with no roll: the draft goes', async () => {
    game.settings._store.set(`${MODULE_ID}.batchMode.draft`, ACTION);
    let r = ready(R.createRound({ id: 'r1', number: 1, sessionId: 's1', now: NOW, participants: participants() }));
    r = R.fixActing(R.beginResolution(r, { resolverId: 'gm', now: NOW }));
    await roundWrittenElsewhere(r);
    expect(game.settings.get(MODULE_ID, 'batchMode.draft')).toBe('');
  });

  it('a round resolved without it (left out — not confirmed): the draft stays, for the next round', async () => {
    game.settings._store.set(`${MODULE_ID}.batchMode.draft`, ACTION);
    let r = R.createRound({ id: 'r1', number: 1, sessionId: 's1', now: NOW, participants: participants() });
    r = R.recordReading(R.submitEntry(r, { userId: ME(), text: ACTION, submissionId: 's', now: NOW }),
      { userId: ME(), submissionId: 's', reading: { kind: 'narrative', suggestedMove: null } });
    r = R.closeRound(R.fixActing(R.beginResolution(r, { resolverId: 'gm', now: NOW })), { reason: 'nobody-acted', now: NOW });
    await roundWrittenElsewhere(r);
    expect(game.settings.get(MODULE_ID, 'batchMode.draft')).toBe(ACTION);
  });

  it('with the draft empty, a round closed without rolling the action gives it back; one that took it does not', async () => {
    let r = R.createRound({ id: 'r1', number: 1, sessionId: 's1', now: NOW, participants: participants() });
    r = R.recordReading(R.submitEntry(r, { userId: ME(), text: ACTION, submissionId: 's', now: NOW }),
      { userId: ME(), submissionId: 's', reading: { kind: 'narrative', suggestedMove: null } });
    await roundWrittenElsewhere(R.closeRound(R.fixActing(R.beginResolution(r, { resolverId: 'gm', now: NOW })), { reason: 'resolved', now: NOW }));
    expect(game.settings.get(MODULE_ID, 'batchMode.draft')).toBe(ACTION);

    game.settings._store.set(`${MODULE_ID}.batchMode.draft`, '');
    let taken = ready(R.createRound({ id: 'r2', number: 2, sessionId: 's1', now: NOW, participants: participants() }));
    taken = R.fixActing(R.beginResolution(taken, { resolverId: 'gm', now: NOW }));
    taken = R.markRecorded(taken, { userId: ME(), recordedAt: NOW });
    await roundWrittenElsewhere(R.closeRound(taken, { reason: 'resolved', now: NOW }));
    expect(game.settings.get(MODULE_ID, 'batchMode.draft')).toBe('');
  });
});
