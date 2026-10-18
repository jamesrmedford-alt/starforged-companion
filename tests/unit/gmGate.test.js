/**
 * STARFORGED COMPANION
 * tests/unit/gmGate.test.js
 *
 * Coverage for isCanonicalGM() — the single-emitter gate that prevents
 * every connected client from running the move pipeline.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isCanonicalGM, hasKeyedActiveGM, advertiseClaudeKeyPresence } from '../../src/multiplayer/gmGate.js';

function setUsers(users, currentUserId) {
  // game.users must be iterable (Foundry Collection); array works for Array.from.
  global.game.users = users;
  global.game.user  = users.find(u => u.id === currentUserId) ?? null;
}

beforeEach(() => {
  // Restore between tests
  global.game.users = [];
  global.game.user  = null;
  global.game.settings._store.clear();   // empty keyed-GM registry by default
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

describe('isCanonicalGM — keyed-GM routing', () => {
  const M = 'starforged-companion';
  const setKeyed = (ids) => global.game.settings._store.set(`${M}.keyedGmUserIds`, ids);

  it('prefers a keyed GM over a lower-id keyless GM (the promoted-player regression)', () => {
    // 'a-gm' sorts lowest but has no key; 'b-gm' holds the key. The keyed GM
    // must be the emitter — otherwise every move fails "API key not configured".
    const users = [
      { id: 'a-gm', isGM: true,  active: true },  // no key
      { id: 'b-gm', isGM: true,  active: true },  // has key
      { id: 'p1',   isGM: false, active: true },
    ];
    setKeyed(['b-gm']);

    setUsers(users, 'b-gm');
    expect(isCanonicalGM()).toBe(true);

    setUsers(users, 'a-gm');
    expect(isCanonicalGM()).toBe(false);
  });

  it('picks the lowest-id GM among multiple keyed GMs', () => {
    const users = [
      { id: 'a-gm', isGM: true, active: true },
      { id: 'b-gm', isGM: true, active: true },
    ];
    setKeyed(['a-gm', 'b-gm']);

    setUsers(users, 'a-gm');
    expect(isCanonicalGM()).toBe(true);
    setUsers(users, 'b-gm');
    expect(isCanonicalGM()).toBe(false);
  });

  it('falls back to the lowest active GM when no active GM is keyed', () => {
    // Registry names an offline GM only → no keyed GM online → old behaviour.
    const users = [
      { id: 'a-gm', isGM: true, active: true },
      { id: 'b-gm', isGM: true, active: true },
    ];
    setKeyed(['offline-gm']);
    setUsers(users, 'a-gm');
    expect(isCanonicalGM()).toBe(true);
  });

  it('falls back to the lowest active GM when the registry is empty', () => {
    const users = [
      { id: 'a-gm', isGM: true, active: true },
      { id: 'b-gm', isGM: true, active: true },
    ];
    setUsers(users, 'a-gm');
    expect(isCanonicalGM()).toBe(true);
  });

  it('ignores a keyed GM that is offline', () => {
    // 'a-gm' is keyed but offline; active keyed 'b-gm' wins over keyless 'c-gm'.
    const users = [
      { id: 'a-gm', isGM: true, active: false },  // keyed but offline
      { id: 'b-gm', isGM: true, active: true  },  // keyed, online
      { id: 'c-gm', isGM: true, active: true  },  // keyless
    ];
    setKeyed(['a-gm', 'b-gm']);

    setUsers(users, 'b-gm');
    expect(isCanonicalGM()).toBe(true);
    setUsers(users, 'c-gm');
    expect(isCanonicalGM()).toBe(false);
  });
});

describe('advertiseClaudeKeyPresence', () => {
  const M = 'starforged-companion';
  const getKeyed = () => global.game.settings._store.get(`${M}.keyedGmUserIds`);

  it('adds this GM to the registry when it holds a key', async () => {
    global.game.user = { isGM: true, id: 'gm1' };
    global.game.settings._store.set(`${M}.claudeApiKey`, 'sk-ant-xxx');
    await advertiseClaudeKeyPresence();
    expect(getKeyed()).toEqual(['gm1']);
  });

  it('removes this GM from the registry when it has no key', async () => {
    global.game.user = { isGM: true, id: 'gm1' };
    global.game.settings._store.set(`${M}.keyedGmUserIds`, ['gm1', 'gm2']);
    global.game.settings._store.set(`${M}.claudeApiKey`, '');
    await advertiseClaudeKeyPresence();
    expect(getKeyed()).toEqual(['gm2']);
  });

  it('does not write when membership is already correct (no redundant world write)', async () => {
    global.game.user = { isGM: true, id: 'gm1' };
    global.game.settings._store.set(`${M}.keyedGmUserIds`, ['gm1']);
    global.game.settings._store.set(`${M}.claudeApiKey`, 'sk-ant-xxx');
    const spy = vi.spyOn(global.game.settings, 'set');
    await advertiseClaudeKeyPresence();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('is a no-op for a non-GM client (never writes world state)', async () => {
    global.game.user = { isGM: false, id: 'p1' };
    global.game.settings._store.set(`${M}.claudeApiKey`, 'sk-ant-player');
    await advertiseClaudeKeyPresence();
    expect(getKeyed()).toBeUndefined();
  });
});

describe('hasKeyedActiveGM — the RUN_ON.CLAUDE / oracle follow-up routing predicate', () => {
  const KEY = 'starforged-companion.keyedGmUserIds';

  it('is false when the keyed-GM registry is empty or missing', () => {
    setUsers([{ id: 'g1', isGM: true, active: true }], 'g1');
    expect(hasKeyedActiveGM()).toBe(false);
    global.game.settings._store.set(KEY, []);
    expect(hasKeyedActiveGM()).toBe(false);
  });

  it('is true when an active GM is in the registry — on every client alike', () => {
    const users = [
      { id: 'g1', isGM: true,  active: true },
      { id: 'p1', isGM: false, active: true },
    ];
    global.game.settings._store.set(KEY, ['g1']);
    setUsers(users, 'p1');
    expect(hasKeyedActiveGM()).toBe(true);
    setUsers(users, 'g1');
    expect(hasKeyedActiveGM()).toBe(true);
  });

  it('ignores a keyed GM that is not connected', () => {
    global.game.settings._store.set(KEY, ['g1']);
    setUsers([
      { id: 'g1', isGM: true,  active: false },
      { id: 'g2', isGM: true,  active: true },
      { id: 'p1', isGM: false, active: true },
    ], 'p1');
    expect(hasKeyedActiveGM()).toBe(false);
  });

  it('ignores a registry id that belongs to a (demoted) player', () => {
    global.game.settings._store.set(KEY, ['p1']);
    setUsers([
      { id: 'g1', isGM: true,  active: true },
      { id: 'p1', isGM: false, active: true },
    ], 'p1');
    expect(hasKeyedActiveGM()).toBe(false);
  });

  it('agrees with isCanonicalGM: when true, the canonical GM is a keyed GM', () => {
    global.game.settings._store.set(KEY, ['z-gm']);
    const users = [
      { id: 'a-gm', isGM: true, active: true },
      { id: 'z-gm', isGM: true, active: true },
    ];
    setUsers(users, 'z-gm');
    expect(hasKeyedActiveGM()).toBe(true);
    expect(isCanonicalGM()).toBe(true);
    setUsers(users, 'a-gm');
    expect(isCanonicalGM()).toBe(false);
  });

  it('warns and returns false when the registry read throws', () => {
    setUsers([{ id: 'g1', isGM: true, active: true }], 'g1');
    const get = vi.spyOn(global.game.settings, 'get').mockImplementation(() => { throw new Error('not registered'); });
    expect(hasKeyedActiveGM()).toBe(false);
    expect(getCapturedWarns().some(w => /hasKeyedActiveGM: keyed-GM registry read failed/.test(w))).toBe(true);
    get.mockRestore();
  });
});
