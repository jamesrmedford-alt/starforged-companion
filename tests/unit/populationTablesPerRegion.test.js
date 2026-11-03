// tests/unit/populationTablesPerRegion.test.js
// Each region's settlement population table has an !oracle id (issue #326
// W72). One id was registered for the three region tables, so
// `!oracle settlement_population` always rolled the Terminus table, and
// POPULATION_OUTLANDS / POPULATION_EXPANSE were the only tables in
// src/oracles/tables/ no !oracle id reached (the starship missions register
// one id per region). (Each table's rolls are checked against the
// rulebook's in oracleTableFidelity.test.js.)

import { describe, it, expect } from "vitest";
import { ORACLE_TABLES, rollOracle } from "../../src/oracles/roller.js";
import * as SETTLEMENTS from "../../src/oracles/tables/settlements.js";
import * as STARSHIPS from "../../src/oracles/tables/starships.js";

const registered = (table) => Object.entries(ORACLE_TABLES).filter(([, e]) => e.table === table).map(([id]) => id);

describe("every region's settlement population table has an !oracle id (issue #326 W72)", () => {
  it("control: the starship missions register one id per region", () => {
    expect(registered(STARSHIPS.MISSION_OUTLANDS)).toHaveLength(1);
    expect(registered(STARSHIPS.MISSION_EXPANSE)).toHaveLength(1);
  });

  it("the Outlands and Expanse population tables can be rolled with !oracle", () => {
    expect(registered(SETTLEMENTS.POPULATION_OUTLANDS)).toEqual(["settlement_population_outlands"]);
    expect(registered(SETTLEMENTS.POPULATION_EXPANSE)).toEqual(["settlement_population_expanse"]);
    expect(rollOracle("settlement_population_expanse")?.result).toBeTruthy();
  });

  it("control: settlement_population is still the Terminus table", () => {
    expect(registered(SETTLEMENTS.POPULATION_TERMINUS)).toEqual(["settlement_population"]);
  });
});
