/**
 * PROBE (sectors audit, SO-09) — the World Truth tables' quest starters are
 * not the rulebook's: one is a different quest, nine lose their closing
 * question.
 *
 * What the user does: runs the Playtest Quickstart (rollWorldTruths →
 * storeWorldTruths), which writes each rolled truth's "Quest Starter: …" into
 * the World Truths journal page.
 * What happens: src/truths/tables.js was transcribed by hand. Compared with
 * the vendored Starforged truths (vendor/foundry-ironsworn/json-packs/
 * starforged-truths — Datasworn, the rulebook's text, which the system's own
 * World Truths dialog uses), every range and sub-table matches, and the
 * option titles are condensed on purpose (decisions.md, "Truths saved in the
 * World Truths dialog reach the narrator": 24 of 42 differ). But the quest
 * starters are not condensed titles: Medicine 68–100's is a different quest
 * ("…the healer's guild nearest to you will not respond without reason" —
 * the book: "A team of healers en route to provide aid were captured by
 * raiders. What do the raiders demand for their release?"), and nine others
 * stop before their last sentence, the question that makes them a quest
 * (Laws 1–33 "How will you undertake this heist?", Medicine 1–33 "What is
 * your relationship to the sickened leader, and what foe stands in your
 * way?", …).
 * What should happen: the quest starters are the rulebook's, as the oracle
 * tables were regenerated from the same vendored data (issue #321 U63).
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TRUTH_CATEGORIES, TRUTH_TABLES } from "../../../src/truths/tables.js";

const DIR = path.resolve(__dirname, "../../../vendor/foundry-ironsworn/json-packs/starforged-truths");
const HAVE_VENDOR = fs.existsSync(DIR) && fs.readdirSync(DIR).length > 0;

const vendor = {};
for (const f of HAVE_VENDOR ? fs.readdirSync(DIR) : []) {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  vendor[String(d.name).toLowerCase()] = d.pages.filter(p => p.type === "truth").map(p => p.system);
}

const norm = (s) => String(s ?? "").toLowerCase()
  .replace(/[‘’]/g, "'").replace(/[–—]/g, "-")
  .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

describe.skipIf(!HAVE_VENDOR)("PROBE SO-09: truth quest starters match the rulebook", () => {
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
    // FAILS today: 10 rows (medicine 68-100 a different quest; 9 truncated).
    expect(problems).toEqual([]);
  });
});
