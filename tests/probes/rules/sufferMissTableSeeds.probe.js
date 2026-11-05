/**
 * PROBE — RULES-02 SUFFER-MISS-TABLE-SEEDED-UNROLLED (tenth audit, area rules)
 *
 * What the user does: Kira, at 3 health, chooses to resist a harm and misses
 * her Endure Harm (the same for an Endure Stress miss at 2 spirit, and a
 * Withstand Damage miss with the ship at 2 integrity).
 *
 * What happens: buildOracleSeeds (src/moves/resolver.js:1523-1545) rolls the
 * mortal-wound d100 on EVERY Endure Harm miss — desolation on every Endure
 * Stress miss, vehicle damage on every Withstand Damage miss — and hands the
 * row to the narrator as an ORACLE SEED ("Mortal wound (if health at 0): You
 * are dying…"; narratorPrompt.js formatOracleSeedsBlock: "use as inspiration
 * — you may develop or adapt"), whatever the meter holds. The book rolls the
 * table only when the resist roll misses AT 0, and only if the player picks
 * the table over marking wounded / permanently harmed (vendored Endure_Harm;
 * issue #329 X03): at 0 the choice card later rolls ITS OWN d100
 * (sufferExecutor.rollImpactTable) — or marks an impact instead — so the
 * narration depicts a wound the table never rolled, the issue #321 U03 /
 * #326 W47 shape ("its narration depicted discovery X and the button's move
 * rolled discovery Y"). TDA-COST-DOUBLE-ROLL records the same shape for Take
 * Decisive Action; these three sites are its siblings.
 *
 * What should happen: no pre-roll — the table is the choice card's one roll
 * at 0, and that roll seeds the narration (withPayThePriceSeed's rule).
 *
 * Control: Make a Discovery seeds its own table (the table IS the move); a
 * matched waypoint strong hit seeds no discovery (W47); a miss the pipeline
 * routes seeds no Pay the Price (U03).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/rules/sufferMissTableSeeds.probe.js
 */

import { describe, it, expect } from "vitest";
import { buildOracleSeeds } from "../../../src/moves/resolver.js";

const results = (seeds) => (seeds?.results ?? []).join(" | ");

describe("PROBE RULES-02 SUFFER-MISS-TABLE-SEEDED-UNROLLED", () => {
  it("an Endure Harm miss does not pre-roll the mortal-wound table for the narrator", () => {
    // Expected: no "Mortal wound" seed. Actual: "Mortal wound (if health at 0): …" on every miss.
    expect(results(buildOracleSeeds("endure_harm", "miss", false))).not.toMatch(/mortal wound/i);
  });

  it("an Endure Stress miss does not pre-roll desolation; a Withstand Damage miss does not pre-roll vehicle damage", () => {
    expect.soft(results(buildOracleSeeds("endure_stress", "miss", false))).not.toMatch(/desolation/i);
    expect.soft(results(buildOracleSeeds("withstand_damage", "miss", false))).not.toMatch(/vehicle damage/i);
  });

  it("control: Make a Discovery seeds its own table — the table is the move", () => {
    expect(results(buildOracleSeeds("make_a_discovery", null, false))).toMatch(/Make a Discovery:/);
  });

  it("control: a matched waypoint strong hit seeds no discovery (W47); a routed miss seeds no price (U03)", () => {
    expect(results(buildOracleSeeds("explore_a_waypoint", "strong_hit", true))).not.toMatch(/Make a Discovery:/);
    expect(results(buildOracleSeeds("face_danger", "miss", false, null, { routesPayThePrice: true }))).not.toMatch(/Pay the Price:/);
  });
});
