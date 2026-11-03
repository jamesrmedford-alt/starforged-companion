// tests/unit/waypointDiscoveryOnce.test.js
// One roll per discovery (issue #326 W47). An Explore a Waypoint strong hit
// with a match (or a miss with one) seeded its narration with a Make a
// Discovery (or Confront Chaos) table roll, and the card's 🔭 / 🌀 button's
// forced move rolled the table again: the waypoint narration depicted
// discovery X, the Make a Discovery narration discovery Y, and a player who
// took the ordinary reward was narrated a discovery that never happened (the
// issue #321 U03 shape). The match lets the player Make a Discovery INSTEAD,
// so the waypoint seeds the notable-aspect prompt only.

import { describe, it, expect, vi } from 'vitest';

const counter = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../src/oracles/roller.js', async (importOriginal) => {
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

import { buildOracleSeeds } from '../../src/moves/resolver.js';

const line = (seeds, prefix) => (seeds?.results ?? []).find(r => r.startsWith(prefix)) ?? null;

describe('the discovery a matched waypoint offers is rolled once — by Make a Discovery (issue #326 W47)', () => {
  it('control: the forced Make a Discovery move seeds its narration with a table result', () => {
    expect(line(buildOracleSeeds('make_a_discovery', null, false), 'Make a Discovery:')).toBeTruthy();
  });

  it('strong hit with a match → Make a Discovery: one discovery, not two', () => {
    counter.n = 0;
    const seeds     = buildOracleSeeds('explore_a_waypoint', 'strong_hit', true);
    const waypoint  = line(seeds, 'Make a Discovery:');
    const discovery = line(buildOracleSeeds('make_a_discovery', null, false), 'Make a Discovery:');
    expect(waypoint).toBeNull();                         // the waypoint narrates no discovery …
    expect(discovery).toBe('Make a Discovery: make_a_discovery entry #1');   // … the button's move rolls the one
    expect(line(seeds, 'Notable aspect of this waypoint:')).toBeTruthy();    // control: the match's prompt stays
  });

  it('miss with a match → Confront Chaos: one chaos result, not two', () => {
    counter.n = 0;
    const waypoint = line(buildOracleSeeds('explore_a_waypoint', 'miss', true), 'Confront Chaos:');
    const chaos    = line(buildOracleSeeds('confront_chaos', null, false), 'Confront Chaos:');
    expect(waypoint).toBeNull();
    expect(chaos).toBe('Confront Chaos: confront_chaos entry #1');
  });
});
