/**
 * PIPE-03 · HELD-UPGRADE-NARRATION-LOSES-ROLL-CONTEXT
 *
 * Scenario: free-flow, default settings. Kira's Undertake an Expedition to a
 * new destination rolls a weak hit that momentum can burn to a strong hit: the
 * result is held. The roll began the expedition's track, and asked this move's
 * narration to decide the expedition's hidden plan (resolution.skeletonRequests
 * → the narrator's DECIDE NOW; issue #353 Phase 3). She burns momentum.
 *
 * Correct: the burned result is "the move's one narration" (heldResult.js
 * narrateHeldUpgrade; decisions.md → Issue #354 P2-10). It is the only
 * narration this expedition's beginning ever gets, so it carries what the roll
 * recorded for its narration — the plan to decide — exactly as the narration
 * of the same result KEPT does.
 *
 * Today: narrateHeldUpgrade copies only `playerNarration` / `inputMethod` from
 * the held resolution onto the upgraded one (buildBurnedResolution:
 * `oracleSeeds: null`, no `skeletonRequests`). The one narration is asked to
 * decide nothing, no plan is ever filed for the expedition, and nothing asks
 * again: the expedition runs to its end with no plan (no waypoints, no danger,
 * nothing waiting at the end under UNREVEALED).
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

import { bootTable, resetTable, click, narratorCalls, MODULE_ID, WEAK, BURN, KEEP } from "./_heldTable.js";

let table, pc;

async function setOutHeld() {
  control.interpretation = { moveId: "undertake_an_expedition", moveName: "Undertake an Expedition", statUsed: "wits",
    adds: 0, rationale: "test", mischiefApplied: false, moveTarget: "the Ashen Reach" };
  control.dice = WEAK;
  await table.client("pl-1").chat("We set out for the Ashen Reach.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  const held = table.world.message(card._id).flags[MODULE_ID].awaitingUpgrade;
  // Setup, both cases: the result is held, un-narrated, and its roll asked for the expedition's plan.
  expect(held?.open).toBe(true);
  expect(held.resolution.skeletonRequests).toEqual([expect.objectContaining({ kind: "expedition", label: "the expedition to the Ashen Reach" })]);
  expect(narratorCalls(table)).toEqual([]);
  return card;
}

beforeAll(async () => { table = await bootTable(); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { pc = await resetTable(table); });

/** A held Set a Course weak hit, to a destination its pin's Actor names (so it stays Set a Course). */
async function setCourseHeld() {
  control.interpretation = { moveId: "set_a_course", moveName: "Set a Course", statUsed: "wits",
    adds: 0, rationale: "test", mischiefApplied: false, moveTarget: "Bleakhold", moveTargetId: "pin-bleakhold" };
  control.dice = WEAK;
  await table.client("pl-1").chat("We set a course for Bleakhold.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  const held = table.world.message(card._id).flags[MODULE_ID].awaitingUpgrade;
  // Setup, both cases: held, un-narrated, and the roll's MOVE OUTCOME says the ship arrived (issue #348 PT08).
  expect(held?.open).toBe(true);
  expect(held.resolution.moveId).toBe("set_a_course");
  expect(held.resolution.loremasterContext).toContain("[ARRIVAL: The ship has ARRIVED at Bleakhold.");
  expect(narratorCalls(table)).toEqual([]);
  return card;
}

describe("PIPE-03 — a held result's one narration decides the plan its roll asked for, kept or burned", () => {
  it("control: KEPT, the move's narration is asked to decide the expedition's plan (DECIDE NOW)", async () => {
    const card = await setOutHeld();
    await click(table, card, KEEP);
    expect(narratorCalls(table)).toHaveLength(1);
    const call = narratorCalls(table)[0];
    expect(call.system).toContain("### DECIDE NOW");
    expect(call.system).toContain("the expedition to the Ashen Reach");
  });

  it("BURNED, the move's one narration is still asked to decide the expedition's plan", async () => {
    const card = await setOutHeld();
    await click(table, card, BURN);

    // Setup: the burn applied, and its narration is the move's only one.
    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(table.world.message(card._id).flags[MODULE_ID].awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "burn" });
    expect(narratorCalls(table)).toHaveLength(1);
    const call = narratorCalls(table)[0];
    expect(call.userText).toContain("We set out for the Ashen Reach.");

    expect(call.system.includes("### DECIDE NOW"), "the burned result's narration is asked to decide a plan (DECIDE NOW)").toBe(true);
    expect(call.system.includes("the expedition to the Ashen Reach"), "…the expedition's").toBe(true);
  });
});

describe("PIPE-03 — …and is told the ship arrived, kept or burned (issue #348 PT08: every narration of the resolution reads it)", () => {
  it("control: a held Set a Course weak hit KEPT — its narration is told the ship has ARRIVED at Bleakhold", async () => {
    const card = await setCourseHeld();
    await click(table, card, KEEP);
    expect(narratorCalls(table)).toHaveLength(1);
    const call = narratorCalls(table)[0];
    expect(`${call.system}\n${call.userText}`).toContain("The ship has ARRIVED at Bleakhold.");
  });

  it("the same weak hit BURNED to a strong hit — its one narration is still told the ship has ARRIVED", async () => {
    const card = await setCourseHeld();
    await click(table, card, BURN);
    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(narratorCalls(table)).toHaveLength(1);
    const call = narratorCalls(table)[0];
    expect(call.userText).toContain("We set a course for Bleakhold.");
    expect(`${call.system}\n${call.userText}`.includes("The ship has ARRIVED at Bleakhold."),
      "the burned Set a Course's one narration is told the ship arrived").toBe(true);
  });
});
