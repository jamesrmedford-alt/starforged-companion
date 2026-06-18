/**
 * STARFORGED COMPANION
 * src/moves/vow.js — Vow lifecycle: Fulfill Your Vow track completion.
 *
 * Pure orchestration over injected deps — mirrors expedition.js so the
 * two progress-track lifecycles stay consistent.
 */

import { EXPEDITION_RANKS, legacyRewardTicks } from "./expedition.js";

export const VOW_RANKS = EXPEDITION_RANKS;

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
