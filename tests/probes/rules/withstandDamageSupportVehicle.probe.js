/**
 * Probe — RULE-5 WITHSTAND-DAMAGE-COMMAND-VEHICLE-ONLY (eleventh audit, rules).
 *
 * Withstand Damage (vendored): "When your vehicle faces a damaging situation
 * or environment, suffer -1 integrity … Then, if your integrity is 0 or you
 * choose to resist the damage, roll +integrity." Its miss names three vehicle
 * kinds — command, support ("Mark the vehicle as battered or roll on the
 * table below. If the vehicle is destroyed, discard the asset") and
 * incidental. A support vehicle is an asset on the PC with its own Integrity
 * track (the Hoverbike, Rover, Skiff, Shuttle, Snub Fighter, Service Pod …).
 *
 * The roll's stat is always the command vehicle's integrity, and the roll's
 * vehicle (what its "-1 integrity" / "+1 integrity" choices change) is always
 * the command vehicle (statEnrichment.enrichInterpretationStatValue →
 * getCommandVehicleActor), whatever vehicle the narration names: Kira's
 * hoverbike crashing rolls +5 for the starship in orbit and dents it. The
 * module already reads a support vehicle's own Integrity track for the
 * Hoverbike's "add +integrity" (actorBridge.readAssetIntegrity —
 * VALUE-ADD-INTEGRITY), so the value is held — the Withstand Damage roll
 * just never asks for it. (A companion roll picks the PC's companion asset —
 * selectCompanionAsset; a vehicle roll has no such step.)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { enrichInterpretationStatValue } from '../../../src/moves/statEnrichment.js';
import { invalidateActorCache } from '../../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';

function kiraWithHoverbike() {
  return {
    id: 'pc-kira', name: 'Kira', type: 'character',
    system: {
      iron: 1, edge: 2, heart: 1, shadow: 1, wits: 2,
      health: { value: 5, max: 5 }, spirit: { value: 5, max: 5 }, supply: { value: 5, max: 5 },
      momentum: { value: 2, max: 10, min: -6, resetValue: 2 },
      debility: {},
    },
    items: { contents: [{
      id: 'asset-hoverbike', name: 'Hoverbike', type: 'asset',
      system: {
        category: 'Support Vehicle',
        abilities: [{ enabled: true, description: '<p>Your unarmed hoverbike provides speedy planetside ground transport …</p>' }],
        track: { enabled: true, name: 'Integrity', max: 3, value: 2, min: 0 },
        conditions: [{ name: 'Battered', ticked: false }],
      },
    }] },
    getFlag: () => undefined,
  };
}

beforeEach(() => {
  global.game.actors._reset();
  invalidateActorCache('pc-kira');
  // The command vehicle, in orbit, at integrity 5.
  global.game.actors._set('ship-1', { id: 'ship-1', type: 'starship', system: {},
    flags: { [MODULE_ID]: { ship: { isCommandVehicle: true, integrity: 5 } } } });
});

describe('RULE-5 Withstand Damage on a support vehicle', () => {
  it('control: the starship taking the hit rolls its integrity and names it as the roll\'s vehicle', () => {
    const interp = { moveId: 'withstand_damage', statUsed: 'integrity', moveTarget: 'the Starship',
      playerNarration: 'A micrometeor storm shreds the hull plating.' };
    enrichInterpretationStatValue(kiraWithHoverbike(), interp, { shipIds: ['ship-1'] });
    expect(interp).toMatchObject({ statValue: 5, vehicleActorId: 'ship-1' });
  });

  it('Kira\'s hoverbike taking the hit rolls the bike\'s integrity, not the starship\'s', () => {
    const interp = { moveId: 'withstand_damage', statUsed: 'integrity', moveTarget: 'Hoverbike',
      playerNarration: 'My hoverbike clips a boulder at full burn — I hold it together.' };
    enrichInterpretationStatValue(kiraWithHoverbike(), interp, { shipIds: ['ship-1'] });
    // The roll is +the bike's Integrity (2), and its consequences change the
    // bike — not the command vehicle's +5 and its record.
    expect({ statValue: interp.statValue, vehicle: interp.vehicleActorId ?? interp.vehicleItemId ?? null })
      .toEqual({ statValue: 2, vehicle: 'asset-hoverbike' });
  });
});
