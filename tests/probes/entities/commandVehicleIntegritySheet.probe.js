/**
 * PROBE — ENT: COMMAND-VEHICLE-INTEGRITY-OFF-SHEET (twelfth audit, 2026-11-09)
 *
 * The command vehicle's integrity lives in two stores that never meet:
 *   - the vendor's: the STARSHIP asset (category "Command Vehicle") on the
 *     starship Actor carries an enabled condition track named Integrity
 *     (vendor json-packs/starforged-assets/Starship_21d5a48992b8eb81.json:
 *     `track: { enabled: true, name: "Integrity", max: 5, value: 5 }`) — the
 *     meter the starship sheet's Assets tab shows and the player marks
 *     (vendor src/module/vue/starship-sheet.vue renders PlayerAssets). It is
 *     the very asset the module keys the command vehicle on
 *     (ship.js actorHasCommandVehicleAsset / syncCommandVehicleFlag);
 *   - the module's: `flags.starforged-companion.ship.integrity` on the same
 *     Actor (ship.js ShipSchema.integrity), shown only in the Entities panel.
 * Every module reader and writer uses the flag alone: changeIntegrity /
 * updateShip (ship.js:420 / :315 — Withstand Damage's choices, asset riders,
 * !repair), getCommandVehicle → the narrator's COMMAND VEHICLE line, and the
 * Withstand Damage roll's +integrity (statEnrichment.resolveStatValue:414,
 * whose comment says the starship "has no native integrity field" — true of
 * the Actor's own schema, not of its STARSHIP asset). Since issue #342 Z53 a
 * SUPPORT vehicle's integrity is its asset's Integrity track (actorBridge
 * readAssetIntegrity / applyVehicleAssetIntegrityChange) — the command
 * vehicle's is the one that is not.
 *
 * So the sheet and the module disagree as soon as either changes it: a
 * Withstand Damage loss the module applies never reaches the sheet's STARSHIP
 * card, and integrity the player marks there (the vendor's own Withstand
 * Damage roll, a sheet edit after a fight) never reaches the module's next
 * Withstand Damage roll or the narrator. The same split was fixed for the
 * ship's impacts by naming the native field canonical (decisions.md →
 * "Starship battered: the native sheet field is canonical"; REPAIR-BATTERED-FLAG).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { changeIntegrity, getCommandVehicle } from '../../../src/entities/ship.js';
import { resolveStatValue } from '../../../src/moves/statEnrichment.js';

const MODULE_ID = 'starforged-companion';

/** The vendor STARSHIP asset as the compendium ships it, embedded on the starship. */
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

/** The crew's command vehicle: the STARSHIP asset on its sheet, the module's record on its flag. */
function installCommandVehicle({ sheet = 5, record = 5 } = {}) {
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

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
});

describe('ENT probe — the command vehicle\'s integrity and its starship sheet', () => {
  it('a Withstand Damage loss the module applies (changeIntegrity −2) shows on the sheet\'s STARSHIP card', async () => {
    const { asset } = installCommandVehicle({ sheet: 5, record: 5 });

    const res = await changeIntegrity('ship-1', -2);
    expect(res, 'the module applied it (setup)').toMatchObject({ ok: true, before: 5, after: 3 });

    expect(asset.system.track.value, "the starship sheet's Integrity").toBe(3);
  });

  it('integrity the player marked on the sheet (2) is what the next Withstand Damage rolls and the narrator reads', () => {
    const { campaignState } = installCommandVehicle({ sheet: 2, record: 5 });

    expect.soft(getCommandVehicle(campaignState)?.integrity, "the narrator's COMMAND VEHICLE integrity").toBe(2);
    expect(resolveStatValue(null, 'integrity', campaignState), "Withstand Damage's +integrity").toBe(2);
  });

  it('control: the module reads back its own write', async () => {
    const { campaignState } = installCommandVehicle({ sheet: 5, record: 5 });
    await changeIntegrity('ship-1', -2);
    expect(getCommandVehicle(campaignState)?.integrity).toBe(3);
    expect(resolveStatValue(null, 'integrity', campaignState)).toBe(3);
  });
});
