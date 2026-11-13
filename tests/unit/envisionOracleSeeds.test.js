/**
 * STARFORGED COMPANION
 * tests/unit/envisionOracleSeeds.test.js
 *
 * Issue #353 Phase 0 — oracle seeds at the outcomes whose text says to
 * envision something ("Where to roll"). The narrator filled them from its own
 * defaults, so the alpha 23 playtest's corridor scene repeated the same images
 * for an hour, and "A new enemy is revealed" produced a voice with no nature,
 * goal or agenda. Each outcome now rolls its table once, and no other outcome
 * does:
 *   - Gather Information hit → Story Clue (what is learned); weak hit also
 *     Story Complication; miss → Story Complication (the unwelcome truth)
 *   - Compel weak hit → Action + Theme (the counteroffer)
 *   - Undertake an Expedition hit → the active sector's region's Space Sighting
 *   - a Pay the Price that reveals a new enemy (a "Roll twice" leaf too) →
 *     Character Role + Goal + Disposition
 *
 * The real oracle tables are rolled (no mock), so each seed's table id is one
 * the roller has registered — authoring a seed is not wiring it
 * (rules/reachability.md §1).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  buildOracleSeeds, withPayThePriceSeed, priceRevealsNewEnemy, resolveMove,
} from '../../src/moves/resolver.js';
import { STORY_CLUE, STORY_COMPLICATION } from '../../src/oracles/tables/misc.js';
import { SPACE_SIGHTING_OUTLANDS, SPACE_SIGHTING_TERMINUS } from '../../src/oracles/tables/space.js';
import { ROLE, GOAL, DISPOSITION } from '../../src/oracles/tables/characters.js';
import { ACTION, THEME } from '../../src/oracles/tables/core.js';

const lines   = (seeds) => seeds?.results ?? [];
const after   = (seeds, prefix) => lines(seeds).filter(l => l.startsWith(prefix)).map(l => l.slice(prefix.length));
/** The plain row a d100 lands on (a row that chains to another table is not used here). */
function rowFor(table, roll) {
  const row = table.find(r => roll >= r.min && roll <= r.max);
  if (!row || row.ref || /^Roll /.test(row.result)) throw new Error(`d100 = ${roll} is not a plain row`);
  return row.result;
}
/** Math.random values that roll these d100s, in order. */
const d100s = (...rolls) => {
  const spy = vi.spyOn(Math, 'random');
  for (const roll of rolls) spy.mockReturnValueOnce((roll - 1) / 100 + 0.001);
  return spy;
};

afterEach(() => { vi.restoreAllMocks(); });

describe('issue #353 Phase 0 — Gather Information', () => {
  it('a strong hit seeds what is learned from Story Clue, and nothing else', () => {
    d100s(5);
    const seeds = buildOracleSeeds('gather_information', 'strong_hit', false);
    expect(after(seeds, 'What you learn — Story Clue: ')).toEqual([rowFor(STORY_CLUE, 5)]);
    expect(lines(seeds)).toHaveLength(1);
  });

  it('a weak hit seeds the clue and how it complicates the quest (Story Complication)', () => {
    d100s(14, 9);
    const seeds = buildOracleSeeds('gather_information', 'weak_hit', false);
    expect(after(seeds, 'What you learn — Story Clue: ')).toEqual([rowFor(STORY_CLUE, 14)]);
    expect(after(seeds, 'How it complicates the quest — Story Complication: ')).toEqual([rowFor(STORY_COMPLICATION, 9)]);
  });

  it('a miss seeds the unwelcome truth (Story Complication) and no clue; its price is the pipeline\'s card', () => {
    d100s(16);
    const seeds = buildOracleSeeds('gather_information', 'miss', false, null, { routesPayThePrice: true });
    expect(after(seeds, 'The unwelcome truth — Story Complication: ')).toEqual([rowFor(STORY_COMPLICATION, 16)]);
    expect(lines(seeds).some(l => /Story Clue|Pay the Price/.test(l))).toBe(false);
  });
});

describe('issue #353 Phase 0 — Compel', () => {
  it('a weak hit seeds the counteroffer from Action + Theme', () => {
    d100s(12, 40);
    const seeds = buildOracleSeeds('compel', 'weak_hit', false);
    expect(after(seeds, 'Their counteroffer — Action + Theme: '))
      .toEqual([`${rowFor(ACTION, 12)} / ${rowFor(THEME, 40)}`]);
  });

  it('a strong hit and a (routed) miss seed nothing', () => {
    expect(buildOracleSeeds('compel', 'strong_hit', false)).toBeNull();
    expect(buildOracleSeeds('compel', 'miss', false, null, { routesPayThePrice: true })).toBeNull();
  });
});

