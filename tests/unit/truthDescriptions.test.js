/**
 * STARFORGED COMPANION
 * tests/unit/truthDescriptions.test.js
 *
 * Issue #331 X47 (TRUTH-DESCRIPTIONS-ABRIDGED). Five of the 42 truth option
 * descriptions dropped a sentence or clause of the vendored option (Iron
 * 34–67 and 68–100, Exodus 34–67, Lifeforms 68–100, Horrors 68–100). Titles
 * are condensed by decision; descriptions are not — issue #326 W76 restored
 * the quest starters for the same fidelity. The descriptions show on the
 * Quickstart's World Truths page and are read by `!lore`. Read against the
 * vendored truths (skipped without the submodule), with the five sentences
 * pinned on their own.
 */

/* global __dirname */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TRUTH_CATEGORIES, TRUTH_TABLES, SUB_TABLES } from "../../src/truths/tables.js";

const DIR  = path.resolve(__dirname, "../../vendor/foundry-ironsworn/json-packs/starforged-truths");
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

describe.skipIf(!HAVE)("X47 — truth option descriptions are the rulebook's", () => {
  for (const id of TRUTH_CATEGORIES) {
    const cat = TRUTH_TABLES[id];
    const vendor = vendorByName[cat.name];

    it(`${id}: no option description drops a sentence of the rulebook's`, () => {
      expect(vendor, `vendored category "${cat.name}"`).toBeTruthy();
      cat.entries.forEach((entry, i) => {
        const ours = norm(entry.description);
        const missing = vendorSentences(vendor[i], entry).filter(s => !ours.includes(s));
        expect(missing, `${id} option ${i} (${entry.min}-${entry.max}) is missing`).toEqual([]);
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

// The five the audit found cut, pinned without the vendored pack (the
// fix-sensitivity worktrees do not check it out).
describe("X47 — the five restored sentences", () => {
  const desc = (cat, i) => TRUTH_TABLES[cat].entries[i].description;
  it("each option carries its rulebook sentence", () => {
    expect(desc("exodus", 1)).toContain("Did we flee one cataclysm, only to inadvertently create another?");
    expect(desc("iron", 1)).toContain("The Ironsworn carry weapons, armor, or tokens crafted from black iron, and swear vows upon it.");
    expect(desc("iron", 2)).toContain("A few also favor the silent efficiency of a blade for infiltration or espionage. Most importantly, when the Ironsworn swear a vow upon a sword");
    expect(desc("lifeforms", 2)).toMatch(/to thwart the tide\. They are inevitable\.$/);
    expect(desc("horrors", 2)).toContain("the warmth of life that is forever lost to them. The Soulbinders are dedicated to putting them to rest—whatever the cost.");
  });
});
