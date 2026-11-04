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
  selectFulfilVow,
  planReachMilestone,
  milestoneTicks,
  marksForSourceRank,
  buildMilestoneSuggestion,
  MILESTONE_SUGGEST_CATEGORIES,
} from "../../src/moves/milestone.js";

const vow = (over = {}) => ({ id: "v1", name: "Save Dani", rank: "dangerous", completed: false, ...over });

// ── marksForSourceRank (#241 "scale by difficulty") ──────────────────────────

describe("marksForSourceRank", () => {
  it("maps a source rank to its milestone mark count", () => {
    expect(marksForSourceRank("troublesome")).toBe(1);
    expect(marksForSourceRank("dangerous")).toBe(1);
    expect(marksForSourceRank("formidable")).toBe(2);
    expect(marksForSourceRank("extreme")).toBe(2);
    expect(marksForSourceRank("epic")).toBe(3);
  });

  it("accepts a numeric ChallengeRank and treats an unknown rank as formidable", () => {
    expect(marksForSourceRank(5)).toBe(3);       // epic
    expect(marksForSourceRank(3)).toBe(2);       // formidable
    expect(marksForSourceRank("nope")).toBe(2);  // unknown → formidable (rankName default)
  });
});

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

  // decisions.md ("Vow payoffs resolve vowId-first"): the sole-open rung never
  // fires when the name matches a vow that is already completed — a won
  // fight's card for a fulfilled vow marked the PC's other vow (issue #325 W29).
  it("resolves nothing when the named vow is completed — never the sole open vow", () => {
    const vows = [vow({ id: "a", name: "Alpha", completed: true }), vow({ id: "b", name: "Beta" })];
    expect(selectMilestoneVow(vows, "alpha")).toBeNull();
  });

  it("control: a name that matches nothing still falls back to the sole open vow", () => {
    const vows = [vow({ id: "a", name: "Alpha", completed: true }), vow({ id: "b", name: "Beta" })];
    expect(selectMilestoneVow(vows, "Gamma")?.id).toBe("b");
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

  it("is eligible on a quest-advancing hit with an open vow — the sole vow's Item id rides it (issue #329 X05)", () => {
    expect(buildMilestoneSuggestion(res(), [vow()], "adventure")).toEqual({ eligible: true, vowCount: 1, vowItemId: "v1" });
    expect(buildMilestoneSuggestion(res({ outcome: "weak_hit" }), [vow()], "exploration"))
      .toEqual({ eligible: true, vowCount: 1, vowItemId: "v1" });
  });

  it("names no vow when several are open — the roller is asked which", () => {
    expect(buildMilestoneSuggestion(res(), [vow({ id: "a" }), vow({ id: "b" })], "adventure"))
      .toEqual({ eligible: true, vowCount: 2 });
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

// ── selectFulfilVow (issue #321 U02) ──────────────────────────────────────────
// The vow a Fulfill Your Vow scores, from every PC's vow copies. The old
// "sole open vow" fallback scored 0 — a certain miss — with a shared vow's two
// copies, two PCs' own vows, or a solo PC's background and inciting vows.

describe("selectFulfilVow", () => {
  const copy = (actorId, id, over = {}) => ({
    id, name: "Rescue Dani", rank: "formidable", ticks: 32, completed: false, actorId, vowId: "vid-dani", ...over,
  });
  const ids = (choices) => choices.map(v => v.id);

  it("control: one PC, one open vow — that vow", () => {
    expect(selectFulfilVow([copy("pc1", "v1")], null, { rollerActorId: "pc1" })).toEqual({ vow: copy("pc1", "v1"), choices: [] });
  });

  it("a shared vow's copies are one vow — the roller's copy", () => {
    const vows = [copy("pc2", "v2"), copy("pc1", "v1")];
    expect(selectFulfilVow(vows, null, { rollerActorId: "pc1" }).vow.id).toBe("v1");
  });

  it("a roller who holds no copy (a GM) still finds the one shared vow", () => {
    const vows = [copy("pc1", "v1"), copy("pc2", "v2")];
    expect(selectFulfilVow(vows, null, { rollerActorId: null }).vow.id).toBe("v1");
    expect(selectFulfilVow(vows, null, { rollerActorId: "gm-pc" }).vow.id).toBe("v1");
  });

  it("two PCs, each with their own vow — the roller's", () => {
    const vows = [
      copy("pc2", "v9", { name: "Repay the Syndicate", vowId: "vid-debt", ticks: 4 }),
      copy("pc1", "v1", { name: "Find my sister",      vowId: "vid-sis",  ticks: 24 }),
    ];
    expect(selectFulfilVow(vows, null, { rollerActorId: "pc1" })).toMatchObject({ vow: { id: "v1", ticks: 24 }, choices: [] });
  });

  it("a solo PC's background and inciting vows: no vow, both offered — never a 0 score", () => {
    const vows = [
      copy("pc1", "bg", { name: "Background Vow", vowId: "vid-bg", ticks: 8 }),
      copy("pc1", "inc", { name: "Rescue Dani", vowId: "vid-dani" }),
    ];
    const { vow, choices } = selectFulfilVow(vows, null, { rollerActorId: "pc1" });
    expect(vow).toBeNull();
    expect(ids(choices)).toEqual(["bg", "inc"]);
  });

  it("the roller's vows are the choices — a crewmate's own vow is not offered", () => {
    const vows = [
      copy("pc1", "a1", { name: "Find my sister", vowId: "vid-sis" }),
      copy("pc1", "d1"),
      copy("pc2", "d2"),
      copy("pc2", "x2", { name: "Repay the Syndicate", vowId: "vid-debt" }),
    ];
    expect(ids(selectFulfilVow(vows, null, { rollerActorId: "pc1" }).choices)).toEqual(["a1", "d1"]);
  });

  it("a roller who holds none: everyone's vows, a shared one offered once", () => {
    const vows = [
      copy("pc1", "d1"), copy("pc2", "d2"),
      copy("pc2", "x2", { name: "Repay the Syndicate", vowId: "vid-debt" }),
    ];
    expect(ids(selectFulfilVow(vows, null, { rollerActorId: "pc3" }).choices)).toEqual(["d1", "x2"]);
  });

  it("a shared vow offered among several is the roller's own copy", () => {
    const vows = [copy("pc2", "d2"), copy("pc1", "d1"), copy("pc1", "a1", { name: "Find my sister", vowId: "vid-sis" })];
    expect(ids(selectFulfilVow(vows, null, { rollerActorId: "pc1" }).choices)).toEqual(["d1", "a1"]);
  });

  it("a named vow: the roller's own first, then anyone's — exact, then a substring", () => {
    const vows = [
      copy("pc2", "x2", { name: "Background Vow", vowId: "vid-ash-bg" }),
      copy("pc1", "x1", { name: "Background Vow", vowId: "vid-bex-bg" }),
      copy("pc2", "r2", { name: "Repay the Syndicate", vowId: "vid-debt" }),
    ];
    expect(selectFulfilVow(vows, "background vow", { rollerActorId: "pc1" }).vow.id).toBe("x1");
    expect(selectFulfilVow(vows, "the Syndicate", { rollerActorId: "pc1" }).vow.id).toBe("r2");
  });

  it("a picked copy by id: that open copy, else nothing — never another vow", () => {
    const vows = [copy("pc1", "v1"), copy("pc1", "v3", { name: "Find my sister", vowId: "vid-sis", completed: true })];
    expect(selectFulfilVow(vows, "Rescue Dani", { itemId: "v1", rollerActorId: "pc1" }).vow.id).toBe("v1");
    expect(selectFulfilVow(vows, "Find my sister", { itemId: "v3", rollerActorId: "pc1" })).toEqual({ vow: null, choices: [] });
  });

  it("a vow the module has not stamped counts as itself", () => {
    const vows = [copy("pc1", "u1", { vowId: null, name: "Old vow" }), copy("pc1", "u2", { vowId: null, name: "Older vow" })];
    expect(ids(selectFulfilVow(vows, null, { rollerActorId: "pc1" }).choices)).toEqual(["u1", "u2"]);
  });

  it("no open vow: nothing, and nothing to offer", () => {
    expect(selectFulfilVow([copy("pc1", "v1", { completed: true })], null, { rollerActorId: "pc1" })).toEqual({ vow: null, choices: [] });
  });
});
