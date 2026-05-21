/**
 * STARFORGED COMPANION
 * src/moves/burnMomentum.js — Burn Momentum chat-card affordance.
 *
 * Wires the 🔥 Burn Momentum button on move-result chat cards.
 *
 * Rules (Starforged Reference Guide p.117):
 *   "Burn Momentum: When you make a move and roll the action die, you may
 *    burn momentum. To do so, set your action score equal to your current
 *    momentum value, then reset your momentum to its reset value (+2 by
 *    default, lower when impacts are marked). You must burn momentum
 *    before applying any other effects of the move."
 *
 * In this module the burn is offered AFTER persistResolution has applied
 * the original outcome's consequences — the card carries the metadata to
 * undo and reapply when the player clicks. We track the applied-state on
 * the card flag (`originalApplied`) so the click handler can compute the
 * correct meter delta whether or not the original outcome reached the
 * sheet (player clients defer to GM, so multi-user races are possible).
 *
 * Limitations of this implementation:
 *   - Only meter consequences (health/spirit/supply/momentum) reverse on
 *     burn. Progress-track marking and auto-debility flips from suffer
 *     moves are not rolled back — those rarely change between weak and
 *     strong hits for the same move, and the rules-correct reversal
 *     would require more state than we currently track. If a player
 *     reports a case where this matters, we can extend.
 */

import {
  canBurnMomentum,
  applyMomentumBurn,
  mapConsequences,
} from "./resolver.js";
import {
  getActor,
  getPlayerActors,
  applyMeterChanges,
} from "../character/actorBridge.js";
import { onChatMessageRender } from "../system/chatHooks.js";

const MODULE_ID = "starforged-companion";


// ─────────────────────────────────────────────────────────────────────────────
// ELIGIBILITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the metadata blob to stash on the move-result chat card so the
 * Burn button knows what to do when clicked. Returns null when burn is
 * not eligible (progress move, zero momentum, outcome wouldn't improve,
 * etc).
 *
 * `postMomentum` is the momentum the actor will have AFTER the original
 * outcome's consequences are persisted — that's the value the player
 * burns against per the rules.
 *
 * @param {Object} resolution
 * @param {Actor}  actor       — active character; needed for momentum + impacts
 * @returns {Object|null}
 */
