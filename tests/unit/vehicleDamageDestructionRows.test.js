/**
 * STARFORGED COMPANION
 * tests/unit/vehicleDamageDestructionRows.test.js
 *
 * Issue #364 OVERCOME-DESTRUCTION-ROWS.
 *
 * Withstand Damage's vehicle-damage table (play kit; vendored
 * Withstand_Damage) destroys the vehicle on its first row alone:
 *
 *    1–10  Immediate catastrophic destruction. …
 *   11–25  Destruction is imminent and unavoidable. If you do not have the
 *          means or intention to get clear, Endure Harm or Face Death …
 *   26–40  Destruction is imminent, but can be averted if you Repair your
 *          vehicle and raise its integrity above 0. …
 *
 * The roll's card adds the destruction prompt — "Command vehicle destruction.
 * Trigger Overcome Destruction when ready." for the command vehicle, "If the
 * vehicle is destroyed, discard the asset" for a support vehicle. It was
 * matched on the row's wording (/catastrophic|destruction/), so rows 11–40
 * carried it too: a ship the row says can still be repaired was announced as
 * destroyed, with Overcome Destruction (discard the ship, its modules and its
 * docked support vehicles) as the next step. Only the first row says so now.
 *
 * Driven through the real rollImpactTable — the choice card's "Roll on the
 * vehicle-damage table" (sufferDialog's `rollTable`) — and the real table.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { rollImpactTable } from "../../src/moves/sufferExecutor.js";
import { VEHICLE_DAMAGE } from "../../src/oracles/tables/sufferAndCombat.js";

const DESTRUCTION_PROMPT = /Command vehicle destruction|Overcome Destruction|discard the asset/i;

/** The card the roll posted. */
async function cardFor(roll, opts = {}) {
  ChatMessage._reset();
  const rolled = await rollImpactTable("vehicle_damage", { fixedRoll: roll, actorName: "Kira", ...opts });
  expect(ChatMessage._created).toHaveLength(1);
  return { rolled, content: ChatMessage._created[0].content };
}

beforeEach(() => ChatMessage._reset());

describe("the vehicle-damage table's destruction prompt (issue #364 OVERCOME-DESTRUCTION-ROWS)", () => {
  it("control: the table's first row is 1–10, the only one that destroys the vehicle outright", () => {
    expect(VEHICLE_DAMAGE[0]).toMatchObject({ min: 1, max: 10 });
    expect(VEHICLE_DAMAGE[0].result).toMatch(/^Immediate catastrophic destruction/);
    expect(VEHICLE_DAMAGE[1]).toMatchObject({ min: 11, max: 25 });
    expect(VEHICLE_DAMAGE[2]).toMatchObject({ min: 26, max: 40 });
  });

  it.each([1, 5, 10])("a roll of %i says the command vehicle is destroyed and points at Overcome Destruction", async (roll) => {
    const { content } = await cardFor(roll);
    expect(content).toMatch(/Immediate catastrophic destruction/);
    expect(content).toMatch(/Command vehicle destruction.*Overcome Destruction/);
  });

  it.each([1, 10])("a roll of %i on a support vehicle says to discard its asset", async (roll) => {
    const { content } = await cardFor(roll, { vehicleItemId: "asset-hoverbike" });
    expect(content).toMatch(/discard the asset/);
    expect(content).not.toMatch(/Overcome Destruction/);
  });

  it.each([11, 18, 25])("a roll of %i — imminent and unavoidable — shows its row with no destruction prompt", async (roll) => {
    const { rolled, content } = await cardFor(roll);
    expect(rolled.result).toMatch(/^Destruction is imminent and unavoidable/);
    expect(content).toContain(rolled.result);
    expect(content).not.toMatch(DESTRUCTION_PROMPT);
  });

  it.each([26, 33, 40])("a roll of %i — it can be averted with a Repair — shows its row with no destruction prompt", async (roll) => {
    const { rolled, content } = await cardFor(roll);
    expect(rolled.result).toMatch(/can be averted if you Repair/);
    expect(content).toContain(rolled.result);
    expect(content).not.toMatch(DESTRUCTION_PROMPT);
  });

  it.each([11, 26, 40])("a roll of %i on a support vehicle does not say to discard it", async (roll) => {
    const { content } = await cardFor(roll, { vehicleItemId: "asset-hoverbike" });
    expect(content).not.toMatch(DESTRUCTION_PROMPT);
  });

  it("the rows that never spoke of destruction are unchanged", async () => {
    for (const roll of [41, 56, 71, 86, 96, 100]) {
      const { content } = await cardFor(roll);
      expect(content).not.toMatch(DESTRUCTION_PROMPT);
    }
  });
});
