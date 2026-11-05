/**
 * Issue #331 X66 — a sector record carries its name, not its unread parts.
 *
 * `generateSector` wrote `namePrefix` and `nameSuffix` on every sector record
 * beside `name`; nothing in the module read them (since issue #330 D14 a
 * numbered name even stored its numeral in `nameSuffix`, "Reach II").
 * A field no consumer reads is a bug, not a feature (rules/reachability.md):
 * the record keeps the name alone. Stored sectors keep their old fields,
 * which do no harm.
 */

import { describe, it, expect } from "vitest";
import { generateSector, generateSectorName } from "../../src/sectors/sectorGenerator.js";
import { productionSources } from "../helpers/sourceScan.js";

describe("issue #331 X66 — the sector record's name", () => {
  it("a generated sector carries its full name and no name parts", () => {
    const sector = generateSector("terminus");
    expect(typeof sector.name).toBe("string");
    expect(sector.name.split(" ").length).toBeGreaterThanOrEqual(2);
    expect(sector).not.toHaveProperty("namePrefix");
    expect(sector).not.toHaveProperty("nameSuffix");
  });

  it("no production code reads or writes the retired fields", () => {
    const users = productionSources().filter(({ code }) => /\bname(?:Prefix|Suffix)\b/.test(code)).map(({ file }) => file);
    expect(users).toEqual([]);
  });

  it("control: the name is still rolled from a prefix and a suffix", () => {
    const rolled = generateSectorName([]);
    expect(rolled.full).toBe(`${rolled.prefix} ${rolled.suffix}`);
  });
});
