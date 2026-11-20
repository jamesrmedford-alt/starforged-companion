/**
 * STARFORGED COMPANION
 * src/moves/sojournNeed.js — a Sojourn miss answered: resolved as a strong hit
 *
 * Sojourn's miss, as the module reads it (resolver.js CONSEQUENCE_MAP
 * `sojourn`): the community needs help, or makes a costly demand in exchange
 * for safe harbor — do it, or Swear an Iron Vow to see it done, and the move
 * resolves as a strong hit; otherwise there is no relief, and the price is
 * paid. Picking "Community needs help" on the miss's choice card only posted
 * a reminder ("Trigger: swear_an_iron_vow"): nothing ever resolved the
 * Sojourn as the strong hit the rule gives (issue #364
 * SOJOURN-VOW-OPTION-REMINDER-ONLY; decided by the maintainer: resolve it).
 *
 * The pick now posts **the community's need** card (postSojournNeedCard, from
 * the choice's executor — sufferDialog.js, the canonical GM), which answers
 * the need one of two ways, each relayed to the canonical GM
 * (gmRelay "sojourn.need" → applySojournNeedFromRelay; the roller's player or
 * a GM may press):
 *
 *   - **⚔ Swear an Iron Vow** — the existing swear flow, entered where Begin
 *     a Session's offer enters it: the vow (the name and rank typed on the
 *     card; left blank, a vow still to be named) is written on the roller's
 *     sheet (actorBridge.createCharacterVowItem), so the canonical GM's
 *     createItem hook posts its "🆕 New vow recorded" card — ⚔ Swear it
 *     (roll), the reward offer, the 🤝 link (session/swearVow.js). The vow
 *     says which need card it was written for — its own `sojournNeedCard`
 *     flag, set in the one write that creates it; the card keeps no copy
 *     (issue #364 SOJOURN-NEED-CARD-VOW-ID-WRITE-REFUSED: the card's second
 *     write kept the link, and a vow whose card write was refused resolved
 *     nothing). Once that vow's Swear an Iron Vow has been rolled and
 *     narrated (movePipeline.js finishMove → resolveSojournNeedsForVow, from
 *     the vow's side) the Sojourn is resolved. The vow is sworn whatever its
 *     roll. That its swear has been told is written on the vow too
 *     (`sojournSwearTold`, actorBridge.markNeedVowSwearTold), so a resolve
 *     that cannot be made then is made later, by the vow all the same
 *     (resolveToldSojournNeeds: after the Batch Mode round that held it
 *     back, at the canonical GM's load, and when a GM who leaves or stands
 *     down leaves another GM canonical; issue #364
 *     SOJOURN-VOW-SWORN-WHILE-ROUND-RESOLVING, SOJOURN-NO-SWEEP-ON-GM-TAKEOVER).
 *     A vow deleted from the sheet
 *     before its swear is rolled is no
 *     longer the card's: the card stops saying it is on the sheet and offers
 *     ⚔ again (needVowOnSheet — the sheet, read on every render, and written
 *     back to the card by the canonical GM's deleteItem hook; issue #364
 *     SOJOURN-VOW-DELETED-BEFORE-SWORN). One deleted once its swear was
 *     told takes nothing back — the oath was sworn and told: its Sojourn is
 *     resolved as the swear's own resolve would have, and a resolve that
 *     must wait is kept on the card (`swornVowDeleted`), the vow that said
 *     so being gone (decided by the maintainer; issue #364
 *     SOJOURN-TOLD-VOW-DELETED).
 *   - **✔ It is done** — the help was given: the player's word, no proof.
 *
 * Resolved (resolveSojournNeed), once: the card is claimed first (`resolved`
 * — a refused claim changes nothing and the button re-arms); the Sojourn's
 * move card reads as an improved result does — its "Miss" and the miss's
 * lines struck, "✦ Resolved as a strong hit" and the strong hit's text below;
 * and the strong hit is narrated as a **second beat**. The miss's own
 * narration stands, unlike the narration a Burn Momentum or Improve Result
 * replaces: a burn changes what the roll was, so the miss never happened and
 * its narration's truths leave the scene (decisions.md → issue #338 D8);
 * here the miss did happen — the community's demand it told is what the vow
 * or the help answers — and the refuge follows it. The recover moves the
 * strong hit grants stay the table's to make, as on a rolled one.
 *
 * When a narration may be written is the narrator's and the table's rule,
 * not this card's: the X-Card pauses it (narrateResolution posts the paused
 * card; the Sojourn is resolved all the same, as a burn under the X-Card
 * is); a miss still held for Burn / Improve / Keep is kept first, so its own
 * narration comes before this one (heldResult.js); and while a Batch Mode
 * round is being resolved, or the kept miss's narration is still being
 * written, "It is done" is refused and says so — the round tells its entries
 * once, and this beat follows the miss's. A vow whose swear is told meanwhile
 * waits the same way, and needs no press: its Sojourn is resolved once the
 * round is narrated and closed (batch/driver.js finishRound).
 */

