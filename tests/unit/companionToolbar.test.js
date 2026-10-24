import { describe, it, expect } from "vitest";
import { companionToolbarTools, clampToViewport } from "../../src/ui/companionToolbarTools.js";

/**
 * Issue #293: the toolbar's saved position or a drag could leave it past an
 * edge (its bottom tools were cut off on a phone). clampToViewport keeps it in.
 */
describe("clampToViewport", () => {
  const viewport = { width: 412, height: 915 };
  const box = (left, top, width = 40, height = 300) => ({ left, top, width, height });

  it("leaves a box that fits where it is", () => {
    expect(clampToViewport(box(8, 96), viewport)).toEqual({ left: 8, top: 96 });
  });

  it("pulls a box back from the right and bottom edges", () => {
    expect(clampToViewport(box(900, 800), viewport)).toEqual({ left: 412 - 40 - 4, top: 915 - 300 - 4 });
  });

  it("pulls a box back from the left and top edges", () => {
    expect(clampToViewport(box(-50, -20), viewport)).toEqual({ left: 4, top: 4 });
  });

  it("brings a box saved in portrait back on screen in landscape", () => {
    expect(clampToViewport(box(8, 600), { width: 915, height: 412 })).toEqual({ left: 8, top: 412 - 300 - 4 });
  });

  it("pins a box taller than the viewport to the top margin", () => {
    expect(clampToViewport(box(8, 96, 40, 500), { width: 915, height: 412 })).toEqual({ left: 8, top: 4 });
  });

  it("treats a missing position as the top-left margin", () => {
    expect(clampToViewport({ width: 40, height: 300 }, viewport)).toEqual({ left: 4, top: 4 });
  });
});

/**
 * The Companion launcher moved off Foundry's scene-controls (which are inert
 * with no active scene) onto a floating toolbar. companionToolbarTools is the
 * pure visibility/data layer; these tests pin the GM-gating and the Private
 * Channel gate so a future edit can't silently expose GM-only tools to players.
 */
describe("companionToolbarTools — visibility", () => {
  const keys = (ctx) => companionToolbarTools(ctx).map(t => t.key);

  it("shows the player-safe tools (including Companion Settings) to a non-GM with the private channel off", () => {
    const k = keys({ isGM: false, privateChannelEnabled: false });
    expect(k).toEqual(["sfSession", "progressTracks", "entityPanel", "chronicle", "clocks", "sfSettings"]);
  });

  it("exposes Companion Settings to players (their BYOK keys / audio / push-to-talk live there)", () => {
    expect(keys({ isGM: false, privateChannelEnabled: false })).toContain("sfSettings");
  });

  it("adds the Private Channel button only when the feature is enabled", () => {
    expect(keys({ isGM: false, privateChannelEnabled: true })).toContain("sfPrivateChannel");
    expect(keys({ isGM: false, privateChannelEnabled: false })).not.toContain("sfPrivateChannel");
  });

  it("never exposes GM-only tools to a non-GM", () => {
    const k = keys({ isGM: false, privateChannelEnabled: true });
    for (const gmOnly of ["sectorCreator", "worldJournal", "worldTruths", "customOracles"]) {
      expect(k).not.toContain(gmOnly);
    }
  });

  it("shows the full set to a GM with the private channel on", () => {
    const k = keys({ isGM: true, privateChannelEnabled: true });
    expect(k).toEqual([
      "sfSession", "progressTracks", "entityPanel", "chronicle", "clocks",
      "sfPrivateChannel", "sfSettings", "sectorCreator", "worldJournal",
      "worldTruths", "customOracles",
    ]);
  });

  it("returns plain {key,title,icon} data with no leaked visibility flag", () => {
    for (const tool of companionToolbarTools({ isGM: true, privateChannelEnabled: true })) {
      expect(Object.keys(tool).sort()).toEqual(["icon", "key", "title"]);
      expect(typeof tool.title).toBe("string");
      expect(tool.icon).toMatch(/^fas /);
    }
  });

  it("defaults to the player-safe set when called with no args", () => {
    expect(keys()).toEqual(["sfSession", "progressTracks", "entityPanel", "chronicle", "clocks", "sfSettings"]);
  });
});
