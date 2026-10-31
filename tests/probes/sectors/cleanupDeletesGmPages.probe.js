/**
 * PROBE — SECTOR-RECORD-CLEANUP-DELETES-GM-PAGES
 *
 * cleanupSectorRecordPages (src/sectors/sectorOverview.js), run for every
 * sector by `!migrate-entities` (help: "Idempotent — safe to run multiple
 * times"), deletes EVERY page of the "<Sector> — Sector Record" journal except
 * the overview — not just the legacy per-settlement pages it exists to remove.
 * A page the GM added to that journal (rumours, prep notes) is deleted on every
 * run.
 *
 * The journal comes from the real createSectorJournal. Asserts the CORRECT
 * behaviour; fails today.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));

import { generateSector, createSectorJournal } from "../../../src/sectors/sectorGenerator.js";
import { cleanupSectorRecordPages } from "../../../src/sectors/sectorOverview.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";

function installJournalHarness() {
  const journals = [];
  const prevJournal = global.game.journal;
  const prevCreate  = global.JournalEntry.create;
  global.game.journal = {
    get:     (id) => journals.find(j => j.id === id) ?? null,
    getName: (n)  => journals.find(j => j.name === n) ?? null,
    find:    (fn) => journals.find(fn) ?? null,
    [Symbol.iterator]() { return journals[Symbol.iterator](); },
  };
  global.JournalEntry.create = async (data) => {
    const pages = [];
    const journal = {
      id: foundry.utils.randomID(), name: data.name, flags: data.flags ?? {},
      pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
      createEmbeddedDocuments: async (_type, docs) => docs.map(d => {
        const page = {
          id: foundry.utils.randomID(), name: d.name, text: { ...(d.text ?? {}) },
          delete: async () => { pages.splice(pages.indexOf(page), 1); },
        };
        pages.push(page);
        return page;
      }),
    };
    journals.push(journal);
    return journal;
  };
  return () => { global.game.journal = prevJournal; global.JournalEntry.create = prevCreate; };
}

describe("PROBE SECTOR-RECORD-CLEANUP-DELETES-GM-PAGES", () => {
  let restore;
  beforeEach(() => { game.folders._reset(); _resetFolderCache(); restore = installJournalHarness(); });
  afterEach(() => restore?.());

  it("!migrate-entities' page cleanup leaves a page the GM wrote in the sector record", async () => {
    const sector  = generateSector("terminus");
    const journal = await createSectorJournal(sector, { sector: "Stub.", settlements: {} }, {});
    // The GM adds their own page to the sector record.
    await journal.createEmbeddedDocuments("JournalEntryPage", [{ name: "Rumours", type: "text", text: { content: "<p>The Hegemony is coming.</p>" } }]);

    const campaignState = { sectors: [{ id: sector.id, name: sector.name, mapData: sector.mapData }] };
    const deleted = await cleanupSectorRecordPages(sector.id, campaignState);

    expect.soft(deleted).toBe(0);                                                   // today: 1
    expect.soft(journal.pages.contents.map(p => p.name)).toContain("Rumours");     // today: gone
  });
});
