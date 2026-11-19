/* global makeTestActor */
/**
 * STARFORGED COMPANION
 * tests/unit/starshipSheetCursedClearStands.test.js
 *
 * Issue #364 STARSHIP-SHEET-CURSED-TOGGLE — the maintainer's decision: a
 * Cursed un-ticked on the starship sheet itself stands.
 *
 * The starship sheet's own Cursed toggle writes the native
 * `system.debility.cursed`, which is canonical (decisions.md → "Starship
 * battered: the native sheet field is canonical"). Un-ticking it there is a
 * GM's hand edit, and the one way to correct a mistaken tick: the canonical
 * GM's `updateActor` hook (ship.js registerStarshipConditionSync) mirrors it
 * onto the STARSHIP asset card's Cursed box and nothing ticks it back — not
 * for a starship the module tracks (a ship record), not for one it does not.
 * The asset card's box is the other path, and that one is ticked again
 * (issue #362 AC54, issue #364 STARSHIP-UNTRACKED-CURSED-CLEAR).
 *
 * The row was read from the code and never run. Run, the impact and the asset
 * card behaved as decided — those tests pass with and without this commit's
 * source change, by design: they pin the decision. One thing did not: a
 * tracked ship's record kept `cursed: true` (the sheet's toggle writes the
 * native field alone), and every reader that takes the record as it is — the
 * portrait prompt's "bearing signs of permanent corruption" — still called
 * the ship cursed. The record's impacts are now read from the sheet wherever
 * the record is read (registry.js withSheetNotes), as its notes and integrity
 * are; the last describe block fails without that.
 *
 * Real path: registerStarshipConditionSync's two hooks, updateShip, getShip,
 * actorBridge.readCommandVehicleConditions / setCommandVehicleConditions,
 * art/promptBuilder.buildPrompt. Harness as
 * tests/unit/starshipCursedUntickRestored.test.js.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getShip, updateShip, isShipCursed, isShipBattered, registerStarshipConditionSync } from '../../src/entities/ship.js';
import { readCommandVehicleConditions } from '../../src/character/actorBridge.js';
import { readEntityFlag, withSheetNotes } from '../../src/entities/registry.js';
import { buildPrompt } from '../../src/art/promptBuilder.js';

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

/** A starship the module tracks: the STARSHIP asset on it, a ship record, listed in the campaign. */
function installTrackedShip() {
  const asset = starshipAsset();
  const ship = makeTestActor({
    id: 'ship-1', type: 'starship', name: 'Wayfarer',
    system: { debility: { battered: false, cursed: false }, notes: '' },
    items: { contents: [asset] },
    flags: { [MODULE_ID]: {
      entityType: 'ship', entityId: 'ship-guid',
      ship: { _id: 'ship-guid', name: 'Wayfarer', type: 'Courier', integrity: 5, integrityMax: 5,
        integritySheetReconciled: true, battered: false, cursed: false, isCommandVehicle: true },
    } },
  });
  asset.parent = ship;
  game.actors._set('ship-1', ship);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: ['ship-1'], characterIds: [] });
  return { ship, asset };
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

/** The starship sheet's own impact toggle: the native field, then the updateActor hook every client runs. */
async function toggleOnSheet(ship, impacts) {
  Object.assign(ship.system.debility, impacts);
  await fire('updateActor', ship, { system: { debility: impacts } }, {}, 'gm-1');
}

/** A click on a condition box of the asset card: the Item update, then its hook. */
async function tickOnAssetCard(asset, name, ticked) {
  asset.system.conditions = asset.system.conditions.map(c => (c.name === name ? { ...c, ticked } : c));
  await fire('updateItem', asset, { system: { conditions: asset.system.conditions } }, {}, 'pl-1');
}

