/**
 * STARFORGED COMPANION
 * tests/unit/withstandDamageSupportVehicle.test.js
 *
 * Withstand Damage (vendored): "When your vehicle faces a damaging situation
 * or environment … roll +integrity." Its miss names three vehicle kinds —
 * command, support ("Mark the vehicle as battered or roll on the table below.
 * If the vehicle is destroyed, discard the asset") and incidental. A support
 * vehicle is an asset on the PC with its own Integrity track (the Hoverbike,
 * Rover, Skiff, Shuttle, Snub Fighter, Service Pod, Exosuit).
 *
 * The roll's stat was always the command vehicle's integrity, and the roll's
 * vehicle — what its "+1 integrity" / "-1 integrity" choices change — the
 * command vehicle too (enrichInterpretationStatValue → getCommandVehicleActor),
 * whatever vehicle the narration named: Kira's hoverbike crashing rolled +5
 * for the starship in orbit and dented it (issue #342 Z53). A support
 * vehicle the move names is now the roll's: its track is the stat, and the
 * interpretation carries it (`vehicleItemId`) for its choices
 * (consequenceTargets.test.js drives those through the pipeline).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enrichInterpretationStatValue } from '../../src/moves/statEnrichment.js';
import {
  invalidateActorCache, listSupportVehicleAssets, readVehicleAssetBattered, applyVehicleAssetIntegrityChange,
} from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';

/** A vendor-shaped support vehicle (json-packs/starforged-assets/Hoverbike). */
function hoverbike({ value = 2, battered = false } = {}) {
  const item = {
    id: 'asset-hoverbike', name: 'Hoverbike', type: 'asset',
    system: {
      category: 'Support Vehicle',
      abilities: [{ enabled: true, description: '<p>Your unarmed hoverbike provides speedy planetside ground transport …</p>' }],
      track: { enabled: true, name: 'Integrity', max: 3, value, min: 0 },
      conditions: [{ name: 'Battered', ticked: battered }],
    },
    update: vi.fn(async (changes) => {
      if ('system.track.value' in changes) item.system.track.value = changes['system.track.value'];
    }),
  };
  return item;
}

function kiraWith(...items) {
  return {
    id: 'pc-kira', name: 'Kira', type: 'character',
    system: {
      iron: 1, edge: 2, heart: 1, shadow: 1, wits: 2,
      health: { value: 5, max: 5 }, spirit: { value: 5, max: 5 }, supply: { value: 5, max: 5 },
      momentum: { value: 2, max: 10, min: -6, resetValue: 2 },
      debility: {},
    },
    items: { contents: items },
    getFlag: () => undefined,
  };
}

const kiraWithHoverbike = () => kiraWith(hoverbike());

beforeEach(() => {
  global.game.actors._reset();
  invalidateActorCache('pc-kira');
  // The command vehicle, in orbit, at integrity 5.
  global.game.actors._set('ship-1', { id: 'ship-1', type: 'starship', system: {},
    flags: { [MODULE_ID]: { ship: { isCommandVehicle: true, integrity: 5 } } } });
});

