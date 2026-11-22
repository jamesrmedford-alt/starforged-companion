/**
 * STARFORGED COMPANION
 * tests/helpers/scriptedDice.js — dice a test chooses, and a seed for the rest
 *
 * Issue #302 slice C, step 1. A generated sequence must replay: the same
 * commands with the same dice must take the same path, or a failure cannot be
 * reduced. Two kinds of randomness are on a move's path:
 *
 *   - The move's dice. `rollDie` (src/moves/resolver.js) maps Math.random() to
 *     a face as floor(r × faces) + 1 — two challenge d10s, then the action d6;
 *     a progress roll is the two d10s alone. A command names its dice as
 *     faces; `actionDice` / `progressDice` turn them into the Math.random
 *     values that produce them, and `withScriptedDice` serves them for the
 *     length of one call.
 *   - Everything else that reads Math.random on the way: tests/setup.js's
 *     `foundry.utils.randomID` (16 reads an id), an oracle roll, a mischief
 *     aside. `installSeededRandom(seed)` makes those a function of the seed.
 *
 * The two compose: scripted dice are served first, and when a call's script
 * runs out the reads fall through to whatever Math.random was before —
 * the seeded stream when one is installed.
 *
 * Tests that script dice by wrapping `resolveMove` in a vi.mock keep doing
 * so; `withScriptedDice` is the body of that wrapper.
 */

/** The Math.random() value that makes rollDie(faces) return `face`. */
export function uniformFor(face, faces) {
  if (!Number.isInteger(face) || face < 1 || face > faces) {
    throw new Error(`scriptedDice: ${face} is not a face of a d${faces}`);
  }
  return (face - 0.5) / faces;
}

/** An action roll's reads, in the order resolveMove makes them: both challenge dice, then the action die. */
export function actionDice({ challenge, action }) {
  return [uniformFor(challenge[0], 10), uniformFor(challenge[1], 10), uniformFor(action, 6)];
}

/** A progress roll's reads: the two challenge dice. */
export function progressDice(challenge) {
  return [uniformFor(challenge[0], 10), uniformFor(challenge[1], 10)];
}

/**
 * Run `fn` (synchronous) with Math.random answering from `values` first.
 * Reads past the end fall through to the Math.random in place before the
 * call. Returns fn's result; `leftover` receives the values nothing read.
 *
 * @param {number[]} values
 * @param {() => any} fn
 * @param {{ leftover?: (unread: number[]) => void }} [opts]
 */
export function withScriptedDice(values, fn, { leftover = null } = {}) {
  const queue = [...(values ?? [])];
  const before = Math.random;
  Math.random = () => (queue.length ? queue.shift() : before());
  try {
    return fn();
  } finally {
    Math.random = before;
    if (leftover && queue.length) leftover(queue);
  }
}

/** mulberry32: a small seeded generator, uniform on [0, 1). */
export function seededGenerator(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Replace Math.random with a stream that depends only on `seed`, until
 * restore(). `reads()` is how many values have been taken.
 *
 * @param {number} seed
 * @returns {{ restore(): void, reads(): number }}
 */
export function installSeededRandom(seed) {
  const before = Math.random;
  const next = seededGenerator(seed);
  let reads = 0;
  const seeded = () => { reads += 1; return next(); };
  Math.random = seeded;
  return {
    restore() { if (Math.random === seeded) Math.random = before; },
    reads: () => reads,
  };
}
