/**
 * PROBE — RULES-03 PLAYKIT-PUNCH-LIST-STALE (tenth audit, area rules; DOC-DRIFT)
 *
 * What the user does: a maintainer (or the next audit) reads
 * docs/rules-reference/playkit-rules-and-coverage.md — "the canonical surface
 * of the game … Part 3 is a punch list of mismatches" (rules/game-rules.md:
 * "Part 3 … should be re-audited after any meaningful rules change"; the doc's
 * own maintenance rule: "A bug listed in Part 3 is fixed (move it to the
 * 'what is solid' recap)").
 *
 * What happens: Part 3 still lists as OPEN bugs and gaps that the tree has
 * fixed — 3.1.1 (the inverted momentum reset: actorBridge.js momentumBounds
 * is 2/1/0), 3.1.2 (IMPACT_KEYS counts all ten play-kit impacts), 3.1.3
 * (custom1/custom2 are gone; the three classic extras are counted because
 * the vendor's #impactCount counts them — wrongly listed), 3.2 (all eight
 * "missing" tables are registered), 3.3.1 (rollYesNo + `!oracle yes`), 3.3.4
 * (PICK_HIGHER_OF), 3.3.6 (`!repair` applies the spends), 3.4.1-3.4.5 (the
 * five session dialogs exist) and 3.5 (clocks, scene challenges, custom
 * oracles) — and Part 2's rows 2.2 ("Repair points/spends not auto-applied"),
 * 2.4 (five "❌ not present" tables, yes/no "no consumer") and 3.6 ("Reset
 * value depends on the bridge bug above") say the same. Only 3.3.2, 3.3.3 and
 * 3.3.5 carry the doc's "— FIXED" marker.
 *
 * What should happen: each fixed item carries the doc's FIXED marker (or
 * moves to 3.6), and the Part 2 rows read ✅ — the doc is a contract.
 *
 * Control: the three items the doc already marks FIXED; Part 1's rank table
 * matches RANK_TICKS.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/rules/playkitPunchListStale.probe.js
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { RANK_TICKS } from "../../../src/schemas.js";
import { ORACLE_TABLES, rollYesNo } from "../../../src/oracles/roller.js";
import { readMomentumState } from "../../../src/character/actorBridge.js";
import { enrichInterpretationStatValue } from "../../../src/moves/statEnrichment.js";

const DOC = fs.readFileSync(fileURLToPath(new URL("../../../docs/rules-reference/playkit-rules-and-coverage.md", import.meta.url)), "utf8");
const section = (from, to) => {
  const a = DOC.indexOf(from); if (a < 0) return "";
  const b = DOC.indexOf(to, a + from.length);
  return DOC.slice(a, b < 0 ? undefined : b);
};
const fixedHeading = (n) => new RegExp(`\\*\\*${n.replace(/\\./g, "\\\\.")}[^\\n]*FIXED`);
// Stats are plain numbers on the sheet, meters `{ value }`; a distinct id per
// stub, since readCharacterSnapshot caches by actor id.
let n = 0;
const pc = (debility = {}) => ({ id: `pc-${++n}`, system: { momentum: { value: 3, max: 10, resetValue: 2, min: -6 }, debility,
  health: { value: 2 }, iron: 3, edge: 1, heart: 1, shadow: 1, wits: 1 } });

describe("PROBE RULES-03 PLAYKIT-PUNCH-LIST-STALE", () => {
  it("3.1.1 / 3.1.2 / 3.1.3: the momentum bounds are the play kit's at HEAD, so the doc marks them fixed", () => {
    expect(readMomentumState(pc({ wounded: true })).reset).toBe(1);             // 2 − 1 impact
    expect(readMomentumState(pc({ doomed: true, tormented: true })).max).toBe(8); // every impact counts
    // Expected: the headings carry the doc's "— FIXED" marker. Actual: all three listed as open bugs.
    expect(fixedHeading("3.1.1").test(DOC)).toBe(true);
    expect.soft(fixedHeading("3.1.2").test(DOC)).toBe(true);
    expect.soft(fixedHeading("3.1.3").test(DOC)).toBe(true);
  });

  it("3.2: the eight 'missing' tables are registered, so the doc no longer lists them as missing", () => {
    for (const id of ["pay_the_price", "spotlight_vignette", "make_a_discovery", "confront_chaos", "decisive_action_cost", "mortal_wound", "desolation", "vehicle_damage"]) {
      expect(ORACLE_TABLES[id]?.table?.length, id).toBeGreaterThan(0);
    }
    const s = section("### 3.2 Missing tables", "### 3.3");
    // Expected: the rows carry FIXED or are gone from "Missing tables". Actual: all eight still listed as missing.
    expect(/FIXED/.test(s) || !s.includes("| Pay the Price d100")).toBe(true);
  });

  it("3.3.1 / 3.3.4 / 3.3.6: yes-no odds, the higher stat and the repair spends exist, so the doc marks them fixed", async () => {
    expect(rollYesNo("likely", { roll: 75 }).answer).toBe("yes");
    const interp = { moveId: "endure_harm", statUsed: "health" };
    enrichInterpretationStatValue(pc(), interp, {});
    expect(interp.statUsed).toBe("iron");
    const repair = await import("../../../src/moves/repair.js");
    expect(typeof repair.applyRepairSpends).toBe("function");
    expect(fixedHeading("3.3.1").test(DOC)).toBe(true);
    expect.soft(fixedHeading("3.3.4").test(DOC)).toBe(true);
    expect.soft(fixedHeading("3.3.6").test(DOC)).toBe(true);
  });

  it("3.4 / 3.5: the session dialogs, clocks, scene challenges and custom oracles exist, so the doc's rows say so", async () => {
    const dialogs = await import("../../../src/safety/sessionDialogs.js");
    const lifecycle = await import("../../../src/safety/sessionLifecycleDialogs.js");
    const clocks = await import("../../../src/clocks/clocks.js");
    const custom = await import("../../../src/oracles/customOracles.js");
    const scene = await import("../../../src/moves/sceneChallenge.js");
    for (const fn of [dialogs.openSetFlagDialog, dialogs.openChangeYourFateDialog, dialogs.openTakeABreakDialog,
      lifecycle.openBeginSessionDialog, lifecycle.openEndSessionDialog, clocks.createClock, custom.validateCustomOracleEntries, scene.finishSceneChallenge]) {
      expect(typeof fn).toBe("function");
    }
    const s34 = section("### 3.4 Missing UI", "### 3.5");
    const s35 = section("### 3.5 Worksheets", "### 3.6");
    // Expected: the rows no longer read as missing. Actual: 3.4 lists all six as missing, 3.5 marks all three ❌.
    expect(/FIXED|✅/.test(s34)).toBe(true);
    expect.soft(s35.includes("| Clocks | ❌")).toBe(false);
    expect.soft(s35.includes("| Custom oracle tables | ❌")).toBe(false);
  });

  it("Part 2.2 / 2.4 / 3.6: the rows that restate the fixed items are updated too", () => {
    const s24 = section("### 2.4 Oracles", "### 2.5");
    expect.soft(s24.includes("**Pay the Price** d100 (play-kit, 16 entries) | ❌")).toBe(false);
    expect.soft(/Yes\/no with odds\*\* \| ❌/.test(s24)).toBe(false);
    expect.soft(section("### 2.2 Per-move", "### 2.3").includes("not auto-applied to vehicle integrity (advice only)")).toBe(false);
    expect(DOC.includes("Reset value\n  depends on the bridge bug above")).toBe(false);
  });

  it("control: the items the doc already marks FIXED, and Part 1's rank table", () => {
    expect(fixedHeading("3.3.2").test(DOC)).toBe(true);
    expect(fixedHeading("3.3.3").test(DOC)).toBe(true);
    expect(fixedHeading("3.3.5").test(DOC)).toBe(true);
    expect(DOC).toContain("troublesome **+12** (3 boxes), dangerous **+8** (2 boxes), formidable\n  **+4** (1 box), extreme **+2**, epic **+1**");
    expect(RANK_TICKS).toEqual({ troublesome: 12, dangerous: 8, formidable: 4, extreme: 2, epic: 1 });
  });
});
