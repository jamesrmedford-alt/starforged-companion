/**
 * STARFORGED COMPANION
 * tests/unit/burnBeatUnscriptable.test.js
 *
 * FIGHT-PAST-ITS-END, the runner's half (the long haul's eighth live round,
 * 2026-11-26): beat 12 wants a weak hit, then Burn Momentum. With momentum 2
 * the GM could not script one ("momentum 2 is too low for a weak hit on +edge
 * (2) that a burn improves", lib/gm.mjs), so each roll fell live and offered
 * no burn, and the beat attacked for its whole allowance — eight actions,
 * a37–a45, on a fight whose track was full by a39. The 100-action cap then
 * took beats 26 and 27.
 *
 * The GM now names the beat whose roll it could not script
 * (`notScriptedBeat`), the run marks that beat (explore.mjs), and its check
 * is moot: not exercised, and the run goes on.
 */

import { describe, it, expect } from 'vitest';
import { BEAT_CHECKS, createPointer } from '../../test/ci/playwright/lib/beats.mjs';

const WHY = 'momentum 2 is too low for a weak hit on +edge (2) that a burn improves';
const CHECK = { type: 'burned', moves: ['strike', 'clash'] };
const roll = (over = {}) => ({ rolled: true, moveId: 'clash', outcome: 'strong_hit', step: 'a37', card: { move: { burn: null } }, ...over });

describe('a burn the GM could not script is not exercised at once', () => {
  it('a live roll offering no burn, on a beat the GM could not script: moot', () => {
    const result = BEAT_CHECKS.burned({ rolls: [roll()], unscripted: WHY }, CHECK);
    expect(result).toMatchObject({ done: false, moot: true });
    expect(result.detail).toBe(`clash came up strong_hit unscripted — ${WHY}; the burn was not exercised`);
  });

  it('control: scripted, a roll offering no burn is waited past, as before', () => {
    const result = BEAT_CHECKS.burned({ rolls: [roll()], unscripted: null }, CHECK);
    expect(result).toMatchObject({ done: false });
    expect(result.moot).toBeUndefined();
    expect(result.detail).toBe('clash came up strong_hit; its card offers no burn');
  });

  it('a burn the dice offered anyway is still the beat\'s to press', () => {
    const result = BEAT_CHECKS.burned({ rolls: [roll({ outcome: 'weak_hit', card: { move: { burn: { consumed: false } } } })], unscripted: WHY }, CHECK);
    expect(result.moot).toBeUndefined();
    expect(result.detail).toBe('clash came up weak_hit; momentum has not been burned');
  });

  it('the pointer reads the mark the run put on the beat: not exercised, and the run goes on', () => {
    const pointer = createPointer([
      { id: 'b11', n: 12, session: 2, title: 'A scripted weak hit, then Burn Momentum', check: CHECK },
      { id: 'b12', n: 13, session: 2, title: 'Next', check: { type: 'sessionEnded', n: 9 } },
    ]);
    const card = { id: 'm-roll', move: { name: 'Clash', shown: 'strong_hit', diceLine: 'Action: 5 + 2 = 7 | Challenge: 1, 3' } };
    const marks = [{ step: '(setup)', table: { pcs: [], session: { active: true } }, cards: [] }];
    pointer.advance({ marks, messages: [], actions: [], charter: {} }, '(setup)');
    pointer.current().state.unscripted = WHY;   // explore.mjs, on the GM's `notScriptedBeat`
    pointer.record('a37');
    marks.push({ step: 'a37', table: { pcs: [], session: { active: true } }, cards: [card] });
    const changes = pointer.advance({ marks, messages: [], actions: [], charter: {} }, 'a37');
    expect(changes.map(c => `${c.id}:${c.status}`)).toEqual(['b11:not-exercised']);
    expect(pointer.state[0].detail).toContain('the burn was not exercised');
    expect(pointer.current().beat.id).toBe('b12');
  });
});
