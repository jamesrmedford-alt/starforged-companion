/**
 * PROBE — SESSION-05 INCITING-PREMISE-CACHED-MUTATE (ninth audit, area session)
 *
 * What the user does: the GM types `!incite` (or presses ✦ Envision Inciting
 * Incident on the Session panel). Both hand `runIncitingIncident` the value
 * `game.settings.get(MODULE_ID, "campaignState")` returned — the client's
 * cached object, by reference (src/index.js:3246, src/ui/sessionPanel.js:226,
 * src/session/campaignStart.js:166).
 *
 * What happens: src/session/incitingIncident.js:462 sets
 * `campaignState.incitingIncident = premise` ON THE CACHED OBJECT and then
 * persists through `persistSceneLedgerFields(…, { onto })`, which catches a
 * refused write (`console.warn`, returns false). When the world refuses the
 * write the GM's cache keeps the premise: every narrator call on the GM
 * renders it as campaign canon (`narratorPrompt` injects
 * `campaignState.incitingIncident` into EVERY prompt), while the world and
 * every other client — and the GM after a reload — have none; and the next
 * whole-object write from this client carries it into the world after all.
 * rules/foundry-api.md's cached-by-reference rule; the issue #326 W51 family
 * (nine sites fixed there; this one not among them). Issue #321 U06d made this
 * write land on the latest store, but still through the cached object.
 *
 * What should happen: the premise is set on the write's target only (`onto`
 * already builds the target) — never on the caller's cached object before
 * the write lands — so a refusal leaves the cache equal to the world.
 *
 * Control: with the write accepted, the premise lands in the store (today:
 * passes).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/session/incitingPremiseCachedMutate.probe.js
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

describe('SESSION-05 the inciting premise is set on the cached campaignState before its write', () => {
  it('a refused premise write leaves the GM\'s cache holding a premise the world never took', async () => {
    game.settings.set = async () => { throw new Error('test: the server refused the write'); };

    // What `!incite` / the panel pass: the cached object itself.
    const result = await runIncitingIncident(cached());
    expect(result.text).toBe(TEXT);                       // the narration happened and the card posted
    expect(ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.incitingIncidentCard)).toBe(true);

    // FAILS today: the cache carries the premise ("Paradox Station …") that the world refused.
    expect(cached().incitingIncident).toBeUndefined();
  });

  it('control: with the write accepted the premise lands in the store', async () => {
    await runIncitingIncident(cached());
    expect(cached().incitingIncident).toMatchObject({ vow: { statement: 'Find who silenced the beacon', rank: 'dangerous' } });
    expect(cached().incitingIncident.prose).toMatch(/Paradox Station/);
  });
});
