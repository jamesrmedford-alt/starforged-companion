/**
 * STARFORGED COMPANION
 * tests/unit/milestone.test.js
 *
 * Pure-logic coverage for Reach a Milestone vow selection + the result-card
 * suggestion gate. The GM-gated mark + card posting (applyReachMilestone,
 * the picker, the suggestion button) are wired in index.js and exercised via
 * Quench; this file pins the decision logic that both paths share.
 */

import { describe, it, expect } from "vitest";
import {
  selectMilestoneVow,
  planReachMilestone,
  milestoneTicks,
  buildMilestoneSuggestion,
  MILESTONE_SUGGEST_CATEGORIES,
} from "../../src/moves/milestone.js";

const vow = (over = {}) => ({ id: "v1", name: "Save Dani", rank: "dangerous", completed: false, ...over });

// ── milestoneTicks ────────────────────────────────────────────────────────────

describe("milestoneTicks", () => {
  it("maps rank to ticks via RANK_TICKS", () => {
    expect(milestoneTicks("troublesome")).toBe(12);
    expect(milestoneTicks("dangerous")).toBe(8);
    expect(milestoneTicks("formidable")).toBe(4);
    expect(milestoneTicks("extreme")).toBe(2);
    expect(milestoneTicks("epic")).toBe(1);
  });

  it("maps the numeric ChallengeRank the live ironsworn schema stores", () => {
    // foundry-ironsworn persists rank as a number (Troublesome=1 … Epic=5);
    // a live readVows() returns that number, so the lookup must handle it.
    expect(milestoneTicks(1)).toBe(12);
    expect(milestoneTicks(2)).toBe(8);
    expect(milestoneTicks(3)).toBe(4);
    expect(milestoneTicks(4)).toBe(2);
    expect(milestoneTicks(5)).toBe(1);
  });

  it("defaults unknown ranks to formidable (4)", () => {
    expect(milestoneTicks("???")).toBe(4);
    expect(milestoneTicks(undefined)).toBe(4);
    expect(milestoneTicks(0)).toBe(4);
    expect(milestoneTicks(9)).toBe(4);
  });
});

// ── selectMilestoneVow ────────────────────────────────────────────────────────

describe("selectMilestoneVow", () => {
  it("returns null when no open vows", () => {
    expect(selectMilestoneVow([], "x")).toBeNull();
    expect(selectMilestoneVow([vow({ completed: true })], null)).toBeNull();
  });

  it("auto-selects the sole open vow when no target", () => {
    expect(selectMilestoneVow([vow()], null)?.id).toBe("v1");
  });

  it("returns null when several open vows and no target (ambiguous)", () => {
    const vows = [vow({ id: "a", name: "Alpha" }), vow({ id: "b", name: "Beta" })];
    expect(selectMilestoneVow(vows, null)).toBeNull();
  });

  it("matches by exact name (case-insensitive)", () => {
    const vows = [vow({ id: "a", name: "Alpha" }), vow({ id: "b", name: "Beta" })];
    expect(selectMilestoneVow(vows, "beta")?.id).toBe("b");
  });

  it("matches by substring in either direction", () => {
    const vows = [vow({ id: "a", name: "Find the relic" }), vow({ id: "b", name: "Beta" })];
    expect(selectMilestoneVow(vows, "relic")?.id).toBe("a");
  });

  it("never matches a completed vow by name", () => {
    // Alpha is completed; naming it must not select it. With several open vows
    // and no live match, the result is ambiguous → null.
    const vows = [
      vow({ id: "a", name: "Alpha", completed: true }),
      vow({ id: "b", name: "Beta" }),
      vow({ id: "c", name: "Gamma" }),
    ];
    expect(selectMilestoneVow(vows, "alpha")).toBeNull();
  });

  it("falls back to the sole open vow when the named vow is completed", () => {
    // Alpha completed, Beta the only one open → sole-open fallback (matches
    // selectVowTrack / selectConnection convention).
    const vows = [vow({ id: "a", name: "Alpha", completed: true }), vow({ id: "b", name: "Beta" })];
    expect(selectMilestoneVow(vows, "alpha")?.id).toBe("b");
  });
});

