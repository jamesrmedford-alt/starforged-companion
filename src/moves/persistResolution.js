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
  applyMeterChanges,
  setDebility,
  awardXP,
  markVowProgress,
} from '../character/actorBridge.js';

const MODULE_ID  = 'starforged-companion';
const TRACK_FLAG = 'progressTrack';

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

  // 2–5: Apply mechanical consequences to the active Actor
  const actorId = updated.activeCharacterId ?? null;
  const actor   = getActor(actorId);

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

async function markProgress(actor, trackId, ticksToMark, campaignState) {
  // Legacy tracks grant XP (2 XP per box, 1 if track was previously cleared)
  if (LEGACY_KEYS.includes(trackId)) {
    await markLegacyProgress(actor, trackId, ticksToMark, campaignState);
    return;
  }

  // Embedded vow items on the Actor
  const vowItem = actor.items?.find(i => i.id === trackId || i.system?.trackId === trackId);
  if (vowItem) {
    await markVowProgress(actor, vowItem.id, ticksToMark);
    return;
  }

  // Fallback: journal-based progress track (existing pipeline)
  await markProgressOnJournalTrack(trackId, ticksToMark, campaignState);
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

async function markProgressOnJournalTrack(trackId, ticksToMark, campaignState) {
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

  const track    = foundry.utils.deepClone(page.flags[MODULE_ID][TRACK_FLAG]);
  track.ticks    = Math.min(track.ticks + ticksToMark, MAX_TICKS);
  track.updatedAt = new Date().toISOString();

  await page.setFlag(MODULE_ID, TRACK_FLAG, track);
}
