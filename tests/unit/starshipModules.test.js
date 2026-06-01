/**
 * STARFORGED COMPANION
 * tests/unit/starshipModules.test.js
 *
 * Pure-function coverage for src/entities/starshipModules.js — the roll →
 * Module-slug mapping that closes F18 (the v1.7.0 playtest finding where ship
 * Modules didn't match the rolled narrative identity).
 */

import { describe, it, expect } from "vitest";
import {
  pickModulesForRolledIdentity,
  CANONICAL_MODULE_SLUGS,
} from "../../src/entities/starshipModules.js";


describe("CANONICAL_MODULE_SLUGS", () => {
  it("lists the 15 canonical Module assets the starforgedassets compendium ships", () => {
    expect(CANONICAL_MODULE_SLUGS).toHaveLength(15);
  });

  it("matches the foundry-ironsworn slugs verbatim (snake_case, lowercase)", () => {
    expect(CANONICAL_MODULE_SLUGS).toEqual(expect.arrayContaining([
      "engine_upgrade", "expanded_hold", "grappler", "heavy_cannons",
      "internal_refit", "medbay", "missile_array", "overseer",
      "reinforced_hull", "research_lab", "sensor_array", "shields",
      "stealth_tech", "vehicle_bay", "workshop",
    ]));
    for (const slug of CANONICAL_MODULE_SLUGS) {
      expect(slug).toMatch(/^[a-z][a-z0-9_]+$/);
    }
  });
});


