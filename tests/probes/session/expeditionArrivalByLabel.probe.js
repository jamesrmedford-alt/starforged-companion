/**
 * STARFORGED COMPANION — twelfth bug audit, session area (SESS)
 * tests/probes/session/expeditionArrivalByLabel.probe.js
 *
 * SESS-3 (sibling of issue #342 Z14 EXPEDITION-ARRIVAL-BY-LABEL-NOT-SITE).
 *
 * Finish an Expedition is an arrival move: "you reach your destination". For
 * an expedition that is for no site, the arrival is meant to be "at the place
 * its label names" (src/index.js:1573-1575; docs/flows/exploration-flow.md §3
 * "An expedition for no site arrives at the place its label names"). The code
 * resolves the arrival from the interpreter's `moveTarget` instead
 * (index.js:1589-1597: `resolveCurrentLocationName(moveTarget ?? "")` and
 * `maybeUpdateShipPositionFromName(moveTarget, …)`), while the expedition it
 * completes is found by the track ladder, which takes the one open expedition
 * when the line names none (expedition.js:65-78 selectExpeditionTrack). Z14's
 * expeditionSiteActorId (index.js:1472-1485) reads the track's label — but
 * only to look for a site.
 *
 * Scenario: the crew undertook an expedition to Kaan's Rest (a settlement)
 * from Bleakhold. A player types the finish without naming the destination
 * ("We push through the last stretch of the journey") — the interpreter
 * names no target (moveTarget null), as its prompt asks when nothing is named.
 * The expedition completes (legacy, finish card), but the ship stays docked
 * at Bleakhold, its token stays on Bleakhold's pin and CURRENT LOCATION stays
 * Bleakhold — the narrator is told the crew never left.
 *
 * Production wiring: a player's typed line → the real move pipeline on the
 * canonical GM (interpreter / dice / Claude stubbed at their boundaries, as
 * tests/unit/expeditionArrivalAtSite.test.js does).
 */

/* global structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The docking clamps of Kaan\'s Rest close around the hull.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const GRID = 100;
const BLEAK_XY = { x: 3 * GRID, y: 2 * GRID };
const KAAN_XY  = { x: 9 * GRID, y: 6 * GRID };

let table;
let ship;
let token;
let tracksStore;

function makeTracksJournal(tracks = []) {
  tracksStore = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  };
}

function pin(id, xy, text, flags) {
  return {
    id, x: xy.x, y: xy.y, text,
    flags: { [MODULE_ID]: { sectorNote: true, ...flags } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }),
  };
}

/** The crew finishes the one open expedition (to Kaan's Rest); the line names `moveTarget`. */
async function finish(moveTarget) {
  table.journal._set(makeTracksJournal([
    { id: 'exp-1', label: "Kaan's Rest", type: 'expedition', rank: 'dangerous', ticks: 40, completed: false },
  ]));
  control.interpretation = {
    adds: 0, rationale: 'test', mischiefApplied: false,
    moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null,
    isProgressMove: true, moveTarget, moveTargetId: null,
  };
  control.dice = [0.25, 0.35];   // challenge 3, 4 against progress 10: a strong hit
  await table.client('pl-1').chat('We push through the last stretch of the journey.', { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => { table?.scenes.delete('scene-1'); table?.teardown(); });

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      currentSceneId: 'sc-1', sceneTruths: [],
      sectors: [{
        id: 'sec-1', name: 'Outlands Mark', region: 'outlands', sceneId: 'scene-1',
        mapData: { settlements: [], discoveries: [] },
      }],
      activeSectorId: 'sec-1',
      settlementIds: ['actor-bleak', 'actor-kaan'], locationIds: [], shipIds: ['ship-cv'],
      // The crew set out from Bleakhold.
      currentLocationId: 'actor-bleak', currentLocationType: 'settlement',
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 } } });
  ship = table.addActor({
    id: 'ship-cv', type: 'starship', name: 'Wayfinder',
    flags: { [MODULE_ID]: { entityType: 'ship', ship: {
      _id: 'rec-ship', name: 'Wayfinder', isCommandVehicle: true,
      position: { sectorId: 'sec-1', nearestSettlementId: 'actor-bleak', nearestPlanetId: null, nearestLocationId: null,
        freeText: '', updatedAt: 1, updatedBy: 'set_a_course', narrationId: null, previous: null },
    } } },
  });
  table.addActor({
    id: 'actor-bleak', type: 'location', name: 'Bleakhold',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold', sectorId: 'sec-1' } } },
  });
  table.addActor({
    id: 'actor-kaan', type: 'location', name: "Kaan's Rest",
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-kaan', name: "Kaan's Rest", sectorId: 'sec-1' } } },
  });
  token = {
    id: 'tok-ship', x: BLEAK_XY.x, y: BLEAK_XY.y,
    flags: { [MODULE_ID]: { commandVehicle: true } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }),
  };
  table.scenes.set('scene-1', {
    id: 'scene-1', grid: { size: GRID },
    flags: { [MODULE_ID]: { sectorScene: true, sectorId: 'sec-1' } },
    notes: { contents: [
      pin('note-bleak', BLEAK_XY, 'Bleakhold', { settlementId: 'gen-A', actorId: 'actor-bleak', locationType: 'orbital' }),
      pin('note-kaan', KAAN_XY, "Kaan's Rest", { settlementId: 'gen-B', actorId: 'actor-kaan', locationType: 'planetside' }),
    ] },
    drawings: { contents: [] },
    tokens: { contents: [token] },
  });
  scriptClaude(table, { fallback: () => REPLY });
});

const position = () => ship.flags[MODULE_ID].ship.position;
const state    = () => table.world.campaignState();
const expedition = () => tracksStore[`${MODULE_ID}.tracks`].find(t => t.id === 'exp-1');

describe('SESS-3 — finishing an expedition for no site, typed without naming its destination', () => {
  it("the crew arrives at the place the expedition's label names (current location, ship, token)", async () => {
    await finish(null);

    expect(expedition().completed, 'sanity: the expedition was finished').toBe(true);
    expect.soft(position(), 'the ship docks at Kaan\'s Rest').toMatchObject({ nearestSettlementId: 'actor-kaan', updatedBy: 'expedition' });
    expect.soft({ x: token.x, y: token.y }, "the token moves onto Kaan's Rest's pin").toEqual(KAAN_XY);
    expect(state().currentLocationId, "CURRENT LOCATION is Kaan's Rest, not Bleakhold where the crew set out").toBe('actor-kaan');
  }, 60_000);

  it('…and so when the line names the destination in words that name no place ("the end of the long haul")', async () => {
    await finish('the end of the long haul');

    expect(expedition().completed).toBe(true);
    expect(state().currentLocationId).toBe('actor-kaan');
  }, 60_000);

  it("control: the line names the expedition's destination — the crew arrives there", async () => {
    await finish("Kaan's Rest");

    expect(expedition().completed).toBe(true);
    expect(state().currentLocationId).toBe('actor-kaan');
    expect(position()).toMatchObject({ nearestSettlementId: 'actor-kaan', updatedBy: 'expedition' });
    expect({ x: token.x, y: token.y }).toEqual(KAAN_XY);
  }, 60_000);
});
