// src/moves/persistResolution.js
// Persists a resolved move to campaign state and the active Ironsworn Actor.
//
// Replaces the previous journal-flag based character storage with direct Actor
// writes via actorBridge.js. All mechanical consequences write to the Foundry
// Actor document, which propagates to all connected clients via Foundry's
// document sync.
//
// Responsibilities:
//   1. Append the move resolution to the current session's move log
//   2. Apply meter changes to the rolling player's Actor via actorBridge.applyMeterChanges
//   3. Apply impact (debility) state changes from suffer moves via actorBridge.setDebility
//   4. Post the suffer-choice card when the outcome needs a player choice
//   5. Persist the updated campaign state to game.settings
//
// Progress is NOT marked here. Vow progress (Reach a Milestone → markVowProgress),
// legacy ticks (addLegacyTicks), combat/expedition/connection tracks and combat
// position are all applied by the pipeline in src/index.js from the dedicated
// consequence flags (reachMilestone, legacyMark, combatProgress, combatPosition,
// …). The old consequences.progressTrackId / progressMarked route was never set
// by any resolver and was removed with its dead markProgress steps (2026-10).
//
// GM-only gate: actor.update() writes propagate from the GM client to all others.
// For multiplayer, player-triggered persistence still requires the socket relay
// described in PERSIST-001 (the actor writes go through the same relay).

import {
  getActor,
  getPlayerActors,
  applyMeterChanges,
  setDebility,
} from '../character/actorBridge.js';
import { postSufferChoiceCard } from './sufferCard.js';

const MODULE_ID  = 'starforged-companion';

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a fully resolved move to campaign state and the active character Actor.
 *
 * @param {Object} resolution    — MoveResolutionSchema from resolver.js
 * @param {Object} campaignState — CampaignStateSchema from game.settings
 * @returns {Promise<{ actor: Actor|null, campaignState: Object }>}
 */
export async function persistResolution(resolution, campaignState, speakerActorId = null) {
  const updated = foundry.utils.deepClone(campaignState);
  updated.updatedAt = new Date().toISOString();

  // 1. Append to session move log
  appendToSessionLog(resolution, updated);

  // 2–4: Apply mechanical consequences to the rolling player's Actor.
  //
  // Prefer `speakerActorId` — the actor whose roll this was, resolved upstream
  // by resolveSpeakerActorId and threaded in from the pipeline. The GM's client
  // runs this gated persistence on behalf of EVERY player, so attributing by a
  // GM-local default mis-credits momentum/meters to the GM's own PC in
  // multiplayer (the "GM gains everyone's momentum" playtest bug). Fall back to
  // the first player character only when no speaker was resolved (e.g. solo-GM
  // play, where getPlayerActors()[0] is the sole PC). Note: never fall back to
  // getActor(null) — that is game.user.character, i.e. the GM's own PC.
  const actor = (speakerActorId ? getActor(speakerActorId) : null)
    ?? getPlayerActors()[0]
    ?? null;

  if (actor) {
    // 2. Meter changes
    const { healthChange, spiritChange, supplyChange, momentumChange } = resolution.consequences;
    const meterChanges = {
      health:   healthChange   ?? 0,
      spirit:   spiritChange   ?? 0,
      supply:   supplyChange   ?? 0,
      momentum: momentumChange ?? 0,
    };
    await applyMeterChanges(actor, meterChanges);

    // 3. Impact (debility) state from suffer moves
    await applySufferMoveDebilities(actor, resolution.consequences, meterChanges);

    // 4. Suffer prompt (F16 Phase D) — posts the non-blocking suffer-choice
    //    card that resolves the rulebook-mandated player choice into one or
    //    more executor calls on click (see resolveSufferPrompt below).
    if (resolution.consequences.sufferPrompt) {
      await resolveSufferPrompt(resolution, actor);
    }
  }

  // 5. Persist campaign state
  await game.settings.set(MODULE_ID, 'campaignState', updated);

  return { actor, campaignState: updated };
}


// ─────────────────────────────────────────────────────────────────────────────
// 1. Session move log
// ─────────────────────────────────────────────────────────────────────────────

function appendToSessionLog(resolution, campaignState) {
  if (!campaignState.currentSessionId) return;

  if (!campaignState.sessionLogs) campaignState.sessionLogs = {};
  if (!campaignState.sessionLogs[campaignState.currentSessionId]) {
    campaignState.sessionLogs[campaignState.currentSessionId] = [];
  }

  campaignState.sessionLogs[campaignState.currentSessionId].push({
    resolutionId: resolution._id ?? foundry.utils.randomID(),
    moveId:       resolution.moveId,
    outcome:      resolution.outcome,
    timestamp:    new Date().toISOString(),
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// 3. Impact changes from suffer moves
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply automatic debility marks triggered by suffer-move outcomes.
 * Only the deterministic automatic cases (health/spirit/supply at zero
 * after taking damage) — player-choice branches are surfaced as otherEffect.
 */
/**
 * F16 Phase D entry point. Called from persistResolution when the
 * resolved consequences carry a sufferPrompt. Opens the blocking
 * SufferChoiceDialog, runs the resulting executor calls, and posts a
 * cancel card when the player closes the dialog without picking.
 *
 * The runner handles recursive prompts (lose_momentum at-min, etc.)
 * up to one nesting level — deeper recursion is rare in practice and
 * deferred to GM adjudication via the route-card affordance.
 *
 * @param {Object} resolution
 * @param {Actor} actor
 */
async function resolveSufferPrompt(resolution, actor) {
  const prompt = resolution.consequences.sufferPrompt;
  if (!prompt) return;

  // Map the triggering move's outcome class onto executor opts so the
  // mortal-wound / desolation / vehicle-damage d100 fires only on
  // miss-at-0. The executor handles the at-0 check itself.
  const isMiss = resolution.outcome === 'miss';
  const isMissWithMatch = isMiss && !!resolution.isMatch;
  const executorOpts = { isMiss, isMissWithMatch };

  // Non-blocking: post a choice card the player taps, instead of awaiting a
  // modal dialog INSIDE the move-concurrency lock. A dialog that failed to
  // render or never settled wedged `pendingMove` and locked out every later
  // move (playtest lock-up). The card applies its choice on click via the same
  // resolveSufferSelection + runSufferResolution path the dialog used — meters
  // stay correct and nothing is auto-applied.
  await postSufferChoiceCard({
    sufferPrompt: prompt,
    actor,
    executorOpts,
    moveId: resolution.moveId,
  });
}


async function applySufferMoveDebilities(actor, consequences, appliedMeters) {
  const { sufferMoveTriggered } = consequences;

  // Auto-mark unprepared if supply just hit 0
  if (appliedMeters.supply < 0) {
    const sys = actor.system ?? {};
    const currentSupply = sys.supply?.value ?? sys.supply ?? 0;
    if (currentSupply === 0) {
      await setDebility(actor, 'unprepared', true);
    }
  }

  switch (sufferMoveTriggered) {
    case 'endure_harm': {
      const health = actor.system?.health?.value ?? actor.system?.health ?? 0;
      if (health === 0 && !actor.system?.debility?.wounded) {
        await setDebility(actor, 'wounded', true);
      }
      break;
    }
    case 'endure_stress': {
      const spirit = actor.system?.spirit?.value ?? actor.system?.spirit ?? 0;
      if (spirit === 0 && !actor.system?.debility?.shaken) {
        await setDebility(actor, 'shaken', true);
      }
      break;
    }
    default:
      break;
  }
}
