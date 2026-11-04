/**
 * PROBE — UPG-03 REDIRECT-PICKER-SURVIVES-UPGRADE (ninth audit, area upgrades)
 *
 * What the user does: the crew's supply is 0 and Kira is unprepared. Her
 * Gather Information misses; the Pay the Price d100 lands on "You waste
 * resources" (69–74: Sacrifice Resources -1). With nothing left to sacrifice,
 * the module posts a "Make a suffer move (-1)" picker for the redirected loss
 * (issue #325 W16). Kira then burns momentum (8 against 6 and 7) — the miss
 * becomes a strong hit, which pays no price.
 *
 * What happens: sufferExecutor.sacrificeResources (src/moves/sufferExecutor.js
 * :354-373) posts the redirect picker with no `resolutionId` and returns
 * `{ redirected: true, before: 0, after: 0 }`, so the price leaves no receipt
 * (index.js ptpMeterReceipts:5860-5873). The burn's revertPayThePrice
 * (resultUpgrade.js:259-313) finds nothing to refund and reconcileChoices →
 * retireOutcomeChoiceCards (resultUpgrade.js:348-358, 520-524) retires only
 * the cards carrying the move's `resolutionId`. The redirect picker stays
 * live under the strong hit: a tap on it still charges Endure Harm (-1) for a
 * price the burn undid — and, since it has no resolutionId, nothing refuses
 * the pick (upgradeKindFor is never consulted).
 *
 * What should happen: "A burn upgrades the outcome to a hit, so the price was
 * never actually paid" (decisions.md → "Burn Momentum reverses Pay-the-Price
 * side effects"), and an upgrade "retires the superseded outcome's pending
 * choice cards" (issue #311 P03). The redirected loss is that price still
 * waiting to be paid: it is retired (resolved + superseded) with the miss,
 * and a pick on it after the upgrade applies nothing. The same for Improve
 * Result.
 *
 * Control: the pipeline's own choice card (a weak Face Danger's "suffer -1"
 * picker, which carries the move's resolutionId) is retired by the burn.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/redirectPickerSurvivesBurn.probe.js
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
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// The Pay the Price d100, scripted (70: "You waste resources" → Sacrifice Resources -1).
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

let table, pc;
const flags = (id) => table.world.message(id).flags[MODULE_ID];

const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — wits 2 misses; momentum 8 burns it to a strong hit
const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 — edge 2 → 6: a weak hit

/** The suffer-choice cards on the table (the pickers), newest last. */
const choiceCards = () => table.cards(f => f.sufferCard && f.sufferPrompt);

async function roll(moveId, statUsed, dice) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat(`Kira attempts ${moveId}.`, { speaker: { actor: pc.id } });
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
  control.ptp = 70;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "redir-s1", sessionNumber: 1,
      currentSceneId: "redir-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 8 }, supply: { value: 0 }, debility: { unprepared: true } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("UPG-03 the redirected Pay the Price loss outlives the burn that undid the price", () => {
  it("the redirect picker is retired with the miss, and a pick on it afterwards applies nothing", async () => {
    const card = await roll("gather_information", "wits", MISS);
    const picker = choiceCards().at(-1);
    expect(picker).toBeTruthy();                                            // W16: the loss went to a picker
    expect(picker.flags[MODULE_ID].sufferPrompt).toMatchObject({ kind: "any", amount: 1, exclude: ["sacrifice_resources"] });
    expect(picker.flags[MODULE_ID].resolved).toBe(false);
    expect(pc.system.supply.value).toBe(0);

    await click(card, '[data-action="sf-burn-momentum"]');
    expect(flags(card._id).burn.consumed).toBe(true);                       // the miss is a strong hit now
    expect(pc.system.momentum.value).toBe(3);                               // reset 1 (unprepared is an impact) + Gather Information's +2

    // Expected: the price the burn undid is not still waiting on the table. Actual: the picker is live.
    const after = flags(picker._id);
    expect.soft(after.resolved === true || after.superseded === true).toBe(true);

    await click(picker, '[data-suffer-id="endure_harm"]');
    expect.soft(pc.system.health.value).toBe(5);                            // actual: 4 — the undone price is still charged
  }, 30_000);

  it("control: the move's own choice card (a weak Face Danger's picker) is retired by the burn", async () => {
    pc.system.supply.value = 3;
    pc.system.debility.unprepared = false;
    const card = await roll("face_danger", "edge", WEAK);
    const picker = choiceCards().at(-1);
    expect(picker.flags[MODULE_ID].resolutionId).toBe(flags(card._id).resolutionId);

    await click(card, '[data-action="sf-burn-momentum"]');
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(flags(picker._id).superseded).toBe(true);
  }, 30_000);
});
