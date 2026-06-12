/**
 * STARFORGED COMPANION
 * tests/unit/quickstart.test.js
 *
 * Pure-helper coverage for the ✦ Playtest Quickstart. The orchestrator's
 * Foundry IO (actor creation, pack reads, the Macro document) is exercised
 * live by the Quench quickstart batch.
 */

import { describe, it, expect } from 'vitest';
import {
  assignStatArray,
  pickRandomDistinct,
  rollPcName,
  rollShipName,
} from '../../src/session/quickstart.js';

describe('assignStatArray', () => {
  it('assigns exactly the 3/2/2/1/1 array across the five stats', () => {
    const stats = assignStatArray();
    const values = Object.values(stats).sort((a, b) => b - a);
    expect(values).toEqual([3, 2, 2, 1, 1]);
    expect(Object.keys(stats).sort()).toEqual(['edge', 'heart', 'iron', 'shadow', 'wits']);
  });

  it('is deterministic under an injected rng', () => {
    const rngZero = () => 0;          // always take the first remaining value
    expect(assignStatArray(rngZero)).toEqual({ edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 });
  });

  it('produces varied assignments across rng streams', () => {
    let i = 0;
    const seq = [0.9, 0.1, 0.7, 0.3, 0.5];
    const rng = () => seq[i++ % seq.length];
    const stats = assignStatArray(rng);
    expect(Object.values(stats).sort((a, b) => b - a)).toEqual([3, 2, 2, 1, 1]);
    expect(stats.edge).not.toBe(3);   // 0.9 picks from the tail, not the head
  });
});

describe('pickRandomDistinct', () => {
  it('picks n distinct entries', () => {
    const picks = pickRandomDistinct(['a', 'b', 'c', 'd'], 2, () => 0);
    expect(picks).toEqual(['a', 'b']);
  });

  it('caps at the list length and tolerates empty/garbage lists', () => {
    expect(pickRandomDistinct(['a'], 3)).toEqual(['a']);
    expect(pickRandomDistinct([], 2)).toEqual([]);
    expect(pickRandomDistinct(null, 2)).toEqual([]);
  });

  it('never repeats an entry', () => {
    const picks = pickRandomDistinct([1, 2, 3, 4, 5], 5);
    expect(new Set(picks).size).toBe(5);
  });
});

describe('name rollers', () => {
  it('rollPcName yields "Given Family"', () => {
    const name = rollPcName();
    expect(name.split(' ').length).toBeGreaterThanOrEqual(2);
    expect(name).not.toMatch(/Roll (twice|again)/i);
  });

  it('rollShipName yields the ISV prefix form', () => {
    expect(rollShipName()).toMatch(/^ISV .+/);
  });
});
