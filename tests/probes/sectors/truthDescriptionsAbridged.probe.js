/**
 * PROBE — SEC-01 TRUTH-DESCRIPTIONS-ABRIDGED
 * (src/truths/tables.js TRUTH_TABLES[*].entries[*].description; shown by
 *  src/truths/generator.js formatTruthsAsHtml → the World Truths journal page
 *  the Playtest Quickstart writes, and read back by `!lore`
 *  callLoreRecapNarrator from that page's text)
 *
 * What the user does: runs the Playtest Quickstart (rollWorldTruths →
 * storeWorldTruths) and opens the World Truths journal, or types `!lore`.
 *
 * What happens: five of the 42 option descriptions drop a sentence or clause
 * the rulebook's option has (vendor/foundry-ironsworn/json-packs/
 * starforged-truths, `system.Description`):
 *   - Iron 34–67: "The Ironsworn carry weapons, armor, or tokens crafted from
 *     black iron, and swear vows upon it." — the sentence that says what this
 *     Iron truth means for vows (src/truths/tables.js:135)
 *   - Iron 68–100: "A few also favor the silent efficiency of a blade for
 *     infiltration or espionage." and "Most importantly, …" (tables.js:141)
 *   - Exodus 34–67: "Did we flee one cataclysm, only to inadvertently create
 *     another?" (tables.js:83)
 *   - Lifeforms 68–100: "They are inevitable." (tables.js:353)
 *   - Horrors 68–100: "…life that is forever lost…", "—whatever the cost."
 *     (tables.js:405)
 *
 * What should happen: the option text is the rulebook's. decisions.md
 * ("Truths saved in the World Truths dialog reach the narrator") records that
 * the option TITLES are condensed on purpose (24 of 42 differ); nothing
 * records the descriptions as condensed, and issue #326 W76 regenerated the
 * quest starters from the vendored truths for exactly this fidelity — the
 * descriptions are the journal's and `!lore`'s source text.
 *
 * Controls (pass today): every option's d100 range, its sub-table rows and
 * its quest starter (W76) match the vendored pack.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sectors/truthDescriptionsAbridged.probe.js
 */

/* global __dirname */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TRUTH_CATEGORIES, TRUTH_TABLES, SUB_TABLES } from "../../../src/truths/tables.js";

const DIR  = path.resolve(__dirname, "../../../vendor/foundry-ironsworn/json-packs/starforged-truths");
const HAVE = fs.existsSync(DIR) && fs.readdirSync(DIR).length > 0;

const vendorByName = {};
for (const f of HAVE ? fs.readdirSync(DIR) : []) {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  vendorByName[d.name] = d.pages.filter(p => p.type === "truth").map(p => p.system);
}

const norm = (s) => String(s ?? "")
  .replace(/@Compendium\[[^\]]*\]\{([^}]*)\}/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .toLowerCase()
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
  .replace(/phenomenon/g, "phenomena")          // the module corrects the book's grammar; not a cut
  .replace(/[^a-z0-9 ]+/g, " ")
  .replace(/\s+/g, " ").trim();

const sentences = (text) => String(text ?? "")
  .split(/(?<=[.!?:]["”’)]?)\s+/)
  .map(norm)
  .filter(Boolean);

/**
 * The vendored description's sentences, without the sub-table intro the
 * module keeps as `subTableLabel` ("We suspect the Sun Plague was caused by:")
 * and the dialog's "(roll below)" marker.
 */
function vendorSentences(system, entry) {
  const intro = norm(entry.subTableLabel ?? "");
  return sentences(String(system.Description ?? "").replace(/\(roll below\)/gi, " "))
    .filter(s => s !== intro && s !== "roll below");
}

describe.skipIf(!HAVE)("PROBE SEC-01 — truth option descriptions are the rulebook's", () => {
  for (const id of TRUTH_CATEGORIES) {
    const cat = TRUTH_TABLES[id];
    const vendor = vendorByName[cat.name];

    it(`${id}: no option description drops a sentence of the rulebook's`, () => {
      expect(vendor, `vendored category "${cat.name}"`).toBeTruthy();
      cat.entries.forEach((entry, i) => {
        const ours = norm(entry.description);
        const missing = vendorSentences(vendor[i], entry).filter(s => !ours.includes(s));
        // Expected: [] for every option. Today: the five options listed in the header.
        expect.soft(missing, `${id} option ${i} (${entry.min}-${entry.max}) is missing`).toEqual([]);
      });
    });
  }

  it("control: every option's range and sub-table rows match the vendored pack", () => {
    for (const id of TRUTH_CATEGORIES) {
      const cat = TRUTH_TABLES[id];
      cat.entries.forEach((entry, i) => {
        const v = vendorByName[cat.name][i];
        expect([entry.min, entry.max], `${id} option ${i} range`).toEqual([v.Floor, v.Ceiling]);
        const vrows = (v.Subtable ?? []).map(r => `${r.Floor}-${r.Ceiling} ${norm(r.Result)}`);
        const mrows = (entry.subTableId ? SUB_TABLES[entry.subTableId] : []).map(r => `${r.min}-${r.max} ${norm(r.result)}`);
        expect(mrows, `${id} option ${i} sub-table`).toEqual(vrows);
      });
    }
  });

  it("control: every quest starter is the vendored one (issue #326 W76)", () => {
    for (const id of TRUTH_CATEGORIES) {
      const cat = TRUTH_TABLES[id];
      cat.entries.forEach((entry, i) => {
        expect(norm(entry.questStarter), `${id} option ${i} quest starter`).toBe(norm(vendorByName[cat.name][i].Quest));
      });
    }
  });
});
