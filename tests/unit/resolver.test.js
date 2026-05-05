/**
 * STARFORGED COMPANION
 * tests/unit/resolver.test.js
 *
 * Unit tests for moves/resolver.js
 * Pure logic — no Foundry globals required.
 * Run with: npm test
 */

import { vi } from "vitest";

vi.mock("../../src/oracles/roller.js", () => ({
  rollOracle: vi.fn(),
  rollPaired: vi.fn(),
}));

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
  resolveMove,
  buildOracleSeeds,
} from "../../src/moves/resolver.js";
import { rollOracle, rollPaired } from "../../src/oracles/roller.js";


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


// ─────────────────────────────────────────────────────────────────────────────
// CONSEQUENCE MAPPING — full handler coverage
// Each case targets a (moveId, outcome[, isMatch]) combination not covered
// above. The intent is statement/function coverage of the CONSEQUENCE_MAP
// table; the assertions verify the handler's shape contract and a marker
// string from its outcome text rather than full mechanical equivalence.
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_KEYS = [
  "momentumChange", "healthChange", "spiritChange", "supplyChange",
  "progressMarked", "sufferMoveTriggered", "progressTrackId", "otherEffect",
];

const HANDLER_CASES = [
  // Session
  ["begin_a_session",  "strong_hit", false, { momentumChange: 1, match: /vignette|momentum/i }],
  ["set_a_flag",       "strong_hit", false, { match: /flag/i }],
  ["change_your_fate", "strong_hit", false, { match: /fate/i }],
  ["take_a_break",     "strong_hit", false, { match: /break/i }],
  ["end_a_session",    "strong_hit", false, { momentumChange: 1 }],

  // Adventure (untested arms)
  ["secure_an_advantage", "miss",       false, { match: /Pay the Price/i }],
  ["gather_information",  "miss",       false, { match: /Pay the Price/i }],
  ["compel",              "strong_hit", false, { momentumChange: 1 }],
  ["compel",              "weak_hit",   false, { match: /counteroffer|complication/i }],
  ["compel",              "miss",       false, { match: /Pay the Price/i }],
  ["aid_your_ally",       "strong_hit", false, { match: /ally|advantage/i }],
  ["check_your_gear",     "strong_hit", false, { momentumChange: 1 }],
  ["check_your_gear",     "weak_hit",   false, { match: /Sacrifice|Lose/i }],
  ["check_your_gear",     "miss",       false, { match: /Pay the Price/i }],

  // Quest
  ["swear_an_iron_vow", "miss",       false, { match: /obstacle/i }],
  ["reach_a_milestone", "strong_hit", false, { match: /progress/i }],
  ["fulfill_your_vow",  "strong_hit", false, { match: /fulfilled|legacy/i }],
  ["fulfill_your_vow",  "weak_hit",   false, { match: /more remains|legacy/i }],
  ["fulfill_your_vow",  "miss",       false, { match: /Forsake|undone/i }],
  ["forsake_your_vow",  "strong_hit", false, { match: /cleared|costs/i }],

  // Connection
  ["make_a_connection",         "strong_hit", false, { match: /role|rank/i }],
  ["make_a_connection",         "weak_hit",   false, { match: /complication|cost/i }],
  ["make_a_connection",         "miss",       false, { match: /Pay the Price/i }],
  ["develop_your_relationship", "strong_hit", false, { match: /progress/i }],
  ["test_your_relationship",    "strong_hit", false, { match: /Develop/i }],
  ["test_your_relationship",    "weak_hit",   false, { match: /Develop/i }],
  ["test_your_relationship",    "miss",       false, { match: /lose|loyalty/i }],
  ["forge_a_bond",              "strong_hit", false, { match: /Bond forged/i }],
  ["forge_a_bond",              "weak_hit",   false, { match: /Bond forged|something more/i }],
  ["forge_a_bond",              "miss",       false, { match: /Conflicting|Recommit/i }],

  // Exploration
  ["undertake_an_expedition", "strong_hit", false, { match: /waypoint|progress/i }],
  ["undertake_an_expedition", "weak_hit",   false, { match: /cost|peril/i }],
  ["undertake_an_expedition", "miss",       false, { match: /Pay the Price|crisis/i }],
  ["explore_a_waypoint",      "strong_hit", false, { momentumChange: 2, match: /opportunity/i }],
  ["explore_a_waypoint",      "weak_hit",   false, { momentumChange: 1, match: /peril|ominous/i }],
  ["explore_a_waypoint",      "miss",       false, { match: /Pay the Price/i }],
  ["finish_an_expedition",    "strong_hit", false, { match: /Expedition complete|legacy/i }],
  ["finish_an_expedition",    "weak_hit",   false, { match: /complication|legacy/i }],
  ["finish_an_expedition",    "miss",       false, { match: /Pay the Price|return/i }],
  ["set_a_course",            "strong_hit", false, { momentumChange: 1, match: /Arrived/i }],
  ["set_a_course",            "weak_hit",   false, { match: /complication|cost|suffer/i }],
  ["set_a_course",            "miss",       false, { match: /Pay the Price|threat/i }],
  ["make_a_discovery",        "strong_hit", false, { match: /discoveries/i }],
  ["confront_chaos",          "strong_hit", false, { match: /aspects|Chaos/i }],

  // Combat
  ["enter_the_fray",       "weak_hit",   false, { match: /choose one|control/i }],
  ["gain_ground",          "strong_hit", false, { momentumChange: 2 }],
  ["gain_ground",          "weak_hit",   false, { match: /choose one|control/i }],
  ["gain_ground",          "miss",       false, { match: /bad spot|Pay the Price/i }],
  ["strike",               "weak_hit",   false, { match: /progress|bad spot/i }],
  ["strike",               "miss",       false, { match: /Pay the Price|bad spot/i }],
  ["clash",                "strong_hit", false, { match: /progress|control/i }],
  ["clash",                "weak_hit",   false, { match: /counterblow|Pay the Price/i }],
  ["clash",                "miss",       false, { match: /Pay the Price|dominates/i }],
  ["react_under_fire",     "strong_hit", false, { momentumChange: 1 }],
  ["react_under_fire",     "weak_hit",   false, { match: /Suffer|cost|bad spot/i }],
  ["react_under_fire",     "miss",       false, { match: /Pay the Price|worsens/i }],
  ["take_decisive_action", "strong_hit", false, { momentumChange: 1, match: /Prevail/i }],
  ["take_decisive_action", "weak_hit",   false, { match: /cost|bad spot/i }],
  ["take_decisive_action", "miss",       false, { match: /Pay the Price|Defeated/i }],
  ["face_defeat",          "strong_hit", false, { match: /abandoned|Pay the Price/i }],
  ["battle",               "strong_hit", false, { momentumChange: 2 }],
  ["battle",               "weak_hit",   false, { match: /Pay the Price/i }],
  ["battle",               "miss",       false, { match: /Pay the Price|Defeated/i }],
  ["companion_takes_a_hit","strong_hit", false, { match: /rallies|health/i }],
  ["companion_takes_a_hit","weak_hit",   false, { match: /Lose Momentum|press on/i }],

  // Suffer
  ["lose_momentum",       "strong_hit", false, { match: /momentum/i }],
  ["endure_harm",         "strong_hit", false, { match: /shake it off|momentum/i }],
  ["endure_harm",         "weak_hit",   false, { match: /Lose Momentum|press on/i }],
  ["endure_harm",         "miss",       false, { match: /health|wounded/i }],
  ["endure_stress",       "strong_hit", false, { match: /shake it off|momentum/i }],
  ["endure_stress",       "weak_hit",   false, { match: /Lose Momentum|press on/i }],
  ["endure_stress",       "miss",       false, { match: /spirit|shaken/i }],
  ["withstand_damage",    "strong_hit", false, { match: /bypass|momentum/i }],
  ["withstand_damage",    "weak_hit",   false, { match: /Lose Momentum|press on/i }],
  ["withstand_damage",    "miss",       false, { match: /integrity|battered/i }],
  ["sacrifice_resources", "strong_hit", false, { match: /supply|unprepared/i }],

  // Recover
  ["sojourn",  "strong_hit", false, { match: /Safe refuge|recover/i }],
  ["sojourn",  "weak_hit",   false, { match: /Time short|recover/i }],
  ["sojourn",  "miss",       false, { match: /community|Pay the Price/i }],
  ["heal",     "strong_hit", false, { match: /wounded|health/i }],
  ["heal",     "weak_hit",   false, { match: /Lose Momentum|Sacrifice/i }],
  ["heal",     "miss",       false, { match: /Pay the Price/i }],
  ["hearten",  "strong_hit", false, { match: /shaken|spirit/i }],
  ["hearten",  "weak_hit",   false, { momentumChange: -1 }],
  ["hearten",  "miss",       false, { match: /Pay the Price/i }],
  ["resupply", "strong_hit", false, { match: /unprepared|supply|item/i }],
  ["resupply", "weak_hit",   false, { match: /cost|complication/i }],
  ["resupply", "miss",       false, { match: /Pay the Price|peril/i }],
  ["repair",   "strong_hit", false, { match: /repair points|integrity/i }],
  ["repair",   "weak_hit",   false, { match: /repair points/i }],
  ["repair",   "miss",       false, { match: /Pay the Price/i }],

  // Threshold
  ["face_death",          "strong_hit", false, { match: /mortal/i }],
  ["face_death",          "weak_hit",   false, { match: /sacrifice|doomed/i }],
  ["face_death",          "miss",       false, { match: /dead/i }],
  ["face_desolation",     "strong_hit", false, { match: /Resist|press on/i }],
  ["face_desolation",     "weak_hit",   false, { match: /sacrifice|tormented/i }],
  ["face_desolation",     "miss",       false, { match: /despair|horror|lost/i }],
  ["overcome_destruction","strong_hit", false, { match: /favor|experience/i }],
  ["overcome_destruction","weak_hit",   false, { match: /indebted|Iron Vow/i }],
  ["overcome_destruction","miss",       false, { match: /quest|enemy/i }],

  // Legacy
  ["earn_experience",   "strong_hit", false, { match: /experience/i }],
  ["advance",           "strong_hit", false, { match: /experience|asset/i }],
  ["continue_a_legacy", "strong_hit", false, { match: /follow|connection|inheritance/i }],
  ["continue_a_legacy", "weak_hit",   false, { match: /see it through|familiar/i }],
  ["continue_a_legacy", "miss",       false, { match: /aftermath|loyalties|Pandora/i }],

  // Fate
  ["ask_the_oracle", "strong_hit", false, { match: /yes-no|conclusion|oracle|extreme|pick/i }],
  ["pay_the_price",  "strong_hit", false, { match: /negative|Oracle|table/i }],
];

