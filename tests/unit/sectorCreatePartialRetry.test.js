/**
 * STARFORGED COMPANION
 * tests/unit/sectorCreatePartialRetry.test.js
 *
 * SECTOR-CREATE-PARTIAL: a sector creation that failed partway — here the
 * one campaignState write at its end, refused — left its Actors, its Sector
 * Record journal and its Scene in the world, unlisted; the retry (the Create
 * button pressed again) made a second Scene and a second Sector Record beside
 * them. A failed run now takes back what it made, so the world is as it was
 * before it and the retry makes one set.
 */

/* global expectConsoleError */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));

import { generateSector } from "../../src/sectors/sectorGenerator.js";
import { runSectorCreationPipeline } from "../../src/sectors/sectorPanel.js";
import { _resetFolderCache } from "../../src/entities/folder.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;

function freshState() {
  return { ...JSON.parse(JSON.stringify(CampaignStateSchema)), sectors: [], settlementIds: [], connectionIds: [], locationIds: [], shipIds: [], activeSectorId: null };
}

// A world that keeps the Scenes and journals made, as Foundry does.
let scenes, journals, realJournalEntry, realGameJournal, realGameScenes, realActorCreate;
function collection(list) {
  return { get contents() { return [...list]; }, get: (id) => list.find(d => d.id === id) ?? null };
}
function doc(list, data, extra = {}) {
  const d = {
    id: `${data.name}-${list.length + 1}`, ...data,
    delete: vi.fn(async () => { const i = list.indexOf(d); if (i >= 0) list.splice(i, 1); return d; }),
    ...extra,
  };
  list.push(d);
  return d;
}

beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset?.();
  game.folders._reset?.();
  _resetFolderCache();
  scenes = []; journals = [];
  realJournalEntry = global.JournalEntry;
  realGameJournal  = game.journal;
  realGameScenes   = game.scenes;
  realActorCreate  = global.Actor.create;
  // An Actor deletes itself from the world, as Foundry's documents do.
  global.Actor.create = async (data) => {
    const actor = await realActorCreate(data);
    actor.delete = vi.fn(async () => {
      game.actors._setAll(game.actors.contents.filter(a => a !== actor));
      return actor;
    });
    return actor;
  };
  global.JournalEntry = { create: vi.fn(async (data) => doc(journals, data, { createEmbeddedDocuments: async () => [] })) };
  game.journal = Object.assign(collection(journals), {
    find: (fn) => journals.find(fn) ?? null, getName: () => null, [Symbol.iterator]: function* () { yield* journals; },
  });
  global.Scene = { create: vi.fn(async (data) => {
    const s = doc(scenes, data, {
      dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024 },
      createEmbeddedDocuments: vi.fn(async (_type, d) => d),
    });
    s.update = vi.fn(async () => s);
    return s;
  }) };
  game.scenes = collection(scenes);
  game.settings._store.set(KEY, freshState());
  game.settings._store.set(`${MODULE_ID}.sectorArtEnabled`, false);
  game.settings._store.set(`${MODULE_ID}.sectorNarratorStubsEnabled`, false);
  game.settings._store.set(`${MODULE_ID}.sectorEntityPortraitsEnabled`, false);
});
afterEach(() => {
  vi.restoreAllMocks();
  delete global.Scene;
  global.Actor.create = realActorCreate;
  global.JournalEntry = realJournalEntry;
  game.journal = realGameJournal;
  game.scenes  = realGameScenes;
});

const actorCount = () => game.actors.contents.length;
const sectorRecords = () => journals.filter(j => j.flags?.[MODULE_ID]?.sectorRecord);

describe("a sector creation that fails partway (SECTOR-CREATE-PARTIAL)", () => {
  it("takes back its Actors, Sector Record and Scene; the retry makes one of each", async () => {
    const sector = generateSector("expanse");
    sector.trouble = null;   // keep the World Journal threat write out of the pipeline
    const realSet = game.settings.set;
    let calls = 0;
    vi.spyOn(game.settings, "set").mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 1) throw new Error("Setting [campaignState] could not be saved: the server refused the write");
      return realSet.apply(game.settings, args);
    });
    expectConsoleError(/storing the sector failed/);

    await expect(runSectorCreationPipeline(sector)).rejects.toThrow(/refused/);
    // Nothing of the failed run is left in the world.
    expect(actorCount()).toBe(0);
    expect(sectorRecords()).toHaveLength(0);
    expect(scenes).toHaveLength(0);

    const stored = await runSectorCreationPipeline(sector);
    expect(stored?.id).toBe(sector.id);
    // One Scene and one Sector Record — not a second beside the failed run's.
    expect(scenes).toHaveLength(1);
    expect(sectorRecords()).toHaveLength(1);
    // Every Actor the retry made is listed, none twice.
    const world = game.settings.get(MODULE_ID, "campaignState");
    const listed = [...world.settlementIds, ...world.connectionIds, ...world.locationIds];
    expect(actorCount()).toBe(listed.length);
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.length).toBe(sector.settlements.length + 1 + sector.sites.length);
  });

  it("control: a run that succeeds keeps everything it made", async () => {
    const sector = generateSector("expanse");
    sector.trouble = null;
    await runSectorCreationPipeline(sector);
    expect(scenes).toHaveLength(1);
    expect(sectorRecords()).toHaveLength(1);
    expect(actorCount()).toBe(sector.settlements.length + 1 + sector.sites.length);
  });

  it("takes back only its own: Actors in the world before the run stay", async () => {
    const keep = global.makeTestActor({ type: "character", name: "Kira" });
    game.actors._set(keep.id, keep);
    const sector = generateSector("expanse");
    sector.trouble = null;
    vi.spyOn(game.settings, "set").mockRejectedValueOnce(new Error("refused"));
    expectConsoleError(/storing the sector failed/);
    await expect(runSectorCreationPipeline(sector)).rejects.toThrow(/refused/);
    expect(game.actors.get(keep.id)).toBe(keep);
    expect(actorCount()).toBe(1);
  });
});
