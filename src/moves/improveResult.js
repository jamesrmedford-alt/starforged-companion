/**
 * STARFORGED COMPANION
 * src/moves/improveResult.js — post-roll "improve the result" affordance.
 *
 * v1.7.11 playtest finding G. Some assets let the player improve a move's
 * RESULT after seeing the dice, at a cost — e.g. Fugitive: "When you make a
 * move, you may improve the result to a strong hit. If you do, fill one
 * segment of a four-segment clock." The ability scanner already surfaces such
 * abilities on the pre-roll confirm dialog, but there was no way to ACT on the
 * roll afterwards ("it was highlighted … but I couldn't adjust the result").
 *
 * This wires a post-roll button on the move-result card, modelled on the
 * Burn Momentum affordance (burnMomentum.js): on click it upgrades the
 * outcome to a strong hit, reverses/re-applies meter consequences, advances
 * the ability's own clock (the cost), supersedes the now-stale narration, and
 * re-narrates on the upgraded outcome.
 *
 * Scope (kept deliberately bounded, matching burn):
 *   - Offered only when the rolled outcome is below a strong hit (weak hit or
 *     miss) and an enabled ability on the active character offers the upgrade.
 *   - Non-progress moves only — progress-track marking isn't reversed.
 *   - The cost is the ability's per-ability clock (AssetAbilityField
 *     hasClock/clockTicks/clockMax). Abilities whose improvement carries no
 *     clock still upgrade the result; the card notes any non-clock cost in
 *     text for the player to apply.
 */

import { mapConsequences, OUTCOME_RANK } from "./resolver.js";
import { getActor, applyMeterChanges }   from "../character/actorBridge.js";
import { onChatMessageRender }           from "../system/chatHooks.js";
import { supersedeOriginalNarration }    from "./burnMomentum.js";

const MODULE_ID = "starforged-companion";


// ─────────────────────────────────────────────────────────────────────────────
// ELIGIBILITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the metadata to stash on the move-result card so the Improve button
 * knows what to do. Returns null when no result-improvement ability applies
 * or the outcome is already a strong hit.
 *
 * @param {Object} resolution             — the resolved move
 * @param {Array}  applicableAbilities     — scanForApplicableAbilities output
 * @param {Actor}  actor                    — active character
 * @returns {Object|null}
 */
