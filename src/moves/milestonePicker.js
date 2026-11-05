/**
 * STARFORGED COMPANION
 * src/moves/milestonePicker.js — Reach a Milestone picker + result card
 *
 * When several vows are open and a Reach a Milestone names none, the pipeline
 * posts a picker card (one button per vow). Marking a vow is a GM-gated Item
 * write (PERSIST-001), and the button is usually clicked on a PLAYER's client —
 * before the 2026-10 audit that click disabled the buttons and silently did
 * nothing. The click now relays through the canonical-GM action relay
 * (`requestGmAction("milestone.pick", …)`, src/multiplayer/gmRelay.js) and
 * applyMilestonePick() below runs on the canonical GM.
 *
 * postReachMilestoneCard() is the ONE implementation of the "⚑ Reach a
 * Milestone — marked progress" card: the pipeline's applyReachMilestone
 * (src/index.js) and the picker handler here both post through it.
 */

import { getPlayerActors, readVows, markVowProgress } from "../character/actorBridge.js";
import { milestoneTicks } from "./milestone.js";
import { requesterOwnsActor } from "./burnMomentum.js";
import { parseCardButtons } from "./cardActions.js";
import { refusePress } from "../multiplayer/gmRelay.js";

const MODULE_ID = "starforged-companion";

// Picker message ids currently being applied on this (the canonical GM's)
// client. Two near-simultaneous clicks — from two players, or a double-click
// that beat the re-render — both relay; the second must not mark the vow again
// while the first is still between the vow write and the `resolved` stamp.
const _inFlight = new Set();

/**
 * Post the "⚑ Reach a Milestone" result card for a vow that just took ticks.
 *
 * @param {{ name?: string, rank?: string }|null} vow
 * @param {number} ticks
 */
export async function postReachMilestoneCard(vow, ticks) {
  const name = escapeHtml(vow?.name || "your vow");
  const rank = escapeHtml(vow?.rank ?? "");
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>⚑ Reach a Milestone</strong>` +
        `<p>Marked progress on <strong>${name}</strong> — +${ticks} tick${ticks === 1 ? "" : "s"}${rank ? ` (${rank} rank)` : ""}.</p></div>`,
      flags:   { [MODULE_ID]: { reachMilestoneCard: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postReachMilestoneCard: chat post failed:`, err?.message ?? err);
  }
}

/**
 * gmRelay handler for "milestone.pick" — runs on the canonical GM.
 *
 * Claims the picker card (`resolved`) so it can never fire twice, then marks
 * the picked vow by its rank's milestone ticks (times the choice's `marks` —
 * a won fight's ×N, issue #326 W43) and posts the result card. Idempotent: a
 * card that is already resolved (or currently being resolved) is a no-op; a
 * refused claim marks nothing, and a refused mark releases the claim (issue
 * #336 Y24 — the stamp came after the mark, and its refusal left the picker
 * live for a second mark).
 *
 * The payload is client-supplied (gmRelay.js "Trust model"), so the pick must
 * match one of the card's own buttons — the (vowId, actorId) pair the picker
 * offered — and the requester must own that PC (or be a GM). A refused pick
 * leaves the card unresolved.
 *
 * @param {{ messageId?: string, actorId?: string, vowId?: string }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ marked: boolean, ticks?: number, reason?: string }>}
 */
