/**
 * STARFORGED COMPANION
 * tests/unit/sectorContext.test.js
 *
 * formatActiveSector — the ACTIVE SECTOR anchor block fed to every narrator
 * path. PLAYTEST-1712 T: the block now surfaces each settlement's Authority and
 * Trouble (so the narrator can't invent an administrator for a lawless
 * settlement) and lists the sector's established NPCs (so it reuses them instead
 * of cold-inventing new ones). The listers are mocked so we test the formatting
 * and directives directly, not the entity-read plumbing (covered elsewhere).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

vi.mock("../../src/entities/settlement.js", async () => {
  const actual = await vi.importActual("../../src/entities/settlement.js");
  return { ...actual, listSettlements: vi.fn(() => []) };
});
vi.mock("../../src/entities/connection.js", async () => {
  const actual = await vi.importActual("../../src/entities/connection.js");
  return { ...actual, listConnections: vi.fn(() => []) };
});
vi.mock("../../src/entities/planet.js", async () => {
  const actual = await vi.importActual("../../src/entities/planet.js");
  return { ...actual, listPlanets: vi.fn(() => []) };
});
vi.mock("../../src/entities/location.js", async () => {
  const actual = await vi.importActual("../../src/entities/location.js");
  return { ...actual, listLocations: vi.fn(() => []) };
});

import { formatActiveSector } from "../../src/narration/narrator.js";
import { listSettlements } from "../../src/entities/settlement.js";
import { listConnections } from "../../src/entities/connection.js";
import { listPlanets } from "../../src/entities/planet.js";
import { listLocations } from "../../src/entities/location.js";

const SECTOR = {
  id:      "sec-1",
  name:    "Igneous Maze",
  region:  "outlands",
  trouble: "Reactor plague",
  mapData: { settlements: [{ name: "Hypatia" }] },
};

function state(overrides = {}) {
  return {
    activeSectorId: "sec-1",
    sectors:        [SECTOR],
    settlementIds:  [],
    connectionIds:  [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(listSettlements).mockReturnValue([]);
  vi.mocked(listConnections).mockReturnValue([]);
  vi.mocked(listPlanets).mockReturnValue([]);
  vi.mocked(listLocations).mockReturnValue([]);
});

describe("formatActiveSector — planets & locations roster (issue #275)", () => {
  it("surfaces known planets with their class", () => {
    vi.mocked(listPlanets).mockReturnValue([
      { name: "Kalidas", sectorId: "sec-1", type: "Furnace World" },
    ]);
    const block = formatActiveSector(state());
    expect(block).toContain("Known planets");
    expect(block).toContain("Kalidas (Furnace World)");
  });

  it("surfaces known non-site locations", () => {
    vi.mocked(listLocations).mockReturnValue([
      { name: "Relay Station Kappa", sectorId: "sec-1", type: "station" },
    ]);
    const block = formatActiveSector(state());
    expect(block).toContain("Known locations");
    expect(block).toContain("Relay Station Kappa (station)");
  });

  it("EXCLUDES vault/derelict location records — sites must not leak", () => {
    vi.mocked(listLocations).mockReturnValue([
      { name: "Precursor Vault — Sphere", sectorId: "sec-1", type: "vault" },
      { name: "The Bellwether", sectorId: "sec-1", type: "derelict" },
    ]);
    const block = formatActiveSector(state());
    expect(block).not.toContain("Precursor Vault — Sphere");
    expect(block).not.toContain("The Bellwether");
    expect(block).not.toContain("Known locations");
  });

  it("filters planets to the active sector", () => {
    vi.mocked(listPlanets).mockReturnValue([
      { name: "Elsewhere Prime", sectorId: "sec-OTHER", type: "Vital World" },
    ]);
    const block = formatActiveSector(state());
    expect(block).not.toContain("Elsewhere Prime");
  });
});

describe("formatActiveSector — sector cast & attributes (PLAYTEST-1712 T)", () => {
  it("surfaces each settlement's Authority and Trouble with a no-lawless-official directive", () => {
    vi.mocked(listSettlements).mockReturnValue([
      { name: "Hypatia", sectorId: "sec-1", authority: "none / lawless", trouble: "Pirate tithes" },
    ]);
    const block = formatActiveSector(state());
    expect(block).toContain("Hypatia");
    expect(block).toContain("Authority: none / lawless");
    expect(block).toContain("Trouble: Pirate tithes");
    // The directive that prevents the playtest contradiction (an administrator
    // for a lawless settlement) must be present.
    expect(block).toContain("do not introduce an official");
    expect(block.toLowerCase()).toContain("lawless");
  });

  it("lists established NPCs with their roles so the narrator reuses them", () => {
    vi.mocked(listConnections).mockReturnValue([
      { name: "Nova Petrov", sectorId: "sec-1", role: "Smuggler captain" },
    ]);
    const block = formatActiveSector(state());
    expect(block).toContain("Nova Petrov — Smuggler captain");
    expect(block.toLowerCase()).toContain("established npcs");
  });

  it("surfaces the full recorded NPC profile and a consistency directive (PLAYTEST-1717 C)", () => {
    vi.mocked(listConnections).mockReturnValue([
      {
        name: "Doran Sterling", sectorId: "sec-1",
        role: "Prophet", goal: "Spread faith", pronouns: "he/him",
        disposition: "wary", firstLook: ["weathered flight jacket"],
      },
    ]);
    const block = formatActiveSector(state());
    // The whole recorded identity must reach the narrator — not just the role —
    // so the opening fiction can stay consistent instead of recasting it.
    expect(block).toContain("Doran Sterling — Prophet");
    expect(block).toContain("Goal: Spread faith");
    expect(block).toContain("Pronouns: he/him");
    expect(block).toContain("Disposition: wary");
    expect(block).toContain("First look: weathered flight jacket");
    // And the directive that binds the fiction to that identity.
    expect(block.toLowerCase()).toContain("keep them");
    expect(block.toLowerCase()).toContain("consistent");
    expect(block.toLowerCase()).toContain("do not reassign their role");
  });

  it("filters out settlements and NPCs that belong to other sectors", () => {
    vi.mocked(listSettlements).mockReturnValue([
      { name: "Hypatia",   sectorId: "sec-1", authority: "guilded" },
      { name: "Elsewhere", sectorId: "other", authority: "dictatorship" },
    ]);
    vi.mocked(listConnections).mockReturnValue([
      { name: "Nova Petrov",      sectorId: "sec-1", role: "Captain" },
      { name: "Offworld Stranger", sectorId: "other", role: "Spy" },
    ]);
    const block = formatActiveSector(state());
    expect(block).toContain("Hypatia");
    expect(block).not.toContain("Elsewhere");
    expect(block).toContain("Nova Petrov");
    expect(block).not.toContain("Offworld Stranger");
  });

  it("includes sector-less NPCs (campaign-wide) but not other-sector ones", () => {
    vi.mocked(listConnections).mockReturnValue([
      { name: "Wandering Oracle", role: "Mystic" },          // no sectorId → campaign-wide
      { name: "Offworld Stranger", sectorId: "other", role: "Spy" },
    ]);
    const block = formatActiveSector(state());
    expect(block).toContain("Wandering Oracle — Mystic");
    expect(block).not.toContain("Offworld Stranger");
  });

  it("includes all sector NPCs with no roster cap", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      name: `NPC-${i}`, sectorId: "sec-1", role: "extra",
    }));
    vi.mocked(listConnections).mockReturnValue(many);
    const block = formatActiveSector(state());
    expect(block).toContain("NPC-0 — extra");
    expect(block).toContain("NPC-11 — extra");
    expect(block).toContain("NPC-12 — extra"); // no cap: all 20 included
    expect(block).toContain("NPC-19 — extra");
  });

  it("falls back to map-data settlement names when no Actor records resolve", () => {
    vi.mocked(listSettlements).mockReturnValue([]);   // none readable
    const block = formatActiveSector(state());
    expect(block).toContain("- Hypatia");             // from the mapData fallback
  });

  it("tolerates a lister throwing and still returns the sector header", () => {
    vi.mocked(listSettlements).mockImplementation(() => { throw new Error("boom"); });
    vi.mocked(listConnections).mockImplementation(() => { throw new Error("boom"); });
    const block = formatActiveSector(state());
    expect(block).toContain("Active sector: Igneous Maze");
    // settlement read failed → falls back to map-data names
    expect(block).toContain("- Hypatia");
  });

  it("returns empty string when no active sector is set", () => {
    expect(formatActiveSector({ activeSectorId: null })).toBe("");
  });

  // PLAYTEST-1712 — throwaway characters. The narrator must try an established
  // character before inventing one, and any new character is scoped to this
  // sector so it can recur instead of drifting away after one mention.
  it("emits a CAST DISCIPLINE directive that reuses first and scopes new NPCs to the sector", () => {
    vi.mocked(listConnections).mockReturnValue([
      { name: "Nova Petrov", sectorId: "sec-1", role: "Captain" },
    ]);
    const block = formatActiveSector(state());
    expect(block).toContain("CAST DISCIPLINE");
    expect(block.toLowerCase()).toContain("reuse before you invent");
    expect(block.toLowerCase()).toContain("only when none of the established cast");
    expect(block).toContain("belongs to Igneous Maze");   // new NPCs scoped to this sector
    expect(block).toContain("the NPCs listed above");      // roster-aware wording
  });

  it("still emits the cast directive when the sector has no established NPCs", () => {
    vi.mocked(listConnections).mockReturnValue([]);   // empty roster
    const block = formatActiveSector(state());
    expect(block).toContain("CAST DISCIPLINE");
    expect(block).toContain("belongs to Igneous Maze");
    // roster-empty wording variant points elsewhere for reuse candidates
    expect(block.toLowerCase()).toContain("established elsewhere in the campaign");
  });
});
