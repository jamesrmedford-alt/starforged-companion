/**
 * PROBE — SESSION-02 CAMPAIGN-START-CACHED-BEGIN (ninth audit, area session)
 *
 * What the user does: the GM runs ✦ Campaign Start (the hotbar macro /
 * `api.runCampaignStart()`). Phase 4 begins the session.
 *
 * What happens: src/session/campaignStart.js:145-149 reads the cached
 * campaignState (`readCampaignState` → `game.settings.get`, which returns the
 * client's cached object BY REFERENCE), hands it to `beginSession`, which sets
 * `sessionActive = true` and `sessionActiveStartedAt` ON THAT OBJECT, then
 * writes it. When the world refuses the write the phase is reported as failed
 * (❌ Begin Session) — but the GM's cache keeps `sessionActive: true`
 * (rules/foundry-api.md, the issue #326 W51 family; the same shape fixed in
 * applyBeginSession by issue #309 N09). On the GM's client the Session panel
 * then reads "Active", `openBeginSessionDialog`'s pre-checks run against the
 * flipped cache, and the session gate (src/index.js:783) runs the pipeline
 * for every typed line while the world — and every other client — says the
 * session never began; the next whole-object write from this client carries
 * the flip into the world after all.
 *
 * Also notable: this Begin bypasses applyBeginSession entirely — no
 * `rollSessionIfDue`, no `sessionStartedId` stamp, no clock advance, no
 * `sessionStateChanged` for the relay path — a session begun by Campaign
 * Start can be "begun" again from the panel with all start effects.
 *
 * What should happen: the write changes a copy (`{ ...cs }`), so a refusal
 * leaves the cache equal to the world (decisions.md "A refusable write
 * changes a copy" [W51]); better, phase 4 goes through applyBeginSession.
 *
 * Controls: the phase is reported failed (today: passes); a successful run
 * flips the world (today: passes).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/session/campaignStartCachedBegin.probe.js
 */

/* global expectConsoleError */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/session/quickstart.js', () => ({ runPlaytestQuickstart: vi.fn() }));
vi.mock('../../../src/entities/finalize.js', () => ({ finalizeEntity: vi.fn() }));
vi.mock('../../../src/entities/shipEnvision.js', () => ({
  envisionShip:       vi.fn(),
  renderEnvisionHtml: vi.fn(() => '<p>envisioned</p>'),
  appendNotesSection: vi.fn(async () => {}),
}));
vi.mock('../../../src/session/incitingIncident.js', () => ({ runIncitingIncident: vi.fn() }));

import { runCampaignStart } from '../../../src/session/campaignStart.js';
import { runPlaytestQuickstart } from '../../../src/session/quickstart.js';
import { envisionShip } from '../../../src/entities/shipEnvision.js';
import { runIncitingIncident } from '../../../src/session/incitingIncident.js';

const MODULE_ID = 'starforged-companion';
const ship = { id: 'ship-1', name: 'Wayward Star', type: 'starship', flags: { [MODULE_ID]: { ship: { isCommandVehicle: true } } } };

const state = () => game.settings.get(MODULE_ID, 'campaignState');
const phase = (result, name) => result.phases.find(p => p.phase === name);

let realSet;
beforeEach(async () => {
  ChatMessage._reset();
  vi.clearAllMocks();
  game.actors._setAll([ship]);
  game.user.isGM = true;
  realSet = game.settings.set;
  await realSet(MODULE_ID, 'campaignState', { shipIds: ['ship-1'], connectionIds: [], sessionActive: false, currentSessionId: 'S1' });
  runPlaytestQuickstart.mockResolvedValue({ phases: [{ phase: 'World Truths', ok: true, detail: '' }] });
  envisionShip.mockResolvedValue({ facet: 'all', rolls: [], prose: 'A battered hauler.', identity: {} });
  runIncitingIncident.mockResolvedValue({ spark: { action: 'Seize', theme: 'Power' }, text: 'It begins.' });
  foundry.applications.api.DialogV2 = { confirm: vi.fn(async () => true) };
  globalThis.Hooks.callAll ??= (...args) => globalThis.Hooks.call(...args);
});
afterEach(() => {
  game.settings.set = realSet;
  game.actors._reset();
  delete foundry.applications.api.DialogV2;
});

describe('SESSION-02 Campaign Start phase 4 begins the session on the cached campaignState', () => {
  it('a refused session-start write leaves the GM\'s cache saying the session is active while the world says it is not', async () => {
    game.settings.set = async (mod, key, val) => {
      if (key === 'campaignState' && val?.sessionActive === true) throw new Error('test: the server refused the write');
      return realSet(mod, key, val);
    };
    expectConsoleError(/begin session failed/i);

    const result = await runCampaignStart({ skipConfirm: true });

    expect(phase(result, 'Begin Session').ok).toBe(false);     // control: the phase reports the failure
    // FAILS today: beginSession mutated the cached object before the write.
    expect(state().sessionActive).toBe(false);
    expect(state().sessionActiveStartedAt ?? null).toBeNull();
  });

  it('control: a successful run flips the world and reports the phase', async () => {
    const result = await runCampaignStart({ skipConfirm: true });
    expect(phase(result, 'Begin Session')).toMatchObject({ ok: true, detail: 'session gate activated' });
    expect(state().sessionActive).toBe(true);
  });
});
