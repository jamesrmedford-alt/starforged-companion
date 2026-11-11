/* global makeTestActor */
/**
 * STARFORGED COMPANION
 * tests/unit/commandVehicleIntegrityUpgradeReconcile.test.js
 *
 * Issue #347 AB08 (SHIP-INTEGRITY-UPGRADE-LOSS; the audit's
 * commandVehicleIntegrityUpgradeLoss probe) — issue #345 AA20's fix on a
 * world played before it.
 *
 * Before AA20 the module read and wrote the command vehicle's integrity on
 * `flags.starforged-companion.ship.integrity` alone: every loss it applied
 * (Withstand Damage's "-1 integrity", an asset rider, `changeIntegrity`) went
 * there and never reached the STARSHIP asset's Integrity track on the sheet. A
 * world played that way holds record = 2, sheet = 5 (the track's untouched
 * compendium default). AA20 made the sheet's track canonical with no
 * carry-over: every reader said 5, and the first updateShip — a position
 * write — overwrote the record's 2 with 5, so neither store held the damage.
 *
 * A record from before AA20 carries no `integritySheetReconciled`: until its
 * first write, every reader takes the lower of the two; that write puts the
 * lower into both stores, stamps the record and whispers the GMs both values;
 * the canonical GM's world load makes that write first
 * (migrator.reconcileCommandVehicleIntegrity).
 *
 * Fixture and helpers follow tests/unit/commandVehicleIntegrityOnSheet.test.js.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { changeIntegrity, getCommandVehicle, getShip, updateShip, ShipSchema } from '../../src/entities/ship.js';
import { reconcileCommandVehicleIntegrity } from '../../src/entities/migrator.js';
import { resolveStatValue } from '../../src/moves/statEnrichment.js';
import { buildShipPositionLine } from '../../src/narration/narratorPrompt.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';

function starshipAsset(value) {
  const item = {
    id: 'asset-starship', type: 'asset', name: 'Starship',
    system: { category: 'Command Vehicle', track: { enabled: true, name: 'Integrity', max: 5, min: 0, value } },
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

/** A command vehicle's record — `legacy`: written before AA20 (no reconcile stamp). */
function shipRecord({ record, legacy }) {
  const ship = { _id: 'ship-guid', name: 'Wayfarer', integrity: record, integrityMax: 5, battered: false, isCommandVehicle: true };
  return legacy ? ship : { ...ship, integritySheetReconciled: true };
}

function installCommandVehicle({ sheet, record, legacy = true }) {
  const asset = starshipAsset(sheet);
  const ship = makeTestActor({
    id: 'ship-1', type: 'starship', name: 'Wayfarer',
    system: { debility: { battered: false, cursed: false }, notes: '' },
    items: { contents: [asset] },
    flags: { [MODULE_ID]: { entityType: 'ship', entityId: 'ship-guid', ship: shipRecord({ record, legacy }) } },
  });
  game.actors._set('ship-1', ship);
  const campaignState = { shipIds: ['ship-1'], characterIds: [] };
  game.settings._store.set(`${MODULE_ID}.campaignState`, campaignState);
  return { ship, asset, campaignState };
}

const recordOf = (ship) => ship.flags[MODULE_ID].ship;
const notices = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.shipIntegrityReconciledNotice);

let savedUsers;
beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  ChatMessage._reset();
  savedUsers = game.users;
  game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], { get: () => null });
  game.user = { id: 'gm-1', isGM: true };
});
afterEach(() => { game.users = savedUsers; });

