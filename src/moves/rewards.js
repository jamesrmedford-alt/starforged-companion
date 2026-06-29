/**
 * STARFORGED COMPANION
 * src/moves/rewards.js — stakes & rewards stated up front (#241)
 *
 * Phase 1: pure helpers that render the rules-defined payoff of a ranked vow /
 * combat / connection track — progress-per-milestone and the legacy reward on
 * completion — so the stakes are visible the moment the track is created.
 * (Phase 2 adds the AI-proposed concrete reward + grant-by-form here.)
 */

import { RANK_TICKS, rankName } from "../schemas.js";
import { legacyRewardTicks } from "./expedition.js";

const BOX_TICKS = 4;

/**
 * How much one milestone advances a track of the given rank, in plain language
 * (e.g. "Rank dangerous — each milestone marks 2 boxes (8 ticks) of progress.").
 * Pure.
 *
 * @param {string|number} rank
 * @returns {string}
 */
export function progressPerMilestoneLine(rank) {
  const name    = rankName(rank);
  const perMark = RANK_TICKS[name] ?? 4;
  const boxes   = perMark / BOX_TICKS;
  const amount  = boxes >= 1
    ? `${boxes} box${boxes === 1 ? "" : "es"} (${perMark} ticks)`
    : `${perMark} tick${perMark === 1 ? "" : "s"}`;
  return `Rank ${name} — each milestone marks ${amount} of progress.`;
}

/**
 * The legacy reward earned on completing a ranked track (vows → Quests,
 * expeditions → Discoveries). Pure.
 *
 * @param {string|number} rank
 * @param {string} legacyLabel  "Quests" | "Discoveries"
 * @returns {string}
 */
export function legacyRewardLine(rank, legacyLabel) {
  const name   = rankName(rank);
  const strong = legacyRewardTicks(name, 0);
  const weak   = legacyRewardTicks(name, 1);
  return `On fulfilment: +${strong} ${legacyLabel} legacy tick${strong === 1 ? "" : "s"} (strong hit) · +${weak} (weak hit).`;
}
