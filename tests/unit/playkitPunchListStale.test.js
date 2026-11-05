/**
 * STARFORGED COMPANION
 * tests/unit/playkitPunchListStale.test.js
 *
 * Issue #337 Y49 (PLAYKIT-PUNCH-LIST-STALE). docs/rules-reference/
 * playkit-rules-and-coverage.md — "the canonical surface of the game … Part 3
 * is a punch list" (rules/game-rules.md: "Part 3 … should be re-audited after
 * any meaningful rules change") — listed as open bugs and gaps what the tree
 * had fixed: 3.1.1 (the momentum reset), 3.1.2 (all impacts count), 3.1.3
 * (wrongly listed — the vendor's own impacts), 3.2 (the eight tables), 3.3.1
 * (yes/no with odds), 3.3.4 (the higher stat), 3.3.6 (Repair's spends), 3.4
 * (the session dialogs) and 3.5 (clocks, scene challenges, custom oracles);
 * Part 2's rows 2.2 / 2.4 and the 3.6 recap restated them. Each code fact is
 * checked here beside the doc's claim about it.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { RANK_TICKS } from "../../src/schemas.js";
import { ORACLE_TABLES, rollYesNo } from "../../src/oracles/roller.js";
import { readMomentumState } from "../../src/character/actorBridge.js";
import { enrichInterpretationStatValue } from "../../src/moves/statEnrichment.js";

const DOC = fs.readFileSync(fileURLToPath(new URL("../../docs/rules-reference/playkit-rules-and-coverage.md", import.meta.url)), "utf8");
const section = (from, to) => {
  const a = DOC.indexOf(from); if (a < 0) return "";
  const b = DOC.indexOf(to, a + from.length);
  return DOC.slice(a, b < 0 ? undefined : b);
};
const fixedHeading = (n) => new RegExp(`\\*\\*${n.replace(/\./g, "\\.")}[^\\n]*FIXED`);
// Stats are plain numbers on the sheet, meters `{ value }`; a distinct id per
// stub, since readCharacterSnapshot caches by actor id.
let n = 0;
const pc = (debility = {}) => ({ id: `pc-${++n}`, system: { momentum: { value: 3, max: 10, resetValue: 2, min: -6 }, debility,
  health: { value: 2 }, iron: 3, edge: 1, heart: 1, shadow: 1, wits: 1 } });

describe("the play-kit punch list says what the tree holds (issue #337 Y49)", () => {
  it("3.1.1 / 3.1.2 / 3.1.3: the momentum bounds are the play kit's, so the doc marks them fixed — 3.1.3 as the vendor's rule", () => {
    expect(readMomentumState(pc({ wounded: true })).reset).toBe(1);             // 2 − 1 impact
    expect(readMomentumState(pc({ doomed: true, tormented: true })).max).toBe(8); // every impact counts
    expect(readMomentumState(pc({ encumbered: true })).max).toBe(9);             // the vendor's own impacts count too
    expect(fixedHeading("3.1.1").test(DOC)).toBe(true);
    expect(fixedHeading("3.1.2").test(DOC)).toBe(true);
    expect(fixedHeading("3.1.3").test(DOC)).toBe(true);
    expect(DOC).not.toMatch(/`readDebilities` invents/);
    expect(section("**3.1.3", "### 3.2")).toMatch(/the\s+sheet's\s+rule,\s+not\s+a\s+bug/);
  });

  it("3.2: the eight 'missing' tables are registered, so the doc no longer lists them as missing", () => {
    for (const id of ["pay_the_price", "spotlight_vignette", "make_a_discovery", "confront_chaos", "decisive_action_cost", "mortal_wound", "desolation", "vehicle_damage"]) {
      expect(ORACLE_TABLES[id]?.table?.length, id).toBeGreaterThan(0);
    }
    const s = section("### 3.2 Missing tables", "### 3.3");
    expect(/FIXED/.test(s) || !s.includes("| Pay the Price d100")).toBe(true);
    expect(s).not.toMatch(/Suggested home/);
  });

  it("3.3.1 / 3.3.4 / 3.3.6: yes-no odds, the higher stat and the repair spends exist, so the doc marks them fixed", async () => {
    expect(rollYesNo("likely", { roll: 75 }).answer).toBe("yes");
    const interp = { moveId: "endure_harm", statUsed: "health" };
    enrichInterpretationStatValue(pc(), interp, {});
    expect(interp.statUsed).toBe("iron");
    const repair = await import("../../src/moves/repair.js");
    expect(typeof repair.applyRepairSpends).toBe("function");
    expect(fixedHeading("3.3.1").test(DOC)).toBe(true);
    expect(fixedHeading("3.3.4").test(DOC)).toBe(true);
    expect(fixedHeading("3.3.6").test(DOC)).toBe(true);
  });

  it("3.4 / 3.5: the session dialogs, clocks, scene challenges and custom oracles exist, so the doc's rows say so", async () => {
    const dialogs = await import("../../src/safety/sessionDialogs.js");
    const lifecycle = await import("../../src/safety/sessionLifecycleDialogs.js");
    const clocks = await import("../../src/clocks/clocks.js");
    const custom = await import("../../src/oracles/customOracles.js");
    const scene = await import("../../src/moves/sceneChallenge.js");
    for (const fn of [dialogs.openSetFlagDialog, dialogs.openChangeYourFateDialog, dialogs.openTakeABreakDialog,
      lifecycle.openBeginSessionDialog, lifecycle.openEndSessionDialog, clocks.createClock, custom.validateCustomOracleEntries,
      scene.finishSceneChallenge, scene.scoreSceneChallenge]) {
      expect(typeof fn).toBe("function");
    }
    const s34 = section("### 3.4 Missing UI", "### 3.5");
    const s35 = section("### 3.5 Worksheets", "### 3.6");
    for (const n of ["3.4.1", "3.4.2", "3.4.3", "3.4.4", "3.4.5"]) {
      expect(s34, n).toMatch(new RegExp(`\\*\\*${n.replace(/\./g, "\\.")}[^\\n]*✅ FIXED`));
    }
    expect(s34).toMatch(/\*\*3\.4\.6 Background Vow\*\*[^\n]*PARTLY FIXED/);
    expect(s35).toMatch(/\| Clocks \| ✅/);
    expect(s35).toMatch(/\| Scene Challenges \| ✅/);
    expect(s35).toMatch(/\| Custom oracle tables \| ✅/);
    expect(s35).not.toMatch(/❌/);
  });

  it("Part 2.2 / 2.4 / 3.6: the rows that restated the fixed items are updated too", () => {
    const s24 = section("### 2.4 Oracles", "### 2.5");
    expect(s24.includes("**Pay the Price** d100 (play-kit, 16 entries) | ❌")).toBe(false);
    expect(/Yes\/no with odds\*\* \| ❌/.test(s24)).toBe(false);
    for (const table of ["Make a Discovery", "Confront Chaos", "Take Decisive Action", "Spotlight Vignette"]) {
      expect(s24, table).toMatch(new RegExp(`\\*\\*${table}\\*\\*[^\\n]*\\| ✅ \\|`));
    }
    expect(s24).toMatch(/\*\*Pick two\*\* \| ❌/);   // still not there, and still said
    const s22 = section("### 2.2 Per-move", "### 2.3");
    expect(s22.includes("not auto-applied to vehicle integrity (advice only)")).toBe(false);
    expect(s22).not.toMatch(/no UI flow|otherEffect text only/);
    expect(DOC.includes("Reset value\n  depends on the bridge bug above")).toBe(false);
  });

  it("the Document maintenance footer records the re-audit", () => {
    expect(section("## Document maintenance", "Source PDF")).toMatch(/re-audited against the code on\s+2026-11-05/);
  });

  it("control: the items the doc already marked FIXED, and Part 1's rank table", () => {
    expect(fixedHeading("3.3.2").test(DOC)).toBe(true);
    expect(fixedHeading("3.3.3").test(DOC)).toBe(true);
    expect(fixedHeading("3.3.5").test(DOC)).toBe(true);
    expect(DOC).toContain("troublesome **+12** (3 boxes), dangerous **+8** (2 boxes), formidable\n  **+4** (1 box), extreme **+2**, epic **+1**");
    expect(RANK_TICKS).toEqual({ troublesome: 12, dangerous: 8, formidable: 4, extreme: 2, epic: 1 });
  });
});
