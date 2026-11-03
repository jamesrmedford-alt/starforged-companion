/**
 * PROBE (sectors audit, SO-01) — a move resolving while a sector write lands
 * reverts that write: `campaignState.sectors` is not merged.
 *
 * What the user does: while a player's move is being narrated (the pipeline
 * holds its working copy of campaignState across the confirm dialog and the
 * narrator call), the GM types `!reveal-site Derelict Starship` — or a sector
 * the GM is creating in the Sector Creator is stored (persistSectorOntoStore).
 *
 * What happens: persistResolution (src/moves/persistResolution.js) merges the
 * store into the pipeline's working copy per field, but `sectors` is neither
 * in STORE_OWNED_FIELDS nor merged — "Every other field keeps the working
 * copy (… sectors on a site reveal …)". The move's write puts back the
 * `sectors` array it read before the move: the revealed site is undiscovered
 * again (its Actor still says "visited", its pin is charted, the narrator's
 * Charted sites block loses it and `!reveal-site` can reveal it a second
 * time), and a sector stored meanwhile disappears from `campaignState.sectors`
 * while `activeSectorId` (store-owned) keeps pointing at it.
 *
 * What should happen: a sector record or discovery flag written during the
 * move survives the move's persist; the pipeline's own reveal (the control)
 * still lands.
 *
 * Writers are the real producers: revealSectorSite on its default seams (the
 * `!reveal-site` handler's call) and storeSector (the creator's last step).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { revealSectorSite } from "../../../src/sectors/siteDiscovery.js";
import { storeSector } from "../../../src/sectors/sectorGenerator.js";
import { persistResolution } from "../../../src/moves/persistResolution.js";
import { createLocation } from "../../../src/entities/location.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings._store.get(KEY);
/** The move pipeline's working copy — read at the move's start, a separate object. */
const pipelineSnapshot = () => JSON.parse(JSON.stringify(stored()));

const resolution = () => ({
  _id: "res-1", moveId: "face_danger", outcome: "strong_hit",
  consequences: { momentumChange: 0, healthChange: 0, spiritChange: 0, supplyChange: 0 },
});

async function seed() {
  const cs = {
    currentSessionId: "sess-1",
    sessionLogs:      { "sess-1": [] },
    pendingMove:      true,
    sectors:          [{ id: "s1", name: "Devil's Maw", region: "outlands", regionLabel: "Outlands", sceneId: null }],
    activeSectorId:   "s1",
    locationIds:      [],
    settlementIds:    [],
    connectionIds:    [],
  };
  await createLocation({ name: "Derelict Starship", type: "derelict", status: "unexplored", sectorId: "s1" }, cs, { persist: false });
  cs.sectors[0].mapData = {
    sectorId: "s1", settlements: [], passages: [],
    discoveries: [{ id: "site-1", name: "Derelict Starship", type: "derelict", discovered: false, actorId: cs.locationIds[0] }],
  };
  game.settings._store.set(KEY, cs);
}

describe("PROBE SO-01: persistResolution reverts sector writes made while the move resolved", () => {
  beforeEach(async () => {
    game.actors._reset();
    game.folders?._reset?.();
    _resetFolderCache();
    game.settings._store.clear();
    await seed();
  });

  it("!reveal-site during a move: the discovery survives the move's persist", async () => {
    const snapshot = pipelineSnapshot();

    // The GM's !reveal-site lands while the move is being narrated.
    const revealed = await revealSectorSite("Derelict Starship", { source: "manual" });
    expect(revealed?.site.id).toBe("site-1");
    expect(stored().sectors[0].mapData.discoveries[0].discovered).toBe(true);   // the reveal landed

    await persistResolution(resolution(), snapshot);

    // FAILS today: false — the move wrote back its pre-reveal `sectors`.
    expect(stored().sectors[0].mapData.discoveries[0].discovered).toBe(true);
  });

  it("a sector stored by the Sector Creator during a move survives the move's persist", async () => {
    const snapshot = pipelineSnapshot();

    // The creator's last step: storeSector writes the new record onto the store.
    const creatorCopy = pipelineSnapshot();
    await storeSector({
      id: "s2", name: "Sulaco Arch", region: "terminus", regionLabel: "Terminus",
      trouble: "", faction: null, settlements: [], createdAt: new Date().toISOString(),
      mapData: { sectorId: "s2", gridWidth: 10, gridHeight: 8, settlements: [], passages: [], discoveries: [] },
      connection: { id: "c-2", name: "Mira Vega", homeSettlement: "the sector" },
    }, { settlements: {}, connectionJournalId: null }, creatorCopy);
    expect(stored().sectors.map(s => s.id)).toEqual(["s1", "s2"]);   // the sector landed
    expect(stored().activeSectorId).toBe("s2");

    await persistResolution(resolution(), snapshot);

    // FAILS today: ["s1"] — the new sector record is gone, while
    // activeSectorId (store-owned) still names it.
    expect(stored().sectors.map(s => s.id)).toEqual(["s1", "s2"]);
    expect(stored().activeSectorId).toBe("s2");
  });

  it("control: the pipeline's own reveal (Finish an Expedition) rides its persist", async () => {
    const snapshot = pipelineSnapshot();
    // index.js finish branch: getState is the working copy, setState a no-op.
    const revealed = await revealSectorSite("Derelict Starship", {
      source: "expedition", getState: () => snapshot, setState: () => {},
    });
    expect(revealed?.site.id).toBe("site-1");

    await persistResolution(resolution(), snapshot);

    expect(stored().sectors[0].mapData.discoveries[0].discovered).toBe(true);
  });
});
