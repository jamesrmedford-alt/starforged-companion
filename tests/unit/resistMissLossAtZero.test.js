/**
 * An Endure Harm / Endure Stress miss's "-1 health" / "-1 spirit" at 0 is
 * taken as momentum, as the executors take harm past the meter (issue #325
 * W14; issue #314 Q02).
 *
 * Rule (vendored Endure Harm text): "suffer -1 health … If your health is 0,
 * Lose Momentum equal to any remaining harm. … On a miss, it's worse than you
 * thought. Suffer an additional -1 health or Lose Momentum (-2)." The miss
 * option was a bare meter delta `{ health: -1 }`: applyMeterChanges clamped
 * 0 - 1 to 0, nothing was lost, and the card read "Applied: Health -1" — so
 * "-1 health" was free at 0 and always beat "Lose Momentum (-2)". The option
 * now runs the Endure Harm (Stress) executor for 1.
 *
 * Driven end to end on a booted table (interpretation and dice scripted at
 * their boundaries); the player clicks the GM's choice card on their client.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
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

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc;
// challenge 6, 7; action die 1 — iron 3 / heart 2 + 1 beats neither: a miss
const MISS = [0.55, 0.65, 0.1];

async function rollMiss(moveId, statUsed) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "probe", mischiefApplied: false };
  control.dice = MISS;
  await table.client("pl-1").chat(`I grit my teeth — ${moveId}.`, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.sufferCard && f.sufferPrompt).at(-1);
}

async function pick(card, index) {
  await table.client("pl-1").click(card._id, '[data-action="sf-suffer-pick"]', { index });
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "probe-s1", sessionNumber: 1,
      currentSceneId: "probe-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 5 }, health: { value: 0 }, spirit: { value: 0 }, debility: { wounded: true, shaken: true } } });
  scriptClaude(table, { fallback: () => 'It is worse than you thought.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("a resist miss's -1 at 0", () => {
  it("control: an Endure Harm miss posts '-1 health' / 'Lose Momentum (-2)'", async () => {
    const card = await rollMiss("endure_harm", "iron");
    expect(card.flags[MODULE_ID].sufferPrompt.options.map(o => o.label)).toEqual(["-1 health", "Lose Momentum (-2)"]);
    expect(card.flags[MODULE_ID].executorOpts.isMiss).toBe(true);
  });

  it("Endure Harm miss at 0 health, '-1 health': the harm past 0 is taken as momentum (5 → 4)", async () => {
    const card = await rollMiss("endure_harm", "iron");
    await pick(card, 0);
    expect(pc.system.health.value).toBe(0);
    expect(pc.system.momentum.value).toBe(4);
  });

  it("the card does not claim a -1 health that nothing took", async () => {
    const card = await rollMiss("endure_harm", "iron");
    await pick(card, 0);
    expect(pc.system.health.value).toBe(0);
    expect(table.world.message(card._id).content).not.toMatch(/Applied: Health -1/);
  });

  it("Endure Stress miss at 0 spirit, '-1 spirit': the stress past 0 is taken as momentum (5 → 4)", async () => {
    const card = await rollMiss("endure_stress", "heart");
    await pick(card, 0);
    expect(pc.system.spirit.value).toBe(0);
    expect(pc.system.momentum.value).toBe(4);
  });

  it("control: above 0, '-1 health' takes the health and leaves momentum", async () => {
    pc.system.health.value = 3;
    pc.system.debility.wounded = false;
    const card = await rollMiss("endure_harm", "iron");
    await pick(card, 0);
    expect(pc.system.health.value).toBe(2);
    expect(pc.system.momentum.value).toBe(5);
  });
});