describe('Withstand Damage on a support vehicle (issue #342 Z53)', () => {
  it('control: the starship taking the hit rolls its integrity and names it as the roll\'s vehicle', () => {
    const interp = { moveId: 'withstand_damage', statUsed: 'integrity', moveTarget: 'the Starship',
      playerNarration: 'A micrometeor storm shreds the hull plating.' };
    enrichInterpretationStatValue(kiraWithHoverbike(), interp, { shipIds: ['ship-1'] });
    expect(interp).toMatchObject({ statValue: 5, vehicleActorId: 'ship-1' });
    expect(interp.vehicleItemId).toBeUndefined();
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

  // issue #345 AA14: a target that names nothing is the interpreter's word for
  // the command starship ("null for the command starship") — the narration no
  // longer names the vehicle: a support vehicle the line merely mentions took
  // the starship's hit ("An enemy fighter rakes the Wayfarer's hull" → the
  // Snub Fighter). It was "a target that names nothing leaves the narration
  // to name the bike".
  it('a target that names nothing is the command starship\'s, whatever vehicle the narration mentions', () => {
    const interp = { moveId: 'withstand_damage', statUsed: 'integrity', moveTarget: null,
      playerNarration: 'The hoverbike skids across the scree.' };
    enrichInterpretationStatValue(kiraWithHoverbike(), interp, { shipIds: ['ship-1'] });
    expect(interp).toMatchObject({ statValue: 5, vehicleActorId: 'ship-1' });
    expect(interp.vehicleItemId).toBeUndefined();
  });

  it('a target naming the starship keeps the starship, whatever else the narration mentions', () => {
    const interp = { moveId: 'withstand_damage', statUsed: 'integrity', moveTarget: 'the Wayfarer',
      playerNarration: 'The Wayfarer shudders as the hoverbike breaks loose in the hold.' };
    enrichInterpretationStatValue(kiraWithHoverbike(), interp, { shipIds: ['ship-1'] });
    expect(interp).toMatchObject({ statValue: 5, vehicleActorId: 'ship-1' });
    expect(interp.vehicleItemId).toBeUndefined();
  });

  it('a sole support vehicle nothing names is not guessed: the command vehicle rolls', () => {
    const interp = { moveId: 'withstand_damage', statUsed: 'integrity', moveTarget: null,
      playerNarration: 'Something slams into us at speed.' };
    enrichInterpretationStatValue(kiraWithHoverbike(), interp, { shipIds: ['ship-1'] });
    expect(interp).toMatchObject({ statValue: 5, vehicleActorId: 'ship-1' });
  });

  it('a Command Vehicle asset is never a support vehicle (its integrity is the ship record\'s)', () => {
    const starshipAsset = { id: 'asset-starship', name: 'Starship', type: 'asset',
      system: { category: 'Command Vehicle', track: { enabled: true, name: 'Integrity', max: 5, value: 1, min: 0 } } };
    const kira = kiraWith(starshipAsset, hoverbike());
    expect(listSupportVehicleAssets(kira).map(i => i.id)).toEqual(['asset-hoverbike']);
    const interp = { moveId: 'withstand_damage', statUsed: 'integrity', moveTarget: 'the Starship' };
    enrichInterpretationStatValue(kira, interp, { shipIds: ['ship-1'] });
    expect(interp).toMatchObject({ statValue: 5, vehicleActorId: 'ship-1' });
  });
});

describe('a support vehicle\'s integrity writer (actorBridge)', () => {
  it('changes the asset\'s track within its bounds, and reports what it did', async () => {
    const bike = hoverbike({ value: 2 });
    const kira = kiraWith(bike);
    expect(await applyVehicleAssetIntegrityChange(kira, 1, { itemId: bike.id }))
      .toMatchObject({ ok: true, itemId: 'asset-hoverbike', before: 2, after: 3 });
    expect(await applyVehicleAssetIntegrityChange(kira, 1, { itemId: bike.id }))
      .toMatchObject({ ok: true, before: 3, after: 3 });
    expect(bike.update).toHaveBeenCalledTimes(1);
    expect(bike.system.track.value).toBe(3);
  });

  it('a battered vehicle\'s integrity is not raised; a loss still lands', async () => {
    const bike = hoverbike({ value: 2, battered: true });
    const kira = kiraWith(bike);
    expect(readVehicleAssetBattered(kira, bike.id)).toBe(true);
    expect(await applyVehicleAssetIntegrityChange(kira, 1, { itemId: bike.id }))
      .toMatchObject({ ok: false, reason: 'battered' });
    expect(await applyVehicleAssetIntegrityChange(kira, -1, { itemId: bike.id }))
      .toMatchObject({ ok: true, before: 2, after: 1 });
  });

  it('no such vehicle, or a refused write, is reported — never thrown', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bike = hoverbike();
    bike.update = vi.fn(async () => { throw new Error('refused by the test'); });
    const kira = kiraWith(bike);
    expect(readVehicleAssetBattered(kira, 'gone')).toBeNull();
    expect(await applyVehicleAssetIntegrityChange(kira, -1, { itemId: 'gone' })).toEqual({ ok: false, reason: 'no-vehicle' });
    expect(await applyVehicleAssetIntegrityChange(kira, -1, { itemId: bike.id }))
      .toMatchObject({ ok: false, reason: 'refused', before: 2 });
  });
});