import { onChatMessageRender } from "../system/chatHooks.js";
import { isCanonicalGM, onGmStoodDown } from "../multiplayer/gmGate.js";
import { refusePress } from "../multiplayer/gmRelay.js";
import {
  getActor, createCharacterVowItem, isPlayerCharacterActor, readNeedVow, vowNeedCardId, needCardIdsOfVow,
  markNeedVowSwearTold, toldNeedCardIds,
} from "../character/actorBridge.js";
import { getCurrentSiteKind } from "../entities/location.js";
import { moveDisplayName } from "../system/i18n.js";
import { RANKS } from "../schemas.js";
import { relayCardAction } from "./cardActions.js";
import { requesterOwnsActor, resultUpgradeRunningHere, struckOutcomeLine, struckMatchLine, struckEffectLine } from "./burnMomentum.js";
import { moveCardFor, roundResolvingNow } from "./resultUpgrade.js";
import { mapConsequences, buildLoremasterContext, upgradedOracleSeeds } from "./resolver.js";

const MODULE_ID = "starforged-companion";
const MOVE_ID   = "sojourn";

// The longest vow the card takes — Begin a Session's offer's own limit
// (safety/sessionLifecycleDialogs.js VOW_NAME_MAX).
const NEED_VOW_NAME_MAX = 120;

// Need cards a press is being applied to on this (the canonical GM's) client.
const _inFlight = new Set();

// How the need was answered, as the cards say it.
const ANSWERED = Object.freeze({
  vow:  "an iron vow was sworn to see the community's need done",
  done: "the community's need was met",
});

// What the strong hit's narration is told in place of a player's line: the
// miss and (for a vow) the oath are told already — this beat is the refuge.
const ANSWERED_LINES = Object.freeze({
  vow:  "[On a miss the community asked for help, and the character has sworn an iron vow to see it done. The move now resolves as a strong hit. "
    + "The miss and the oath are already told: tell the refuge the community gives now.]",
  done: "[On a miss the community asked for help, and the character has done what was asked. The move now resolves as a strong hit. "
    + "The miss is already told: tell the help given, briefly, and the refuge the community gives now.]",
});

// Why "It is done" changed nothing yet, said to its presser.
const NOT_YET = Object.freeze({
  "round-resolving":     "A round is being resolved — press ✔ It is done once the round is narrated.",
  "narration-in-flight": "This Sojourn's own narration is still being written — press ✔ It is done once it is posted.",
});

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A need card's module flags as they stand now — the live game.messages copy when there is one. */
function liveFlags(message) {
  const live = message?.id ? globalThis.game?.messages?.get?.(message.id) : null;
  return (live ?? message)?.flags?.[MODULE_ID] ?? {};
}

/** The strong hit a need answered resolves the Sojourn as — its consequences (resolver.js). */
function strongHit() {
  return mapConsequences(MOVE_ID, "strong_hit", false);
}

/**
 * The vow a need card's ⚔ Swear an Iron Vow wrote, as it stands on its
 * roller's sheet now — the vow whose `sojournNeedCard` flag names the card
 * (actorBridge.readNeedVow) — or null: none was written, or it is no longer
 * there. The vow's flag is the one link between the two, and the sheet is
 * the truth: the card keeps no id of its own to drift from it.
 *
 * @param {ChatMessage} message — the need card
 * @returns {{ id: string, name: string }|null}
 */
function needVowOnSheet(message) {
  const actorId = liveFlags(message).actorId;
  const actor = typeof actorId === "string" && actorId ? (getActor(actorId) ?? null) : null;
  return message?.id ? readNeedVow(actor, message.id) : null;
}

/**
 * Whether ⚔ Swear an Iron Vow is taken on a need card: the card is resolved,
 * its vow is on the sheet, or its vow was sworn and told before it was
 * deleted (`swornVowDeleted` — the oath stands, issue #364
 * SOJOURN-TOLD-VOW-DELETED). A vow written and deleted since — before its
 * swear was told — leaves it free again: nothing can swear a vow that is
 * not there (issue #364 SOJOURN-VOW-DELETED-BEFORE-SWORN).
 *
 * @param {ChatMessage} message — the need card
 * @returns {boolean}
 */
function needVowTaken(message) {
  const f = liveFlags(message);
  return !!(f.resolved || f.swornVowDeleted || needVowOnSheet(message));
}

