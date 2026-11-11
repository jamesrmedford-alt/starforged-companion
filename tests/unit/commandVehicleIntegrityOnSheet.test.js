/* global makeTestActor */
/**
 * Issue #345 AA20 COMMAND-VEHICLE-INTEGRITY-OFF-SHEET.
 *
 * The command vehicle's integrity lived in two stores that never met:
 *   - the vendor's: the STARSHIP asset (category "Command Vehicle") on the
 *     starship Actor carries an enabled condition track named Integrity
 *     (vendor json-packs/starforged-assets/Starship_21d5a48992b8eb81.json:
 *     `track: { enabled: true, name: "Integrity", max: 5, value: 5 }`) — the
 *     meter the starship sheet's Assets tab shows, the player marks and the
 *     vendor's own Withstand Damage rolls. It is the very asset the module
 *     keys the command vehicle on (ship.js actorHasCommandVehicleAsset);
 *   - the module's: `flags.starforged-companion.ship.integrity`.
 * Every module reader and writer used the flag alone (changeIntegrity /
 * updateShip, getCommandVehicle, the narrator's COMMAND VEHICLE line, the
 * Withstand Damage roll's +integrity), so a loss the module applied never
 * reached the sheet, and integrity the player marked there was not what the
 * next Withstand Damage rolled or the narrator said.
 *
 * Now the STARSHIP asset's track is canonical (as the native impact fields
 * are for battered — decisions.md "Starship battered: the native sheet field
 * is canonical"): getShip and the roll read it, updateShip writes it first
 * and keeps the record's copy as its mirror; a starship with no STARSHIP
 * asset keeps its integrity on the record.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { changeIntegrity, getCommandVehicle, getShip, repairIntegrity, updateShip } from '../../src/entities/ship.js';
import { resolveStatValue } from '../../src/moves/statEnrichment.js';
import { buildShipPositionLine } from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';

/** The vendor STARSHIP asset as the compendium ships it, embedded on the starship. */
function starshipAsset(value, { refuse = false } = {}) {
  const item = {
    id: 'asset-starship', type: 'asset', name: 'Starship',
    system: { category: 'Command Vehicle', track: { enabled: true, name: 'Integrity', max: 5, min: 0, value } },
    flags: {},
    async update(changes) {
      if (refuse) throw new Error('permission denied');
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

/** The crew's command vehicle: the STARSHIP asset on its sheet (unless `noAsset`), the module's record on its flag. */
function installCommandVehicle({ sheet = 5, record = 5, noAsset = false, refuse = false } = {}) {
  const asset = noAsset ? null : starshipAsset(sheet, { refuse });
  const ship = makeTestActor({
    id: 'ship-1', type: 'starship', name: 'Wayfarer',
    system: { debility: { battered: false, cursed: false }, notes: '' },
    items: { contents: asset ? [asset] : [] },
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

describe("issue #345 AA20 — the command vehicle's integrity is its starship sheet's", () => {
  it("a Withstand Damage loss the module applies (changeIntegrity −2) shows on the sheet's STARSHIP card, and the record mirrors it", async () => {
    const { ship, asset } = installCommandVehicle({ sheet: 5, record: 5 });

    const res = await changeIntegrity('ship-1', -2);
    expect(res, 'the module applied it').toMatchObject({ ok: true, before: 5, after: 3 });

    expect(asset.system.track.value, "the starship sheet's Integrity").toBe(3);
    expect(recordIntegrity(ship), 'the record mirrors it').toBe(3);
  });

  it('integrity the player marked on the sheet (2) is what the next Withstand Damage rolls, the narrator reads and the next loss starts from', async () => {
    const { ship, asset, campaignState } = installCommandVehicle({ sheet: 2, record: 5 });

    expect(getCommandVehicle(campaignState)?.integrity, "the command vehicle's integrity").toBe(2);
    expect(resolveStatValue(null, 'integrity', campaignState), "Withstand Damage's +integrity").toBe(2);
    expect(buildShipPositionLine(campaignState), "the narrator's COMMAND VEHICLE line").toContain('integrity 2/5');

    const res = await changeIntegrity('ship-1', -1);
    expect(res).toMatchObject({ ok: true, before: 2, after: 1 });
    expect(asset.system.track.value).toBe(1);
    expect(recordIntegrity(ship)).toBe(1);
  });

  it('a repair raises the sheet\'s track, capped by its max', async () => {
    const { asset } = installCommandVehicle({ sheet: 3, record: 5 });
    const updated = await repairIntegrity('ship-1', 4);
    expect(asset.system.track.value).toBe(5);
    expect(updated).toMatchObject({ integrity: 5, integrityMax: 5 });
  });

  it('any record write brings the mirror to the sheet', async () => {
    const { ship } = installCommandVehicle({ sheet: 2, record: 5 });
    await updateShip('ship-1', { mission: 'Chart the Rift' });
    expect(recordIntegrity(ship)).toBe(2);
  });

  it('a sheet write the world refuses is reported, and the record is left as it was', async () => {
    const { ship, asset } = installCommandVehicle({ sheet: 4, record: 4, refuse: true });
    const res = await changeIntegrity('ship-1', -1);
    expect(res).toMatchObject({ ok: false, reason: 'refused', before: 4 });
    expect(asset.system.track.value).toBe(4);
    expect(recordIntegrity(ship)).toBe(4);
  });

  it('control: the module reads back its own write', async () => {
    const { campaignState } = installCommandVehicle({ sheet: 5, record: 5 });
    await changeIntegrity('ship-1', -2);
    expect(getCommandVehicle(campaignState)?.integrity).toBe(3);
    expect(resolveStatValue(null, 'integrity', campaignState)).toBe(3);
  });

  it('control: a starship with no STARSHIP asset keeps its integrity on the record', async () => {
    const { ship, campaignState } = installCommandVehicle({ record: 4, noAsset: true });
    expect(getShip('ship-1')?.integrity).toBe(4);
    expect(resolveStatValue(null, 'integrity', campaignState)).toBe(4);
    await changeIntegrity('ship-1', -1);
    expect(recordIntegrity(ship)).toBe(3);
  });
});
