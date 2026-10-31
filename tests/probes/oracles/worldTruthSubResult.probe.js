/**
 * PROBE (oracles audit) — a world truth's sub-table result never reaches the
 * narrator.
 *
 * rollCategory (src/truths/generator.js) resolves the sub-table a truth
 * option carries — Cataclysm "We escaped the ravages of a catastrophic war"
 * → "In this final war, we were set upon by: Artificial intelligence"; AI
 * "…we rely on the seers we call Adepts" → "This is because: AI was outlawed
 * in the aftermath of the machine wars" — and storeWorldTruths persists it as
 * `campaignState.worldTruths[cat].subResult`. The narrator's only reader,
 * buildWorldTruthsBlock (src/narration/narratorPrompt.js), prints
 * `v.title ?? v.result` and nothing else, so the narrator is told there was a
 * war but not who the foe was, and is free to invent one that contradicts the
 * World Truths journal (formatTruthsAsHtml does print the sub-result).
 */

import { describe, it, expect } from "vitest";
import { rollCategory } from "../../../src/truths/generator.js";
import { buildNarratorSystemPrompt } from "../../../src/narration/narratorPrompt.js";

const settings = {
  narrationTone: "wry", narrationLevity: "default", narrationPerspective: "auto",
  narrationLength: 3, narrationInstructions: "",
};

describe("PROBE: the WORLD TRUTHS narrator block carries the rolled sub-table detail", () => {
  it("Cataclysm war → the foe is named in the prompt", () => {
    const cataclysm = rollCategory("cataclysm", { roll: 82, subRoll: 15 });
    expect(cataclysm.subResult).toBe("Artificial intelligence");   // the generator resolved it

    const prompt = buildNarratorSystemPrompt(
      { safety: { lines: [], veils: [], privateLines: [] }, worldTruths: { cataclysm }, connectionIds: [] },
      settings,
      null,
    );
    expect(prompt).toContain("We escaped the ravages of a catastrophic war.");
    expect(prompt).toContain("Artificial intelligence");           // FAILS today: dropped
  });
});
