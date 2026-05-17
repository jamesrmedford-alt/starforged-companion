/**
 * STARFORGED COMPANION
 * tests/unit/repair.test.js
 *
 * Unit coverage for the Repair point-spend constants. The dialog body
 * is exercised only through live Foundry (DialogV2 is not stubbed);
 * what we can pin from a unit test is that the points matrix and the
 * spend costs match the play kit (p. 7).
 */

import { describe, it, expect } from "vitest";
import { _internal } from "../../src/moves/repair.js";


describe("Repair points table (play kit p. 7)", () => {
  it("facility yields 5 / 3 by outcome", () => {
    expect(_internal.POINTS_TABLE.facility).toEqual({ strong: 5, weak: 3 });
  });
  it("field yields 3 / 1 by outcome", () => {
    expect(_internal.POINTS_TABLE.field).toEqual({ strong: 3, weak: 1 });
  });
  it("under fire yields 2 / 0 by outcome", () => {
    expect(_internal.POINTS_TABLE.under_fire).toEqual({ strong: 2, weak: 0 });
  });
});

describe("Repair spend costs (play kit p. 7)", () => {
  it("clear battered = 2 points", () => {
    expect(_internal.SPEND_COST.clear_battered).toBe(2);
  });
  it("fix one broken module = 2 points", () => {
    expect(_internal.SPEND_COST.fix_module).toBe(2);
  });
  it("+1 integrity = 1 point", () => {
    expect(_internal.SPEND_COST.integrity).toBe(1);
  });
  it("+1 mechanical companion health = 1 point", () => {
    expect(_internal.SPEND_COST.companion_health).toBe(1);
  });
  it("other device clean = 3 points", () => {
    expect(_internal.SPEND_COST.other_device).toBe(3);
  });
  it("other device with complication = 2 points", () => {
    expect(_internal.SPEND_COST.other_device_cx).toBe(2);
  });
});
