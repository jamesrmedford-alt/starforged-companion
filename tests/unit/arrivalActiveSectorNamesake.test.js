/**
 * An arrival by name in the active sector is at the active sector's place,
 * not an older sector's namesake (issue #342 Z15,
 * ARRIVAL-BY-NAME-OTHER-SECTOR-NAMESAKE).
 *
 * Generated site names repeat across sectors — every derelict is "Derelict
 * Starship" or "Derelict Settlement" (precursorSites.js generateDerelictSite;
 * Roman numerals only within one sector) — which is why the site ladder tries
 * the active sector first on every rung (issue #321 U48). The name resolvers
 * the arrivals use did not: resolveCurrentLocationName took the first exact
 * name in `locationIds` order and inferShipPosition's index kept the first
 * entity of a full name — both the OLDER sector's. Since issue #335 Y14 the
 * sync follows that record's `nearestLocationId` too, so the GM's `!at
 * Derelict Starship` in the new sector set the current location to the old
 * sector's derelict, put SHIP POSITION in the old sector, and moved the ship's
 * token on the OLD sector's map. The narrator's ship / position emission
 * resolved the same way.
 *
 * Production wiring: the GM's real `!at` chat command on the multi-client
 * harness (the Y14 composition test's shape); the narrator's real
 * inferShipPosition.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { inferShipPosition } from '../../src/factContinuity/shipPosition.js';
import { resolveCurrentLocationName } from '../../src/index.js';

const MODULE_ID = 'starforged-companion';
const GRID = 100;
const SITE_XY = { x: 14 * GRID, y: 1 * GRID };
const SETTLE_XY = { x: 3 * GRID, y: 2 * GRID };

function sitePin(siteId, actorId) {
  return {
    id: `note-${siteId}`, x: SITE_XY.x, y: SITE_XY.y, text: 'Derelict Starship',
    flags: { [MODULE_ID]: { sectorNote: true, siteNote: true, siteId, actorId, siteType: 'derelict', discovered: true } },
  };
}
function settlementPin(actorId) {
  return {
    id: `note-${actorId}`, x: SETTLE_XY.x, y: SETTLE_XY.y, text: 'Bleakhold',
    flags: { [MODULE_ID]: { sectorNote: true, settlementId: `gen-${actorId}`, actorId, locationType: 'orbital' } },
  };
}
function makeToken() {
  return {
    id: 'tok-ship', x: 0, y: 0,
    flags: { [MODULE_ID]: { commandVehicle: true } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }),
  };
}
function sectorScene(id, sectorId, notes, token) {
  return {
    id, grid: { size: GRID },
    flags: { [MODULE_ID]: { sectorScene: true, sectorId } },
    notes: { contents: notes },
    tokens: { contents: [token] },
  };
}

let table;
let ship;
let oldToken;
let newToken;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => { table?.scenes.delete('scene-old'); table?.scenes.delete('scene-new'); table?.teardown(); });

async function setUp({ activeSectorId = 'sec-new' } = {}) {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true,
    sectors: [
      { id: 'sec-old', name: 'Devil\'s Reach', region: 'terminus', mapData: { discoveries: [{ id: 'site-old', name: 'Derelict Starship', type: 'derelict', discovered: true, actorId: 'site-old-actor' }] } },
      { id: 'sec-new', name: 'Outlands Mark',  region: 'outlands', mapData: { discoveries: [{ id: 'site-new', name: 'Derelict Starship', type: 'derelict', discovered: true, actorId: 'site-new-actor' }] } },
    ],
    // The crew moved on to the newer sector.
    activeSectorId,
    // Each creation appends its site Actors: the older sector's first.
    locationIds: ['site-old-actor', 'site-new-actor'], settlementIds: ['actor-bleak'], shipIds: ['ship-cv'],
  } } } });
  ship = table.addActor({
    id: 'ship-cv', type: 'starship', name: 'Wayfinder',
    flags: { [MODULE_ID]: { entityType: 'ship', ship: { _id: 'rec-ship', name: 'Wayfinder', isCommandVehicle: true } } },
  });
  for (const [id, sectorId] of [['site-old-actor', 'sec-old'], ['site-new-actor', 'sec-new']]) {
    table.addActor({
      id, type: 'location', name: 'Derelict Starship',
      flags: { [MODULE_ID]: { entityType: 'location', location: { _id: `rec-${id}`, name: 'Derelict Starship', type: 'derelict', sectorId } } },
    });
  }
  table.addActor({
    id: 'actor-bleak', type: 'location', name: 'Bleakhold',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold', sectorId: 'sec-new' } } },
  });
  oldToken = makeToken();
  newToken = makeToken();
  table.scenes.set('scene-old', sectorScene('scene-old', 'sec-old', [sitePin('site-old', 'site-old-actor')], oldToken));
  table.scenes.set('scene-new', sectorScene('scene-new', 'sec-new', [sitePin('site-new', 'site-new-actor'), settlementPin('actor-bleak')], newToken));
}

async function at(name) {
  await table.client('gm-1').chat(`!at ${name}`);
  await table.settle();
}

describe('`!at <site>` in the active sector names the active sector\'s site', () => {
  it('the current location is the active sector\'s Derelict Starship', async () => {
    await setUp();
    await at('Derelict Starship');

    // The command ran and set a location (the setup is real)…
    expect(table.world.campaignState().currentLocationType).toBe('location');
    // …the active sector's, not the older sector's namesake ('site-old-actor').
    expect(table.world.campaignState().currentLocationId).toBe('site-new-actor');
  }, 30_000);

  it('the ship is docked in the active sector, at its derelict', async () => {
    await setUp();
    await at('Derelict Starship');

    // It was { nearestLocationId: 'site-old-actor', sectorId: 'sec-old' }.
    expect(ship.flags[MODULE_ID].ship.position).toMatchObject({ nearestLocationId: 'site-new-actor', sectorId: 'sec-new', updatedBy: 'at_command' });
  }, 30_000);

  it('the token that moves is the active sector\'s, not the one on the older sector\'s map', async () => {
    await setUp();
    await at('Derelict Starship');

    expect(oldToken.update).not.toHaveBeenCalled();
    expect(newToken.update).toHaveBeenCalledWith({ x: SITE_XY.x, y: SITE_XY.y }, { sfcPositionSync: true });
  }, 30_000);

  it('`!at` docks the ship at the place it set as the current location, not at the typed fragment', async () => {
    await setUp();
    await at('Bleak');

    expect(table.world.campaignState().currentLocationId).toBe('actor-bleak');
    // The position was re-inferred from "Bleak": free text, no place (known-issues AT-PARTIAL-NAME-SHIP).
    expect(ship.flags[MODULE_ID].ship.position).toMatchObject({ nearestSettlementId: 'actor-bleak', updatedBy: 'at_command' });
    expect(newToken.update).toHaveBeenCalledWith({ x: SETTLE_XY.x, y: SETTLE_XY.y }, { sfcPositionSync: true });
  }, 30_000);

  it('control: with the older sector active, its own namesake is the one named', async () => {
    await setUp({ activeSectorId: 'sec-old' });
    await at('Derelict Starship');

    expect(table.world.campaignState().currentLocationId).toBe('site-old-actor');
    expect(ship.flags[MODULE_ID].ship.position).toMatchObject({ nearestLocationId: 'site-old-actor', sectorId: 'sec-old' });
    expect(newToken.update).not.toHaveBeenCalled();
  }, 30_000);

  it('control: the site ladder already takes the active sector\'s namesake first (issue #321 U48)', async () => {
    await setUp();
    const { selectSectorSite } = await import('../../src/sectors/precursorSites.js');
    const sectors = table.world.campaignState().sectors;
    const hit = selectSectorSite(sectors, 'Derelict Starship', { eligible: () => true, activeSectorId: 'sec-new' });
    expect(hit?.site.id).toBe('site-new');
  }, 30_000);
});

describe('every arrival by name takes the active sector\'s namesake', () => {
  const roster = [
    { _id: 'rec-old', journalId: 'site-old-actor', name: 'Derelict Starship', entityType: 'location', sectorId: 'sec-old' },
    { _id: 'rec-new', journalId: 'site-new-actor', name: 'Derelict Starship', entityType: 'location', sectorId: 'sec-new' },
    { _id: 'rec-hold', journalId: 'actor-hold', name: 'Hollow Hold', entityType: 'settlement', sectorId: 'sec-old' },
  ];

  it('the narrator\'s ship / position emission (inferShipPosition) docks in the active sector', () => {
    const p = inferShipPosition('Derelict Starship', { activeSectorId: 'sec-new' }, { source: 'narrator_sidecar', entities: roster });
    // It was the older sector's: { nearestLocationId: 'site-old-actor', sectorId: 'sec-old' }.
    expect(p).toMatchObject({ nearestLocationId: 'site-new-actor', sectorId: 'sec-new' });
  });

  it('control: a name only one sector has, and no active sector, resolve as before', () => {
    expect(inferShipPosition('Hollow Hold', { activeSectorId: 'sec-new' }, { entities: roster }).nearestSettlementId).toBe('actor-hold');
    expect(inferShipPosition('Derelict Starship', {}, { entities: roster }).nearestLocationId).toBe('site-old-actor');
  });

  it('resolveCurrentLocationName takes the active sector\'s namesake on the exact and the prefix rungs', async () => {
    await setUp();
    const cs = table.world.campaignState();
    await table.client('gm-1').run(() => {
      expect(resolveCurrentLocationName('Derelict Starship', cs)?.id).toBe('site-new-actor');
      expect(resolveCurrentLocationName('derelict', cs)?.id).toBe('site-new-actor');
      expect(resolveCurrentLocationName('Derelict Starship', { ...cs, activeSectorId: 'sec-old' })?.id).toBe('site-old-actor');
    });
  }, 30_000);
});
