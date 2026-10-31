/**
 * PROBE — SECTOR-NPC-ROLLS-DROPPED
 *
 * generateConnection (src/sectors/sectorGenerator.js) rolls the local
 * connection's Initial Disposition (`aspect`) and First Look, but
 * createEntityJournals passes only name / role / goal / rank / location /
 * sectorId to createConnection — the two rolls reach no store. The narrator's
 * sector roster (formatSectorNpcProfile) reads `disposition` / `firstLook` off
 * the record, and ✦ Finalise (seedConnectionActor) re-rolls whatever is blank,
 * so the generated values are never used (decisions.md, NPC card population:
 * "reuses the oracle rolls generateConnection() already performs (role / goal
 * / disposition / first look / name)").
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));

import { generateSector, createEntityJournals } from "../../../src/sectors/sectorGenerator.js";
import { getConnection } from "../../../src/entities/connection.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";

describe("PROBE SECTOR-NPC-ROLLS-DROPPED", () => {
  beforeEach(() => {
    game.actors._reset();
    game.folders._reset();
    _resetFolderCache();
  });

  it("the sector connection record carries the disposition and first look the generator rolled", async () => {
    const sector = generateSector("expanse");
    expect(sector.connection.aspect).toBeTruthy();
    expect(sector.connection.firstLook?.[0]).toBeTruthy();

    const cs = { sectors: [], settlementIds: [], connectionIds: [], locationIds: [] };
    const { connectionJournalId } = await createEntityJournals(sector, cs);
    const record = getConnection(connectionJournalId);

    expect.soft(record?.disposition).toBe(sector.connection.aspect);              // today: undefined
    const firstLook = Array.isArray(record?.firstLook) ? record.firstLook[0] : record?.firstLook;
    expect.soft(firstLook).toBe(sector.connection.firstLook[0]);                 // today: undefined
  });
});
