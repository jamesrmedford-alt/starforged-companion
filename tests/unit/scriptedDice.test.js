/**
 * STARFORGED COMPANION
 * tests/unit/scriptedDice.test.js
 *
 * Issue #302 slice C — dice a test chooses and a seed for the rest
 * (tests/helpers/scriptedDice.js). A generated sequence replays only if the
 * same commands roll the same dice and every other random read on the way
 * (an id, an oracle roll) is a function of the seed — and it runs on a table
 * whose modules are all real only if the dice can be scripted without mocking
 * the resolver.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  installMoveDice, installSeededRandom, progressDice, seededGenerator, uniformFor,
} from '../helpers/scriptedDice.js';
import { rollActionDie, rollChallengeDice, rollDie } from '../../src/moves/resolver.js';
import { rollOracle } from '../../src/oracles/roller.js';

const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; });

describe('scripted dice', () => {
  it('uniformFor gives the read that rolls each face, on the module\'s own rollDie', () => {
    const queue = [];
    installMoveDice(queue);
    for (const faces of [6, 10, 100]) {
      for (let face = 1; face <= faces; face++) {
        queue.push(uniformFor(face, faces));
        expect(rollDie(faces), `d${faces} → ${face}`).toBe(face);
      }
    }
    expect(() => uniformFor(0, 6)).toThrow(/not a face of a d6/);
    expect(() => uniformFor(11, 10)).toThrow(/not a face of a d10/);
  });

  it('a progress roll, and a recommit, is the two challenge dice', () => {
    const queue = progressDice([10, 1]);
    installMoveDice(queue);
    expect(rollChallengeDice()).toEqual([10, 1]);
    expect(queue).toEqual([]);
  });

  it('the script answers the module\'s dice and nobody else: a read between two dice leaves both for the dice', () => {
    Math.random = () => 0.999;
    const queue = [uniformFor(3, 10), uniformFor(2, 6)];
    installMoveDice(queue);
    const first = rollDie(10);
    const between = Math.random();                       // an id, an oracle roll: not rollDie asking
    const id = foundry.utils.randomID();                 // 16 more reads that are not dice
    const second = rollActionDie();
    expect({ first, between, second }).toEqual({ first: 3, between: 0.999, second: 2 });
    expect(id).toHaveLength(16);
    expect(queue).toEqual([]);
  });

  it('with the script empty the dice fall through, and restore puts Math.random back', () => {
    Math.random = () => 0.999;
    const before = Math.random;
    const dice = installMoveDice([]);
    expect(rollDie(6)).toBe(6);
    expect(Math.random).not.toBe(before);
    dice.restore();
    expect(Math.random).toBe(before);
  });
});

describe('seeded randomness', () => {
  it('the stream depends only on the seed, and stays inside [0, 1)', () => {
    const a = seededGenerator(42), b = seededGenerator(42), c = seededGenerator(43);
    const as = Array.from({ length: 200 }, a), bs = Array.from({ length: 200 }, b), cs = Array.from({ length: 200 }, c);
    expect(as).toEqual(bs);
    expect(as).not.toEqual(cs);
    expect(as.every(v => v >= 0 && v < 1)).toBe(true);
    expect(new Set(as).size).toBeGreaterThan(190);
  });

  it('under a seed, ids and oracle rolls repeat run for run', () => {
    const run = (seed) => {
      const seeded = installSeededRandom(seed);
      try {
        return { id: foundry.utils.randomID(), action: rollOracle('action').result, die: rollDie(10), reads: seeded.reads() };
      } finally { seeded.restore(); }
    };
    const first = run(7);
    expect(run(7)).toEqual(first);
    expect(run(8)).not.toEqual(first);
    expect(first.reads).toBeGreaterThan(16);     // the id alone reads 16
    expect(Math.random).toBe(realRandom);
  });

  it('scripted dice come first; what the script does not cover comes from the seed', () => {
    const seeded = installSeededRandom(99);
    const expectedNext = seededGenerator(99)();
    const dice = installMoveDice(progressDice([2, 8]));
    const out = [...rollChallengeDice(), Math.random()];
    dice.restore();
    seeded.restore();
    expect(out).toEqual([2, 8, expectedNext]);
    expect(Math.random).toBe(realRandom);
  });
});
