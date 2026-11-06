/**
 * STARFORGED COMPANION
 * tests/unit/nextMoveAdd.test.js
 *
 * Take a Break → "Move on" grants a single-use +1 on the next action roll
 * (src/moves/nextMoveAdd.js). Before the 2026-10 audit the grant was written
 * to campaignState.nextMoveAdd and never read.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isActionRollMove,
  consumeNextMoveAdd,
} from '../../src/moves/nextMoveAdd.js';

const MODULE_ID = 'starforged-companion';
const grant = () => ({ value: 1, source: 'take_a_break', setAt: '2026-10-17T00:00:00.000Z' });

describe('isActionRollMove', () => {
  it('is true for stat-rolled moves', () => {
    expect(isActionRollMove('face_danger')).toBe(true);
    expect(isActionRollMove('strike')).toBe(true);
  });

  it('is false for progress moves, no-roll moves and unknown ids', () => {
    expect(isActionRollMove('fulfill_your_vow')).toBe(false);
    expect(isActionRollMove('take_decisive_action')).toBe(false);
    expect(isActionRollMove('reach_a_milestone')).toBe(false);
    expect(isActionRollMove('begin_a_session')).toBe(false);
    expect(isActionRollMove('not_a_move')).toBe(false);
  });
});

// Issue #342 Z52: claimed on the store before it is added — a refused claim
// adds nothing and leaves the +1 pending (consumeNextMoveBonus's shape).
describe('consumeNextMoveAdd', () => {
  const KEY = `${MODULE_ID}.campaignState`;
  beforeEach(() => game.settings._store.clear());

  it('returns the add, drops the grant from the store and keeps everything else', async () => {
    game.settings._store.set(KEY, { nextMoveAdd: grant(), xCardActive: false });
    const working = { nextMoveAdd: grant() };
    expect(await consumeNextMoveAdd(working, 'face_danger')).toBe(1);
    expect(game.settings._store.get(KEY)).toEqual({ xCardActive: false });
    expect(working.nextMoveAdd).toBeUndefined();
  });

  it('leaves the grant pending for a progress move or a no-roll move', async () => {
    game.settings._store.set(KEY, { nextMoveAdd: grant() });
    expect(await consumeNextMoveAdd({}, 'fulfill_your_vow')).toBe(0);
    expect(await consumeNextMoveAdd({}, 'reach_a_milestone')).toBe(0);
    expect(game.settings._store.get(KEY).nextMoveAdd).toEqual(grant());
  });

  it('a bonded Develop Your Relationship, rolled as an action roll, takes it (issue #326 W48)', async () => {
    game.settings._store.set(KEY, { nextMoveAdd: grant() });
    expect(await consumeNextMoveAdd({}, 'develop_your_relationship', { rollKind: 'action' })).toBe(1);
  });

  it('returns 0 and writes nothing when nothing is pending in the store, or the value is not positive', async () => {
    const stored = { xCardActive: false };
    game.settings._store.set(KEY, stored);
    // A working copy read before the +1 was spent elsewhere does not bring it back.
    expect(await consumeNextMoveAdd({ nextMoveAdd: grant() }, 'face_danger')).toBe(0);
    expect(game.settings._store.get(KEY)).toBe(stored);
    game.settings._store.set(KEY, { nextMoveAdd: { value: 0 } });
    expect(await consumeNextMoveAdd({}, 'face_danger')).toBe(0);
    expect(game.settings._store.get(KEY).nextMoveAdd).toEqual({ value: 0 });
  });

  it('a refused claim adds nothing and leaves the +1 pending, in the store and the working copy', async () => {
    game.settings._store.set(KEY, { nextMoveAdd: grant() });
    const working = { nextMoveAdd: grant() };
    const set = vi.spyOn(game.settings, 'set').mockRejectedValueOnce(new Error('refused by the test'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await consumeNextMoveAdd(working, 'face_danger')).toBe(0);
    } finally {
      set.mockRestore();
      warn.mockRestore();
    }
    expect(game.settings._store.get(KEY).nextMoveAdd).toEqual(grant());
    expect(working.nextMoveAdd).toEqual(grant());
  });
});
