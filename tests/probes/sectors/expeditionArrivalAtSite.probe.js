// tests/probes/sectors/expeditionArrivalAtSite.probe.js
//
// SECT-1 — the Finish an Expedition that charts a site arrives at the track's
// LABEL, not at the site it reveals.
//
// An unexplored site's pin reads "Unexplored Site" until it is revealed, so
// the expedition the crew undertakes toward it is named in their words ("the
// derelict signal", "Unexplored Site") — never the site's hidden generated
// name. applyOutcomeEffects' arrival infers the position from that label alone
// (`maybeUpdateShipPositionFromName(moveTarget, …, "expedition")`, with no
// entity id for a Finish an Expedition), BEFORE the reveal resolves the site.
// The label resolves to no place: the ship position is the label as free text,
// the token never leaves the settlement the crew left, and currentLocationId
// is unchanged. The site-flow doc's "a named site becomes the CURRENT LOCATION
// … the moment the crew actually goes there" and issue #335 Y14's premise ("the
// Finish an Expedition that charts it records its arrival before its reveal")
// hold only when the label happens to BE the hidden name (the control below).
//
// Production wiring: a player's typed line → the real move pipeline on the
// canonical GM (interpreter / dice / Claude stubbed at their boundaries).

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

const REPLY = 'The hulk fills the viewport.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const GRID = 100;
const BLEAK_XY = { x: 3 * GRID, y: 2 * GRID };
const SITE_XY  = { x: 14 * GRID, y: 1 * GRID };

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

// The pins createSectorScene writes (sceneBuilder.js), each updatable — the
// reveal restyles the site's (restyleSiteOnScene).
function pin(id, xy, text, flags) {
  return {
    id, x: xy.x, y: xy.y, text,
    flags: { [MODULE_ID]: { sectorNote: true, ...flags } },
    update: vi.fn(async function (patch) {
      for (const [k, v] of Object.entries(patch)) {
        if (k.startsWith(`flags.${MODULE_ID}.`)) this.flags[MODULE_ID][k.slice(`flags.${MODULE_ID}.`.length)] = v;
        else this[k] = v;
      }
    }),
  };
}

async function play(label, { siteLinked }) {
  table.journal._set(makeTracksJournal([
    { id: 'exp-1', label, type: 'expedition', rank: 'dangerous', ticks: 40, completed: false,
      ...(siteLinked ? { siteId: 'site-1' } : {}) },
  ]));
  control.interpretation = {
    adds: 0, rationale: 'test', mischiefApplied: false,
    moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null,
    isProgressMove: true, moveTarget: label, moveTargetId: 'exp-1',
  };
  control.dice = [0.25, 0.35];   // challenge 3, 4 against progress 10: a strong hit
  await table.client('pl-1').chat('We bring the ship alongside at last — the expedition is over.', { speaker: { actor: 'pc-kira' } });
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
        mapData: { settlements: [], discoveries: [
          { id: 'site-1', name: 'Derelict Starship', type: 'derelict', discovered: false, actorId: 'actor-site' },
        ] },
      }],
      activeSectorId: 'sec-1',
      settlementIds: ['actor-bleak'], locationIds: ['actor-site'], shipIds: ['ship-cv'],
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
    id: 'actor-site', type: 'location', name: 'Derelict Starship',
    flags: { [MODULE_ID]: { entityType: 'location', location: {
      _id: 'rec-site', name: 'Derelict Starship', type: 'derelict', status: 'unexplored', sectorId: 'sec-1', canonicalLocked: true,
    } } },
  });
  table.addActor({
    id: 'actor-bleak', type: 'location', name: 'Bleakhold',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold', sectorId: 'sec-1' } } },
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
      pin('note-site', SITE_XY, 'Unexplored Site', { siteNote: true, siteId: 'site-1', actorId: 'actor-site', siteType: 'derelict', discovered: false }),
    ] },
    drawings: { contents: [] },
    tokens: { contents: [token] },
  });
  scriptClaude(table, { fallback: () => REPLY });
});

const position = () => ship.flags[MODULE_ID].ship.position;

describe('SECT-1: finishing the expedition that charts a site arrives at that site', () => {
  it('an expedition the crew named in their own words ("the derelict signal", linked to the site): the current location becomes the revealed site', async () => {
    await play('the derelict signal', { siteLinked: true });

    // The finish revealed the linked site (the setup is real).
    expect(table.world.campaignState().sectors[0].mapData.discoveries[0].discovered).toBe(true);
    // …but the crew is still "at" Bleakhold: the label resolves to no place.
    expect(table.world.campaignState().currentLocationId).toBe('actor-site');   // actual: 'actor-bleak'
  }, 30_000);

  it('…and the ship position names the site, not the label as free text', async () => {
    await play('the derelict signal', { siteLinked: true });

    // actual: { nearestLocationId: null, freeText: 'the derelict signal', updatedBy: 'expedition' }
    expect(position()).toMatchObject({ nearestLocationId: 'actor-site', updatedBy: 'expedition' });
  }, 30_000);

  it('…and the map follows: the token leaves Bleakhold for the site pin', async () => {
    await play('Unexplored Site', { siteLinked: false });   // the pin's own label; the sole-site rung reveals it

    expect(table.world.campaignState().sectors[0].mapData.discoveries[0].discovered).toBe(true);
    // actual: never called — the token stays on Bleakhold's pin.
    expect(token.update).toHaveBeenCalledWith({ x: SITE_XY.x, y: SITE_XY.y }, { sfcPositionSync: true });
  }, 30_000);

  it('control: a label that IS the site\'s hidden name arrives there — current location, ship position and token', async () => {
    await play('Derelict Starship', { siteLinked: true });

    expect(table.world.campaignState().sectors[0].mapData.discoveries[0].discovered).toBe(true);
    expect(table.world.campaignState().currentLocationId).toBe('actor-site');
    expect(position()).toMatchObject({ nearestLocationId: 'actor-site', updatedBy: 'expedition' });
    expect(token.update).toHaveBeenCalledWith({ x: SITE_XY.x, y: SITE_XY.y }, { sfcPositionSync: true });
  }, 30_000);
});