/** The need card's vow fields and ⚔ Swear an Iron Vow, as HTML. `gone`: a vow written from the card was deleted since. */
function vowOfferHtml(who, { gone = false } = {}) {
  const ranks = RANKS.map(r => `<option value="${r}"${r === "dangerous" ? " selected" : ""}>${r}</option>`).join("");
  return (gone ? `<p class="sf-incite-hint sf-sojourn-need-vow-gone">The vow written from this card is no longer on ${who}'s sheet — swear another, or press ✔ It is done.</p>` : "")
    + `<p class="sf-sojourn-need-vow">`
    + `<input type="text" class="sf-sojourn-need-vow-name" maxlength="${NEED_VOW_NAME_MAX}" placeholder="What do you swear to do?"> `
    + `<select class="sf-sojourn-need-vow-rank">${ranks}</select> `
    + `<button type="button" class="entity-btn" data-action="sf-sojourn-need-swear">⚔ Swear an Iron Vow</button></p>`
    + `<p class="sf-incite-hint">The vow goes on ${who}'s sheet; its card then offers the swear roll. Left blank, it is named on its sheet.</p>`;
}

/**
 * Pure: the community's need card's HTML. Open: the
 * rule, the vow (its name, its rank and ⚔ Swear an Iron Vow — or, once the
 * vow is on the sheet (`vowId`), where its swear roll is) and ✔ It is done. `vowGone`:
 * open again, saying the vow written before is no longer on the sheet.
 * `vowSworn`: the vow was sworn and told, and deleted since — the Sojourn is
 * resolved as soon as it can be. Resolved: how the need was answered and
 * what the strong hit gives. Escapes its inputs.
 *
 * @param {{ actorName?: string|null, vowId?: string|null, vowName?: string|null,
 *   vowGone?: boolean, vowSworn?: boolean, resolvedBy?: "vow"|"done"|null }} [state]
 * @returns {string}
 */
export function buildSojournNeedHtml({ actorName = null, vowId = null, vowName = null, vowGone = false, vowSworn = false, resolvedBy = null } = {}) {
  const who  = escapeHtml(typeof actorName === "string" && actorName.trim() ? actorName.trim() : "the character");
  const head = `<div class="sf-card sf-sojourn-need${resolvedBy ? " sf-sojourn-need--resolved" : ""}">`
    + `<div class="sf-card-header">🤝 Sojourn — the community's need</div><div class="sf-card-body">`;
  if (resolvedBy) {
    return `${head}<p>✦ <strong>Resolved as a strong hit</strong> — ${ANSWERED[resolvedBy] ?? ANSWERED.done}.</p>`
      + `<p class="sf-incite-hint">${escapeHtml(strongHit().otherEffect ?? "")}</p></div></div>`;
  }
  const rule = `<p>The community needs help, or makes a costly demand in exchange for safe harbor. `
    + `Do it, or Swear an Iron Vow to see it done, and this Sojourn is resolved as a strong hit.</p>`;
  const vow = vowSworn
    ? `<p class="sf-sojourn-need-vow sf-sojourn-need-vow-sworn">⚔ An iron vow was sworn to see it done, and told — it is no longer on ${who}'s sheet, but the oath stands: `
      + `this Sojourn is resolved as a strong hit as soon as it can be.</p>`
    : vowId
    ? `<p class="sf-sojourn-need-vow">⚔ ${vowName ? `"${escapeHtml(vowName)}"` : "A new vow"} is on ${who}'s sheet — `
      + `${vowName ? "" : "name it there, then "}press <strong>⚔ Swear it (roll)</strong> on its card. `
      + `Once it is sworn, this Sojourn is resolved as a strong hit.</p>`
    : vowOfferHtml(who, { gone: vowGone });
  const done = `<p><button type="button" class="entity-btn" data-action="sf-sojourn-need-done" `
    + `title="The help is given, or the demand met — resolves this Sojourn as a strong hit">✔ It is done</button></p>`;
  return `${head}${rule}${vow}${done}</div></div>`;
}

/**
 * The Sojourn a choice card's "Community needs help" pick answers: the
 * card's own resolution (its `resolutionId`), or null — a card that names
 * none (a pick applied from no card, a payoff Retry) has no Sojourn to
 * resolve, and its executor posts the reminder as before.
 *
 * @param {string|null} choiceCardId — the suffer choice card
 * @returns {{ resolutionId: string }|null}
 */
export function needResolutionOf(choiceCardId) {
  const card = typeof choiceCardId === "string" && choiceCardId ? (globalThis.game?.messages?.get?.(choiceCardId) ?? null) : null;
  const id = card?.flags?.[MODULE_ID]?.resolutionId;
  return typeof id === "string" && id ? { resolutionId: id } : null;
}

/**
 * Post the community's need card for a Sojourn miss whose "Community needs
 * help" was picked (sufferDialog.js runSufferCall — the canonical GM, where
 * a pick is applied). Null when the world refused it: the pick is then
 * handed back (sufferCard.js).
 *
 * @param {{ actor: Actor, resolutionId: string, stakes?: Object|null }} args — the roller, the
 *   Sojourn's resolution, and the stakes its player saw before the roll
 * @returns {Promise<ChatMessage|null>}
 */
