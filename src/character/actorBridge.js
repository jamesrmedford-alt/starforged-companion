// src/character/actorBridge.js
// Single module responsible for all Ironsworn Actor reads and writes.
// No other module accesses the Actor directly — everything goes through here.
// This isolates the foundry-ironsworn API surface so system changes only require
// updates in one place.

// Condition debilities that affect momentum max and reset.
// Each marked condition reduces momentumMax by 1 and momentumReset by 1 (floor -2).
const CONDITION_DEBILITIES = ['wounded', 'shaken', 'unprepared', 'encumbered'];

// In-memory cache of character snapshots, invalidated by the updateActor hook.
const _snapshotCache = new Map();


// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all player-owned character Actors in the world.
 * @returns {Actor[]}
 */
export function getPlayerActors() {
  try {
    return game.actors?.filter(a => a.type === 'character' && a.hasPlayerOwner) ?? [];
  } catch {
    return [];
  }
}

/**
 * Get a single Actor. Uses game.user.character by default; pass an explicit
 * actorId to override.
 * @param {string} [actorId]
 * @returns {Actor|null}
 */
export function getActor(actorId) {
  try {
    if (actorId) return game.actors?.get(actorId) ?? null;
    return game.user?.character ?? null;
  } catch {
    return null;
  }
}

/**
 * Read a character's current stat and meter values as a flat snapshot.
 * Safe to pass to interpreter and assembler — no Foundry document references.
 * @param {Actor} actor
 * @returns {Object}
 */
export function readCharacterSnapshot(actor) {
  if (!actor) return null;

  const cached = _snapshotCache.get(actor.id);
  if (cached) return cached;

  const sys  = actor.system ?? {};
  const debs = readDebilities(actor);
  const condCount = countConditionDebilities(debs);

  const snapshot = {
    name:    actor.name,
    actorId: actor.id,
    stats: {
      edge:   sys.stats?.edge   ?? 0,
      heart:  sys.stats?.heart  ?? 0,
      iron:   sys.stats?.iron   ?? 0,
      shadow: sys.stats?.shadow ?? 0,
      wits:   sys.stats?.wits   ?? 0,
    },
    meters: {
      health:   meterValue(sys.meters?.health),
      spirit:   meterValue(sys.meters?.spirit),
      supply:   meterValue(sys.meters?.supply),
      momentum: meterValue(sys.meters?.momentum),
    },
    momentumMax:   Math.max(0, 10 - condCount),
    momentumReset: condCount === 0 ? 0 : Math.max(-2, -condCount),
    debilities: debs,
    xp: {
      value: sys.xp?.value ?? 0,
      max:   sys.xp?.max   ?? 0,
    },
  };

  _snapshotCache.set(actor.id, snapshot);
  return snapshot;
}

/**
 * Read active debilities as a flat boolean map.
 * @param {Actor} actor
 * @returns {Object}
 */
