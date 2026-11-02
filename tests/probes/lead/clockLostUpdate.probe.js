/**
 * PROBE (lead audit) — CLOCK-WRITES-UNSERIALISED.
 *
 * Every clock writer (`!clock new/advance/fill/reset/remove`, the Clocks
 * panel's + / ↻ / reset / ✕, createClock / retireClock / removeClock) is a
 * read-modify-write of the whole `campaignState` on this client: read the
 * cached state, copy it, change one clock, write the copy
 * (src/clocks/clocks.js mutateClock / addClock / writeState). Nothing
 * serialises two of them: a second command or click that starts before the
 * first write has landed reads the same stale state and its write reverts the
 * first change — the issue #321 U57 shape, fixed for the Progress Tracks
 * panel with a per-client write queue (`writeTracks`) but not here.
 *
 * Two `!clock reset` commands on different clocks are run concurrently with a
 * world write that takes one round trip (as `game.settings.set` does — the
 * cache updates when the server answers). Asserts the CORRECT behaviour —
 * both clocks reset — so it FAILS today: the second write carries the first
 * clock's old value back.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleClockCommand } from '../../../src/clocks/clocks.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const clock = (id, name) => ({
  _id: id, name, type: 'tension', segments: 6, filled: 3, active: true, advanceOdds: 'likely',
  description: '', notes: '', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
});

describe('CLOCK-WRITES-UNSERIALISED', () => {
  let spy;
  beforeEach(() => {
    game.settings._store.set(KEY, { currentSessionId: 's1', clocks: [clock('c-a', 'Alpha'), clock('c-b', 'Beta')] });
    // A world write lands one round trip later; the cache holds the old value until then.
    spy = vi.spyOn(game.settings, 'set').mockImplementation(async (mod, key, val) => {
      await new Promise(r => setTimeout(r, 15));
      game.settings._store.set(`${mod}.${key}`, val);
      return val;
    });
  });
  afterEach(() => { spy.mockRestore(); ChatMessage._reset(); });

  it('two clock resets issued within one round trip both land', async () => {
    await Promise.all([
      handleClockCommand(makeTestMessage({ content: '!clock reset Alpha' })),
      handleClockCommand(makeTestMessage({ content: '!clock reset Beta' })),
    ]);
    const clocks = game.settings.get(MODULE_ID, 'campaignState').clocks;
    expect(Object.fromEntries(clocks.map(c => [c.name, c.filled]))).toEqual({ Alpha: 0, Beta: 0 });
  });

  it('control: the same two resets one after the other both land', async () => {
    await handleClockCommand(makeTestMessage({ content: '!clock reset Alpha' }));
    await handleClockCommand(makeTestMessage({ content: '!clock reset Beta' }));
    const clocks = game.settings.get(MODULE_ID, 'campaignState').clocks;
    expect(Object.fromEntries(clocks.map(c => [c.name, c.filled]))).toEqual({ Alpha: 0, Beta: 0 });
  });
});
