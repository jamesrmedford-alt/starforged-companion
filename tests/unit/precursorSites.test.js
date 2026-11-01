/**
 * STARFORGED COMPANION
 * tests/unit/precursorSites.test.js
 *
 * Pure-logic coverage for sector precursor-vault / derelict site generation,
 * theming, location-data shaping, and reveal selection. No Foundry globals.
 */

import { describe, it, expect } from "vitest";
import {
  troubleSiteTheme,
  siteCountForRegion,
  planSectorSites,
  generateVaultSite,
  generateDerelictSite,
  derelictTypeTableFor,
  generateSectorSites,
  buildSiteLocationData,
  selectSectorSite,
} from "../../src/sectors/precursorSites.js";

// A deterministic rollOracle stub: returns a fixed result per table id.
const stubRoller = (overrides = {}) => (tableId) => ({
  result: overrides[tableId] ?? `<${tableId}>`,
});

// ── troubleSiteTheme ──────────────────────────────────────────────────────────

describe("troubleSiteTheme", () => {
  it("classifies precursor-themed trouble as vault", () => {
    expect(troubleSiteTheme("Precursor sites throughout the sector emit strange signals")).toBe("vault");
    expect(troubleSiteTheme("Prophecies foretell an imminent awakening of a dreadful power")).toBe("vault");
  });

  it("classifies derelict-themed trouble as derelict", () => {
    expect(troubleSiteTheme("Ships regularly go missing")).toBe("derelict");
  });

  it("returns null for unrelated trouble", () => {
    expect(troubleSiteTheme("Notorious pirate clan preys on starships")).toBeNull();
    expect(troubleSiteTheme("Energy storms are rampant")).toBeNull();
    expect(troubleSiteTheme("")).toBeNull();
    expect(troubleSiteTheme(null)).toBeNull();
  });
});

// ── siteCountForRegion / planSectorSites ──────────────────────────────────────

describe("siteCountForRegion", () => {
  it("scales with region (expanse > outlands > terminus)", () => {
    expect(siteCountForRegion("terminus")).toBe(1);
    expect(siteCountForRegion("outlands")).toBe(2);
    expect(siteCountForRegion("expanse")).toBe(3);
  });

  it("defaults unknown regions to 1", () => {
    expect(siteCountForRegion("???")).toBe(1);
  });
});

describe("planSectorSites", () => {
  it("splits the region base between derelict and vault (derelict-leaning)", () => {
    expect(planSectorSites("terminus", "")).toEqual({ vault: 0, derelict: 1 });
    expect(planSectorSites("outlands", "")).toEqual({ vault: 1, derelict: 1 });
    expect(planSectorSites("expanse", "")).toEqual({ vault: 1, derelict: 2 });
  });

  it("adds a bonus vault for precursor-themed trouble", () => {
    expect(planSectorSites("terminus", "Precursor sites emit strange signals"))
      .toEqual({ vault: 1, derelict: 1 });
  });

  it("adds a bonus derelict for derelict-themed trouble", () => {
    expect(planSectorSites("outlands", "Ships regularly go missing"))
      .toEqual({ vault: 1, derelict: 2 });
  });
});

// ── generateVaultSite / generateDerelictSite ──────────────────────────────────

describe("generateVaultSite", () => {
  it("rolls the canonical exterior + interior oracles into a vault descriptor", () => {
    const roll = stubRoller({
      vault_location: "Deep Space",
      vault_scale:    "Large, elaborate site",
      vault_form:     "Monument",
      vault_shape:    "Domed",
      vault_material: "Metallic",
      vault_outer_look: "Sending a signal",
      vault_inner_look: "Eerie silence",
      vault_purpose:  "Archive",
      vault_feature:  "Hidden chamber",
      vault_peril:    "Collapsing structure",
      vault_opportunity: "Ancient cache",
    });
    const site = generateVaultSite(roll);
    expect(site.type).toBe("vault");
    expect(site.name).toBe("Precursor Vault — Monument");
    expect(site.klass).toBe("deep space");
    expect(site.firstLook).toContain("Large, elaborate site");
    expect(site.firstLook).toContain("Sending a signal");
    expect(site.feature).toBe("Hidden chamber");
    expect(site.peril).toBe("Collapsing structure");
    expect(site.opportunity).toBe("Ancient cache");
    expect(site.description).toContain("Apparent purpose: Archive");
  });
});

