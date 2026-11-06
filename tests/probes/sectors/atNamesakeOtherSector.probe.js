/**
 * SECT-3 — `!at` (and every arrival by name) docks the ship at the OLDER
 * sector's namesake of a site in the active sector.
 *
 * Generated site names repeat across sectors — every derelict is "Derelict
 * Starship" or "Derelict Settlement" (precursorSites.js generateDerelictSite;
 * Roman numerals only within one sector) — which is why the site ladder tries
 * the active sector first on every rung (issue #321 U48), and why a token-drop
 * Set a Course arrives by the pin's Actor id, not "a namesake in another sector
 * [that] matches first" (issue #321 U52, index.js applyOutcomeEffects). The
 * name resolvers the arrivals use do neither: resolveCurrentLocationName takes
 * the first exact name in `locationIds` order and inferShipPosition's index
 * keeps the first entity of a full name — both the OLDER sector's. Since issue
 * #335 Y14 the sync follows that record's `nearestLocationId` too, so the GM's
 * `!at Derelict Starship` in the new sector sets the current location to the
 * old sector's derelict, puts SHIP POSITION in the old sector, and moves the
 * ship's token on the OLD sector's map.
 *
 * Production wiring: the GM's real `!at` chat command on the multi-client
 * harness (the Y14 composition test's shape).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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
function makeToken() {
  return {
    id: 'tok-ship', x: SETTLE_XY.x, y: SETTLE_XY.y,
    flags: { [MODULE_ID]: { commandVehicle: true } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }),
  };
}
function sectorScene(id, sectorId, siteId, actorId, token) {
  return {
    id, grid: { size: GRID },
    flags: { [MODULE_ID]: { sectorScene: true, sectorId } },
    notes: { contents: [sitePin(siteId, actorId)] },
    tokens: { contents: [token] },
  };
}

let table;
let ship;
let oldToken;
let newToken;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => { table?.scenes.delete('scene-old'); table?.scenes.delete('scene-new'); table?.teardown(); });

async function setUp() {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true,
    sectors: [
      { id: 'sec-old', name: 'Devil\'s Reach', region: 'terminus', mapData: { discoveries: [{ id: 'site-old', name: 'Derelict Starship', type: 'derelict', discovered: true, actorId: 'site-old-actor' }] } },
      { id: 'sec-new', name: 'Outlands Mark',  region: 'outlands', mapData: { discoveries: [{ id: 'site-new', name: 'Derelict Starship', type: 'derelict', discovered: true, actorId: 'site-new-actor' }] } },
    ],
    // The crew moved on to the newer sector.
    activeSectorId: 'sec-new',
    // Each creation appends its site Actors: the older sector's first.
    locationIds: ['site-old-actor', 'site-new-actor'], shipIds: ['ship-cv'],
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
  oldToken = makeToken();
  newToken = makeToken();
  table.scenes.set('scene-old', sectorScene('scene-old', 'sec-old', 'site-old', 'site-old-actor', oldToken));
  table.scenes.set('scene-new', sectorScene('scene-new', 'sec-new', 'site-new', 'site-new-actor', newToken));
}

describe('SECT-3: `!at <site>` in the active sector names the active sector\'s site', () => {
  it('the current location is the active sector\'s Derelict Starship', async () => {
    await setUp();
    await table.client('gm-1').chat('!at Derelict Starship');
    await table.settle();

    // The command ran and set a location (the setup is real)…
    expect(table.world.campaignState().currentLocationType).toBe('location');
    // …the older sector's namesake.
    expect(table.world.campaignState().currentLocationId).toBe('site-new-actor');   // actual: 'site-old-actor'
  }, 30_000);

  it('the ship is docked in the active sector, at its derelict', async () => {
    await setUp();
    await table.client('gm-1').chat('!at Derelict Starship');
    await table.settle();

    // actual: { nearestLocationId: 'site-old-actor', sectorId: 'sec-old' }
    expect(ship.flags[MODULE_ID].ship.position).toMatchObject({ nearestLocationId: 'site-new-actor', sectorId: 'sec-new' });
  }, 30_000);

  it('the token that moves is the active sector\'s, not the one on the older sector\'s map', async () => {
    await setUp();
    await table.client('gm-1').chat('!at Derelict Starship');
    await table.settle();

    expect(oldToken.update).not.toHaveBeenCalled();   // actual: moved onto the old map's derelict
    expect(newToken.update).toHaveBeenCalledWith({ x: SITE_XY.x, y: SITE_XY.y }, { sfcPositionSync: true });
  }, 30_000);

  it('control: the site ladder already takes the active sector\'s namesake first (issue #321 U48)', async () => {
    const { selectSectorSite } = await import('../../../src/sectors/precursorSites.js');
    const sectors = table.world.campaignState().sectors;
    const hit = selectSectorSite(sectors, 'Derelict Starship', { eligible: () => true, activeSectorId: 'sec-new' });
    expect(hit?.site.id).toBe('site-new');
  });
});
