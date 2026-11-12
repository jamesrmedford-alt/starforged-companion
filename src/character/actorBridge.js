// src/character/actorBridge.js
// Single module responsible for all Ironsworn Actor reads and writes.
// No other module accesses the Actor directly — everything goes through here.
// This isolates the foundry-ironsworn API surface so system changes only require
// updates in one place.

import { rankName } from "../schemas.js";

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
// First 10 are the Starforged play-kit list; the next 3 are Ironsworn-classic
// extras the vendor system also tracks; the last 2 are the sheet's custom
// impacts (the vendor's `custom1` / `custom2` ImpactFields, named by
// `custom1name` / `custom2name`), which its #impactCount counts like any other
// (READDEBILITIES-CUSTOM-COMMENT).
const IMPACT_KEYS = [
  'wounded', 'shaken', 'unprepared',                  // misfortunes
  'permanentlyharmed', 'traumatized',                 // lasting effects
  'doomed', 'tormented', 'indebted',                  // burdens
  'battered', 'cursed',                               // current vehicle
  'corrupted', 'encumbered', 'maimed',                // vendor extras (Ironsworn classic)
  'custom1', 'custom2',                               // the sheet's custom impacts
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
 * The Pronouns field on a `character` Actor's sheet (`system.pronouns`),
 * trimmed — '' when it is empty. A PC's ride its snapshot
 * (readCharacterSnapshot); an NPC card's are read here by the entity registry,
 * whose getter takes them over the connection record's, and by the seed
 * (issue #335 Y13).
 *
 * @param {Actor|null} actor
 * @returns {string}
 */
export function readSheetPronouns(actor) {
  const value = actor?.system?.pronouns;
  return typeof value === 'string' ? value.trim() : '';
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
  const impactCount = countImpacts(sys.debility);
  const { max: momentumMax, reset: momentumReset } = momentumBounds(sys, impactCount);

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
    // The XP the Starforged sheet shows — from its legacies (issue #326 D3).
    xp: sheetXp(sys),
    assets:      readAssets(actor),
    vows:        readVows(actor),
    connections: readConnections(actor),
    grantedRewards: readGrantedRewards(actor),
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
 * Ability text lives in `abilities[].description` — the vendor
 * AssetAbilityField has name / enabled / description / clock fields and no
 * `text` (ASSET-ABILITY-TEXT). It is rich text (HTMLField) carrying
 * `@Compendium[…]{Face Danger}` move links, so HTML is stripped and each
 * link is reduced to its label to keep the prompt clean.
 *
 * @param {Actor} actor
 * @returns {Array<{ name: string, abilities: string[], description: string }>}
 */
export function readAssets(actor) {
  const items = actor?.items?.contents ?? actor?.items ?? [];
  const list = Array.isArray(items) ? items : [];
  return list
    .filter(i => i?.type === 'asset')
    .map(i => ({
      name:        i.name ?? '',
      description: stripHtml(i.system?.description ?? ''),
      abilities:   readAssetAbilityTexts(i),
    }));
}

/**
 * An asset Item's enabled abilities as plain text — what the asset does
 * (ASSET-ABILITY-TEXT: `abilities[].description`, HTML stripped and each
 * document link reduced to its label). `system.description` is deprecated
 * and empty on every canonical asset, so this is the text to describe one
 * by: readAssets' abilities, and the deck plan's module pins (issue #345
 * AA56).
 *
 * @param {Item} item — an `asset` Item (or its data)
 * @returns {string[]}
 */
export function readAssetAbilityTexts(item) {
  return (item?.system?.abilities ?? [])
    .filter(a => a?.enabled)
    .map(a => stripHtml(linkLabels(a?.description ?? '')))
    .filter(Boolean);
}

function stripHtml(s) {
  return String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** Reduce Foundry document links (`@Compendium[…]{Face Danger}`, `@UUID[…]{…}`) to their labels. */
function linkLabels(s) {
  return String(s ?? '').replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, '$1');
}

/**
 * The concrete rewards recorded on the character (recordGrantedReward —
 * gear, assets, contacts, knowledge), oldest first, for the narrator's
 * CHARACTER block (issue #286 C5: written, never read).
 *
 * @param {Actor} actor
 * @returns {Array<{ description: string, form: string }>}
 */
function readGrantedRewards(actor) {
  const list = actor?.flags?.[MODULE_ID]?.grantedRewards;
  return (Array.isArray(list) ? list : [])
    .filter(r => typeof r?.description === 'string' && r.description.trim())
    .map(r => ({ description: r.description.trim(), form: r.form ?? 'gear' }));
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
 * @returns {Array<{ id, name, rank, progress, ticks, completed, forsaken, isBackground }>}
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
      // The vendor stores rank as a ChallengeRank number (1 troublesome …
      // 5 epic); every consumer — the narrator, the milestone cards — wants
      // the name (issue #321 U62).
      rank:         rankName(v.system?.rank ?? 'dangerous'),
      ticks,
      progress:     Math.floor(ticks / 4),
      completed:    !!v.system?.completed,
      // Closed by Forsake Your Vow, not fulfilled (the flag the forsake
      // stamps on every copy) — a card refusing a closed vow words by it
      // (issue #345 AA51).
      forsaken:     v.flags?.[MODULE_ID]?.forsaken === true,
      isBackground: i === bgIdx,
      // Countdown clock (the deadline/threat running against the hero, e.g.
      // "Dani's captivity"), surfaced so the narrator can reference it and the
      // pipeline can advance it on a Pay the Price. null when the vow has none.
      clock:        hasClock
        ? { ticks: Number(v.system?.clockTicks ?? 0), max: Number(v.system?.clockMax ?? 0) }
        : null,
      // The vow's stable id across copies: every PC's copy of a shared vow
      // carries the same one (issue #321 U02 — a Fulfill Your Vow counts the
      // copies as one vow). null on a vow the module has not stamped yet.
      vowId:        v.flags?.[MODULE_ID]?.vowId ?? null,
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
 * @returns {Array<{ id, name, rank, progress, ticks, completed, lost }>}
 *   `lost`: the connection was severed (`!sever`) — no live bond
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
      rank:      rankName(b.system?.rank ?? 'dangerous'),   // the vendor's number → its name
      ticks,
      progress:  Math.floor(ticks / 4),
      completed: !!b.system?.completed,
      // The connection was severed: its record is `active: false`, written
      // through as this flag (setBondItemLost, issue #330 D10).
      lost:      b.flags?.[MODULE_ID]?.lost === true,
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
  // the vendor system also tracks — the impacts named by their key (the
  // narrator's "Impacts:" line lists these keys). The vendor schema's two
  // custom impacts (`custom1` / `custom2`, named on the sheet by `custom1name`
  // / `custom2name`) are not listed here, but they count toward the momentum
  // bounds as the vendor's #impactCount counts them (countImpacts reads the
  // sheet's debility — READDEBILITIES-CUSTOM-COMMENT).
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

/**
 * Momentum and its bounds, read live from the sheet (never the cached
 * snapshot): what a burn spends and resets to must match what the sheet
 * holds right now (issue #300 F03).
 * @param {Actor} actor
 * @returns {{ value: number, min: number, max: number, reset: number, impactCount: number }}
 */
export function readMomentumState(actor) {
  const sys = actor?.system ?? {};
  const impactCount = countImpacts(sys.debility);
  return {
    value: meterValue(sys.momentum),
    min:   MOMENTUM_MIN,
    ...momentumBounds(sys, impactCount),
    impactCount,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// WRITE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply meter changes (deltas) from a move resolution to the Actor.
 * Clamps all values to valid Ironsworn ranges — momentum to its effective
 * maximum (the base maximum less the marked impacts, momentumBounds).
 *
 * Only `system.momentum.value` is written. The effective max and reset used
 * to be written back into `system.momentum.max` / `resetValue` too — but
 * those are the BASE fields the vendor's `momentumMax` / `momentumReset`
 * getters subtract the impacts from, so each write deducted the impacts
 * again: with one impact, three successful moves took the maximum from 9 to
 * 6 and the reset to 0, and clearing the impact could not recover the bases
 * (issue #316 T01). The bases are the sheet's; the module never writes them.
 * @param {Actor} actor
 * @param {{ health?: number, spirit?: number, supply?: number, momentum?: number }} meterChanges
 * @returns {Promise<void>}
 */
export async function applyMeterChanges(actor, meterChanges) {
  if (!actor) return;

  const sys   = actor.system ?? {};
  const debs  = readDebilities(actor);
  const impactCount = countImpacts(sys.debility);
  const { max: momentumMax } = momentumBounds(sys, impactCount);

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
    updates['system.momentum.value'] = next;
  }

  if (Object.keys(updates).length) {
    console.log(`actorBridge | applyMeterChanges update:`, updates);
    await actor.update(updates);
    invalidateActorCache(actor.id);
  }
}

/**
 * Set or clear a single debility flag on the Actor.
 * An impact changes the effective momentum bounds (the system derives them
 * from the impacts): the current momentum is clamped to the new maximum.
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

// ── Legacy tracks on the sheet (issue #326 D3) ──────────────────────────────
//
// The Starforged character sheet's Legacies tab draws each legacy from the
// PC's own `system.legacies.<track>` — ticks ever marked: 40 a filled track,
// more past a clear (vendor subtypes/character.ts, legacy-track.vue) — and
// derives the XP earned from it (2 a box, 1 a box past the first 40 ticks),
// with `<track>XpSpent` the XP spent. The module's legacy tracks are shared by
// the crew (campaignState.legacyTracks, canonical); each PC's sheet mirrors
// them (src/multiplayer/sharedLegacies.js). `system.xp` is the classic sheet's
// field — the module no longer writes it.

/** The legacy tracks a Starforged sheet shows. */
export const SHEET_LEGACY_TRACKS = Object.freeze(['quests', 'bonds', 'discoveries']);

/**
 * A PC sheet's legacy track, as ticks ever marked (0 when unset).
 *
 * @param {Actor|null} actor
 * @param {"quests"|"bonds"|"discoveries"} track
 * @returns {number}
 */
export function readSheetLegacy(actor, track) {
  const v = Number(actor?.system?.legacies?.[track]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/**
 * Write a legacy track to a PC's sheet — the mirror of the shared track. A
 * value already there is not written again.
 *
 * @param {Actor} actor
 * @param {"quests"|"bonds"|"discoveries"} track
 * @param {number} progress — ticks ever marked
 * @param {Object} [options] — passed to Actor#update (the mirror marks its writes)
 * @returns {Promise<boolean>} whether a write was made
 */
export async function writeSheetLegacy(actor, track, progress, options = {}) {
  if (!actor || !SHEET_LEGACY_TRACKS.includes(track)) return false;
  const value = Math.max(0, Math.floor(Number(progress) || 0));
  if (readSheetLegacy(actor, track) === value) return false;
  await actor.update({ [`system.legacies.${track}`]: value }, options);
  invalidateActorCache(actor.id);
  return true;
}

/**
 * The XP a PC sheet shows: earned from its legacy tracks (2 a box, 1 a box
 * past the first 40 ticks — vendor legacy-track.vue), less the XP spent.
 *
 * @param {Object} sys — actor.system
 * @returns {{ value: number, earned: number, spent: number }}
 */
function sheetXp(sys) {
  let earned = 0;
  let spent  = 0;
  for (const track of SHEET_LEGACY_TRACKS) {
    const ticks = Math.max(0, Math.floor(Number(sys?.legacies?.[track]) || 0));
    earned += Math.min(Math.floor(ticks / 4), 10) * 2 + (ticks > 40 ? Math.floor((ticks - 40) / 4) : 0);
    spent  += Math.max(0, Math.floor(Number(sys?.legacies?.[`${track}XpSpent`]) || 0));
  }
  return { value: Math.max(0, earned - spent), earned, spent };
}

/**
 * The character's companions: `asset` Items whose `system.category` names
 * Companion, with an enabled condition track. A companion's health is that
 * track — `system.track.value` within `track.min..track.max` (vendor
 * src/module/item/subtypes/asset.ts: AssetConditionMeterField).
 *
 * @param {Actor|null} actor
 * @returns {Item[]}
 */
export function listCompanionAssets(actor) {
  const items = actor?.items?.contents ?? actor?.items ?? [];
  const list  = Array.isArray(items) ? items : [];
  return list.filter(i => i?.type === 'asset'
    && String(i.system?.category ?? '').toLowerCase().includes('companion')
    && i.system?.track?.enabled !== false);
}

/**
 * One companion: the one `itemId` names, else the character's only one —
 * null when there is none, or several and none named.
 *
 * @param {Actor|null} actor
 * @param {string|null} [itemId]
 * @returns {Item|null}
 */
export function getCompanionAsset(actor, itemId = null) {
  const companions = listCompanionAssets(actor);
  if (itemId) return companions.find(i => i.id === itemId) ?? null;
  return companions.length === 1 ? companions[0] : null;
}

/**
 * A companion asset's given name — the vendor asset's "Name" field
 * (`system.fields`: the name the player gives their Glowcat or Survey Bot) —
 * or null when it has none (COMPANION-GIVEN-NAME-UNREAD: a line naming the
 * companion by it matched nothing). Reads an array of `{ name, value }`, or
 * an object of them.
 *
 * @param {Item|null} item — a companion asset (listCompanionAssets)
 * @returns {string|null}
 */
export function companionGivenName(item) {
  const raw = item?.system?.fields;
  const fields = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
  const field = fields.find(f => String(f?.name ?? f?.label ?? '').trim().toLowerCase() === 'name');
  const value = typeof field?.value === 'string' ? field.value.trim() : '';
  return value || null;
}

/**
 * A companion's health (getCompanionAsset), or null when there is no such
 * companion.
 *
 * @param {Actor|null} actor
 * @param {string|null} [itemId]
 * @returns {number|null}
 */
export function readCompanionHealth(actor, itemId = null) {
  const companion = getCompanionAsset(actor, itemId);
  return companion ? Number(companion.system?.track?.value ?? 0) : null;
}

/**
 * A vehicle asset's integrity — its own condition track, the one its card
 * names Integrity (a support vehicle's: Hoverbike, Rover, Skiff …) — or null
 * when `itemId` names no such asset on `actor`. The Hoverbike's "add
 * +integrity" is that number (VALUE-ADD-INTEGRITY), as Glowcat's "add +its
 * health" is its companion's (readCompanionHealth).
 *
 * @param {Actor|null} actor
 * @param {string} itemId
 * @returns {number|null}
 */
export function readAssetIntegrity(actor, itemId) {
  const items = actor?.items?.contents ?? actor?.items ?? [];
  const asset = (Array.isArray(items) ? items : []).find(i => i?.type === 'asset' && i.id === itemId);
  const track = asset?.system?.track;
  if (!track || track.enabled === false || String(track.name ?? '').trim().toLowerCase() !== 'integrity') return null;
  return Number(track.value ?? 0);
}

/**
 * The character's support vehicles: `asset` Items with an enabled condition
 * track named Integrity (readAssetIntegrity's test — the vendor's Hoverbike,
 * Rover, Skiff, Shuttle, Snub Fighter, Service Pod and Exosuit, all category
 * "Support Vehicle"). A Command Vehicle asset is not one: it rides on the
 * starship Actor, and the command vehicle's integrity is its track
 * (readCommandVehicleIntegrity).
 *
 * @param {Actor|null} actor
 * @returns {Item[]}
 */
export function listSupportVehicleAssets(actor) {
  const items = actor?.items?.contents ?? actor?.items ?? [];
  return (Array.isArray(items) ? items : []).filter(i => i?.type === 'asset'
    && readAssetIntegrity(actor, i.id) !== null
    && !/command vehicle/i.test(String(i.system?.category ?? '')));
}

/**
 * A starship's command vehicle asset — the vendor's STARSHIP asset (category
 * "Command Vehicle") carrying its enabled condition track named Integrity —
 * or null for a starship that carries none.
 *
 * @param {Actor|null} shipActor — a `starship` Actor
 * @returns {Item|null}
 */
export function getCommandVehicleAsset(shipActor) {
  if (shipActor?.type !== 'starship') return null;
  const items = shipActor.items?.contents ?? shipActor.items ?? [];
  return (Array.isArray(items) ? items : []).find(i => i?.type === 'asset'
    && /command vehicle/i.test(String(i.system?.category ?? ''))
    && readAssetIntegrity(shipActor, i.id) !== null) ?? null;
}

/**
 * The command vehicle's integrity as its sheet holds it — the STARSHIP
 * asset's Integrity track, which the starship sheet's Assets tab shows, the
 * player marks and the vendor's own Withstand Damage rolls ("Vehicle
 * Integrity") — `{ value, min, max }`, or null for a starship that carries no
 * such asset. Canonical: the ship record's `integrity` is its write-through
 * mirror (entities/ship.js updateShip), read only for a starship with no
 * STARSHIP asset (issue #345 AA20 — the record alone was read and written, so
 * a loss the module applied never reached the sheet, and integrity marked on
 * the sheet was not what the next Withstand Damage rolled).
 *
 * @param {Actor|null} shipActor
 * @returns {{ value: number, min: number, max: number }|null}
 */
export function readCommandVehicleIntegrity(shipActor) {
  const asset = getCommandVehicleAsset(shipActor);
  if (!asset) return null;
  const track = asset.system.track;
  return { value: Number(track.value ?? 0), min: Number(track.min ?? 0), max: Number(track.max ?? 5) };
}

/**
 * What a ship record from before the STARSHIP asset's track became canonical
 * reconciles to (issue #347 AB08): the lower of the record's integrity and
 * the track's, within the track — or null for a record already reconciled
 * (`integritySheetReconciled`, set by every ship write since) or one with no
 * integrity of its own. Up to v1.8.0 the module applied its losses to the
 * record alone, so record 2 beside sheet 5 is damage the sheet never saw, and
 * reading — then mirroring — the sheet's 5 erased it from both stores. Every
 * reader of the command vehicle's integrity (registry withSheetNotes,
 * statEnrichment's +integrity) and its writer (entities/ship.js updateShip)
 * take this value until the first write reconciles the record; the GM's
 * world load makes that write (migrator.reconcileCommandVehicleIntegrity).
 *
 * @param {Object|null} record — the ship record as stored
 * @param {{ value: number, min: number, max: number }|null} sheet — readCommandVehicleIntegrity
 * @returns {number|null}
 */
export function unreconciledRecordIntegrity(record, sheet) {
  if (!sheet || !record || record.integritySheetReconciled === true) return null;
  const own = Number(record.integrity);
  if (record.integrity == null || !Number.isFinite(own)) return null;
  return clamp(Math.min(own, sheet.value), sheet.min, sheet.max);
}

/**
 * Write the command vehicle's integrity onto its STARSHIP asset's Integrity
 * track, kept within the track's min..max (readCommandVehicleIntegrity — the
 * canonical store). Throws when the world refuses the write: the ship
 * record's writer (entities/ship.js updateShip) reports it to its callers.
 *
 * @param {Actor} shipActor
 * @param {number} value
 * @returns {Promise<number|null>} the value now on the track, or null for a
 *   starship with no STARSHIP asset
 */
export async function setCommandVehicleIntegrity(shipActor, value) {
  const asset = getCommandVehicleAsset(shipActor);
  if (!asset) return null;
  const track = asset.system.track;
  const after = clamp(Number(value), Number(track.min ?? 0), Number(track.max ?? 5));
  if (after !== Number(track.value ?? 0)) await asset.update({ 'system.track.value': after });
  return after;
}

/**
 * Is this support vehicle battered? Its card's own Battered condition
 * (`system.conditions[]`, vendor asset.ts) — the "if your vehicle is not
 * battered" of Withstand Damage's +1 integrity. Null when `itemId` names no
 * support vehicle on `actor`.
 *
 * @param {Actor|null} actor
 * @param {string} itemId
 * @returns {boolean|null}
 */
export function readVehicleAssetBattered(actor, itemId) {
  const asset = listSupportVehicleAssets(actor).find(i => i.id === itemId);
  if (!asset) return null;
  return (asset.system?.conditions ?? [])
    .some(c => String(c?.name ?? '').trim().toLowerCase() === 'battered' && c?.ticked === true);
}

/**
 * Change a support vehicle's integrity — its Integrity track — by `delta`,
 * kept within the track's min..max: Withstand Damage's "+1 integrity" /
 * "-1 integrity" when the roll was the vehicle's (statEnrichment's
 * `vehicleItemId`). A rise is refused while the vehicle is battered, as the
 * ship record's writer refuses one (entities/ship.js changeIntegrity). The
 * sibling of applyCompanionHealthChange; reports, never throws.
 *
 * @param {Actor} actor
 * @param {number} delta
 * @param {{ itemId?: string|null }} [opts] — the vehicle asset
 * @returns {Promise<{ ok: boolean, itemId?: string, name?: string, before?: number, after?: number, reason?: "no-vehicle"|"battered"|"refused", error?: string }>}
 */
export async function applyVehicleAssetIntegrityChange(actor, delta, { itemId = null } = {}) {
  const asset = itemId ? listSupportVehicleAssets(actor).find(i => i.id === itemId) ?? null : null;
  if (!asset) {
    console.warn(`actorBridge | vehicle integrity: no support vehicle${itemId ? ` ${itemId}` : ''} on ${actor?.name ?? actor?.id ?? 'no actor'} — ${delta >= 0 ? '+' : ''}${delta} not applied.`);
    return { ok: false, reason: 'no-vehicle' };
  }
  const track  = asset.system?.track ?? {};
  const before = Number(track.value ?? 0);
  const at     = { itemId: asset.id, name: asset.name ?? null, before };
  if (delta > 0 && readVehicleAssetBattered(actor, asset.id)) return { ok: false, reason: 'battered', ...at };
  const after  = clamp(before + delta, Number(track.min ?? 0), Number(track.max ?? 5));
  if (after === before) return { ok: true, ...at, after };
  try {
    await asset.update({ 'system.track.value': after });
  } catch (err) {
    console.warn(`actorBridge | vehicle integrity: ${asset.name ?? asset.id} update failed:`, err?.message ?? err);
    return { ok: false, reason: 'refused', error: String(err?.message ?? err), ...at };
  }
  invalidateActorCache(actor.id);
  return { ok: true, ...at, after };
}

/**
 * Change a companion's health — its asset track — by `delta`, kept within
 * the track's min..max. Companion health went to applyMeterChanges, which
 * has no such meter and dropped it (issue #309 N03).
 *
 * @param {Actor} actor
 * @param {number} delta
 * @param {{ itemId?: string|null }} [opts] — the companion (getCompanionAsset)
 * @returns {Promise<{ ok: boolean, itemId?: string, name?: string, before?: number, after?: number, reason?: string, error?: string }>}
 */
export async function applyCompanionHealthChange(actor, delta, { itemId = null } = {}) {
  const companion = getCompanionAsset(actor, itemId);
  if (!companion) {
    console.warn(`actorBridge | companion health: no companion${itemId ? ` ${itemId}` : ''} on ${actor?.name ?? actor?.id ?? 'no actor'} — ${delta >= 0 ? '+' : ''}${delta} not applied.`);
    return { ok: false, reason: 'no-companion' };
  }
  const track  = companion.system?.track ?? {};
  const before = Number(track.value ?? 0);
  const after  = clamp(before + delta, Number(track.min ?? 0), Number(track.max ?? 5));
  const at     = { itemId: companion.id, name: companion.name ?? null, before };
  if (after === before) return { ok: true, ...at, after };
  try {
    await companion.update({ 'system.track.value': after });
  } catch (err) {
    console.warn(`actorBridge | companion health: ${companion.name ?? companion.id} update failed:`, err?.message ?? err);
    return { ok: false, reason: 'refused', error: String(err?.message ?? err), ...at };
  }
  invalidateActorCache(actor.id);
  return { ok: true, ...at, after };
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
  // A fulfilled vow is never marked: its track (and the shared copies the
  // sync hook mirrors) would move after the fulfilment (issue #331 X20).
  if (item.system?.completed) {
    console.warn(`actorBridge | markVowProgress: vow "${item.name ?? vowItemId}" is fulfilled — not marked.`);
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
 * Set a vow Item's progress and rank — Fulfill Your Vow's miss recommit
 * ("clear that number of progress boxes, raise the vow's rank by one" —
 * issue #330 D1). The rank is written the way the Item holds it: the
 * vendor's ChallengeRank number (1–5), or the name the module's creators
 * wrote.
 *
 * @param {Actor} actor
 * @param {string} vowItemId
 * @param {{ ticks: number, rank: string }} next — the rank by name
 * @returns {Promise<{ ok: boolean, reason?: "not-found"|"refused", error?: string }>}
 */
export async function setVowItemTrack(actor, vowItemId, { ticks, rank }) {
  const item = actor?.items?.find?.(i => i.id === vowItemId) ?? null;
  if (!item) {
    console.warn(`actorBridge | setVowItemTrack: vow item ${vowItemId} not found on actor ${actor?.id ?? "?"}`);
    return { ok: false, reason: "not-found" };
  }
  const stored  = item.system?.rank;
  const numeric = typeof stored === "number" || /^\d+$/.test(String(stored ?? ""));
  const rankIdx = VALID_RANKS.indexOf(rank);
  const patch   = { "system.current": Math.max(0, Math.min(Number(ticks) || 0, 40)) };
  if (rankIdx >= 0) patch["system.rank"] = numeric ? rankIdx + 1 : rank;
  try {
    await item.update(patch);
  } catch (err) {
    console.warn(`actorBridge | setVowItemTrack: the write was refused:`, err?.message ?? err);
    return { ok: false, reason: "refused", error: String(err?.message ?? err) };
  }
  invalidateActorCache(actor.id);
  return { ok: true };
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
 * True when `item` is a copy of the vow `vowId`: a progress Item carrying it
 * as its module `vowId` flag — or whose own id it is. A sheet-made vow's cards
 * name it by its Item id, and the createItem hook's stamp of that id as the
 * flag can fail, so matching the flag alone said "no character holds this
 * vow" while it was on the sheet (known-issues VOW-ID-NEVER-LANDED).
 *
 * @param {Item} item
 * @param {string} vowId
 * @returns {boolean}
 */
export function isVowCopy(item, vowId) {
  return !!vowId && item?.type === "progress"
    && (item.flags?.[MODULE_ID]?.vowId === vowId || item.id === vowId);
}

/**
 * The id that names a vow Item's copies (isVowCopy): its module `vowId` flag,
 * else its own Item id — what a sheet-made vow whose createItem stamp never
 * landed is named by (known-issues VOW-ID-NEVER-LANDED). A writer keyed on
 * the flag alone skipped such a vow: its reward's one-time claim never
 * flipped, so the reward was granted again (issue #342 Z54). Null for no item.
 *
 * @param {Item|null} item
 * @returns {string|null}
 */
export function vowCopyId(item) {
  return item?.flags?.[MODULE_ID]?.vowId ?? item?.id ?? null;
}

/**
 * Set the promised concrete reward (#241 Phase 2) on every copy of a shared vow,
 * found by its vowId (isVowCopy) across all player characters. GM-only (Item flag
 * writes). No-op when the vow or reward is missing.
 *
 * @param {string} vowId
 * @param {{ description: string, form: string, status?: string }} reward
 * @returns {Promise<{ ok: boolean, reason?: "refused"|"no-copy" }>} `ok` once
 *   every copy holds it. "refused": a copy's write was refused (each is still
 *   attempted) — a reward's status is its grant's claim, so a payoff must know
 *   when it did not land (issue #306 R04). "no-copy": no copy of the vow was
 *   found to hold it (issue #329 X07) — told apart, so a pick is never asked
 *   to retry what can never land (issue #336 Y27). Nothing to set is `ok`.
 */
export async function setSharedVowReward(vowId, reward) {
  if (!vowId || !reward?.description) return { ok: true };
  let refused = false;
  let copies = 0;
  for (const actor of getPlayerActors()) {
    const items = actor.items?.contents ?? (Array.isArray(actor.items) ? actor.items : []);
    for (const item of items) {
      if (isVowCopy(item, vowId) && item.setFlag) {
        copies += 1;
        await item.setFlag(MODULE_ID, "reward", { status: "promised", ...reward }).catch(err => {
          refused = true;
          console.warn(`${MODULE_ID} | setSharedVowReward failed:`, err?.message ?? err);
        });
      }
    }
  }
  if (refused) return { ok: false, reason: "refused" };
  return copies > 0 ? { ok: true } : { ok: false, reason: "no-copy" };
}

/**
 * Set the linked connection on a vow Item (found by its vowId, isVowCopy, across all
 * player characters), so fulfilling/advancing it deepens that bond (#248
 * B-link). GM-only (Item flag write). No-op when the vow or name is missing.
 *
 * @param {string} vowId
 * @param {string} connectionName
 * @returns {Promise<{ ok: boolean, reason?: "refused"|"no-copy"|"no-name" }>}
 *   whether the link landed (issue #329 X07 — a refusal was a console
 *   warning, and the card said "Linked"). "refused": a copy's write was
 *   refused (each is still attempted). "no-copy": no copy of the vow was
 *   found — told apart from a refusal, which a press can retry (issue #336
 *   Y27). "no-name": no connection named.
 */
export async function setVowLinkedConnection(vowId, connectionName) {
  if (!vowId) return { ok: false, reason: "no-copy" };
  if (!connectionName) return { ok: false, reason: "no-name" };
  let refused = false;
  let copies = 0;
  for (const actor of getPlayerActors()) {
    const items = actor.items?.contents ?? (Array.isArray(actor.items) ? actor.items : []);
    for (const item of items) {
      if (isVowCopy(item, vowId) && item.setFlag) {
        copies += 1;
        await item.setFlag(MODULE_ID, "linkedConnectionName", connectionName).catch(err => {
          refused = true;
          console.warn(`${MODULE_ID} | setVowLinkedConnection failed:`, err?.message ?? err);
        });
      }
    }
  }
  if (refused) return { ok: false, reason: "refused" };
  return copies > 0 ? { ok: true } : { ok: false, reason: "no-copy" };
}

/**
 * Record a granted concrete reward on the actor (#241 Phase 2) for the non-meter
 * forms (gear / asset / contact / knowledge) — appends to a module flag list so
 * the grant is tracked on the sheet. Meter forms (supply / momentum) use
 * applyMeterChanges instead. GM-only.
 *
 * @param {Actor} actor
 * @param {{ description: string, form?: string }} reward
 * @returns {Promise<boolean>} true once the record is written; false when
 *   there was no actor or reward to record, or the write was refused
 */
export async function recordGrantedReward(actor, reward) {
  if (!actor?.setFlag || !reward?.description) return false;
  const list = actor.flags?.[MODULE_ID]?.grantedRewards ?? [];
  try {
    await actor.setFlag(MODULE_ID, "grantedRewards", [
      ...list,
      { description: reward.description, form: reward.form ?? "gear" },
    ]);
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | recordGrantedReward failed:`, err?.message ?? err);
    return false;
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
 * The bond Items that mirror one connection, across every PC. An Item keyed
 * by `connectionId` (the connection record's `_id`, the entity id every
 * creator writes) matches that id alone: a same-named sibling keeps its own
 * track, and a renamed connection still finds its Item. The name is a
 * fallback for an Item with no key (seeded before the key existed), and only
 * when it is the actor's one unkeyed bond Item of that name — never one keyed
 * to another connection. The old `byId || byName` let a name override a
 * different explicit key, so developing one Sable wrote both Sables' Items
 * (issue #314 Q04).
 *
 * @param {{ connectionId?: string|null, name?: string|null }} keys
 * @returns {Array<{ actor: Actor, item: Item }>}
 */
function bondItemsFor({ connectionId = null, name = null } = {}) {
  const wanted  = String(name ?? "").trim().toLowerCase();
  const matches = [];
  for (const actor of getPlayerActors()) {
    const items = (actor.items?.contents ?? (Array.isArray(actor.items) ? actor.items : []))
      .filter(item => item?.type === "progress" && item.system?.subtype === "bond");
    const keyed = connectionId != null
      ? items.filter(item => item.flags?.[MODULE_ID]?.connectionId === connectionId)
      : [];
    if (keyed.length) {
      for (const item of keyed) matches.push({ actor, item });
      continue;
    }
    if (!wanted) continue;
    const unkeyed = items.filter(item => item.flags?.[MODULE_ID]?.connectionId == null
      && String(item.name ?? "").trim().toLowerCase() === wanted);
    if (unkeyed.length === 1) matches.push({ actor, item: unkeyed[0] });
  }
  return matches;
}

/**
 * Mirror a connection's relationship progress onto each PC's bond Item so the
 * vendor sheet's Connections tab shows the same track (BOND-ITEM-MIRROR fix —
 * the item was seeded at 0 and never advanced while the entity record moved).
 * `connectionId` is the connection record's `_id`; the Items it reaches are
 * bondItemsFor's.
 *
 * @param {{ connectionId?: string|null, name?: string|null }} keys
 * @param {number} ticks — absolute tick value (0–40) to set
 * @returns {Promise<number>} how many items were updated
 */
export async function setBondItemTicks(keys = {}, ticks) {
  const next  = Math.max(0, Math.min(Number(ticks) || 0, 40));
  let updated = 0;
  for (const { actor, item } of bondItemsFor(keys)) {
    if (Number(item.system?.current ?? 0) === next) continue;
    await item.update({ "system.current": next }).catch(err =>
      console.warn(`actorBridge | setBondItemTicks failed:`, err?.message ?? err));
    invalidateActorCache(actor.id);
    updated++;
  }
  return updated;
}

/**
 * Mirror a connection's loss onto each PC's bond Item: the record's
 * `active: false` (`!sever`, connection.loseConnection) written through as
 * `flags[MODULE].lost`, so CHARACTER STATE (readConnections) stops listing a
 * live bond the record says is lost (issue #330 D10). A module flag, not the
 * vendor's `system.completed` — the sheet shows that as a forged bond. The
 * Item stays on the sheet's Connections tab as its history. Same matching as
 * setBondItemTicks (bondItemsFor).
 *
 * @param {{ connectionId?: string|null, name?: string|null }} keys
 * @param {boolean} [lost=true]
 * @returns {Promise<number>} how many items were updated
 */
export async function setBondItemLost(keys = {}, lost = true) {
  let updated = 0;
  for (const { actor, item } of bondItemsFor(keys)) {
    if ((item.flags?.[MODULE_ID]?.lost === true) === lost) continue;
    await item.update({ [`flags.${MODULE_ID}.lost`]: lost }).catch(err =>
      console.warn(`actorBridge | setBondItemLost failed:`, err?.message ?? err));
    invalidateActorCache(actor.id);
    updated++;
  }
  return updated;
}

/**
 * Mirror a forged bond onto each PC's bond Item: the record's `bonded: true`
 * (Forge a Bond's hit, connection.forgeBond) written through as the vendor's
 * `system.completed` — what the sheet renders as a forged bond (issue #330
 * D10) and CHARACTER STATE reads (readConnections → "bonded"). The forge was
 * the one change of the record's bond state the mirror never saw (issue #342
 * Z57). Same matching as setBondItemTicks (bondItemsFor).
 *
 * @param {{ connectionId?: string|null, name?: string|null }} keys
 * @param {boolean} [forged=true]
 * @returns {Promise<number>} how many items were updated
 */
export async function setBondItemForged(keys = {}, forged = true) {
  let updated = 0;
  for (const { actor, item } of bondItemsFor(keys)) {
    if ((item.system?.completed === true) === forged) continue;
    await item.update({ "system.completed": forged }).catch(err =>
      console.warn(`actorBridge | setBondItemForged failed:`, err?.message ?? err));
    invalidateActorCache(actor.id);
    updated++;
  }
  return updated;
}

/**
 * Delete the bond Items keyed to one connection, across every PC — unless the
 * table has marked one (a tick, a forged bond, a loss), which is a use of the
 * connection: then none is deleted and `marked` is true. Only Items keyed by
 * `connectionId` are matched (bondItemsFor without a name), never an unkeyed
 * same-named one. The X-Card's removal of a connection its removed narration
 * created (connection.retractNarrationConnections — issue #338 D6(ii)).
 *
 * @param {{ connectionId: string }} keys
 * @returns {Promise<{ marked: boolean, deleted: number }>}
 */
export async function deleteUnmarkedBondItems({ connectionId } = {}) {
  if (!connectionId) return { marked: false, deleted: 0 };
  const items = bondItemsFor({ connectionId });
  const marked = items.some(({ item }) => Number(item.system?.current ?? 0) > 0
    || item.system?.completed === true || item.flags?.[MODULE_ID]?.lost === true);
  if (marked) return { marked: true, deleted: 0 };
  let deleted = 0;
  for (const { actor, item } of items) {
    await item.delete();
    invalidateActorCache(actor.id);
    deleted++;
  }
  return { marked: false, deleted };
}

/**
 * Mirror a connection's rank onto each PC's bond Item (NARR-BOND-RANK-STALE,
 * narrator-context audit 2026-07): the item's rank was seeded at creation and
 * never updated when the connection record's rank rose (develop-match /
 * !bond-match raise the record only), so CHARACTER STATE — which reads the
 * bond Item — showed the stale rank forever. Same matching as
 * setBondItemTicks (bondItemsFor).
 *
 * @param {{ connectionId?: string|null, name?: string|null }} keys
 * @param {string} rank — one of VALID_RANKS; anything else is ignored
 * @returns {Promise<number>} how many items were updated
 */
export async function setBondItemRank(keys = {}, rank) {
  if (!VALID_RANKS.includes(rank)) return 0;
  let updated = 0;
  for (const { actor, item } of bondItemsFor(keys)) {
    if (item.system?.rank === rank) continue;
    await item.update({ "system.rank": rank }).catch(err =>
      console.warn(`actorBridge | setBondItemRank failed:`, err?.message ?? err));
    invalidateActorCache(actor.id);
    updated++;
  }
  return updated;
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
 * Copies of one vow — the same module `vowId`: a shared vow has one copy per
 * PC, kept in lockstep by registerSharedVowSyncHook — are one clock. Pass one
 * `lockstep` Map through every PC's call of a single advance: the first copy
 * records the value it reached, and each later copy is set to that value
 * rather than advanced again from one the sync hook may already have moved
 * (issue #321 U55). A later copy already at that value is reported without a
 * write; one ahead of it is left alone. Each entry carries its `vowId` (null
 * for a vow without one), so a caller can report the vow once.
 *
 * @param {Actor} actor
 * @param {{ by?: number, lockstep?: Map<string, number>|null }} [opts]
 * @returns {Promise<Array<{name:string, ticks:number, max:number, triggered:boolean, itemId:string, actorId:string, vowId:string|null}>>}
 */
export async function advanceVowClocks(actor, { by = 1, lockstep = null } = {}) {
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
    const max    = Number(v.system?.clockMax ?? 0);
    const cur    = Number(v.system?.clockTicks ?? 0);
    const vowId  = v.flags?.[MODULE_ID]?.vowId ?? null;
    const target = vowId ? lockstep?.get(vowId) : undefined;
    let next;
    if (target !== undefined) {
      if (cur > target) continue;
      next = target;
    } else {
      if (!max || cur >= max) continue;
      next = Math.min(cur + by, max);
    }
    try {
      if (next !== cur) await v.update({ "system.clockTicks": next }, { suppressLog: true });
      if (vowId && target === undefined) lockstep?.set(vowId, next);
      advanced.push({ name: v.name ?? "Vow", ticks: next, max, triggered: next >= max, itemId: v.id, actorId: actor.id, vowId });
    } catch (err) {
      console.error(`actorBridge | advanceVowClocks failed for ${v.name ?? "vow"}:`, err);
    }
  }
  if (advanced.length) invalidateActorCache(actor.id);
  return advanced;
}

/**
 * Revert vow-clock ticks advanced by a Pay the Price that was subsequently
 * undone by a result upgrade (Burn Momentum, Improve Result). Each entry
 * specifies `{ actorId, itemId }`. Silently skips entries where the actor or
 * item cannot be found, or the clock is already at zero. GM-gated at the call
 * site.
 *
 * `opts.untriggered` collects each entry whose clock the landed rewind took
 * out of its full state — read on the Item as it is rewound, whoever's price
 * filled it (issue #342 Z46): the upgrade supersedes that clock's trigger
 * vignette (issue #338 D8).
 *
 * @param {Array<{actorId:string, itemId:string}>} entries
 * @param {{ untriggered?: Array<Object>|null }} [opts]
 * @returns {Promise<Array<Object>>} the entries whose write was refused — the
 *   upgrade reports them to the GMs with a Retry (issue #311 P06)
 */
export async function revertVowClocksForBurn(entries, { untriggered = null } = {}) {
  const failed = [];
  for (const entry of entries ?? []) {
    const { actorId, itemId } = entry;
    const actor = globalThis.game?.actors?.get?.(actorId);
    const item  = actor?.items?.find?.(i => i.id === itemId);
    if (!item) continue;
    const cur = Number(item.system?.clockTicks ?? 0);
    if (cur <= 0) continue;
    const max = Number(item.system?.clockMax ?? 0);
    try {
      await item.update({ "system.clockTicks": Math.max(0, cur - 1) });
      invalidateActorCache(actorId);
      if (Array.isArray(untriggered) && max > 0 && cur >= max) untriggered.push(entry);
    } catch (err) {
      console.warn(`actorBridge | revertVowClocksForBurn failed for item ${itemId}:`, err?.message ?? err);
      failed.push(entry);
    }
  }
  return failed;
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
 * Clamp the current momentum to the effective bounds after the impacts
 * changed. Called when a debility changes (setDebility, and the updateActor
 * hook for a sheet edit — index.js momentumRecalcRunsHere).
 *
 * The bounds themselves are not written: the system derives `momentumMax` /
 * `momentumReset` from the base fields and the marked impacts, so there is
 * nothing to recalculate on the sheet — and writing the derived values into
 * the bases compounded the impact deduction on every call (issue #316 T01).
 * Momentum already within the new maximum is left alone, with no write.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function recalculateMomentumBounds(actor) {
  if (!actor) return;

  const sys       = actor.system ?? {};
  const impactCount = countImpacts(sys.debility);
  const { max: maxMom } = momentumBounds(sys, impactCount);
  const current   = meterValue(sys.momentum);
  const clamped   = clamp(current, MOMENTUM_MIN, maxMom);
  if (clamped === current) return;

  await actor.update({ 'system.momentum.value': clamped });
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

// The marked impacts on a sheet's debility (`actor.system.debility`), the
// custom two included — what the vendor's #impactCount counts. readDebilities'
// map leaves the custom impacts out, so it is not what this counts.
function countImpacts(debility) {
  return IMPACT_KEYS.filter(k => !!debility?.[k]).length;
}

// The vendor's momentum limits (MomentumField: MAX, MIN, RESET_MIN) and base
// values. The base max and reset live on the sheet (`system.momentum.max`,
// `system.momentum.resetValue`, 10 and +2 unless edited); the EFFECTIVE values
// deduct the marked impacts.
const MOMENTUM_BASE_MAX   = 10;
const MOMENTUM_BASE_RESET = 2;

// Momentum max and reset (the burn target) for an impact count — EFFECTIVE
// values, read only. Prefers the vendor system's computed getters
// (#impactCount-driven) when present so a future schema change tracks
// automatically; otherwise the vendor's own formula over the sheet's base
// fields (play kit p.1: max 10 and reset +2, each reduced by 1 per impact).
// The one derivation of the bounds — the meter clamp, the snapshot and the
// burn preview all read it. Never written back to the sheet: the bases are
// what the getters subtract from (issue #316 T01).
function momentumBounds(sys, impactCount) {
  const baseMax   = Number.isFinite(sys.momentum?.max)        ? sys.momentum.max        : MOMENTUM_BASE_MAX;
  const baseReset = Number.isFinite(sys.momentum?.resetValue) ? sys.momentum.resetValue : MOMENTUM_BASE_RESET;
  const max   = sys.momentumMax   ?? clamp(baseMax - impactCount, MOMENTUM_MIN, MOMENTUM_BASE_MAX);
  const reset = sys.momentumReset ?? clamp(baseReset - impactCount, 0, baseMax);
  return { max, reset };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
