// src/moves/persistResolution.js
// Full implementation of persistResolution() — replaces the stub in src/index.js.
//
// Responsibilities:
//   1. Append the move resolution to the current session's move log
//   2. Load the active character from Foundry journal flags
//   3. Apply all meter changes (momentum, health, spirit, supply) with rules clamping
//   4. Apply impact state changes triggered by suffer moves
//   5. Mark progress on the resolution's target track (if any)
//   6. Trigger legacy track experience on progress marks (Earn Experience rule)
//   7. Recalculate momentumMax and momentumReset from current impact count
//   8. Save the updated character back to its journal page
//   9. Persist the updated campaign state
//
// Drop-in wiring for index.js:
//   import { persistResolution } from './moves/persistResolution.js';
//   (remove the local stub function)
//
// Output path: modules/starforged-companion/src/moves/persistResolution.js

const MODULE_ID   = 'starforged-companion';
const CHAR_FLAG   = 'character';
const TRACK_FLAG  = 'progressTrack';

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a fully resolved move to campaign state and the active character.
 *
 * @param {Object} resolution    — MoveResolutionSchema from resolver.js
 * @param {Object} campaignState — CampaignStateSchema from game.settings
 * @returns {Promise<{ character: Object|null, campaignState: Object }>}
 */
export async function persistResolution(resolution, campaignState) {
  const updated = foundry.utils.deepClone(campaignState);
  updated.updatedAt = new Date().toISOString();

  // 1. Append to session move log
  appendToSessionLog(resolution, updated);

  let character = null;

  // 2–7: Apply mechanical consequences to the active character (if one exists)
  const characterJournalId = updated.characterIds?.[0] ?? null;
  if (characterJournalId) {
    character = await loadCharacter(characterJournalId);

    if (character) {
      applyMeterChanges(resolution.consequences, character);
      applyImpactChanges(resolution.consequences, character);
      recalcMomentumLimits(character);

      // 5. Mark progress on track (if consequences specify one)
      if (resolution.consequences.progressMarked > 0 && resolution.consequences.progressTrackId) {
        await markTrackProgress(
          resolution.consequences.progressTrackId,
          resolution.consequences.progressMarked,
          character,
          updated
        );
      }

      // 8. Save character
      await saveCharacter(characterJournalId, character);
    }
  }

  // 9. Persist campaign state
  await game.settings.set(MODULE_ID, 'campaignState', updated);

  return { character, campaignState: updated };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Session move log
// ─────────────────────────────────────────────────────────────────────────────

function appendToSessionLog(resolution, campaignState) {
  if (!campaignState.currentSessionId) return;

  // Session logs live in campaignState under sessionLogs[sessionId]
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
// 2. Character loading
// ─────────────────────────────────────────────────────────────────────────────

async function loadCharacter(journalId) {
  try {
    const entry = game.journal.get(journalId);
    if (!entry) {
      console.warn(`${MODULE_ID} | persistResolution: character journal not found: ${journalId}`);
      return null;
    }
    const page = entry.pages?.contents?.[0];
    const data = page?.flags?.[MODULE_ID]?.[CHAR_FLAG];
    if (!data) {
      console.warn(`${MODULE_ID} | persistResolution: character flag not found on page`);
      return null;
    }
    return foundry.utils.deepClone(data);
  } catch (err) {
    console.error(`${MODULE_ID} | persistResolution: failed to load character`, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Meter changes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply numeric meter changes with rules-correct clamping.
 *
 * Starforged meter ranges:
 *   momentum  — -6 to momentumMax (default 10, reduced by impacts)
 *   health    — 0 to 5
 *   spirit    — 0 to 5
 *   supply    — 0 to 5
 *
 * Momentum burn: if momentum < 0 and a burn would occur (resolved elsewhere),
 * the burn resets to momentumReset. That specific case is handled in resolver.js.
 * Here we only apply the delta.
 */
function applyMeterChanges(consequences, character) {
  const m = character.meters;
  const { momentumChange, healthChange, spiritChange, supplyChange } = consequences;

  if (momentumChange) {
    m.momentum = clamp(
      m.momentum + momentumChange,
      -6,
      character.momentumMax ?? 10
    );
  }

  if (healthChange) {
    m.health = clamp(m.health + healthChange, 0, 5);
  }

  if (spiritChange) {
    m.spirit = clamp(m.spirit + spiritChange, 0, 5);
  }

  if (supplyChange) {
    m.supply = clamp(m.supply + supplyChange, 0, 5);
  }

  // Enforce impact-triggered conditions
  // "If health reduced to 0, mark wounded or permanently harmed"
  // The module surfaces this as an otherEffect string — the actual impact marking
  // is handled by applyImpactChanges() below for direct markings, and by the
  // Loremaster / player for narrative-gate conditions (face_death, etc.).

  character.updatedAt = new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Impact changes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply direct impact state changes from consequences.
 *
 * `sufferMoveTriggered` is a string like "endure_harm" — certain outcomes on
 * suffer moves directly mark or clear impacts without a separate player action.
 *
 * Rules handled here (Reference Guide pp.120-121):
 *   endure_harm miss:    may mark wounded or permanently_harmed
 *   endure_stress miss:  may mark shaken or traumatized
 *   withstand_damage:    may mark battered (vehicle)
 *   sacrifice_resources: may mark unprepared (supply = 0)
 *
 * Only deterministic automatic cases are applied here. Player-choice cases
 * (e.g. "mark wounded OR take -1 momentum") emit their otherEffect string
 * and remain unresolved until confirmed in the UI.
 */
function applyImpactChanges(consequences, character) {
  const { sufferMoveTriggered, healthChange, spiritChange, supplyChange } = consequences;

  // Auto-mark unprepared if supply hits 0
  if (supplyChange && character.meters.supply === 0) {
    character.impacts.unprepared = true;
  }

  // Suffer move automatic consequences — only the mandatory/default paths
  switch (sufferMoveTriggered) {
    case 'endure_harm':
      // Strong hit: player clears wounded if marked (choice — not auto)
      // Miss: "worse than thought" — if health is now 0, mark wounded automatically
      // (the fatal "permanently_harmed or dead" branch requires face_death)
      if (character.meters.health === 0 && !character.impacts.wounded) {
        character.impacts.wounded = true;
      }
      break;

    case 'endure_stress':
      // Same pattern as endure_harm but for spirit / shaken
      if (character.meters.spirit === 0 && !character.impacts.shaken) {
        character.impacts.shaken = true;
      }
      break;

    case 'sacrifice_resources':
      // Already handled by the supply → 0 check above
      break;

    // Other suffer moves (withstand_damage, lose_momentum, etc.) produce
    // player-choice consequences surfaced via otherEffect only — no auto mark.
    default:
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Recalculate momentum limits from impact count
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each marked impact reduces momentumMax by 1 (floor: 0).
 * MomentumReset:
 *   0 impacts  → +2
 *   1 impact   → +1
 *   2+ impacts → 0
 *
 * Source: Reference Guide p.120
 */
function recalcMomentumLimits(character) {
  const impactCount = Object.values(character.impacts).filter(Boolean).length;

  character.momentumMax   = Math.max(0, 10 - impactCount);
  character.momentumReset = impactCount === 0 ? 2 : impactCount === 1 ? 1 : 0;

  // Clamp current momentum to new max
  character.meters.momentum = clamp(
    character.meters.momentum,
    -6,
    character.momentumMax
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 & 6. Progress track marking + legacy experience
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark progress on a track and trigger Earn Experience if a new box is filled.
 *
 * Starforged Earn Experience rule (Reference Guide p.119):
 *   Each filled box on a legacy track = 2 experience (or 1 if track was cleared once).
 *   Progress tracks (vows, expeditions, connections) are NOT legacy tracks —
 *   only the three legacy tracks (Quests, Bonds, Discoveries) grant experience.
 *   Connection progress marks DO NOT grant experience — only Forge a Bond does.
 *
 * This function marks progress on the named track and, if the track is a
 * legacy track, awards experience for any newly completed boxes.
 *
 * @param {string} trackId         — ProgressTrack _id
 * @param {number} ticksToMark     — Tick count from consequences (not boxes)
 * @param {Object} character       — Mutable character record
 * @param {Object} campaignState   — Mutable campaign state
 */
async function markTrackProgress(trackId, ticksToMark, character, campaignState) {
  const MAX_TICKS = 40;

  // Check if it's a legacy track (stored directly on character)
  const legacyKey = resolveLegacyTrackKey(trackId);
  if (legacyKey) {
    const track = character.legacyTracks[legacyKey];
    const boxesBefore = Math.floor(track.ticks / 4);
    track.ticks = Math.min(track.ticks + ticksToMark, MAX_TICKS);
    const boxesAfter = Math.floor(track.ticks / 4);
    const newBoxes = boxesAfter - boxesBefore;

    if (newBoxes > 0) {
      const expPerBox = track.cleared ? 1 : 2;
      character.experience.earned += newBoxes * expPerBox;
      console.log(`${MODULE_ID} | Earn Experience: ${newBoxes} box(es) on ${legacyKey} → +${newBoxes * expPerBox} XP`);
    }
    return;
  }

  // Non-legacy progress track — stored in its own journal entry
  await markProgressOnJournalTrack(trackId, ticksToMark, campaignState);
}

/**
 * Map a track ID or type string to a legacy track key on CharacterSchema.legacyTracks.
 * Returns null if the track is not a legacy track.
 */
function resolveLegacyTrackKey(trackId) {
  // Legacy tracks are identified by their type string rather than a journal ID
  // (they're stored directly on the character, not in separate journals)
  const LEGACY_KEYS = ['quests', 'bonds', 'discoveries'];
  if (LEGACY_KEYS.includes(trackId)) return trackId;
  return null;
}

/**
 * Load a progress track journal, add ticks, and save it back.
 * The track is stored as page.flags[MODULE_ID].progressTrack on a JournalEntryPage.
 */
async function markProgressOnJournalTrack(trackId, ticksToMark, campaignState) {
  const MAX_TICKS = 40;

  // Find the journal entry whose embedded progressTrack._id matches trackId
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

  const track = foundry.utils.deepClone(page.flags[MODULE_ID][TRACK_FLAG]);
  track.ticks = Math.min(track.ticks + ticksToMark, MAX_TICKS);
  track.updatedAt = new Date().toISOString();

  await page.setFlag(MODULE_ID, TRACK_FLAG, track);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Character save
// ─────────────────────────────────────────────────────────────────────────────

async function saveCharacter(journalId, character) {
  try {
    const entry = game.journal.get(journalId);
    if (!entry) throw new Error(`Character journal not found: ${journalId}`);

    const page = entry.pages?.contents?.[0];
    if (!page) throw new Error(`Character page not found in journal: ${journalId}`);

    await page.setFlag(MODULE_ID, CHAR_FLAG, character);
  } catch (err) {
    console.error(`${MODULE_ID} | persistResolution: failed to save character`, err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
