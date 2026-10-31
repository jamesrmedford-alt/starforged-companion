/**
 * PROBE — SECTOR-PLANETS-NARRATOR-DARK
 *
 * Step "generate planet details": generateSettlement rolls a planet (type +
 * name) for every orbital / planetside settlement; createEntityJournals stores
 * it only as `flags.settlement.planet` on the settlement Actor, and the scene
 * builder pins it on the map. No planet entity is created, and nothing in
 * production reads `settlement.planet` after creation:
 *   - formatActiveSector's "Known planets" block lists planet ENTITIES
 *     (listPlanets / planetIds) — empty for a generated sector;
 *   - the settlement entity card's fields are location / population /
 *     authority / firstLook / description / notes — no planet;
 *   - composeSettlementDescription's facts line omits the planet.
 * So the narrator never learns the world the players see pinned beside the
 * settlement, and is free to invent a different one.
 *
 * Real producers throughout. Asserts the CORRECT behaviour; fails today.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));
vi.mock("../../../src/world/worldJournal.js", async () => {
  const actual = await vi.importActual("../../../src/world/worldJournal.js");
  return { ...actual, recordThreat: vi.fn(async () => null) };
});
vi.mock("../../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

import {
  generateSector, createEntityJournals, storeSector, applyStubsToSettlementEntities,
} from "../../../src/sectors/sectorGenerator.js";
import { formatActiveSector } from "../../../src/narration/narrator.js";
import { formatEntityCard } from "../../../src/narration/narratorPrompt.js";
import { getSettlement } from "../../../src/entities/settlement.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";

const MODULE = "starforged-companion";

function sectorWithAPlanet() {
  for (let i = 0; i < 200; i++) {
    const s = generateSector("terminus");
    if (s.settlements.some(x => x.planet)) return s;
  }
  throw new Error("no planet rolled in 200 sectors");
}

describe("PROBE SECTOR-PLANETS-NARRATOR-DARK", () => {
  beforeEach(() => {
    game.actors._reset();
    game.folders._reset();
    _resetFolderCache();
    game.settings._store.clear();
  });

  it("the narrator's sector anchor or the settlement's card names the settlement's rolled planet", async () => {
    const sector = sectorWithAPlanet();
    const cs = { sectors: [], settlementIds: [], connectionIds: [], locationIds: [], planetIds: [] };
    game.settings._store.set(`${MODULE}.campaignState`, cs);
    const entityData = await createEntityJournals(sector, cs);
    const stubs = { sector: null, settlements: Object.fromEntries(sector.settlements.map(s => [s.id, "A wind-scoured outpost."])) };
    await applyStubsToSettlementEntities(entityData.settlements, stubs);
    await storeSector(sector, { ...entityData, stubs }, cs);

    const genSettlement = sector.settlements.find(x => x.planet);
    const actor  = entityData.settlements[genSettlement.id];
    const anchor = formatActiveSector(game.settings.get(MODULE, "campaignState"));
    const card   = formatEntityCard(getSettlement(actor.id), "settlement");

    expect(anchor).toContain(genSettlement.name);                       // sanity: the settlement is anchored
    expect(`${anchor}\n${card}`).toContain(genSettlement.planet.name);  // today: absent from both
  });
});
