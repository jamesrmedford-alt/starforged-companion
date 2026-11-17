/**
 * tests/unit/courseCardTokenReason.test.js
 *
 * The Set a Course card says the real reason its token did not move (issue
 * #362 AC53, COURSE-CARD-BLAMES-A-MISSING-PIN; issue #348 PT09's card).
 *
 * A Set a Course strong hit arrives at Bleakhold, a settlement that HAS a pin
 * on the sector map. The ship's position is written, but its token does not
 * move — because the map has no command-vehicle token on it (the GM never
 * placed one, or deleted it), or the "ship token" setting is off. The card
 * had one sentence for every "position written, token not moved" case — "no
 * sector-map pin marks it, so its token did not move" — whatever the reason
 * (sectorSceneHooks.planTokenSync returned null for no token, the token
 * setting off, no scene and no anchor alike). The sync now reports why
 * (`report.tokenStayed`), and the card says it; a pin that is truly missing
 * still says so (setACourseArrival.test.js, PT09).
 *
 * On a booted table, as tests/unit/setACourseArrival.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
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
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { syncCommandVehicleTokenToPosition } from "../../src/sectors/sectorSceneHooks.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

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

async function seat({ withToken, tokenSetting = true }) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    ...(tokenSetting ? {} : { "factContinuity.shipTokenEnabled": false }),
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

describe("the Set a Course card's reason when the token did not move (issue #362 AC53)", () => {
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
    // It said "The ship's position is now Bleakhold; no sector-map pin marks it, so its token did not move."
    expect(card.content).not.toMatch(/no sector-map pin marks it/);
    expect(card.content).toContain("The ship's position is now <strong>Bleakhold</strong>; its sector-map token did not move — there is no ship token on the sector map.");
  }, 30_000);

  it("the ship token setting off: the card says so — not that no pin marks the place", async () => {
    await seat({ withToken: true, tokenSetting: false });
    const card = await setACourseForBleakhold();
    expect(shipPosition().nearestSettlementId).toBe("actor-bleak");
    expect({ x: token.x, y: token.y }).toEqual(PORT_XY);
    expect(card.content).not.toMatch(/no sector-map pin marks it/);
    expect(card.content).toContain("its sector-map token did not move — the ship token is turned off in the settings.");
  }, 30_000);
});

describe("the token sync's report — why it moved nothing (issue #362 AC53)", () => {
  const at = (over) => ({ sectorId: "sec-1", nearestSettlementId: "actor-bleak", nearestPlanetId: null, nearestLocationId: null, freeText: "", ...over });
  const why = async (position) => {
    const report = {};
    const moved = await table.client("gm-1").run(() => syncCommandVehicleTokenToPosition(position, table.world.campaignState(), { report }));
    return { moved: !!moved, why: report.tokenStayed ?? null };
  };

  it("a pin that is not on the map, a record naming no pin's place, and no map scene each name their own reason", async () => {
    await seat({ withToken: true });
    expect(await why(at({ nearestSettlementId: "actor-elsewhere" }))).toEqual({ moved: false, why: "no-pin" });
    expect(await why(at({ nearestSettlementId: null, freeText: "deep space" }))).toEqual({ moved: false, why: "no-anchor" });
    expect(await why(at({ sectorId: "sec-gone" }))).toEqual({ moved: false, why: "no-scene" });
  }, 30_000);

  it("control: a token it moves (or that already stands there) reports no reason", async () => {
    await seat({ withToken: true });
    expect(await why(at({}))).toEqual({ moved: true, why: null });
    expect({ x: token.x, y: token.y }).toEqual(BLEAK_XY);
    expect(await why(at({}))).toEqual({ moved: true, why: null });
  }, 30_000);
});
