/**
 * STARFORGED COMPANION
 * src/moves/nextMoveAdd.js — Take a Break's single-use "+1 on the next move"
 *
 * Take a Break → "Move on" (play kit: "you or an ally takes +1 on the next
 * move (not a progress move)") records `campaignState.nextMoveAdd` on the
 * canonical GM (applyTakeBreak in src/safety/sessionDialogs.js). The move
 * pipeline consumes it here on the next ACTION roll; progress moves and
 * no-roll moves (Reach a Milestone, session moves, …) leave it pending.
 */

import { moveRollKind } from "../schemas.js";

const MODULE_ID = "starforged-companion";

/**
 * True for a move rolled with the action die + a stat (the moves a +1 add
 * applies to). Progress moves and no-roll moves are excluded — the one
 * classification (schemas.js moveRollKind) the resolver rolls by too.
 *
 * @param {string} moveId
 * @returns {boolean}
 */
export function isActionRollMove(moveId) {
  return moveRollKind(moveId) === "action";
}

/**
 * Consume a pending Take a Break add for this move. Pure over its arguments:
 * returns the add (0 when none is pending or the move is not an action roll)
 * and deletes `nextMoveAdd` from the given campaignState when it is used.
 *
 * @param {Object} campaignState — the pipeline's working copy (mutated)
 * @param {string} moveId
 * @returns {number}
 */
export function takeNextMoveAdd(campaignState, moveId) {
  const grant = campaignState?.nextMoveAdd;
  const value = Number(grant?.value ?? 0);
  if (!grant || !(value > 0)) return 0;
  if (!isActionRollMove(moveId)) return 0;
  delete campaignState.nextMoveAdd;
  return value;
}

/**
 * Persist the consumption: re-read the latest campaignState and drop the
 * grant, so a later write of a stale copy cannot resurrect it. Runs on the
 * canonical GM (the move pipeline's client).
 *
 * @returns {Promise<void>}
 */
export async function clearPersistedNextMoveAdd() {
  try {
    const latest = game.settings.get(MODULE_ID, "campaignState") ?? {};
    if (!latest.nextMoveAdd) return;
    delete latest.nextMoveAdd;
    await game.settings.set(MODULE_ID, "campaignState", latest);
  } catch (err) {
    console.warn(`${MODULE_ID} | Take a Break: clearing the used +1 failed:`, err?.message ?? err);
  }
}