describe('a world played before AA20: the integrity the module recorded survives the upgrade', () => {
  it('control: a loss applied after the upgrade is on the sheet and the record alike', async () => {
    const { ship, asset } = installCommandVehicle({ sheet: 5, record: 5, legacy: false });
    await changeIntegrity('ship-1', -3);
    expect(asset.system.track.value).toBe(2);
    expect(recordOf(ship).integrity).toBe(2);
  });

  it('record 2 / sheet 5 (three losses the module applied before v1.8.1): the ship is not read as undamaged', () => {
    const { campaignState } = installCommandVehicle({ sheet: 5, record: 2 });
    // What the table was told last session — the narrator's line said 2/5,
    // Withstand Damage rolled +2.
    expect(getShip('ship-1')?.integrity, "the command vehicle's integrity").toBe(2);
    expect(getCommandVehicle(campaignState)?.integrity).toBe(2);
    expect(resolveStatValue(null, 'integrity', campaignState), "Withstand Damage's +integrity").toBe(2);
    expect(buildShipPositionLine(campaignState), "the narrator's COMMAND VEHICLE line").toContain('integrity 2/5');
  });

  it('record 2 / sheet 5: an unrelated ship write (a position move) puts the 2 in both stores and tells the GM', async () => {
    const { ship, asset } = installCommandVehicle({ sheet: 5, record: 2 });
    await updateShip('ship-1', { position: { locationName: 'Bleakhold', source: 'narrator' } });
    expect(recordOf(ship).integrity, 'the record').toBe(2);
    expect(asset.system.track.value, 'the Starship asset\'s Integrity track').toBe(2);
    expect(recordOf(ship).integritySheetReconciled).toBe(true);
    expect(notices()).toHaveLength(1);
    expect(notices()[0].content).toMatch(/recorded integrity 2\/5.*showed 5\/5.*2\/5/s);
    expect(notices()[0].whisper).toEqual(['gm-1']);
  });

  it('a loss taken before the reconcile is taken from the recorded 2, not the sheet\'s 5', async () => {
    const { ship, asset } = installCommandVehicle({ sheet: 5, record: 2 });
    await changeIntegrity('ship-1', -1);
    expect(asset.system.track.value).toBe(1);
    expect(recordOf(ship).integrity).toBe(1);
  });

  it('record 5 / sheet 3 (marked on the sheet only): the lower, the sheet\'s, is kept', async () => {
    const { ship, asset } = installCommandVehicle({ sheet: 3, record: 5 });
    expect(getShip('ship-1')?.integrity).toBe(3);
    await updateShip('ship-1', { position: { locationName: 'Bleakhold', source: 'narrator' } });
    expect({ record: recordOf(ship).integrity, sheet: asset.system.track.value }).toEqual({ record: 3, sheet: 3 });
    expect(notices()).toHaveLength(1);
  });

  it('control: once reconciled the sheet is canonical — a repair marked on the sheet is read, and mirrored', async () => {
    const { ship, asset } = installCommandVehicle({ sheet: 5, record: 3, legacy: false });
    expect(getShip('ship-1')?.integrity).toBe(5);
    await updateShip('ship-1', { position: { locationName: 'Bleakhold', source: 'narrator' } });
    expect({ record: recordOf(ship).integrity, sheet: asset.system.track.value }).toEqual({ record: 5, sheet: 5 });
    expect(notices()).toHaveLength(0);
  });

  it('control: a record and sheet that agree are stamped with nothing said', async () => {
    const { ship } = installCommandVehicle({ sheet: 4, record: 4 });
    await updateShip('ship-1', { position: { locationName: 'Bleakhold', source: 'narrator' } });
    expect(recordOf(ship).integritySheetReconciled).toBe(true);
    expect(notices()).toHaveLength(0);
  });

  it('a new ship record is born reconciled', () => {
    expect(ShipSchema.integritySheetReconciled).toBe(true);
  });
});

describe('the GM\'s world load reconciles each command vehicle once', () => {
  it('record 2 / sheet 5: both stores say 2 after the load, the GM is told once; a second load changes nothing', async () => {
    const { ship, asset } = installCommandVehicle({ sheet: 5, record: 2 });
    expect(await reconcileCommandVehicleIntegrity()).toEqual({ reconciled: 1 });
    expect({ record: recordOf(ship).integrity, sheet: asset.system.track.value }).toEqual({ record: 2, sheet: 2 });
    expect(notices()).toHaveLength(1);

    expect(await reconcileCommandVehicleIntegrity()).toEqual({ reconciled: 0 });
    expect(notices()).toHaveLength(1);
  });

  it('control: a player\'s client reconciles nothing', async () => {
    const { ship } = installCommandVehicle({ sheet: 5, record: 2 });
    game.user = { id: 'pl-1', isGM: false };
    expect(await reconcileCommandVehicleIntegrity()).toEqual({ reconciled: 0 });
    expect(recordOf(ship).integritySheetReconciled).toBeUndefined();
  });

  it('control: a starship with no STARSHIP asset keeps its integrity on the record', async () => {
    const ship = makeTestActor({
      id: 'ship-2', type: 'starship', name: 'Tug', system: { debility: {} }, items: { contents: [] },
      flags: { [MODULE_ID]: { entityType: 'ship', entityId: 'tug', ship: { _id: 'tug', name: 'Tug', integrity: 2, integrityMax: 5 } } },
    });
    game.actors._set('ship-2', ship);
    expect(await reconcileCommandVehicleIntegrity()).toEqual({ reconciled: 0 });
    expect(recordOf(ship).integrity).toBe(2);
  });
});

describe('the canonical GM\'s ready runs the reconcile', () => {
  let table;
  afterEach(async () => { await table?.teardown(); table = null; });

  it('a pre-AA20 command vehicle reads 2/5 on both stores once the world has loaded', async () => {
    table = await simulateTable({
      users: [USERS.GM], boot: false,
      world: { settings: { campaignState: { ...CampaignStateSchema, shipIds: ['ship-1'] } } },
    });
    const asset = starshipAsset(5);
    const ship = table.addActor({
      id: 'ship-1', type: 'starship', name: 'Wayfarer', hasPlayerOwner: false,
      system: { debility: { battered: false, cursed: false }, notes: '' },
      items: { contents: [asset] },
      flags: { [MODULE_ID]: { entityType: 'ship', entityId: 'ship-guid', ship: shipRecord({ record: 2, legacy: true }) } },
    });
    await table.client('gm-1').boot();
    await table.drain();

    expect({ record: ship.flags[MODULE_ID].ship.integrity, sheet: asset.system.track.value }).toEqual({ record: 2, sheet: 2 });
    expect(table.cards(f => f.shipIntegrityReconciledNotice)).toHaveLength(1);
  }, 30_000);
});
