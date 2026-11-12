/**
 * STARFORGED COMPANION
 * src/moves/cardActions.js — one-shot chat-card buttons, applied on the GM
 *
 * Two card families used to fire more than once:
 *
 *   - The connection picker ("🤝 Develop Relationship" / "🔗 Forge a Bond" →
 *     "Which connection?"). A click posted the forced move from the clicker's
 *     client and could only stamp the card `resolved` when the clicker owned
 *     the card — any other user's click left the buttons live, so a second
 *     click (by anyone, or after a re-render) rolled the move again.
 *   - The won-fight card's "⚑ Mark milestone" / "🤝 Deepen your bond" buttons
 *     relayed over raw socket emits with no resolved flag at all, so each
 *     click marked the vow / deepened the bond again, and with no GM
 *     connected the click vanished silently.
 *
 * Both now relay through the canonical-GM action relay
 * (src/multiplayer/gmRelay.js — "connection.pick", "fightVow.markMilestone",
 * "fightVow.deepenBond"), as does a payoff failure card's Retry
 * ("payoff.retry", issue #306 R04), an Explore a Waypoint match's
 * Make a Discovery / Confront Chaos ("waypoint.oracle", issue #316 T06), a
 * "Which vow?" card's pick ("fulfilVow.pick", issue #321 U02), a move card's
 * "⚑ Mark Progress on Vow" ("milestone.suggestion") and an expedition's
 * "🔁 Recommit" ("expedition.recommit", both issue #321 U20), and a move
 * card's or won-fight card's "🏁 Attempt to Fulfill" ("fulfilVow.attempt",
 * known-issues FULFIL-BUTTON-LOCAL-DISABLE), and a combat move card's "⚔
 * Attempt to Finish the Fight" ("tda.attempt") and an expedition card's "🗺
 * Finish the Expedition" ("expedition.finish" — issue #338 D1), and a paced
 * card's "Roll <move>" ("paced.roll") and a "Which fight?" pick
 * ("whichFight.pick" — known-issues PACED-ROLL-OPEN-PRESS). The
 * handlers below run on the canonical GM, check
 * and stamp the card's resolved flag behind an in-flight guard (the
 * milestone-picker pattern, src/moves/milestonePicker.js), and take every
 * effect value from the GM-authored card — never from the client payload
 * beyond "which button" (gmRelay.js "Trust model"). The render binders live in
 * src/index.js (wireConnectionPickerButtons, wireFightVowButtons) and call
 * relayCardAction() below so a click that is not delivered re-arms its
 * button.
 */

import { requestGmAction, refusePress } from "../multiplayer/gmRelay.js";
import { isPlayerCharacterActor } from "../character/actorBridge.js";
import { requesterOwnsActor, RELAY_RECOVERY_MS } from "./burnMomentum.js";
import { marksForSourceRank } from "./milestone.js";
import { consequenceChosen, retireOutcomeChoiceCards, reopenRetiredChoiceCards, reopenUpgradesForUndoneChoice } from "./resultUpgrade.js";

const MODULE_ID = "starforged-companion";

// "<messageId>:<action>" keys currently being applied on this (the canonical
// GM's) client — a second near-simultaneous click must not re-apply while the
// first is between its effect and its resolved stamp.
const _inFlight = new Set();

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT SIDE — relay a click and keep the button honest
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a card-button click to the canonical GM. `restore` re-arms the button;
 * it runs when:
 *   - the request throws or is refused (no GM connected — requestGmAction has
 *     already warned the user);
 *   - the action ran locally (this client is the canonical GM) but the card
 *     did not end up resolved (refusal, stale card, failure);
 *   - the action was relayed and the card is still unresolved after
 *     `recoveryMs` (the relay has no ack channel).
 * A resolved card re-renders with the button disabled, so no restore is
 * needed then.
 *
 * @param {Object}   opts
 * @param {string}   opts.kind        gmRelay action kind
 * @param {Object}   opts.payload     plain data; must carry `messageId`
 * @param {Function} opts.isResolved  () => boolean — reads the live card flag
 * @param {Function} opts.restore     () => void
 * @param {number}   [opts.recoveryMs]
 * @returns {Promise<Object|null>} the requestGmAction result (null on throw)
 */
export async function relayCardAction({ kind, payload, isResolved, restore, recoveryMs = RELAY_RECOVERY_MS }) {
  if (!payload?.messageId) {
    console.warn(`${MODULE_ID} | ${kind}: card has no id — cannot relay the click.`);
    restore();
    return null;
  }
  let res = null;
  try {
    res = await requestGmAction(kind, payload);
  } catch (err) {
    console.error(`${MODULE_ID} | ${kind}: click handler failed:`, err);
    restore();
    return null;
  }
  if (!res?.ok) {
    restore();
    return res;
  }
  if (!res.relayed) {
    if (!isResolved()) restore();
    return res;
  }
  setTimeout(() => {
    if (isResolved()) return;
    console.debug(`${MODULE_ID} | ${kind}: card ${payload.messageId} not resolved after ${recoveryMs}ms — re-enabling the button.`);
    restore();
  }, recoveryMs);
  return res;
}

/**
 * The `data-*` attributes of every `<button data-action="<dataAction>">` in a
 * card's HTML, camel-cased like `HTMLElement.dataset` and HTML-unescaped.
 * Lets a GM-side handler check a relayed choice against the buttons a card
 * that predates its structured `choices` flag actually offered.
 *
 * @param {string} content
 * @param {string} dataAction
 * @returns {Array<Object<string,string>>}
 */
export function parseCardButtons(content, dataAction) {
  const out = [];
  const html = String(content ?? "");
  for (const [, attrs] of html.matchAll(/<button\b([^>]*)>/gi)) {
    const data = {};
    for (const [, name, value] of attrs.matchAll(/\bdata-([a-z0-9-]+)="([^"]*)"/gi)) {
      const key = name.toLowerCase().replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
      data[key] = unescapeHtml(value);
    }
    if (data.action === dataAction) out.push(data);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// A CARD'S MOVE THAT WAS NOT ROLLED — hand the card back
// ─────────────────────────────────────────────────────────────────────────────

// A claim path a forced move may name: a flag key, or one level under one
// (`legacyRolled.<track>`). Anything else is refused, never written.
const SOURCE_CLAIM_PATH = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_-]+)?$/;

/**
 * The module flag a card button's forced move carries back to the card it
 * claimed: which card, which claim, the value the press set, and what
 * releasing it writes — the same value the button's own failed-post path
 * writes (false, or null for a claim that records a pick). When the pipeline
 * does not roll the move (its confirm dialog closed or cancelled, the move
 * lock or the world refused its start, it failed before its dice),
 * `releaseSourceCard` writes that value back, so the button can be pressed
 * again (issue #347 AB06).
 *
 * @param {string|null} messageId — the claimed card
 * @param {string} claim — the claimed flag's path under the module's flags
 * @param {false|null} [release]
 * @param {Object} [opts]
 * @param {*} [opts.value] — what the press set (default true): released only
 *   while the card still holds it
 * @param {{ resolutionId: string|null, kind: string }} [opts.reopenRetired] —
 *   the outcome choice cards the press retired, brought back with it
 * @returns {{ sourceCard: Object }|{}}
 */
export function sourceCardFlag(messageId, claim, release = false, { value = true, reopenRetired = null } = {}) {
  if (typeof messageId !== "string" || !messageId) return {};
  return { sourceCard: {
    messageId, claim, value, release: release === null ? null : false,
    ...(reopenRetired ? { reopenRetired } : {}),
  } };
}

/**
 * Hand back the card a forced move claimed, when that move was not rolled.
 * Runs where the pipeline runs (the canonical GM). Only a post a GM made is
 * trusted — every card button's move is posted by the canonical GM's relay
 * handler; a player can put any flag on their own chat line. A flag claim is
 * released only while the card still holds the value the press set (a claim
 * that changed since is not this press's to undo), and a waypoint
 * alternative's press brings back the ordinary reward's cards it retired. A
 * resist roll a suffer card owes (`kind: "suffer"`) re-opens that card
 * (sufferCard.js reopenSufferCard) — and, no consequence chosen now, the
 * move's Burn Momentum / Improve Result its press closed (resultUpgrade.js
 * reopenUpgradesForUndoneChoice, issue #347 RESIST-BURN-STAYS-CLOSED).
 *
 * @param {ChatMessage} forced — the forced move's chat message
 * @returns {Promise<boolean>} whether a card was handed back
 */
