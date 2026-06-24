/**
 * STARFORGED COMPANION
 * tests/unit/developRelationship.test.js
 *
 * Develop Your Relationship lifecycle (audit 3.14) — connection-progress vs
 * bonds-legacy split. Pure orchestration; no Foundry.
 */

import { describe, it, expect } from "vitest";
import {
  selectConnection,
  planDevelopRelationship,
  buildConnectionSuggestion,
  CONNECTION_SUGGEST_CATEGORIES,
  nextRank,
  BOND_LEGACY_TICKS,
  CONNECTION_RANKS,
} from "../../src/moves/developRelationship.js";

const conn = (over = {}) => ({
  _id: "c1", name: "Patch Hawking", rank: "dangerous", bonded: false, active: true, ...over,
});

// ─── nextRank ────────────────────────────────────────────────────────────────

describe("nextRank", () => {
  it("steps up one rank", () => {
    expect(nextRank("troublesome")).toBe("dangerous");
    expect(nextRank("dangerous")).toBe("formidable");
    expect(nextRank("formidable")).toBe("extreme");
    expect(nextRank("extreme")).toBe("epic");
  });
  it("clamps at epic", () => {
    expect(nextRank("epic")).toBe("epic");
  });
  it("passes unknown ranks through unchanged", () => {
    expect(nextRank("legendary")).toBe("legendary");
  });
});

// ─── selectConnection ────────────────────────────────────────────────────────

describe("selectConnection", () => {
  it("returns null when there are no connections", () => {
    expect(selectConnection([], "Patch")).toBeNull();
    expect(selectConnection([conn({ active: false })], "Patch")).toBeNull();
  });

  it("exact name match (case-insensitive, ignores leading 'the')", () => {
    const list = [conn({ _id: "a", name: "The Broker" }), conn({ _id: "b", name: "Patch Hawking" })];
    expect(selectConnection(list, "broker")?._id).toBe("a");
    expect(selectConnection(list, "the broker")?._id).toBe("a");
    expect(selectConnection(list, "Patch Hawking")?._id).toBe("b");
  });

  it("substring match when no exact", () => {
    const list = [conn({ _id: "a", name: "Administrator Lyssa Chen" })];
    expect(selectConnection(list, "Lyssa")?._id).toBe("a");
  });

  it("falls back to the sole bonded connection when target is ambiguous", () => {
    const list = [
      conn({ _id: "a", name: "Ada", bonded: true }),
      conn({ _id: "b", name: "Ben", bonded: false }),
    ];
    expect(selectConnection(list, "Nobody")?._id).toBe("a");
    expect(selectConnection(list, null)?._id).toBe("a");
  });

  it("falls back to the sole active connection when none bonded", () => {
    const list = [conn({ _id: "solo", name: "Solo" })];
    expect(selectConnection(list, null)?._id).toBe("solo");
  });

  it("returns null when ambiguous (multiple, no match, none/many bonded)", () => {
    const list = [
      conn({ _id: "a", name: "Ada" }),
      conn({ _id: "b", name: "Ben" }),
    ];
    expect(selectConnection(list, "Nobody")).toBeNull();
    expect(selectConnection(list, null)).toBeNull();
  });

  it("ignores inactive connections in the fallback", () => {
    const list = [
      conn({ _id: "a", name: "Ada", bonded: true, active: false }),
      conn({ _id: "b", name: "Ben", bonded: false, active: true }),
    ];
    // only Ben is active → sole active fallback
    expect(selectConnection(list, null)?._id).toBe("b");
  });
});

// ─── planDevelopRelationship ─────────────────────────────────────────────────

