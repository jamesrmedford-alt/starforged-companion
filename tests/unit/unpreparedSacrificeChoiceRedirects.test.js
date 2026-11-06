/**
 * STARFORGED COMPANION
 * tests/unit/unpreparedSacrificeChoiceRedirects.test.js
 *
 * Issue #342 D1 UNPREPARED-ENUMERATED-SACRIFICE-GREYED (the rules auditor's
 * RULE-D1 probe; the maintainer took option A).
 *
 * Check Your Gear's weak hit: "you have it, but choose one: Sacrifice
 * Resources (-1) or Lose Momentum (-2)". While unprepared, "When you suffer a
 * loss of resources while unprepared, envision how this causes you hardship
 * and apply the cost to a different suffer move" (vendored Sacrifice
 * Resources): the Sacrifice Resources (-1) choice stands, and its -1 goes to
 * another suffer move — what the executor does for a routed loss (the W16
 * picker, "make a suffer move (-1)", Sacrifice Resources excluded). The
 * choice card used to grey the option (sufferDialog.isOptionAvailable — issue
 * #325 W16, keyed on the impact by issue #338 D3), so an unprepared PC could
 * only take Lose Momentum (-2). Heal's weak hit is the same ("… then
 * Sacrifice Resources (-2)").
 *
 * Harness: sacrificeWhileUnprepared.test.js's (booted two-client table).
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
// challenge 3, 7; action die 4 — supply 2 → 6: a weak hit.
const WEAK = [0.25, 0.65, 0.5];

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "probe-s1", sessionNumber: 1,
      currentSceneId: "probe-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  scriptClaude(table, { fallback: () => 'You find it, barely.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

async function weakCheckYourGear() {
  control.interpretation = { moveId: "check_your_gear", moveName: "Check Your Gear", statUsed: "supply", adds: 0, rationale: "probe", mischiefApplied: false };
  control.dice = WEAK;
  await table.client("pl-1").chat("I dig through the pack for a cutting torch.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.sufferCard && f.sufferPrompt).at(-1);
}
const SACRIFICE = '[data-action="sf-suffer-pick"][data-option-index="0"]';

describe("D1 — Check Your Gear's 'Sacrifice Resources (-1)' while unprepared", () => {
  it("control: prepared, the weak hit offers both options and Sacrifice Resources (-1) pays 1 supply", async () => {
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
      system: { supply: { value: 2 }, momentum: { value: 4 }, debility: { unprepared: false } } });
    const card = await weakCheckYourGear();
    expect(card.flags[MODULE_ID].sufferPrompt.options.map(o => o.label)).toEqual(["Sacrifice Resources (-1)", "Lose Momentum (-2)"]);
    await table.client("pl-1").click(card._id, SACRIFICE);
    await table.settle(); await table.drain();
    expect(pc.system.supply.value).toBe(1);
  }, 30_000);

  it("unprepared (supply 2), picking Sacrifice Resources (-1) sends its -1 to another suffer move", async () => {
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
      system: { supply: { value: 2 }, momentum: { value: 4 }, debility: { unprepared: true } } });
    const card = await weakCheckYourGear();
    const button = table.client("pl-1").render(card._id).querySelector(SACRIFICE);
    const offered = !!button && !button.disabled;

    await table.client("pl-1").click(card._id, SACRIFICE);
    await table.settle(); await table.drain();
    const redirect = table.cards(f => f.sufferCard && f.sufferPrompt?.kind === "any" && f.sufferPrompt?.amount === 1).at(-1);

    expect({
      offered,
      redirected: redirect?.flags?.[MODULE_ID]?.sufferPrompt?.exclude ?? null,
      supply: pc.system.supply.value,
    }).toEqual({ offered: true, redirected: ["sacrifice_resources"], supply: 2 });
  }, 30_000);
});

describe("D1 — Heal's weak hit: '… then Sacrifice Resources (-2)' while unprepared", () => {
  it("stays open beside '… then Lose Momentum (-2)' — its cost is redirected when picked", async () => {
    const { mapConsequences } = await import("../../src/moves/resolver.js");
    const { isOptionAvailable } = await import("../../src/moves/sufferDialog.js");
    const unprepared = { system: { supply: { value: 2 }, debility: { unprepared: true, wounded: false } } };
    const options = mapConsequences("heal", "weak_hit", false).sufferPrompt.options;
    // Not wounded: the "+3 health" pair is the one offered — both choices of it.
    const offered = options.filter(o => isOptionAvailable(o, { actor: unprepared })).map(o => o.label);
    expect(offered).toEqual(["Take/give +3 health, then Lose Momentum (-2)", "Take/give +3 health, then Sacrifice Resources (-2)"]);
  });
});
