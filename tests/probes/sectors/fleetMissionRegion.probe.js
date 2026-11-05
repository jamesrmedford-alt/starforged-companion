/**
 * PROBE — SECTORS-D1 MISSION-REF-REGION-BLIND (tenth audit, area sectors — needs a decision)
 *
 * What the user does: in an Expanse (or Outlands) sector a player types
 * `!oracle fleet` and rolls 91–100 "Starship Mission", or `!oracle
 * starship_type` and rolls 68–82 "Multipurpose".
 *
 * What happens: issue #330 D13 follows a cross-reference row in place, "on
 * the table its ref names". Fleet 91–100 and Starship Type 68–82 both carry
 * `ref: "starship_mission_terminus"` (src/oracles/tables/starships.js), so
 * the mission is rolled on the Terminus table whatever the sector: the
 * vendored Fleet row links the Starship Mission CATEGORY (one table per
 * region — Terminus, Outlands and Expanse weight the missions differently:
 * roll 3 is "Blockade a location" in the Terminus and "Break a blockade" in
 * the Expanse; "Explore a region" is 36–37 vs 40–45). The Sector Creator
 * already picks its population table by region (generateSettlement). The
 * vendored Starship Type "Multipurpose" row carries no onward roll at all —
 * the ref is the module's own.
 *
 * Options: (A) the roller takes the region of the active sector (`!oracle`
 * knows campaignState) and a mission ref resolves to that region's table,
 * Terminus when none — the Sector Creator's own rule; (B) keep the Terminus
 * table and say so in the help. Recommended: A — the book's mission oracle is
 * per region, as the Space Sighting tables the command already offers per
 * region are. Either way the Multipurpose ref is the maintainer's to keep or
 * drop (the vendored row has none).
 *
 * Control: the Expanse mission table itself rolls its own rows.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sectors/fleetMissionRegion.probe.js
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { rollOracle } from '../../../src/oracles/roller.js';

afterEach(() => vi.restoreAllMocks());

describe('SECTORS-D1 a Fleet "Starship Mission" row in an Expanse sector', () => {
  it('rolls the Expanse mission table', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.02);   // every sub-roll lands on 3

    const r = rollOracle('fleet', { roll: 95, region: 'expanse' });

    expect(r.roll).toBe(95);
    // Expected (option A): Expanse 3–4 "Break a blockade". Actual: Terminus 1–3 "Blockade a location".
    expect(r.result).toBe('Starship Mission: Break a blockade');
  });

  it('control: the Expanse mission table rolls its own rows', () => {
    expect(rollOracle('starship_mission_expanse', { roll: 3 }).result).toBe('Break a blockade');
    expect(rollOracle('starship_mission_terminus', { roll: 3 }).result).toBe('Blockade a location');
  });
});
