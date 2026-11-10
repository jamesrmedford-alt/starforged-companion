/**
 * PROBE UPG-3 — MOVE-RECORD-REVERTS-CONCURRENT-LOCATION (LOSE-STATE)
 *
 * The free-flow pipeline reads its working copy of campaignState before it
 * claims the lock (src/index.js:969 `const campaignState =
 * game.settings.get(...)`), narrates (seconds — a Claude call), and only then
 * records the move: persistResolution merges the working copy onto the latest
 * store (src/moves/persistResolution.js:126-131 mergeWithLatestState). Its
 * field policy (persistResolution.js:248-269, decisions.md "persistResolution
 * re-reads the stored campaignState …") keeps the WORKING COPY for every field
 * it does not list as store-owned or merge — "the pipeline's own writes:
 * arrival location, site reveals …" — `currentLocationId` /
 * `currentLocationType` among them. It has no baseline, so it cannot tell a
 * field the move changed from one it merely carried: a move that arrived
 * nowhere still writes back the location it read before its narration.
 *
 * `!at` (src/index.js:6544-6597) writes currentLocationId/Type onto the store
 * on the GM's campaignState write chain, and docks the ship there
 * (maybeUpdateShipPositionFromName — the ship record, another document).
 *
 * Scenario (booted GM + player table, the real pipeline):
 *   1. The crew is nowhere in particular (currentLocationId null); Bleakhold
 *      is a known settlement.
 *   2. Kira types a Face Danger; the canonical GM's pipeline claims the lock,
 *      rolls, and asks Claude for the narration (held).
 *   3. Meanwhile the GM types `!at Bleakhold`: current location Bleakhold, the
 *      ship docked there.
 *   4. The narration lands; the move records.
 *   Expected: the current location is still Bleakhold (the move went nowhere).
 *   Actual: it is null again — the GM's !at is undone, and CURRENT LOCATION
 *   now disagrees with the ship's docked position.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'Kira ducks under the swinging gantry.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3, 4; action die 6 — a strong hit.
const STRONG = [0.25, 0.35, 0.9];
const isNarration = (call) => /SIDECAR|NARRATOR ROLE/.test(call?.system ?? '');

let table, kira, ship, claude;
const world = () => table.world.campaignState();

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'upg3-s1', sessionNumber: 1,
      currentSceneId: 'upg3-sc', sceneTruths: [], clocks: [],
      sectors: [{ id: 'sec-1', name: 'Outlands Mark' }], activeSectorId: 'sec-1',
      settlementIds: ['actor-bleak'], shipIds: ['ship-cv'],
      currentLocationId: null, currentLocationType: null,
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  ship = table.addActor({ id: 'ship-cv', type: 'starship', name: 'Wayfinder',
    flags: { [MODULE_ID]: { entityType: 'ship', ship: { _id: 'rec-ship', name: 'Wayfinder', isCommandVehicle: true, integrity: 5, integrityMax: 5 } } } });
  table.addActor({ id: 'actor-bleak', type: 'location', name: 'Bleakhold',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold', sectorId: 'sec-1' } } } });
  claude = scriptClaude(table, { fallback: () => REPLY });
  control.interpretation = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'probe', mischiefApplied: false };
  control.dice = STRONG;
});

async function gmAt(name) {
  await table.client('gm-1').chat(`!at ${name}`);
  await table.settle();
}

describe('UPG-3 — a move narrating while the GM types !at', () => {
  it('control: !at with no move in flight sets the current location and docks the ship', async () => {
    await gmAt('Bleakhold');
    expect(world()).toMatchObject({ currentLocationId: 'actor-bleak', currentLocationType: 'settlement' });
    expect(ship.flags[MODULE_ID].ship.position?.nearestSettlementId).toBe('actor-bleak');
    await table.client('pl-1').chat('Kira ducks under the swinging gantry.', { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(world().currentLocationId).toBe('actor-bleak');            // a move after the !at keeps it
  }, 60_000);

  it('the GM\'s !at made during the move\'s narration survives the move\'s record', async () => {
    const held = claude.hold(isNarration);
    await table.client('pl-1').chat('Kira ducks under the swinging gantry.', { speaker: { actor: kira.id } });
    await held.arrived;                                   // the move is rolled; its narration is in flight

    await gmAt('Bleakhold');
    expect(world().currentLocationId, 'the !at landed').toBe('actor-bleak');

    held.release();
    await table.settle(); await table.drain();
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(world().pendingMove).toBe(false);              // the move recorded and released its lock
    // The ship record (another document) keeps the !at's dock either way.
    const docked = ship.flags[MODULE_ID].ship.position?.nearestSettlementId ?? null;
    expect({ id: world().currentLocationId, type: world().currentLocationType, docked })
      .toEqual({ id: 'actor-bleak', type: 'settlement', docked });
  }, 60_000);
});
