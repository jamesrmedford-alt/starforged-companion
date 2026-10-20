/**
 * STARFORGED COMPANION
 * src/factContinuity/sceneLifecycle.js
 *
 * Scene-transition lifecycle for the active-scene fact-continuity ledgers.
 * See issue #227 (Fact Continuity) §9.
 *
 * Exports:
 *   - startScene(campaignState, { reason }) — assign a fresh scene ID; if a
 *       prior scene wasn't cleanly ended, flush it first via endScene.
 *   - endScene(campaignState, { reason }) — migrate entity-scoped truths to
 *       entity generative tiers, archive free-text and scene-scoped truths
 *       to the WJ Lore journal, then discard active ledgers.
 *   - mergeOwnedFields / persistCampaignStateFields — write only the fields a
 *       caller owns onto the latest stored campaignState (stale-snapshot
 *       writers: scene lifecycle, End a Session).
 *   - mergeSceneLedgers / persistSceneLedgerFields — the scene-ledger merge
 *       (scene-id check + truth union) for persistResolution and the narrator
 *       sidecar persist.
 *
 * startScene / endScene mutate campaignState in place AND persist their scene
 * fields, merged onto the latest stored campaignState. They are world writes,
 * so their narration and `@scene` callers run them on the canonical GM only (a
 * player's client cannot write world settings); a persist failure is logged,
 * never thrown.
 */

import { archiveSceneTruth }          from '../world/worldJournal.js';
import { appendMigratedTruthToTier }  from '../entities/entityExtractor.js';
import { resolveEntityById, writeEntityFlag } from '../entities/registry.js';
import { collectAllEntities, resolveEntityName } from '../context/relevanceResolver.js';
import { rememberSessionRetractions } from './retractions.js';
import { subjectFromStateKey, WHEREABOUTS_ATTRIBUTES } from './ledgers.js';

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
  campaignState.sceneFrame = null;   // A4 — frame is scene-scoped; new scene starts frameless
  campaignState.spotlight = { lastActorId: null, sceneId: id }; // #232 — rotation restarts per scene

  await persistCampaignState(campaignState, `startScene (${reason})`);
  return id;
}

/**
 * Migrate the active-scene truths and discard the active ledgers.
 *
 * Order (per scope §9.2):
 *   1. Migrate entity-kind truths to entity generative tiers, and scene-kind
 *      truths to the tier of the place the scene happened at, when that place
 *      is recorded (issue #286 C2)
 *   2. Archive free-text (and place-less scene-kind) truths to WJ Lore
 *   3. Keep each recorded entity's whereabouts on its card (C1), then
 *      discard sceneState
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
  // Where this scene happened, for its scene-subject truths (resolved once).
  let place;

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

    // Scene-kind → the recorded place the scene happened at (issue #286 C2:
    // "the bar is called the Rusty Lantern" became place-less lore titled
    // "Scene sc-…"). Place-less scene truths and text-kind truths → WJ Lore.
    if (subject.kind === 'scene') {
      if (place === undefined) place = resolveScenePlace(campaignState);
      if (place) {
        const ok = await safeMigrateToEntityTier(truth, { entityId: place.id, entityType: place.type });
        if (ok) {
          truth.migratedTo = { kind: 'entityGenerativeTier', entityId: place.id };
          migrated += 1;
          continue;
        }
      }
    }
    const result = await safeArchiveSceneTruth(truth, campaignState);
    if (result?.pageId) {
      truth.migratedTo = { kind: 'worldJournalLore', loreEntryId: result.pageId };
      archived += 1;
    } else {
      skipped += 1;
    }
  }

  // The scene's strikes outlive it for the rest of the session (issue #286
  // B6): the CORRECTED block and the summary prompt keep naming them, because
  // the ring and the summary's source prose still say them.
  rememberSessionRetractions(campaignState);

  // Where each recorded character was and what shape they were in outlives
  // the scene on their card (issue #286 C1) — scene state is discarded next.
  await keepLastKnownWhereabouts(campaignState);

  // Discard active ledgers regardless of per-entry migration outcomes — the
  // truths array is preserved-with-retraction-and-migration markers but the
  // active scene is closed.
  campaignState.sceneState  = { bySubject: {}, sceneId: null };
  campaignState.sceneTruths = [];
  campaignState.sceneFrame  = null;
  campaignState.currentSceneId = null;
  campaignState.spotlight = { lastActorId: null, sceneId: null }; // #232 — clear rotation with the scene

  await persistCampaignStateFields(campaignState, [...SCENE_FIELDS, 'sessionRetractions'], `endScene (${reason})`);

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
      createdAt:  truth.createdAt ?? Date.now(),
    };
    return await appendMigratedTruthToTier(subject.entityId, subject.entityType, tierEntry);
  } catch (err) {
    console.warn(`${MODULE_ID} | sceneLifecycle: migrate truth to entity tier failed:`, err);
    return false;
  }
}

async function safeArchiveSceneTruth(truth, campaignState) {
  try {
    return await archiveSceneTruth(truth, campaignState, {
      placeLabel: String(campaignState.sceneFrame?.location ?? '').trim() || null,
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | sceneLifecycle: archive scene truth failed:`, err);
    return null;
  }
}

/** Entity types a scene can happen at — the ones with a place on the map, and the ship. */
const PLACE_TYPES = new Set(['settlement', 'planet', 'location', 'ship']);

