/**
 * PIPE-07 · STATED-MISS-COST-SHOWN-FOR-A-MISS-THAT-PAYS-NONE
 *
 * Scenario: the interpreter states the stakes of an Enter the Fray — "On a
 * hit: …", "On a miss: … " with `missSuffer: Endure Harm 1`. The Confirm dialog
 * shows the miss with its cost, "(Endure Harm −1)", because `priceStated` is
 * true for ANY move with a stated miss (stakes.js withPriceSource: `!!stakes.miss
 * && statedPriceEnabled()` — it never asks whether this move's miss pays a
 * price). Enter the Fray's miss pays none ("Fight begins with you in a bad
 * spot."). The roll misses.
 *
 * Correct (decisions.md → "Issue #353 R1": "Whether a miss pays the stated
 * miss (`priceStated`) is fixed when the interpretation is read, so the dialog
 * shows what the roll then pays"; "'On a miss' with its cost — only when it is
 * the price"): what the dialog showed as the miss's cost is what the miss
 * costs — either the suffer move it named lands, or it was never shown as the
 * price and the narrator is not told it is.
 *
 * Today: the dialog shows "(Endure Harm −1)"; the miss lands no harm (nothing
 * routes Pay the Price, so statedPrice is never read); and the narrator's
 * STAKES block says "On a miss: … (Endure Harm −1)" / "deliver the miss as
 * stated — it is what this miss costs" for a cost that is not on the sheet.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
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

import { bootTable, resetTable, narratorCalls, MODULE_ID, MISS } from "./_heldTable.js";
import { normaliseStakes, withPriceSource, stakesShown } from "../../../src/moves/stakes.js";

const HIT_LINE  = "You get the drop on the raiders.";
const MISS_LINE = "The raiders catch you in the open and a round clips your shoulder.";
/** The stakes exactly as interpreter.js parseInterpretation keeps the model's (`withPriceSource(normaliseStakes(…))`). */
const statedByInterpreter = () => withPriceSource(normaliseStakes({ hit: HIT_LINE, miss: MISS_LINE, missSuffer: { move: "endure_harm", amount: 1 } }));

let table, pc;

async function roll(moveId, line) {
  control.interpretation = { moveId, moveName: moveId, statUsed: "wits", adds: 0, rationale: "test", mischiefApplied: false,
    moveTarget: "the raiders", stakes: statedByInterpreter() };
  control.dice = MISS;
  await table.client("pl-1").chat(line, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

/** The cost the Confirm dialog showed beside "On a miss" (settingsPanel renderStakesBlock reads stakesShown). */
const shownMissCost = () => stakesShown(statedByInterpreter()).find(s => s.kind === "miss")?.cost ?? "";

beforeAll(async () => { table = await bootTable(); }, 30_000);
afterAll(() => table?.teardown());
// Momentum 2: a miss against 6 and 7 cannot be burned — nothing is held, the miss is paid and narrated at the roll.
beforeEach(async () => { pc = await resetTable(table, { momentum: 2 }); });

describe("PIPE-07 — the cost the dialog shows beside \"On a miss\" is what the miss costs", () => {
  it("control: a Face Danger miss pays the stated miss — the Endure Harm −1 the dialog showed lands", async () => {
    expect(shownMissCost()).toBe("Endure Harm −1");
    await roll("face_danger", "Kira sprints across the open deck toward the raiders' skiff.");
    expect(table.cards(f => f.payThePriceCard)[0]?.content).toContain(`As stated before the roll: <strong>${MISS_LINE}</strong>`);
    expect(pc.system.health.value).toBe(4);
  });

  it("an Enter the Fray miss: the dialog showed \"(Endure Harm −1)\" — so the harm lands, or it was not shown as the miss's cost", async () => {
    const shown = shownMissCost();
    const card = await roll("enter_the_fray", "Kira draws and rushes the raiders at the airlock.");
    // Setup: the roll is Enter the Fray's miss, which routes no Pay the Price.
    const f = table.world.message(card._id).flags[MODULE_ID];
    expect(table.world.message(card._id).content).toContain("Miss");
    expect(table.cards(x => x.payThePriceCard)).toEqual([]);

    const paid = 5 - pc.system.health.value;
    // What was shown is what is paid: "Endure Harm −1" shown ⇒ 1 harm; nothing paid ⇒ no cost shown.
    expect({ shown, paid }, `resolution ${f.resolutionId}`).toSatisfy(x => (x.shown === "" && x.paid === 0) || (x.shown === "Endure Harm −1" && x.paid === 1));
  });

  it("…and the narrator is not told an unpaid cost \"is what this miss costs\"", async () => {
    await roll("enter_the_fray", "Kira draws and rushes the raiders at the airlock.");
    expect(pc.system.health.value).toBe(5);   // setup: nothing was paid
    const call = narratorCalls(table).at(-1);
    const prompt = `${call.system}\n${call.userText}`;
    expect(prompt.includes("(Endure Harm −1)"), "the narrator is told the miss costs Endure Harm −1").toBe(false);
  });
});
