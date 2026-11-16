/**
 * MOVA-01 · STATED-MISS-PAID-ON-WEAK-HIT
 *
 * Scenario: a player's line is read as Battle. The interpreter states the
 * stakes (issue #353 R1): "On a hit: you drive the raiders off the dock" /
 * "On a miss: the raiders overrun the dock and take the cargo (Endure Harm −2)".
 * The Confirm dialog shows that miss line under "On a miss". The roll is a
 * WEAK HIT — Battle's weak hit achieves the objective and pays the price
 * (routePayThePrice), as Clash's weak hit does.
 *
 * Correct: the stated miss is a MISS's price (decisions.md → "Issue #353 R1":
 * "A miss pays them: a routed miss … posts its Pay the Price card with the
 * stated miss"). A weak hit's Pay the Price is the table's: a d100 card, and
 * no Endure Harm −2 for an outcome the dialog labelled "On a miss".
 *
 * Today: movePipeline.rollMove reads `statedPrice(resolution.stakes)` for any
 * result that routes Pay the Price, whatever its outcome. The weak hit's card
 * reads "As stated before the roll: The raiders overrun the dock and take the
 * cargo", Endure Harm −2 lands, and the narration is seeded with "Pay the
 * Price: The raiders overrun the dock…" beside "This is a weak hit: deliver
 * the hit as stated".
 *
 * Production path: the player's typed line through the chat hook on a booted
 * GM + player table — the real interpreter (Claude answered at the fetch
 * boundary), move pipeline, resolver, Pay the Price poster and suffer
 * executors. Scripted: the pacing decision, the ability scan, the confirm
 * dialog, the dice and the d100.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], ptp: [20] }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
vi.mock("../../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const MISS_LINE = "The raiders overrun the dock and take the cargo.";
const READING = {
  moveId: "battle", moveName: "Battle", statUsed: "heart", rationale: "A chaotic fight for the dock.", confidence: "high",
  stakes: { hit: "You drive the raiders off the dock.", miss: MISS_LINE, missSuffer: { move: "endure_harm", amount: 2 } },
};
// [challenge, challenge, action] Math.random values; heart is 2.
const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 → 6: a weak hit
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 → 3: a miss

let table, pc;
const priceCards = () => table.cards(f => f.payThePriceCard);
const moveCards  = () => table.cards(f => f.moveResolution);
const narratorCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME/.test(`${c.userText}`));

async function battle(dice) {
  control.dice = dice;
  await table.client("pl-1").chat("Kira throws herself into the fight for the dock.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return moveCards().at(-1);
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  silenceConsoleErrors();
  control.ptp = [20];   // Pay the Price 20: "A surprising development complicates your quest" — no suffer route
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "mova1-s1", sessionNumber: 1,
      currentSceneId: "mova1-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 2: neither result below can be burned, so nothing is held.
  pc = table.addActor({ id: "pc-kira-mova1", name: "Kira", ownership: { "pl-1": 3 }, system: { heart: 2, momentum: { value: 2 } } });
  scriptClaude(table, { fallback: (call) => (/move interpreter/.test(call?.system ?? "")
    ? JSON.stringify(READING)
    : /NARRATOR ROLE|SIDECAR/.test(call?.system ?? "")
      ? 'The dock shudders.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'
      : "{}") });
});

describe("MOVA-01 — the stated miss is a miss's price, not a weak hit's", () => {
  it("control: a Battle MISS pays the miss stated before the roll — its card says so, Endure Harm -2 lands", async () => {
    const card = await battle(MISS);
    expect(String(card.content)).toMatch(/sf-move-name">Battle<[\s\S]*sf-move-outcome">Miss</);
    expect(priceCards()).toHaveLength(1);
    expect(priceCards()[0].content).toContain(`As stated before the roll: <strong>${MISS_LINE}</strong>`);
    expect(pc.system.health.value).toBe(3);
  }, 60_000);

  it("a Battle WEAK HIT pays the table's price — not the line the dialog showed under \"On a miss\"", async () => {
    const card = await battle(WEAK);
    expect(String(card.content)).toMatch(/sf-move-name">Battle<[\s\S]*sf-move-outcome">Weak Hit</);
    expect(priceCards(), "the weak hit pays the price (setup)").toHaveLength(1);

    // The objective was achieved: the card must not say the raiders took the dock.
    expect(priceCards()[0].content).not.toContain("As stated before the roll");
    expect(priceCards()[0].content).toMatch(/d100 = <strong>20<\/strong>/);
    // …and the miss's Endure Harm -2 is not this weak hit's cost.
    expect(pc.system.health.value).toBe(5);
    // The narration is not told the miss happened.
    const call = narratorCalls().at(-1);
    expect(`${call?.system}\n${call?.userText}`).not.toContain(`Pay the Price: ${MISS_LINE}`);
  }, 60_000);
});
