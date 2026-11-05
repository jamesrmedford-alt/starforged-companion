/**
 * STARFORGED COMPANION
 * tests/unit/shipMapSceneIdRetired.test.js
 *
 * Issue #331 X50 (SHIPMAP-SCENEID-DEAD-WRITE). generateShipMapForActor wrote
 * `ship.shipMapSceneId` onto the ship record ("for fast lookup / navigation";
 * the field was in ShipSchema) and nothing read it — findShipMapScene finds
 * the deck-plan Scene by its own flags. An orphaned write
 * (rules/reachability.md §2): the field and its write are retired.
 */

import { describe, it, expect } from "vitest";
import { ShipSchema } from "../../src/entities/ship.js";
import { productionSources } from "../helpers/sourceScan.js";

describe("X50 — the deck-plan Scene is not mirrored onto the ship record", () => {
  it("ShipSchema has no shipMapSceneId", () => {
    expect(Object.prototype.hasOwnProperty.call(ShipSchema, "shipMapSceneId")).toBe(false);
  });

  it("no production code reads or writes it (comments aside)", () => {
    const uses = productionSources()
      .filter(s => /shipMapSceneId/.test(s.code))
      .map(s => s.file);
    expect(uses).toEqual([]);
  });
});
