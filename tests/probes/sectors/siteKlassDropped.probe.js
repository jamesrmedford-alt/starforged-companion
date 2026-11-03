/**
 * PROBE (sectors audit, SO-11) — a generated vault's or derelict's rolled
 * location (Planetside / Orbital / Deep Space) is computed and dropped: its
 * location Actor's `system.klass` is always null.
 *
 * What the user does: creates a sector; opens one of its unexplored sites'
 * sheets (the GM double-clicks the "Unexplored Site" pin).
 * What happens: generateDerelictSite / generateVaultSite
 * (src/sectors/precursorSites.js) roll the site's location and set
 * `klass: normalizeKlass(location)` on the descriptor; buildSiteLocationData
 * does not pass it on, and createLocation (src/entities/location.js) writes
 * `system.klass: null`. On the system's location sheet (vendor
 * sf-locationsheet.vue) a derelict / vault's class IS that location
 * (klassOptions: planetside / orbital / deep space): the dropdown is blank,
 * and the derelict's "Type" oracle button — `requiresKlass` — is disabled
 * with "Requires location type", for a site whose location the sector
 * creator rolled. Nothing reads the descriptor's `klass` (produced-but-dead).
 * What should happen: the site Actor carries its rolled class, as a
 * settlement's does (settlement.js normaliseSettlementKlass → system.klass).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { generateDerelictSite, buildSiteLocationData } from "../../../src/sectors/precursorSites.js";
import { createLocation } from "../../../src/entities/location.js";
import { _resetFolderCache } from "../../../src/entities/folder.js";

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

describe("PROBE SO-11: a sector site's Actor carries its rolled location class", () => {
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
    // FAILS today: null — the vendor sheet's class dropdown is blank and its
    // derelict "Type" oracle is disabled ("Requires location type").
    expect(actor.system.klass).toBe("orbital");
  });
});