describe("generateDerelictSite", () => {
  it("rolls a starship derelict and reads the starship zone table", () => {
    const seen = [];
    const results = {
      derelict_location:  "Orbital",
      // Orbital location routes to the orbital type table (SITE-TYPE-TABLE-MISMATCH fix).
      derelict_type_orbital: "Derelict starship",
      derelict_condition: "Cold and dark",
      derelict_outer_look:"Hazardous readings",
      derelict_inner_look:"Active bots",
      derelict_zone_starship: "Bridge",
    };
    const roll = (id) => { seen.push(id); return { result: results[id] ?? `<${id}>` }; };
    const site = generateDerelictSite(roll);
    expect(site.type).toBe("derelict");
    expect(site.name).toBe("Derelict Starship");
    expect(site.klass).toBe("orbital");
    expect(site.firstLook).toBe("Cold and dark. Outer look: Hazardous readings.");
    expect(site.feature).toBe("Active bots");
    expect(seen).toContain("derelict_zone_starship");
    expect(seen).not.toContain("derelict_zone_settlement");
  });

  it("reads the settlement zone table for a settlement derelict", () => {
    const seen = [];
    const results = { derelict_type: "Derelict settlement" };
    const roll = (id) => { seen.push(id); return { result: results[id] ?? `<${id}>` }; };
    generateDerelictSite(roll);
    expect(seen).toContain("derelict_zone_settlement");
    expect(seen).not.toContain("derelict_zone_starship");
  });
});

// ── generateSectorSites ───────────────────────────────────────────────────────

describe("generateSectorSites", () => {
  it("produces region+theme-scaled sites, each stamped unexplored with an id", () => {
    const sites = generateSectorSites("expanse", "Precursor sites emit strange signals", {
      rollOracle: stubRoller({ vault_form: "Monument", derelict_type: "Derelict starship" }),
    });
    // expanse base {vault:1,derelict:2} + precursor theme +1 vault = 2 vaults, 2 derelicts
    expect(sites).toHaveLength(4);
    expect(sites.filter(s => s.type === "vault")).toHaveLength(2);
    expect(sites.filter(s => s.type === "derelict")).toHaveLength(2);
    for (const s of sites) {
      expect(s.id).toBeTruthy();
      expect(s.status).toBe("unexplored");
      expect(s.discovered).toBe(false);
    }
  });

  it("disambiguates duplicate names within a sector", () => {
    const sites = generateSectorSites("expanse", "Ships regularly go missing", {
      rollOracle: stubRoller({ derelict_type: "Derelict starship", vault_form: "Monument" }),
    });
    const derelictNames = sites.filter(s => s.type === "derelict").map(s => s.name);
    // 3 derelicts all "Derelict Starship" → must be made unique
    expect(new Set(derelictNames).size).toBe(derelictNames.length);
  });
});

// ── buildSiteLocationData ─────────────────────────────────────────────────────

describe("buildSiteLocationData", () => {
  it("maps a site descriptor to createLocation data, canonical-locked", () => {
    const site = {
      type: "vault", name: "Precursor Vault — Monument", status: "unexplored",
      firstLook: "outer", feature: "f", peril: "p", opportunity: "o", description: "desc",
    };
    const sector = { id: "sec-1", region: "expanse", regionLabel: "Expanse" };
    const data = buildSiteLocationData(site, sector);
    expect(data).toMatchObject({
      name: "Precursor Vault — Monument",
      type: "vault",
      region: "Expanse",
      status: "unexplored",
      firstLook: "outer",
      feature: "f",
      sectorId: "sec-1",
      canonicalLocked: true,
    });
  });
});

// ── selectSectorSite ──────────────────────────────────────────────────────────

