/**
 * STARFORGED COMPANION
 * tests/unit/sectorPanel.test.js
 *
 * The Sector Creator creates each generated sector once (issue #321 U46).
 * "✓ Create Sector" awaits the whole creation pipeline — entity Actors,
 * background art, narrator stubs, portraits, journal, Scene — which takes
 * minutes with art and stubs on, and the button stayed live: a second click
 * started a second full creation of the same sector (duplicate Actors, a
 * second Sector Record and Scene, double art/Claude spend).
 *
 * Two layers: the wizard holds Create / Re-generate disabled while a run is
 * in flight (released in a finally), and runSectorCreationPipeline is
 * idempotent per sector id — a call during a run joins it, a call for a
 * stored sector returns its record.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));
// storeSector records the sector trouble as a World Journal threat — not the subject here.
vi.mock("../../src/world/worldJournal.js", async () => {
  const actual = await vi.importActual("../../src/world/worldJournal.js");
  return { ...actual, recordThreat: vi.fn(async () => null) };
});

import { SectorCreatorApp, runSectorCreationPipeline } from "../../src/sectors/sectorPanel.js";
import { generateSector } from "../../src/sectors/sectorGenerator.js";
import { _resetFolderCache } from "../../src/entities/folder.js";

const MODULE = "starforged-companion";
const { chooseRegion, rerollSector, finalizeSector } = SectorCreatorApp.DEFAULT_OPTIONS.actions;

function makeScene() {
  const scene = {
    id: foundry.utils.randomID(),
    dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024 },
    update: vi.fn(async () => scene),
    createEmbeddedDocuments: vi.fn(async (_t, data) => data),
  };
  return scene;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const actorsOf = (entityType) =>
  game.actors.contents.filter(a => a.flags?.[MODULE]?.entityType === entityType);
// Stored records only — a failed run leaves createEntityJournals' bare
// {id, name} folder-lookup entry on the cached state, which is not a sector.
const storedSectors = () => (game.settings.get(MODULE, "campaignState").sectors ?? []).filter(s => s?.mapData);

/** The wizard's rendered markup for its current context (node env: a stub document). */
async function renderedHtml(app) {
  const prev = globalThis.document;
  globalThis.document = { createElement: () => ({}) };
  try {
    const el = await app._renderHTML(await app._prepareContext({}), {});
    return el.innerHTML;
  } finally {
    globalThis.document = prev;
  }
}

async function wizardOnOutlands() {
  const app = new SectorCreatorApp();
  await chooseRegion.call(app, {}, { dataset: { region: "outlands" } });
  return app;
}

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

describe("Sector Creator wizard — Create Sector runs once", () => {
  it("a second Create Sector click while the first run is in flight creates nothing more", async () => {
    const app = await wizardOnOutlands();

    // Click … click again before the first pipeline has finished.
    await Promise.all([
      finalizeSector.call(app, {}, {}),
      finalizeSector.call(app, {}, {}),
    ]);

    expect(global.Scene.create).toHaveBeenCalledTimes(1);
    expect(actorsOf("settlement")).toHaveLength(3);
    expect(actorsOf("connection")).toHaveLength(1);
    expect(game.settings.get(MODULE, "campaignState").settlementIds).toHaveLength(3);
    expect(storedSectors()).toHaveLength(1);
  });

  it("holds Create and Re-generate disabled while the creation runs; neither does anything meanwhile", async () => {
    const app  = await wizardOnOutlands();
    const hold = deferred();
    global.Scene.create = vi.fn(() => hold.promise);

    expect(await renderedHtml(app)).not.toMatch(/data-action="finalizeSector" disabled/);
    const run = finalizeSector.call(app, {}, {});
    await vi.waitFor(() => expect(global.Scene.create).toHaveBeenCalledTimes(1));   // mid-flight

    const html = await renderedHtml(app);
    expect(html).toMatch(/data-action="finalizeSector" disabled/);
    expect(html).toMatch(/data-action="rerollSector" disabled/);
    expect(html).toContain("Creating sector…");

    const sector = (await app._prepareContext({})).sector;
    await rerollSector.call(app, {}, {});
    await finalizeSector.call(app, {}, {});
    expect((await app._prepareContext({})).sector).toBe(sector);   // not re-rolled mid-creation

    hold.resolve(makeScene());
    await run;
    expect(global.Scene.create).toHaveBeenCalledTimes(1);
    expect(await renderedHtml(app)).not.toMatch(/disabled/);
  });

  it("a failed creation releases the guard, so Create can be retried", async () => {
    expectConsoleError(/Sector creation failed/);
    const app = await wizardOnOutlands();
    global.Scene.create = vi.fn(async () => { throw new Error("scene refused"); });

    await finalizeSector.call(app, {}, {});
    expect(storedSectors()).toHaveLength(0);
    expect((await app._prepareContext({})).busy).toBe(false);

    global.Scene.create = vi.fn(async () => makeScene());
    await finalizeSector.call(app, {}, {});
    expect(global.Scene.create).toHaveBeenCalledTimes(1);
    expect(storedSectors()).toHaveLength(1);
  });
});

describe("Sector Creator wizard — the starting settlement's zoom-in (issue #321 U50)", () => {
  it("previews the starting settlement's first look, initial contact and trouble, on its entry only", async () => {
    const app  = await wizardOnOutlands();
    const home = (await app._prepareContext({})).sector.settlements[0];
    const html = await renderedHtml(app);

    expect(html).toContain(
      `🔍 Starting settlement — First look: ${home.firstLook.join(", ")} · ` +
      `Initial contact: ${home.initialContact} · Trouble: ${home.trouble}`,
    );
    expect(html.match(/Starting settlement —/g)).toHaveLength(1);
  });
});

describe("runSectorCreationPipeline — idempotent per sector id", () => {
  it("a call while the same sector's creation runs joins it: one set of Actors, one Scene, one record", async () => {
    const sector = generateSector("outlands");
    const [a, b] = await Promise.all([runSectorCreationPipeline(sector), runSectorCreationPipeline(sector)]);

    expect(a).toBe(b);
    expect(a.id).toBe(sector.id);
    expect(global.Scene.create).toHaveBeenCalledTimes(1);
    expect(actorsOf("settlement")).toHaveLength(3);
    expect(actorsOf("connection")).toHaveLength(1);
    expect(storedSectors().filter(s => s.id === sector.id)).toHaveLength(1);
  });

  it("a call for a sector already stored returns its record and creates nothing", async () => {
    const sector = generateSector("expanse");
    const first  = await runSectorCreationPipeline(sector);
    const again  = await runSectorCreationPipeline(sector);

    expect(again).toEqual(first);
    expect(global.Scene.create).toHaveBeenCalledTimes(1);
    expect(actorsOf("settlement")).toHaveLength(2);
    expect(storedSectors()).toHaveLength(1);
  });

  it("a failed run is not stored, so the same sector can be created again", async () => {
    const sector = generateSector("expanse");
    global.Scene.create = vi.fn()
      .mockRejectedValueOnce(new Error("scene refused"))
      .mockImplementation(async () => makeScene());

    await expect(runSectorCreationPipeline(sector)).rejects.toThrow("scene refused");
    const stored = await runSectorCreationPipeline(sector);

    expect(stored.id).toBe(sector.id);
    expect(global.Scene.create).toHaveBeenCalledTimes(2);
    expect(storedSectors().filter(s => s.id === sector.id)).toHaveLength(1);
  });
});
