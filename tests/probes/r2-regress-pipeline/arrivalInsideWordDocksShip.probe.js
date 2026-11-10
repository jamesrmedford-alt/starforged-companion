/**
 * PROBE R2P-3 — ARRIVAL-NAME-INSIDE-WORD-DOCKS-SHIP (WRONG-TARGET)
 * A regression of ARRIVAL-FRAGMENT-SHIP-FREE-TEXT (the eleventh audit's open
 * items; issue #342 Z15 did the same for `!at`), on a sibling of issue #325
 * W30 (SELECTOR-SUBSTRING-INSIDE-WORD) its rule never reached.
 *
 * decisions.md → "A name matches as whole words in every selection ladder"
 * [W30]: "Raw containment matched a short name inside another word, so the move
 * landed on the wrong connection, vow, fight or expedition". The location
 * resolver kept the raw rung:
 *   src/index.js:6514-6517 resolveCurrentLocationName — exact, then prefix,
 *     then `c.lc.includes(target)`: "home" is found inside "Rockhome".
 * Before the fix only CURRENT LOCATION took that pick; the ship's position used
 * its own word scan (a full name or a name part — tests/unit/
 * arrivalFragmentDocksShip.test.js: "It was { nearestSettlementId: null, …
 * freeText: 'Bleak' }"), so "home" stayed free text and the token stayed put.
 * The fix docks the ship by the resolver's pick:
 *   src/index.js:1589-1598 applyOutcomeEffects — `named = … ??
 *     resolveCurrentLocationName(moveTarget)`; maybeUpdateShipPositionFromName
 *     (…, { entityId: named?.id ?? destinationId }) → the position by that id,
 *     and the token synced to its pin (:6633-6637).
 * So a Set a Course "for home" — a destination the crew names but the table
 * does not track — now moves the current location, the ship's position and its
 * token to Rockhome, a different settlement, because "home" sits inside its
 * name. (`!at home` docks the ship there too since Z15: handleAtCommand :6587.)
 *
 * Scenario (booted GM + player table, the real pipeline; the sector set-up of
 * tests/unit/arrivalFragmentDocksShip.test.js):
 *   1. The crew is at Port Vigil, ship docked there, token on its pin. Rockhome
 *      (a name the vendored Settlement Name oracle rolls, beside Lastport,
 *      Redhaven, Lasthope, Starfall …) is another settlement of the sector.
 *   2. Kira: "We set a course for home." — Set a Course, moveTarget "home", a
 *      strong hit.
 *   Expected: no tracked place is named — the current location stays Port
 *     Vigil, the ship is not docked at Rockhome, the token stays on Port
 *     Vigil's pin.
 *   Actual: Rockhome is the current location, the ship's dock and the token's pin.
 *
 * Controls: "Rockhome" (exact) and "Rock" (a name's start, the fix's own case)
 * arrive at Rockhome.
 */
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

describe('R2P-3 — an arrival named by a word another place\'s name holds inside it', () => {
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
});
