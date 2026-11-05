/**
 * STARFORGED COMPANION
 * tests/unit/incitingPremiseCopy.test.js
 *
 * Issue #331 X38 (INCITING-PREMISE-CACHED-MUTATE). `!incite`, ✦ Envision
 * Inciting Incident and Campaign Start phase 5 pass the cached campaignState;
 * runIncitingIncident set `campaignState.incitingIncident = premise` on it
 * before persistSceneLedgerFields (which catches a refused write). Refused,
 * the GM's cache kept the premise — rendered as campaign canon in every
 * narrator prompt on the GM — while the world, the other clients and the GM
 * after a reload had none. The premise is set on the write's target, and on
 * the caller's object only once the store has it.
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

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const TEXT = [
  'The beacon at Paradox Station screams a distress code no one has used in a century.',
  '',
  'Suggested vow: Find who silenced the beacon (dangerous)',
  'Situation: Paradox Station has gone dark and its beacon is screaming.',
].join('\n');

const cached = () => game.settings.get(MODULE_ID, 'campaignState');

let realSet;
beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(KEY, { currentSessionId: 'ssn-1', currentSceneId: null, sceneTruths: [], safetyFlags: [] });
  game.user.isGM = true;
  realSet = game.settings.set;
  vi.mocked(narrateIncitingIncident).mockReset();
  vi.mocked(narrateIncitingIncident).mockResolvedValue(TEXT);
});
afterEach(() => { game.settings.set = realSet; });

describe('X38 — the inciting premise reaches the caller\'s object only once the world has it', () => {
  it('a refused premise write leaves no premise in the GM\'s cache', async () => {
    game.settings.set = async () => { throw new Error('test: the server refused the write'); };

    // What `!incite` / the panel pass: the cached object itself.
    const result = await runIncitingIncident(cached());
    expect(result.text).toBe(TEXT);                       // the narration happened and the card posted
    expect(ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.incitingIncidentCard)).toBe(true);

    // The cache carried the premise ("Paradox Station …") the world refused.
    expect(cached().incitingIncident).toBeUndefined();
  });

  it('a caller\'s working copy gets the premise once the write lands', async () => {
    const copy = { ...cached() };
    await runIncitingIncident(copy);
    expect(copy.incitingIncident?.prose).toMatch(/Paradox Station/);
    expect(cached().incitingIncident?.establishedAt).toBe(copy.incitingIncident.establishedAt);
  });

  it('control: with the write accepted the premise lands in the store', async () => {
    await runIncitingIncident(cached());
    expect(cached().incitingIncident).toMatchObject({ vow: { statement: 'Find who silenced the beacon', rank: 'dangerous' } });
    expect(cached().incitingIncident.prose).toMatch(/Paradox Station/);
  });
});
