/**
 * STARFORGED COMPANION
 * tests/unit/arrivalNamesPlaceByWholeWords.test.js
 *
 * Issue #345 AA23 ARRIVAL-NAME-INSIDE-WORD-DOCKS-SHIP (the twelfth audit's
 * R2P-3): a sibling of issue #325 W30 (SELECTOR-SUBSTRING-INSIDE-WORD) that
 * its rule never reached, made worse by ARRIVAL-FRAGMENT-SHIP-FREE-TEXT.
 *
 * decisions.md → "A name matches as whole words in every selection ladder"
 * [W30] (wholeWordsFit, either way). The current-location resolver kept a raw
 * substring rung (resolveCurrentLocationName: exact, then prefix, then
 * `includes`), so "home" was found inside "Rockhome". The arrival docks the
 * ship by that pick and syncs its token to its pin (ARRIVAL-FRAGMENT-SHIP-
 * FREE-TEXT), and `!at` does too (issue #342 Z15): a Set a Course "for home"
 * — a destination the crew names but the table does not track — moved the
 * current location, the ship's position and its token to Rockhome. The last
 * rung is now one name inside the other as whole words (wholeWordsFit); the
 * exact and prefix rungs stay ("Rock", the start of Rockhome's name, still
 * arrives there — ARRIVAL-FRAGMENT-SHIP-FREE-TEXT's case).
 *
 * Scenario (booted GM + player table, the real pipeline; the sector set-up of
 * tests/unit/arrivalFragmentDocksShip.test.js): the crew is at Port Vigil,
 * ship docked there, token on its pin; Rockhome (a name the vendored
 * Settlement Name oracle rolls) is another settlement of the sector.
 */
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

const REPLY = 'The engines spool up for the long haul.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const GRID = 100;
const PORT_XY = { x: 2 * GRID, y: 2 * GRID };
const ROCK_XY = { x: 9 * GRID, y: 4 * GRID };

let table, ship, token;

async function setACourse(target, text = 'We set a course and hold it.') {
  control.interpretation = {
    adds: 0, rationale: 'probe', mischiefApplied: false,
    moveId: 'set_a_course', moveName: 'Set A Course', statUsed: 'supply', moveTarget: target,
  };
  control.dice = [0.15, 0.25, 0.99];   // challenge 2, 3; action 6 + supply: a strong hit
  await table.client('pl-1').chat(text, { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}

function pin(id, xy, text, flags) {
  return {
    id, x: xy.x, y: xy.y, text,
    flags: { [MODULE_ID]: { sectorNote: true, ...flags } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }),
  };
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
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
      settlementIds: ['actor-port', 'actor-rock'], shipIds: ['ship-cv'],
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
  settlement('actor-rock', 'Rockhome');
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
      pin('note-rock', ROCK_XY, 'Rockhome', { settlementId: 'gen-R', actorId: 'actor-rock', locationType: 'orbital' }),
    ] },
    drawings: { contents: [] },
    tokens: { contents: [token] },
  });
  scriptClaude(table, { fallback: () => REPLY });
});

const state = () => table.world.campaignState();
const where = () => ({
  currentLocation: state().currentLocationId,
  docked:          ship.flags[MODULE_ID].ship.position?.nearestSettlementId ?? null,
  token:           { x: token.x, y: token.y },
});

describe('issue #345 AA23 — an arrival named by a word another place\'s name holds inside it', () => {
  it('control: "Rockhome" arrives at Rockhome — the current location, the dock and the token', async () => {
    await setACourse('Rockhome');
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(where()).toEqual({ currentLocation: 'actor-rock', docked: 'actor-rock', token: ROCK_XY });
  }, 60_000);

  it('control: "Rock", the start of its name, arrives there too (ARRIVAL-FRAGMENT-SHIP-FREE-TEXT\'s case)', async () => {
    await setACourse('Rock');
    expect(where()).toEqual({ currentLocation: 'actor-rock', docked: 'actor-rock', token: ROCK_XY });
  }, 60_000);

  it('"We set a course for home" names no tracked place: the crew is not moved to Rockhome', async () => {
    await setACourse('home', 'We set a course for home.');
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    const now = where();
    expect({ currentLocation: now.currentLocation, dockedAtRockhome: now.docked === 'actor-rock', token: now.token })
      .toEqual({ currentLocation: 'actor-port', dockedAtRockhome: false, token: PORT_XY });
  }, 60_000);

  it('control: a destination that names the place in words around it — "the docks of Rockhome" — arrives there', async () => {
    await setACourse('the docks of Rockhome');
    expect(where()).toEqual({ currentLocation: 'actor-rock', docked: 'actor-rock', token: ROCK_XY });
  }, 60_000);
});

describe('issue #345 AA23 — `!at` with a word another place\'s name holds inside it', () => {
  const at = async (arg) => { await table.client('gm-1').chat(`!at ${arg}`); await table.settle(); await table.drain(); };

  it('"!at home" sets no current location and leaves the ship docked where it was', async () => {
    await at('home');
    const now = where();
    expect({ currentLocation: now.currentLocation, dockedAtRockhome: now.docked === 'actor-rock', token: now.token })
      .toEqual({ currentLocation: 'actor-port', dockedAtRockhome: false, token: PORT_XY });
  }, 60_000);

  it('control: "!at Rock", the start of its name, sets Rockhome and docks the ship there', async () => {
    await at('Rock');
    expect(where()).toEqual({ currentLocation: 'actor-rock', docked: 'actor-rock', token: ROCK_XY });
  }, 60_000);
});
