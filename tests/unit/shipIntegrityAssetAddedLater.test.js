/* global makeTestActor */
/**
 * STARFORGED COMPANION
 * tests/unit/shipIntegrityAssetAddedLater.test.js
 *
 * Issue #362 AC25 (SHIP-INTEGRITY-LOST-WHEN-ASSET-ADDED — an incomplete fix of
 * issue #347 AB08 SHIP-INTEGRITY-UPGRADE-LOSS).
 *
 * A starship made in the sidebar (the default: light registration, no
 * STARSHIP asset yet) is the table's command vehicle by the lone-ship
 * fallback. It takes damage: with no STARSHIP asset the ship record is the
 * integrity's only store (decisions.md "A starship with no STARSHIP asset
 * keeps its integrity on the record"), so the record says 2/5. Later the GM
 * drags the STARSHIP (Command Vehicle) asset onto the sheet — a fresh
 * compendium copy whose Integrity track reads 5.
 *
 * ShipSchema stamped every new record `integritySheetReconciled: true` at
 * birth, asset or no asset, so the record claimed a reconcile with a sheet it
 * never had: the moment the asset landed every reader said 5/5, and the
 * createItem hook's own write (syncCommandVehicleFlag → updateShip) overwrote
 * the record's 2 with 5 — the damage gone from both stores, nobody told.
 *
 * Now a record is reconciled only by a write that saw the track (born so only
 * beside one), and a write that sees none leaves it unreconciled: AB08's rule
 * for a record and a track never reconciled applies — the lower is taken
 * into both stores and the GM told.
 *
 * Real path: registerStarshipActorLight (the createActor hook's default),
 * changeIntegrity (Withstand Damage's writer), syncCommandVehicleFlag (the
 * createItem / deleteItem hooks' handler and the GM's load scan), getShip /
 * getCommandVehicle (every reader).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerStarshipActorLight, changeIntegrity, syncCommandVehicleFlag, getShip, getCommandVehicle, updateShip,
} from '../../src/entities/ship.js';

const MODULE_ID = 'starforged-companion';

/** The vendor STARSHIP asset as the compendium holds it (json-packs/starforged-assets/Starship_…json). */
function freshStarshipAsset(parent, { value = 5, id = 'asset-starship' } = {}) {
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

/** A sidebar starship, registered as the createActor hook registers it (Auto-Seed off, the default). */
async function sidebarStarship({ items = [] } = {}) {
  const ship = makeTestActor({ id: 'ship-1', type: 'starship', name: 'Wayfarer', system: { debility: {}, notes: '' } });
  for (const item of items) { item.parent = ship; ship.items.contents.push(item); }
  game.actors._set('ship-1', ship);
  await registerStarshipActorLight(ship, foundry.utils.deepClone(stored()));
  return ship;
}

/** The asset dragged onto the sheet, then the createItem hook's sync (index.js registerCommandVehicleHook). */
async function addAsset(ship, opts) {
  const asset = freshStarshipAsset(ship, opts);
  ship.items.contents.push(asset);
  await syncCommandVehicleFlag(ship, foundry.utils.deepClone(stored()));
  return asset;
}

describe('damage recorded on a ship with no STARSHIP asset survives the asset being added (issue #362 AC25)', () => {
  it('control: with no STARSHIP asset the record is the integrity\'s store, and the ship is the command vehicle', async () => {
    const ship = await sidebarStarship();
    expect(stored().shipIds).toEqual(['ship-1']);
    const res = await changeIntegrity('ship-1', -3);
    expect(res).toMatchObject({ ok: true, before: 5, after: 2 });
    expect(recordOf(ship).integrity).toBe(2);
    expect(getCommandVehicle(stored())?.integrity).toBe(2);
  });

  it('control: an asset added to an undamaged ship reads 5/5 and flags the command vehicle — nothing said', async () => {
    const ship = await sidebarStarship();
    await addAsset(ship);
    expect(recordOf(ship).isCommandVehicle).toBe(true);
    expect(getShip('ship-1').integrity).toBe(5);
    expect(recordOf(ship).integritySheetReconciled).toBe(true);
    expect(notices()).toHaveLength(0);
  });

  it('the STARSHIP asset added after the damage: the ship still reads 2/5', async () => {
    const ship = await sidebarStarship();
    await changeIntegrity('ship-1', -3);
    expect(getShip('ship-1').integrity, 'before the asset (setup)').toBe(2);

    ship.items.contents.push(freshStarshipAsset(ship));   // dragged from the compendium: track 5/5

    // It read 5 — the record claimed it was reconciled with a sheet it never had.
    expect(getShip('ship-1').integrity, 'what Withstand Damage rolls and the narrator is told').toBe(2);
  });

  it('…and the createItem hook\'s write keeps the damage in both stores, and tells the GM both values', async () => {
    const ship = await sidebarStarship();
    await changeIntegrity('ship-1', -3);
    const asset = await addAsset(ship);

    expect(recordOf(ship).isCommandVehicle, 'the flag sync ran (setup)').toBe(true);
    // It was { record: 5, sheet: 5 } — the recorded damage overwritten.
    expect({ record: recordOf(ship).integrity, sheet: asset.system.track.value }).toEqual({ record: 2, sheet: 2 });
    expect(recordOf(ship).integritySheetReconciled).toBe(true);
    expect(notices()).toHaveLength(1);
    expect(notices()[0].content).toMatch(/recorded integrity 2\/5.*showed 5\/5.*before the asset was added.*2\/5/s);
    expect(notices()[0].whisper).toEqual(['gm-1']);
  });

  it('an asset arriving with no flag change to ride on (a stale command-vehicle flag): every reader takes the lower, and the next write puts it in both stores', async () => {
    const ship = await sidebarStarship();
    await updateShip('ship-1', { isCommandVehicle: true });   // stale: no asset carries it yet
    await changeIntegrity('ship-1', -2);
    const asset = await addAsset(ship);

    // The sync wrote nothing (the flag already said so) — it never reconciles
    // by itself: the GM's world load does, beside it.
    expect(getShip('ship-1').integrity).toBe(3);
    await updateShip('ship-1', { position: { locationName: 'Bleakhold', source: 'narrator' } });
    expect({ record: recordOf(ship).integrity, sheet: asset.system.track.value }).toEqual({ record: 3, sheet: 3 });
    expect(notices()).toHaveLength(1);
  });

  it('a record stamped reconciled with no asset (made before this fix): the GM\'s load scan clears the stamp, so the asset added later keeps the damage', async () => {
    const ship = makeTestActor({
      id: 'ship-1', type: 'starship', name: 'Wayfarer', system: { debility: {}, notes: '' },
      flags: { [MODULE_ID]: { entityType: 'ship', entityId: 'guid', ship: {
        _id: 'guid', name: 'Wayfarer', integrity: 2, integrityMax: 5, isCommandVehicle: false, integritySheetReconciled: true,
      } } },
    });
    game.actors._set('ship-1', ship);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: ['ship-1'], characterIds: [] });

    await syncCommandVehicleFlag(ship, foundry.utils.deepClone(stored()));   // index.js registerCommandVehicleHook's load scan
    expect(recordOf(ship).integritySheetReconciled).toBe(false);
    expect(recordOf(ship).integrity).toBe(2);

    const asset = await addAsset(ship);
    expect({ record: recordOf(ship).integrity, sheet: asset.system.track.value }).toEqual({ record: 2, sheet: 2 });
  });

  it('the asset removed: the record is the store again, and a fresh asset added later keeps the damage taken meanwhile', async () => {
    const ship = await sidebarStarship();
    await addAsset(ship);
    await changeIntegrity('ship-1', -3);   // 2/5 on the track and its mirror

    ship.items.contents.length = 0;   // the asset dragged off — the deleteItem hook's sync
    await syncCommandVehicleFlag(ship, foundry.utils.deepClone(stored()));
    expect(recordOf(ship)).toMatchObject({ isCommandVehicle: false, integrity: 2, integritySheetReconciled: false });
    await changeIntegrity('ship-1', -1);
    expect(getShip('ship-1').integrity).toBe(1);

    const again = await addAsset(ship, { id: 'asset-starship-2' });
    expect({ record: recordOf(ship).integrity, sheet: again.system.track.value }).toEqual({ record: 1, sheet: 1 });
  });

  it('a starship registered beside its STARSHIP asset is born reconciled with the track — its value, nothing said on its first write', async () => {
    const asset = freshStarshipAsset(null, { value: 3 });
    const ship = await sidebarStarship({ items: [asset] });

    expect(recordOf(ship)).toMatchObject({ isCommandVehicle: true, integrity: 3, integritySheetReconciled: true });
    expect(getShip('ship-1').integrity).toBe(3);
    await updateShip('ship-1', { position: { locationName: 'Bleakhold', source: 'narrator' } });
    expect({ record: recordOf(ship).integrity, sheet: asset.system.track.value }).toEqual({ record: 3, sheet: 3 });
    expect(notices()).toHaveLength(0);
  });
});
