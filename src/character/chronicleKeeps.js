// src/character/chronicleKeeps.js
//
// Which resolved moves the Chronicle keeps whatever the scribe rates them
// (issue #374 A5).
//
// The scribe rates each beat it writes, and an entry below the Chronicle's
// floor ("notable") is not kept. Over three live runs it rated every resolved
// move "scene" — five of five, both arrivals at a settlement among them — so
// a session of four rolls left the Chronicle empty, and the campaign recap,
// which is written from the Chronicle alone, was not written at all.
//
// A model rating its own work is not what decides whether a session's turning
// points are on record. A move whose result changes something lasting is kept
// whatever its rating: a track brought to its end (a vow fulfilled, a bond
// forged, a fight decided, an expedition finished), a vow sworn or forsaken,
// an arrival, a connection made, a brush with the end, and a miss that paid
// its price. The scribe still writes the entry and still rates it; the rating
// only decides the beats that are none of these.
//
// Pure: a move id and an outcome, so a single move (its resolution) and a
// Batch Mode round's entry (its narration input) are read the same way.

import { moveRollKind } from '../schemas.js';
import { missPaysPrice } from '../moves/resolver.js';

/** Moves that change something lasting on any outcome. */
const LASTING_WHATEVER_THE_OUTCOME = Object.freeze({
  swear_an_iron_vow: 'a vow sworn',
  forsake_your_vow:  'a vow forsaken',
  face_death:        'a brush with death',
  face_desolation:   'a brush with desolation',
});

/** Moves that change something lasting when they hit. */
const LASTING_ON_A_HIT = Object.freeze({
  set_a_course:      'an arrival',
  make_a_connection: 'a connection made',
});

/** What a progress move brings to its end, by move. */
const TRACK_ENDED = Object.freeze({
  fulfill_your_vow:     'a vow brought to its end',
  forge_a_bond:         'a bond put to the test',
  take_decisive_action: 'a fight decided',
  finish_an_expedition: 'an expedition finished',
  finish_the_scene:     'a scene challenge finished',
  overcome_destruction: 'a ship or a self on the edge of destruction',
  continue_a_legacy:    'a legacy continued',
});

const HITS = new Set(['strong_hit', 'weak_hit']);

/**
 * What a resolved move changed that lasts, in a few words — or null when the
 * scribe's rating decides whether its entry is kept.
 *
 * @param {{ moveId?: string|null, outcome?: string|null }|null} move — a
 *   resolution, or a round entry's narration input (`kind: "move"`)
 * @returns {string|null}
 */
export function lastingChangeOf(move) {
  const moveId  = typeof move?.moveId === 'string' ? move.moveId : '';
  const outcome = typeof move?.outcome === 'string' ? move.outcome : null;
  if (!moveId) return null;
  if (moveRollKind(moveId) === 'progress') return TRACK_ENDED[moveId] ?? 'a track brought to its end';
  if (Object.hasOwn(LASTING_WHATEVER_THE_OUTCOME, moveId)) return LASTING_WHATEVER_THE_OUTCOME[moveId];
  if (Object.hasOwn(LASTING_ON_A_HIT, moveId) && HITS.has(outcome)) return LASTING_ON_A_HIT[moveId];
  if (outcome === 'miss' && missPaysPrice(moveId)) return 'a miss, and its price paid';
  return null;
}

/**
 * The first lasting change among a round's rolled entries — a Batch Mode
 * round writes one Chronicle entry, and it is kept when any of its moves is.
 *
 * @param {Array<{ input?: Object }>} entries — the round's narration entries
 * @returns {string|null}
 */
export function roundLastingChange(entries) {
  for (const e of Array.isArray(entries) ? entries : []) {
    const change = e?.input?.kind === 'move' ? lastingChangeOf(e.input) : null;
    if (change) return change;
  }
  return null;
}
