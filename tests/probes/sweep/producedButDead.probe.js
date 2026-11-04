/**
 * PROBE — SWEEP-08 VOW-SYNC-HELPER-DEAD (sweep auditor, family 10: a producer
 * with no consumer; rules/reachability.md §1 and §4 "No speculative API surface")
 *
 * What the user does: nothing — this is dead surface.
 *
 * What happens: `computeSharedVowSyncUpdates` is exported from
 * src/session/swearVow.js:419 and no production code calls it — the live
 * shared-vow sync (the updateItem hook at :604 and its queue) uses the
 * module-private `syncUpdateFor` (:452) instead. Only tests reference the
 * export (`node scripts/deadscan.mjs` reports it TEST-ONLY — "dead in
 * production"; the strict gate exits 1 only on DEAD exports, so it passes).
 * It is not on the known list (NARRATOR_CLASSES and `sufferDamage` are;
 * known-issues.md → QUENCH-ONLY-HELPERS names three others).
 *
 * What should happen: the export is deleted (the sync uses `syncUpdateFor`),
 * wired as the sync's one implementation, or marked `// UNWIRED:` with a
 * known-issues line — "A producer with zero consumers is a bug, not a feature."
 *
 * Controls: `syncUpdateFor` is consumed by production code.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sweep/producedButDead.probe.js
 */

import { describe, it, expect } from "vitest";
import { productionSources } from "../../helpers/sourceScan.js";
import { consumerText } from "../../../scripts/deadscan.mjs";

/** Production references to `name` outside its own definition, with comments and string text blanked. */
function productionConsumers(name) {
  const def = new RegExp(`\\bfunction\\s+${name}\\s*\\(`);
  let count = 0;
  const where = [];
  for (const src of productionSources()) {
    const text = consumerText(src.text);
    for (const m of text.matchAll(new RegExp(`\\b${name}\\b`, "g"))) {
      const lineStart = text.lastIndexOf("\n", m.index) + 1;
      const line = text.slice(lineStart, text.indexOf("\n", m.index));
      if (def.test(line)) continue;
      count++;
      where.push(`${src.file}:${src.text.slice(0, m.index).split("\n").length}`);
    }
  }
  return { count, where };
}

describe("PROBE SWEEP-08 VOW-SYNC-HELPER-DEAD", () => {
  it("computeSharedVowSyncUpdates (src/session/swearVow.js:419) has a production consumer, or is not exported", () => {
    const src = productionSources().find(s => s.file === "src/session/swearVow.js");
    const exported = /export\s+function\s+computeSharedVowSyncUpdates\s*\(/.test(src.code);
    const { count, where } = productionConsumers("computeSharedVowSyncUpdates");
    // Expected: consumed (or gone). Today: exported, zero production references (TEST-ONLY).
    expect(!exported || count > 0, `exported with ${count} production consumer(s) ${where.join(", ")}`).toBe(true);
  });

  it("control: the live sync helper syncUpdateFor is consumed in production", () => {
    expect(productionConsumers("syncUpdateFor").count).toBeGreaterThan(0);
  });
});