/**
 * The recorded place this scene happened at, for its scene-subject truths
 * (issue #286 C2), or null. A ladder that stops before guessing, since a
 * detail filed on the wrong place is worse than one archived as lore:
 *   1. the scene frame's location names a recorded place outright
 *      (resolveEntityName — "Bleakhold", "the Pioneer's Pride");
 *   2. it mentions exactly one recorded place by full name ("Bleakhold's
 *      docking ring");
 *   3. there is no frame location and the current location (`!at`, travel)
 *      is recorded.
 * A frame that names an unrecorded place ("the derelict's spine corridor")
 * is not the current location, so it gets none.
 *
 * @param {Object} campaignState
 * @returns {{ id: string, type: string }|null}
 */
function resolveScenePlace(campaignState) {
  try {
    const where = String(campaignState.sceneFrame?.location ?? '').trim();
    if (where) {
      const places = collectAllEntities(campaignState).filter(e => PLACE_TYPES.has(e.entityType));
      const named  = resolveEntityName(where, places, campaignState.dismissedEntities ?? []);
      if (named) return { id: named.journalId ?? named._id, type: named.entityType };
      const lower  = where.toLowerCase();
      const within = places.filter(e => {
        const name = String(e.name ?? '').trim().toLowerCase();
        return name && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}($|[^\\p{L}\\p{N}])`, 'u').test(lower);
      });
      const ids = new Set(within.map(e => e.journalId ?? e._id));
      if (ids.size === 1) return { id: [...ids][0], type: within[0].entityType };
      return null;
    }
    const id   = campaignState.currentLocationId ?? null;
    const type = campaignState.currentLocationType ?? null;
    return id && PLACE_TYPES.has(type) ? { id, type } : null;
  } catch (err) {
    console.warn(`${MODULE_ID} | sceneLifecycle: scene place lookup failed:`, err?.message ?? err);
    return null;
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Keep each recorded entity's whereabouts from the closing scene on its record
 * as `lastKnown` (issue #286 C1): where they were, what they were aboard, what
 * shape they were in — the REQUIRED stateChanges, which scene end used to
 * discard with the rest of the scene state. Each attribute supersedes its
 * previous value; one this scene did not mention keeps it. Rendered on the
 * entity card as LAST KNOWN. Fail-open per entity.
 *
 * @param {Object} campaignState
 * @returns {Promise<number>} entities updated
 */
async function keepLastKnownWhereabouts(campaignState) {
  const bySubject = campaignState.sceneState?.bySubject;
  if (!bySubject || typeof bySubject !== 'object') return 0;
  const sessionNum = Number(campaignState.sessionNumber) > 0 ? Number(campaignState.sessionNumber) : null;
  let updated = 0;
  for (const [key, entries] of Object.entries(bySubject)) {
    const subject = subjectFromStateKey(key);
    if (subject.kind !== 'entity' || !Array.isArray(entries)) continue;
    const kept = entries.filter(e =>
      WHEREABOUTS_ATTRIBUTES.includes(String(e?.attribute ?? '').trim().toLowerCase())
      && String(e?.value ?? '').trim());
    if (!kept.length) continue;
    try {
      const resolved = resolveEntityById(subject.entityId);
      if (!resolved) continue;
      const lastKnown = { ...(resolved.data.lastKnown ?? {}) };
      for (const e of kept) {
        lastKnown[String(e.attribute).trim().toLowerCase()] = {
          value: String(e.value).trim(),
          sessionNum,
          at:    Number(e.updatedAt) || Date.now(),
        };
      }
      await writeEntityFlag(resolved.typeKey, resolved.document, {
        ...resolved.data,
        lastKnown,
        updatedAt: new Date().toISOString(),
      });
      updated += 1;
    } catch (err) {
      console.warn(`${MODULE_ID} | sceneLifecycle: keeping ${subject.entityId}'s last known whereabouts failed:`, err?.message ?? err);
    }
  }
  return updated;
}

/** campaignState fields the scene lifecycle owns (written by startScene / endScene). */
const SCENE_FIELDS = Object.freeze(['currentSceneId', 'sceneTruths', 'sceneState', 'sceneFrame', 'spotlight']);

async function persistCampaignState(campaignState, label) {
  await persistCampaignStateFields(campaignState, SCENE_FIELDS, label);
}

/**
 * The latest stored campaignState with only `fields` taken from the caller's
 * copy — what a caller holding a snapshot across long awaits writes instead of
 * its whole object, which would revert anything written in the meantime (a
 * relayed X-Card, Take a Break, safety flags, Private Lines, a move's persist —
 * decisions.md → "Long-running pipeline writes merge relay-owned fields").
 * Returns the caller's own object when it IS the stored one, or when the store
 * cannot be read.
 *
 * @param {Object}   campaignState — the caller's working copy (source of `fields`)
 * @param {string[]} fields        — top-level keys this write owns
 * @param {string}   label         — for the read-failure log
 * @returns {Object} the object to write
 */
export function mergeOwnedFields(campaignState, fields, label) {
  let latest = null;
  try {
    latest = game.settings.get(MODULE_ID, 'campaignState');
  } catch (err) {
    console.debug?.(`${MODULE_ID} | sceneLifecycle: latest campaignState read failed (${label}); writing the caller's copy:`, err?.message ?? err);
  }
  if (!latest || typeof latest !== 'object' || latest === campaignState) return campaignState;
  const target = { ...latest };
  for (const key of fields) {
    if (Object.prototype.hasOwnProperty.call(campaignState, key)) target[key] = campaignState[key];
  }
  return target;
}

/**
 * Persist only `fields` of `campaignState`, merged onto the LATEST stored
 * campaignState (mergeOwnedFields). Failures are logged, never thrown.
 *
 * @param {Object}   campaignState — the caller's working copy (source of `fields`)
 * @param {string[]} fields        — top-level keys this write owns
 * @param {string}   label         — for the failure log
 * @returns {Promise<void>}
 */
export async function persistCampaignStateFields(campaignState, fields, label) {
  try {
    if (typeof game === 'undefined' || !game?.settings?.set) return;
    await game.settings.set(MODULE_ID, 'campaignState', mergeOwnedFields(campaignState, fields, label));
  } catch (err) {
    // Player clients can't write world settings; tolerate.
    console.warn(`${MODULE_ID} | sceneLifecycle: campaignState persist failed (${label}):`, err);
  }
}

/**
 * Scene-ledger merge for a writer holding a campaignState snapshot across long
 * awaits — the move pipeline's persistResolution and the narrator-sidecar
 * persist (persistSceneLedgerFields). Mutates `working`'s scene fields:
 *   - the store on a different scene (a `!scene`, End a Session or other
 *     lifecycle write landed meanwhile) → the store's scene wins wholesale;
 *   - same scene → sceneTruths unioned by id (the store's entries, a
 *     retraction on either side sticks, the working copy's new truths
 *     appended); sceneState / sceneFrame / spotlight keep the working copy
 *     (their supersede / delete semantics cannot be merged without a
 *     baseline).
 *
 * @param {Object} working — the writer's copy (mutated)
 * @param {Object} latest  — the latest stored campaignState (not mutated)
 * @returns {boolean} false when the store had moved to another scene
 */
export function mergeSceneLedgers(working, latest) {
  if ((latest.currentSceneId ?? null) !== (working.currentSceneId ?? null)) {
    for (const key of SCENE_FIELDS) {
      if (key in latest) working[key] = latest[key];
      else delete working[key];
    }
    return false;
  }

  const storeTruths   = Array.isArray(latest.sceneTruths)  ? latest.sceneTruths  : null;
  const workingTruths = Array.isArray(working.sceneTruths) ? working.sceneTruths : null;
  if (!storeTruths) return true;                  // nothing stored — keep the working copy
  if (!workingTruths) { working.sceneTruths = storeTruths; return true; }

  const truthKey = (t) => t?.id ?? JSON.stringify(t);
  const mine = new Map(workingTruths.map(t => [truthKey(t), t]));
  const seen = new Set();
  const merged = storeTruths.map((t) => {
    const k = truthKey(t);
    seen.add(k);
    const w = mine.get(k);
    // A retraction (narrator contradiction or `!truth` correction) is one-way.
    return (w?.retracted && !t?.retracted) ? w : t;
  });
  for (const t of workingTruths) {
    if (!seen.has(truthKey(t))) merged.push(t);
  }
  working.sceneTruths = merged;
  return true;
}

/**
 * Persist a long-running caller's scene-ledger `fields` (the narrator
 * sidecar's sceneTruths / sceneState / sceneFrame — the move pipeline narrates
 * from a snapshot read before its confirm dialog and Claude calls) onto the
 * LATEST stored campaignState, with the mergeSceneLedgers policy: nothing is
 * written when the store has moved to another scene meanwhile (End a Session
 * or `!scene` closed this one and archived its truths), and sceneTruths are
 * unioned by id otherwise, so a `!truth` correction or an oracle follow-up's
 * truth that landed during the narration survives. When the caller's object
 * IS the stored one it is written as-is. Failures are logged, never thrown.
 *
 * @param {Object}   campaignState — the caller's working copy
 * @param {string[]} fields        — the scene-ledger keys this write owns
 * @param {string}   label         — for the logs
 * @returns {Promise<boolean>} true when written
 */
export async function persistSceneLedgerFields(campaignState, fields, label) {
  try {
    if (typeof game === 'undefined' || !game?.settings?.set) return false;
    let latest = null;
    try {
      latest = game.settings.get(MODULE_ID, 'campaignState');
    } catch (err) {
      console.debug?.(`${MODULE_ID} | sceneLifecycle: latest campaignState read failed (${label}); writing the caller's copy:`, err?.message ?? err);
    }
    let target = campaignState;
    if (latest && typeof latest === 'object' && latest !== campaignState) {
      const ledgers = {};
      for (const key of SCENE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(campaignState, key)) ledgers[key] = campaignState[key];
      }
      if (!mergeSceneLedgers(ledgers, latest)) {
        console.debug(`${MODULE_ID} | sceneLifecycle: the scene changed meanwhile — ${label} not persisted (the stored scene's ledgers stand).`);
        return false;
      }
      target = { ...latest };
      for (const key of fields) {
        if (Object.prototype.hasOwnProperty.call(ledgers, key)) target[key] = ledgers[key];
      }
    }
    await game.settings.set(MODULE_ID, 'campaignState', target);
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | sceneLifecycle: campaignState persist failed (${label}):`, err);
    return false;
  }
}