describe("pickModulesForRolledIdentity", () => {
  it("solves the F18 playtest case (Hunter / Bristling with weapons / Provide medical aid)", () => {
    const picks = pickModulesForRolledIdentity({
      type:      "Hunter — Stealthy attack ship",
      firstLook: "Bristling with weapons",
      mission:   "Provide medical aid",
    });
    // The expected lean: weapons from the bristling + hunter rules, stealth
    // from the hunter rule, medbay from the medical aid rule. Three matches
    // is the default cap.
    expect(picks).toHaveLength(3);
    expect(picks).toContain("heavy_cannons");
    expect(picks).toContain("missile_array");
    expect(picks).toContain("medbay");
  });

  it("returns up to 3 modules by default", () => {
    const picks = pickModulesForRolledIdentity({
      type:      "Dreadnought — Heavy attack ship",
      firstLook: "Heavy armor",
      mission:   "Defend against an attack",
    });
    expect(picks.length).toBeLessThanOrEqual(3);
    expect(picks.length).toBeGreaterThan(0);
  });

  it("honours an explicit limit", () => {
    const picks = pickModulesForRolledIdentity(
      { type: "Hunter — Stealthy attack ship", firstLook: "Bristling with weapons", mission: "Provide medical aid" },
      { limit: 2 },
    );
    expect(picks).toHaveLength(2);
  });

  it("returns [] for limit=0", () => {
    expect(pickModulesForRolledIdentity({ type: "Dreadnought — Heavy attack ship" }, { limit: 0 }))
      .toEqual([]);
  });

  it("returns [] when no rolls are provided", () => {
    expect(pickModulesForRolledIdentity({})).toEqual([]);
    expect(pickModulesForRolledIdentity()).toEqual([]);
  });

  it("returns [] for an identity with no keyword matches (Fleet, Unusual or unknown)", () => {
    expect(pickModulesForRolledIdentity({
      type: "Battle fleet",  // fleet sub-type with no module-specific keywords
      firstLook: "Ornate markings",
      mission: "Action + Theme",
    })).toEqual([]);

    expect(pickModulesForRolledIdentity({
      type: "Unusual or unknown",
      firstLook: "Biological components",
      mission: "Hold prisoners",
    })).toEqual([]);
  });

  it("accumulates score across rules — stealth-heavy identity puts stealth_tech first", () => {
    const picks = pickModulesForRolledIdentity({
      type:      "Hunter — Stealthy attack ship",
      firstLook: "Dark or stealthy",
      mission:   "Smuggle cargo",
    });
    // Hunter rule emits stealth_tech, dark/stealthy rule emits stealth_tech,
    // smuggle rule emits stealth_tech — score 3 vs every other module's ≤1.
    expect(picks[0]).toBe("stealth_tech");
  });

  it("a courier delivering messages stacks engine_upgrade and sensor_array", () => {
    const picks = pickModulesForRolledIdentity({
      type:      "Courier — Fast transport",
      firstLook: "Oversized engines",
      mission:   "Deliver messages or data",
    });
    // Courier → engine_upgrade + sensor_array; oversized → engine_upgrade;
    // deliver messages → engine_upgrade. engine_upgrade scores 3, sensor_array 1.
    expect(picks[0]).toBe("engine_upgrade");
    expect(picks).toContain("sensor_array");
  });

  it("a research outbounder surveying a site picks research_lab and sensor_array", () => {
    const picks = pickModulesForRolledIdentity({
      type:      "Outbounder — Remote survey or research",
      firstLook: "Large sensor arrays",
      mission:   "Survey a site",
    });
    expect(picks).toContain("research_lab");
    expect(picks).toContain("sensor_array");
  });

  it("a salvage reclaimer picks grappler + workshop + medbay", () => {
    const picks = pickModulesForRolledIdentity({
      type:      "Reclaimer — Salvage or rescue",
      firstLook: "Refitted or repurposed hull",
      mission:   "Retrieve salvage",
    });
    // Reclaimer alone emits grappler / workshop / medbay; retrieve salvage
    // also emits grappler / expanded_hold; refitted emits internal_refit.
    // grappler should be at the top (score 2).
    expect(picks).toContain("grappler");
  });

  it("a hauler with reinforced characteristics picks expanded_hold and reinforced_hull", () => {
    const picks = pickModulesForRolledIdentity({
      type:      "Hauler — Heavy transport",
      firstLook: "Heavy armor",
      mission:   "Transport cargo",
    });
    expect(picks).toContain("expanded_hold");
    expect(picks).toContain("reinforced_hull");
  });

  it("a pennant command ship picks overseer and sensor_array", () => {
    const picks = pickModulesForRolledIdentity({
      type:    "Pennant — Command ship",
      mission: "Command others",
    });
    expect(picks).toContain("overseer");
    expect(picks).toContain("sensor_array");
  });

  it("matching is case-insensitive", () => {
    const upper = pickModulesForRolledIdentity({
      type:      "HUNTER — STEALTHY ATTACK SHIP",
      firstLook: "BRISTLING WITH WEAPONS",
    });
    const lower = pickModulesForRolledIdentity({
      type:      "hunter — stealthy attack ship",
      firstLook: "bristling with weapons",
    });
    expect(upper).toEqual(lower);
  });

  it("ties break by canonical slug order, not insertion order — deterministic for tests", () => {
    // A weak match identity that only triggers the "transport cargo" rule
    // (a single hit, single module). Add a second weak rule with a
    // different module to assert tie-breaking via canonical-index order.
    const picks = pickModulesForRolledIdentity({
      // "command others" → overseer (idx 7); "transport cargo" → expanded_hold (idx 1).
      // Both score 1; expanded_hold should land first by canonical order.
      mission: "Command others Transport cargo",
    });
    expect(picks[0]).toBe("expanded_hold");
    expect(picks[1]).toBe("overseer");
  });

  it("only returns slugs from the canonical set", () => {
    const allSlugs = new Set();
    const samples = [
      { type: "Dreadnought — Heavy attack ship", firstLook: "Bristling with weapons", mission: "Hunt down another ship" },
      { type: "Foundry — Mobile construction platform", firstLook: "Refitted or repurposed hull", mission: "Provide repairs" },
      { type: "Carrier — Launches fighters", firstLook: "Large sensor arrays", mission: "Patrol an area" },
      { type: "Ironhome — Habitat", firstLook: "Heavy armor", mission: "Provide shelter" },
    ];
    for (const r of samples) {
      for (const slug of pickModulesForRolledIdentity(r)) allSlugs.add(slug);
    }
    for (const slug of allSlugs) {
      expect(CANONICAL_MODULE_SLUGS).toContain(slug);
    }
  });
});