/** The ladder over one sector's discoveries — the site it picks, or null. */
const pick = (sites, label, opts) =>
  selectSectorSite([{ id: "sec", mapData: { discoveries: sites } }], label, opts)?.site ?? null;

describe("selectSectorSite — the ladder within a sector", () => {
  const sites = () => [
    { id: "a", name: "Precursor Vault — Monument", type: "vault",    discovered: false },
    { id: "b", name: "Derelict Starship",          type: "derelict", discovered: false },
  ];

  it("returns null when there are no undiscovered sites", () => {
    expect(pick([], "vault")).toBeNull();
    expect(pick([{ id: "a", name: "X", discovered: true }], "x")).toBeNull();
  });

  it("matches an exact name (case-insensitive, leading 'the' stripped)", () => {
    expect(pick(sites(), "the derelict starship")?.id).toBe("b");
  });

  it("matches a substring in either direction", () => {
    expect(pick(sites(), "monument")?.id).toBe("a");
  });

  it("falls back to a type keyword when one undiscovered site of that type exists", () => {
    expect(pick(sites(), "the vault")?.id).toBe("a");
    expect(pick(sites(), "that derelict")?.id).toBe("b");
  });

  it("substring-matches the first candidate when the keyword is in several names", () => {
    // "vault" is literally in both vault names, so the substring rung fires
    // first (first-match, like selectExpeditionTrack) — it never reaches the
    // single-of-type fallback. Reveal is triggered by a finished expedition
    // whose label already resolved to one track, so first-match is safe here.
    const two = [
      { id: "a", name: "Precursor Vault — Monument", type: "vault", discovered: false },
      { id: "c", name: "Precursor Vault — Vessel",   type: "vault", discovered: false },
    ];
    expect(pick(two, "vault")?.id).toBe("a");
  });

  it("returns null for an ambiguous keyword with no name hit and several candidates", () => {
    const two = [
      { id: "b", name: "Derelict Starship",   type: "derelict", discovered: false },
      { id: "d", name: "Derelict Settlement", type: "derelict", discovered: false },
    ];
    // "ghost" is in neither name and there are two derelicts, so neither the
    // substring rung nor the single-of-type fallback can pick one → null.
    expect(pick(two, "ghost")).toBeNull();
  });

  it("auto-selects the sole undiscovered site when nothing else matches", () => {
    const one = [{ id: "a", name: "Precursor Vault — Monument", type: "vault", discovered: false }];
    expect(pick(one, "somewhere unrelated")?.id).toBe("a");
  });

  it("takes an explicit site id over every rung, and honours `eligible`", () => {
    expect(pick(sites(), "monument", { siteId: "b" })?.id).toBe("b");
    const cleared = [{ id: "x", name: "Old Vault", type: "vault", discovered: true, cleared: false }];
    expect(pick(cleared, "old vault", { eligible: s => s.discovered && !s.cleared })?.id).toBe("x");
  });
});


describe("selectSectorSite — requireLabelMatch (expedition→site stamping)", () => {
  const sites = [
    { id: "s1", name: "Precursor Vault — Sunken Choir", type: "vault", discovered: false },
  ];

  it("still falls back to the sole undiscovered site by default (reveal path)", () => {
    expect(pick(sites, "somewhere unrelated")?.id).toBe("s1");
  });

  it("returns null for a non-matching label when requireLabelMatch is set (stamping path)", () => {
    expect(pick(sites, "Bleakhold Station", { requireLabelMatch: true })).toBeNull();
    expect(pick(sites, null, { requireLabelMatch: true })).toBeNull();
  });

  it("still resolves confident matches with requireLabelMatch set", () => {
    expect(pick(sites, "sunken choir", { requireLabelMatch: true })?.id).toBe("s1");
    expect(pick(sites, "the vault", { requireLabelMatch: true })?.id).toBe("s1");
  });
});


