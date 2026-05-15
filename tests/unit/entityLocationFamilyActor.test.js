/**
 * Phase 3 of the Entity → Actor Migration moves Settlement / Planet /
 * Location records onto native foundry-ironsworn `location` Actor documents
 * with `system.subtype` discriminating the three (settlement / planet /
 * arbitrary location-class). These tests pin the schema mapping and the
 * canonical-source-of-truth invariant: the Actor flag payload is the only
 * mutable store; native system fields mirror selected attributes for the
 * system sheet.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createSettlement, getSettlement, listSettlements, updateSettlement } from "../../src/entities/settlement.js";
import { createPlanet,     getPlanet,     listPlanets,     updatePlanet }     from "../../src/entities/planet.js";
import { createLocation,   getLocation,   listLocations,   updateLocation }   from "../../src/entities/location.js";
import { _resetFolderCache } from "../../src/entities/folder.js";

const MODULE = "starforged-companion";

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset();
  _resetFolderCache();
  global.game.settings._reset?.();
  global.game.settings.get = () => ({});
  global.game.settings.set = async () => {};
});

describe("createSettlement", () => {
  it("creates a location-type Actor with system.subtype='settlement'", async () => {
    const state = { settlementIds: [], sectors: [{ id: "sec-1", name: "Sigma Draconis" }], activeSectorId: "sec-1" };
    await createSettlement({ name: "Bleakhold", location: "Planetside", population: "Thousands" }, state);
    const actor = global.game.actors.contents[0];
    expect(actor.type).toBe("location");
    expect(actor.system.subtype).toBe("settlement");
    expect(actor.system.klass).toBe("Planetside");
    expect(actor.flags[MODULE].settlement.name).toBe("Bleakhold");
    expect(actor.flags[MODULE].settlement.sectorId).toBe("sec-1");
    expect(state.settlementIds).toEqual([actor.id]);
  });

  it("lands the actor under Sectors / <Sector Name> / Settlements", async () => {
    const state = { settlementIds: [], sectors: [{ id: "sec-1", name: "Sigma Draconis" }], activeSectorId: "sec-1" };
    await createSettlement({ name: "Bleakhold" }, state);
    const actor   = global.game.actors.contents[0];
    const leaf    = global.game.folders.get(actor.folder);
    expect(leaf?.name).toBe("Settlements");
    expect(leaf?.type).toBe("Actor");
    // Walk parents — should be Sectors / Sigma Draconis / Settlements
    const sectorFolder = global.game.folders.get(leaf.folder);
    expect(sectorFolder?.name).toBe("Sigma Draconis");
    const rootFolder = global.game.folders.get(sectorFolder.folder);
    expect(rootFolder?.name).toBe("Sectors");
  });

  it("falls back to a flat Sectors / Settlements folder when sector isn't found", async () => {
    const state = { settlementIds: [], sectors: [], activeSectorId: null };
    await createSettlement({ name: "Floating" }, state);
    const actor      = global.game.actors.contents[0];
    const leafFolder = global.game.folders.get(actor.folder);
    expect(leafFolder?.name).toBe("Settlements");
    const root = global.game.folders.get(leafFolder.folder);
    expect(root?.name).toBe("Sectors");
  });

  it("updateSettlement mirrors location→system.klass and renames the actor", async () => {
    const state = { settlementIds: [], sectors: [{ id: "s", name: "X" }], activeSectorId: "s" };
    await createSettlement({ name: "Old", location: "Planetside" }, state);
    const id = state.settlementIds[0];
    await updateSettlement(id, { name: "New", location: "Orbital" });
    const actor = global.game.actors.get(id);
    expect(actor.name).toBe("New");
    expect(actor.system.klass).toBe("Orbital");
    expect(getSettlement(id).location).toBe("Orbital");
  });

  it("listSettlements resolves campaignState.settlementIds", async () => {
    const state = { settlementIds: [], sectors: [{ id: "s", name: "X" }], activeSectorId: "s" };
    await createSettlement({ name: "A" }, state);
    await createSettlement({ name: "B" }, state);
    expect(listSettlements(state).map(s => s.name).sort()).toEqual(["A", "B"]);
  });
});

describe("createPlanet", () => {
  it("creates a location-type Actor with system.subtype='planet' and klass=type", async () => {
    const state = { planetIds: [], sectors: [{ id: "s", name: "X" }], activeSectorId: "s" };
    await createPlanet({ name: "Cinderworld", type: "Furnace World" }, state);
    const actor = global.game.actors.contents[0];
    expect(actor.system.subtype).toBe("planet");
    expect(actor.system.klass).toBe("Furnace World");
    expect(actor.flags[MODULE].planet.name).toBe("Cinderworld");
    expect(state.planetIds).toEqual([actor.id]);
  });

  it("lands under Sectors / <Sector Name> / Planets", async () => {
    const state = { planetIds: [], sectors: [{ id: "s", name: "X" }], activeSectorId: "s" };
    await createPlanet({ name: "Cinderworld" }, state);
    const actor = global.game.actors.contents[0];
    const leaf  = global.game.folders.get(actor.folder);
    expect(leaf?.name).toBe("Planets");
  });

  it("getPlanet returns null for an unknown id without throwing", () => {
    expect(getPlanet("nope")).toBeNull();
  });

  it("listPlanets resolves campaignState.planetIds", async () => {
    const state = { planetIds: [], sectors: [{ id: "s", name: "X" }], activeSectorId: "s" };
    await createPlanet({ name: "P1" }, state);
    await createPlanet({ name: "P2" }, state);
    expect(listPlanets(state).map(p => p.name).sort()).toEqual(["P1", "P2"]);
  });
});

describe("createLocation", () => {
  it("creates a location-type Actor with system.subtype=type (derelict/vault/etc.)", async () => {
    const state = { locationIds: [], sectors: [{ id: "s", name: "X" }], activeSectorId: "s" };
    await createLocation({ name: "Glasspike Ruin", type: "vault" }, state);
    const actor = global.game.actors.contents[0];
    expect(actor.system.subtype).toBe("vault");
    expect(actor.system.klass).toBeNull();
    expect(actor.flags[MODULE].location.type).toBe("vault");
  });

  it("defaults system.subtype to 'other' when type is missing", async () => {
    const state = { locationIds: [], sectors: [{ id: "s", name: "X" }], activeSectorId: "s" };
    await createLocation({ name: "Mystery Site" }, state);
    expect(global.game.actors.contents[0].system.subtype).toBe("other");
  });

  it("lands under Sectors / <Sector Name> / Locations", async () => {
    const state = { locationIds: [], sectors: [{ id: "s", name: "X" }], activeSectorId: "s" };
    await createLocation({ name: "Site" }, state);
    const actor = global.game.actors.contents[0];
    const leaf  = global.game.folders.get(actor.folder);
    expect(leaf?.name).toBe("Locations");
  });

  it("listLocations resolves campaignState.locationIds", async () => {
    const state = { locationIds: [], sectors: [{ id: "s", name: "X" }], activeSectorId: "s" };
    await createLocation({ name: "L1" }, state);
    await createLocation({ name: "L2" }, state);
    expect(listLocations(state).map(l => l.name).sort()).toEqual(["L1", "L2"]);
  });
});

describe("Three location-typeKey actors don't shadow each other", () => {
  it("getPlanet / getSettlement / getLocation each only resolve their own flag", async () => {
    const state = { planetIds: [], settlementIds: [], locationIds: [], sectors: [{ id: "s", name: "X" }], activeSectorId: "s" };
    await createPlanet({ name: "P" }, state);
    await createSettlement({ name: "S" }, state);
    await createLocation({ name: "L", type: "derelict" }, state);

    const planetId     = state.planetIds[0];
    const settlementId = state.settlementIds[0];
    const locationId   = state.locationIds[0];

    expect(getPlanet(planetId)?.name).toBe("P");
    expect(getPlanet(settlementId)).toBeNull();
    expect(getPlanet(locationId)).toBeNull();

    expect(getSettlement(settlementId)?.name).toBe("S");
    expect(getSettlement(planetId)).toBeNull();
    expect(getSettlement(locationId)).toBeNull();

    expect(getLocation(locationId)?.name).toBe("L");
    expect(getLocation(planetId)).toBeNull();
    expect(getLocation(settlementId)).toBeNull();
  });
});
