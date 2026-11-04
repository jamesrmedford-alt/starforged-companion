/**
 * PROBE — SEC-03 SECTOR-STORE-CACHED-MUTATE
 * (src/sectors/sectorGenerator.js storeSector lines 511–519 and
 *  createEntityJournals lines 330–333; src/sectors/sectorPanel.js createSector
 *  line 300 hands the CACHED campaignState in by reference, and
 *  runSectorCreationPipeline lines 282–283 / findStoredSector 294–297 read
 *  that same cache to decide whether a sector is already stored)
 *
 * What the user does: the GM presses ✓ Create Sector (or the Playtest
 * Quickstart runs the pipeline). Minutes later the one campaignState write
 * at the end (persistSectorOntoStore) is refused — a server error, a dropped
 * socket. The GM sees "Sector Creator: Failed to save sector" and presses
 * Create again.
 *
 * What happens: storeSector had already set the full sector record and
 * `activeSectorId` on the cached setting object (the one
 * `game.settings.get` returns by reference — rules/foundry-api.md) BEFORE the
 * write that was refused, so the GM's client now believes the sector is
 * stored while the world has nothing. The retry's runSectorCreationPipeline
 * finds the record in that cache (`findStoredSector` — it carries mapData)
 * and returns it at once: no write, no "◈ Sector Created" card, the wizard
 * closes as if it had succeeded. The world never gets the sector (its
 * Actors, Scene and Sector Record exist — SECTOR-CREATE-PARTIAL territory —
 * but `campaignState.sectors` does not, so the narrator's ACTIVE SECTOR block,
 * `!sector list` and the site ladder see nothing of it after the next reload
 * or world write).
 *
 * What should happen: a refused write leaves the cache as it was (issue #326
 * W51's rule — "a refusable write changes a copy" — applied to the nine
 * command sites, not to sector creation), so the retry stores the sector.
 *
 * Controls (pass today): with the write accepted, storeSector lands the record
 * and the active sector, and a second pipeline run for the same sector is
 * idempotent (issue #321 U46).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sectors/sectorStoreCachedMutation.probe.js
 */

/* global expectConsoleError */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));

import { generateSector, storeSector } from "../../../src/sectors/sectorGenerator.js";
import { runSectorCreationPipeline } from "../../../src/sectors/sectorPanel.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

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

describe("PROBE SEC-03 — a refused sector write leaves the GM's cache as it was", () => {
  it("storeSector: after a refused write the cached state holds neither the record nor the active sector", async () => {
    const cached = freshState();
    seedWorld(cached);
    const sector = minimalSector("sector-refused");
    vi.spyOn(game.settings, "set").mockRejectedValueOnce(new Error("Setting [campaignState] could not be saved: the server refused the write"));
    expectConsoleError(/storing the sector failed/);

    await expect(storeSector(sector, { settlements: {}, connectionJournalId: null, sites: {} }, cached)).rejects.toThrow(/refused/);

    // Expected: the cache equals the world, which took nothing. Today: the full
    // record (with mapData) sits in cached.sectors and activeSectorId is set.
    expect.soft(cached.sectors.find(s => s.id === sector.id)?.mapData).toBeUndefined();
    expect.soft(cached.activeSectorId).toBeNull();
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

    // The GM presses Create again.
    const stored = await runSectorCreationPipeline(sector);

    // Expected: the retry writes the sector to the world and announces it.
    // Today: findStoredSector reads the record storeSector left on the cached
    // object, returns it, and nothing is written or posted.
    expect.soft(setSpy.mock.calls.length, "campaignState writes (the refused one, then the retry's)").toBe(2);
    expect.soft(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.sectorCreated)).toHaveLength(1);
    expect(stored?.id).toBe(sector.id);
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
