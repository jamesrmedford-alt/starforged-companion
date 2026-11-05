/**
 * STARFORGED COMPANION
 * src/factContinuity/sceneLifecycle.js
 *
 * Scene-transition lifecycle for the active-scene fact-continuity ledgers.
 * See issue #227 (Fact Continuity) §9.
 *
 * Exports:
 *   - startScene(campaignState, { reason }) — assign a fresh scene ID; if a
 *       prior scene wasn't cleanly ended, flush it first via endScene. A
 *       caller holding no scene adopts the store's active scene instead.
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
import { subjectFromStateKey, WHEREABOUTS_ATTRIBUTES, retractNarrations } from './ledgers.js';

const MODULE_ID = 'starforged-companion';

/**
 * How long a scene start waits for the one ahead of it (issue #335 Y05). A
 * start is a campaignState write or two (and an implicit end's migration):
 * seconds at most. One whose write never settles is passed, with a warning,
 * so it cannot hold every later scene start.
 */
const SCENE_START_WAIT_MS = 10_000;

/** The last scene start on this client: settles (never rejects) once it is done. */
let _sceneStartTail = Promise.resolve();

/**
 * Assign a fresh `currentSceneId`. If active-scene ledgers contain entries
 * the previous scene was never cleanly ended; that scene is flushed first
 * with reason "implicit_due_to_new_scene".
 *
 * A caller holding no scene may hold a snapshot read before another
 * narration started one — the move pipeline reads campaignState before its
 * confirm dialog and Claude calls. When the store has an active scene, that
 * scene is the one in progress: it is adopted into the caller's copy (scene
 * id, truths, state, frame, spotlight) and its id returned, nothing written
 * (issue #321 U06f — a second scene used to be minted over the live one's
 * ledgers, which were neither kept nor archived). A caller that holds the
 * active scene (`!scene start` reads the store first) still ends it and
 * starts a new one.
 *
 * Scene starts run one at a time on this client (the canonical GM, the scene
 * lifecycle's single emitter): a start waits for the one in flight — at most
 * SCENE_START_WAIT_MS — and only then looks for the store's scene, so it
 * adopts the scene that start opened (issue #335 Y05). Two narrations one
 * command fires each narrate on their own working copy (issue #329 X09), and
 * with no scene open both read the store inside the first start's write
 * round trip: each minted a scene, and the narration on the losing one had
 * its truths, state and frame dropped as "the scene changed meanwhile".
 *
 * @param {Object} campaignState
 * @param {Object} [opts]
 * @param {string} [opts.reason] — diagnostic only ("@scene_intercept",
 *   "first_narration", "scene_command")
 * @returns {Promise<string>} the new (or adopted) scene ID
 */
export async function startScene(campaignState, { reason = 'unknown' } = {}) {
  if (!campaignState) return null;
  const ahead = _sceneStartTail;
  let release;
  _sceneStartTail = new Promise(resolve => { release = resolve; });
  try {
    await waitForSceneStartAhead(ahead, reason);
    return await openScene(campaignState, reason);
  } finally {
    release();   // the next start goes, whatever this one did
  }
}