export async function releaseSourceCard(forced) {
  const src = forced?.flags?.[MODULE_ID]?.sourceCard;
  if (!src || typeof src.messageId !== "string" || !src.messageId) return false;
  if (forced.author?.isGM !== true) {
    console.warn(`${MODULE_ID} | a forced move not posted by a GM names a card to hand back — ignored.`);
    return false;
  }
  if (src.kind === "suffer") {
    const { reopenSufferCard } = await import("./sufferCard.js");
    const reopened = await reopenSufferCard(src.messageId);
    if (reopened) {
      const suffer = globalThis.game?.messages?.get?.(src.messageId) ?? null;
      await reopenUpgradesForUndoneChoice(suffer?.flags?.[MODULE_ID]?.resolutionId ?? null);
    }
    return reopened;
  }
  if (typeof src.claim !== "string" || !SOURCE_CLAIM_PATH.test(src.claim)) return false;
  const card = globalThis.game?.messages?.get?.(src.messageId) ?? null;
  if (!card) return false;
  if (Object.prototype.hasOwnProperty.call(src, "value")) {
    const now = src.claim.split(".").reduce((o, k) => (o == null ? undefined : o[k]), card.flags?.[MODULE_ID] ?? {});
    if (now !== src.value) return false;                 // changed since the press
  }
  try {
    await card.update({ [`flags.${MODULE_ID}.${src.claim}`]: src.release === null ? null : false });
    if (src.reopenRetired?.resolutionId && src.reopenRetired?.kind) {
      await reopenRetiredChoiceCards(src.reopenRetired.resolutionId, src.reopenRetired.kind);
    }
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | handing card ${src.messageId} back failed:`, err?.message ?? err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTION PICKER — gmRelay "connection.pick"
// ─────────────────────────────────────────────────────────────────────────────

const PICK_MOVES = Object.freeze({
  develop: { moveId: "develop_your_relationship", content: (name) => `Develop my relationship with ${name}.` },
  forge:   { moveId: "forge_a_bond",              content: (name) => `Forge a bond with ${name}.` },
});

/**
 * gmRelay handler for "connection.pick" — runs on the canonical GM.
 *
 * Validates the pick against the card's own choices, claims the picker
 * (`resolved`), then posts the forced Develop Your Relationship / Forge a
 * Bond move ONCE — with `speaker.actor` = the picker's roller (the move
 * card's, its `actorId`; the clicker's PC on a picker that names none), so
 * the pipeline's resolveSpeakerActorId credits the roller even though the GM
 * authors the message, and the picked connection as `forcedMoveTargetId`
 * (host id) + `forcedMoveTarget` (name). Idempotent per card: a refused claim posts
 * nothing, and a post that fails releases the claim (issue #336 Y24).
 *
 * @param {{ messageId?: string, hostId?: string|null, connectionName?: string|null,
 *           actorId?: string|null }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export async function applyConnectionPick(payload = {}, ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | connection pick: picker card ${messageId ?? "?"} not found — no move posted.`);
    return { posted: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f.connectionPicker) {
    console.warn(`${MODULE_ID} | connection pick: message ${messageId} is not a connection picker — ignored.`);
    return { posted: false, reason: "not-a-picker" };
  }
  const key = `${messageId}:pick`;
  if (f.resolved || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | connection pick: picker card ${messageId} already resolved — ignoring repeat click.`);
    return { posted: false, reason: "already-resolved" };
  }

  const hostId = typeof payload.hostId === "string" && payload.hostId ? payload.hostId : null;
  const name   = typeof payload.connectionName === "string" ? payload.connectionName : null;
  const choice = connectionPickerChoices(message).find(c =>
    hostId ? c.hostId === hostId : (!c.hostId && c.name === name));
  const move = PICK_MOVES[f.pickAction ?? choice?.pickAction];
  if (!choice || !move) {
    console.warn(`${MODULE_ID} | connection pick: "${name ?? hostId ?? "?"}" is not a choice on picker card ${messageId} — refused.`);
    return { posted: false, reason: "not-on-card" };
  }

  // The picker's roller — the move card's, carried by applyConnectionSuggestion:
  // the forced move is their follow-up, their player's or a GM's to pick
  // (cardRollerPc; issue #342 Z56 — it spoke as the presser, so a GM's pick
  // developed the first PC's bond). A picker that names none acts as the
  // clicker's PC, which must be one the requester owns; a GM with no PC
  // relays none (the pipeline resolves their speaker), and a player with no
  // PC of their own is refused — with no speaker the forced move was rolled
  // as the GM's first PC (issue #331 X19; #326 D8).
  const { actor, refused } = cardRollerPc(f, payload, ctx, "connection pick");
  if (refused) return { posted: false, reason: refused };
  if (!actor) {
    console.debug(`${MODULE_ID} | connection pick: no clicker PC relayed (a GM's press) — the pipeline resolves the speaker from the message author.`);
  }

  _inFlight.add(key);
  try {
    const label = choice.name || "connection";
    // The picked connection travels with the forced move: the pipeline skips
    // the interpreter, so the name in the narration is never read. The host id
    // is what enrichment and the develop / forge branches resolve by; the name
    // is the fallback and the narrator's target (issue #301 B01 — without
    // either, Forge a Bond scored 0 against "no connection", or the sole
    // bonded one).
    const target = {
      ...(choice.name   ? { forcedMoveTarget:   choice.name }   : {}),
      ...(choice.hostId ? { forcedMoveTargetId: choice.hostId } : {}),
    };
    // Claimed before the post (issue #336 Y24; decisions #309 "claims before
    // effects"): the move was posted first and the stamp's refusal swallowed,
    // so the picker stayed live and the next press rolled Develop / Forge
    // again. A refused claim posts nothing — the press is the retry.
    try {
      await message.update({ [`flags.${MODULE_ID}.resolved`]: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | connection pick: picker card ${messageId} could not be claimed — no move posted:`, err?.message ?? err);
      return { posted: false, reason: "claim-refused" };
    }
    try {
      await ChatMessage.create({
        content: move.content(label),
        ...(actor ? { speaker: speakerFor(actor) } : {}),
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: move.moveId, deferWhileBusy: true, ...target, ...sourceCardFlag(messageId, "resolved") } },
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | connection pick: forced-move post failed — the claim is released:`, err?.message ?? err);
      await message.update({ [`flags.${MODULE_ID}.resolved`]: false })
        .catch(e => console.warn(`${MODULE_ID} | connection pick: releasing the claim failed:`, e?.message ?? e));
      return { posted: false, reason: "post-failed" };
    }
    return { posted: true };
  } finally {
    _inFlight.delete(key);
  }
}

/**
 * The connections a picker card offers: the structured `flags.choices`
 * stamped by postConnectionPickerCard (src/index.js), or — for a card posted
 * before that flag existed — its buttons' data attributes.
 *
 * @param {ChatMessage} message
 * @returns {Array<{ hostId: string, name: string, pickAction: string|null }>}
 */
function connectionPickerChoices(message) {
  const stamped = message?.flags?.[MODULE_ID]?.choices;
  if (Array.isArray(stamped)) {
    return stamped.map(c => ({ hostId: String(c?.hostId ?? ""), name: String(c?.name ?? ""), pickAction: null }));
  }
  return parseCardButtons(message?.content, "sf-connection-pick").map(b => ({
    hostId:     b.hostId ?? "",
    name:       b.connectionName ?? "",
    pickAction: b.pickAction ?? null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// WAYPOINT MATCH — gmRelay "waypoint.oracle"
// ─────────────────────────────────────────────────────────────────────────────

// The follow-up an Explore a Waypoint match offers, by the move card's
// `waypointOracleCard` flag (index.js waypointOracleFor): its forced-move text
// and the reason a retired ordinary choice card gives.
const WAYPOINT_ORACLE_MOVES = Object.freeze({
  make_a_discovery: { content: "I follow what the waypoint revealed — making a discovery.", retired: "discovery" },
  confront_chaos:   { content: "I face the chaos the waypoint exposed.",                    retired: "chaos" },
});

/**
 * gmRelay handler for "waypoint.oracle" — runs on the canonical GM (issue #316
 * T06). An Explore a Waypoint match offers Make a Discovery (a strong hit) or
 * Confront Chaos (a miss) *instead* of the ordinary result; the card's button
 * used to post the forced move from the clicker's client and disable only its
 * own DOM button, so a re-render re-armed it from the unchanged flags and the
 * discovery stacked on the +2 momentum already taken.
 *
 * One durable claim per matched waypoint, on the GM-authored card
 * (`waypointRewardClaimed`: "alternative" here, "ordinary" when the choice
 * card's pick lands — resultUpgrade.js closeUpgradesForChoice): the ordinary
 * reward already chosen refuses the alternative; the alternative taken
 * retires the pending ordinary choice card (a pick that reaches it anyway is
 * refused). The requester must own the roller's PC (the card's `actorId`) or
 * be a GM; the forced move speaks as that PC. Claimed before the post —
 * idempotent behind the in-flight guard; a post that fails releases the
 * claim so the press can be made again.
 *
 * @param {{ messageId?: string }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export async function applyWaypointOraclePick(payload = {}, ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | waypoint oracle: card ${messageId ?? "?"} not found — no move posted.`);
    return { posted: false, reason: "no-message" };
  }
  const f    = message.flags?.[MODULE_ID] ?? {};
  const move = WAYPOINT_ORACLE_MOVES[f.waypointOracleCard];
  if (!move) {
    console.warn(`${MODULE_ID} | waypoint oracle: message ${messageId} offers no waypoint follow-up — ignored.`);
    return { posted: false, reason: "not-a-waypoint-card" };
  }
  const key = `${messageId}:waypoint`;
  if (f.waypointRewardClaimed || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | waypoint oracle: card ${messageId} already claimed (${f.waypointRewardClaimed ?? "in flight"}) — ignoring the press.`);
    return { posted: false, reason: "already-claimed" };
  }

  // The roller's PC — the card's. A card posted before the roller was stamped
  // is a GM's to take.
  const actorId = typeof f.actorId === "string" && f.actorId ? f.actorId : null;
  const actor   = actorId ? (globalThis.game?.actors?.get?.(actorId) ?? null) : null;
  if (actorId && !isPlayerCharacterActor(actor)) {
    console.warn(`${MODULE_ID} | waypoint oracle: ${actorId} is not a player character — refused.`);
    refusePress(ctx, "not-a-pc");
    return { posted: false, reason: "not-a-pc" };
  }
  if (actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | waypoint oracle: user ${ctx?.requesterId ?? "?"} may not take ${actor?.name ?? "this card"}'s reward — refused.`);
    refusePress(ctx, "not-owner", actor);
    return { posted: false, reason: "not-owner" };
  }

  _inFlight.add(key);
  try {
    // The ordinary reward is already chosen: the alternative is "instead",
    // not as well. Closed on the card, so its button says so everywhere.
    if (consequenceChosen(f.resolutionId)) {
      console.debug(`${MODULE_ID} | waypoint oracle: card ${messageId} — the ordinary reward was taken; the alternative is closed.`);
      await message.update({ [`flags.${MODULE_ID}.waypointRewardClaimed`]: "ordinary" })
        .catch(err => console.warn(`${MODULE_ID} | waypoint oracle: closing the alternative failed:`, err?.message ?? err));
      return { posted: false, reason: "ordinary-chosen" };
    }
    try {
      await message.update({ [`flags.${MODULE_ID}.waypointRewardClaimed`]: "alternative" });
    } catch (err) {
      console.warn(`${MODULE_ID} | waypoint oracle: card ${messageId} could not be claimed — nothing posted:`, err?.message ?? err);
      return { posted: false, reason: "claim-refused" };
    }
    try {
      await ChatMessage.create({
        content: move.content,
        ...(actor ? { speaker: speakerFor(actor) } : {}),
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: f.waypointOracleCard, deferWhileBusy: true,
          // Not rolled, the ordinary reward's cards this press retires below come back too.
          ...sourceCardFlag(messageId, "waypointRewardClaimed", null,
            { value: "alternative", reopenRetired: { resolutionId: f.resolutionId ?? null, kind: move.retired } }) } },
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | waypoint oracle: forced-move post failed — the claim is released:`, err?.message ?? err);
      await message.update({ [`flags.${MODULE_ID}.waypointRewardClaimed`]: null })
        .catch(e => console.warn(`${MODULE_ID} | waypoint oracle: releasing the claim failed:`, e?.message ?? e));
      return { posted: false, reason: "post-failed" };
    }
    // The ordinary choice no longer applies.
    await retireOutcomeChoiceCards(f.resolutionId, move.retired);
    return { posted: true };
  } finally {
    _inFlight.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WHICH VOW? — gmRelay "fulfilVow.pick" (issue #321 U02)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * gmRelay handler for "fulfilVow.pick" — runs on the canonical GM (issue #321
 * U02). A Fulfill Your Vow that named no vow while several were open is not
 * rolled: the pipeline posts a "Which vow?" card (index.js postWhichVowCard).
 * A pick posts the move again with the picked copy's id and name — the vow
 * the roll scores and the fulfilment completes — spoken as the card's roller.
 * A Forsake Your Vow's card (`moveId`) posts the forsake of that copy (issue
 * #345 AA16).
 *
 * The pick must be one of the card's own choices, and the requester must own
 * the roller's PC (the card's `actorId`) or be a GM; a card with no roller is
 * a GM's to pick. One pick per card: the GM-authored card is claimed
 * (`resolved`) before the post, behind the in-flight guard, so a second
 * client's click or a re-render finds it claimed; a post that fails releases
 * the claim so the pick can be made again.
 *
 * @param {{ messageId?: string, itemId?: string }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export async function applyFulfilVowPick(payload = {}, ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | which vow: card ${messageId ?? "?"} not found — no move posted.`);
    return { posted: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f.whichVowCard) {
    console.warn(`${MODULE_ID} | which vow: message ${messageId} is not a which-vow card — ignored.`);
    return { posted: false, reason: "not-a-which-vow-card" };
  }
  const key = `${messageId}:fulfilVow`;
  if (f.resolved || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | which vow: card ${messageId} already picked — ignoring the press.`);
    return { posted: false, reason: "already-resolved" };
  }
  const itemId = typeof payload.itemId === "string" && payload.itemId ? payload.itemId : null;
  const choice = (Array.isArray(f.choices) ? f.choices : []).find(c => c?.itemId && c.itemId === itemId);
  if (!choice) {
    console.warn(`${MODULE_ID} | which vow: ${itemId ?? "?"} is not a choice on card ${messageId} — refused.`);
    return { posted: false, reason: "not-on-card" };
  }

  // The roller's PC — the card's. A card with no roller is a GM's to pick.
  const actorId = typeof f.actorId === "string" && f.actorId ? f.actorId : null;
  const actor   = actorId ? (globalThis.game?.actors?.get?.(actorId) ?? null) : null;
  if (actorId && !isPlayerCharacterActor(actor)) {
    console.warn(`${MODULE_ID} | which vow: ${actorId} is not a player character — refused.`);
    refusePress(ctx, "not-a-pc");
    return { posted: false, reason: "not-a-pc" };
  }
  if (actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | which vow: user ${ctx?.requesterId ?? "?"} may not pick for ${actor?.name ?? "this card"} — refused.`);
    refusePress(ctx, "not-owner", actor);
    return { posted: false, reason: "not-owner" };
  }

  _inFlight.add(key);
  try {
    try {
      await message.update({ [`flags.${MODULE_ID}.resolved`]: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | which vow: card ${messageId} could not be claimed — nothing posted:`, err?.message ?? err);
      return { posted: false, reason: "claim-refused" };
    }
    try {
      // The card's move: Fulfill Your Vow, or a Forsake Your Vow's (issue #345 AA16).
      const forsake = f.moveId === "forsake_your_vow";
      await ChatMessage.create({
        content: f.narration || (forsake ? `I forsake ${choice.name || "my vow"}.` : `Attempt to fulfill ${choice.name || "my vow"}.`),
        ...(actor ? { speaker: speakerFor(actor) } : {}),
        flags:   { [MODULE_ID]: {
          bypassPacing: true, forcedMoveId: forsake ? "forsake_your_vow" : "fulfill_your_vow", deferWhileBusy: true,
          forcedMoveTargetId: choice.itemId,
          ...(choice.name ? { forcedMoveTarget: choice.name } : {}),
          ...sourceCardFlag(messageId, "resolved"),
        } },
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | which vow: forced-move post failed — the claim is released:`, err?.message ?? err);
      await message.update({ [`flags.${MODULE_ID}.resolved`]: false })
        .catch(e => console.warn(`${MODULE_ID} | which vow: releasing the claim failed:`, e?.message ?? e));
      return { posted: false, reason: "post-failed" };
    }
    return { posted: true };
  } finally {
    _inFlight.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WHICH LEGACY TRACK? — gmRelay "legacy.pick" (issue #331 X63)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * gmRelay handler for "legacy.pick" — runs on the canonical GM (issue #331
 * X63). A Continue a Legacy that named no legacy track is not rolled: the
 * pipeline posts a "which legacy track?" card (index.js postWhichLegacyCard).
 * A pick posts the move again naming that track — the one the roll scores —
 * spoken as the card's roller.
 *
 * The pick must be one of the card's tracks, and the requester must own the
 * roller's PC (the card's `actorId`) or be a GM; a card with no roller is a
 * GM's to pick. Each track once: Continue a Legacy rolls every legacy track,
 * so the card claims the picked track (`legacyRolled.<track>`) before the
 * post, behind the in-flight guard — a second press of it, from any client
 * or after a re-render, finds it claimed, and the other tracks stay open. A
 * post that fails releases the claim.
 *
 * @param {{ messageId?: string, track?: string }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export async function applyLegacyTrackPick(payload = {}, ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | which legacy track: card ${messageId ?? "?"} not found — no move posted.`);
    return { posted: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f.whichLegacyCard) {
    console.warn(`${MODULE_ID} | which legacy track: message ${messageId} is not a which-legacy card — ignored.`);
    return { posted: false, reason: "not-a-which-legacy-card" };
  }
  const track  = typeof payload.track === "string" ? payload.track : null;
  const choice = (Array.isArray(f.tracks) ? f.tracks : []).find(t => t?.track && t.track === track);
  if (!choice) {
    console.warn(`${MODULE_ID} | which legacy track: ${track ?? "?"} is not a choice on card ${messageId} — refused.`);
    return { posted: false, reason: "not-on-card" };
  }
  const key = `${messageId}:legacy:${track}`;
  if (f.legacyRolled?.[track] || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | which legacy track: ${track} on card ${messageId} already rolled — ignoring the press.`);
    return { posted: false, reason: "already-rolled" };
  }

  // The roller's PC — the card's. A card with no roller is a GM's to pick.
  const actorId = typeof f.actorId === "string" && f.actorId ? f.actorId : null;
  const actor   = actorId ? (globalThis.game?.actors?.get?.(actorId) ?? null) : null;
  if (actorId && !isPlayerCharacterActor(actor)) {
    console.warn(`${MODULE_ID} | which legacy track: ${actorId} is not a player character — refused.`);
    refusePress(ctx, "not-a-pc");
    return { posted: false, reason: "not-a-pc" };
  }
  if (actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | which legacy track: user ${ctx?.requesterId ?? "?"} may not pick for ${actor?.name ?? "this card"} — refused.`);
    refusePress(ctx, "not-owner", actor);
    return { posted: false, reason: "not-owner" };
  }

  _inFlight.add(key);
  try {
    try {
      await message.update({ [`flags.${MODULE_ID}.legacyRolled.${track}`]: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | which legacy track: card ${messageId} could not be claimed — nothing posted:`, err?.message ?? err);
      return { posted: false, reason: "claim-refused" };
    }
    try {
      await ChatMessage.create({
        content: f.narration || `I continue the legacy — my ${choice.label ?? "legacy track"}.`,
        ...(actor ? { speaker: speakerFor(actor) } : {}),
        flags:   { [MODULE_ID]: {
          bypassPacing: true, forcedMoveId: "continue_a_legacy", deferWhileBusy: true,
          forcedMoveTarget: choice.label ?? track,
          ...sourceCardFlag(messageId, `legacyRolled.${track}`),
        } },
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | which legacy track: forced-move post failed — the claim is released:`, err?.message ?? err);
      await message.update({ [`flags.${MODULE_ID}.legacyRolled.${track}`]: false })
        .catch(e => console.warn(`${MODULE_ID} | which legacy track: releasing the claim failed:`, e?.message ?? e));
      return { posted: false, reason: "post-failed" };
    }
    return { posted: true };
  } finally {
    _inFlight.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MOVE CARD "⚑ Mark Progress on Vow" — gmRelay "milestone.suggestion"
// EXPEDITION "🔁 Recommit" — gmRelay "expedition.recommit" (issue #321 U20)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * gmRelay handler for "milestone.suggestion" — runs on the canonical GM (issue
 * #321 U20). A quest-advancing hit's move card offers "⚑ Mark Progress on
 * Vow"; its button posted the forced Reach a Milestone from the clicker's
 * client and disabled only its own DOM button, so the player and the GM — or
 * one client after a re-render — each marked the vow again (`milestoneMarked`
 * was read, never written).
 *
 * One mark per card, claimed on the GM-authored card (`milestoneMarked`)
 * before the post, behind the in-flight guard; a post that fails releases the
 * claim. The mark is the card's roller's (`actorId`): their player or a GM
 * may press it, and the move speaks as that PC. A card posted before the
 * roller was stamped marks the clicker's own PC (the payload's `actorId`,
 * which the requester must own).
 *
 * @param {{ messageId?: string, actorId?: string|null }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export async function applyMilestoneSuggestion(payload = {}, ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | milestone suggestion: card ${messageId ?? "?"} not found — nothing marked.`);
    return { posted: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f.milestoneSuggestion?.eligible) {
    console.warn(`${MODULE_ID} | milestone suggestion: message ${messageId} offers no milestone — ignored.`);
    return { posted: false, reason: "not-a-suggestion" };
  }
  const key = `${messageId}:milestone`;
  if (f.milestoneMarked || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | milestone suggestion: card ${messageId} already marked — ignoring the press.`);
    return { posted: false, reason: "already-marked" };
  }

  const cardActorId = typeof f.actorId === "string" && f.actorId ? f.actorId : null;
  const actorId = cardActorId ?? (typeof payload.actorId === "string" && payload.actorId ? payload.actorId : null);
  const actor   = actorId ? (globalThis.game?.actors?.get?.(actorId) ?? null) : null;
  if (actorId && !isPlayerCharacterActor(actor)) {
    console.warn(`${MODULE_ID} | milestone suggestion: ${actorId} is not a player character — refused.`);
    refusePress(ctx, "not-a-pc");
    return { posted: false, reason: "not-a-pc" };
  }
  if (actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | milestone suggestion: user ${ctx?.requesterId ?? "?"} may not mark ${actor?.name ?? "this card"}'s vow — refused.`);
    refusePress(ctx, "not-owner", actor);
    return { posted: false, reason: "not-owner" };
  }

  _inFlight.add(key);
  try {
    try {
      await message.update({ [`flags.${MODULE_ID}.milestoneMarked`]: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | milestone suggestion: card ${messageId} could not be claimed — nothing marked:`, err?.message ?? err);
      return { posted: false, reason: "claim-refused" };
    }
    try {
      await ChatMessage.create({
        content: "Mark progress on your vow.",
        ...(actor ? { speaker: speakerFor(actor) } : {}),
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "reach_a_milestone", deferWhileBusy: true, ...sourceCardFlag(messageId, "milestoneMarked") } },
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | milestone suggestion: forced-move post failed — the claim is released:`, err?.message ?? err);
      await message.update({ [`flags.${MODULE_ID}.milestoneMarked`]: false })
        .catch(e => console.warn(`${MODULE_ID} | milestone suggestion: releasing the claim failed:`, e?.message ?? e));
      return { posted: false, reason: "post-failed" };
    }
    return { posted: true };
  } finally {
    _inFlight.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// "🏁 Attempt to Fulfill" — gmRelay "fulfilVow.attempt"
// (known-issues FULFIL-BUTTON-LOCAL-DISABLE)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * gmRelay handler for "fulfilVow.attempt" — runs on the canonical GM. A move
 * card's "🏁 Attempt to Fulfill Vow" (beside "⚑ Mark Progress on Vow") and a
 * won-fight card's "🏁 Attempt to Fulfill" posted the forced Fulfill Your Vow
 * from the clicker's client and disabled only their own DOM button: the
 * player and the GM — or one client after a re-render — each rolled the vow
 * again (issue #329 X05 fixed whose vow they roll, not how often).
 *
 * One attempt per card, claimed on the GM-authored card (`fulfilAttempted`)
 * before the post, behind the in-flight guard; a post that fails releases the
 * claim. The roll is the card's roller's (`actorId`): their player or a GM may
 * press it, and the move speaks as that PC — on a won-fight card, the vow's
 * holder: the winner when they hold a copy, else the PC holding the vow the
 * fight served (resolveVowHolderActor, as its ⚑ — issue #342 D5), so a
 * miss's 🔁 recommit offer is the holder's too. The vow rides by its Item id
 * — the move card's, the roller's sole open vow when it was posted; the
 * won-fight card's by its name, the holder's copy. A card posted before the
 * roller was stamped rolls for the clicker's own PC (the payload's `actorId`,
 * which the requester must own).
 *
 * @param {{ messageId?: string, actorId?: string|null }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export async function applyAttemptFulfilVow(payload = {}, ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | attempt to fulfil: card ${messageId ?? "?"} not found — nothing rolled.`);
    return { posted: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  const fightCard = f.fightVowCard === true;
  if (!fightCard && !f.milestoneSuggestion?.eligible) {
    console.warn(`${MODULE_ID} | attempt to fulfil: message ${messageId} offers no fulfilment — ignored.`);
    return { posted: false, reason: "not-a-fulfil-card" };
  }
  const key = `${messageId}:fulfilAttempt`;
  if (f.fulfilAttempted || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | attempt to fulfil: card ${messageId} already pressed — ignoring the press.`);
    return { posted: false, reason: "already-attempted" };
  }

  const vowName = fightCard && typeof f.vowName === "string" && f.vowName ? f.vowName : null;
  const cardActorId = typeof f.actorId === "string" && f.actorId ? f.actorId : null;
  let rollerId = cardActorId;
  // The vow the fight served, by the card's vow id (issue #345 AA17): by name,
  // once its holder renamed or deleted it the roll scored another vow — the
  // winner's, or the holder's other one. Fulfilled or on no sheet any more,
  // nothing is rolled (the card retires the button). A card with no id keeps
  // the name below.
  let byId = null;
  if (fightCard) {
    const { fightCardVow } = await import("../index.js");
    byId = fightCardVow({ vowId: typeof f.vowId === "string" ? f.vowId : null, actorId: cardActorId });
    if (byId && byId.state !== "open") {
      console.warn(`${MODULE_ID} | attempt to fulfil: the vow card ${messageId} served is ${byId.state === "gone" ? "on no sheet any more" : "fulfilled"} — nothing rolled.`);
      return { posted: false, reason: byId.state === "gone" ? "vow-gone" : "vow-completed" };
    }
  }
  if (byId) {
    // A won-fight card's 🏁 is the vow's holder's move (issue #342 D5): the
    // winner when they hold a copy, else the PC holding the vow the fight
    // served — found by its id.
    rollerId = byId.holder?.id ?? cardActorId;
  } else if (vowName) {
    // A won-fight card's 🏁 is the vow's holder's move (issue #342 D5): the
    // winner when they hold a copy — every case issue #329 X05 settled —
    // else the PC holding the vow the fight served, as the same card's ⚑
    // marks it (resolveVowHolderActor). It was the winner's whoever held the
    // vow: the holder's player was refused their own vow's roll, and the
    // winner's player rolled it as the winner. A vow found nowhere keeps the
    // card's roller (no first-PC guess).
    const { resolveVowItemCopies, resolveVowHolderActor } = await import("../index.js");
    if (resolveVowItemCopies(vowName, { actorId: cardActorId }).primary) {
      rollerId = resolveVowHolderActor(vowName, cardActorId)?.id ?? cardActorId;
    }
  }
  const actorId = rollerId ?? (typeof payload.actorId === "string" && payload.actorId ? payload.actorId : null);
  const actor   = actorId ? (globalThis.game?.actors?.get?.(actorId) ?? null) : null;
  if (actorId && !isPlayerCharacterActor(actor)) {
    console.warn(`${MODULE_ID} | attempt to fulfil: ${actorId} is not a player character — refused.`);
    refusePress(ctx, "not-a-pc");
    return { posted: false, reason: "not-a-pc" };
  }
  if (actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | attempt to fulfil: user ${ctx?.requesterId ?? "?"} may not roll ${actor?.name ?? "this card"}'s vow — refused.`);
    refusePress(ctx, "not-owner", actor);
    return { posted: false, reason: "not-owner" };
  }

  let vowItemId = fightCard ? null : (f.milestoneSuggestion.vowItemId ?? null);
  // The vow's own copy and its name now: the holder's, found by id (AA17).
  const targetName = byId ? (byId.item?.name || vowName) : vowName;
  if (byId) {
    vowItemId = byId.item?.id ?? null;
  } else if (vowName) {
    const { resolveVowItemCopies } = await import("../index.js");
    vowItemId = resolveVowItemCopies(vowName, { actorId: actor?.id ?? null }).primary?.item?.id ?? null;
  }

  _inFlight.add(key);
  try {
    try {
      await message.update({ [`flags.${MODULE_ID}.fulfilAttempted`]: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | attempt to fulfil: card ${messageId} could not be claimed — nothing rolled:`, err?.message ?? err);
      return { posted: false, reason: "claim-refused" };
    }
    try {
      await ChatMessage.create({
        content: "Attempt to fulfill your vow.",
        ...(actor ? { speaker: speakerFor(actor) } : {}),
        flags:   { [MODULE_ID]: {
          bypassPacing: true, forcedMoveId: "fulfill_your_vow", deferWhileBusy: true,
          ...(targetName ? { forcedMoveTarget: targetName } : {}),
          ...(vowItemId ? { forcedMoveTargetId: vowItemId } : {}),
          ...sourceCardFlag(messageId, "fulfilAttempted"),
        } },
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | attempt to fulfil: forced-move post failed — the claim is released:`, err?.message ?? err);
      await message.update({ [`flags.${MODULE_ID}.fulfilAttempted`]: false })
        .catch(e => console.warn(`${MODULE_ID} | attempt to fulfil: releasing the claim failed:`, e?.message ?? e));
      return { posted: false, reason: "post-failed" };
    }
    return { posted: true };
  } finally {
    _inFlight.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A card's forced follow-up, the roller's to press (issue #338 D1):
// "⚔ Attempt to Finish the Fight" — gmRelay "tda.attempt"
// "🗺 Finish the Expedition"      — gmRelay "expedition.finish"
// "⚔ Swear it (roll)"             — gmRelay "vow.swearRoll" (session/swearVow.js)
// A paced card's "Roll <move>"    — gmRelay "paced.roll"
// A "Which fight?" pick           — gmRelay "whichFight.pick" (PACED-ROLL-OPEN-PRESS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The fulfilVow.attempt shape for a card button that rolls the card's
 * roller's move (issue #338 D1). These buttons posted the forced move from
 * the presser's client, spoken as the card's roller with no check of who
 * pressed (issue #329 X05 fixed whose move it is, not who may make it):
 * another player rolled Kira's Take Decisive Action — her position, her
 * momentum, a Pay the Price on her on a miss — finished her expedition or
 * swore her vow, and each client's press, or a re-render, rolled again.
 *
 * The roller is the card's (`spec.roller`, by default its `actorId`): their
 * player or a GM may press it, and the move speaks as that PC. A card that
 * names no roller rolls for the clicker's own PC (the payload's `actorId`,
 * which the requester must own); with none relayed, it is a GM's to press.
 * One press per card: the GM-authored card is claimed (`spec.claim`) before
 * the post, behind the in-flight guard, and a post that fails releases the
 * claim. The forced move is held while the move lock or the session gate
 * stands (`deferWhileBusy`, issue #325 W02 / #329 X14).
 *
 * @param {{ messageId?: string, actorId?: string|null }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} ctx
 * @param {Object} spec
 * @param {string} spec.label — the console's name for the button
 * @param {string} spec.claim — the card flag a press claims
 * @param {(f: Object) => boolean} spec.isCard — the card offers this follow-up
 * @param {(f: Object, actor: Actor|null) => ({ content: string, flags: Object, stamp?: * }|null)} spec.build —
 *   the forced move's text and module flags, and what the claim records
 *   (`stamp`, default true — a pick records its choice); null posts nothing
 * @param {(f: Object) => string|null} [spec.roller] — the card's roller
 * @param {(f: Object) => boolean} [spec.offers] — a pick: the press names one
 *   of the card's own choices (the payload is client-asserted); false refuses
 *   it, `not-on-card`
 * @param {(f: Object, card: ChatMessage) => Object|null} [spec.lineSpeaker] —
 *   who the forced move speaks as when no PC rolls it (a player's own line
 *   posted again): it spoke as the presser — a GM's press put the player's
 *   words under the GM's name (issue #348 PT14)
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export async function applyCardRollerFollowup(payload = {}, ctx = {}, spec) {
  const { label, claim, isCard, build } = spec;
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | ${label}: card ${messageId ?? "?"} not found — nothing rolled.`);
    return { posted: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!isCard(f)) {
    console.warn(`${MODULE_ID} | ${label}: message ${messageId} offers no such follow-up — ignored.`);
    return { posted: false, reason: "not-its-card" };
  }
  const key = `${messageId}:${claim}`;
  if (f[claim] || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | ${label}: card ${messageId} already pressed — ignoring the press.`);
    return { posted: false, reason: "already-pressed" };
  }
  if (spec.offers && !spec.offers(f)) {
    console.warn(`${MODULE_ID} | ${label}: the press names nothing card ${messageId} offers — refused.`);
    return { posted: false, reason: "not-on-card" };
  }

  const rolled  = spec.roller ? spec.roller(f) : f.actorId;
  const cardActorId = typeof rolled === "string" && rolled ? rolled : null;
  const actorId = cardActorId ?? (typeof payload.actorId === "string" && payload.actorId ? payload.actorId : null);
  const actor   = actorId ? (globalThis.game?.actors?.get?.(actorId) ?? null) : null;
  if (actorId && !isPlayerCharacterActor(actor)) {
    console.warn(`${MODULE_ID} | ${label}: ${actorId} is not a player character — refused.`);
    refusePress(ctx, "not-a-pc");
    return { posted: false, reason: "not-a-pc" };
  }
  if (actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | ${label}: user ${ctx?.requesterId ?? "?"} may not roll ${actor?.name ?? "this card"}'s move — only their player or a GM may — refused.`);
    refusePress(ctx, "not-owner", actor);
    return { posted: false, reason: "not-owner" };
  }
  const move = build(f, actor);
  if (!move) {
    console.warn(`${MODULE_ID} | ${label}: card ${messageId} names nothing to roll — ignored.`);
    return { posted: false, reason: "nothing-to-roll" };
  }

  _inFlight.add(key);
  try {
    try {
      await message.update({ [`flags.${MODULE_ID}.${claim}`]: move.stamp ?? true });
    } catch (err) {
      console.warn(`${MODULE_ID} | ${label}: card ${messageId} could not be claimed — nothing rolled:`, err?.message ?? err);
      return { posted: false, reason: "claim-refused" };
    }
    const lineSpeaker = actor ? null : (spec.lineSpeaker?.(f, message) ?? null);
    try {
      await ChatMessage.create({
        content: move.content,
        ...(actor ? { speaker: speakerFor(actor) } : lineSpeaker ? { speaker: lineSpeaker } : {}),
        flags:   { [MODULE_ID]: { ...move.flags, bypassPacing: true, deferWhileBusy: true,
          ...sourceCardFlag(messageId, claim, false, { value: move.stamp ?? true }) } },
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | ${label}: forced-move post failed — the claim is released:`, err?.message ?? err);
      await message.update({ [`flags.${MODULE_ID}.${claim}`]: false })
        .catch(e => console.warn(`${MODULE_ID} | ${label}: releasing the claim failed:`, e?.message ?? e));
      return { posted: false, reason: "post-failed" };
    }
    return { posted: true };
  } finally {
    _inFlight.delete(key);
  }
}

/**
 * gmRelay handler for "tda.attempt" — a combat move card's (Strike / Clash /
 * Gain Ground / React Under Fire) "⚔ Attempt to Finish the Fight", the card's
 * roller's Take Decisive Action (issue #338 D1; applyCardRollerFollowup).
 * The card's fight rides by id and name, so with two fights open the roll
 * scores this one (TDA-BUTTON-NO-TARGET); a card that names none posts no
 * target and the pipeline resolves the sole open fight, or asks which.
 * Claim `decisiveActionAttempted`.
 *
 * @param {{ messageId?: string, actorId?: string|null }} payload
 * @param {Object} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export function applyTakeDecisiveActionAttempt(payload = {}, ctx = {}) {
  return applyCardRollerFollowup(payload, ctx, {
    label: "attempt to finish the fight", claim: "decisiveActionAttempted",
    isCard: (f) => f.combatMoveCard === true,
    build: (f) => {
      const trackId    = typeof f.combatTrackId === "string" && f.combatTrackId ? f.combatTrackId : null;
      const trackLabel = typeof f.combatTrackLabel === "string" && f.combatTrackLabel ? f.combatTrackLabel : null;
      return {
        content: trackLabel
          ? `Take decisive action to seize the objective — ${trackLabel}.`
          : "Take decisive action to seize the objective.",
        flags: {
          forcedMoveId: "take_decisive_action",
          ...(trackId ? { forcedMoveTargetId: trackId } : {}),
          ...(trackLabel ? { forcedMoveTarget: trackLabel } : {}),
        },
      };
    },
  });
}

/**
 * gmRelay handler for "expedition.finish" — an expedition progress card's
 * "🗺 Finish the Expedition", the card's roller's Finish an Expedition (issue
 * #338 D1; applyCardRollerFollowup). The card's own track rides by id and
 * label, so the right expedition finishes with several open
 * (EXPEDITION-FINISH-TARGET, issue #306 R06). Claim `expeditionFinishAttempted`.
 *
 * @param {{ messageId?: string, actorId?: string|null }} payload
 * @param {Object} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export function applyFinishExpeditionAttempt(payload = {}, ctx = {}) {
  return applyCardRollerFollowup(payload, ctx, {
    label: "finish the expedition", claim: "expeditionFinishAttempted",
    isCard: (f) => f.expeditionProgressCard === true,
    build: (f) => {
      const trackLabel = typeof f.trackLabel === "string" && f.trackLabel ? f.trackLabel : null;
      const trackId    = typeof f.trackId === "string" && f.trackId ? f.trackId : null;
      return {
        content: trackLabel ? `Finish the expedition — ${trackLabel}.` : "Finish the expedition.",
        flags: {
          forcedMoveId: "finish_an_expedition",
          ...(trackLabel ? { forcedMoveTarget: trackLabel } : {}),
          ...(trackId ? { forcedMoveTargetId: trackId } : {}),
        },
      };
    },
  });
}

/**
 * gmRelay handler for "paced.roll" — a paced narrative card's "Roll <move>",
 * the narrating PC's move (known-issues PACED-ROLL-OPEN-PRESS;
 * applyCardRollerFollowup). The card's own line is posted again with the
 * move its hint invited, past the pacing classifier, spoken as the PC who
 * narrated it (issue #325 W09); a card that names none rolls for the
 * presser's own PC. It posted from the presser's client with no check of who
 * pressed: a crewmate rolled another player's move, and a player's press —
 * which may not stamp the GM's card — left it armed for another client.
 * Claim `rolled`.
 *
 * @param {{ messageId?: string, actorId?: string|null }} payload
 * @param {Object} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export function applyPacedRoll(payload = {}, ctx = {}) {
  return applyCardRollerFollowup(payload, ctx, {
    label: "paced roll", claim: "rolled",
    isCard: (f) => f.pacedNarrative === true
      && typeof f.suggestedMove === "string" && !!f.suggestedMove
      && typeof f.playerText === "string" && !!f.playerText,
    // The card's line is the player's: with no PC to speak it, it keeps the
    // speaker it was typed under (PT14).
    lineSpeaker: (f, card) => speakerOfLine(f.playerText, card),
    build: (f) => ({ content: f.playerText, flags: {
      forcedMoveId: f.suggestedMove,
      // A scene-challenge Roll's challenge, as the Finish an Expedition
      // button forwards its track (PACED-VARIANT-NO-TARGET).
      ...(typeof f.suggestedMoveTargetId === "string" && f.suggestedMoveTargetId ? { forcedMoveTargetId: f.suggestedMoveTargetId } : {}),
    } }),
  });
}

/**
 * gmRelay handler for "whichFight.pick" — a "Which fight?" (or "Which
 * expedition?") card's pick, the card's roller's move again naming the
 * picked track (index.js postWhichFightCard; known-issues
 * WHICH-FIGHT-LOCAL-DISABLE; applyCardRollerFollowup). The pick must be one
 * of the card's own `fights` — the payload is client-asserted — and rides
 * the move by id and name. It posted from the presser's client with no
 * check of who pressed and a local disable only, so a crewmate rolled the
 * roller's move and another client picked again. Claim `whichFightPicked`:
 * the picked track's id.
 *
 * @param {{ messageId?: string, trackId?: string, actorId?: string|null }} payload
 * @param {Object} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export function applyWhichFightPick(payload = {}, ctx = {}) {
  const trackId = typeof payload.trackId === "string" && payload.trackId ? payload.trackId : null;
  const pickOf  = (f) => (Array.isArray(f.fights) ? f.fights : []).find(t => trackId && t?.id === trackId) ?? null;
  return applyCardRollerFollowup(payload, ctx, {
    label: "which fight", claim: "whichFightPicked",
    isCard: (f) => f.whichFightCard === true,
    offers: (f) => !!pickOf(f),
    build: (f) => {
      const fight = pickOf(f);
      return {
        content: f.narration || `Take decisive action to seize the objective — ${fight.label ?? "the fight"}.`,
        flags: {
          forcedMoveId: typeof f.moveId === "string" && f.moveId ? f.moveId : "take_decisive_action",
          forcedMoveTargetId: fight.id,
          ...(fight.label ? { forcedMoveTarget: fight.label } : {}),
        },
        stamp: fight.id,
      };
    },
  });
}

/**
 * gmRelay handler for "expedition.recommit" — runs on the canonical GM (issue
 * #321 U20). A Finish an Expedition miss offers "🔁 Recommit"; its button
 * disabled only the clicker's DOM button and recommitted on the GM (or over
 * the old raw `expedition.recommit` socket relay, RELAY-LEGACY-KINDS), with
 * nothing on the card: each press — the player's and the GM's, or one after a
 * re-render — rolled the challenge dice, cleared boxes and raised the rank
 * again.
 *
 * One recommit per offer card: any user may press it (the expedition is the
 * crew's), and the GM-authored card is claimed (`recommitted`) before the
 * recommit, behind the in-flight guard. A track write the world refused
 * changed nothing and releases the claim, so the press can be made again;
 * an expedition already over leaves the offer closed. Either is said to the
 * presser (tellRecommitOutcome — issue #342 Z58: the GM's console only).
 *
 * @param {{ messageId?: string }} payload
 * @param {Object} [ctx]
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applyRecommitOffer(payload = {}, ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | recommit: offer card ${messageId ?? "?"} not found — nothing recommitted.`);
    return { applied: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f.recommitOfferCard || typeof f.trackId !== "string" || !f.trackId) {
    console.warn(`${MODULE_ID} | recommit: message ${messageId} is not a recommit offer — ignored.`);
    return { applied: false, reason: "not-a-recommit-offer" };
  }
  const key = `${messageId}:recommit`;
  if (f.recommitted || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | recommit: offer ${messageId} already taken — ignoring the press.`);
    return { applied: false, reason: "already-recommitted" };
  }

  _inFlight.add(key);
  try {
    try {
      await message.update({ [`flags.${MODULE_ID}.recommitted`]: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | recommit: offer ${messageId} could not be claimed — nothing recommitted:`, err?.message ?? err);
      return { applied: false, reason: "claim-refused" };
    }
    const { performRecommit } = await import("../index.js");
    const res = await performRecommit(f.trackId);
    if (res?.reason === "write-refused") {
      await message.update({ [`flags.${MODULE_ID}.recommitted`]: false })
        .catch(e => console.warn(`${MODULE_ID} | recommit: releasing the claim failed:`, e?.message ?? e));
    }
    await tellRecommitOutcome(ctx, res, { what: "expedition", name: res?.name ?? f.trackLabel ?? null });
    return { applied: res?.ok === true, ...(res?.reason ? { reason: res.reason } : {}) };
  } finally {
    _inFlight.delete(key);
  }
}

/**
 * gmRelay handlers for "vow.recommit" and "bond.recommit" — run on the
 * canonical GM (issue #330 D1). A Fulfill Your Vow's or Forge a Bond's miss
 * offers "🔁 Recommit"; the GM-authored card is claimed (`recommitted`)
 * before the recommit, behind the in-flight guard, as an expedition's is
 * (applyRecommitOffer). The vow or bond is the roller's: their player or a
 * GM may press it — a roller no longer one of the table's player characters
 * is refused as gone, as the card-roller buttons refuse one (refusePress
 * "not-a-pc"; known-issues RECOMMIT-GONE-ROLLER-WORDING: a player was told
 * the card named no character of theirs, and a GM's press did nothing). A
 * write the world refused changed nothing and releases the claim; a vow
 * fulfilled or a bond forged since the miss leaves the offer closed (issue
 * #335 Y10). Each is said to the presser (tellRecommitOutcome — issue #342
 * Z58: only the fulfilled vow got a card).
 *
 * @param {{ messageId?: string }} payload
 * @param {Object} [ctx]
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export function applyVowRecommitOffer(payload = {}, ctx = {}) {
  return applyRollerRecommit(payload, ctx, {
    flag: "vowRecommitOfferCard", label: "vow recommit",
    perform: async (f) => (await import("../index.js")).performVowRecommit({
      vowName: f.vowName ?? null, itemId: f.itemId ?? null, actorId: f.actorId ?? null,
    }),
    what: "vow", name: (f) => f.vowName ?? null,
  });
}

/** gmRelay "bond.recommit" — see applyVowRecommitOffer. */
export function applyBondRecommitOffer(payload = {}, ctx = {}) {
  return applyRollerRecommit(payload, ctx, {
    flag: "bondRecommitOfferCard", label: "bond recommit",
    perform: async (f) => (await import("../index.js")).performBondRecommit({ hostId: f.hostId ?? null }),
    what: "bond", name: (f) => f.connectionName ?? null,
  });
}

async function applyRollerRecommit(payload, ctx, { flag, label, perform, what, name }) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | ${label}: offer card ${messageId ?? "?"} not found — nothing recommitted.`);
    return { applied: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f[flag]) {
    console.warn(`${MODULE_ID} | ${label}: message ${messageId} is not its offer — ignored.`);
    return { applied: false, reason: "not-a-recommit-offer" };
  }
  const actorId = typeof f.actorId === "string" && f.actorId ? f.actorId : null;
  const actor   = actorId ? (globalThis.game?.actors?.get?.(actorId) ?? null) : null;
  if (actorId && !isPlayerCharacterActor(actor)) {
    console.warn(`${MODULE_ID} | ${label}: ${actorId} is not a player character — refused.`);
    refusePress(ctx, "not-a-pc");
    return { applied: false, reason: "not-a-pc" };
  }
  if (actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | ${label}: user ${ctx?.requesterId ?? "?"} may not recommit ${actor?.name ?? "this card"}'s — refused.`);
    refusePress(ctx, "not-owner", actor);
    return { applied: false, reason: "not-owner" };
  }
  const key = `${messageId}:recommit`;
  if (f.recommitted || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | ${label}: offer ${messageId} already taken — ignoring the press.`);
    return { applied: false, reason: "already-recommitted" };
  }

  _inFlight.add(key);
  try {
    try {
      await message.update({ [`flags.${MODULE_ID}.recommitted`]: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | ${label}: offer ${messageId} could not be claimed — nothing recommitted:`, err?.message ?? err);
      return { applied: false, reason: "claim-refused" };
    }
    const res = await perform(f);
    if (res?.reason === "write-refused") {
      await message.update({ [`flags.${MODULE_ID}.recommitted`]: false })
        .catch(e => console.warn(`${MODULE_ID} | ${label}: releasing the claim failed:`, e?.message ?? e));
    }
    await tellRecommitOutcome(ctx, res, { what, name: res?.name ?? name(f) });
    return { applied: res?.ok === true, ...(res?.reason ? { reason: res.reason } : {}) };
  } finally {
    _inFlight.delete(key);
  }
}

// What a 🔁 Recommit that changed nothing tells the presser, by what it was
// for: the offer's own title, and why there was nothing to recommit.
const RECOMMIT_TITLES = { expedition: "🔁 Recommit to the Expedition", vow: "🔁 Recommit to the Vow", bond: "🔁 Recommit to the Bond" };
const RECOMMIT_NOTHING = {
  "no-track":      { finished: "is finished", gone: "is no longer a progress track" },
  "no-vow":        { gone: "is no longer on its character's sheet" },
  "no-connection": { bonded: "is already bonded", lost: "is no longer a connection", gone: "is no longer a connection" },
};

/**
 * Say what a 🔁 Recommit that changed nothing did, to whoever pressed it
 * (issue #342 Z58 — both cases were a console line on the GM's): a write the
 * world refused is whispered to the presser and the GMs, as a refused reward
 * pick or link is (issue #329 X07) — its claim was released, so the press can
 * be made again; a target gone, finished or bonded since the miss gets the
 * short card a vow fulfilled since gets (issue #335 Y10), the offer closed.
 * Every other outcome is already on a card (the "Recommitted" card, Y10's)
 * or says nothing. Never throws.
 *
 * @param {Object} ctx — the relay context
 * @param {{ ok?: boolean, reason?: string, why?: string }|null} res — perform*'s
 * @param {{ what: "expedition"|"vow"|"bond", name?: string|null }} about
 */
async function tellRecommitOutcome(ctx, res, { what, name = null }) {
  const title = RECOMMIT_TITLES[what] ?? "🔁 Recommit";
  const label = `<strong>${escapeHtml(name || `that ${what}`)}</strong>`;
  let content = null;
  let whisper = null;
  if (res?.reason === "write-refused") {
    content = `<div class="sf-ptp-card"><strong>Not saved</strong><p>The recommit to ${label} could not be saved &mdash; nothing changed. Press ${escapeHtml(title)} again.</p></div>`;
    const gmIds = Array.from(globalThis.game?.users ?? []).filter(u => u?.isGM).map(u => u.id);
    whisper = [...new Set([ctx?.requesterId ?? globalThis.game?.user?.id ?? null, ...gmIds].filter(Boolean))];
  } else if (RECOMMIT_NOTHING[res?.reason]) {
    const why = RECOMMIT_NOTHING[res.reason][res.why] ?? Object.values(RECOMMIT_NOTHING[res.reason]).at(-1);
    content = `<div class="sf-ptp-card"><strong>${escapeHtml(title)}</strong><p>${label} ${why} &mdash; nothing was recommitted.</p></div>`;
  }
  if (!content) return;
  try {
    await globalThis.ChatMessage.create({
      content,
      ...(whisper ? { whisper } : {}),
      flags: { [MODULE_ID]: { recommitOutcomeNotice: true, reason: res.reason } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | recommit: telling the presser failed:`, err?.message ?? err);
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─────────────────────────────────────────────────────────────────────────────
// COMBAT-TRACK CARD "⚔ Battle instead" — gmRelay "combatTrack.battle"
// WAY-OUT CARD off-ramps — gmRelay "wayOut.pick"
// MOVE CARD "🤝 Develop Relationship" / "🔗 Forge a Bond" — gmRelay
//   "connection.suggest"
// (issue #325 W11 — each posted from the clicker's client and disabled only in
// its DOM: a re-render, or any other client, showed the button armed)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The clicker's PC a relayed press acts as: `payload.actorId`, which must be a
 * player character the requester owns; none relayed, a GM's press speaks as
 * nobody (the pipeline resolves the GM's own PC) and a player's is refused —
 * a player with no PC of their own is never handed another's.
 *
 * @returns {{ actor: Actor|null, refused?: string }}
 */
function relayedClickerPc(payload, ctx, label) {
  const actorId = typeof payload?.actorId === "string" && payload.actorId ? payload.actorId : null;
  const actor   = actorId ? (globalThis.game?.actors?.get?.(actorId) ?? null) : null;
  if (actorId && !isPlayerCharacterActor(actor)) {
    console.warn(`${MODULE_ID} | ${label}: ${actorId} is not a player character — refused.`);
    refusePress(ctx, "not-a-pc");
    return { actor: null, refused: "not-a-pc" };
  }
  if (actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | ${label}: user ${ctx?.requesterId ?? "?"} may not act as ${actor?.name ?? "no PC of their own"} — refused.`);
    refusePress(ctx, "not-owner", actor);
    return { actor: null, refused: "not-owner" };
  }
  return { actor };
}

/**
 * The PC a relayed press on a fight's follow-up acts as: the card's roller —
 * its `actorId`, the threshold card's, carried onto the way-out card and the
 * combat-track card made from it — whose player or a GM may press it, as the
 * relayed 🏁 does; on a card that names no roller, the clicker's PC
 * (relayedClickerPc). The clicker's PC was used whoever rolled: a GM's press
 * of Kira's off-ramp or Battle rolled the campaign's first PC — their stat,
 * their momentum, a Pay the Price on them (issue #335 Y11; issue #329 X05's
 * rule, "a card's forced follow-up is the card's roller's move").
 *
 * @returns {{ actor: Actor|null, refused?: string }}
 */
function cardRollerPc(f, payload, ctx, label) {
  const rollerId = typeof f?.actorId === "string" && f.actorId ? f.actorId : null;
  if (!rollerId) return relayedClickerPc(payload, ctx, label);
  const actor = globalThis.game?.actors?.get?.(rollerId) ?? null;
  if (!isPlayerCharacterActor(actor)) {
    console.warn(`${MODULE_ID} | ${label}: ${rollerId} is not a player character — refused.`);
    refusePress(ctx, "not-a-pc");
    return { actor: null, refused: "not-a-pc" };
  }
  if (!requesterOwnsActor(actor, ctx)) {
    console.warn(`${MODULE_ID} | ${label}: user ${ctx?.requesterId ?? "?"} may not roll ${actor.name}'s move — only their player or a GM may — refused.`);
    refusePress(ctx, "not-owner", actor);
    return { actor: null, refused: "not-owner" };
  }
  return { actor };
}

/**
 * gmRelay handler for "combatTrack.battle" — runs on the canonical GM (issue
 * #325 W11). The Enter the Fray combat-track card offers "⚔ Battle instead":
 * one roll resolves the whole fight. Its button posted the forced Battle from
 * the clicker's client and stamped nothing, so a second press — another
 * client's, or one after a re-render — rolled Battle again against a finished
 * fight: its +2 momentum, or a second Pay the Price, for a fight that was over.
 *
 * One Battle per card, claimed on the GM-authored card (`battleClaimed`)
 * before the post, behind the in-flight guard; a post that fails releases the
 * claim. A fight already over closes the button instead (`battleClaimed:
 * "fight-over"`) and posts nothing. The move speaks as the card's roller —
 * the threshold card's, whose player or a GM may press it — and as the
 * clicker's PC only on a card that names none (cardRollerPc, issue #335 Y11).
 *
 * @param {{ messageId?: string, actorId?: string|null }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export async function applyCombatTrackBattle(payload = {}, ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | battle: card ${messageId ?? "?"} not found — nothing rolled.`);
    return { posted: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f.combatTrackCard || !f.created) {
    console.warn(`${MODULE_ID} | battle: message ${messageId} offers no Battle — ignored.`);
    return { posted: false, reason: "not-a-battle-card" };
  }
  const key = `${messageId}:battle`;
  if (f.battleClaimed || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | battle: card ${messageId} already taken — ignoring the press.`);
    return { posted: false, reason: "already-claimed" };
  }
  const { actor, refused } = cardRollerPc(f, payload, ctx, "battle");
  if (refused) return { posted: false, reason: refused };

  _inFlight.add(key);
  try {
    const trackId = typeof f.trackId === "string" && f.trackId ? f.trackId : null;
    if (trackId) {
      const { listProgressTracks } = await import("../ui/progressTracks.js");
      const fight = (await listProgressTracks().catch(() => [])).find(t => t.id === trackId);
      if (!fight || fight.completed) {
        await message.update({ [`flags.${MODULE_ID}.battleClaimed`]: "fight-over" })
          .catch(err => console.warn(`${MODULE_ID} | battle: closing the button failed:`, err?.message ?? err));
        return { posted: false, reason: "fight-over" };
      }
    }
    try {
      await message.update({ [`flags.${MODULE_ID}.battleClaimed`]: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | battle: card ${messageId} could not be claimed — nothing rolled:`, err?.message ?? err);
      return { posted: false, reason: "claim-refused" };
    }
    const trackLabel = typeof f.trackLabel === "string" && f.trackLabel ? f.trackLabel : null;
    try {
      await ChatMessage.create({
        content: trackLabel
          ? `Battle — resolve the fight against ${trackLabel} in a single, decisive clash.`
          : "Battle — resolve the fight in a single, decisive clash.",
        ...(actor ? { speaker: speakerFor(actor) } : {}),
        flags:   { [MODULE_ID]: {
          bypassPacing: true, forcedMoveId: "battle", deferWhileBusy: true,
          ...(trackId ? { forcedMoveTargetId: trackId } : {}),
          ...(trackLabel ? { forcedMoveTarget: trackLabel } : {}),
          ...sourceCardFlag(messageId, "battleClaimed"),
        } },
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | battle: forced-move post failed — the claim is released:`, err?.message ?? err);
      await message.update({ [`flags.${MODULE_ID}.battleClaimed`]: false })
        .catch(e => console.warn(`${MODULE_ID} | battle: releasing the claim failed:`, e?.message ?? e));
      return { posted: false, reason: "post-failed" };
    }
    return { posted: true };
  } finally {
    _inFlight.delete(key);
  }
}

/** The vow names a threshold card's "This fight serves" picker offers (its HTML), unescaped. */
function thresholdVowOptions(content) {
  const select = /<select class="sf-threshold-vow">([\s\S]*?)<\/select>/i.exec(String(content ?? ""))?.[1] ?? "";
  const unescape = (v) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return [...select.matchAll(/<option value="([^"]*)"/gi)].map(m => unescape(m[1])).filter(Boolean);
}

/**
 * gmRelay handler for "combat.threshold" — runs on the canonical GM (issue
 * #329 X06). The "⚔ A fight looms" threshold card offers ⚔ Enter the Fray
 * (create the fight's track) or 🚪 Find another way (post the way-out card).
 * Its buttons were disabled in the clicker's DOM only, nothing was stamped
 * and nothing checked at render, so every other client — and the clicker's
 * next render — showed both armed: a second "Find another way" posted a
 * second way-out card (two exits from one fight), and a stale "Enter the
 * Fray" after the fight was won began it again. Enter the Fray's press was
 * also the raw `combat.enterFray` socket (known-issues RELAY-LEGACY-KINDS).
 *
 * One choice per card: claimed on the GM-authored card (`thresholdTaken`:
 * "fray" | "wayOut") behind the in-flight guard, before the track is created
 * or the way-out card posted; an effect that does not land releases the
 * claim. The fight takes the card's own label, carried position and roller;
 * the rank, the vow (one the card's picker offers) and the objective come
 * from the presser's inputs.
 *
 * @param {{ messageId?: string, choice?: "fray"|"wayOut", rank?: string, vowName?: string, objective?: string }} payload
 * @param {Object} [_ctx] — relay context (anyone at the table may press)
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applyCombatThresholdChoice(payload = {}, _ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | fight threshold: card ${messageId ?? "?"} not found — nothing done.`);
    return { applied: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f.combatThresholdCard) {
    console.warn(`${MODULE_ID} | fight threshold: message ${messageId} is not a threshold card — ignored.`);
    return { applied: false, reason: "not-a-threshold-card" };
  }
  const choice = payload.choice === "fray" || payload.choice === "wayOut" ? payload.choice : null;
  if (!choice) {
    console.warn(`${MODULE_ID} | fight threshold: "${payload.choice ?? "?"}" is not a choice the card offers — refused.`);
    return { applied: false, reason: "not-on-card" };
  }
  const key = `${messageId}:threshold`;
  if (f.thresholdTaken || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | fight threshold: card ${messageId} already taken (${f.thresholdTaken ?? "in flight"}) — ignoring the press.`);
    return { applied: false, reason: "already-claimed" };
  }

  _inFlight.add(key);
  const release = () => message.update({ [`flags.${MODULE_ID}.thresholdTaken`]: null })
    .catch(err => console.warn(`${MODULE_ID} | fight threshold: releasing the claim failed:`, err?.message ?? err));
  try {
    try {
      await message.update({ [`flags.${MODULE_ID}.thresholdTaken`]: choice });
    } catch (err) {
      console.warn(`${MODULE_ID} | fight threshold: card ${messageId} could not be claimed — nothing done:`, err?.message ?? err);
      return { applied: false, reason: "claim-refused" };
    }

    if (choice === "wayOut") {
      const { buildWayOutHtml } = await import("./combatThreshold.js");
      // The off-ramp is the threshold's roller's move (issue #335 Y11).
      const actorId = typeof f.actorId === "string" && f.actorId ? f.actorId : null;
      try {
        await ChatMessage.create({ content: buildWayOutHtml(), flags: { [MODULE_ID]: { wayOutCard: true, actorId } } });
      } catch (err) {
        console.warn(`${MODULE_ID} | fight threshold: the way-out card could not be posted — the claim is released:`, err?.message ?? err);
        await release();
        return { applied: false, reason: "post-failed" };
      }
      return { applied: true };
    }

    const { normalizeCombatRank } = await import("./combat.js");
    const vowName   = typeof payload.vowName === "string" ? payload.vowName.trim() : "";
    const objective = typeof payload.objective === "string" ? payload.objective.trim().slice(0, 120) : "";
    const { createCombatTrackFromThreshold } = await import("../index.js");
    let result = null;
    try {
      result = await createCombatTrackFromThreshold({
        label:     typeof f.label === "string" && f.label ? f.label : "the enemy",
        rank:      normalizeCombatRank(payload.rank),
        vowName:   vowName && thresholdVowOptions(message.content).includes(vowName) ? vowName : "",
        objective,
        position:  f.position ?? null,
        actorId:   typeof f.actorId === "string" && f.actorId ? f.actorId : null,
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | fight threshold: the fight could not be begun:`, err?.message ?? err);
    }
    if (!result?.track) {
      await release();
      return { applied: false, reason: "not-created" };
    }
    return { applied: true };
  } finally {
    _inFlight.delete(key);
  }
}

/**
 * gmRelay handler for "wayOut.pick" — runs on the canonical GM (issue #325
 * W11). The way-out card offers an off-ramp from a fight (Face Danger, Compel,
 * Secure an Advantage); a pick posted the forced move from the clicker's
 * client, disabled only there, so a re-render rolled it again. One off-ramp
 * per card: the card is claimed (`wayOutTaken`: the move) before the post; a
 * post that fails releases it. The move is one the card offers
 * (combatThreshold.js WAY_OUT_MOVES) and speaks as the card's roller — the
 * threshold card's, whose player or a GM may press it — and as the clicker's
 * PC only on a card that names none (cardRollerPc, issue #335 Y11).
 *
 * @param {{ messageId?: string, moveId?: string, actorId?: string|null }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export async function applyWayOutPick(payload = {}, ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | way out: card ${messageId ?? "?"} not found — nothing rolled.`);
    return { posted: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f.wayOutCard) {
    console.warn(`${MODULE_ID} | way out: message ${messageId} is not a way-out card — ignored.`);
    return { posted: false, reason: "not-a-way-out-card" };
  }
  const key = `${messageId}:wayOut`;
  if (f.wayOutTaken || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | way out: card ${messageId} already taken (${f.wayOutTaken ?? "in flight"}) — ignoring the press.`);
    return { posted: false, reason: "already-claimed" };
  }
  const { WAY_OUT_MOVES } = await import("./combatThreshold.js");
  const move = WAY_OUT_MOVES.find(m => m.moveId === payload.moveId);
  if (!move) {
    console.warn(`${MODULE_ID} | way out: "${payload.moveId ?? "?"}" is not an off-ramp the card offers — refused.`);
    return { posted: false, reason: "not-on-card" };
  }
  const { actor, refused } = cardRollerPc(f, payload, ctx, "way out");
  if (refused) return { posted: false, reason: refused };

  _inFlight.add(key);
  try {
    try {
      await message.update({ [`flags.${MODULE_ID}.wayOutTaken`]: move.moveId });
    } catch (err) {
      console.warn(`${MODULE_ID} | way out: card ${messageId} could not be claimed — nothing rolled:`, err?.message ?? err);
      return { posted: false, reason: "claim-refused" };
    }
    try {
      await ChatMessage.create({
        content: move.narration,
        ...(actor ? { speaker: speakerFor(actor) } : {}),
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: move.moveId, deferWhileBusy: true,
          ...sourceCardFlag(messageId, "wayOutTaken", null, { value: move.moveId }) } },
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | way out: forced-move post failed — the claim is released:`, err?.message ?? err);
      await message.update({ [`flags.${MODULE_ID}.wayOutTaken`]: null })
        .catch(e => console.warn(`${MODULE_ID} | way out: releasing the claim failed:`, e?.message ?? e));
      return { posted: false, reason: "post-failed" };
    }
    return { posted: true };
  } finally {
    _inFlight.delete(key);
  }
}

/**
 * gmRelay handler for "connection.suggest" — runs on the canonical GM (issue
 * #325 W11). A connection-category hit's move card offers "🤝 Develop
 * Relationship" / "🔗 Forge a Bond"; each press posted a fresh connection
 * picker from the clicker's client, so two presses — the player's and the
 * GM's, or one after a re-render — gave two pickers and developed the
 * relationship twice. One picker per card: the move card is claimed
 * (`connectionSuggestionTaken`: "develop" | "forge") before the picker is
 * posted (index.js postConnectionPickerCard — whose pick is claimed once,
 * applyConnectionPick); a picker that could not be posted releases it.
 *
 * The follow-up is the card's roller's (issue #329 X05, #338 D1), as the
 * same card's ⚑ is (applyMilestoneSuggestion): with a roller named, only
 * their player or a GM may press it, and the picker carries them
 * (`actorId`), so its pick is rolled as them. The picker named no roller, so
 * the pick spoke as its presser — a GM's press developed the first PC's
 * bond, and a crewmate took the follow-up as theirs (issue #342 Z56). A card
 * that names none stays the presser's.
 *
 * @param {{ messageId?: string, pickAction?: string }} payload
 * @param {Object} [ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export async function applyConnectionSuggestion(payload = {}, ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | connection suggestion: card ${messageId ?? "?"} not found — no picker posted.`);
    return { posted: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f.connectionSuggestion?.eligible) {
    console.warn(`${MODULE_ID} | connection suggestion: message ${messageId} offers no connection move — ignored.`);
    return { posted: false, reason: "not-a-suggestion" };
  }
  const pickAction = payload.pickAction === "develop" || payload.pickAction === "forge" ? payload.pickAction : null;
  if (!pickAction) return { posted: false, reason: "not-on-card" };
  const key = `${messageId}:connectionSuggestion`;
  if (f.connectionSuggestionTaken || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | connection suggestion: card ${messageId} already taken — ignoring the press.`);
    return { posted: false, reason: "already-claimed" };
  }
  const rollerId = typeof f.actorId === "string" && f.actorId ? f.actorId : null;
  if (rollerId) {
    const { refused } = cardRollerPc(f, payload, ctx, "connection suggestion");
    if (refused) return { posted: false, reason: refused };
  }

  _inFlight.add(key);
  try {
    try {
      await message.update({ [`flags.${MODULE_ID}.connectionSuggestionTaken`]: pickAction });
    } catch (err) {
      console.warn(`${MODULE_ID} | connection suggestion: card ${messageId} could not be claimed — no picker posted:`, err?.message ?? err);
      return { posted: false, reason: "claim-refused" };
    }
    const { postConnectionPickerCard } = await import("../index.js");
    const posted = await postConnectionPickerCard(null, pickAction, { actorId: rollerId }).catch(err => {
      console.warn(`${MODULE_ID} | connection suggestion: picker failed:`, err?.message ?? err);
      return null;
    });
    if (!posted) {
      await message.update({ [`flags.${MODULE_ID}.connectionSuggestionTaken`]: null })
        .catch(e => console.warn(`${MODULE_ID} | connection suggestion: releasing the claim failed:`, e?.message ?? e));
      return { posted: false, reason: "no-picker" };
    }
    return { posted: true };
  } finally {
    _inFlight.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WON-FIGHT CARD — gmRelay "fightVow.markMilestone" / "fightVow.deepenBond"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * gmRelay handler for "fightVow.markMilestone" — runs on the canonical GM.
 * Marks the card's linked vow by the card's own `marks`, on the card's roller
 * when they hold the vow (credit the roller), once per card.
 *
 * Any user may click: every effect value comes from the GM-authored card,
 * and the resolved stamp makes it one-shot.
 *
 * @param {{ messageId?: string }} payload
 * @param {Object} [ctx]
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applyFightVowMarkMilestone(payload = {}, ctx = {}) {
  return applyFightVowAction("markMilestone", payload, ctx, async (f) => {
    // Once per card on the vow's payoff ledger too (issue #336 Y24): the
    // stamp follows the mark (R04), and a refused stamp left the button live
    // for a second mark.
    const { markFightVowMilestoneOnce } = await import("../index.js");
    const res = await markFightVowMilestoneOnce({
      cardId:  payload.messageId,
      vowName: f.vowName ?? null, vowId: typeof f.vowId === "string" ? f.vowId : null,
      actorId: typeof f.actorId === "string" ? f.actorId : null, marks: f.marks,
    });
    // The card's vow is fulfilled, or on no sheet any more: nothing to mark —
    // no failure card, and no other vow marked in its place (issue #325 W29,
    // issue #345 AA17).
    if (res?.reason === "vow-completed" || res?.reason === "vow-gone") return false;
    return { ...res, step: "milestone", marks: f.marks ?? 1 };
  });
}

/**
 * gmRelay handler for "fightVow.deepenBond" — runs on the canonical GM.
 * Deepens the card's linked connection by the vow rank's marks, once per card.
 *
 * @param {{ messageId?: string }} payload
 * @param {Object} [ctx]
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applyFightVowDeepenBond(payload = {}, ctx = {}) {
  return applyFightVowAction("deepenBond", payload, ctx, async (f) => {
    if (!f.connectionName) {
      console.warn(`${MODULE_ID} | fight-vow deepen: card has no linked connection — nothing deepened.`);
      return false;
    }
    // Once per vow (issue #326 D1): this press and the vow's fulfilment share
    // one deepen — whichever lands first pays, recorded on the vow.
    const { deepenVowConnectionOnce } = await import("../index.js");
    const marks = marksForSourceRank(f.vowRank);
    const res = await deepenVowConnectionOnce({
      vowName: f.vowName ?? null, vowId: typeof f.vowId === "string" ? f.vowId : null,
      actorId: typeof f.actorId === "string" ? f.actorId : null,
      connectionName: f.connectionName, marks,
    });
    return { ...res, step: "deepen", connectionName: f.connectionName, marks };
  });
}

// Apply one won-fight action once per card. `apply` resolves false (nothing to
// apply), or the step's result: only { ok: true } stamps the card. A step that
// did not land leaves the action unapplied — its button re-arms, so the press
// is the retry — and the GMs are told why (issue #306 R04: the stamp used to
// land whatever happened, so a refused mark could never be retried).
async function applyFightVowAction(action, payload, ctx, apply) {
  const messageId = typeof payload?.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | fight-vow ${action}: card ${messageId ?? "?"} not found — nothing applied.`);
    return { applied: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f.fightVowCard) {
    console.warn(`${MODULE_ID} | fight-vow ${action}: message ${messageId} is not a won-fight card — ignored.`);
    return { applied: false, reason: "not-a-fight-card" };
  }
  const key = `${messageId}:${action}`;
  if (f.resolvedActions?.[action] || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | fight-vow ${action}: card ${messageId} already applied — ignoring repeat click (requester ${ctx?.requesterId ?? "?"}).`);
    return { applied: false, reason: "already-resolved" };
  }

  _inFlight.add(key);
  try {
    const out = await apply(f);
    if (out === false) return { applied: false, reason: "nothing-to-apply" };
    if (out?.ok !== true) {
      const { postPayoffFailureCard } = await import("../index.js");
      await postPayoffFailureCard({
        source: "fightButton", vowName: f.vowName ?? null, actorId: typeof f.actorId === "string" ? f.actorId : null,
        connectionName: f.connectionName ?? null, failures: [out ?? { step: action, reason: "failed" }], retryable: false,
      }).catch(err => console.warn(`${MODULE_ID} | fight-vow ${action}: failure card failed:`, err?.message ?? err));
      return { applied: false, reason: out?.reason ?? "failed" };
    }
    await message.update({ [`flags.${MODULE_ID}.resolvedActions.${action}`]: true })
      .catch(err => console.warn(`${MODULE_ID} | fight-vow ${action}: resolve update failed:`, err?.message ?? err));
    return { applied: true };
  } finally {
    _inFlight.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYOFF FAILURE CARD — gmRelay "payoff.retry"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * gmRelay handler for "payoff.retry" — runs on the canonical GM (issue #306
 * R04). Re-runs the steps a payoff failure card lists (src/index.js
 * retryPayoffSteps), once per card.
 *
 * GM only: the card is whispered to the GMs, and a Retry re-applies writes.
 * The card must be GM-authored, and every value comes from it — never from
 * the payload beyond which card. One press: the card is claimed (stamped
 * `resolved`) before any step runs, so a press whose claim is refused applies
 * nothing and its button re-arms, and a second press finds it claimed. Steps
 * that fail again go on a fresh card with its own Retry.
 *
 * @param {{ messageId?: string }} payload
 * @param {{ requesterId?: string|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ applied: boolean, reason?: string, failed?: number }>}
 */
export async function applyPayoffRetry(payload = {}, ctx = {}) {
  const messageId = typeof payload?.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | payoff retry: card ${messageId ?? "?"} not found — nothing retried.`);
    return { applied: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f.payoffFailureCard || f.retryable === false || message.author?.isGM !== true) {
    console.warn(`${MODULE_ID} | payoff retry: message ${messageId} is not a GM's payoff failure card — ignored.`);
    return { applied: false, reason: "not-a-payoff-card" };
  }
  if (!ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | payoff retry: user ${ctx?.requesterId ?? "?"} is not a GM — refused.`);
    return { applied: false, reason: "not-gm" };
  }
  const key = `${messageId}:payoffRetry`;
  if (f.resolved || _inFlight.has(key)) {
    console.debug(`${MODULE_ID} | payoff retry: card ${messageId} already retried — ignoring the press.`);
    return { applied: false, reason: "already-resolved" };
  }

  _inFlight.add(key);
  try {
    try {
      await message.update({ [`flags.${MODULE_ID}.resolved`]: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | payoff retry: card ${messageId} could not be claimed — nothing retried:`, err?.message ?? err);
      return { applied: false, reason: "claim-refused" };
    }
    const { retryPayoffSteps } = await import("../index.js");
    const failed = await retryPayoffSteps(f);
    return { applied: true, failed: failed.length };
  } finally {
    _inFlight.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The speaker a player's line was typed under: the newest chat message before
 * `card` with exactly that text and none of the module's flags — the line the
 * paced card answered — as its alias (the player's name with no PC of their
 * own). Null when it is not in chat any more.
 *
 * @param {string} text
 * @param {ChatMessage} card
 * @returns {{ alias: string }|null}
 */
function speakerOfLine(text, card) {
  if (typeof text !== "string" || !text) return null;
  const all = Array.from(globalThis.game?.messages?.contents ?? []);
  const at  = all.findIndex(m => m?.id === card?.id);
  for (let i = (at >= 0 ? at : all.length) - 1; i >= 0; i--) {
    const m = all[i];
    if (m?.flags?.[MODULE_ID] || String(m?.content ?? "") !== text) continue;
    const author = m.author;
    const authorName = typeof author === "object" ? author?.name : globalThis.game?.users?.get?.(author)?.name;
    const alias = m.speaker?.alias || authorName || null;
    return alias ? { alias } : null;
  }
  return null;
}

/** A ChatMessage speaker for `actor` — Foundry's own builder when available. */
function speakerFor(actor) {
  try {
    const built = globalThis.ChatMessage?.getSpeaker?.({ actor });
    if (built?.actor === actor.id) return built;
  } catch (err) {
    console.debug(`${MODULE_ID} | connection pick: ChatMessage.getSpeaker failed — using a bare speaker:`, err?.message ?? err);
  }
  return { actor: actor.id, alias: actor.name };
}

function unescapeHtml(s) {
  return String(s ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