/** Did any write since `from` put the cursed impact back, on the sheet or on the asset card? */
function cursedPutBack(ship, asset, from) {
  const onSheet = ship._updateHistory.slice(from.actor).some(w => w['system.debility.cursed'] === true);
  const onCard = asset.update.mock.calls.slice(from.asset).some(([w]) =>
    (w['system.conditions'] ?? []).some(c => /cursed/i.test(c.name) && c.ticked === true));
  return onSheet || onCard;
}
const mark = (ship, asset) => ({ actor: ship._updateHistory.length, asset: asset.update.mock.calls.length });

describe('issue #364 STARSHIP-SHEET-CURSED-TOGGLE — Cursed un-ticked on the starship sheet stands (a starship with no module record)', () => {
  it('the impact stays cleared, the asset card\'s Cursed box follows it, and nothing ticks it back', async () => {
    const { ship, asset } = installSidebarStarship();
    expect(getShip('ship-9'), 'no module record (setup)').toBeNull();
    await toggleOnSheet(ship, { cursed: true });
    expect(readCommandVehicleConditions(ship), 'mirrored onto the asset (setup)').toEqual({ battered: false, cursed: true });
    const from = mark(ship, asset);

    await toggleOnSheet(ship, { cursed: false });

    expect(ship.system.debility.cursed).toBe(false);
    expect(isShipCursed(ship)).toBe(false);
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: false, cursed: false });
    expect(cursedPutBack(ship, asset, from)).toBe(false);
  });

  it('a later Battered tick on the asset card writes battered and leaves the cleared Cursed alone', async () => {
    const { ship, asset } = installSidebarStarship();
    await toggleOnSheet(ship, { cursed: true });
    await toggleOnSheet(ship, { cursed: false });
    const from = mark(ship, asset);

    await tickOnAssetCard(asset, 'Battered', true);

    expect(ship.system.debility).toMatchObject({ battered: true, cursed: false });
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: true, cursed: false });
    expect(cursedPutBack(ship, asset, from)).toBe(false);
  });

  it('control: the asset card\'s own Cursed box is the other path — un-ticked there, it is ticked again', async () => {
    const { ship, asset } = installSidebarStarship();
    await toggleOnSheet(ship, { cursed: true });

    await tickOnAssetCard(asset, 'Cursed', false);

    expect(ship.system.debility.cursed).toBe(true);
    expect(readCommandVehicleConditions(ship).cursed).toBe(true);
  });
});

