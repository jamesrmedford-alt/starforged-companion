/**
 * PROBE — SECTOR-ZOOM-IN-STEP-MISSING
 *
 * The rulebook's starting-sector procedure (docs/rules-reference/
 * rulebook-summary.md, "Starting sector (11 steps)") includes "zoom in on the
 * starting settlement" — the settlement's First Look, Initial Contact and
 * Trouble (Settlement oracles; registered in roller.js as
 * settlement_first_look / settlement_contact / settlement_trouble). The
 * generator hard-codes `trouble: null, firstLook: []` on every settlement and
 * never rolls Initial Contact, yet every consumer reads them as if rolled:
 * createEntityJournals forwards `s.trouble`, buildSettlementStubPrompt adds
 * "Current trouble", composeSettlementDescription renders Trouble / First look
 * / Initial contact ("the Population/Authority/Projects/Trouble that the wizard
 * rolled", F17), and formatActiveSector tells the narrator to "respect each
 * one's Authority and Trouble".
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { vi, describe, it, expect } from "vitest";

vi.mock("../../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));

import { generateSector } from "../../../src/sectors/sectorGenerator.js";

describe("PROBE SECTOR-ZOOM-IN-STEP-MISSING", () => {
  it.each(["terminus", "outlands", "expanse"])("%s: the starting settlement is zoomed in (first look, initial contact, trouble)", (region) => {
    const sector = generateSector(region);
    // settlements[0] is the generator's starting settlement — the local
    // connection's home (generateConnection(settlements[0].name)).
    const home = sector.settlements[0];
    expect(sector.connection.homeSettlement).toBe(home.name);
    expect.soft(home.trouble).toBeTruthy();                     // today: null
    expect.soft(home.firstLook?.length ?? 0).toBeGreaterThan(0); // today: []
    expect.soft(home.initialContact).toBeTruthy();              // today: undefined
  });
});
