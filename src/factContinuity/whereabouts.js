/**
 * STARFORGED COMPANION
 * src/factContinuity/whereabouts.js
 *
 * Where the people are (issue #393 D5–D7, overhaul 8 slices 2–3;
 * CHARACTERS-MOVED-BY-THE-NARRATION — the sixth live long haul's a64
 * narrated "The walk to the Hollow Spire docks takes the better part of the
 * morning" to find Tamsin, another settlement away). Read, never kept: there
 * is no store of anyone's whereabouts but this read.
 *
 *   - A person is where the session record last had them with the
 *     characters: the recorded place of the latest scene whose frame had them
 *     present (none — between places — for a scene that had no place). Their
 *     own LAST KNOWN location (a binding whereabouts the scene's end kept on
 *     their card, sceneLifecycle.js keepLastKnownWhereabouts) outranks it.
 *   - A beat whose line names a person elsewhere, or a recorded place other
 *     than the characters', is told so: the narration's NOT SO [whereabouts]
 *     (moves/contracts/obligations.js), the scene block's Elsewhere lines
 *     (narratorPrompt.js) and the reader's situation (readerSituation.js).
 *   - A person a narration drafted and the table has neither confirmed nor
 *     dismissed is tracked as a recorded person is (the maintainer's call
 *     after the eighth live round, PEOPLE-WAITING-AT-THE-ARRIVAL (c);
 *     pendingPeopleOf): read from the draft cards' pending rows, matched by
 *     their whole name — a draft's name is often a description, "Station
 *     Clerk", whose words are anyone's.
 *
 * The characters' own place is `currentLocationId` alone (D1).
 */

import { readRecord } from '../record/read.js';
import { resolveEntityById } from '../entities/registry.js';
import { collectAllEntities } from '../context/relevanceResolver.js';
import { placeNamedBy } from './sceneLifecycle.js';
import { personSaidIn, nameKey, personNameMatch } from '../entities/nameMatch.js';
import { pendingDraftRows } from '../entities/pendingDrafts.js';
import { getPlayerActors } from '../character/actorBridge.js';

const MODULE_ID = 'starforged-companion';

/** What a place can be: as `!at` names one — never a ship. */
const WHERE_TYPES = new Set(['settlement', 'planet', 'location']);

/** The people whose whereabouts are read: the NPC cards the roster holds (FOLDER-002 — `connection`). */
const PEOPLE_TYPES = new Set(['connection']);

/** Words of a draft's description-name that are anyone's ("Unknown Hatchway Figure", "Station Clerk"): never a trip word of theirs. */
const GENERIC_PERSON_WORDS = new Set(['unknown', 'unnamed', 'unidentified', 'mysterious', 'figure', 'stranger', 'newcomer',
  'silhouette', 'individual', 'operative', 'man', 'woman', 'person', 'voice', 'officer', 'clerk', 'hand', 'dockhand',
  'worker', 'guard', 'pilot', 'trader', 'hauler', 'from', 'with', 'second', 'first', 'old', 'young']);

/** At most this many people not yet on record are tracked a beat — the newest drafted first. */
const PENDING_PEOPLE_MAX = 8;

/** A place's words too common to trip the judge on their own ("the station"). */
const GENERIC_PLACE_WORDS = new Set(['the', 'station', 'port', 'outpost', 'base', 'colony', 'dock', 'docks', 'ring',
  'hub', 'point', 'prime', 'city', 'town', 'world', 'moon', 'planet', 'site', 'wreck', 'derelict', 'vault']);

/** At most this many people and places are told a beat. */
const ELSEWHERE_MAX = 4;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const lower = (s) => clean(s).toLowerCase();
const idOf = (e) => e?.journalId ?? e?._id ?? e?.id ?? null;

/**
 * Whether a person's name is said in a text: the whole name, or — unless
 * `exact`, a person not yet on record — a word of it of three letters or more
 * ("Tamsin" for Tamsin Okoro), as a whole word, the possessive too
 * (nameMatch.js personSaidIn, the one matcher). Pure.
 *
 * @param {string} text
 * @param {string} name
 * @param {{ exact?: boolean }} [opts]
 * @returns {boolean}
 */
export function nameSaidIn(text, name, { exact = false } = {}) {
  return personSaidIn(text, name, { exact });
}

