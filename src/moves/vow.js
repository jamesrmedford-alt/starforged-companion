/**
 * STARFORGED COMPANION
 * src/moves/vow.js — Vow lifecycle: Fulfill Your Vow track completion.
 *
 * Pure orchestration over injected deps — mirrors expedition.js so the
 * two progress-track lifecycles stay consistent.
 */

import { legacyRewardTicks } from "./expedition.js";
import { wholeWordsFit } from "../context/relevanceResolver.js";


/**
 * Find the target vow track from a list of all progress tracks.
 * Priority: exact label match → one inside the other as whole words (issue
 * #325 W30) → sole open vow. `byNameOnly` drops the last rung when a label
 * is given: a name no track carries selects none.
 *
 * @param {Array} allTracks
 * @param {string|null} label  — vow name from interpretation.moveTarget
 * @param {{ byNameOnly?: boolean }} [opts]
 * @returns {Object|null}
 */
export function selectVowTrack(allTracks, label, { byNameOnly = false } = {}) {
  const open = allTracks.filter(t => t.type === "vow" && !t.completed);
  if (!open.length) return null;
  if (label) {
    const lo = label.toLowerCase();
    const exact = open.find(t => t.label?.toLowerCase() === lo);
    if (exact) return exact;
    const sub = open.find(t => wholeWordsFit(t.label?.toLowerCase() ?? "", lo));
    if (sub) return sub;
    if (byNameOnly) return null;
  }
  return open.length === 1 ? open[0] : null;
}

/**
 * Finish a vow: locate the open track, complete it, return the legacy ticks
 * owed. `ranksDown` applies the weak-hit penalty (one rank lower).
 *
 * A named vow closes only a track of that name. Completing a track is a
 * costly guess (rules/reachability.md §6): in a world with pre-2026-07
 * journal vow tracks, fulfilling an Item-only vow fell to the sole-open rung
 * and completed another vow's journal twin, paid its legacy and posted
 * "⚑ Vow Fulfilled" for it (issue #326 W44). The sole open track stands in
 * only when no name is given.
 *
 * Pure orchestration — all I/O goes through injected deps.
 *
 * @param {{ moveTarget:string|null, ranksDown?:number }} move
 * @param {{ listTracks:Function, completeTrack:Function }} deps
 * @returns {Promise<{ track:Object, legacyTicks:number }|null>}
 */
export async function finishVow({ moveTarget, ranksDown = 0 }, deps) {
  if (!deps?.listTracks || !deps?.completeTrack) return null;
  const all   = await deps.listTracks();
  const track = selectVowTrack(all, moveTarget, { byNameOnly: true });
  if (!track) return null;
  const completed = await deps.completeTrack(track.id);
  return { track: completed ?? track, legacyTicks: legacyRewardTicks(track.rank, ranksDown) };
}

/**
 * Pure: does a Fulfill Your Vow resolution earn its vow's connection payoff +
 * promised reward (#248 B2)? True only on a hit — the vow is fulfilled, so the
 * linked bond deepens and the reward is delivered (scaled by outcome). A miss
 * pays nothing (the vow isn't fulfilled). Used by the native-sheet fulfil hook.
 *
 * @param {{ moveId: string, outcome: string }} resolution
 * @returns {boolean}
 */
export function shouldPayFulfilledVow({ moveId, outcome } = {}) {
  return moveId === "fulfill_your_vow"
    && (outcome === "strong_hit" || outcome === "weak_hit");
}