// Issue #300 F07: the ladder ran sector by sector, so an earlier sector's sole
// (or sole-of-type) site was picked before a later sector's exact match — even
// with the expedition's explicit site id.
describe("selectSectorSite — across sectors", () => {
  const sectors = () => [
    { id: "s-old", mapData: { discoveries: [{ id: "mine", name: "Abandoned Mine", type: "derelict", discovered: false }] } },
    { id: "s-new", mapData: { discoveries: [
      { id: "target-site", name: "Crystal Vault", type: "vault",    discovered: false },
      { id: "wreck",       name: "Hollow Hulk",   type: "derelict", discovered: false },
    ] } },
  ];

  it("an exact name in a later sector beats an earlier sector's sole site", () => {
    expect(selectSectorSite(sectors(), "Crystal Vault")).toMatchObject({ sector: { id: "s-new" }, site: { id: "target-site" } });
  });

  it("an explicit site id beats an earlier sector's sole site", () => {
    expect(selectSectorSite(sectors(), "somewhere", { siteId: "target-site" })?.site.id).toBe("target-site");
  });

  it("a type-keyword guess is ambiguous across sectors unless the active sector settles it", () => {
    expect(selectSectorSite(sectors(), "the derelict")).toBeNull();
    expect(selectSectorSite(sectors(), "the derelict", { activeSectorId: "s-new" })?.site.id).toBe("wreck");
    expect(selectSectorSite(sectors(), "the derelict", { activeSectorId: "s-old" })?.site.id).toBe("mine");
  });

  it("the sole-site guess fires only when one candidate is left in scope", () => {
    expect(selectSectorSite(sectors(), "somewhere unrelated")).toBeNull();
    expect(selectSectorSite(sectors(), "somewhere unrelated", { activeSectorId: "s-old" })?.site.id).toBe("mine");
    expect(selectSectorSite(sectors(), "somewhere unrelated", { activeSectorId: "s-old", requireLabelMatch: true })).toBeNull();
  });
});


