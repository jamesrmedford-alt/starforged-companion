/**
 * STARFORGED COMPANION
 * tests/unit/sectorRecordNamesNoConnection.test.js
 *
 * Issue #364 SECTOR-CONNECTION-ID-UNREAD. A sector record carried a
 * `connectionId` — the id of the sector's local connection, written when the
 * sector was generated — that no production code read (the Quench suite
 * asserted it at creation; the NPC-delete teardown cleared it only so the
 * record stayed truthful). A field with a writer and no reader is retired
 * (rules/reachability.md §1): the generator no longer writes it.
 *
 * The connection itself is still created and listed — in
 * `campaignState.connectionIds`, the canonical list, which every reader uses
 * — and it still carries the sector's id on its own record.
 *
 * Through the real generate → create entities → store chain.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));
// storeSector records the sector trouble as a World Journal threat — not the subject here.
vi.mock("../../src/world/worldJournal.js", async () => {
  const actual = await vi.importActual("../../src/world/worldJournal.js");
  return { ...actual, recordThreat: vi.fn(async () => null) };
});

import { generateSector, createEntityJournals, storeSector } from "../../src/sectors/sectorGenerator.js";
import { getConnection } from "../../src/entities/connection.js";
import { _resetFolderCache } from "../../src/entities/folder.js";

const MODULE = "starforged-companion";
const stored = () => game.settings.get(MODULE, "campaignState");

describe("a generated sector record names no connection (issue #364 SECTOR-CONNECTION-ID-UNREAD)", () => {
  let sector, entityData, record;

  beforeEach(async () => {
    game.actors._reset();
    game.folders._reset();
    _resetFolderCache();
    // Sector creation hands its producers a copy of the stored campaignState.
    const campaignState = { sectors: [], settlementIds: [], connectionIds: [], locationIds: [] };
    game.settings._store.set(`${MODULE}.campaignState`, { ...campaignState });

    sector     = generateSector("expanse");
    entityData = await createEntityJournals(sector, campaignState);
    record     = await storeSector(sector, {
      settlements: entityData.settlements,
      sites:       entityData.sites,
      stubs:       { sector: null, settlements: {} },
    }, campaignState);
  });

  it("the record storeSector returns and the one the world stores carry no connectionId", () => {
    expect(Object.hasOwn(record, "connectionId")).toBe(false);
    const inStore = stored().sectors.find(s => s.id === sector.id);
    expect(inStore).toBeTruthy();
    expect(Object.hasOwn(inStore, "connectionId")).toBe(false);
  });

  it("the sector's connection is still created, listed in connectionIds, and knows its sector", () => {
    const connectionId = entityData.connectionJournalId;
    expect(connectionId).toBeTruthy();
    expect(stored().connectionIds).toEqual([connectionId]);
    expect(getConnection(connectionId)?.name).toBe(sector.connection.name);
    expect(getConnection(connectionId)?.sectorId).toBe(sector.id);
  });

  it("the settlements the record does list are the ones created", () => {
    const inStore = stored().sectors.find(s => s.id === sector.id);
    const settlementIds = Object.values(entityData.settlements).map(a => a?.id).filter(Boolean);
    expect(inStore.settlementIds).toEqual(settlementIds);
    expect(inStore.settlementIds.length).toBeGreaterThan(0);
  });
});
