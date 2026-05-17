// src/character/actorBridge.js
// Single module responsible for all Ironsworn Actor reads and writes.
// No other module accesses the Actor directly — everything goes through here.
// This isolates the foundry-ironsworn API surface so system changes only require
// updates in one place.

const MODULE_ID = "starforged-companion";

// All debility keys that count as "impacts" for momentum bounds.
// Per foundry-ironsworn source (#impactCount getter) and the Starforged play kit
// (p.1 "MAX MOMENTUM: STARTS AT +10 / REDUCE BY 1 FOR EACH IMPACT"), every marked
// impact reduces momentumMax by 1 and shifts momentumReset toward 0.
// First 10 are the Starforged play-kit list; last 3 are Ironsworn-classic extras
// the vendor system also tracks.
const IMPACT_KEYS = [
  'wounded', 'shaken', 'unprepared',                  // misfortunes
  'permanentlyharmed', 'traumatized',                 // lasting effects
  'doomed', 'tormented', 'indebted',                  // burdens
  'battered', 'cursed',                               // current vehicle
  'corrupted', 'encumbered', 'maimed',                // vendor extras (Ironsworn classic)
];

// In-memory cache of character snapshots, invalidated by the updateActor hook.
const _snapshotCache = new Map();


// ─────────────────────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all player-owned character Actors in the world.
 *
 * In multi-user games this returns only characters with at least one non-GM
 * owner (`hasPlayerOwner === true`). In solo-GM play — the dominant use case
 * for this module — there are no non-GM users, so `hasPlayerOwner` is always
 * false on every character. Falling back to all `character`-type Actors keeps
 * the recap pipeline, paced-narration character context, and the chronicle
 * panel working in solo play. Safe because foundry-ironsworn reserves the
 * `character` type for PCs — NPCs/foes/connections use different types.
 *
 * @returns {Actor[]}
 */
export function getPlayerActors() {
  const characters = game.actors?.filter(a => a.type === 'character') ?? [];
  const playerOwned = characters.filter(a => a.hasPlayerOwner);
  return playerOwned.length > 0 ? playerOwned : characters;
}

/**
 * Get a single Actor. Uses game.user.character by default; pass an explicit
 * actorId to override.
 * @param {string} [actorId]
 * @returns {Actor|null}
 */
export function getActor(actorId) {
  if (actorId) return game.actors?.get(actorId) ?? null;
  return game.user?.character ?? null;
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
  const impactCount = countImpacts(debs);

  // Prefer the vendor system's computed getters (#impactCount-driven) when
  // present so any future schema change tracks automatically; otherwise fall
  // back to the local formula matching the play kit (p.1).
  const momentumMax   = sys.momentumMax   ?? Math.max(0, 10 - impactCount);
  const momentumReset = sys.momentumReset ?? Math.max(0, 2 - impactCount);

  const snapshot = {
    name:    actor.name,
    actorId: actor.id,
    stats: {
      edge:   sys.edge   ?? 0,
      heart:  sys.heart  ?? 0,
      iron:   sys.iron   ?? 0,
      shadow: sys.shadow ?? 0,
      wits:   sys.wits   ?? 0,
    },
    meters: {
      health:   meterValue(sys.health),
      spirit:   meterValue(sys.spirit),
      supply:   meterValue(sys.supply),
      momentum: meterValue(sys.momentum),
    },
    momentumMax,
    momentumReset,
    debilities: debs,
    xp: {
      value: sys.xp ?? 0,
      max:   30,
    },
    assets: readAssets(actor),
  };

  _snapshotCache.set(actor.id, snapshot);
  return snapshot;
}

/**
 * Read the character's ironsworn `asset`-type Items (Paths, Companions,
 * Modules, Rituals, Combat Talents, etc) as plain-data snapshots for
 * narrator context. Only enabled abilities are surfaced — disabled
 * abilities aren't yet "unlocked" and shouldn't inform the narrator.
 *
 * Strips HTML tags from ability text so the prompt stays clean — the
 * ironsworn schema stores rich text in HTMLField.
 *
 * @param {Actor} actor
 * @returns {Array<{ name: string, abilities: string[], description: string }>}
 */
