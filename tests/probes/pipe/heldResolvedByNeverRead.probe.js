/**
 * PIPE-06 · HELD-RESOLVED-BY-NEVER-READ  (DEAD / ORPHANED — a source scan)
 *
 * Scenario: heldResult.js closeWait stamps how a held result was settled on its
 * move card — `flags.awaitingUpgrade.resolvedBy`: "keep" | "later" | "choice" |
 * "burn" | "improve" (issue #354 P2-10).
 *
 * Correct (rules/reachability.md §1; CLAUDE.md "Verify reachability when
 * adding"): a new card flag has a production consumer, or is marked
 * `// UNWIRED:` with a known-issues line.
 *
 * Today: nothing in production code reads `resolvedBy` — the card's buttons,
 * the Keep wiring and every guard read `awaitingUpgrade.open`, `burn.kept` /
 * `improve.kept` and `consumed`. Only tests read it.
 */

import { describe, it, expect } from "vitest";
import { productionSources } from "../../helpers/sourceScan.js";

const sources = productionSources();

/** Every production line that mentions `name` as an identifier or a flag-path segment (comments stripped). */
function mentions(name) {
  const re = new RegExp(`\\b${name}\\b`);
  const out = [];
  for (const src of sources) {
    src.code.split("\n").forEach((line, i) => { if (re.test(line)) out.push({ file: src.file, line: i + 1, text: line.trim() }); });
  }
  return out;
}

// A write: an object key (`resolvedBy: x`), a flag path used as a key (`…resolvedBy`]: x` or `…kept`] = true`), or an assignment.
const isWrite = (text, name) => new RegExp(`\\b${name}(?:\`\\])?\\s*(?::|=(?!=))`).test(text);

describe("PIPE-06 — the held card's `resolvedBy` stamp has a production reader", () => {
  it("control: the scan sees a live held-result flag being both written and read (`kept`)", () => {
    const kept = mentions("kept").filter(m => m.file.startsWith("src/moves/"));
    expect(kept.some(m => m.file === "src/moves/heldResult.js" && isWrite(m.text, "kept"))).toBe(true);
    expect(kept.some(m => m.file === "src/moves/burnMomentum.js" && /upgrade\?\.kept/.test(m.text))).toBe(true);
  });

  it("control: `resolvedBy` is written by closeWait", () => {
    const hits = mentions("resolvedBy");
    expect(hits.some(m => m.file === "src/moves/heldResult.js" && isWrite(m.text, "resolvedBy"))).toBe(true);
  });

  it("something in production code reads `resolvedBy`", () => {
    const readers = mentions("resolvedBy").filter(m => !isWrite(m.text, "resolvedBy"));
    expect(readers.map(m => `${m.file}:${m.line}`)).not.toEqual([]);
  });
});
