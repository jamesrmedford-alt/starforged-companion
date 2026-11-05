/**
 * STARFORGED COMPANION
 * tests/unit/moveLockStoreOwned.test.js
 *
 * LOCK-RESURRECTED-BY-COGM-STALE-WRITE (found while fixing issue #335 Y07) —
 * the move lock's fields (`pendingMove`, `pendingMoveBy`, `pendingMoveClaim`)
 * are written by the lock's own paths only: the pipeline's claim and release,
 * the W25 handover, the ready reset. Every other campaignState writer takes
 * them from the store. The audit of the writers found two that wrote them
 * from a copy they held: the `!roll` force's spend (the pipeline's whole
 * working copy) and `!migrate-entities` (a snapshot held across its awaits) —
 * either could carry a released lock back, or drop a claim made meanwhile.
 * (A co-GM's store lagging the world by a delivery is the other half, which no
 * writer can see: tests/unit/readyResetLiveLock.test.js.)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { consumeForceMove } from '../../src/pacing/router.js';
import { handleMigrateEntitiesCommand } from '../../src/entities/migrator.js';
import { _resetFolderCache } from '../../src/entities/folder.js';

const MODULE = 'starforged-companion';
const KEY = `${MODULE}.campaignState`;
const stored = () => game.settings._store.get(KEY);

describe("the !roll force's spend writes onto the store", () => {
  beforeEach(() => { game.settings._store.clear(); });

  it("keeps the store's lock — and what landed since — not the working copy's", async () => {
    // The pipeline's working copy, from its claim; the store has moved on since:
    // that move's lock is another claim's now, and a safety flag landed.
    const working = {
      pendingMove: true, pendingMoveBy: 'gm-1', pendingMoveClaim: 'old-claim',
      pacing: { forceNextAsMove: true, sceneOverride: null }, safetyFlags: [],
    };
    game.settings._store.set(KEY, {
      ...working, pendingMoveBy: 'gm-2', pendingMoveClaim: 'live-claim',
      safetyFlags: [{ _id: 'f1', text: 'slow down' }],
    });

    await consumeForceMove(working);

    expect(stored().pendingMove).toBe(true);
    expect(stored().pendingMoveBy).toBe('gm-2');             // the store's lock stands
    expect(stored().pendingMoveClaim).toBe('live-claim');
    expect(stored().safetyFlags).toEqual([{ _id: 'f1', text: 'slow down' }]);
    expect(stored().pacing.forceNextAsMove).toBe(false);     // the force is spent …
    expect(working.pacing.forceNextAsMove).toBe(false);      // … on the working copy too
  });

  it("a lock released since stays released", async () => {
    const working = { pendingMove: true, pendingMoveBy: 'gm-1', pendingMoveClaim: 'c1', pacing: { forceNextAsMove: true } };
    game.settings._store.set(KEY, { ...working, pendingMove: false, pendingMoveBy: null, pendingMoveClaim: null });

    await consumeForceMove(working);

    expect(stored().pendingMove).toBe(false);
    expect(stored().pendingMoveClaim).toBeNull();
    expect(stored().pacing.forceNextAsMove).toBe(false);
  });
});

describe('!migrate-entities writes the lock the store holds, not its snapshot', () => {
  let state;
  let onSetFlag;

  function legacyShipJournal(id, ship) {
    const flags = { [MODULE]: {} };
    const pageFlags = { [MODULE]: { ship } };
    return {
      id, name: ship.name, flags,
      pages: { contents: [{ flags: pageFlags, getFlag: (mod, key) => pageFlags?.[mod]?.[key] }] },
      setFlag: async (mod, key, val) => { flags[mod] ??= {}; flags[mod][key] = val; await onSetFlag?.(); },
    };
  }

  beforeEach(() => {
    game.actors._reset();
    game.folders._reset();
    _resetFolderCache();
    const items = [];
    game.journal = {
      get: (id) => items.find(j => j.id === id) ?? null,
      find: (fn) => items.find(fn) ?? null,
      [Symbol.iterator]() { return items[Symbol.iterator](); },
      _add: (j) => items.push(j),
    };
    // The setting as Foundry keeps it: `get` hands back the stored object, and
    // a write replaces it.
    state = { shipIds: ['j-ship'], pendingMove: true, pendingMoveBy: 'gm-1', pendingMoveClaim: 'c1' };
    game.settings.get = (mod, key) => (key === 'campaignState' ? state : null);
    game.settings.set = async (mod, key, val) => { if (key === 'campaignState') state = val; return val; };
    game.users = { filter: () => [], get: () => null };
    globalThis.ChatMessage = { create: async () => null };
    onSetFlag = null;
  });

  it('a move that released its lock during the migration keeps it released', async () => {
    game.journal._add(legacyShipJournal('j-ship', { _id: 's1', name: 'Tantive' }));
    // Mid-migration, the pipeline's release lands: a new stored object.
    onSetFlag = async () => { state = { ...state, pendingMove: false, pendingMoveBy: null, pendingMoveClaim: null }; };

    await handleMigrateEntitiesCommand({ content: '!migrate-entities', author: { isGM: true } });

    const ship = game.actors.find(a => a.type === 'starship');
    expect(state.shipIds).toEqual([ship.id]);                 // the migration's own write landed …
    expect(state.pendingMove).toBe(false);                    // … and left the lock released
    expect(state.pendingMoveBy).toBeNull();
    expect(state.pendingMoveClaim).toBeNull();
  });

  it('a move that claimed the lock during the migration keeps its claim', async () => {
    state = { ...state, pendingMove: false, pendingMoveBy: null, pendingMoveClaim: null };
    game.journal._add(legacyShipJournal('j-ship', { _id: 's1', name: 'Tantive' }));
    onSetFlag = async () => { state = { ...state, pendingMove: true, pendingMoveBy: 'gm-1', pendingMoveClaim: 'c2' }; };

    await handleMigrateEntitiesCommand({ content: '!migrate-entities', author: { isGM: true } });

    expect(state.pendingMove).toBe(true);
    expect(state.pendingMoveClaim).toBe('c2');
  });
});
