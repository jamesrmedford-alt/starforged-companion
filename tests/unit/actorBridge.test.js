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
  readAssets,
  applyMeterChanges,
  setDebility,
  awardXP,
  invalidateActorCache,
  createCharacterBondItem,
  createCharacterVowItem,
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

  // Regression for v1.2.12: in solo-GM play there are no non-GM users, so
  // every character.hasPlayerOwner is false. Without the fallback the recap
  // pipeline + assembler CHARACTER STATE both silently no-op'd in solo
  // play — the user's primary use case. The fallback must NOT include
  // non-character actors (NPCs / foes / starships) regardless.
  it('falls back to all character-type actors when none are player-owned (solo GM)', () => {
    const c1 = makeTestActor({ id: 'c1', type: 'character', hasPlayerOwner: false });
    const c2 = makeTestActor({ id: 'c2', type: 'character', hasPlayerOwner: false });
    game.actors._setAll([c1, c2]);

    const result = getPlayerActors();
    expect(result).toHaveLength(2);
    expect(result.map(a => a.id).sort()).toEqual(['c1', 'c2']);
  });

  it('fallback never includes non-character actors', () => {
    const c   = makeTestActor({ id: 'c',   type: 'character', hasPlayerOwner: false });
    const npc = makeTestActor({ id: 'npc', type: 'npc',       hasPlayerOwner: false });
    const ship = makeTestActor({ id: 'ship', type: 'starship', hasPlayerOwner: false });
    game.actors._setAll([c, npc, ship]);

    const result = getPlayerActors();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c');
  });

  it('prefers player-owned characters when any exist (multi-user game)', () => {
    const owned   = makeTestActor({ id: 'owned',   type: 'character', hasPlayerOwner: true });
    const orphan  = makeTestActor({ id: 'orphan',  type: 'character', hasPlayerOwner: false });
    game.actors._setAll([owned, orphan]);

    const result = getPlayerActors();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('owned');
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
        edge: 1, heart: 2, iron: 3, shadow: 4, wits: 2,
        health:   { value: 4, max: 5 },
        spirit:   { value: 3, max: 5 },
        supply:   { value: 2, max: 5 },
        momentum: { value: 5, max: 10, resetValue: 2 },
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
      system: { debility: { wounded: true, shaken: false } },
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
      system: { debility: { wounded: true, shaken: true } },
    });
    const snap = readCharacterSnapshot(actor);
    expect(snap.momentumMax).toBe(8); // 10 - 2
  });

  it('calculates momentumReset correctly per play kit: 2+ impacts → 0', () => {
    const actor = freshActor({
      system: { debility: { wounded: true, shaken: true, unprepared: true } },
    });
    const snap = readCharacterSnapshot(actor);
    expect(snap.momentumReset).toBe(0); // max(0, 2-3) = 0
  });

  it('momentumReset is +2 with no impacts', () => {
    const actor = freshActor();
    const snap  = readCharacterSnapshot(actor);
    expect(snap.momentumReset).toBe(2); // max(0, 2-0) = 2
  });

  it('momentumReset is +1 with exactly one impact', () => {
    const actor = freshActor({ system: { debility: { wounded: true } } });
    const snap = readCharacterSnapshot(actor);
    expect(snap.momentumReset).toBe(1); // max(0, 2-1) = 1
  });

  it('counts non-condition impacts toward momentum bounds (battered, doomed, etc.)', () => {
    const actor = freshActor({
      system: { debility: { battered: true, doomed: true } },
    });
    const snap = readCharacterSnapshot(actor);
    expect(snap.momentumMax).toBe(8);   // 10 - 2
    expect(snap.momentumReset).toBe(0); // max(0, 2-2)
  });

  it('prefers vendor-system computed getters when present', () => {
    const actor = freshActor({
      system: {
        momentumMax:   6,   // computed getter from vendor schema
        momentumReset: -1,  // computed getter from vendor schema (different floor)
        debility: { wounded: true },
      },
    });
    const snap = readCharacterSnapshot(actor);
    expect(snap.momentumMax).toBe(6);
    expect(snap.momentumReset).toBe(-1);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// readDebilities
// ─────────────────────────────────────────────────────────────────────────────

describe('readDebilities', () => {
  it('returns all debility keys as booleans', () => {
    const actor = freshActor({ system: { debility: { wounded: true, cursed: true } } });
    const debs  = readDebilities(actor);

    expect(debs.wounded).toBe(true);
    expect(debs.cursed).toBe(true);
    expect(debs.shaken).toBe(false);
    expect(debs.maimed).toBe(false);
  });

  it('coerces truthy values to boolean', () => {
    const actor = { id: 'coerce', name: 'X', type: 'character', hasPlayerOwner: true,
      system: { debility: { wounded: 1, shaken: 0 } } };
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
    const actor = freshActor({ system: { health: { value: 5, max: 5 } } });
    await applyMeterChanges(actor, { health: 3 });
    const update = actor._updateHistory[0];
    expect(update['system.health.value']).toBe(5); // capped at 5
  });

  it('applies negative health change', async () => {
    const actor = freshActor({ system: { health: { value: 5, max: 5 } } });
    await applyMeterChanges(actor, { health: -2 });
    expect(actor._updateHistory[0]['system.health.value']).toBe(3);
  });

  it('clamps health to 4 max when wounded is active', async () => {
    const actor = freshActor({
      system: {
        health: { value: 5, max: 5 },
        debility: { wounded: true },
      },
    });
    await applyMeterChanges(actor, { health: 0 }); // no change, but clamp applied
    // health stays at 5 but delta is 0, so no update written
    // Apply +1 to a wounded character at health 4 — should stay at 4
    const actor2 = freshActor({
      system: {
        health: { value: 4, max: 5 },
        debility: { wounded: true },
      },
    });
    await applyMeterChanges(actor2, { health: 2 });
    expect(actor2._updateHistory[0]['system.health.value']).toBe(4);
  });

  it('clamps spirit to 3 max when shaken', async () => {
    const actor = freshActor({
      system: {
        spirit: { value: 3, max: 5 },
        debility: { shaken: true },
      },
    });
    await applyMeterChanges(actor, { spirit: 3 });
    expect(actor._updateHistory[0]['system.spirit.value']).toBe(3);
  });

  it('clamps supply to 0–5', async () => {
    const actor = freshActor({ system: { supply: { value: 1, max: 5 } } });
    await applyMeterChanges(actor, { supply: -5 });
    expect(actor._updateHistory[0]['system.supply.value']).toBe(0);
  });

  it('clamps momentum to momentumReset–momentumMax', async () => {
    // With 2 impacts: max = 8, reset = 0
    const actor = freshActor({
      system: {
        momentum: { value: 2, max: 10, resetValue: 2 },
        debility: { wounded: true, shaken: true },
      },
    });
    // Try to set momentum to +20 (above max)
    await applyMeterChanges(actor, { momentum: 20 });
    expect(actor._updateHistory[0]['system.momentum.value']).toBe(8);
    expect(actor._updateHistory[0]['system.momentum.resetValue']).toBe(0);
  });

  it('reduces momentumMax by 1 per active impact (all categories count)', async () => {
    const actor = freshActor({
      system: {
        momentum: { value: 2, max: 10, resetValue: 2 },
        debility: { wounded: true, shaken: true, unprepared: true },
      },
    });
    await applyMeterChanges(actor, { momentum: 1 });
    expect(actor._updateHistory[0]['system.momentum.max']).toBe(7);
  });

  it('counts vehicle and burden impacts toward momentum max too', async () => {
    const actor = freshActor({
      system: {
        momentum: { value: 2, max: 10, resetValue: 2 },
        debility: { battered: true, doomed: true },
      },
    });
    await applyMeterChanges(actor, { momentum: 1 });
    expect(actor._updateHistory[0]['system.momentum.max']).toBe(8);
  });

  it('does not call actor.update() if no changes', async () => {
    const actor = freshActor({ system: { health: { value: 5, max: 5 } } });
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
    expect(actor._updateHistory[0]['system.debility.wounded']).toBe(true);
  });

  it('triggers momentum recalculation for condition debilities', async () => {
    const actor = freshActor({
      system: {
        momentum: { value: 9, max: 10, resetValue: 2 },
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
  it('increments xp on actor', async () => {
    const actor = freshActor({ system: { xp: 4 } });
    await awardXP(actor, 2);
    expect(actor._updateHistory[0]['system.xp']).toBe(6);
  });

  it('does not exceed xp max (30)', async () => {
    const actor = freshActor({ system: { xp: 28 } });
    await awardXP(actor, 5);
    expect(actor._updateHistory[0]['system.xp']).toBe(30);
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


// ─────────────────────────────────────────────────────────────────────────────
// readAssets
// ─────────────────────────────────────────────────────────────────────────────

describe('readAssets', () => {
  it('returns enabled-only abilities for asset-type items, stripping HTML', () => {
    const actor = freshActor({
      items: {
        contents: [
          {
            type:   'asset',
            name:   'Firebrand',
            system: {
              description: '<p>Path of fire.</p>',
              abilities: [
                { enabled: true,  text: '<p>Burn <em>everything</em>.</p>' },
                { enabled: false, text: '<p>Locked ability.</p>' },
              ],
            },
          },
          // non-asset items are ignored
          { type: 'progress', name: 'A vow', system: { subtype: 'vow' } },
        ],
      },
    });

    const out = readAssets(actor);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Firebrand');
    expect(out[0].description).toBe('Path of fire.');
    expect(out[0].abilities).toEqual(['Burn everything.']);
  });

  it('surfaces assets through readCharacterSnapshot', () => {
    const actor = freshActor({
      items: {
        contents: [
          {
            type: 'asset', name: 'Scoundrel',
            system: { abilities: [{ enabled: true, text: 'Bluff your way out.' }] },
          },
        ],
      },
    });
    const snap = readCharacterSnapshot(actor);
    expect(snap.assets).toHaveLength(1);
    expect(snap.assets[0].name).toBe('Scoundrel');
  });

  it('returns empty array when no asset items present', () => {
    const actor = freshActor();
    expect(readAssets(actor)).toEqual([]);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// createCharacterBondItem / createCharacterVowItem
// ─────────────────────────────────────────────────────────────────────────────

describe('createCharacterBondItem', () => {
  it('creates a progress Item with subtype "bond" on the actor', async () => {
    const actor = freshActor();
    const item = await createCharacterBondItem(actor, {
      name: 'Dr Chen', rank: 'dangerous', connectionId: 'conn1',
    });
    expect(item).not.toBeNull();
    expect(item.type).toBe('progress');
    expect(item.system.subtype).toBe('bond');
    expect(item.system.rank).toBe('dangerous');
    expect(item.name).toBe('Dr Chen');
    expect(actor.items.contents).toContain(item);
  });

  it('passes suppressLog:true to silence the ironsworn chat-alert hook', async () => {
    const actor = freshActor();
    const item = await createCharacterBondItem(actor, {
      name: 'Mae', connectionId: 'c1',
    });
    expect(item.__createOptions.suppressLog).toBe(true);
    expect(item.__createOptions.parent).toBe(actor);
  });

  it('falls back to a valid rank when given an invalid one', async () => {
    const actor = freshActor();
    const item = await createCharacterBondItem(actor, {
      name: 'X', rank: 'invalid', connectionId: 'c2',
    });
    expect(item.system.rank).toBe('dangerous');
  });

  it('is idempotent when connectionId already exists on the actor', async () => {
    const actor = freshActor();
    const first  = await createCharacterBondItem(actor, { name: 'A', connectionId: 'same' });
    const second = await createCharacterBondItem(actor, { name: 'A', connectionId: 'same' });
    expect(second).toBe(first);
    expect(actor.items.contents).toHaveLength(1);
  });

  it('returns null when actor is missing', async () => {
    const item = await createCharacterBondItem(null, { name: 'X' });
    expect(item).toBeNull();
  });
});

describe('createCharacterVowItem', () => {
  it('creates a progress Item with subtype "vow"', async () => {
    const actor = freshActor();
    const item = await createCharacterVowItem(actor, {
      name: 'Find the Beacon', rank: 'formidable', vowId: 'v1',
    });
    expect(item.system.subtype).toBe('vow');
    expect(item.system.rank).toBe('formidable');
    expect(item.__createOptions.suppressLog).toBe(true);
  });
});
