/**
 * STARFORGED COMPANION
 * tests/unit/sectorGenerator.test.js
 *
 * Unit tests for sectors/sectorGenerator.js and the SECTOR_TROUBLE table.
 * Pure logic — no Foundry globals beyond the stubs in tests/setup.js.
 * Run with: npm test
 */

import { vi } from "vitest";
import {
  generateSectorName,
  generateSettlement,
  generatePlanet,
  generateConnection,
  generateSector,
  rollTableResult,
  buildSettlementStubPrompt,
  trimToLastSentence,
  applyStubsToSettlementEntities,
  createEntityJournals,
  storeSector,
} from "../../src/sectors/sectorGenerator.js";
import * as settlement from "../../src/entities/settlement.js";

import { buildSectorBackgroundPrompt } from "../../src/sectors/sectorArt.js";
import { SECTOR_TROUBLE } from "../../src/oracles/tables/misc.js";
import { ROLE, GOAL, FAMILY_NAMES } from "../../src/oracles/tables/characters.js";
import { ACTION, THEME } from "../../src/oracles/tables/core.js";
import { _resetFolderCache } from "../../src/entities/folder.js";


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
// rollTableResult — directive handling (F2)
// "Roll twice" / "Roll again (paired name)" / "Action + Theme" must be resolved
// in-place; the leaked literal strings were polluting connection names, NPC
// goals, and settlement-roll outputs.
// ─────────────────────────────────────────────────────────────────────────────

