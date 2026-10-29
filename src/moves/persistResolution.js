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
//   5. Persist the updated campaign state to game.settings — merged onto a
//      fresh read of the store, so world writes that landed while the move
//      resolved (X-Card, Take a Break, relays…) are not reverted by the
//      pipeline's stale working copy (mergeWithLatestState)
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
import { mergeSceneLedgers } from '../factContinuity/sceneLifecycle.js';
import { ENTITY_ID_LISTS, unionIdList } from '../entities/registry.js';

const MODULE_ID  = 'starforged-companion';

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a fully resolved move to campaign state and the active character Actor.
 *
 * @param {Object} resolution    — MoveResolutionSchema from resolver.js
 * @param {Object} campaignState — CampaignStateSchema from game.settings
 * @param {string|null} [speakerActorId] — the roller
 * @param {Object} [targets] — what the move was made against, carried onto its
 *   suffer-choice card for the choices that change it (issue #309): the
 *   vehicle (`vehicleActorId`, Withstand Damage's integrity), the
 *   companion (`companionItemId`, Companion Takes a Hit's health) and the
 *   fight (`combatTrackId`, Gain Ground's "mark progress")
 * @returns {Promise<{ actor: Actor|null, campaignState: Object }>}
 */
export async function persistResolution(resolution, campaignState, speakerActorId = null, targets = {}) {
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
      await resolveSufferPrompt(resolution, actor, targets);
    }
  }

  // 1 + 5. Persist campaign state. `campaignState` is the pipeline's working
  // copy, read before the confirm dialog and the narrator call — seconds or
  // minutes ago. Writing it back wholesale reverted every world write that
  // landed meanwhile (a relayed X-Card, Take a Break, Set a Flag, Private
  // Lines, `!bond` ticks, `!truth` corrections, oracle memory, clocks…).
  // Re-read the store right before the write (no await in between) and merge
  // — see mergeWithLatestState for the per-field policy. The session-log
  // append goes onto the merged object so it lands in the live session.
  const updated = mergeWithLatestState(
    foundry.utils.deepClone(campaignState ?? {}),
    game.settings.get(MODULE_ID, 'campaignState'),
  );
  updated.updatedAt = new Date().toISOString();
  appendToSessionLog(resolution, updated);
  await game.settings.set(MODULE_ID, 'campaignState', updated);

  return { actor, campaignState: updated };
}


// ─────────────────────────────────────────────────────────────────────────────
// Stale-snapshot merge (review finding #16)
// ─────────────────────────────────────────────────────────────────────────────
//
// Field policy for the write-back. The working copy has no baseline, so a
// field is classified by who writes it:
//
//   STORE_OWNED_FIELDS — the pipeline never changes these on its working copy
//     (anything it does change there is written straight to the store), so the
//     store's latest value always wins. Writers:
//       xCardActive                 safety.js suppressScene / clearXCard (`!x`, X-Card relay)
//       xCardPlays                  safety.js suppressScene — the play count the narrator's
//                                   in-flight check compares (issue #306 R01)
//       safety                      settingsPanel safety sync + "safety.syncPrivateLines" relay
//       safetyFlags                 sessionDialogs applySafetyFlag ("safety.setFlag" relay)
//       nextMoveAdd                 sessionDialogs applyTakeBreak; the pipeline consumes it
//                                   on the store via clearPersistedNextMoveAdd
//       questFocus, connectionFocus, sessionFocus   Begin / End a Session relays
//       sessionActive, sessionActiveStartedAt   session/lifecycle.js (Begin / End relays)
//       sessionStartedId            Begin a Session relay (start effects once per session)
//       currentSessionId, sessionNumber, lastSessionTimestamp,
//       sessionEndedId, previousSessionSummary   session/lifecycle.js session-id lifecycle
//                                   (world load, Begin / End relays, the chat-activity stamp)
//       customOracles               oracles/customOracles.js
//       recentOracles               oracles/oracleMemory.js capture hook
//       sessionRetractions          sceneLifecycle.js endScene (persists it with
//                                   the scene fields, so the store has it)
//       clocks                      clocks.js panel / `!clock` / Pay-the-Price clock relay
//                                   (incl. Face Defeat's PtP inside this pipeline)
//       pacing                      pacing/router.js (`!pace`, `!roll`) — the pipeline reads
//                                   pacing from its separate pre-lock snapshot
//       campaignRecapCache          narrator getCampaignRecap (store-only write)
//       dismissedEntities           entity panel / extractor dismiss
//       pendingMove                 the concurrency lock, claimed and released on the store
//       activeSectorId              `!sector`
//       incitingIncident            session/incitingIncident.js
//       worldTruths, worldTruthsSet, worldTruthsJournalId   truths flows
//
//   ENTITY_ID_LISTS (entities/registry.js) — both sides append (the
//     narrator's auto-created connections land on the working copy and the
//     store; a GM confirming an entity draft card writes the store): ordered
//     union, store first.
//   artAssetIds — the art index (asset id → journal entry name), a map both
//     sides add to (a portrait stored during the move): every entry kept.
//   sessionLogs — the store's logs; this resolution's entry is appended after.
//   sessionSummary — whichever record has the newer updatedAt.
//   legacyTracks — both sides add ticks (pipeline addLegacyTicks; `!bond`, the
//     native-sheet vow hook): per track the higher tick count, `cleared` if
//     either is. Ticks only ever increase, so no writer's ticks are reverted;
//     two simultaneous adds to the SAME track keep the larger one only.
//   Scene ledgers (currentSceneId, sceneTruths, sceneState, sceneFrame,
//     spotlight) — if the store is on a different scene (a `!scene`, End a
//     Session or other lifecycle write landed mid-pipeline) the store's scene
//     wins wholesale. Same scene: sceneTruths is unioned by id (the store's
//     entries, a retraction on either side sticks, the pipeline's new truths
//     appended); sceneState / sceneFrame / spotlight keep the working copy
//     (the narrator sidecar rewrites them there; their supersede / delete
//     semantics cannot be merged without a baseline).
//   Every other field keeps the working copy — the pipeline writes it there
//   (currentLocationId/Type on arrival, sectors on a site reveal, …).

const STORE_OWNED_FIELDS = Object.freeze([
  'xCardActive',
  'xCardPlays',
  'safety',
  'safetyFlags',
  'nextMoveAdd',
  'questFocus',
  'connectionFocus',
  'sessionFocus',
  'sessionActive',
  'sessionActiveStartedAt',
  'sessionStartedId',
  'currentSessionId',
  'sessionNumber',
  'lastSessionTimestamp',
  'sessionEndedId',
  'previousSessionSummary',
  'customOracles',
  'recentOracles',
  'sessionRetractions',
  'clocks',
  'pacing',
  'campaignRecapCache',
  'dismissedEntities',
  'pendingMove',
  'activeSectorId',
  'incitingIncident',
  'worldTruths',
  'worldTruthsSet',
  'worldTruthsJournalId',
]);

/**
 * Merge the latest stored campaignState into the pipeline's (already cloned)
 * working copy, per the field policy above. Mutates and returns `working`.
 *
 * @param {Object} working  deep clone of the pipeline's campaignState
 * @param {Object|null|undefined} latestRaw  game.settings.get(…, 'campaignState')
 * @returns {Object}
 */
function mergeWithLatestState(working, latestRaw) {
  if (!latestRaw || typeof latestRaw !== 'object') return working;
  const latest = foundry.utils.deepClone(latestRaw);

  for (const key of STORE_OWNED_FIELDS) {
    if (key in latest) working[key] = latest[key];
    else delete working[key];
  }

  for (const key of ENTITY_ID_LISTS) {
    const merged = unionIdList(latest[key], working[key]);
    if (merged) working[key] = merged;
  }

  // A map, not a list: listed with the id lists, it was never merged and the
  // working copy's index dropped entries stored meanwhile (issue #300 F14).
  if (latest.artAssetIds || working.artAssetIds) {
    working.artAssetIds = { ...(working.artAssetIds ?? {}), ...(latest.artAssetIds ?? {}) };
  }

  if (latest.sessionLogs && typeof latest.sessionLogs === 'object') {
    working.sessionLogs = latest.sessionLogs;
  }

  if (isNewerRecord(latest.sessionSummary, working.sessionSummary)) {
    working.sessionSummary = latest.sessionSummary;
  }

  const legacy = mergeLegacyTracks(latest.legacyTracks, working.legacyTracks);
  if (legacy) working.legacyTracks = legacy;

  if (!mergeSceneLedgers(working, latest)) {
    console.debug(`${MODULE_ID} | persistResolution: the scene changed while the move resolved — keeping the stored scene ledgers.`);
  }
  return working;
}

function isNewerRecord(storeRec, workingRec) {
  if (!storeRec) return false;
  if (!workingRec) return true;
  return String(storeRec.updatedAt ?? '') > String(workingRec.updatedAt ?? '');
}

function mergeLegacyTracks(store, working) {
  const s = (store   && typeof store   === 'object') ? store   : null;
  const w = (working && typeof working === 'object') ? working : null;
  if (!s && !w) return null;
  const out = {};
  for (const key of new Set([...Object.keys(s ?? {}), ...Object.keys(w ?? {})])) {
    const a = s?.[key];
    const b = w?.[key];
    if (!a || !b) { out[key] = a ?? b; continue; }
    out[key] = {
      ...a,
      ...b,
      ticks:   Math.max(Number(a.ticks ?? 0), Number(b.ticks ?? 0)),
      cleared: !!(a.cleared || b.cleared),
    };
  }
  return out;
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
 * @param {Object} [targets] — persistResolution's: what the choices change
 */
async function resolveSufferPrompt(resolution, actor, targets = {}) {
  const prompt = resolution.consequences.sufferPrompt;
  if (!prompt) return;

  // Map the triggering move's outcome class onto executor opts so the
  // mortal-wound / desolation / vehicle-damage d100 fires only on
  // miss-at-0. The executor handles the at-0 check itself. The move's
  // targets ride along: a choice changes the vehicle (or fight, or
  // companion) the move was about, resolved when it was rolled — not
  // whichever one a lookup finds when the card is clicked (issue #309).
  const isMiss = resolution.outcome === 'miss';
  const isMissWithMatch = isMiss && !!resolution.isMatch;
  const executorOpts = { isMiss, isMissWithMatch, ...targets };

  // Non-blocking: post a choice card the player taps, instead of awaiting a
  // modal dialog INSIDE the move-concurrency lock. A dialog that failed to
  // render or never settled wedged `pendingMove` and locked out every later
  // move (playtest lock-up). The card applies its choice on click via the same
  // resolveSufferSelection + runSufferResolution path the dialog used — meters
  // stay correct and nothing is auto-applied.
  // The card carries its resolution: a Burn Momentum or Improve Result that
  // replaces this outcome retires it and offers the new outcome's choice
  // instead (resultUpgrade.js — issue #311 P03).
  await postSufferChoiceCard({
    sufferPrompt: prompt,
    actor,
    executorOpts,
    moveId: resolution.moveId,
    resolutionId: resolution._id ?? null,
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