export async function postSojournNeedCard({ actor, resolutionId, stakes = null } = {}) {
  if (!actor?.id || typeof resolutionId !== "string" || !resolutionId) return null;
  try {
    return (await globalThis.ChatMessage?.create?.({
      content: buildSojournNeedHtml({ actorName: actor.name ?? null }),
      flags: { [MODULE_ID]: {
        sojournNeedCard: true,
        resolutionId,
        actorId:         actor.id,
        ...(stakes && typeof stakes === "object" ? { stakes } : {}),
        resolved:        false,
      } },
    })) ?? null;
  } catch (err) {
    console.warn(`${MODULE_ID} | sojourn: the community's need card could not be posted:`, err?.message ?? err);
    return null;
  }
}

/**
 * Wire the community's need card's two buttons on render. A click disables
 * its button and relays the press to the canonical GM ("sojourn.need"); the
 * button re-arms when the press changed nothing (refused, not delivered).
 * ⚔ Swear an Iron Vow sends the vow as the card's fields have it; it is
 * disabled while the card's vow is on the sheet, ✔ It is done once the card
 * is resolved.
 *
 * What the card shows of its vow follows the sheet (needVowOnSheet, read on
 * every render — so on every client and after a reload), whatever its stored
 * text says: an open card whose text says a vow was written, with no such
 * vow on the sheet, offers ⚔ again in place of "… is on the sheet"; one
 * whose text still offers ⚔ while its vow is on the sheet has ⚔ disabled.
 * The canonical GM's deleteItem hook also writes a deleted vow back to the
 * card (releaseNeedsOfDeletedVow), which re-renders it everywhere at once.
 * Register once — from `ready`: on the canonical GM the Sojourns of the vows
 * whose swear was told before this page loaded are resolved now
 * (resolveToldSojournNeeds), so a reload between the oath and its refuge
 * loses nothing. So are they when a GM leaves, or their page stands down,
 * and this GM is canonical after it — on the hooks the Batch Mode driver
 * takes over a departed GM's round on (batch/driver.js onUserConnected):
 * the GM who had them to resolve is gone, and a table of two GMs waited for
 * the next round's close or a reload of the GM who took over (issue #364
 * SOJOURN-NO-SWEEP-ON-GM-TAKEOVER).
 */
export function registerSojournNeedHook() {
  if (registerSojournNeedHook._installed) return;
  registerSojournNeedHook._installed = true;
  globalThis.Hooks?.on?.("deleteItem", (item) => {
    releaseNeedsOfDeletedVow(item).catch(err =>
      console.warn(`${MODULE_ID} | sojourn: a deleted vow's need card could not be opened again:`, err?.message ?? err));
  });
  const gmGone = (user) => {
    if (!user?.isGM) return;
    resolveToldSojournNeeds().catch(err =>
      console.warn(`${MODULE_ID} | sojourn: the Sojourns of the vows a departed GM had sworn could not be resolved:`, err?.message ?? err));
  };
  globalThis.Hooks?.on?.("userConnected", (user, connected) => { if (!connected) gmGone(user); });
  onGmStoodDown(gmGone);
  resolveToldSojournNeeds().catch(err =>
    console.warn(`${MODULE_ID} | sojourn: the Sojourns of the vows sworn before this page loaded could not be resolved:`, err?.message ?? err));
  onChatMessageRender((message, root) => {
    if (!message?.flags?.[MODULE_ID]?.sojournNeedCard) return;
    if (!liveFlags(message).resolved && !liveFlags(message).swornVowDeleted && !needVowOnSheet(message)) {
      const said = root.querySelector(".sf-sojourn-need-vow");
      if (said && !root.querySelector('[data-action="sf-sojourn-need-swear"]')) {
        const actorId = liveFlags(message).actorId;
        const who = escapeHtml((typeof actorId === "string" && actorId ? getActor(actorId)?.name : null) ?? "the character");
        said.insertAdjacentHTML("afterend", vowOfferHtml(who, { gone: true }));
        said.remove();
      }
    }
    const wire = (action, way, taken, fields = () => ({})) => {
      const btn = root.querySelector(`[data-action="${action}"]`);
      if (!btn) return;
      if (taken()) {
        btn.disabled = true;
        return;
      }
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      fresh.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        fresh.disabled = true;
        await relayCardAction({
          kind:       "sojourn.need",
          payload:    { messageId: message?.id ?? null, way, ...fields() },
          isResolved: taken,
          restore:    () => { fresh.disabled = false; },
        });
      });
    };
    wire("sf-sojourn-need-swear", "vow",
      () => needVowTaken(message),
      () => ({
        vowName: String(root.querySelector(".sf-sojourn-need-vow-name")?.value ?? ""),
        rank:    String(root.querySelector(".sf-sojourn-need-vow-rank")?.value ?? ""),
      }));
    wire("sf-sojourn-need-done", "done", () => !!liveFlags(message).resolved);
  });
}

