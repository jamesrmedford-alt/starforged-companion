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
} from "../../src/entities/migrator.js";
import { _resetFolderCache } from "../../src/entities/folder.js";

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
