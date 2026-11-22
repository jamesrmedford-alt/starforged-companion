/**
 * STARFORGED COMPANION
 * tests/helpers/scriptedDice.js — dice a test chooses, and a seed for the rest
 *
 * Issue #302 slice C. A generated sequence must replay: the same commands
 * with the same dice must take the same path, or a failure cannot be reduced.
 * Two kinds of randomness are on a move's path:
 *
 *   - The move's dice. `rollDie` (src/moves/resolver.js) maps Math.random() to
 *     a face as floor(r × faces) + 1. A command names its dice as faces;
 *     `uniformFor` / `progressDice` turn them into the Math.random values that
 *     produce them, and `installMoveDice` serves them to rollDie.
 *   - Everything else that reads Math.random on the way: tests/setup.js's
 *     `foundry.utils.randomID` (16 reads an id), an oracle roll, a mischief
 *     aside. `installSeededRandom(seed)` makes those a function of the seed.
 *
 * The two compose: install the seed, then the dice. rollDie is answered from
 * the script, everything else — and rollDie once the script is empty — from
 * the seeded stream.
 *
 * No module is mocked. Booted-table tests usually script dice by wrapping
 * `resolveMove` in a vi.mock; a mocked module is one object shared by every
 * simulated client, built in the module graph of whichever client loaded it
 * first — and after that client's page reloads, it reads a closed tab's
 * module state. Answering Math.random by who is asking needs no mock, so the
 * dice can be scripted on a table whose modules are all real, reloads
 * included.
 */

/** The Math.random() value that makes rollDie(faces) return `face`. */
export function uniformFor(face, faces) {
  if (!Number.isInteger(face) || face < 1 || face > faces) {
    throw new Error(`scriptedDice: ${face} is not a face of a d${faces}`);
  }
  return (face - 0.5) / faces;
}

/** A progress roll's reads — and a recommit's: the two challenge dice. */
export function progressDice(challenge) {
  return [uniformFor(challenge[0], 10), uniformFor(challenge[1], 10)];
}

/**
 * Serve `queue` to the module's dice and to nothing else, until restore(): a
 * read made by `rollDie` (src/moves/resolver.js — a move's dice, and a
 * recommit's) takes the queue's next value; every other caller — an id, an
 * oracle roll — gets the Math.random in place before. With the queue empty,
 * so does rollDie.
 *
 * It tells the caller by the stack, as the scripted playthroughs do in the
 * browser (test/ci/playwright/playthrough.mjs).
 *
 * @param {number[]} queue  mutated in place: push a roll's reads before the move
 * @returns {{ restore(): void }}
 */
export function installMoveDice(queue) {
  const before = Math.random;
  const dice = () => {
    if (queue.length && /\brollDie\b[^\n]*[\\/]src[\\/]moves[\\/]resolver\.js/.test(new Error("who rolls").stack ?? "")) return queue.shift();
    return before();
  };
  Math.random = dice;
  return { restore() { if (Math.random === dice) Math.random = before; } };
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
