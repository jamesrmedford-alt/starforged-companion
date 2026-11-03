/**
 * PROBE (sectors audit, SO-10) — `!oracle settlement_population` always
 * rolls the Terminus table, and the Outlands / Expanse population tables
 * cannot be rolled at all.
 *
 * What the user does: in an Outlands or Expanse sector, a player asks
 * `!oracle settlement_population` for a settlement the story just found.
 * What happens: roller.js registers one population table, the Terminus one,
 * under the generic id and name "Settlement Population"
 * (`settlement_population: … SETTLEMENTS.POPULATION_TERMINUS`). The rulebook's
 * population odds are per region (vendored Dataforged
 * Settlements/Population/Terminus | Outlands | Expanse — tables.js carries all
 * three, and the Sector Creator rolls the right one), so the card answers
 * with the settled core's odds — "Tens of thousands" 15% instead of the
 * Expanse's 5%, "Few" 10% instead of 20%. POPULATION_OUTLANDS and
 * POPULATION_EXPANSE are the only tables in src/oracles/tables/ that no
 * `!oracle` id reaches; the other region-split tables (space sightings,
 * starship missions) register one id per region.
 * What should happen: one id per region (`settlement_population_outlands`, …),
 * as the sightings and missions have.
 */

import { describe, it, expect } from "vitest";
import { ORACLE_TABLES } from "../../../src/oracles/roller.js";
import * as SETTLEMENTS from "../../../src/oracles/tables/settlements.js";
import * as STARSHIPS from "../../../src/oracles/tables/starships.js";

const registered = (table) => Object.entries(ORACLE_TABLES).filter(([, e]) => e.table === table).map(([id]) => id);

describe("PROBE SO-10: every region's settlement population table has an !oracle id", () => {
  it("control: the starship missions register one id per region", () => {
    expect(registered(STARSHIPS.MISSION_OUTLANDS)).toHaveLength(1);
    expect(registered(STARSHIPS.MISSION_EXPANSE)).toHaveLength(1);
  });

  it("the Outlands and Expanse population tables can be rolled with !oracle", () => {
    // FAILS today: [] for both — only the Terminus table is registered.
    expect(registered(SETTLEMENTS.POPULATION_OUTLANDS)).toHaveLength(1);
    expect(registered(SETTLEMENTS.POPULATION_EXPANSE)).toHaveLength(1);
  });
});
