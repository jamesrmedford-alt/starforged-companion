// tests/unit/siteRenamedName.test.js
// A revealed site the GM renamed is known by its Actor's name (issue #326
// W75). The sector's discovery record keeps the generated name, which the
// narrator's Charted sites block and `!clear-site` read: two names for one
// place — the block named "Derelict Starship" for "The Harrow", and
// `!clear-site The Harrow` with two discovered sites cleared nothing. Sites
// are now named by their location Actor's record (the generated name a
// fallback).

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

import { formatActiveSector } from "../../src/narration/narrator.js";
import { clearSectorSite } from "../../src/sectors/siteDiscovery.js";
import { createLocation, updateLocation } from "../../src/entities/location.js";
import { _resetFolderCache } from "../../src/entities/folder.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;

async function seed() {
  const cs = { sectors: [{ id: "s1", name: "Devil's Maw", region: "outlands", regionLabel: "Outlands", sceneId: null }],
    activeSectorId: "s1", locationIds: [], settlementIds: [], connectionIds: [] };
  await createLocation({ name: "Derelict Starship", type: "derelict", status: "visited", sectorId: "s1" }, cs, { persist: false });
  await createLocation({ name: "Derelict Settlement", type: "derelict", status: "visited", sectorId: "s1" }, cs, { persist: false });
  const [harrow, other] = cs.locationIds;
  cs.sectors[0].mapData = { sectorId: "s1", settlements: [], passages: [], discoveries: [
    { id: "site-1", name: "Derelict Starship",   type: "derelict", discovered: true, actorId: harrow },
    { id: "site-2", name: "Derelict Settlement", type: "derelict", discovered: true, actorId: other },
  ] };
  game.settings._store.set(KEY, cs);

  // The GM renames the first site's Actor; the rename sync updates its record.
  const actor = game.actors.get(harrow);
  await actor.update({ name: "The Harrow" });
  await updateLocation(harrow, { name: "The Harrow" });
  return cs;
}

describe("a renamed site is known by its Actor's name (issue #326 W75)", () => {
  beforeEach(() => {
    game.actors._reset();
    game.folders._reset();
    _resetFolderCache();
    game.settings._store.clear();
  });

  it("the narrator's Charted sites block names the site as its Actor does", async () => {
    const cs = await seed();
    const block = formatActiveSector(cs);
    expect(block).toContain("Charted sites");
    // It read "- Derelict Starship (derelict, visited)".
    expect(block).toContain("- The Harrow (derelict");
    expect(block).not.toContain("Derelict Starship");
  });

  it("!clear-site The Harrow clears that site", async () => {
    await seed();
    const cleared = await clearSectorSite("The Harrow", { updateLoc: async () => {} });
    // It was null — "No matching discovered site to clear."
    expect(cleared?.site?.id).toBe("site-1");
    expect(cleared.site.name).toBe("The Harrow");                       // the card names it so
  });
  it("control: the record's generated name still finds the site, and an unrenamed site is named as generated", async () => {
    await seed();
    const cleared = await clearSectorSite("Derelict Settlement", { updateLoc: async () => {} });
    expect(cleared?.site).toMatchObject({ id: "site-2", name: "Derelict Settlement" });
  });
});
