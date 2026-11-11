/* global makeTestActor */
/**
 * REG2 probe — issue #345 AA20's fix on a world played before it.
 *
 * Before AA20 the module read and wrote the command vehicle's integrity on
 * `flags.starforged-companion.ship.integrity` alone: every loss it applied
 * (Withstand Damage's "-1 integrity", an asset rider, `changeIntegrity`) went
 * there and never reached the STARSHIP asset's Integrity track on the sheet.
 * A world played that way holds record = 2, sheet = 5 (the track's untouched
 * compendium default).
 *
 * AA20 made the sheet's track canonical with no carry-over of the record: on
 * the first load after the upgrade every reader says 5, and the first
 * updateShip — a position write, made by the next narration that moves the
 * ship — overwrites the record's 2 with 5. The damage the module recorded is
 * gone, and nothing says so.
 *
 * Fixture and helpers follow tests/unit/commandVehicleIntegrityOnSheet.test.js.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { changeIntegrity, getCommandVehicle, getShip, updateShip } from '../../../src/entities/ship.js';
import { resolveStatValue } from '../../../src/moves/statEnrichment.js';
import { buildShipPositionLine } from '../../../src/narration/narratorPrompt.js';

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

function installCommandVehicle({ sheet, record }) {
  const asset = starshipAsset(sheet);
  const ship = makeTestActor({
    id: 'ship-1', type: 'starship', name: 'Wayfarer',
    system: { debility: { battered: false, cursed: false }, notes: '' },
    items: { contents: [asset] },
    flags: {
      [MODULE_ID]: {
        entityType: 'ship', entityId: 'ship-guid',
        ship: { _id: 'ship-guid', name: 'Wayfarer', integrity: record, integrityMax: 5, battered: false, isCommandVehicle: true },
      },
    },
  });
  game.actors._set('ship-1', ship);
  const campaignState = { shipIds: ['ship-1'], characterIds: [] };
  game.settings._store.set(`${MODULE_ID}.campaignState`, campaignState);
  return { ship, asset, campaignState };
}

const recordIntegrity = (ship) => ship.flags[MODULE_ID].ship.integrity;

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
});

describe('REG2 — a world played before AA20: the integrity the module recorded survives the upgrade', () => {
  it('control: a loss applied after the upgrade is on the sheet and the record alike', async () => {
    const { ship, asset } = installCommandVehicle({ sheet: 5, record: 5 });
    await changeIntegrity('ship-1', -3);
    expect(asset.system.track.value).toBe(2);
    expect(recordIntegrity(ship)).toBe(2);
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

  it('record 2 / sheet 5: an unrelated ship write (a position move) does not erase the recorded 2 from both stores', async () => {
    const { ship, asset } = installCommandVehicle({ sheet: 5, record: 2 });
    await updateShip('ship-1', { position: { locationName: 'Bleakhold', source: 'narrator' } });
    // One of the two stores must still hold the damage the module recorded.
    expect(Math.min(recordIntegrity(ship), asset.system.track.value),
      'the recorded damage survives in at least one store').toBe(2);
  });
});
