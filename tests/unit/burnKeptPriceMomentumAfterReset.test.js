/**
 * STARFORGED COMPANION
 * tests/unit/burnKeptPriceMomentumAfterReset.test.js
 *
 * Issue #342 Z51 BURN-PRICE-STANDS-MOMENTUM-REFUNDED (the rules auditor's
 * RULE-3 probe).
 *
 * "You must burn momentum before applying any other effects of the move"
 * (Burn Momentum, burnMomentum.js header): the burn resets momentum, THEN the
 * burned outcome's effects apply. A Battle (or Clash) miss burned to a WEAK
 * hit still Pays the Price — issue #313 keeps the price already rolled as the
 * weak hit's (`priceStands`). When that price took momentum — "You are
 * harmed" at 0 health: "If your health is 0, Lose Momentum equal to any
 * remaining harm" (vendored Endure_Harm) — the weak hit's price costs that
 * momentum after the reset. The burn's meter change set momentum to reset +
 * the upgraded outcome's own momentum, measured from the live value that
 * already held the price's loss, so the kept price's momentum was refunded
 * while its harm stood; it now comes off the reset.
 *
 * Harness: priceStandsKeepsPriceCards.test.js's.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [78] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// The Pay the Price d100, scripted (78: "You are harmed" → Endure Harm -1).
vi.mock("../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc;
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const BURN  = '[data-action="sf-burn-momentum"]';
// challenge 4 and 8; action die 1 — iron 1 → 2: a miss. Burned momentum 6
// beats one die (a weak hit); 9 beats both (a strong hit).
const MISS = [0.35, 0.75, 0.0];

async function battle() {
  control.interpretation = { moveId: "battle", moveName: "Battle", statUsed: "iron", adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = MISS;
  await table.client("pl-1").chat("Kira throws herself into the fight — Battle.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}
async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [78];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "ps-s1", sessionNumber: 1,
      currentSceneId: "ps-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  scriptClaude(table, { fallback: () => 'The fight turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("Z51 — a burn whose price stands keeps the price's momentum loss", () => {
  it("control: burned to a STRONG hit, the price is undone — health and its momentum refunded, momentum at the reset", async () => {
    // Health 0 (not wounded: no impacts, reset +2), momentum 9.
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
      system: { momentum: { value: 9 }, health: { value: 0 }, iron: 1 } });
    await battle();
    expect(pc.system.momentum.value).toBe(8);          // the price's harm past 0 took 1 momentum
    const card = table.cards(f => f.moveResolution).at(-1);
    expect(flags(card._id).burn).toMatchObject({ canBurn: true, momentum: 9, previewOutcome: "strong_hit" });
    await click(card, BURN);
    expect(table.world.message(card._id).content).toMatch(/Burned → Strong Hit/);
    expect(pc.system.momentum.value).toBe(2 + 2);      // reset +2, then Battle's strong hit +2
  }, 30_000);

  it("burned to a WEAK hit, the price stands — and its momentum loss lands after the reset", async () => {
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
      system: { momentum: { value: 6 }, health: { value: 0 }, iron: 1 } });
    const card = await battle();
    // The miss's price: "You are harmed" at 0 health — the harm past 0 is momentum (6 → 5).
    expect(pc.system.health.value).toBe(0);
    expect(pc.system.momentum.value).toBe(5);
    expect(flags(card._id).burn).toMatchObject({ canBurn: true, momentum: 6, previewOutcome: "weak_hit" });

    await click(card, BURN);

    expect(flags(card._id).burn.consumed).toBe(true);
    const content = table.world.message(card._id).content;
    expect(content).toMatch(/Burned → Weak Hit/);
    expect(content).toMatch(/already rolled stands — this result pays it too/);   // the price stands
    expect(pc.system.health.value).toBe(0);

    // Burn first (momentum → reset +2), then the weak hit's effects: its price,
    // "You are harmed" at 0 health, takes 1 momentum → +1.
    expect(pc.system.momentum.value, "the kept price's -1 momentum after the reset").toBe(2 - 1);
  }, 30_000);
});