describe("planDevelopRelationship", () => {
  it("returns {action:'none'} when no connection", () => {
    expect(planDevelopRelationship(null, "strong_hit", false)).toEqual({ action: "none" });
  });

  it("un-bonded → connection-progress, one mark, regardless of outcome", () => {
    const c = conn({ bonded: false });
    for (const outcome of ["strong_hit", "weak_hit", "miss"]) {
      const plan = planDevelopRelationship(c, outcome, false);
      expect(plan.action).toBe("connection-progress");
      expect(plan.marks).toBe(1);
      expect(plan.connection).toBe(c);
    }
  });

  it("bonded → bond-legacy with 2/1/0 ticks by outcome", () => {
    const c = conn({ bonded: true });
    expect(planDevelopRelationship(c, "strong_hit", false).ticks).toBe(2);
    expect(planDevelopRelationship(c, "weak_hit", false).ticks).toBe(1);
    expect(planDevelopRelationship(c, "miss", false).ticks).toBe(0);
  });

  it("bonded + match on a hit → raiseRank with newRank one step up", () => {
    const c = conn({ bonded: true, rank: "dangerous" });
    const strong = planDevelopRelationship(c, "strong_hit", true);
    expect(strong.raiseRank).toBe(true);
    expect(strong.newRank).toBe("formidable");

    const weak = planDevelopRelationship(c, "weak_hit", true);
    expect(weak.raiseRank).toBe(true);
    expect(weak.newRank).toBe("formidable");
  });

  it("bonded + match on a MISS → no rank raise", () => {
    const c = conn({ bonded: true, rank: "dangerous" });
    const plan = planDevelopRelationship(c, "miss", true);
    expect(plan.raiseRank).toBe(false);
    expect(plan.newRank).toBeNull();
  });

  it("bonded without a match → no rank raise", () => {
    const c = conn({ bonded: true, rank: "dangerous" });
    expect(planDevelopRelationship(c, "strong_hit", false).raiseRank).toBe(false);
  });
});

// ─── buildConnectionSuggestion ───────────────────────────────────────────────

const res = (over = {}) => ({
  moveId: "make_a_connection",
  outcome: "strong_hit",
  isProgressMove: false,
  ...over,
});

describe("buildConnectionSuggestion", () => {
  it("is eligible on a connection-category hit with an unbonded connection", () => {
    expect(buildConnectionSuggestion(res(), [conn()], "connection"))
      .toEqual({ eligible: true, count: 1 });
  });

  it("counts only unbonded connections", () => {
    const list = [conn(), conn({ bonded: true }), conn()];
    expect(buildConnectionSuggestion(res(), list, "connection"))
      .toEqual({ eligible: true, count: 2 });
  });

  it("is null on a miss", () => {
    expect(buildConnectionSuggestion(res({ outcome: "miss" }), [conn()], "connection")).toBeNull();
  });

  it("is null when no connections provided", () => {
    expect(buildConnectionSuggestion(res(), [], "connection")).toBeNull();
    expect(buildConnectionSuggestion(res(), null, "connection")).toBeNull();
  });

  it("is null when all connections are bonded", () => {
    expect(buildConnectionSuggestion(res(), [conn({ bonded: true })], "connection")).toBeNull();
  });

  it("is null for non-connection categories", () => {
    expect(buildConnectionSuggestion(res(), [conn()], "adventure")).toBeNull();
    expect(buildConnectionSuggestion(res(), [conn()], "combat")).toBeNull();
    expect(buildConnectionSuggestion(res(), [conn()], null)).toBeNull();
  });

  it("is null on develop_your_relationship (avoid double-mark)", () => {
    expect(buildConnectionSuggestion(
      res({ moveId: "develop_your_relationship" }), [conn()], "connection",
    )).toBeNull();
  });

  it("is null on forge_a_bond (is the forge move itself)", () => {
    expect(buildConnectionSuggestion(
      res({ moveId: "forge_a_bond" }), [conn()], "connection",
    )).toBeNull();
  });

  it("is eligible on make_a_connection and test_your_relationship hits", () => {
    for (const moveId of ["make_a_connection", "test_your_relationship"]) {
      expect(buildConnectionSuggestion(res({ moveId }), [conn()], "connection")?.eligible).toBe(true);
    }
  });

  it("exposes CONNECTION_SUGGEST_CATEGORIES", () => {
    expect(CONNECTION_SUGGEST_CATEGORIES.has("connection")).toBe(true);
    expect(CONNECTION_SUGGEST_CATEGORIES.has("adventure")).toBe(false);
    expect(CONNECTION_SUGGEST_CATEGORIES.has("combat")).toBe(false);
  });
});

// ─── constants ───────────────────────────────────────────────────────────────

describe("constants", () => {
  it("BOND_LEGACY_TICKS is 2/1/0", () => {
    expect(BOND_LEGACY_TICKS).toEqual({ strong_hit: 2, weak_hit: 1, miss: 0 });
  });
  it("CONNECTION_RANKS is the five-rank ladder in order", () => {
    expect(CONNECTION_RANKS).toEqual(["troublesome", "dangerous", "formidable", "extreme", "epic"]);
  });
});
