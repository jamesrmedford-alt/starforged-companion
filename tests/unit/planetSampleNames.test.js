/**
 * STARFORGED COMPANION
 * tests/unit/planetSampleNames.test.js
 *
 * Issue #331 X48 (PLANET-NAME-NOT-THE-BOOKS). The Sector Creator rolled each
 * planet's class on the book's Planetary Class table but named it from an
 * invented 8 × 8 prefix / suffix list ("Vorn IV", "Mireth Secundus"),
 * whatever the class. The rulebook's step 5 names a planet from its class's
 * Sample Names table (vendored `Planets/<Class>/Sample Names`, 20 rows each),
 * so a Jovian world is never "Mireth Secundus". Read against the vendored
 * pack (skipped without the submodule); the tables themselves are pinned roll
 * for roll in oracleTableFidelity.test.js.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatePlanet } from "../../src/sectors/sectorGenerator.js";
import { PLANET_TYPE } from "../../src/oracles/tables/planets.js";

const DIR = fileURLToPath(new URL("../../vendor/foundry-ironsworn/json-packs/starforged-oracles", import.meta.url));
const HAVE_VENDOR = fs.existsSync(DIR) && fs.readdirSync(DIR).length > 0;

/** class ("Desert World") → the book's 20 sample names */
function sampleNamesByClass() {
  const folders = {}; const docs = [];
  for (const f of fs.readdirSync(DIR)) {
    const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    if (String(d._key ?? "").startsWith("!folders!")) folders[d._id] = d.name; else docs.push(d);
  }
  const out = {};
  for (const d of docs) {
    if (!/\/planet\/[a-z]+\/name$/.test(d.flags?.["foundry-ironsworn"]?.dsid ?? "")) continue;
    out[folders[d.folder]] = new Set(d.results.map(r => r.text.trim()));
  }
  return out;
}

describe.skipIf(!HAVE_VENDOR)("X48 — a generated planet is named from its class's Sample Names", () => {
  // A skipped describe's body still runs to collect its tests: read the pack
  // only when it is there.
  const names = HAVE_VENDOR ? sampleNamesByClass() : {};
  const classes = new Set(PLANET_TYPE.map(r => r.result));

  it("control: the vendored Sample Names cover every class the module rolls, and the class rolled is one of them", () => {
    expect(Object.keys(names).sort()).toEqual([...classes].sort());
    for (let i = 0; i < 20; i++) expect(classes.has(generatePlanet("planetside").type)).toBe(true);
  });

  it("twenty generated planets each carry a name from their class's Sample Names table", () => {
    const wrong = [];
    for (let i = 0; i < 20; i++) {
      const p = generatePlanet(i % 2 ? "orbital" : "planetside");
      if (!names[p.type]?.has(p.name)) wrong.push(`${p.type}: "${p.name}"`);
    }
    // Every name was "<Aethon|Vorn|Drekkis|…> <Prime|Major|Secundus|…>".
    expect(wrong).toEqual([]);
  });
});

// Without the vendored pack (the fix-sensitivity worktrees): the name is a
// row of the class's own table.
describe("X48 — a planet's name is a row of its class's table", () => {
  it("each rolled planet is named from SAMPLE_NAMES_<CLASS>", async () => {
    const PLANETS = await import("../../src/oracles/tables/planets.js");
    for (let i = 0; i < 40; i++) {
      const p = generatePlanet("planetside");
      const key = `SAMPLE_NAMES_${p.type.replace(/ World$/, "").toUpperCase()}`;
      expect(PLANETS[key]?.map(r => r.result), `${p.type}`).toContain(p.name);
    }
  });
});
