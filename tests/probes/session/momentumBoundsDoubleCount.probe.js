/**
 * PROBE — actorBridge writes the vendor's impact-ADJUSTED momentum bounds back
 * into the BASE fields (`system.momentum.max` / `system.momentum.resetValue`),
 * which the vendor's getters then reduce by the impact count a second time.
 *
 * Vendor contract (vendor/foundry-ironsworn/src/module/actor/subtypes/character.ts):
 *   get momentumMax()   = clamp(momentum.max        - #impactCount, -6, 10)
 *   get momentumReset() = clamp(momentum.resetValue - #impactCount,  0, momentum.max)
 * `momentum.max` (10) and `momentum.resetValue` (2) are base values
 * (MeterField.ts: "use the getter Actor.system.momentumReset instead"), and the
 * vendor sheet's momentum meter shows `$actor.system.momentumMax` /
 * `momentumReset` (momentum-meter.vue).
 *
 * actorBridge.momentumBounds() prefers those getters, so
 * recalculateMomentumBounds() / applyMeterChanges() write e.g. 9 into
 * momentum.max with one impact marked — and the sheet then shows 8.
 *
 * These assertions state the CORRECT (rulebook) behaviour, so they fail today.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setDebility,
  applyMeterChanges,
  recalculateMomentumBounds,
  readMomentumState,
  invalidateActorCache,
} from '../../../src/character/actorBridge.js';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** A character whose `system` carries the vendor CharacterModel's two getters. */
function vendorCharacter({ id = 'pc-1', momentum = 2, debility = {} } = {}) {
  const actor = makeTestActor({ id, system: { momentum: { value: momentum }, debility } });
  const sys = actor.system;
  // #impactCount: every debility value === true (character.ts)
  const impactCount = () => Object.values(sys.debility).filter(v => v === true).length;
  Object.defineProperty(sys, 'momentumMax', {
    configurable: true,
    get: () => clamp(sys.momentum.max - impactCount(), -6, 10),
  });
  Object.defineProperty(sys, 'momentumReset', {
    configurable: true,
    get: () => clamp(sys.momentum.resetValue - impactCount(), 0, sys.momentum.max),
  });
  invalidateActorCache(actor.id);
  game.actors._set(actor.id, actor);
  return actor;
}

beforeEach(() => {
  game.actors._reset();
});

describe('PROBE MOMENTUM-BOUNDS-DOUBLE-COUNT', () => {
  it('marking one impact gives max momentum 9 / reset +1 (rulebook), and clearing it restores 10 / +2', async () => {
    const pc = vendorCharacter({ momentum: 5 });
    expect(pc.system.momentumMax).toBe(10);
    expect(pc.system.momentumReset).toBe(2);

    await setDebility(pc, 'wounded', true);          // → recalculateMomentumBounds
    expect(pc.system.momentumMax).toBe(9);           // actual today: 8
    expect(pc.system.momentumReset).toBe(1);         // actual today: 0

    await setDebility(pc, 'wounded', false);
    expect(pc.system.momentumMax).toBe(10);          // actual today: 9 (permanent loss)
    expect(pc.system.momentumReset).toBe(2);         // actual today: 1
  });

  it('a wounded PC gaining momentum three times keeps max 9 / reset +1', async () => {
    const pc = vendorCharacter({ momentum: 2, debility: { wounded: true } });
    expect(pc.system.momentumMax).toBe(9);

    await applyMeterChanges(pc, { momentum: 1 });
    await applyMeterChanges(pc, { momentum: 1 });
    await applyMeterChanges(pc, { momentum: 1 });

    expect(pc.system.momentum.value).toBe(5);
    expect(pc.system.momentumMax).toBe(9);           // actual today: 6 (one lower per write)
    expect(pc.system.momentumReset).toBe(1);         // actual today: 0
    // What a Burn Momentum resets to (burnMomentum.js reads readMomentumState)
    expect(readMomentumState(pc).reset).toBe(1);     // actual today: 0
  });

  it('the canonical GM recalc after a sheet impact edit (updateActor hook) does not shrink the bounds', async () => {
    // The vendor sheet toggles the impact directly; index.js's updateActor
    // hook then runs recalculateMomentumBounds on one client.
    const pc = vendorCharacter({ momentum: 3 });
    await pc.update({ 'system.debility.shaken': true, 'system.debility.unprepared': true });
    await recalculateMomentumBounds(pc);
    expect(pc.system.momentumMax).toBe(8);           // actual today: 6
    expect(pc.system.momentumReset).toBe(0);
    // Clearing both on the sheet → recalc again
    await pc.update({ 'system.debility.shaken': false, 'system.debility.unprepared': false });
    await recalculateMomentumBounds(pc);
    expect(pc.system.momentumMax).toBe(10);          // actual today: 8
    expect(pc.system.momentumReset).toBe(2);         // actual today: 0
  });
});
