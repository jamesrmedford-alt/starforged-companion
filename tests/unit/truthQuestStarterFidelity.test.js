// tests/unit/truthQuestStarterFidelity.test.js
// Every world-truth quest starter is the rulebook's (issue #326 W76). Ten
// rows of src/truths/tables.js were not: Medicine 68-100 was a different
// quest (the rulebook's healers are captured by raiders) and nine stopped
// before their closing question (Laws 1-33 "How will you undertake this
// heist?", …). They are regenerated from the vendored truths, as the oracle
// tables were (issue #321 U63). Every range and sub-table already matched;
// the option titles are condensed on purpose (decisions.md). The vendored
// data is a git submodule — the comparisons skip without it.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TRUTH_CATEGORIES, TRUTH_TABLES } from "../../src/truths/tables.js";

const DIR = path.resolve(__dirname, "../../vendor/foundry-ironsworn/json-packs/starforged-truths");
const HAVE_VENDOR = fs.existsSync(DIR) && fs.readdirSync(DIR).length > 0;

const vendor = {};
for (const f of HAVE_VENDOR ? fs.readdirSync(DIR) : []) {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  vendor[String(d.name).toLowerCase()] = d.pages.filter(p => p.type === "truth").map(p => p.system);
}

const norm = (s) => String(s ?? "").toLowerCase()
  .replace(/[‘’]/g, "'").replace(/[–—]/g, "-")
  .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

describe.skipIf(!HAVE_VENDOR)("truth quest starters match the rulebook (issue #326 W76)", () => {
  it("control: every truth option's range and sub-table match the vendored truths", () => {
    const problems = [];
    for (const id of TRUTH_CATEGORIES) {
      const ours = TRUTH_TABLES[id].entries;
      const theirs = vendor[TRUTH_TABLES[id].name.toLowerCase()];
      ours.forEach((e, i) => {
        const t = theirs?.[i];
        if (!t || e.min !== t.Floor || e.max !== t.Ceiling) problems.push(`${id}[${i}] range`);
        if (!!e.subTableId !== !!(t?.Subtable?.length)) problems.push(`${id}[${i}] sub-table`);
      });
    }
    expect(problems).toEqual([]);
  });

  it("every quest starter is the rulebook's", () => {
    const problems = [];
    for (const id of TRUTH_CATEGORIES) {
      const theirs = vendor[TRUTH_TABLES[id].name.toLowerCase()];
      TRUTH_TABLES[id].entries.forEach((e, i) => {
        const want = theirs?.[i]?.Quest;
        if (norm(e.questStarter) !== norm(want)) {
          problems.push(`${id} ${e.min}-${e.max}: module "${e.questStarter}" — rulebook "${want}"`);
        }
      });
    }
    // Eleven rows differed: Medicine 68-100 a different quest, nine stopped
    // before their closing question, one reworded.
    expect(problems).toEqual([]);
  });
});
