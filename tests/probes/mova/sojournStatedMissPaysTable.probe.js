/**
 * MOVA-03 · SOJOURN-STATED-MISS-PAYS-TABLE
 *
 * Scenario: a player's line is read as Sojourn. The interpreter states the
 * stakes (issue #353 R1): "On a miss: the settlement's gates stay shut against
 * you (Endure Stress −1)", which the Confirm dialog shows as what a miss
 * costs. The roll is a miss. Sojourn's miss offers a choice — the community
 * needs help, or "No relief — Pay the Price" — and the player picks the price.
 *
 * Correct (decisions.md → "Issue #353 R1": "An unrouted miss whose text says
 * to pay the price is seeded with the stated miss instead of an advisory
 * table roll. The table is rolled only when no miss was stated"): the
 * narration is given one price — the stated miss — and paying the price pays
 * it: Endure Stress −1.
 *
 * Today: resolveMove rolls the choice's price on the table whatever was stated
 * (resolver.rollChoicePrice, SOJOURN-PTP-ADVISORY) and passes
 * `routesPayThePrice: true` to buildOracleSeeds, so the stated miss is never
 * the seed. The narration is told two prices — "Pay the Price: You waste
 * resources" (the d100) and "This is a miss: deliver the miss as stated — it
 * is what this miss costs" — and the pick pays the table's: supply −1, spirit
 * untouched, though the dialog said "(Endure Stress −1)".
 *
 * Production path: the player's typed line through the chat hook on a booted
 * GM + player table — the real interpreter (Claude answered at the fetch
 * boundary), move pipeline, resolver, narrator prompt, choice card and its
 * pick. Scripted: the pacing decision, the ability scan, the confirm dialog
 * (which records the stakes it was given), the dice and the d100.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], confirmedStakes: [] }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async (interpretation) => {
    control.confirmedStakes.push(JSON.parse(JSON.stringify(interpretation?.stakes ?? null)));
    return true;
  }),
}));
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";
import { stakesShown } from "../../../src/moves/stakes.js";

const MISS_LINE = "The settlement's gates stay shut against you.";
const STATED = { hit: "The settlement takes you in.", miss: MISS_LINE, missSuffer: { move: "endure_stress", amount: 1 } };
// challenge 9, 10; action 1 + heart 1 = 2 — a miss; then, if the resolver rolls the table, the d100 = 71:
// "You waste resources" → Sacrifice Resources -1.
const MISS_THEN_WASTE = [0.85, 0.95, 0.0, 0.705];

let table, kira, reading;
const sufferCards = () => table.cards(f => f.sufferCard);
const ptpCards    = () => table.cards(f => f.payThePriceCard);
const narratorCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME/.test(`${c.userText}`));

async function kiraSojourns(stakes) {
  reading = { moveId: "sojourn", moveName: "Sojourn", statUsed: "heart", rationale: "Rest at the station.", confidence: "high", stakes };
  control.dice = MISS_THEN_WASTE;
  await table.client("pl-1").chat("Kira seeks rest at the station.", { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  const call = narratorCalls().at(-1);
  return `${call?.system ?? ""}\n${call?.userText ?? ""}`;
}

async function pickNoRelief() {
  await table.client("pl-1").click(sufferCards().at(-1)._id, '[data-action="sf-suffer-pick"]', { index: 1 });
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  silenceConsoleErrors();
  control.confirmedStakes = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "mova3-s1", sessionNumber: 1,
      currentSceneId: "mova3-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  kira = table.addActor({ id: "pc-kira-mova3", name: "Kira", ownership: { "pl-1": 3 }, system: { heart: 1, supply: { value: 3 } } });
  scriptClaude(table, { fallback: (call) => (/move interpreter/.test(call?.system ?? "")
    ? JSON.stringify(reading)
    : /NARRATOR ROLE|SIDECAR/.test(call?.system ?? "")
      ? 'The station turns you away.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'
      : "{}") });
});
afterEach(async () => {
  table.client("gm-1").answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

describe("MOVA-03 — Sojourn's miss with a miss stated before the roll", () => {
  it("control: no miss stated — the narration is seeded with the table's price, and \"No relief\" pays it", async () => {
    const prompt = await kiraSojourns(null);
    expect(prompt).toContain("Pay the Price: You waste resources");
    expect(prompt).not.toContain("it is what this miss costs");
    await pickNoRelief();
    expect(ptpCards()).toHaveLength(1);
    expect(kira.system.supply.value).toBe(2);
    expect(kira.system.spirit.value).toBe(5);
  }, 60_000);

  it("the narration is given the stated miss as the price — not a table roll beside it", async () => {
    const prompt = await kiraSojourns(STATED);
    expect(sufferCards().at(-1), "the miss posted its choice card (setup)").toBeTruthy();
    expect(prompt, "the narrator is told the stated miss is what this miss costs (setup)").toContain("it is what this miss costs");
    // One price, the stated one: no d100 result seeded beside it.
    expect(prompt).not.toContain("Pay the Price: You waste resources");
  }, 60_000);

  it("\"No relief — Pay the Price\" pays what the dialog showed under \"On a miss\"", async () => {
    await kiraSojourns(STATED);
    const shown = stakesShown(control.confirmedStakes.at(-1)).find(s => s.kind === "miss");
    expect(shown, "the dialog showed the miss and its cost (setup)").toMatchObject({ text: MISS_LINE, cost: "Endure Stress −1" });
    await pickNoRelief();
    expect(ptpCards(), "the pick paid a price (setup)").toHaveLength(1);
    // The dialog said Endure Stress −1; the table's Sacrifice Resources −1 was never stated.
    expect({ spirit: kira.system.spirit.value, supply: kira.system.supply.value }).toEqual({ spirit: 4, supply: 3 });
  }, 60_000);
});
