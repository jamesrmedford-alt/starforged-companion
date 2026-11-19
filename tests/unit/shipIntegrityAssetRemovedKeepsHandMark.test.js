/* global makeTestActor */
/**
 * STARFORGED COMPANION
 * tests/unit/shipIntegrityAssetRemovedKeepsHandMark.test.js
 *
 * Issue #364 STARSHIP-ASSET-REMOVED-LOSES-HAND-MARK (left open by issue #362
 * AC25).
 *
 * While a starship carries the STARSHIP asset, the asset's Integrity track is
 * the integrity (canonical since issue #345 AA20); the ship record's
 * `integrity` is its mirror, brought to the track's value on every module
 * write. A value marked on the track by hand — damage, or a repair, ticked on
 * the sheet — reaches the record only at the next module write. When the
 * asset is removed, the record becomes the store again (AC25): the
 * deleteItem hook's sync cleared the stamp and left the record at the
 * integrity of the last module write, so the hand-marked value went with the
 * asset.
 *
 * The sync is now handed the asset the hook saw, and — the starship carrying
 * no track any more — writes the value that track last showed onto the
 * record in the write that clears the stamp.
 *
 * Real path: registerStarshipActorLight, changeIntegrity,
 * syncCommandVehicleFlag (shipIntegrityAssetAddedLater.test.js's harness),
 * and — for the wiring hop — index.js's deleteItem hook on a booted table.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  registerStarshipActorLight, changeIntegrity, syncCommandVehicleFlag, getShip,
} from '../../src/entities/ship.js';
import { readCommandVehicleAssetTrack } from '../../src/character/actorBridge.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';

/** The vendor STARSHIP asset as the compendium holds it. */
function starshipAsset(parent, { value = 5, id = 'asset-starship' } = {}) {
  const item = {
    id, type: 'asset', name: 'Starship', parent,
    system: {
      category: 'Command Vehicle',
      track: { enabled: true, name: 'Integrity', max: 5, min: 0, value },
      conditions: [{ name: 'Battered', ticked: false }, { name: 'Cursed', ticked: false }],
    },
    flags: {},
    async update(changes) {
      for (const [path, val] of Object.entries(changes)) {
        const parts = path.split('.');
        let target = item;
        for (let i = 0; i < parts.length - 1; i++) target = (target[parts[i]] ??= {});
        target[parts.at(-1)] = val;
      }
      return item;
    },
  };
  return item;
}

const recordOf = (ship) => ship.flags[MODULE_ID].ship;

