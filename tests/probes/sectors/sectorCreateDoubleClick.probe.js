/**
 * PROBE — SECTOR-CREATE-NO-INFLIGHT-GUARD
 *
 * SectorCreatorApp's "✓ Create Sector" action (#onFinalizeSector,
 * src/sectors/sectorPanel.js) awaits the whole creation pipeline — entity
 * Actors, background art, narrator stubs, portraits, journal, Scene — which
 * takes many seconds to minutes with art/stubs on, while the wizard stays open
 * with the button live (no busy flag, no disable). A second click while the
 * first run is in flight starts a second full pipeline over the SAME generated
 * sector: duplicate settlement / connection / site Actors, a second Sector
 * Record journal and a second Scene, double art/Claude spend.
 *
 * Asserts the CORRECT behaviour (one creation per generated sector); fails today.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));
vi.mock("../../../src/world/worldJournal.js", () => ({ recordThreat: vi.fn(async () => null) }));

import { SectorCreatorApp } from "../../../src/sectors/sectorPanel.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";

const MODULE = "starforged-companion";

function makeScene() {
  const scene = {
    id: foundry.utils.randomID(),
    dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024 },
    update: vi.fn(async () => scene),
    createEmbeddedDocuments: vi.fn(async (_t, data) => data),
  };
  return scene;
}

describe("PROBE SECTOR-CREATE-NO-INFLIGHT-GUARD", () => {
  beforeEach(() => {
    game.actors._reset();
    game.folders._reset();
    _resetFolderCache();
    game.settings._store.clear();
    game.settings._store.set(`${MODULE}.campaignState`, { sectors: [], settlementIds: [], connectionIds: [], locationIds: [] });
    // Art, stubs and portraits off — the guard question doesn't depend on them.
    game.settings._store.set(`${MODULE}.sectorArtEnabled`, false);
    game.settings._store.set(`${MODULE}.sectorNarratorStubsEnabled`, false);
    game.settings._store.set(`${MODULE}.sectorEntityPortraitsEnabled`, false);
    global.Scene = { create: vi.fn(async () => makeScene()) };
  });

  it("a second Create Sector click while the first run is in flight creates nothing more", async () => {
    const app = new SectorCreatorApp();
    const { chooseRegion, finalizeSector } = SectorCreatorApp.DEFAULT_OPTIONS.actions;
    await chooseRegion.call(app, {}, { dataset: { region: "outlands" } });

    // Click … click again before the first pipeline has finished.
    await Promise.all([
      finalizeSector.call(app, {}, {}),
      finalizeSector.call(app, {}, {}),
    ]);

    const settlementActors = game.actors.contents.filter(a => a.flags?.[MODULE]?.entityType === "settlement");
    const connectionActors = game.actors.contents.filter(a => a.flags?.[MODULE]?.entityType === "connection");
    expect.soft(global.Scene.create).toHaveBeenCalledTimes(1);   // today: 2
    expect.soft(settlementActors).toHaveLength(3);               // today: 6
    expect.soft(connectionActors).toHaveLength(1);               // today: 2
    expect.soft(game.settings.get(MODULE, "campaignState").settlementIds).toHaveLength(3);
  });
});
