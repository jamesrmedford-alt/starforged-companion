/**
 * STARFORGED COMPANION
 * src/moves/combat.js — Combat lifecycle orchestration (audit 3.24–3.27)
 *
 * Mirrors expedition.js for combat fights: resolve-or-create the combat
 * progress track, mark progress the correct number of times per move, and
 * complete the track when the fight ends. All track writes go through the
 * progressTracks flag-array (never the vestigial actor `progress` Item path).
 *
 * Dependency-injected for testability (listTracks / createTrack / markProgress
 * / completeTrack are passed in from index.js so tests can stub them).
 *
 * Source: docs/rules-reference/playkit-rules-and-coverage.md §3.3
 */

import { EXPEDITION_RANKS } from "./expedition.js";

export const COMBAT_RANKS = EXPEDITION_RANKS; // same rank ladder: troublesome…epic
export const DEFAULT_COMBAT_RANK = "dangerous";

/**
 * Validate + normalise a combat rank string.
 * Falls back to DEFAULT_COMBAT_RANK on any invalid input.
 */
export function normalizeCombatRank(rank) {
  if (rank && COMBAT_RANKS.includes(rank)) return rank;
  return DEFAULT_COMBAT_RANK;
}

/**
 * Find the combat track most likely associated with a given foe/scene label.
 *
 * Resolution order (mirrors selectExpeditionTrack):
 *  0. The track's id, when the caller knows it (a Progress Tracks panel row) —
 *     an open fight with that id, else null: never a same-named sibling
 *     (issue #306 R06)
 *  1. Exact label match (case-insensitive, ignoring leading "the")
 *  2. Substring in either direction
 *  3. Fallback: single open combat track regardless of label
 *  4. null when ambiguous (multiple open, no match)
 *
 * @param {Array<{id,label,type,completed}>} allTracks
 * @param {string|null} label
 * @param {{ trackId?: string|null }} [opts]
 * @returns {object|null}
 */
export function selectCombatTrack(allTracks, label, { trackId = null } = {}) {
  const open = allTracks.filter(t => t.type === 'combat' && !t.completed);
  if (typeof trackId === 'string' && trackId) return open.find(t => t.id === trackId) ?? null;
  if (!open.length) return null;

  if (label) {
    const norm = s => s.toLowerCase().replace(/^the\s+/, '').trim();
    const needle = norm(label);
    const exact  = open.find(t => norm(t.label) === needle);
    if (exact) return exact;
    const sub = open.find(t => norm(t.label).includes(needle) || needle.includes(norm(t.label)));
    if (sub) return sub;
  }

  return open.length === 1 ? open[0] : null;
}

/**
 * Resolve-or-create the combat track, then mark progress `markCount` times.
 *
 * A move's marks create a track only when no fight is open (issue #321 U16):
 * with two or more open and none selected — an unnamed Strike or Clash (the
 * interpreter is not asked for their target), or a name matching none — the
 * selector's null means "ambiguous", not "none", and creating made a phantom
 * "Combat" fight that took the marks and the position. A fight named by id
 * (a "Which fight?" pick) is that open fight or nothing — over, it is not
 * re-created. Nothing is marked then: `track` is null and `reason` says why
 * ("ambiguous" | "gone"); the pipeline asks which fight before rolling.
 * Entering the fray (`beginsFight`, the threshold card) begins a fight: a foe
 * no open fight matches is a new one, however many are open.
 *
 * @param {{ moveTarget?: string|null, moveTargetId?: string|null, combatRank?: string|null,
 *   markCount?: number, beginsFight?: boolean }} opts
 * @param {{ listTracks: Function, createTrack: Function, markProgress: Function }} deps
 * @returns {Promise<{track: object|null, created: boolean, marksApplied: number, reason?: string}>}
 */
export async function applyCombatProgress(
  { moveTarget, moveTargetId = null, combatRank, markCount = 1, objective = null, linkedVowName = null, beginsFight = false },
  deps,
) {
  const { listTracks, createTrack, markProgress } = deps;

  const allTracks = await listTracks();
  let track   = selectCombatTrack(allTracks, moveTarget ?? null, { trackId: moveTargetId });
  let created = false;

  if (!track && moveTargetId) {
    return { track: null, created: false, marksApplied: 0, reason: "gone" };
  }
  if (!track && !beginsFight && allTracks.some(t => t.type === 'combat' && !t.completed)) {
    return { track: null, created: false, marksApplied: 0, reason: "ambiguous" };
  }

  if (!track) {
    track = await createTrack({
      label:         moveTarget ?? "Combat",
      type:          'combat',
      rank:          normalizeCombatRank(combatRank),
      objective,        // #241 stakes/link, captured at Enter the Fray
      linkedVowName,
    });
    created = true;
  }

  let marksApplied = 0;
  for (let i = 0; i < markCount; i++) {
    const updated = await markProgress(track.id);
    if (updated) { track = updated; marksApplied++; }
  }

  return { track, created, marksApplied };
}

/**
 * Complete (close out) the active combat track for the given objective/label.
 * Called when the fight ends — Take Decisive Action on a hit, or Face Defeat.
 *
 * @param {{ moveTarget?: string|null }} opts
 * @param {{ listTracks: Function, completeTrack: Function }} deps
 * @returns {Promise<{track: object}|null>}
 */
export async function finishCombat({ moveTarget, moveTargetId = null }, deps) {
  const { listTracks, completeTrack } = deps;
  const allTracks = await listTracks();
  const track = selectCombatTrack(allTracks, moveTarget ?? null, { trackId: moveTargetId });
  if (!track) return null;
  const completed = await completeTrack(track.id);
  return { track: completed ?? track };
}