/** Whether a place's whole name is said in a text, as whole words, any case. */
function placeSaidIn(text, name) {
  const n = lower(name);
  if (!n) return false;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(lower(text));
}

/**
 * The scene the record last had a person in with the characters (D5): the
 * latest scene of every session whose frames — its first and last, each
 * beat's — name them present. Its recorded place, or null for a scene begun
 * between places. Pure over a read record (record/read.js readRecord).
 *
 * @param {Object} read — readRecord({ session: 'campaign' })
 * @param {string} name
 * @param {{ exact?: boolean }} [opts] — the whole name only (a person not yet on record)
 * @returns {{ place: { id: string, type: string|null, name: string }|null, session: number|null, sceneId: string|null }|null}
 */
export function lastSeenWith(read, name, { exact = false } = {}) {
  if (!clean(name)) return null;
  const sessions = Array.isArray(read?.sessions) ? read.sessions : [];
  const present = (frame) => (Array.isArray(frame?.present) ? frame.present : []).some(p => nameSaidIn(p, name, { exact }));
  for (let s = sessions.length - 1; s >= 0; s--) {
    const session = sessions[s];
    const scenes = Array.isArray(session?.scenes) ? session.scenes : [];
    const beats = Array.isArray(session?.beats) ? session.beats.filter(b => !b?.removed) : [];
    for (let i = scenes.length - 1; i >= 0; i--) {
      const sc = scenes[i];
      const frames = [sc?.last, ...beats.filter(b => (b.scene ?? null) === (sc?.sceneId ?? null)).map(b => b.where).reverse(), sc?.where];
      if (!frames.some(present)) continue;
      const place = sc?.place?.id ? { id: sc.place.id, type: sc.place.type ?? null, name: clean(sc.place.name) } : null;
      return { place, session: Number.isFinite(session?.number) ? session.number : null, sceneId: sc?.sceneId ?? null };
    }
  }
  return null;
}

/**
 * A person's whereabouts (D5): their own LAST KNOWN location, which outranks
 * the record; else where the record last had them with the characters. The
 * place either names, when it names a recorded one. Never throws.
 *
 * @param {{ name: string, entityId?: string|null, exact?: boolean }} person — `exact`: a person not yet on record, matched by their whole name
 * @param {{ campaignState: Object, read?: Object|null }} ctx — `read`: the campaign's record, read once by the caller
 * @returns {{ where: string, placeId: string|null, placeName: string|null, from: 'last known'|'record', session: number|null }|null}
 */
export function whereaboutsOf(person, { campaignState, read = null } = {}) {
  try {
    const name = clean(person?.name);
    if (!name) return null;
    const known = person?.entityId ? resolveEntityById(person.entityId)?.data?.lastKnown?.location : null;
    const knownText = clean(known?.value);
    if (knownText) {
      const named = placeNamedBy(knownText, campaignState);
      const place = named && WHERE_TYPES.has(named.type) ? named : null;
      return { where: knownText, placeId: place?.id ?? null, placeName: place ? placeNameOf(place.id, campaignState) : null,
        from: 'last known', session: Number.isFinite(known?.sessionNum) ? known.sessionNum : null };
    }
    const seen = lastSeenWith(read, name, { exact: person?.exact === true });
    if (!seen) return null;
    return {
      where: seen.place?.name ? `at ${seen.place.name}` : 'with the characters, between places',
      placeId: seen.place?.id ?? null, placeName: seen.place?.name ?? null, from: 'record', session: seen.session,
    };
  } catch (err) {
    console.warn(`${MODULE_ID} | whereabouts: ${person?.name ?? 'someone'}'s were not read — told nothing:`, err?.message ?? err);
    return null;
  }
}

/** A recorded place's name now, by its id. */
function placeNameOf(id, campaignState) {
  const hit = collectAllEntities(campaignState).find(e => idOf(e) === id);
  return clean(hit?.name) || null;
}

/**
 * The people a narration drafted that the table has neither confirmed nor
 * dismissed, tracked as real until it does (the maintainer's call after the
 * eighth live round; entities/pendingDrafts.js — the draft cards' pending
 * person rows, the one store of them). The newest drafted first, one a name,
 * at most PENDING_PEOPLE_MAX: never a name the table dismissed, a player
 * character's (a detector's slip — round 8 drafted Mira Kestrel), or one a
 * recorded person goes by ("Clerk" for the Dock Clerk on record: that row is
 * theirs). Each is matched by its whole name (`exact`). Never throws.
 *
 * @param {Object} campaignState
 * @param {{ entities?: Object[]|null, messages?: Object[] }} [opts] — the roster, when the caller has read it; the chat log
 * @returns {Array<{ name: string, description: string, at: number|null, cardId: string|null, exact: true }>}
 */