/**
 * A vow Item was deleted (the deleteItem hook, every client — the canonical
 * GM acts): the open need card it was written for (the vow's own
 * `sojournNeedCard` flag — actorBridge.vowNeedCardId) has its text opened
 * again, saying the vow is gone, so every client's card offers ⚔ Swear an
 * Iron Vow again at once. A write the world refuses, or a deletion no GM
 * saw, leaves the stored text as it was: its render still reads the sheet
 * (registerSojournNeedHook), and a ⚔ press still writes a vow
 * (writeNeedVow). Not a card whose press is being applied here, nor one
 * another vow on the sheet still answers.
 *
 * A vow whose swear was told (its `sojournSwearTold` — the deleted Item's
 * flags are read here) is not taken back: the oath was sworn and told, so
 * its Sojourn is resolved now, as the swear's own resolve would have been
 * (resolveNeedOfDeletedToldVow; decided by the maintainer, issue #364
 * SOJOURN-TOLD-VOW-DELETED — the card offered ⚔ again, and the told mark
 * went with the vow).
 *
 * @param {Item|null} item — the deleted Item
 * @returns {Promise<number>} the cards opened again or resolved
 */
async function releaseNeedsOfDeletedVow(item) {
  const cardId = isCanonicalGM() ? vowNeedCardId(item) : null;
  const card = cardId ? (globalThis.game?.messages?.get?.(cardId) ?? null) : null;
  const f = card?.flags?.[MODULE_ID];
  if (f?.sojournNeedCard !== true || f.resolved || f.swornVowDeleted || _inFlight.has(card.id) || needVowOnSheet(card)) return 0;
  const actorName = (typeof f.actorId === "string" && f.actorId ? getActor(f.actorId)?.name : null) ?? null;
  if (item?.flags?.[MODULE_ID]?.sojournSwearTold === true) return resolveNeedOfDeletedToldVow(card, actorName);
  await card.update({ content: buildSojournNeedHtml({ actorName, vowGone: true }) });
  return 1;
}

/**
 * The need card of a vow deleted once its swear was told
 * (releaseNeedsOfDeletedVow): its Sojourn is resolved now, as answered by
 * the vow. One that cannot be resolved yet — a Batch Mode round is being
 * resolved, or the world refused the claim — waits as the vow's own resolve
 * would have; the vow that said its swear was told is gone, so the card
 * says it instead (`swornVowDeleted`, read by resolveToldSojournNeeds beside
 * the vows), and says the oath stands in place of offering ⚔ again.
 * Canonical GM.
 *
 * @param {ChatMessage} card — the need card
 * @param {string|null} actorName — its roller's name
 * @returns {Promise<number>} 1 when resolved now
 */
async function resolveNeedOfDeletedToldVow(card, actorName) {
  if (await resolveNeedsAnsweredByVow([card.id])) return 1;
  if (liveFlags(card).resolved) return 0;
  await card.update({
    [`flags.${MODULE_ID}.swornVowDeleted`]: true,
    content: buildSojournNeedHtml({ actorName, vowSworn: true }),
  }).catch(err => console.warn(`${MODULE_ID} | sojourn: card ${card.id} could not keep that its vow was sworn — it offers the vow again:`, err?.message ?? err));
  return 0;
}

