/**
 * STARFORGED COMPANION
 * tests/unit/autoRecapFollowsSessionMint.test.js
 *
 * Issue #342 D6 (SESSION-GAP-SETTING-NOT-THE-BOUNDARY), ruling B.
 *
 * The Narrator panel's "Session gap (hours)" setting (1–48, default 4) decided
 * only whether the world load posts the "Previously On" campaign recap
 * (index.js isNewSessionStart). Whether the load starts a new session is
 * session/lifecycle.js sessionNeedsMint — End a Session, or the constant
 * SESSION_IDLE_HOURS (4), which no setting reached (issue #286 C4). A GM who
 * set it to 12 so a long break stays one session still got a new session
 * after 4 idle hours — and no recap card; one who set it to 2 got a "Previously
 * On" card in the middle of the same session.
 *
 * The recap now posts when the world load started a new session (and there was
 * one before it), and the setting is retired — its registration, the panel's
 * field and hint, its one reader and the help's row. A world that stored a
 * value keeps it unread: the load does not consult it.
 */

/* global expectConsoleError */
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  finalizeSessionSummary: vi.fn(async () => {}),
  getCampaignRecap:       vi.fn(async () => ''),
  postCampaignRecap:      vi.fn(async () => ''),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { failWrites, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { postCampaignRecap, getCampaignRecap } from '../../src/narration/narrator.js';
import { PAGES } from '../../src/help/helpJournal.js';

const HOUR = 3_600_000;
let table;
afterEach(() => { table?.teardown(); table = null; });

/** Session 7, begun, last seen `idleHours` ago. */
function sessionSeven(idleHours, extra = {}) {
  const now = Date.now();
  return {
    ...CampaignStateSchema,
    currentSessionId: 'S7', sessionNumber: 7, sessionStartedId: 'S7', sessionEndedId: null,
    sessionActive: true, sessionActiveStartedAt: new Date(now - (idleHours + 1) * HOUR).toISOString(),
    lastSessionTimestamp: new Date(now - idleHours * HOUR).toISOString(),
    currentSceneId: null, sceneTruths: [], clocks: [],
    ...extra,
  };
}

/** The canonical GM opens the world (its ready hook: the mint and the auto-recap). */
async function openWorld(campaignState, settings = {}, { refuseMint = false } = {}) {
  table = await simulateTable({
    users: [USERS.GM, USERS.P1], boot: false,
    world: { settings: { chronicleAutoEntry: false, narratorSessionSummary: false, autoRecapEnabled: true, ...settings, campaignState } },
  });
  postCampaignRecap.mockClear();
  getCampaignRecap.mockClear();
  const fault = refuseMint ? failWrites(table, campaignStateWrite('gm-1'), { times: 50 }) : null;
  await table.client('gm-1').boot();
  await table.client('pl-1').boot();
  await table.settle(); await table.drain();
  return fault;
}

const world = () => table.world.campaignState();
const recapsPosted = () => postCampaignRecap.mock.calls.filter(([, opts]) => opts?.silent === false).length;

describe('issue #342 D6 — the "Previously On" recap follows the session the load starts', () => {
  it('a reload after 5 idle hours starts a new session and posts the recap — a stored gap of 12 hours aside', async () => {
    await openWorld(sessionSeven(5), { sessionGapHours: 12 });
    expect(world().currentSessionId).not.toBe('S7');   // control: minted at 4 h, as issue #286 C4 decided
    expect(world().sessionNumber).toBe(8);
    expect(recapsPosted()).toBe(1);
  }, 60_000);

  it('a reload after 3 idle hours continues the session and posts no recap — a stored gap of 2 hours aside', async () => {
    await openWorld(sessionSeven(3), { sessionGapHours: 2 });
    expect(world().currentSessionId).toBe('S7');       // control: the same session
    expect(recapsPosted()).toBe(0);
    expect(getCampaignRecap).not.toHaveBeenCalled();
  }, 60_000);

  it('a session ended with End a Session, reloaded an hour later: the new session gets its recap', async () => {
    await openWorld(sessionSeven(1, { sessionEndedId: 'S7', sessionActive: false }));
    expect(world().sessionNumber).toBe(8);
    expect(recapsPosted()).toBe(1);
  }, 60_000);

  it("a world's first session has nothing before it: no recap card, the recap cache refreshed", async () => {
    await openWorld({ ...CampaignStateSchema, currentSessionId: '', sessionNumber: 0, lastSessionTimestamp: null,
      currentSceneId: null, sceneTruths: [], clocks: [] });
    expect(world().currentSessionId).toBeTruthy();
    expect(recapsPosted()).toBe(0);
    expect(getCampaignRecap).toHaveBeenCalled();
  }, 60_000);

  it('control: Auto Recap off — the new session refreshes the recap cache and posts no card', async () => {
    await openWorld(sessionSeven(5), { autoRecapEnabled: false });
    expect(world().sessionNumber).toBe(8);
    expect(recapsPosted()).toBe(0);
    expect(getCampaignRecap).toHaveBeenCalled();
  }, 60_000);

  it('control: a mint the world refused started no session, so no recap posts', async () => {
    expectConsoleError();   // "Failed to persist session ID", and whatever else the refused writes make the ready hook log
    const fault = await openWorld(sessionSeven(5), {}, { refuseMint: true });
    expect(fault.refused).toBeGreaterThanOrEqual(1);
    expect(world().currentSessionId).toBe('S7');
    expect(recapsPosted()).toBe(0);
  }, 60_000);
});

describe('issue #342 D6 — the "Session gap (hours)" setting is retired', () => {
  it('is not registered, has no field on the Narrator panel and is not saved', async () => {
    const { registerSettings, SettingsPanelApp } = await import('../../src/ui/settingsPanel.js');
    const { StubElement } = await import('../helpers/cardDom.js');
    globalThis.document = { createElement: (tag) => new StubElement(tag) };
    try {
      game.settings._registry.clear();
      registerSettings();
      expect(game.settings._registry.has(`${MODULE_ID}.autoRecapEnabled`)).toBe(true);   // control: its neighbours are
      expect(game.settings._registry.has(`${MODULE_ID}.sessionGapHours`)).toBe(false);
      expect(game.settings._registry.get(`${MODULE_ID}.autoRecapEnabled`).hint).toMatch(/End a Session, or four hours with no chat activity/);

      game.settings._store.set(`${MODULE_ID}.campaignState`, {});
      game.settings._store.set(`${MODULE_ID}.sessionGapHours`, 12);   // a world that stored one
      const panel = Object.assign(new SettingsPanelApp(), { render() {} });
      await SettingsPanelApp.DEFAULT_OPTIONS.actions.switchTab.call(panel, {}, { dataset: { tab: 'narrator' } });
      const root = await panel._renderHTML(await panel._prepareContext({}), {});
      expect(root.querySelector('[name="autoRecapEnabled"]')).toBeTruthy();                 // control: the recap section renders
      expect(root.querySelector('[name="sessionGapHours"]')).toBeFalsy();
    } finally {
      delete globalThis.document;
      game.settings._store.delete(`${MODULE_ID}.campaignState`);
      game.settings._store.delete(`${MODULE_ID}.sessionGapHours`);
    }
  });

  it("the help's Settings Reference and Previously On page no longer offer it", () => {
    const page = (name) => PAGES.find(p => p.name === name)?.text?.content ?? '';
    expect(page('Settings Reference')).toContain('<strong>Auto Recap at Session Start</strong>');   // control
    expect(page('Settings Reference')).not.toMatch(/Session Gap Threshold|gap exceeds threshold/);
    expect(page('Previously On')).toContain('Auto-recap at session start');                        // control
    expect(page('Previously On')).not.toMatch(/Session Gap Threshold/);
  });
});
