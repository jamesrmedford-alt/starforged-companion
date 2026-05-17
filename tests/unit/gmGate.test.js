/**
 * STARFORGED COMPANION
 * tests/unit/gmGate.test.js
 *
 * Coverage for isCanonicalGM() — the single-emitter gate that prevents
 * every connected client from running the move pipeline.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { isCanonicalGM } from '../../src/multiplayer/gmGate.js';

function setUsers(users, currentUserId) {
  // game.users must be iterable (Foundry Collection); array works for Array.from.
  global.game.users = users;
  global.game.user  = users.find(u => u.id === currentUserId) ?? null;
}

beforeEach(() => {
  // Restore between tests
  global.game.users = [];
  global.game.user  = null;
});

describe('isCanonicalGM', () => {
  it('returns false when current user is not a GM', () => {
    setUsers([
      { id: 'p1', isGM: false, active: true },
      { id: 'g1', isGM: true,  active: true },
    ], 'p1');
    expect(isCanonicalGM()).toBe(false);
  });

  it('returns true for a solo GM', () => {
    setUsers([
      { id: 'g1', isGM: true,  active: true },
      { id: 'p1', isGM: false, active: true },
    ], 'g1');
    expect(isCanonicalGM()).toBe(true);
  });

  it('returns true only for the lowest-id active GM when multiple GMs are online', () => {
    const users = [
      { id: 'a-gm', isGM: true, active: true },   // lowest id alphabetically
      { id: 'b-gm', isGM: true, active: true },
      { id: 'p1',   isGM: false, active: true },
    ];
    setUsers(users, 'a-gm');
    expect(isCanonicalGM()).toBe(true);

    setUsers(users, 'b-gm');
    expect(isCanonicalGM()).toBe(false);
  });

  it('ignores inactive GMs when picking the canonical', () => {
    // Lowest-id GM is offline → next-lowest wins.
    const users = [
      { id: 'a-gm', isGM: true, active: false },  // offline
      { id: 'b-gm', isGM: true, active: true  },
    ];
    setUsers(users, 'b-gm');
    expect(isCanonicalGM()).toBe(true);
  });

  it('returns false when no GM is active (avoids player-client trying to run pipeline)', () => {
    // The choice here is critical: rather than letting a player-only session
    // run the pipeline and hit permission errors, we pause until a GM
    // reconnects. The user already saw what happens when a non-GM tries
    // to write campaignState.
    const users = [
      { id: 'g1', isGM: true,  active: false },
      { id: 'p1', isGM: false, active: true  },
    ];
    setUsers(users, 'p1');
    expect(isCanonicalGM()).toBe(false);
  });

  it('survives missing game.users gracefully', () => {
    global.game.users = undefined;
    global.game.user  = { isGM: true };
    expect(isCanonicalGM()).toBe(false);
  });
});