export function buildImproveState(resolution, applicableAbilities, actor) {
  if (!actor || !resolution) return null;
  if (resolution.isProgressMove) return null;
  if (!Array.isArray(applicableAbilities) || !applicableAbilities.length) return null;

  // Only offer when there's room to improve (weak hit or miss → strong hit).
  if (OUTCOME_RANK[resolution.outcome] >= OUTCOME_RANK.strong_hit) return null;

  const ability = applicableAbilities.find(a => a?.resultImprovement?.improveTo === "strong_hit");
  if (!ability) return null;

  return {
    canImprove:           true,
    improveTo:            "strong_hit",
    moveId:               resolution.moveId,
    isMatch:              !!resolution.isMatch,
    originalOutcome:      resolution.outcome,
    originalConsequences: { ...(resolution.consequences ?? {}) },
    originalApplied:      false,            // flipped true once persistResolution writes
    actorId:              actor.id,
    resolutionId:         resolution._id ?? null,
    // The cost: the ability's own clock.
    assetId:              ability.assetId ?? null,
    abilityIndex:         Number.isInteger(ability.abilityIndex) ? ability.abilityIndex : null,
    assetName:            ability.assetName ?? "",
    abilityName:          ability.abilityName ?? "",
    hasClock:             !!ability.hasClock,
    clockMax:             Number(ability.clockMax ?? 4),
    consumed:             false,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// CARD RENDERING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HTML for the improve-result button row, inserted into the move-result card
 * by formatMoveResult when improve metadata is present.
 */
export function renderImproveButtonHtml(improveState) {
  if (!improveState?.canImprove) return "";
  const label = improveButtonLabel(improveState);
  return (
    `<div class="sf-improve-result-row">` +
      `<button type="button" class="sf-improve-result-btn" data-action="sf-improve-result">${label}</button>` +
    `</div>`
  );
}

function improveButtonLabel(state) {
  const asset = state.assetName ? ` (${state.assetName}` : "";
  const cost  = state.hasClock ? ` — fill 1 of ${state.clockMax}` : "";
  const close = asset ? ")" : "";
  return `✦ Improve to Strong Hit${asset}${cost}${close}`;
}


// ─────────────────────────────────────────────────────────────────────────────
// HOOK REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wire renderChatMessage so the Improve button receives a click handler.
 * Mirrors registerBurnMomentumHook — idempotent across re-renders, disables
 * after use.
 *
 * @param {Object}   hooks
 * @param {Function} hooks.narrate    async (resolution, packet, state, opts) => void
 * @param {Function} hooks.persist    async (resolution, state) => void
 * @param {Function} hooks.assemble   async (resolution, state, opts) => packet
 */
export function registerImproveResultHook({ narrate, persist, assemble }) {
  onChatMessageRender((message, root) => {
    const improve = message?.flags?.[MODULE_ID]?.improve;
    if (!improve?.canImprove) return;

    const btn = root.querySelector('[data-action="sf-improve-result"]');
    if (!btn) return;

    if (improve.consumed) {
      btn.disabled    = true;
      btn.textContent = "✦ Improved to Strong Hit";
      return;
    }

    btn.replaceWith(btn.cloneNode(true));
    const freshBtn = root.querySelector('[data-action="sf-improve-result"]');
    freshBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      freshBtn.disabled = true;
      freshBtn.textContent = "✦ Improving…";
      try {
        await handleImproveClick(message, { narrate, persist, assemble });
      } catch (err) {
        console.error(`${MODULE_ID} | improveResult: click handler failed:`, err);
        freshBtn.disabled = false;
        freshBtn.textContent = improveButtonLabel(improve);
      }
    });
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// CLICK HANDLER
// ─────────────────────────────────────────────────────────────────────────────

async function handleImproveClick(message, { narrate, persist, assemble }) {
  const improve = message?.flags?.[MODULE_ID]?.improve;
  if (!improve?.canImprove || improve.consumed) return;

  const actor = getActor(improve.actorId);
  if (!actor) {
    console.warn(`${MODULE_ID} | improveResult: no actor to improve against`);
    return;
  }

  // Guard: never "improve" to an outcome that isn't actually better.
  if (OUTCOME_RANK[improve.improveTo] <= OUTCOME_RANK[improve.originalOutcome]) {
    console.warn(`${MODULE_ID} | improveResult: ${improve.originalOutcome} → ${improve.improveTo} is not an improvement; ignoring`);
    return;
  }

  const newConsequences = mapConsequences(improve.moveId, improve.improveTo, improve.isMatch);

  await applyImproveMeterDeltas({ actor, improve, newConsequences });

  // Pay the cost: advance the ability's own clock (Fugitive's 4-segment clock).
  const clockNote = await advanceAbilityClock(actor, improve);

  await message.update({
    [`flags.${MODULE_ID}.improve.consumed`]: true,
    content: buildImprovedCardContent(message.content, clockNote),
  }).catch(err => console.warn(`${MODULE_ID} | improveResult: message.update failed:`, err));

  // The pre-improvement prose is now stale — strike it through, keep history.
  await supersedeOriginalNarration(improve).catch(err =>
    console.warn(`${MODULE_ID} | improveResult: superseding original narration failed:`, err));

  await renarrate({ improve, newConsequences, narrate, persist, assemble })
    .catch(err => console.warn(`${MODULE_ID} | improveResult: re-narration failed:`, err));
}

/**
 * Reverse the original outcome's meter consequences (if they were applied)
 * and apply the strong-hit consequences. No momentum reset — unlike burn, the
 * dice don't change; only the outcome does.
 */
async function applyImproveMeterDeltas({ actor, improve, newConsequences }) {
  const applied = !!improve.originalApplied;
  const orig    = improve.originalConsequences ?? {};
  const delta   = (k) => {
    const newVal = Number(newConsequences[k] ?? 0);
    const oldVal = Number(orig[k] ?? 0);
    return applied ? (newVal - oldVal) : newVal;
  };
  await applyMeterChanges(actor, {
    momentum: delta("momentumChange"),
    health:   delta("healthChange"),
    spirit:   delta("spiritChange"),
    supply:   delta("supplyChange"),
  });
}

/**
 * Advance the improving ability's per-ability clock by one segment (the cost).
 * Returns a short human note for the card. No-op (with a note) when the
 * ability carries no clock or can't be resolved — the result still improves.
 */
async function advanceAbilityClock(actor, improve) {
  if (!improve.hasClock) return improve.assetName ? `${improve.assetName}: apply the ability's stated cost.` : "";
  try {
    const item = actor.items?.get?.(improve.assetId);
    const abilities = item?.system?.abilities;
    const ability   = Array.isArray(abilities) ? abilities[improve.abilityIndex] : null;
    if (!item || !ability) {
      return `Advance the ${improve.assetName || "asset"} clock by 1.`;
    }
    const max  = Number(ability.clockMax ?? improve.clockMax ?? 4);
    const next = Math.min(max, Number(ability.clockTicks ?? 0) + 1);
    // Write the whole abilities array back — Foundry merges array fields by
    // replacement, so send a copy with the one ability's clockTicks bumped.
    const updated = abilities.map((a, i) => (i === improve.abilityIndex ? { ...a, clockTicks: next } : a));
    await item.update({ "system.abilities": updated });
    const filled = next >= max ? " (clock filled!)" : "";
    return `${improve.assetName || "Asset"} clock: ${next} of ${max}${filled}.`;
  } catch (err) {
    console.warn(`${MODULE_ID} | improveResult: clock advance failed:`, err?.message ?? err);
    return `Advance the ${improve.assetName || "asset"} clock by 1.`;
  }
}

/** Append a strong-hit + cost banner to the move-result card content. */
function buildImprovedCardContent(originalContent, clockNote) {
  const note = clockNote ? ` ${clockNote}` : "";
  const banner =
    `<div class="sf-improve-applied"><em>✦ Result improved to a strong hit.${note}</em></div>`;
  return `${String(originalContent ?? "")}${banner}`;
}

async function renarrate({ improve, newConsequences, narrate, persist, assemble }) {
  if (typeof narrate !== "function" || typeof assemble !== "function") return;

  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  const synthResolution = {
    _id:             foundry.utils.randomID(),
    moveId:          improve.moveId,
    moveName:        toDisplayName(improve.moveId),
    statUsed:        null,
    statValue:       0,
    adds:            0,
    actionDie:       0,
    actionScore:     0,
    challengeDice:   [],
    isMatch:         improve.isMatch,
    outcome:         improve.improveTo,
    outcomeLabel:    "Strong Hit" + (improve.isMatch ? " ✦ Match" : ""),
    isProgressMove:  false,
    progressScore:   0,
    resultImproved:  true,
    consequences:    newConsequences,
    oracleSeeds:     null,
    playerNarration: `[Player used ${improve.assetName || "an asset"} to improve the result to a strong hit]`,
    inputMethod:     "improve",
    sessionId:       campaignState.currentSessionId ?? "",
  };

  const packet = await assemble(synthResolution, campaignState, {}).catch(err => {
    console.warn(`${MODULE_ID} | improveResult: assembleContextPacket failed:`, err);
    return null;
  });
  if (!packet) return;

  await narrate(synthResolution, packet, campaignState, {});
  if (typeof persist === "function" && game.user?.isGM) {
    // Meters were already applied by applyImproveMeterDeltas — log only.
    const logOnly = { ...synthResolution, consequences: emptyConsequences() };
    await persist(logOnly, campaignState).catch(err =>
      console.warn(`${MODULE_ID} | improveResult: persist (log) failed:`, err));
  }
}

function emptyConsequences() {
  return { momentumChange: 0, healthChange: 0, spiritChange: 0, supplyChange: 0 };
}

function toDisplayName(moveId) {
  return String(moveId ?? "")
    .split("_")
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
