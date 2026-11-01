/**
 * STARFORGED COMPANION
 * tests/unit/sectorNpcRolls.test.js
 *
 * Issue #322 V27 (the audit's sectorNpcRollsDropped probe,
 * SECTOR-NPC-ROLLS-DROPPED): generateConnection rolls the sector connection's
 * Initial Disposition (`aspect`) and First Look, but createEntityJournals
 * passed only name / role / goal / rank / location / sectorId to
 * createConnection — the two rolls reached no store. The narrator's sector
 * roster reads `disposition` / `firstLook` off the record, and ✦ Finalise
 * (seedConnectionActor) re-rolls whatever is blank, so the generator's values
 * were never used, though decisions.md ("NPC card population") says Finalise
 * reuses them. The record carries them now, and Finalise keeps them.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));

import { generateSector, createEntityJournals } from "../../src/sectors/sectorGenerator.js";
import { getConnection, seedConnectionActor } from "../../src/entities/connection.js";
import { _resetFolderCache } from "../../src/entities/folder.js";

describe("the sector connection keeps the rolls the generator made (SECTOR-NPC-ROLLS-DROPPED)", () => {
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

    expect(record?.disposition).toBe(sector.connection.aspect);              // was undefined
    const firstLook = Array.isArray(record?.firstLook) ? record.firstLook[0] : record?.firstLook;
    expect(firstLook).toBe(sector.connection.firstLook[0]);                 // was undefined

    // ✦ Finalise reuses them: it re-rolls only what is blank.
    const seeded = await seedConnectionActor(game.actors.get(connectionJournalId), cs);
    expect(seeded?.disposition).toBe(sector.connection.aspect);
    expect(seeded?.firstLook?.[0]).toBe(sector.connection.firstLook[0]);
  });
});
