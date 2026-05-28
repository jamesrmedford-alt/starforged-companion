/**
 * Phase 2 of the Entity → Actor Migration moves Ship records onto native
 * foundry-ironsworn `starship` Actor documents. The Actor's
 * system.debility.{battered,cursed} (ImpactField) is the canonical store for
 * those two flags so the system sheet renders them correctly; everything
 * else lives in actor.flags["starforged-companion"].ship.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Hoisted oracle-roller stub. The seed tests below override its behaviour
// per-test; everything else in the file does not import rollOracle and is
// unaffected.
vi.mock("../../src/oracles/roller.js", async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    rollOracle: vi.fn((id) => ({ tableId: id, result: "—" })),
  };
});

// apiPost is mocked so the Sonnet-notes path in seedStarshipActor is
// deterministic. Returns a fixed prose paragraph; the no-key seed tests never
// reach it (generateStarshipIntroProse returns early when no claudeApiKey set).
vi.mock("../../src/api-proxy.js", () => ({
  apiPost: vi.fn(async () => ({
    content: [{ type: "text", text: "Your habitat-hulk hangs motionless against the dark." }],
  })),
}));

import {
  createShip,
  getShip,
  listShips,
  updateShip,
  sufferDamage,
  repairIntegrity,
  clearBattered,
  ShipSchema,
  starshipHasSeedDetail,
  seedStarshipActor,
  getCommandVehicle,
  actorHasCommandVehicleAsset,
  syncCommandVehicleFlag,
} from "../../src/entities/ship.js";
import { rollOracle } from "../../src/oracles/roller.js";
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

  it("persists portraitSourceDescription as part of the create (atomic)", async () => {
    // Confirm-from-draft path passes portraitSourceDescription in the data
    // arg so the field lands together with the rest of the ship payload.
    // The Quench live test that previously read the field immediately
    // after createShip's id-push raced because the field was being set
    // in a post-create write. See v1.2.14 → v1.2.15 fix.
    const state = { shipIds: [] };
    await createShip({
      name:                      "Test Confirm",
      type:                      "Freighter",
      firstLook:                 "Patched hull",
      portraitSourceDescription: "Patched hull. Freighter.",
    }, state);
    const ship = global.game.actors.contents[0].flags[MODULE].ship;
    expect(ship.type).toBe("Freighter");
    expect(ship.firstLook).toBe("Patched hull");
    expect(ship.portraitSourceDescription).toBe("Patched hull. Freighter.");
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

describe("getCommandVehicle — flag, then lone-ship fallback", () => {
  it("returns the flagged command vehicle when one is set", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Support" }, state);
    await createShip({ name: "Flagship", isCommandVehicle: true }, state);
    expect(getCommandVehicle(state)?.name).toBe("Flagship");
  });

  it("falls back to the sole tracked starship when none is flagged", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Only Ship" }, state);
    expect(getCommandVehicle(state)?.name).toBe("Only Ship");
  });

  it("is ambiguous (null) when multiple ships exist and none is flagged", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "A" }, state);
    await createShip({ name: "B" }, state);
    expect(getCommandVehicle(state)).toBeNull();
  });
});

describe("actorHasCommandVehicleAsset", () => {
  it("detects an embedded Command Vehicle asset on a starship", () => {
    const actor = global.makeTestActor({
      type: "starship", name: "Has CV",
      items: { contents: [
        { type: "asset", system: { category: "Module" } },
        { type: "asset", system: { category: "Command Vehicle" } },
      ] },
    });
    expect(actorHasCommandVehicleAsset(actor)).toBe(true);
  });

  it("is false for a starship carrying only modules / support vehicles", () => {
    const actor = global.makeTestActor({
      type: "starship", name: "Modules Only",
      items: { contents: [
        { type: "asset", system: { category: "Module" } },
        { type: "asset", system: { category: "Support Vehicle" } },
      ] },
    });
    expect(actorHasCommandVehicleAsset(actor)).toBe(false);
  });

  it("is false for non-starship actors", () => {
    const actor = global.makeTestActor({
      type: "character", name: "PC",
      items: { contents: [{ type: "asset", system: { category: "Command Vehicle" } }] },
    });
    expect(actorHasCommandVehicleAsset(actor)).toBe(false);
  });
});

describe("syncCommandVehicleFlag", () => {
  it("flags a tracked starship once it carries a Command Vehicle asset", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Promotable" }, state);
    const actor = global.game.actors.contents[0];
    expect(getShip(actor.id).isCommandVehicle).toBe(false);

    actor.items.contents.push({ type: "asset", system: { category: "Command Vehicle" } });
    const result = await syncCommandVehicleFlag(actor, state);

    expect(result?.isCommandVehicle).toBe(true);
    expect(getShip(actor.id).isCommandVehicle).toBe(true);
  });

  it("is a no-op when the flag already matches the asset state", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Already" }, state);
    const actor = global.game.actors.contents[0];
    expect(await syncCommandVehicleFlag(actor, state)).toBeNull();
  });

  it("registers and flags an untracked sidebar starship that carries the asset", async () => {
    const actor = global.makeTestActor({
      type: "starship", name: "Sidebar CV",
      items: { contents: [{ type: "asset", system: { category: "Command Vehicle" } }] },
    });
    global.game.actors._set(actor.id, actor);
    const state = { shipIds: [] };

    const result = await syncCommandVehicleFlag(actor, state);

    expect(result?.isCommandVehicle).toBe(true);
    expect(state.shipIds).toContain(actor.id);
    expect(actor.flags["starforged-companion"].ship.isCommandVehicle).toBe(true);
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


// ─────────────────────────────────────────────────────────────────────────────
// Starship Actor seeding — createActor hook target
// ─────────────────────────────────────────────────────────────────────────────

describe("starshipHasSeedDetail", () => {
  it("returns false for a brand-new sidebar-created starship", () => {
    const actor = global.makeTestActor({ type: "starship", name: "Blank" });
    expect(starshipHasSeedDetail(actor)).toBe(false);
  });

  it("returns true when system.notes contains visible text", () => {
    const actor = global.makeTestActor({
      type: "starship", name: "User-Annotated",
      system: { notes: "<p>This is my ship.</p>" },
    });
    expect(starshipHasSeedDetail(actor)).toBe(true);
  });

  it("treats notes containing only HTML tags as empty", () => {
    const actor = global.makeTestActor({
      type: "starship", name: "Whitespace",
      system: { notes: "<p>   </p>" },
    });
    expect(starshipHasSeedDetail(actor)).toBe(false);
  });

  it("returns true when flag.ship.type is already populated", () => {
    const actor = global.makeTestActor({
      type: "starship", name: "Pre-seeded",
      flags: { "starforged-companion": { ship: { type: "Freighter" } } },
    });
    expect(starshipHasSeedDetail(actor)).toBe(true);
  });

  it("returns true when flag.ship.firstLook is already populated", () => {
    const actor = global.makeTestActor({
      type: "starship", name: "Pre-seeded First Look",
      flags: { "starforged-companion": { ship: { firstLook: "Patched hull" } } },
    });
    expect(starshipHasSeedDetail(actor)).toBe(true);
  });

  it("returns false for a non-starship actor", () => {
    const actor = global.makeTestActor({ type: "character", name: "PC" });
    expect(starshipHasSeedDetail(actor)).toBe(false);
  });
});

describe("seedStarshipActor", () => {
  const rollMap = {
    starship_type:             "Heavy Freighter",
    starship_first_look:       "Patched hull, mismatched plating",
    starship_mission_terminus: "Smuggle a contraband cargo",
    starship_mission_outlands: "Survey a derelict system",
    starship_mission_expanse:  "Map an uncharted star",
    starship_name:             "Long Memory",
  };

  beforeEach(() => {
    rollOracle.mockReset?.();
    rollOracle.mockImplementation((id) => ({
      tableId: id,
      result:  rollMap[id] ?? "—",
    }));
    // OpenRouter key absent by default — portrait path is skipped.
    global.game.settings.get = (_mod, key) => {
      if (key === "openRouterApiKey") return "";
      if (key === "autoSeedStarship") return true;
      return undefined;
    };
    global.game.settings.set = async () => {};
  });

  it("writes oracle-seeded type / firstLook / mission into the flag payload", async () => {
    const actor = global.makeTestActor({ type: "starship", name: "Sidebar Create" });
    global.game.actors._set(actor.id, actor);

    await seedStarshipActor(actor, { activeSectorId: null, sectors: [] });

    const ship = actor.flags["starforged-companion"].ship;
    expect(ship.type).toBe("Heavy Freighter");
    expect(ship.firstLook).toBe("Patched hull, mismatched plating");
    expect(ship.mission).toBe("Smuggle a contraband cargo"); // default region: terminus
    expect(ship.name).toBe("Sidebar Create");                // preserves user-supplied name
    expect(ship.portraitSourceDescription).toContain("Heavy Freighter");
    expect(ship.portraitSourceDescription).toContain("Patched hull");
  });

  it("renders system.notes as HTML containing all rolled fields", async () => {
    const actor = global.makeTestActor({ type: "starship", name: "Notes Renderer" });
    global.game.actors._set(actor.id, actor);

    await seedStarshipActor(actor, { activeSectorId: null, sectors: [] });

    const notes = actor.system.notes;
    expect(notes).toContain("<ul>");
    expect(notes).toContain("Heavy Freighter");
    expect(notes).toContain("Patched hull");
    expect(notes).toContain("Mission");
    expect(notes).toContain("Smuggle a contraband cargo");
  });

  it("composes atmospheric prose Notes (prose + fact line) when a Claude key is set", async () => {
    global.game.settings.get = (_mod, key) => {
      if (key === "claudeApiKey")     return "sk-ant-test";
      if (key === "autoSeedStarship") return true;
      if (key === "narrationModel")   return "claude-sonnet-4-5-20250929";
      if (key === "narrationTone")    return "wry";
      if (key === "openRouterApiKey") return "";
      return undefined;
    };
    const actor = global.makeTestActor({ type: "starship", name: "Prose Ship" });
    global.game.actors._set(actor.id, actor);

    await seedStarshipActor(actor, { activeSectorId: null, sectors: [] });

    const notes = actor.system.notes;
    expect(notes).toContain("Your habitat-hulk hangs motionless against the dark."); // Sonnet prose
    expect(notes).toContain("Heavy Freighter");  // compact fact line preserves the rolls
    expect(notes).not.toContain("<ul>");          // prose path, not the bullet fallback
  });

  it("picks the active sector's region for the mission table", async () => {
    const actor = global.makeTestActor({ type: "starship", name: "Outlands Ship" });
    global.game.actors._set(actor.id, actor);

    await seedStarshipActor(actor, {
      activeSectorId: "sec-1",
      sectors:        [{ id: "sec-1", region: "outlands" }],
    });

    const ship = actor.flags["starforged-companion"].ship;
    expect(ship.mission).toBe("Survey a derelict system");
    expect(actor.system.notes).toContain("outlands");
  });

  it("does not rename the actor", async () => {
    const actor = global.makeTestActor({ type: "starship", name: "Pequod" });
    global.game.actors._set(actor.id, actor);

    await seedStarshipActor(actor, {});

    expect(actor.name).toBe("Pequod");
  });

  it("registers the actor on campaignState.shipIds when not yet tracked", async () => {
    const actor = global.makeTestActor({ type: "starship", name: "Tracker" });
    global.game.actors._set(actor.id, actor);

    const state = { shipIds: [] };
    await seedStarshipActor(actor, state);

    expect(state.shipIds).toContain(actor.id);
  });

  it("returns null for a non-starship actor", async () => {
    const actor = global.makeTestActor({ type: "character", name: "Not A Ship" });
    const result = await seedStarshipActor(actor, {});
    expect(result).toBeNull();
  });
});
