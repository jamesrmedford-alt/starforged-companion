/**
 * STARFORGED COMPANION
 * tests/unit/entityPanelCurrentLocation.test.js
 *
 * Issue #321 U56 — "Set as current location" moves the ship the way `!at`
 * does. "Where the party is" lives in two stores the narrator reads side by
 * side: campaignState.currentLocationId / currentLocationType (the
 * current-location card) and the command vehicle's ship-record `position`
 * (the SHIP POSITION line). `!at <name>` writes both (index.js
 * handleAtCommand → maybeUpdateShipPositionFromName); the Entities panel's
 * button — the GUI twin of `!at` — wrote only currentLocationId / Type, so
 * after a click the narrator was told the party is at Bleakhold while SHIP
 * POSITION still said Firstlight. The button now runs the same ship update,
 * with the place resolved by its id.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

const MODULE_ID = "starforged-companion";
const CS_KEY    = `${MODULE_ID}.campaignState`;

let EntityPanelApp;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  ({ EntityPanelApp } = await import("../../src/ui/entityPanel.js"));
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

const click = (journalId) => EntityPanelApp.DEFAULT_OPTIONS.actions.setCurrentLocation.call(
  { render() {}, element: null }, {}, { dataset: { journalId, type: "settlement" } },
);
const shipPosition = () => game.actors.get("actor-ship").getFlag(MODULE_ID, "ship").position;

describe("Entity Panel — Set as current location moves the ship, as `!at` does (issue #321 U56)", () => {
  it("moves the command vehicle's position along with currentLocationId, as `!at Bleakhold` does", async () => {
    await click("actor-bleak");
    expect(game.settings.get(MODULE_ID, "campaignState").currentLocationId).toBe("actor-bleak");
    expect(shipPosition()).toMatchObject({ nearestSettlementId: "actor-bleak", updatedBy: "at_command" });
  });

  it("clearing the current location (a second click) leaves the ship where it is, like a bare `!at`", async () => {
    await click("actor-bleak");
    await click("actor-bleak");
    expect(game.settings.get(MODULE_ID, "campaignState").currentLocationId).toBeNull();
    expect(shipPosition().nearestSettlementId).toBe("actor-bleak");
  });

  it("the place is the one clicked, by its id — not another settlement with the same name", async () => {
    settlementActor("actor-bleak-2", "Bleakhold");
    const cs = game.settings._store.get(CS_KEY);
    game.settings._store.set(CS_KEY, { ...cs, settlementIds: [...cs.settlementIds, "actor-bleak-2"] });
    await click("actor-bleak-2");
    expect(shipPosition().nearestSettlementId).toBe("actor-bleak-2");
  });

  it("control: with ship positioning off, only the current location changes", async () => {
    game.settings._store.set(`${MODULE_ID}.factContinuity.shipPositioning`, false);
    try {
      await click("actor-bleak");
    } finally {
      game.settings._store.delete(`${MODULE_ID}.factContinuity.shipPositioning`);
    }
    expect(game.settings.get(MODULE_ID, "campaignState").currentLocationId).toBe("actor-bleak");
    expect(shipPosition().nearestSettlementId).toBe("actor-first");
  });
});
