/**
 * PIPE-01 · STATED-MISS-CHARGED-ON-WEAK-HIT
 *
 * Scenario: the Confirm dialog states the stakes of a Battle — "On a hit: …",
 * "On a miss: … (Endure Harm −2)". The roll is a WEAK HIT ("Objective
 * achieved but at cost. Pay the Price.").
 *
 * Correct (decisions.md → "Issue #353 R1": "A miss pays them: a routed miss
 * … posts its Pay the Price card with the stated miss"; resolver.js: "a miss
 * that pays the price pays the stated miss"): the stated MISS is a miss's
 * price. A weak hit that pays a price pays the table's — the miss the player
 * was shown did not happen.
 *
 * Today: movePipeline.rollMove takes `statedPrice(resolution.stakes)` for any
 * result that routes Pay the Price, whatever its outcome — so the weak hit's
 * card reads "As stated before the roll: <the miss line>", the miss's suffer
 * move (−2) lands on the roller, and the narrator is seeded "Pay the Price:
 * <the miss line>" beside "This is a weak hit: deliver the hit as stated".
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [20], ptpRolls: 0 }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
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
    control.ptpRolls += 1;
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const HIT_LINE  = "You drive the raiders off the cargo deck.";
const MISS_LINE = "The raiders overrun the deck and take the cargo.";
const STAKES = { hit: HIT_LINE, miss: MISS_LINE, missSuffer: { move: "endure_harm", amount: 2 }, priceStated: true };

// [challenge, challenge, action] Math.random values; wits 2, momentum 2 (no burn to offer: nothing is held).
const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 + 2 = 6 — a weak hit
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 + 2 = 3 — a miss

let table, pc;
const priceCards    = () => table.cards(f => f.payThePriceCard);
const narratorCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME|Narrate the consequence/.test(`${c.system}\n${c.userText}`));

async function battle(dice) {
  control.interpretation = { moveId: "battle", moveName: "Battle", statUsed: "wits", adds: 0, rationale: "test",
    mischiefApplied: false, stakes: { ...STAKES } };
  control.dice = dice;
  await table.client("pl-1").chat("Kira leads the crew against the raiders on the cargo deck.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [20];        // Pay the Price 20: "A surprising development complicates your quest" — no suffer route
  control.ptpRolls = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "pipe01-s1", sessionNumber: 1,
      currentSceneId: "pipe01-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("PIPE-01 — the miss stated before the roll is a miss's price, not a weak hit's", () => {
  it("control: a Battle MISS pays the stated miss — its card says so, its suffer move lands, nothing is rolled", async () => {
    const card = await battle(MISS);
    expect(card.flags[MODULE_ID].awaitingUpgrade).toBeUndefined();
    expect(table.world.message(card._id).content).toContain("Miss");
    expect(priceCards()).toHaveLength(1);
    expect(priceCards()[0].content).toContain(`As stated before the roll: <strong>${MISS_LINE}</strong>`);
    expect(control.ptpRolls).toBe(0);
    expect(pc.system.health.value).toBe(3);
  });

  it("a Battle WEAK HIT that pays a price does not pay the miss the player was shown", async () => {
    const card = await battle(WEAK);
    expect(table.world.message(card._id).content).toContain("Weak Hit");   // setup: the roll is a hit
    expect(card.flags[MODULE_ID].awaitingUpgrade).toBeUndefined();          // setup: not held — the price is paid at the roll
    expect(priceCards()).toHaveLength(1);

    // The card must not present the stated MISS as what this hit paid…
    expect.soft(priceCards()[0].content, "the weak hit's Pay the Price card").not.toContain(MISS_LINE);
    // …nor may the miss's stated suffer move (Endure Harm −2) land on a hit: the table's row 20 routes none.
    expect.soft(pc.system.health.value, "health after the weak hit (the table's row 20 routes no suffer move)").toBe(5);
    // …and the narrator, told to "deliver the hit as stated", is not seeded with the miss as the price.
    const call = narratorCalls().at(-1);
    expect.soft(`${call.system}\n${call.userText}`.includes(`Pay the Price: ${MISS_LINE}`), "the narrator is seeded with the stated miss as the weak hit's price").toBe(false);
    expect.soft(`${call.system}\n${call.userText}`.includes("This is a weak hit: deliver the hit as stated"), "…beside being told to deliver the hit (control)").toBe(true);
  });
});
