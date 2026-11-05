/**
 * A charted site's map pin anchors the ship's position, both ways
 * (issue #335 Y14, SITE-PINS-NOT-POSITION-ANCHORS).
 *
 * (a) The GM drags the ship's token onto a charted derelict's pin: the drop is
 * a position note (sites are reached by expedition, never a Set a Course), and
 * its record named no place — only a settlement pin within the near radius
 * counted, and site slots sit five or more cells off the cluster — so the
 * narrator read "deep space" while the map showed the ship on the derelict.
 * (b) An arrival at a site (Finish an Expedition, `!at`, the Entities panel's
 * "Set as current location", the narrator's ship/position emission, the
 * X-Card's restore) writes a `nearestLocationId` record (issue #326 W65), but
 * the fiction→token sync returned before looking for a pin unless the record
 * named a settlement, so the token stayed on the settlement it left.
 *
 * The site pin carries the site's location Actor id (`flags.actorId`), the id
 * the W65 record names (decisions.md "Ship position: a sector-map token is
 * authoritative when present"). An UNDISCOVERED pin names no place: its name
 * is not yet the table's.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import {
  computeTokenPositionRecord,
  syncCommandVehicleTokenToPosition,
  handleCommandVehicleTokenDrag,
} from '../../src/sectors/sectorSceneHooks.js';
import { formatShipPositionLine } from '../../src/factContinuity/shipPosition.js';
import { restoreShipPositionAfterXCard } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const GRID = 100;

// The pins createSectorScene writes (sceneBuilder.js): a settlement pin and a
// site pin, with the flags it stamps on each.
function settlementNote(id, actorId, gridX, gridY, name) {
  return {
    id, x: gridX * GRID, y: gridY * GRID, text: name,
    flags: { [MODULE_ID]: { sectorNote: true, settlementId: id, actorId, locationType: 'orbital' } },
  };
}
function siteNote(siteId, actorId, gridX, gridY, { discovered, name }) {
  return {
    id: `note-${siteId}`, x: gridX * GRID, y: gridY * GRID,
    text: discovered ? name : 'Unexplored Site',
    flags: { [MODULE_ID]: { sectorNote: true, siteNote: true, siteId, actorId, siteType: 'derelict', discovered } },
  };
}
function makeScene({ notes, token = null }) {
  return {
    id: 'scene-1', grid: { size: GRID },
    flags: { [MODULE_ID]: { sectorScene: true, sectorId: 'sec-1' } },
    notes: { contents: notes },
    tokens: { contents: token ? [token] : [] },
  };
}
function makeToken(x, y) {
  return {
    id: 'tok-ship', x, y,
    flags: { [MODULE_ID]: { commandVehicle: true } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }),
  };
}

// Bleakhold at grid (3, 2) — the cluster; the derelict at SITE_SLOTS[0], grid (14, 1).
const BLEAKHOLD = settlementNote('gen-A', 'actor-bleak', 3, 2, 'Bleakhold');
const SITE_XY   = { x: 14 * GRID, y: 1 * GRID };
const state     = { sectors: [{ id: 'sec-1', name: 'Outlands Mark' }], activeSectorId: 'sec-1', locationIds: ['actor-site'], settlementIds: ['actor-bleak'] };

let prevScenes;
beforeEach(() => {
  prevScenes = global.game.scenes;
  game.actors._reset();
  game.actors._set('actor-site', makeTestActor({
    id: 'actor-site', type: 'location', name: 'Derelict Starship',
    flags: { [MODULE_ID]: { entityType: 'location', location: { _id: 'rec-site', name: 'Derelict Starship', type: 'derelict', sectorId: 'sec-1' } } },
  }));
  game.actors._set('actor-bleak', makeTestActor({
    id: 'actor-bleak', type: 'location', name: 'Bleakhold',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold', sectorId: 'sec-1' } } },
  }));
});
afterEach(() => { global.game.scenes = prevScenes; });

describe('(a) the ship token dropped on a charted site pin', () => {
  it('records the site as the position, as the map shows it', () => {
    const scene = makeScene({ notes: [BLEAKHOLD, siteNote('site-1', 'actor-site', 14, 1, { discovered: true, name: 'Derelict Starship' })] });

    const p = computeTokenPositionRecord(scene, SITE_XY.x, SITE_XY.y);

    expect(p.nearestSettlementId).toBeNull();
    // The charted site's location Actor — the id its pin carries, the id a
    // W65 record names. It was no place at all, freeText "deep space".
    expect(p.nearestLocationId).toBe('actor-site');
    expect(p.freeText).toBe('Derelict Starship');
    expect(p.updatedBy).toBe('token_placement');
    expect(formatShipPositionLine(p, state, 'Wayfinder')).toBe('SHIP POSITION: Wayfinder near Derelict Starship (Outlands Mark)');
  });

  it('a token parked two cells off the charted pin reads near the site', () => {
    const scene = makeScene({ notes: [BLEAKHOLD, siteNote('site-1', 'actor-site', 14, 1, { discovered: true, name: 'Derelict Starship' })] });
    const p = computeTokenPositionRecord(scene, SITE_XY.x, SITE_XY.y + 2 * GRID);
    expect(p.nearestLocationId).toBe('actor-site');
    expect(p.nearestSettlementId).toBeNull();
  });

  it('is still not a Set a Course: the drop on a site pin is a plain token move (sites are reached by expedition)', () => {
    const scene = makeScene({ notes: [BLEAKHOLD, siteNote('site-1', 'actor-site', 14, 1, { discovered: true, name: 'Derelict Starship' })] });
    const result = handleCommandVehicleTokenDrag(
      { flags: { [MODULE_ID]: { commandVehicle: true } }, x: BLEAKHOLD.x, y: BLEAKHOLD.y, parent: scene },
      { x: SITE_XY.x, y: SITE_XY.y },
      {},
    );
    expect(result).toBeUndefined();   // not cancelled — no forced set_a_course
  });

  it('a record off a site still writes nearestLocationId (null): setFlag merges key by key, so an earlier arrival\'s location would survive', () => {
    const scene = makeScene({ notes: [BLEAKHOLD, siteNote('site-1', 'actor-site', 14, 1, { discovered: true, name: 'Derelict Starship' })] });
    expect(computeTokenPositionRecord(scene, BLEAKHOLD.x, BLEAKHOLD.y)).toHaveProperty('nearestLocationId', null);
    expect(computeTokenPositionRecord(scene, 8 * GRID, 9 * GRID)).toHaveProperty('nearestLocationId', null);
  });

  it('control: an undiscovered site pin stays honest deep space and leaks no name', () => {
    const scene = makeScene({ notes: [BLEAKHOLD, siteNote('site-1', 'actor-site', 14, 1, { discovered: false, name: 'Derelict Starship' })] });
    const p = computeTokenPositionRecord(scene, SITE_XY.x, SITE_XY.y);
    expect(p.nearestSettlementId).toBeNull();
    expect(p.nearestLocationId ?? null).toBeNull();
    expect(p.freeText).toBe('deep space');
    expect(JSON.stringify(p)).not.toContain('Derelict Starship');
  });

  it('control: a token parked beside the settlement pin reads near it', () => {
    const scene = makeScene({ notes: [BLEAKHOLD] });
    const p = computeTokenPositionRecord(scene, BLEAKHOLD.x + GRID, BLEAKHOLD.y);
    expect(p.nearestSettlementId).toBe('actor-bleak');
    expect(p.nearestLocationId ?? null).toBeNull();
    expect(p.freeText).toBe('Bleakhold');
  });
});

describe('(b) the map follows an arrival at a charted site', () => {
  const sitePosition = {
    sectorId: 'sec-1', nearestSettlementId: null, nearestPlanetId: null,
    nearestLocationId: 'actor-site', freeText: 'Derelict Starship',
    updatedAt: 1, updatedBy: 'expedition',   // a Finish an Expedition arrival ("docked at")
  };

  it('moves the command-vehicle token onto the site pin', async () => {
    const token = makeToken(BLEAKHOLD.x, BLEAKHOLD.y);
    const scene = makeScene({ notes: [BLEAKHOLD, siteNote('site-1', 'actor-site', 14, 1, { discovered: true, name: 'Derelict Starship' })], token });
    global.game.scenes = { contents: [scene] };

    const moved = await syncCommandVehicleTokenToPosition(sitePosition, state);

    // The token snaps to the derelict's pin (the fiction→token sync the
    // settlement arrival gets). It returned null and sat on Bleakhold.
    expect(moved).toBe(token);
    expect(token.update).toHaveBeenCalledWith({ x: SITE_XY.x, y: SITE_XY.y }, { sfcPositionSync: true });
  });

  it('follows an arrival at a site not yet charted — the Finish an Expedition that charts it records its arrival before the reveal flips the pin — and the pin keeps its label', async () => {
    const token = makeToken(BLEAKHOLD.x, BLEAKHOLD.y);
    const pin   = siteNote('site-1', 'actor-site', 14, 1, { discovered: false, name: 'Derelict Starship' });
    const scene = makeScene({ notes: [BLEAKHOLD, pin], token });
    global.game.scenes = { contents: [scene] };

    expect(await syncCommandVehicleTokenToPosition(sitePosition, state)).toBe(token);
    expect(token.update).toHaveBeenCalledWith({ x: SITE_XY.x, y: SITE_XY.y }, { sfcPositionSync: true });
    expect(pin.text).toBe('Unexplored Site');
  });

  it('control: a settlement arrival moves the token onto the settlement pin', async () => {
    const token = makeToken(SITE_XY.x, SITE_XY.y);
    const scene = makeScene({ notes: [BLEAKHOLD, siteNote('site-1', 'actor-site', 14, 1, { discovered: true, name: 'Derelict Starship' })], token });
    global.game.scenes = { contents: [scene] };

    const moved = await syncCommandVehicleTokenToPosition(
      { ...sitePosition, nearestSettlementId: 'actor-bleak', nearestLocationId: null, freeText: '', updatedBy: 'set_a_course' }, state,
    );
    expect(moved).toBe(token);
    expect(token.update).toHaveBeenCalledWith({ x: BLEAKHOLD.x, y: BLEAKHOLD.y }, { sfcPositionSync: true });
  });

  it('control: a free-text position still leaves the token where it is', async () => {
    const token = makeToken(BLEAKHOLD.x, BLEAKHOLD.y);
    const scene = makeScene({ notes: [BLEAKHOLD, siteNote('site-1', 'actor-site', 14, 1, { discovered: true, name: 'Derelict Starship' })], token });
    global.game.scenes = { contents: [scene] };

    const moved = await syncCommandVehicleTokenToPosition(
      { ...sitePosition, nearestLocationId: null, freeText: 'drifting in the graveyard' }, state,
    );
    expect(moved).toBeNull();
    expect(token.update).not.toHaveBeenCalled();
  });
});

describe('(b) the X-Card puts the token back on a site it restores the ship to', () => {
  it('a removed narration moved the ship off the site: the restore moves the token back onto the site pin', async () => {
    const token = makeToken(BLEAKHOLD.x, BLEAKHOLD.y);
    const scene = makeScene({ notes: [BLEAKHOLD, siteNote('site-1', 'actor-site', 14, 1, { discovered: true, name: 'Derelict Starship' })], token });
    global.game.scenes = { contents: [scene] };

    const atSite = {
      sectorId: 'sec-1', nearestSettlementId: null, nearestPlanetId: null,
      nearestLocationId: 'actor-site', freeText: 'Derelict Starship', updatedAt: 1, updatedBy: 'expedition',
    };
    game.actors._set('actor-ship', makeTestActor({
      id: 'actor-ship', type: 'starship', name: 'Wayfinder',
      flags: { [MODULE_ID]: { entityType: 'ship', ship: {
        _id: 'rec-ship', name: 'Wayfinder', isCommandVehicle: true,
        // The removed narration moved the ship to Bleakhold, from the site.
        position: { sectorId: 'sec-1', nearestSettlementId: 'actor-bleak', nearestPlanetId: null, nearestLocationId: null,
          freeText: '', updatedAt: 2, updatedBy: 'narrator_sidecar', narrationId: 'nar-1', previous: atSite },
      } } },
    }));

    expect(await restoreShipPositionAfterXCard(['nar-1'], { ...state, shipIds: ['actor-ship'] })).toBe(true);

    expect(game.actors.get('actor-ship').flags[MODULE_ID].ship.position.nearestLocationId).toBe('actor-site');
    // The token followed the ship back: the restore synced only a settlement
    // or planet position, so the map kept the removed beat's Bleakhold.
    expect(token.update).toHaveBeenCalledWith({ x: SITE_XY.x, y: SITE_XY.y }, { sfcPositionSync: true });
  });
});

// rules/reachability.md §3 — the live wire: the GM's `!at` (the real chat
// command) → the ship record (maybeUpdateShipPositionFromName) → the token sync.
describe('composition: `!at` a charted site docks the ship there and its token follows', () => {
  let table;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => { table?.scenes.delete('scene-1'); table?.teardown(); });

  it('the ship record names the site and the token moves onto its pin', async () => {
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema, sessionActive: true,
      sectors: [{ id: 'sec-1', name: 'Outlands Mark' }], activeSectorId: 'sec-1',
      settlementIds: ['actor-bleak'], locationIds: ['actor-site'], shipIds: ['ship-cv'],
    } } } });
    const ship = table.addActor({
      id: 'ship-cv', type: 'starship', name: 'Wayfinder',
      flags: { [MODULE_ID]: { entityType: 'ship', ship: { _id: 'rec-ship', name: 'Wayfinder', isCommandVehicle: true } } },
    });
    table.addActor({
      id: 'actor-site', type: 'location', name: 'Derelict Starship',
      flags: { [MODULE_ID]: { entityType: 'location', location: { _id: 'rec-site', name: 'Derelict Starship', type: 'derelict', sectorId: 'sec-1' } } },
    });
    table.addActor({
      id: 'actor-bleak', type: 'location', name: 'Bleakhold',
      flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold', sectorId: 'sec-1' } } },
    });
    const token = makeToken(BLEAKHOLD.x, BLEAKHOLD.y);
    table.scenes.set('scene-1', makeScene({
      notes: [BLEAKHOLD, siteNote('site-1', 'actor-site', 14, 1, { discovered: true, name: 'Derelict Starship' })], token,
    }));

    await table.client('gm-1').chat('!at Derelict Starship');
    await table.settle();

    expect(table.world.campaignState().currentLocationId).toBe('actor-site');
    expect(ship.flags[MODULE_ID].ship.position).toMatchObject({ nearestLocationId: 'actor-site', updatedBy: 'at_command' });
    // The token left Bleakhold for the derelict's pin; it stayed on Bleakhold.
    expect(token.update).toHaveBeenCalledWith({ x: SITE_XY.x, y: SITE_XY.y }, { sfcPositionSync: true });
  }, 30_000);
});