export function buildBurnState(resolution, actor) {
  if (!actor || !resolution) return null;
  if (resolution.isProgressMove) return null;

  const currentMomentum    = readMomentum(actor);
  const consequenceDelta   = Number(resolution.consequences?.momentumChange ?? 0);
  const postMomentum       = currentMomentum + consequenceDelta;
  const markedImpactCount  = countImpacts(actor);

  if (!canBurnMomentum(postMomentum, resolution.outcome, resolution.challengeDice, false)) {
    return null;
  }

  const { outcome: previewOutcome } = applyMomentumBurn(
    postMomentum, resolution.challengeDice, markedImpactCount,
  );

  return {
    canBurn:            true,
    challengeDice:      resolution.challengeDice,
    momentum:           postMomentum,
    markedImpactCount,
    moveId:             resolution.moveId,
    originalOutcome:    resolution.outcome,
    originalConsequences: { ...resolution.consequences },
    previewOutcome,
    originalApplied:    false,            // flipped to true once persistResolution writes
    actorId:            actor.id,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// CARD RENDERING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HTML snippet for the burn button row. Inserted into the move-result card
 * by formatMoveResult when burn metadata is present.
 */
export function renderBurnButtonHtml(burnState) {
  if (!burnState?.canBurn) return "";
  const label = `🔥 Burn Momentum (${burnState.momentum} → ${labelForOutcome(burnState.previewOutcome)})`;
  return (
    `<div class="sf-burn-momentum-row">` +
      `<button type="button" class="sf-burn-momentum-btn" data-action="sf-burn-momentum">${label}</button>` +
    `</div>`
  );
}

function labelForOutcome(outcome) {
  switch (outcome) {
    case "strong_hit": return "Strong Hit";
    case "weak_hit":   return "Weak Hit";
    case "miss":       return "Miss";
    default:           return outcome ?? "?";
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// HOOK REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wire renderChatMessage so the Burn button on a move-result card receives
 * a click handler. Idempotent across re-renders — disables the button after
 * use so the same card cannot burn twice.
 *
 * @param {Object} hooks      — narrator + persist injections so this module
 *                              can re-narrate and re-persist after a burn
 *                              without pulling in the full pipeline graph.
 * @param {Function} hooks.narrate    async (resolution, packet, state, opts) => void
 * @param {Function} hooks.persist    async (resolution, state) => void
 * @param {Function} hooks.assemble   async (resolution, state, opts) => packet
 */
export function registerBurnMomentumHook({ narrate, persist, assemble }) {
  onChatMessageRender((message, root) => {
    const burn = message?.flags?.[MODULE_ID]?.burn;
    if (!burn?.canBurn) return;

    const btn = root.querySelector('[data-action="sf-burn-momentum"]');
    if (!btn) return;

    if (burn.consumed) {
      btn.disabled    = true;
      btn.textContent = `🔥 Burned (${labelForOutcome(burn.previewOutcome)})`;
      return;
    }

    btn.replaceWith(btn.cloneNode(true));
    const freshBtn = root.querySelector('[data-action="sf-burn-momentum"]');
    freshBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      freshBtn.disabled = true;
      freshBtn.textContent = "🔥 Burning…";
      try {
        await handleBurnClick(message, { narrate, persist, assemble });
      } catch (err) {
        console.error(`${MODULE_ID} | burnMomentum: click handler failed:`, err);
        freshBtn.disabled = false;
        freshBtn.textContent = `🔥 Burn Momentum (${burn.momentum} → ${labelForOutcome(burn.previewOutcome)})`;
      }
    });
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// CLICK HANDLER
// ─────────────────────────────────────────────────────────────────────────────

async function handleBurnClick(message, { narrate, persist, assemble }) {
  const flags = message?.flags?.[MODULE_ID] ?? {};
  const burn  = flags.burn;
  if (!burn?.canBurn || burn.consumed) return;

  const actor = resolveActor(burn.actorId);
  if (!actor) {
    console.warn(`${MODULE_ID} | burnMomentum: no actor available to burn against`);
    return;
  }

  const burnResult = applyMomentumBurn(
    burn.momentum, burn.challengeDice, burn.markedImpactCount,
  );
  const newConsequences = mapConsequences(burn.moveId, burnResult.outcome, burnResult.isMatch);

  await applyBurnMeterDeltas({
    actor,
    burnState: burn,
    newMomentumReset: burnResult.newMomentum,
    newConsequences,
  });

  // Mark the card as consumed so the button disables on re-render and so
  // the renderChatMessage re-runs cannot fire a second burn.
  await message.update({
    [`flags.${MODULE_ID}.burn.consumed`]: true,
    content: buildBurnedCardContent(message.content, burnResult, newConsequences),
  }).catch(err => console.warn(`${MODULE_ID} | burnMomentum: message.update failed:`, err));

  // Re-narrate on the upgraded outcome. Best-effort — if the campaign has
  // no API key configured or the narrator is otherwise disabled, the move
  // card is still correctly updated above.
  await renarrate({ burn, burnResult, newConsequences, narrate, persist, assemble })
    .catch(err => console.warn(`${MODULE_ID} | burnMomentum: re-narration failed:`, err));
}

async function applyBurnMeterDeltas({ actor, burnState, newMomentumReset, newConsequences }) {
  const applied = !!burnState.originalApplied;
  const orig    = burnState.originalConsequences ?? {};

  const currentMomentum = readMomentum(actor);
  const targetMomentum  = newMomentumReset + Number(newConsequences.momentumChange ?? 0);
  const momentumDelta   = targetMomentum - currentMomentum;

  // For health/spirit/supply: if the original consequences were already
  // applied to the actor, the diff must reverse them and apply the new
  // ones; otherwise just apply the new ones.
  const dimensionDelta = (k) => {
    const newVal = Number(newConsequences[k] ?? 0);
    const oldVal = Number(orig[k] ?? 0);
    return applied ? (newVal - oldVal) : newVal;
  };

  await applyMeterChanges(actor, {
    momentum: momentumDelta,
    health:   dimensionDelta("healthChange"),
    spirit:   dimensionDelta("spiritChange"),
    supply:   dimensionDelta("supplyChange"),
  });
}

async function renarrate({ burn, burnResult, newConsequences, narrate, persist, assemble }) {
  if (typeof narrate !== "function" || typeof assemble !== "function") return;

  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  const synthResolution = {
    _id:             foundry.utils.randomID(),
    moveId:          burn.moveId,
    moveName:        toDisplayName(burn.moveId),
    statUsed:        null,
    statValue:       0,
    adds:            0,
    actionDie:       0,
    actionScore:     burn.momentum,
    challengeDice:   burn.challengeDice,
    isMatch:         burnResult.isMatch,
    outcome:         burnResult.outcome,
    outcomeLabel:    labelForOutcome(burnResult.outcome) + (burnResult.isMatch ? " ✦ Match" : ""),
    isProgressMove:  false,
    progressScore:   0,
    momentumBurned:  true,
    momentumBurnedFrom: burn.momentum,
    consequences:    newConsequences,
    oracleSeeds:     null,
    playerNarration: "[Player burned momentum to upgrade the outcome]",
    inputMethod:     "burn",
    sessionId:       campaignState.currentSessionId ?? "",
  };

  const packet = await assemble(synthResolution, campaignState, {}).catch(err => {
    console.warn(`${MODULE_ID} | burnMomentum: assembleContextPacket failed:`, err);
    return null;
  });
  if (!packet) return;

  await narrate(synthResolution, packet, campaignState, {});
  if (typeof persist === "function" && game.user?.isGM) {
    // Don't double-persist meters — applyBurnMeterDeltas above already did
    // that. Just append the upgraded resolution to the session log via a
    // minimal resolution that carries no consequences.
    const logOnly = { ...synthResolution, consequences: emptyConsequences() };
    await persist(logOnly, campaignState).catch(err =>
      console.warn(`${MODULE_ID} | burnMomentum: session-log persist failed:`, err));
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// CARD CONTENT REWRITE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rewrite the existing move-result card's HTML to reflect the burned
 * outcome. Strikes through the original outcome label and appends the
 * burned outcome + new consequence text.
 */
function buildBurnedCardContent(originalContent, burnResult, newConsequences) {
  const html = String(originalContent ?? "");
  const newLabel = labelForOutcome(burnResult.outcome) + (burnResult.isMatch ? " ✦ Match" : "");
  // Strike the original outcome div and append a burned-result block.
  const strikethrough = html.replace(
    /<div class="sf-move-outcome">([\s\S]*?)<\/div>/,
    (_full, inner) => `<div class="sf-move-outcome sf-move-outcome--burned"><s>${inner}</s></div>`,
  );
  const burnNote = (
    `<div class="sf-move-burn-result">` +
      `<div class="sf-move-outcome sf-move-outcome--upgraded">🔥 Burned → ${newLabel}</div>` +
      (newConsequences.otherEffect
        ? `<div class="sf-move-effect">${newConsequences.otherEffect}</div>`
        : "") +
    `</div>`
  );
  return strikethrough.replace("</div>", `${burnNote}</div>`);
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function readMomentum(actor) {
  const m = actor?.system?.momentum;
  if (m == null) return 0;
  if (typeof m === "number") return m;
  return Number(m.value ?? 0);
}

function countImpacts(actor) {
  const d = actor?.system?.debility ?? {};
  return Object.values(d).filter(Boolean).length;
}

function resolveActor(actorId) {
  if (actorId) {
    const a = game.actors?.get?.(actorId);
    if (a) return a;
  }
  return getActor(actorId) ?? getPlayerActors()[0] ?? null;
}

function toDisplayName(moveId) {
  return String(moveId ?? "")
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function emptyConsequences() {
  return {
    momentumChange:      0,
    healthChange:        0,
    spiritChange:        0,
    supplyChange:        0,
    progressMarked:      0,
    progressTrackId:     null,
    otherEffect:         "",
    sufferMoveTriggered: null,
  };
}
