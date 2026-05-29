/**
 * STARFORGED COMPANION
 * src/factContinuity/sceneLifecycle.js
 *
 * Scene-transition lifecycle for the active-scene fact-continuity ledgers.
 * See docs/fact-continuity/fact-continuity-scope.md §9.
 *
 * Exports:
 *   - startScene(campaignState, { reason }) — assign a fresh scene ID; if a
 *       prior scene wasn't cleanly ended, flush it first via endScene.
 *   - endScene(campaignState, { reason }) — migrate entity-scoped truths to
 *       entity generative tiers, archive free-text and scene-scoped truths
 *       to the WJ Lore journal, then discard active ledgers.
 *
 * Both functions mutate campaignState in place AND attempt to persist via
 * game.settings.set. Persist failures are tolerated so player clients
 * (which cannot write world settings) do not abort the in-memory state
 * change. The same pattern as src/narration/narrator.js applyNarratorSidecar.
 */

import { archiveSceneTruth }          from '../world/worldJournal.js';
import { appendMigratedTruthToTier }  from '../entities/entityExtractor.js';

const MODULE_ID = 'starforged-companion';

/**
 * Assign a fresh `currentSceneId`. If active-scene ledgers contain entries
 * the previous scene was never cleanly ended; that scene is flushed first
 * with reason "implicit_due_to_new_scene".
 *
 * @param {Object} campaignState
 * @param {Object} [opts]
 * @param {string} [opts.reason] — diagnostic only ("@scene_intercept",
 *   "first_narration", "scene_command")
 * @returns {Promise<string>} the new scene ID
 */
export async function startScene(campaignState, { reason = 'unknown' } = {}) {
  if (!campaignState) return null;

  const stateHasEntries = hasActiveStateEntries(campaignState);
  if ((campaignState.sceneTruths?.length ?? 0) > 0 || stateHasEntries) {
    await endScene(campaignState, { reason: 'implicit_due_to_new_scene' });
  }

  const id = `sc-${randomSceneSuffix()}`;
  campaignState.currentSceneId = id;
  ensureSceneStateShape(campaignState);
  campaignState.sceneState.sceneId = id;
  ensureSceneTruthsShape(campaignState);

  await persistCampaignState(campaignState, `startScene (${reason})`);
  return id;
}

/**
 * Migrate the active-scene truths and discard the active ledgers.
 *
 * Order (per scope §9.2):
 *   1. Migrate entity-kind truths to entity generative tiers
 *   2. Archive free-text and scene-kind truths to WJ Lore
 *   3. Discard sceneState
 *   4. Discard sceneTruths
 *   5. Clear currentSceneId
 *
 * @param {Object} campaignState
 * @param {Object} [opts]
 * @param {string} [opts.reason] — diagnostic only ("scene_command",
 *   "implicit_due_to_new_scene", "session_close")
 * @returns {Promise<{ migrated: number, archived: number, skipped: number }>}
 */
export async function endScene(campaignState, { reason = 'unknown' } = {}) {
  if (!campaignState) return { migrated: 0, archived: 0, skipped: 0 };

  let migrated = 0;
  let archived = 0;
  let skipped  = 0;

  const truths = Array.isArray(campaignState.sceneTruths) ? campaignState.sceneTruths : [];

  for (const truth of truths) {
    if (!truth || truth.retracted || truth.migratedTo) {
      skipped += 1;
      continue;
    }
    const subject = truth.subject;
    if (!subject) { skipped += 1; continue; }

    if (subject.kind === 'entity' && subject.entityId) {
      const ok = await safeMigrateToEntityTier(truth, subject);
      if (ok) {
        truth.migratedTo = { kind: 'entityGenerativeTier', entityId: subject.entityId };
        migrated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    // scene-kind or text-kind → WJ Lore archive
    const result = await safeArchiveSceneTruth(truth, campaignState);
    if (result?.pageId) {
      truth.migratedTo = { kind: 'worldJournalLore', loreEntryId: result.pageId };
      archived += 1;
    } else {
      skipped += 1;
    }
  }

  // Discard active ledgers regardless of per-entry migration outcomes — the
  // truths array is preserved-with-retraction-and-migration markers but the
  // active scene is closed.
  campaignState.sceneState  = { bySubject: {}, sceneId: null };
  campaignState.sceneTruths = [];
  campaignState.currentSceneId = null;

  await persistCampaignState(campaignState, `endScene (${reason})`);

  return { migrated, archived, skipped };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hasActiveStateEntries(campaignState) {
  const bySubject = campaignState.sceneState?.bySubject;
  if (!bySubject || typeof bySubject !== 'object') return false;
  for (const list of Object.values(bySubject)) {
    if (Array.isArray(list) && list.length) return true;
  }
  return false;
}

function ensureSceneStateShape(campaignState) {
  if (!campaignState.sceneState || typeof campaignState.sceneState !== 'object') {
    campaignState.sceneState = { bySubject: {}, sceneId: null };
  }
  if (!campaignState.sceneState.bySubject ||
      typeof campaignState.sceneState.bySubject !== 'object') {
    campaignState.sceneState.bySubject = {};
  }
}

function ensureSceneTruthsShape(campaignState) {
  if (!Array.isArray(campaignState.sceneTruths)) {
    campaignState.sceneTruths = [];
  }
}

function randomSceneSuffix() {
  const cryptoRef =
    typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
      ? globalThis.crypto
      : null;
  if (cryptoRef) return cryptoRef.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

async function safeMigrateToEntityTier(truth, subject) {
  try {
    const tierEntry = {
      sessionId:  truth.sessionId ?? '',
      sessionNum: truth.sessionNum ?? null,
      detail:     truth.fact,
      source:     'scene_truth_migration',
      pinned:     false,
      promoted:   false,
      promotedAt: null,
    };
    return await appendMigratedTruthToTier(subject.entityId, subject.entityType, tierEntry);
  } catch (err) {
    console.warn(`${MODULE_ID} | sceneLifecycle: migrate truth to entity tier failed:`, err);
    return false;
  }
}

async function safeArchiveSceneTruth(truth, campaignState) {
  try {
    return await archiveSceneTruth(truth, campaignState);
  } catch (err) {
    console.warn(`${MODULE_ID} | sceneLifecycle: archive scene truth failed:`, err);
    return null;
  }
}

async function persistCampaignState(campaignState, label) {
  try {
    if (typeof game !== 'undefined' && game?.settings?.set) {
      await game.settings.set(MODULE_ID, 'campaignState', campaignState);
    }
  } catch (err) {
    // Player clients can't write world settings; tolerate.
    console.warn(`${MODULE_ID} | sceneLifecycle: campaignState persist failed (${label}):`, err);
  }
}
