/**
 * STARFORGED COMPANION
 * tests/unit/campaignStartBegin.test.js
 *
 * Issue #331 X36 (CAMPAIGN-START-CACHED-BEGIN). ✦ Campaign Start phase 4
 * handed the cached campaignState to beginSession, which flipped the gate on
 * it before the write — a refused write left the GM's cache "active" (fixed
 * with issue #330 D12's copy, pinned here). And it bypassed Begin a Session's
 * mint check (applyBeginSession's rollSessionIfDue): run after End a Session,
 * it reopened the ended session instead of starting the next. Phase 4 now
 * closes out a session that is over first, and merges only its own fields
 * onto the latest store. (sessionStateChanged fires on the running client in
 * both Begin paths; the other clients' Session panels re-render on the
 * campaignState setting hook.)
 */

/* global expectConsoleError */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/session/quickstart.js', () => ({ runPlaytestQuickstart: vi.fn() }));
vi.mock('../../src/entities/finalize.js', () => ({ finalizeEntity: vi.fn() }));
vi.mock('../../src/entities/shipEnvision.js', () => ({
  envisionShip:       vi.fn(),
  renderEnvisionHtml: vi.fn(() => '<p>envisioned</p>'),
  appendNotesSection: vi.fn(async () => {}),
}));
vi.mock('../../src/session/incitingIncident.js', () => ({ runIncitingIncident: vi.fn() }));

import { runCampaignStart } from '../../src/session/campaignStart.js';
import { runPlaytestQuickstart } from '../../src/session/quickstart.js';
import { envisionShip } from '../../src/entities/shipEnvision.js';
import { runIncitingIncident } from '../../src/session/incitingIncident.js';

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
  await realSet(MODULE_ID, 'campaignState', { shipIds: ['ship-1'], connectionIds: [], sessionActive: false, currentSessionId: 'S1',
    lastSessionTimestamp: new Date().toISOString() });
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

describe('X36 — Campaign Start phase 4 begins the session as Begin a Session does', () => {
  it('a refused session-start write leaves the GM\'s cache saying the session is active while the world says it is not', async () => {
    game.settings.set = async (mod, key, val) => {
      if (key === 'campaignState' && val?.sessionActive === true) throw new Error('test: the server refused the write');
      return realSet(mod, key, val);
    };
    expectConsoleError(/begin session failed/i);

    const result = await runCampaignStart({ skipConfirm: true });

    expect(phase(result, 'Begin Session').ok).toBe(false);     // the phase reports the failure
    // beginSession mutated the cached object before the write (fixed with
    // issue #330 D12's copy).
    expect(state().sessionActive).toBe(false);
    expect(state().sessionActiveStartedAt ?? null).toBeNull();
  });

  it('control: a successful run flips the world and reports the phase', async () => {
    const result = await runCampaignStart({ skipConfirm: true });
    expect(phase(result, 'Begin Session')).toMatchObject({ ok: true, detail: 'session gate activated' });
    expect(state().sessionActive).toBe(true);
    expect(state().sessionStartedId).toBe('S1');
  });

  it('after End a Session it starts the next session, not the ended one (the mint check)', async () => {
    await realSet(MODULE_ID, 'campaignState', { shipIds: ['ship-1'], connectionIds: [], sessionActive: false,
      currentSessionId: 'S1', sessionNumber: 3, sessionStartedId: 'S1', sessionEndedId: 'S1',
      lastSessionTimestamp: new Date().toISOString() });

    const result = await runCampaignStart({ skipConfirm: true });

    expect(phase(result, 'Begin Session').ok).toBe(true);
    expect(state().currentSessionId).not.toBe('S1');
    expect(state().sessionNumber).toBe(4);
    expect(state().sessionEndedId ?? null).toBeNull();
    expect(state().sessionActive).toBe(true);
    expect(state().sessionStartedId).toBe(state().currentSessionId);
  });

  it('a session still open is begun as it is (no new id)', async () => {
    await realSet(MODULE_ID, 'campaignState', { shipIds: ['ship-1'], connectionIds: [], sessionActive: false,
      currentSessionId: 'S1', sessionNumber: 3, lastSessionTimestamp: new Date().toISOString() });
    await runCampaignStart({ skipConfirm: true });
    expect(state().currentSessionId).toBe('S1');
    expect(state().sessionNumber).toBe(3);
  });
});
