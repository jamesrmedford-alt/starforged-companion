/**
 * STARFORGED COMPANION
 * tests/unit/moveRules.test.js
 *
 * Move rules end to end (issue #311): a player's narration goes through the
 * GM's real move pipeline on a booted table (tests/helpers/multiClient.js) —
 * the real resolver, persist and choice card — with the interpretation, the
 * dice and the Pay the Price roll scripted at their boundaries.
 *
 *   P01 — the roller's negative momentum cancels a matching action die.
 *   P02 — a weak Heal or Hearten recovers as a strong hit does, then pays its
 *         cost.
 *   Q01 (issue #314) — Resupply's supply is conditional on unprepared: clear
 *         it and +1, otherwise +2.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: 78 }));
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

import { simulateTable, USERS } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc;
const world   = () => table.world.campaignState();
const lastLog = () => world().sessionLogs["rules-s1"].at(-1);
const choices = () => table.cards(f => f.sufferCard && f.sufferPrompt);
const meters  = () => ({ health: pc.system.health.value, spirit: pc.system.spirit.value, supply: pc.system.supply.value,
  momentum: pc.system.momentum.value, wounded: pc.system.debility.wounded, shaken: pc.system.debility.shaken });
const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 — iron 3 or heart 2 is a weak hit

/** Narrate a move as the player; dice are [challenge, challenge, action] Math.random values. */
async function roll(moveId, { statUsed = "iron", dice = WEAK } = {}) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat(`I attempt ${moveId}.`, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = 78;   // Pay the Price 78: Endure Harm (-1)
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "rules-s1", sessionNumber: 1,
      currentSceneId: "rules-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("P01 — negative momentum cancels a matching action die", () => {
  it("momentum -3 cancels a 3: iron 3 against 4 and 5 is a miss, not a strong hit", async () => {
    pc.system.momentum.value = -3;
    const card = await roll("face_danger", { dice: [0.35, 0.45, 0.4] });   // challenge 4, 5; die 3

    expect(lastLog().outcome).toBe("miss");
    expect(card.content).toContain("<s>3</s> (cancelled by momentum -3) + 3");
    expect(card.content).toMatch(/<strong>3<\/strong>[\s\S]*<div class="sf-move-outcome">Miss<\/div>/);
    // A miss: no +1 momentum, and the Pay the Price harm lands.
    expect(pc.system.momentum.value).toBe(-3);
    expect(pc.system.health.value).toBe(4);
  });

  it("a negative momentum that does not match leaves the die: -2 with a 3 is a strong hit", async () => {
    pc.system.momentum.value = -2;
    await roll("face_danger", { dice: [0.35, 0.45, 0.4] });

    expect(lastLog().outcome).toBe("strong_hit");
    expect(pc.system.momentum.value).toBe(-1);
    expect(pc.system.health.value).toBe(5);
  });
});

describe("P02 — a weak recovery is the strong hit's, plus its cost", () => {
  async function pick(index) {
    const card = choices().at(-1);
    await table.client("pl-1").click(card._id, `[data-option-index="${index}"]`);
    await table.settle(); await table.drain();
    return card;
  }

  it("weak Heal, wounded, paying momentum: wounded cleared, health 1 → 3, momentum 8 → 6", async () => {
    pc.system.health.value = 1; pc.system.momentum.value = 8;
    pc.system.debility.wounded = true;
    await roll("heal");
    expect(choices()).toHaveLength(1);
    await pick(0);
    expect(meters()).toMatchObject({ health: 3, wounded: false, momentum: 6, supply: 3 });
  });

  it("weak Heal, wounded, paying supply: wounded cleared, health 1 → 3, supply 3 → 1", async () => {
    pc.system.health.value = 1; pc.system.momentum.value = 8;
    pc.system.debility.wounded = true;
    await roll("heal");
    await pick(1);
    expect(meters()).toMatchObject({ health: 3, wounded: false, momentum: 8, supply: 1 });
  });

  it("weak Heal, not wounded: +3 health then the cost; the wounded options are unavailable", async () => {
    pc.system.health.value = 2; pc.system.momentum.value = 8;
    await roll("heal");
    const card = choices().at(-1);
    expect(card.content).toMatch(/data-option-index="0" disabled/);
    expect(card.content).toMatch(/data-option-index="1" disabled/);
    await pick(2);
    expect(meters()).toMatchObject({ health: 5, momentum: 6 });
  });

  it("weak Hearten, shaken: shaken cleared, spirit 1 → 2, momentum 8 → 7 — paid with the recovery", async () => {
    pc.system.spirit.value = 1; pc.system.momentum.value = 8;
    pc.system.debility.shaken = true;
    await roll("hearten", { statUsed: "heart" });
    expect(lastLog().outcome).toBe("weak_hit");
    // The cost rides the choice: nothing is taken until the recovery is.
    expect(pc.system.momentum.value).toBe(8);
    expect(choices()).toHaveLength(1);
    await pick(0);
    expect(meters()).toMatchObject({ spirit: 2, shaken: false, momentum: 7 });
  });

  it("weak Hearten, not shaken: spirit 1 → 3, momentum 8 → 7", async () => {
    pc.system.spirit.value = 1; pc.system.momentum.value = 8;
    await roll("hearten", { statUsed: "heart" });
    await pick(1);
    expect(meters()).toMatchObject({ spirit: 3, shaken: false, momentum: 7 });
  });
});

describe("Q01 — Resupply: unprepared, clear it and +1 supply; otherwise +2", () => {
  const STRONG = [0.15, 0.25, 0.99];   // challenge 2, 3; action die 6 — wits 2 is a strong hit

  async function pick(index) {
    const card = choices().at(-1);
    await table.client("pl-1").click(card._id, `[data-option-index="${index}"]`);
    await table.settle(); await table.drain();
    return card;
  }

  it("unprepared at supply 0: the clear-unprepared option restores 1, and the +2 option is unavailable", async () => {
    pc.system.supply.value = 0;
    pc.system.debility.unprepared = true;
    await roll("resupply", { statUsed: "wits", dice: STRONG });
    expect(lastLog().outcome).toBe("strong_hit");
    const card = choices().at(-1);
    expect(card.content).not.toMatch(/data-option-index="0" disabled/);
    expect(card.content).toMatch(/data-option-index="1" disabled/);
    await pick(0);
    expect(pc.system.supply.value).toBe(1);
    expect(pc.system.debility.unprepared).toBe(false);
  });

  it("prepared at supply 1: +2 supply restores to 3, and the clear-unprepared option is unavailable", async () => {
    pc.system.supply.value = 1;
    await roll("resupply", { statUsed: "wits", dice: STRONG });
    const card = choices().at(-1);
    expect(card.content).toMatch(/data-option-index="0" disabled/);
    expect(card.content).not.toMatch(/data-option-index="1" disabled/);
    await pick(1);
    expect(pc.system.supply.value).toBe(3);
    expect(pc.system.debility.unprepared).toBe(false);
  });

  it("the weak hit is gated the same way: unprepared at 0 takes 1, never 2", async () => {
    pc.system.supply.value = 0;
    pc.system.debility.unprepared = true;
    await roll("resupply", { statUsed: "wits" });   // WEAK: challenge 3, 7; die 4 + wits 2 = 6
    expect(lastLog().outcome).toBe("weak_hit");
    const card = choices().at(-1);
    expect(card.content).toMatch(/data-option-index="1" disabled/);
    await pick(0);
    expect(pc.system.supply.value).toBe(1);
    expect(pc.system.debility.unprepared).toBe(false);
  });
});
