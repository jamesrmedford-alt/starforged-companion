/**
 * STARFORGED COMPANION
 * tests/unit/entityArtPathExports.test.js
 *
 * 2026-10 dead-export audit: the per-entity art-path setters
 * (setPortraitId / setPortraitSourceDescription) and the
 * isReadyForArtGeneration predicate had no production consumer — portraits
 * are linked via src/art/generator.js (linkPortraitToEntity →
 * writeEntityFlag) and the "can generate" gate lives in the entity panel.
 * creature.js's updateCreature lost its only caller with them. This pins the
 * deletion so the dead surface is not re-added unwired
 * (rules/reachability.md).
 */

import { describe, it, expect } from "vitest";

const DEAD = ["isReadyForArtGeneration", "setPortraitId", "setPortraitSourceDescription"];

describe("entity modules no longer export the dead art-path helpers", () => {
  for (const name of ["connection", "creature", "faction", "location", "planet", "settlement"]) {
    it(`${name}.js`, async () => {
      const mod = await import(`../../src/entities/${name}.js`);
      for (const fn of DEAD) expect(mod, `${name}.${fn}`).not.toHaveProperty(fn);
    });
  }

  it("creature.js no longer exports the caller-less updateCreature", async () => {
    const mod = await import("../../src/entities/creature.js");
    expect(mod).not.toHaveProperty("updateCreature");
    expect(typeof mod.getCreature).toBe("function");
  });
});
