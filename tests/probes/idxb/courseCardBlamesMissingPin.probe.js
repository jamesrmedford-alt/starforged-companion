/**
 * PROBE — IDXB-07 · COURSE-CARD-BLAMES-A-MISSING-PIN (WRONG-DETAIL, cosmetic; issue #348 PT09's card)
 *
 * Scenario: a Set a Course strong hit arrives at Bleakhold, a settlement that
 * HAS a pin on the sector map. The ship's position is written, but its token
 * does not move — because the map has no command-vehicle token on it (the GM
 * never placed one, or deleted it; the same happens with the "ship token"
 * setting off, or for a planet, which anchors no token).
 *
 * Correct (PT09: the card says what happened to the map — "It says 'Token
 * moved to X' only when the token actually moved"): the "Set a Course
 * resolved" card does not give a false reason. It may say the token did not
 * move; it must not say no pin marks the place.
 *
 * Today: index.js postSetACourseFeedbackCard has one sentence for every
 * "position written, token not moved" case — "no sector-map pin marks it, so
 * its token did not move" — whatever the reason
 * (sectorSceneHooks.planTokenSync returns null for no token, the token
 * setting off, no scene and no anchor alike).
 *
 * On a booted table, as tests/unit/setACourseArrival.test.js.
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
const STRONG = [0.15, 0.25, 0.99];   // challenge 2, 3; action 6 + supply: a strong hit

let table, token;

const settlement = (id, name) => table.addActor({
  id, type: "location", name,
  flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: `rec-${id}`, name, sectorId: "sec-1" } } },
});
function pin(id, xy, text, flags) {
  return { id, x: xy.x, y: xy.y, text, flags: { [MODULE_ID]: { sectorNote: true, ...flags } },
    update: vi.fn(async function (patch) { Object.assign(this, patch); }) };
}

async function seat({ withToken }) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
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
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 }, supply: 3 } });
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
    tokens: { contents: withToken ? [token] : [] },
  });
  scriptClaude(table, { fallback: () => REPLY });
}

async function setACourseForBleakhold() {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false,
    moveId: "set_a_course", moveName: "Set A Course", statUsed: "supply", moveTarget: "Bleakhold" };
  control.dice = STRONG;
  await table.client("pl-1").chat("We plot the jump and hold the course.", { speaker: { actor: "pc-kira" } });
  await table.settle();
  await table.drain();
  return table.cards(f => f.setACourseFeedback).at(-1);
}

const shipPosition = () => table.actors.find(a => a.id === "ship-cv").flags[MODULE_ID].ship.position;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => { table?.scenes.delete("scene-1"); table?.teardown(); });

describe("IDXB-07 — the Set a Course card's reason when the token did not move", () => {
  it("control: with the ship's token on the map, it moves onto Bleakhold's pin and the card says so", async () => {
    await seat({ withToken: true });
    const card = await setACourseForBleakhold();
    expect({ x: token.x, y: token.y }).toEqual(BLEAK_XY);
    expect(card.content).toContain("Token moved to <strong>Bleakhold</strong>");
  }, 30_000);

  it("no ship token on the map: the card does not claim that no pin marks a place that has one", async () => {
    await seat({ withToken: false });
    const card = await setACourseForBleakhold();
    // The arrival itself is right: the position names Bleakhold, and the card does not say the token moved.
    expect(shipPosition().nearestSettlementId).toBe("actor-bleak");
    expect(card.content).toContain("Arrived at <strong>Bleakhold</strong>");
    expect(card.content).not.toContain("Token moved");
    // Fails today: "The ship's position is now Bleakhold; no sector-map pin marks it, so its token did not move."
    expect(card.content).not.toMatch(/no sector-map pin marks it/);
  }, 30_000);
});
