/**
 * PROBE — RULES-04 PLANET-NAME-NOT-THE-BOOKS
 * (src/sectors/sectorGenerator.js generatePlanet:268-272 → generatePlanetName:947-954)
 *
 * What the user does: creates a sector in the Sector Creator (or `!sector
 * new`); each planetside / orbital settlement gets a planet (step 5 of the
 * book's starting-sector steps: planetary class, then name).
 *
 * What happens: the planet's class is rolled on the book's table
 * (planet_type, pinned by oracleTableFidelity), but its NAME comes from an
 * invented 8 × 8 prefix/suffix list — "Vorn IV", "Mireth Secundus", "Caul
 * Drift" — whatever the class. The rulebook names a planet from its class's
 * Sample Names table (vendored starforged-oracles `Planets/<Class>/Sample
 * Names`, 20 rows each: Desert "Abalos, Audun, Bishop…", Jovian "Aether,
 * Arrokoth, Esen…", Ice "Beira, Boreas, Caradhras…"), so a Jovian world is
 * never called "Mireth Secundus" and the name carries the class's flavour.
 *
 * What should happen: `generatePlanet` names the planet from its class's
 * Sample Names (a name of the player's own is the Creator's rename, as for
 * settlements). The other planet oracles (atmosphere, settlements, observed
 * from space, feature, life) are a coverage gap, not this probe's.
 *
 * Control: the class itself is a row of the book's Planetary Class table.
 *
 * The probe reads the vendored Sample Names, so it IS the diff.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatePlanet } from "../../../src/sectors/sectorGenerator.js";
import { PLANET_TYPE } from "../../../src/oracles/tables/planets.js";

const DIR = fileURLToPath(new URL("../../../vendor/foundry-ironsworn/json-packs/starforged-oracles", import.meta.url));
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

describe.skipIf(!HAVE_VENDOR)("RULES-04 a generated planet is named from its class's Sample Names", () => {
  const names = sampleNamesByClass();
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
    // Today: every name is "<Aethon|Vorn|Drekkis|Caul|Mireth|Solian|Thraxis|Ulven> <Prime|Major|Secundus|IV|Alpha|Drift|Deep|End>".
    expect(wrong).toEqual([]);
  });
});
