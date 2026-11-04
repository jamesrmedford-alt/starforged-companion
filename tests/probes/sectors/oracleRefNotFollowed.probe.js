/**
 * PROBE — SEC-D1 ORACLE-REF-NOT-FOLLOWED  (needs a decision)
 * (src/oracles/roller.js resolveDirective lines 409–439 and
 *  REFS_ROLLED_IN_PLACE line 354; rollOracle's `isRef` / `refTableId` return
 *  fields lines 343–344 — read by no production code)
 *
 * What the user does: `!oracle space_sighting_terminus` (or outlands /
 * expanse), `!oracle starship_type`, `!oracle fleet`, `!oracle settlement_contact`.
 *
 * What happens: 60 of the 100 Space Sighting rows, Starship Type 85–94
 * ("Fleet") and 68–82, Fleet 91–100 and Initial Contact 96–100 are
 * cross-references: the row's text is a heading ("Stellar Object", "Planet",
 * "Settlement", "Starship", "Derelict", "Precursor Vault", "Creature") that
 * the rulebook — and the vendored Dataforged row, which is a compendium link
 * to that table — expects the player to resolve on the named table. The card
 * prints the heading and stops; the ref is reported on `isRef` / `refTableId`,
 * which nothing reads. Issue #321 U68 made the Creature Scale "Ultra-scale"
 * row roll its table in place ("Ultra-scale: Titanic (hill-sized)") and left
 * every other ref "a label its caller may follow" — no caller does.
 *
 * The decision: (A) follow every cross-reference in place as Ultra-scale is
 * followed — "Stellar Object: Red giant", "Planet: Desert World", "Fleet:
 * Raider fleet" (the probe asserts this shape); or (B) keep the heading, have
 * the card say which table to roll next (`!oracle stellar_object`), and
 * retire the unread `isRef` / `refTableId` fields.
 *
 * Controls (pass today): Ultra-scale is followed in place (U68); the
 * Descriptor + Focus and Action + Theme chains resolve; every table exported
 * by src/oracles/tables/*.js is registered and tiles 1–100 (oracleTableIntegrity
 * and oracleTableFidelity pin the registered set roll for roll).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sectors/oracleRefNotFollowed.probe.js
 */

import { describe, it, expect } from "vitest";
import { rollOracle, ORACLE_TABLES } from "../../../src/oracles/roller.js";
import * as CORE from "../../../src/oracles/tables/core.js";
import * as SPACE from "../../../src/oracles/tables/space.js";
import * as PLANETS from "../../../src/oracles/tables/planets.js";
import * as SETTLEMENTS from "../../../src/oracles/tables/settlements.js";
import * as STARSHIPS from "../../../src/oracles/tables/starships.js";
import * as CHARACTERS from "../../../src/oracles/tables/characters.js";
import * as CREATURES from "../../../src/oracles/tables/creatures.js";
import * as FACTIONS from "../../../src/oracles/tables/factions.js";
import * as DERELICTS from "../../../src/oracles/tables/derelicts.js";
import * as VAULTS from "../../../src/oracles/tables/vaults.js";
import * as THEMES from "../../../src/oracles/tables/themes.js";
import * as MISC from "../../../src/oracles/tables/misc.js";
import * as PTP from "../../../src/oracles/tables/payThePrice.js";
import * as SV from "../../../src/oracles/tables/sessionVignette.js";
import * as DC from "../../../src/oracles/tables/discoveryAndChaos.js";
import * as SC from "../../../src/oracles/tables/sufferAndCombat.js";

describe("PROBE SEC-D1 — a cross-reference row resolves to an answer, not a heading", () => {
  it("Space Sighting 'Stellar Object' (1–15) resolves on the Stellar Object table", () => {
    const r = rollOracle("space_sighting_terminus", { roll: 5 });
    // Expected (option A): "Stellar Object: <a stellar object>". Today: "Stellar Object".
    expect(r.result).not.toBe("Stellar Object");
    expect(r.result).toMatch(/^Stellar Object: \S/);
  });

  it("Starship Type 'Fleet' (85–94) resolves on the Fleet table", () => {
    const r = rollOracle("starship_type", { roll: 90 });
    expect(r.result).not.toBe("Fleet");
    expect(r.result).toMatch(/^Fleet: \S/);
  });

  it("control: Creature Scale 'Ultra-scale' is followed in place (issue #321 U68)", () => {
    const r = rollOracle("creature_scale", { roll: 100 });
    expect(r.result).toMatch(/^Ultra-scale: \S/);
  });

  it("control: the Descriptor + Focus and Action + Theme chains resolve", () => {
    expect(rollOracle("space_sighting_terminus", { roll: 58 }).result).not.toMatch(/Descriptor \+ Focus/i);
    expect(rollOracle("spaceborne_peril", { roll: 98 }).result).not.toMatch(/Action \+ Theme/i);
  });

  it("control: every exported oracle table is registered and tiles 1–100", () => {
    const registered = new Set(Object.values(ORACLE_TABLES).map(e => e.table));
    const mods = { CORE, SPACE, PLANETS, SETTLEMENTS, STARSHIPS, CHARACTERS, CREATURES, FACTIONS, DERELICTS, VAULTS, THEMES, MISC, PTP, SV, DC, SC };
    const unregistered = [];
    for (const [m, ns] of Object.entries(mods)) {
      for (const [k, table] of Object.entries(ns)) {
        if (!Array.isArray(table)) continue;
        if (!registered.has(table)) unregistered.push(`${m}.${k}`);
        let next = 1;
        for (const row of table) {
          expect(row.min, `${m}.${k} row ${row.min}-${row.max}`).toBe(next);
          expect(row.max, `${m}.${k} row ${row.min}-${row.max}`).toBeGreaterThanOrEqual(row.min);
          next = row.max + 1;
        }
        expect(next - 1, `${m}.${k} ends at`).toBe(100);
      }
    }
    expect(unregistered).toEqual([]);
  });
});
