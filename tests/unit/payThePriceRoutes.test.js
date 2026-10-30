/**
 * STARFORGED COMPANION
 * tests/unit/payThePriceRoutes.test.js
 *
 * What a move's Pay the Price lands, end to end (issue #314): a player's
 * narration goes through the GM's real move pipeline on a booted table
 * (tests/helpers/multiClient.js) — resolver, the Pay the Price roll and its
 * suffer routes, persist, the move card and its upgrades — with the
 * interpretation, the applicable abilities, the dice and the d100 scripted at
 * their boundaries.
 *
 *   Q02 — harm or stress past the meter is momentum, carried on the receipt:
 *         an improvement refunds it, a burn's reset replaces it.
 *   Q03 — a Pay the Price "Roll twice" lands each leaf's suffer route, and
 *         the receipts carry every loss.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// `ptp` lists the d100 results the Pay the Price roll produces, in order — a
// "Roll twice" (96–100) takes the next two.
const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], ptp: [78] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
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
const world   = () => table.world.campaignState();
const flags   = (id) => table.world.message(id).flags[MODULE_ID];
const lastLog = () => world().sessionLogs["ptp-s1"].at(-1);
const suffers = () => table.cards(f => f.sufferCard && f.suffer).map(c => c.flags[MODULE_ID]);
const ptpCard = () => table.cards(f => f.payThePriceCard).at(-1);

// [challenge, challenge, action] Math.random values.
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — wits 2 misses
const FUGITIVE = [{ assetId: null, assetName: "Fugitive", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];
const BURN    = '[data-action="sf-burn-momentum"]';
const IMPROVE = '[data-action="sf-improve-result"]';

/** Narrate a move as the player and return its move card. */
async function roll(moveId, { statUsed = "wits", dice = MISS } = {}) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat(`I attempt ${moveId}.`, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

/** The player clicks a button on a card, on their own client. */
async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.abilities = [];
  control.ptp = [78];   // Pay the Price 78: Endure Harm (-1)
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "ptp-s1", sessionNumber: 1,
      currentSceneId: "ptp-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 9: a miss against 6 and 7 can still be burned after a loss of 1.
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("Q02 — harm past 0 health is momentum, through the move pipeline", () => {
  it("Pay the Price at 0 health: one Endure Harm card, health stays 0, momentum 9 → 8", async () => {
    pc.system.health.value = 0;
    const card = await roll("gather_information");
    expect(lastLog().outcome).toBe("miss");
    expect(pc.system.health.value).toBe(0);
    expect(pc.system.momentum.value).toBe(8);
    expect(suffers()).toEqual([expect.objectContaining({ suffer: "endure_harm", before: 0, after: 0,
      momentumLoss: expect.objectContaining({ amount: 1, taken: 1, before: 9, after: 8 }) })]);
    expect(table.cards(f => f.suffer === "endure_harm").at(-1).content).toContain("Health: 0 → 0 — 1 more as momentum: 9 → 8");
    // The receipt is the momentum the loss took — what an upgrade refunds.
    expect(flags(card._id).burn.ptpReversals.sufferMeterDeltas).toEqual([expect.objectContaining({
      move: "endure_harm", meterKey: "momentum", amount: 1, actorId: pc.id, before: 9, after: 8, overflow: true,
    })]);
  });

  it("an improvement refunds the momentum the harm took: 5 → 4, the strong hit's +2, +1 refunded = 7", async () => {
    control.abilities = FUGITIVE;
    pc.system.health.value = 0;
    pc.system.momentum.value = 5;
    const card = await roll("gather_information");
    expect(pc.system.momentum.value).toBe(4);
    expect(flags(card._id).improve.ptpReversals.sufferMeterDeltas).toEqual([expect.objectContaining({ meterKey: "momentum", amount: 1, overflow: true })]);

    await click(card, IMPROVE);

    expect(lastLog().outcome).toBe("strong_hit");
    expect(pc.system.health.value).toBe(0);
    expect(pc.system.momentum.value).toBe(7);
    expect(table.cards(f => f.improveReversal).at(-1)?.content).toContain("momentum +1 refunded");
  });

  it("a burn refunds no momentum — its reset replaces it — and no health the loss never took", async () => {
    pc.system.health.value = 0;
    const card = await roll("gather_information");

    await click(card, BURN);

    expect(lastLog().outcome).toBe("strong_hit");
    expect(pc.system.health.value).toBe(0);
    // The reset is 1 (wounded was marked at 0 health) + the strong hit's +2.
    expect(pc.system.momentum.value).toBe(3);
    expect(table.cards(f => f.burnReversal)).toHaveLength(0);
  });

  it("the ordinary loss is unchanged: health 5 → 4, no momentum, and the receipt is the health", async () => {
    const card = await roll("gather_information");
    expect(pc.system.health.value).toBe(4);
    expect(pc.system.momentum.value).toBe(9);
    expect(suffers()[0].momentumLoss).toBeNull();
    expect(flags(card._id).burn.ptpReversals.sufferMeterDeltas).toEqual([expect.objectContaining({ meterKey: "health", amount: 1 })]);
  });
});

describe("Q03 — a Pay the Price 'Roll twice' lands each leaf's route", () => {
  it("96 → 78 + 85: the card says harm and stress, both routes are on it, and both land", async () => {
    control.ptp = [96, 78, 85];
    const card = await roll("gather_information");
    expect(lastLog().outcome).toBe("miss");
    const ptp = ptpCard();
    expect(ptp.content).toContain("d100 = <strong>96</strong> · You are harmed / You are stressed");
    expect(ptp.content).toContain("Routes to endure_harm (-1), endure_stress (-1).");
    expect(ptp.flags[MODULE_ID].sufferRoutes).toEqual([{ move: "endure_harm", amount: 1 }, { move: "endure_stress", amount: 1 }]);
    expect(pc.system.health.value).toBe(4);
    expect(pc.system.spirit.value).toBe(4);
    expect(suffers().map(f => f.suffer)).toEqual(["endure_harm", "endure_stress"]);
    // Both losses are on the receipt, so an upgrade refunds both.
    expect(flags(card._id).burn.ptpReversals.sufferMeterDeltas).toEqual([
      expect.objectContaining({ move: "endure_harm",   meterKey: "health", amount: 1, before: 5, after: 4 }),
      expect.objectContaining({ move: "endure_stress", meterKey: "spirit", amount: 1, before: 5, after: 4 }),
    ]);
  });

  it("a burn of that miss refunds the health and the spirit, in one write", async () => {
    control.ptp = [96, 78, 85];
    const card = await roll("gather_information");

    await click(card, BURN);

    expect(lastLog().outcome).toBe("strong_hit");
    expect(pc.system.health.value).toBe(5);
    expect(pc.system.spirit.value).toBe(5);
    expect(table.cards(f => f.burnReversal).at(-1)?.content).toMatch(/health \+1 refunded[\s\S]*spirit \+1 refunded/);
  });

  it("a narrative leaf beside a routed one: the one route lands", async () => {
    control.ptp = [96, 10, 85];
    await roll("gather_information");
    expect(ptpCard().content).toContain("You create an opportunity for an enemy / You are stressed");
    expect(pc.system.health.value).toBe(5);
    expect(pc.system.spirit.value).toBe(4);
    expect(suffers().map(f => f.suffer)).toEqual(["endure_stress"]);
  });

  it("two of the same leaf each land: 78 + 80 is two Endure Harms, health 5 → 3", async () => {
    control.ptp = [96, 78, 80];
    await roll("gather_information");
    expect(pc.system.health.value).toBe(3);
    expect(suffers().map(f => [f.suffer, f.before, f.after])).toEqual([["endure_harm", 5, 4], ["endure_harm", 4, 3]]);
  });

  it("the direct-78 control is unchanged: one Endure Harm, health 5 → 4", async () => {
    await roll("gather_information");
    expect(pc.system.health.value).toBe(4);
    expect(suffers().map(f => f.suffer)).toEqual(["endure_harm"]);
    expect(ptpCard().flags[MODULE_ID].sufferRoutes).toEqual([{ move: "endure_harm", amount: 1 }]);
  });

  it("!ptp lands each leaf too, on the typist's PC", async () => {
    control.ptp = [96, 78, 85];
    await table.client("pl-1").chat("!ptp", { speaker: { actor: pc.id } });
    await table.settle(); await table.drain();
    expect(ptpCard().content).toContain("Routes to endure_harm (-1), endure_stress (-1).");
    expect(pc.system.health.value).toBe(4);
    expect(pc.system.spirit.value).toBe(4);
  });
});
