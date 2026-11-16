/* global makeTestActor */
/**
 * CHAR-05 · STARSHIP-CURSED-UNTICK-DRIFT — fourteenth bug audit probe
 * (INCOMPLETE-FIX of known-issues STARSHIP-ASSET-CONDITIONS-UNSYNCED)
 *
 * Scenario: the command vehicle is cursed — the native impact
 * (`system.debility.cursed`, canonical) and its mirror, the STARSHIP asset
 * card's Cursed box, both say so. Someone un-ticks Cursed on the asset card.
 * The canonical GM's updateItem hook (ship.js registerStarshipConditionSync)
 * sends that to updateShip, which refuses it — "cursed can only be set, never
 * cleared" — and, per the hook's own contract, "whose write-through puts the
 * asset back in step".
 *
 * Correct: the refusal is written back: the asset card's Cursed box is ticked
 *   again, so the sheet's two boxes for the one fact agree (canon wins).
 * Today:   updateShip writes through only when `current.cursed !==
 *   updated.cursed`; the refused clear leaves them equal, so nothing is
 *   written: the native impact says cursed, the asset card says not — until
 *   some later impact toggle happens to re-mirror it.
 *
 * Real path: updateShip, registerStarshipConditionSync's two hooks,
 * actorBridge.readCommandVehicleConditions / setCommandVehicleConditions.
 * Harness as tests/unit/starshipAssetConditionsSync.test.js.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { updateShip, registerStarshipConditionSync } from '../../../src/entities/ship.js';
import { readCommandVehicleConditions } from '../../../src/character/actorBridge.js';

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

describe('CHAR-05 — a Cursed box un-ticked on the STARSHIP asset card is put back in step with the impact', () => {
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

    expect(ship.system.debility.cursed, 'cursed is never cleared (holds today)').toBe(true);
    // Fails today: { battered: false, cursed: false } — the mirror disagrees with the canonical impact.
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: false, cursed: true });
  });
});