describe('issue #353 Phase 0 — Undertake an Expedition', () => {
  it('a hit seeds the waypoint from the region\'s Space Sighting table', () => {
    // d100 = 60: the Outlands table's "Debris field: Mineral asteroids" (59–63); Terminus's 60 is "Descriptor + Focus".
    for (const outcome of ['strong_hit', 'weak_hit']) {
      d100s(60);
      const seeds = buildOracleSeeds('undertake_an_expedition', outcome, false, null, { region: 'outlands' });
      expect(after(seeds, 'The waypoint you reach — Space Sighting (Outlands): '), outcome)
        .toEqual([rowFor(SPACE_SIGHTING_OUTLANDS, 60)]);
    }
  });

  it('with no active sector the Terminus table is rolled', () => {
    d100s(62);   // Terminus 61–65: "Debris field: Mineral asteroids"
    const seeds = buildOracleSeeds('undertake_an_expedition', 'strong_hit', false);
    expect(after(seeds, 'The waypoint you reach — Space Sighting (Terminus): '))
      .toEqual([rowFor(SPACE_SIGHTING_TERMINUS, 62)]);
  });

  it('a miss (waylaid; its price is the pipeline\'s card) seeds no waypoint', () => {
    expect(buildOracleSeeds('undertake_an_expedition', 'miss', false, null, { routesPayThePrice: true })).toBeNull();
  });

  it('resolveMove rolls the active sector\'s region — the hop from campaignState to the seed', () => {
    // Challenge dice [3, 5], action die 6 + edge 4: a strong hit.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.45).mockReturnValueOnce(0.99);
    const resolution = resolveMove({
      moveId: 'undertake_an_expedition', moveName: 'Undertake an Expedition', statUsed: 'edge', statValue: 4,
      adds: 0, mischiefApplied: false, mischiefLevel: 'balanced', playerNarration: 'We push into the dark.',
    }, { currentSessionId: 's-1', activeSectorId: 'sec-1', sectors: [{ id: 'sec-1', region: 'outlands' }] });
    expect(resolution.outcome).toBe('strong_hit');
    expect(after(resolution.oracleSeeds, 'The waypoint you reach — Space Sighting (Outlands): ')).toHaveLength(1);
  });
});

describe('issue #353 Phase 0 — a price that reveals a new enemy', () => {
  const enemyLines = (seeds) => ({
    role:        after(seeds, 'The new enemy — Character Role: '),
    goal:        after(seeds, 'The new enemy — Character Goal: '),
    disposition: after(seeds, 'The new enemy — Character Disposition: '),
  });

  it('the pipeline\'s price seed adds what the enemy is and wants (Role + Goal + Disposition)', () => {
    d100s(79, 2, 96);   // Scout; the Goal table's first row; Hostile
    const seeds = withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed');
    expect(lines(seeds)[0]).toBe('Pay the Price: A new enemy is revealed');
    const e = enemyLines(seeds);
    expect(e.role).toEqual([rowFor(ROLE, 79)]);
    expect(e.goal).toEqual([rowFor(GOAL, 2)]);
    expect(e.disposition).toEqual([rowFor(DISPOSITION, 96)]);
  });

  it('a "Roll twice" whose leaf reveals a new enemy is seeded the same way', () => {
    expect(priceRevealsNewEnemy('You are harmed / A new enemy is revealed')).toBe(true);
    const seeds = withPayThePriceSeed(null, 'face_danger', 'You are harmed / A new enemy is revealed');
    expect(enemyLines(seeds).role).toHaveLength(1);
  });

  it('any other price seeds the price alone — no character tables', () => {
    const seeds = withPayThePriceSeed(null, 'face_danger', 'You are stressed');
    expect(lines(seeds)).toEqual(['Pay the Price: You are stressed']);
  });

  // Issue #354 P2-12: the row changed nothing and was narrated as mood. It
  // costs momentum now (the table's route), and the narrator is told so.
  it('"delayed or put at a disadvantage" is seeded with what it costs', () => {
    const seeds = withPayThePriceSeed(null, 'face_danger', 'You are delayed or put at a disadvantage');
    expect(lines(seeds)).toEqual([
      'Pay the Price: You are delayed or put at a disadvantage',
      expect.stringMatching(/^This price is paid in momentum \(Lose Momentum -1\): show the time, ground or advantage actually lost/),
    ]);
  });

  it('the advisory price of a miss that routes none (Sojourn) carries the enemy too', () => {
    // d100 = 47 → "A new enemy is revealed" (45–50); the next rolls are the character tables.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.465);
    const seeds = buildOracleSeeds('sojourn', 'miss', false);
    expect(lines(seeds)[0]).toBe('Pay the Price: A new enemy is revealed');
    expect(enemyLines(seeds).goal).toHaveLength(1);
  });
});

describe('issue #353 Phase 0 — no other outcome seeds', () => {
  it('the moves that seeded nothing still seed nothing', () => {
    expect(buildOracleSeeds('face_danger', 'strong_hit', false)).toBeNull();
    expect(buildOracleSeeds('face_danger', 'weak_hit', false)).toBeNull();
    expect(buildOracleSeeds('secure_an_advantage', 'weak_hit', false)).toBeNull();
    expect(buildOracleSeeds('set_a_course', 'strong_hit', false)).toBeNull();
    expect(buildOracleSeeds('strike', 'miss', true, null, { routesPayThePrice: true })).toBeNull();
  });
});
