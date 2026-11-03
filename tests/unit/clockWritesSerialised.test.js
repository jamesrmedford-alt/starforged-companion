// tests/unit/clockWritesSerialised.test.js
// Clock writes on one client run one at a time (issue #326 W53). The clocks
// are one array in campaignState, written whole, and the cached value
// changes only when the server answers: two clock actions within one world
// round trip (↻ on two clocks, two !clock verbs, a Pay the Price advance
// racing a click) each read the old list, and the second write saved it
// over the first — one action was lost (the issue #321 U57 shape the
// Progress Tracks panel's writeTracks serialises). Each clock write now
// reads only once the one before it on this client has landed.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleClockCommand, advanceTensionClocksForPayThePrice, removeClock } from '../../src/clocks/clocks.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const clock = (id, name) => ({
  _id: id, name, type: 'tension', segments: 6, filled: 3, active: true, advanceOdds: 'likely',
  description: '', notes: '', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
});

describe('clock writes on one client are serialised (issue #326 W53)', () => {
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
  it('a Pay the Price advance racing a reset keeps both', async () => {
    await Promise.all([
      handleClockCommand(makeTestMessage({ content: '!clock reset Alpha' })),
      advanceTensionClocksForPayThePrice(),
    ]);
    const filled = Object.fromEntries(game.settings.get(MODULE_ID, 'campaignState').clocks.map(c => [c.name, c.filled]));
    // Both land, in whichever order they were queued: the advance's Beta 3 → 4,
    // and Alpha reset (0) after its advance, or advanced (1) after its reset.
    // Unserialised, one of the two writes was saved over the other.
    expect(filled.Beta).toBe(4);
    expect([0, 1]).toContain(filled.Alpha);
  });

  it('a write that fails does not hold up the next', async () => {
    silenceConsoleErrors();
    spy.mockImplementationOnce(async () => { throw new Error('refused'); });
    await expect(removeClock('c-a')).rejects.toThrow('refused');
    await handleClockCommand(makeTestMessage({ content: '!clock reset Beta' }));
    const clocks = game.settings.get(MODULE_ID, 'campaignState').clocks;
    expect(Object.fromEntries(clocks.map(c => [c.name, c.filled]))).toEqual({ Alpha: 3, Beta: 0 });
  });
});
