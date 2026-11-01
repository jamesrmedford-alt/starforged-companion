/**
 * STARFORGED COMPANION
 * src/moves/nextMoveAdd.js — single-use "+1 on the next move" adds
 *
 * Two kinds, both added by the move pipeline to an ACTION roll (progress
 * moves and no-roll moves — Reach a Milestone, session moves, … — leave them
 * pending):
 *
 *  - Take a Break → "Move on" (play kit: "you or an ally takes +1 on the next
 *    move (not a progress move)") records the table-wide
 *    `campaignState.nextMoveAdd` on the canonical GM (applyTakeBreak in
 *    src/safety/sessionDialogs.js); the next action roll takes it, whoever
 *    makes it (takeNextMoveAdd).
 *  - "+1 on your next move" — Secure an Advantage's strong hit (beside its +2
 *    momentum), its weak-hit pick and Gain Ground's — is the roller's own:
 *    `campaignState.nextMoveBonuses[actorId]`, granted on the canonical GM
 *    (grantNextMoveBonus: the move's other effects, a choice card's pick) and
 *    taken by that character's next action roll (consumeNextMoveBonus). It
 *    was a reminder card nothing applied (issue #322 V02; maintainer decision
 *    2026-11-01).
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

// ─────────────────────────────────────────────────────────────────────────────
// The roller's "+1 on your next move" (issue #322 V02)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a "+1 on your next move" for a character, onto the latest stored
 * campaignState (no await between the read and the write — the field is
 * store-owned, persistResolution's merge keeps the store's value). Two
 * pending grants add up. Runs on the canonical GM: a choice card's pick and a
 * move's other effects are applied there. A write the world refuses throws,
 * so the caller can report it.
 *
 * @param {string|null} actorId — the character who earned it
 * @param {number} amount
 * @param {string|null} [source] — the move that granted it, for the record
 * @returns {Promise<{ ok: boolean, value?: number, reason?: string }>}
 */
export async function grantNextMoveBonus(actorId, amount, source = null) {
  const add = Math.floor(Number(amount));
  if (typeof actorId !== "string" || !actorId || !(add > 0)) return { ok: false, reason: "invalid" };
  const latest  = game.settings.get(MODULE_ID, "campaignState") ?? {};
  const bonuses = { ...(latest.nextMoveBonuses ?? {}) };
  const prev    = bonuses[actorId];
  const value   = Math.max(0, Math.floor(Number(prev?.value ?? 0)) || 0) + add;
  bonuses[actorId] = {
    value,
    sources: [...(Array.isArray(prev?.sources) ? prev.sources : []), ...(source ? [source] : [])],
    setAt:   new Date().toISOString(),
  };
  await game.settings.set(MODULE_ID, "campaignState", { ...latest, nextMoveBonuses: bonuses });
  return { ok: true, value };
}

/**
 * Take a character's pending "+1 on your next move" for this move. Only an
 * action roll takes it. It is claimed on the store before it is added: a
 * refused write adds nothing and leaves it pending for the next roll, so it is
 * never added twice. The pipeline's working copy drops it too.
 *
 * @param {Object|null} campaignState — the pipeline's working copy (mutated)
 * @param {string|null} actorId — the roller
 * @param {string} moveId
 * @returns {Promise<number>} the add (0 when none is pending or taken)
 */
export async function consumeNextMoveBonus(campaignState, actorId, moveId) {
  if (typeof actorId !== "string" || !actorId || !isActionRollMove(moveId)) return 0;
  let latest;
  try {
    latest = game.settings.get(MODULE_ID, "campaignState") ?? {};
  } catch {
    return 0;
  }
  const value = Math.floor(Number(latest.nextMoveBonuses?.[actorId]?.value ?? 0));
  if (!(value > 0)) return 0;
  const bonuses = { ...latest.nextMoveBonuses };
  delete bonuses[actorId];
  try {
    await game.settings.set(MODULE_ID, "campaignState", { ...latest, nextMoveBonuses: bonuses });
  } catch (err) {
    console.warn(`${MODULE_ID} | next-move bonus: taking ${actorId}'s +${value} was refused — not added, still pending:`, err?.message ?? err);
    return 0;
  }
  if (campaignState?.nextMoveBonuses?.[actorId]) {
    campaignState.nextMoveBonuses = { ...campaignState.nextMoveBonuses };
    delete campaignState.nextMoveBonuses[actorId];
  }
  return value;
}
