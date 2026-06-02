import { describe, it, expect } from "vitest";
import { companionToolbarTools } from "../../src/ui/companionToolbarTools.js";

/**
 * The Companion launcher moved off Foundry's scene-controls (which are inert
 * with no active scene) onto a floating toolbar. companionToolbarTools is the
 * pure visibility/data layer; these tests pin the GM-gating and the Private
 * Channel gate so a future edit can't silently expose GM-only tools to players.
 */
describe("companionToolbarTools — visibility", () => {
  const keys = (ctx) => companionToolbarTools(ctx).map(t => t.key);

  it("shows the player-safe tools to a non-GM with the private channel off", () => {
    const k = keys({ isGM: false, privateChannelEnabled: false });
    expect(k).toEqual(["sfSession", "progressTracks", "entityPanel", "chronicle", "clocks"]);
  });

  it("adds the Private Channel button only when the feature is enabled", () => {
    expect(keys({ isGM: false, privateChannelEnabled: true })).toContain("sfPrivateChannel");
    expect(keys({ isGM: false, privateChannelEnabled: false })).not.toContain("sfPrivateChannel");
  });

  it("never exposes GM-only tools to a non-GM", () => {
    const k = keys({ isGM: false, privateChannelEnabled: true });
    for (const gmOnly of ["sfSettings", "sectorCreator", "worldJournal", "worldTruths", "customOracles"]) {
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
    expect(keys()).toEqual(["sfSession", "progressTracks", "entityPanel", "chronicle", "clocks"]);
  });
});
