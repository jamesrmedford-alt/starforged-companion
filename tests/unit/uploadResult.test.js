/**
 * STARFORGED COMPANION
 * tests/unit/uploadResult.test.js
 *
 * Issue #322 V26 (the audit's artUploadFailureSilent probe,
 * SECTOR-ART-UPLOAD-FAIL-PATH): Foundry v13's FilePicker.upload does not throw
 * on a failed upload — it resolves `false` (a server error), `undefined` (no
 * path / a 413 with notify:false) or `{}` (a failed request). The sector-art
 * upload returned `response?.path ?? <the path it built>`, so every failure
 * came back as the path of a file never written: generateSectorBackground's
 * "no path" branch was unreachable, the Scene's background was black and the
 * record said the art was generated. The portrait, deck-plan and audio-cache
 * uploads had the same fallback. All four go through uploadedPath now.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/art/openRouterImage.js", () => ({
  generateOpenRouterImage: vi.fn(async () => Buffer.from("png-bytes").toString("base64")),
}));

import { uploadedPath } from "../../src/net/uploadResult.js";
import { generateSectorBackground } from "../../src/sectors/sectorArt.js";
import { write as cacheWrite, _resetAudioCacheStateForTests } from "../../src/audio/cache.js";
import { generateShipMapBackground } from "../../src/moves/shipMapArt.js";

const MODULE_ID = "starforged-companion";
const FAILED = [
  ["false (the server reported an error)", false],
  ["undefined (no path / a 413)",          undefined],
  ["{} (the request failed)",              {}],
];

describe("uploadedPath", () => {
  it("the response's own path first — The Forge's Assets Library URL", () => {
    expect(uploadedPath({ status: "success", path: "https://assets.forge-vtt.com/u/x.png" }, "worlds/w/x.png"))
      .toBe("https://assets.forge-vtt.com/u/x.png");
  });

  it("the built path only when the server reported success without one", () => {
    expect(uploadedPath({ status: "success" }, "worlds/w/x.png")).toBe("worlds/w/x.png");
  });

  it.each(FAILED)("a failed upload — %s — stored nothing", (_label, response) => {
    expect(uploadedPath(response, "worlds/w/x.png")).toBeNull();
  });
});

describe("every upload site reports a failed upload as no file", () => {
  const fp = foundry.applications.apps.FilePicker.implementation;
  let realUpload;
  beforeEach(() => {
    game.settings._store.set(`${MODULE_ID}.openRouterApiKey`, "sk-or-test");
    realUpload = fp.upload;
    _resetAudioCacheStateForTests();
  });
  afterEach(() => { fp.upload = realUpload; fp._reset(); });

  it.each(FAILED)("sector art: an upload that returns %s yields no background, and says so", async (_label, failed) => {
    fp.upload = vi.fn(async () => failed);
    const notify = vi.spyOn(ui.notifications, "error");
    const path = await generateSectorBackground({ id: "sec-1", region: "outlands", trouble: "x" }, {});
    expect(path).toBeNull();     // was "worlds/test-world/scenes/sector-sec-1.png" — a file that does not exist
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/upload failed/), expect.anything());
    notify.mockRestore();
  });

  it("control: a successful sector-art upload yields its path", async () => {
    const path = await generateSectorBackground({ id: "sec-2", region: "outlands", trouble: "x" }, {});
    expect(path).toBe("worlds/test-world/scenes/sector-sec-2.png");
  });

  it.each(FAILED)("the audio cache: an upload that returns %s caches no clip", async (_label, failed) => {
    fp.upload = vi.fn(async () => failed);
    expect(await cacheWrite("d".repeat(64), new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it.each(FAILED)("the deck plan: an upload that returns %s yields no art (the schematic backdrop stands)", async (_label, failed) => {
    fp.upload = vi.fn(async () => failed);
    game.settings._store.set(`${MODULE_ID}.shipMapArtEnabled`, true);
    const result = await generateShipMapBackground({ type: "Courier", firstLook: "scarred hull", name: "Wren" }, { id: "ship-1" });
    expect(result).toBeNull();
  });
  it("control: a successful deck-plan upload yields its path", async () => {
    const result = await generateShipMapBackground({ type: "Courier", firstLook: "scarred hull", name: "Wren" }, { id: "ship-1" });
    expect(result?.path).toMatch(/scenes\/.+\.png$/);
  });
});
