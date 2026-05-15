/**
 * Phase 2 of the Entity → Actor Migration moves Ship records onto native
 * foundry-ironsworn `starship` Actor documents. The Actor's
 * system.debility.{battered,cursed} (ImpactField) is the canonical store for
 * those two flags so the system sheet renders them correctly; everything
 * else lives in actor.flags["starforged-companion"].ship.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createShip,
  getShip,
  listShips,
  updateShip,
  sufferDamage,
  repairIntegrity,
  clearBattered,
  ShipSchema,
} from "../../src/entities/ship.js";
import { _resetFolderCache } from "../../src/entities/folder.js";

const MODULE = "starforged-companion";

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset();
  _resetFolderCache();
  global.game.settings._reset?.();
  // Stub settings persistence used by createShip → persistCampaignState.
  global.game.settings.get = () => ({});
  global.game.settings.set = async () => {};
});

describe("createShip — host document & schema mapping", () => {
  it("creates a foundry-ironsworn starship Actor (not a JournalEntry)", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Ironfold" }, state);

    const ships = global.game.actors.filter(a => a.type === "starship");
    expect(ships).toHaveLength(1);
    expect(ships[0].name).toBe("Ironfold");
    expect(state.shipIds).toEqual([ships[0].id]);
  });

  it("writes battered/cursed onto system.debility (native ImpactField)", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Cursed Hull", battered: true, cursed: true }, state);
    const actor = global.game.actors.contents[0];
    expect(actor.system.debility.battered).toBe(true);
    expect(actor.system.debility.cursed).toBe(true);
  });

  it("stores the full Starforged payload on flags[MODULE].ship", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Test", mission: "Smuggle ore", integrity: 4 }, state);
    const actor = global.game.actors.contents[0];
    const ship  = actor.flags[MODULE].ship;
    expect(ship.name).toBe("Test");
    expect(ship.mission).toBe("Smuggle ore");
    expect(ship.integrity).toBe(4);
    // Schema defaults survive on fields the caller didn't supply
    expect(ship.integrityMax).toBe(ShipSchema.integrityMax);
    expect(Array.isArray(ship.generativeTier)).toBe(true);
  });

  it("stamps entityType / entityId on the actor flags as a routing crumb", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Routing" }, state);
    const actor = global.game.actors.contents[0];
    expect(actor.flags[MODULE].entityType).toBe("ship");
    expect(actor.flags[MODULE].entityId).toEqual(actor.flags[MODULE].ship._id);
  });

  it("lands the actor under a 'Starships' Actor folder", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Folded" }, state);
    const actor   = global.game.actors.contents[0];
    const folder  = global.game.folders.find(f => f.id === actor.folder);
    expect(folder?.name).toBe("Starships");
    expect(folder?.type).toBe("Actor");
  });
});

describe("getShip / listShips — reads route through the registry", () => {
  it("returns the payload by actor id", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Lookup" }, state);
    const actorId = state.shipIds[0];
    const ship = getShip(actorId);
    expect(ship?.name).toBe("Lookup");
  });

  it("returns null for unknown ids without throwing", () => {
    expect(getShip("not-a-real-id")).toBeNull();
  });

  it("listShips resolves campaignState.shipIds", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "A" }, state);
    await createShip({ name: "B" }, state);
    const names = listShips(state).map(s => s.name).sort();
    expect(names).toEqual(["A", "B"]);
  });
});

describe("updateShip — mirrors native fields, preserves flag payload", () => {
  it("clamps integrity to [0, integrityMax]", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Clamp", integrity: 5, integrityMax: 5 }, state);
    const id = state.shipIds[0];

    const overshoot = await updateShip(id, { integrity: 99 });
    expect(overshoot.integrity).toBe(5);

    const undershoot = await updateShip(id, { integrity: -3 });
    expect(undershoot.integrity).toBe(0);
  });

  it("refuses to clear the permanent 'cursed' impact", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Forever", cursed: true }, state);
    const id = state.shipIds[0];
    const updated = await updateShip(id, { cursed: false });
    expect(updated.cursed).toBe(true);
    expect(global.game.actors.get(id).system.debility.cursed).toBe(true);
  });

  it("mirrors battered onto system.debility.battered when toggled", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Mirror" }, state);
    const id = state.shipIds[0];
    await updateShip(id, { battered: true });
    expect(global.game.actors.get(id).system.debility.battered).toBe(true);
    await updateShip(id, { battered: false });
    expect(global.game.actors.get(id).system.debility.battered).toBe(false);
  });

  it("renames the actor when ship.name changes", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Old" }, state);
    const id = state.shipIds[0];
    await updateShip(id, { name: "New" });
    expect(global.game.actors.get(id).name).toBe("New");
  });
});

describe("sufferDamage / repairIntegrity / clearBattered", () => {
  it("sufferDamage subtracts and clamps at zero", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Hurt", integrity: 3 }, state);
    const id = state.shipIds[0];

    const after = await sufferDamage(id, 2);
    expect(after.integrity).toBe(1);

    const fatal = await sufferDamage(id, 10);
    expect(fatal.integrity).toBe(0);
  });

  it("repairIntegrity is blocked while battered", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Battered", integrity: 1, battered: true }, state);
    const id = state.shipIds[0];
    const after = await repairIntegrity(id, 2);
    expect(after.integrity).toBe(1);   // unchanged
  });

  it("clearBattered clears battered and the native debility mirror", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Heal", battered: true }, state);
    const id = state.shipIds[0];
    await clearBattered(id);
    expect(getShip(id).battered).toBe(false);
    expect(global.game.actors.get(id).system.debility.battered).toBe(false);
  });
});
