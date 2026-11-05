/**
 * PROBE — SWEEP-01 THRESHOLD-TRACK-ID-DEAD (sweep auditor, family 10: a
 * producer with no consumer; rules/reachability.md §1 "A producer with zero
 * consumers is a bug, not a feature" — the X50 / X55 / X66 precedent)
 *
 * What the user does: presses ⚔ Enter the Fray on the "A fight looms" card.
 *
 * What happens: the canonical GM's handler (src/moves/cardActions.js
 * applyCombatThresholdChoice, :1032) makes a second write to the card after
 * the fight's track is created — `flags[MODULE_ID].thresholdTrackId` — and
 * nothing in src/ (or tests/) ever reads that key: not the card's render
 * hook, not the way-out / Battle / Finish the Fight paths, not the fight's
 * won card. A world write per fight that no reader will ever see (added by
 * the X06 fix, 2026-11-05).
 *
 * What should happen: the flag has a reader (the card could show which
 * fight it began, or its press could resolve the fight by id) or the write
 * is deleted — "Zero consumers → delete it, wire it, or mark // UNWIRED:".
 *
 * Control: the claim flag the same handler writes, `thresholdTaken`, is read
 * (the render hook disables both buttons on it).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sweep/thresholdTrackIdDead.probe.js
 */

import { describe, it, expect } from "vitest";
import { productionSources } from "../../helpers/sourceScan.js";

/** Production references to a module flag key, split into writes and reads (by the surrounding text). */
function flagUses(key) {
  const writes = [];
  const reads  = [];
  for (const src of productionSources()) {
    for (const m of src.code.matchAll(new RegExp(`\\b${key}\\b`, "g"))) {
      const lineStart = src.code.lastIndexOf("\n", m.index) + 1;
      const line = src.code.slice(lineStart, src.code.indexOf("\n", m.index));
      const loc  = `${src.file}:${src.code.slice(0, m.index).split("\n").length}`;
      // A write: `flags.${MODULE_ID}.key` in an update path, or `key:` inside a flags literal.
      if (/flags\.\$\{MODULE_ID\}\.\w+`\s*\]\s*:/.test(line) || new RegExp(`\\b${key}\\s*:`).test(line)) writes.push(loc);
      else reads.push(loc);
    }
  }
  return { writes, reads };
}

describe("PROBE SWEEP-01 THRESHOLD-TRACK-ID-DEAD", () => {
  it("thresholdTrackId, written on the threshold card after Enter the Fray, is read somewhere in production", () => {
    const { writes, reads } = flagUses("thresholdTrackId");
    expect(writes.length, "sanity: the X06 handler writes it").toBeGreaterThan(0);
    // Expected: at least one reader. Today: none — the write is dead surface.
    expect(reads, `written at ${writes.join(", ")} and read nowhere`).not.toEqual([]);
  });

  it("control: the claim flag thresholdTaken is both written and read", () => {
    const { writes, reads } = flagUses("thresholdTaken");
    expect(writes.length).toBeGreaterThan(0);
    expect(reads.length).toBeGreaterThan(0);
  });
});
