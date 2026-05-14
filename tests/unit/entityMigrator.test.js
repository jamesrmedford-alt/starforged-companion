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
