/**
 * Issue #330 D13 — `!oracle` follows a cross-reference row in place.
 *
 * Sixty of the hundred Space Sighting rows, Starship Type 68–82 and 85–94,
 * Fleet 91–100 and Initial Contact 96–100 are headings ("Stellar Object",
 * "Fleet", "Derelict") the rulebook and the vendored row link onward to
 * another oracle. The card printed the heading and stopped; the ref was
 * reported on `isRef` / `refTableId`, which nothing read. Issue #321 U68
 * followed Creature Scale's Ultra-scale in place and left the rest. Decided
 * (option A): every ref naming a registered table is rolled in place, under
 * its heading — and the unread fields are retired.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { rollOracle, ORACLE_TABLES } from "../../src/oracles/roller.js";
import * as SPACE from "../../src/oracles/tables/space.js";
import * as STARSHIPS from "../../src/oracles/tables/starships.js";

/** The entry `roll` lands on in `table`. */
const at = (table, roll) => table.find(e => roll >= e.min && roll <= e.max);

/** Roll `roll` on `tableId`, the d100s after it scripted (each 1–100). */
function rollScripted(tableId, roll, ...next) {
  const rng = vi.spyOn(Math, "random");
  for (const v of next) rng.mockReturnValueOnce((v - 0.5) / 100);
  return rollOracle(tableId, { roll });
}

afterEach(() => vi.restoreAllMocks());

describe("issue #330 D13 — a cross-reference row resolves to an answer, not a heading", () => {
  it("Space Sighting 'Stellar Object' (1–15) rolls the Stellar Object table under its heading", () => {
    const r = rollScripted("space_sighting_terminus", 5, 30);
    expect(r.result).toBe(`Stellar Object: ${at(SPACE.STELLAR_OBJECT, 30).result}`);
  });

  it("Starship Type 'Fleet' (85–94) rolls the Fleet table under its heading", () => {
    const r = rollScripted("starship_type", 90, 20);
    expect(r.result).toBe(`Fleet: ${at(STARSHIPS.FLEET, 20).result}`);
  });

  it("a chain of references is followed to its answer — Fleet 91–100 names a starship mission", () => {
    const r = rollScripted("starship_type", 90, 95, 40);
    expect(r.result).toBe(`Fleet: Starship Mission: ${at(STARSHIPS.MISSION_TERMINUS, 40).result}`);
  });

  it("every reference row of every registered table resolves under its heading", () => {
    const headingsLeft = [];
    for (const [id, def] of Object.entries(ORACLE_TABLES)) {
      for (const row of def.table) {
        if (!row.ref || !ORACLE_TABLES[row.ref]) continue;
        const { result } = rollOracle(id, { roll: row.min });
        if (!result.startsWith(`${row.result}: `) || result.length <= row.result.length + 2) {
          headingsLeft.push(`${id} ${row.min}: ${result}`);
        }
      }
    }
    expect(headingsLeft).toEqual([]);
  });

  it("Initial Contact 96–100 'Derelict' rolls the derelict's location", () => {
    const r = rollOracle("settlement_contact", { roll: 98 });
    expect(r.result).toMatch(/^Derelict: \S/);
  });

  it("the result no longer carries the unread isRef / refTableId", () => {
    const r = rollOracle("space_sighting_terminus", { roll: 5 });
    expect(r).not.toHaveProperty("isRef");
    expect(r).not.toHaveProperty("refTableId");
  });

  it("control: Creature Scale 'Ultra-scale' is still followed in place (issue #321 U68)", () => {
    expect(rollOracle("creature_scale", { roll: 100 }).result).toMatch(/^Ultra-scale: \S/);
  });

  it("control: the Descriptor + Focus and Action + Theme chains still resolve without a heading", () => {
    expect(rollOracle("space_sighting_terminus", { roll: 58 }).result).not.toMatch(/Descriptor \+ Focus/i);
    expect(rollOracle("spaceborne_peril", { roll: 98 }).result).not.toMatch(/Action \+ Theme|:/);
  });

  it("control: a plain row is its own answer", () => {
    expect(rollOracle("starship_type", { roll: 1 }).result).toBe(at(STARSHIPS.TYPE, 1).result);
  });
});
