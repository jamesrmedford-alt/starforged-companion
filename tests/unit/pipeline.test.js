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

import { registerChatHook, releasePendingMoveLock } from '../../src/index.js';
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
    const state = { ...CampaignStateSchema, pendingMove: true, sessionActive: true };
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
    const state = { ...CampaignStateSchema, pendingMove: true, sessionActive: true };
    game.settings._store.set(`${MODULE_ID}.campaignState`, state);

    registerChatHook();

    const infoSpy = vi.spyOn(ui.notifications, 'info');
    const handler = Hooks._handlers.get('createChatMessage').slice(-1)[0];

    // Slash command — isPlayerNarration() returns false, so the guard never runs.
    await handler(makeNarration({ content: '/whisper gm hello' }));

    expect(infoSpy).not.toHaveBeenCalled();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// releasePendingMoveLock — PLAYTEST-1712 M/N regression guard.
//
// The v1.7.12 lockup: applyMoveConsequenceRiders opens an interactive GM dialog
// inside the move pipeline. While it was held inside the lock's critical
// section, campaignState.pendingMove stayed true and every subsequent player
// input hit the "a move is already being resolved" guard. The fix releases the
// lock on the success path *before* the rider prompt, with the pipeline's
// finally re-releasing idempotently. These tests pin the helper's contract:
// idempotent, clears the lock, never clobbers concurrent writes.
// ─────────────────────────────────────────────────────────────────────────────

describe('releasePendingMoveLock', () => {
  it('clears a held lock', async () => {
    const state = { ...CampaignStateSchema, pendingMove: true, sessionActive: true };
    game.settings._store.set(`${MODULE_ID}.campaignState`, state);

    await releasePendingMoveLock();

    const after = game.settings._store.get(`${MODULE_ID}.campaignState`);
    expect(after.pendingMove).toBe(false);
  });

  it('is idempotent — a second call when already released is a no-op', async () => {
    const state = { ...CampaignStateSchema, pendingMove: true, sessionActive: true };
    game.settings._store.set(`${MODULE_ID}.campaignState`, state);

    await releasePendingMoveLock();           // success-path early release
    const setSpy = vi.spyOn(game.settings, 'set');
    await releasePendingMoveLock();           // finally-block safety net

    // Already false → no second write (cheap no-op, doesn't churn world state).
    expect(setSpy).not.toHaveBeenCalled();
    const after = game.settings._store.get(`${MODULE_ID}.campaignState`);
    expect(after.pendingMove).toBe(false);
  });

  it('re-reads the latest state so it never clobbers writes made during the pipeline', async () => {
    // Lock held at claim time…
    const atClaim = { ...CampaignStateSchema, pendingMove: true, sessionActive: true };
    game.settings._store.set(`${MODULE_ID}.campaignState`, atClaim);

    // …pipeline writes new state (entity record) while the move runs. The
    // release must preserve this, not overwrite it with the stale snapshot.
    const duringPipeline = {
      ...CampaignStateSchema,
      pendingMove: true,
      sessionActive: true,
      connections: [{ id: 'c1', name: 'Lyssa Chen' }],
    };
    game.settings._store.set(`${MODULE_ID}.campaignState`, duringPipeline);

    await releasePendingMoveLock();

    const after = game.settings._store.get(`${MODULE_ID}.campaignState`);
    expect(after.pendingMove).toBe(false);
    expect(after.connections).toEqual([{ id: 'c1', name: 'Lyssa Chen' }]);
  });

  it('tolerates a missing campaignState without throwing', async () => {
    game.settings._store.delete(`${MODULE_ID}.campaignState`);
    await expect(releasePendingMoveLock()).resolves.toBeUndefined();
  });
});
