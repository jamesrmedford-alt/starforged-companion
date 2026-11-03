/**
 * STARFORGED COMPANION
 * tests/unit/siteDiscoveryStaleWrite.test.js
 *
 * `!reveal-site` / `!clear-site` keep what lands while they await (issue #321
 * U06c).
 *
 * revealSectorSite / clearSectorSite (src/sectors/siteDiscovery.js), on their
 * default seams (the !reveal-site / !clear-site commands), read campaignState,
 * set the site's flag, AWAIT the location Actor write (and the scene restyle),
 * and used to write the WHOLE state they read back. Anything another writer
 * stored in between — a player's relayed X-Card, Take a Break, `!bond`, a flag
 * — was reverted (rules/reachability.md §9: "the X-Card runs unqueued, which
 * is safe only because no handler writes back a snapshot held across an
 * await"). The flag is now set on a copy of the state as it is after the
 * awaits.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { revealSectorSite, clearSectorSite } from "../../src/sectors/siteDiscovery.js";
import { createLocation, updateLocation } from "../../src/entities/location.js";
import { _resetFolderCache } from "../../src/entities/folder.js";

const MODULE = "starforged-companion";
const KEY    = `${MODULE}.campaignState`;

/** A player's X-Card, relayed to the GM, lands while the command awaits. */
async function relayedXCardLands() {
  const latest = game.settings.get(MODULE, "campaignState");
  await game.settings.set(MODULE, "campaignState", { ...latest, xCardActive: true });
}

/** Another writer stores a fresh parse of the state (no object is shared any more). */
async function freshParseLands(change = (s) => s) {
  const latest = JSON.parse(JSON.stringify(game.settings.get(MODULE, "campaignState")));
  await game.settings.set(MODULE, "campaignState", change(latest));
}

async function seed(discovered) {
  const cs = { sectors: [{ id: "s1", name: "Sector", sceneId: null }], activeSectorId: "s1", locationIds: [], xCardActive: false };
  await createLocation({ name: "Derelict Starship", type: "derelict", status: "unexplored", sectorId: "s1" }, cs, { persist: false });
  cs.sectors[0].mapData = { discoveries: [
    { id: "site-1", name: "Derelict Starship", type: "derelict", discovered, actorId: cs.locationIds[0] },
  ] };
  game.settings._store.set(KEY, cs);
}

const stored = () => game.settings.get(MODULE, "campaignState");

describe("!reveal-site / !clear-site write onto the state as it is after their awaits", () => {
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
    expect(stored().sectors[0].mapData.discoveries[0].discovered).toBe(true);
    expect(stored().xCardActive).toBe(true);
  });

  it("!clear-site keeps an X-Card that lands while it awaits the location write", async () => {
    await seed(true);
    const cleared = await clearSectorSite("Derelict Starship", {
      updateLoc: async (id, u) => { const p = updateLocation(id, u); await relayedXCardLands(); return p; },
    });
    expect(cleared?.site.id).toBe("site-1");
    expect(stored().sectors[0].mapData.discoveries[0].cleared).toBe(true);
    expect(stored().xCardActive).toBe(true);
  });

  it("finds the site by id when the stored state was replaced meanwhile, keeping the other writer's change", async () => {
    await seed(false);
    await revealSectorSite("Derelict Starship", {
      source: "manual",
      updateLoc: async (id, u) => {
        const p = updateLocation(id, u);
        await freshParseLands((s) => ({ ...s, nextMoveAdd: { value: 1, source: "take_a_break" } }));
        return p;
      },
    });
    expect(stored().sectors[0].mapData.discoveries[0].discovered).toBe(true);
    expect(stored().nextMoveAdd).toMatchObject({ value: 1 });
  });

  it("writes nothing when the site is no longer stored", async () => {
    await seed(false);
    await revealSectorSite("Derelict Starship", {
      source: "manual",
      updateLoc: async (id, u) => {
        const p = updateLocation(id, u);
        await freshParseLands((s) => ({ ...s, sectors: [] }));   // the sector was deleted meanwhile
        return p;
      },
    });
    expect(stored().sectors).toEqual([]);
  });

  it("control: the expedition path's working copy still carries the flag", async () => {
    // The expedition path passes the move pipeline's working copy and a
    // setState that folds the flagged sectors into it: the flag rides along
    // on that copy (persistResolution writes it). The flag is set on a copy
    // first (issue #326 W51) — the seam is what puts it on the working copy.
    const working = { sectors: [{ id: "s1", sceneId: null, mapData: { discoveries: [
      { id: "site-1", name: "Derelict Starship", type: "derelict", discovered: false, actorId: null },
    ] } }] };
    const result = await revealSectorSite("Derelict Starship", {
      getState: () => working,
      setState: (next) => { working.sectors = next.sectors; },
      getScene: () => null,
      updateLoc: async () => {},
    });
    expect(result?.site.id).toBe("site-1");
    expect(working.sectors[0].mapData.discoveries[0].discovered).toBe(true);
  });
});
