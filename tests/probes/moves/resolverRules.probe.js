/**
 * PROBE (moves audit) — resolver outcome handling vs the Starforged rules.
 *
 * Each `it` asserts the CORRECT behaviour and therefore fails today.
 *
 *  EXPLORE-WAYPOINT-MISS-NO-PTP — Explore a Waypoint's miss "must Pay the
 *    Price" (play kit; docs/moves/suffer-routing-audit.md marks it **PtP**),
 *    but its consequence never sets `routePayThePrice`, so the pipeline posts
 *    no Pay the Price card, dispatches no suffer route and advances no
 *    tension clock (index.js:1401 is the only Pay the Price trigger).
 *
 *  PTP-SEED-DIVERGES — on a miss that routes Pay the Price, resolveMove's
 *    oracle seeds roll their OWN `pay_the_price` d100 (PAY_THE_PRICE_ON_MISS)
 *    and hand it to the narrator, while the pipeline rolls a second, different
 *    one for the card and the mechanics (postFaceDefeatPayThePriceCard).
 *
 *  ENTER-FRAY-WEAK-MOMENTUM-NO-POSITION — positions are binary (in control /
 *    in a bad spot). An Enter the Fray weak hit that takes "+2 momentum"
 *    instead of "You are in control" begins in a bad spot, but the option sets
 *    no position: the fight's combatState stays null, so the interpreter gets
 *    no bad-spot directive and Take Decisive Action is never downgraded.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/oracles/roller.js", () => ({
  rollOracle: vi.fn(() => ({ result: "Seeded price", roll: 42, sufferRoutes: [] })),
  rollPaired: vi.fn(() => ({ combined: "A · B" })),
}));

import { mapConsequences, resolveMove } from "../../../src/moves/resolver.js";
import { resolveSufferSelection } from "../../../src/moves/sufferDialog.js";
import { rollOracle } from "../../../src/oracles/roller.js";

function fixDice(values) {
  let i = 0;
  return vi.spyOn(Math, "random").mockImplementation(() => values[i++] ?? 0);
}

describe("EXPLORE-WAYPOINT-MISS-NO-PTP", () => {
  it("control: a Face Danger miss routes Pay the Price", () => {
    expect(mapConsequences("face_danger", "miss", false).routePayThePrice).toBe(true);
  });

  it("an Explore a Waypoint miss (no match) routes Pay the Price like every other 'Pay the Price' miss", () => {
    const c = mapConsequences("explore_a_waypoint", "miss", false);
    expect(c.otherEffect).toMatch(/Pay the Price/);       // the card says so…
    expect(c.routePayThePrice).toBe(true);                 // …but nothing routes it
  });
});

describe("PTP-SEED-DIVERGES", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => rollOracle.mockClear());

  it("a miss that routes Pay the Price does not roll a second, independent Pay the Price for the narrator", () => {
    // challenge dice [5, 8] (0.45, 0.75), action die 1 (0.0) → 1 + 1 = 2 → miss
    fixDice([0.45, 0.75, 0.0]);
    const r = resolveMove({
      moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", statValue: 1,
      adds: 0, playerNarration: "I force the hatch.",
    }, { currentSessionId: "s1" });

    expect(r.outcome).toBe("miss");
    expect(r.consequences.routePayThePrice).toBe(true);   // the pipeline will roll the card's price

    const ptpRolls = rollOracle.mock.calls.filter(([id]) => id === "pay_the_price").length;
    const seededPrice = (r.oracleSeeds?.results ?? []).filter(s => /^Pay the Price:/.test(s));
    // One price per miss: the narrator must not be seeded with a d100 the
    // mechanics never apply.
    expect(seededPrice).toEqual([]);
    expect(ptpRolls).toBe(0);
  });
});

describe("ENTER-FRAY-WEAK-MOMENTUM-NO-POSITION", () => {
  it("control: the strong hit and the miss both set a position", () => {
    expect(mapConsequences("enter_the_fray", "strong_hit", false).combatPosition).toBe("in_control");
    expect(mapConsequences("enter_the_fray", "miss", false).combatPosition).toBe("bad_spot");
  });

  it("a weak hit that takes +2 momentum (not 'You are in control') begins the fight in a bad spot", () => {
    const c = mapConsequences("enter_the_fray", "weak_hit", false);
    expect(c.combatPosition).toBeNull();                    // no position on the roll itself
    const momentumIdx = c.sufferPrompt.options.findIndex(o => o.momentum === 2);
    const calls = resolveSufferSelection(c.sufferPrompt, { optionIndices: [momentumIdx] });
    expect(calls).toContainEqual(expect.objectContaining({ kind: "combat-position", position: "bad_spot" }));
  });
});