describe('issue #364 STARSHIP-ASSET-REMOVED-LOSES-HAND-MARK — the sync keeps what the removed track last showed', () => {
  const stored = () => game.settings.get(MODULE_ID, 'campaignState');
  const notices = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.shipIntegrityReconciledNotice);

  let savedUsers, savedUser;
  beforeEach(() => {
    game.actors._reset();
    game.settings._store.clear();
    ChatMessage._reset?.();
    savedUsers = game.users; savedUser = game.user;
    const gm = { id: 'gm-1', isGM: true, active: true };
    game.users = Object.assign([gm], { get: (id) => (id === 'gm-1' ? gm : null) });
    game.user = gm;
    game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: [], characterIds: [] });
  });
  afterEach(() => { game.users = savedUsers; game.user = savedUser; });

  /** A starship registered beside its STARSHIP asset (born reconciled with the track). */
  async function starshipWithAsset(opts) {
    const ship = makeTestActor({ id: 'ship-1', type: 'starship', name: 'Wayfarer', system: { debility: {}, notes: '' } });
    const asset = starshipAsset(ship, opts);
    ship.items.contents.push(asset);
    game.actors._set('ship-1', ship);
    await registerStarshipActorLight(ship, foundry.utils.deepClone(stored()));
    return { ship, asset };
  }

  /** The asset dragged off the sheet, then the deleteItem hook's sync (index.js registerCommandVehicleHook). */
  async function removeAsset(ship, asset) {
    ship.items.contents.splice(ship.items.contents.indexOf(asset), 1);
    return syncCommandVehicleFlag(ship, foundry.utils.deepClone(stored()), { changedAsset: asset });
  }

  it('control: the removed asset\'s own track is read off the Item — and no other Item\'s', () => {
    expect(readCommandVehicleAssetTrack(starshipAsset(null, { value: 3 }))).toEqual({ value: 3, min: 0, max: 5 });
    const module = starshipAsset(null);
    module.system.category = 'Module';
    expect(readCommandVehicleAssetTrack(module)).toBeNull();
    const untracked = starshipAsset(null);
    untracked.system.track.enabled = false;
    expect(readCommandVehicleAssetTrack(untracked)).toBeNull();
    expect(readCommandVehicleAssetTrack(null)).toBeNull();
  });

  it('control: removed with nothing marked by hand since, the record holds the module\'s last write and is the store again', async () => {
    const { ship, asset } = await starshipWithAsset();
    await changeIntegrity('ship-1', -3);   // 2/5 on the track and its mirror
    await removeAsset(ship, asset);
    expect(recordOf(ship)).toMatchObject({ isCommandVehicle: false, integrity: 2, integrityMax: 5, integritySheetReconciled: false });
  });

  it('damage marked on the track by hand since the last module write stays on the record when the asset is removed', async () => {
    const { ship, asset } = await starshipWithAsset();
    expect(recordOf(ship).integrity, 'the mirror (setup)').toBe(5);
    asset.system.track.value = 3;          // ticked on the sheet: no module write follows
    expect(recordOf(ship).integrity, 'the mirror is stale until a module write (setup)').toBe(5);

    await removeAsset(ship, asset);

    // It was 5 — the last module write: the two marks went with the asset.
    expect(recordOf(ship).integrity, 'the record after the asset is removed').toBe(3);
    expect(recordOf(ship)).toMatchObject({ isCommandVehicle: false, integritySheetReconciled: false });
    expect(getShip('ship-1').integrity, 'what every reader is given').toBe(3);
  });

  it('a repair marked by hand is kept too', async () => {
    const { ship, asset } = await starshipWithAsset();
    await changeIntegrity('ship-1', -4);   // 1/5 by the module
    asset.system.track.value = 4;          // repaired on the sheet
    await removeAsset(ship, asset);
    expect(recordOf(ship).integrity).toBe(4);
  });

  it('…and a fresh asset added later is reconciled with that value: the lower into both stores, the GM told', async () => {
    const { ship, asset } = await starshipWithAsset();
    asset.system.track.value = 3;
    await removeAsset(ship, asset);

    const again = starshipAsset(ship, { id: 'asset-starship-2' });   // from the compendium: 5/5
    ship.items.contents.push(again);
    await syncCommandVehicleFlag(ship, foundry.utils.deepClone(stored()), { changedAsset: again });

    expect({ record: recordOf(ship).integrity, sheet: again.system.track.value }).toEqual({ record: 3, sheet: 3 });
    expect(recordOf(ship)).toMatchObject({ isCommandVehicle: true, integritySheetReconciled: true });
    expect(notices()).toHaveLength(1);
  });

  /** A record never reconciled with the track its ship carries (issue #347 AB08's shape). */
  function unreconciledShip(recordIntegrity, trackValue) {
    const ship = makeTestActor({
      id: 'ship-1', type: 'starship', name: 'Wayfarer', system: { debility: {}, notes: '' },
      flags: { [MODULE_ID]: { entityType: 'ship', entityId: 'guid', ship: {
        _id: 'guid', name: 'Wayfarer', integrity: recordIntegrity, integrityMax: 5, isCommandVehicle: true, integritySheetReconciled: false,
      } } },
    });
    const asset = starshipAsset(ship, { value: trackValue });
    ship.items.contents.push(asset);
    game.actors._set('ship-1', ship);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: ['ship-1'], characterIds: [] });
    return { ship, asset };
  }

  it('a record never reconciled with the removed track keeps the lower of the two, as its readers did — the track\'s', async () => {
    const { ship, asset } = unreconciledShip(4, 3);
    expect(getShip('ship-1').integrity, 'read as the lower before any write (setup)').toBe(3);
    await removeAsset(ship, asset);
    expect(recordOf(ship)).toMatchObject({ integrity: 3, integritySheetReconciled: false });
  });

  it('control: …or its own, when that is the lower', async () => {
    const { ship, asset } = unreconciledShip(2, 5);
    expect(getShip('ship-1').integrity).toBe(2);
    await removeAsset(ship, asset);
    expect(recordOf(ship)).toMatchObject({ integrity: 2, integritySheetReconciled: false });
  });

  it('control: an asset added is not read as one removed — the arrival reconciles as before', async () => {
    const ship = makeTestActor({ id: 'ship-1', type: 'starship', name: 'Wayfarer', system: { debility: {}, notes: '' } });
    game.actors._set('ship-1', ship);
    await registerStarshipActorLight(ship, foundry.utils.deepClone(stored()));
    await changeIntegrity('ship-1', -3);   // record 2/5, no asset

    const asset = starshipAsset(ship);     // 5/5
    ship.items.contents.push(asset);
    await syncCommandVehicleFlag(ship, foundry.utils.deepClone(stored()), { changedAsset: asset });

    expect({ record: recordOf(ship).integrity, sheet: asset.system.track.value }).toEqual({ record: 2, sheet: 2 });
  });

  it('control: one of two STARSHIP assets removed — the ship still carries a track, which stays the integrity', async () => {
    const { ship, asset } = await starshipWithAsset();
    const second = starshipAsset(ship, { id: 'asset-starship-2', value: 1 });
    ship.items.contents.push(second);
    await removeAsset(ship, second);
    expect(getShip('ship-1').integrity).toBe(asset.system.track.value);
    expect(recordOf(ship).integrity, 'not the removed asset\'s value').not.toBe(1);
  });
});

