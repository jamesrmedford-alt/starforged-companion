/**
 * PIPE-02 · HELD-CARD-FLAGS-CARRY-PLAN-ROLLS  (LEAK)
 *
 * Scenario: free-flow, default settings. Kira's Undertake an Expedition to a
 * new destination rolls a weak hit her momentum can burn to a strong hit, so
 * the result is HELD (issue #354 P2-10). The roll began an expedition track,
 * and the pipeline rolled the oracle seeds of that expedition's hidden plan
 * ("What waits at the end — Action + Theme: …"; resolver.expeditionPlanRequest)
 * for the narrator to decide it under DECIDE NOW.
 *
 * Correct: a plan's oracle rolls are GM-only until the plan is revealed
 * (decisions.md → narrative skeleton Phase 2: "The oracle rolls behind it are
 * then shown to the table (decided: hidden until revealed)"; the plans live in
 * the GM-only Secrets journal). Nothing a player's client can read carries them.
 *
 * Today: rollMove puts a JSON copy of the whole resolution on the held move
 * card (`flags.awaitingUpgrade.resolution`) — `skeletonRequests[].oracleSeeds`
 * included. A chat card's flags reach every client that can see the card: the
 * player's own client reads the plan's rolls off the card before the narrator
 * has even decided the plan.
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

import { bootTable, resetTable, MODULE_ID, WEAK, STRONG } from "./_heldTable.js";
import { narrationInputFrom } from "../../../src/moves/movePipeline.js";
import { staticSettingScope } from "../../helpers/settingScopes.js";

let table, pc;

async function setOut(dice) {
  control.interpretation = { moveId: "undertake_an_expedition", moveName: "Undertake an Expedition", statUsed: "wits",
    adds: 0, rationale: "test", mischiefApplied: false, moveTarget: "the Ashen Reach" };
  control.dice = dice;
  await table.client("pl-1").chat("We set out for the Ashen Reach.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

/** Every string anywhere in a value. */
function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

beforeAll(async () => { table = await bootTable(); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { pc = await resetTable(table); });

describe("PIPE-02 — a held move card does not hand a hidden plan's oracle rolls to the players", () => {
  it("control: the expedition began, and a result that is not held carries no plan rolls on its card", async () => {
    const card = await setOut(STRONG);
    expect(table.cards(f => f.expeditionProgressCard && f.created)).toHaveLength(1);
    const seen = await table.client("pl-1").run(() => game.messages.get(card._id)?.flags?.[MODULE_ID] ?? null);
    expect(seen.awaitingUpgrade).toBeUndefined();
    expect(strings(seen).filter(s => /What waits at the end|A waypoint — Space Sighting/.test(s))).toEqual([]);
  });

  it("the player's client reads none of the expedition plan's oracle rolls off the held card", async () => {
    const card = await setOut(WEAK);
    // Setup: the result is held, and the expedition it began asked for a plan.
    const onGm = table.world.message(card._id).flags[MODULE_ID];
    expect(onGm.awaitingUpgrade?.open).toBe(true);
    expect(table.cards(f => f.expeditionProgressCard && f.created)).toHaveLength(1);

    // What pl-1's own client holds for that card — flags and all.
    const seen = await table.client("pl-1").run(() => game.messages.get(card._id)?.flags?.[MODULE_ID] ?? null);
    expect(seen, "the player sees the held card (setup)").toBeTruthy();
    const planRolls = strings(seen).filter(s => /What waits at the end — Action \+ Theme|A waypoint — Space Sighting/.test(s));
    expect(planRolls).toEqual([]);
  });

  // The same content, the same way, in a Batch Mode round: what the roll hands the round to keep until its
  // narration (driver.js rollEntry → markRolled({ narrationInput: narrationInputFrom(resolution, relevance) }))
  // is stored on the `batchMode.round` WORLD setting, which every client reads.
  it("what a rolled round entry keeps on the round (a world setting) carries none of them either", async () => {
    expect(staticSettingScope(MODULE_ID, "batchMode.round")).toBe("world");   // control: where the round lives
    const card = await setOut(WEAK);
    const resolution = table.world.message(card._id).flags[MODULE_ID].awaitingUpgrade.resolution;
    const kept = narrationInputFrom(resolution, null);
    expect(kept.moveId).toBe("undertake_an_expedition");                      // control: the entry's own move is kept
    expect(strings(kept).filter(s => /What waits at the end — Action \+ Theme|A waypoint — Space Sighting/.test(s))).toEqual([]);
  });
});
