// tests/unit/arrivalPhraseCurrentLocation.test.js
//
// Known-issues ARRIVAL-LOCATION-PHRASE-SPLIT (found while fixing issue #342
// Z14; a LOCATION-DUAL-STORE mirror drift): an arrival the crew names in words
// around a place moves the campaign's current location to the place the ship
// docked at.
//
// A move arrival writes two "where are we" stores: the command vehicle's
// position (maybeUpdateShipPositionFromName → inferShipPosition, whose word
// scan finds "Bleakhold" in "the expedition to Bleakhold") and
// campaignState.currentLocationId (the current-location pick by the
// destination's id, else resolveCurrentLocationName — which matches only a
// place whose name contains the whole label). So "the expedition to
// Bleakhold" docked the ship at Bleakhold while CURRENT LOCATION stayed at
// Port Vigil, where the crew set out: the narrator, the Entities panel's
// highlight and the site-aware waypoint seeds read the place the crew left.
// When the id and the name both miss, the current location is now the place
// the position record the arrival just wrote names.
//
// Production wiring: a player's typed line → the real move pipeline on the
// canonical GM (interpreter / dice / Claude stubbed at their boundaries).

/* global structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The docking clamps close around the hull.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
let ship;

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

/** Finish an expedition (a strong hit) the crew named `label` — linked to no site. */
async function finish(label) {
  table.journal._set(makeTracksJournal([
    { id: 'exp-1', label, type: 'expedition', rank: 'dangerous', ticks: 40, completed: false },
  ]));
  control.interpretation = {
    adds: 0, rationale: 'test', mischiefApplied: false,
    moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null,
    isProgressMove: true, moveTarget: label, moveTargetId: 'exp-1',
  };
  control.dice = [0.25, 0.35];   // challenge 3, 4 against progress 10: a strong hit
  await table.client('pl-1').chat('We bring the ship in at last — the expedition is over.', { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}

/** Set a Course (a strong hit) toward `target`. */
async function setACourse(target) {
  control.interpretation = {
    adds: 0, rationale: 'test', mischiefApplied: false,
    moveId: 'set_a_course', moveName: 'Set A Course', statUsed: 'supply', moveTarget: target,
  };
  control.dice = [0.15, 0.25, 0.99];   // challenge 2, 3; action 6 + supply: a strong hit
  await table.client('pl-1').chat('We plot the jump and hold the course.', { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

const settlement = (id, name) => table.addActor({
  id, type: 'location', name,
  flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name, sectorId: 'sec-1' } } },
});

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2,
      currentSceneId: 'sc-1', sceneTruths: [],
      sectors: [{ id: 'sec-1', name: 'Outlands Mark', region: 'outlands', mapData: { settlements: [], discoveries: [] } }],
      activeSectorId: 'sec-1',
      settlementIds: ['actor-port', 'actor-bleak'], locationIds: ['actor-wreck'], shipIds: ['ship-cv'],
      // The crew set out from Port Vigil.
      currentLocationId: 'actor-port', currentLocationType: 'settlement',
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 } } });
  ship = table.addActor({
    id: 'ship-cv', type: 'starship', name: 'Wayfinder',
    flags: { [MODULE_ID]: { entityType: 'ship', ship: {
      _id: 'rec-ship', name: 'Wayfinder', isCommandVehicle: true,
      position: { sectorId: 'sec-1', nearestSettlementId: 'actor-port', nearestPlanetId: null, nearestLocationId: null,
        freeText: '', updatedAt: 1, updatedBy: 'set_a_course', narrationId: null, previous: null, tokenBefore: null },
    } } },
  });
  settlement('actor-port', 'Port Vigil');
  settlement('actor-bleak', 'Bleakhold');
  table.addActor({
    id: 'actor-wreck', type: 'location', name: 'Kovash Hulk',
    flags: { [MODULE_ID]: { entityType: 'location', location: {
      _id: 'rec-wreck', name: 'Kovash Hulk', type: 'derelict', status: 'visited', sectorId: 'sec-1',
    } } },
  });
  scriptClaude(table, { fallback: () => REPLY });
});

const position = () => ship.flags[MODULE_ID].ship.position;
const state    = () => table.world.campaignState();
const here     = () => ({ id: state().currentLocationId, type: state().currentLocationType });

describe('an arrival named in words around a place: the current location follows the ship', () => {
  it('"the expedition to Bleakhold" docks at Bleakhold, and the current location is Bleakhold', async () => {
    await finish('the expedition to Bleakhold');

    expect(position(), 'the ship docked at Bleakhold (setup)').toMatchObject({ nearestSettlementId: 'actor-bleak', updatedBy: 'expedition' });
    // It stayed at Port Vigil, where the crew set out.
    expect(here()).toEqual({ id: 'actor-bleak', type: 'settlement' });
  }, 30_000);

  it('a Set a Course "for the docks of Bleakhold" too', async () => {
    await setACourse('for the docks of Bleakhold');

    expect(position(), 'the ship docked at Bleakhold (setup)').toMatchObject({ nearestSettlementId: 'actor-bleak', updatedBy: 'set_a_course' });
    expect(here()).toEqual({ id: 'actor-bleak', type: 'settlement' });
  }, 30_000);

  it('a recorded place too: "the long haul out to the Kovash Hulk" makes the derelict the current location', async () => {
    await finish('the long haul out to the Kovash Hulk');

    expect(position(), 'the ship is at the derelict (setup)').toMatchObject({ nearestLocationId: 'actor-wreck' });
    expect(here()).toEqual({ id: 'actor-wreck', type: 'location' });
  }, 30_000);

  it('control: an arrival named by the place\'s own name sets it, as before', async () => {
    await finish('Bleakhold');
    expect(here()).toEqual({ id: 'actor-bleak', type: 'settlement' });
  }, 30_000);

  it('control: an arrival that names no place leaves the current location where it was', async () => {
    await finish('across the Rift');

    expect(position(), 'the position is free text (setup)').toMatchObject({ nearestSettlementId: null, nearestLocationId: null, freeText: 'across the Rift' });
    expect(here()).toEqual({ id: 'actor-port', type: 'settlement' });
  }, 30_000);
});
