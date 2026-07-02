// src/character/actorBridge.js
// Single module responsible for all Ironsworn Actor reads and writes.
// No other module accesses the Actor directly — everything goes through here.
// This isolates the foundry-ironsworn API surface so system changes only require
// updates in one place.

const MODULE_ID = "starforged-companion";

// Hard floor for momentum during regular play. Matches the Starforged play kit
// ("MOMENTUM: -6 TO +10") and the vendor system's `MomentumField.MIN`. Note
// this is distinct from `momentumReset` — reset is the value momentum is set
// to when burned (starts at +2, drops with impacts) and is NOT a clamp floor.
const MOMENTUM_MIN = -6;

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
 * Get all player character Actors in the world.
 *
 * Returns every `character`-type Actor that is NOT a Companion NPC/connection
 * card (distinguished by the module `entityType` flag under FOLDER-002).
 * Includes characters regardless of whether they are assigned to a player user
 * or only to the GM — a PC played by the GM is still a PC and must appear in
 * CHARACTER STATE, the recap pipeline, and momentum grants.
 *
 * Previous versions filtered by `hasPlayerOwner === true` in multi-user games,
 * which excluded GM-assigned PCs and caused the narrator to treat them as
 * unknown connections in 3-player sessions.
 *
 * @returns {Actor[]}
 */
export function getPlayerActors() {
  return game.actors?.filter(isPlayerCharacterActor) ?? [];
}

/**
 * True when an Actor is a real player character: a `character`-type Actor that
 * is NOT one of the Companion's NPC/connection cards. NPC cards are `character`
 * actors too (FOLDER-002), tagged with a module `entityType` flag; PCs carry no
 * such flag. Use this anywhere a "this is a PC" decision is made so NPC cards
 * stay out of PC-only logic.
 *
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isPlayerCharacterActor(actor) {
  return actor?.type === 'character' && !actor?.flags?.[MODULE_ID]?.entityType;
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
    assets:      readAssets(actor),
    vows:        readVows(actor),
    connections: readConnections(actor),
    notes:       stripHtml(sys.notes ?? ''),
    biography:   stripHtml(sys.biography ?? ''),
    callsign:    String(sys.callsign ?? '').trim(),
    pronouns:    String(sys.pronouns ?? '').trim(),
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
 * Read the character's progress-typed vow Items (foundry-ironsworn stores
 * vows as `type: "progress"` with `system.subtype: "vow"`) and return them
 * as plain-data snapshots. The first item in actor.items.contents is the
 * earliest one created; we surface it as `isBackground: true` so the
 * narrator context can spotlight the founding vow.
 *
 * Starforged's play-kit character sheet has a labelled "BACKGROUND VOW"
 * area but the system has no dedicated field for it — the convention
 * across the foundry-ironsworn community is to create the founding vow
 * as the first vow item on the character. This helper makes that
 * convention explicit.
 *
 * @param {Actor} actor
 * @returns {Array<{ id, name, rank, progress, ticks, completed, isBackground }>}
 */
export function readVows(actor) {
  const items = actor?.items?.contents ?? actor?.items ?? [];
  const list  = Array.isArray(items) ? items : [];
  const vows  = list.filter(i => i?.type === 'progress' && i?.system?.subtype === 'vow');

  // The founding/background vow is the SHARED inciting vow (flags.sharedVow),
  // not merely the first-created one — sidestepping the suggested vow and
  // authoring your own (then deleting the suggested) must not silently relabel
  // which vow is "background" (#248 B1). Fall back to the first vow (the
  // foundry-ironsworn community convention) only when no shared vow exists.
  const sharedIdx = vows.findIndex(v => v?.flags?.[MODULE_ID]?.sharedVow === true);
  const bgIdx     = sharedIdx >= 0 ? sharedIdx : 0;

  return vows.map((v, i) => {
    const ticks = Number(v.system?.progress ?? v.system?.current ?? 0);
    const hasClock = v.system?.hasClock === true;
    return {
      id:           v.id ?? v._id ?? null,
      name:         v.name ?? '',
      rank:         v.system?.rank ?? 'dangerous',
      ticks,
      progress:     Math.floor(ticks / 4),
      completed:    !!v.system?.completed,
      isBackground: i === bgIdx,
      // Countdown clock (the deadline/threat running against the hero, e.g.
      // "Dani's captivity"), surfaced so the narrator can reference it and the
      // pipeline can advance it on a Pay the Price. null when the vow has none.
      clock:        hasClock
        ? { ticks: Number(v.system?.clockTicks ?? 0), max: Number(v.system?.clockMax ?? 0) }
        : null,
    };
  });
}