export function pendingPeopleOf(campaignState, { entities = null, messages = undefined } = {}) {
  try {
    const recorded = (entities ?? collectAllEntities(campaignState ?? {}))
      .filter(e => PEOPLE_TYPES.has(e?.entityType) && clean(e.name)).map(e => clean(e.name));
    let pcs = [];
    try { pcs = getPlayerActors().map(a => clean(a?.name)).filter(Boolean); } catch { pcs = []; }
    const dismissed = new Set((campaignState?.dismissedEntities ?? []).filter(n => typeof n === 'string').map(nameKey));
    const out = [];
    const seen = new Set();
    for (const row of pendingDraftRows({ messages, type: 'connection' }).reverse()) {
      const key = nameKey(row.name);
      if (!key || seen.has(key) || dismissed.has(key)) continue;
      seen.add(key);
      if ([...recorded, ...pcs].some(n => nameKey(n) === key || personNameMatch(n, row.name))) continue;
      out.push({ name: clean(row.name), description: row.description, at: row.at, cardId: row.cardId, exact: true });
      if (out.length >= PENDING_PEOPLE_MAX) break;
    }
    return out;
  } catch (err) {
    console.warn(`${MODULE_ID} | whereabouts: the people not yet on record were not read — none tracked:`, err?.message ?? err);
    return [];
  }
}

/**
 * Who was with the characters when they set out on a journey (PEOPLE-WAITING-
 * AT-THE-ARRIVAL — the first-session re-records' dockmaster waiting at both
 * ends of both journeys): the present of the record's latest frame, the
 * scene they left. Read at the arrival's narration, before its own frame. Each
 * may have come along; no one else can be at the destination as they arrive.
 * Pure.
 *
 * @param {Object|null} read — readRecord({ session: 'campaign' })
 * @returns {string[]}
 */
export function departedWith(read) {
  const sessions = Array.isArray(read?.sessions) ? read.sessions : [];
  for (let s = sessions.length - 1; s >= 0; s--) {
    const session = sessions[s];
    const scenes = Array.isArray(session?.scenes) ? session.scenes : [];
    const beats = Array.isArray(session?.beats) ? session.beats.filter(b => !b?.removed) : [];
    for (let i = scenes.length - 1; i >= 0; i--) {
      const sc = scenes[i];
      const frames = [sc?.last, ...beats.filter(b => (b.scene ?? null) === (sc?.sceneId ?? null)).map(b => b.where).reverse(), sc?.where];
      const frame = frames.find(f => Array.isArray(f?.present));
      if (frame) return frame.present.filter(p => typeof p === 'string' && p.trim());
    }
  }
  return [];
}

/**
 * The place of the scene the record had under way at a moment — the scene
 * begun at or before it and not ended before it, in any session — for where
 * a person not yet on record came into the story (their draft card's time).
 * Null between places, before any scene, or with no record. Pure.
 *
 * @param {Object|null} read — readRecord({ session: 'campaign' })
 * @param {number|null} at
 * @returns {string|null} the place's name
 */
export function placeAtTime(read, at) {
  const t = Number(at);
  if (!Number.isFinite(t)) return null;
  let found = null;
  for (const session of Array.isArray(read?.sessions) ? read.sessions : []) {
    for (const sc of Array.isArray(session?.scenes) ? session.scenes : []) {
      if (Number(sc?.startedAt) <= t && (sc.endedAt == null || t <= Number(sc.endedAt))) found = sc;
    }
  }
  return clean(found?.place?.name) || null;
}

