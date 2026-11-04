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
 * "🔁 Recommit" ("expedition.recommit", both issue #321 U20). The
 * handlers below run on the canonical GM, check
 * and stamp the card's resolved flag behind an in-flight guard (the
 * milestone-picker pattern, src/moves/milestonePicker.js), and take every
 * effect value from the GM-authored card — never from the client payload
 * beyond "which button" (gmRelay.js "Trust model"). The render binders live in
 * src/index.js (wireConnectionPickerButtons, wireFightVowButtons) and call
 * relayCardAction() below so a click that is not delivered re-arms its
 * button.
 */

import { requestGmAction } from "../multiplayer/gmRelay.js";
import { isPlayerCharacterActor } from "../character/actorBridge.js";
import { requesterOwnsActor, RELAY_RECOVERY_MS } from "./burnMomentum.js";
import { marksForSourceRank } from "./milestone.js";
import { consequenceChosen, retireOutcomeChoiceCards } from "./resultUpgrade.js";

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
// CONNECTION PICKER — gmRelay "connection.pick"
// ─────────────────────────────────────────────────────────────────────────────

const PICK_MOVES = Object.freeze({
  develop: { moveId: "develop_your_relationship", content: (name) => `Develop my relationship with ${name}.` },
  forge:   { moveId: "forge_a_bond",              content: (name) => `Forge a bond with ${name}.` },
});

/**
 * gmRelay handler for "connection.pick" — runs on the canonical GM.
 *
 * Validates the pick against the card's own choices, posts the forced
 * Develop Your Relationship / Forge a Bond move ONCE — with
 * `speaker.actor` = the clicker's PC, so the pipeline's resolveSpeakerActorId
 * credits the roller even though the GM authors the message, and the picked
 * connection as `forcedMoveTargetId` (host id) + `forcedMoveTarget` (name) —
 * then stamps the picker `resolved`. Idempotent per card.
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

  // The clicker's PC — credit the roller. Must be a PC the requester owns.
  const actorId = typeof payload.actorId === "string" && payload.actorId ? payload.actorId : null;
  const actor   = actorId ? (globalThis.game?.actors?.get?.(actorId) ?? null) : null;
  if (actorId && !isPlayerCharacterActor(actor)) {
    console.warn(`${MODULE_ID} | connection pick: ${actorId} is not a player character — refused.`);
    return { posted: false, reason: "not-a-pc" };
  }
  if (actor && !requesterOwnsActor(actor, ctx)) {
    console.warn(`${MODULE_ID} | connection pick: user ${ctx?.requesterId ?? "?"} does not own ${actor.name} — refused.`);
    return { posted: false, reason: "not-owner" };
  }
  if (!actor) {
    console.debug(`${MODULE_ID} | connection pick: no clicker PC relayed — the pipeline resolves the speaker from the message author.`);
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
    try {
      await ChatMessage.create({
        content: move.content(label),
        ...(actor ? { speaker: speakerFor(actor) } : {}),
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: move.moveId, deferWhileBusy: true, ...target } },
      });
    } catch (err) {
      // Leave the card unresolved so the pick can be retried.
      console.warn(`${MODULE_ID} | connection pick: forced-move post failed:`, err?.message ?? err);
      return { posted: false, reason: "post-failed" };
    }
    await message.update({ [`flags.${MODULE_ID}.resolved`]: true })
      .catch(err => console.warn(`${MODULE_ID} | connection picker resolve update failed:`, err?.message ?? err));
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
    return { posted: false, reason: "not-a-pc" };
  }
  if (actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | waypoint oracle: user ${ctx?.requesterId ?? "?"} may not take ${actor?.name ?? "this card"}'s reward — refused.`);
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
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: f.waypointOracleCard, deferWhileBusy: true } },
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
    return { posted: false, reason: "not-a-pc" };
  }
  if (actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | which vow: user ${ctx?.requesterId ?? "?"} may not pick for ${actor?.name ?? "this card"} — refused.`);
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
      await ChatMessage.create({
        content: f.narration || `Attempt to fulfill ${choice.name || "my vow"}.`,
        ...(actor ? { speaker: speakerFor(actor) } : {}),
        flags:   { [MODULE_ID]: {
          bypassPacing: true, forcedMoveId: "fulfill_your_vow", deferWhileBusy: true,
          forcedMoveTargetId: choice.itemId,
          ...(choice.name ? { forcedMoveTarget: choice.name } : {}),
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
    return { posted: false, reason: "not-a-pc" };
  }
  if (actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | milestone suggestion: user ${ctx?.requesterId ?? "?"} may not mark ${actor?.name ?? "this card"}'s vow — refused.`);
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
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "reach_a_milestone", deferWhileBusy: true } },
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
 * an expedition already over leaves the offer closed.
 *
 * @param {{ messageId?: string }} payload
 * @param {Object} [_ctx]
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applyRecommitOffer(payload = {}, _ctx = {}) {
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
    return { applied: res?.ok === true, ...(res?.reason ? { reason: res.reason } : {}) };
  } finally {
    _inFlight.delete(key);
  }
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
    return { actor: null, refused: "not-a-pc" };
  }
  if (actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | ${label}: user ${ctx?.requesterId ?? "?"} may not act as ${actor?.name ?? "no PC of their own"} — refused.`);
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
 * "fight-over"`) and posts nothing. The move speaks as the clicker's PC.
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
  const { actor, refused } = relayedClickerPc(payload, ctx, "battle");
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
      try {
        await ChatMessage.create({ content: buildWayOutHtml(), flags: { [MODULE_ID]: { wayOutCard: true } } });
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
    await message.update({ [`flags.${MODULE_ID}.thresholdTrackId`]: result.track.id })
      .catch(err => console.debug?.(`${MODULE_ID} | fight threshold: recording the fight on the card failed:`, err?.message ?? err));
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
 * (combatThreshold.js WAY_OUT_MOVES) and speaks as the clicker's PC.
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
  const { actor, refused } = relayedClickerPc(payload, ctx, "way out");
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
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: move.moveId, deferWhileBusy: true } },
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
 * @param {{ messageId?: string, pickAction?: string }} payload
 * @param {Object} [_ctx]
 * @returns {Promise<{ posted: boolean, reason?: string }>}
 */
export async function applyConnectionSuggestion(payload = {}, _ctx = {}) {
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

  _inFlight.add(key);
  try {
    try {
      await message.update({ [`flags.${MODULE_ID}.connectionSuggestionTaken`]: pickAction });
    } catch (err) {
      console.warn(`${MODULE_ID} | connection suggestion: card ${messageId} could not be claimed — no picker posted:`, err?.message ?? err);
      return { posted: false, reason: "claim-refused" };
    }
    const { postConnectionPickerCard } = await import("../index.js");
    const posted = await postConnectionPickerCard(null, pickAction).catch(err => {
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
    const { markLinkedVowMilestone } = await import("../index.js");
    const res = await markLinkedVowMilestone(f.vowName ?? null, f.marks, typeof f.actorId === "string" ? f.actorId : null);
    // The card's vow is fulfilled: nothing to mark — no failure card, and no
    // other vow marked in its place (issue #325 W29).
    if (res?.reason === "vow-completed") return false;
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
