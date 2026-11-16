/**
 * PROBE — IDXB-05 · ORACLE-CONSULT-KEYLESS-GM-ROLLS-AT-TYPED-ODDS (MULTIPLAYER; INCOMPLETE-FIX of issue #354 P2-31)
 *
 * Scenario: two GMs at the table. Gina (gm-1, the canonical GM) holds the
 * Claude key; Gus (gm-2) has none. The narrator holds a decided hidden plan
 * about "the escort". Gus types `!oracle yes likely Is the escort a drone?`.
 *
 * Correct (issue #353, decided: "a yes/no whose question names a decided
 * plan's subject is rolled at odds … set from the plan's truth, so the answer
 * cannot contradict it"; issue #354 P2-31 made that hold for a roll typed on a
 * client that cannot consult — a player's — by asking the canonical GM for the
 * odds): Gus's roll is rolled at the odds the plan sets, as a player's is at
 * this same table.
 *
 * Today: index.js handleOracleCommand picks the path by `game.user.isGM`
 * alone — a GM consults locally (oracleConsult.oddsFromPlan), anyone else asks
 * the canonical GM (requestPlanOdds). A GM whose client has no key gets null
 * from oddsFromPlan ("no key … keeps the odds") and never asks the keyed GM,
 * so the question is rolled at the odds typed and may contradict the plan.
 *
 * On a booted table, as tests/unit/narrativeSkeletonMechanics.test.js
 * ("Ask the Oracle about a planned subject").
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { simulateTable, USERS } from "../../helpers/multiClient.js";
import {
  resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn,
} from "../../helpers/skeletonTable.js";
import { withPayThePriceSeed } from "../../../src/moves/resolver.js";

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });   // gm-1 alone is given a Claude key
afterEach(() => restore?.());

const consults    = () => table.claude.calls.filter(c => /You set the odds for an oracle/.test(c.system ?? ""));
const oracleCards = () => table.cards(f => f.oracleCommandCard === true && /Ask the Oracle/.test(f.oracleNarration?.oracleName ?? ""));

/** A decided threat plan about "the escort", filed as a narration files one. */
async function decidedThreat() {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? "")?.[1];
    return { prose: "An escort detaches from the dark.", sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: "the escort", truth: "A Keeper drone collecting names.",
        escalation: ["It asks again, closer"], clues: ["A pulse that counts down"] }] } : {}) } };
  };
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, "face_danger", "A new enemy is revealed") }));
  const plan = plansOf(table).find(p => p.kind === "threat");
  expect(plan?.truth).toBe("A Keeper drone collecting names.");
  return plan;
}

describe("IDXB-05 — a keyless GM's yes/no about a planned subject, with a keyed GM connected", () => {
  it("control: the keyed GM's own roll is rolled at the odds the plan sets", async () => {
    await decidedThreat();
    table.script.when((c) => /You set the odds/.test(c.system ?? ""), "small_chance");
    await onGm(table, () => gmOf(table).chat("!oracle yes likely Is the escort a drone?"));
    expect(consults()).toHaveLength(1);
    expect(oracleCards().at(-1).content).toContain("Ask the Oracle (small chance)");
  }, 40_000);

  it("control: a player's roll asks the keyed GM, and is rolled at the odds the plan sets (P2-31)", async () => {
    await decidedThreat();
    table.script.when((c) => /You set the odds/.test(c.system ?? ""), "small_chance");
    await onGm(table, () => table.client("pl-1").chat("!oracle yes likely Is the escort a drone?"));
    expect(consults()).toHaveLength(1);
    expect(oracleCards().at(-1).content).toContain("Ask the Oracle (small chance)");
    expect(oracleCards().at(-1).author).toBe("pl-1");
  }, 40_000);

  it("the keyless co-GM's roll is rolled at the odds the plan sets too", async () => {
    await decidedThreat();
    // Gus is a GM with no key of his own; Gina (canonical, keyed) is connected.
    expect(table.client("gm-2").run(() => game.user.isGM)).toBe(true);
    expect(table.client("gm-2").run(() => game.settings.get("starforged-companion", "claudeApiKey") || "")).toBe("");
    table.script.when((c) => /You set the odds/.test(c.system ?? ""), "small_chance");

    await onGm(table, () => table.client("gm-2").chat("!oracle yes likely Is the escort a drone?"));

    const card = oracleCards().at(-1);
    expect(card.author, "Gus rolled it, on his own client").toBe("gm-2");
    // Fails today: no consult is made, and the card reads "Ask the Oracle (likely)".
    expect(consults()).toHaveLength(1);
    expect(card.content).toContain("Ask the Oracle (small chance)");
  }, 40_000);
});