describe("mapConsequences — full handler coverage", () => {
  HANDLER_CASES.forEach(([moveId, outcome, isMatch, expectations]) => {
    const label = `${moveId}:${outcome}${isMatch ? "+match" : ""}`;
    it(`${label} returns a complete consequences object`, () => {
      const c = mapConsequences(moveId, outcome, isMatch);
      for (const key of REQUIRED_KEYS) {
        expect(c).toHaveProperty(key);
      }
      if (expectations.momentumChange !== undefined) {
        expect(c.momentumChange).toBe(expectations.momentumChange);
      }
      if (expectations.match) {
        expect(c.otherEffect).toMatch(expectations.match);
      }
    });
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// resolveMove
// Math.random is mocked with a fixed sequence so dice outcomes are predictable.
// rollChallengeDice() runs first (two d10 rolls), then rollActionDie() (one
// d6 roll). For progress moves there is no action roll.
// ─────────────────────────────────────────────────────────────────────────────

/** Drive Math.random with a fixed sequence. */
function fixDiceSequence(values) {
  let i = 0;
  return vi.spyOn(Math, "random").mockImplementation(() => {
    const v = values[i] ?? 0;
    i += 1;
    return v;
  });
}

describe("resolveMove", () => {
  beforeEach(() => {
    rollOracle.mockReset();
    rollPaired.mockReset();
    // Default: oracles produce no seeds (so resolveMove still works for non-seeded moves)
    rollOracle.mockReturnValue({ result: "—" });
    rollPaired.mockReturnValue({});
  });

  it("rolls action dice and assembles a non-progress resolution", () => {
    // [0.25, 0.45] → challenge dice [3, 5]; [0.99] → action die 6
    fixDiceSequence([0.25, 0.45, 0.99]);

    const result = resolveMove({
      moveId:          "face_danger",
      moveName:        "Face Danger",
      statUsed:        "iron",
      statValue:       4,
      adds:            0,
      rationale:       "Pushing through.",
      mischiefApplied: false,
      mischiefLevel:   "serious",
      playerNarration: "I push through.",
    }, { currentSessionId: "sess-1" });

    expect(result.outcome).toBe("strong_hit");
    expect(result.actionDie).toBe(6);
    expect(result.actionScore).toBe(10); // 6+4 capped at 10
    expect(result.challengeDice).toEqual([3, 5]);
    expect(result.isMatch).toBe(false);
    expect(result.isProgressMove).toBe(false);
    expect(result.progressScore).toBe(0);
    expect(result.outcomeLabel).toBe("Strong Hit");
    expect(result.consequences.momentumChange).toBe(1); // face_danger strong_hit → +1
    expect(result.sessionId).toBe("sess-1");
    expect(result.playerConfirmed).toBe(true);
    expect(result.momentumBurned).toBe(false);
    expect(result.momentumBurnedFrom).toBe(0);
    expect(typeof result.loremasterContext).toBe("string");
    expect(result.loremasterContext).toContain("Face Danger");
    expect(result.loremasterContext).toContain("Strong Hit");
    expect(result.loremasterContext).toContain("Action: 6 + 4 = 10");
  });

  it("includes adds in action score and loremaster context", () => {
    fixDiceSequence([0.25, 0.45, 0.0]); // challenge [3, 5]; action die 1

    const result = resolveMove({
      moveId:          "face_danger",
      moveName:        "Face Danger",
      statUsed:        "iron",
      statValue:       2,
      adds:            1,
      mischiefApplied: false,
      mischiefLevel:   "serious",
      playerNarration: "Test.",
      inputMethod:     "voice",
    }, { currentSessionId: "sess-x" });

    // 1 + 2 + 1 = 4 → beats 3, not 5 → weak_hit
    expect(result.actionDie).toBe(1);
    expect(result.actionScore).toBe(4);
    expect(result.outcome).toBe("weak_hit");
    expect(result.adds).toBe(1);
    expect(result.inputMethod).toBe("voice");
    expect(result.loremasterContext).toContain("+ 1"); // adds rendered
  });

  it("resolves a progress move using statValue as ticks (no action die)", () => {
    fixDiceSequence([0.25, 0.45]); // challenge [3, 5]; no action roll

    const result = resolveMove({
      moveId:          "fulfill_your_vow",
      moveName:        "Fulfill Your Vow",
      statUsed:        "",
      statValue:       32, // 8 boxes of progress
      adds:            0,
      mischiefApplied: false,
      mischiefLevel:   "serious",
      playerNarration: "It is done.",
    }, { currentSessionId: "" });

    expect(result.isProgressMove).toBe(true);
    expect(result.progressScore).toBe(8);
    expect(result.actionDie).toBe(0);
    expect(result.actionScore).toBe(0);
    expect(result.challengeDice).toEqual([3, 5]);
    expect(result.outcome).toBe("strong_hit");
    expect(result.loremasterContext).toContain("Progress score: 8");
    expect(result.sessionId).toBe("");
  });

  it("appends [MATCH] to loremaster context when challenge dice are equal", () => {
    fixDiceSequence([0.45, 0.45, 0.0]); // challenge [5, 5] → match; action die 1

    const result = resolveMove({
      moveId:          "face_danger",
      moveName:        "Face Danger",
      statUsed:        "iron",
      statValue:       0,
      adds:            0,
      mischiefApplied: false,
      mischiefLevel:   "serious",
      playerNarration: "x",
    }, { currentSessionId: "sess" });

    expect(result.isMatch).toBe(true);
    expect(result.outcome).toBe("miss");
    expect(result.loremasterContext).toContain("[MATCH]");
    expect(result.outcomeLabel).toBe("Miss with a Match");
  });

  it("throws on unknown move ID", () => {
    expect(() => resolveMove({
      moveId:          "not_a_real_move",
      moveName:        "Bogus",
      statUsed:        "iron",
      statValue:       0,
      mischiefApplied: false,
      mischiefLevel:   "serious",
      playerNarration: "x",
    }, { currentSessionId: "" })).toThrow(/Unknown move/);
  });

  it("defaults adds to 0, inputMethod to 'chat', sessionId to ''", () => {
    fixDiceSequence([0.25, 0.45, 0.0]);

    const result = resolveMove({
      moveId:          "face_danger",
      moveName:        "Face Danger",
      statUsed:        "iron",
      statValue:       0,
      mischiefApplied: false,
      mischiefLevel:   "serious",
      playerNarration: "x",
    }, {});

    expect(result.adds).toBe(0);
    expect(result.inputMethod).toBe("chat");
    expect(result.sessionId).toBe("");
  });

  it("attaches oracle seeds when the move is in the seeded list", () => {
    rollOracle.mockImplementation((tableId) => {
      const data = {
        character_role:       { result: "scout"   },
        character_goal:       { result: "find it" },
        character_first_look: { result: "scarred" },
        given_name:           { result: "Vex"     },
      };
      return data[tableId] ?? { result: "—" };
    });
    fixDiceSequence([0.25, 0.45, 0.99]); // challenge [3,5]; action 6

    const result = resolveMove({
      moveId:          "make_a_connection",
      moveName:        "Make a Connection",
      statUsed:        "heart",
      statValue:       2,
      adds:            0,
      mischiefApplied: false,
      mischiefLevel:   "serious",
      playerNarration: "Meeting a new contact.",
    }, { currentSessionId: "sess-2" });

    expect(result.oracleSeeds).not.toBeNull();
    expect(result.oracleSeeds.context).toBe("make_a_connection");
    expect(result.oracleSeeds.names).toEqual(["Vex"]);
  });

  it("oracle seeds are null for non-seeded moves", () => {
    fixDiceSequence([0.25, 0.45, 0.99]);

    const result = resolveMove({
      moveId:          "face_danger",
      moveName:        "Face Danger",
      statUsed:        "iron",
      statValue:       2,
      adds:            0,
      mischiefApplied: false,
      mischiefLevel:   "serious",
      playerNarration: "x",
    }, { currentSessionId: "" });

    expect(result.oracleSeeds).toBeNull();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// buildOracleSeeds
// ─────────────────────────────────────────────────────────────────────────────

describe("buildOracleSeeds", () => {
  beforeEach(() => {
    rollOracle.mockReset();
    rollPaired.mockReset();
  });

  it("returns null for moves outside the seeded list", () => {
    expect(buildOracleSeeds("face_danger", "strong_hit", false)).toBeNull();
    expect(buildOracleSeeds("strike",      "miss",       true )).toBeNull();
    expect(buildOracleSeeds("",            "miss",       false)).toBeNull();
  });

  describe("make_a_connection", () => {
    it("builds results from character_role/goal/first_look and a name", () => {
      rollOracle.mockImplementation((tableId) => {
        const data = {
          character_role:       { result: "scout"        },
          character_goal:       { result: "find a relic" },
          character_first_look: { result: "scarred face" },
          given_name:           { result: "Vex"          },
        };
        return data[tableId] ?? { result: "—" };
      });

      const seeds = buildOracleSeeds("make_a_connection", "strong_hit", false);
      expect(seeds).not.toBeNull();
      expect(seeds.context).toBe("make_a_connection");
      expect(seeds.results).toEqual([
        "Character role: scout",
        "Character goal: find a relic",
        "Character first look: scarred face",
      ]);
      expect(seeds.names).toEqual(["Vex"]);
    });

    it("returns null when every oracle returns the empty marker", () => {
      rollOracle.mockReturnValue({ result: "—" });
      expect(buildOracleSeeds("make_a_connection", "strong_hit", false)).toBeNull();
    });

    it("returns null when oracle results are absent", () => {
      rollOracle.mockReturnValue(null);
      expect(buildOracleSeeds("make_a_connection", "strong_hit", false)).toBeNull();
    });

    it("emits only names when role/goal/first_look are empty but a name is present", () => {
      rollOracle.mockImplementation((tableId) =>
        tableId === "given_name" ? { result: "Echo" } : { result: "—" }
      );

      const seeds = buildOracleSeeds("make_a_connection", "strong_hit", false);
      expect(seeds.results).toEqual([]);
      expect(seeds.names).toEqual(["Echo"]);
    });

    it("returns null when rollOracle throws (safeRoll catch)", () => {
      rollOracle.mockImplementation(() => { throw new Error("table missing"); });
      expect(buildOracleSeeds("make_a_connection", "strong_hit", false)).toBeNull();
    });
  });

  describe("explore_a_waypoint", () => {
    it("only seeds on strong hit with a match", () => {
      rollPaired.mockReturnValue({ combined: "Reveal · Wonder" });
      expect(buildOracleSeeds("explore_a_waypoint", "strong_hit", false)).toBeNull();
      expect(buildOracleSeeds("explore_a_waypoint", "weak_hit",   true )).toBeNull();
      expect(buildOracleSeeds("explore_a_waypoint", "miss",       true )).toBeNull();
    });

    it("returns the action+theme prompt on strong hit with a match", () => {
      rollPaired.mockReturnValue({ combined: "Reveal · Wonder" });
      const seeds = buildOracleSeeds("explore_a_waypoint", "strong_hit", true);
      expect(seeds).toEqual({
        results: ["Notable aspect of this waypoint: Reveal · Wonder"],
        names:   [],
        context: "explore_a_waypoint",
      });
    });

    it("returns null when the paired roll has no combined string", () => {
      rollPaired.mockReturnValue({});
      expect(buildOracleSeeds("explore_a_waypoint", "strong_hit", true)).toBeNull();
    });
  });

  describe("make_a_discovery", () => {
    it("returns the descriptor+focus prompt", () => {
      rollPaired.mockReturnValue({ combined: "Ancient · Beacon" });
      const seeds = buildOracleSeeds("make_a_discovery", "strong_hit", false);
      expect(seeds.context).toBe("make_a_discovery");
      expect(seeds.results[0]).toContain("Ancient · Beacon");
      expect(seeds.names).toEqual([]);
    });

    it("returns null when the paired roll throws", () => {
      rollPaired.mockImplementation(() => { throw new Error("table missing"); });
      expect(buildOracleSeeds("make_a_discovery", "strong_hit", false)).toBeNull();
    });
  });

  describe("confront_chaos", () => {
    it("returns the action+theme prompt", () => {
      rollPaired.mockReturnValue({ combined: "Sunder · Doom" });
      const seeds = buildOracleSeeds("confront_chaos", "miss", true);
      expect(seeds.context).toBe("confront_chaos");
      expect(seeds.results[0]).toContain("Sunder · Doom");
    });

    it("returns null when paired roll yields nothing", () => {
      rollPaired.mockReturnValue(null);
      expect(buildOracleSeeds("confront_chaos", "strong_hit", false)).toBeNull();
    });
  });

  describe("ask_the_oracle", () => {
    it("returns the default action+theme prompt", () => {
      rollPaired.mockReturnValue({ combined: "Ponder · Truth" });
      const seeds = buildOracleSeeds("ask_the_oracle", "strong_hit", false);
      expect(seeds.context).toBe("ask_the_oracle");
      expect(seeds.results[0]).toContain("Ponder · Truth");
    });

    it("returns null when paired roll yields nothing", () => {
      rollPaired.mockReturnValue({});
      expect(buildOracleSeeds("ask_the_oracle", "strong_hit", false)).toBeNull();
    });
  });
});
