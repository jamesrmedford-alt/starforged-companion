/**
 * STARFORGED COMPANION
 * tests/unit/narrationWorkingCopy.test.js
 *
 * Issue #329 X09 — every caller that narrates from the stored campaignState
 * hands the narrator a working copy, never the cached setting itself.
 *
 * The narrator applies its sidecar — and a scene start — onto the object it is
 * given; handed the cached setting (game.settings.get returns it by
 * reference), a write the world refused left this client holding facts or a
 * scene the world lacked. The oracle follow-up on the GM, `@scene`, the three
 * clock vignettes (`!clock`, Pay the Price, Begin a Session) and the relayed
 * sidecar each pass a copy now. (`@scene` and the oracle follow-up's refused
 * write are pinned on the table, narrationCachedStoreWrites.test.js.)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/narration/narrator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  narrateClockAdvancement: vi.fn(async () => 'The net tightens.'),
  narrateOracleFollowup:   vi.fn(async () => 'The oracle answers.'),
}));
vi.mock('../../src/character/actorBridge.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getPlayerActors:   vi.fn(() => []),
  applyMeterChanges: vi.fn(async () => {}),
  advanceVowClocks:  vi.fn(async () => []),
}));

import {
  narrateClockAdvancement, narrateOracleFollowup, applyRelayedNarratorSidecar,
} from '../../src/narration/narrator.js';
import { handleClockCommand } from '../../src/clocks/clocks.js';
import { advanceClocksOnPayThePrice } from '../../src/clocks/payThePriceClocks.js';
import { applyBeginSession } from '../../src/safety/sessionLifecycleDialogs.js';
import { narrateOracleFollowupOnGm } from '../../src/oracles/oracleFollowup.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const cached = () => game.settings.get(MODULE_ID, 'campaignState');
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  global.game.messages = { contents: [] };
  Hooks.callAll = vi.fn();
});
afterEach(() => { delete Hooks.callAll; game.settings._store.clear(); });

/** The campaignState the mocked narrator was handed — a copy of the cache, never the cache itself. */
function expectWorkingCopy(mockFn) {
  const given = mockFn.mock.calls.at(-1)?.[0]?.campaignState ?? mockFn.mock.calls.at(-1)?.[1];
  expect(given).toBeDefined();
  expect(given).not.toBe(cached());
  expect(given.currentSessionId).toBe(cached().currentSessionId);
}

describe('issue #329 X09 — the narrator is handed a working copy, not the cached setting', () => {
  it('a `!clock advance` vignette', async () => {
    game.settings._store.set(KEY, { currentSessionId: 's-1', clocks: [{ _id: 't1', name: 'Breach', type: 'tension', segments: 4, filled: 1, active: true }] });
    await handleClockCommand({ content: '!clock advance Breach', flags: {} });
    await vi.waitFor(() => expect(narrateClockAdvancement).toHaveBeenCalled(), { timeout: 5000 });
    expectWorkingCopy(narrateClockAdvancement);
  });

  it("Pay the Price's trigger vignette", async () => {
    game.settings._store.set(KEY, { currentSessionId: 's-1', clocks: [{ _id: 't1', name: 'Breach', type: 'tension', segments: 4, filled: 3, active: true }] });
    await advanceClocksOnPayThePrice();
    await vi.waitFor(() => expect(narrateClockAdvancement).toHaveBeenCalled(), { timeout: 5000 });
    expectWorkingCopy(narrateClockAdvancement);
  });

  it("Begin a Session's clock vignette", async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);   // the campaign clock advances
    game.settings._store.set(KEY, { currentSessionId: 's-1', sessionActive: false,
      clocks: [{ _id: 'c1', name: 'The Syndicate', type: 'campaign', segments: 6, filled: 1, active: true, advanceOdds: 'likely' }] });
    await applyBeginSession({ vignetteRolled: false }, {});
    await settle();
    await vi.waitFor(() => expect(narrateClockAdvancement).toHaveBeenCalled(), { timeout: 5000 });
    Math.random.mockRestore?.();
    expectWorkingCopy(narrateClockAdvancement);
  });

  it('the oracle follow-up on the GM', async () => {
    game.settings._store.set(KEY, { currentSessionId: 's-1' });
    await narrateOracleFollowupOnGm({ kind: 'yes_no', oracleName: 'Ask the Oracle', question: 'Is it safe?', rolledLine: 'Yes' }, {});
    expectWorkingCopy(narrateOracleFollowup);
  });

  it('a relayed sidecar whose write the world refused leaves the cache untouched', async () => {
    game.settings._store.set(KEY, { currentSessionId: 's-1', currentSceneId: 'sc-1', sceneTruths: [],
      sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null, xCardedNarrationIds: [] });
    const set = vi.spyOn(game.settings, 'set').mockRejectedValue(new Error('the server refused the write'));
    await applyRelayedNarratorSidecar({
      sidecar: { newTruths: [{ subject: 'the dockmaster', fact: 'Owes the crew a favour' }], stateChanges: [],
        sceneFrame: { location: 'the loading bay', present: [], situation: 'Haggling' } },
      sceneId: 'sc-1', narrationId: 'nar-1',
    }, { requesterIsGM: false });
    await settle();
    set.mockRestore();
    expect(cached().sceneTruths).toEqual([]);
    expect(cached().sceneFrame).toBeNull();
  });
});
