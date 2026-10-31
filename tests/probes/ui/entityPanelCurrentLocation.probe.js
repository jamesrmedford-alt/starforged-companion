/**
 * PROBE (ui audit) — PANEL-LOCATION-SHIP-DRIFT
 *
 * "Where the party is" lives in two stores the narrator reads side by side:
 * campaignState.currentLocationId/Type (the current-location card) and the
 * command vehicle's ship-record `position` (the SHIP POSITION line). `!at
 * <name>` writes both (index.js handleAtCommand → maybeUpdateShipPositionFromName,
 * "treat the GM's `!at` as 'the party (and their ship) is here'"), and since
 * LOCATION-DUAL-STORE the move arrival block writes both too. The Entity
 * Panel's "Set as current location" button — the GUI twin of `!at` — writes
 * only currentLocationId/Type, so after a click the narrator is told the
 * party is at Bleakhold while SHIP POSITION still says Firstlight.
 *
 * Asserts the CORRECT behaviour (the panel button moves the ship position
 * like `!at` does), so it FAILS today.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

const MODULE_ID = "starforged-companion";
const CS_KEY    = `${MODULE_ID}.campaignState`;

let EntityPanelApp;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  ({ EntityPanelApp } = await import("../../../src/ui/entityPanel.js"));
});

function settlementActor(id, name) {
  const actor = makeTestActor({
    id, type: "location", name,
    flags: { [MODULE_ID]: { entityType: "settlement", settlement: { _id: `rec-${id}`, name } } },
  });
  game.actors._set(id, actor);
  return actor;
}

beforeEach(() => {
  game.actors._reset();
  settlementActor("actor-first", "Firstlight");
  settlementActor("actor-bleak", "Bleakhold");
  const ship = makeTestActor({
    id: "actor-ship", type: "starship", name: "Wayfinder",
    flags: { [MODULE_ID]: { entityType: "ship", ship: {
      _id: "rec-ship", name: "Wayfinder", isCommandVehicle: true,
      position: { nearestSettlementId: "actor-first", nearestPlanetId: null, sectorId: null, freeText: "", updatedBy: "at_command" },
    } } },
  });
  game.actors._set(ship.id, ship);
  game.settings._store.set(CS_KEY, {
    shipIds:             ["actor-ship"],
    settlementIds:       ["actor-first", "actor-bleak"],
    currentLocationId:   "actor-first",
    currentLocationType: "settlement",
  });
});

afterEach(() => {
  game.actors._reset();
  game.settings._store.delete(CS_KEY);
});

describe("Entity Panel — Set as current location (PANEL-LOCATION-SHIP-DRIFT)", () => {
  it("moves the command vehicle's position along with currentLocationId, as `!at Bleakhold` does", async () => {
    const app = { render() {}, element: null };
    await EntityPanelApp.DEFAULT_OPTIONS.actions.setCurrentLocation.call(
      app, {}, { dataset: { journalId: "actor-bleak", type: "settlement" } },
    );

    const cs = game.settings.get(MODULE_ID, "campaignState");
    expect(cs.currentLocationId).toBe("actor-bleak");            // passes — the one store the panel writes

    const position = game.actors.get("actor-ship").getFlag(MODULE_ID, "ship").position;
    // Today: still Firstlight — the narrator gets "current location: Bleakhold"
    // beside "SHIP POSITION: Wayfinder docked at Firstlight".
    expect(position.nearestSettlementId).toBe("actor-bleak");
  });
});
