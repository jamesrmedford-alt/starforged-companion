/**
 * UI-4 ROUND-NO-GM-BANNER-FALSE-PROMISE (eleventh audit, ui).
 *
 * With no GM connected, the Round window's banner reads "No GM is connected —
 * your action is kept here, and is sent once a GM joins." (roundView.js
 * ROUND_NOTICES.noGm). Nothing sends it: a Submit with no GM is refused by
 * requestGmAction ("no-gm"), the window says "…this wasn't saved… try again
 * once a GM has joined" beneath the banner that says it will be sent, and
 * when a GM joins nothing re-sends the draft. Nor does the window re-render
 * on a GM's connection (no userConnected hook — only the round, the
 * campaign state and its own actions re-render it), so the banner can go on
 * saying no GM is connected after one joined.
 *
 * Correct: the window says what will happen — no promise of a send nobody
 * makes (or it makes the send) — and follows the GM's connection.
 * (rules/reachability.md §8: with no GM, requestGmAction warns — "say so on
 * the card too"; the brief's "a refused write is said where it was asked".)
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { StubElement } from '../../helpers/cardDom.js';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
let savedDocument;
const round = () => table.world.getSetting('batchMode.round');

beforeAll(async () => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => { table?.teardown(); globalThis.document = savedDocument; });

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  silenceConsoleErrors();
});

/** Kira's player's Round window, rendering as ApplicationV2 does. */
async function kiraWindow() {
  const c = table.client('pl-1');
  const mod = await c.import('../../src/ui/roundWindow.js');
  mod.RoundWindowApp.prototype.render = async function renderLikeFoundry() {
    const context = await this._prepareContext({});
    const result = await this._renderHTML(context, {});
    if (!this.element) this.element = new StubElement('div');
    this._replaceHTML(result, this.element, {});
    this.rendered = true;
    return this;
  };
  const app = await c.run(() => mod.RoundWindowApp.open());
  const submit = () => c.run(() => mod.RoundWindowApp.DEFAULT_OPTIONS.actions.submit.call(app, null, null));
  return { app, submit, c };
}

/** The GM leaves; Kira's player submits into the window; the GM comes back. */
async function submitWhileNoGm() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  expect(round()).toMatchObject({ number: 1, phase: 'collecting' });

  await table.leave('gm-1');
  const { app, submit, c } = await kiraWindow();
  const text = () => app.element.textContent;
  // Control: the window says no GM is connected.
  expect(text()).toContain('No GM is connected');

  // Kira's player writes an action and submits it.
  await c.run(() => app.draftFromOutside('I slip through the vent before the drones turn.'));
  await submit();
  await table.settle();
  // Control: refused — said in the window — and the draft is kept.
  expect(text()).toMatch(/this wasn't saved/);
  expect(app.draft).toBe('I slip through the vent before the drones turn.');
  const promised = /is sent once a GM joins/.test(text());

  // The GM comes back.
  await table.join('gm-1');
  await table.settle();
  await table.drain();
  return { text, promised };
}

describe('UI-4: the Round window with no GM connected', () => {
  it('nothing promises a send no one makes', async () => {
    const { promised } = await submitWhileNoGm();
    const sent = round().entries['pl-1']?.text === 'I slip through the vent before the drones turn.';
    expect({ promisedASend: promised, sent }).toEqual({ promisedASend: sent, sent });
  }, 30_000);

  it('once the GM is back, the window no longer says no GM is connected', async () => {
    const { text } = await submitWhileNoGm();
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });     // control: the same round
    expect(text()).not.toContain('No GM is connected');
  }, 30_000);
});
