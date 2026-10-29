/**
 * STARFORGED COMPANION
 * tests/unit/resultUpgrade.test.js
 *
 * Burn Momentum and Improve Result end to end (issue #311): a player's
 * narration goes through the GM's real move pipeline on a booted table
 * (tests/helpers/multiClient.js) — resolver, Pay the Price route, persist,
 * the move card and its choice card — and the player clicks the upgrade on
 * their own client, which relays it to the canonical GM. The interpretation,
 * the applicable abilities, the dice and the Pay the Price roll are scripted
 * at their boundaries.
 *
 *   P04 — a burn refunds the Pay the Price meter loss that landed.
 *   P05 — an improvement undoes the superseded miss's Pay the Price, as a
 *         burn does.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], ptp: 78 }));
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
    const rng = vi.spyOn(Math, "random").mockReturnValueOnce((control.ptp - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc;
const world   = () => table.world.campaignState();
const flags   = (id) => table.world.message(id).flags[MODULE_ID];
const lastLog = () => world().sessionLogs["upgrade-s1"].at(-1);

// [challenge, challenge, action] Math.random values.
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — wits 2 or iron 3 misses

/** Narrate a move as the player and return its move card. */
async function roll(moveId, { statUsed = "iron", dice = MISS } = {}) {
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
  control.ptp = 78;   // Pay the Price 78: Endure Harm (-1)
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "upgrade-s1", sessionNumber: 1,
      currentSceneId: "upgrade-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 8 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("P04 — a burn refunds the Pay the Price loss that landed", () => {
  it("a loss clamped at 0 health is not refunded: health stays 0", async () => {
    pc.system.health.value = 0;
    const card = await roll("gather_information", { statUsed: "wits" });
    expect(pc.system.health.value).toBe(0);
    expect(flags(card._id).burn.ptpReversals.sufferMeterDelta).toBeNull();

    await click(card, '[data-action="sf-burn-momentum"]');

    expect(flags(card._id).burn.consumed).toBe(true);
    expect(lastLog().outcome).toBe("strong_hit");
    expect(pc.system.health.value).toBe(0);
  });

  it("the solo fallback's real loss is refunded: companion route → Endure Harm, health 5 → 4 → 5", async () => {
    control.ptp = 53;   // a companion in harm's way; with none, Endure Harm (-1)
    const card = await roll("gather_information", { statUsed: "wits" });
    expect(pc.system.health.value).toBe(4);
    expect(flags(card._id).burn.ptpReversals.sufferMeterDelta).toMatchObject({
      move: "endure_harm", meterKey: "health", amount: 1, actorId: pc.id, before: 5, after: 4,
    });

    await click(card, '[data-action="sf-burn-momentum"]');

    expect(pc.system.health.value).toBe(5);
    expect(table.cards(f => f.burnReversal).at(-1)?.content).toContain("health +1 refunded");
  });

  it("the ordinary route still refunds its loss: Endure Harm, health 5 → 4 → 5", async () => {
    const card = await roll("gather_information", { statUsed: "wits" });
    expect(pc.system.health.value).toBe(4);
    await click(card, '[data-action="sf-burn-momentum"]');
    expect(pc.system.health.value).toBe(5);
  });
});

describe("P05 — both upgrades undo the superseded miss's Pay the Price", () => {
  // Fugitive-style: improve to a strong hit, its cost a note (no clock).
  const FUGITIVE = [{ assetId: null, abilityIndex: null, assetName: "Fugitive",
    text: "improve the result to a strong hit", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];

  async function missWithPursuit() {
    control.abilities = FUGITIVE;
    await table.client("gm-1").run(() => game.settings.set(MODULE_ID, "campaignState", { ...world(), clocks: [
      { _id: "pursuit", name: "Pursuit", type: "tension", segments: 4, filled: 0, active: true },
    ] }));
    const card = await roll("face_danger");   // iron 3 + 1 against 6 and 7: a miss; Pay the Price 78
    expect(lastLog().outcome).toBe("miss");
    expect(pc.system.health.value).toBe(4);
    expect(world().clocks[0].filled).toBe(1);
    return card;
  }

  for (const [label, selector, upgrade] of [
    ["Improve Result", '[data-action="sf-improve-result"]', "improve"],
    ["Burn Momentum",  '[data-action="sf-burn-momentum"]',  "burn"],
  ]) {
    it(`${label} to a strong hit: the clock rewinds to 0/4 and health 4 → 5`, async () => {
      const card = await missWithPursuit();

      await click(card, selector);

      expect(flags(card._id)[upgrade].consumed).toBe(true);
      expect(lastLog().outcome).toBe("strong_hit");
      expect(world().clocks[0].filled).toBe(0);
      expect(pc.system.health.value).toBe(5);
    });
  }

  it("the improvement's own cost still stands: its note is on the card", async () => {
    const card = await missWithPursuit();
    await click(card, '[data-action="sf-improve-result"]');
    expect(table.world.message(card._id).content).toContain("Fugitive: apply the ability's stated cost.");
    expect(table.cards(f => f.improveReversal).at(-1)?.content).toMatch(/Pursuit clock rewound[\s\S]*health \+1 refunded/);
  });
});
