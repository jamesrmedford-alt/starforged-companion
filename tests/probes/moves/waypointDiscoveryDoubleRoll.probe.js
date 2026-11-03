/**
 * PROBE — MC-13 WAYPOINT-ALT-DOUBLE-ROLL (eighth bug audit, moves-core)
 *
 * What the user does: Explores a Waypoint and rolls a strong hit with a match
 * (or a miss with a match); the narration plays; then they click the card's
 * 🔭 Make a Discovery (or 🌀 Confront Chaos).
 *
 * What happens: two different discoveries. resolver.js buildOracleSeeds rolls
 * the Make a Discovery table (Confront Chaos on a miss with a match) into the
 * WAYPOINT's oracle seeds, so its narration already depicts discovery X; the
 * button (cardActions.applyWaypointOraclePick) posts a forced
 * make_a_discovery move carrying nothing of that roll, and its own
 * buildOracleSeeds rolls the table again — the Make a Discovery narration
 * depicts discovery Y. If the player takes the ordinary reward instead, the
 * waypoint narration has described a discovery that never happened. This is
 * the issue #321 U03 shape (one roll seeding the narration, another applied),
 * which U03 fixed for Pay the Price and TDA-COST-DOUBLE-ROLL records for Take
 * Decisive Action's cost — not this one.
 *
 * What should happen: one roll per discovery: the waypoint seeds no
 * discovery / chaos result (only its "notable aspect" prompt), or the forced
 * move reuses the result the waypoint rolled.
 */

import { describe, it, expect, vi } from 'vitest';

const counter = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../../src/oracles/roller.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    // Each roll on the discovery / chaos tables comes up a different entry.
    rollOracle: vi.fn((tableId, ...rest) => {
      if (tableId === 'make_a_discovery' || tableId === 'confront_chaos') {
        counter.n += 1;
        return { result: `${tableId} entry #${counter.n}` };
      }
      return original.rollOracle(tableId, ...rest);
    }),
  };
});

import { buildOracleSeeds } from '../../../src/moves/resolver.js';

const line = (seeds, prefix) => (seeds?.results ?? []).find(r => r.startsWith(prefix)) ?? null;

describe('the discovery a matched waypoint narrates is the one Make a Discovery rolls', () => {
  it('control: the forced Make a Discovery move seeds its narration with a table result', () => {
    expect(line(buildOracleSeeds('make_a_discovery', null, false), 'Make a Discovery:')).toBeTruthy();
  });

  it('strong hit with a match → Make a Discovery: one discovery, not two', () => {
    counter.n = 0;
    const waypoint  = line(buildOracleSeeds('explore_a_waypoint', 'strong_hit', true), 'Make a Discovery:');
    const discovery = line(buildOracleSeeds('make_a_discovery', null, false), 'Make a Discovery:');
    // Either the waypoint seeds none, or the move it offers uses the same one.
    if (waypoint !== null) expect(waypoint).toBe(discovery);
  });

  it('miss with a match → Confront Chaos: one chaos result, not two', () => {
    counter.n = 0;
    const waypoint = line(buildOracleSeeds('explore_a_waypoint', 'miss', true), 'Confront Chaos:');
    const chaos    = line(buildOracleSeeds('confront_chaos', null, false), 'Confront Chaos:');
    if (waypoint !== null) expect(waypoint).toBe(chaos);
  });
});
