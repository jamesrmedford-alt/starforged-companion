/**
 * STARFORGED COMPANION
 * tests/unit/shipMapVision.test.js
 *
 * Vision-based station placement for the ship-map deck plan. Covers the pure
 * JSON parse + validation (the fixed-layout fallback gate) and the end-to-end
 * resolve call with the Claude vision API mocked via api-proxy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

import {
  parseJsonObject,
  validateVisionCoords,
  resolveStationCoordsFromImage,
} from "../../src/moves/shipMapVision.js";
import { STATION_LAYOUT } from "../../src/moves/shipMapScene.js";
import { apiPost } from "../../src/api-proxy.js";

const ALL_IDS = STATION_LAYOUT.map(s => s.id);

// A well-spread, fully-populated coordinate set (passes validation).
function goodCoords() {
  const out = {};
  ALL_IDS.forEach((id, i) => {
    out[id] = { x: 0.05 + (i / ALL_IDS.length) * 0.9, y: (i % 2 === 0) ? 0.3 : 0.7 };
  });
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  global.game = { settings: { get: vi.fn(() => undefined) } };
});

afterEach(() => {
  delete global.game;
});

// ---------------------------------------------------------------------------
// parseJsonObject
// ---------------------------------------------------------------------------

describe("parseJsonObject()", () => {
  it("parses a bare object", () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("tolerates code fences and leading prose", () => {
    expect(parseJsonObject('Here you go:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it("returns null for non-JSON or empty input", () => {
    expect(parseJsonObject("no json here")).toBeNull();
    expect(parseJsonObject("")).toBeNull();
    expect(parseJsonObject(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateVisionCoords — the fallback gate
// ---------------------------------------------------------------------------

describe("validateVisionCoords()", () => {
  it("accepts a complete, well-spread coordinate set", () => {
    const v = validateVisionCoords(goodCoords());
    expect(v).not.toBeNull();
    expect(Object.keys(v).sort()).toEqual([...ALL_IDS].sort());
  });

  it("rejects a result missing any station", () => {
    const c = goodCoords();
    delete c.gunnery;
    expect(validateVisionCoords(c)).toBeNull();
  });

  it("rejects out-of-range coordinates", () => {
    const c = goodCoords();
    c.gunnery = { x: 1.4, y: 0.5 };
    expect(validateVisionCoords(c)).toBeNull();
  });

  it("rejects a degenerate (collapsed) layout", () => {
    const c = {};
    ALL_IDS.forEach(id => { c[id] = { x: 0.5, y: 0.5 }; });   // all on one point
    expect(validateVisionCoords(c)).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(validateVisionCoords(null)).toBeNull();
    expect(validateVisionCoords("nope")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveStationCoordsFromImage — IO with api-proxy mocked
// ---------------------------------------------------------------------------

describe("resolveStationCoordsFromImage()", () => {
  it("returns null without an image", async () => {
    expect(await resolveStationCoordsFromImage(null, { apiKey: "k" })).toBeNull();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("returns null without an API key", async () => {
    expect(await resolveStationCoordsFromImage("AAAA")).toBeNull();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("sends the image as a base64 vision block and returns validated coords", async () => {
    apiPost.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(goodCoords()) }],
    });

    const result = await resolveStationCoordsFromImage("BASE64BYTES", { apiKey: "k", model: "claude-sonnet-4-5-20250929" });
    expect(result).not.toBeNull();
    expect(Object.keys(result)).toHaveLength(ALL_IDS.length);

    const body = apiPost.mock.calls[0][2];
    const imageBlock = body.messages[0].content.find(b => b.type === "image");
    expect(imageBlock.source.data).toBe("BASE64BYTES");
    expect(imageBlock.source.media_type).toBe("image/png");
  });

  it("falls back to null when the model returns an invalid result", async () => {
    apiPost.mockResolvedValue({ content: [{ type: "text", text: "{\"gunnery\": {\"x\": 0.5}}" }] });
    expect(await resolveStationCoordsFromImage("BYTES", { apiKey: "k" })).toBeNull();
  });

  it("never throws when the API call rejects", async () => {
    apiPost.mockRejectedValue(new Error("network"));
    expect(await resolveStationCoordsFromImage("BYTES", { apiKey: "k" })).toBeNull();
  });

  it("includes optional galley/module coords when valid, but does not require them", async () => {
    const coords = goodCoords();
    coords["galley"] = { x: 0.5, y: 0.8 };
    coords["module:medbay"] = { x: 0.7, y: 0.2 };
    apiPost.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(coords) }] });

    const features = [
      ...STATION_LAYOUT.map(s => ({ id: s.id, kind: "station", label: s.id, description: "" })),
      { id: "galley", kind: "amenity", label: "Galley", description: "" },
      { id: "module:medbay", kind: "module", label: "Medbay", description: "" },
    ];
    const result = await resolveStationCoordsFromImage("BYTES", { apiKey: "k", features });
    expect(result["galley"]).toEqual({ x: 0.5, y: 0.8 });
    expect(result["module:medbay"]).toEqual({ x: 0.7, y: 0.2 });

    // A missing optional id is fine — stations still gate the result.
    const coords2 = goodCoords();   // no galley/module entries
    apiPost.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(coords2) }] });
    const result2 = await resolveStationCoordsFromImage("BYTES", { apiKey: "k", features });
    expect(result2).not.toBeNull();
    expect(result2["galley"]).toBeUndefined();
  });
});
