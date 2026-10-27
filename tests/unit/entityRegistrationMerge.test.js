/**
 * STARFORGED COMPANION
 * tests/unit/entityRegistrationMerge.test.js
 *
 * Issue #300 F14 (CREATE-PERSIST-WHOLE). An entity creator registered its new
 * id by writing the caller's whole campaignState back. Creators run inside
 * long-lived callers — the move pipeline's Make a Connection auto-create, a
 * vow card's connection prompt, sector creation, a portrait finishing — whose
 * copy predates writes relayed meanwhile, so the write reverted them: an
 * X-Card played during the narration came back cleared. Each registration now
 * lands on the latest stored campaignState and touches only its own list.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createConnection } from '../../src/entities/connection.js';
import { createSettlement } from '../../src/entities/settlement.js';
import { createPlanet } from '../../src/entities/planet.js';
import { createLocation } from '../../src/entities/location.js';
import { createShip } from '../../src/entities/ship.js';
import { createCreature } from '../../src/entities/creature.js';
import { createFaction } from '../../src/entities/faction.js';
import { storeArtAsset } from '../../src/art/storage.js';
import { storeSector } from '../../src/sectors/sectorGenerator.js';
import { _resetFolderCache } from '../../src/entities/folder.js';

const MODULE_ID = 'starforged-companion';

const stored = () => game.settings._store.get(`${MODULE_ID}.campaignState`);

/** What the GM relay wrote while the caller held its copy. */
const RELAYED = {
  xCardActive: true,
  safetyFlags: [{ text: 'No spiders', visibility: 'table' }],
  nextMoveAdd: { value: 1, source: 'take_a_break' },
};

beforeEach(() => {
  game.actors._reset();
  game.folders._reset?.();
  _resetFolderCache();
  game.settings._store.clear();
});

/** The caller's copy, read before the relay; the store then gains RELAYED and one id of its own. */
function staleCopyAndRelay(listKey) {
  const copy = { xCardActive: false, safetyFlags: [], [listKey]: [] };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { ...copy, ...RELAYED, [listKey]: ['id-from-store'] });
  return copy;
}

describe.each([
  ['createConnection', 'connectionIds', (cs) => createConnection({ name: 'Vex', role: 'fixer' }, cs)],
  ['createSettlement', 'settlementIds', (cs) => createSettlement({ name: 'Bleakhold' }, cs)],
  ['createPlanet',     'planetIds',     (cs) => createPlanet({ name: 'Cinderworld' }, cs)],
  ['createLocation',   'locationIds',   (cs) => createLocation({ name: 'The Spire', type: 'derelict' }, cs)],
  ['createShip',       'shipIds',       (cs) => createShip({ name: 'Wayfarer' }, cs)],
  ['createCreature',   'creatureIds',   (cs) => createCreature({ name: 'Ember wisp' }, cs)],
  ['createFaction',    'factionIds',    (cs) => createFaction({ name: 'The Lattice' }, cs)],
])('%s', (_name, listKey, create) => {
  it('keeps what was relayed meanwhile and registers the new id on the store', async () => {
    const copy = staleCopyAndRelay(listKey);
    await create(copy);

    expect(copy[listKey]).toHaveLength(1);
    const newId = copy[listKey][0];
    expect(stored()).toMatchObject(RELAYED);
    expect(stored()[listKey]).toEqual(['id-from-store', newId]);
  });
});

describe('storeArtAsset', () => {
  it('adds its index entry to the store without reverting relayed writes', async () => {
    const copy = { xCardActive: false, artAssetIds: {} };
    game.settings._store.set(`${MODULE_ID}.campaignState`, { ...RELAYED, artAssetIds: { other: 'Art: other' } });

    await storeArtAsset({ _id: 'asset-1', entityType: 'connection', entityId: 'c-1' }, copy);

    expect(stored()).toMatchObject(RELAYED);
    expect(stored().artAssetIds).toEqual({ other: 'Art: other', 'asset-1': 'Art: connection c-1 asset-1' });
    expect(copy.artAssetIds['asset-1']).toBe('Art: connection c-1 asset-1');
  });
});

describe('storeSector', () => {
  it('writes the sector, the active sector and its entity ids onto the latest store', async () => {
    const sector = {
      id: 'sec-1', name: "Devil's Maw", region: 'terminus', regionLabel: 'Terminus', trouble: null, faction: null,
      settlements: [], createdAt: new Date().toISOString(),
      mapData: { sectorId: 'sec-1', gridWidth: 10, gridHeight: 8, settlements: [], passages: [], discoveries: [] },
    };
    // Sector creation's copy: the stub and the ids its creators pushed (persist: false).
    const copy = { xCardActive: false, sectors: [{ id: 'sec-1', name: "Devil's Maw" }], settlementIds: ['set-new'], connectionIds: ['conn-new'] };
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      ...RELAYED, sectors: [{ id: 'sec-0', name: 'Old Reach' }], connectionIds: ['conn-store'], activeSectorId: 'sec-0',
    });

    await storeSector(sector, { settlements: {}, connectionJournalId: 'conn-new' }, copy);

    expect(stored()).toMatchObject(RELAYED);
    expect(stored().sectors.map(s => s.id)).toEqual(['sec-0', 'sec-1']);
    expect(stored().sectors[1].region).toBe('terminus');
    expect(stored().activeSectorId).toBe('sec-1');
    expect(stored().connectionIds).toEqual(['conn-store', 'conn-new']);
    expect(stored().settlementIds).toEqual(['set-new']);
    // The caller's copy is still updated in place.
    expect(copy.sectors).toHaveLength(1);
    expect(copy.activeSectorId).toBe('sec-1');
  });
});
