/**
 * STARFORGED COMPANION
 * tests/unit/endureZeroOnMomentumPick.test.js
 *
 * Known-issues ENDURE-ZERO-ON-OTHER-OPTION — on an Endure Harm (Stress) miss
 * at 0 health (spirit), the at-0 choice follows whichever option is picked.
 *
 * Rule (vendored Endure_Harm): "On a miss, it's worse than you thought.
 * Suffer an additional -1 health or Lose Momentum (-2). If your health is 0,
 * you must also mark wounded or permanently harmed, or roll on the table
 * below." Issue #329 X03 made the at-0 escalation a choice card (mark the
 * impact, mark the lasting one, or roll the table) — but only the "-1 health"
 * pick reached it, through the Endure Harm executor. "Lose Momentum (-2)"
 * taken at 0 health ran the momentum executor alone: the escalation the rule
 * says "you must also" take never came. The option now carries the at-0
 * choice (`atZeroChoice`), offered when the meter is 0 on the miss.
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
// challenge 6, 7; action die 1 — the stat + 1 beats neither: a miss
const MISS = [0.55, 0.65, 0.1];
const LOSE_MOMENTUM = 1;   // the miss card's second option, "Lose Momentum (-2)"

async function rollMiss(moveId, statUsed) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = MISS;
  await table.client("pl-1").chat(`I grit my teeth — ${moveId}.`, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.sufferCard && f.sufferPrompt && !f.sufferPrompt.atZero).at(-1);
}

async function pick(card, index) {
  await table.client("pl-1").click(card._id, '[data-action="sf-suffer-pick"]', { index });
  await table.settle(); await table.drain();
}

/** The at-0 choice cards posted for `meter` ("health" | "spirit"). */
const atZeroCards = (meter) => table.cards(f => f.sufferCard && f.sufferPrompt?.atZero === meter);
const labels = (card) => card.flags[MODULE_ID].sufferPrompt.options.map(o => o.label);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "s1", sessionNumber: 1,
      currentSceneId: "scene-1", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 5 }, health: { value: 0 }, spirit: { value: 0 } } });
  scriptClaude(table, { fallback: () => 'It is worse than you thought.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("ENDURE-ZERO-ON-OTHER-OPTION — the at-0 choice follows either miss option", () => {
  it("Endure Harm miss at 0 health, 'Lose Momentum (-2)': momentum 5 → 3, then the at-0 choice", async () => {
    const card = await rollMiss("endure_harm", "iron");
    expect(labels(card)[LOSE_MOMENTUM]).toBe("Lose Momentum (-2)");   // control: the option picked
    await pick(card, LOSE_MOMENTUM);

    expect(pc.system.momentum.value).toBe(3);
    const offered = atZeroCards("health");
    expect(offered).toHaveLength(1);                                    // was 0 — the escalation never came
    expect(labels(offered[0])).toEqual(["Mark wounded", "Mark permanently harmed", "Roll on the mortal-wound table"]);
    expect(offered[0].flags[MODULE_ID].actorId).toBe("pc-kira");
    // the pick itself marks nothing — the choice is the player's
    expect(pc.system.debility.wounded ?? false).toBe(false);
  });

  it("Endure Stress miss at 0 spirit, 'Lose Momentum (-2)': the desolation choice follows", async () => {
    const card = await rollMiss("endure_stress", "heart");
    await pick(card, LOSE_MOMENTUM);

    expect(pc.system.momentum.value).toBe(3);
    const offered = atZeroCards("spirit");
    expect(offered).toHaveLength(1);
    expect(labels(offered[0])).toEqual(["Mark shaken", "Mark traumatized", "Roll on the desolation table"]);
  });

  it("…and a pick on it applies that one: 'Mark permanently harmed'", async () => {
    const card = await rollMiss("endure_harm", "iron");
    await pick(card, LOSE_MOMENTUM);
    await pick(atZeroCards("health")[0], 1);
    expect(pc.system.debility.permanentlyharmed).toBe(true);
    expect(pc.system.debility.wounded ?? false).toBe(false);
  });

  it("control: above 0 health, 'Lose Momentum (-2)' offers no at-0 choice", async () => {
    pc.system.health.value = 3;
    const card = await rollMiss("endure_harm", "iron");
    await pick(card, LOSE_MOMENTUM);
    expect(pc.system.momentum.value).toBe(3);
    expect(atZeroCards("health")).toHaveLength(0);
  });

  it("control: '-1 health' at 0 offers the at-0 choice once (the executor's)", async () => {
    const card = await rollMiss("endure_harm", "iron");
    await pick(card, 0);
    expect(pc.system.momentum.value).toBe(4);
    expect(atZeroCards("health")).toHaveLength(1);
  });
});
