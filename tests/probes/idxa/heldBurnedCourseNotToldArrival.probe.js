/**
 * PROBE — IDXA-01 · HELD-UPGRADE-NARRATION-NOT-TOLD-ARRIVAL
 *
 * Scenario (free-flow, "Ask before paying and narrating" on — the default):
 * Kira sets a course for Bleakhold and rolls a weak hit; her momentum beats both
 * challenge dice, so the card offers Burn Momentum and the result is HELD
 * (issue #354 P2-10): nothing is narrated yet. She burns momentum — a strong
 * hit. The burned result's narration is "the move's one narration"
 * (decisions.md → Issue #354, P2-10).
 *
 * Correct: that one narration is told what every narration of an arrival is
 * told (issue #348 PT08, index.js applyOutcomeEffects: "On the MOVE OUTCOME
 * every narration of this resolution reads — the pipeline's, a round's, an
 * upgrade's re-narration"): "[ARRIVAL: The ship has ARRIVED at Bleakhold. Open
 * the scene there — not on the departure or the journey. …]".
 *
 * Today: the ARRIVAL line is appended to the ROLLED resolution only — it sits
 * on the card's `awaitingUpgrade.resolution` and Keep narrates with it — while
 * the burned resolution is built fresh (burnMomentum.js buildBurnedResolution)
 * and applyOutcomeEffects adds no arrival for an upgrade whose original was
 * already a hit (`arrives` needs `against.outcome === "miss"`).
 * heldResult.js narrateHeldUpgrade copies the player's line from the held
 * resolution and nothing else, so the only narration the table ever reads is
 * given neither "ARRIVED" nor the place — the PT08 failure (the crew narrated
 * as still under way) for the one path where no earlier narration exists.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
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
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const REPLY = 'The docking clamps close around the hull.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const WEAK = [0.25, 0.65, 0.5];    // challenge 3, 7; action 4 + supply 3 = 7: a weak hit. Momentum 9 burns it to a strong hit.
const BURN = '[data-action="sf-burn-momentum"]';
const KEEP = '[data-action="sf-keep-result"]';

let table;

const settlement = (id, name) => table.addActor({
  id, type: "location", name,
  flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: `rec-${id}`, name, sectorId: "sec-1" } } },
});
const flags      = (id) => table.world.message(id).flags[MODULE_ID];
const narrations = () => table.cards(f => f.narratorCard && f.resolutionId);
const narrationCalls = () => table.claude.calls.filter(c => /SIDECAR|NARRATOR ROLE/.test(c.system ?? ""));

async function seat() {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: "sess-1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [],
      sectors: [{ id: "sec-1", name: "Outlands Mark", region: "outlands", sceneId: null, mapData: { settlements: [], discoveries: [] } }],
      activeSectorId: "sec-1",
      settlementIds: ["actor-port", "actor-bleak"], shipIds: [],
      currentLocationId: "actor-port", currentLocationType: "settlement",
    },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  // Momentum 9: a weak hit against 3 and 7 can be burned to a strong hit — so its card offers the burn and is held.
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 9, max: 10, min: -6, resetValue: 2 }, supply: 3 } });
  settlement("actor-port", "Port Vigil");
  settlement("actor-bleak", "Bleakhold");
  scriptClaude(table, { fallback: () => REPLY });
}

/** Kira sets a course for Bleakhold: a weak hit her momentum could burn. Returns the (held) move card. */
async function setACourseWeakHit() {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false,
    moveId: "set_a_course", moveName: "Set A Course", statUsed: "supply", moveTarget: "Bleakhold" };
  control.dice = WEAK;
  await table.client("pl-1").chat("We plot the jump to Bleakhold and hold the course.", { speaker: { actor: "pc-kira" } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(() => seat());

describe("IDXA-01 — a held Set a Course, burned: its one narration is told the ship arrived", () => {
  it("control: the weak hit is held — nothing narrated — and its card carries the arrival for the narration to come", async () => {
    const card = await setACourseWeakHit();
    const f = flags(card._id);
    expect(f.awaitingUpgrade).toMatchObject({ open: true, resolution: { moveId: "set_a_course", outcome: "weak_hit" } });
    expect(f.burn).toMatchObject({ canBurn: true, originalApplied: true });
    expect(f.awaitingUpgrade.resolution.loremasterContext).toContain("The ship has ARRIVED at Bleakhold");
    expect(narrations()).toEqual([]);
    expect(narrationCalls()).toEqual([]);
  }, 30_000);

  it("control: Keep the result — the one narration is told the ship has ARRIVED at Bleakhold", async () => {
    const card = await setACourseWeakHit();
    await click(card, KEEP);
    expect(narrations()).toHaveLength(1);
    expect(narrationCalls()).toHaveLength(1);
    expect(narrationCalls()[0].userText).toMatch(/ARRIVED at Bleakhold\..*a cost or a complication/);
  }, 30_000);

  it("Burn Momentum — the burned result's narration, the move's only one, is told the ship has ARRIVED at Bleakhold", async () => {
    const card = await setACourseWeakHit();
    await click(card, BURN);

    // The burn landed and its narration is the move's one narration (setup).
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "burn" });
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("strong_hit");
    expect(narrationCalls()).toHaveLength(1);
    const call = narrationCalls()[0];
    expect(call.userText).toContain("We plot the jump to Bleakhold and hold the course.");

    // The finding: the narrator is not told the ship arrived, nor where.
    expect(call.userText).toContain("The ship has ARRIVED at Bleakhold");
  }, 30_000);
});
