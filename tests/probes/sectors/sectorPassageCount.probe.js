/**
 * PROBE (sectors audit, SO-08) — the Sector Creator draws one passage more
 * than the rulebook's region table gives.
 *
 * What the user does: creates a sector (Sector Creator / `!sector new`, or the
 * Playtest Quickstart).
 * What happens: REGION_CONFIG (src/sectors/sectorGenerator.js) gives Terminus
 * 4 passages, Outlands 3, Expanse 2 — one per settlement — so a sector gets a
 * chain linking every settlement plus a route off the map edge, and the
 * wizard's region buttons (sectorPanel.js) promise "4 settlements · 4
 * passages". The rulebook's starting-sector region table (Starforged
 * rulebook, sector creation steps 2 and 7, pp. 114–127 — transcribed in the
 * Sector Creator scope, issue #218 §2: "Terminus 4 / 3, Outlands 3 / 2,
 * Expanse 2 / 1") gives one passage fewer per region. Commit 160bc9b raised
 * the counts so the generator's toEdge branch would fire; no decision records
 * the departure, and tests/unit/sectorGenerator.test.js pins the raised
 * counts.
 * What should happen: the rulebook's counts (a passage may still run to the
 * map edge — it is one of the region's passages, not an extra).
 */

import { describe, it, expect } from "vitest";
import { generateSector } from "../../../src/sectors/sectorGenerator.js";

const RULEBOOK = { terminus: { settlements: 4, passages: 3 }, outlands: { settlements: 3, passages: 2 }, expanse: { settlements: 2, passages: 1 } };

describe("PROBE SO-08: passages per region follow the rulebook's region table", () => {
  for (const [region, want] of Object.entries(RULEBOOK)) {
    it(`${region}: ${want.settlements} settlements, ${want.passages} passages`, () => {
      const sector = generateSector(region);
      expect(sector.settlements).toHaveLength(want.settlements);   // control — settlements match
      // FAILS today: one more passage than the rulebook (4 / 3 / 2).
      expect(sector.passages).toHaveLength(want.passages);
    });
  }
});