/**
 * gmRelay handler for "sojourn.need" — a press on the community's need card,
 * on the canonical GM. The card's roller's player or a GM may press it (a
 * card whose character is gone answers nothing); one press at a time per
 * card. `way: "vow"` writes the vow on the roller's sheet, once
 * (writeNeedVow); `way: "done"` resolves the Sojourn as a strong hit, once
 * (resolveSojournNeed). A press that cannot land yet is said to its presser.
 *
 * @param {{ messageId?: string, way?: "vow"|"done", vowName?: string, rank?: string }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applySojournNeedFromRelay(payload = {}, ctx = {}) {
  const messageId = typeof payload?.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  const f = message?.flags?.[MODULE_ID] ?? {};
  if (!message || f.sojournNeedCard !== true) {
    console.warn(`${MODULE_ID} | sojourn: card ${messageId ?? "?"} is no community's need card — press ignored.`);
    return { applied: false, reason: "no-card" };
  }
  const way = payload.way === "vow" || payload.way === "done" ? payload.way : null;
  if (!way) return { applied: false, reason: "not-offered" };
  if (f.resolved || _inFlight.has(messageId)) {
    console.debug(`${MODULE_ID} | sojourn: card ${messageId} already answered — ignoring the press.`);
    return { applied: false, reason: "already-resolved" };
  }
  const found = typeof f.actorId === "string" && f.actorId ? (getActor(f.actorId) ?? null) : null;
  const actor = isPlayerCharacterActor(found) ? found : null;
  if (!actor) {
    console.warn(`${MODULE_ID} | sojourn: card ${messageId}'s character is gone — nothing answered.`);
    refusePress(ctx, "no-actor");
    return { applied: false, reason: "no-actor" };
  }
  if (!requesterOwnsActor(actor, ctx)) {
    console.warn(`${MODULE_ID} | sojourn: user ${ctx?.requesterId ?? "?"} does not own ${actor.name} — press refused.`);
    refusePress(ctx, "not-owner", actor);
    return { applied: false, reason: "not-owner" };
  }
  _inFlight.add(messageId);
  try {
    if (way === "vow") {
      const res = await writeNeedVow(message, actor, payload);
      if (res.reason === "vow-not-saved") {
        await tellPresser(ctx, "Vow not written",
          `The vow could not be written on ${escapeHtml(actor.name ?? "the character")}&rsquo;s sheet — add it on the sheet, or press the button again.`);
      }
      return res;
    }
    const res = await resolveSojournNeed(message, "done");
    if (NOT_YET[res.reason]) await tellPresser(ctx, "Not yet", NOT_YET[res.reason]);
    return res;
  } finally {
    _inFlight.delete(messageId);
  }
}

/**
 * ⚔ Swear an Iron Vow on the need card: the vow is written on the roller's
 * sheet — the name and rank the press carries (client-asserted text, trimmed
 * and capped; a blank name makes a vow still to be named, as the sheet's
 * + Vow does) — carrying the card's id as its own `sojournNeedCard` flag
 * (actorBridge.createCharacterVowItem): the one write that makes the vow
 * also makes its link to this card, so the swear finds its Sojourn whatever
 * becomes of the card's own writes (issue #364
 * SOJOURN-NEED-CARD-VOW-ID-WRITE-REFUSED). The canonical GM's createItem
 * hook then posts the vow's own card, whose ⚔ Swear it (roll) is the swear
 * (session/swearVow.js registerPlayerVowHook). The card's text is then
 * rewritten to say where the vow is — display only: refused, its render
 * still reads the sheet. One vow per card at a time (needVowTaken — the
 * sheet; one press at a time, applySojournNeedFromRelay); a vow written
 * before and deleted since is no vow, and the press writes another.
 *
 * @param {ChatMessage} message — the need card
 * @param {Actor} actor — the roller
 * @param {{ vowName?: string, rank?: string }} payload
 * @returns {Promise<{ applied: boolean, reason?: string, vowId?: string }>}
 */
async function writeNeedVow(message, actor, payload) {
  if (needVowTaken(message)) return { applied: false, reason: "vow-already-written" };
  const name = String(payload?.vowName ?? "").replace(/\s+/g, " ").trim().slice(0, NEED_VOW_NAME_MAX);
  const rank = RANKS.includes(payload?.rank) ? payload.rank : "dangerous";
  // A blank name is the sheet's own "still to be named" (createCharacterVowItem's default).
  const item = await createCharacterVowItem(actor, { name, rank, sojournNeedCard: message.id }).catch(err => {
    console.warn(`${MODULE_ID} | sojourn: the vow could not be written on ${actor.name}'s sheet:`, err?.message ?? err);
    return null;
  });
  if (!item?.id) return { applied: false, reason: "vow-not-saved" };
  await message.update({
    content: buildSojournNeedHtml({ actorName: actor.name ?? null, vowId: item.id, vowName: name || null }),
  }).catch(err => console.warn(`${MODULE_ID} | sojourn: card ${message.id} could not say its vow is written — its swear resolves the Sojourn all the same:`, err?.message ?? err));
  return { applied: true, vowId: item.id };
}

/**
 * A Swear an Iron Vow was rolled for a vow and has been told (movePipeline.js
 * finishMove, after the swear's own narration; a held swear's:
 * heldResult.js): the vow is marked so (actorBridge.markNeedVowSwearTold —
 * only a vow written for a need card), and every open need card it was
 * written for — the cards its own `sojournNeedCard` flag names
 * (actorBridge.needCardIdsOfVow) — is resolved: the Sojourn it answers, as a
 * strong hit. Canonical GM. One that cannot be resolved now — a Batch Mode
 * round is being resolved — stays open, and is resolved by the vow once it
 * can be (resolveToldSojournNeeds); its ✔ It is done stays live meanwhile.
 *
 * @param {string|null} vowId — the sworn vow's id (movePipeline.js swornVowId)
 * @returns {Promise<number>} the Sojourns resolved
 */
export async function resolveSojournNeedsForVow(vowId) {
  if (typeof vowId !== "string" || !vowId || !isCanonicalGM()) return 0;
  const cardIds = needCardIdsOfVow(vowId);
  if (!cardIds.length) return 0;
  await markNeedVowSwearTold(vowId);
  return resolveNeedsAnsweredByVow(cardIds);
}

