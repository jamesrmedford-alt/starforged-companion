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
 *
 * The characters' own place is `currentLocationId` alone (D1).
 */

import { readRecord } from '../record/read.js';
import { resolveEntityById } from '../entities/registry.js';
import { collectAllEntities } from '../context/relevanceResolver.js';
import { placeNamedBy } from './sceneLifecycle.js';

const MODULE_ID = 'starforged-companion';

/** What a place can be: as `!at` names one — never a ship. */
const WHERE_TYPES = new Set(['settlement', 'planet', 'location']);

/** The people whose whereabouts are read: the NPC cards the roster holds (FOLDER-002 — `connection`). */
const PEOPLE_TYPES = new Set(['connection']);

/** A place's words too common to trip the judge on their own ("the station"). */
const GENERIC_PLACE_WORDS = new Set(['the', 'station', 'port', 'outpost', 'base', 'colony', 'dock', 'docks', 'ring',
  'hub', 'point', 'prime', 'city', 'town', 'world', 'moon', 'planet', 'site', 'wreck', 'derelict', 'vault']);

/** At most this many people and places are told a beat. */
const ELSEWHERE_MAX = 4;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const lower = (s) => clean(s).toLowerCase();
const idOf = (e) => e?.journalId ?? e?._id ?? e?.id ?? null;

/**
 * Whether a person's name is said in a text: the whole name, or a word of it
 * of three letters or more ("Tamsin" for Tamsin Okoro), as a whole word, the
 * possessive too. Pure.
 *
 * @param {string} text
 * @param {string} name
 * @returns {boolean}
 */
export function nameSaidIn(text, name) {
  const t = ` ${lower(text).replace(/['’]s\b/g, '').replace(/[^\p{L}\p{N}'’\s-]+/gu, ' ')} `;
  const n = lower(name);
  if (!n || !t.trim()) return false;
  return [n, ...n.split(/\s+/).filter(w => w.length >= 3)].some(w => t.includes(` ${w} `));
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
 * @returns {{ place: { id: string, type: string|null, name: string }|null, session: number|null, sceneId: string|null }|null}
 */
export function lastSeenWith(read, name) {
  if (!clean(name)) return null;
  const sessions = Array.isArray(read?.sessions) ? read.sessions : [];
  const present = (frame) => (Array.isArray(frame?.present) ? frame.present : []).some(p => nameSaidIn(p, name));
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
 * @param {{ name: string, entityId?: string|null }} person
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
    const seen = lastSeenWith(read, name);
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
 *   people: Array<{ name: string, where: string, placeId: string|null }> }|null}
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
    const presentNow = (name) => (Array.isArray(frame?.present) ? frame.present : []).some(p => nameSaidIn(p, name))
      && (frame?.sceneId ?? null) === (campaignState.currentSceneId ?? null);
    const named = entities.filter(e => PEOPLE_TYPES.has(e?.entityType) && clean(e.name) && nameSaidIn(said, e.name) && !presentNow(e.name));
    const people = [];
    if (named.length) {
      const record = read === undefined ? readRecord({ session: 'campaign' }) : read;
      for (const e of named) {
        const w = whereaboutsOf({ name: e.name, entityId: idOf(e) }, { campaignState, read: record });
        // Elsewhere: at another recorded place, by LAST KNOWN or the record. A
        // whereabouts naming no recorded place ("in the medbay") may be here:
        // it is not told.
        if (!w?.placeId || w.placeId === hereId) continue;
        people.push({ name: clean(e.name), where: w.where, placeId: w.placeId });
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
    for (const w of lower(p?.name).split(/[^\p{L}\p{N}-]+/u)) if (w.length >= 3) add(w);
  }
  return [...words];
}
