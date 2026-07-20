/**
 * STARFORGED COMPANION
 * tests/unit/oracleTableIntegrity.test.js
 *
 * Property tests over EVERY registered oracle table (2026-07 test-suite
 * review). ~2,500 lines of {min,max,result} data previously had no
 * protection: a hand-edit introducing a range gap, overlap, or a table that
 * stops short of 100 would ship silently — rollOracle would return
 * undefined-result rolls for the hole. These invariants were verified true
 * for all 129 registered tables before being locked here.
 */

import { describe, it, expect } from "vitest";
import { ORACLE_TABLES, rollOracle } from "../../src/oracles/roller.js";

const arrayTables = Object.entries(ORACLE_TABLES)
  .filter(([, def]) => Array.isArray(def.table));

describe("oracle table registry integrity", () => {
  it("has a sane registry (mass-deregistration tripwire)", () => {
    expect(arrayTables.length).toBeGreaterThanOrEqual(100);
    for (const [id, def] of arrayTables) {
      expect(typeof def.name, id).toBe("string");
      expect(def.name.length, id).toBeGreaterThan(0);
      expect(typeof def.category, id).toBe("string");
    }
  });

  it("every table is contiguous from 1 with min <= max on every row", () => {
    for (const [id, def] of arrayTables) {
      let next = 1;
      for (const row of def.table) {
        expect(row.min, `${id}: row starting ${row.min} (expected ${next})`).toBe(next);
        expect(row.max, `${id}: row ${row.min}-${row.max} inverted`).toBeGreaterThanOrEqual(row.min);
        next = row.max + 1;
      }
    }
  });

  it("every table ends exactly at 100 (d100 domain, no short tables)", () => {
    for (const [id, def] of arrayTables) {
      const last = def.table[def.table.length - 1];
      expect(last?.max, `${id} ends at ${last?.max}`).toBe(100);
    }
  });

  it("every row carries a non-empty result or a cross-reference", () => {
    for (const [id, def] of arrayTables) {
      for (const row of def.table) {
        const hasResult = typeof row.result === "string" && row.result.trim().length > 0;
        const hasRef    = typeof row.ref === "string" && row.ref.trim().length > 0;
        expect(hasResult || hasRef, `${id}: row ${row.min}-${row.max} has neither result nor ref`).toBe(true);
      }
    }
  });

  // action_theme / descriptor_focus are VIRTUAL chain refs resolved inline by
  // resolveDirective (roller.js) and rollTableResult (sectorGenerator.js),
  // deliberately not registry entries. Writing this test found that only the
  // action_theme chain was implemented (DESCRIPTOR-FOCUS-UNCHAINED, fixed
  // 2026-07) — the behavior tests below keep both chains real.
  const VIRTUAL_CHAIN_REFS = new Set(["action_theme", "descriptor_focus"]);

  it("every cross-reference points at a registered table or a virtual chain", () => {
    for (const [id, def] of arrayTables) {
      for (const row of def.table) {
        if (row.ref) {
          const ok = VIRTUAL_CHAIN_REFS.has(row.ref) || ORACLE_TABLES[row.ref] !== undefined;
          expect(ok, `${id}: ref "${row.ref}" is neither registered nor a virtual chain`).toBe(true);
        }
      }
    }
  });

  it("virtual chain rows RESOLVE instead of leaking their placeholder text", () => {
    // space_sighting_terminus 56-60 is a descriptor_focus row; spaceborne_peril
    // 97-99 is an action_theme row. Both must come back as rolled words, never
    // the literal "Descriptor + Focus" / "Action + Theme" placeholders.
    const df = rollOracle("space_sighting_terminus", { roll: 58 });
    expect(df.result).not.toMatch(/Descriptor \+ Focus/i);
    expect(df.result.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2);

    const at = rollOracle("spaceborne_peril", { roll: 98 });
    expect(at.result).not.toMatch(/Action \+ Theme/i);
    expect(at.result.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2);
  });
});
