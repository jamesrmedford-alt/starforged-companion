/* global makeTestActor */
/**
 * STARSHIP-ASSET-CONDITIONS-UNSYNCED (issue #345 AA20's residual).
 *
 * The STARSHIP asset (category "Command Vehicle") on a starship carries its
 * own Battered / Cursed conditions (vendor `system.conditions`) — a further
 * store beside the starship's native impacts (`system.debility.battered` /
 * `cursed`), which are canonical (decisions.md → "Starship battered: the
 * native sheet field is canonical"). Nothing kept them in step: a battered
 * the module wrote never showed on the asset card, and one the player ticked
 * there was read by nothing. The asset's conditions are now the impacts'
 * mirror: updateShip writes through to them, a sheet impact toggle is
 * mirrored onto them, and a box ticked on the asset card is written to the
 * impacts (cursed only set, never cleared).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { updateShip, clearBattered, isShipBattered, registerStarshipConditionSync } from '../../src/entities/ship.js';
import { readCommandVehicleConditions } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';

function starshipAsset({ battered = false, cursed = false } = {}) {
  const item = {
    id: 'asset-starship', type: 'asset', name: 'Starship',
    system: {
      category: 'Command Vehicle',
      track: { enabled: true, name: 'Integrity', max: 5, min: 0, value: 5 },
      conditions: [{ name: 'Battered', ticked: battered }, { name: 'Cursed', ticked: cursed }],
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

function installCommandVehicle(conditions = {}) {
  const asset = starshipAsset(conditions);
  const ship = makeTestActor({
    id: 'ship-1', type: 'starship', name: 'Wayfarer',
    system: { debility: { battered: false, cursed: false }, notes: '' },
    items: { contents: [asset] },
    flags: {
      [MODULE_ID]: {
        entityType: 'ship', entityId: 'ship-guid',
        ship: { _id: 'ship-guid', name: 'Wayfarer', integrity: 5, integrityMax: 5, battered: false, isCommandVehicle: true },
      },
    },
  });
  asset.parent = ship;
  game.actors._set('ship-1', ship);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: ['ship-1'], characterIds: [] });
  return { ship, asset };
}

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
});

describe('STARSHIP-ASSET-CONDITIONS-UNSYNCED — the module\'s writes', () => {
  it('a battered the module writes (updateShip) is ticked on the STARSHIP asset card, and clearing it un-ticks it', async () => {
    const { ship, asset } = installCommandVehicle();
    await updateShip('ship-1', { battered: true });
    expect(ship.system.debility.battered).toBe(true);
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: true, cursed: false });
    expect(asset.update).toHaveBeenCalledWith(expect.objectContaining({ 'system.conditions': expect.any(Array) }),
      { [MODULE_ID]: { conditionMirror: true } });

    await clearBattered('ship-1');
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: false, cursed: false });
  });

  it('cursed is mirrored too, and stays set', async () => {
    const { ship } = installCommandVehicle();
    await updateShip('ship-1', { cursed: true });
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: false, cursed: true });
  });

  it('control: an update that touches no impact leaves the asset alone', async () => {
    const { asset } = installCommandVehicle();
    await updateShip('ship-1', { name: 'Wayfarer' });
    expect(asset.update).not.toHaveBeenCalledWith(expect.objectContaining({ 'system.conditions': expect.anything() }), expect.anything());
  });
});

describe('STARSHIP-ASSET-CONDITIONS-UNSYNCED — the sheet\'s two boxes (canonical GM hooks)', () => {
  let hooks;
  beforeEach(() => {
    hooks = {};
    vi.spyOn(Hooks, 'on').mockImplementation((name, fn) => { (hooks[name] ??= []).push(fn); });
    game.user = { id: 'gm-1', isGM: true, active: true };
    game.users = { contents: [game.user], filter: (f) => [game.user].filter(f), find: (f) => [game.user].find(f),
      get: (id) => (id === 'gm-1' ? game.user : null), [Symbol.iterator]: function* () { yield game.user; } };
    registerStarshipConditionSync();
  });
  afterEach(() => vi.restoreAllMocks());
  const fire = async (name, ...args) => { for (const fn of hooks[name] ?? []) await fn(...args); };

  it('the starship sheet\'s Battered toggle (the canonical impact) ticks the asset\'s condition', async () => {
    const { ship } = installCommandVehicle();
    ship.system.debility.battered = true;
    await fire('updateActor', ship, { system: { debility: { battered: true } } }, {}, 'pl-1');
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: true, cursed: false });
  });

  it('the asset card\'s Battered box is written to the impact — what every reader reads', async () => {
    const { ship, asset } = installCommandVehicle();
    asset.system.conditions[0].ticked = true;
    await fire('updateItem', asset, { system: { conditions: asset.system.conditions } }, {}, 'pl-1');
    expect(ship.system.debility.battered).toBe(true);
    expect(isShipBattered('ship-1')).toBe(true);
  });

  it('control: the mirror\'s own write is not sent back', async () => {
    const { ship, asset } = installCommandVehicle();
    asset.system.conditions[0].ticked = true;
    await fire('updateItem', asset, { system: { conditions: asset.system.conditions } }, { [MODULE_ID]: { conditionMirror: true } }, 'gm-1');
    expect(ship.system.debility.battered).toBe(false);
  });
});
