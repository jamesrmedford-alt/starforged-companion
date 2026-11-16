/* global makeTestActor */
/**
 * CHAR-02 · SHIP-INTEGRITY-LOST-WHEN-ASSET-ADDED — fourteenth bug audit probe
 * (INCOMPLETE-FIX of issue #347 AB08 SHIP-INTEGRITY-UPGRADE-LOSS)
 *
 * Scenario: a starship made in the sidebar (the default: light registration,
 * no STARSHIP asset yet) is the table's command vehicle by the lone-ship
 * fallback. It takes damage: with no STARSHIP asset the ship record is the
 * integrity's ONLY store (decisions.md "A starship with no STARSHIP asset
 * keeps its integrity on the record"), so the record says 2/5. Later the GM
 * drags the STARSHIP (Command Vehicle) asset onto the sheet — a fresh
 * compendium copy whose Integrity track reads 5.
 *
 * Correct: the damage survives. AB08's own rule for a record and a sheet
 *   that were never reconciled: "which was right cannot be known, so the
 *   lower is taken" — the ship reads 2/5, and the first write puts 2 on the
 *   new asset's track too.
 * Today:   ShipSchema stamps every new record `integritySheetReconciled:
 *   true` at birth, asset or no asset, so nothing was ever reconciled but the
 *   record says it was: the moment the asset lands every reader says 5/5, and
 *   the createItem hook's own write (syncCommandVehicleFlag → updateShip)
 *   overwrites the record's 2 with 5. The damage is gone from both stores,
 *   nobody is told.
 *
 * Real path: registerStarshipActorLight (the createActor hook's default),
 * changeIntegrity (Withstand Damage's writer), syncCommandVehicleFlag (the
 * createItem hook's handler), getShip / getCommandVehicle (every reader).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerStarshipActorLight, changeIntegrity, syncCommandVehicleFlag, getShip, getCommandVehicle,
} from '../../../src/entities/ship.js';

const MODULE_ID = 'starforged-companion';

/** The vendor STARSHIP asset as the compendium holds it (json-packs/starforged-assets/Starship_…json). */
function freshStarshipAsset(parent) {
  const item = {
    id: 'asset-starship', type: 'asset', name: 'Starship', parent,
    system: {
      category: 'Command Vehicle',
      track: { enabled: true, name: 'Integrity', max: 5, min: 0, value: 5 },
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
async function sidebarStarship() {
  const ship = makeTestActor({ id: 'ship-1', type: 'starship', name: 'Wayfarer', system: { debility: {}, notes: '' } });
  game.actors._set('ship-1', ship);
  await registerStarshipActorLight(ship, foundry.utils.deepClone(stored()));
  return ship;
}

describe('CHAR-02 — damage recorded on a ship with no STARSHIP asset survives the asset being added', () => {
  it('control: with no STARSHIP asset the record is the integrity\'s store, and the ship is the command vehicle', async () => {
    const ship = await sidebarStarship();
    expect(stored().shipIds).toEqual(['ship-1']);
    const res = await changeIntegrity('ship-1', -3);
    expect(res).toMatchObject({ ok: true, before: 5, after: 2 });
    expect(recordOf(ship).integrity).toBe(2);
    expect(getCommandVehicle(stored())?.integrity).toBe(2);
  });

  it('control: an asset added to an undamaged ship reads 5/5 and flags the command vehicle', async () => {
    const ship = await sidebarStarship();
    ship.items.contents.push(freshStarshipAsset(ship));
    await syncCommandVehicleFlag(ship, foundry.utils.deepClone(stored()));
    expect(recordOf(ship).isCommandVehicle).toBe(true);
    expect(getShip('ship-1').integrity).toBe(5);
  });

  it('the STARSHIP asset added after the damage: the ship still reads 2/5', async () => {
    const ship = await sidebarStarship();
    await changeIntegrity('ship-1', -3);
    expect(getShip('ship-1').integrity, 'before the asset (setup)').toBe(2);

    ship.items.contents.push(freshStarshipAsset(ship));   // dragged from the compendium: track 5/5

    // Fails today: 5 — the record claims it was reconciled with a sheet it never had.
    expect(getShip('ship-1').integrity, 'what Withstand Damage rolls and the narrator is told').toBe(2);
  });

  it('…and the createItem hook\'s write keeps the damage in both stores', async () => {
    const ship = await sidebarStarship();
    await changeIntegrity('ship-1', -3);
    const asset = freshStarshipAsset(ship);
    ship.items.contents.push(asset);

    await syncCommandVehicleFlag(ship, foundry.utils.deepClone(stored()));   // index.js registerCommandVehicleHook → createItem

    expect(recordOf(ship).isCommandVehicle, 'the flag sync ran (setup)').toBe(true);
    // Fails today: { record: 5, sheet: 5 } — the recorded damage is overwritten.
    expect({ record: recordOf(ship).integrity, sheet: asset.system.track.value }).toEqual({ record: 2, sheet: 2 });
  });
});
