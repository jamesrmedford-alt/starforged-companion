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
 *   - Non-progress moves only.
 *   - The cost is the ability's per-ability clock (AssetAbilityField
 *     hasClock/clockTicks/clockMax). Abilities whose improvement carries no
 *     clock still upgrade the result; the card notes any non-clock cost in
 *     text for the player to apply.
 *   - The strong hit's other effects — the fight's progress and position, the
 *     expedition's progress, a legacy mark, the companion's health, an
 *     arrival, a lost fight's payoff — run through the pipeline's own applier
 *     (index.js applyOutcomeEffects, injected as `applyEffects`) for what the
 *     strong hit adds over the recorded original (UPGRADE-PIPELINE-EFFECTS),
 *     as for a burn; a weak hit that pays the price too keeps the miss's.
 *
 * Multiplayer: like Burn Momentum, the click relays to the canonical GM
 * (requestGmAction("move.improveResult", { messageId })) because a player
 * cannot update the GM-authored move card's `consumed` flag; the GM-side
 * applyImproveFromRelay is the authoritative idempotency check.
 *
 * Like the burn, the button opens only once the pipeline has recorded the
 * original outcome (`originalApplied`), and an improvement and a burn are
 * exclusive on one card (issue #300 F02 — see burnMomentum.js).
 */

import { mapConsequences, OUTCOME_RANK } from "./resolver.js";
import { getActor }                     from "../character/actorBridge.js";
import { onChatMessageRender }           from "../system/chatHooks.js";
import {
  revertPayThePrice,
  claimUpgradeCard,
  applyUpgradeStep,
  reportUpgradeFailures,
  reconcileChoices,
  consequenceChosen,
  applyUpgradedOutcomeEffects,
  renarrateUpgrade,
  effectsNoteHtml,
} from "./resultUpgrade.js";
import {
  supersedeOriginalNarration,
  relayCardButtonClick,
  requesterOwnsActor,
  claimResultUpgrade,
  releaseResultUpgrade,
  resultUpgradeBlocker,
  UPGRADE_PENDING_TITLE,
  UPGRADE_CHOSEN_TITLE,
  UPGRADE_REFUSALS,
} from "./burnMomentum.js";

const MODULE_ID = "starforged-companion";

// narrate / persist / applyEffects injected by registerImproveResultHook
// (src/index.js), kept at module scope for the GM-side relay handler.
let _deps = { narrate: null, persist: null, applyEffects: null };


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
 * @param {Object|null} [ptpReversals]     — what the miss's Pay the Price did
 *   (the pipeline's, as for buildBurnState): the improvement undoes it
 * @param {Object|null} [targets]          — the move's vehicle, companion and
 *   fight, for the strong hit's choice card and effects (as for buildBurnState)
 * @param {Object|null} [move]             — the move's target, its id and the
 *   interpreter's ranks, for the strong hit's effects (as for buildBurnState)
 * @returns {Object|null}
 */
export function buildImproveState(resolution, applicableAbilities, actor, ptpReversals = null, targets = null, move = null) {
  if (!actor || !resolution) return null;
  // Only an action roll's result can be improved: not a progress roll's, and
  // not a move that rolled nothing (issue #316 T05).
  if (resolution.isProgressMove || resolution.rollKind === "none") return null;
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
    ptpReversals:         ptpReversals ?? null,   // the superseded miss's Pay the Price, undone on improve
    targets:              targets ?? null,        // for the strong hit's choice card and effects
    move:                 move ?? null,           // the move's target and ranks, for its effects
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
 * @param {Function} hooks.narrate        async (resolution, state, { speakerActorId }) => void
 * @param {Function} hooks.persist        async (resolution, state, speakerActorId) => void
 * @param {Function} [hooks.applyEffects] the strong hit's other effects — index.js
 *   applyUpgradedOutcomeEffects (as for registerBurnMomentumHook)
 */
export function registerImproveResultHook({ narrate, persist, applyEffects } = {}) {
  _deps = { narrate: narrate ?? null, persist: persist ?? null, applyEffects: applyEffects ?? null };

  onChatMessageRender((message, root) => {
    const flags   = message?.flags?.[MODULE_ID] ?? {};
    const improve = flags.improve;
    if (!improve?.canImprove) return;

    const btn = root.querySelector('[data-action="sf-improve-result"]');
    if (!btn) return;

    if (improve.consumed) {
      btn.disabled    = true;
      btn.textContent = "✦ Improved to Strong Hit";
      return;
    }
    const blocker = resultUpgradeBlocker(improve, flags.burn);
    if (blocker === "already-upgraded") {
      btn.disabled    = true;
      btn.textContent = "✦ Improve Result — momentum was already burned";
      return;
    }
    if (blocker === "choice-made") {
      btn.disabled    = true;
      btn.textContent = "✦ Improve Result — the consequence was already chosen";
      btn.title       = UPGRADE_CHOSEN_TITLE;
      return;
    }
    if (blocker === "original-pending") {
      // Re-rendered with the button live once the pipeline stamps the card.
      btn.disabled = true;
      btn.title    = UPGRADE_PENDING_TITLE;
      return;
    }

    btn.replaceWith(btn.cloneNode(true));
    const freshBtn = root.querySelector('[data-action="sf-improve-result"]');
    freshBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      freshBtn.disabled = true;
      freshBtn.textContent = "✦ Improving…";
      await relayCardButtonClick({
        kind:       "move.improveResult",
        messageId:  message?.id,
        isConsumed: () => {
          const live = message?.id ? globalThis.game?.messages?.get?.(message.id) : null;
          return !!(live ?? message)?.flags?.[MODULE_ID]?.improve?.consumed;
        },
        restore:    () => {
          freshBtn.disabled    = false;
          freshBtn.textContent = improveButtonLabel(improve);
        },
      });
    });
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// RELAY HANDLER (canonical GM)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * gmRelay handler for "move.improveResult" — runs on the canonical GM.
 *
 * Loads the move card, re-checks `consumed` (and the in-flight set) as the
 * authoritative idempotency check, refuses a requester who neither is a GM
 * nor owns the improving actor, then applies the improvement.
 *
 * @param {{ messageId?: string }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applyImproveFromRelay(payload = {}, ctx = {}) {
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  if (!message) {
    console.warn(`${MODULE_ID} | improveResult: move card ${messageId ?? "?"} not found — not applied.`);
    return { applied: false, reason: "no-message" };
  }
  const flags   = message.flags?.[MODULE_ID] ?? {};
  const improve = flags.improve;
  if (!improve?.canImprove) {
    console.warn(`${MODULE_ID} | improveResult: card ${messageId} offers no improvement — ignoring.`);
    return { applied: false, reason: "not-improvable" };
  }
  if (improve.consumed) {
    console.debug(`${MODULE_ID} | improveResult: card ${messageId} already improved — ignoring repeat click.`);
    return { applied: false, reason: "already-consumed" };
  }
  const blocker = resultUpgradeBlocker(improve, flags.burn)
    ?? (consequenceChosen(improve.resolutionId) ? "choice-made" : null);
  if (blocker) {
    console.warn(`${MODULE_ID} | improveResult: card ${messageId} — ${UPGRADE_REFUSALS[blocker] ?? blocker}; improvement refused.`);
    return { applied: false, reason: blocker };
  }
  const actor = getActor(improve.actorId);
  if (actor && !requesterOwnsActor(actor, ctx)) {
    console.warn(`${MODULE_ID} | improveResult: user ${ctx?.requesterId ?? "?"} does not own ${actor.name} — improvement refused.`);
    return { applied: false, reason: "not-owner" };
  }

  if (!claimResultUpgrade(messageId)) {
    console.debug(`${MODULE_ID} | improveResult: card ${messageId} is already being upgraded — ignoring repeat click.`);
    return { applied: false, reason: "already-consumed" };
  }
  try {
    return await handleImproveClick(message, _deps);
  } finally {
    releaseResultUpgrade(messageId);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// CLICK HANDLER (runs on the canonical GM via applyImproveFromRelay)
// ─────────────────────────────────────────────────────────────────────────────

async function handleImproveClick(message, { narrate, persist, applyEffects }) {
  const improve = message?.flags?.[MODULE_ID]?.improve;
  if (!improve?.canImprove || improve.consumed) return { applied: false, reason: "already-consumed" };

  const actor = getActor(improve.actorId);
  if (!actor) {
    console.warn(`${MODULE_ID} | improveResult: no actor to improve against`);
    return { applied: false, reason: "no-actor" };
  }

  // Guard: never "improve" to an outcome that isn't actually better.
  if (OUTCOME_RANK[improve.improveTo] <= OUTCOME_RANK[improve.originalOutcome]) {
    console.warn(`${MODULE_ID} | improveResult: ${improve.originalOutcome} → ${improve.improveTo} is not an improvement; ignoring`);
    return { applied: false, reason: "no-improvement" };
  }

  const newConsequences = mapConsequences(improve.moveId, improve.improveTo, improve.isMatch);

  // Claimed before any effect (issue #311 P06): the consumed stamp followed
  // the benefit and the cost, its refusal only warned, so a fresh render of the
  // card offered the improvement again and a second press applied it again.
  // Refused, nothing is applied and the button re-arms.
  if (!(await claimUpgradeCard(message, "improve"))) return { applied: false, reason: "claim-refused" };

  // Each write after the claim: one the world refuses goes to the GMs, with a
  // Retry (resultUpgrade.js applyUpgradeStep).
  const failures = [];
  await applyUpgradeStep({ effect: "meters", pcId: actor.id, changes: improveMeterChanges(improve, newConsequences) }, failures);

  // The strong hit replaces a miss whose Pay the Price already landed: rewind
  // its clocks and refund its meter loss, as a burn does — the improvement
  // kept them on top of its own cost (issue #311 P05). (An improvement always
  // reaches a strong hit, which pays no price; the check mirrors the burn's.)
  const priceStands = !!improve.ptpReversals && newConsequences.routePayThePrice === true;
  if (improve.ptpReversals && !priceStands) {
    await revertPayThePrice(improve.ptpReversals, actor, { kind: "improve", failures }).catch(err =>
      console.warn(`${MODULE_ID} | improveResult: PtP reversal failed:`, err));
  }

  // The original outcome's pending choice is retired and the strong hit's
  // offered once (issue #311 P03).
  await reconcileChoices({
    resolutionId: improve.resolutionId, kind: "improve", actor, moveId: improve.moveId,
    sufferPrompt: newConsequences.sufferPrompt ?? null, targets: improve.targets ?? {}, failures,
  }).catch(err => console.warn(`${MODULE_ID} | improveResult: choice reconciliation failed:`, err));

  // The strong hit's other effects, for what it adds over the recorded
  // original, through the pipeline's own applier (UPGRADE-PIPELINE-EFFECTS).
  // Its working copy of the campaign is the one the re-narration reads and
  // logs against — a copy, never the cached setting (rules/foundry-api.md).
  const campaignState = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
  const upgraded = buildImprovedResolution({ improve, newConsequences, campaignState });
  const effects  = await applyUpgradedOutcomeEffects({ applyEffects, resolution: upgraded, state: improve, actor, campaignState, kind: "improve" });

  // Pay the cost: advance the ability's own clock (Fugitive's 4-segment clock).
  const clockNote = await advanceAbilityClock(actor, improve);

  await message.update({ content: buildImprovedCardContent(message.content, clockNote, effectsNoteHtml({ ...effects, priceStands })) })
    .catch(err => console.warn(`${MODULE_ID} | improveResult: card content update failed:`, err));
  await reportUpgradeFailures(actor, failures);

  // The pre-improvement prose is now stale — strike it through, keep history.
  await supersedeOriginalNarration(improve).catch(err =>
    console.warn(`${MODULE_ID} | improveResult: superseding original narration failed:`, err));

  // The improving PC is the card's actor, not the first PC (credit the roller).
  await renarrateUpgrade({ resolution: upgraded, campaignState, speakerActorId: improve.actorId ?? null, narrate, persist, kind: "improve" })
    .catch(err => console.warn(`${MODULE_ID} | improveResult: re-narration failed:`, err));

  return { applied: true };
}

/**
 * The meter changes an improvement makes: the recorded original outcome's
 * consequences swapped for the strong hit's (an improvement is accepted only
 * once the original is on the sheet). No momentum reset — unlike burn, the
 * dice don't change; only the outcome does.
 */
function improveMeterChanges(improve, newConsequences) {
  const orig  = improve.originalConsequences ?? {};
  const delta = (k) => Number(newConsequences[k] ?? 0) - Number(orig[k] ?? 0);
  return {
    momentum: delta("momentumChange"),
    health:   delta("healthChange"),
    spirit:   delta("spiritChange"),
    supply:   delta("supplyChange"),
  };
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

/**
 * Append a strong-hit + cost banner to the move-result card content, and the
 * note on the strong hit's other effects (`effectsNote`, HTML from
 * effectsNoteHtml).
 */
function buildImprovedCardContent(originalContent, clockNote, effectsNote = "") {
  const note = clockNote ? ` ${clockNote}` : "";
  const banner =
    `<div class="sf-improve-applied"><em>✦ Result improved to a strong hit.${note}</em>${effectsNote}</div>`;
  return `${String(originalContent ?? "")}${banner}`;
}

/**
 * The improved outcome as a resolution — what the effects applier, the
 * narrator and the session log take. No dice: the result changed, not the
 * roll.
 */
function buildImprovedResolution({ improve, newConsequences, campaignState }) {
  return {
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
}

function toDisplayName(moveId) {
  return String(moveId ?? "")
    .split("_")
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