export function readDebilities(actor) {
  const d = actor?.system?.debilities ?? {};
  return {
    corrupted:  !!d.corrupted,
    cursed:     !!d.cursed,
    tormented:  !!d.tormented,
    wounded:    !!d.wounded,
    shaken:     !!d.shaken,
    unprepared: !!d.unprepared,
    encumbered: !!d.encumbered,
    maimed:     !!d.maimed,
    haunted:    !!d.haunted,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// WRITE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply meter changes (deltas) from a move resolution to the Actor.
 * Clamps all values to valid Ironsworn ranges.
 * Recalculates momentumMax and momentumReset from active condition debilities.
 * @param {Actor} actor
 * @param {{ health?: number, spirit?: number, supply?: number, momentum?: number }} meterChanges
 * @returns {Promise<void>}
 */
export async function applyMeterChanges(actor, meterChanges) {
  if (!actor) return;

  const sys   = actor.system ?? {};
  const debs  = readDebilities(actor);
  const condCount = countConditionDebilities(debs);

  const momentumMax   = Math.max(0, 10 - condCount);
  const momentumReset = condCount === 0 ? 0 : Math.max(-2, -condCount);

  const healthMax  = debs.wounded ? 4 : 5;
  const spiritMax  = debs.shaken  ? 3 : 5;

  const currentHealth   = meterValue(sys.meters?.health);
  const currentSpirit   = meterValue(sys.meters?.spirit);
  const currentSupply   = meterValue(sys.meters?.supply);
  const currentMomentum = meterValue(sys.meters?.momentum);

  const updates = {};

  if (meterChanges.health !== undefined && meterChanges.health !== 0) {
    const next = clamp(currentHealth + meterChanges.health, 0, healthMax);
    updates['system.meters.health.value'] = next;
  }

  if (meterChanges.spirit !== undefined && meterChanges.spirit !== 0) {
    const next = clamp(currentSpirit + meterChanges.spirit, 0, spiritMax);
    updates['system.meters.spirit.value'] = next;
  }

  if (meterChanges.supply !== undefined && meterChanges.supply !== 0) {
    const next = clamp(currentSupply + meterChanges.supply, 0, 5);
    updates['system.meters.supply.value'] = next;
  }

  if (meterChanges.momentum !== undefined && meterChanges.momentum !== 0) {
    const next = clamp(currentMomentum + meterChanges.momentum, momentumReset, momentumMax);
    updates['system.meters.momentum.value']  = next;
    updates['system.meters.momentum.max']    = momentumMax;
    updates['system.meters.momentum.reset']  = momentumReset;
  }

  if (Object.keys(updates).length) {
    await actor.update(updates);
    invalidateActorCache(actor.id);
  }
}

/**
 * Set or clear a single debility flag on the Actor.
 * Also recalculates momentum bounds if a condition debility changed.
 * @param {Actor} actor
 * @param {string} debilityKey
 * @param {boolean} value
 * @returns {Promise<void>}
 */
export async function setDebility(actor, debilityKey, value) {
  if (!actor) return;

  await actor.update({ [`system.debilities.${debilityKey}`]: value });
  invalidateActorCache(actor.id);

  if (CONDITION_DEBILITIES.includes(debilityKey)) {
    await recalculateMomentumBounds(actor);
  }
}

/**
 * Award XP to the Actor, clamped to xp.max.
 * @param {Actor} actor
 * @param {number} amount
 * @returns {Promise<void>}
 */
export async function awardXP(actor, amount) {
  if (!actor || amount <= 0) return;

  const sys    = actor.system ?? {};
  const current = sys.xp?.value ?? 0;
  const max     = sys.xp?.max   ?? 30;
  const next    = Math.min(current + amount, max);

  if (next !== current) {
    await actor.update({ 'system.xp.value': next });
    invalidateActorCache(actor.id);
  }
}

/**
 * Apply changes to a companion or starship asset embedded on the Actor.
 * @param {Actor} actor
 * @param {'starship'|'companion'} assetType
 * @param {Object} changes
 * @returns {Promise<void>}
 */
export async function applyAssetChanges(actor, assetType, changes) {
  if (!actor) return;

  const item = actor.items?.find(i => i.type === assetType);
  if (!item) {
    console.warn(`actorBridge | applyAssetChanges: no ${assetType} found on actor ${actor.id}`);
    return;
  }

  await item.update(changes);
  invalidateActorCache(actor.id);
}

/**
 * Mark progress ticks on an embedded vow item on the Actor.
 * @param {Actor} actor
 * @param {string} vowItemId
 * @param {number} ticks
 * @returns {Promise<void>}
 */
export async function markVowProgress(actor, vowItemId, ticks) {
  if (!actor || ticks <= 0) return;

  const item = actor.items?.find(i => i.id === vowItemId);
  if (!item) {
    console.warn(`actorBridge | markVowProgress: vow item ${vowItemId} not found on actor ${actor.id}`);
    return;
  }

  const current  = item.system?.progress ?? 0;
  const next     = Math.min(current + ticks, 40);

  if (next !== current) {
    await item.update({ 'system.progress': next });
    invalidateActorCache(actor.id);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// CACHE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Invalidate the cached snapshot for an actor.
 * Called after any write and from the updateActor hook in index.js.
 * @param {string} actorId
 */
export function invalidateActorCache(actorId) {
  _snapshotCache.delete(actorId);
}

/**
 * Recalculate momentum max and reset from current condition debilities,
 * and clamp the current momentum value to the new bounds.
 * Called when a condition debility changes.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function recalculateMomentumBounds(actor) {
  if (!actor) return;

  const debs      = readDebilities(actor);
  const condCount = countConditionDebilities(debs);
  const maxMom    = Math.max(0, 10 - condCount);
  const resetMom  = condCount === 0 ? 0 : Math.max(-2, -condCount);
  const current   = meterValue(actor.system?.meters?.momentum);
  const clamped   = clamp(current, resetMom, maxMom);

  const updates = {
    'system.meters.momentum.max':   maxMom,
    'system.meters.momentum.reset': resetMom,
  };
  if (clamped !== current) {
    updates['system.meters.momentum.value'] = clamped;
  }

  await actor.update(updates);
  invalidateActorCache(actor.id);
}


// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function meterValue(meter) {
  if (meter == null) return 0;
  if (typeof meter === 'number') return meter;
  return meter.value ?? 0;
}

function countConditionDebilities(debs) {
  return CONDITION_DEBILITIES.filter(k => debs[k]).length;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
