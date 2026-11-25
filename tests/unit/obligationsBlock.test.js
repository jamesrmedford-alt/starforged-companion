/**
 * STARFORGED COMPANION
 * tests/unit/obligationsBlock.test.js
 *
 * Overhaul 4, "moves as contracts" — slice 2: one block for what a result
 * obliges its narration to (contracts/obligations.js). WHAT THIS NARRATION
 * MUST TELL, AND MUST NOT, in three lists — TELL, NOT YET, NOT SO — a tag a
 * line, last before the instruction of the move, paced and round user
 * messages (and the oracle follow-up's), never in a cached block. It replaces
 * the STAKES, PRICE, COST, FIGHT and VOW blocks and the match line, their
 * words kept; the cards a result's lines read are the table's
 * (unansweredCardsFor — the outcome's choice card open or picked, the
 * threshold card).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { obligationsFor, formatObligationsBlock, unansweredCardsFor, OBLIGATION_KINDS } from "../../src/moves/contracts/obligations.js";
import { MOVE_CONTRACTS } from "../../src/moves/contracts/table.js";
import { mapConsequences } from "../../src/moves/resolver.js";
import { buildNarratorUserMessage, buildRoundUserMessage, buildPacedNarrativeUserMessage } from "../../src/narration/narratorPrompt.js";

const MODULE_ID = "starforged-companion";
const HEADING = "## WHAT THIS NARRATION MUST TELL, AND MUST NOT";
const kinds = (list) => list.map(o => o.kind);
const lineOf = (list, kind) => list.find(o => o.kind === kind) ?? null;

const STAKES = { hit: "The binding holds.", miss: "The wound reopens.", priceStated: true, missSuffer: { move: "endure_harm", amount: 1 } };
const heal = (over = {}) => ({
  _id: "res-1", moveId: "heal", moveName: "Heal", outcome: "weak_hit", isMatch: false, stakes: STAKES,
  loremasterContext: "[MOVE: Heal +iron] [OUTCOME: Weak Hit]", consequences: mapConsequences("heal", "weak_hit", false), ...over,
});
const choiceCard = (resolution, over = {}) => ({ flags: { [MODULE_ID]: {
  sufferCard: true, sufferPrompt: resolution.consequences.sufferPrompt, resolutionId: resolution._id, moveId: resolution.moveId,
  pickedIndices: [], resolved: false, ...over,
} } });

let saved;
beforeEach(() => { saved = globalThis.game.messages; globalThis.game.messages = { contents: [] }; });
afterEach(() => { globalThis.game.messages = saved; });

describe("the block's shape", () => {
  it("three lists in order — TELL, NOT YET, NOT SO — a tag a line; nothing to say is ''", () => {
    const told = { ...heal(), ...unansweredCardsFor(heal()) };
    const block = formatObligationsBlock(obligationsFor({ mode: "move", resolution: told }));
    expect(block.startsWith(`${HEADING}\n\nTELL — this has happened:\n- [outcome] `)).toBe(true);
    const at = (s) => block.indexOf(s);
    expect(at("TELL — this has happened:")).toBeLessThan(at("NOT YET — the table has not decided this"));
    expect(at("NOT YET — the table has not decided this")).toBeLessThan(at("NOT SO — never tell it as true:"));
    for (const row of block.split("\n").filter(l => l.startsWith("- "))) expect(row).toMatch(/^- \[[a-z-]+\] \S/);
    expect(formatObligationsBlock([])).toBe("");
    expect(formatObligationsBlock(null)).toBe("");
  });

  it("a round's entry takes its block under ####", () => {
    const user = buildRoundUserMessage({ entries: [{ actorName: "Mira", text: "I bind it.",
      input: { kind: "move", moveName: "Heal", outcome: "weak_hit", stakes: STAKES, ...unansweredCardsFor(heal()) } }], sentenceTarget: 3 });
    expect(user).toContain("#### WHAT THIS NARRATION MUST TELL, AND MUST NOT");
    expect(user).toContain("- [cost] THE COST IS THE PLAYER'S CHOICE.");
    // …and the round's own — the sheet, the apparatus — once, before the instruction.
    expect(user).toContain(`${HEADING}\n\nNOT SO — never tell it as true:\n- [sheet] Nothing on a sheet changes but what TELL names.`);
    expect(user.indexOf(HEADING)).toBeLessThan(user.indexOf("Narrate the round as one scene"));
  });

  it("in the move's user message, after PLAYER NARRATION and before the instruction", () => {
    const user = buildNarratorUserMessage({ ...heal(), ...unansweredCardsFor(heal()) }, "I bind the cut.", 3, "Mira");
    expect(user.indexOf("## MOVE OUTCOME")).toBeLessThan(user.indexOf("## PLAYER NARRATION"));
    expect(user.indexOf("## PLAYER NARRATION")).toBeLessThan(user.indexOf(HEADING));
    expect(user.indexOf(HEADING)).toBeLessThan(user.indexOf("Narrate the consequence"));
    expect(user).toContain("Keep to the block above");
    // The blocks it replaced are gone.
    for (const gone of ["## STAKES STATED BEFORE THE ROLL", "## THE COST IS THE PLAYER'S CHOICE", "## THE PRICE", "## THE FIGHT", "## THE VOW"]) {
      expect(user, gone).not.toContain(gone);
    }
  });
});

describe("every kind, from what calls for it", () => {
  it("[outcome] and [stakes] for any rolled move; [sheet] and [apparatus] for every move", () => {
    const list = obligationsFor({ mode: "move", resolution: { moveId: "face_danger", outcome: "strong_hit", stakes: { hit: "You make it.", priceStated: false } } });
    expect(kinds(list)).toEqual(["outcome", "stakes", "sheet", "apparatus"]);
    expect(lineOf(list, "outcome").text).toBe("MOVE OUTCOME is what happened: a strong hit. Tell it as it fell — no better and no worse.");
    expect(lineOf(list, "stakes").text).toBe("The player saw these before rolling:\n  - On a hit: You make it.\n  This is a strong hit: deliver the hit as stated.");
  });

  it("[cost] while the choice card is open; [chosen] once it was picked before the narration", () => {
    const open = obligationsFor({ mode: "move", resolution: { ...heal(), ...unansweredCardsFor(heal()) }, speaker: "Mira" });
    expect(lineOf(open, "cost").list).toBe("NOT YET");
    expect(lineOf(open, "chosen")).toBeNull();
    globalThis.game.messages.contents.push(choiceCard(heal(), { pickedIndices: [3], chosenIndex: 3, resolved: true }));
    const cards = unansweredCardsFor(heal());
    expect(cards).toEqual({ chosen: { labels: ["Take/give +3 health, then Sacrifice Resources (-2)"] } });
    const picked = obligationsFor({ mode: "move", resolution: { ...heal(), ...cards }, speaker: "Mira" });
    expect(lineOf(picked, "cost")).toBeNull();
    expect(lineOf(picked, "chosen")).toMatchObject({ list: "TELL",
      text: "Mira chose Take/give +3 health, then Sacrifice Resources (-2). Tell what it cost them." });
  });

  it("[price] — pending NOT YET, declined NOT SO, paid nothing", () => {
    const price = (status) => lineOf(obligationsFor({ mode: "move", resolution: { moveId: "explore_a_waypoint", outcome: "miss",
      isMatch: true, priceChoice: { price: "You are cut off.", stated: true, instead: "confront_chaos", status } } }), "price");
    expect(price("pending")).toMatchObject({ list: "NOT YET" });
    expect(price("pending").text).toMatch(/^THE PRICE IS THE PLAYER'S CHOICE\. This miss came with a match: the player may Pay the Price or Confront Chaos instead/);
    expect(price("declined")).toMatchObject({ list: "NOT SO" });
    expect(price("declined").text).toMatch(/^THE PRICE WAS NOT PAID\. This miss came with a match, and the player chose to Confront Chaos instead of paying a price: no price is paid, and the miss stated before the roll does not come to pass\./);
    expect(price("paid")).toBeNull();
  });

  it("[fight] — offered NOT YET, declined NOT SO, begun nothing", () => {
    const fray = { _id: "res-f", moveId: "enter_the_fray", outcome: "strong_hit", stakes: { hit: "You open fire first." } };
    const card = (over) => ({ flags: { [MODULE_ID]: { combatThresholdCard: true, resolutionId: "res-f", position: "in_control", ...over } } });
    globalThis.game.messages.contents = [card({})];
    const offered = obligationsFor({ mode: "move", resolution: { ...fray, ...unansweredCardsFor(fray) } });
    expect(lineOf(offered, "fight")).toMatchObject({ list: "NOT YET" });
    expect(lineOf(offered, "stakes").text).toContain("the hit as stated is the opening this roll has won");
    globalThis.game.messages.contents = [card({ thresholdTaken: "wayOut" })];
    expect(lineOf(obligationsFor({ mode: "move", resolution: { ...fray, ...unansweredCardsFor(fray) } }), "fight")).toMatchObject({ list: "NOT SO" });
    globalThis.game.messages.contents = [card({ thresholdTaken: "fray" })];
    expect(unansweredCardsFor(fray)).toEqual({});
  });

  it("[vow] on a fulfilment's hit; [recommit] on a progress move's miss; [milestone] on Reach a Milestone", () => {
    const of = (moveId, outcome) => kinds(obligationsFor({ mode: "move", resolution: { moveId, outcome, moveTarget: "Find Chen" } }));
    expect(of("fulfill_your_vow", "strong_hit")).toContain("vow");
    expect(of("fulfill_your_vow", "miss")).not.toContain("vow");
    expect(of("fulfill_your_vow", "miss")).toContain("recommit");
    expect(of("finish_an_expedition", "miss")).toContain("recommit");
    expect(of("forge_a_bond", "miss")).toContain("recommit");
    expect(of("face_danger", "miss")).not.toContain("recommit");
    expect(lineOf(obligationsFor({ mode: "move", resolution: { moveId: "reach_a_milestone", outcome: null, moveTarget: "Find Chen" } }), "milestone").text)
      .toBe("Tell the headway as the scene has shown it: Find Chen.");
  });

  it("[match] for a roll with a match; [overridden] for a soft refusal the GM rolled", () => {
    const list = obligationsFor({ mode: "move", resolution: { moveId: "heal", outcome: "strong_hit", isMatch: true, gateNote: "rolled at the GM's word: nothing to heal" } });
    expect(lineOf(list, "match").text).toBe("This roll came with a match: tell its twist as something that happens in the scene, and never write the word \"match\".");
    expect(lineOf(list, "overridden").text).toMatch(/^The roll was made at the GM's word; the sheet says nothing to heal — /);
  });

  it("[oracle] — the answer told, its opposite not so; nothing for a table roll", () => {
    const list = obligationsFor({ mode: "oracle", oracle: { kind: "oracle_yes_no", question: "Is the hatch sealed?", rolledLine: "d100 = 97 → NO" } });
    expect(list.map(o => [o.kind, o.list])).toEqual([["oracle", "TELL"], ["oracle", "NOT SO"]]);
    expect(list[0].text).toMatch(/^The answer is NO: to "Is the hatch sealed\?", the oracle says no\. It is the table's answer/);
    expect(list[1].text).toBe("Nothing in the prose may say, show or imply yes, or leave it open.");
    expect(obligationsFor({ mode: "oracle", oracle: { kind: "oracle_table", question: "", rolledLine: "d100 = 12 → Ruins" } })).toEqual([]);
  });

  it("[premise] and [offer] for a paced line (slice 1), [state] for what the line touches", () => {
    const situation = { roller: { name: "Mira", connections: [{ name: "Tamsin Vey", ticks: 40, bonded: false, lost: false }] }, tracks: { fights: [] } };
    const list = obligationsFor({ mode: "paced", offer: "forge_a_bond", line: "I tell Tamsin what she means to me.", situation });
    expect(kinds(list)).toEqual(["offer", "state", "sheet", "apparatus"]);
    expect(lineOf(list, "state").text).toBe("Tamsin Vey is Mira's connection, not a bond: their relationship is full and no bond is forged.");
  });
});

describe("the kinds' sweep", () => {
  it("every kind has a list and a check class, and is rendered by the block", () => {
    for (const [kind, row] of Object.entries(OBLIGATION_KINDS)) {
      expect(["certain", "floor", "judge", "logged"], kind).toContain(row.check);
      expect(typeof row.list === "function" || ["TELL", "NOT YET", "NOT SO"].includes(row.list), kind).toBe(true);
      expect(typeof row.text, kind).toBe("function");
    }
  });

  it("every kind a contract row names exists", () => {
    for (const [moveId, row] of Object.entries(MOVE_CONTRACTS)) {
      for (const kind of row.obliges ?? []) expect(OBLIGATION_KINDS[kind], `${moveId}: ${kind}`).toBeTruthy();
    }
  });

  it("the paced message carries the block with no SUGGESTED MOVE has-not-been-made half", () => {
    const user = buildPacedNarrativeUserMessage("I check the hull.", "", 3, "repair", "Mira");
    expect(user).toContain(HEADING);
    expect(user).toContain("- [offer] Repair is only offered.");
    // SUGGESTED MOVE keeps only how to offer it; "It has not been made…" is the [offer] line's.
    const suggested = user.slice(user.indexOf("## SUGGESTED MOVE"), user.indexOf(HEADING));
    expect(suggested).toContain("End your narration with ONE italicized sentence inviting this move");
    expect(suggested).not.toContain("It has not been made");
  });
});
