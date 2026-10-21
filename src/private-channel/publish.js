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
 * private lines stay private.
 */

import { getActiveCharacter } from "../narration/narrator.js";

const MODULE_ID = "starforged-companion";

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
 * @returns {Promise<ChatMessage|null>} the posted message, or null when empty
 */
export async function publishToMainChat({ userId, content }) {
  const text = String(content ?? "").trim();
  if (!text) return null;

  let characterName = "You";
  let sessionId     = null;
  try {
    const cs      = game.settings?.get?.(MODULE_ID, "campaignState");
    const actorId = game.users?.get?.(userId)?.character?.id ?? null;
    sessionId     = cs?.currentSessionId ?? null;
    characterName = getActiveCharacter(cs, actorId)?.name || characterName;
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
      },
    },
  });
}
