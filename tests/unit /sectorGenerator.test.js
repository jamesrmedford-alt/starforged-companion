/**
 * STARFORGED COMPANION
 * tests/unit/sectorGenerator.test.js
 *
 * Unit tests for sectors/sectorGenerator.js and the SECTOR_TROUBLE table.
 * Pure logic — no Foundry globals beyond the stubs in tests/setup.js.
 * Run with: npm test
 */

import {
  generateSectorName,
  generateSettlement,
  generatePlanet,
  generateConnection,
  generateSector,
  rollTableResult,
  buildSettlementStubPrompt,
} from "../../src/sectors/sectorGenerator.js";

import { buildSectorBackgroundPrompt } from "../../src/sectors/sectorArt.js";
import { SECTOR_TROUBLE } from "../../src/oracles/tables/misc.js";


// ─────────────────────────────────────────────────────────────────────────────
// SECTOR_TROUBLE TABLE
// ─────────────────────────────────────────────────────────────────────────────

describe("SECTOR_TROUBLE table", () => {
  it("has 20 entries", () => {
    expect(SECTOR_TROUBLE).toHaveLength(20);
  });

  it("min of first entry is 1", () => {
    expect(SECTOR_TROUBLE[0].min).toBe(1);
  });

  it("max of last entry is 100", () => {
    expect(SECTOR_TROUBLE[SECTOR_TROUBLE.length - 1].max).toBe(100);
  });

  it("covers a contiguous range with no gaps", () => {
    for (let i = 1; i < SECTOR_TROUBLE.length; i++) {
      const prev = SECTOR_TROUBLE[i - 1];
      const curr = SECTOR_TROUBLE[i];
      expect(curr.min).toBe(prev.max + 1);
    }
  });

  it("rollTableResult returns a string for any roll 1-100", () => {
    for (let roll = 1; roll <= 100; roll++) {
      const result = rollTableResult(SECTOR_TROUBLE, roll);
      expect(typeof result).toBe("string");
      expect(result).not.toBe("Unknown");
    }
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// generateSectorName
// ─────────────────────────────────────────────────────────────────────────────

describe("generateSectorName()", () => {
  it("returns prefix and suffix strings", () => {
    const result = generateSectorName();
    expect(typeof result.prefix).toBe("string");
    expect(typeof result.suffix).toBe("string");
    expect(result.prefix.length).toBeGreaterThan(0);
    expect(result.suffix.length).toBeGreaterThan(0);
  });

  it("full name is 'prefix suffix'", () => {
    const result = generateSectorName();
    expect(result.full).toBe(`${result.prefix} ${result.suffix}`);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// generateSettlement
// ─────────────────────────────────────────────────────────────────────────────

describe("generateSettlement('terminus')", () => {
  it("returns name, locationType, population, authority, projects array", () => {
    const s = generateSettlement("terminus");
    expect(typeof s.name).toBe("string");
    expect(s.name.length).toBeGreaterThan(0);
    expect(typeof s.locationType).toBe("string");
    expect(typeof s.population).toBe("string");
    expect(typeof s.authority).toBe("string");
    expect(Array.isArray(s.projects)).toBe(true);
  });

  it("projects array has 1-2 entries", () => {
    for (let i = 0; i < 20; i++) {
      const s = generateSettlement("terminus");
      expect(s.projects.length).toBeGreaterThanOrEqual(1);
      expect(s.projects.length).toBeLessThanOrEqual(2);
    }
  });

  it("locationType is 'orbital' | 'planetside' | 'deep_space'", () => {
    const valid = new Set(["orbital", "planetside", "deep_space"]);
    for (let i = 0; i < 20; i++) {
      const s = generateSettlement("terminus");
      expect(valid.has(s.locationType)).toBe(true);
    }
  });

  it("has an id", () => {
    const s = generateSettlement("terminus");
    expect(s.id).toBeTruthy();
  });
});

describe("generateSettlement — region variants", () => {
  it("terminus, outlands, and expanse all produce valid settlements", () => {
    for (const region of ["terminus", "outlands", "expanse"]) {
      const s = generateSettlement(region);
      expect(typeof s.name).toBe("string");
      expect(["orbital", "planetside", "deep_space"]).toContain(s.locationType);
    }
  });

  it("projects always contain at least one string entry per region", () => {
    for (const region of ["terminus", "outlands", "expanse"]) {
      const s = generateSettlement(region, 1);
      expect(s.projects).toHaveLength(1);
      expect(typeof s.projects[0]).toBe("string");
    }
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// generatePlanet
// ─────────────────────────────────────────────────────────────────────────────

describe("generatePlanet('orbital')", () => {
  it("returns planet type and name", () => {
    const p = generatePlanet("orbital");
    expect(typeof p.type).toBe("string");
    expect(typeof p.name).toBe("string");
  });

  it("name is a non-empty string", () => {
    const p = generatePlanet("orbital");
    expect(p.name.length).toBeGreaterThan(0);
  });

  it("type is a known planet type", () => {
    const known = [
      "Desert World", "Furnace World", "Grave World", "Ice World",
      "Jovian World", "Jungle World", "Ocean World", "Rocky World",
      "Shattered World", "Tainted World", "Vital World",
    ];
    for (let i = 0; i < 10; i++) {
      const p = generatePlanet("orbital");
      expect(known).toContain(p.type);
    }
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// generateConnection
// ─────────────────────────────────────────────────────────────────────────────

describe("generateConnection('Bleakhold')", () => {
  it("returns name, role, goal, aspect, homeSettlement", () => {
    const c = generateConnection("Bleakhold");
    expect(typeof c.name).toBe("string");
    expect(typeof c.role).toBe("string");
    expect(typeof c.goal).toBe("string");
    expect(typeof c.aspect).toBe("string");
    expect(c.homeSettlement).toBe("Bleakhold");
  });

  it("homeSettlement matches argument", () => {
    const c = generateConnection("Voidfall Station");
    expect(c.homeSettlement).toBe("Voidfall Station");
  });

  it("name is two words (given + family)", () => {
    const c = generateConnection("test");
    const parts = c.name.trim().split(" ");
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// generateSector
// ─────────────────────────────────────────────────────────────────────────────

describe("generateSector('terminus')", () => {
  it("produces 4 settlements for terminus", () => {
    const sector = generateSector("terminus");
    expect(sector.settlements).toHaveLength(4);
  });

  it("produces 3 passages for terminus", () => {
    const sector = generateSector("terminus");
    expect(sector.passages).toHaveLength(3);
  });

  it("sector has a trouble string", () => {
    const sector = generateSector("terminus");
    expect(typeof sector.trouble).toBe("string");
    expect(sector.trouble.length).toBeGreaterThan(0);
  });

  it("sector has a connection", () => {
    const sector = generateSector("terminus");
    expect(sector.connection).toBeDefined();
    expect(typeof sector.connection.name).toBe("string");
  });

  it("sector has an id", () => {
    const sector = generateSector("terminus");
    expect(sector.id).toBeTruthy();
  });

  it("sector has the correct region and regionLabel", () => {
    const sector = generateSector("terminus");
    expect(sector.region).toBe("terminus");
    expect(sector.regionLabel).toBe("Terminus");
  });
});

describe("generateSector('outlands')", () => {
  it("produces 3 settlements for outlands", () => {
    const sector = generateSector("outlands");
    expect(sector.settlements).toHaveLength(3);
  });

  it("produces 2 passages for outlands", () => {
    const sector = generateSector("outlands");
    expect(sector.passages).toHaveLength(2);
  });
});

describe("generateSector('expanse')", () => {
  it("produces 2 settlements for expanse", () => {
    const sector = generateSector("expanse");
    expect(sector.settlements).toHaveLength(2);
  });

  it("produces 1 passage for expanse", () => {
    const sector = generateSector("expanse");
    expect(sector.passages).toHaveLength(1);
  });
});

describe("generateSector mapData", () => {
  it("mapData has correct settlement count matching sector", () => {
    for (const region of ["terminus", "outlands", "expanse"]) {
      const sector = generateSector(region);
      expect(sector.mapData.settlements).toHaveLength(sector.settlements.length);
    }
  });

  it("mapData settlements have gridX and gridY coordinates", () => {
    const sector = generateSector("terminus");
    for (const s of sector.mapData.settlements) {
      expect(typeof s.gridX).toBe("number");
      expect(typeof s.gridY).toBe("number");
    }
  });
});

describe("generateSector — throws on unknown region", () => {
  it("throws for unknown region", () => {
    expect(() => generateSector("void")).toThrow();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// buildSectorBackgroundPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSectorBackgroundPrompt — terminus", () => {
  const sector = { region: "terminus", trouble: "Piracy is rampant", settlements: [] };

  it("includes 1792x1024 size", () => {
    const { size } = buildSectorBackgroundPrompt(sector);
    expect(size).toBe("1792x1024");
  });

  it("includes warm/amber/dense tone words in the prompt", () => {
    const { prompt } = buildSectorBackgroundPrompt(sector);
    expect(prompt.toLowerCase()).toMatch(/amber|warm|dense/);
  });
});

describe("buildSectorBackgroundPrompt — expanse", () => {
  const sector = { region: "expanse", trouble: "Piracy is rampant", settlements: [] };

  it("includes sparse/dark/lonely tone words in the prompt", () => {
    const { prompt } = buildSectorBackgroundPrompt(sector);
    expect(prompt.toLowerCase()).toMatch(/sparse|dark|desolate|empty/);
  });
});

describe("buildSectorBackgroundPrompt — trouble visual modifiers", () => {
  it("adds storm modifier for 'Energy storms are rampant'", () => {
    const sector = { region: "terminus", trouble: "Energy storms are rampant", settlements: [] };
    const { prompt } = buildSectorBackgroundPrompt(sector);
    expect(prompt.toLowerCase()).toMatch(/storm|lightning/);
  });

  it("adds dying star modifier for 'Supernova is imminent'", () => {
    const sector = { region: "expanse", trouble: "Supernova is imminent", settlements: [] };
    const { prompt } = buildSectorBackgroundPrompt(sector);
    expect(prompt.toLowerCase()).toMatch(/supernova|dying star|star/);
  });

  it("does not append modifier for unrecognised trouble", () => {
    const sector = { region: "outlands", trouble: "Taxes are high", settlements: [] };
    const { prompt: withoutModifier } = buildSectorBackgroundPrompt(sector);
    const basePrompt = buildSectorBackgroundPrompt({ region: "outlands", trouble: "ignored", settlements: [] }).prompt;
    // Both prompts should be the same length (no modifier appended)
    expect(withoutModifier).toBe(basePrompt);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// buildSettlementStubPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSettlementStubPrompt", () => {
  const sector = {
    name:   "Devil's Maw",
    region: "terminus",
    regionLabel: "Terminus",
  };

  const settlement = {
    name:         "Ironhold",
    locationType: "orbital",
    population:   "Hundreds",
    authority:    "Guild",
    projects:     ["Mining", "Trade"],
    trouble:      null,
    planet:       null,
  };

  it("includes the settlement name", () => {
    const prompt = buildSettlementStubPrompt(settlement, sector, "Terminus");
    expect(prompt).toContain("Ironhold");
  });

  it("includes population and authority", () => {
    const prompt = buildSettlementStubPrompt(settlement, sector, "Terminus");
    expect(prompt).toContain("Hundreds");
    expect(prompt).toContain("Guild");
  });

  it("includes the projects list", () => {
    const prompt = buildSettlementStubPrompt(settlement, sector, "Terminus");
    expect(prompt).toContain("Mining");
    expect(prompt).toContain("Trade");
  });

  it("includes the sector name and region label", () => {
    const prompt = buildSettlementStubPrompt(settlement, sector, "Terminus");
    expect(prompt).toContain("Devil's Maw");
    expect(prompt).toContain("Terminus");
  });

  it("omits the trouble line when trouble is null", () => {
    const prompt = buildSettlementStubPrompt(settlement, sector, "Terminus");
    expect(prompt).not.toContain("Current trouble:");
  });

  it("includes the trouble line when trouble is present", () => {
    const s = { ...settlement, trouble: "Riots are breaking out" };
    const prompt = buildSettlementStubPrompt(s, sector, "Terminus");
    expect(prompt).toContain("Riots are breaking out");
  });

  it("includes planet details when planet is present", () => {
    const s = {
      ...settlement,
      planet: { type: "Ice World", name: "Caul Prime" },
    };
    const prompt = buildSettlementStubPrompt(s, sector, "Terminus");
    expect(prompt).toContain("Ice World");
    expect(prompt).toContain("Caul Prime");
  });

  it("uses provided perspective note", () => {
    const prompt = buildSettlementStubPrompt(settlement, sector, "Terminus", "Narrate in first person");
    expect(prompt).toContain("Narrate in first person");
  });
});
