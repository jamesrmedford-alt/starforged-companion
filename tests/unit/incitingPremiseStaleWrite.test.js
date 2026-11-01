/**
 * STARFORGED COMPANION
 * tests/unit/incitingPremiseStaleWrite.test.js
 *
 * The inciting premise is written onto the store as it is when the narration
 * returns (issue #321 U06d).
 *
 * runIncitingIncident (src/session/incitingIncident.js) used to write the
 * WHOLE campaignState snapshot its caller read before the narrator's Claude
 * call (`game.settings.set(MODULE_ID, "campaignState", campaignState)`),
 * reverting every world write that landed during the call — decisions.md
 * "Long-running pipeline writes merge relay-owned fields" forbids exactly
 * this. Callers (`!incite`, the Session panel's ✦ Envision Inciting Incident,
 * Campaign Start phase 5) all pass the value `game.settings.get` returned.
 *
 * The premise write now owns `incitingIncident` and carries the narration's
 * scene ledgers, merged like every narration's: the sidecar applied them to
 * the same object, and its own persist may still be in flight when the
 * premise is written, so a premise-only write onto an older store would
 * revert them.
 *
 * Harness fidelity: Foundry's settings cache holds a fresh object after every
 * successful set (the value round-trips through the server as JSON); the stub
 * stores the caller's reference, so these tests clone on set.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/narration/narrator.js', () => ({
  narrateIncitingIncident: vi.fn(),
  runPacedDetection:       vi.fn(async () => {}),
  runNarrationTierUpdate:  vi.fn(async () => {}),
}));
vi.mock('../../src/world/worldJournal.js', () => ({
  recordLoreDiscovery: vi.fn(async () => {}),
}));

import { narrateIncitingIncident } from '../../src/narration/narrator.js';
import { runIncitingIncident } from '../../src/session/incitingIncident.js';
import { startScene } from '../../src/factContinuity/sceneLifecycle.js';
import { runGmAction } from '../../src/multiplayer/gmRelay.js';

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

describe('the inciting premise persist', () => {
  it('keeps a Private Lines sync and a safety flag relayed during the inciting narration', async () => {
    vi.mocked(narrateIncitingIncident).mockImplementation(async ({ campaignState }) => {
      // narrateIncitingIncident → ensureSceneStarted → startScene (persisted)
      await startScene(campaignState, { reason: 'inciting_incident' });
      // … the Claude call is in flight; relayed writes land on the GM:
      await runGmAction('safety.syncPrivateLines', { lines: ['no spiders'] }, { requesterId: 'pl-1' });
      await runGmAction('safety.setFlag', { text: 'body horror', visibility: 'public' }, { requesterId: 'pl-2' });
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
    expect(stored.safety.privateLines).toEqual([{ playerId: 'pl-1', lines: ['no spiders'] }]);
    expect(stored.safetyFlags.map(f => f.text)).toEqual(['body horror']);
  });

  it("carries the narration's scene ledgers when the sidecar's own persist has not landed yet", async () => {
    vi.mocked(narrateIncitingIncident).mockImplementation(async ({ campaignState }) => {
      await startScene(campaignState, { reason: 'inciting_incident' });
      await runGmAction('safety.setFlag', { text: 'body horror', visibility: 'public' }, { requesterId: 'pl-2' });
      // The sidecar applied the premise facts to this object; its persist is
      // still in flight, so the store does not have them yet.
      campaignState.sceneTruths = [...(campaignState.sceneTruths ?? []), {
        id: 'tr-beacon01', subject: { kind: 'text', text: 'the beacon' }, fact: 'Silenced from inside the station',
        sessionId: 'ssn-1', sceneId: campaignState.currentSceneId, moveId: null, source: 'narrator_sidecar',
        asserter: 'narrator', createdAt: 1, retracted: false, retractedBy: null, retractedAt: null,
        correctedTo: null, migratedTo: null,
      }];
      campaignState.sceneFrame = { location: 'Paradox Station', present: [], situation: 'The beacon screams', sceneId: campaignState.currentSceneId };
      return TEXT;
    });

    const campaignState = game.settings.get(MODULE_ID, 'campaignState');
    await runIncitingIncident(campaignState);

    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored.incitingIncident?.prose).toMatch(/beacon/);
    expect(stored.sceneTruths.map(t => t.id)).toEqual(['tr-beacon01']);
    expect(stored.sceneFrame?.location).toBe('Paradox Station');
    expect(stored.safetyFlags.map(f => f.text)).toEqual(['body horror']);
  });
});
