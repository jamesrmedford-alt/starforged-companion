/**
 * STARFORGED COMPANION
 * src/moves/sufferCard.js — Non-blocking suffer-choice chat card.
 *
 * Replaces the blocking SufferChoiceDialog (sufferDialog.js) in the move
 * pipeline. The dialog was awaited INSIDE the move-concurrency lock, so if it
 * failed to render or never settled it wedged `pendingMove` and every later
 * move reported "a move is already being resolved" (playtest lock-up).
 *
 * This card is posted fire-and-forget: the pipeline continues and releases the
 * lock immediately, so a suffer choice can never hang it again. The player taps
 * a button on the card to apply the choice. The apply logic
 * (`resolveSufferSelection` + `runSufferResolution`) and the `requires`
 * filtering (`isOptionAvailable`) are reused unchanged from sufferDialog.js, so
 * meters stay exactly as correct as the dialog — nothing is auto-applied or
 * guessed.
 *
 * A pick is applied on the canonical GM ("suffer.pick", gmRelay.js), once per
 * card, behind an in-flight guard — the card-button pattern of cardActions.js.
 * The clicker's own client used to apply it, so a second tap, or the player
 * and the GM both tapping, applied two suffer moves (issue #302).
 */

import {
  resolveSufferSelection,
  runSufferResolution,
  isOptionAvailable,
  isRetryableSufferCall,
} from "./sufferDialog.js";
import { isUnprepared } from "./sufferExecutor.js";
import { getActor, readCompanionHealth, readVehicleAssetBattered } from "../character/actorBridge.js";
import { getShip, getCommandVehicleActorId, isShipBattered } from "../entities/ship.js";
import { onChatMessageRender } from "../system/chatHooks.js";
import { localizeMeter, localizeDebility } from "../system/i18n.js";
import { relayCardAction } from "./cardActions.js";
import { requesterOwnsActor } from "./burnMomentum.js";
import { refusePress } from "../multiplayer/gmRelay.js";
import { retireChoiceCard, closeUpgradesForChoice, upgradeKindFor } from "./resultUpgrade.js";

const MODULE_ID = "starforged-companion";

// The six suffer moves a B1 "any" prompt ("make a suffer move (-N)") offers.
// Mirrors renderAnyPicker in sufferDialog.js.
const ANY_SUFFER_MOVES = [
  { id: "endure_harm",           label: "Endure Harm" },
  { id: "endure_stress",         label: "Endure Stress" },
  { id: "lose_momentum",         label: "Lose Momentum" },
  { id: "sacrifice_resources",   label: "Sacrifice Resources" },
  { id: "withstand_damage",      label: "Withstand Damage" },
  { id: "companion_takes_a_hit", label: "Companion Takes a Hit" },
];

// What a suffer move's sizes are called — Endure Harm / Stress: "suffer -1
// health for minor harm, -2 for serious harm, or -3 for major harm".
const SUFFER_SIZES = { 1: "Minor", 2: "Serious", 3: "Major" };
const SUFFER_NOUNS = { endure_harm: "harm", endure_stress: "stress" };

/**
 * The follow-up card for an option the player sizes (amountPick, issue #330
 * D7): one pick of the suffer move at each amount — "Minor stress (-1)",
 * "Serious stress (-2)", "Major stress (-3)".
 *
 * @param {string} sufferId
 * @param {number[]} amounts
 * @returns {Object} an enumerated sufferPrompt
 */