export function readAssets(actor) {
  const items = actor?.items?.contents ?? actor?.items ?? [];
  const list = Array.isArray(items) ? items : [];
  return list
    .filter(i => i?.type === 'asset')
    .map(i => {
      const abilities = (i.system?.abilities ?? [])
        .filter(a => a?.enabled)
        .map(a => stripHtml(a?.text ?? ''))
        .filter(Boolean);
      return {
        name:        i.name ?? '',
        description: stripHtml(i.system?.description ?? ''),
        abilities,
      };
    });
}

function stripHtml(s) {
  return String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Read active debilities as a flat boolean map.
 * @param {Actor} actor
 * @returns {Object}
 */
export function readDebilities(actor) {
  const d = actor?.system?.debility ?? {};
  // 10 canonical Starforged play-kit impacts + 3 Ironsworn-classic extras
  // the vendor system also tracks. Anything outside this list is ignored —
  // the previous `custom1` / `custom2` fields were not in the vendor schema.
  return {
    wounded:           !!d.wounded,
    shaken:            !!d.shaken,
    unprepared:        !!d.unprepared,
    permanentlyharmed: !!d.permanentlyharmed,
    traumatized:       !!d.traumatized,
    doomed:            !!d.doomed,
    tormented:         !!d.tormented,
    indebted:          !!d.indebted,
    battered:          !!d.battered,
    cursed:            !!d.cursed,
    corrupted:         !!d.corrupted,
    encumbered:        !!d.encumbered,
    maimed:            !!d.maimed,
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
  const impactCount = countImpacts(debs);

  const momentumMax   = sys.momentumMax   ?? Math.max(0, 10 - impactCount);
  const momentumReset = sys.momentumReset ?? Math.max(0, 2 - impactCount);

  const healthMax  = debs.wounded ? 4 : 5;
  const spiritMax  = debs.shaken  ? 3 : 5;

  const currentHealth   = meterValue(sys.health);
  const currentSpirit   = meterValue(sys.spirit);
  const currentSupply   = meterValue(sys.supply);
  const currentMomentum = meterValue(sys.momentum);

  const updates = {};

  if (meterChanges.health !== undefined && meterChanges.health !== 0) {
    const next = clamp(currentHealth + meterChanges.health, 0, healthMax);
    updates['system.health.value'] = next;
  }

  if (meterChanges.spirit !== undefined && meterChanges.spirit !== 0) {
    const next = clamp(currentSpirit + meterChanges.spirit, 0, spiritMax);
    updates['system.spirit.value'] = next;
  }

  if (meterChanges.supply !== undefined && meterChanges.supply !== 0) {
    const next = clamp(currentSupply + meterChanges.supply, 0, 5);
    updates['system.supply.value'] = next;
  }

  if (meterChanges.momentum !== undefined && meterChanges.momentum !== 0) {
    const next = clamp(currentMomentum + meterChanges.momentum, momentumReset, momentumMax);
    updates['system.momentum.value']      = next;
    updates['system.momentum.max']        = momentumMax;
    updates['system.momentum.resetValue'] = momentumReset;
  }

  if (Object.keys(updates).length) {
    console.log(`actorBridge | applyMeterChanges update:`, updates);
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

  await actor.update({ [`system.debility.${debilityKey}`]: value });
  invalidateActorCache(actor.id);

  if (IMPACT_KEYS.includes(debilityKey)) {
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
  const current = sys.xp ?? 0;
  const max     = 30;
  const next    = Math.min(current + amount, max);

  if (next !== current) {
    await actor.update({ 'system.xp': next });
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
// CHARACTER ITEM REGISTRATION (Connections + Vows)
// ─────────────────────────────────────────────────────────────────────────────

const VALID_RANKS = ["troublesome", "dangerous", "formidable", "extreme", "epic"];

/**
 * Create a `progress`-typed Item on the character Actor representing a
 * Connection. The ironsworn character sheet's Connections tab is populated
 * by progress Items with any subtype other than "vow" or "progress" (see
 * vendor/foundry-ironsworn/.../sf-connections.vue), so we use "bond" to
 * match the system's own "+ Connection" button behaviour.
 *
 * Passes `{ suppressLog: true }` so the ironsworn preCreateItem chat-alert
 * hook does not emit an "Added <name>" emote message in chat — those
 * messages were leaking between narrator turns.
 *
 * Idempotent: if an Item flagged with this connection's id already exists
 * on the actor, returns it without creating a duplicate.
 *
 * @param {Actor} actor
 * @param {{ name: string, rank?: string, connectionId?: string }} data
 * @returns {Promise<Item|null>}
 */
export async function createCharacterBondItem(actor, data) {
  return createCharacterProgressItem(actor, {
    subtype:    "bond",
    name:       data?.name || "Unknown Connection",
    rank:       data?.rank,
    flagKey:    "connectionId",
    flagValue:  data?.connectionId ?? null,
  });
}

/**
 * Create a `progress`-typed Item on the character Actor representing a Vow.
 * The Connections tab filters subtype "vow" out — vows show up in the
 * Progress tab on the character sheet.
 *
 * @param {Actor} actor
 * @param {{ name: string, rank?: string, vowId?: string }} data
 * @returns {Promise<Item|null>}
 */
export async function createCharacterVowItem(actor, data) {
  return createCharacterProgressItem(actor, {
    subtype:    "vow",
    name:       data?.name || "Unnamed Vow",
    rank:       data?.rank,
    flagKey:    "vowId",
    flagValue:  data?.vowId ?? null,
  });
}

async function createCharacterProgressItem(actor, { subtype, name, rank, flagKey, flagValue }) {
  if (!actor) return null;
  const ItemCls = globalThis.Item;
  if (!ItemCls?.create) {
    console.warn(`actorBridge | Item.create unavailable; skipping ${subtype} registration on ${actor.id}`);
    return null;
  }

  // Idempotency — don't create a duplicate when called twice for the same
  // source record (e.g. confirm-from-draft then re-confirm).
  if (flagValue) {
    const existing = (actor.items?.contents ?? []).find(
      i => i.type === "progress"
        && i.flags?.[MODULE_ID]?.[flagKey] === flagValue,
    );
    if (existing) return existing;
  }

  const resolvedRank = VALID_RANKS.includes(rank) ? rank : "dangerous";

  try {
    const item = await ItemCls.create(
      {
        name,
        type:   "progress",
        system: { subtype, rank: resolvedRank, current: 0 },
        flags:  flagValue ? { [MODULE_ID]: { [flagKey]: flagValue } } : {},
      },
      { parent: actor, suppressLog: true },
    );
    invalidateActorCache(actor.id);
    return item ?? null;
  } catch (err) {
    console.error(`actorBridge | createCharacterProgressItem (${subtype}) failed:`, err);
    return null;
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

  const sys       = actor.system ?? {};
  const debs      = readDebilities(actor);
  const impactCount = countImpacts(debs);
  const maxMom    = sys.momentumMax   ?? Math.max(0, 10 - impactCount);
  const resetMom  = sys.momentumReset ?? Math.max(0, 2 - impactCount);
  const current   = meterValue(sys.momentum);
  const clamped   = clamp(current, resetMom, maxMom);

  const updates = {
    'system.momentum.max':        maxMom,
    'system.momentum.resetValue': resetMom,
  };
  if (clamped !== current) {
    updates['system.momentum.value'] = clamped;
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

function countImpacts(debs) {
  return IMPACT_KEYS.filter(k => debs[k]).length;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
