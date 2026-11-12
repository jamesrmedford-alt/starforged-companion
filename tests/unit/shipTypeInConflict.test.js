/**
 * STARFORGED COMPANION
 * tests/unit/shipTypeInConflict.test.js
 *
 * SHIP-TYPE-IN-CONFLICT: Starship Type is an encounter table — its 95–100
 * "Ships in conflict (roll twice)" is two ships met fighting. A new ship whose
 * type rolled it got "Ships in conflict: A / B" as its single type. One ship's
 * type (the ship seed, a detected ship's draft Confirm) now rolls that row
 * again.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// The real roller, with Starship Type's d100 scripted: 97 ("Ships in
// conflict") first, then 30 (Hauler).
const control = vi.hoisted(() => ({ typeRolls: [], calls: 0 }));
vi.mock("../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return {
    ...real,
    rollOracle: vi.fn((tableId, options = {}) => {
      if (tableId !== "starship_type") return real.rollOracle(tableId, options);
      const roll = control.typeRolls[control.calls++] ?? 30;
      return real.rollOracle(tableId, { ...options, roll });
    }),
  };
});
vi.mock("../../src/system/ironswornPacks.js", async (original) => ({
  ...(await original()),
  getCanonicalAsset: vi.fn(async () => null),
}));

import { rollOracle } from "../../src/oracles/roller.js";
import { seedStarshipActor, getShip, rollSingleShipType } from "../../src/entities/ship.js";
import { _resetFolderCache } from "../../src/entities/folder.js";
import { MODULE_ID } from "../helpers/multiClient.js";

beforeEach(() => {
  control.typeRolls = [];
  control.calls = 0;
});

describe("rollSingleShipType", () => {
  it("rolls Ships in conflict again: one ship's type is one ship", () => {
    control.typeRolls = [97, 30];
    expect(rollSingleShipType(rollOracle)).toBe("Hauler — Heavy transport");
    expect(control.calls).toBe(2);
  });

  it("control: any other row is the type, rolled once", () => {
    control.typeRolls = [3];
    expect(rollSingleShipType(rollOracle)).toBe("Corvette — Light attack ship");
    expect(control.calls).toBe(1);
  });

  it("gives up empty rather than looping when every roll is a conflict", () => {
    control.typeRolls = Array(20).fill(100);
    expect(rollSingleShipType(rollOracle)).toBe("");
  });
});

describe("the ship seed", () => {
  beforeEach(() => {
    _resetFolderCache();
    global.game.actors._reset();
    global.game.folders._reset();
    global.game.settings._store.clear();
  });

  it("never seeds a ship whose type is Ships in conflict", async () => {
    control.typeRolls = [97, 30];
    global.game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: [], sectors: [], activeSectorId: null });
    const actor = global.makeTestActor({ type: "starship", name: "Gull" });
    actor.createEmbeddedDocuments = async () => [];
    global.game.actors._set(actor.id, actor);
    await seedStarshipActor(actor, global.game.settings.get(MODULE_ID, "campaignState"));
    const ship = getShip(actor.id);
    expect(ship.type).toBe("Hauler — Heavy transport");
    expect(ship.type).not.toMatch(/conflict/i);
  });
});
