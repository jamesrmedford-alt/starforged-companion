/**
 * STARFORGED COMPANION
 * src/private-channel/publish.js — publish selected private content to main chat
 *
 * Opt-in only — runs when the player explicitly publishes (issue #226 (Private Channel)
 * §7). Posts a styled card attributed to the character (alias resolved via
 * getActiveCharacter), flagged publishedReflection / kind="published-reflection".
 * Everything else in the private channel stays invisible to other players.
 *
 * A published reflection is canon (issue #286 D1, #287): the card carries the
 * narrator flag family (narratorCard / narrationText / sessionId), so the main
 * narrator remembers it — the recent-narration ring and the rolling summary —
 * and the canonical GM runs the tier pass for the recorded entities it names
 * (registerPublishedReflectionHook). Only the published text: the player's own
 * private lines stay private. The card carries a `narrationId`, which that
 * capture stamps on what it records, so an X-Card on the reflection undoes it
 * (issue #335 Y03).
 */

import { getActiveCharacter, isXCardActive } from "../narration/narrator.js";
import { newNarrationId } from "../factContinuity/ledgers.js";
import { resolveUserActorId } from "../multiplayer/speaker.js";
import { pageIsStale } from "../multiplayer/connectionWatch.js";

const MODULE_ID = "starforged-companion";

/** What a player is told when Publish is refused during an X-Card pause. */
export const XCARD_PUBLISH_REFUSED =
  "The X-Card is in play — nothing is published to the table until a GM resumes the scene.";

/** What a player is told when Publish is refused on a page whose connection dropped (STALE-PLAYER-PAGE). */
export const STALE_PAGE_REFUSED =
  "Your connection to the server dropped, so an X-Card played meanwhile may not have reached this page — reload it (F5), then try again.";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Publish a snippet of private-channel content to main chat as a styled card.
 *
 * @param {object} args
 * @param {string} args.userId   — the publishing player
 * @param {string} args.content  — plain text to publish (escaped for display)
 * Refused while the X-Card is in play (issue #321 U09): a published reflection
 * is canon — main chat, the recent-narration ring, the rolling summary — so it
 * would bring back what the card was played to stop. The player is told.
 *
 * @returns {Promise<ChatMessage|null>} the posted message, or null when empty
 *   or refused
 */
export async function publishToMainChat({ userId, content }) {
  const text = String(content ?? "").trim();
  if (!text) return null;
  if (isXCardActive(null)) {
    globalThis.ui?.notifications?.warn?.(XCARD_PUBLISH_REFUSED);
    return null;
  }
  // This page's cache cannot vouch that no X-Card was played meanwhile.
  if (pageIsStale()) {
    globalThis.ui?.notifications?.warn?.(STALE_PAGE_REFUSED);
    return null;
  }

  let characterName = "You";
  let sessionId     = null;
  try {
    const cs      = game.settings?.get?.(MODULE_ID, "campaignState");
    // The publisher's own PC (issue #321 U23) — an unbound player who owns
    // one was published as the campaign's first PC, another player's.
    const actorId = resolveUserActorId(game.users?.get?.(userId) ?? null, cs);
    sessionId     = cs?.currentSessionId ?? null;
    characterName = (actorId ? getActiveCharacter(cs, actorId)?.name : null) || characterName;
  } catch (err) {
    console.warn(`${MODULE_ID} | privateChannel: publish alias resolve failed:`, err?.message ?? err);
  }

  const card = [
    `<div class="sf-published-reflection">`,
    `<div class="sf-published-reflection-label">◈ ${escapeHtml(characterName)} — private reflection</div>`,
    `<div class="sf-published-reflection-body">${escapeHtml(text)}</div>`,
    `</div>`,
  ].join("");

  return ChatMessage.create({
    content: card,
    speaker: { alias: characterName },
    flags:   {
      [MODULE_ID]: {
        publishedReflection: true,
        kind:                "published-reflection",
        narratorCard:        true,
        narrationText:       text,
        sessionId,
        // Its id, as every narration card's: the canonical GM's capture
        // (registerPublishedReflectionHook) stamps it on the details it
        // records, so an X-Card on the reflection drops them (issue #335 Y03).
        narrationId:         newNarrationId(),
      },
    },
  });
}
