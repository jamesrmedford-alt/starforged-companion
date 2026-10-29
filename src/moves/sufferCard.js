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
import { getActor, getPlayerActors, readCompanionHealth } from "../character/actorBridge.js";
import { getShip, getCommandVehicleActorId, isShipBattered } from "../entities/ship.js";
import { onChatMessageRender } from "../system/chatHooks.js";
import { localizeMeter, localizeDebility } from "../system/i18n.js";
import { relayCardAction } from "./cardActions.js";
import { requesterOwnsActor } from "./burnMomentum.js";

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

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * How many options an enumerated prompt lets the player pick.
 *   multi === true   → any number (capped at the option count)
 *   multi === number → that many
 *   otherwise        → 1 (single-select)
 *
 * @param {Object} prompt
 * @returns {number}
 */
export function sufferMultiCap(prompt) {
  if (prompt?.kind !== "enumerated") return 1;
  if (prompt.multi === true) return Math.max(1, prompt.options?.length ?? 1);
  if (typeof prompt.multi === "number") return Math.max(1, prompt.multi);
  return 1;
}

/**
 * What an option's `requires` is checked against (isOptionAvailable): the PC;
 * the companion's health — the companion the move was rolled for (the card's
 * `executorOpts.companionItemId`), else the PC's only companion, 0 with none;
 * and whether the vehicle is battered — the vehicle the move was rolled
 * against (`executorOpts.vehicleActorId`), else the command vehicle; null when
 * there is none, so a "+1 integrity" with no vehicle to raise is unavailable.
 * Companion health was never supplied, so "companion health > 0" always read
 * 0 (issue #309 N03); the PC's own impacts stood in for the vehicle's (N02).
 *
 * @param {Actor|null} actor
 * @param {Object} [executorOpts] — the card's
 * @returns {{ actor: Actor|null, companionHealth: number, vehicleBattered: boolean|null }}
 */
