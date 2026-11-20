/**
 * STARFORGED COMPANION
 * tests/unit/docblockSitsOnItsFunction.test.js
 *
 * Issue #364 SIDECAR-DOCBLOCK-MISPLACED (issue #362 AC71's shape).
 *
 * A function added between a docblock and the function it documents leaves
 * that docblock sitting on top of the newcomer's: two docblocks back to back,
 * the first describing code that is now somewhere below. `applyNarratorSidecar`'s
 * sat above `ensureSceneStarted`'s that way, so the sidecar contract read as
 * the scene helper's.
 *
 * This scan finds every docblock that is followed at once by another docblock
 * (a typedef, callback or file-header block aside), and the test fails on any.
 * Twenty-three more stood that way when the scan was written and were listed
 * below as documentation debt; each is back on its function (issue #364
 * DOCBLOCKS-STACKED) and the list is empty. It stays as the one place such a
 * docblock could be knowingly left: the test fails on an instance that is not
 * listed, and on a listed one that is gone (take it off the list).
 */

import { describe, it, expect } from "vitest";
import { productionSources } from "../helpers/sourceScan.js";

// A docblock, then only blank lines, then another docblock.
const BACK_TO_BACK = /\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/[ \t]*\n(?:[ \t]*\n)*[ \t]*\/\*\*/g;

// A block that documents no function of its own may sit above another.
const STANDS_ALONE = /@typedef|@callback|@module|@file\b/;

const firstLineOf = (block) => block.split("\n").map(l => l.replace(/^\s*\*?\s?/, "").trim()).find(Boolean) ?? "";

/** Every docblock in `src/` that is directly followed by another docblock: "file — first line". */
function orphanedDocblocks() {
  const found = [];
  for (const { file, text, code } of productionSources()) {
    for (const m of text.matchAll(BACK_TO_BACK)) {
      if (STANDS_ALONE.test(m[1])) continue;
      // The file's header block: no code stands before it.
      if (!/\b(import|export|const|let|function|class)\b/.test(code.slice(0, m.index))) continue;
      found.push(`${file} — ${firstLineOf(m[1])}`);
    }
  }
  return found.sort();
}

// Stacked docblocks knowingly left where they are: "file — first line", as
// orphanedDocblocks() gives them. None — the twenty-three known when the scan
// was written are back on their functions (issue #364 DOCBLOCKS-STACKED). Move
// a new one back rather than listing it.
const KNOWN = [];

describe("issue #364 SIDECAR-DOCBLOCK-MISPLACED — a docblock sits on the function it documents", () => {
  it("applyNarratorSidecar's docblock is its own, not stacked on ensureSceneStarted's", () => {
    const narrator = productionSources().find(s => s.file === "src/narration/narrator.js").text;
    expect(narrator).toMatch(/@returns \{string\} prose with the sidecar block removed\n \*\/\nexport function applyNarratorSidecar\(/);
    expect(orphanedDocblocks().filter(o => o.includes("Process a raw narrator API response"))).toEqual([]);
  });

  it("no docblock is stacked on another's", () => {
    const fresh = orphanedDocblocks().filter(o => !KNOWN.includes(o));
    expect(fresh, "a docblock directly followed by another docblock: the first has drifted off its function — move it back").toEqual([]);
  });

  it("KNOWN lists only docblocks that are still stacked — none today (delete a line once its docblock is moved back)", () => {
    const found = orphanedDocblocks();
    expect(KNOWN.filter(k => !found.includes(k))).toEqual([]);
  });
});