/**
 * Read the character's connection (bond) progress Items. foundry-ironsworn
 * stores connections the module auto-creates (and manual bonds) as
 * `type: "progress"` with `system.subtype: "bond"`, mirroring vows. Surfaced
 * so the narrator knows who the character is bonded to — answers like
 * "who am I" / "who do I know" need this.
 *
 * @param {Actor} actor
 * @returns {Array<{ id, name, rank, progress, ticks, completed }>}
 */
export function readConnections(actor) {
  const items = actor?.items?.contents ?? actor?.items ?? [];
  const list  = Array.isArray(items) ? items : [];
  const bonds = list.filter(i => i?.type === 'progress' && i?.system?.subtype === 'bond');

  return bonds.map(b => {
    const ticks = Number(b.system?.progress ?? b.system?.current ?? 0);
    return {
      id:        b.id ?? b._id ?? null,
      name:      b.name ?? '',
      rank:      b.system?.rank ?? 'dangerous',
      ticks,
      progress:  Math.floor(ticks / 4),
      completed: !!b.system?.completed,
    };
  });
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
    const next = clamp(currentMomentum + meterChanges.momentum, MOMENTUM_MIN, momentumMax);
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
 * Write the character's combat position to actor.system.combatPosition.
 * Accepts the vendor schema values: 'inControl' | 'inABadSpot' | 'none' | ''.
 * Silently ignores invalid values rather than writing garbage to the actor.
 * @param {Actor} actor
 * @param {string} position
 * @returns {Promise<void>}
 */
export async function setCombatPosition(actor, position) {
  if (!actor) return;
  const VALID = ['inControl', 'inABadSpot', 'none', ''];
  const value = VALID.includes(position) ? position : 'none';
  await actor.update({ 'system.combatPosition': value });
  invalidateActorCache(actor.id);
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

  // foundry-ironsworn's ProgressModel is a strict TypeDataModel whose progress
  // field is `system.current` (a ProgressTicksField, 0–40) — there is NO
  // `system.progress`, so writing it is silently dropped by schema validation
  // and the vow never advances on the live sheet. Read `current` (with a legacy
  // `progress` fallback for any pre-DataModel data) and write `current`.
  const current  = Number(item.system?.current ?? item.system?.progress ?? 0);
  const next     = Math.min(current + ticks, 40);

  if (next !== current) {
    await item.update({ 'system.current': next });
    invalidateActorCache(actor.id);
  }
}

/**
 * Mark an embedded vow Item completed (Fulfill Your Vow hit). The pipeline's
 * fulfil branch calls this so item-stored vows — the live store for inciting,
 * shared, and hand-made vows — actually close when fulfilled through the move
 * pipeline, not only via the native sheet.
 *
 * @param {Actor} actor
 * @param {string} vowItemId
 * @returns {Promise<boolean>} true when the item was newly marked completed
 */
export async function completeVowItem(actor, vowItemId) {
  if (!actor || !vowItemId) return false;

  const item = actor.items?.find(i => i.id === vowItemId);
  if (!item) {
    console.warn(`actorBridge | completeVowItem: vow item ${vowItemId} not found on actor ${actor.id}`);
    return false;
  }
  if (item.system?.completed === true) return false; // already closed

  await item.update({ 'system.completed': true });
  invalidateActorCache(actor.id);
  return true;
}


/**
 * Set the promised concrete reward (#241 Phase 2) on every copy of a shared vow,
 * found by its vowId flag across all player characters. GM-only (Item flag
 * writes). No-op when the vow or reward is missing.
 *
 * @param {string} vowId
 * @param {{ description: string, form: string, status?: string }} reward
 * @returns {Promise<void>}
 */
export async function setSharedVowReward(vowId, reward) {
  if (!vowId || !reward?.description) return;
  for (const actor of getPlayerActors()) {
    const items = actor.items?.contents ?? (Array.isArray(actor.items) ? actor.items : []);
    for (const item of items) {
      if (item?.type === "progress" && item.flags?.[MODULE_ID]?.vowId === vowId && item.setFlag) {
        await item.setFlag(MODULE_ID, "reward", { status: "promised", ...reward }).catch(err =>
          console.warn(`${MODULE_ID} | setSharedVowReward failed:`, err?.message ?? err));
      }
    }
  }
}

/**
 * Set the linked connection on a vow Item (found by its vowId flag across all
 * player characters), so fulfilling/advancing it deepens that bond (#248
 * B-link). GM-only (Item flag write). No-op when the vow or name is missing.
 *
 * @param {string} vowId
 * @param {string} connectionName
 * @returns {Promise<void>}
 */
export async function setVowLinkedConnection(vowId, connectionName) {
  if (!vowId || !connectionName) return;
  for (const actor of getPlayerActors()) {
    const items = actor.items?.contents ?? (Array.isArray(actor.items) ? actor.items : []);
    for (const item of items) {
      if (item?.type === "progress" && item.flags?.[MODULE_ID]?.vowId === vowId && item.setFlag) {
        await item.setFlag(MODULE_ID, "linkedConnectionName", connectionName).catch(err =>
          console.warn(`${MODULE_ID} | setVowLinkedConnection failed:`, err?.message ?? err));
      }
    }
  }
}

/**
 * Record a granted concrete reward on the actor (#241 Phase 2) for the non-meter
 * forms (gear / asset / contact / knowledge) — appends to a module flag list so
 * the grant is tracked on the sheet. Meter forms (supply / momentum) use
 * applyMeterChanges instead. GM-only.
 *
 * @param {Actor} actor
 * @param {{ description: string, form?: string }} reward
 * @returns {Promise<void>}
 */
export async function recordGrantedReward(actor, reward) {
  if (!actor?.setFlag || !reward?.description) return;
  const list = actor.flags?.[MODULE_ID]?.grantedRewards ?? [];
  await actor.setFlag(MODULE_ID, "grantedRewards", [
    ...list,
    { description: reward.description, form: reward.form ?? "gear" },
  ]).catch(err => console.warn(`${MODULE_ID} | recordGrantedReward failed:`, err?.message ?? err));
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
 * Optional `clock` attaches the sheet-native clock to the vow (progress
 * items carry `system.hasClock` / `clockTicks` / `clockMax` — verified
 * against vendor progress-sheet.vue; sizes 4/6/8/10/12). Used by the
 * inciting-incident ⚔ Swear this vow flow for time-dependent vows (F4).
 *
 * @param {Actor} actor
 * @param {{ name: string, rank?: string, vowId?: string,
 *           clock?: { max: number } | null }} data
 * @returns {Promise<Item|null>}
 */
export async function createCharacterVowItem(actor, data) {
  return createCharacterProgressItem(actor, {
    subtype:    "vow",
    name:       data?.name || "Unnamed Vow",
    rank:       data?.rank,
    flagKey:    "vowId",
    flagValue:  data?.vowId ?? null,
    clock:      data?.clock ?? null,
    // Shared inciting vows are created on every PC and kept in lockstep; the
    // sharedVow flag lets the sync hook find sibling copies (see swearVow.js).
    // linkedConnectionName records the connection a vow serves (#241) so
    // fulfilling/advancing it can offer to deepen that bond.
    extraFlags: (data?.shared || data?.linkedConnectionName)
      ? {
          ...(data?.shared ? { sharedVow: true } : {}),
          ...(data?.linkedConnectionName ? { linkedConnectionName: data.linkedConnectionName } : {}),
        }
      : null,
  });
}

const VALID_CLOCK_MAX = [4, 6, 8, 10, 12];

async function createCharacterProgressItem(actor, { subtype, name, rank, flagKey, flagValue, clock = null, extraFlags = null }) {
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

  const system = { subtype, rank: resolvedRank, current: 0 };
  if (clock && Number.isFinite(Number(clock.max))) {
    system.hasClock   = true;
    system.clockTicks = 0;
    system.clockMax   = VALID_CLOCK_MAX.includes(Number(clock.max)) ? Number(clock.max) : 6;
  }

  const moduleFlags = {
    ...(flagValue ? { [flagKey]: flagValue } : {}),
    ...(extraFlags ?? {}),
  };

  try {
    const item = await ItemCls.create(
      {
        name,
        type:   "progress",
        system,
        flags:  Object.keys(moduleFlags).length ? { [MODULE_ID]: moduleFlags } : {},
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

/**
 * Advance the countdown clock on the character's active vows by one segment
 * each. A vow's clock (system.hasClock / clockTicks / clockMax) is the deadline
 * or threat running against the hero — e.g. the inciting incident's "Dani's
 * captivity" clock. It advances when the fiction turns against the hero; the
 * move pipeline calls this on a Pay the Price (playtest finding #10: the vow
 * clock never moved on a miss). Vows with no clock, an already-full clock, or
 * marked completed are skipped. Returns what advanced, for the chat summary.
 *
 * @param {Actor} actor
 * @param {{ by?: number }} [opts]
 * @returns {Promise<Array<{name:string, ticks:number, max:number, triggered:boolean}>>}
 */
export async function advanceVowClocks(actor, { by = 1 } = {}) {
  if (!actor) return [];
  const items = actor.items?.contents ?? actor.items ?? [];
  const list  = Array.isArray(items) ? items : [];
  const vows  = list.filter(
    i => i?.type === "progress"
      && i?.system?.subtype === "vow"
      && i?.system?.hasClock === true
      && !i?.system?.completed,
  );

  const advanced = [];
  for (const v of vows) {
    const max = Number(v.system?.clockMax ?? 0);
    const cur = Number(v.system?.clockTicks ?? 0);
    if (!max || cur >= max) continue;
    const next = Math.min(cur + by, max);
    try {
      await v.update({ "system.clockTicks": next }, { suppressLog: true });
      advanced.push({ name: v.name ?? "Vow", ticks: next, max, triggered: next >= max, itemId: v.id, actorId: actor.id });
    } catch (err) {
      console.error(`actorBridge | advanceVowClocks failed for ${v.name ?? "vow"}:`, err);
    }
  }
  if (advanced.length) invalidateActorCache(actor.id);
  return advanced;
}

/**
 * Revert vow-clock ticks advanced by a Pay the Price that was subsequently
 * undone by burning momentum. Each entry specifies `{ actorId, itemId }`.
 * Silently skips entries where the actor or item cannot be found, or the
 * clock is already at zero. GM-gated at the call site.
 *
 * @param {Array<{actorId:string, itemId:string}>} entries
 */
export async function revertVowClocksForBurn(entries) {
  if (!entries?.length) return;
  for (const { actorId, itemId } of entries) {
    const actor = globalThis.game?.actors?.get?.(actorId);
    const item  = actor?.items?.find?.(i => i.id === itemId);
    if (!item) continue;
    const cur = Number(item.system?.clockTicks ?? 0);
    if (cur <= 0) continue;
    try {
      await item.update({ "system.clockTicks": Math.max(0, cur - 1) });
      invalidateActorCache(actorId);
    } catch (err) {
      console.error(`actorBridge | revertVowClocksForBurn failed for item ${itemId}:`, err);
    }
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
  const clamped   = clamp(current, MOMENTUM_MIN, maxMom);

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
