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
//   2. Apply meter changes to the active Actor via actorBridge.applyMeterChanges
//   3. Apply impact (debility) state changes from suffer moves via actorBridge.setDebility
//   4. Mark progress on the resolution's target vow/track if any
//   5. Award legacy XP if a legacy track box is completed
//   6. Persist the updated campaign state to game.settings
//
// GM-only gate: actor.update() writes propagate from the GM client to all others.
// For multiplayer, player-triggered persistence still requires the socket relay
// described in PERSIST-001 (the actor writes go through the same relay).

import {
  getActor,
  getPlayerActors,
  applyMeterChanges,
  setDebility,
  awardXP,
  markVowProgress,
} from '../character/actorBridge.js';
import { postSufferChoiceCard } from './sufferCard.js';
import { RANK_TICKS } from '../schemas.js';

const MODULE_ID  = 'starforged-companion';
const TRACK_FLAG = 'progressTrack';

/**
 * Multiply a "number of mark-progress operations" by the track's per-rank
 * ticks-per-mark. Falls back to formidable (4 ticks) when the rank is
 * unknown — same default the progress panel uses.
 */
function marksToTicks(marks, rank) {
  return marks * (RANK_TICKS[rank] ?? 4);
}

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
export async function persistResolution(resolution, campaignState) {
  const updated = foundry.utils.deepClone(campaignState);
  updated.updatedAt = new Date().toISOString();

  // 1. Append to session move log
  appendToSessionLog(resolution, updated);

  // 2–5: Apply mechanical consequences to the active Actor.
  //
  // `campaignState.activeCharacterId` is set by no path in the current
  // codebase (the named world setting is registered but never written), so
  // in solo-GM play this would always fall through to game.user.character,
  // which is null when no token is assigned — and the entire meter-apply /
  // debility / progress-mark block would silently no-op. Same shape of
  // defect as RECAP-003 (v1.2.12): the dominant solo-GM path was reading
  // a field that's never populated. Fall back to the first player-owned
  // character (or the first character-typed Actor in solo-GM mode where
  // hasPlayerOwner is uniformly false).
  let actor = getActor(updated.activeCharacterId ?? null);
  if (!actor) {
    actor = getPlayerActors()[0] ?? null;
  }

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

    // 4 & 5: Progress track marking + legacy XP
    if (resolution.consequences.progressMarked > 0 && resolution.consequences.progressTrackId) {
      await markProgress(
        actor,
        resolution.consequences.progressTrackId,
        resolution.consequences.progressMarked,
        updated
      );
    }

    // 6. Combat position — write to the bound combat track if any.
    if (resolution.consequences.combatPosition && resolution.consequences.progressTrackId) {
      await applyCombatPosition(
        resolution.consequences.progressTrackId,
        resolution.consequences.combatPosition,
        updated,
      );
    }

    // 7. Suffer prompt (F16 Phase D) — blocking dialog that resolves the
    //    rulebook-mandated player choice into one or more executor calls.
    //    Per Q1 we await the selection; per Q4 GM-only writes apply
    //    inside the executors. The dialog is no-op-safe when
    //    ApplicationV2 isn't available (test env / pre-init).
    if (resolution.consequences.sufferPrompt) {
      await resolveSufferPrompt(resolution, actor);
    }
  }

  // 6. Persist campaign state
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


// ─────────────────────────────────────────────────────────────────────────────
// 4 & 5. Progress track marking + legacy XP
// ─────────────────────────────────────────────────────────────────────────────

const LEGACY_KEYS = ['quests', 'bonds', 'discoveries'];
const MAX_TICKS   = 40;

async function markProgress(actor, trackId, marks, campaignState) {
  // Legacy tracks grant XP (2 XP per box, 1 if track was previously cleared).
  // Per play kit, legacy rewards are quoted as raw ticks/boxes (e.g. "1 tick"
  // for troublesome, "3 boxes" for epic), so legacy uses `marks` as raw ticks.
  if (LEGACY_KEYS.includes(trackId)) {
    await markLegacyProgress(actor, trackId, marks, campaignState);
    return;
  }

  // Embedded vow items on the Actor. Multiply marks by the vow's rank
  // per the play kit ("mark progress per its rank").
  const vowItem = actor.items?.find(i => i.id === trackId || i.system?.trackId === trackId);
  if (vowItem) {
    const ticks = marksToTicks(marks, vowItem.system?.rank);
    await markVowProgress(actor, vowItem.id, ticks);
    return;
  }

  // Journal-based progress track (vow, expedition, connection, combat,
  // scene_challenge). Resolve the track first so we can look up its rank.
  await markProgressOnJournalTrack(trackId, marks, campaignState);
}

async function markLegacyProgress(actor, legacyKey, ticksToMark, campaignState) {
  const legacyTracks = campaignState.legacyTracks ?? {};
  const track = legacyTracks[legacyKey] ?? { ticks: 0, cleared: false };

  const boxesBefore = Math.floor(track.ticks / 4);
  track.ticks = Math.min(track.ticks + ticksToMark, MAX_TICKS);
  const boxesAfter = Math.floor(track.ticks / 4);
  const newBoxes   = boxesAfter - boxesBefore;

  if (!campaignState.legacyTracks) campaignState.legacyTracks = {};
  campaignState.legacyTracks[legacyKey] = track;

  if (newBoxes > 0) {
    const xpPerBox = track.cleared ? 1 : 2;
    await awardXP(actor, newBoxes * xpPerBox);
  }
}

/**
 * Persist combat position (in_control / bad_spot) onto a combat-type
 * progress track in the Progress Tracks journal (single JournalEntry with
 * a `tracks` array flag, matching src/ui/progressTracks.js). No-op for
 * vow / legacy / unknown track IDs.
 */
async function applyCombatPosition(trackId, position, _campaignState) {
  const journal = game.journal?.find?.(j => j.name === "Starforged Progress Tracks");
  if (!journal) return;

  const tracks = journal.getFlag(MODULE_ID, "tracks") ?? [];
  const track  = tracks.find(t => t.id === trackId);
  if (!track || track.type !== "combat") return;

  track.combatState = position;
  await journal.setFlag(MODULE_ID, "tracks", tracks);
}

async function markProgressOnJournalTrack(trackId, marks, campaignState) {
  const journalId = (campaignState.progressTrackIds ?? []).find(jid => {
    const entry = game.journal.get(jid);
    const page  = entry?.pages?.contents?.[0];
    const track = page?.flags?.[MODULE_ID]?.[TRACK_FLAG];
    return track?._id === trackId;
  });

  if (!journalId) {
    console.warn(`${MODULE_ID} | persistResolution: progress track journal not found for id: ${trackId}`);
    return;
  }

  const entry = game.journal.get(journalId);
  const page  = entry?.pages?.contents?.[0];
  if (!page) return;

  const track     = foundry.utils.deepClone(page.flags[MODULE_ID][TRACK_FLAG]);
  const ticks     = marksToTicks(marks, track.rank);
  track.ticks     = Math.min(track.ticks + ticks, MAX_TICKS);
  track.updatedAt = new Date().toISOString();

  await page.setFlag(MODULE_ID, TRACK_FLAG, track);
}
