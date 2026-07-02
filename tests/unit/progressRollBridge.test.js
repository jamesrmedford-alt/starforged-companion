/**
 * STARFORGED COMPANION
 * tests/unit/progressRollBridge.test.js
 *
 * Panel Progress Roll → move-pipeline bridge. Combat and expedition rolls are
 * real progress moves with pipeline consequences, so during an active session
 * the panel's Roll button posts the forced-move bridge message instead of the
 * bespoke display card (which had no consumer — a "won" fight never ended).
 * scene_challenge and pre-session rolls keep the instant display roll.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRACK_TYPE_TO_MOVE, rollProgress } from '../../src/ui/progressTracks.js';

const MODULE_ID = 'starforged-companion';

const chatCalls = [];
beforeEach(() => {
  chatCalls.length = 0;
  globalThis.ChatMessage = { create: vi.fn(async (d) => { chatCalls.push(d); return d; }) };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { sessionActive: true });
});

const combatTrack = (over = {}) => ({
  id: 'ct1', label: 'The pirate boarders', type: 'combat', rank: 'dangerous',
  ticks: 24, completed: false, ...over,
});

describe('TRACK_TYPE_TO_MOVE', () => {
  it('maps combat and expedition to their progress moves; scene_challenge to nothing', () => {
    expect(TRACK_TYPE_TO_MOVE.combat).toBe('take_decisive_action');
    expect(TRACK_TYPE_TO_MOVE.expedition).toBe('finish_an_expedition');
    expect(TRACK_TYPE_TO_MOVE.scene_challenge).toBeUndefined();
  });
});

describe('rollProgress — pipeline bridge', () => {
  it('posts a forced Take Decisive Action bridge for a combat row mid-session', async () => {
    await rollProgress(combatTrack());
    expect(chatCalls).toHaveLength(1);
    const msg = chatCalls[0];
    expect(msg.flags[MODULE_ID]).toMatchObject({
      bypassPacing:    true,
      forcedMoveId:    'take_decisive_action',
      forcedMoveTarget: 'The pirate boarders',
    });
    // Must clear isPlayerNarration's 10-char floor so the pipeline accepts it.
    expect(msg.content.trim().length).toBeGreaterThanOrEqual(10);
  });

  it('posts a forced Finish an Expedition bridge for an expedition row mid-session', async () => {
    await rollProgress(combatTrack({ type: 'expedition', label: 'The Vault approach' }));
    expect(chatCalls[0].flags[MODULE_ID]).toMatchObject({
      forcedMoveId:     'finish_an_expedition',
      forcedMoveTarget: 'The Vault approach',
    });
  });

  it('falls back to the bespoke display roll pre-session (pipeline would ignore the bridge)', async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { sessionActive: false });
    await rollProgress(combatTrack());
    expect(chatCalls).toHaveLength(1);
    expect(chatCalls[0].flags[MODULE_ID].type).toBe('progressRoll');
    expect(chatCalls[0].flags[MODULE_ID].forcedMoveId).toBeUndefined();
  });

  it('keeps the bespoke display roll for scene challenges even mid-session', async () => {
    await rollProgress(combatTrack({ type: 'scene_challenge', label: 'Debate the council' }));
    expect(chatCalls[0].flags[MODULE_ID].type).toBe('progressRoll');
  });
});