export async function applyMilestonePick(payload = {}, ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const actorId   = typeof payload.actorId   === "string" && payload.actorId ? payload.actorId : null;
  const vowId     = typeof payload.vowId     === "string" ? payload.vowId     : null;

  const message = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | milestone pick: picker card ${messageId ?? "?"} not found — nothing marked.`);
    return { marked: false, reason: "no-message" };
  }
  if (message.flags?.[MODULE_ID]?.resolved || _inFlight.has(messageId)) {
    console.debug(`${MODULE_ID} | milestone pick: picker card ${messageId} already resolved — ignoring repeat click.`);
    return { marked: false, reason: "already-resolved" };
  }
  const offered = milestonePickerChoices(message);
  const choice  = offered.find(c => c.vowId === vowId && (c.actorId || null) === actorId);
  if (!choice) {
    console.warn(`${MODULE_ID} | milestone pick: vow ${vowId ?? "?"} / actor ${actorId ?? "?"} is not a choice on picker card ${messageId} — refused.`);
    return { marked: false, reason: "not-on-card" };
  }

  // The card's own actor (the PC the Reach a Milestone was rolled for);
  // first PC only when the card predates the actorId data attribute.
  const actor = (actorId ? globalThis.game?.actors?.get?.(actorId) : null)
    ?? getPlayerActors()[0]
    ?? null;
  if (actor && !requesterOwnsActor(actor, ctx)) {
    console.warn(`${MODULE_ID} | milestone pick: user ${ctx?.requesterId ?? "?"} does not own ${actor.name} — refused.`);
    refusePress(ctx, "not-owner", actor);
    return { marked: false, reason: "not-owner" };
  }

  _inFlight.add(messageId);
  try {
    const vow = actor ? readVows(actor).find(v => v.id === vowId) : null;

    // The vow was fulfilled since the picker was posted (a sheet roll, a
    // crewmate's fulfilment): a milestone never marks a fulfilled vow, as
    // the "Which vow?" pick and planReachMilestone refuse one (issue #331
    // X20). The picker stays open for its other vows — resolved only once
    // every vow it offers is fulfilled or gone.
    if (vow?.completed) {
      console.warn(`${MODULE_ID} | milestone pick: "${vow.name}" is fulfilled — nothing marked.`);
      await postVowFulfilledCard(vow);
      if (!offered.some(c => openVowOnCard(c))) {
        await message.update({ [`flags.${MODULE_ID}.resolved`]: true })
          .catch(err => console.warn(`${MODULE_ID} | milestone picker resolve update failed:`, err?.message ?? err));
      }
      return { marked: false, reason: "vow-completed" };
    }

    // Claimed before the mark (issue #336 Y24; decisions #309 "claims before
    // effects"): the vow was marked first and the stamp's refusal swallowed,
    // so the picker stayed live and the next press marked the vow again. A
    // refused claim marks nothing — the press is the retry; a mark the world
    // refused releases the claim.
    try {
      await message.update({ [`flags.${MODULE_ID}.resolved`]: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | milestone pick: picker card ${messageId} could not be claimed — nothing marked:`, err?.message ?? err);
      return { marked: false, reason: "claim-refused" };
    }
    if (!actor || !vow) {
      console.warn(`${MODULE_ID} | milestone pick: vow ${vowId ?? "?"} not found on actor ${actor?.id ?? actorId ?? "?"} — nothing marked.`);
      return { marked: false, reason: "no-vow" };
    }
    // A won fight's ×N milestone rides the choice (issue #326 W43); a plain
    // Reach a Milestone's picker marks once.
    const ticks = milestoneTicks(vow.rank) * choice.marks;
    try {
      await markVowProgress(actor, vow.id, ticks);
    } catch (err) {
      console.warn(`${MODULE_ID} | milestone pick: the mark on "${vow.name}" was refused — the claim is released:`, err?.message ?? err);
      await message.update({ [`flags.${MODULE_ID}.resolved`]: false })
        .catch(e => console.warn(`${MODULE_ID} | milestone pick: releasing the claim failed:`, e?.message ?? e));
      return { marked: false, reason: "write-refused" };
    }
    await postReachMilestoneCard(vow, ticks);
    return { marked: true, ticks };
  } finally {
    _inFlight.delete(messageId);
  }
}

/** Whether a picker choice still names an open vow on its PC. */
function openVowOnCard(choice) {
  const actor = choice?.actorId ? (globalThis.game?.actors?.get?.(choice.actorId) ?? null) : null;
  return !!actor && readVows(actor).some(v => v.id === choice.vowId && !v.completed);
}

/** The short card a pick on a fulfilled vow gets: nothing was marked. */
async function postVowFulfilledCard(vow) {
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>⚑ Reach a Milestone</strong>`
        + `<p><strong>${escapeHtml(vow?.name || "That vow")}</strong> is already fulfilled — no milestone was marked. Pick an open vow.</p></div>`,
      flags:   { [MODULE_ID]: { milestoneVowFulfilledCard: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | milestone pick: the fulfilled-vow card failed:`, err?.message ?? err);
  }
}

/**
 * The (vowId, actorId) pairs a picker card offers, with the marks each
 * applies: the structured `flags.choices` stamped by postMilestonePickerCard
 * (src/index.js), or — for a card posted before that flag existed — its
 * buttons' data attributes (one mark).
 *
 * @param {ChatMessage} message
 * @returns {Array<{ vowId: string, actorId: string, marks: number }>}
 */
function milestonePickerChoices(message) {
  const stamped = message?.flags?.[MODULE_ID]?.choices;
  const marksOf = (c) => Math.max(1, Math.floor(Number(c?.marks)) || 1);
  if (Array.isArray(stamped)) {
    return stamped.map(c => ({ vowId: String(c?.vowId ?? ""), actorId: String(c?.actorId ?? ""), marks: marksOf(c) }));
  }
  return parseCardButtons(message?.content, "sf-milestone-pick")
    .map(b => ({ vowId: b.vowId ?? "", actorId: b.actorId ?? "", marks: 1 }));
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
