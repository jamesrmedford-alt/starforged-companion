/**
 * STARFORGED COMPANION
 * tests/unit/sectorSettlementNamesUnique.test.js
 *
 * SECTOR-DUPLICATE-NAMES: the Settlement Name table could roll one name twice
 * in a sector, and two settlements of one name are matched by name in places
 * (the roster, `!at`) — a same-sector clash was ambiguous. A generated
 * sector's settlements now have one name each: the table rolled again, else a
 * numeral, as a sector's repeated site names are told apart.
 *
 * The Settlement Name table is pinned here to one name, so every roll clashes.
 */

import { describe, it, expect, vi } from "vitest";

const control = vi.hoisted(() => ({ names: null }));
vi.mock("../../src/oracles/tables/settlements.js", async (original) => {
  const real = await original();
  return {
    ...real,
    get NAMES() { return control.names ?? real.NAMES; },
  };
});
vi.mock("../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));

import { generateSector } from "../../src/sectors/sectorGenerator.js";

describe("a sector's settlements have one name each (SECTOR-DUPLICATE-NAMES)", () => {
  it("a table that rolls one name every time still names four settlements apart", () => {
    control.names = [{ min: 1, max: 100, result: "Bleakhold" }];
    try {
      const sector = generateSector("terminus");
      const names  = sector.settlements.map(s => s.name);
      expect(names).toHaveLength(4);
      expect(new Set(names.map(n => n.toLowerCase())).size).toBe(4);
      expect(names[0]).toBe("Bleakhold");
      expect(names.slice(1)).toEqual(["Bleakhold II", "Bleakhold III", "Bleakhold IV"]);
      // The map pins and the connection's home carry the same names.
      expect(sector.mapData.settlements.map(s => s.name)).toEqual(names);
    } finally {
      control.names = null;
    }
  });

  it("control: real rolls give every sector's settlements distinct names", () => {
    for (let n = 0; n < 50; n++) {
      const names = generateSector("terminus").settlements.map(s => s.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
