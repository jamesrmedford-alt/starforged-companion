/* global makeTestActor */
/**
 * STARFORGED COMPANION
 * tests/unit/starshipUntrackedCursedClear.test.js
 *
 * Issue #364 STARSHIP-UNTRACKED-CURSED-CLEAR (left open by issue #362 AC54).
 *
 * Cursed is permanent. For a starship the module holds a record of, a Cursed
 * box un-ticked on its STARSHIP asset card goes through updateShip, which
 * refuses the clear and ticks the box again (AC54). A starship with no module
 * record — one made in the sidebar that the Companion never registered —
 * took the other branch of the same hook (ship.js
 * registerStarshipConditionSync), which wrote the asset's conditions straight
 * to the native impacts: the un-tick cleared `system.debility.cursed`.
 *
 * That branch now skips a cursed clear too: the impact stays and the card's
 * box is ticked again. Battered, and a Cursed tick, are written as before.
 *
 * Real path: registerStarshipConditionSync's two hooks,
 * actorBridge.readCommandVehicleConditions / setCommandVehicleConditions.
 * Harness as tests/unit/starshipCursedUntickRestored.test.js.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getShip, registerStarshipConditionSync } from '../../src/entities/ship.js';
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

/** A starship made in the sidebar: the STARSHIP asset on it, no module record, in no module list. */
function installSidebarStarship() {
  const asset = starshipAsset();
  const ship = makeTestActor({
    id: 'ship-9', type: 'starship', name: 'Driftwood',
    system: { debility: { battered: false, cursed: false }, notes: '' },
    items: { contents: [asset] },
    flags: {},
  });
  asset.parent = ship;
  game.actors._set('ship-9', ship);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: [], characterIds: [] });
  return { ship, asset };
}

let hooks, savedUser, savedUsers;
beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  hooks = {};
  vi.spyOn(Hooks, 'on').mockImplementation((name, fn) => { (hooks[name] ??= []).push(fn); });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  savedUser = game.user; savedUsers = game.users;
  game.user = { id: 'gm-1', isGM: true, active: true };
  game.users = { contents: [game.user], filter: (f) => [game.user].filter(f), find: (f) => [game.user].find(f),
    get: (id) => (id === 'gm-1' ? game.user : null), [Symbol.iterator]: function* () { yield game.user; } };
  registerStarshipConditionSync();
});
afterEach(() => { vi.restoreAllMocks(); game.user = savedUser; game.users = savedUsers; });

const fire = async (name, ...args) => { for (const fn of hooks[name] ?? []) await fn(...args); };

/** A click on a condition box of the asset card: the Item update, then its hook. */
async function tickOnAssetCard(asset, name, ticked) {
  asset.system.conditions = asset.system.conditions.map(c => (c.name === name ? { ...c, ticked } : c));
  await fire('updateItem', asset, { system: { conditions: asset.system.conditions } }, {}, 'pl-1');
}

/** The starship sheet's own impact toggle: the native field, then the updateActor hook that mirrors it onto the asset. */
async function markOnSheet(ship, impacts) {
  Object.assign(ship.system.debility, impacts);
  await fire('updateActor', ship, { system: { debility: impacts } }, {}, 'gm-1');
}

describe('issue #364 STARSHIP-UNTRACKED-CURSED-CLEAR — a starship with no module record keeps its cursed impact', () => {
  it('setup: the starship has no module record', () => {
    installSidebarStarship();
    expect(getShip('ship-9')).toBeNull();
  });

  it('control: Battered ticked, then un-ticked, on the asset card is written to the impact', async () => {
    const { ship, asset } = installSidebarStarship();
    await tickOnAssetCard(asset, 'Battered', true);
    expect(ship.system.debility.battered).toBe(true);
    await tickOnAssetCard(asset, 'Battered', false);
    expect(ship.system.debility.battered).toBe(false);
  });

  it('control: Cursed ticked on the asset card marks the impact', async () => {
    const { ship, asset } = installSidebarStarship();
    await tickOnAssetCard(asset, 'Cursed', true);
    expect(ship.system.debility.cursed).toBe(true);
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: false, cursed: true });
  });

  it('Cursed un-ticked on the asset card: the impact stays, and the card\'s box is ticked again', async () => {
    const { ship, asset } = installSidebarStarship();
    await markOnSheet(ship, { cursed: true });
    expect(readCommandVehicleConditions(ship).cursed, 'mirrored onto the asset (setup)').toBe(true);

    await tickOnAssetCard(asset, 'Cursed', false);

    expect(ship.system.debility.cursed, 'cursed is never cleared').toBe(true);
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: false, cursed: true });
    expect(ship._updateHistory.some(w => w['system.debility.cursed'] === false), 'no write clears the impact').toBe(false);
  });

  it('Cursed un-ticked and Battered ticked in one edit: battered is written, cursed stays, both boxes are right', async () => {
    const { ship, asset } = installSidebarStarship();
    await markOnSheet(ship, { cursed: true });

    asset.system.conditions = [{ name: 'Battered', ticked: true }, { name: 'Cursed', ticked: false }];
    await fire('updateItem', asset, { system: { conditions: asset.system.conditions } }, {}, 'pl-1');

    expect(ship.system.debility).toMatchObject({ battered: true, cursed: true });
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: true, cursed: true });
  });
});
