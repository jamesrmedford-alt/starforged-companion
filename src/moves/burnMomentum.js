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
  OUTCOME_RANK,
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
export function buildBurnState(resolution, actor, ptpReversals = null) {
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
    resolutionId:       resolution._id ?? null,  // links to the original narration card (F13a)
    ptpReversals:       ptpReversals ?? null,     // PtP clock + suffer deltas to undo on burn
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
 * @param {Function} hooks.narrate    async (resolution, nullPacket, state, opts) => void
 * @param {Function} hooks.persist    async (resolution, state) => void
 */
export function registerBurnMomentumHook({ narrate, persist }) {
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
        await handleBurnClick(message, { narrate, persist });
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

async function handleBurnClick(message, { narrate, persist }) {
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

  // Defense-in-depth: never apply a burn that does not strictly improve the
  // outcome, even if a stale card offered one. The render-time gate
  // (canBurnMomentum in buildBurnState) should already prevent this, but a
  // momentum change between render and click could leave a worsening burn on
  // the card. Bail without touching meters or the card.
  if (OUTCOME_RANK[burnResult.outcome] <= OUTCOME_RANK[burn.originalOutcome]) {
    console.warn(`${MODULE_ID} | burnMomentum: burn would not improve ${burn.originalOutcome} → ${burnResult.outcome}; ignoring`);
    return;
  }

  const newConsequences = mapConsequences(burn.moveId, burnResult.outcome, burnResult.isMatch);

  await applyBurnMeterDeltas({
    actor,
    burnState: burn,
    newMomentumReset: burnResult.newMomentum,
    newConsequences,
  });

  // Revert Pay-the-Price side effects that fired before the burn button was
  // visible: clock advances and any suffer-route meter loss (e.g. Endure Harm
  // -1 from a PtP table roll on the original miss). Best-effort; failures are
  // warned and do not block the rest of the burn flow.
  if (burn.ptpReversals) {
    await revertPtpEffects(burn.ptpReversals, actor).catch(err =>
      console.warn(`${MODULE_ID} | burnMomentum: PtP reversal failed:`, err));
  }

  // Mark the card as consumed so the button disables on re-render and so
  // the renderChatMessage re-runs cannot fire a second burn.
  await message.update({
    [`flags.${MODULE_ID}.burn.consumed`]: true,
    content: buildBurnedCardContent(message.content, burnResult, newConsequences),
  }).catch(err => console.warn(`${MODULE_ID} | burnMomentum: message.update failed:`, err));

  // Supersede the original narration card (F13a): the burn changed the outcome,
  // so the prose describing the pre-burn result is now stale. Strike it through
  // and label it rather than delete it, so the history is preserved. The new
  // (upgraded) narration is posted below by renarrate().
  await supersedeOriginalNarration(burn).catch(err =>
    console.warn(`${MODULE_ID} | burnMomentum: superseding original narration failed:`, err));

  // Re-narrate on the upgraded outcome. Best-effort — if the campaign has
  // no API key configured or the narrator is otherwise disabled, the move
  // card is still correctly updated above.
  await renarrate({ burn, burnResult, newConsequences, narrate, persist })
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

/**
 * Revert the Pay-the-Price side effects that fired on the original miss before
 * the player clicked Burn: clock advances (tension + vow) and simple PC-meter
 * losses from the PtP table's suffer route (health/spirit/supply/momentum).
 *
 * Complex routes (withstand_damage, companion_takes_a_hit) are not reversed —
 * consistent with the existing policy of not rolling back auto-debility flips.
 *
 * Posts a brief "⏰ Burn reversal" chat card listing what was unwound.
 */
async function revertPtpEffects(ptpReversals, actor) {
  const reverted = [];

  // 1. Rewind clock advances
  const tensionIds = (ptpReversals.clocksAdvanced ?? []).filter(c => c.type === "tension" && c._id).map(c => c._id);
  const vowEntries = (ptpReversals.clocksAdvanced ?? []).filter(c => c.type === "vow" && c.actorId && c.itemId);

  if (tensionIds.length) {
    const { revertTensionClocksForBurn } = await import("../clocks/clocks.js");
    await revertTensionClocksForBurn(tensionIds);
    for (const c of ptpReversals.clocksAdvanced.filter(c => c.type === "tension" && c._id)) {
      reverted.push(`${c.name} clock rewound`);
    }
  }
  if (vowEntries.length) {
    const { revertVowClocksForBurn } = await import("../character/actorBridge.js");
    await revertVowClocksForBurn(vowEntries);
    for (const v of vowEntries) {
      reverted.push(`${v.name} clock rewound`);
    }
  }

  // 2. Refund simple PC-meter loss from PtP suffer route
  const delta = ptpReversals.sufferMeterDelta;
  if (delta?.meterKey && actor) {
    await applyMeterChanges(actor, { [delta.meterKey]: +delta.amount });
    reverted.push(`${delta.meterKey} +${delta.amount} refunded`);
  }

  if (!reverted.length) return;

  const lines = reverted.map(r => `<li>${r}</li>`).join("");
  await ChatMessage.create({
    content: `<div class="sf-clock-card"><strong>⏰ Burn reversal</strong><p>Momentum burned — the Price reverts:</p><ul>${lines}</ul></div>`,
    flags:   { [MODULE_ID]: { clockCard: true, burnReversal: true } },
  }).catch(err => console.warn(`${MODULE_ID} | burnMomentum: revert card failed:`, err));
}

async function renarrate({ burn, burnResult, newConsequences, narrate, persist }) {
  if (typeof narrate !== "function") return;

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

  // The context packet was retired (FACTION-PACKET-DEAD, 2026-07):
  // narrateResolution never read it, and the old `if (!packet) return`
  // guard silently ABORTED this re-narration when the dead assembly failed.
  await narrate(synthResolution, null, campaignState, {});
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
 * Find the narration card posted for this resolution and mark it superseded
 * (F13a). The burn changed the outcome, so the original prose no longer matches;
 * we strike it through and add a note rather than deleting it. No-op when the
 * card can't be found (e.g. narration was disabled).
 *
 * @param {Object} burn  the burn flag blob (carries resolutionId)
 */
export async function supersedeOriginalNarration(burn) {
  const resolutionId = burn?.resolutionId;
  if (!resolutionId) return;
  const messages = globalThis.game?.messages?.contents ?? [];
  const card = messages.find(m => {
    const f = m?.flags?.[MODULE_ID];
    return f?.narratorCard === true
      && f?.resolutionId === resolutionId
      && f?.burnSuperseded !== true;
  });
  if (!card) return;
  await card.update({
    [`flags.${MODULE_ID}.burnSuperseded`]: true,
    content: buildSupersededNarrationContent(card.content),
  });
}

/**
 * Wrap a narration card's prose in a struck-through, dimmed block with a
 * "superseded by momentum burn" note. Idempotent — re-applying is a no-op.
 */
export function buildSupersededNarrationContent(originalContent) {
  const html = String(originalContent ?? "");
  if (html.includes("sf-narration-superseded")) return html;
  return html.replace(
    /<div class="sf-narration-prose">([\s\S]*?)<\/div>/,
    (_full, inner) =>
      `<div class="sf-narration-prose sf-narration-superseded" style="opacity:0.55;text-decoration:line-through;"><s>${inner}</s></div>` +
      `<div class="sf-narration-superseded-note" style="opacity:0.7;font-style:italic;">Superseded — momentum was burned to upgrade this outcome. See the updated narration below.</div>`,
  );
}

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