/**
 * What a beat is told of where things are (D5, D6): the characters' place,
 * and what the line names that is elsewhere — the recorded places other than
 * theirs it names whole, and the people it names whose whereabouts are
 * another place than the characters' (none for one present in the scene's
 * frame: they are here). Null when the line names nothing elsewhere. At most
 * ELSEWHERE_MAX of each. Never throws.
 *
 * @param {string} line — the beat's player words (or a move's line)
 * @param {Object} campaignState
 * @param {{ read?: Object|null, underway?: string }} [opts] — `read`: the campaign's record (default: read here);
 *   `underway`: the open expedition's label, when the characters are between places on it
 * @returns {{ here: string|null, underway: string|null, places: Array<{ id: string, name: string }>,
 *   people: Array<{ name: string, where: string, placeId: string|null, exact?: true }> }|null} — `exact`: a person not yet on record
 */
export function elsewhereOf(line, campaignState, { read = undefined, underway = '' } = {}) {
  try {
    const said = clean(line);
    if (!said || !campaignState) return null;
    const hereId = campaignState.currentLocationId ?? null;
    const entities = collectAllEntities(campaignState);
    const here = hereId ? clean(entities.find(e => idOf(e) === hereId)?.name) || null : null;

    const places = [];
    for (const e of entities) {
      if (!WHERE_TYPES.has(e?.entityType) || idOf(e) === hereId || !clean(e.name)) continue;
      if (placeSaidIn(said, e.name) && !places.some(p => p.id === idOf(e))) places.push({ id: idOf(e), name: clean(e.name) });
    }

    const frame = campaignState.sceneFrame;
    const presentNow = (name, exact) => (Array.isArray(frame?.present) ? frame.present : []).some(p => nameSaidIn(p, name, { exact }))
      && (frame?.sceneId ?? null) === (campaignState.currentSceneId ?? null);
    // The roster's people, and those not yet on record (whole names only).
    const named = [
      ...entities.filter(e => PEOPLE_TYPES.has(e?.entityType) && clean(e.name)).map(e => ({ name: clean(e.name), entityId: idOf(e) })),
      ...pendingPeopleOf(campaignState, { entities }).map(p => ({ name: p.name, entityId: null, exact: true })),
    ].filter(p => nameSaidIn(said, p.name, { exact: p.exact === true }) && !presentNow(p.name, p.exact === true));
    const people = [];
    if (named.length) {
      const record = read === undefined ? readRecord({ session: 'campaign' }) : read;
      for (const e of named) {
        const w = whereaboutsOf(e, { campaignState, read: record });
        // Elsewhere: at another recorded place, by LAST KNOWN or the record. A
        // whereabouts naming no recorded place ("in the medbay") may be here:
        // it is not told.
        if (!w?.placeId || w.placeId === hereId) continue;
        people.push({ name: e.name, where: w.where, placeId: w.placeId, ...(e.exact ? { exact: true } : {}) });
        if (w.placeId && w.placeName && !places.some(p => p.id === w.placeId)) places.push({ id: w.placeId, name: w.placeName });
      }
    }
    if (!places.length && !people.length) return null;
    return { here, underway: clean(underway) || null, places: places.slice(0, ELSEWHERE_MAX), people: people.slice(0, ELSEWHERE_MAX) };
  } catch (err) {
    console.warn(`${MODULE_ID} | whereabouts: what the line names elsewhere was not read — told nothing:`, err?.message ?? err);
    return null;
  }
}

/** What another place is for [here]'s certain check: a settlement or a planet. A location records no settlement (D3 as built), so it may be a spot within the characters' own. */
const OTHER_PLACE_TYPES = new Set(['settlement', 'planet']);

/** At most this many places and people ride on a beat's [here]. */
const HERE_MAX = 12;

/** A place's name with its generic trailing words dropped ("Bleakhold Station" → "bleakhold"), for telling one place within another's name. */
function placeCore(name) {
  const words = lower(name).split(' ');
  while (words.length > 1 && ['station', 'port', 'outpost', 'base', 'colony', 'hub', 'city', 'town', 'habitat', 'settlement', 'depot'].includes(words.at(-1))) words.pop();
  return words.join(' ');
}

