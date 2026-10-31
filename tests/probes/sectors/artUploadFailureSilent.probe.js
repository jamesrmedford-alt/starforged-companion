/**
 * PROBE — SECTOR-ART-UPLOAD-FAIL-PATH
 *
 * Foundry v13's FilePicker.upload does not throw on a failed upload: it returns
 * `false` (server error → its own toast), `undefined` (no path / 413 with
 * notify:false → console only) or `{}` (network error). uploadSectorImage
 * (src/sectors/sectorArt.js) returns `response?.path ?? <constructed path>`, so
 * every failure comes back as a path to a file that was never written:
 * generateSectorBackground's "upload returned no path" / "upload failed"
 * branches are unreachable, the Scene's background points at a missing file
 * (a black map) and the record says backgroundGenerated: true.
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/art/openRouterImage.js", () => ({
  generateOpenRouterImage: vi.fn(async () => Buffer.from("png-bytes").toString("base64")),
}));

import { generateSectorBackground } from "../../../src/sectors/sectorArt.js";

const MODULE = "starforged-companion";

describe("PROBE SECTOR-ART-UPLOAD-FAIL-PATH", () => {
  const fp = foundry.applications.apps.FilePicker.implementation;
  let realUpload;
  beforeEach(() => {
    game.settings._store.set(`${MODULE}.openRouterApiKey`, "sk-or-test");
    realUpload = fp.upload;
  });
  afterEach(() => { fp.upload = realUpload; fp._reset(); });

  it.each([
    ["false (server reported an error)", false],
    ["undefined (no path / 413)",        undefined],
    ["{} (request failed)",              {}],
  ])("an upload that returns %s yields no background path", async (_label, failed) => {
    fp.upload = vi.fn(async () => failed);
    const path = await generateSectorBackground({ id: "sec-1", region: "outlands", trouble: "x" }, {});
    expect(path).toBeNull();   // today: "worlds/test-world/scenes/sector-sec-1.png" — a file that does not exist
  });
});
