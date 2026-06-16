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
 *  1. Exact label match (case-insensitive, ignoring leading "the")
 *  2. Substring in either direction
 *  3. Fallback: single open combat track regardless of label
 *  4. null when ambiguous (multiple open, no match)
 *
 * @param {Array<{id,label,type,completed}>} allTracks
 * @param {string|null} label
 * @returns {object|null}
 */
export function selectCombatTrack(allTracks, label) {
  const open = allTracks.filter(t => t.type === 'combat' && !t.completed);
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
 * @param {{ moveTarget?: string|null, combatRank?: string|null, markCount?: number }} opts
 * @param {{ listTracks: Function, createTrack: Function, markProgress: Function }} deps
 * @returns {Promise<{track: object, created: boolean, marksApplied: number}>}
 */
export async function applyCombatProgress({ moveTarget, combatRank, markCount = 1 }, deps) {
  const { listTracks, createTrack, markProgress } = deps;

  const allTracks = await listTracks();
  let track   = selectCombatTrack(allTracks, moveTarget ?? null);
  let created = false;

  if (!track) {
    track = await createTrack({
      label: moveTarget ?? "Combat",
      type:  'combat',
      rank:  normalizeCombatRank(combatRank),
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
export async function finishCombat({ moveTarget }, deps) {
  const { listTracks, completeTrack } = deps;
  const allTracks = await listTracks();
  const track = selectCombatTrack(allTracks, moveTarget ?? null);
  if (!track) return null;
  const completed = await completeTrack(track.id);
  return { track: completed ?? track };
}