function optionContext(actor, executorOpts = {}) {
  const companionHealth = readCompanionHealth(actor, executorOpts?.companionItemId ?? null) ?? 0;
  let vehicleBattered = null;
  try {
    const vehicleId = executorOpts?.vehicleActorId
      ?? getCommandVehicleActorId(globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {});
    if (vehicleId && getShip(vehicleId)) vehicleBattered = isShipBattered(vehicleId);
  } catch (err) {
    console.debug(`${MODULE_ID} | sufferCard: vehicle lookup failed:`, err?.message ?? err);
  }
  return { actor, companionHealth, vehicleBattered };
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
export function renderSufferCard(prompt, actor, pickedIndices = [], ctx = optionContext(actor), notApplied = []) {
  const picked = new Set(pickedIndices);
  let header, buttons;

  if (prompt.kind === "any") {
    const n   = prompt.count ?? 1;
    const amt = prompt.amount ?? 1;
    header  = `Make a suffer move (${n > 1 ? `${n} × ` : ""}-${amt}):`;
    buttons = ANY_SUFFER_MOVES.map(s =>
      `<button type="button" class="sf-suffer-card-btn" data-action="sf-suffer-pick" ` +
      `data-pick-kind="any" data-suffer-id="${s.id}">${escapeHtml(s.label)} (-${amt})</button>`,
    ).join("");
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
  return `<div class="sf-card sf-suffer-choice-card">` +
    `<div class="sf-card-header">◈ Resolve consequence</div>` +
    `<div class="sf-card-body"><p>${escapeHtml(header)}</p>` +
    `<div class="sf-suffer-card-buttons">${buttons}</div>${notes}</div></div>`;
}

function renderResolvedCard(summary) {
  return `<div class="sf-card sf-suffer-choice-card sf-suffer-resolved">` +
    `<div class="sf-card-header">◈ Consequence resolved</div>` +
    `<div class="sf-card-body"><p>${escapeHtml(summary)}</p></div></div>`;
}

/**
 * Human-readable summary of the writes a set of resolved calls performed.
 * Only the directly-applied effects (meter/suffer/mark/clear/progress) — the
 * route/complication/next-bonus calls post their own deferred cards.
 *
 * @param {Array<Object>} calls
 * @returns {string}
 */
export function summarizeSufferCalls(calls) {
  const parts = [];
  for (const c of calls ?? []) {
    switch (c.kind) {
      case "suffer":              parts.push(`${labelForSuffer(c.sufferId)} (-${c.amount})`); break;
      case "meter":               parts.push(`${meterLabel(c.meterKey)} ${c.delta >= 0 ? "+" : ""}${c.delta}`); break;
      case "mark":                parts.push(`marked ${localizeDebility(c.debility)}`); break;
      case "clear-impact":        parts.push(`cleared ${localizeDebility(c.debility)}`); break;
      case "combat-progress":     parts.push(`combat progress ×${c.count ?? 1}`); break;
      case "expedition-progress": parts.push(`expedition progress ×${c.count ?? 1}`); break;
      case "combat-position":     parts.push(c.skipped
        ? "combat position not applied"
        : (c.position === "in_control" ? "you are in control" : "you are in a bad spot")); break;
      case "next-bonus":          parts.push(`+${c.amount} next move`); break;
      case "route":               parts.push(`see "Trigger: ${c.route}"`); break;
      case "complication":        parts.push("complication pending"); break;
      default: break;
    }
  }
  return parts.length ? parts.join(", ") : "no change";
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
    return r?.ok === false ? [`${summarizeSufferCalls([c])} — ${NOT_APPLIED[r.reason] ?? r.reason ?? "it failed"}`] : [];
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
  const landed = (calls ?? []).filter((_c, i) => results?.[i]?.ok !== false);
  const missed = notAppliedLines(calls, results);
  return withNotApplied(landed.length || !missed.length ? `Applied: ${summarizeSufferCalls(landed)}` : "", missed);
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
 * @param {{ sufferPrompt: Object, actor: Actor, executorOpts?: Object, moveId?: string|null }} args
 */
export async function postSufferChoiceCard({ sufferPrompt, actor, executorOpts = {}, moveId = null }) {
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
  const actor = getActor(f.actorId) ?? null;
  const pick  = offeredPick(f, payload, actor);
  if (!pick) {
    console.warn(`${MODULE_ID} | sufferCard: card ${messageId} offers no such pick — ignoring.`);
    return { applied: false, reason: "not-offered" };
  }
  if (actor && !requesterOwnsActor(actor, ctx)) {
    console.warn(`${MODULE_ID} | sufferCard: user ${ctx?.requesterId ?? "?"} does not own ${actor.name} — pick refused.`);
    return { applied: false, reason: "not-owner" };
  }
  _picksInFlight.add(messageId);
  try {
    return await handleSufferPick(message, pick);
  } finally {
    _picksInFlight.delete(messageId);
  }
}

/** The pick a relayed click names, shaped like its button's dataset — or null when the card offers no such pick. */
function offeredPick(flags, payload, actor) {
  const prompt = flags.sufferPrompt;
  if (!prompt) return null;
  if (payload.pickKind === "any") {
    return prompt.kind === "any" && ANY_SUFFER_MOVES.some(s => s.id === payload.sufferId)
      ? { pickKind: "any", sufferId: payload.sufferId }
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
  const actor = getActor(f.actorId) ?? getPlayerActors()[0] ?? null;
  if (!actor) {
    console.warn(`${MODULE_ID} | sufferCard: no actor to apply suffer against`);
    return { applied: false, reason: "no-actor" };
  }
  const executorOpts = f.executorOpts ?? {};

  // Build the selection from the clicked button. anyChoice is supplied
  // defensively so an enumerated option that is itself a nested "any" sub-prompt
  // resolves rather than emitting needs-any.
  let selection, idx = null;
  if (dataset.pickKind === "any") {
    selection = { anyChoice: dataset.sufferId };
  } else {
    idx = Number(dataset.optionIndex);
    selection = { optionIndices: [idx], anyChoice: null };
  }

  const calls = resolveSufferSelection(prompt, selection);
  // A nested "any" sub-prompt (e.g. set_a_course's "One suffer move (-2)"):
  // a fresh B1 picker card follows rather than a default being applied.
  const needsAny = calls.find(c => c.kind === "needs-any");

  // Multi-select: accumulate picks until the cap is reached, then resolve.
  const cap    = sufferMultiCap(prompt);
  const multi  = prompt.kind === "enumerated" && cap > 1 && idx != null;
  const picked = multi ? [...(Array.isArray(f.pickedIndices) ? f.pickedIndices : []), idx] : null;
  const done   = !multi || picked.length >= cap;
  const notes  = Array.isArray(f.notApplied) ? f.notApplied : [];
  const ctx    = optionContext(actor, executorOpts);
  const doneText = needsAny ? "Suffer move chosen — resolve it on the follow-up card."
    : multi ? "Applied your selections."
    : `Applied: ${summarizeSufferCalls(calls)}`;

  // The pick is claimed — the card resolved, or this option marked picked —
  // before any effect runs (issue #309 N07). The stamp used to follow the
  // effects, its refusal swallowed: the card stayed live and a second press
  // applied the same cost again. A refused claim applies nothing and the
  // buttons re-arm (relayCardAction).
  const claim = done
    ? { [`flags.${MODULE_ID}.resolved`]: true, content: renderResolvedCard(withNotApplied(doneText, notes)) }
    : { content: renderSufferCard(prompt, actor, picked, ctx, notes) };
  if (multi) claim[`flags.${MODULE_ID}.pickedIndices`] = picked;
  try {
    await message.update(claim);
  } catch (err) {
    console.warn(`${MODULE_ID} | sufferCard: card ${message.id} could not be claimed — nothing applied:`, err?.message ?? err);
    return { applied: false, reason: "claim-refused" };
  }

  if (needsAny) {
    const followUp = await postSufferChoiceCard({
      sufferPrompt: { kind: "any", amount: needsAny.amount, count: needsAny.count },
      actor, executorOpts, moveId: f.moveId,
    });
    if (followUp) return { applied: true };
    // No picker to make the choice on: nothing was applied, so the card
    // re-opens for the pick to be made again.
    await message.update({
      [`flags.${MODULE_ID}.resolved`]: false,
      ...(multi ? { [`flags.${MODULE_ID}.pickedIndices`]: f.pickedIndices ?? [] } : {}),
      content: renderSufferCard(prompt, actor, f.pickedIndices ?? [], ctx, notes),
    }).catch(err => console.warn(`${MODULE_ID} | sufferCard: card ${message.id} could not re-open:`, err?.message ?? err));
    return { applied: false, reason: "no-follow-up" };
  }

  const results = await runSufferResolution(calls, actor, executorOpts);
  const missed  = notAppliedLines(calls, results);
  if (missed.length) {
    // The card says what did not land; a write the world refused goes to the
    // GMs, with a Retry.
    const update = done
      ? { content: renderResolvedCard(multi ? withNotApplied(doneText, [...notes, ...missed]) : summarizeSufferResults(calls, results)) }
      : { [`flags.${MODULE_ID}.notApplied`]: [...notes, ...missed], content: renderSufferCard(prompt, actor, picked, ctx, [...notes, ...missed]) };
    await message.update(update).catch(err =>
      console.warn(`${MODULE_ID} | sufferCard: card ${message.id} note failed:`, err?.message ?? err));
    await reportRefusedCalls(actor, calls, results, executorOpts);
  }
  return { applied: true };
}

/**
 * A pick's writes the world refused, on the GMs' payoff failure card — each
 * a `suffer` step its Retry applies once (index.js runPayoffStep). Claimed
 * before its effects, the pick cannot be pressed again (issue #309 N07).
 */
async function reportRefusedCalls(actor, calls, results, executorOpts) {
  const failures = calls.flatMap((call, i) => {
    const r = results[i];
    return r?.ok === false && r.reason === "refused" && isRetryableSufferCall(call)
      ? [{ step: "suffer", call, opts: executorOpts, reason: "refused", error: r.error ?? null }]
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
