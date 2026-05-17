/**
 * STARFORGED COMPANION
 * tests/unit/oracleRoller.test.js
 *
 * Unit tests for src/oracles/roller.js — focused on rollYesNo (the play-kit
 * Ask the Oracle yes/no with odds mechanic), since the table-roll path
 * (rollOracle / rollPaired) is exercised by resolver tests.
 */

import { describe, it, expect } from "vitest";
import { rollYesNo } from "../../src/oracles/roller.js";


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
