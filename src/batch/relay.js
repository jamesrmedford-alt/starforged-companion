/**
 * STARFORGED COMPANION
 * src/batch/relay.js — Batch Mode's GM relay handlers (issue #340)
 *
 * A player's Round window cannot write the round (a world setting): each
 * action relays to the canonical GM through requestGmAction, declared in
 * GM_ACTIONS (src/multiplayer/gmRelay.js). Every handler here:
 *
 *   - acts on the REQUESTER's own entry — `ctx.requesterId` is the entry's
 *     user, never a user id from the payload — and checks `ctx.requesterIsGM`
 *     for the GM controls (Send now, Discard), never `game.user.isGM`;
 *   - checks the payload against the round: the round id is the open
 *     round's, the text is bounded like a chat line, the choices are among the
 *     reading's (src/batch/round.js validateChoices) — so a forged request can
 *     do only what the window could;
 *   - writes through the driver's one write chain (queueRoundWrite), and
 *     starts the slow work — a reading, a resolution — outside the relay
 *     queue without waiting for it: no Claude call runs inside the queue, and
 *     no handler calls requestGmAction;
 *   - tells a refused requester why — the relay has no ack (rules/
 *     reachability.md §8: a refusal logged on the GM's console alone is a
 *     silent no-op on the player's action).
 */

import { storedRound, ENTRY_STATUS, submitEntry, withdrawEntry, passEntry, confirmEntry, rereadEntry } from "./round.js";
import {
  queueRoundWrite,
  startReading,
  advanceRound,
  requestSendNow,
  closeCollectingRound,
  openRoundIfDue,
  keepUpgrade,
} from "./driver.js";

const MODULE_ID = "starforged-companion";

const nowIso = () => new Date().toISOString();
const escapeHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isRefusal = (err) => err?.name === "RoundRefusal";

/**
 * Tell the requester their action changed nothing, and why. On the canonical
 * GM's own client a notification; for a relayed request a whisper (the relay
 * has no ack).
 *
 * @param {Object} ctx — the relay context
 * @param {string} text
 */
