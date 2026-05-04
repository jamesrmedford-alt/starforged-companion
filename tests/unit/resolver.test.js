/**
 * STARFORGED COMPANION
 * tests/unit/resolver.test.js
 *
 * Unit tests for moves/resolver.js
 * Pure logic — no Foundry globals required.
 * Run with: npm test
 */

import {
  calcActionScore,
  calcOutcome,
  calcProgressOutcome,
  buildOutcomeLabel,
  canBurnMomentum,
  applyMomentumBurn,
  countMarkedImpacts,
  mapConsequences,
  rollDie,
  rollActionDie,
  rollChallengeDice,
} from "../../src/moves/resolver.js";


// ─────────────────────────────────────────────────────────────────────────────
// DICE
// ─────────────────────────────────────────────────────────────────────────────

describe("rollDie", () => {
  it("returns a value between 1 and faces inclusive", () => {
    for (let i = 0; i < 200; i++) {
      const result = rollDie(6);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(6);
    }
  });

  it("returns an integer", () => {
    expect(Number.isInteger(rollDie(10))).toBe(true);
  });
});

describe("rollActionDie", () => {
  it("returns 1-6", () => {
    for (let i = 0; i < 100; i++) {
      const r = rollActionDie();
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(6);
    }
  });
});

describe("rollChallengeDice", () => {
  it("returns two values each between 1 and 10", () => {
    for (let i = 0; i < 100; i++) {
      const [d1, d2] = rollChallengeDice();
      expect(d1).toBeGreaterThanOrEqual(1);
      expect(d1).toBeLessThanOrEqual(10);
      expect(d2).toBeGreaterThanOrEqual(1);
      expect(d2).toBeLessThanOrEqual(10);
    }
  });

  it("returns an array of length 2", () => {
    expect(rollChallengeDice()).toHaveLength(2);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// ACTION SCORE
// ─────────────────────────────────────────────────────────────────────────────

describe("calcActionScore", () => {
  it("sums die + stat", () => {
    expect(calcActionScore(4, 2)).toBe(6);
  });

  it("includes adds", () => {
    expect(calcActionScore(4, 2, 1)).toBe(7);
  });

  it("caps at 10", () => {
    expect(calcActionScore(6, 3, 2)).toBe(10);
    expect(calcActionScore(6, 4, 1)).toBe(10);
  });

  it("handles zero adds", () => {
    expect(calcActionScore(3, 2, 0)).toBe(5);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// OUTCOME CALCULATION
// ─────────────────────────────────────────────────────────────────────────────

describe("calcOutcome", () => {
  it("strong hit when action score beats both challenge dice", () => {
    const { outcome } = calcOutcome(8, [3, 5]);
    expect(outcome).toBe("strong_hit");
  });

  it("weak hit when action score beats only one challenge die", () => {
    const { outcome } = calcOutcome(6, [3, 8]);
    expect(outcome).toBe("weak_hit");
  });

  it("miss when action score beats neither challenge die", () => {
    const { outcome } = calcOutcome(4, [7, 9]);
    expect(outcome).toBe("miss");
  });

  it("ties go to challenge dice — equal score is not a hit", () => {
    // Score of 6 vs challenge die of 6 — tie goes to challenge die → miss
    const { outcome } = calcOutcome(6, [6, 6]);
    expect(outcome).toBe("miss");
  });

  it("ties on one die produce a weak hit if the other is beaten", () => {
    const { outcome } = calcOutcome(6, [6, 3]);
    expect(outcome).toBe("weak_hit");
  });

  it("detects a match when both challenge dice are equal", () => {
    const { isMatch } = calcOutcome(8, [4, 4]);
    expect(isMatch).toBe(true);
  });

  it("no match when challenge dice differ", () => {
    const { isMatch } = calcOutcome(8, [4, 5]);
    expect(isMatch).toBe(false);
  });

  it("match on a miss is still a miss", () => {
    const { outcome, isMatch } = calcOutcome(3, [7, 7]);
    expect(outcome).toBe("miss");
    expect(isMatch).toBe(true);
  });

  it("match on a strong hit is still a strong hit", () => {
    const { outcome, isMatch } = calcOutcome(9, [4, 4]);
    expect(outcome).toBe("strong_hit");
    expect(isMatch).toBe(true);
  });

  it("action score of 10 beats a challenge die of 9 but not 10", () => {
    expect(calcOutcome(10, [9, 5]).outcome).toBe("strong_hit");
    expect(calcOutcome(10, [10, 5]).outcome).toBe("weak_hit");
    expect(calcOutcome(10, [10, 10]).outcome).toBe("miss");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// OUTCOME LABEL
// ─────────────────────────────────────────────────────────────────────────────

describe("buildOutcomeLabel", () => {
  it("labels strong hit correctly", () => {
    expect(buildOutcomeLabel("strong_hit", false)).toBe("Strong Hit");
  });

  it("labels weak hit correctly", () => {
    expect(buildOutcomeLabel("weak_hit", false)).toBe("Weak Hit");
  });

  it("labels miss correctly", () => {
    expect(buildOutcomeLabel("miss", false)).toBe("Miss");
  });

  it("appends match suffix", () => {
    expect(buildOutcomeLabel("strong_hit", true)).toBe("Strong Hit with a Match");
    expect(buildOutcomeLabel("miss", true)).toBe("Miss with a Match");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS MOVES
// ─────────────────────────────────────────────────────────────────────────────

describe("calcProgressOutcome", () => {
  it("only counts fully filled boxes (4 ticks = 1 box)", () => {
    // 7 ticks = 1 full box → progress score 1
    const { progressScore } = calcProgressOutcome(7, [5, 5]);
    expect(progressScore).toBe(1);
  });

  it("10 boxes (40 ticks) = progress score 10", () => {
    const { progressScore } = calcProgressOutcome(40, [9, 9]);
    expect(progressScore).toBe(10);
  });

  it("strong hit when progress score beats both dice", () => {
    // 32 ticks = 8 boxes; score 8 vs [3, 5]
    const { outcome } = calcProgressOutcome(32, [3, 5]);
    expect(outcome).toBe("strong_hit");
  });

  it("miss when progress score beats neither die", () => {
    // 4 ticks = 1 box; score 1 vs [7, 8]
    const { outcome } = calcProgressOutcome(4, [7, 8]);
    expect(outcome).toBe("miss");
  });

  it("detects match on progress roll", () => {
    const { isMatch } = calcProgressOutcome(20, [5, 5]);
    expect(isMatch).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// MOMENTUM BURN
// ─────────────────────────────────────────────────────────────────────────────

describe("canBurnMomentum", () => {
  it("returns false for progress moves", () => {
    expect(canBurnMomentum(8, "weak_hit", [3, 7], true)).toBe(false);
  });

  it("returns false when momentum is 0 or negative", () => {
    expect(canBurnMomentum(0,  "weak_hit", [3, 7], false)).toBe(false);
    expect(canBurnMomentum(-2, "miss",     [3, 7], false)).toBe(false);
  });

  it("returns false when already a strong hit", () => {
    expect(canBurnMomentum(8, "strong_hit", [3, 4], false)).toBe(false);
  });

  it("returns true when momentum burn improves miss to weak hit", () => {
    // Momentum 7, challenge [5, 9] — score 4 is a miss, momentum 7 beats 5 → weak hit
    expect(canBurnMomentum(7, "miss", [5, 9], false)).toBe(true);
  });

  it("returns true when momentum burn improves weak hit to strong hit", () => {
    // Momentum 9, challenge [5, 7] — beats both → strong hit
    expect(canBurnMomentum(9, "weak_hit", [5, 7], false)).toBe(true);
  });

  it("returns false when momentum burn does not change the outcome", () => {
    // Momentum 3, challenge [5, 7] — 3 doesn't beat either → still a miss
    expect(canBurnMomentum(3, "miss", [5, 7], false)).toBe(false);
  });
});

describe("applyMomentumBurn", () => {
  it("uses momentum as the action score", () => {
    // Momentum 8 vs [5, 6] → strong hit
    const { outcome } = applyMomentumBurn(8, [5, 6], 0);
    expect(outcome).toBe("strong_hit");
  });

  it("resets momentum to 2 with no impacts", () => {
    const { newMomentum } = applyMomentumBurn(8, [5, 6], 0);
    expect(newMomentum).toBe(2);
  });

  it("resets momentum to 1 with 1 impact", () => {
    const { newMomentum } = applyMomentumBurn(8, [5, 6], 1);
    expect(newMomentum).toBe(1);
  });

  it("resets momentum to 0 with 2+ impacts", () => {
    expect(applyMomentumBurn(8, [5, 6], 2).newMomentum).toBe(0);
    expect(applyMomentumBurn(8, [5, 6], 4).newMomentum).toBe(0);
  });
});

describe("countMarkedImpacts", () => {
  it("counts marked impacts correctly", () => {
    const impacts = {
      wounded: true, shaken: false, unprepared: true,
      battered: false, cursed: false,
      doomed: true, tormented: false, indebted: false,
      permanently_harmed: false, traumatized: false,
    };
    expect(countMarkedImpacts(impacts)).toBe(3);
  });

  it("returns 0 with no impacts marked", () => {
    const impacts = {
      wounded: false, shaken: false, unprepared: false,
      battered: false, cursed: false,
      doomed: false, tormented: false, indebted: false,
      permanently_harmed: false, traumatized: false,
    };
    expect(countMarkedImpacts(impacts)).toBe(0);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// CONSEQUENCE MAPPING
// ─────────────────────────────────────────────────────────────────────────────

describe("mapConsequences", () => {
  describe("face_danger", () => {
    it("strong hit gives +1 momentum", () => {
      const c = mapConsequences("face_danger", "strong_hit", false);
      expect(c.momentumChange).toBe(1);
    });

    it("weak hit triggers a suffer move", () => {
      const c = mapConsequences("face_danger", "weak_hit", false);
      expect(c.sufferMoveTriggered).not.toBeNull();
      expect(c.sufferMoveTriggered.amount).toBe(1);
    });

    it("miss produces Pay the Price narrative", () => {
      const c = mapConsequences("face_danger", "miss", false);
      expect(c.otherEffect).toMatch(/Pay the Price/i);
    });
  });

  describe("secure_an_advantage", () => {
    it("strong hit gives +2 momentum and notes the choice", () => {
      const c = mapConsequences("secure_an_advantage", "strong_hit", false);
      expect(c.momentumChange).toBe(2);
      expect(c.otherEffect).toMatch(/both/i);
    });

    it("weak hit gives +2 momentum and notes the player choice", () => {
      const c = mapConsequences("secure_an_advantage", "weak_hit", false);
      expect(c.momentumChange).toBe(2);
      expect(c.otherEffect).toMatch(/choose one/i);
    });
  });

  describe("swear_an_iron_vow", () => {
    it("strong hit gives +2 momentum", () => {
      const c = mapConsequences("swear_an_iron_vow", "strong_hit", false);
      expect(c.momentumChange).toBe(2);
    });

    it("weak hit gives +1 momentum", () => {
      const c = mapConsequences("swear_an_iron_vow", "weak_hit", false);
      expect(c.momentumChange).toBe(1);
    });
  });

  describe("gather_information", () => {
    it("strong hit gives +2 momentum", () => {
      expect(mapConsequences("gather_information", "strong_hit", false).momentumChange).toBe(2);
    });

    it("weak hit gives +1 momentum", () => {
      expect(mapConsequences("gather_information", "weak_hit", false).momentumChange).toBe(1);
    });
  });

  describe("strike", () => {
    it("strong hit marks progress twice (notes via otherEffect)", () => {
      const c = mapConsequences("strike", "strong_hit", false);
      expect(c.otherEffect).toMatch(/progress twice/i);
    });
  });

  describe("enter_the_fray", () => {
    it("strong hit gives +2 momentum and notes both choices", () => {
      const c = mapConsequences("enter_the_fray", "strong_hit", false);
      expect(c.momentumChange).toBe(2);
      expect(c.otherEffect).toMatch(/in control/i);
    });

    it("miss notes bad spot", () => {
      const c = mapConsequences("enter_the_fray", "miss", false);
      expect(c.otherEffect).toMatch(/bad spot/i);
    });
  });

  describe("explore_a_waypoint", () => {
    it("strong hit with match notes Make a Discovery option", () => {
      const c = mapConsequences("explore_a_waypoint", "strong_hit", true);
      expect(c.otherEffect).toMatch(/Discovery/i);
    });

    it("miss with match notes Confront Chaos option", () => {
      const c = mapConsequences("explore_a_waypoint", "miss", true);
      expect(c.otherEffect).toMatch(/Confront Chaos/i);
    });
  });

  describe("companion_takes_a_hit", () => {
    it("miss with match notes companion death", () => {
      const c = mapConsequences("companion_takes_a_hit", "miss", true);
      expect(c.otherEffect).toMatch(/dead or destroyed/i);
    });

    it("miss without match does not mention death", () => {
      const c = mapConsequences("companion_takes_a_hit", "miss", false);
      expect(c.otherEffect).not.toMatch(/dead or destroyed/i);
    });
  });

  describe("unknown move", () => {
    it("returns empty consequences with a note", () => {
      const c = mapConsequences("unknown_move_xyz", "strong_hit", false);
      expect(c.momentumChange).toBe(0);
      expect(c.otherEffect).toMatch(/manually/i);
    });
  });
});
