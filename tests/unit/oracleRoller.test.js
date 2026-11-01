/**
 * STARFORGED COMPANION
 * tests/unit/oracleRoller.test.js
 *
 * Unit tests for src/oracles/roller.js — focused on rollYesNo (the play-kit
 * Ask the Oracle yes/no with odds mechanic), since the table-roll path
 * (rollOracle / rollPaired) is exercised by resolver tests.
 */

import { describe, it, expect, vi } from "vitest";
import { rollYesNo, rollOracle, ORACLE_TABLES } from "../../src/oracles/roller.js";


describe("rollYesNo", () => {
  it("returns yes when roll <= threshold", () => {
    const r = rollYesNo("likely", { roll: 50 });
    expect(r.answer).toBe("yes");
    expect(r.threshold).toBe(75);
  });

  it("returns no when roll > threshold", () => {
    const r = rollYesNo("unlikely", { roll: 26 });
    expect(r.answer).toBe("no");
    expect(r.threshold).toBe(25);
  });

  it("treats roll exactly at threshold as yes", () => {
    expect(rollYesNo("small_chance",   { roll: 10 }).answer).toBe("yes");
    expect(rollYesNo("unlikely",       { roll: 25 }).answer).toBe("yes");
    expect(rollYesNo("50_50",          { roll: 50 }).answer).toBe("yes");
    expect(rollYesNo("likely",         { roll: 75 }).answer).toBe("yes");
    expect(rollYesNo("almost_certain", { roll: 90 }).answer).toBe("yes");
  });

  it("detects match on doubles (11, 22, 33, ..., 99)", () => {
    expect(rollYesNo("50_50", { roll: 11 }).isMatch).toBe(true);
    expect(rollYesNo("50_50", { roll: 22 }).isMatch).toBe(true);
    expect(rollYesNo("50_50", { roll: 33 }).isMatch).toBe(true);
    expect(rollYesNo("50_50", { roll: 99 }).isMatch).toBe(true);
  });

  it("treats 100 as a match (tens=0, ones=0)", () => {
    expect(rollYesNo("50_50", { roll: 100 }).isMatch).toBe(true);
  });

  it("does not flag mismatched digits as a match", () => {
    expect(rollYesNo("50_50", { roll: 12 }).isMatch).toBe(false);
    expect(rollYesNo("50_50", { roll: 67 }).isMatch).toBe(false);
    expect(rollYesNo("50_50", { roll: 50 }).isMatch).toBe(false);
  });

  it("echoes the optional question", () => {
    const r = rollYesNo("likely", { roll: 50, question: "Will the door open?" });
    expect(r.question).toBe("Will the door open?");
  });

  it("throws on unknown odds", () => {
    expect(() => rollYesNo("definitely", { roll: 50 })).toThrow(/Unknown odds/);
  });

  it("rolls a random d100 in range when no roll is provided", () => {
    for (let i = 0; i < 20; i++) {
      const r = rollYesNo("50_50");
      expect(r.roll).toBeGreaterThanOrEqual(1);
      expect(r.roll).toBeLessThanOrEqual(100);
    }
  });

  it("reports tens and ones digits correctly", () => {
    const r1 = rollYesNo("50_50", { roll: 34 });
    expect(r1.tens).toBe(3);
    expect(r1.ones).toBe(4);

    const r2 = rollYesNo("50_50", { roll: 100 });
    expect(r2.tens).toBe(0);
    expect(r2.ones).toBe(0);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// rollOracle — directive handling (F2). The starship seeder, the custom-oracle
// panel, and the `!oracle` chat command all flow through rollOracle. Before
// this fix, a roll landing on a "Roll twice" / "Action + Theme" / "Roll again"
// row leaked the literal directive text into ship type/first-look/mission and
// into chat cards.
// ─────────────────────────────────────────────────────────────────────────────

describe("rollOracle — directive resolution", () => {
  it("never returns 'Roll twice' on character_role across the full d100 range", () => {
    for (let roll = 1; roll <= 100; roll++) {
      const r = rollOracle("character_role", { roll });
      expect(r.result).not.toMatch(/^Roll twice$/i);
    }
  });

  it("never returns 'Roll twice' on character_goal across the full d100 range", () => {
    for (let roll = 1; roll <= 100; roll++) {
      const r = rollOracle("character_goal", { roll });
      expect(r.result).not.toMatch(/^Roll twice$/i);
    }
  });

  it("never returns 'Roll twice' on starship_type across the full d100 range", () => {
    for (let roll = 1; roll <= 100; roll++) {
      const r = rollOracle("starship_type", { roll });
      expect(r.result).not.toMatch(/^Roll twice$/i);
    }
  });

  it("preserves isRef on Action+Theme rows so callers can still detect the chain shape", () => {
    // character_role 93-95 is the action_theme row.
    const r = rollOracle("character_role", { roll: 94 });
    expect(r.isRef).toBe(true);
    expect(r.refTableId).toBe("action_theme");
    expect(r.result).not.toMatch(/^Action \+ Theme$/);
    expect(r.result.length).toBeGreaterThan(0);
  });

  it("passes through non-directive results verbatim", () => {
    // character_role 1-2 is "Agent" — no directive.
    const r = rollOracle("character_role", { roll: 1 });
    expect(r.result).toBe("Agent");
    expect(r.isRef).toBe(false);
  });

  // Issue #321 U68: the rulebook's other directive wordings came back verbatim
  // as answers — "Roll three times", Starship Type's "Ships in conflict (roll
  // twice)" (about 6% of new starships got it as their type) and Creature
  // Scale's "Ultra-scale (roll on ultra table)", whose table was not
  // registered at all.
  describe("every directive wording resolves (issue #321 U68)", () => {
    /** Roll `roll` on `tableId` with the d100s after it scripted. */
    function rollScripted(tableId, roll, ...next) {
      const rng = vi.spyOn(Math, "random");
      for (const v of next) rng.mockReturnValueOnce((v - 0.5) / 100);
      try { return rollOracle(tableId, { roll }); } finally { rng.mockRestore(); }
    }

    it('Space Sighting 99 "Roll three times" rolls three results, in every region', () => {
      expect(rollScripted("space_sighting_terminus", 99, 61, 75, 86).result)
        .toBe("Debris field: Mineral asteroids / Large rogue asteroid / Dense nebula cloud");
      for (const id of ["space_sighting_outlands", "space_sighting_expanse"]) {
        const r = rollScripted(id, 100, 86, 86, 86);
        expect(r.result, id).toBe("Dense nebula cloud / Dense nebula cloud / Dense nebula cloud");
      }
    });

    it('Starship Type "Ships in conflict (roll twice)" names the two ships under its heading', () => {
      const r = rollScripted("starship_type", 97, 5, 35);
      expect(r.result).toBe("Ships in conflict: Corvette — Light attack ship / Hunter — Stealthy attack ship");
    });

    it('Creature Scale 100 "Ultra-scale" rolls on the registered Ultra-scale table', () => {
      const r = rollScripted("creature_scale", 100, 95);
      expect(r.result).toBe("Ultra-scale: Colossal (mountain-sized)");
      expect(r).toMatchObject({ isRef: true, refTableId: "creature_ultra_scale" });
      expect(rollOracle("creature_ultra_scale", { roll: 100 }).result).toBe("Vast (planet-sized)");
      expect(rollOracle("creature_ultra_scale", { roll: 1 }).result).toBe("Titanic (hill-sized)");
    });

    it("no registered table returns a directive's own words at any roll", () => {
      const DIRECTIVE = /^Roll (twice|three times|again)\b|\(roll (twice|on [^)]*)\)/i;
      const rng = vi.spyOn(Math, "random").mockReturnValue(0);   // every follow-up roll is a 1
      try {
        const leaks = [];
        for (const [id, def] of Object.entries(ORACLE_TABLES)) {
          if (def.category === "custom") continue;
          for (let roll = 1; roll <= 100; roll++) {
            const { result } = rollOracle(id, { roll });
            if (DIRECTIVE.test(result)) leaks.push(`${id} ${roll}: ${result}`);
          }
        }
        expect(leaks).toEqual([]);
      } finally { rng.mockRestore(); }
    });
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// F16 Phase E — Pay the Price sufferRoute annotations surface on rollOracle (sufferRoutes)
// ─────────────────────────────────────────────────────────────────────────────

describe("rollOracle — Pay the Price sufferRoutes (F16 Phase E)", () => {
  it("surfaces the route for 'You are harmed' (75-81 band)", () => {
    const r = rollOracle("pay_the_price", { roll: 78 });
    expect(r.result).toMatch(/harmed/i);
    expect(r.sufferRoutes).toEqual([{ move: "endure_harm", amount: 1 }]);
  });

  it("surfaces the route for 'You are stressed' (82-88 band)", () => {
    const r = rollOracle("pay_the_price", { roll: 85 });
    expect(r.sufferRoutes).toEqual([{ move: "endure_stress", amount: 1 }]);
  });

  it("surfaces the route for 'You waste resources' (69-74 band)", () => {
    const r = rollOracle("pay_the_price", { roll: 70 });
    expect(r.sufferRoutes).toEqual([{ move: "sacrifice_resources", amount: 1 }]);
  });

  it("surfaces the route for 'Your vehicle suffers damage' (63-68 band)", () => {
    const r = rollOracle("pay_the_price", { roll: 65 });
    expect(r.sufferRoutes).toEqual([{ move: "withstand_damage", amount: 1 }]);
  });

  it("surfaces the route with soloFallback for 'friend in harm's way' (51-56 band)", () => {
    const r = rollOracle("pay_the_price", { roll: 52 });
    expect(r.sufferRoutes).toEqual([{ move: "companion_takes_a_hit", amount: 1, soloFallback: "endure_harm" }]);
  });

  it("lists no route on narrative-only entries", () => {
    // 19-22: "A surprising development complicates your quest" — narrative
    const r = rollOracle("pay_the_price", { roll: 20 });
    expect(r.sufferRoutes).toEqual([]);
  });

  // Issue #314 Q03: a 96–100 returned the joined text alone, so the leaves'
  // routes were lost — "You are harmed / You are stressed" changed no meter.
  describe("a 'Roll twice' keeps each leaf's route (issue #314 Q03)", () => {
    /** Roll a 96 with the d100s after it scripted: the Roll twice's leaves, then anything nested. */
    function rollTwice(...nested) {
      const rng = vi.spyOn(Math, "random");
      for (const v of nested) rng.mockReturnValueOnce((v - 0.5) / 100);
      try { return rollOracle("pay_the_price", { roll: 96 }); } finally { rng.mockRestore(); }
    }

    it("harm and stress: both routes, in the leaves' order, under the joined text", () => {
      const r = rollTwice(78, 85);
      expect(r.result).toBe("You are harmed / You are stressed");
      expect(r.sufferRoutes).toEqual([{ move: "endure_harm", amount: 1 }, { move: "endure_stress", amount: 1 }]);
    });

    it("a narrative leaf and a routed one: the one route", () => {
      const r = rollTwice(10, 85);
      expect(r.result).toBe("You create an opportunity for an enemy / You are stressed");
      expect(r.sufferRoutes).toEqual([{ move: "endure_stress", amount: 1 }]);
    });

    it("two of the same leaf are two routes — each lands once", () => {
      const r = rollTwice(78, 80);
      expect(r.result).toBe("You are harmed / You are harmed");
      expect(r.sufferRoutes).toEqual([{ move: "endure_harm", amount: 1 }, { move: "endure_harm", amount: 1 }]);
    });

    it("a nested Roll twice adds its leaves' routes", () => {
      const r = rollTwice(97, 78, 70, 85);   // 96 → (97 → (78, 70)), 85
      expect(r.result).toBe("You are harmed / You waste resources / You are stressed");
      expect(r.sufferRoutes).toEqual([
        { move: "endure_harm", amount: 1 }, { move: "sacrifice_resources", amount: 1 }, { move: "endure_stress", amount: 1 },
      ]);
    });

    it("the recursion cap ends a run of Roll twice with the directive's own text and no route", () => {
      const r = rollTwice(...Array(40).fill(98));   // every nested roll is a Roll twice
      expect(r.result).toMatch(/Roll twice/);
      expect(r.sufferRoutes).toEqual([]);
    });
  });
});


describe("derelict zone-crawl registry (SITE-ZONE-TABLES-DEAD fix, 2026-07)", () => {
  const IDS = [
    "derelict_type_planetside", "derelict_type_orbital",
    "derelict_access_area", "derelict_access_feature",
    "derelict_access_peril", "derelict_access_opportunity",
    "derelict_area_community", "derelict_area_engineering",
    "derelict_area_living", "derelict_area_medical",
    "derelict_area_operations", "derelict_area_production",
    "derelict_area_research",
  ];
  it("registers all thirteen previously dead tables and they roll", () => {
    for (const id of IDS) {
      const out = rollOracle(id, { roll: 50 });
      expect(out.result, id).toBeTruthy();
    }
  });
});


describe("theme peril/opportunity registry (THEME-PERIL-OPP-DEAD fix, issue #272)", () => {
  const THEME_KEYS = [
    "chaotic", "haunted", "infested", "inhabited",
    "mechanical", "ruined", "sacred",
  ];
  it("registers the peril + opportunity table for every theme and they roll", () => {
    for (const key of THEME_KEYS) {
      for (const suffix of ["peril", "opportunity"]) {
        const id = `theme_${key}_${suffix}`;
        const out = rollOracle(id, { roll: 50 });
        expect(out.result, id).toBeTruthy();
      }
    }
  });
});
