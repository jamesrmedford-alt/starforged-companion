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
 * Marks the picked vow by its rank's milestone ticks, posts the result card,
 * and stamps the picker card `resolved` so it can never fire twice. Idempotent:
 * a card that is already resolved (or currently being resolved) is a no-op.
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
  if (!offered.some(c => c.vowId === vowId && (c.actorId || null) === actorId)) {
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
    return { marked: false, reason: "not-owner" };
  }

  _inFlight.add(messageId);
  try {
    const vow = actor ? readVows(actor).find(v => v.id === vowId) : null;

    let result;
    if (actor && vow) {
      const ticks = milestoneTicks(vow.rank);
      await markVowProgress(actor, vow.id, ticks);
      await postReachMilestoneCard(vow, ticks);
      result = { marked: true, ticks };
    } else {
      console.warn(`${MODULE_ID} | milestone pick: vow ${vowId ?? "?"} not found on actor ${actor?.id ?? actorId ?? "?"} — nothing marked.`);
      result = { marked: false, reason: "no-vow" };
    }

    await message.update({ [`flags.${MODULE_ID}.resolved`]: true })
      .catch(err => console.warn(`${MODULE_ID} | milestone picker resolve update failed:`, err?.message ?? err));
    return result;
  } finally {
    _inFlight.delete(messageId);
  }
}

/**
 * The (vowId, actorId) pairs a picker card offers: the structured
 * `flags.choices` stamped by postMilestonePickerCard (src/index.js), or — for
 * a card posted before that flag existed — its buttons' data attributes.
 *
 * @param {ChatMessage} message
 * @returns {Array<{ vowId: string, actorId: string }>}
 */
function milestonePickerChoices(message) {
  const stamped = message?.flags?.[MODULE_ID]?.choices;
  if (Array.isArray(stamped)) {
    return stamped.map(c => ({ vowId: String(c?.vowId ?? ""), actorId: String(c?.actorId ?? "") }));
  }
  return parseCardButtons(message?.content, "sf-milestone-pick")
    .map(b => ({ vowId: b.vowId ?? "", actorId: b.actorId ?? "" }));
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
