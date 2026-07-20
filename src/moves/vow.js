/**
 * STARFORGED COMPANION
 * src/moves/vow.js — Vow lifecycle: Fulfill Your Vow track completion.
 *
 * Pure orchestration over injected deps — mirrors expedition.js so the
 * two progress-track lifecycles stay consistent.
 */

import { legacyRewardTicks } from "./expedition.js";


/**
 * Find the target vow track from a list of all progress tracks.
 * Priority: exact label match → substring → sole open vow.
 *
 * @param {Array} allTracks
 * @param {string|null} label  — vow name from interpretation.moveTarget
 * @returns {Object|null}
 */
export function selectVowTrack(allTracks, label) {
  const open = allTracks.filter(t => t.type === "vow" && !t.completed);
  if (!open.length) return null;
  if (label) {
    const lo = label.toLowerCase();
    const exact = open.find(t => t.label?.toLowerCase() === lo);
    if (exact) return exact;
    const sub = open.find(
      t => t.label?.toLowerCase().includes(lo) || lo.includes(t.label?.toLowerCase() ?? ""),
    );
    if (sub) return sub;
  }
  return open.length === 1 ? open[0] : null;
}

/**
 * Finish a vow: locate the open track, complete it, return the legacy ticks
 * owed. `ranksDown` applies the weak-hit penalty (one rank lower).
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
  const track = selectVowTrack(all, moveTarget);
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
