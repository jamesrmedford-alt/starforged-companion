/**
 * PROBE — SITE-LADDER-WRONG-SITE
 *
 * selectSectorSite (src/sectors/precursorSites.js) — used by the expedition→site
 * stamp (index.js, requireLabelMatch), the expedition-finish reveal, and
 * !reveal-site / !clear-site — runs its exact and substring rungs first-match
 * across ALL sectors in storage order, and lets the substring rung fire even
 * when the label exactly names a site that is no longer eligible.
 *
 * Real generated names (generateSectorSites) make both bite: a derelict is
 * named after its rolled type ("Derelict Starship" / "Derelict Settlement",
 * numeral-suffixed only WITHIN a sector) and every name carries its type
 * keyword, so names repeat across sectors and "X I" is a substring of "X II".
 *
 * Assertions describe the CORRECT behaviour; they fail today.
 */

import { describe, it, expect } from "vitest";
import { generateSectorSites, selectSectorSite } from "../../../src/sectors/precursorSites.js";

// Deterministic roller: every derelict is a deep-space starship.
const roll = (tableId) => ({
  result: ({
    derelict_location: "Deep Space",
    derelict_type:     "Derelict starship",
  })[tableId] ?? `<${tableId}>`,
});

function sectorOf(id, region) {
  return { id, mapData: { discoveries: generateSectorSites(region, "Energy storms are rampant", { rollOracle: roll }) } };
}

describe("PROBE SITE-LADDER-WRONG-SITE", () => {
  it("an exact name in the ACTIVE sector beats a same-named site in an older sector", () => {
    const older  = sectorOf("sector-A", "terminus");   // one derelict: "Derelict Starship"
    const active = sectorOf("sector-B", "terminus");   // one derelict: "Derelict Starship"
    expect(older.mapData.discoveries[0].name).toBe("Derelict Starship");
    expect(active.mapData.discoveries[0].name).toBe("Derelict Starship");

    // The crew, in sector B, undertakes an expedition to "the derelict starship"
    // → index.js stamps the track with this site (requireLabelMatch: true).
    const picked = selectSectorSite([older, active], "the derelict starship", {
      requireLabelMatch: true, activeSectorId: "sector-B",
    });
    expect(picked?.sector.id).toBe("sector-B");
  });

  it("a generic type label is settled by the active sector (the keyword rung's promise), not the oldest sector", () => {
    const older  = sectorOf("sector-A", "terminus");
    const active = sectorOf("sector-B", "terminus");
    const picked = selectSectorSite([older, active], "the derelict", { activeSectorId: "sector-B" });
    expect(picked?.sector.id).toBe("sector-B");
  });

  it("an exact name for an already-charted site never falls through to its numbered sibling", () => {
    // Expanse: derelict + vault + derelict → "Derelict Starship I" / "Derelict Starship II".
    const sector = sectorOf("sector-X", "expanse");
    const names = sector.mapData.discoveries.map(s => s.name);
    expect(names).toEqual(expect.arrayContaining(["Derelict Starship I", "Derelict Starship II"]));

    // `!reveal-site Derelict Starship II` charted II; the Site Discovered card then
    // says "undertake an expedition there", so the crew swears one to II.
    const two = sector.mapData.discoveries.find(s => s.name === "Derelict Starship II");
    two.discovered = true;

    const stamped = selectSectorSite([sector], "Derelict Starship II", {
      requireLabelMatch: true, activeSectorId: "sector-X",
    });
    // CORRECT: no undiscovered site is named "Derelict Starship II" → no link.
    // Today the substring rung links "Derelict Starship I" ("…ii".includes("…i")),
    // and finishing the expedition reveals that unrelated site.
    expect(stamped?.site.name ?? null).toBeNull();
  });

  it("an expedition to an already-charted vault is not linked to a DIFFERENT undiscovered vault", () => {
    // Outlands + a precursor-themed trouble: derelict + vault + bonus vault.
    const vaultRoll = (tableId) => ({
      result: ({ derelict_location: "Deep Space", derelict_type: "Derelict starship" })[tableId]
        ?? (tableId === "vault_form" ? `Form${Math.random().toString(36).slice(2, 6)}` : `<${tableId}>`),
    });
    const sector = { id: "sector-V", mapData: { discoveries: generateSectorSites("outlands", "Precursor sites throughout the sector emit strange signals", { rollOracle: vaultRoll }) } };
    const vaults = sector.mapData.discoveries.filter(s => s.type === "vault");
    expect(vaults).toHaveLength(2);
    const [charted, other] = vaults;
    charted.discovered = true;                       // revealed earlier (!reveal-site / a finished expedition)

    // The crew swears an expedition to the charted vault, by its exact name.
    const stamped = selectSectorSite([sector], charted.name, { requireLabelMatch: true, activeSectorId: "sector-V" });
    // CORRECT: nothing to link (the named vault is already charted). Today the
    // type-keyword rung ("vault" in the label, one undiscovered vault left)
    // links the OTHER vault, which the finish then reveals.
    expect(stamped?.site.id ?? null).toBeNull();
    expect(stamped?.site.id).not.toBe(other.id);
  });
});
