/**
 * PROBE (thirteenth audit, area: ui / sectors) — UI-1
 *
 * A sector background upload that stalls wedges the whole sector creation.
 *
 * src/net/fetchWithTimeout.js states the rule the v1.7.23 hang taught: "Every
 * external network call in the module must be bounded … a stall is not a
 * throw." The OpenRouter request and the image download are bounded. The
 * upload that follows them is not: sectorArt.js uploadSectorImage awaits
 * FilePicker.upload (a plain HTTP POST to the Foundry server; on The Forge an
 * HTTPS call to its Assets Library) with no deadline. createSector awaits it
 * inside its Promise.all, before the Sector Record journal and the Scene.
 *
 * So a stalled upload: the settlement / connection / site Actors exist, the
 * Scene and the journal are never built, the sector is never stored, the
 * wizard stays "◈ Creating sector…" (#busy is released in a finally that
 * never runs), `creationsInFlight` keeps the sector's entry (its .finally
 * never runs) so every later call for that sector joins the dead run, and
 * nothing is logged after "sectorArt: starting". The v1.7.23 shape.
 *
 * Expected (asserted): sector creation settles within a bound even when the
 * upload never answers — degraded to "no background", as every other art
 * failure is — and the Scene is built.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));
vi.mock("../../../src/world/worldJournal.js", async () => {
  const actual = await vi.importActual("../../../src/world/worldJournal.js");
  return { ...actual, recordThreat: vi.fn(async () => null) };
});
// The image request itself answers at once — it is bounded (fetchWithTimeout)
// and not the subject here.
vi.mock("../../../src/art/openRouterImage.js", () => ({
  generateOpenRouterImage: vi.fn(async () => "iVBORw0KGgo="),
}));

import { SectorCreatorApp, runSectorCreationPipeline } from "../../../src/sectors/sectorPanel.js";
import { generateSector } from "../../../src/sectors/sectorGenerator.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";

const MODULE = "starforged-companion";
const { chooseRegion, finalizeSector } = SectorCreatorApp.DEFAULT_OPTIONS.actions;
const THIRTY_MINUTES = 30 * 60_000;

function makeScene() {
  const scene = {
    id: foundry.utils.randomID(),
    dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024 },
    update: vi.fn(async () => scene),
    createEmbeddedDocuments: vi.fn(async (_t, data) => data),
  };
  return scene;
}

const actorsOf = (entityType) =>
  game.actors.contents.filter(a => a.flags?.[MODULE]?.entityType === entityType);
const storedSectors = () => (game.settings.get(MODULE, "campaignState").sectors ?? []).filter(s => s?.mapData);

let fp;
let origUpload;

beforeEach(() => {
  game.actors._reset();
  game.folders._reset();
  _resetFolderCache();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE}.campaignState`, { sectors: [], settlementIds: [], connectionIds: [], locationIds: [] });
  // Background art on (its default), with a key; stubs and portraits off so
  // the one network step left in the pipeline is the background's.
  game.settings._store.set(`${MODULE}.sectorArtEnabled`, true);
  game.settings._store.set(`${MODULE}.openRouterApiKey`, "sk-or-test");
  game.settings._store.set(`${MODULE}.sectorNarratorStubsEnabled`, false);
  game.settings._store.set(`${MODULE}.sectorEntityPortraitsEnabled`, false);
  global.Scene = { create: vi.fn(async () => makeScene()) };
  fp = globalThis.foundry.applications.apps.FilePicker.implementation;
  fp._reset();
  origUpload = fp.upload;
});

afterEach(() => {
  fp.upload = origUpload;
  vi.useRealTimers();
});

describe("sector creation with background art", () => {
  it("control: an upload that answers — the sector is created with its background and Scene", async () => {
    const sector = generateSector("outlands");
    const stored = await runSectorCreationPipeline(sector);

    expect(stored.backgroundPath).toBe(`worlds/test-world/scenes/sector-${sector.id}.png`);
    expect(global.Scene.create).toHaveBeenCalledTimes(1);
    expect(storedSectors()).toHaveLength(1);
  });

  it("an upload that never answers does not hold the creation forever: it settles and the Scene is built", async () => {
    vi.useFakeTimers();
    let uploads = 0;
    fp.upload = () => { uploads += 1; return new Promise(() => {}); };   // the request stalls: no answer, no error

    const sector = generateSector("outlands");
    let settled = false;
    const run = runSectorCreationPipeline(sector);
    run.then(() => { settled = true; }, () => { settled = true; });

    await vi.advanceTimersByTimeAsync(THIRTY_MINUTES);

    // Where the run is: the upload was reached and the Actors were made.
    expect(uploads).toBe(1);
    expect(actorsOf("settlement")).toHaveLength(3);

    // Half an hour on, the creation has settled one way or the other …
    expect(settled).toBe(true);
    // … and the map was built (no background is a degraded sector, not none).
    expect(global.Scene.create).toHaveBeenCalledTimes(1);
  });

  it("the wizard's Create is not left disabled, and the sector is not left joining a dead run", async () => {
    vi.useFakeTimers();
    fp.upload = () => new Promise(() => {});

    const app = new SectorCreatorApp();
    await chooseRegion.call(app, {}, { dataset: { region: "outlands" } });
    const sector = (await app._prepareContext({})).sector;

    let clickSettled = false;
    finalizeSector.call(app, {}, {}).then(() => { clickSettled = true; }, () => { clickSettled = true; });
    await vi.advanceTimersByTimeAsync(THIRTY_MINUTES);

    expect(clickSettled).toBe(true);
    expect((await app._prepareContext({})).busy).toBe(false);

    // A later call for the same sector is a new attempt (or the stored
    // sector), not the run that will never finish.
    let retrySettled = false;
    fp.upload = origUpload;
    runSectorCreationPipeline(sector).then(() => { retrySettled = true; }, () => { retrySettled = true; });
    await vi.advanceTimersByTimeAsync(THIRTY_MINUTES);
    expect(retrySettled).toBe(true);
  });
});
