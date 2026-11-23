/**
 * STARFORGED COMPANION
 * tests/unit/classifierCombatCoversHazards.test.js
 *
 * known-issues TABLE-ASKS-THE-GM-OFTEN (issue #374 A9; the memory charter's
 * second and third live runs, 2026-11-22 and 2026-11-23).
 *
 * The pacing reader has five categories and defined combat as "fighting or
 * under direct attack right now". A hazard that is not a fight had no
 * category of its own, so the reader gave it combat's — four lines of four,
 * a humming airlock and a dryer fire — and said so in its reasons ("the fire
 * is a hazard rather than an adversary"). The definition did not cover what
 * the reader was using it for, and nothing a GM could read said the Combat
 * dial also set how readily a hazard is rolled for.
 *
 * Decided 2026-11-23: combat is meant to cover any immediate physical
 * danger. The definition says so, and so does what a GM reads. The category
 * sets the dial only — a danger with no foe in it is still Face Danger.
 */

import { describe, it, expect } from "vitest";
import { buildClassifierContext, PACING_CATEGORIES } from "../../src/pacing/classifier.js";
import { PAGES } from "../../src/help/helpJournal.js";

const DIALS = { dials: { combat: 9, investigation: 6, exploration: 6, social: 5, downtime: 1 } };
const prompt = () => buildClassifierContext({
  playerText: "I grab the extinguisher and go for the dryer.", campaignState: {}, character: { name: "Mira Kestrel" },
  recentMoveDensity: { count: 0, window: 5 }, pacingConfig: DIALS,
}).systemPrompt;

/** The one category's definition: from its "- name:" line to the next category's. */
function definitionOf(category) {
  const text = prompt();
  const start = text.indexOf(`- ${category}:`);
  const rest = text.slice(start + 1);
  const next = rest.search(/\n- [a-z_]+:/);
  return text.slice(start, next === -1 ? undefined : start + 1 + next).replace(/\s+/g, " ");
}

describe("issue #374 A9 — the combat category covers any immediate physical danger", () => {
  it("the reader's definition says so, with a fire and a breach as its examples", () => {
    const combat = definitionOf("combat");
    expect(combat).toContain("fighting or under direct attack right now");
    expect(combat).toMatch(/any other immediate physical danger as it happens \(a fire, a hull breach, a collapse\)/);
  });

  it("the category sets the dial only: a danger with no foe is still face_danger, not a combat move", () => {
    expect(definitionOf("combat")).toMatch(/The category sets the dial only: a danger with no foe in it is still face_danger, not a combat move\./);
  });

  it("control: there are still five categories, and the others are worded as they were", () => {
    expect(PACING_CATEGORIES).toEqual(["combat", "investigation", "exploration", "social", "downtime"]);
    expect(definitionOf("investigation")).toBe("- investigation: searching, studying, questioning, analysing for answers.");
    expect(definitionOf("social")).toBe("- social: conversation, persuasion, relationships, negotiation.");
    // The example that already put a hazard under combat when someone is attacking.
    expect(definitionOf("downtime")).toContain("patching the hull while boarders cut through = combat");
  });

  it("a GM is told what the Combat dial covers — on the help page's dials paragraph", () => {
    const page = PAGES.find(p => String(p.text?.content ?? "").includes("<h2>Pacing — Not Everything Is a Roll</h2>"));
    expect(page, "the Pacing help page").toBeTruthy();
    expect(page.text.content).toContain("<strong>Combat</strong> is a fight and any other immediate physical danger &mdash; a fire, a hull breach, a collapse");
  });
});
