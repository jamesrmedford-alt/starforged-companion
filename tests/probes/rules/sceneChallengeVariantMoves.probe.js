/**
 * PROBE — RULES-04 SCENE-CHALLENGE-VARIANT-MOVES (tenth audit, area rules; needs a decision)
 *
 * What the user does: the GM opens a scene challenge in the Progress Tracks
 * panel (a track plus its 4-segment tension clock — issue #316 T03) for a
 * tense negotiation. Kira "makes her case" — Face Danger — and scores a
 * strong hit; later a weak hit; later a miss with a match.
 *
 * What happens: the rulebook's scene-challenge moves (pp. 239-241; vendored
 * category Starforged/Moves/Scene_Challenge: Begin the Scene, Face Danger
 * (Scene Challenge), Secure an Advantage (Scene Challenge), Finish the Scene)
 * have one module twin — Finish the Scene (issue #326 D6). Within a scene
 * challenge the variants say: strong hit "mark progress" (twice on a match),
 * weak hit "mark progress … and fill a clock segment", miss "fill a clock
 * segment and Pay the Price" (two segments on a match). The module rolls the
 * ordinary Face Danger: no progress is marked on any hit, no segment fills on
 * a weak hit, and a miss fills one segment through the Pay the Price clock
 * advance (never two on a match) — so the clock races while the track only
 * moves by hand, and the doc's Scene Challenges row ("🔄 … no setup
 * walkthrough") does not say the variant moves are missing.
 *
 * What should happen (both options share this): every vendored scene-
 * challenge move is a module move, or the coverage doc names it as missing so
 * the GM knows to mark progress and fill segments by hand. Option A
 * (recommended): resolve Face Danger / Secure an Advantage as their
 * scene-challenge variants while a scene challenge is open (progress on a hit,
 * segments on a weak hit / miss / match). Option B: document the gap.
 *
 * Control: Finish the Scene has a module twin and the doc names it.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/rules/sceneChallengeVariantMoves.probe.js
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toMoveId } from "../../../src/schemas.js";

const MOVES_DIR = fileURLToPath(new URL("../../../vendor/foundry-ironsworn/json-packs/starforged-moves", import.meta.url));
const HAVE_VENDOR = fs.existsSync(MOVES_DIR) && fs.readdirSync(MOVES_DIR).length > 0;
const DOC = fs.readFileSync(fileURLToPath(new URL("../../../docs/rules-reference/playkit-rules-and-coverage.md", import.meta.url)), "utf8");

const sceneMoves = () => fs.readdirSync(MOVES_DIR).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(MOVES_DIR, f), "utf8")))
  .filter(d => d.type === "sfmove" && d.system?.Category === "Starforged/Moves/Scene_Challenge")
  .map(d => d.name);

const docNames = (name) => DOC.includes(name);

describe.skipIf(!HAVE_VENDOR)("PROBE RULES-04 SCENE-CHALLENGE-VARIANT-MOVES", () => {
  it("every vendored scene-challenge move is a module move, or the coverage doc names it as missing", () => {
    const uncovered = sceneMoves().filter(name => toMoveId(name) === null && !docNames(name));
    // Expected []. Actual: Begin the Scene, Face Danger (Scene Challenge), Secure an Advantage (Scene Challenge).
    expect(uncovered).toEqual([]);
  });

  it("control: Finish the Scene is a module move (issue #326 D6) and the doc names it", () => {
    expect(sceneMoves()).toContain("Finish the Scene");
    expect(toMoveId("Finish the Scene")).toBe("finish_the_scene");
    expect(docNames("Finish the Scene")).toBe(true);
  });
});
