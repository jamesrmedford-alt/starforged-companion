/**
 * Probe — BATCH-5 READ-FAILED-TEXT-GONE (eleventh audit).
 *
 * A player writes an action in the Round window and submits it. Once the round
 * shows the submission (Sent), the window clears the draft — the text now
 * lives only on the entry. When the GM's reading of it fails (Claude
 * overloaded, a timeout — readingFailed leaves the entry submitted with an
 * error), the window shows "Couldn't read your action — try again." and goes
 * back to the writing state: an action box rendered from the (cleared) draft,
 * and no quote of the entry's text (`writing` hides it). The player's action
 * is gone from their screen; "try again" means typing it again from memory.
 * Correct: the window keeps what they wrote — in the box (or quoted) — so
 * Submit can send it again.
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
const ACTION = 'I climb the antenna mast, clip my tether to the dish, and cut the relay cable before the drones come round.';
let RoundWindowApp, registerBatchModeSettings, R;
let savedDocument;

beforeAll(async () => {
  ({ RoundWindowApp } = await import('../../../src/ui/roundWindow.js'));
  ({ registerBatchModeSettings } = await import('../../../src/batch/driver.js'));
  R = await import('../../../src/batch/round.js');
}, 60_000);

const ME = () => game.user.id;
const store = (r) => { game.settings._store.set(`${MODULE_ID}.batchMode.round`, r); return r; };

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

async function renderOf(app) {
  const context = await app._prepareContext({});
  const root = await app._renderHTML(context, {});
  return { root, context };
}

/** Everything of the action the window shows: the box's value and any quote of it. */
function shownText(root) {
  const box = root.querySelector('textarea[name="sf-round-text"]');
  const quote = root.querySelector('blockquote.sf-round-line');
  return [box?.value ?? box?.textContent ?? '', quote?.textContent ?? ''].join(' | ');
}

async function submitAndShow() {
  const round = store(R.createRound({ id: 'r1', number: 1, sessionId: 's1', now: NOW, participants: [
    { userId: ME(), userName: 'Me', actorId: 'pc-me', actorName: 'Kira' },
    { userId: 'pl-2', userName: 'Quinn', actorId: 'pc-ren', actorName: 'Ren' },
  ] }));
  const app = new RoundWindowApp();
  app.element = (await renderOf(app)).root;
  await app.draftFromOutside(ACTION);
  await RoundWindowApp.DEFAULT_OPTIONS.actions.submit.call(app, null, null);
  const { submissionId } = relayed.calls[0].payload;
  // The GM's write lands: the window sees its submission — Sent.
  const shown = store(R.submitEntry(round, { userId: ME(), text: ACTION, submissionId, now: NOW }));
  await app.onRoundUpdate(shown);
  return { app, shown, submissionId };
}

describe('BATCH-5 — the action a player submitted, when its reading fails', () => {
  it('control: while it is being read, the window quotes it (the draft was cleared on Sent)', async () => {
    const { app } = await submitAndShow();
    expect(app.draft).toBe('');
    const { root } = await renderOf(app);
    expect(shownText(root)).toContain(ACTION);
  });

  it('after "Couldn\'t read your action — try again", the window still has the text to send again', async () => {
    const { app, shown, submissionId } = await submitAndShow();
    const failed = store(R.readingFailed(shown, { userId: ME(), submissionId, error: 'overloaded' }));
    await app.onRoundUpdate(failed);
    const { root, context } = await renderOf(app);
    expect(context.view.own.error).toMatch(/Couldn't read your action/);
    expect(shownText(root)).toContain(ACTION);
  });
});