/**
 * Resolve the Sojourn of every open need card whose vow's Swear an Iron Vow
 * has been told (actorBridge.toldNeedCardIds — what the vows on the sheets
 * say) — the resolves that could not be made when the swear was told. Called
 * where one can be made again: once a Batch Mode round is narrated and closed
 * (batch/driver.js finishRound — a round being resolved refuses the resolve:
 * it tells its entries once, and the refuge follows it), at the canonical
 * GM's load (registerSojournNeedHook — the page reloaded between the oath and
 * the resolve), and when a GM leaves or stands down and this GM is canonical
 * after it (registerSojournNeedHook — the GM who had it to make is gone). Each card is claimed first (`resolved`), so a Sojourn is
 * resolved once whichever call comes first, ✔ It is done included. Canonical
 * GM; a no-op with nothing told and unresolved. With the vows' cards go the
 * open cards whose told vow was deleted before its resolve could be made
 * (`swornVowDeleted` — resolveNeedOfDeletedToldVow; issue #364
 * SOJOURN-TOLD-VOW-DELETED).
 *
 * @returns {Promise<number>} the Sojourns resolved
 */
export async function resolveToldSojournNeeds() {
  if (!isCanonicalGM()) return 0;
  const orphaned = (globalThis.game?.messages?.contents ?? [])
    .filter(m => m?.flags?.[MODULE_ID]?.sojournNeedCard === true && m.flags[MODULE_ID].swornVowDeleted === true && !m.flags[MODULE_ID].resolved)
    .map(m => m.id);
  return resolveNeedsAnsweredByVow([...new Set([...toldNeedCardIds(), ...orphaned])]);
}

/**
 * Resolve each of the need cards `cardIds` that is still open as answered by
 * its vow — not one resolved already, nor one a press or another resolve is
 * being applied to here. One that is refused stays open: its vow still says
 * its swear is told (resolveToldSojournNeeds).
 *
 * @param {string[]} cardIds — need cards' chat message ids
 * @returns {Promise<number>} the Sojourns resolved
 */
async function resolveNeedsAnsweredByVow(cardIds) {
  let resolved = 0;
  for (const cardId of cardIds) {
    const card = globalThis.game?.messages?.get?.(cardId) ?? null;
    const f = card?.flags?.[MODULE_ID];
    if (f?.sojournNeedCard !== true || f.resolved || _inFlight.has(card.id)) continue;
    _inFlight.add(card.id);
    try {
      const res = await resolveSojournNeed(card, "vow");
      if (res.applied) resolved += 1;
      else console.warn(`${MODULE_ID} | sojourn: the vow is sworn, but card ${card.id} is not resolved yet (${res.reason ?? "?"}) — it is resolved once the round is narrated or this page loads again, or by its ✔ It is done.`);
    } finally {
      _inFlight.delete(card.id);
    }
  }
  return resolved;
}

/**
 * Resolve a Sojourn miss as the strong hit its answered need gives — once,
 * on the canonical GM. The need card is claimed first (`resolved`); then the
 * Sojourn's move card is rewritten as an improved result's is, and the
 * strong hit is narrated as a second beat, for the roller (the module
 * header says why the miss's narration stands). Refused, with nothing
 * changed, while a Batch Mode round is being resolved or the kept miss's
 * narration is being written here. Never throws.
 *
 * @param {ChatMessage} message — the need card
 * @param {"vow"|"done"} by — how the need was answered
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
async function resolveSojournNeed(message, by) {
  if (!isCanonicalGM()) return { applied: false, reason: "not-canonical-gm" };
  const f = liveFlags(message);
  if (f.sojournNeedCard !== true || f.resolved) return { applied: false, reason: "already-resolved" };
  if (roundResolvingNow()) return { applied: false, reason: "round-resolving" };
  const moveCard = moveCardFor(f.resolutionId ?? null);
  if (moveCard?.id && resultUpgradeRunningHere(moveCard.id)) return { applied: false, reason: "narration-in-flight" };
  const actorName = (typeof f.actorId === "string" && f.actorId ? getActor(f.actorId)?.name : null) ?? null;
  try {
    await message.update({
      [`flags.${MODULE_ID}.resolved`]: true,
      content: buildSojournNeedHtml({ actorName, resolvedBy: by }),
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | sojourn: card ${message.id} could not be claimed — the Sojourn is not resolved:`, err?.message ?? err);
    return { applied: false, reason: "claim-refused" };
  }

  // A miss still held for Burn / Improve / Keep (its keep at the pick did not
  // land): kept now, so its own narration comes first.
  await import("./heldResult.js")
    .then(({ keepHeldResultForChoice }) => keepHeldResultForChoice(f.resolutionId ?? null))
    .catch(err => console.warn(`${MODULE_ID} | sojourn: the held miss could not be kept before its strong hit:`, err?.message ?? err));

  if (moveCard) {
    await moveCard.update({ content: buildResolvedCardContent(moveCard.content, by) })
      .catch(err => console.warn(`${MODULE_ID} | sojourn: move card ${moveCard.id} could not be rewritten:`, err?.message ?? err));
  } else {
    console.warn(`${MODULE_ID} | sojourn: the move card of resolution ${f.resolutionId ?? "?"} is gone — only its narration says it is a strong hit.`);
  }

  try {
    const stored = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {};
    // A working copy: the narration starts a scene and applies its sidecar on it (rules/foundry-api.md).
    const campaignState = globalThis.foundry?.utils?.deepClone ? globalThis.foundry.utils.deepClone(stored) : JSON.parse(JSON.stringify(stored));
    const { narrateResolution } = await import("../narration/narrator.js");
    await narrateResolution(buildAnsweredResolution(f, by, campaignState), campaignState, { speakerActorId: f.actorId ?? null });
  } catch (err) {
    console.warn(`${MODULE_ID} | sojourn: the strong hit could not be narrated — its cards say it all the same:`, err?.message ?? err);
  }
  return { applied: true };
}

/**
 * The Sojourn's move card once its need is answered, read as an improved
 * result's card reads (improveResult.js buildImprovedCardContent): the
 * outcome label the roll rendered ("Miss"), its match line and its
 * consequence line struck, then how the need was answered and the strong
 * hit's own text.
 *
 * @param {string} originalContent
 * @param {"vow"|"done"} by
 * @returns {string}
 */