// ── planReachMilestone ────────────────────────────────────────────────────────

describe("planReachMilestone", () => {
  it("action none when there are no open vows", () => {
    expect(planReachMilestone([], null)).toEqual({ action: "none" });
  });

  it("action mark with rank ticks for a resolved vow", () => {
    const plan = planReachMilestone([vow({ rank: "formidable" })], null);
    expect(plan).toEqual({ action: "mark", vow: expect.objectContaining({ id: "v1" }), ticks: 4 });
  });

  it("action pick when ambiguous", () => {
    const vows = [vow({ id: "a", name: "Alpha" }), vow({ id: "b", name: "Beta" })];
    const plan = planReachMilestone(vows, null);
    expect(plan.action).toBe("pick");
    expect(plan.vows).toHaveLength(2);
  });

  it("resolves a named vow even when several are open", () => {
    const vows = [vow({ id: "a", name: "Alpha", rank: "epic" }), vow({ id: "b", name: "Beta" })];
    const plan = planReachMilestone(vows, "Alpha");
    expect(plan).toEqual({ action: "mark", vow: expect.objectContaining({ id: "a" }), ticks: 1 });
  });
});

// ── buildMilestoneSuggestion ──────────────────────────────────────────────────

describe("buildMilestoneSuggestion", () => {
  const res = (over = {}) => ({ moveId: "gather_information", outcome: "strong_hit", isProgressMove: false, ...over });

  it("is eligible on a quest-advancing hit with an open vow", () => {
    expect(buildMilestoneSuggestion(res(), [vow()], "adventure")).toEqual({ eligible: true, vowCount: 1 });
    expect(buildMilestoneSuggestion(res({ outcome: "weak_hit" }), [vow()], "exploration"))
      .toEqual({ eligible: true, vowCount: 1 });
  });

  it("is null on a miss", () => {
    expect(buildMilestoneSuggestion(res({ outcome: "miss" }), [vow()], "adventure")).toBeNull();
  });

  it("is null on a progress move", () => {
    expect(buildMilestoneSuggestion(res({ isProgressMove: true }), [vow()], "adventure")).toBeNull();
  });

  it("is null for non-quest-advancing categories", () => {
    expect(buildMilestoneSuggestion(res(), [vow()], "combat")).toBeNull();
    expect(buildMilestoneSuggestion(res(), [vow()], "connection")).toBeNull();
    expect(buildMilestoneSuggestion(res(), [vow()], null)).toBeNull();
  });

  it("is null for vow-lifecycle moves even in an eligible category", () => {
    expect(buildMilestoneSuggestion(res({ moveId: "reach_a_milestone" }), [vow()], "quest")).toBeNull();
    expect(buildMilestoneSuggestion(res({ moveId: "swear_an_iron_vow" }), [vow()], "quest")).toBeNull();
  });

  it("is null when the character has no open vow", () => {
    expect(buildMilestoneSuggestion(res(), [], "adventure")).toBeNull();
    expect(buildMilestoneSuggestion(res(), [vow({ completed: true })], "adventure")).toBeNull();
  });

  it("reports the open-vow count", () => {
    const vows = [vow({ id: "a" }), vow({ id: "b" }), vow({ id: "c", completed: true })];
    expect(buildMilestoneSuggestion(res(), vows, "adventure")).toEqual({ eligible: true, vowCount: 2 });
  });

  it("exposes the suggest-category set", () => {
    expect(MILESTONE_SUGGEST_CATEGORIES.has("adventure")).toBe(true);
    expect(MILESTONE_SUGGEST_CATEGORIES.has("exploration")).toBe(true);
    expect(MILESTONE_SUGGEST_CATEGORIES.has("combat")).toBe(false);
  });
});
