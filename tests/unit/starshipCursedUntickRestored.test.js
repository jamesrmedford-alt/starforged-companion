/* global makeTestActor */
/**
 * STARFORGED COMPANION
 * tests/unit/starshipCursedUntickRestored.test.js
 *
 * A Cursed box un-ticked on the STARSHIP asset card is put back in step with
 * the impact (issue #362 AC54, STARSHIP-CURSED-UNTICK-DRIFT — an incomplete
 * fix of known-issues STARSHIP-ASSET-CONDITIONS-UNSYNCED).
 *
 * The command vehicle is cursed — the native impact (`system.debility.cursed`,
 * canonical) and its mirror, the STARSHIP asset card's Cursed box, both say
 * so. Someone un-ticks Cursed on the asset card. The canonical GM's updateItem
 * hook (ship.js registerStarshipConditionSync) sends that to updateShip, which
 * refuses it — "cursed can only be set, never cleared" — and, per the hook's
 * own contract, "whose write-through puts the asset back in step". It wrote
 * through only when `current.cursed !== updated.cursed`; the refused clear
 * left them equal, so nothing was written: the impact said cursed, the asset
 * card said not. And with the impact set on the starship sheet (the record's
 * own `cursed` still false) the guard did not see it at all. Now the guard
 * reads the native impact too, and a `cursed` update always re-asserts the
 * impact and the asset mirror (each written only when it differs).
 *
 * Real path: updateShip, registerStarshipConditionSync's two hooks,
 * actorBridge.readCommandVehicleConditions / setCommandVehicleConditions.
 * Harness as tests/unit/starshipAssetConditionsSync.test.js.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { updateShip, registerStarshipConditionSync } from '../../src/entities/ship.js';
import { readCommandVehicleConditions } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';

function starshipAsset() {
  const item = {
    id: 'asset-starship', type: 'asset', name: 'Starship',
    system: {
      category: 'Command Vehicle',
      track: { enabled: true, name: 'Integrity', max: 5, min: 0, value: 5 },
      conditions: [{ name: 'Battered', ticked: false }, { name: 'Cursed', ticked: false }],
    },
    flags: {},
    update: vi.fn(async (changes) => {
      for (const [path, val] of Object.entries(changes)) {
        const parts = path.split('.');
        let target = item;
        for (let i = 0; i < parts.length - 1; i++) target = (target[parts[i]] ??= {});
        target[parts.at(-1)] = val;
      }
      return item;
    }),
  };
  return item;
}

function installCommandVehicle() {
  const asset = starshipAsset();
  const ship = makeTestActor({
    id: 'ship-1', type: 'starship', name: 'Wayfarer',
    system: { debility: { battered: false, cursed: false }, notes: '' },
    items: { contents: [asset] },
    flags: { [MODULE_ID]: {
      entityType: 'ship', entityId: 'ship-guid',
      ship: { _id: 'ship-guid', name: 'Wayfarer', integrity: 5, integrityMax: 5, integritySheetReconciled: true,
        battered: false, cursed: false, isCommandVehicle: true },
    } },
  });
  asset.parent = ship;
  game.actors._set('ship-1', ship);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: ['ship-1'], characterIds: [] });
  return { ship, asset };
}

let hooks, savedUser, savedUsers;
beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  hooks = {};
  vi.spyOn(Hooks, 'on').mockImplementation((name, fn) => { (hooks[name] ??= []).push(fn); });
  savedUser = game.user; savedUsers = game.users;
  game.user = { id: 'gm-1', isGM: true, active: true };
  game.users = { contents: [game.user], filter: (f) => [game.user].filter(f), find: (f) => [game.user].find(f),
    get: (id) => (id === 'gm-1' ? game.user : null), [Symbol.iterator]: function* () { yield game.user; } };
  registerStarshipConditionSync();
});
afterEach(() => { vi.restoreAllMocks(); game.user = savedUser; game.users = savedUsers; });

const fire = async (name, ...args) => { for (const fn of hooks[name] ?? []) await fn(...args); };

/** The player's click on a condition box of the asset card: the Item update, then its hook. */
async function tickOnAssetCard(asset, name, ticked) {
  asset.system.conditions = asset.system.conditions.map(c => (c.name === name ? { ...c, ticked } : c));
  await fire('updateItem', asset, { system: { conditions: asset.system.conditions } }, {}, 'pl-1');
}

describe('a Cursed box un-ticked on the STARSHIP asset card is put back in step with the impact (issue #362 AC54)', () => {
  it('control: Battered un-ticked on the asset card clears the impact — the two boxes agree', async () => {
    const { ship, asset } = installCommandVehicle();
    await updateShip('ship-1', { battered: true });
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: true, cursed: false });

    await tickOnAssetCard(asset, 'Battered', false);
    expect(ship.system.debility.battered).toBe(false);
    expect(readCommandVehicleConditions(ship).battered).toBe(false);
  });

  it('control: cursed set by the module is ticked on the asset card', async () => {
    const { ship } = installCommandVehicle();
    await updateShip('ship-1', { cursed: true });
    expect(ship.system.debility.cursed).toBe(true);
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: false, cursed: true });
  });

  it('Cursed un-ticked on the asset card: the impact stays (permanent) and the card\'s box is ticked again', async () => {
    const { ship, asset } = installCommandVehicle();
    await updateShip('ship-1', { cursed: true });

    await tickOnAssetCard(asset, 'Cursed', false);

    expect(ship.system.debility.cursed, 'cursed is never cleared').toBe(true);
    // It stayed { battered: false, cursed: false } — the mirror disagreed with the canonical impact.
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: false, cursed: true });
  });

  it('the impact set on the starship sheet (the record not told): un-ticked on the asset card, it stays, and both boxes say cursed', async () => {
    const { ship, asset } = installCommandVehicle();
    // The sheet's own Cursed toggle: the native impact alone, which the updateActor hook mirrors onto the asset.
    ship.system.debility.cursed = true;
    await fire('updateActor', ship, { system: { debility: { cursed: true } } }, {}, 'gm-1');
    expect(readCommandVehicleConditions(ship).cursed, 'mirrored onto the asset (setup)').toBe(true);
    expect(ship.flags[MODULE_ID].ship.cursed, 'the record was not told (setup)').toBe(false);

    await tickOnAssetCard(asset, 'Cursed', false);

    expect(ship.system.debility.cursed).toBe(true);
    // It stayed un-ticked: the guard read the record's false, so the clear went nowhere and nothing was re-mirrored.
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: false, cursed: true });
    expect(ship.flags[MODULE_ID].ship.cursed, 'the record now holds the impact too').toBe(true);
  });

  it('control: a cursed update the stores already hold writes nothing', async () => {
    const { ship, asset } = installCommandVehicle();
    await updateShip('ship-1', { cursed: true });
    const actorWrites = ship._updateHistory.length;
    const assetWrites = asset.update.mock.calls.length;

    await updateShip('ship-1', { cursed: true });

    expect(ship._updateHistory.slice(actorWrites).some(w => 'system.debility.cursed' in w)).toBe(false);
    expect(asset.update.mock.calls.length).toBe(assetWrites);
  });
});