// Issue #321 U48: real generated names repeat across sectors (a derelict is
// named after its rolled type, numeral-suffixed only WITHIN a sector) and
// every name carries its type keyword, so "X I" is a substring of "X II". The
// exact and substring rungs ran first-match over every sector in storage
// order, and a label naming an ineligible site fell through to guesses.
describe("selectSectorSite — generated names (issue #321 U48)", () => {
  // Every derelict a deep-space starship, so names collide as they do in play.
  const roll = stubRoller({ derelict_location: "Deep Space", derelict_type: "Derelict starship" });
  const sectorOf = (id, region, trouble = "Energy storms are rampant", roller = roll) =>
    ({ id, mapData: { discoveries: generateSectorSites(region, trouble, { rollOracle: roller }) } });

  it("an exact name in the active sector beats a same-named site in an older sector", () => {
    const older  = sectorOf("sector-A", "terminus");   // one derelict: "Derelict Starship"
    const active = sectorOf("sector-B", "terminus");   // one derelict: "Derelict Starship"
    expect(older.mapData.discoveries[0].name).toBe("Derelict Starship");
    expect(active.mapData.discoveries[0].name).toBe("Derelict Starship");

    // The crew, in sector B, undertakes an expedition to "the derelict starship"
    // (index.js stamps the track's site link with requireLabelMatch).
    const picked = selectSectorSite([older, active], "the derelict starship", {
      requireLabelMatch: true, activeSectorId: "sector-B",
    });
    expect(picked?.sector.id).toBe("sector-B");
    // With no active sector, storage order still answers (the old behaviour).
    expect(selectSectorSite([older, active], "the derelict starship")?.sector.id).toBe("sector-A");
  });

  it("a generic type label is settled by the active sector, not the oldest sector", () => {
    const older  = sectorOf("sector-A", "terminus");
    const active = sectorOf("sector-B", "terminus");
    expect(selectSectorSite([older, active], "the derelict", { activeSectorId: "sector-B" })?.sector.id).toBe("sector-B");
  });

  it("an exact name for an already-charted site never falls through to its numbered sibling", () => {
    // Expanse: derelict + vault + derelict → "Derelict Starship I" / "Derelict Starship II".
    const sector = sectorOf("sector-X", "expanse");
    const names  = sector.mapData.discoveries.map(s => s.name);
    expect(names).toEqual(expect.arrayContaining(["Derelict Starship I", "Derelict Starship II"]));

    // `!reveal-site Derelict Starship II` charted II; the crew then swears an expedition to it.
    sector.mapData.discoveries.find(s => s.name === "Derelict Starship II").discovered = true;
    const stamped = selectSectorSite([sector], "Derelict Starship II", {
      requireLabelMatch: true, activeSectorId: "sector-X",
    });
    expect(stamped).toBeNull();   // the substring rung linked "…I" ("…ii" contains "…i")
    // Revealing by that name reveals nothing either (the sole-site guess included).
    expect(selectSectorSite([sector], "Derelict Starship II", { activeSectorId: "sector-X" })).toBeNull();
  });

  it("an expedition to an already-charted vault is not linked to a different undiscovered vault", () => {
    // Outlands + a precursor-themed trouble: derelict + vault + bonus vault.
    let n = 0;
    const vaultRoll = (tableId) => ({
      result: tableId === "vault_form" ? `Form ${++n}` : roll(tableId).result,
    });
    const sector = sectorOf("sector-V", "outlands", "Precursor sites throughout the sector emit strange signals", vaultRoll);
    const vaults = sector.mapData.discoveries.filter(s => s.type === "vault");
    expect(vaults).toHaveLength(2);
    const [charted, other] = vaults;
    charted.discovered = true;

    // The type-keyword rung ("vault" in the label, one undiscovered vault left) linked the other one.
    const stamped = selectSectorSite([sector], charted.name, { requireLabelMatch: true, activeSectorId: "sector-V" });
    expect(stamped).toBeNull();
    expect(selectSectorSite([sector], other.name, { requireLabelMatch: true, activeSectorId: "sector-V" })?.site.id).toBe(other.id);
  });

  it("an active-sector namesake that no longer qualifies settles the name — nothing, not another sector's", () => {
    const older  = sectorOf("sector-A", "terminus");
    const active = sectorOf("sector-B", "terminus");
    active.mapData.discoveries[0].discovered = true;   // the crew already charted B's derelict
    expect(selectSectorSite([older, active], "Derelict Starship", { activeSectorId: "sector-B" })).toBeNull();
    // An eligible exact match elsewhere still answers when the active sector has no namesake.
    expect(selectSectorSite([older, active], "Derelict Starship", { activeSectorId: "sector-C" })?.sector.id).toBe("sector-A");
  });

  it("a site link to a site that no longer qualifies returns nothing — no guess by name", () => {
    const sites = [
      { id: "v1", name: "Precursor Vault — Monument", type: "vault", discovered: true },
      { id: "v2", name: "Precursor Vault — Vessel",   type: "vault", discovered: false },
    ];
    expect(pick(sites, "the vault", { siteId: "v1" })).toBeNull();
    expect(pick(sites, "the vault", { siteId: "v2" })?.id).toBe("v2");
  });

  it("clearing by the exact name of a site not yet discovered clears nothing", () => {
    const sites = [
      { id: "v1", name: "Precursor Vault — Monument", type: "vault", discovered: false },
      { id: "v2", name: "Precursor Vault — Vessel",   type: "vault", discovered: true, cleared: false },
    ];
    const clearable = { eligible: s => s.discovered && !s.cleared };
    expect(pick(sites, "Precursor Vault — Monument", clearable)).toBeNull();
    expect(pick(sites, "Precursor Vault — Vessel", clearable)?.id).toBe("v2");
  });
});


describe("derelictTypeTableFor (SITE-TYPE-TABLE-MISMATCH)", () => {
  it("routes the type roll by rolled location", () => {
    expect(derelictTypeTableFor("Planetside")).toBe("derelict_type_planetside");
    expect(derelictTypeTableFor("Orbital")).toBe("derelict_type_orbital");
    expect(derelictTypeTableFor("Deep Space")).toBe("derelict_type");
    expect(derelictTypeTableFor(null)).toBe("derelict_type");
  });
});
