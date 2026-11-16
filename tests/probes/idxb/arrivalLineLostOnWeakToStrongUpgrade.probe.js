/**
 * PROBE — IDXB-01 · ARRIVAL-LINE-LOST-ON-WEAK-TO-STRONG-UPGRADE (INCOMPLETE-FIX of issue #348 PT08)
 *
 * Scenario: Kira sets a course for Bleakhold and rolls a WEAK hit her momentum
 * can burn to a strong hit. The pipeline's applyOutcomeEffects arrives at once
 * (position, token, current location) and appends the narrator's ARRIVAL line
 * to the weak hit's resolution. She then burns momentum.
 *
 * Correct (PT08's own record: "Every narration of the resolution reads it: the
 * pipeline's, a Batch round's and an upgrade's re-narration"): the burned
 * strong hit's narration is told "[ARRIVAL: The ship has ARRIVED at Bleakhold.
 * Open the scene there …]".
 *
 * Today: the burned resolution is built fresh (burnMomentum.js
 * buildBurnedResolution → buildLoremasterContext) and applyOutcomeEffects
 * appends the line only when the upgrade itself `arrives` — an upgrade from a
 * MISS. From a weak hit the ship has already arrived, so nothing is appended:
 * the narrator gets "Arrived, situation favors you. Take +1 momentum." with no
 * place — the exact prompt PT08 was filed for (narrated as the crew setting
 * off). With results held for the choice (issue #354 P2-10, default on) that
 * is the move's ONE narration.
 *
 * On a booted table, as tests/unit/setACourseArrival.test.js and
 * tests/unit/heldResultBeforePrice.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

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
const GRID = 100;
const PORT_XY  = { x: 2 * GRID, y: 2 * GRID };
const BLEAK_XY = { x: 9 * GRID, y: 4 * GRID };
const WEAK = [0.25, 0.65, 0.5];    // challenge 3, 7; action 4 + supply 3 = 7: a weak hit (momentum 9 burns it to a strong hit)
const BURN = '[data-action="sf-burn-momentum"]';
const KEEP = '[data-action="sf-keep-result"]';

let table, token;

const settlement = (id, name) => table.addActor({
  id, type: "location", name,
  flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: `rec-${id}`, name, sectorId: "sec-1" } } },
});
function pin(id, xy, text, flags) {
  return { id, x: xy.x, y: xy.y, text, flags: { [MODULE_ID]: { sectorNote: true, ...flags } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }) };
}

async function seat({ momentum = 9, settings = {} } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, ...settings,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: "sess-1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [],
      sectors: [{ id: "sec-1", name: "Outlands Mark", region: "outlands", sceneId: "scene-1", mapData: { settlements: [], discoveries: [] } }],
      activeSectorId: "sec-1",
      settlementIds: ["actor-port", "actor-bleak"], shipIds: ["ship-cv"],
      currentLocationId: "actor-port", currentLocationType: "settlement",
    },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: momentum, max: 10, min: -6, resetValue: 2 }, supply: 3 } });
  table.addActor({
    id: "ship-cv", type: "starship", name: "Wayfinder",
    flags: { [MODULE_ID]: { entityType: "ship", ship: {
      _id: "rec-ship", name: "Wayfinder", isCommandVehicle: true,
      position: { sectorId: "sec-1", nearestSettlementId: "actor-port", nearestPlanetId: null, nearestLocationId: null,
        freeText: "", updatedAt: 1, updatedBy: "set_a_course", narrationId: null, previous: null, tokenBefore: null },
    } } },
  });
  settlement("actor-port", "Port Vigil");
  settlement("actor-bleak", "Bleakhold");
  token = { id: "tok-ship", x: PORT_XY.x, y: PORT_XY.y, flags: { [MODULE_ID]: { commandVehicle: true } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }) };
  table.scenes.set("scene-1", {
    id: "scene-1", grid: { size: GRID },
    flags: { [MODULE_ID]: { sectorScene: true, sectorId: "sec-1" } },
    notes: { contents: [
      pin("note-port", PORT_XY, "Port Vigil", { settlementId: "gen-P", actorId: "actor-port", locationType: "orbital" }),
      pin("note-bleak", BLEAK_XY, "Bleakhold", { settlementId: "gen-B", actorId: "actor-bleak", locationType: "orbital" }),
    ] },
    drawings: { contents: [] },
    tokens: { contents: [token] },
  });
  scriptClaude(table, { fallback: () => REPLY });
}

async function setACourseWeak() {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false,
    moveId: "set_a_course", moveName: "Set A Course", statUsed: "supply", moveTarget: "Bleakhold" };
  control.dice = WEAK;
  await table.client("pl-1").chat("We plot the jump and hold the course for Bleakhold.", { speaker: { actor: "pc-kira" } });
  await table.settle();
  await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle();
  await table.drain();
}

const narratorCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME|Narrate the consequence/.test(`${c.system}\n${c.userText}`));
const lastCallText  = () => { const c = narratorCalls().at(-1); return c ? `${c.system}\n${c.userText}` : ""; };
const narrations    = () => table.cards(f => f.narratorCard && f.resolutionId);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => { table?.scenes.delete("scene-1"); table?.teardown(); });

describe("IDXB-01 — a Set a Course weak hit upgraded to a strong hit is still narrated as an arrival, at its place", () => {
  it("control: a weak hit that offers no burn is narrated at once, told the ship ARRIVED at Bleakhold", async () => {
    await seat({ momentum: 2 });
    const card = await setACourseWeak();
    expect(card.flags[MODULE_ID].moveResolution).toBe(true);
    expect(card.flags[MODULE_ID].awaitingUpgrade).toBeUndefined();
    expect(narrations()).toHaveLength(1);
    expect(lastCallText()).toContain("[ARRIVAL: The ship has ARRIVED at Bleakhold. Open the scene there");
  }, 30_000);

  it("control: a held weak hit that is KEPT is narrated with the ARRIVAL line (the held resolution carries it)", async () => {
    await seat({ momentum: 9 });
    const card = await setACourseWeak();
    // The ship arrived at the roll, and the result waits for Burn / Keep.
    expect(card.flags[MODULE_ID].awaitingUpgrade).toMatchObject({ open: true, resolution: { outcome: "weak_hit" } });
    expect(card.flags[MODULE_ID].burn).toMatchObject({ canBurn: true, originalOutcome: "weak_hit", previewOutcome: "strong_hit" });
    expect({ x: token.x, y: token.y }).toEqual(BLEAK_XY);
    expect(narrations()).toEqual([]);

    await click(card, KEEP);
    expect(narrations()).toHaveLength(1);
    expect(lastCallText()).toContain("[ARRIVAL: The ship has ARRIVED at Bleakhold. Open the scene there");
  }, 30_000);

  it("a held weak hit BURNED to a strong hit: its one narration is told the ship ARRIVED at Bleakhold", async () => {
    await seat({ momentum: 9 });
    const card = await setACourseWeak();
    expect(card.flags[MODULE_ID].awaitingUpgrade).toMatchObject({ open: true });
    expect(narrations()).toEqual([]);

    await click(card, BURN);

    // The burn landed and the strong hit was narrated — once.
    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("strong_hit");
    const text = lastCallText();
    expect(text).toMatch(/Arrived, situation favors you/);   // the strong hit's own consequence line is there …
    // … and so must the arrival line be (PT08): fails today — no "[ARRIVAL: …]" and no place.
    expect(text).toContain("[ARRIVAL: The ship has ARRIVED at Bleakhold. Open the scene there");
    expect(text).toMatch(/The arrival favours the crew/);
  }, 30_000);

  it("with holding off: the burn's RE-narration of the strong hit is told the ship ARRIVED at Bleakhold", async () => {
    await seat({ momentum: 9, settings: { holdResultForUpgrade: false } });
    const card = await setACourseWeak();
    expect(card.flags[MODULE_ID].awaitingUpgrade).toBeUndefined();
    expect(narrations()).toHaveLength(1);   // the weak hit, narrated at once (with its ARRIVAL line)
    expect(lastCallText()).toContain("[ARRIVAL: The ship has ARRIVED at Bleakhold.");

    await click(card, BURN);

    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    const text = lastCallText();
    expect(text).toMatch(/Arrived, situation favors you/);
    // Fails today: the superseded weak-hit narration is struck and retracted, and its replacement is told no place.
    expect(text).toContain("[ARRIVAL: The ship has ARRIVED at Bleakhold. Open the scene there");
  }, 30_000);
});
