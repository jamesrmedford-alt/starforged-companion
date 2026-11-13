/**
 * STARFORGED COMPANION
 * src/moves/sceneChallengeOffer.js — offer to play a countdown as a scene
 * challenge (issue #353 Phase 3)
 *
 * Starforged plays an extended non-combat conflict under a threat or a time
 * limit — a standoff, a chase, a heist — as a scene challenge: a progress
 * track with a 4-segment tension clock. Nothing suggested one: in the alpha 23
 * playtest an hour-long standoff under a countdown ran with nothing measuring
 * progress or time. When the fiction starts a countdown (the narrator's
 * sidecar `countdown`, made a real tension clock by src/world/secrets.js) and
 * no scene challenge is open, the GMs are offered one: a card with
 * **Begin the scene challenge**, whose press makes the track with the
 * countdown's clock as its tension clock — the countdown is the challenge's
 * clock, not a second one — and Finish the Scene ends it.
 *
 * The card is GM-authored and whispered to the GMs; its press is a GM's,
 * claimed once on the card, run on the canonical GM (gmRelay
 * "sceneChallenge.begin").
 */

import { isCanonicalGM } from "../multiplayer/gmGate.js";
import { onChatMessageRender } from "../system/chatHooks.js";
import { relayCardAction } from "./cardActions.js";

const MODULE_ID = "starforged-companion";
const BEGIN_ACTION = "sf-begin-scene-challenge";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The GMs' user ids, for the whisper. */
function gmIds() {
  return (globalThis.game?.users?.filter?.(u => u.isGM) ?? []).map(u => u.id);
}

/**
 * Offer a scene challenge for a countdown the fiction started, on the
 * canonical GM: only in a scene, and only when none is open. Never throws.
 *
 * @param {{ label: string, clockId: string, campaignState?: Object|null }} args
 * @returns {Promise<Object|null>} the card, or null when none was offered
 */
export async function offerSceneChallenge({ label, clockId, campaignState = null }) {
  try {
    if (!isCanonicalGM() || !label || !clockId) return null;
    if (!campaignState?.currentSceneId) return null;
    const { listOpenProgressTracks } = await import("../ui/progressTracks.js");
    const open = await listOpenProgressTracks();
    if ((open ?? []).some(t => t?.type === "scene_challenge")) return null;
    return await globalThis.ChatMessage?.create?.({
      content: offerContent(label),
      whisper: gmIds(),
      flags:   { [MODULE_ID]: { sceneChallengeOffer: { label, clockId } } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | scene challenge offer failed:`, err?.message ?? err);
    return null;
  }
}

function offerContent(label) {
  return `<div class="sf-card sf-card--scene-challenge-offer"><div class="sf-card-header">⏳ A countdown: ${escapeHtml(label)}</div>`
    + `<div class="sf-card-body"><p>A standoff under a countdown can be played as a <strong>scene challenge</strong>: a progress track the crew fills with Face Danger and Secure an Advantage, against this countdown as its tension clock. Finish the Scene ends it.</p>`
    + `<p><button type="button" data-action="${BEGIN_ACTION}">Begin the scene challenge</button></p></div></div>`;
}

function closedContent(label, line) {
  return `<div class="sf-card sf-card--scene-challenge-offer"><div class="sf-card-header">⏳ A countdown: ${escapeHtml(label)}</div>`
    + `<div class="sf-card-body"><p>${line}</p></div></div>`;
}

/**
 * The Begin press, on the canonical GM (gmRelay "sceneChallenge.begin"): a
 * GM's press on a GM-authored offer, claimed once on the card. Makes the
 * scene challenge with the countdown's clock as its tension clock, then
 * closes the card. A refused write releases the claim.
 *
 * @param {{ messageId: string }} payload
 * @param {{ requesterIsGM?: boolean, requesterId?: string }} ctx
 * @returns {Promise<{ applied: boolean, reason?: string, trackId?: string }>}
 */
export async function applySceneChallengeOffer(payload = {}, ctx = {}) {
  const messageId = typeof payload?.messageId === "string" ? payload.messageId : null;
  const message = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  const offer = message?.flags?.[MODULE_ID]?.sceneChallengeOffer;
  if (!message || !offer || message.author?.isGM !== true) return { applied: false, reason: "not-an-offer" };
  if (!ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | scene challenge offer: user ${ctx?.requesterId ?? "?"} is not a GM — refused.`);
    return { applied: false, reason: "not-gm" };
  }
  if (message.flags?.[MODULE_ID]?.sceneChallengeBegun) return { applied: false, reason: "already-resolved" };
  try {
    await message.update({ [`flags.${MODULE_ID}.sceneChallengeBegun`]: true });
  } catch (err) {
    console.warn(`${MODULE_ID} | scene challenge offer: card ${messageId} could not be claimed:`, err?.message ?? err);
    return { applied: false, reason: "claim-refused" };
  }
  try {
    const { addProgressTrack, listOpenProgressTracks } = await import("../ui/progressTracks.js");
    if ((await listOpenProgressTracks() ?? []).some(t => t?.type === "scene_challenge")) {
      await message.update({ content: closedContent(offer.label, "A scene challenge is already open.") }).catch(() => {});
      return { applied: false, reason: "one-open" };
    }
    const clocks = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState")?.clocks ?? [];
    const clock = clocks.find(c => c?._id === offer.clockId && c.active !== false) ?? null;
    const track = await addProgressTrack({
      label: offer.label, type: "scene_challenge", rank: "dangerous",
      ...(clock ? { tensionClockId: clock._id } : {}),
    });
    await message.update({
      content: closedContent(offer.label, `Scene challenge begun: <strong>${escapeHtml(offer.label)}</strong> (dangerous — re-rank it in the Progress Tracks panel). ${clock ? "The countdown is its tension clock." : "The countdown had ended; it has a clock of its own."}`),
    }).catch(err => console.warn(`${MODULE_ID} | scene challenge offer: card ${messageId} could not be closed:`, err?.message ?? err));
    return { applied: true, trackId: track?.id ?? null };
  } catch (err) {
    console.warn(`${MODULE_ID} | scene challenge offer: the challenge was not made:`, err?.message ?? err);
    await message.update({ [`flags.${MODULE_ID}.sceneChallengeBegun`]: false }).catch(() => {});
    return { applied: false, reason: "refused" };
  }
}

/** Wire the offer card's button on every client (ready). */
export function registerSceneChallengeOffer() {
  onChatMessageRender((message, root) => {
    const f = message?.flags?.[MODULE_ID];
    if (!f?.sceneChallengeOffer) return;
    const btn = root.querySelector(`[data-action="${BEGIN_ACTION}"]`);
    if (!btn) return;
    if (f.sceneChallengeBegun || !globalThis.game?.user?.isGM) { btn.disabled = true; return; }
    btn.addEventListener("click", async (ev) => {
      ev?.preventDefault?.();
      if (btn.disabled) return;
      btn.disabled = true;
      await relayCardAction({
        kind:       "sceneChallenge.begin",
        payload:    { messageId: message.id },
        isResolved: () => !!globalThis.game?.messages?.get?.(message.id)?.flags?.[MODULE_ID]?.sceneChallengeBegun,
        restore:    () => { btn.disabled = false; },
      });
    });
  });
}
