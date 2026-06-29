/**
 * STARFORGED COMPANION
 * src/moves/milestone.js — Reach a Milestone vow-selection logic.
 *
 * Pure orchestration mirroring developRelationship.js / vow.js: decide WHICH
 * vow a Reach a Milestone marks (and how many ticks), so the GM-gated pipeline
 * handler and the result-card suggestion button share one code path and the
 * logic stays unit-testable without Foundry.
 *
 * Vows are embedded `progress`-typed Items on the character Actor
 * (`system.subtype: "vow"`); this module operates on readVows() output
 * ({ id, name, rank, completed, ... }) so it never touches Foundry.
 *
 * Source: docs/rules-reference/playkit-rules-and-coverage.md §3.2 (Reach a
 *         Milestone — "no roll, mark progress on your vow per its rank").
 */

import { rankTicks, rankName } from "../schemas.js";

/**
 * Number of milestone marks a won challenge contributes to a track it's linked
 * to, scaled by the SOURCE challenge's rank (#241 "scale by difficulty"). The
 * per-mark amount is still the TARGET track's rank (milestoneTicks); this is the
 * count. Callers apply one fewer for a weak-hit win (min 1).
 *   troublesome 1 · dangerous 1 · formidable 2 · extreme 2 · epic 3
 *
 * @param {string|number} rank  source rank (e.g. the fight's, or the vow's)
 * @returns {number}
 */
export function marksForSourceRank(rank) {
  return { troublesome: 1, dangerous: 1, formidable: 2, extreme: 2, epic: 3 }[rankName(rank)] ?? 1;
}

/**
 * Categories whose successful moves are plausibly a step toward a quest, used
 * to gate the result-card "Reach a Milestone" suggestion button. The player is
 * the final fictional judge — the button is optional — so this is a deliberately
 * loose proxy that keeps the suggestion off combat / suffer / connection / fate
 * / session / recovery cards where it would only be noise.
 */
export const MILESTONE_SUGGEST_CATEGORIES = new Set(["adventure", "exploration"]);

/**
 * Vow / connection lifecycle moves that already handle their own progress and
 * must never themselves carry a milestone suggestion.
 */
const MILESTONE_EXCLUDE_MOVES = new Set([
  "reach_a_milestone", "fulfill_your_vow", "forsake_your_vow", "swear_an_iron_vow",
]);

/**
 * ticks for one mark at the vow's rank, defaulting to formidable (4) when the
 * rank is unknown. Delegates to schemas.rankTicks so a numeric ChallengeRank
 * (the form the live ironsworn schema stores) resolves the same as a string.
 *
 * @param {string|number} rank
 * @returns {number}
 */
export function milestoneTicks(rank) {
  return rankTicks(rank);
}

/**
 * Select the target vow for a Reach a Milestone.
 * Priority: exact name → substring (either direction) → sole open vow → null
 * (ambiguous: more than one open vow and no name match).
 *
 * @param {Array<{id,name,rank,completed}>} vows  — readVows() output
 * @param {string|null} target — vow name from interpretation.moveTarget
 * @returns {object|null}
 */
export function selectMilestoneVow(vows, target) {
  const open = (vows ?? []).filter(v => v && !v.completed);
  if (!open.length) return null;
  if (target) {
    const lo = String(target).toLowerCase().trim();
    if (lo) {
      const exact = open.find(v => (v.name ?? "").toLowerCase() === lo);
      if (exact) return exact;
      const sub = open.find(v => {
        const n = (v.name ?? "").toLowerCase();
        return n && (n.includes(lo) || lo.includes(n));
      });
      if (sub) return sub;
    }
  }
  return open.length === 1 ? open[0] : null;
}

/**
 * Plan a Reach a Milestone.
 *
 * @param {Array} vows — readVows() output
 * @param {string|null} target — interpretation.moveTarget (named vow)
 * @returns {{action:"none"}
 *          | {action:"mark", vow:object, ticks:number}
 *          | {action:"pick", vows:Array}}
 */
export function planReachMilestone(vows, target) {
  const open = (vows ?? []).filter(v => v && !v.completed);
  if (!open.length) return { action: "none" };
  const selected = selectMilestoneVow(open, target);
  if (selected) return { action: "mark", vow: selected, ticks: milestoneTicks(selected.rank) };
  return { action: "pick", vows: open };
}

/**
 * Decide whether a resolved move should carry a "Reach a Milestone" suggestion
 * button on its result card. Returns metadata to stash on the card flag, or
 * null when not eligible.
 *
 * Eligible when: the move is a HIT (strong or weak), is not a progress move,
 * is not itself a vow-lifecycle move, its category is quest-advancing
 * (MILESTONE_SUGGEST_CATEGORIES), and the character has at least one open vow.
 *
 * @param {Object} resolution
 * @param {Array} vows — readVows() output for the active character
 * @param {string|null} moveCategory — MOVES[moveId]?.category
 * @returns {{eligible:true, vowCount:number}|null}
 */
export function buildMilestoneSuggestion(resolution, vows, moveCategory) {
  if (!resolution) return null;
  if (resolution.isProgressMove) return null;
  if (resolution.outcome !== "strong_hit" && resolution.outcome !== "weak_hit") return null;
  if (MILESTONE_EXCLUDE_MOVES.has(resolution.moveId)) return null;
  if (!MILESTONE_SUGGEST_CATEGORIES.has(moveCategory)) return null;
  const open = (vows ?? []).filter(v => v && !v.completed);
  if (!open.length) return null;
  return { eligible: true, vowCount: open.length };
}
