/**
 * PROBE (oracles audit) — rulebook directive rows that rollOracle leaves
 * unresolved.
 *
 * roller.js promises "callers never receive raw 'Roll twice', 'Roll again …',
 * or 'Action + Theme' strings" (rollOracle JSDoc), but resolveDirective only
 * recognises a result that STARTS with "Roll twice" / "Roll again":
 *
 *     if (/^Roll (twice|again)\b/i.test(entry.result)) { …roll twice… }
 *
 * The rulebook's other directive wordings fall through and are returned
 * verbatim as if they were an answer:
 *   - Space Sighting (all three regions) 99–100 "Roll three times"
 *   - Starship Type 95–100 "Ships in conflict (roll twice)" — also the value
 *     seedStarshipActor writes into a new starship's `type`
 *   - Creature Scale 100 "Ultra-scale (roll on ultra table)" — and no
 *     ultra-scale table is registered at all.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { rollOracle, ORACLE_TABLES } from "../../../src/oracles/roller.js";

afterEach(() => vi.restoreAllMocks());

// Every follow-up roll lands on 1 so the expected resolution is deterministic.
const followUpsRollOne = () => vi.spyOn(Math, "random").mockReturnValue(0);

describe("PROBE: directive rows resolve instead of leaking their instruction text", () => {
  for (const id of ["space_sighting_terminus", "space_sighting_outlands", "space_sighting_expanse"]) {
    it(`${id} 99 ("Roll three times") rolls three results`, () => {
      followUpsRollOne();
      const r = rollOracle(id, { roll: 99 });
      expect(r.result).not.toBe("Roll three times");
      expect(r.result.split(" / ")).toHaveLength(3);
    });
  }

  it('starship_type 97 ("Ships in conflict (roll twice)") rolls the two ships', () => {
    followUpsRollOne();
    const r = rollOracle("starship_type", { roll: 97 });
    expect(r.result).not.toMatch(/\(roll twice\)/i);
  });

  it('creature_scale 100 ("Ultra-scale") reaches an ultra-scale table', () => {
    followUpsRollOne();
    const r = rollOracle("creature_scale", { roll: 100 });
    expect(r.result).not.toMatch(/roll on ultra table/i);
    expect(Object.keys(ORACLE_TABLES).some(k => /ultra/i.test(k))).toBe(true);
  });
});
