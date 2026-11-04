/**
 * STARFORGED COMPANION
 * tests/unit/sectorStoreCachedMutation.test.js
 *
 * Issue #329 X11 (SECTOR-STORE-CACHED-MUTATE) — a refused sector write
 * leaves the GM's cache as it was.
 *
 * Create Sector: storeSector set the full record and `activeSectorId` on the
 * campaignState it was given — the cached setting, by reference (the panel's
 * createSector passed game.settings.get) — before the one refusable write. A
 * refused write left the GM's cache claiming the sector; the retry's
 * runSectorCreationPipeline found it "stored" (findStoredSector reads the
 * cache) and returned at once: no write, no card, the wizard closed, and the
 * world never got the sector. Now storeSector puts the record on the
 * caller's object only once the world has taken it, and createSector works
 * on a copy, so the sector's stub and its entities' ids never reach the
 * cache before the write either.
 *
 * (Converted from the ninth audit's probe
 * tests/probes/sectors/sectorStoreCachedMutation.probe.js.)
 */

/* global expectConsoleError */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));

import { generateSector, storeSector } from "../../src/sectors/sectorGenerator.js";
import { runSectorCreationPipeline } from "../../src/sectors/sectorPanel.js";
import { _resetFolderCache } from "../../src/entities/folder.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;

function freshState() {
  return { ...JSON.parse(JSON.stringify(CampaignStateSchema)), sectors: [], settlementIds: [], connectionIds: [], locationIds: [], shipIds: [], activeSectorId: null };
}

/** The world as the single-client stub stores it, seeded like a live cache (one object, returned by reference). */
function seedWorld(state) {
  game.settings._store.set(KEY, state);
  game.settings._store.set(`${MODULE_ID}.sectorArtEnabled`, false);
  game.settings._store.set(`${MODULE_ID}.sectorNarratorStubsEnabled`, false);
  game.settings._store.set(`${MODULE_ID}.sectorEntityPortraitsEnabled`, false);
}

function minimalSector(id) {
  return {
    id, name: "Devil's Maw", region: "terminus", regionLabel: "Terminus", trouble: null, faction: null,
    settlements: [], sites: [], passages: [], createdAt: new Date().toISOString(),
    connection: { id: "c-1", name: "Kael Volkov", role: "Smuggler", goal: "Gain riches", aspect: "Bold", firstLook: ["Scarred"], homeSettlement: "the sector" },
    mapData: { sectorId: id, gridWidth: 10, gridHeight: 8, settlements: [], passages: [], discoveries: [] },
  };
}

let mockScene;
beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset?.();
  game.folders._reset?.();
  _resetFolderCache();
  mockScene = {
    id: "scene-1",
    dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024 },
    update: vi.fn(async () => mockScene),
    createEmbeddedDocuments: vi.fn(async (_type, data) => data),
  };
  global.Scene = { create: vi.fn(async () => mockScene) };
});
afterEach(() => { vi.restoreAllMocks(); delete global.Scene; });

describe("issue #329 X11 — a refused sector write leaves the GM's cache as it was", () => {
  it("storeSector: after a refused write the cached state holds neither the record nor the active sector", async () => {
    const cached = freshState();
    seedWorld(cached);
    const sector = minimalSector("sector-refused");
    vi.spyOn(game.settings, "set").mockRejectedValueOnce(new Error("Setting [campaignState] could not be saved: the server refused the write"));
    expectConsoleError(/storing the sector failed/);

    await expect(storeSector(sector, { settlements: {}, connectionJournalId: null, sites: {} }, cached)).rejects.toThrow(/refused/);

    // The cache equals the world, which took nothing (it held the full record
    // with mapData, and the active sector).
    expect(cached.sectors.find(s => s.id === sector.id)?.mapData).toBeUndefined();
    expect(cached.activeSectorId).toBeNull();
  });

  it("the retry after a refused write stores the sector (it is not found 'already stored' in the mutated cache)", async () => {
    const cached = freshState();
    seedWorld(cached);
    const sector = generateSector("expanse");
    sector.trouble = null;   // keep the World Journal threat write out of the pipeline

    const realSet = game.settings.set;
    let calls = 0;
    const setSpy = vi.spyOn(game.settings, "set").mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 1) throw new Error("Setting [campaignState] could not be saved: the server refused the write");
      return realSet.apply(game.settings, args);
    });
    expectConsoleError(/storing the sector failed/);

    await expect(runSectorCreationPipeline(sector)).rejects.toThrow(/refused/);
    const createdCardsBeforeRetry = ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.sectorCreated).length;
    expect(createdCardsBeforeRetry).toBe(0);
    // Nothing of the refused run reached the cache: no record, no stub, no ids.
    const afterRefusal = game.settings.get(MODULE_ID, "campaignState");
    expect(afterRefusal.sectors ?? []).toEqual([]);
    expect(afterRefusal.activeSectorId ?? null).toBeNull();
    expect(afterRefusal.settlementIds ?? []).toEqual([]);

    // The GM presses Create again.
    const stored = await runSectorCreationPipeline(sector);

    // The retry writes the sector to the world and announces it (it found the
    // record left on the cache, returned it, and wrote nothing).
    expect(setSpy.mock.calls.length, "campaignState writes (the refused one, then the retry's)").toBe(2);
    expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.sectorCreated)).toHaveLength(1);
    expect(stored?.id).toBe(sector.id);
    expect(game.settings.get(MODULE_ID, "campaignState").activeSectorId).toBe(sector.id);
  });

  it("control: with the write accepted, storeSector lands the record and the active sector", async () => {
    const cached = freshState();
    seedWorld(cached);
    const sector = minimalSector("sector-ok");
    await storeSector(sector, { settlements: {}, connectionJournalId: null, sites: {} }, cached);
    const world = game.settings._store.get(KEY);
    expect(world.sectors.find(s => s.id === sector.id)?.mapData).toBeTruthy();
    expect(world.activeSectorId).toBe(sector.id);
  });

  it("control: a second pipeline run for a stored sector is idempotent (issue #321 U46)", async () => {
    const cached = freshState();
    seedWorld(cached);
    const sector = generateSector("expanse");
    sector.trouble = null;
    const first  = await runSectorCreationPipeline(sector);
    const second = await runSectorCreationPipeline(sector);
    expect(second.id).toBe(first.id);
    expect(global.Scene.create).toHaveBeenCalledTimes(1);
    expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.sectorCreated)).toHaveLength(1);
  });
});
