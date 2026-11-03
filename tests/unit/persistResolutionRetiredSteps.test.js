// tests/unit/persistResolutionRetiredSteps.test.js
// persistResolution's two dead steps are gone (issue #326 W58;
// rules/reachability.md §1–§2). appendToSessionLog wrote
// campaignState.sessionLogs for every move (and every Burn / Improve again,
// through the upgrades' log-only persist), and nothing read it but the merge
// that copied it forward — it grew with every move for nothing. And
// applySufferMoveDebilities marked unprepared on a negative supplyChange no
// resolver consequence carries, and switched on a `sufferMoveTriggered`
// string that was only ever the deprecated object alias. Both are retired,
// with the log-only persist and the alias.

import { describe, it, expect } from "vitest";
import { productionSources } from "../helpers/sourceScan.js";
import { mapConsequences } from "../../src/moves/resolver.js";
import { MOVES } from "../../src/schemas.js";

const OUTCOMES = ["strong_hit", "weak_hit", "miss"];
const all = Object.keys(MOVES).flatMap(moveId =>
  OUTCOMES.flatMap(outcome => [false, true].map(isMatch => ({ moveId, outcome, c: mapConsequences(moveId, outcome, isMatch) }))));

describe("persistResolution's retired steps (issue #326 W58)", () => {
  it("no production code writes or reads a session move log", () => {
    const hits = productionSources()
      .filter(src => !src.file.endsWith("src/integration/quench.js"))
      .flatMap(src => [...src.code.matchAll(/sessionLogs|appendToSessionLog/g)].map(() => src.file));
    expect(hits).toEqual([]);
  });

  it("no production code carries the impact step or the deprecated sufferMoveTriggered alias", () => {
    const hits = productionSources()
      .flatMap(src => [...src.code.matchAll(/applySufferMoveDebilities|sufferMoveTriggered/g)].map(() => src.file));
    expect(hits).toEqual([]);
  });

  it("control: every move and outcome still maps to consequences, with the suffer prompt where a choice is owed", () => {
    expect(all.length).toBeGreaterThan(100);
    const faceWeak = mapConsequences("face_danger", "weak_hit", false);
    expect(faceWeak.sufferPrompt).toEqual({ kind: "any", amount: 1, count: 1 });
  });
});
