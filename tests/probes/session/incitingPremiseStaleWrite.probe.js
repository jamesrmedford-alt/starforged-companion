/**
 * PROBE — runIncitingIncident writes the WHOLE campaignState snapshot its
 * caller read before the narrator's Claude call (src/session/incitingIncident.js
 * `game.settings.set(MODULE_ID, "campaignState", campaignState)`), reverting
 * every world write that landed during the call — decisions.md "Long-running
 * pipeline writes merge relay-owned fields" forbids exactly this.
 *
 * Callers (`!incite` → handleIncitingIncidentCommand, the Session panel's
 * ✦ Envision Inciting Incident, Campaign Start phase 5) all pass the value
 * `game.settings.get` returned. narrateIncitingIncident starts the scene first
 * (ensureSceneStarted → startScene, persisted), then awaits the Claude call.
 *
 * Scenario: a player loads the world while the GM's inciting narration is in
 * flight; their client relays its Private Lines on ready (GM_ACTIONS
 * "safety.syncPrivateLines"), and another player sets a flag (Set a Flag →
 * "safety.setFlag"). Both land in campaignState — then the premise persist
 * writes the pre-call snapshot over them.
 *
 * Harness fidelity: Foundry's settings cache holds a fresh object after every
 * successful set (the value round-trips through the server as JSON); the stub
 * stores the caller's reference, so this probe clones on set.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/narration/narrator.js', () => ({
  narrateIncitingIncident: vi.fn(),
  runPacedDetection:       vi.fn(async () => {}),
  runNarrationTierUpdate:  vi.fn(async () => {}),
}));
vi.mock('../../../src/world/worldJournal.js', () => ({
  recordLoreDiscovery: vi.fn(async () => {}),
}));

import { narrateIncitingIncident } from '../../../src/narration/narrator.js';
import { runIncitingIncident } from '../../../src/session/incitingIncident.js';
import { startScene } from '../../../src/factContinuity/sceneLifecycle.js';
import { runGmAction } from '../../../src/multiplayer/gmRelay.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const TEXT = [
  'The beacon at Paradox Station screams a distress code no one has used in a century.',
  '',
  'Suggested vow: Find who silenced the beacon (dangerous)',
  'Situation: Paradox Station has gone dark and its beacon is screaming.',
].join('\n');

let realSet;
beforeEach(() => {
  game.settings._store.clear();
  game.settings._store.set(KEY, {
    currentSessionId: 'ssn-1',
    currentSceneId:   null,
    safety:      { lines: ['gm line'], veils: [], privateLines: [] },
    safetyFlags: [],
  });
  realSet = game.settings.set;
  // Foundry: the cache is a fresh copy after a successful set.
  game.settings.set = async (mod, key, val) => realSet(mod, key, JSON.parse(JSON.stringify(val)));
  game.user.isGM = true;
  vi.mocked(narrateIncitingIncident).mockReset();
});
afterEach(() => { game.settings.set = realSet; });

describe('PROBE INCITE-PREMISE-STALE-WRITE', () => {
  it('a Private Lines sync and a safety flag relayed during the inciting narration survive the premise persist', async () => {
    vi.mocked(narrateIncitingIncident).mockImplementation(async ({ campaignState }) => {
      // narrateIncitingIncident → ensureSceneStarted → startScene (persisted)
      await startScene(campaignState, { reason: 'inciting_incident' });
      // … the Claude call is in flight; relayed writes land on the GM:
      await runGmAction('safety.syncPrivateLines', { lines: ['no spiders'] }, { requesterId: 'pl-1' });
      await runGmAction('safety.setFlag', { text: 'body horror', visibility: 'public' }, { requesterId: 'pl-2' });
      // sanity: both are in the world now
      const mid = game.settings.get(MODULE_ID, 'campaignState');
      expect(mid.safety.privateLines).toEqual([{ playerId: 'pl-1', lines: ['no spiders'] }]);
      expect(mid.safetyFlags.map(f => f.text)).toEqual(['body horror']);
      return TEXT;
    });

    // exactly what handleIncitingIncidentCommand / the Session panel pass
    const campaignState = game.settings.get(MODULE_ID, 'campaignState');
    await runIncitingIncident(campaignState);

    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored.incitingIncident?.prose).toMatch(/beacon/);             // the premise landed
    expect(stored.safety.privateLines).toEqual([{ playerId: 'pl-1', lines: ['no spiders'] }]); // actual today: []
    expect(stored.safetyFlags.map(f => f.text)).toEqual(['body horror']);  // actual today: []
  });
});
