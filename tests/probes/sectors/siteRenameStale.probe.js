/**
 * PROBE (sectors audit, SO-04) — a revealed site renamed by the GM keeps its
 * generated name in the sector's discovery record, which the narrator and
 * `!clear-site` read.
 *
 * What the user does: after "◈ Site Discovered — Derelict Starship", the GM
 * renames the site's location Actor to its fiction's name, "The Harrow" (the
 * sheet or the sidebar; the module's rename sync — index.js
 * syncEntityRecordNameOnUpdate, "Actor name is authoritative" — updates the
 * Actor's record). Later the GM types `!clear-site The Harrow`.
 * What happens: the sector's `mapData.discoveries[]` record keeps
 * "Derelict Starship" — nothing writes it after generation (the settlement
 * pins follow a rename since issue #321 U52; site records and pins do not).
 * The narrator's ACTIVE SECTOR block (narrator.js formatActiveSector, Charted
 * sites) names the place "Derelict Starship" (taking only its status from the
 * Actor) while its CURRENT LOCATION card and the sheet say "The Harrow" — two
 * names for one place. selectSectorSite (precursorSites.js) matches the
 * record's name, so `!clear-site The Harrow` with two discovered sites finds
 * nothing ("No matching discovered site to clear").
 * What should happen: the site is named by its Actor — its id is on the
 * record (`actorId`); the record name is a fallback (rules/reachability.md
 * §6, resolve identity by stable id).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

import { formatActiveSector } from "../../../src/narration/narrator.js";
import { clearSectorSite } from "../../../src/sectors/siteDiscovery.js";
import { createLocation, updateLocation } from "../../../src/entities/location.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";

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

describe("PROBE SO-04: a renamed site is known by its Actor's name", () => {
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
    // FAILS today: "- Derelict Starship (derelict, visited)".
    expect(block).toContain("- The Harrow (derelict");
    expect(block).not.toContain("Derelict Starship");
  });

  it("!clear-site The Harrow clears that site", async () => {
    await seed();
    const cleared = await clearSectorSite("The Harrow", { updateLoc: async () => {} });
    // FAILS today: null — "No matching discovered site to clear."
    expect(cleared?.site?.id).toBe("site-1");
  });
});
