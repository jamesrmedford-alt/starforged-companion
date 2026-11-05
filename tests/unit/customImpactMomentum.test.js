/**
 * STARFORGED COMPANION
 * tests/unit/customImpactMomentum.test.js
 *
 * READDEBILITIES-CUSTOM-COMMENT (found while fixing issue #336). The
 * foundry-ironsworn character's `debility` schema has two custom impacts
 * beside its named thirteen — `custom1` / `custom2`, named by `custom1name` /
 * `custom2name` (vendor src/module/actor/subtypes/character.ts) — and its
 * `#impactCount` counts every marked one toward `momentumMax` /
 * `momentumReset`. actorBridge's comment said the vendor schema had no such
 * fields, and the bridge's own momentum fallback (`momentumBounds`, used when
 * the system's getters are absent) counted the thirteen only: a marked custom
 * impact left max momentum at 10 and the reset at +2. It counts them now, as
 * the vendor does; `readDebilities` — the narrator's Impacts line — still
 * lists the named impacts only (a custom one's name is the sheet's).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  readMomentumState,
  readCharacterSnapshot,
  readDebilities,
  applyMeterChanges,
  recalculateMomentumBounds,
  invalidateActorCache,
} from "../../src/character/actorBridge.js";

/** A PC with no system getters — the bridge's fallback derives the bounds. */
function pc(debility, momentum = 2) {
  const actor = makeTestActor({ id: `pc-${Math.random().toString(36).slice(2, 8)}`, type: "character", name: "Kira",
    system: { momentum: { value: momentum, max: 10, resetValue: 2 }, debility } });
  game.actors._set(actor.id, actor);
  invalidateActorCache(actor.id);
  return actor;
}

/** foundry-ironsworn's CharacterModel getters: the bases less every marked impact (#impactCount). */
function withVendorGetters(actor) {
  const sys = actor.system;
  const impacts = () => Object.values(sys.debility).filter(v => v === true).length;
  Object.defineProperties(sys, {
    momentumMax:   { configurable: true, get: () => Math.min(10, Math.max(-6, sys.momentum.max - impacts())) },
    momentumReset: { configurable: true, get: () => Math.min(sys.momentum.max, Math.max(0, sys.momentum.resetValue - impacts())) },
  });
  return actor;
}

describe("a marked custom impact counts toward the momentum bounds, as the vendor counts it", () => {
  beforeEach(() => { game.actors._reset(); });

  it("custom1 marked: max 9, reset +1 — one impact", () => {
    expect(readMomentumState(pc({ custom1: true, custom1name: "Haunted" }))).toMatchObject({ max: 9, reset: 1, impactCount: 1 });
  });

  it("both custom impacts and wounded: max 7, reset 0 — three impacts", () => {
    expect(readMomentumState(pc({ custom1: true, custom2: true, wounded: true }))).toMatchObject({ max: 7, reset: 0, impactCount: 3 });
  });

  it("the snapshot's bounds follow, and the bridge's fallback agrees with the vendor's getters", () => {
    const debility = { custom2: true, custom2name: "Marked by the Forge", doomed: true };
    const fallback = readCharacterSnapshot(pc(debility));
    const vendor   = readCharacterSnapshot(withVendorGetters(pc(debility)));
    expect([fallback.momentumMax, fallback.momentumReset]).toEqual([8, 0]);
    expect([fallback.momentumMax, fallback.momentumReset]).toEqual([vendor.momentumMax, vendor.momentumReset]);
  });

  it("a momentum gain is clamped to the custom-impact-reduced maximum", async () => {
    const kira = pc({ custom1: true }, 9);
    await applyMeterChanges(kira, { momentum: 1 });
    expect(kira.system.momentum.value).toBe(9);
  });

  it("marking a custom impact on the sheet clamps momentum to the new maximum", async () => {
    const kira = pc({ custom1: false }, 10);
    kira.system.debility.custom1 = true;
    await recalculateMomentumBounds(kira);
    expect(kira.system.momentum.value).toBe(9);
  });

  it("control: a custom impact's name alone marks nothing", () => {
    expect(readMomentumState(pc({ custom1: false, custom1name: "Haunted" }))).toMatchObject({ max: 10, reset: 2, impactCount: 0 });
  });

  it("control: readDebilities — the narrator's Impacts line — lists the named impacts only", () => {
    const debs = readDebilities(pc({ custom1: true, custom2: true, wounded: true }));
    expect(debs).not.toHaveProperty("custom1");
    expect(debs).not.toHaveProperty("custom2");
    expect(debs.wounded).toBe(true);
  });
});
