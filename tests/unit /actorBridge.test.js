/**
 * STARFORGED COMPANION
 * tests/unit/actorBridge.test.js
 *
 * Unit tests for src/character/actorBridge.js
 * All Actor documents are mocked via makeTestActor (defined in tests/setup.js).
 */

import {
  getPlayerActors,
  getActor,
  readCharacterSnapshot,
  readDebilities,
  applyMeterChanges,
  setDebility,
  awardXP,
  invalidateActorCache,
} from '../../src/character/actorBridge.js';


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function freshActor(overrides = {}) {
  const actor = makeTestActor(overrides);
  // Ensure the cache is clear for this actor before each test
  invalidateActorCache(actor.id);
  return actor;
}

beforeEach(() => {
  game.actors._reset();
  game.user.character = null;
});


// ─────────────────────────────────────────────────────────────────────────────
// getPlayerActors
// ─────────────────────────────────────────────────────────────────────────────

describe('getPlayerActors', () => {
  it('returns all player-owned character actors', () => {
    const a1 = makeTestActor({ id: 'a1', type: 'character', hasPlayerOwner: true });
    const a2 = makeTestActor({ id: 'a2', type: 'character', hasPlayerOwner: true });
    const gm = makeTestActor({ id: 'gm', type: 'character', hasPlayerOwner: false });
    game.actors._setAll([a1, a2, gm]);

    const result = getPlayerActors();
    expect(result).toHaveLength(2);
    expect(result.map(a => a.id)).toContain('a1');
    expect(result.map(a => a.id)).toContain('a2');
  });

  it('excludes non-character actors', () => {
    const pc  = makeTestActor({ id: 'pc',  type: 'character', hasPlayerOwner: true });
    const npc = makeTestActor({ id: 'npc', type: 'npc',       hasPlayerOwner: true });
    game.actors._setAll([pc, npc]);

    expect(getPlayerActors()).toHaveLength(1);
    expect(getPlayerActors()[0].id).toBe('pc');
  });

  it('returns empty array when no actors exist', () => {
    expect(getPlayerActors()).toEqual([]);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// getActor
// ─────────────────────────────────────────────────────────────────────────────

describe('getActor', () => {
  it('returns actor by explicit id', () => {
    const actor = makeTestActor({ id: 'x1' });
    game.actors._set('x1', actor);

    expect(getActor('x1')).toBe(actor);
  });

  it('returns game.user.character when no id given', () => {
    const actor = makeTestActor({ id: 'x2' });
    game.user.character = actor;

    expect(getActor()).toBe(actor);
  });

  it('returns null for unknown id', () => {
    expect(getActor('no-such-id')).toBeNull();
  });

  it('returns null when no id and user has no character', () => {
    game.user.character = null;
    expect(getActor()).toBeNull();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// readCharacterSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe('readCharacterSnapshot', () => {
  it('returns all stats and meters', () => {
    const actor = freshActor({
      system: {
        stats: { edge: 1, heart: 2, iron: 3, shadow: 4, wits: 2 },
        meters: {
          health:   { value: 4, max: 5 },
          spirit:   { value: 3, max: 5 },
          supply:   { value: 2, max: 5 },
          momentum: { value: 5, max: 10, reset: 2 },
        },
      },
    });

    const snap = readCharacterSnapshot(actor);
    expect(snap.stats).toEqual({ edge: 1, heart: 2, iron: 3, shadow: 4, wits: 2 });
    expect(snap.meters.health).toBe(4);
    expect(snap.meters.spirit).toBe(3);
    expect(snap.meters.supply).toBe(2);
    expect(snap.meters.momentum).toBe(5);
  });

  it('returns debilities as flat boolean map', () => {
    const actor = freshActor({
      system: { debilities: { wounded: true, shaken: false } },
    });
    const snap = readCharacterSnapshot(actor);
    expect(snap.debilities.wounded).toBe(true);
    expect(snap.debilities.shaken).toBe(false);
  });

  it('handles missing system fields gracefully', () => {
    const actor = { id: 'empty', name: 'Empty', type: 'character', hasPlayerOwner: true, system: {} };
    invalidateActorCache('empty');
    const snap = readCharacterSnapshot(actor);
    expect(snap.stats.edge).toBe(0);
    expect(snap.meters.health).toBe(0);
  });

  it('returns null for null actor', () => {
    expect(readCharacterSnapshot(null)).toBeNull();
  });

  it('calculates momentumMax from condition debility count', () => {
    const actor = freshActor({
      system: { debilities: { wounded: true, shaken: true } },
    });
    const snap = readCharacterSnapshot(actor);
    expect(snap.momentumMax).toBe(8); // 10 - 2
  });

  it('calculates momentumReset correctly (0 - debility count, min -2)', () => {
    const actor = freshActor({
      system: { debilities: { wounded: true, shaken: true, unprepared: true } },
    });
    const snap = readCharacterSnapshot(actor);
    expect(snap.momentumReset).toBe(-2); // max(-2, -3) = -2
  });

  it('momentumReset is 0 when no condition debilities', () => {
    const actor = freshActor();
    const snap  = readCharacterSnapshot(actor);
    expect(snap.momentumReset).toBe(0); // max(-2, 0)
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// readDebilities
// ─────────────────────────────────────────────────────────────────────────────

describe('readDebilities', () => {
  it('returns all debility keys as booleans', () => {
    const actor = freshActor({ system: { debilities: { wounded: true, cursed: true } } });
    const debs  = readDebilities(actor);

    expect(debs.wounded).toBe(true);
    expect(debs.cursed).toBe(true);
    expect(debs.shaken).toBe(false);
    expect(debs.maimed).toBe(false);
  });

  it('coerces truthy values to boolean', () => {
    const actor = { id: 'coerce', name: 'X', type: 'character', hasPlayerOwner: true,
      system: { debilities: { wounded: 1, shaken: 0 } } };
    invalidateActorCache('coerce');
    const debs = readDebilities(actor);
    expect(debs.wounded).toBe(true);
    expect(debs.shaken).toBe(false);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// applyMeterChanges
// ─────────────────────────────────────────────────────────────────────────────

describe('applyMeterChanges', () => {
  it('clamps health to 0–5 for undebilitated actor', async () => {
    const actor = freshActor({ system: { meters: { health: { value: 5, max: 5 } } } });
    await applyMeterChanges(actor, { health: 3 });
    const update = actor._updateHistory[0];
    expect(update['system.meters.health.value']).toBe(5); // capped at 5
  });

  it('applies negative health change', async () => {
    const actor = freshActor({ system: { meters: { health: { value: 5, max: 5 } } } });
    await applyMeterChanges(actor, { health: -2 });
    expect(actor._updateHistory[0]['system.meters.health.value']).toBe(3);
  });

  it('clamps health to 4 max when wounded is active', async () => {
    const actor = freshActor({
      system: {
        meters: { health: { value: 5, max: 5 } },
        debilities: { wounded: true },
      },
    });
    await applyMeterChanges(actor, { health: 0 }); // no change, but clamp applied
    // health stays at 5 but delta is 0, so no update written
    // Apply +1 to a wounded character at health 4 — should stay at 4
    const actor2 = freshActor({
      system: {
        meters: { health: { value: 4, max: 5 } },
        debilities: { wounded: true },
      },
    });
    await applyMeterChanges(actor2, { health: 2 });
    expect(actor2._updateHistory[0]['system.meters.health.value']).toBe(4);
  });

  it('clamps spirit to 3 max when shaken', async () => {
    const actor = freshActor({
      system: {
        meters: { spirit: { value: 3, max: 5 } },
        debilities: { shaken: true },
      },
    });
    await applyMeterChanges(actor, { spirit: 3 });
    expect(actor._updateHistory[0]['system.meters.spirit.value']).toBe(3);
  });

  it('clamps supply to 0–5', async () => {
    const actor = freshActor({ system: { meters: { supply: { value: 1, max: 5 } } } });
    await applyMeterChanges(actor, { supply: -5 });
    expect(actor._updateHistory[0]['system.meters.supply.value']).toBe(0);
  });

  it('clamps momentum to momentumReset–momentumMax', async () => {
    // With 2 condition debilities: max = 8, reset = -2
    const actor = freshActor({
      system: {
        meters: { momentum: { value: 2, max: 10, reset: 2 } },
        debilities: { wounded: true, shaken: true },
      },
    });
    // Try to set momentum to +20 (above max)
    await applyMeterChanges(actor, { momentum: 20 });
    expect(actor._updateHistory[0]['system.meters.momentum.value']).toBe(8);
  });

  it('reduces momentumMax by 1 per active condition debility', async () => {
    const actor = freshActor({
      system: {
        meters: { momentum: { value: 2, max: 10, reset: 2 } },
        debilities: { wounded: true, shaken: true, unprepared: true },
      },
    });
    await applyMeterChanges(actor, { momentum: 1 });
    expect(actor._updateHistory[0]['system.meters.momentum.max']).toBe(7);
  });

  it('does not call actor.update() if no changes', async () => {
    const actor = freshActor({ system: { meters: { health: { value: 5, max: 5 } } } });
    await applyMeterChanges(actor, { health: 0 });
    expect(actor._updateHistory).toHaveLength(0);
  });

  it('does not throw if actor is null', async () => {
    await expect(applyMeterChanges(null, { health: -1 })).resolves.toBeUndefined();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// setDebility
// ─────────────────────────────────────────────────────────────────────────────

describe('setDebility', () => {
  it('sets debility flag on actor', async () => {
    const actor = freshActor();
    await setDebility(actor, 'wounded', true);
    expect(actor._updateHistory[0]['system.debilities.wounded']).toBe(true);
  });

  it('triggers momentum recalculation for condition debilities', async () => {
    const actor = freshActor({
      system: {
        meters: { momentum: { value: 9, max: 10, reset: 2 } },
      },
    });
    await setDebility(actor, 'wounded', true);
    // Should have two updates: one for debility, one for momentum recalc
    expect(actor._updateHistory.length).toBeGreaterThanOrEqual(2);
  });

  it('does not throw if actor is null', async () => {
    await expect(setDebility(null, 'wounded', true)).resolves.toBeUndefined();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// awardXP
// ─────────────────────────────────────────────────────────────────────────────

describe('awardXP', () => {
  it('increments xp.value on actor', async () => {
    const actor = freshActor({ system: { xp: { value: 4, max: 30 } } });
    await awardXP(actor, 2);
    expect(actor._updateHistory[0]['system.xp.value']).toBe(6);
  });

  it('does not exceed xp.max', async () => {
    const actor = freshActor({ system: { xp: { value: 28, max: 30 } } });
    await awardXP(actor, 5);
    expect(actor._updateHistory[0]['system.xp.value']).toBe(30);
  });

  it('does not call update if amount is zero or negative', async () => {
    const actor = freshActor();
    await awardXP(actor, 0);
    await awardXP(actor, -1);
    expect(actor._updateHistory).toHaveLength(0);
  });

  it('does not throw if actor is null', async () => {
    await expect(awardXP(null, 2)).resolves.toBeUndefined();
  });
});
