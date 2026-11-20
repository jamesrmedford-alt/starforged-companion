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
 * (a typedef, callback or file-header block aside). The instances known when
 * the scan was written are listed below — documentation debt, each to be
 * moved back onto its function; the test fails on any instance that is not
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

// Known when the scan was written (issue #364): each docblock below has drifted
// off its function. Move it back and delete its line here.
const KNOWN = [
  "src/moves/resolver.js — A move's oracle seeds with the Pay the Price its pipeline rolled for the",
  "src/moves/resolver.js — Map a move ID + outcome to its specific mechanical consequences.",
  "src/moves/sufferCard.js — True when an \"any\" card cannot take this suffer move: one the prompt",
  "src/narration/narrator.js — Build the active-sector anchor block for the narrator system prompt.",
  "src/narration/narrator.js — Short notice posted when a paced narration — a typed line the pacing",
  "src/narration/narrator.js — The narrator's system-prompt context is assembled in exactly ONE place: here.",
  "src/narration/narratorPrompt.js — Format a single entity record as a narrator-prompt card.",
  "src/narration/narratorPrompt.js — Mandatory sidecar response-format instruction appended to every narrator",
  "src/narration/narratorPrompt.js — Render a ledger subject as the human-readable prefix used in the block.",
  "src/safety/sessionLifecycleDialogs.js — Begin a Session ran again on a session already begun — say what (didn't)",
  "src/sectors/sectorSceneHooks.js — Shared gating for the two token→position handlers.",
  "src/session/lifecycle.js — Start a new session: keep the closing session's rolling summary as",
  "src/system/encounterSpawn.js — Resolve and (optionally) place an encounter Actor.",
  "src/ui/progressTracks.js — Open the progress track panel.",
  "src/ui/settingsPanel.js — The confirm form's \"Applicable abilities\" block — the confirm dialog's,",
].sort();

describe("issue #364 SIDECAR-DOCBLOCK-MISPLACED — a docblock sits on the function it documents", () => {
  it("applyNarratorSidecar's docblock is its own, not stacked on ensureSceneStarted's", () => {
    const narrator = productionSources().find(s => s.file === "src/narration/narrator.js").text;
    expect(narrator).toMatch(/@returns \{string\} prose with the sidecar block removed\n \*\/\nexport function applyNarratorSidecar\(/);
    expect(orphanedDocblocks().filter(o => o.includes("Process a raw narrator API response"))).toEqual([]);
  });

  it("no docblock is stacked on another's, beyond the ones already known", () => {
    const fresh = orphanedDocblocks().filter(o => !KNOWN.includes(o));
    expect(fresh, "a docblock directly followed by another docblock: the first has drifted off its function — move it back").toEqual([]);
  });

  it("every known instance is still there (delete a line from KNOWN once its docblock is moved back)", () => {
    const found = orphanedDocblocks();
    expect(KNOWN.filter(k => !found.includes(k))).toEqual([]);
  });
});
