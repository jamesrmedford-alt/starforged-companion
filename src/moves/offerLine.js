/**
 * STARFORGED COMPANION
 * src/moves/offerLine.js — an offer's Roll, posted without the line again
 *
 * OFFER-FLOW-FRICTION (the seventh live round, 2026-11-26): of 19 lines that
 * wanted a move, 8 were offered, and each offer pressed posted the player's
 * line again as a table card under their character's name — the cold read's
 * "repost loop": "the player has to re-send the same line as a table post,
 * and the beat is narrated twice", eight times in one run (a5→a6, a28→a29,
 * a55→a56, a57→a58, a60→a61, a62→a63, a66→a67, a69→a70).
 *
 * The line was already said, and its beat already narrated on the offer's
 * card (issue #388 #14: the roll's narration goes on from there). The Roll now
 * posts one short line — the move, rolled from the offer — and the player's
 * line rides on its flags (`offerLine`) for the move pipeline, the session
 * record and a Batch Mode round, which read it by `lineOf`. Trusted from a
 * GM's post only, as the offer's reading is (index.js `forcedReading`): the
 * canonical GM posts every offer's Roll (cardActions.js applyPacedRoll).
 */

const MODULE_ID = "starforged-companion";

const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The chat line an offer's Roll posts in place of the player's line.
 *
 * @param {string} moveName — the move's display name
 * @returns {string}
 */
export function offerRollContent(moveName) {
  const name = String(moveName ?? "").trim() || "The move";
  return `<p class="sf-offer-roll">↳ ${escapeHtml(name)} — rolled from the offer above</p>`;
}

/**
 * The player's line a chat message carries: an offer's Roll's `offerLine`,
 * from a GM's post, else the message's own content.
 *
 * @param {Object|null} message — a ChatMessage
 * @returns {string}
 */
export function lineOf(message) {
  const f = message?.flags?.[MODULE_ID];
  if (f?.fromOffer === true && typeof f.offerLine === "string" && f.offerLine.trim() && message?.author?.isGM === true) {
    return f.offerLine;
  }
  return String(message?.content ?? "");
}
