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
  generateSectorSites,
  buildSiteLocationData,
  selectSiteForReveal,
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
      derelict_type:      "Derelict starship",
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

// ── selectSiteForReveal ───────────────────────────────────────────────────────

describe("selectSiteForReveal", () => {
  const sites = () => [
    { id: "a", name: "Precursor Vault — Monument", type: "vault",    discovered: false },
    { id: "b", name: "Derelict Starship",          type: "derelict", discovered: false },
  ];

  it("returns null when there are no undiscovered sites", () => {
    expect(selectSiteForReveal([], "vault")).toBeNull();
    expect(selectSiteForReveal([{ id: "a", name: "X", discovered: true }], "x")).toBeNull();
  });

  it("matches an exact name (case-insensitive, leading 'the' stripped)", () => {
    expect(selectSiteForReveal(sites(), "the derelict starship")?.id).toBe("b");
  });

  it("matches a substring in either direction", () => {
    expect(selectSiteForReveal(sites(), "monument")?.id).toBe("a");
  });

  it("falls back to a type keyword when one undiscovered site of that type exists", () => {
    expect(selectSiteForReveal(sites(), "the vault")?.id).toBe("a");
    expect(selectSiteForReveal(sites(), "that derelict")?.id).toBe("b");
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
    expect(selectSiteForReveal(two, "vault")?.id).toBe("a");
  });

  it("returns null for an ambiguous keyword with no name hit and several candidates", () => {
    const two = [
      { id: "b", name: "Derelict Starship",   type: "derelict", discovered: false },
      { id: "d", name: "Derelict Settlement", type: "derelict", discovered: false },
    ];
    // "ghost" is in neither name and there are two derelicts, so neither the
    // substring rung nor the single-of-type fallback can pick one → null.
    expect(selectSiteForReveal(two, "ghost")).toBeNull();
  });

  it("auto-selects the sole undiscovered site when nothing else matches", () => {
    const one = [{ id: "a", name: "Precursor Vault — Monument", type: "vault", discovered: false }];
    expect(selectSiteForReveal(one, "somewhere unrelated")?.id).toBe("a");
  });
});
