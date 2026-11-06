/**
 * Eleventh audit — UPG-D2 BURN-REFUND-LEAVES-CREW-UNPREPARED (a decision row:
 * issue #313's accepted trade-off × issue #338 D3).
 *
 * Two players on a booted table, the real move pipeline. The crew's shared
 * supply is 1. Kira's Face Danger misses; its Pay the Price — "You waste
 * resources" — is Sacrifice Resources (-1): supply 1 → 0, and Kira and Ren,
 * sharing it, are marked unprepared together (issue #315 S07). Kira burns her
 * miss to a strong hit: the reversal refunds the supply (0 → 1 — the price
 * "was never actually paid") but not the impact the same route marked (#313:
 * "Impacts a suffer executor marked are still not reversed"). The crew stays
 * unprepared at supply 1 — and since D3 ("a loss of resources while
 * unprepared goes to another suffer move, at any supply") every Sacrifice
 * Resources any of them makes is redirected, and their momentum max and reset
 * stay lowered, until someone Resupplies — for a supply that was never
 * exhausted. Before D3 the stale mark redirected nothing above 0.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/burnRefundLeavesCrewUnprepared.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: 70 }));
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
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// Pay the Price 70: "You waste resources" — Sacrifice Resources (-1).
vi.mock("../../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random").mockReturnValueOnce((control.ptp - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

let table, kira, ren;
const flags = (id) => table.world.message(id).flags[MODULE_ID];
// challenge 6, 7; action die 1 — iron 3 + 1 misses.
const MISS = [0.55, 0.65, 0.1];

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "d2-s1", sessionNumber: 1,
      currentSceneId: "d2-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 }, supply: { value: 1 } } });
  ren  = table.addActor({ id: "pc-ren",  name: "Ren",  ownership: { "pl-2": 3 }, system: { momentum: { value: 4 }, supply: { value: 1 } } });
  scriptClaude(table, { fallback: () => 'The hold empties as Kira scrambles.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

async function missedAndBurned() {
  control.interpretation = { moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0, rationale: "probe", mischiefApplied: false };
  control.dice = MISS;
  await table.client("pl-1").chat("Kira dumps the cargo to outrun them.", { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  expect(kira.system.supply.value).toBe(0);
  expect(kira.system.debility.unprepared).toBe(true);
  expect(ren.system.debility.unprepared).toBe(true);           // the crew, together (S07)
  await table.client("pl-1").click(card._id, '[data-action="sf-burn-momentum"]');
  await table.settle(); await table.drain();
  expect(flags(card._id).burn.consumed).toBe(true);
  return card;
}

describe("UPG-D2 — a burn refunds the supply a price took, and leaves the crew unprepared", () => {
  it("control: the refund lands — the supply is back to 1", async () => {
    await missedAndBurned();
    expect(kira.system.supply.value).toBe(1);
  }, 30_000);

  it("the crew is not unprepared for a supply that was never exhausted", async () => {
    await missedAndBurned();
    expect(kira.system.debility.unprepared).toBe(false);
    expect(ren.system.debility.unprepared).toBe(false);
  }, 30_000);
});