describe('issue #364 STARSHIP-ASSET-REMOVED-LOSES-HAND-MARK — the deleteItem hook hands the removed asset to the sync', () => {
  let table;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: {
      campaignState: { ...CampaignStateSchema, shipIds: ['ship-1'] },
    } } });
  });

  function seedShip() {
    const ship = table.addActor({
      id: 'ship-1', type: 'starship', name: 'Wayfarer', system: { debility: { battered: false, cursed: false }, notes: '' },
      flags: { [MODULE_ID]: { entityType: 'ship', entityId: 'guid', ship: {
        _id: 'guid', name: 'Wayfarer', integrity: 5, integrityMax: 5, isCommandVehicle: true, integritySheetReconciled: true,
      } } },
    });
    const asset = starshipAsset(ship);
    ship.items.contents.push(asset);
    return { ship, asset };
  }

  it('a GM removes the STARSHIP asset after damage was ticked on its track: the record keeps 2/5', async () => {
    const { ship, asset } = seedShip();
    asset.system.track.value = 2;   // ticked on the sheet since the module's last write (5)

    // Foundry: the Item is gone from its parent's collection when deleteItem fires, and still names its parent.
    ship.items.contents.splice(ship.items.contents.indexOf(asset), 1);
    table.fireDocumentHook('gm-1', 'deleteItem', asset, {});
    await table.settle();
    await table.drain();

    expect(recordOf(ship)).toMatchObject({ isCommandVehicle: false, integrity: 2, integritySheetReconciled: false });
  }, 30_000);

  it('control: a player\'s client writes nothing — the canonical GM\'s hook does', async () => {
    const { ship, asset } = seedShip();
    asset.system.track.value = 2;
    ship.items.contents.splice(ship.items.contents.indexOf(asset), 1);
    const writes = ship._updateHistory.length;
    table.client('pl-1').run(() => table.client('pl-1').hooks.call('deleteItem', [asset, {}, 'gm-1'], false));
    await table.settle();
    await table.drain();
    expect(ship._updateHistory.length, 'no write from the player\'s client').toBe(writes);
  }, 30_000);
});
