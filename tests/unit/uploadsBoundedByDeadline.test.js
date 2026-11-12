/**
 * STARFORGED COMPANION
 * tests/unit/uploadsBoundedByDeadline.test.js
 *
 * Issue #347 AB02 (UPLOADS-UNBOUNDED; the audit's sectorCreateUploadStall and
 * audioSynthInFlightWedged probes). src/net/fetchWithTimeout.js states the
 * rule the v1.7.23 hang taught: "Every external network call in the module
 * must be bounded … a stall is not a throw." The image requests were; the
 * FilePicker requests after them were not — Foundry's own upload,
 * createDirectory and browse have no deadline, and one the server never
 * answers neither resolves nor rejects:
 *
 *   - sector creation awaited the background upload inside its Promise.all:
 *     the Sector Record and the Scene were never built, the wizard stayed on
 *     "Creating sector…", and every later call for that sector joined the run
 *     that would never finish;
 *   - the audio GM kept the clip's entry in its in-flight map for the rest of
 *     the page load, so every later request and Play of the clip joined a
 *     wait that never ended, and AA61's held-bytes retry was never reached;
 *   - the deck plan waited forever on its upload.
 *
 * Every FilePicker request now goes through withFilePickerDeadline: an
 * unanswered one fails after FILE_PICKER_TIMEOUT_MS, where each site's own
 * failure path takes over. (The portrait's upload: portraitUploadStall.test.js.)
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));
vi.mock("../../src/world/worldJournal.js", async () => {
  const actual = await vi.importActual("../../src/world/worldJournal.js");
  return { ...actual, recordThreat: vi.fn(async () => null) };
});
// The image request answers at once — it is bounded (fetchWithTimeout) and
// not the subject here.
vi.mock("../../src/art/openRouterImage.js", () => ({
  generateOpenRouterImage: vi.fn(async () => "iVBORw0KGgo="),
}));
vi.mock("../../src/audio/elevenlabs.js", () => ({ synthesise: vi.fn() }));

import { withFilePickerDeadline, FILE_PICKER_TIMEOUT_MS } from "../../src/net/uploadResult.js";
import { SectorCreatorApp, runSectorCreationPipeline } from "../../src/sectors/sectorPanel.js";
import { generateSector } from "../../src/sectors/sectorGenerator.js";
import { _resetFolderCache } from "../../src/entities/folder.js";
import { generateShipMapBackground } from "../../src/moves/shipMapArt.js";
import { registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from "../../src/audio/index.js";
import { cacheKey, _resetAudioCacheStateForTests } from "../../src/audio/cache.js";
import { synthesise } from "../../src/audio/elevenlabs.js";

const MODULE = "starforged-companion";
const THIRTY_MINUTES = 30 * 60_000;
// Far past any deadline a request is given — the site tests need no export of
// the fix's, so with the fix out they fail on their own assertions.
const PAST_DEADLINE = THIRTY_MINUTES;
const fp = () => globalThis.foundry.applications.apps.FilePicker.implementation;
const never = () => new Promise(() => {});   // a request the server never answers: no answer, no error
const realSetTimeout = globalThis.setTimeout;

let origUpload;
beforeEach(() => {
  fp()._reset();
  origUpload = fp().upload;
});
afterEach(() => {
  fp().upload = origUpload;
  vi.useRealTimers();
});

describe("withFilePickerDeadline", () => {
  it("resolves with what the request answered", async () => {
    await expect(withFilePickerDeadline(Promise.resolve({ path: "worlds/w/x.png" }))).resolves.toEqual({ path: "worlds/w/x.png" });
  });

  it("passes the request's own failure through", async () => {
    await expect(withFilePickerDeadline(Promise.reject(new Error("413")))).rejects.toThrow("413");
  });

  it("fails, labelled, once the deadline passes with no answer", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let outcome = null;
    withFilePickerDeadline(never(), { label: "Sector background upload" })
      .then(() => { outcome = "resolved"; }, (err) => { outcome = err.message; });
    await vi.advanceTimersByTimeAsync(FILE_PICKER_TIMEOUT_MS - 1_000);
    expect(outcome, "still waiting before the deadline").toBeNull();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(outcome).toBe(`Sector background upload timed out after ${FILE_PICKER_TIMEOUT_MS / 1000}s`);
    warn.mockRestore();
  });
});

describe("sector creation with background art", () => {
  function makeScene() {
    const scene = {
      id: foundry.utils.randomID(),
      dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024 },
      update: vi.fn(async () => scene),
      createEmbeddedDocuments: vi.fn(async (_t, data) => data),
    };
    return scene;
  }
  const { chooseRegion, finalizeSector } = SectorCreatorApp.DEFAULT_OPTIONS.actions;
  const actorsOf = (entityType) =>
    game.actors.contents.filter(a => a.flags?.[MODULE]?.entityType === entityType);
  const storedSectors = () => (game.settings.get(MODULE, "campaignState").sectors ?? []).filter(s => s?.mapData);

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
  });

  it("control: an upload that answers — the sector is created with its background and Scene", async () => {
    const sector = generateSector("outlands");
    const stored = await runSectorCreationPipeline(sector);

    expect(stored.backgroundPath).toBe(`worlds/test-world/scenes/sector-${sector.id}.png`);
    expect(global.Scene.create).toHaveBeenCalledTimes(1);
    expect(storedSectors()).toHaveLength(1);
  });

  it("an upload that never answers does not hold the creation forever: it settles, says so, and the Scene is built", async () => {
    vi.useFakeTimers();
    let uploads = 0;
    fp().upload = () => { uploads += 1; return never(); };
    const notify = vi.spyOn(ui.notifications, "error");

    const sector = generateSector("outlands");
    let settled = false;
    let stored = null;
    runSectorCreationPipeline(sector).then((s) => { settled = true; stored = s; }, () => { settled = true; });

    await vi.advanceTimersByTimeAsync(THIRTY_MINUTES);

    // Where the run is: the upload was reached and the Actors were made.
    expect(uploads).toBe(1);
    expect(actorsOf("settlement")).toHaveLength(3);

    // Half an hour on, the creation has settled …
    expect(settled).toBe(true);
    // … the map was built (no background is a degraded sector, not none) …
    expect(global.Scene.create).toHaveBeenCalledTimes(1);
    expect(stored?.backgroundPath ?? null).toBeNull();
    expect(storedSectors()).toHaveLength(1);
    // … and the GM was told the upload failed, as for any other upload failure.
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/upload failed: Sector background upload timed out/), expect.anything());
    notify.mockRestore();
  });

  it("the wizard's Create is not left disabled, and the sector is not left joining a dead run", async () => {
    vi.useFakeTimers();
    fp().upload = () => never();

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
    fp().upload = origUpload;
    runSectorCreationPipeline(sector).then(() => { retrySettled = true; }, () => { retrySettled = true; });
    await vi.advanceTimersByTimeAsync(THIRTY_MINUTES);
    expect(retrySettled).toBe(true);
  });
});

describe("the deck plan", () => {
  beforeEach(() => {
    game.settings._store.set(`${MODULE}.openRouterApiKey`, "sk-or-test");
    game.settings._store.set(`${MODULE}.shipMapArtEnabled`, true);
  });

  it("control: an upload that answers yields its path", async () => {
    const result = await generateShipMapBackground({ type: "Courier", firstLook: "scarred hull", name: "Wren" }, { id: "ship-1" });
    expect(result?.path).toMatch(/scenes\/.+\.png$/);
  });

  it("an upload that never answers yields no art once the deadline passes — the schematic backdrop stands", async () => {
    vi.useFakeTimers();
    fp().upload = () => never();
    let result;
    let settled = false;
    generateShipMapBackground({ type: "Courier", firstLook: "scarred hull", name: "Wren" }, { id: "ship-1" })
      .then((r) => { result = r; settled = true; });
    await vi.advanceTimersByTimeAsync(PAST_DEADLINE);
    expect(settled).toBe(true);
    expect(result).toBeNull();
  });
});

describe("the audio GM and a cache upload that never answers", () => {
  const PROSE = "The hull groans and holds.";
  const SPEC = { voiceId: "voice-narrator", modelId: "eleven_flash_v2_5", text: PROSE, speed: 1 };
  const cachePath = (hash) => `worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`;
  const AUDIO_SETTINGS = {
    "audio.enabled": true, "audio.clientEnabled": true,
    "audio.narratorVoiceId": "voice-narrator", "audio.npcVoiceId": "voice-npc",
    elevenLabsApiKey: "sk_gm_key",                      // this GM holds the key: the audio GM
  };
  let savedMessages;

  beforeEach(() => {
    _resetAudioCacheStateForTests();
    _resetSynthStateForTests();
    vi.mocked(synthesise).mockReset();
    vi.mocked(synthesise).mockImplementation(async () => new ArrayBuffer(16));
    for (const [key, value] of Object.entries(AUDIO_SETTINGS)) game.settings._store.set(`${MODULE}.${key}`, value);
    savedMessages = game.messages;
    game.messages = { contents: [{ id: "msg-1", flags: { [MODULE]: { narratorCard: true, narrationText: PROSE } } }] };
    game.socket._reset();
    registerAudioSocket();
  });
  afterEach(() => {
    game.messages = savedMessages;
    game.socket._reset();
    for (const k of Object.keys(AUDIO_SETTINGS)) game.settings._store.delete(`${MODULE}.${k}`);
  });

  /** A keyless player's client asks the audio GM for the clip. Not awaited: the handler may never settle. */
  function playerRequests(hash) {
    for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) {
      Promise.resolve(h({ kind: "audio.synth.request", hash, spec: SPEC })).catch(() => {});
    }
  }
  const doneSignals = () => (game.socket._emitted ?? []).filter(e => e.payload?.kind === "audio.synth.done");
  // Real turns of the event loop (the clip key is a crypto.subtle digest), on
  // the real clock even while the test's fake one holds the upload deadline.
  const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(r => realSetTimeout(r, 0)); };

  it("control: a request is answered with the cached path; a retry is served from the cache", async () => {
    const hash = await cacheKey(SPEC);
    playerRequests(hash);
    await settle();
    playerRequests(hash);
    await settle();
    expect(doneSignals().map(e => e.payload.path)).toEqual([cachePath(hash), cachePath(hash)]);
    expect(synthesise).toHaveBeenCalledTimes(1);
  });

  it("a player's retry, after an upload that never answered, is answered — and the clip is not paid for again", async () => {
    const hash = await cacheKey(SPEC);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let uploads = 0;
    fp().upload = vi.fn((...args) => (uploads++ === 0 ? never() : origUpload(...args)));   // only the first stalls

    playerRequests(hash);
    await settle();
    expect(synthesise, "the clip was made — and billed (setup)").toHaveBeenCalledTimes(1);
    expect(fp().upload, "its upload was sent and is unanswered (setup)").toHaveBeenCalledTimes(1);
    expect(doneSignals(), "nothing answered while the upload is out").toHaveLength(0);

    // The upload's deadline passes: the first request is answered — the clip
    // was made, not saved — and its in-flight entry is cleared.
    await vi.advanceTimersByTimeAsync(PAST_DEADLINE);
    await settle();
    expect(doneSignals().map(e => e.payload)).toEqual([{ kind: "audio.synth.done", hash, path: null, unsaved: true }]);

    // The player tries again; uploads work now. The kept bytes are uploaded —
    // AA61's retry — and the retry is answered with the clip.
    playerRequests(hash);
    await settle();
    expect(doneSignals().map(e => e.payload.path)).toEqual([null, cachePath(hash)]);
    expect(synthesise, "the retry uploaded the clip it had, without paying for it again").toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