describe('issue #364 STARSHIP-SHEET-CURSED-TOGGLE — Cursed un-ticked on the starship sheet stands (a starship the module tracks)', () => {
  /** Cursed as Withstand Damage marks it: the record, the impact and the asset card all say so. */
  async function cursedByTheModule() {
    const made = installTrackedShip();
    await updateShip('ship-1', { cursed: true });
    expect(made.ship.system.debility.cursed, 'the impact (setup)').toBe(true);
    expect(readCommandVehicleConditions(made.ship).cursed, 'the asset card (setup)').toBe(true);
    expect(readEntityFlag('ship', made.ship).cursed, 'the record (setup)').toBe(true);
    return made;
  }

  it('the impact stays cleared and the asset card\'s Cursed box follows it', async () => {
    const { ship, asset } = await cursedByTheModule();
    const from = mark(ship, asset);

    await toggleOnSheet(ship, { cursed: false });

    expect(ship.system.debility.cursed).toBe(false);
    expect(isShipCursed('ship-1')).toBe(false);
    expect(readCommandVehicleConditions(ship)).toEqual({ battered: false, cursed: false });
    expect(cursedPutBack(ship, asset, from)).toBe(false);
  });

  it('no later write of the module\'s own puts it back: a position, the load-time reconcile, a battered mark, the asset card\'s Battered box', async () => {
    const { ship, asset } = await cursedByTheModule();
    await toggleOnSheet(ship, { cursed: false });
    const from = mark(ship, asset);

    await updateShip('ship-1', { position: { kind: 'settlement', name: 'Bleakhold' } });
    await updateShip('ship-1', {});                       // migrator.reconcileCommandVehicleIntegrity's write at world load
    await updateShip('ship-1', { battered: true });       // Withstand Damage's other mark
    await updateShip('ship-1', { integrity: 3 });
    await tickOnAssetCard(asset, 'Battered', false);      // the asset card's other box, through the updateItem hook
    await toggleOnSheet(ship, { battered: true });        // the sheet's other toggle

    expect(ship.system.debility.cursed).toBe(false);
    expect(readCommandVehicleConditions(ship).cursed).toBe(false);
    expect(cursedPutBack(ship, asset, from)).toBe(false);
  });

  it('a player\'s client (not the canonical GM) mirrors nothing, and ticks nothing back', async () => {
    const { ship, asset } = await cursedByTheModule();
    game.user = { id: 'pl-1', isGM: false, active: true };
    const from = mark(ship, asset);

    await toggleOnSheet(ship, { cursed: false });

    expect(ship.system.debility.cursed).toBe(false);
    expect(ship._updateHistory.length).toBe(from.actor);
    expect(asset.update.mock.calls.length).toBe(from.asset);
  });

  it('it can be marked again afterwards — and the asset card\'s box is still ticked again when un-ticked there', async () => {
    const { ship, asset } = await cursedByTheModule();
    await toggleOnSheet(ship, { cursed: false });

    await updateShip('ship-1', { cursed: true });
    expect(ship.system.debility.cursed).toBe(true);
    expect(readCommandVehicleConditions(ship).cursed).toBe(true);

    await tickOnAssetCard(asset, 'Cursed', false);
    expect(ship.system.debility.cursed, 'the asset card\'s un-tick is refused').toBe(true);
    expect(readCommandVehicleConditions(ship).cursed).toBe(true);
  });
});

describe('issue #364 STARSHIP-SHEET-CURSED-TOGGLE — the ship\'s record says what the sheet says', () => {
  it('after the sheet\'s clear the record read by the module no longer calls the ship cursed', async () => {
    const { ship } = installTrackedShip();
    await updateShip('ship-1', { cursed: true });
    expect(getShip('ship-1').cursed, 'cursed (setup)').toBe(true);

    await toggleOnSheet(ship, { cursed: false });

    expect(getShip('ship-1').cursed).toBe(false);
    // …and it stays so across the module's later writes of the record.
    await updateShip('ship-1', { position: { kind: 'settlement', name: 'Bleakhold' } });
    expect(getShip('ship-1').cursed).toBe(false);
    expect(ship.system.debility.cursed).toBe(false);
  });

  it('the ship\'s next portrait is not drawn "bearing signs of permanent corruption"', async () => {
    const { ship } = installTrackedShip();
    await updateShip('ship-1', { cursed: true });
    // The record as the portrait pipeline reads it (art/portraitRouting.js).
    const asRead = () => withSheetNotes('ship', ship, readEntityFlag('ship', ship));
    expect(buildPrompt('ship', 'A battered courier.', asRead()).prompt, 'cursed (setup)').toContain('permanent corruption');

    await toggleOnSheet(ship, { cursed: false });

    expect(buildPrompt('ship', 'A battered courier.', asRead()).prompt).not.toContain('permanent corruption');
  });

  it('an impact ticked on the sheet reaches the record\'s readers too: cursed and battered', async () => {
    const { ship } = installTrackedShip();

    await toggleOnSheet(ship, { cursed: true, battered: true });

    expect(getShip('ship-1')).toMatchObject({ cursed: true, battered: true });
    expect(isShipBattered('ship-1')).toBe(true);
  });

  it('control: a host with no native impact field keeps the record\'s say', () => {
    const { ship } = installTrackedShip();
    ship.flags[MODULE_ID].ship.cursed = true;
    delete ship.system.debility;

    expect(getShip('ship-1').cursed).toBe(true);
  });
});
