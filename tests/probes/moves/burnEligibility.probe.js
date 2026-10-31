/**
 * PROBE (moves audit) — Burn Momentum eligibility vs the rules.
 *
 * Rules (quoted in burnMomentum.js's own header, Reference Guide p.117):
 * "When you make a move and roll the action die, you may burn momentum … You
 * must burn momentum before applying any other effects of the move."
 *
 *  BURN-NO-ROLL-MOVE — resolveMove rolls dice for every non-progress move,
 *    no-roll moves included (Reach a Milestone, Forsake Your Vow, Face Defeat,
 *    an un-bonded Develop Your Relationship, Lose Momentum, …). buildBurnState
 *    excludes only progress moves, so their cards offer 🔥 Burn Momentum: the
 *    press resets momentum and changes nothing (the consequences do not depend
 *    on the dice).
 *
 *  BURN-COUNTS-OUTCOME-MOMENTUM — buildBurnState burns `momentum + the original
 *    outcome's own momentumChange` (handleBurnClick the live value after the
 *    persist, "this includes its change"). A weak hit's +1 momentum is then
 *    spent to replace that very weak hit: at momentum 5 against [3, 5] a burn
 *    cannot improve the weak hit, but the card offers "6 → Strong Hit".
 */

import { describe, it, expect, beforeEach } from "vitest";
import { buildBurnState } from "../../../src/moves/burnMomentum.js";

beforeEach(() => { game.actors._reset(); });

function pc(momentum) {
  return makeTestActor({
    id: "pc-probe", type: "character", hasPlayerOwner: true,
    system: { momentum: { value: momentum, max: 10, min: -6, resetValue: 2 }, debility: {} },
  });
}

describe("BURN-NO-ROLL-MOVE", () => {
  it("control: an action roll's weak hit can be burned to a strong hit", () => {
    const burn = buildBurnState({
      moveId: "face_danger", statUsed: "edge", outcome: "weak_hit", isMatch: false, isProgressMove: false,
      actionDie: 2, actionScore: 3, challengeDice: [2, 5],
      consequences: { momentumChange: 0, sufferPrompt: { kind: "any", amount: 1, count: 1 } },
    }, pc(8));
    expect(burn?.canBurn).toBe(true);
  });

  it("Reach a Milestone (no roll) offers no Burn Momentum, whatever the dice the pipeline rolled", () => {
    const burn = buildBurnState({
      moveId: "reach_a_milestone", statUsed: null, statValue: 0, outcome: "weak_hit", isMatch: false,
      isProgressMove: false, actionDie: 3, actionScore: 3, challengeDice: [2, 5],
      consequences: { momentumChange: 0, reachMilestone: true },
    }, pc(8));
    expect(burn).toBeNull();
  });

  it("Face Defeat (no roll) offers no Burn Momentum", () => {
    const burn = buildBurnState({
      moveId: "face_defeat", statUsed: null, statValue: 0, outcome: "miss", isMatch: false,
      isProgressMove: false, actionDie: 1, actionScore: 1, challengeDice: [3, 6],
      consequences: { momentumChange: 0, endCombat: true, routePayThePrice: true },
    }, pc(8));
    expect(burn).toBeNull();
  });
});

describe("BURN-COUNTS-OUTCOME-MOMENTUM", () => {
  it("control: momentum that beats both dice before the move's effects can burn a weak hit", () => {
    const burn = buildBurnState({
      moveId: "gather_information", statUsed: "wits", outcome: "weak_hit", isMatch: false, isProgressMove: false,
      actionDie: 2, actionScore: 4, challengeDice: [3, 5],
      consequences: { momentumChange: 1 },
    }, pc(6));
    expect(burn?.canBurn).toBe(true);
  });

  it("the weak hit's own +1 momentum is not counted toward burning that weak hit away", () => {
    // Momentum 5 when rolling: 5 beats 3 but not 5 — a burn leaves it a weak hit.
    // The pipeline builds this before persisting, so the actor still holds 5.
    const burn = buildBurnState({
      moveId: "gather_information", statUsed: "wits", outcome: "weak_hit", isMatch: false, isProgressMove: false,
      actionDie: 2, actionScore: 4, challengeDice: [3, 5],
      consequences: { momentumChange: 1 },
    }, pc(5));
    expect(burn).toBeNull();     // today: { canBurn: true, momentum: 6, previewOutcome: "strong_hit" }
  });
});
