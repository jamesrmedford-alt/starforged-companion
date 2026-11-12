/**
 * STARFORGED COMPANION
 * tests/unit/progressTracksWriteQueueBounded.test.js
 *
 * Issue #347 TRACK-QUEUE-UNBOUNDED-IN-LOCK (AB05's residual) — a Progress
 * Tracks save that is never answered does not hold the queue, or the move
 * lock it is awaited in, for good.
 *
 * Every track write on a client runs one at a time (issue #321 U57), each
 * awaiting the one before it. A save whose answer was lost with the
 * connection never settled, so every later track write waited forever — and
 * the queue is awaited inside the move lock (a move's progress mark, a
 * fight's position), so the move's `finally` never ran and the table could
 * not move again until the page reloaded. The write ahead, and each of a
 * write's own world writes, are now waited on for at most 30 s (AB05's
 * bound): a save not answered by then rejects, as a refused one does, and the
 * next write runs.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

const MODULE_ID = 'starforged-companion';

let store, journal, savedJournal;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  store = await import('../../src/ui/progressTracks.js');
});

/** The tracks journal; `hangNext` makes its next save one the server never answers. */
function makeJournal(tracks) {
  const flags = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  const j = {
    id: 'pt', name: 'Starforged Progress Tracks', hangNext: false,
    getFlag: (m, k) => flags[`${m}.${k}`],
    setFlag: (m, k, v) => {
      if (j.hangNext) { j.hangNext = false; return new Promise(() => {}); }
      flags[`${m}.${k}`] = structuredClone(v);
      return Promise.resolve();
    },
  };
  return j;
}

beforeEach(() => {
  journal = makeJournal([
    { id: 'fight-1', label: 'Corsair boarding party', type: 'combat', rank: 'dangerous', ticks: 0, completed: false, combatState: null },
  ]);
  savedJournal = game.journal;
  game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null) };
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => { vi.useRealTimers(); game.journal = savedJournal; });

const ticks = () => journal.getFlag(MODULE_ID, 'tracks').find(t => t.id === 'fight-1').ticks;
const outcome = (p) => p.then(() => 'landed', (err) => `refused: ${err?.message ?? err}`);

describe('a Progress Tracks save never answered (issue #347 TRACK-QUEUE-UNBOUNDED-IN-LOCK)', () => {
  it('settles after 30 s — refused — and the next track write runs and lands', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      journal.hangNext = true;
      const hung = outcome(store.markProgressById('fight-1'));
      const next = outcome(store.markProgressById('fight-1'));

      await vi.advanceTimersByTimeAsync(29_000);
      let settled = false;
      hung.then(() => { settled = true; });
      await Promise.resolve();
      expect(settled, 'not before the bound').toBe(false);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(await hung).toMatch(/refused: a Progress Tracks save was not answered/);
      expect(await next).toBe('landed');
      expect(ticks(), "the second mark landed; the first's save never did").toBe(8);
    } finally {
      warn.mockRestore();
    }
  });

  it('control: an answered save lands at once, and the next waits for it', async () => {
    const first = outcome(store.markProgressById('fight-1'));
    const second = outcome(store.markProgressById('fight-1'));
    expect([await first, await second]).toEqual(['landed', 'landed']);
    expect(ticks()).toBe(16);
  });
});
