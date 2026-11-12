// tests/unit/arrivalFragmentDocksShip.test.js
//
// Known-issues ARRIVAL-FRAGMENT-SHIP-FREE-TEXT (found while fixing
// ARRIVAL-LOCATION-PHRASE-SPLIT; the move-arrival twin of AT-PARTIAL-NAME-SHIP,
// a LOCATION-DUAL-STORE mirror drift): an arrival named by a fragment of a
// place's name docks the ship at the place the current location becomes.
//
// A move arrival writes two "where are we" stores, each by its own resolver:
// the current location by resolveCurrentLocationName (exact, then prefix, then
// substring — "Bleak" is Bleakhold) and the command vehicle's position by
// inferShipPosition (a full name or a name part — "Bleak" is neither). So a
// Set a Course to "Bleak" made Bleakhold the current location while the ship's
// position was the free text "Bleak", in no sector, and its token stayed on
// Port Vigil's pin. `!at` had the same split until issue #342 Z15 docked the
// ship by the place it resolved; an arrival now does the same: the
// current-location pick first, the ship docked by its id.
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
const GRID = 100;
const PORT_XY  = { x: 2 * GRID, y: 2 * GRID };
const BLEAK_XY = { x: 9 * GRID, y: 4 * GRID };

let table;
let ship;
let token;

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
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

// The pins createSectorScene writes (sceneBuilder.js).
function pin(id, xy, text, flags) {
  return {
    id, x: xy.x, y: xy.y, text,
    flags: { [MODULE_ID]: { sectorNote: true, ...flags } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }),
  };
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => { table?.scenes.delete('scene-1'); table?.teardown(); });

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
      sectors: [{ id: 'sec-1', name: 'Outlands Mark', region: 'outlands', sceneId: 'scene-1', mapData: { settlements: [], discoveries: [] } }],
      activeSectorId: 'sec-1',
      settlementIds: ['actor-port', 'actor-bleak'], shipIds: ['ship-cv'],
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
  token = {
    id: 'tok-ship', x: PORT_XY.x, y: PORT_XY.y,
    flags: { [MODULE_ID]: { commandVehicle: true } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }),
  };
  table.scenes.set('scene-1', {
    id: 'scene-1', grid: { size: GRID },
    flags: { [MODULE_ID]: { sectorScene: true, sectorId: 'sec-1' } },
    notes: { contents: [
      pin('note-port', PORT_XY, 'Port Vigil', { settlementId: 'gen-P', actorId: 'actor-port', locationType: 'orbital' }),
      pin('note-bleak', BLEAK_XY, 'Bleakhold', { settlementId: 'gen-B', actorId: 'actor-bleak', locationType: 'orbital' }),
    ] },
    drawings: { contents: [] },
    tokens: { contents: [token] },
  });
  scriptClaude(table, { fallback: () => REPLY });
});

const position = () => ship.flags[MODULE_ID].ship.position;
const state    = () => table.world.campaignState();
const here     = () => ({ id: state().currentLocationId, type: state().currentLocationType });

describe('an arrival named by a fragment of a place: the ship docks where the current location is', () => {
  it('a Set a Course to "Bleak" docks the ship at Bleakhold, the current location', async () => {
    await setACourse('Bleak');

    expect(here(), 'the current location is Bleakhold (setup)').toEqual({ id: 'actor-bleak', type: 'settlement' });
    // It was { nearestSettlementId: null, sectorId: null, freeText: 'Bleak' }.
    expect(position()).toMatchObject({ nearestSettlementId: 'actor-bleak', sectorId: 'sec-1', updatedBy: 'set_a_course' });
  }, 30_000);

  it('…and the map follows: the token leaves Port Vigil for Bleakhold\'s pin', async () => {
    await setACourse('Bleak');

    expect({ x: token.x, y: token.y }).toEqual(BLEAK_XY);
  }, 30_000);

  it('a Finish an Expedition to "Bleak" (for no site) docks there too', async () => {
    await finish('Bleak');

    expect(here(), 'the current location is Bleakhold (setup)').toEqual({ id: 'actor-bleak', type: 'settlement' });
    expect(position()).toMatchObject({ nearestSettlementId: 'actor-bleak', updatedBy: 'expedition' });
  }, 30_000);

  it('control: an arrival named in full docks there and makes it the current location, as before', async () => {
    await setACourse('Bleakhold');

    expect(here()).toEqual({ id: 'actor-bleak', type: 'settlement' });
    expect(position()).toMatchObject({ nearestSettlementId: 'actor-bleak' });
    expect({ x: token.x, y: token.y }).toEqual(BLEAK_XY);
  }, 30_000);

  it('control: an arrival named in words around a place docks there by the word scan, as before', async () => {
    await setACourse('for the docks of Bleakhold');

    expect(position()).toMatchObject({ nearestSettlementId: 'actor-bleak' });
    expect(here()).toEqual({ id: 'actor-bleak', type: 'settlement' });
  }, 30_000);

  it('control: an arrival that names no place leaves the current location, the ship a free-text position', async () => {
    // A Finish an Expedition: a Set a Course "across the Rift" — to no charted
    // place — is read as Undertake an Expedition since issue #348 PT06, and
    // arrives nowhere.
    await finish('across the Rift');

    expect(here()).toEqual({ id: 'actor-port', type: 'settlement' });
    expect(position()).toMatchObject({ nearestSettlementId: null, freeText: 'across the Rift' });
    expect({ x: token.x, y: token.y }).toEqual(PORT_XY);
  }, 30_000);
});
