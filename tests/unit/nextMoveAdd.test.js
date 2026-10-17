/**
 * STARFORGED COMPANION
 * tests/unit/nextMoveAdd.test.js
 *
 * Take a Break → "Move on" grants a single-use +1 on the next action roll
 * (src/moves/nextMoveAdd.js). Before the 2026-10 audit the grant was written
 * to campaignState.nextMoveAdd and never read.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isActionRollMove,
  takeNextMoveAdd,
  clearPersistedNextMoveAdd,
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

describe('takeNextMoveAdd', () => {
  it('returns the add and consumes the grant on an action roll', () => {
    const state = { nextMoveAdd: grant() };
    expect(takeNextMoveAdd(state, 'face_danger')).toBe(1);
    expect(state.nextMoveAdd).toBeUndefined();
  });

  it('leaves the grant pending for a progress move', () => {
    const state = { nextMoveAdd: grant() };
    expect(takeNextMoveAdd(state, 'fulfill_your_vow')).toBe(0);
    expect(state.nextMoveAdd).toEqual(grant());
  });

  it('leaves the grant pending for a no-roll move', () => {
    const state = { nextMoveAdd: grant() };
    expect(takeNextMoveAdd(state, 'reach_a_milestone')).toBe(0);
    expect(state.nextMoveAdd).toBeDefined();
  });

  it('returns 0 when nothing is pending or the value is not positive', () => {
    expect(takeNextMoveAdd({}, 'face_danger')).toBe(0);
    expect(takeNextMoveAdd(null, 'face_danger')).toBe(0);
    const zero = { nextMoveAdd: { value: 0 } };
    expect(takeNextMoveAdd(zero, 'face_danger')).toBe(0);
    expect(zero.nextMoveAdd).toEqual({ value: 0 });
  });
});

describe('clearPersistedNextMoveAdd', () => {
  beforeEach(() => game.settings._store.clear());

  it('drops the grant from the stored campaignState and keeps everything else', async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { nextMoveAdd: grant(), xCardActive: false });
    await clearPersistedNextMoveAdd();
    expect(game.settings._store.get(`${MODULE_ID}.campaignState`)).toEqual({ xCardActive: false });
  });

  it('does not write when nothing is pending', async () => {
    const stored = { xCardActive: false };
    game.settings._store.set(`${MODULE_ID}.campaignState`, stored);
    await clearPersistedNextMoveAdd();
    expect(game.settings._store.get(`${MODULE_ID}.campaignState`)).toBe(stored);
  });
});
