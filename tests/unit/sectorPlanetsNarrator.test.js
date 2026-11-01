/**
 * STARFORGED COMPANION
 * tests/unit/sectorPlanetsNarrator.test.js
 *
 * A generated sector's planets and stars reach the narrator (issue #321 U51).
 *
 * generateSettlement rolls a planet (type + name) for every orbital /
 * planetside settlement, and each settlement its own stellar object;
 * createEntityJournals keeps both on the settlement Actor's record
 * (`flags.settlement.planet` / `.stellar`) and the scene builder pins them on
 * the map. No planet entity is created, so the ACTIVE SECTOR "Known planets"
 * block (planet entities) stays empty for a generated sector — and nothing
 * else read the record's planet: the narrator never learned the world the
 * players saw pinned beside the settlement, and was free to invent another.
 *
 * Real producers throughout: generateSector → createEntityJournals →
 * applyStubsToSettlementEntities → storeSector, read back through the stored
 * campaignState by formatActiveSector and the settlement card.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));
vi.mock("../../src/world/worldJournal.js", async () => {
  const actual = await vi.importActual("../../src/world/worldJournal.js");
  return { ...actual, recordThreat: vi.fn(async () => null) };
});
vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

import {
  generateSector, createEntityJournals, storeSector, applyStubsToSettlementEntities,
} from "../../src/sectors/sectorGenerator.js";
import { formatActiveSector } from "../../src/narration/narrator.js";
import { formatEntityCard } from "../../src/narration/narratorPrompt.js";
import { getSettlement } from "../../src/entities/settlement.js";
import { _resetFolderCache } from "../../src/entities/folder.js";

const MODULE = "starforged-companion";

/** A generated (terminus) sector matching the predicate. */
function sectorWith(predicate) {
  for (let i = 0; i < 500; i += 1) {
    const s = generateSector("terminus");
    if (predicate(s)) return s;
  }
  throw new Error("no matching sector rolled in 500 tries");
}

async function storeRealSector(sector) {
  const cs = { sectors: [], settlementIds: [], connectionIds: [], locationIds: [], planetIds: [] };
  game.settings._store.set(`${MODULE}.campaignState`, cs);
  const entityData = await createEntityJournals(sector, cs);
  const stubs = { sector: null, settlements: Object.fromEntries(sector.settlements.map(s => [s.id, "A wind-scoured outpost."])) };
  await applyStubsToSettlementEntities(entityData.settlements, stubs);
  await storeSector(sector, { ...entityData, stubs }, cs);
  return entityData.settlements;
}

describe("a generated sector's planets and stars reach the narrator", () => {
  beforeEach(() => {
    game.actors._reset();
    game.folders._reset();
    _resetFolderCache();
    game.settings._store.clear();
  });

  it("the active sector roster and the settlement's card name its rolled planet and stellar object", async () => {
    const sector  = sectorWith(s => s.settlements.some(x => x.planet));
    const actors  = await storeRealSector(sector);
    const gen     = sector.settlements.find(x => x.planet);
    const planet  = `${gen.planet.name} (${gen.planet.type})`;

    const anchor = formatActiveSector(game.settings.get(MODULE, "campaignState"));
    const line   = anchor.split("\n").find(l => l.startsWith(`- ${gen.name} (`));
    expect(line).toBeTruthy();                                      // the settlement is anchored
    expect(line).toContain(`Planet: ${planet}`);
    expect(line).toContain(`Stellar object: ${gen.stellar}`);

    const card = formatEntityCard(getSettlement(actors[gen.id].id), "settlement");
    expect(card).toContain(`Planet: ${planet}`);
    expect(card).toContain(`Stellar object: ${gen.stellar}`);
  });

  it("a deep-space settlement names its stellar object and no planet", async () => {
    const sector = sectorWith(s => s.settlements.some(x => !x.planet));
    const actors = await storeRealSector(sector);
    const gen    = sector.settlements.find(x => !x.planet);

    const anchor = formatActiveSector(game.settings.get(MODULE, "campaignState"));
    const line   = anchor.split("\n").find(l => l.startsWith(`- ${gen.name} (`));
    expect(line).toContain(`Stellar object: ${gen.stellar}`);
    expect(line).not.toContain("Planet:");

    const card = formatEntityCard(getSettlement(actors[gen.id].id), "settlement");
    expect(card).not.toContain("Planet:");
  });
});