async function tellRequester(ctx, text) {
  if (ctx?.local || !ctx?.requesterId) {
    globalThis.ui?.notifications?.warn?.(`Starforged Companion: ${text}`);
    return;
  }
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card sf-batch-notice"><strong>Round</strong><p>${escapeHtml(text)}</p></div>`,
      whisper: [ctx.requesterId],
      flags:   { [MODULE_ID]: { batchNotice: true, batchRefusedNotice: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | Batch Mode: telling ${ctx.requesterId} why failed:`, err?.message ?? err);
  }
}

/**
 * Apply a transition to the requester's own entry of the open round named by
 * `payload.roundId`, then run `after` (not awaited by the queue).
 *
 * @param {Object} payload
 * @param {Object} ctx
 * @param {string} label
 * @param {(round: Object, userId: string) => Object} transition
 * @param {(userId: string, round: Object) => void} [after]
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function entryAction(payload, ctx, label, transition, after = null) {
  const userId = typeof ctx?.requesterId === "string" ? ctx.requesterId : null;
  if (!userId) {
    console.warn(`${MODULE_ID} | Batch Mode: ${label} with no requester — ignored.`);
    return { ok: false, reason: "no-requester" };
  }
  const roundId = typeof payload?.roundId === "string" ? payload.roundId : null;
  try {
    const next = await queueRoundWrite((latest) => {
      const round = storedRound(latest);
      if (!round || round.id !== roundId || round.phase === "closed") {
        const e = new Error("That round has ended — your action is kept in your Round window for the next one.");
        e.name = "RoundRefusal";
        e.reason = "stale-round";
        throw e;
      }
      return transition(round, userId);
    });
    if (after) {
      try { after(userId, next); }
      catch (err) { console.warn(`${MODULE_ID} | Batch Mode: after ${label}:`, err?.message ?? err); }
    }
    return { ok: true };
  } catch (err) {
    if (isRefusal(err)) {
      console.debug(`${MODULE_ID} | Batch Mode: ${label} refused for ${userId} — ${err.reason}.`);
      await tellRequester(ctx, err.message);
      return { ok: false, reason: err.reason };
    }
    console.warn(`${MODULE_ID} | Batch Mode: ${label} could not be saved:`, err?.message ?? err);
    await tellRequester(ctx, "The round could not be saved — try again.");
    return { ok: false, reason: "refused" };
  }
}

const textOf = (payload) => (typeof payload?.text === "string" ? payload.text : "");
const idOf = (v) => (typeof v === "string" && v && v.length <= 64 ? v : null);

/**
 * gmRelay "batch.submit" — the requester submits (or rewrites) their action.
 * Its reading starts outside the queue; a new submission supersedes a
 * reading in flight (`submissionId`).
 *
 * @param {{ roundId: string, text: string, submissionId: string }} payload
 * @param {Object} ctx
 */
export async function applyBatchSubmit(payload = {}, ctx = {}) {
  const submissionId = idOf(payload.submissionId);
  return entryAction(payload, ctx, "submit",
    (round, userId) => submitEntry(round, { userId, text: textOf(payload), submissionId, now: nowIso() }),
    (userId) => { startReading(userId); });
}

/** gmRelay "batch.withdraw" — the requester withdraws their action: back to waiting. */
export async function applyBatchWithdraw(payload = {}, ctx = {}) {
  return entryAction(payload, ctx, "withdraw", (round, userId) => withdrawEntry(round, { userId }));
}

/** gmRelay "batch.pass" — the requester passes this round (silently). */
export async function applyBatchPass(payload = {}, ctx = {}) {
  return entryAction(payload, ctx, "pass", (round, userId) => passEntry(round, { userId }),
    () => { advanceRound("pass"); });
}

/**
 * gmRelay "batch.confirm" — the requester confirms their reading: Ready,
 * with the choices checked against it (only offered abilities, stats and
 * targets). The round may resolve on it.
 *
 * @param {{ roundId: string, submissionId: string, choices: Object }} payload
 */
export async function applyBatchConfirm(payload = {}, ctx = {}) {
  const submissionId = idOf(payload.submissionId);
  return entryAction(payload, ctx, "confirm",
    (round, userId) => confirmEntry(round, { userId, submissionId, choices: payload.choices ?? {}, now: nowIso() }),
    () => { advanceRound("confirm"); });
}

/**
 * gmRelay "batch.reread" — "Roll a move instead" / "Roll ⟨move⟩" (read the
 * action again as a move), or take the card button's move offered beside the
 * requester's own (`useOffer`).
 *
 * @param {{ roundId: string, submissionId: string, newSubmissionId: string, moveId?: string|null, useOffer?: boolean }} payload
 */
export async function applyBatchReread(payload = {}, ctx = {}) {
  const submissionId = idOf(payload.submissionId);
  const newSubmissionId = idOf(payload.newSubmissionId) ?? foundry.utils.randomID();
  const moveId = idOf(payload.moveId);
  return entryAction(payload, ctx, "re-read",
    (round, userId) => rereadEntry(round, { userId, submissionId, newSubmissionId, now: nowIso(), moveId, useOffer: payload.useOffer === true }),
    (userId) => { startReading(userId); });
}

/**
 * gmRelay "batch.keep" — the requester keeps their result in the upgrade
 * step (Burn and Improve use the card's own relays). The round waits for the
 * rollers offered an upgrade only.
 *
 * @param {{ roundId: string }} payload
 */
export async function applyBatchKeep(payload = {}, ctx = {}) {
  const userId = typeof ctx?.requesterId === "string" ? ctx.requesterId : null;
  const round = storedRound(globalThis.game?.settings?.get?.(MODULE_ID, "batchMode.round"));
  if (!userId || !round || round.id !== payload?.roundId) {
    await tellRequester(ctx, "That round has ended.");
    return { ok: false, reason: "stale-round" };
  }
  const entry = round.entries?.[userId];
  if (!entry?.upgrade || entry.upgrade.decided || entry.status !== ENTRY_STATUS.RECORDED) {
    return { ok: true, reason: "nothing-to-decide" };
  }
  try {
    await keepUpgrade(userId);
    return { ok: true };
  } catch (err) {
    if (isRefusal(err)) {
      await tellRequester(ctx, err.message);
      return { ok: false, reason: err.reason };
    }
    console.warn(`${MODULE_ID} | Batch Mode: keep could not be saved:`, err?.message ?? err);
    await tellRequester(ctx, "Your choice could not be saved — try again.");
    return { ok: false, reason: "refused" };
  }
}

/** The GM controls are a GM's: a player who sends one is told. */
async function requireGm(ctx, what) {
  if (ctx?.requesterIsGM) return true;
  console.warn(`${MODULE_ID} | Batch Mode: ${what} from a player (${ctx?.requesterId ?? "?"}) refused.`);
  await tellRequester(ctx, `Only a GM can ${what}.`);
  return false;
}

/** Why Send now changed nothing, said to the GM who pressed it. */
const SEND_NOW_REFUSALS = {
  "x-card":    "The X-Card is in play — the round can't be resolved until a GM resumes.",
  "no-key":    "No GM with a Claude key is connected, so the actions submitted can't be read yet — the round can't be sent.",
  "no-round":  "There is no round open.",
};

/**
 * gmRelay "batch.sendNow" (GMs only) — resolve the round now, with no confirm
 * step; during the upgrade step, Keep for everyone still deciding. With
 * `modeOffAfter`, Batch Mode turns off once the round is done. The
 * resolution runs outside the queue.
 *
 * @param {{ roundId: string, modeOffAfter?: boolean }} payload
 */
export async function applyBatchSendNow(payload = {}, ctx = {}) {
  if (!await requireGm(ctx, "send the round now")) return { ok: false, reason: "not-gm" };
  const round = storedRound(globalThis.game?.settings?.get?.(MODULE_ID, "batchMode.round"));
  if (!round || round.id !== payload?.roundId) {
    await tellRequester(ctx, SEND_NOW_REFUSALS["no-round"]);
    return { ok: false, reason: "stale-round" };
  }
  const res = await requestSendNow({ modeOffAfter: payload.modeOffAfter === true });
  if (!res.ok && SEND_NOW_REFUSALS[res.reason]) await tellRequester(ctx, SEND_NOW_REFUSALS[res.reason]);
  return res;
}

/**
 * gmRelay "batch.discard" (GMs only) — discard the round while it collects:
 * nothing is rolled, the authors are told and keep their text as a draft,
 * and the next round opens.
 *
 * @param {{ roundId: string }} payload
 */
export async function applyBatchDiscard(payload = {}, ctx = {}) {
  if (!await requireGm(ctx, "discard the round")) return { ok: false, reason: "not-gm" };
  const round = storedRound(globalThis.game?.settings?.get?.(MODULE_ID, "batchMode.round"));
  if (!round || round.id !== payload?.roundId || round.phase !== "collecting") {
    await tellRequester(ctx, "Only a round still collecting can be discarded.");
    return { ok: false, reason: "not-collecting" };
  }
  const closed = await closeCollectingRound("discarded");
  if (!closed) {
    await tellRequester(ctx, "The round could not be discarded — try again.");
    return { ok: false, reason: "refused" };
  }
  await openRoundIfDue("discarded");
  return { ok: true };
}
