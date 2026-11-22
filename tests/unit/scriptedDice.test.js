/**
 * STARFORGED COMPANION
 * tests/unit/scriptedDice.test.js
 *
 * Issue #302 slice C, step 1 — dice a test chooses and a seed for the rest
 * (tests/helpers/scriptedDice.js). A generated sequence replays only if the
 * same commands roll the same dice and every other random read on the way
 * (an id, an oracle roll) is a function of the seed.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  actionDice, installSeededRandom, progressDice, seededGenerator, uniformFor, withScriptedDice,
} from '../helpers/scriptedDice.js';
import { rollActionDie, rollChallengeDice, rollDie } from '../../src/moves/resolver.js';
import { rollOracle } from '../../src/oracles/roller.js';

const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; });

describe('scripted dice', () => {
  it('uniformFor gives the read that rolls each face, on the module\'s own rollDie', () => {
    for (const faces of [6, 10, 100]) {
      for (let face = 1; face <= faces; face++) {
        expect(withScriptedDice([uniformFor(face, faces)], () => rollDie(faces)), `d${faces} → ${face}`).toBe(face);
      }
    }
    expect(() => uniformFor(0, 6)).toThrow(/not a face of a d6/);
    expect(() => uniformFor(11, 10)).toThrow(/not a face of a d10/);
  });

  it('an action roll is read challenge, challenge, action — the order the resolver rolls in', () => {
    const rolled = withScriptedDice(actionDice({ challenge: [3, 9], action: 5 }), () => {
      const challenge = rollChallengeDice();
      return { challenge, action: rollActionDie() };
    });
    expect(rolled).toEqual({ challenge: [3, 9], action: 5 });
  });

  it('a progress roll is the two challenge dice', () => {
    expect(withScriptedDice(progressDice([10, 1]), () => rollChallengeDice())).toEqual([10, 1]);
  });

  it('reads past the script fall through, Math.random is put back, and unread values are reported', () => {
    Math.random = () => 0.999;
    const before = Math.random;
    let unread = null;
    const out = withScriptedDice([uniformFor(2, 6)], () => [rollDie(6), rollDie(6)]);
    expect(out).toEqual([2, 6]);
    expect(Math.random).toBe(before);

    withScriptedDice(progressDice([4, 7]), () => rollDie(10), { leftover: (rest) => { unread = rest; } });
    expect(unread).toEqual([uniformFor(7, 10)]);
    expect(Math.random).toBe(before);
  });

  it('Math.random is put back when the call throws', () => {
    const before = Math.random;
    expect(() => withScriptedDice([0.5], () => { throw new Error('boom'); })).toThrow('boom');
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
    const out = withScriptedDice(progressDice([2, 8]), () => [...rollChallengeDice(), Math.random()]);
    seeded.restore();
    expect(out).toEqual([2, 8, expectedNext]);
  });
});