/**
 * Where the record has the characters, for a beat of play's certain [here]
 * (CHARACTERS-MOVED-BY-THE-NARRATION, the seventh live round): their place
 * (`currentLocationId`), or the expedition they are on between places; every
 * other recorded settlement and planet; and every person — the roster's NPC
 * cards — whose whereabouts (whereaboutsOf) are one of those places. A place
 * whose name holds the characters' own, or is held in it, is not another
 * ("Hollow Spire docks" within "Hollow Spire"). The command vehicle's name
 * rides along: the prose's "you" may be told as their ship. Null when the
 * record has the characters nowhere. Never throws.
 *
 * @param {Object} campaignState
 * @param {{ read?: Object|null, underway?: string, vehicle?: string|null, arriving?: boolean }} [opts] — `read`: the
 *   campaign's record (default: read here); `underway`: the open expedition's label; `vehicle`: the command vehicle's
 *   name; `arriving`: a journey's arrival — its people are only those not with the characters when they set out
 *   (departedWith): one who was may have come along
 * @returns {{ here: string|null, hereId: string|null, underway: string|null, places: Array<{ id: string, name: string }>,
 *   people: Array<{ name: string, where: string, placeName: string|null, exact?: true }>, markers: string[] }|null} —
 *   `exact`: a person not yet on record, matched by their whole name
 */
export function hereOf(campaignState, { read = undefined, underway = '', vehicle = null, arriving = false } = {}) {
  try {
    if (!campaignState) return null;
    const hereId = campaignState.currentLocationId ?? null;
    const entities = collectAllEntities(campaignState);
    const here = hereId ? clean(entities.find(e => idOf(e) === hereId)?.name) || null : null;
    const way = here ? null : (clean(underway) || null);
    if (!here && !way) return null;
    const hereCore = here ? placeCore(here) : '';
    const within = (name) => {
      if (!hereCore) return false;
      const core = placeCore(name);
      return !!core && (hereCore.includes(core) || core.includes(hereCore));
    };
    const places = [];
    for (const e of entities) {
      const name = clean(e?.name);
      if (!OTHER_PLACE_TYPES.has(e?.entityType) || idOf(e) === hereId || !name || within(name)) continue;
      if (!places.some(p => p.id === idOf(e))) places.push({ id: idOf(e), name });
    }
    const people = [];
    // The roster's people, and those not yet on record (whole names only).
    const named = [
      ...entities.filter(e => PEOPLE_TYPES.has(e?.entityType) && clean(e.name)).map(e => ({ name: clean(e.name), entityId: idOf(e) })),
      ...pendingPeopleOf(campaignState, { entities }).map(p => ({ name: p.name, entityId: null, exact: true })),
    ];
    if (named.length && places.length) {
      const record = read === undefined ? readRecord({ session: 'campaign' }) : read;
      const leftWith = arriving ? departedWith(record) : [];
      for (const e of named) {
        if (leftWith.some(p => nameSaidIn(p, e.name, { exact: e.exact === true }))) continue;
        const w = whereaboutsOf(e, { campaignState, read: record });
        if (!w?.placeId || !places.some(p => p.id === w.placeId)) continue;
        people.push({ name: e.name, where: w.where, placeName: w.placeName ?? null, ...(e.exact ? { exact: true } : {}) });
        if (people.length >= HERE_MAX) break;
      }
    }
    return { here, hereId, underway: way, places: places.slice(0, HERE_MAX), people, markers: clean(vehicle) ? [clean(vehicle)] : [] };
  } catch (err) {
    console.warn(`${MODULE_ID} | whereabouts: where the record has the characters was not read — [here] not told:`, err?.message ?? err);
    return null;
  }
}

/**
 * The words that trip [whereabouts]'s judge (D6): the other places' names and
 * the people's, word by word (three letters or more), the possessive too. Pure.
 *
 * @param {{ places?: Array<{ name: string }>, people?: Array<{ name: string }> }|null} elsewhere
 * @returns {string[]}
 */
export function elsewhereWords(elsewhere) {
  const words = new Set();
  const add = (w) => words.add(w).add(`${w}'s`).add(`${w}’s`);
  for (const p of elsewhere?.places ?? []) {
    for (const w of lower(p?.name).split(/[^\p{L}\p{N}-]+/u)) if (w.length >= 3 && !GENERIC_PLACE_WORDS.has(w)) add(w);
  }
  for (const p of elsewhere?.people ?? []) {
    // A person not yet on record goes by a description: its words that are anyone's trip nothing.
    for (const w of lower(p?.name).split(/[^\p{L}\p{N}-]+/u)) if (w.length >= 3 && !(p?.exact && (GENERIC_PERSON_WORDS.has(w) || GENERIC_PLACE_WORDS.has(w)))) add(w);
  }
  return [...words];
}
