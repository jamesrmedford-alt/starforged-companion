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
  readVows,
  readConnections,
  applyMeterChanges,
  readMomentumState,
  setDebility,
  awardXP,
  listCompanionAssets,
  getCompanionAsset,
  readCompanionHealth,
  applyCompanionHealthChange,
  invalidateActorCache,
  createCharacterBondItem,
  createCharacterVowItem,
  completeVowItem,
  setBondItemTicks,
  setBondItemRank,
  advanceVowClocks,
  revertVowClocksForBurn,
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
  it('returns all character actors including GM-assigned ones', () => {
    const a1 = makeTestActor({ id: 'a1', type: 'character', hasPlayerOwner: true });
    const a2 = makeTestActor({ id: 'a2', type: 'character', hasPlayerOwner: true });
    const gm = makeTestActor({ id: 'gm', type: 'character', hasPlayerOwner: false });
    game.actors._setAll([a1, a2, gm]);

    const result = getPlayerActors();
    expect(result).toHaveLength(3);
    expect(result.map(a => a.id)).toContain('a1');
    expect(result.map(a => a.id)).toContain('a2');
    expect(result.map(a => a.id)).toContain('gm');
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

  // Solo-GM play: there are no non-GM users, so every character.hasPlayerOwner
  // is false. All character-type actors must be returned so the recap pipeline
  // + assembler CHARACTER STATE work in the primary single-player use case.
  it('returns all character-type actors in solo-GM play (all hasPlayerOwner false)', () => {
    const c1 = makeTestActor({ id: 'c1', type: 'character', hasPlayerOwner: false });
    const c2 = makeTestActor({ id: 'c2', type: 'character', hasPlayerOwner: false });
    game.actors._setAll([c1, c2]);

    const result = getPlayerActors();
    expect(result).toHaveLength(2);
    expect(result.map(a => a.id).sort()).toEqual(['c1', 'c2']);
  });

  it('never includes non-character actors', () => {
    const c   = makeTestActor({ id: 'c',   type: 'character', hasPlayerOwner: false });
    const npc = makeTestActor({ id: 'npc', type: 'npc',       hasPlayerOwner: false });
    const ship = makeTestActor({ id: 'ship', type: 'starship', hasPlayerOwner: false });
    game.actors._setAll([c, npc, ship]);

    const result = getPlayerActors();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('c');
  });

  // Regression for v1.7.6: NPC/connection cards are `character`-type Actors
  // (FOLDER-002). In solo-GM play the PC has no player owner, so the fallback
  // returns all characters — it must NOT sweep in NPC cards (they were getting
  // a Begin-a-Session +1 momentum grant).
  it('excludes NPC/connection cards in the solo-GM fallback', () => {
    const pc  = makeTestActor({ id: 'pc',  type: 'character', hasPlayerOwner: false });
    const npc = makeTestActor({
      id: 'npc', type: 'character', hasPlayerOwner: false,
      flags: { 'starforged-companion': { entityType: 'connection' } },
    });
    game.actors._setAll([pc, npc]);

    const result = getPlayerActors();
    expect(result.map(a => a.id)).toEqual(['pc']);
  });

  it('excludes NPC/connection cards even when they appear player-owned', () => {
    const pc  = makeTestActor({ id: 'pc',  type: 'character', hasPlayerOwner: true });
    const npc = makeTestActor({
      id: 'npc', type: 'character', hasPlayerOwner: true,
      flags: { 'starforged-companion': { entityType: 'connection' } },
    });
    game.actors._setAll([pc, npc]);

    const result = getPlayerActors();
    expect(result.map(a => a.id)).toEqual(['pc']);
  });

  // Regression for v1.7.26: a PC assigned only to the GM (hasPlayerOwner false)
  // was excluded in multi-user games when any player-owned PCs existed, causing
  // the narrator to treat the GM's character as an unknown connection.
  it('includes GM-assigned PCs alongside player-owned PCs in multi-user games', () => {
    const owned   = makeTestActor({ id: 'owned',   type: 'character', hasPlayerOwner: true });
    const gmPC    = makeTestActor({ id: 'gm-pc',   type: 'character', hasPlayerOwner: false });
    game.actors._setAll([owned, gmPC]);

    const result = getPlayerActors();
    expect(result).toHaveLength(2);
    expect(result.map(a => a.id)).toContain('owned');
    expect(result.map(a => a.id)).toContain('gm-pc');
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

  it('clamps momentum to −6–momentumMax (reset is the burn target, not a floor)', async () => {
    // With 2 impacts: max = 8, reset = 0. Floor stays at the play-kit MIN of −6.
    const actor = freshActor({
      system: {
        momentum: { value: 2, max: 10, resetValue: 2 },
        debility: { wounded: true, shaken: true },
      },
    });
    // Try to set momentum to +20 (above max)
    await applyMeterChanges(actor, { momentum: 20 });
    expect(actor._updateHistory[0]['system.momentum.value']).toBe(8);
    // The effective reset (0) is read, never written: the sheet's base stays +2.
    expect(actor._updateHistory[0]).not.toHaveProperty('system.momentum.resetValue');
    expect(actor.system.momentum.resetValue).toBe(2);
  });

  it('allows momentum to drop below momentumReset down to the −6 floor', async () => {
    // Fresh PC: max = 10, reset = +2. A −1 from +2 must land at +1, not stick at +2.
    const actor = freshActor({
      system: { momentum: { value: 2, max: 10, resetValue: 2 } },
    });
    await applyMeterChanges(actor, { momentum: -1 });
    expect(actor._updateHistory[0]['system.momentum.value']).toBe(1);
  });

  it('clamps momentum at the −6 floor regardless of how large the negative delta is', async () => {
    const actor = freshActor({
      system: { momentum: { value: 2, max: 10, resetValue: 2 } },
    });
    await applyMeterChanges(actor, { momentum: -100 });
    expect(actor._updateHistory[0]['system.momentum.value']).toBe(-6);
  });

  it('reduces the effective momentum maximum by 1 per active impact (all categories count)', async () => {
    const actor = freshActor({
      system: {
        momentum: { value: 2, max: 10, resetValue: 2 },
        debility: { wounded: true, shaken: true, unprepared: true },
      },
    });
    await applyMeterChanges(actor, { momentum: 20 });
    expect(actor._updateHistory[0]['system.momentum.value']).toBe(7);
    expect(actor._updateHistory[0]).not.toHaveProperty('system.momentum.max');
    expect(actor.system.momentum.max).toBe(10);
  });

  it('counts vehicle and burden impacts toward the effective maximum too', async () => {
    const actor = freshActor({
      system: {
        momentum: { value: 2, max: 10, resetValue: 2 },
        debility: { battered: true, doomed: true },
      },
    });
    await applyMeterChanges(actor, { momentum: 20 });
    expect(actor._updateHistory[0]['system.momentum.value']).toBe(8);
    expect(actor._updateHistory[0]).not.toHaveProperty('system.momentum.max');
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

  it('clamps momentum to the new effective maximum when an impact is marked', async () => {
    const actor = freshActor({
      system: {
        momentum: { value: 10, max: 10, resetValue: 2 },
      },
    });
    await setDebility(actor, 'wounded', true);
    // Two updates: the debility, then the clamp 10 → 9. The bases stay the sheet's.
    expect(actor._updateHistory).toHaveLength(2);
    expect(actor._updateHistory[1]).toEqual({ 'system.momentum.value': 9 });
    expect(actor.system.momentum.max).toBe(10);
    expect(actor.system.momentum.resetValue).toBe(2);
  });

  it('writes nothing more when the momentum is already within the new maximum', async () => {
    const actor = freshActor({
      system: {
        momentum: { value: 9, max: 10, resetValue: 2 },
      },
    });
    await setDebility(actor, 'wounded', true);
    expect(actor._updateHistory).toHaveLength(1);
    expect(actor._updateHistory[0]).toEqual({ 'system.debility.wounded': true });
  });

  it('does not throw if actor is null', async () => {
    await expect(setDebility(null, 'wounded', true)).resolves.toBeUndefined();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// The momentum bases are the sheet's (issue #316 T01)
// ─────────────────────────────────────────────────────────────────────────────

// foundry-ironsworn's CharacterModel getters (vendor/foundry-ironsworn
// src/module/actor/subtypes/character.ts): the effective bounds are the BASE
// fields less the marked impacts. The stock test actor carries plain fields,
// so the write-back of a derived value into its own base went unseen: this
// attaches the real formulas.
function withVendorGetters(actor) {
  const sys = actor.system;
  const impacts = () => Object.values(sys.debility).filter(v => v === true).length;
  Object.defineProperties(sys, {
    momentumMax:   { configurable: true, get: () => Math.min(10, Math.max(-6, sys.momentum.max - impacts())) },
    momentumReset: { configurable: true, get: () => Math.min(sys.momentum.max, Math.max(0, sys.momentum.resetValue - impacts())) },
  });
  return actor;
}

describe('momentum writes leave the sheet\'s base max and reset alone (issue #316 T01)', () => {
  it('three gains with one impact keep the effective maximum at 9 and the reset at +1', async () => {
    const actor = withVendorGetters(freshActor({
      system: { momentum: { value: 2, max: 10, resetValue: 2 }, debility: { wounded: true } },
    }));
    const seen = [];
    for (let i = 0; i < 3; i++) {
      await applyMeterChanges(actor, { momentum: 1 });
      seen.push({ max: actor.system.momentumMax, reset: actor.system.momentumReset });
    }
    // Before the fix: 8/0, 7/0, 6/0 — each write deducted the impact again.
    expect(seen).toEqual([{ max: 9, reset: 1 }, { max: 9, reset: 1 }, { max: 9, reset: 1 }]);
    expect(actor.system.momentum).toMatchObject({ value: 5, max: 10, resetValue: 2 });
    for (const u of actor._updateHistory) {
      expect(u).not.toHaveProperty('system.momentum.max');
      expect(u).not.toHaveProperty('system.momentum.resetValue');
    }
  });

  it('clamps a gain to the effective maximum the getters report', async () => {
    const actor = withVendorGetters(freshActor({
      system: { momentum: { value: 8, max: 10, resetValue: 2 }, debility: { wounded: true } },
    }));
    await applyMeterChanges(actor, { momentum: 5 });
    expect(actor.system.momentum.value).toBe(9);
    expect(actor.system.momentum.max).toBe(10);
  });

  it('clearing the impact restores the full bounds: 10 and +2, with nothing written', async () => {
    const actor = withVendorGetters(freshActor({
      system: { momentum: { value: 5, max: 10, resetValue: 2 }, debility: { wounded: true } },
    }));
    await applyMeterChanges(actor, { momentum: 1 });
    await setDebility(actor, 'wounded', false);
    expect(actor.system.momentumMax).toBe(10);
    expect(actor.system.momentumReset).toBe(2);
    // The debility write is the only one setDebility made: 6 is within 10.
    expect(actor._updateHistory.at(-1)).toEqual({ 'system.debility.wounded': false });
  });

  it('readMomentumState reads the effective bounds without touching the sheet', () => {
    const actor = withVendorGetters(freshActor({
      system: { momentum: { value: 4, max: 10, resetValue: 2 }, debility: { wounded: true, shaken: true } },
    }));
    expect(readMomentumState(actor)).toMatchObject({ value: 4, min: -6, max: 8, reset: 0, impactCount: 2 });
    expect(actor._updateHistory).toHaveLength(0);
  });

  it('without the getters, the bounds come from the sheet\'s bases — an edited base is kept', async () => {
    // A base reset of +3 (homebrew): the effective reset is +2 with one impact,
    // and the base is never overwritten with it.
    const actor = freshActor({
      system: { momentum: { value: 2, max: 10, resetValue: 3 }, debility: { wounded: true } },
    });
    expect(readMomentumState(actor)).toMatchObject({ max: 9, reset: 2 });
    await applyMeterChanges(actor, { momentum: 1 });
    expect(actor.system.momentum.resetValue).toBe(3);
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

  // Issue #309 N01: the vendor's system.xp has no maximum. A 30-point cap
  // wrote 30 over 42 XP and stopped every award at 30.
  it.each([[28, 5, 33], [29, 2, 31], [42, 2, 44]])('has no 30-point cap: %s + %s XP is %s', async (before, amount, after) => {
    const actor = freshActor({ system: { xp: before } });
    await awardXP(actor, amount);
    expect(actor._updateHistory[0]['system.xp']).toBe(after);
    expect(actor.system.xp).toBe(after);
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
// Companions — health is the Companion asset's track (issue #309 N03)
// ─────────────────────────────────────────────────────────────────────────────

describe('companion health — the Companion asset\'s track', () => {
  /** A vendor-shaped Companion asset (subtypes/asset.ts): category + track. */
  function companion(id, value, { max = 3, enabled = true, refuse = false } = {}) {
    const item = {
      id, name: id, type: 'asset',
      system: { category: 'Companion', track: { enabled, name: 'Health', value, min: 0, max } },
      update: async (changes) => {
        if (refuse) throw new Error('refused by the test');
        if ('system.track.value' in changes) item.system.track.value = changes['system.track.value'];
      },
    };
    return item;
  }
  const withItems = (...items) => freshActor({ items: { contents: items } });

  it('lists Companion-category assets with an enabled track — not other assets', () => {
    const glow = companion('glowcat', 2);
    const off  = companion('drone', 1, { enabled: false });
    const ship = { id: 'mod', type: 'asset', system: { category: 'Module', track: { enabled: true, value: 3 } } };
    expect(listCompanionAssets(withItems(glow, off, ship))).toEqual([glow]);
  });

  it('getCompanionAsset: the one named, else the only one — none when several and none named', () => {
    const a = companion('a', 1);
    const b = companion('b', 2);
    expect(getCompanionAsset(withItems(a, b), 'b')).toBe(b);
    expect(getCompanionAsset(withItems(a, b))).toBeNull();
    expect(getCompanionAsset(withItems(a))).toBe(a);
    expect(readCompanionHealth(withItems(a, b), 'b')).toBe(2);
    expect(readCompanionHealth(withItems())).toBeNull();
  });

  it('applyCompanionHealthChange writes the track, kept within min..max', async () => {
    const glow = companion('glowcat', 2);
    const actor = withItems(glow);
    await expect(applyCompanionHealthChange(actor, 1)).resolves.toMatchObject({ ok: true, before: 2, after: 3 });
    await expect(applyCompanionHealthChange(actor, 1)).resolves.toMatchObject({ ok: true, before: 3, after: 3 });
    await expect(applyCompanionHealthChange(actor, -5, { itemId: 'glowcat' })).resolves.toMatchObject({ ok: true, after: 0 });
    expect(glow.system.track.value).toBe(0);
    expect(actor._updateHistory).toEqual([]);   // the asset, never the PC's meters
  });

  it('reports a refused write and a missing companion instead of dropping them', async () => {
    await expect(applyCompanionHealthChange(withItems(companion('glowcat', 2, { refuse: true })), 1))
      .resolves.toMatchObject({ ok: false, reason: 'refused', before: 2 });
    await expect(applyCompanionHealthChange(withItems(), 1)).resolves.toEqual({ ok: false, reason: 'no-companion' });
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
                { enabled: true,  description: '<p>Burn <em>everything</em>.</p>' },
                { enabled: false, description: '<p>Locked ability.</p>' },
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
            system: { abilities: [{ enabled: true, description: 'Bluff your way out.' }] },
          },
        ],
      },
    });
    const snap = readCharacterSnapshot(actor);
    expect(snap.assets).toHaveLength(1);
    expect(snap.assets[0].name).toBe('Scoundrel');
    expect(snap.assets[0].abilities).toEqual(['Bluff your way out.']);
  });

  // ASSET-ABILITY-TEXT: the vendor AssetAbilityField keeps ability text in
  // `description` (there is no `text`), and pack abilities link their moves.
  it('reads pack-shaped ability text, reducing move links to their labels', () => {
    const actor = freshActor({
      items: {
        contents: [
          {
            type: 'asset', name: 'Ace',
            system: {
              category: 'Path',
              abilities: [{
                enabled:     true,
                description: '<p>When you @Compendium[foundry-ironsworn.starforgedmoves.e6ed148eff82c171]{Face Danger} '
                  + 'or @Compendium[foundry-ironsworn.starforgedmoves.d9208f9b7d827aec]{React Under Fire} at the helm, add +1.</p>',
                hasClock:    false,
              }],
            },
          },
        ],
      },
    });
    expect(readAssets(actor)[0].abilities).toEqual([
      'When you Face Danger or React Under Fire at the helm, add +1.',
    ]);
  });

  it('returns empty array when no asset items present', () => {
    const actor = freshActor();
    expect(readAssets(actor)).toEqual([]);
  });
});


describe('readConnections', () => {
  it('reads bond-subtype progress items, ignoring vows and assets', () => {
    const actor = freshActor({
      items: { contents: [
        { type: 'progress', name: 'Dr Chen', system: { subtype: 'bond', rank: 'dangerous', progress: 4 } },
        { type: 'progress', name: 'A vow',   system: { subtype: 'vow' } },
        { type: 'asset',    name: 'Scoundrel', system: {} },
      ] },
    });
    const out = readConnections(actor);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Dr Chen');
    expect(out[0].rank).toBe('dangerous');
    expect(out[0].progress).toBe(1);
  });

  it('surfaces connections, notes and biography through readCharacterSnapshot', () => {
    const actor = freshActor({
      system: { notes: '<p>Keeps a journal.</p>', biography: '<p>Born on a hauler.</p>' },
      items: { contents: [
        { type: 'progress', name: 'Vance', system: { subtype: 'bond', rank: 'troublesome' } },
      ] },
    });
    const snap = readCharacterSnapshot(actor);
    expect(snap.connections).toHaveLength(1);
    expect(snap.connections[0].name).toBe('Vance');
    expect(snap.notes).toBe('Keeps a journal.');
    expect(snap.biography).toBe('Born on a hauler.');
  });

  it('returns empty array when no bond items present', () => {
    expect(readConnections(freshActor())).toEqual([]);
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

describe('readVows', () => {
  it('returns vow-subtyped progress items with isBackground on the first one', () => {
    const actor = freshActor({
      items: {
        contents: [
          { id: 'v1', type: 'progress', name: 'Find the Beacon',
            system: { subtype: 'vow', rank: 'formidable', progress: 16 } },
          { id: 'v2', type: 'progress', name: 'Reclaim the Throne',
            system: { subtype: 'vow', rank: 'epic',       progress: 4  } },
          { id: 'b1', type: 'progress', name: 'A Connection',
            system: { subtype: 'bond', rank: 'dangerous' } },
        ],
      },
    });

    const vows = readVows(actor);
    expect(vows).toHaveLength(2);
    expect(vows[0]).toMatchObject({
      id: 'v1', name: 'Find the Beacon', rank: 'formidable',
      ticks: 16, progress: 4, isBackground: true,
    });
    expect(vows[1]).toMatchObject({
      id: 'v2', name: 'Reclaim the Throne', rank: 'epic',
      ticks: 4, progress: 1, isBackground: false,
    });
  });

  it('tags the SHARED inciting vow as background regardless of creation order (#248 B1)', () => {
    const actor = freshActor({
      items: {
        contents: [
          { id: 'own', type: 'progress', name: 'My own vow',
            system: { subtype: 'vow', rank: 'dangerous', progress: 0 }, flags: {} },
          { id: 'founding', type: 'progress', name: 'The founding vow',
            system: { subtype: 'vow', rank: 'formidable', progress: 0 },
            flags: { 'starforged-companion': { sharedVow: true } } },
        ],
      },
    });
    const vows = readVows(actor);
    expect(vows.find(v => v.id === 'founding').isBackground).toBe(true);
    expect(vows.find(v => v.id === 'own').isBackground).toBe(false);
  });

  it('surfaces the vow countdown clock when present, null otherwise', () => {
    const actor = freshActor({
      items: {
        contents: [
          { id: 'v1', type: 'progress', name: 'Save Dani',
            system: { subtype: 'vow', rank: 'dangerous', progress: 8,
                      hasClock: true, clockTicks: 2, clockMax: 6 } },
          { id: 'v2', type: 'progress', name: 'No clock vow',
            system: { subtype: 'vow', rank: 'epic', progress: 0 } },
        ],
      },
    });
    const vows = readVows(actor);
    expect(vows[0].clock).toEqual({ ticks: 2, max: 6 });
    expect(vows[1].clock).toBeNull();
  });

  it('returns empty array when actor has no vow items', () => {
    const actor = freshActor();
    expect(readVows(actor)).toEqual([]);
  });

  it('surfaces vows through readCharacterSnapshot', () => {
    const actor = freshActor({
      items: {
        contents: [{ id: 'v1', type: 'progress', name: 'Test',
                     system: { subtype: 'vow', rank: 'dangerous', progress: 0 } }],
      },
    });
    const snap = readCharacterSnapshot(actor);
    expect(snap.vows).toHaveLength(1);
    expect(snap.vows[0].isBackground).toBe(true);
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

// ─────────────────────────────────────────────────────────────────────────────
// createCharacterVowItem — clock attachment (Cluster B / F4)
// ─────────────────────────────────────────────────────────────────────────────

describe('createCharacterVowItem — clock', () => {
  it('attaches the sheet-native clock fields when clock.max is valid', async () => {
    const actor = freshActor();
    const item = await createCharacterVowItem(actor, {
      name: 'Reach Vance before his life support fails',
      rank: 'dangerous', vowId: 'msg1', clock: { max: 6 },
    });
    expect(item.system.subtype).toBe('vow');
    expect(item.system.hasClock).toBe(true);
    expect(item.system.clockTicks).toBe(0);
    expect(item.system.clockMax).toBe(6);
  });

  it('snaps an unsupported clock size to the default 6', async () => {
    const actor = freshActor();
    const item = await createCharacterVowItem(actor, {
      name: 'V', vowId: 'msg2', clock: { max: 7 },
    });
    expect(item.system.hasClock).toBe(true);
    expect(item.system.clockMax).toBe(6);
  });

  it('omits clock fields entirely when no clock is requested', async () => {
    const actor = freshActor();
    const item = await createCharacterVowItem(actor, { name: 'V', vowId: 'msg3' });
    expect(item.system.hasClock).toBeUndefined();
    expect(item.system.clockMax).toBeUndefined();
  });

  it('omits clock fields when clock.max is not a number', async () => {
    const actor = freshActor();
    const item = await createCharacterVowItem(actor, {
      name: 'V', vowId: 'msg4', clock: { max: 'soon' },
    });
    expect(item.system.hasClock).toBeUndefined();
  });

  it('stays idempotent on vowId across clock variations', async () => {
    const actor = freshActor();
    const first  = await createCharacterVowItem(actor, { name: 'V', vowId: 'same', clock: { max: 4 } });
    const second = await createCharacterVowItem(actor, { name: 'V', vowId: 'same', clock: { max: 8 } });
    expect(second).toBe(first);
    expect(actor.items.contents).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// advanceVowClocks — Pay the Price advances vow countdown clocks (#10)
// ─────────────────────────────────────────────────────────────────────────────

describe('advanceVowClocks', () => {
  function clockVow({ id, name = 'V', ticks = 0, max = 6, hasClock = true, completed = false }) {
    const item = {
      id, type: 'progress', name,
      system: {
        subtype: 'vow', rank: 'dangerous', current: 0, completed,
        ...(hasClock ? { hasClock: true, clockTicks: ticks, clockMax: max } : {}),
      },
      async update(changes) {
        for (const [path, val] of Object.entries(changes)) {
          const parts = path.split('.');
          let t = item;
          for (let i = 0; i < parts.length - 1; i++) t = (t[parts[i]] ??= {});
          t[parts[parts.length - 1]] = val;
        }
      },
    };
    return item;
  }

  it('advances each vow clock by one segment and reports it', async () => {
    const actor = freshActor({ items: { contents: [
      clockVow({ id: 'v1', name: 'Save Dani', ticks: 2, max: 6 }),
    ] } });
    const advanced = await advanceVowClocks(actor);
    expect(advanced).toHaveLength(1);
    expect(advanced[0]).toMatchObject({ name: 'Save Dani', ticks: 3, max: 6, triggered: false, itemId: 'v1' });
    expect(actor.items.contents[0].system.clockTicks).toBe(3);
  });

  it('caps at clockMax and flags triggered', async () => {
    const actor = freshActor({ items: { contents: [
      clockVow({ id: 'v1', name: 'Deadline', ticks: 5, max: 6 }),
    ] } });
    const advanced = await advanceVowClocks(actor);
    expect(advanced[0]).toMatchObject({ ticks: 6, triggered: true });
  });

  it('skips vows with no clock, a full clock, or completed', async () => {
    const actor = freshActor({ items: { contents: [
      clockVow({ id: 'v1', name: 'No clock', hasClock: false }),
      clockVow({ id: 'v2', name: 'Full',     ticks: 6, max: 6 }),
      clockVow({ id: 'v3', name: 'Done',     ticks: 1, max: 6, completed: true }),
    ] } });
    const advanced = await advanceVowClocks(actor);
    expect(advanced).toEqual([]);
  });

  it('returns [] for a null actor', async () => {
    expect(await advanceVowClocks(null)).toEqual([]);
  });

  it('honours a custom step via opts.by', async () => {
    const actor = freshActor({ items: { contents: [
      clockVow({ id: 'v1', name: 'Save Dani', ticks: 0, max: 8 }),
    ] } });
    const advanced = await advanceVowClocks(actor, { by: 2 });
    expect(advanced[0].ticks).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// revertVowClocksForBurn — burn momentum unwinds a vow clock tick
// ─────────────────────────────────────────────────────────────────────────────

describe('revertVowClocksForBurn', () => {
  function clockVow({ id, name = 'V', ticks = 0, max = 6 }) {
    const item = {
      id, type: 'progress', name,
      system: { subtype: 'vow', hasClock: true, clockTicks: ticks, clockMax: max },
      async update(changes) {
        for (const [path, val] of Object.entries(changes)) {
          const parts = path.split('.');
          let t = item;
          for (let i = 0; i < parts.length - 1; i++) t = (t[parts[i]] ??= {});
          t[parts[parts.length - 1]] = val;
        }
      },
    };
    return item;
  }

  it('decrements the vow clock by one tick', async () => {
    const vow   = clockVow({ id: 'v1', name: 'Save Dani', ticks: 3, max: 6 });
    const actor = freshActor({ items: { contents: [vow] } });
    game.actors._set(actor.id, actor);

    await revertVowClocksForBurn([{ actorId: actor.id, itemId: 'v1' }]);

    expect(vow.system.clockTicks).toBe(2);
  });

  it('does not go below zero', async () => {
    const vow   = clockVow({ id: 'v1', ticks: 0, max: 6 });
    const actor = freshActor({ items: { contents: [vow] } });
    game.actors._set(actor.id, actor);

    await revertVowClocksForBurn([{ actorId: actor.id, itemId: 'v1' }]);

    expect(vow.system.clockTicks).toBe(0);
  });

  it('silently skips unknown actor or item', async () => {
    await revertVowClocksForBurn([{ actorId: 'no-such-actor', itemId: 'no-item' }]);
    // no error thrown
  });

  it('is a no-op for empty input', async () => {
    await expect(revertVowClocksForBurn([])).resolves.toEqual([]);
  });

  // Issue #311 P06: a refused rewind was only logged — the upgrade's GM card needs it.
  it('returns the entries whose write was refused', async () => {
    const ok      = clockVow({ id: 'v1', ticks: 2 });
    const refused = clockVow({ id: 'v2', ticks: 2 });
    refused.update = async () => { throw new Error('refused'); };
    const actor = freshActor({ items: { contents: [ok, refused] } });
    game.actors._set(actor.id, actor);

    const failed = await revertVowClocksForBurn([{ actorId: actor.id, itemId: 'v1' }, { actorId: actor.id, itemId: 'v2', name: 'B' }]);

    expect(ok.system.clockTicks).toBe(1);
    expect(failed).toEqual([{ actorId: actor.id, itemId: 'v2', name: 'B' }]);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// completeVowItem — pipeline Fulfill Your Vow closes the live item vow
// ─────────────────────────────────────────────────────────────────────────────

describe('completeVowItem', () => {
  it('marks the vow item completed and reports true', async () => {
    const updates = [];
    const vow = {
      id: 'v1', type: 'progress', name: 'Rescue the settlers',
      system: { subtype: 'vow', current: 40, completed: false },
      update: async (c) => { updates.push(c); vow.system.completed = true; },
    };
    const actor = makeTestActor({ id: 'pc-cvi-1', items: { contents: [vow] } });
    const done = await completeVowItem(actor, 'v1');
    expect(done).toBe(true);
    expect(updates).toEqual([{ 'system.completed': true }]);
  });

  it('is a no-op (false) on an already-completed vow', async () => {
    const vow = {
      id: 'v1', type: 'progress',
      system: { subtype: 'vow', completed: true },
      update: async () => { throw new Error('must not update a completed vow'); },
    };
    const actor = makeTestActor({ id: 'pc-cvi-2', items: { contents: [vow] } });
    expect(await completeVowItem(actor, 'v1')).toBe(false);
  });

  it('warns and reports false when the item is missing', async () => {
    const actor = makeTestActor({ id: 'pc-cvi-3' });
    expect(await completeVowItem(actor, 'nope')).toBe(false);
    expect(getCapturedWarns().some(w => w.includes('completeVowItem'))).toBe(true);
  });

  it('is safe on nullish actor / id', async () => {
    expect(await completeVowItem(null, 'v1')).toBe(false);
    expect(await completeVowItem(makeTestActor({ id: 'pc-cvi-4' }), null)).toBe(false);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// setBondItemTicks — mirror connection progress onto the sheet's bond Items
// (BOND-ITEM-MIRROR regression: the item was seeded at 0 and never advanced)
// ─────────────────────────────────────────────────────────────────────────────

describe('setBondItemTicks', () => {
  const bondItem = (over = {}) => {
    const item = {
      id: 'b1', type: 'progress', name: 'Ash Barlowe',
      system: { subtype: 'bond', current: 0 },
      flags: { 'starforged-companion': { connectionId: 'conn-1' } },
      update: async (c) => { item.system.current = c['system.current']; item._updated = (item._updated ?? 0) + 1; },
      ...over,
    };
    return item;
  };

  it('updates matching items by connectionId flag across PCs', async () => {
    const i1 = bondItem();
    const i2 = bondItem({ id: 'b2', name: 'Renamed On Sheet' }); // id still matches
    const a1 = makeTestActor({ id: 'pc-sbt-1', items: { contents: [i1] } });
    const a2 = makeTestActor({ id: 'pc-sbt-2', items: { contents: [i2] } });
    game.actors._setAll([a1, a2]);

    const n = await setBondItemTicks({ connectionId: 'conn-1', name: 'Ash Barlowe' }, 16);
    expect(n).toBe(2);
    expect(i1.system.current).toBe(16);
    expect(i2.system.current).toBe(16);
  });

  it('falls back to case-insensitive name match when the flag is absent', async () => {
    const i = bondItem({ flags: {} });
    const a = makeTestActor({ id: 'pc-sbt-3', items: { contents: [i] } });
    game.actors._setAll([a]);
    expect(await setBondItemTicks({ connectionId: 'conn-9', name: 'ash barlowe' }, 8)).toBe(1);
    expect(i.system.current).toBe(8);
  });

  // Issue #314 Q04: `byId || byName` let a name override a different key, so
  // developing one Sable wrote both Sables' Items.
  describe("a keyed Item matches its own connection only", () => {
    it("a same-named Item keyed to another connection keeps its ticks, on this PC and on another", async () => {
      const mine    = bondItem({ id: 'b-a' });
      const sibling = bondItem({ id: 'b-b', system: { subtype: 'bond', current: 20 },
        flags: { 'starforged-companion': { connectionId: 'conn-2' } } });
      const theirs  = bondItem({ id: 'b-c', system: { subtype: 'bond', current: 20 },
        flags: { 'starforged-companion': { connectionId: 'conn-2' } } });
      const a1 = makeTestActor({ id: 'pc-sbt-5', items: { contents: [mine, sibling] } });
      const a2 = makeTestActor({ id: 'pc-sbt-6', items: { contents: [theirs] } });
      game.actors._setAll([a1, a2]);

      expect(await setBondItemTicks({ connectionId: 'conn-1', name: 'Ash Barlowe' }, 8)).toBe(1);
      expect(mine.system.current).toBe(8);
      expect(sibling.system.current).toBe(20);
      expect(theirs.system.current).toBe(20);
    });

    it("a keyed Item is found by its id after the connection was renamed; the stale name on another's Item does not match", async () => {
      const renamed = bondItem({ id: 'b-r', name: 'Old Name' });
      const other   = bondItem({ id: 'b-o', name: 'New Name', flags: { 'starforged-companion': { connectionId: 'conn-7' } } });
      const a = makeTestActor({ id: 'pc-sbt-7', items: { contents: [renamed, other] } });
      game.actors._setAll([a]);

      expect(await setBondItemTicks({ connectionId: 'conn-1', name: 'New Name' }, 12)).toBe(1);
      expect(renamed.system.current).toBe(12);
      expect(other.system.current).toBe(0);
    });

    it("the name fallback takes an unkeyed Item only when it is the PC's one of that name", async () => {
      const u1 = bondItem({ id: 'u1', flags: {} });
      const u2 = bondItem({ id: 'u2', flags: {} });
      const a  = makeTestActor({ id: 'pc-sbt-8', items: { contents: [u1, u2] } });
      game.actors._setAll([a]);
      expect(await setBondItemTicks({ connectionId: 'conn-9', name: 'Ash Barlowe' }, 8)).toBe(0);
      expect([u1.system.current, u2.system.current]).toEqual([0, 0]);
    });

    it("a PC with a keyed Item for the connection ignores the name on its other Items", async () => {
      const keyed   = bondItem({ id: 'k', name: 'Someone Else' });
      const unkeyed = bondItem({ id: 'u', flags: {} });   // named Ash Barlowe, no key
      const a = makeTestActor({ id: 'pc-sbt-9', items: { contents: [keyed, unkeyed] } });
      game.actors._setAll([a]);
      expect(await setBondItemTicks({ connectionId: 'conn-1', name: 'Ash Barlowe' }, 8)).toBe(1);
      expect(keyed.system.current).toBe(8);
      expect(unkeyed.system.current).toBe(0);
    });
  });

  it('skips non-bond items, clamps to 0..40, and no-ops when already equal', async () => {
    const vow = bondItem({ id: 'v', system: { subtype: 'vow', current: 0 } });
    const bond = bondItem({ id: 'b3', system: { subtype: 'bond', current: 40 } });
    const a = makeTestActor({ id: 'pc-sbt-4', items: { contents: [vow, bond] } });
    game.actors._setAll([a]);
    expect(await setBondItemTicks({ connectionId: 'conn-1', name: 'Ash Barlowe' }, 99)).toBe(0); // clamped to 40 == current
    expect(bond.system.current).toBe(40);
    expect(vow.system.current).toBe(0);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// setBondItemRank — mirror connection rank onto the sheet's bond Items
// (NARR-BOND-RANK-STALE: the item rank was seeded at creation and never
// updated on develop-match / !bond-match rank raises)
// ─────────────────────────────────────────────────────────────────────────────

describe('setBondItemRank', () => {
  const rankBondItem = (over = {}) => {
    const item = {
      id: 'rb1', type: 'progress', name: 'Ash Barlowe',
      system: { subtype: 'bond', current: 0, rank: 'dangerous' },
      flags: { 'starforged-companion': { connectionId: 'conn-1' } },
      update: async (c) => { item.system.rank = c['system.rank']; item._updated = (item._updated ?? 0) + 1; },
      ...over,
    };
    return item;
  };

  it('updates matching items by connectionId flag and by name fallback', async () => {
    const byFlag = rankBondItem();
    const byName = rankBondItem({ id: 'rb2', flags: {} });
    const a1 = makeTestActor({ id: 'pc-sbr-1', items: { contents: [byFlag] } });
    const a2 = makeTestActor({ id: 'pc-sbr-2', items: { contents: [byName] } });
    game.actors._setAll([a1, a2]);

    const n = await setBondItemRank({ connectionId: 'conn-1', name: 'ash barlowe' }, 'formidable');
    expect(n).toBe(2);
    expect(byFlag.system.rank).toBe('formidable');
    expect(byName.system.rank).toBe('formidable');
  });

  it('rejects invalid ranks and no-ops when already equal', async () => {
    const item = rankBondItem();
    const a = makeTestActor({ id: 'pc-sbr-3', items: { contents: [item] } });
    game.actors._setAll([a]);

    expect(await setBondItemRank({ connectionId: 'conn-1' }, 'legendary')).toBe(0);
    expect(item.system.rank).toBe('dangerous');
    expect(await setBondItemRank({ connectionId: 'conn-1' }, 'dangerous')).toBe(0);
    expect(item._updated).toBeUndefined();
  });

  it('skips non-bond items', async () => {
    const vow = rankBondItem({ id: 'rv', system: { subtype: 'vow', rank: 'dangerous' } });
    const a = makeTestActor({ id: 'pc-sbr-4', items: { contents: [vow] } });
    game.actors._setAll([a]);
    expect(await setBondItemRank({ connectionId: 'conn-1', name: 'Ash Barlowe' }, 'epic')).toBe(0);
    expect(vow.system.rank).toBe('dangerous');
  });

  // Issue #314 Q04 — same matching as the ticks mirror.
  it("raises the Item keyed to the connection — renamed or not — and never a same-named Item keyed to another", async () => {
    const mine    = rankBondItem({ id: 'rb-a', name: 'Old Name' });
    const sibling = rankBondItem({ id: 'rb-b', flags: { 'starforged-companion': { connectionId: 'conn-2' } } });
    const a = makeTestActor({ id: 'pc-sbr-5', items: { contents: [mine, sibling] } });
    game.actors._setAll([a]);

    expect(await setBondItemRank({ connectionId: 'conn-1', name: 'Ash Barlowe' }, 'formidable')).toBe(1);
    expect(mine.system.rank).toBe('formidable');
    expect(sibling.system.rank).toBe('dangerous');
  });
});