describe("rollTableResult — directive handling", () => {
  it("never returns 'Roll twice' as a literal across any character table", () => {
    for (const table of [ROLE, GOAL]) {
      for (let roll = 1; roll <= 100; roll++) {
        const result = rollTableResult(table, roll, { fixedRolls: [1, 1, 1, 1] });
        expect(result).not.toMatch(/Roll twice/i);
      }
    }
  });

  it("never returns 'Roll again' as a literal on FAMILY_NAMES", () => {
    for (let roll = 1; roll <= 100; roll++) {
      const result = rollTableResult(FAMILY_NAMES, roll, { fixedRolls: [1, 1, 1, 1] });
      expect(result).not.toMatch(/Roll again/i);
    }
  });

  it("resolves 'Roll twice' on ROLE by combining two sub-rolls with ' / '", () => {
    // ROLE 96-100 is "Roll twice". Force the directive on the outer roll, then
    // force fixedRolls=[1, 3] so the two recursed rolls land on Agent (1-2) and
    // AI (3-4) respectively.
    const result = rollTableResult(ROLE, 96, { fixedRolls: [1, 3] });
    expect(result).toBe("Agent / AI");
  });

  it("resolves 'Roll again (paired name)' on FAMILY_NAMES by hyphenating two sub-rolls", () => {
    // FAMILY_NAMES 81-100 → "Roll again (paired name)". Sub-rolls of 1 / 3 land on
    // the first two entries of FAMILY_NAMES.
    const result = rollTableResult(FAMILY_NAMES, 81, { fixedRolls: [1, 3] });
    expect(result).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+$/);
    expect(result).not.toMatch(/Roll/);
  });

  it("resolves 'Action + Theme' via ref: 'action_theme'", () => {
    // ROLE 93-95 has ref: "action_theme". Sub-rolls of 1, 1 land on the first
    // entry of each of CORE.ACTION and CORE.THEME.
    const result = rollTableResult(ROLE, 93, { fixedRolls: [1, 1] });
    const firstAction = ACTION.find(e => e.min <= 1 && e.max >= 1).result;
    const firstTheme  = THEME.find(e => e.min <= 1 && e.max >= 1).result;
    expect(result).toBe(`${firstAction} ${firstTheme}`);
  });

  it("terminates recursion on degenerate chains (no infinite loop)", () => {
    // Force every fixed sub-roll into the directive band (96) — without the
    // depth cap the resolver would recurse forever. Should bail at MAX depth
    // and fall back to the literal directive text.
    const fixedRolls = Array(50).fill(96);
    const result = rollTableResult(ROLE, 96, { fixedRolls });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("passes through non-directive entries unchanged", () => {
    expect(rollTableResult(ROLE, 1)).toBe("Agent");
    expect(rollTableResult(GOAL, 1)).toBe("Avenge a wrong");
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

  it("produces 4 passages for terminus", () => {
    const sector = generateSector("terminus");
    expect(sector.passages).toHaveLength(4);
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

  it("produces 3 passages for outlands", () => {
    const sector = generateSector("outlands");
    expect(sector.passages).toHaveLength(3);
  });
});

describe("generateSector('expanse')", () => {
  it("produces 2 settlements for expanse", () => {
    const sector = generateSector("expanse");
    expect(sector.settlements).toHaveLength(2);
  });

  it("produces 2 passages for expanse", () => {
    const sector = generateSector("expanse");
    expect(sector.passages).toHaveLength(2);
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

// F4: sector narrative passages were cut off mid-sentence by the token cap.
describe("trimToLastSentence (F4)", () => {
  it("trims a length-truncated tail back to the last complete sentence", () => {
    const cut = "The void hums with menace. The real question, as you chart your course through the cold black between them";
    expect(trimToLastSentence(cut, true)).toBe("The void hums with menace.");
  });

  it("leaves naturally-complete text untouched even if truncated flag is set", () => {
    const done = "A quiet sector. Nothing stirs here yet.";
    expect(trimToLastSentence(done, true)).toBe(done);
  });

  it("never trims when the generation was not truncated", () => {
    const ongoing = "An evocative fragment with no ending punctuation";
    expect(trimToLastSentence(ongoing, false)).toBe(ongoing);
  });

  it("leaves text unchanged when there is no earlier sentence boundary", () => {
    const oneClause = "A single dangling clause that never closes";
    expect(trimToLastSentence(oneClause, true)).toBe(oneClause);
  });

  it("preserves a closing quote/paren after terminal punctuation", () => {
    const quoted = '"We are not alone." She believed it, right up until the end';
    expect(trimToLastSentence(quoted, true)).toBe('"We are not alone."');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// applyStubsToSettlementEntities (F3 — write the stub to the settlement Actor)
// ─────────────────────────────────────────────────────────────────────────────

describe("applyStubsToSettlementEntities", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("routes each stub through updateSettlement keyed by actor id", async () => {
    const spy = vi.spyOn(settlement, "updateSettlement").mockResolvedValue({});
    await applyStubsToSettlementEntities(
      { gen1: { id: "actor-1" }, gen2: { id: "actor-2" } },
      { settlements: { gen1: "A windswept dome.", gen2: "A rusting orbital." } },
    );
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith("actor-1", expect.objectContaining({ description: "A windswept dome." }));
    expect(spy).toHaveBeenCalledWith("actor-2", expect.objectContaining({ description: "A rusting orbital." }));
  });

  it("skips settlements with no stub, an empty stub, or a missing actor", async () => {
    const spy = vi.spyOn(settlement, "updateSettlement").mockResolvedValue({});
    await applyStubsToSettlementEntities(
      { gen1: { id: "actor-1" }, gen2: null, gen3: { id: "actor-3" } },
      { settlements: { gen1: "Only this one.", gen3: "" } }, // gen2 actor null, gen3 stub empty
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("actor-1", expect.objectContaining({ description: "Only this one." }));
  });

  it("no-ops when the stubs payload has no settlements", async () => {
    const spy = vi.spyOn(settlement, "updateSettlement").mockResolvedValue({});
    await applyStubsToSettlementEntities({ gen1: { id: "actor-1" } }, {});
    expect(spy).not.toHaveBeenCalled();
  });

  it("swallows an updateSettlement failure without throwing (one bad write doesn't sink the batch)", async () => {
    const spy = vi.spyOn(settlement, "updateSettlement")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue({});
    await expect(applyStubsToSettlementEntities(
      { gen1: { id: "actor-1" }, gen2: { id: "actor-2" } },
      { settlements: { gen1: "fails", gen2: "succeeds" } },
    )).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// F4 — sector-folder routing. createEntityJournals must pre-register the
// sector in campaignState.sectors before any settlement is created, so the
// per-sector Actor folder helpers (`getOrCreateSectorActorFolder`) resolve
// `Sectors / <Sector Name>` instead of falling back to `Sectors / Unsorted`.
// Without this stub, every sector-spawned settlement lands in Unsorted.
// ─────────────────────────────────────────────────────────────────────────────

describe("createEntityJournals — F4 sector-folder pre-registration", () => {
  beforeEach(() => {
    if (global.game?.folders?._reset) global.game.folders._reset();
    if (global.game?.actors?._reset)  global.game.actors._reset();
    _resetFolderCache();
  });

  it("adds a {id, name} sector stub to campaignState.sectors before any settlement is created", async () => {
    const sector = {
      id:   "sector-test-001",
      name: "Delphian Anvil",
      settlements: [],
      connection: { id: "c-1", name: "Amelia Stark", role: "Scholar", goal: "Collect a debt", aspect: "Calm", firstLook: ["Bookish"], homeSettlement: "the sector" },
    };
    const campaignState = { sectors: [], settlementIds: [], connectionIds: [] };

    await createEntityJournals(sector, campaignState);

    const stub = campaignState.sectors.find(s => s.id === sector.id);
    expect(stub).toBeDefined();
    expect(stub.name).toBe("Delphian Anvil");
  });

  it("is idempotent — running twice does not duplicate the sector record", async () => {
    const sector = {
      id:   "sector-test-002",
      name: "Sulaco Arch",
      settlements: [],
      connection: { id: "c-2", name: "Mira Vega", role: "Pilot", goal: "Find a person", aspect: "Aloof", firstLook: ["Scarred"], homeSettlement: "the sector" },
    };
    const campaignState = { sectors: [], settlementIds: [], connectionIds: [] };

    await createEntityJournals(sector, campaignState);
    await createEntityJournals(sector, campaignState);

    const matches = campaignState.sectors.filter(s => s.id === sector.id);
    expect(matches).toHaveLength(1);
  });

  it("storeSector replaces the pre-registered stub in place rather than appending a second copy", async () => {
    const sector = {
      id:        "sector-test-003",
      name:      "Devil's Maw",
      region:    "terminus",
      regionLabel: "Terminus",
      trouble:   "Pirates",
      faction:   null,
      settlements: [],
      createdAt: new Date().toISOString(),
      mapData:   { sectorId: "sector-test-003", gridWidth: 10, gridHeight: 8, settlements: [], passages: [], discoveries: [] },
      connection: { id: "c-3", name: "Kael Volkov", role: "Smuggler", goal: "Gain riches", aspect: "Bold", firstLook: ["Scarred"], homeSettlement: "the sector" },
    };
    const campaignState = { sectors: [], settlementIds: [], connectionIds: [] };

    // Step 1: createEntityJournals pre-registers a stub
    await createEntityJournals(sector, campaignState);
    expect(campaignState.sectors).toHaveLength(1);
    const stub = campaignState.sectors[0];
    expect(stub.name).toBe("Devil's Maw");
    // The stub is a minimal {id, name} — no trouble / region / mapData yet.
    expect(stub.trouble).toBeUndefined();

    // Step 2: storeSector lands the full record and replaces the stub
    await storeSector(sector, { settlements: {}, connectionJournalId: null }, campaignState);
    expect(campaignState.sectors).toHaveLength(1);
    const stored = campaignState.sectors[0];
    expect(stored.id).toBe("sector-test-003");
    expect(stored.trouble).toBe("Pirates");
    expect(stored.region).toBe("terminus");
  });
});
