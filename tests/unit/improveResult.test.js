/**
 * v1.7.11 finding G — post-roll "improve the result" affordance (e.g.
 * Fugitive). Unit scope mirrors burnMomentum.test.js: the eligibility builder,
 * the detector, and the button renderer. The click handler's meter-delta +
 * clock-advance mirror the burn path (unit-tested there) and are exercised
 * live via Quench, consistent with the burn affordance.
 */

import { describe, it, expect } from "vitest";
import { extractResultImprovement } from "../../src/moves/abilityScanner.js";
import { buildImproveState, renderImproveButtonHtml } from "../../src/moves/improveResult.js";

const MODULE = "starforged-companion";

function fugitiveAbility(over = {}) {
  return {
    assetId: "asset-fug", abilityIndex: 0, assetName: "Fugitive", abilityName: "",
    resultImprovement: { improveTo: "strong_hit" },
    hasClock: true, clockTicks: 0, clockMax: 4,
    ...over,
  };
}

function resolution(over = {}) {
  return {
    _id: "r1", moveId: "gather_information", outcome: "weak_hit",
    isMatch: false, isProgressMove: false,
    consequences: { momentumChange: 0, healthChange: 0, spiritChange: 0, supplyChange: 0 },
    ...over,
  };
}

const actor = { id: "pc-1" };

describe("extractResultImprovement", () => {
  it("detects Fugitive's 'improve the result to a strong hit'", () => {
    expect(extractResultImprovement("When you make a move, you may improve the result to a strong hit."))
      .toEqual({ improveTo: "strong_hit" });
  });
  it("detects 'count as a strong hit' / 'treat as a strong hit'", () => {
    expect(extractResultImprovement("you may count it as a strong hit")?.improveTo).toBe("strong_hit");
    expect(extractResultImprovement("treat the roll as a strong hit")?.improveTo).toBe("strong_hit");
  });
  it("does not fire on adds or reroll abilities", () => {
    expect(extractResultImprovement("When you make this move, add +1.")).toBeNull();
    expect(extractResultImprovement("you may reroll any dice")).toBeNull();
    expect(extractResultImprovement("")).toBeNull();
  });
});

describe("buildImproveState", () => {
  it("offers the upgrade on a weak hit with an applicable ability", () => {
    const state = buildImproveState(resolution(), [fugitiveAbility()], actor);
    expect(state?.canImprove).toBe(true);
    expect(state.improveTo).toBe("strong_hit");
    expect(state.assetId).toBe("asset-fug");
    expect(state.abilityIndex).toBe(0);
    expect(state.hasClock).toBe(true);
    expect(state.clockMax).toBe(4);
    expect(state.actorId).toBe("pc-1");
  });

  it("offers the upgrade on a miss too", () => {
    expect(buildImproveState(resolution({ outcome: "miss" }), [fugitiveAbility()], actor)?.canImprove).toBe(true);
  });

  it("returns null when the outcome is already a strong hit", () => {
    expect(buildImproveState(resolution({ outcome: "strong_hit" }), [fugitiveAbility()], actor)).toBeNull();
  });

  it("returns null when no ability offers a result improvement", () => {
    const plain = { assetId: "a", abilityIndex: 0, resultImprovement: null, hasClock: false };
    expect(buildImproveState(resolution(), [plain], actor)).toBeNull();
    expect(buildImproveState(resolution(), [], actor)).toBeNull();
  });

  it("returns null for progress moves and when no actor", () => {
    expect(buildImproveState(resolution({ isProgressMove: true }), [fugitiveAbility()], actor)).toBeNull();
    expect(buildImproveState(resolution(), [fugitiveAbility()], null)).toBeNull();
  });

  it("snapshots the original consequences for the click-time diff", () => {
    const state = buildImproveState(
      resolution({ consequences: { momentumChange: -1, healthChange: 0, spiritChange: 0, supplyChange: 0 } }),
      [fugitiveAbility()], actor,
    );
    expect(state.originalConsequences.momentumChange).toBe(-1);
    expect(state.originalApplied).toBe(false);
  });
});

describe("renderImproveButtonHtml", () => {
  it("returns '' when there is nothing to improve", () => {
    expect(renderImproveButtonHtml(null)).toBe("");
    expect(renderImproveButtonHtml({ canImprove: false })).toBe("");
  });
  it("labels the button with the asset and its clock cost", () => {
    const html = renderImproveButtonHtml({ canImprove: true, assetName: "Fugitive", hasClock: true, clockMax: 4 });
    expect(html).toContain('data-action="sf-improve-result"');
    expect(html).toContain("Improve to Strong Hit");
    expect(html).toContain("Fugitive");
    expect(html).toContain("fill 1 of 4");
  });
  it("omits the clock-cost text when the ability has no clock", () => {
    const html = renderImproveButtonHtml({ canImprove: true, assetName: "Loyalist", hasClock: false });
    expect(html).toContain("Improve to Strong Hit");
    expect(html).not.toContain("fill 1 of");
  });
});