async function waitForSceneStartAhead(ahead, reason) {
  let timer = null;
  const timedOut = new Promise(resolve => { timer = setTimeout(() => resolve(true), SCENE_START_WAIT_MS); });
  try {
    if (await Promise.race([ahead.then(() => false), timedOut])) {
      console.warn(`${MODULE_ID} | sceneLifecycle: startScene (${reason}) — the scene start ahead of it is still running after ${SCENE_START_WAIT_MS}ms; starting anyway.`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** startScene's work, one start at a time: adopt the store's active scene, or open one. */
async function openScene(campaignState, reason) {
  if (!campaignState.currentSceneId && adoptStoredScene(campaignState)) {
    console.debug(`${MODULE_ID} | sceneLifecycle: startScene (${reason}) — scene ${campaignState.currentSceneId} is already active; continuing it.`);
    return campaignState.currentSceneId;
  }

  const stateHasEntries = hasActiveStateEntries(campaignState);
  const replacing = !!campaignState.currentSceneId;
  let ended = false;
  if ((campaignState.sceneTruths?.length ?? 0) > 0 || stateHasEntries) {
    await endScene(campaignState, { reason: 'implicit_due_to_new_scene' });
    ended = true;
  }

  const id = `sc-${randomSceneSuffix()}`;
  campaignState.currentSceneId = id;
  ensureSceneStateShape(campaignState);
  campaignState.sceneState.sceneId = id;
  ensureSceneTruthsShape(campaignState);
  campaignState.sceneFrame = null;   // A4 — frame is scene-scoped; new scene starts frameless
  campaignState.spotlight = { lastActorId: null, sceneId: id }; // #232 — rotation restarts per scene

  // An empty scene replaced by this one ended too (endScene ran only for a
  // scene with entries): its pacing override goes with it (issue #322 V21).
  // An override set before any scene began is this new scene's.
  const fields = [...SCENE_FIELDS];
  if (replacing && !ended && clearPacingOverride(campaignState)) fields.push('pacing');

  await persistCampaignStateFields(campaignState, fields, `startScene (${reason})`);
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

  const counts = { migrated: 0, archived: 0, skipped: 0 };
  const sceneId = campaignState.currentSceneId ?? null;

  const truths = Array.isArray(campaignState.sceneTruths) ? campaignState.sceneTruths : [];
  // Where this scene happened, for its scene-subject truths (resolved once).
  const placeOf = { place: undefined };
  const handled = new Set();

  for (const truth of truths) {
    if (truth?.id) handled.add(truth.id);
    counts[await migrateSceneTruth(truth, campaignState, placeOf)] += 1;
  }

  // The scene's strikes outlive it for the rest of the session (issue #286
  // B6): the CORRECTED block and the summary prompt keep naming them, because
  // the ring and the summary's source prose still say them.
  rememberSessionRetractions(campaignState);

  // Where each recorded character was and what shape they were in outlives
  // the scene on their card (issue #286 C1) — scene state is discarded next.
  await keepLastKnownWhereabouts(campaignState);

  // What reached the scene while the awaits above ran — a narration's sidecar
  // persisted into the still-current scene — is migrated too. The final write
  // below clears the scene on the latest store: such a fact was never
  // migrated, archived or kept as LAST KNOWN, and was in no store afterwards
  // (issue #325 W24). A few passes; each re-reads the store.
  await migrateLateSceneFacts(campaignState, sceneId, handled, placeOf, counts);

  // Discard active ledgers regardless of per-entry migration outcomes — the
  // truths array is preserved-with-retraction-and-migration markers but the
  // active scene is closed.
  campaignState.sceneState  = { bySubject: {}, sceneId: null };
  campaignState.sceneTruths = [];
  campaignState.sceneFrame  = null;
  campaignState.currentSceneId = null;
  campaignState.spotlight = { lastActorId: null, sceneId: null }; // #232 — clear rotation with the scene

  // `!pace hot` / `!pace quiet` last "for the current scene" (the help), and
  // only `!pace clear` cleared them (issue #322 V21): the override ends with
  // the scene.
  const fields = [...SCENE_FIELDS, 'sessionRetractions'];
  if (clearPacingOverride(campaignState)) fields.push('pacing');

  await persistCampaignStateFields(campaignState, fields, `endScene (${reason})`);

  return { ...counts };
}

/**
 * One scene truth leaving its scene (endScene): an entity's goes to its
 * generative tier; a scene-kind one to the place the scene happened at; the
 * rest — and a place-less scene truth — to World Journal Lore. Marks the
 * truth's `migratedTo`.
 *
 * @param {Object} truth
 * @param {Object} campaignState
 * @param {{ place: Object|null|undefined }} placeOf — the scene's place, resolved once
 * @returns {Promise<"migrated"|"archived"|"skipped">}
 */
async function migrateSceneTruth(truth, campaignState, placeOf) {
  if (!truth || truth.retracted || truth.migratedTo) return 'skipped';
  const subject = truth.subject;
  if (!subject) return 'skipped';

  if (subject.kind === 'entity' && subject.entityId) {
    const ok = await safeMigrateToEntityTier(truth, subject);
    if (!ok) return 'skipped';
    truth.migratedTo = { kind: 'entityGenerativeTier', entityId: subject.entityId };
    return 'migrated';
  }

  // Scene-kind → the recorded place the truth was asserted at (issue #286
  // C2: "the bar is called the Rusty Lantern" became place-less lore titled
  // "Scene sc-…"; issue #326 D2: it landed on the place the scene ENDED at —
  // a scene spans travel). Place-less scene truths and text-kind truths → WJ
  // Lore.
  if (subject.kind === 'scene') {
    const place = truthPlace(truth, campaignState, placeOf);
    if (place) {
      const ok = await safeMigrateToEntityTier(truth, { entityId: place.id, entityType: place.type });
      if (ok) {
        truth.migratedTo = { kind: 'entityGenerativeTier', entityId: place.id };
        return 'migrated';
      }
    }
  }
  const result = await safeArchiveSceneTruth(truth, campaignState);
  if (!result?.pageId) return 'skipped';
  truth.migratedTo = { kind: 'worldJournalLore', loreEntryId: result.pageId };
  return 'archived';
}

const LATE_FACT_PASSES = 3;

/**
 * endScene's late arrivals (issue #325 W24): while the scene's truths were
 * migrated and its whereabouts kept, a narration could persist more into the
 * still-current scene. Re-read the store; while it is still this scene, migrate
 * its truths this end has not handled and keep the whereabouts it now holds
 * (keepLastKnownWhereabouts, for the subjects whose state changed). Bounded.
 *
 * @param {Object} campaignState — endScene's copy (its sceneState is merged)
 * @param {string|null} sceneId — the scene being ended
 * @param {Set<string>} handled — ids of the truths already migrated
 * @param {{ place: Object|null|undefined }} placeOf
 * @param {{ migrated: number, archived: number, skipped: number }} counts — mutated
 */
async function migrateLateSceneFacts(campaignState, sceneId, handled, placeOf, counts) {
  if (!sceneId) return;
  for (let pass = 0; pass < LATE_FACT_PASSES; pass++) {
    let latest = null;
    try { latest = game.settings.get(MODULE_ID, 'campaignState'); } catch { latest = null; }
    if (!latest || (latest.currentSceneId ?? null) !== sceneId) return;

    const fresh = (Array.isArray(latest.sceneTruths) ? latest.sceneTruths : [])
      .filter(t => t?.id && !handled.has(t.id))
      .map(t => foundry.utils.deepClone(t));
    const latestBySubject = latest.sceneState?.bySubject ?? {};
    const ownBySubject    = campaignState.sceneState?.bySubject ?? {};
    const changedState = {};
    for (const [key, entries] of Object.entries(latestBySubject)) {
      if (JSON.stringify(entries) !== JSON.stringify(ownBySubject[key])) changedState[key] = entries;
    }
    if (!fresh.length && !Object.keys(changedState).length) return;

    for (const truth of fresh) {
      handled.add(truth.id);
      counts[await migrateSceneTruth(truth, campaignState, placeOf)] += 1;
    }
    if (Object.keys(changedState).length) {
      await keepLastKnownWhereabouts({ ...campaignState, sceneState: { bySubject: changedState } });
      campaignState.sceneState = {
        ...(campaignState.sceneState ?? {}),
        bySubject: { ...ownBySubject, ...changedState },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Clear a `!pace` scene override on the caller's copy, from the store's own
 * pacing block (so a `!roll` flag set meanwhile stays). True when there was
 * one — the caller then persists `pacing` with its scene fields, with no await
 * between this read and that write.
 *
 * @param {Object} campaignState — the caller's copy (mutated)
 * @returns {boolean}
 */
function clearPacingOverride(campaignState) {
  let stored = null;
  try { stored = game.settings.get(MODULE_ID, 'campaignState')?.pacing ?? null; } catch { stored = null; }
  const pacing = stored && typeof stored === 'object' ? stored : campaignState.pacing;
  if (!pacing?.sceneOverride) return false;
  campaignState.pacing = { ...pacing, sceneOverride: null };
  return true;
}

/**
 * Copy the store's active scene — SCENE_FIELDS, cloned — into the caller's
 * campaignState when the store has one the caller lacks. Returns true when a
 * scene was adopted.
 *
 * @param {Object} campaignState — the caller's copy (mutated)
 * @returns {boolean}
 */
function adoptStoredScene(campaignState) {
  let latest = null;
  try {
    latest = game.settings.get(MODULE_ID, 'campaignState');
  } catch (err) {
    console.debug?.(`${MODULE_ID} | sceneLifecycle: latest campaignState read failed; starting a scene from the caller's copy:`, err?.message ?? err);
    return false;
  }
  if (!latest || typeof latest !== 'object' || latest === campaignState || !latest.currentSceneId) return false;
  for (const key of SCENE_FIELDS) {
    if (latest[key] === undefined) delete campaignState[key];
    else campaignState[key] = foundry.utils.deepClone(latest[key]);
  }
  return true;
}

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
    // Titled with where the truth was asserted (issue #326 D2), else where
    // the scene ended.
    const asserted = typeof truth?.sceneLocation === 'string' ? truth.sceneLocation.trim() : '';
    return await archiveSceneTruth(truth, campaignState, {
      placeLabel: asserted || String(campaignState.sceneFrame?.location ?? '').trim() || null,
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
    if (where) return placeNamedBy(where, campaignState);
    const id   = campaignState.currentLocationId ?? null;
    const type = campaignState.currentLocationType ?? null;
    return id && PLACE_TYPES.has(type) ? { id, type } : null;
  } catch (err) {
    console.warn(`${MODULE_ID} | sceneLifecycle: scene place lookup failed:`, err?.message ?? err);
    return null;
  }
}

/**
 * The recorded place a frame location names (rungs 1–2 of resolveScenePlace's
 * ladder) — or null: an unrecorded place gets none.
 *
 * @param {string} where — a scene frame's location
 * @param {Object} campaignState
 * @returns {{ id: string, type: string }|null}
 */
function placeNamedBy(where, campaignState) {
  const places = collectAllEntities(campaignState).filter(e => PLACE_TYPES.has(e.entityType));
  const named  = resolveEntityName(where, places, campaignState.dismissedEntities ?? []);
  if (named) return { id: named.journalId ?? named._id, type: named.entityType };
  const lower  = where.toLowerCase();
  const within = places.filter(e => {
    const name = String(e.name ?? '').trim().toLowerCase();
    return name && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}($|[^\\p{L}\\p{N}])`, 'u').test(lower);
  });
  const ids = new Set(within.map(e => e.journalId ?? e._id));
  return ids.size === 1 ? { id: [...ids][0], type: within[0].entityType } : null;
}

/**
 * The recorded place a scene truth is filed on (issue #326 D2): the place its
 * stamped `sceneLocation` — the frame's location when it was asserted — names;
 * a truth with no stamp (recorded before stamping, or asserted before any
 * frame stood) falls back to the place the scene ended at. Resolved once per
 * location for the whole scene end.
 *
 * @param {Object} truth
 * @param {Object} campaignState
 * @param {{ place?: Object|null, byLocation?: Map<string, Object|null> }} placeOf
 * @returns {{ id: string, type: string }|null}
 */
function truthPlace(truth, campaignState, placeOf) {
  const at = typeof truth?.sceneLocation === 'string' ? truth.sceneLocation.trim() : '';
  if (!at) {
    if (placeOf.place === undefined) placeOf.place = resolveScenePlace(campaignState);
    return placeOf.place;
  }
  placeOf.byLocation ??= new Map();
  if (!placeOf.byLocation.has(at)) {
    let place = null;
    try { place = placeNamedBy(at, campaignState); }
    catch (err) { console.warn(`${MODULE_ID} | sceneLifecycle: truth place lookup failed:`, err?.message ?? err); }
    placeOf.byLocation.set(at, place);
  }
  return placeOf.byLocation.get(at);
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
 *     baseline) — except what a narration the X-Card removed wrote (the
 *     store's `xCardedNarrationIds`), which is retracted from the working
 *     copy first (issue #321 U07).
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

  // A narration the X-Card removed stays removed (issue #321 U07): the
  // working copy may predate the removal, and its state and frame would be
  // kept below. Its truths are retracted again here too (a retraction sticks
  // in the union); a frame it wrote yields to the store's.
  const removed = Array.isArray(latest.xCardedNarrationIds) ? latest.xCardedNarrationIds : [];
  if (removed.length) {
    const frameRemoved = removed.includes(working.sceneFrame?.narrationId);
    retractNarrations(working, removed);
    if (frameRemoved) working.sceneFrame = latest.sceneFrame ?? null;
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
    // A retraction (narrator contradiction or `!truth` correction) is one-way,
    // and so is the link a correction adds to it — a Replace's, or a
    // `!truth set` re-establishing a struck fact (issue #326 W60).
    if (w?.retracted && !t?.retracted) return w;
    return (w?.retracted && w.correctedTo && !t?.correctedTo) ? w : t;
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
 * IS the stored one a copy of it is written — never the cached object itself,
 * which a refused write must leave as the world has it (issue #331 X38).
 * Failures are logged, never thrown.
 *
 * A caller that owns a further change — a correction's mark on the rolling
 * summary, the inciting premise — makes it with `opts.onto` on the latest
 * stored campaignState being written, in the same write; it is written even
 * when the scene changed and the ledgers are not (issue #321 U06).
 *
 * @param {Object}   campaignState — the caller's working copy
 * @param {string[]} fields        — the scene-ledger keys this write owns
 * @param {string}   label         — for the logs
 * @param {Object}   [opts]
 * @param {(target: Object) => void} [opts.onto] — makes the caller's further
 *   change on the object about to be written (a copy of the latest store)
 * @returns {Promise<boolean>} true when the ledgers were written
 */
export async function persistSceneLedgerFields(campaignState, fields, label, { onto = null } = {}) {
  try {
    if (typeof game === 'undefined' || !game?.settings?.set) return false;
    let latest = null;
    try {
      latest = game.settings.get(MODULE_ID, 'campaignState');
    } catch (err) {
      console.debug?.(`${MODULE_ID} | sceneLifecycle: latest campaignState read failed (${label}); writing the caller's copy:`, err?.message ?? err);
    }
    // Always a copy: a caller may hand over the cached setting itself, and
    // `onto` (or the merge) set on it before a refused write left this
    // client's cache holding what the world never took (issue #331 X38 —
    // the inciting premise).
    let target = { ...campaignState };
    let ledgersWritten = true;
    if (latest && typeof latest === 'object' && latest !== campaignState) {
      const ledgers = {};
      for (const key of SCENE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(campaignState, key)) ledgers[key] = campaignState[key];
      }
      target = { ...latest };
      if (mergeSceneLedgers(ledgers, latest)) {
        for (const key of fields) {
          if (Object.prototype.hasOwnProperty.call(ledgers, key)) target[key] = ledgers[key];
        }
      } else {
        console.debug(`${MODULE_ID} | sceneLifecycle: the scene changed meanwhile — ${label} not persisted (the stored scene's ledgers stand).`);
        if (typeof onto !== 'function') return false;
        ledgersWritten = false;
      }
    }
    if (typeof onto === 'function') onto(target);
    await game.settings.set(MODULE_ID, 'campaignState', target);
    return ledgersWritten;
  } catch (err) {
    console.warn(`${MODULE_ID} | sceneLifecycle: campaignState persist failed (${label}):`, err);
    return false;
  }
}
