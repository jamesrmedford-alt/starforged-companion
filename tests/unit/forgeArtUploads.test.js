/**
 * STARFORGED COMPANION
 * tests/unit/forgeArtUploads.test.js
 *
 * Sector and ship-map art on The Forge (issue #293). The Forge stores
 * FilePicker.upload() files in the user's Assets Library and returns the
 * absolute https://assets.forge-vtt.com/... URL in response.path; the
 * constructed local path does not exist there (the AUDIO-002 bug). Both art
 * generators must return the response path, and fall back to the constructed
 * path on a native install.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/art/openRouterImage.js", () => ({
  generateOpenRouterImage: vi.fn(async () => "iVBORw0KGgo="),
}));

import { generateSectorBackground } from "../../src/sectors/sectorArt.js";
import { generateShipMapBackground } from "../../src/moves/shipMapArt.js";

const MODULE_ID = "starforged-companion";
const FORGE_BASE = "https://assets.forge-vtt.com/abc/worlds/test-world/scenes";

let fp;
let origUpload;

beforeEach(() => {
  game.settings._store.set(`${MODULE_ID}.openRouterApiKey`, "sk-or-test");
  fp = globalThis.foundry.applications.apps.FilePicker.implementation;
  fp._reset();
  origUpload = fp.upload;
});

afterEach(() => {
  fp.upload = origUpload;
  game.settings._store.delete(`${MODULE_ID}.openRouterApiKey`);
});

function forgeUpload() {
  fp.upload = async (source, dir, file) => {
    fp._uploads.push({ source, dir, file });
    return { status: "success", path: `${FORGE_BASE}/${file.name}` };
  };
}

describe("generateSectorBackground — upload path", () => {
  it("returns The Forge's Assets Library URL from the upload response", async () => {
    forgeUpload();
    const path = await generateSectorBackground({ id: "sec-1", region: "terminus" });
    expect(path).toBe(`${FORGE_BASE}/sector-sec-1.png`);
  });

  it("returns the data path on a native install", async () => {
    const path = await generateSectorBackground({ id: "sec-1", region: "terminus" });
    expect(path).toBe("worlds/test-world/scenes/sector-sec-1.png");
  });
});

describe("generateShipMapBackground — upload path", () => {
  it("returns The Forge's Assets Library URL from the upload response", async () => {
    forgeUpload();
    const result = await generateShipMapBackground({ type: "Corvette" }, { id: "ship-1", items: [] });
    expect(result?.path).toBe(`${FORGE_BASE}/ship-map-ship-1.png`);
  });

  it("returns the data path on a native install", async () => {
    const result = await generateShipMapBackground({ type: "Corvette" }, { id: "ship-1", items: [] });
    expect(result?.path).toBe("worlds/test-world/scenes/ship-map-ship-1.png");
  });
});
