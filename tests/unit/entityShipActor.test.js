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

vi.mock("../../src/system/ironswornPacks.js", async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    getCanonicalAsset: vi.fn(),
  };
});

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
  registerStarshipActorLight,
  installModulesForRolledIdentity,
  getCommandVehicle,
  getCommandVehicleActorId,
  actorHasCommandVehicleAsset,
  syncCommandVehicleFlag,
} from "../../src/entities/ship.js";
import { getCanonicalAsset } from "../../src/system/ironswornPacks.js";
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

describe("registerStarshipActorLight — blank registration for finalize-first", () => {
  it("registers a minimal ship payload + shipIds without seeding oracles/notes", async () => {
    const actor = await global.Actor.create({ type: "starship", name: "Wayfarer" });
    const state = { shipIds: [] };

    const ship = await registerStarshipActorLight(actor, state);

    expect(ship).toBeTruthy();
    expect(actor.flags[MODULE].ship._id).toBe(ship._id);
    expect(actor.flags[MODULE].entityType).toBe("ship");
    expect(state.shipIds).toContain(actor.id);
    // Blank — no oracle-rolled identity or notes.
    expect(ship.type).toBe("");
    expect(ship.firstLook).toBe("");
    expect(starshipHasSeedDetail(actor)).toBe(false);
  });

  it("is idempotent — skips an actor that already carries a ship payload", async () => {
    const actor = await global.Actor.create({
      type: "starship", name: "Has Ship",
      flags: { [MODULE]: { ship: { _id: "pre", name: "Has Ship", type: "Shuttle" } } },
    });
    const state = { shipIds: [] };

    const ship = await registerStarshipActorLight(actor, state);
    expect(ship._id).toBe("pre");
    expect(state.shipIds).not.toContain(actor.id); // not re-registered
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

describe("getCommandVehicleActorId — the id updateShip resolves (finding #5)", () => {
  it("returns the host Actor id, not the record GUID", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Flagship", isCommandVehicle: true }, state);

    const actorId = getCommandVehicleActorId(state);
    expect(actorId).toBe(state.shipIds[0]);
    // The record GUID is a different id space — passing it to updateShip
    // threw "Ship actor not found" on every §20 position write.
    expect(actorId).not.toBe(getCommandVehicle(state)._id);
  });

  it("mirrors getCommandVehicle's precedence: flagged first, lone fallback, ambiguous null", async () => {
    const state = { shipIds: [] };
    await createShip({ name: "Support" }, state);
    expect(getCommandVehicleActorId(state)).toBe(state.shipIds[0]);

    await createShip({ name: "Flagship", isCommandVehicle: true }, state);
    expect(getCommandVehicleActorId(state)).toBe(state.shipIds[1]);

    const ambiguous = { shipIds: [] };
    await createShip({ name: "A" }, ambiguous);
    await createShip({ name: "B" }, ambiguous);
    expect(getCommandVehicleActorId(ambiguous)).toBeNull();
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


// ─────────────────────────────────────────────────────────────────────────────
// installModulesForRolledIdentity (F18 — modules match rolled identity)
// ─────────────────────────────────────────────────────────────────────────────

function makeStarshipWithEmbedSpy(name = "F18 Ship", seedItems = []) {
  const installed = [];
  const actor = global.makeTestActor({
    type: "starship",
    name,
    items: { contents: [...seedItems] },
  });
  actor.createEmbeddedDocuments = async (kind, dataArr) => {
    if (kind !== "Item") throw new Error(`unexpected kind ${kind}`);
    for (const d of dataArr) installed.push(d);
    return dataArr;
  };
  return { actor, installed };
}

function fakeCanonicalAsset(slug, name) {
  return {
    name,
    type: "asset",
    system: { category: "Module", abilities: [{ enabled: false, text: `${name} ability` }] },
    flags: { "foundry-ironsworn": { dfid: `asset:starforged/module/${slug}` } },
    toObject() {
      return {
        _id: `compendium-${slug}`,
        name: this.name,
        type: this.type,
        system: JSON.parse(JSON.stringify(this.system)),
        flags: JSON.parse(JSON.stringify(this.flags)),
      };
    },
  };
}

describe("installModulesForRolledIdentity", () => {
  beforeEach(() => {
    getCanonicalAsset.mockReset();
    getCanonicalAsset.mockImplementation(async (slug) => {
      const names = {
        heavy_cannons:   "Heavy Cannons",
        missile_array:   "Missile Array",
        medbay:          "Medbay",
        stealth_tech:    "Stealth Tech",
        engine_upgrade:  "Engine Upgrade",
        sensor_array:    "Sensor Array",
      };
      const name = names[slug];
      return name ? fakeCanonicalAsset(slug, name) : null;
    });
  });

  it("installs modules that match the rolled identity (F18 repro case)", async () => {
    const { actor, installed } = makeStarshipWithEmbedSpy();
    const count = await installModulesForRolledIdentity(actor, {
      type:      "Hunter — Stealthy attack ship",
      firstLook: "Bristling with weapons",
      mission:   "Provide medical aid",
    });
    expect(count).toBeGreaterThan(0);
    const names = installed.map(i => i.name);
    expect(names).toContain("Heavy Cannons");
    expect(names).toContain("Medbay");
  });

  it("drops the compendium _id so Foundry assigns a fresh embedded id", async () => {
    const { actor, installed } = makeStarshipWithEmbedSpy();
    await installModulesForRolledIdentity(actor, {
      type: "Pennant — Command ship", mission: "Command others",
    });
    for (const data of installed) {
      expect(data._id).toBeUndefined();
    }
  });

  it("embeds the canonical category and ability list (not a hand-built skeleton)", async () => {
    const { actor, installed } = makeStarshipWithEmbedSpy();
    await installModulesForRolledIdentity(actor, {
      type: "Dreadnought — Heavy attack ship", firstLook: "Bristling with weapons",
    });
    for (const data of installed) {
      expect(data.type).toBe("asset");
      expect(data.system.category).toBe("Module");
      expect(Array.isArray(data.system.abilities)).toBe(true);
      expect(data.system.abilities.length).toBeGreaterThan(0);
    }
  });

  it("is idempotent — skips entirely when the actor already has any Module-category asset", async () => {
    const existingModule = {
      name: "Engine Upgrade",
      type: "asset",
      system: { category: "Module", abilities: [] },
    };
    const { actor, installed } = makeStarshipWithEmbedSpy("Already Equipped", [existingModule]);
    const count = await installModulesForRolledIdentity(actor, {
      type: "Hunter — Stealthy attack ship", firstLook: "Bristling with weapons",
    });
    expect(count).toBe(0);
    expect(installed).toEqual([]);
    expect(getCanonicalAsset).not.toHaveBeenCalled();
  });

  it("ignores non-Module assets when checking idempotency (Command Vehicle, Companion, etc.)", async () => {
    const commandVehicle = {
      name: "STARSHIP", type: "asset",
      system: { category: "Command Vehicle", abilities: [] },
    };
    const { actor, installed } = makeStarshipWithEmbedSpy("CV Only", [commandVehicle]);
    await installModulesForRolledIdentity(actor, {
      type: "Hunter — Stealthy attack ship", firstLook: "Bristling with weapons",
    });
    // CV asset is not a Module — install proceeds.
    expect(installed.length).toBeGreaterThan(0);
  });

  it("returns 0 and skips embedding when no modules match (Fleet / Unusual)", async () => {
    const { actor, installed } = makeStarshipWithEmbedSpy();
    const count = await installModulesForRolledIdentity(actor, {
      type: "Battle fleet", firstLook: "Ornate markings", mission: "Action + Theme",
    });
    expect(count).toBe(0);
    expect(installed).toEqual([]);
    expect(getCanonicalAsset).not.toHaveBeenCalled();
  });

  it("continues past a missing canonical asset and installs the rest", async () => {
    getCanonicalAsset.mockImplementation(async (slug) => {
      if (slug === "heavy_cannons") return null; // simulate pack-index miss
      return fakeCanonicalAsset(slug, slug);
    });
    const { actor, installed } = makeStarshipWithEmbedSpy();
    const count = await installModulesForRolledIdentity(actor, {
      type: "Dreadnought — Heavy attack ship", firstLook: "Heavy armor", mission: "Defend against an attack",
    });
    expect(count).toBeGreaterThan(0);
    expect(installed.map(i => i.name)).not.toContain("heavy_cannons");
  });

  it("returns 0 for a non-starship actor (defensive)", async () => {
    const character = global.makeTestActor({ type: "character", name: "Not A Ship" });
    const count = await installModulesForRolledIdentity(character, {
      type: "Hunter — Stealthy attack ship",
    });
    expect(count).toBe(0);
    expect(getCanonicalAsset).not.toHaveBeenCalled();
  });

  it("swallows createEmbeddedDocuments failures and returns 0", async () => {
    const { actor } = makeStarshipWithEmbedSpy();
    actor.createEmbeddedDocuments = async () => { throw new Error("permission denied"); };
    const count = await installModulesForRolledIdentity(actor, {
      type: "Hunter — Stealthy attack ship", firstLook: "Bristling with weapons",
    });
    expect(count).toBe(0);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// seedStarshipActor — modules install runs at the tail of the seed (F18)
// ─────────────────────────────────────────────────────────────────────────────

describe("seedStarshipActor → installModulesForRolledIdentity wiring", () => {
  beforeEach(() => {
    rollOracle.mockReset?.();
    rollOracle.mockImplementation((id) => {
      const map = {
        starship_type:             "Hunter — Stealthy attack ship",
        starship_first_look:       "Bristling with weapons",
        starship_mission_terminus: "Provide medical aid",
      };
      return { tableId: id, result: map[id] ?? "—" };
    });
    global.game.settings.get = (_mod, key) => {
      if (key === "openRouterApiKey") return "";
      if (key === "autoSeedStarship") return true;
      return undefined;
    };
    getCanonicalAsset.mockReset();
    getCanonicalAsset.mockImplementation(async (slug) =>
      fakeCanonicalAsset(slug, slug.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()))
    );
  });

  it("installs matched modules at the tail of seedStarshipActor (F18 fix wired up)", async () => {
    const { actor, installed } = makeStarshipWithEmbedSpy("Wired Hunter");
    global.game.actors._set(actor.id, actor);

    await seedStarshipActor(actor, { activeSectorId: null, sectors: [] });

    expect(installed.length).toBeGreaterThan(0);
    const names = installed.map(i => i.name);
    expect(names).toContain("Heavy Cannons");
    expect(names).toContain("Medbay");
  });
});
