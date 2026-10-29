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

/** Narrate a move as the player; dice are [challenge, challenge, action] Math.random values. */
async function roll(moveId, { statUsed = "iron", dice }) {
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
