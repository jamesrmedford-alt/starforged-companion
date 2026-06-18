/**
 * STARFORGED COMPANION
 * tests/unit/combatTracker.test.js
 *
 * Combat Tracker Integration — pure-logic tests for the functions that do not
 * require a live Foundry instance. The Foundry-side Combat/Combatant interaction
 * is tested via mocks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  trackPosToActorPos,
  findCombatForTrack,
  enterCombatTracker,
  endCombatTracker,
  updateCombatantPosition,
} from '../../src/moves/combatTracker.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeCombat(trackId = 'track-1', combatants = []) {
  const flags = { 'starforged-companion': { trackId } };
  return {
    id: `combat-${trackId}`,
    getFlag: (mod, key) => flags[mod]?.[key] ?? null,
    setFlag: vi.fn(async (mod, key, val) => { flags[mod] ??= {}; flags[mod][key] = val; }),
    delete:  vi.fn(async () => {}),
    createEmbeddedDocuments: vi.fn(async () => []),
    combatants: {
      find: (fn) => combatants.find(fn) ?? null,
      [Symbol.iterator]: () => combatants[Symbol.iterator](),
    },
  };
}

function makeCombatant(actorId, existingFlags = {}) {
  const flags = { 'starforged-companion': existingFlags };
  return {
    id:      `cmbt-${actorId}`,
    actorId,
    actor:   null,
    getFlag: (mod, key) => flags[mod]?.[key] ?? null,
    setFlag: vi.fn(async (mod, key, val) => { flags[mod] ??= {}; flags[mod][key] = val; }),
  };
}

function makeActor(id, name = 'Test Character') {
  return { id, name };
}

// Seed game.combats before each test
function seedCombats(list) {
  global.game.combats = {
    find: (fn) => list.find(fn) ?? null,
    [Symbol.iterator]: () => list[Symbol.iterator](),
  };
}

// ─── trackPosToActorPos ───────────────────────────────────────────────────────

describe('trackPosToActorPos', () => {
  it('converts in_control → inControl', () => {
    expect(trackPosToActorPos('in_control')).toBe('inControl');
  });
  it('converts bad_spot → inABadSpot', () => {
    expect(trackPosToActorPos('bad_spot')).toBe('inABadSpot');
  });
  it('returns none for null', () => {
    expect(trackPosToActorPos(null)).toBe('none');
  });
  it('returns none for unknown strings', () => {
    expect(trackPosToActorPos('flying')).toBe('none');
    expect(trackPosToActorPos('')).toBe('none');
  });
});

// ─── findCombatForTrack ──────────────────────────────────────────────────────

describe('findCombatForTrack', () => {
  beforeEach(() => {
    seedCombats([]);
  });

  it('returns null when combats is empty', () => {
    expect(findCombatForTrack('track-1')).toBeNull();
  });

  it('finds a combat by trackId flag', () => {
    const c = makeCombat('track-42');
    seedCombats([c]);
    expect(findCombatForTrack('track-42')).toBe(c);
  });

  it('returns null when trackId does not match', () => {
    seedCombats([makeCombat('track-1')]);
    expect(findCombatForTrack('track-99')).toBeNull();
  });
});

// ─── enterCombatTracker ──────────────────────────────────────────────────────

describe('enterCombatTracker', () => {
  let createdCombats;

  beforeEach(() => {
    createdCombats = [];
    seedCombats(createdCombats);

    global.game.settings._store.set('starforged-companion.combatTrackerEnabled', true);

    global.Combat = {
      create: vi.fn(async (data) => {
        const c = makeCombat(`new-${createdCombats.length}`);
        c.setFlag = vi.fn(async (mod, key, val) => {
          if (mod === 'starforged-companion' && key === 'trackId') {
            // make findCombatForTrack work after the flag is set
            createdCombats.push(c);
          }
        });
        return c;
      }),
    };
  });

  it('returns null when setting is disabled', async () => {
    global.game.settings._store.set('starforged-companion.combatTrackerEnabled', false);
    const result = await enterCombatTracker('track-1', []);
    expect(result).toBeNull();
    expect(global.Combat.create).not.toHaveBeenCalled();
  });

  it('creates a Combat document and sets the trackId flag', async () => {
    const actor = makeActor('actor-1');
    const result = await enterCombatTracker('track-1', [actor]);
    expect(global.Combat.create).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result.setFlag).toHaveBeenCalledWith('starforged-companion', 'trackId', 'track-1');
  });

  it('creates Combatant records for provided actors', async () => {
    const actor = makeActor('actor-1', 'Rylas');
    // Provide a combat with createEmbeddedDocuments stub
    const stubCombat = makeCombat('track-2');
    global.Combat.create = vi.fn(async () => stubCombat);

    await enterCombatTracker('track-2', [actor]);

    expect(stubCombat.createEmbeddedDocuments).toHaveBeenCalledWith(
      'Combatant',
      expect.arrayContaining([
        expect.objectContaining({ actorId: 'actor-1', name: 'Rylas' }),
      ]),
    );
  });

  it('is idempotent — returns existing combat without creating a new one', async () => {
    const existing = makeCombat('track-3');
    seedCombats([existing]);

    const result = await enterCombatTracker('track-3', [makeActor('actor-1')]);
    expect(global.Combat.create).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it('no-ops gracefully when Combat.create is unavailable', async () => {
    delete global.Combat;
    const result = await enterCombatTracker('track-5', [makeActor('actor-1')]);
    expect(result).toBeNull();
  });
});

// ─── endCombatTracker ────────────────────────────────────────────────────────

describe('endCombatTracker', () => {
  beforeEach(() => {
    global.game.settings._store.set('starforged-companion.combatTrackerEnabled', true);
  });

  it('deletes the linked combat document', async () => {
    const c = makeCombat('track-end');
    seedCombats([c]);
    await endCombatTracker('track-end');
    expect(c.delete).toHaveBeenCalledOnce();
  });

  it('no-ops when no combat is linked', async () => {
    seedCombats([]);
    await expect(endCombatTracker('track-none')).resolves.toBeUndefined();
  });

  it('no-ops when setting is disabled', async () => {
    global.game.settings._store.set('starforged-companion.combatTrackerEnabled', false);
    const c = makeCombat('track-dis');
    seedCombats([c]);
    await endCombatTracker('track-dis');
    expect(c.delete).not.toHaveBeenCalled();
  });
});

// ─── updateCombatantPosition ─────────────────────────────────────────────────

describe('updateCombatantPosition', () => {
  it('sets the position flag on the matching combatant', async () => {
    const combatant = makeCombatant('actor-1');
    const combat = makeCombat('track-pos', [combatant]);
    const actor = makeActor('actor-1');

    await updateCombatantPosition(combat, actor, 'inControl');
    expect(combatant.setFlag).toHaveBeenCalledWith('starforged-companion', 'position', 'inControl');
  });

  it('no-ops when combat is null', async () => {
    await expect(updateCombatantPosition(null, makeActor('a1'), 'inControl')).resolves.toBeUndefined();
  });

  it('no-ops when actor is null', async () => {
    const combat = makeCombat('track-pos', []);
    await expect(updateCombatantPosition(combat, null, 'inControl')).resolves.toBeUndefined();
  });

  it('no-ops silently when actor is not in the combat', async () => {
    const combat = makeCombat('track-pos', [makeCombatant('actor-X')]);
    // actor-Y is not in the combat
    await expect(updateCombatantPosition(combat, makeActor('actor-Y'), 'inABadSpot')).resolves.toBeUndefined();
  });
});