function amountPickPrompt(sufferId, amounts) {
  const noun = SUFFER_NOUNS[sufferId] ? ` ${SUFFER_NOUNS[sufferId]}` : "";
  return {
    kind: "enumerated",
    options: amounts.map(a => ({ label: `${SUFFER_SIZES[a] ?? labelForSuffer(sufferId)}${noun} (-${a})`, suffer: sufferId, amount: a })),
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * How many picks a prompt takes.
 *   kind "any"       → its `count` — "two suffer moves (-1 each)" is two
 *                      picks, one suffer move each (issue #325 W15)
 *   multi === true   → any number (capped at the option count)
 *   multi === number → that many
 *   otherwise        → 1 (single-select)
 *
 * @param {Object} prompt
 * @returns {number}
 */
export function sufferMultiCap(prompt) {
  if (prompt?.kind === "any") return Math.max(1, Number(prompt.count) || 1);
  if (prompt?.kind !== "enumerated") return 1;
  if (prompt.multi === true) return Math.max(1, prompt.options?.length ?? 1);
  if (typeof prompt.multi === "number") return Math.max(1, prompt.multi);
  return 1;
}

/**
 * What an option's `requires` is checked against (isOptionAvailable): the PC;
 * the companion's health — the companion the move was rolled for (the card's
 * `executorOpts.companionItemId`), else the PC's only companion, 0 with none;
 * and whether the vehicle is battered — the PC's support vehicle the move was
 * rolled for (`executorOpts.vehicleItemId`, its own Battered condition — issue
 * #342 Z53), else the vehicle the move was rolled against
 * (`executorOpts.vehicleActorId`), else the command vehicle; null when there
 * is none, so a "+1 integrity" with no vehicle to raise is unavailable.
 * Companion health was never supplied, so "companion health > 0" always read
 * 0 (issue #309 N03); the PC's own impacts stood in for the vehicle's (N02).
 *
 * @param {Actor|null} actor
 * @param {Object} [executorOpts] — the card's
 * @returns {{ actor: Actor|null, companionHealth: number, vehicleBattered: boolean|null }}
 */
function optionContext(actor, executorOpts = {}) {
  const companionHealth = readCompanionHealth(actor, executorOpts?.companionItemId ?? null) ?? 0;
  // Heal's patient: the "wounded" options read their impacts (issue #325 W04).
  const patientId = typeof executorOpts?.patientActorId === "string" && executorOpts.patientActorId
    ? executorOpts.patientActorId : null;
  const patient = patientId ? (globalThis.game?.actors?.get?.(patientId) ?? null) : null;
  const patientCompanion = !!executorOpts?.patientCompanionItemId;
  if (executorOpts?.vehicleItemId) {
    return { actor, companionHealth, patient, patientCompanion,
      vehicleBattered: readVehicleAssetBattered(actor, executorOpts.vehicleItemId) };
  }
  let vehicleBattered = null;
  try {
    const vehicleId = executorOpts?.vehicleActorId
      ?? getCommandVehicleActorId(globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {});
    if (vehicleId && getShip(vehicleId)) vehicleBattered = isShipBattered(vehicleId);
  } catch (err) {
    console.debug(`${MODULE_ID} | sufferCard: vehicle lookup failed:`, err?.message ?? err);
  }
  return { actor, companionHealth, vehicleBattered, patient, patientCompanion };
}

/**
 * True when an "any" card cannot take this suffer move: one the prompt
 * excludes (a redirected loss — sufferExecutor.sacrificeResources), or
 * Sacrifice Resources while the PC is unprepared, at any supply, whose loss
 * goes to a different suffer move (issue #325 W16; issue #338 D3).
 */
/** The tracks an "any" card offers to clear progress on (a momentum loss at the minimum). */
function clearTracksOf(prompt) {
  return (Array.isArray(prompt?.clearTracks) ? prompt.clearTracks : []).filter(t => typeof t?.id === "string" && t.id);
}

function anySufferBlocked(prompt, sufferId, ctx) {
  if (Array.isArray(prompt?.exclude) && prompt.exclude.includes(sufferId)) return true;
  return sufferId === "sacrifice_resources" && isUnprepared(ctx?.actor ?? null);
}

/**
 * Render the choice-card HTML for the current state. `pickedIndices` tracks
 * already-applied options for a multi-select prompt so they render as
 * done/disabled; `notApplied` lists what an earlier pick could not apply.
 * Availability reads `ctx` — the card's optionContext (the companion's health,
 * the vehicle's impacts) unless given.
 *
 * @param {Object} prompt
 * @param {Actor|null} actor          — for requires-filtering
 * @param {number[]} [pickedIndices]
 * @param {Object} [ctx]              — isOptionAvailable's context
 * @param {string[]} [notApplied]
 * @returns {string}
 */
export function renderSufferCard(prompt, actor, pickedIndices = [], ctx = optionContext(actor), notApplied = [], pickedSuffers = []) {
  const picked = new Set(pickedIndices);
  let header, buttons;

  if (prompt.kind === "any") {
    const n   = prompt.count ?? 1;
    const amt = prompt.amount ?? 1;
    const made = Array.isArray(pickedSuffers) ? pickedSuffers : [];
    header  = `Make a suffer move (${n > 1 ? `${n} × ` : ""}-${amt}):`
      + (made.length ? ` ${made.length} of ${n} made (${made.map(labelForSuffer).join(", ")}).` : "");
    buttons = ANY_SUFFER_MOVES.map(s => {
      const blocked = anySufferBlocked(prompt, s.id, ctx);
      return `<button type="button" class="sf-suffer-card-btn" data-action="sf-suffer-pick" ` +
        `data-pick-kind="any" data-suffer-id="${s.id}" ${blocked ? "disabled" : ""}>` +
        `${escapeHtml(s.label)} (-${amt})${blocked ? " (unavailable)" : ""}</button>`;
    }).join("")
      // A momentum loss the minimum refused may clear progress instead — one
      // rank's mark on an open track (MOMENTUM-MIN-REDIRECT-MANUAL).
      + clearTracksOf(prompt).map(t =>
        `<button type="button" class="sf-suffer-card-btn" data-action="sf-suffer-pick" ` +
        `data-pick-kind="clear" data-track-id="${escapeHtml(t.id)}">Clear progress: ${escapeHtml(t.label ?? "a track")}</button>`).join("");
  } else {
    const cap = sufferMultiCap(prompt);
    header = cap > 1
      ? `Choose ${prompt.multi === true ? "any combination" : cap}:`
      : "Choose one:";
    buttons = (prompt.options ?? []).map((opt, i) => {
      const avail    = isOptionAvailable(opt, ctx);
      const isPicked = picked.has(i);
      const disabled = !avail || isPicked;
      const mark     = isPicked ? "✓ " : "";
      const tail     = avail ? "" : " (unavailable)";
      return `<button type="button" class="sf-suffer-card-btn" data-action="sf-suffer-pick" ` +
        `data-pick-kind="enum" data-option-index="${i}" ${disabled ? "disabled" : ""}>` +
        `${mark}${escapeHtml(opt.label)}${tail}</button>`;
    }).join("");
  }

  const notes = notApplied.length
    ? `<p class="sf-card-hint">${escapeHtml(`Not applied: ${notApplied.join("; ")}`)}</p>`
    : "";
  // A prompt's own hint — the resist card's "burn or improve first" while the
  // move whose price it is still offers one (issue #336 Y18).
  const hint = typeof prompt.hint === "string" && prompt.hint
    ? `<p class="sf-card-hint">${escapeHtml(prompt.hint)}</p>`
    : "";
  return `<div class="sf-card sf-suffer-choice-card">` +
    `<div class="sf-card-header">◈ Resolve consequence</div>` +
    `<div class="sf-card-body"><p>${escapeHtml(header)}</p>` +
    `<div class="sf-suffer-card-buttons">${buttons}</div>${hint}${notes}</div></div>`;
}

function renderResolvedCard(summary) {
  return `<div class="sf-card sf-suffer-choice-card sf-suffer-resolved">` +
    `<div class="sf-card-header">◈ Consequence resolved</div>` +
    `<div class="sf-card-body"><p>${escapeHtml(summary)}</p></div></div>`;
}

/**
 * Human-readable summary of the writes a set of resolved calls performed.
 * Only the directly-applied effects (meter/suffer/mark/clear/progress) — the
 * route/complication/next-bonus calls post their own deferred cards. With
 * `results` (runSufferResolution's, one per call), a vehicle's or companion's
 * loss past 0 reads as what it cost: "integrity 0 → 0 — 1 more as momentum:
 * 2 → 1" (issue #345 AA15).
 *
 * @param {Array<Object>} calls
 * @param {Array<Object>} [results]
 * @returns {string}
 */
export function summarizeSufferCalls(calls, results = []) {
  const parts = [];
  for (const [i, c] of (calls ?? []).entries()) {
    switch (c.kind) {
      case "suffer":              parts.push(`${labelForSuffer(c.sufferId)} (-${c.amount})`); break;
      case "meter":               parts.push(results?.[i]?.momentumLoss
        ? lossPastZeroLabel(c, results[i])
        : `${meterLabel(c.meterKey)} ${c.delta >= 0 ? "+" : ""}${c.delta}`); break;
      case "mark":                parts.push(`marked ${localizeDebility(c.debility)}`); break;
      case "clear-impact":        parts.push(`cleared ${localizeDebility(c.debility)}`); break;
      case "combat-progress":     parts.push(`combat progress ×${c.count ?? 1}`); break;
      case "clear-progress":      parts.push(`cleared progress on ${c.label ?? "a track"}`); break;
      case "expedition-progress": parts.push(`expedition progress ×${c.count ?? 1}`); break;
      case "combat-position":     parts.push(c.skipped
        ? "combat position not applied"
        : (c.position === "in_control" ? "you are in control" : "you are in a bad spot")); break;
      case "next-bonus":          parts.push(`+${c.amount} next move`); break;
      case "roll-table":          parts.push(`rolled the ${c.table === "desolation" ? "desolation" : "mortal-wound"} table`); break;
      case "resist":              parts.push(`${labelForSuffer(c.moveId)} rolled to resist`); break;
      case "route":               parts.push(c.route === "pay_the_price" && c.price
        ? "the price paid (see its card)"
        : `see "Trigger: ${c.route}"`); break;
      case "complication":        parts.push("complication pending"); break;
      default: break;
    }
  }
  return parts.length ? parts.join(", ") : "no change";
}

/**
 * A vehicle's or companion's loss its track could not take, taken as
 * momentum (sufferDialog's `momentumLoss`) — the Endure Harm card's own words
 * for harm past 0 health (sufferExecutor overflowLine, issue #314 Q02).
 */
function lossPastZeroLabel(call, result) {
  const m = result.momentumLoss;
  let text = `${meterLabel(call.meterKey)} ${result.before} → ${result.after ?? result.before}` +
    ` — ${m.amount} more as momentum: ${m.before} → ${m.after}`;
  if (m.remaining > 0) text += ` (at minimum; ${m.remaining} not taken — ${m.redirected === true
    ? "make another suffer move or clear progress: choose it on its card"
    : "redirect it to another suffer move or clear progress"})`;
  return text;
}

// Why a call's write did not land (a runSufferResolution result with
// `ok: false`) — said on the resolved card.
const NOT_APPLIED = {
  "no-vehicle":   "no vehicle to change",
  "battered":     "the vehicle is battered",
  "no-companion": "no companion to change",
  "no-fight":     "no open fight was named",
  "fight-gone":   "its fight is gone",
  "fight-over":   "its fight is over",
  "ambiguous":    "more than one is open — mark it in the Progress Tracks panel",
  "refused":      "the world did not save it",
  "no-table":     "no such table",
  "track-gone":   "its track is gone",
  "track-done":   "its track is finished",
};

/**
 * "… — why" for each call whose write did not land (a runSufferResolution
 * result with `ok: false`).
 *
 * @param {Array<Object>} calls
 * @param {Array<Object>} results — runSufferResolution's, one per call
 * @returns {string[]}
 */
function notAppliedLines(calls, results) {
  return (calls ?? []).flatMap((c, i) => {
    const r = results?.[i];
    // A call whose meter landed and whose second write did not names that
    // write alone (`retryCall` — SUFFER-RETRY-WHOLE-AFTER-METER).
    return r?.ok === false ? [`${summarizeSufferCalls([r.retryCall ?? c])} — ${NOT_APPLIED[r.reason] ?? r.reason ?? "it failed"}`] : [];
  });
}

/**
 * The resolved card's text: "Applied: …" for the calls whose writes landed and
 * "Not applied: … — why" for each that did not. The card summarised the calls
 * it asked for, so a change that was dropped read as applied (issue #309 N02).
 *
 * @param {Array<Object>} calls
 * @param {Array<Object>} results — runSufferResolution's, one per call
 * @returns {string}
 */
function summarizeSufferResults(calls, results) {
  // A call whose meter landed before its second write was refused
  // (`retryCall`) is applied, and that write listed as not.
  const landed = (calls ?? []).flatMap((c, i) => (results?.[i]?.ok !== false || results?.[i]?.retryCall ? [i] : []));
  const missed = notAppliedLines(calls, results);
  return withNotApplied(landed.length || !missed.length
    ? `Applied: ${summarizeSufferCalls(landed.map(i => calls[i]), landed.map(i => results?.[i]))}` : "", missed);
}

/** `text`, then "Not applied: …" for `missed`. */
function withNotApplied(text, missed) {
  return [text, missed.length ? `Not applied: ${missed.join("; ")}` : ""].filter(Boolean).join(". ");
}

// The four PC meters the system localises. An option's numeric field can name
// something else (e.g. a companion/vehicle value) — those keep their raw key
// (companion health spelled out) rather than tripping i18n's unknown-slug
// warning.
const LOCALIZED_METERS = new Set(["health", "spirit", "supply", "momentum"]);
const OTHER_METER_LABELS = { companionHealth: "companion health" };

/** System-localised meter label ("Momentum", "Élan", …); raw key otherwise. */
function meterLabel(key) {
  if (LOCALIZED_METERS.has(key)) return localizeMeter(key);
  return OTHER_METER_LABELS[key] ?? String(key ?? "");
}

function labelForSuffer(id) {
  const m = ANY_SUFFER_MOVES.find(s => s.id === id);
  return m ? m.label : (id ?? "suffer");
}

/**
 * Post the non-blocking suffer-choice card. Returns the created message (or
 * null). Safe to call fire-and-forget from the move pipeline.
 *
 * `resolutionId` binds the card to its move's outcome, which a Burn Momentum or
 * Improve Result can replace: the card of the superseded outcome is retired
 * and refuses picks, and `upgraded` marks the upgraded outcome's own card
 * (resultUpgrade.js — issue #311 P03). A card posted in a move's Pay the
 * Price — its executor opts carry `priceCard` (index.js
 * dispatchPayThePriceSufferRoute): the resist roll its harm owes, the picker
 * of a loss it redirected — is stamped `priceCard`, so an upgrade that keeps
 * the price keeps it too (resultUpgrade.js reconcileChoices, issue #335 Y09).
 * A card posted from a kept price card's executor opts (`upgraded` in them —
 * resultUpgrade.js keepPriceCard) is the upgraded outcome's too (issue #342
 * Z47).
 *
 * @param {{ sufferPrompt: Object, actor: Actor, executorOpts?: Object, moveId?: string|null,
 *   resolutionId?: string|null, upgraded?: boolean }} args
 */
export async function postSufferChoiceCard({ sufferPrompt, actor, executorOpts = {}, moveId = null, resolutionId = null, upgraded = false }) {
  if (!sufferPrompt) return null;
  try {
    return await globalThis.ChatMessage?.create?.({
      content: renderSufferCard(sufferPrompt, actor, [], optionContext(actor, executorOpts)),
      flags: {
        [MODULE_ID]: {
          sufferCard:    true,
          sufferPrompt,
          executorOpts,
          actorId:       actor?.id ?? null,
          moveId,
          resolutionId,
          ...(upgraded || executorOpts?.upgraded === true ? { upgraded: true } : {}),
          ...(executorOpts?.priceCard === true ? { priceCard: true } : {}),
          pickedIndices: [],
          resolved:      false,
        },
      },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postSufferChoiceCard: post failed:`, err?.message ?? err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Click handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wire the suffer-card buttons on render. Idempotent across re-renders (clones
 * each button to drop stale listeners, like the burn-momentum hook). A click
 * disables the card's buttons and relays the pick to the canonical GM; they
 * re-arm when the pick did not resolve the card (refused, not delivered, or a
 * multi-select pick with more to choose).
 */
export function registerSufferCardHook() {
  onChatMessageRender((message, root) => {
    const f = message?.flags?.[MODULE_ID];
    if (!f?.sufferCard || f.resolved) return;

    const stale = root.querySelectorAll('[data-action="sf-suffer-pick"]');
    stale.forEach(btn => btn.replaceWith(btn.cloneNode(true)));

    const buttons = [...root.querySelectorAll('[data-action="sf-suffer-pick"]')];
    for (const btn of buttons) {
      if (btn.disabled) continue;
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const enabled = buttons.filter(b => !b.disabled);
        for (const b of enabled) b.disabled = true;
        await relayCardAction({
          kind:    "suffer.pick",
          payload: {
            messageId:   message?.id ?? null,
            pickKind:    btn.dataset.pickKind ?? null,
            sufferId:    btn.dataset.sufferId ?? null,
            optionIndex: btn.dataset.optionIndex ?? null,
            trackId:     btn.dataset.trackId ?? null,
          },
          isResolved: () => !!(globalThis.game?.messages?.get?.(message?.id) ?? message)?.flags?.[MODULE_ID]?.resolved,
          restore:    () => { for (const b of enabled) b.disabled = false; },
        });
      });
    }
  });
}

// Suffer cards this (the canonical GM's) client is applying a pick from: a
// second pick must not apply while the first is between its meter writes and
// the card's resolved stamp.
const _picksInFlight = new Set();

/**
 * gmRelay handler for "suffer.pick" — runs on the canonical GM (issue #302).
 * Applies one pick from a suffer card, once. The card decides what a pick
 * does: the payload only names the button, and it must be one the card offers
 * (an "any" suffer move, or an available, unpicked option). The requester must
 * own the card's PC or be a GM. A pick that arrives while another is being
 * applied, or after the card resolved, applies nothing.
 *
 * @param {{ messageId?: string, pickKind?: string, sufferId?: string, optionIndex?: string|number }} payload
 * @param {Object} ctx — relay context (requesterIsGM / requester)
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applySufferPickFromRelay(payload = {}, ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | sufferCard: card ${messageId ?? "?"} not found — pick not applied.`);
    return { applied: false, reason: "no-message" };
  }
  const f = message.flags?.[MODULE_ID] ?? {};
  if (!f.sufferCard || f.resolved || _picksInFlight.has(messageId)) {
    console.debug(`${MODULE_ID} | sufferCard: card ${messageId} already resolved — ignoring the pick.`);
    return { applied: false, reason: "already-resolved" };
  }
  // Its move's result was upgraded since: this choice belongs to the
  // superseded outcome (issue #311 P03 — a Face Danger burned to a strong hit
  // still charged its weak hit's cost). Refused even when the upgrade could
  // not retire the card.
  const upgradedBy = f.resolutionId && f.upgraded !== true ? upgradeKindFor(f.resolutionId) : null;
  if (upgradedBy) {
    console.warn(`${MODULE_ID} | sufferCard: card ${messageId} — its move's result was upgraded (${upgradedBy}); the pick is refused.`);
    await retireChoiceCard(message, upgradedBy);
    return { applied: false, reason: "superseded" };
  }
  // The card's own PC, by its id. One deleted since the card was posted is
  // gone for good: the pick fell back to the world's first PC — another
  // player's character, applied unchecked (issue #336 Y20). A player is
  // refused; a GM's press applies nothing and the card says why.
  const actor = cardActor(f);
  if (!actor) {
    if (!ctx?.requesterIsGM) {
      console.warn(`${MODULE_ID} | sufferCard: card ${messageId}'s character is gone — user ${ctx?.requesterId ?? "?"}'s pick refused.`);
      refusePress(ctx, "no-actor");
      return { applied: false, reason: "no-actor" };
    }
    _picksInFlight.add(messageId);
    try {
      await retireGoneActorCard(message);
    } finally {
      _picksInFlight.delete(messageId);
    }
    return { applied: false, reason: "no-actor" };
  }
  const pick  = offeredPick(f, payload, actor);
  if (!pick) {
    console.warn(`${MODULE_ID} | sufferCard: card ${messageId} offers no such pick — ignoring.`);
    return { applied: false, reason: "not-offered" };
  }
  if (!requesterOwnsActor(actor, ctx)) {
    console.warn(`${MODULE_ID} | sufferCard: user ${ctx?.requesterId ?? "?"} does not own ${actor.name} — pick refused.`);
    refusePress(ctx, "not-owner", actor);
    return { applied: false, reason: "not-owner" };
  }
  _picksInFlight.add(messageId);
  try {
    return await handleSufferPick(message, pick);
  } finally {
    _picksInFlight.delete(messageId);
  }
}

/** A suffer card's PC — the one it names (`actorId`), never another: null when it names none or that Actor is gone. */
function cardActor(flags) {
  return typeof flags?.actorId === "string" && flags.actorId ? (getActor(flags.actorId) ?? null) : null;
}

/**
 * A card whose PC is gone can apply nothing: resolved, its buttons gone, and
 * it says why — a GM's press on it (issue #336 Y20). Best effort.
 *
 * @param {ChatMessage} message
 */
async function retireGoneActorCard(message) {
  console.warn(`${MODULE_ID} | sufferCard: card ${message?.id ?? "?"}'s character is gone — nothing applied.`);
  await message.update({
    [`flags.${MODULE_ID}.resolved`]: true,
    content: `<div class="sf-card sf-suffer-choice-card sf-suffer-resolved">`
      + `<div class="sf-card-header">◈ Consequence not applied</div>`
      + `<div class="sf-card-body"><p>The character this card was for is no longer in the world — nothing on it was applied.</p></div></div>`,
  }).catch(err => console.warn(`${MODULE_ID} | sufferCard: card ${message?.id ?? "?"} could not say its character is gone:`, err?.message ?? err));
}

/** The pick a relayed click names, shaped like its button's dataset — or null when the card offers no such pick. */
function offeredPick(flags, payload, actor) {
  const prompt = flags.sufferPrompt;
  if (!prompt) return null;
  if (payload.pickKind === "any") {
    return prompt.kind === "any" && ANY_SUFFER_MOVES.some(s => s.id === payload.sufferId)
      && !anySufferBlocked(prompt, payload.sufferId, optionContext(actor, flags.executorOpts))
      ? { pickKind: "any", sufferId: payload.sufferId }
      : null;
  }
  if (payload.pickKind === "clear") {
    return prompt.kind === "any" && clearTracksOf(prompt).some(t => t.id === payload.trackId)
      ? { pickKind: "clear", trackId: payload.trackId }
      : null;
  }
  if (payload.pickKind === "enum" && prompt.kind !== "any") {
    const raw    = payload.optionIndex;
    const i      = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
    const option = Number.isInteger(i) ? prompt.options?.[i] : null;
    const picked = Array.isArray(flags.pickedIndices) ? flags.pickedIndices : [];
    return option && isOptionAvailable(option, optionContext(actor, flags.executorOpts)) && !picked.includes(i)
      ? { pickKind: "enum", optionIndex: String(i) }
      : null;
  }
  return null;
}

async function handleSufferPick(message, dataset) {
  const f = message?.flags?.[MODULE_ID] ?? {};
  const prompt = f.sufferPrompt;
  if (!f.sufferCard || f.resolved || !prompt) return { applied: false, reason: "already-resolved" };
  // The card always carries its PC: never the world's first PC in its place
  // (issue #336 Y20 — applySufferPickFromRelay answers a gone one first).
  const actor = cardActor(f);
  if (!actor) {
    console.warn(`${MODULE_ID} | sufferCard: no actor to apply suffer against`);
    return { applied: false, reason: "no-actor" };
  }
  const executorOpts = f.executorOpts ?? {};

  // Build the selection from the clicked button. anyChoice is supplied
  // defensively so an enumerated option that is itself a nested "any" sub-prompt
  // resolves rather than emitting needs-any.
  let selection, idx = null;
  if (dataset.pickKind === "clear") {
    selection = { clearTrackId: dataset.trackId };
  } else if (dataset.pickKind === "any") {
    selection = { anyChoice: dataset.sufferId };
  } else {
    idx = Number(dataset.optionIndex);
    selection = { optionIndices: [idx], anyChoice: null };
  }

  const calls = resolveSufferSelection(prompt, selection);
  // A nested "any" sub-prompt (e.g. set_a_course's "One suffer move (-2)"):
  // a fresh B1 picker card follows rather than a default being applied. An
  // option the player sizes (amountPick — Forsake Your Vow's Endure Stress,
  // issue #330 D7) is followed by its minor / serious / major card.
  const needsAny    = calls.find(c => c.kind === "needs-any");
  const needsAmount = calls.find(c => c.kind === "needs-amount");
  const followUpPrompt = needsAny
    ? { kind: "any", amount: needsAny.amount, count: needsAny.count }
    : (needsAmount ? amountPickPrompt(needsAmount.sufferId, needsAmount.amounts) : null);

  // Multi-select: accumulate picks until the cap is reached, then resolve.
  // An "any" prompt of `count` > 1 takes one suffer move per pick (issue
  // #325 W15); the same move twice only when it is picked twice.
  const cap      = sufferMultiCap(prompt);
  const multiAny = prompt.kind === "any" && cap > 1;
  const multi    = (prompt.kind === "enumerated" && cap > 1 && idx != null) || multiAny;
  const madeAny  = multiAny ? [...(Array.isArray(f.pickedSuffers) ? f.pickedSuffers : []), dataset.sufferId] : [];
  const picked   = multi && !multiAny ? [...(Array.isArray(f.pickedIndices) ? f.pickedIndices : []), idx] : null;
  const done     = !multi || (multiAny ? madeAny.length : picked.length) >= cap;
  const notes  = Array.isArray(f.notApplied) ? f.notApplied : [];
  const ctx    = optionContext(actor, executorOpts);
  const doneText = needsAny ? "Suffer move chosen — resolve it on the follow-up card."
    : needsAmount ? `${labelForSuffer(needsAmount.sufferId)} chosen — choose how much on the follow-up card.`
    : multi ? "Applied your selections."
    : `Applied: ${summarizeSufferCalls(calls)}`;

  // The pick is claimed — the card resolved, or this option marked picked —
  // before any effect runs (issue #309 N07). The stamp used to follow the
  // effects, its refusal swallowed: the card stayed live and a second press
  // applied the same cost again. A refused claim applies nothing and the
  // buttons re-arm (relayCardAction).
  const claim = done
    ? { [`flags.${MODULE_ID}.resolved`]: true, content: renderResolvedCard(withNotApplied(doneText, notes)) }
    : { content: renderSufferCard(prompt, actor, picked ?? [], ctx, notes, madeAny) };
  if (multi && !multiAny) claim[`flags.${MODULE_ID}.pickedIndices`] = picked;
  if (multiAny) claim[`flags.${MODULE_ID}.pickedSuffers`] = madeAny;
  try {
    await message.update(claim);
  } catch (err) {
    console.warn(`${MODULE_ID} | sufferCard: card ${message.id} could not be claimed — nothing applied:`, err?.message ?? err);
    return { applied: false, reason: "claim-refused" };
  }
  // The consequence is chosen: its move's Burn Momentum / Improve Result close
  // (resultUpgrade.js consequenceChosen) — once the choice stands.
  const closeUpgrades = () => (f.resolutionId && f.upgraded !== true ? closeUpgradesForChoice(f.resolutionId) : null);

  if (followUpPrompt) {
    const followUp = await postSufferChoiceCard({
      sufferPrompt: followUpPrompt,
      actor, executorOpts, moveId: f.moveId,
    });
    if (followUp) {
      await closeUpgrades();
      return { applied: true };
    }
    // No picker to make the choice on: nothing was applied, so the card
    // re-opens for the pick to be made again.
    await message.update({
      [`flags.${MODULE_ID}.resolved`]: false,
      ...(multi ? { [`flags.${MODULE_ID}.pickedIndices`]: f.pickedIndices ?? [] } : {}),
      content: renderSufferCard(prompt, actor, f.pickedIndices ?? [], ctx, notes),
    }).catch(err => console.warn(`${MODULE_ID} | sufferCard: card ${message.id} could not re-open:`, err?.message ?? err));
    return { applied: false, reason: "no-follow-up" };
  }

  await closeUpgrades();
  // The card's id goes with the calls: a resist roll it owes is posted as a
  // forced move that names this card, so a roll that is then not made
  // re-opens it (cardActions.js releaseSourceCard — issue #347 AB06).
  const results = await runSufferResolution(calls, actor, { ...executorOpts, sufferCardId: message.id ?? null });
  const missed  = notAppliedLines(calls, results);
  // A loss past a vehicle's or companion's 0 was taken as momentum: the
  // resolved card says so, not the "-1" nothing took (issue #345 AA15).
  const pastZero = done && !multi && results.some(r => r?.momentumLoss);
  if (missed.length || pastZero) {
    // The card says what did not land; a write the world refused goes to the
    // GMs, with a Retry.
    const update = done
      ? { content: renderResolvedCard(multi ? withNotApplied(doneText, [...notes, ...missed]) : summarizeSufferResults(calls, results)) }
      : { [`flags.${MODULE_ID}.notApplied`]: [...notes, ...missed], content: renderSufferCard(prompt, actor, picked ?? [], ctx, [...notes, ...missed], madeAny) };
    await message.update(update).catch(err =>
      console.warn(`${MODULE_ID} | sufferCard: card ${message.id} note failed:`, err?.message ?? err));
    if (missed.length) await reportRefusedCalls(actor, calls, results, executorOpts);
  }
  return { applied: true };
}

/**
 * Re-open a suffer choice card — not resolved, not superseded, its buttons
 * rendered again with the picks it already has — when its pick posted a roll
 * that was then not made: the resist roll a harm or stress at 0 owes
 * (sufferDialog.js "resist"), whose confirm was closed or whose start or
 * reading failed (cardActions.js releaseSourceCard), or when the waypoint
 * alternative that retired it was not rolled. The pick was claimed
 * (`resolved`, "Applied: … rolled to resist") before the roll was posted, so
 * the card said the roll was made and its button was gone for good (issue
 * #347 AB06). Runs on the canonical GM (the move pipeline's client). A card
 * whose character is gone, or one live already, stays as it is.
 *
 * @param {string|ChatMessage} messageOrId
 * @returns {Promise<boolean>} whether the card is open again
 */
export async function reopenSufferCard(messageOrId) {
  const message = typeof messageOrId === "string"
    ? (globalThis.game?.messages?.get?.(messageOrId) ?? null)
    : (messageOrId ?? null);
  const f = message?.flags?.[MODULE_ID] ?? {};
  const prompt = f.sufferPrompt;
  // Live already — not resolved and not retired — there is nothing to re-open.
  if (!f.sufferCard || !prompt || (!f.resolved && !f.superseded)) return false;
  const actor = cardActor(f);
  if (!actor) return false;
  const picked  = Array.isArray(f.pickedIndices) ? f.pickedIndices : [];
  const madeAny = Array.isArray(f.pickedSuffers) ? f.pickedSuffers : [];
  const notes   = Array.isArray(f.notApplied) ? f.notApplied : [];
  try {
    await message.update({
      [`flags.${MODULE_ID}.resolved`]:   false,
      [`flags.${MODULE_ID}.superseded`]: false,
      [`flags.${MODULE_ID}.retiredBy`]:  null,
      content: renderSufferCard(prompt, actor, picked, optionContext(actor, f.executorOpts ?? {}), notes, madeAny),
    });
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | sufferCard: card ${message?.id ?? "?"} could not re-open:`, err?.message ?? err);
    return false;
  }
}

/**
 * A pick's writes the world refused, on the GMs' payoff failure card — each
 * a `suffer` step its Retry applies once (index.js runPayoffStep). Claimed
 * before its effects, the pick cannot be pressed again (issue #309 N07).
 */
async function reportRefusedCalls(actor, calls, results, executorOpts) {
  const failures = calls.flatMap((call, i) => {
    const r = results[i];
    // The Retry applies what was refused: a call's second write alone when
    // its meter landed (`retryCall` — SUFFER-RETRY-WHOLE-AFTER-METER: the
    // whole call's Retry took the meter again).
    const owed = r?.retryCall ?? call;
    return r?.ok === false && r.reason === "refused" && isRetryableSufferCall(owed)
      ? [{ step: "suffer", call: owed, opts: executorOpts, reason: "refused", error: r.error ?? null }]
      : [];
  });
  if (!failures.length) return;
  try {
    const { postPayoffFailureCard } = await import("../index.js");
    await postPayoffFailureCard({ source: "suffer", actorId: actor?.id ?? null, failures });
  } catch (err) {
    console.warn(`${MODULE_ID} | sufferCard: failure card failed:`, err?.message ?? err);
  }
}
