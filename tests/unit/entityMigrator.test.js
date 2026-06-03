/**
 * Migrator covers the !migrate-entities chat command — Phase 2 handles ships.
 * Forward pass creates an Actor per legacy journal, marks the journal as
 * migrated, and rewrites campaignState.shipIds. Cleanup pass deletes journals
 * whose migration timestamp is older than the 7-day grace window.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  handleMigrateEntitiesCommand,
  isMigrateEntitiesCommand,
  flattenSectorActorFolders,
  scaffoldPcShipFolders,
  migrateJournalConnectionsToActors,
} from "../../src/entities/migrator.js";
import {
  _resetFolderCache,
  ensureFolderPath,
} from "../../src/entities/folder.js";

const MODULE = "starforged-companion";

function makeLegacyShipJournal(id, shipPayload) {
  const flags = { [MODULE]: {} };
  const pageFlags = { [MODULE]: { ship: shipPayload } };
  return {
    id,
    name: shipPayload.name ?? "Unknown",
    flags,
    pages: { contents: [{
      flags: pageFlags,
      getFlag: (mod, key) => pageFlags?.[mod]?.[key],
    }] },
    setFlag: async (mod, key, val) => {
      if (!flags[mod]) flags[mod] = {};
      flags[mod][key] = val;
    },
    delete: async () => {
      // Remove from the journal collection.
      const idx = global.game.journal._items?.findIndex?.(j => j.id === id) ?? -1;
      if (idx >= 0) global.game.journal._items.splice(idx, 1);
    },
  };
}

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset();
  _resetFolderCache();
  // Stub a writable journal collection for these tests. tests/setup.js only
  // provides JournalEntry.create; we need iteration and a delete path for the
  // migrator.
  const items = [];
  const stash = items;
  global.game.journal = {
    get:    (id) => stash.find(j => j.id === id) ?? null,
    find:   (fn) => stash.find(fn) ?? null,
    [Symbol.iterator]() { return stash[Symbol.iterator](); },
    _items: stash,
    _add:   (j) => stash.push(j),
  };
  global.game.settings._reset?.();
  let stored = { shipIds: [] };
  global.game.settings.get = (mod, key) => (key === "campaignState" ? stored : null);
  global.game.settings.set = async (mod, key, val) => { if (key === "campaignState") stored = val; };
  global.game.users = { filter: () => [], get: () => null };
  global.ChatMessage = { create: async () => null };
});

function makeConnectionJournal(id, payload) {
  const pageFlags = { [MODULE]: { connection: payload } };
  return {
    id,
    name: payload.name ?? "Unknown",
    flags: { [MODULE]: { entityType: "connection", entityId: payload._id } },
    pages: { contents: [{ flags: pageFlags, getFlag: (m, k) => pageFlags?.[m]?.[k] }] },
    delete: async () => {
      const idx = global.game.journal._items.findIndex(j => j.id === id);
      if (idx >= 0) global.game.journal._items.splice(idx, 1);
    },
  };
}

describe("migrateJournalConnectionsToActors", () => {
  it("converts a journal-backed connection into an NPC-card Actor and swaps the id", async () => {
    const payload = { _id: "c1", name: "Sable", role: "Navigator", rank: "dangerous" };
    global.game.journal._add(makeConnectionJournal("j-conn", payload));
    const stored = { connectionIds: ["j-conn"] };
    global.game.settings.get = (mod, key) => (key === "campaignState" ? stored : null);
    global.game.settings.set = async (mod, key, val) => { if (key === "campaignState") Object.assign(stored, val); };

    const summary = await migrateJournalConnectionsToActors(stored);

    expect(summary.migrated).toBe(1);
    expect(stored.connectionIds).toHaveLength(1);
    const newId = stored.connectionIds[0];
    expect(newId).not.toBe("j-conn");

    const actor = global.game.actors.get(newId);
    expect(actor).toBeTruthy();
    expect(actor.type).toBe("character");
    expect(actor.flags[MODULE].connection.name).toBe("Sable");
    expect(actor.flags[MODULE].entityType).toBe("connection");
    // old journal removed
    expect(global.game.journal.get("j-conn")).toBe(null);
  });

  it("skips ids that already resolve to an Actor (idempotent)", async () => {
    global.game.actors._set("a-conn", global.makeTestActor({
      id: "a-conn", type: "character", name: "X",
      flags: { [MODULE]: { entityType: "connection", connection: { _id: "c2", name: "X" } } },
    }));
    const stored = { connectionIds: ["a-conn"] };

    const summary = await migrateJournalConnectionsToActors(stored);

    expect(summary.migrated).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(stored.connectionIds).toEqual(["a-conn"]);
  });

  it("leaves a dangling id untouched when no connection payload is found", async () => {
    const stored = { connectionIds: ["ghost"] };
    const summary = await migrateJournalConnectionsToActors(stored);
    expect(summary.migrated).toBe(0);
    expect(stored.connectionIds).toEqual(["ghost"]);
  });
});

describe("scaffoldPcShipFolders", () => {
  it("creates PCs/ and Starships/ and files loose actors into them", async () => {
    const pc   = await global.Actor.create({ type: "character", name: "Lowell" });
    const ship = await global.Actor.create({ type: "starship",  name: "Wayfarer" });

    const summary = await scaffoldPcShipFolders();

    const pcs   = global.game.folders.find(f => f.type === "Actor" && f.name === "PCs");
    const ships = global.game.folders.find(f => f.type === "Actor" && f.name === "Starships");
    expect(pcs).toBeTruthy();
    expect(ships).toBeTruthy();
    expect(pc.folder).toBe(pcs.id);
    expect(ship.folder).toBe(ships.id);
    expect(summary.moved).toBe(2);
  });

  it("never disturbs an actor already filed in a folder", async () => {
    const other = await global.Folder.create({ name: "My Heroes", type: "Actor" });
    const pc = await global.Actor.create({ type: "character", name: "Filed", folder: other.id });

    const summary = await scaffoldPcShipFolders();

    expect(pc.folder).toBe(other.id);   // untouched
    expect(summary.moved).toBe(0);
  });

  it("skips a module-managed NPC card (character with entityType) so it isn't filed as a PC", async () => {
    const npc = await global.Actor.create({
      type:  "character",
      name:  "Maren",
      flags: { [MODULE]: { entityType: "connection", entityId: "c1" } },
    });

    const summary = await scaffoldPcShipFolders();

    expect(npc.folder).toBe(null);      // left for the per-sector NPC folder logic
    expect(summary.moved).toBe(0);
  });
});

describe("isMigrateEntitiesCommand", () => {
  it("matches !migrate-entities with or without trailing args", () => {
    expect(isMigrateEntitiesCommand({ content: "!migrate-entities" })).toBe(true);
    expect(isMigrateEntitiesCommand({ content: "!migrate-entities --cleanup" })).toBe(true);
    expect(isMigrateEntitiesCommand({ content: "!recap" })).toBe(false);
    expect(isMigrateEntitiesCommand({ content: "" })).toBe(false);
  });
});

describe("handleMigrateEntitiesCommand — GM gate", () => {
  it("no-ops for non-GM callers", async () => {
    global.game.journal._add(makeLegacyShipJournal("j-ship", { _id: "s1", name: "Tantive" }));
    const state = global.game.settings.get(MODULE, "campaignState");
    state.shipIds = ["j-ship"];

    await handleMigrateEntitiesCommand({
      content: "!migrate-entities",
      author: { isGM: false },
    });

    expect(global.game.actors.contents.length).toBe(0);
    expect(state.shipIds).toEqual(["j-ship"]);
  });
});

describe("forward migration — Phase 2: ships", () => {
  it("creates a starship Actor for every legacy ship journal and rewrites shipIds", async () => {
    const j = makeLegacyShipJournal("j-ship-A", { _id: "s1", name: "Tantive", integrity: 4 });
    global.game.journal._add(j);
    const state = global.game.settings.get(MODULE, "campaignState");
    state.shipIds = ["j-ship-A"];

    await handleMigrateEntitiesCommand({
      content: "!migrate-entities",
      author: { isGM: true },
    });

    const actors = global.game.actors.filter(a => a.type === "starship");
    expect(actors).toHaveLength(1);
    expect(actors[0].flags[MODULE].ship.name).toBe("Tantive");

    // shipIds should be exactly [newActorId] — legacy id replaced, not duplicated.
    const persisted = global.game.settings.get(MODULE, "campaignState");
    expect(persisted.shipIds).toEqual([actors[0].id]);
    expect(persisted.shipIds).not.toContain("j-ship-A");
  });

  it("marks the source journal as migrated and does NOT delete it", async () => {
    const j = makeLegacyShipJournal("j-ship-B", { _id: "s2", name: "Falcon" });
    global.game.journal._add(j);
    const state = global.game.settings.get(MODULE, "campaignState");
    state.shipIds = ["j-ship-B"];

    await handleMigrateEntitiesCommand({
      content: "!migrate-entities",
      author: { isGM: true },
    });

    expect(global.game.journal._items).toHaveLength(1);
    expect(j.flags[MODULE].migrated?.toActorId).toBeTruthy();
    expect(typeof j.flags[MODULE].migrated?.at).toBe("string");
  });

  it("is idempotent — a second pass skips already-migrated journals", async () => {
    const j = makeLegacyShipJournal("j-ship-C", { _id: "s3", name: "Reliant" });
    global.game.journal._add(j);
    const state = global.game.settings.get(MODULE, "campaignState");
    state.shipIds = ["j-ship-C"];

    await handleMigrateEntitiesCommand({
      content: "!migrate-entities",
      author: { isGM: true },
    });
    const after1 = global.game.actors.contents.length;

    await handleMigrateEntitiesCommand({
      content: "!migrate-entities",
      author: { isGM: true },
    });
    const after2 = global.game.actors.contents.length;

    expect(after2).toBe(after1);
  });
});

describe("sector-record overview rewrite (Phase 3.5)", () => {
  it("rewrites existing overview pages to use UUID links and deletes per-settlement embedded pages", async () => {
    // Set up a settlement journal that will be migrated, plus a sector-record
    // journal whose overview still has the pre-migration plain-text settlements
    // list and a per-settlement embedded page.
    const settlementJournal = {
      id:    "j-set",
      name:  "Outpost 7",
      flags: { [MODULE]: {} },
      pages: { contents: [{
        flags:   { [MODULE]: { settlement: {
          _id: "s1", name: "Outpost 7", location: "Orbital",
        } } },
        getFlag: (mod, key) => (mod === MODULE && key === "settlement") ? {
          _id: "s1", name: "Outpost 7", location: "Orbital",
        } : null,
      }] },
      setFlag: async function (mod, key, val) {
        if (!this.flags[mod]) this.flags[mod] = {};
        this.flags[mod][key] = val;
      },
      delete: async () => {},
    };

    const overviewPage = {
      id:   "page-overview",
      name: "Sigma Draconis",
      text: { content: `<h2>Sigma Draconis</h2>
<p class="narrator-stub">A trader's haven.</p>
<h3>Settlements</h3>
<ul><li>Outpost 7 — Orbital, Pop: Few, Authority: None</li></ul>
<h3>Passages</h3>
<p>1 passage charted.</p>` },
      update: async function (changes) {
        for (const [path, val] of Object.entries(changes)) {
          const parts = path.split(".");
          let cur = this;
          for (let i = 0; i < parts.length - 1; i += 1) cur = cur[parts[i]];
          cur[parts[parts.length - 1]] = val;
        }
      },
      delete: async function () { this._deleted = true; },
    };
    const extraPage = {
      id:   "page-extra",
      name: "Outpost 7",
      text: { content: "<p>legacy embedded settlement detail</p>" },
      update: async () => {},
      delete: async function () { this._deleted = true; },
    };
    const sectorPages = [overviewPage, extraPage];
    const sectorJournal = {
      id:    "j-sector",
      name:  "Sigma Draconis — Sector Record",
      flags: { [MODULE]: { sectorRecord: true, sectorId: "sec-1" } },
      pages: { contents: sectorPages, find: (fn) => sectorPages.find(fn) },
      update: async function (changes) { Object.assign(this, changes); },
    };

    global.game.journal._add(settlementJournal);
    global.game.journal._add(sectorJournal);

    // Seed campaignState with the sector entry that points at the legacy journal id.
    const state = global.game.settings.get(MODULE, "campaignState");
    state.sectors = [{
      id: "sec-1", name: "Sigma Draconis",
      settlements: [{ id: "g7", name: "Outpost 7", locationType: "orbital", population: "Few", authority: "None" }],
      settlementIds:    ["j-set"],
      entityJournalIds: { g7: "j-set" },
      activeSectorId:   "sec-1",
    }];
    state.settlementIds = ["j-set"];
    state.activeSectorId = "sec-1";

    await handleMigrateEntitiesCommand({
      content: "!migrate-entities",
      author:  { isGM: true },
    });

    const migrated = global.game.settings.get(MODULE, "campaignState");
    // settlementIds replaced with actor id
    const actorId = global.game.actors.filter(a => a.type === "location")[0]?.id;
    expect(actorId).toBeTruthy();
    expect(migrated.settlementIds).toEqual([actorId]);
    expect(migrated.sectors[0].settlementIds).toEqual([actorId]);
    expect(migrated.sectors[0].entityJournalIds.g7).toBe(actorId);

    // Overview rewritten with the UUID link, narrator stub preserved.
    expect(overviewPage.text.content).toContain(`@UUID[Actor.${actorId}]{Outpost 7}`);
    expect(overviewPage.text.content).toContain("trader's haven");
    expect(overviewPage.text.content).not.toMatch(/<ul><li>Outpost 7 —/);

    // Legacy embedded settlement page deleted; overview survives.
    expect(extraPage._deleted).toBe(true);
    expect(overviewPage._deleted).toBeUndefined();
  });
});

describe("cleanup pass — --cleanup", () => {
  it("deletes journals migrated more than 7 days ago", async () => {
    const old = makeLegacyShipJournal("j-old", { _id: "s4", name: "Ancient" });
    old.flags[MODULE].migrated = {
      toActorId: "a-old",
      at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    };
    global.game.journal._add(old);

    await handleMigrateEntitiesCommand({
      content: "!migrate-entities --cleanup",
      author: { isGM: true },
    });

    expect(global.game.journal._items).toHaveLength(0);
  });

  it("preserves journals still inside the 7-day window", async () => {
    const recent = makeLegacyShipJournal("j-recent", { _id: "s5", name: "Fresh" });
    recent.flags[MODULE].migrated = {
      toActorId: "a-recent",
      at: new Date().toISOString(),
    };
    global.game.journal._add(recent);

    await handleMigrateEntitiesCommand({
      content: "!migrate-entities --cleanup",
      author: { isGM: true },
    });

    expect(global.game.journal._items).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// flattenSectorActorFolders — move legacy per-type subfolders to flat layout
// ─────────────────────────────────────────────────────────────────────────────

describe("flattenSectorActorFolders", () => {
  // The Folder stub in tests/setup.js doesn't ship a delete() method. Patch
  // it onto every folder created in this block so the migration's empty-
  // folder cleanup can run end-to-end.
  function enableFolderDelete() {
    for (const folder of global.game.folders) {
      if (!folder.delete) {
        folder.delete = async () => {
          const items = global.game.folders.contents;
          const idx = items.findIndex(f => f.id === folder.id);
          if (idx >= 0) items.splice(idx, 1);
        };
      }
    }
  }

  it("moves a settlement Actor from Sectors/<Name>/Settlements into Sectors/<Name>", async () => {
    const state = { sectors: [{ id: "sec-1", name: "Sigma Draconis" }] };
    const legacyLeaf = await ensureFolderPath("Actor", ["Sectors", "Sigma Draconis", "Settlements"]);
    const actor = await global.Actor.create({
      type:   "location",
      name:   "Bleakhold",
      folder: legacyLeaf,
      flags:  { [MODULE]: { entityType: "settlement", settlement: { sectorId: "sec-1" } } },
    });
    enableFolderDelete();

    const summary = await flattenSectorActorFolders(state);

    const sectorFolder = global.game.folders.find(f => f.name === "Sigma Draconis");
    expect(actor.folder).toBe(sectorFolder.id);
    expect(summary.moved).toBe(1);
  });

  it("removes an empty legacy Settlements subfolder once its only actor has moved", async () => {
    const state = { sectors: [{ id: "sec-1", name: "Sigma Draconis" }] };
    const legacyLeaf = await ensureFolderPath("Actor", ["Sectors", "Sigma Draconis", "Settlements"]);
    await global.Actor.create({
      type:   "location",
      name:   "Bleakhold",
      folder: legacyLeaf,
      flags:  { [MODULE]: { entityType: "settlement", settlement: { sectorId: "sec-1" } } },
    });
    enableFolderDelete();

    const summary = await flattenSectorActorFolders(state);

    expect(global.game.folders.find(f => f.id === legacyLeaf)).toBe(null);
    expect(summary.foldersDeleted).toBe(1);
  });

  it("rewrites the fallback Sectors/Settlements path to Sectors/<Sector Name> when the sectorId now resolves", async () => {
    const state = { sectors: [{ id: "sec-1", name: "Sigma Draconis" }] };
    const fallbackLeaf = await ensureFolderPath("Actor", ["Sectors", "Settlements"]);
    const actor = await global.Actor.create({
      type:   "location",
      name:   "Orphan",
      folder: fallbackLeaf,
      flags:  { [MODULE]: { entityType: "settlement", settlement: { sectorId: "sec-1" } } },
    });
    enableFolderDelete();

    await flattenSectorActorFolders(state);

    const sectorFolder = global.game.folders.find(f => f.name === "Sigma Draconis");
    expect(actor.folder).toBe(sectorFolder.id);
    expect(global.game.folders.find(f => f.id === fallbackLeaf)).toBe(null);
  });

  it("routes actors with an unresolvable sectorId into Sectors / Unsorted", async () => {
    const state = { sectors: [] };
    const fallbackLeaf = await ensureFolderPath("Actor", ["Sectors", "Settlements"]);
    const actor = await global.Actor.create({
      type:   "location",
      name:   "Drifter",
      folder: fallbackLeaf,
      flags:  { [MODULE]: { entityType: "settlement", settlement: { sectorId: null } } },
    });
    enableFolderDelete();

    await flattenSectorActorFolders(state);

    const unsorted = global.game.folders.find(f => f.name === "Unsorted");
    expect(actor.folder).toBe(unsorted.id);
  });

  it("is idempotent — a second run moves nothing", async () => {
    const state = { sectors: [{ id: "sec-1", name: "X" }] };
    const legacyLeaf = await ensureFolderPath("Actor", ["Sectors", "X", "Settlements"]);
    await global.Actor.create({
      type:   "location",
      name:   "A",
      folder: legacyLeaf,
      flags:  { [MODULE]: { entityType: "settlement", settlement: { sectorId: "sec-1" } } },
    });
    enableFolderDelete();

    await flattenSectorActorFolders(state);
    const second = await flattenSectorActorFolders(state);

    expect(second.moved).toBe(0);
    expect(second.foldersDeleted).toBe(0);
  });

  it("leaves non-entity actors alone", async () => {
    const state = { sectors: [{ id: "sec-1", name: "X" }] };
    const someFolder = await ensureFolderPath("Actor", ["Starships"]);
    const ship = await global.Actor.create({
      type:   "starship",
      name:   "Tantive",
      folder: someFolder,
      flags:  { [MODULE]: { entityType: "ship", ship: { sectorId: "sec-1" } } },
    });
    enableFolderDelete();

    const summary = await flattenSectorActorFolders(state);

    expect(ship.folder).toBe(someFolder);  // unchanged
    expect(summary.moved).toBe(0);
  });

  it("does not delete a legacy Settlements folder if it still has children", async () => {
    const state = { sectors: [{ id: "sec-1", name: "X" }] };
    const legacyLeaf = await ensureFolderPath("Actor", ["Sectors", "X", "Settlements"]);
    // Two actors in the legacy folder; one has no sectorId so it can't be
    // remapped to a non-Unsorted target. We assert the legacy folder
    // survives if anything stays behind that the migrator can't relocate.
    await global.Actor.create({
      type:   "location",
      name:   "Movable",
      folder: legacyLeaf,
      flags:  { [MODULE]: { entityType: "settlement", settlement: { sectorId: "sec-1" } } },
    });
    // Stuff a non-managed actor into the legacy folder so the migrator
    // refuses to delete it.
    await global.Actor.create({
      type:   "location",
      name:   "Stranger",
      folder: legacyLeaf,
      flags:  {},  // no entityType — migrator must skip + leave it where it is
    });
    enableFolderDelete();

    await flattenSectorActorFolders(state);

    expect(global.game.folders.find(f => f.id === legacyLeaf)).toBeTruthy();
  });
});
