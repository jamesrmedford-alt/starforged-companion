/**
 * PROBE — REVEAL-SITE-STALE-WRITE
 *
 * revealSectorSite / clearSectorSite (src/sectors/siteDiscovery.js), on their
 * default seams (the !reveal-site / !clear-site commands), read campaignState,
 * mutate the read object, AWAIT the location Actor write (and the scene
 * restyle), then write the WHOLE read object back. Anything another writer
 * stored in between — a player's relayed X-Card, Take a Break, `!bond`, a
 * flag — is reverted (rules/reachability.md §9; the F14 CREATE-PERSIST-WHOLE
 * family: "the X-Card runs unqueued, which is safe only because no handler
 * writes back a snapshot held across an await").
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { revealSectorSite, clearSectorSite } from "../../../src/sectors/siteDiscovery.js";
import { createLocation, updateLocation } from "../../../src/entities/location.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";

const MODULE = "starforged-companion";
const KEY    = `${MODULE}.campaignState`;

/** A player's X-Card, relayed to the GM, lands while the command awaits. */
async function relayedXCardLands() {
  const latest = game.settings.get(MODULE, "campaignState");
  await game.settings.set(MODULE, "campaignState", { ...latest, xCardActive: true });
}

async function seed(discovered) {
  const cs = { sectors: [{ id: "s1", name: "Sector", sceneId: null }], activeSectorId: "s1", locationIds: [], xCardActive: false };
  await createLocation({ name: "Derelict Starship", type: "derelict", status: "unexplored", sectorId: "s1" }, cs, { persist: false });
  cs.sectors[0].mapData = { discoveries: [
    { id: "site-1", name: "Derelict Starship", type: "derelict", discovered, actorId: cs.locationIds[0] },
  ] };
  game.settings._store.set(KEY, cs);
}

describe("PROBE REVEAL-SITE-STALE-WRITE", () => {
  beforeEach(() => {
    game.actors._reset();
    game.folders._reset();
    _resetFolderCache();
    game.settings._store.clear();
  });

  it("!reveal-site keeps an X-Card that lands while it awaits the location write", async () => {
    await seed(false);
    const revealed = await revealSectorSite("Derelict Starship", {
      source: "manual",
      updateLoc: async (id, u) => { const p = updateLocation(id, u); await relayedXCardLands(); return p; },
    });
    expect(revealed?.site.id).toBe("site-1");
    const stored = game.settings.get(MODULE, "campaignState");
    expect.soft(stored.sectors[0].mapData.discoveries[0].discovered).toBe(true);
    expect.soft(stored.xCardActive).toBe(true);    // today: false — the reveal wrote its stale copy over it
  });

  it("!clear-site keeps an X-Card that lands while it awaits the location write", async () => {
    await seed(true);
    const cleared = await clearSectorSite("Derelict Starship", {
      updateLoc: async (id, u) => { const p = updateLocation(id, u); await relayedXCardLands(); return p; },
    });
    expect(cleared?.site.id).toBe("site-1");
    expect.soft(game.settings.get(MODULE, "campaignState").xCardActive).toBe(true);   // today: false
  });
});
