// tests/unit/siteLocationKlass.test.js
// A generated vault's or derelict's rolled location class reaches its Actor
// (issue #326 W74). generateVaultSite / generateDerelictSite computed
// `klass` (planetside / orbital / deep space), but buildSiteLocationData did
// not pass it and createLocation wrote `system.klass: null`, so the system's
// location sheet showed a blank class and its derelict Type oracle button was
// disabled ("Requires location type").

import { describe, it, expect, beforeEach } from "vitest";
import { generateDerelictSite, buildSiteLocationData } from "../../src/sectors/precursorSites.js";
import { createLocation } from "../../src/entities/location.js";
import { _resetFolderCache } from "../../src/entities/folder.js";

/** A roll source that answers each oracle table deterministically. */
const rolls = {
  derelict_location:        "Orbital",
  derelict_type_orbital:    "Derelict starship",
  derelict_condition:       "Cold and dark",
  derelict_outer_look:      "Stripped exterior",
  derelict_inner_look:      "Creaking hull",
  derelict_zone_starship:   "Engineering",
};
const rollOracle = (id) => ({ result: rolls[id] ?? "—" });

describe("a sector site's location Actor carries its rolled class (issue #326 W74)", () => {
  beforeEach(() => {
    game.actors._reset();
    game.folders._reset();
    _resetFolderCache();
  });

  it("an orbital derelict's location Actor has system.klass \"orbital\"", async () => {
    const site = { id: "site-1", ...generateDerelictSite(rollOracle), status: "unexplored", discovered: false };
    expect(site.klass).toBe("orbital");   // control: the generator rolled and normalised it

    const cs = { sectors: [{ id: "s1", name: "Devil's Maw" }], locationIds: [] };
    await createLocation(buildSiteLocationData(site, { id: "s1", regionLabel: "Outlands" }), cs, { persist: false });
    const actor = game.actors.get(cs.locationIds[0]);
    expect(actor.system.subtype).toBe("derelict");
    // It was null — the vendor sheet's class dropdown was blank and its
    // derelict "Type" oracle disabled ("Requires location type").
    expect(actor.system.klass).toBe("orbital");
    // The class is the sheet's field, not a record field beside it.
    expect(actor.flags["starforged-companion"].location.klass).toBeUndefined();
  });
  it("control: a location created with no class keeps a blank one", async () => {
    const cs = { sectors: [], locationIds: [] };
    await createLocation({ name: "Relay Nine", type: "station" }, cs, { persist: false });
    expect(game.actors.get(cs.locationIds[0]).system.klass).toBeNull();
  });
});
