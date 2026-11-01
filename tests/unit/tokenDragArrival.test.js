/**
 * STARFORGED COMPANION
 * tests/unit/tokenDragArrival.test.js
 *
 * Dropping the ship's token on a sector settlement pin arrives at THAT
 * settlement (issue #321 U52), through the real move pipeline.
 *
 * The drop posts a forced Set a Course naming the pin's settlement Actor —
 * its current name as forcedMoveTarget and its id as forcedMoveTargetId
 * (sectorSceneHooks.js dispatchSetACourseFromTokenDrag). On a hit the
 * pipeline's arrival used to resolve the ship position and the current
 * location by the NAME only: a namesake in another sector (generated
 * settlement names repeat) won, and the id the drop carried was never read.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const STRONG_HIT = [0.05, 0.05, 0.99];   // challenge 1, 1; action die 6 — supply 3 + 6 beats both

let table, pc, ship;

function settlementActor(id, name, sectorId) {
  return table.addActor({
    id, type: "location", name,
    system: { subtype: "settlement", klass: "orbital" },
    flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: `rec-${id}`, name, sectorId } } },
  });
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: "drag-s1", sessionNumber: 1,
      currentSceneId: "drag-scene", sceneTruths: [], clocks: [],
      sectors: [{ id: "sec-old", name: "Old Reach" }, { id: "sec-new", name: "New Reach" }],
      activeSectorId: "sec-new",
      // The older sector's namesake comes first, as it would in a long campaign.
      settlementIds: ["actor-old-bleak", "actor-new-bleak"],
      shipIds: ["ship-cv"],
    },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  ship = table.addActor({
    id: "ship-cv", type: "starship", name: "Wayfarer",
    flags: { [MODULE_ID]: { entityType: "ship", ship: { _id: "rec-ship", name: "Wayfarer", isCommandVehicle: true } } },
  });
  settlementActor("actor-old-bleak", "Bleakhold", "sec-old");
  settlementActor("actor-new-bleak", "Bleakhold", "sec-new");   // the pin the ship is dropped on
  scriptClaude(table, { fallback: () => 'You arrive.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("a Set a Course started by dropping the ship on a sector pin", () => {
  it("arrives at the pin's settlement — the ship's position and the current location — not a namesake", async () => {
    control.dice = STRONG_HIT;
    // The message dispatchSetACourseFromTokenDrag posts for that pin.
    await table.client("gm-1").chat("I set a course for Bleakhold.", {
      speaker: { actor: pc.id },
      flags: { [MODULE_ID]: {
        bypassPacing: true, forcedMoveId: "set_a_course",
        forcedMoveTarget: "Bleakhold", forcedMoveTargetId: "actor-new-bleak",
        tokenDragSetCourse: { sceneId: "scene-gone", tokenId: "tok-1", destX: 300, destY: 200 },
      } },
    });
    await table.settle(); await table.drain();

    const position = ship.flags[MODULE_ID].ship.position;
    expect(position?.nearestSettlementId).toBe("actor-new-bleak");
    expect(position?.sectorId).toBe("sec-new");

    const state = table.world.campaignState();
    expect(state.currentLocationId).toBe("actor-new-bleak");
    expect(state.currentLocationType).toBe("settlement");
  });
});
