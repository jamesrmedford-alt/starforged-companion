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
 * @param {{ messageId?: string, actorId?: string, vowId?: string }} payload
 * @param {{ requesterId?: string|null }} [_ctx]
 * @returns {Promise<{ marked: boolean, ticks?: number, reason?: string }>}
 */
export async function applyMilestonePick(payload = {}, _ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const actorId   = typeof payload.actorId   === "string" ? payload.actorId   : null;
  const vowId     = typeof payload.vowId     === "string" ? payload.vowId     : null;

  const message = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (messageId && !message) {
    console.warn(`${MODULE_ID} | milestone pick: picker card ${messageId} not found — nothing marked.`);
    return { marked: false, reason: "no-message" };
  }
  if (message?.flags?.[MODULE_ID]?.resolved || (messageId && _inFlight.has(messageId))) {
    console.debug(`${MODULE_ID} | milestone pick: picker card ${messageId} already resolved — ignoring repeat click.`);
    return { marked: false, reason: "already-resolved" };
  }

  if (messageId) _inFlight.add(messageId);
  try {
    // The card's own actor (the PC the Reach a Milestone was rolled for);
    // first PC only when the card predates the actorId data attribute.
    const actor = (actorId ? globalThis.game?.actors?.get?.(actorId) : null)
      ?? getPlayerActors()[0]
      ?? null;
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

    if (message) {
      await message.update({ [`flags.${MODULE_ID}.resolved`]: true })
        .catch(err => console.warn(`${MODULE_ID} | milestone picker resolve update failed:`, err?.message ?? err));
    }
    return result;
  } finally {
    if (messageId) _inFlight.delete(messageId);
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
