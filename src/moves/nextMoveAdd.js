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
 *    makes it (consumeNextMoveAdd — claimed on the store before it is added,
 *    issue #342 Z52).
 *  - "+1 on your next move" — Secure an Advantage's strong hit (beside its +2
 *    momentum), its weak-hit pick and Gain Ground's — is the roller's own:
 *    `campaignState.nextMoveBonuses[actorId]`, granted on the canonical GM
 *    (grantNextMoveBonus: the move's other effects, a choice card's pick) and
 *    taken by that character's next action roll (consumeNextMoveBonus). It
 *    was a reminder card nothing applied (issue #322 V02; maintainer decision
 *    2026-11-01).
 */

import { moveRollKind } from "../schemas.js";
import { serialiseCampaignStateWrite } from "../multiplayer/campaignStateChain.js";

const MODULE_ID = "starforged-companion";

/**
 * True for a move rolled with the action die + a stat (the moves a +1 add
 * applies to). Progress moves and no-roll moves are excluded — the one
 * classification (schemas.js moveRollKind) the resolver rolls by too, with
 * the interpretation's own `rollKind` beside it: a bonded Develop Your
 * Relationship, a no-roll move by its data, is marked `rollKind: "action"`
 * by its enrichment and rolls +rank (issue #316 T05), so it takes the adds
 * too (issue #326 W48).
 *
 * @param {string} moveId
 * @param {string|null} [rollKind] — the interpretation's `rollKind`, when set
 * @returns {boolean}
 */
export function isActionRollMove(moveId, rollKind = null) {
  return rollKind === "action" || moveRollKind(moveId) === "action";
}

/**
 * Take the pending Take a Break add for this move — whoever's roll it is.
 * Only an action roll takes it. It is claimed on the store before it is
 * added, as consumeNextMoveBonus claims its sibling: the latest stored
 * campaignState is written without `nextMoveAdd` (a copy — rules/foundry-
 * api.md, issue #326 W51), and the value is returned only once that write
 * lands. A refused claim adds nothing and leaves the +1 pending for the next
 * roll. It used to be added first, from the working copy, and cleared after
 * with its refusal a console warning — so a refused clear added one +1 to two
 * rolls (issue #342 Z52). The pipeline's working copy drops it too. Runs on
 * the canonical GM (the move pipeline's client), on its campaignState write
 * chain: read inside an oracle capture's round trip, the claim erased the
 * answer (CAMPSTATE-CHAIN-PARTIAL).
 *
 * @param {Object|null} campaignState — the pipeline's working copy (mutated)
 * @param {string} moveId
 * @param {{ rollKind?: string|null }} [opts] — the interpretation's roll kind
 * @returns {Promise<number>} the add (0 when none is pending, the move is not an action roll, or the claim was refused)
 */
export async function consumeNextMoveAdd(campaignState, moveId, { rollKind = null } = {}) {
  if (!isActionRollMove(moveId, rollKind)) return 0;
  const value = await serialiseCampaignStateWrite(async () => {
    let latest;
    try {
      latest = game.settings.get(MODULE_ID, "campaignState") ?? {};
    } catch {
      return 0;
    }
    const pending = Number(latest.nextMoveAdd?.value ?? 0);
    if (!latest.nextMoveAdd || !(pending > 0)) return 0;
    const next = { ...latest };
    delete next.nextMoveAdd;
    try {
      await game.settings.set(MODULE_ID, "campaignState", next);
    } catch (err) {
      console.warn(`${MODULE_ID} | Take a Break: taking the +1 was refused — not added, still pending:`, err?.message ?? err);
      return 0;
    }
    return pending;
  }, "Take a Break's +1");
  if (value > 0 && campaignState && typeof campaignState === "object") delete campaignState.nextMoveAdd;
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// The roller's "+1 on your next move" (issue #322 V02)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a "+1 on your next move" for a character, onto the latest stored
 * campaignState (no await between the read and the write — the field is
 * store-owned, persistResolution's merge keeps the store's value), read at
 * its turn on the client's campaignState write chain (CAMPSTATE-CHAIN-PARTIAL).
 * Two pending grants add up. Runs on the canonical GM: a choice card's pick
 * and a move's other effects are applied there. A write the world refuses
 * throws, so the caller can report it.
 *
 * @param {string|null} actorId — the character who earned it
 * @param {number} amount
 * @param {string|null} [source] — the move that granted it, for the record
 * @returns {Promise<{ ok: boolean, value?: number, reason?: string }>}
 */
export async function grantNextMoveBonus(actorId, amount, source = null) {
  const add = Math.floor(Number(amount));
  if (typeof actorId !== "string" || !actorId || !(add > 0)) return { ok: false, reason: "invalid" };
  return serialiseCampaignStateWrite(async () => {
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
  }, "next-move bonus");
}

/**
 * Take a character's pending "+1 on your next move" for this move. Only an
 * action roll takes it. It is claimed on the store before it is added: a
 * refused write adds nothing and leaves it pending for the next roll, so it is
 * never added twice. The pipeline's working copy drops it too. On the
 * client's campaignState write chain (CAMPSTATE-CHAIN-PARTIAL).
 *
 * @param {Object|null} campaignState — the pipeline's working copy (mutated)
 * @param {string|null} actorId — the roller
 * @param {string} moveId
 * @param {{ rollKind?: string|null }} [opts] — the interpretation's roll kind
 * @returns {Promise<number>} the add (0 when none is pending or taken)
 */
export async function consumeNextMoveBonus(campaignState, actorId, moveId, { rollKind = null } = {}) {
  if (typeof actorId !== "string" || !actorId || !isActionRollMove(moveId, rollKind)) return 0;
  const value = await serialiseCampaignStateWrite(async () => {
    let latest;
    try {
      latest = game.settings.get(MODULE_ID, "campaignState") ?? {};
    } catch {
      return 0;
    }
    const pending = Math.floor(Number(latest.nextMoveBonuses?.[actorId]?.value ?? 0));
    if (!(pending > 0)) return 0;
    const bonuses = { ...latest.nextMoveBonuses };
    delete bonuses[actorId];
    try {
      await game.settings.set(MODULE_ID, "campaignState", { ...latest, nextMoveBonuses: bonuses });
    } catch (err) {
      console.warn(`${MODULE_ID} | next-move bonus: taking ${actorId}'s +${pending} was refused — not added, still pending:`, err?.message ?? err);
      return 0;
    }
    return pending;
  }, "next-move bonus");
  if (!(value > 0)) return 0;
  if (campaignState?.nextMoveBonuses?.[actorId]) {
    campaignState.nextMoveBonuses = { ...campaignState.nextMoveBonuses };
    delete campaignState.nextMoveBonuses[actorId];
  }
  return value;
}
