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
 * ("payoff.retry", issue #306 R04). The handlers below run on the canonical GM, check
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
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: move.moveId, ...target } },
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
    const { deepenLinkedConnection } = await import("../index.js");
    const marks = marksForSourceRank(f.vowRank);
    const res = await deepenLinkedConnection(f.connectionName, marks);
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
