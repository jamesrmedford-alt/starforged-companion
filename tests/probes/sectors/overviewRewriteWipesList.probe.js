/**
 * PROBE — SECTOR-OVERVIEW-LIST-WIPED
 *
 * rewriteSectorOverviewSettlements (src/sectors/sectorOverview.js) rebuilds the
 * Settlements list from `sector.settlements`, but the record storeSector
 * persists to campaignState.sectors[] carries no `settlements` array (only
 * mapData.settlements + entityJournalIds). In production the rewrite therefore
 * renders an EMPTY <ul> and writes it over the real list.
 *
 * Fixture state comes from the real producers: generateSector →
 * createEntityJournals → createSectorJournal → storeSector, exactly as
 * runSectorCreationPipeline sequences them.
 *
 * These assertions describe the CORRECT behaviour and fail today.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));
// The sector-trouble threat write is irrelevant here; keep the WJ out of it.
vi.mock("../../../src/world/worldJournal.js", () => ({ recordThreat: vi.fn(async () => null) }));

import {
  generateSector,
  createEntityJournals,
  createSectorJournal,
  storeSector,
} from "../../../src/sectors/sectorGenerator.js";
import {
  rewriteSectorOverviewSettlements,
  registerSectorOverviewSync,
  _flushPendingRewrites,
} from "../../../src/sectors/sectorOverview.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";

const MODULE = "starforged-companion";

// A journal collection + JournalEntry.create that keep their pages, so the
// real createSectorJournal writes a real overview page we can read back.
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
      id:    foundry.utils.randomID(),
      name:  data.name,
      flags: data.flags ?? {},
      pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
      createEmbeddedDocuments: async (_type, docs) => {
        const made = docs.map(d => {
          const page = {
            id: foundry.utils.randomID(),
            name: d.name,
            text: { ...(d.text ?? {}) },
            update: async (changes) => {
              for (const [path, val] of Object.entries(changes)) {
                const parts = path.split(".");
                let cur = page;
                for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
                cur[parts[parts.length - 1]] = val;
              }
            },
          };
          pages.push(page);
          return page;
        });
        return made;
      },
    };
    journals.push(journal);
    return journal;
  };
  return () => { global.game.journal = prevJournal; global.JournalEntry.create = prevCreate; };
}

async function buildRealSector() {
  const sector = generateSector("outlands");
  // runSectorCreationPipeline hands createEntityJournals the setting's object.
  const campaignState = { sectors: [], settlementIds: [], connectionIds: [], locationIds: [] };
  game.settings._store.set(`${MODULE}.campaignState`, campaignState);

  const entityData = await createEntityJournals(sector, campaignState);
  const journal    = await createSectorJournal(sector, { sector: "A grim stretch of frontier.", settlements: {} }, entityData.settlements);
  await storeSector(sector, {
    settlements:         entityData.settlements,
    connectionJournalId: entityData.connectionJournalId,
    sites:               entityData.sites,
    sceneId:             null,
    sectorJournalId:     journal?.id ?? null,
    stubs:               { sector: null, settlements: {} },
  }, campaignState);

  const page = journal.pages.contents[0];
  const actors = Object.values(entityData.settlements).filter(Boolean);
  return { sector, journal, page, actors };
}

describe("PROBE SECTOR-OVERVIEW-LIST-WIPED", () => {
  let restore;
  beforeEach(() => {
    game.actors._reset();
    game.folders._reset();
    _resetFolderCache();
    game.settings._store.clear();
    restore = installJournalHarness();
  });
  afterEach(() => restore?.());

  it("the record storeSector persists still lets the rewrite list every settlement", async () => {
    const { sector, page, actors } = await buildRealSector();
    expect(actors.length).toBe(3);
    // Sanity: the freshly created overview links each settlement Actor.
    for (const a of actors) expect(page.text.content).toContain(`@UUID[Actor.${a.id}]`);

    const stored = game.settings.get(MODULE, "campaignState");
    await rewriteSectorOverviewSettlements(sector.id, stored);

    // CORRECT: the list still names every settlement after a rewrite.
    for (const a of actors) expect(page.text.content).toContain(`@UUID[Actor.${a.id}]`);
    expect(page.text.content).not.toMatch(/<!-- sf:settlements-list --><ul><\/ul>/);
  });

  it("renaming a sector settlement Actor (the live updateActor sync) keeps the list, renamed", async () => {
    const { page, actors } = await buildRealSector();
    registerSectorOverviewSync();

    const target = actors[0];
    target.name = "Bleak Hold Station";                // GM renames the Actor on its sheet
    Hooks.call("updateActor", target, { name: "Bleak Hold Station", _id: target.id });
    await _flushPendingRewrites();

    // CORRECT: the renamed settlement is listed under its new name, the others remain.
    expect(page.text.content).toContain(`@UUID[Actor.${target.id}]{Bleak Hold Station}`);
    for (const a of actors.slice(1)) expect(page.text.content).toContain(`@UUID[Actor.${a.id}]`);
  });
});
