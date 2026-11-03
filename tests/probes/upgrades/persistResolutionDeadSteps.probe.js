/**
 * PROBE (moves-upgrade-suffer audit) — MU: PERSIST-SESSIONLOG-DEAD
 *
 * persistResolution (the canonical GM's move persist) does three things
 * besides the meters (file-structure.md: "the suffer-choice card … and the
 * session-log entry"; "a supply loss to 0 marks unprepared through
 * sufferExecutor.markUnprepared, the crew with it — issue #315 S07"):
 *
 *  1. `appendToSessionLog` pushes `{ resolutionId, moveId, outcome,
 *     timestamp }` onto `campaignState.sessionLogs[sessionId]` for every
 *     move — and every Burn / Improve adds a second entry for the same move
 *     through renarrateUpgrade's log-only persist. No production code reads
 *     `sessionLogs`: its only reader is persistResolution's own merge, which
 *     copies the stored logs forward (persistResolution.js:255). The World
 *     Journal's Session Log is a different store (lore / threat beats). The
 *     log is written, merged and broadcast with every campaignState write and
 *     grows with every move of the campaign, for nothing.
 *     (tests/unit/campaignStateFields.test.js counts the merge's copy as the
 *     field's reader, so it passes.)
 *
 *  2. `applySufferMoveDebilities` marks unprepared when the move's own
 *     `supplyChange` is negative and switches on `sufferMoveTriggered ===
 *     "endure_harm" | "endure_stress"` — but no consequence the resolver
 *     produces carries a supply loss (every supply cost is a choice card's
 *     suffer call) and `sufferMoveTriggered` is only ever null or the
 *     object alias `{ move: "suffer", amount: 1 }`. The S07 wiring the docs
 *     describe for "a move's own supply loss" cannot fire.
 *
 * What should happen (rules/reachability.md §1–§2): a producer with no
 * consumer is retired or wired. The log-only persist after an upgrade exists
 * only to append to the dead log (and writes the upgrade's whole working copy
 * back to do it).
 */

import { describe, it, expect } from "vitest";
import { productionSources } from "../../helpers/sourceScan.js";
import { mapConsequences } from "../../../src/moves/resolver.js";
import { MOVES } from "../../../src/schemas.js";

describe("PERSIST-SESSIONLOG-DEAD — campaignState.sessionLogs", () => {
  const files = productionSources();
  const mentions = files.flatMap(src =>
    [...src.code.matchAll(/sessionLogs/g)].map(m => ({ file: src.file, line: src.code.slice(0, m.index).split("\n").length })));

  it("control: persistResolution writes the log", () => {
    expect(mentions.some(m => m.file.endsWith("src/moves/persistResolution.js"))).toBe(true);
  });

  it("some production code other than persistResolution reads the session move log", () => {
    const elsewhere = mentions.filter(m => !m.file.endsWith("src/moves/persistResolution.js"));
    expect(elsewhere).not.toEqual([]);     // today: [] — nothing reads it
  });
});

describe("PERSIST-SESSIONLOG-DEAD — persistResolution's impact step", () => {
  const OUTCOMES = ["strong_hit", "weak_hit", "miss"];
  const all = Object.keys(MOVES).flatMap(moveId =>
    OUTCOMES.flatMap(outcome => [false, true].map(isMatch => ({ moveId, outcome, c: mapConsequences(moveId, outcome, isMatch) }))));

  it("control: every move and outcome maps to consequences", () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it("some move outcome carries the supply loss persistResolution marks unprepared for", () => {
    expect(all.filter(({ c }) => Number(c.supplyChange ?? 0) < 0).map(({ moveId, outcome }) => `${moveId} ${outcome}`))
      .not.toEqual([]);                    // today: [] — the S07 wiring there cannot fire
  });

  it("some move outcome carries the string sufferMoveTriggered persistResolution switches on", () => {
    expect(all.filter(({ c }) => typeof c.sufferMoveTriggered === "string")).not.toEqual([]);   // today: []
  });
});