export function buildResolvedCardContent(originalContent, by) {
  const html = String(originalContent ?? "");
  if (html.includes("sf-sojourn-resolved")) return html;
  const effect = strongHit().otherEffect;
  const banner = `<div class="sf-sojourn-resolved"><em>✦ Resolved as a strong hit — ${ANSWERED[by] ?? ANSWERED.done}.</em>`
    + (effect ? `<div class="sf-move-effect">${escapeHtml(effect)}</div>` : "")
    + `</div>`;
  return `${struckOutcomeLine(struckEffectLine(struckMatchLine(html)))}${banner}`;
}

/**
 * The strong hit an answered need gives, as a resolution for the narrator:
 * no dice — the roll was the miss's, already told — the strong hit's
 * consequences and behind-the-scenes rolls, the stakes the player saw before
 * the roll (the hit is delivered now), and how the need was answered
 * (`needAnswered`, the narrator's MOVE OUTCOME — resolver.js
 * buildLoremasterContext). Its line is a marker, not the player's words
 * (`inputMethod: "resolved"`, narrator.js). Not an upgrade of the miss
 * (`upgradeOf`): the miss's narration stands, and an X-Card on this
 * narration takes this one alone.
 */
function buildAnsweredResolution(f, by, campaignState) {
  const consequences = strongHit();
  const resolution = {
    _id:             globalThis.foundry.utils.randomID(),
    moveId:          MOVE_ID,
    moveName:        moveDisplayName(MOVE_ID),
    statUsed:        null,
    statValue:       0,
    adds:            0,
    actionDie:       0,
    actionScore:     0,
    challengeDice:   [],
    isMatch:         false,
    outcome:         "strong_hit",
    outcomeLabel:    "Strong Hit",
    isProgressMove:  false,
    progressScore:   0,
    needAnswered:    by,
    consequences,
    oracleSeeds:     upgradedOracleSeeds({ moveId: MOVE_ID, outcome: "strong_hit", isMatch: false, consequences,
      campaignState, currentSite: getCurrentSiteKind(campaignState) }),
    skeletonRequests: [],
    stakes:          f.stakes ?? null,
    playerNarration: ANSWERED_LINES[by] ?? ANSWERED_LINES.done,
    inputMethod:     "resolved",
    sessionId:       campaignState?.currentSessionId ?? "",
  };
  resolution.loremasterContext = buildLoremasterContext({ ...resolution, rollKind: "action" });
  return resolution;
}

/** Whisper a press's presser and the GMs why it changed nothing yet — a refused-press notice, as gmRelay's (tellRefusedPress). Never throws. */
async function tellPresser(ctx, title, text) {
  const gmIds = Array.from(globalThis.game?.users ?? []).filter(u => u?.isGM).map(u => u.id);
  try {
    await globalThis.ChatMessage?.create?.({
      content: `<div class="sf-ptp-card"><strong>${title}</strong><p>${text}</p></div>`,
      whisper: [...new Set([ctx?.requesterId, ...gmIds].filter(Boolean))],
      flags:   { [MODULE_ID]: { pressRefusedNotice: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | sojourn: telling ${ctx?.requesterId ?? "?"} why the press changed nothing failed:`, err?.message ?? err);
  }
}
