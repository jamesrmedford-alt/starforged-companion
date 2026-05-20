/**
 * STARFORGED COMPANION
 * tests/unit/pipeline.test.js
 *
 * Unit tests for the move interpretation pipeline's concurrency guard.
 * The guard sits at the top of the createChatMessage handler registered by
 * registerChatHook() and short-circuits when campaignState.pendingMove is
 * already true, preventing two parallel pipelines from racing on shared state.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the heavy pipeline modules so they cannot be invoked even by accident.
// vi.mock is hoisted, so these run before src/index.js is imported.
vi.mock('../../src/moves/interpreter.js', () => ({
  interpretMove: vi.fn(async () => { throw new Error('interpretMove must not be called when lock is held'); }),
}));
vi.mock('../../src/moves/resolver.js', () => ({
  resolveMove: vi.fn(),
}));

import { registerChatHook } from '../../src/index.js';
import { interpretMove } from '../../src/moves/interpreter.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';


function makeNarration(overrides = {}) {
  return {
    type:    'ic',
    content: 'I draw my blade and step toward the alien.',
    author:  { isGM: false, id: 'player-1' },
    flags:   {},
    ...overrides,
  };
}

beforeEach(() => {
  // Reset hook handlers so each test gets a fresh listener list.
  Hooks._handlers.clear();
  // Reset interpreter mock between tests.
  interpretMove.mockClear();

  // The pipeline now gates on isCanonicalGM() to prevent every client
  // running the same work. These tests exercise the per-client
  // concurrency guard — they need to LOOK like the canonical GM client
  // so they actually reach the lock check.
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  global.game.user  = global.game.users[0];
});


describe('move pipeline concurrency guard', () => {
  it('second message is blocked while pendingMove is true', async () => {
    const state = { ...CampaignStateSchema, pendingMove: true };
    game.settings._store.set(`${MODULE_ID}.campaignState`, state);

    registerChatHook();

    const infoSpy = vi.spyOn(ui.notifications, 'info');
    const handler = Hooks._handlers.get('createChatMessage').slice(-1)[0];

    await handler(makeNarration());

    expect(interpretMove).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0][0]).toMatch(/already being resolved/i);
    // Notification must auto-dismiss — non-permanent.
    expect(infoSpy.mock.calls[0][1]).toEqual({ permanent: false });

    // Lock is unchanged — the blocked path must not clear someone else's lock.
    const after = game.settings._store.get(`${MODULE_ID}.campaignState`);
    expect(after.pendingMove).toBe(true);
  });

  it('non-narration messages bypass the lock check entirely', async () => {
    const state = { ...CampaignStateSchema, pendingMove: true };
    game.settings._store.set(`${MODULE_ID}.campaignState`, state);

    registerChatHook();

    const infoSpy = vi.spyOn(ui.notifications, 'info');
    const handler = Hooks._handlers.get('createChatMessage').slice(-1)[0];

    // Slash command — isPlayerNarration() returns false, so the guard never runs.
    await handler(makeNarration({ content: '/whisper gm hello' }));

    expect(infoSpy).not.toHaveBeenCalled();
  });
});
