/**
 * STARFORGED COMPANION
 * tests/unit/campaignStateKeyClassification.test.js
 *
 * Issue #364 CAMPAIGNSTATE-KEY-CLASSIFICATION (found while fixing issue #362
 * AC55).
 *
 * A move's record (persistResolution → mergeWithLatestState) writes the
 * pipeline's working copy — taken before the roll, seconds or minutes ago —
 * onto the store per a field policy: a field other writers own takes the
 * STORED value, an entity id list is unioned, the scene ledgers follow the
 * scene, three fields merge by a rule of their own, and EVERY OTHER FIELD
 * KEEPS THE WORKING COPY. That default is the trap: a field added to
 * campaignState and written only by its own writer, straight to the store, is
 * silently put back to its move-start value by the next move's record. Issue
 * #362 AC55 found four such fields (crewSupply, deletedChatMessages,
 * unsummarisedSession, sessionPerspective); nothing made anyone ask the
 * question when they were added.
 *
 * This test asks it. Every campaignState field — each key of
 * CampaignStateSchema, and each field production code keeps on campaignState
 * without a schema default (tests/helpers/sourceScan.js campaignStateFields:
 * the X-Card's, clocks, sessionSummary, …) — is classified below as one of:
 *
 *   STORE     written by its own writers, straight to the store (a relay, a
 *             hook, a command, a panel, the session lifecycle) — a move's
 *             record takes the stored value: it is on persistResolution.js
 *             STORE_OWNED_FIELDS
 *   IDS       an entity id list both sides append to — unioned, store first
 *             (entities/registry.js ENTITY_ID_LISTS)
 *   SCENE     an active-scene ledger — the store's scene wins when the scene
 *             changed mid-move, else the sidecar's working copy / a union by
 *             id (sceneLifecycle.js SCENE_FIELDS, mergeSceneLedgers)
 *   MERGED    both sides write it, and the record merges them by a rule of
 *             the field's own (mergeWithLatestState)
 *   PIPELINE  the move pipeline itself writes it on its working copy, so the
 *             record keeps the copy — and names the pipeline code that does
 *   UNWRITTEN no production code writes it (configuration, a retired or an
 *             unwired field) — either side holds the same value
 *
 * and the classification is checked against the code's own lists and against
 * what the real record does, the store and the working copy holding different
 * values for every field. So:
 *
 *   - a field added to the schema, or first written on campaignState, fails
 *     here until it is classified;
 *   - a field classified STORE fails until it is on STORE_OWNED_FIELDS (the
 *     AC55 defect, caught at the field's birth);
 *   - a field classified PIPELINE fails unless the named pipeline module
 *     really assigns it — "only other writers write it" cannot hide there.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { campaignStateFields, listedNames, productionSources } from '../helpers/sourceScan.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { persistResolution } from '../../src/moves/persistResolution.js';
import { ENTITY_ID_LISTS } from '../../src/entities/registry.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const STORE = 'store-owned', IDS = 'id-list', SCENE = 'scene-ledger', MERGED = 'merged', PIPELINE = 'pipeline-written', UNWRITTEN = 'unwritten';

/**
 * Who writes each campaignState field. A PIPELINE field names the pipeline
 * module that assigns it on the move's working copy (`file`).
 */
const CLASSIFICATION = {
  // World Truths — the truths flows (truths/generator.js), `!lore`.
  worldTruths:            STORE,
  worldTruthsSet:         STORE,
  worldTruthsJournalId:   STORE,
  loreRecap:              STORE,
  canonicalTruthSlugs:    UNWRITTEN,   // UNWIRED (known-issues CAMPAIGN-TRUTHS-UNWIRED)
  // Safety — the config sync, the Private Lines relay, Set a Flag, the X-Card.
  safety:                 STORE,
  safetyFlags:            STORE,
  xCardActive:            STORE,
  xCardPlays:             STORE,
  xCardRedirect:          STORE,
  xCardedNarrationIds:    STORE,
  // Sectors — `!sector`; the records themselves the pipeline also writes: an
  // expedition's site reveal, an uncharted destination's record.
  sectors:                { class: PIPELINE, file: 'src/moves/movePipeline.js' },
  activeSectorId:         STORE,
  // Entity ids.
  characterIds:           IDS,
  connectionIds:          IDS,
  settlementIds:          IDS,
  locationIds:            IDS,
  creatureIds:            IDS,
  shipIds:                IDS,
  planetIds:              IDS,
  factionIds:             IDS,
  // The art index — a portrait stored during the move, on either side.
  artAssetIds:            MERGED,
  // Where the scene is — `!at` and the Entities panel, and a move's arrival.
  currentLocationId:      { class: PIPELINE, file: 'src/index.js' },
  currentLocationType:    { class: PIPELINE, file: 'src/index.js' },
  incitingIncident:       STORE,
  dismissedEntities:      STORE,
  undismissedByNarration: STORE,
  crewSupply:             STORE,
  // Legacy tracks — the pipeline's marks, a `!bond`, a mark on the sheet.
  legacyTracks:           MERGED,
  // The next move's adds.
  nextMoveAdd:            STORE,
  nextMoveBonuses:        STORE,
  // The move lock — its own paths only.
  pendingMove:            STORE,
  pendingMoveBy:          STORE,
  pendingMoveClaim:       STORE,
  api:                    UNWRITTEN,   // configuration at its schema default
  // The session lifecycle (session/lifecycle.js, the Begin / End relays).
  currentSessionId:       STORE,
  sessionNumber:          STORE,
  lastSessionTimestamp:   STORE,
  sessionEndedId:         STORE,
  previousSessionSummary: STORE,
  // The rolling summary — the debounced refresh and the pipeline's narration.
  sessionSummary:         MERGED,
  deletedChatMessages:    STORE,
  unsummarisedSession:    STORE,
  sessionActive:          STORE,
  sessionActiveStartedAt: STORE,
  sessionStartedId:       STORE,
  sessionPerspective:     STORE,
  questFocus:             STORE,
  connectionFocus:        STORE,
  sessionFocus:           STORE,
  campaignRecapCache:     STORE,
  pacing:                 STORE,
  clocks:                 STORE,
  customOracles:          STORE,
  // The active scene.
  currentSceneId:         SCENE,
  sceneTruths:            SCENE,
  sceneState:             SCENE,
  sceneFrame:             SCENE,
  spotlight:              SCENE,
  sessionRetractions:     STORE,
  recentOracles:          STORE,
};

const fields = [...campaignStateFields().keys()].sort();
const classOf = (name) => (typeof CLASSIFICATION[name] === 'string' ? CLASSIFICATION[name] : CLASSIFICATION[name]?.class);
const fieldsOf = (cls) => fields.filter(name => classOf(name) === cls);

/** A value for a field that says which side it came from, in the shape its class or schema default has. */
function sample(name, side) {
  if (classOf(name) === IDS) return [`${side}:${name}`];
  const def = CampaignStateSchema[name];
  if (typeof def === 'boolean') return side === 'store';
  if (typeof def === 'number')  return side === 'store' ? 7 : 3;
  if (typeof def === 'string')  return `${side}:${name}`;
  if (Array.isArray(def))       return [`${side}:${name}`];
  return { from: side, name };
}

/** The scene ledgers of one side, on that side's own scene. */
function scene(side, sceneId) {
  return {
    currentSceneId: sceneId,
    sceneTruths:    [{ id: `t-${side}`, fact: `A fact the ${side} holds.`, retracted: false }],
    sceneState:     { bySubject: { [`${side}-subject`]: [{ attribute: 'where', value: side }] }, sceneId },
    sceneFrame:     { place: `the ${side}'s place`, sceneId },
    spotlight:      { lastActorId: `pc-${side}`, sceneId },
  };
}

/** The fields merged by a rule of their own, as each side holds them — the store's the newer and further along. */
const MERGED_SIDES = {
  store:   { artAssetIds: { 'art-store': 'Art: Store' }, legacyTracks: { bonds: { ticks: 8, cleared: false } },
             sessionSummary: { sessionId: 's-1', text: 'the store\'s summary', updatedAt: '2026-11-19T10:00:00.000Z' } },
  working: { artAssetIds: {}, legacyTracks: { bonds: { ticks: 2, cleared: false } },
             sessionSummary: { sessionId: 's-1', text: 'the copy\'s summary', updatedAt: '2026-11-19T09:00:00.000Z' } },
};

/** Every field holding `side`'s value. */
function stateOf(side, sceneId) {
  const out = {};
  for (const name of fields) out[name] = sample(name, side);
  return { ...out, ...scene(side, sceneId), ...structuredClone(MERGED_SIDES[side]) };
}

const resolution = () => ({
  _id: 'res-classify', moveId: 'face_danger', moveName: 'Face Danger', outcome: 'strong_hit',
  consequences: { momentumChange: 0, healthChange: 0, spiritChange: 0, supplyChange: 0 },
});

/** A move is recorded: the store holds `store`, the pipeline's working copy `working`. */
async function recordMove(store, working) {
  game.settings._store.set(KEY, store);
  await persistResolution(resolution(), working);
  return game.settings._store.get(KEY);
}

const recordAcrossScenes = () => recordMove(stateOf('store', 'sc-store'), stateOf('working', 'sc-working'));

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
});

describe('issue #364 CAMPAIGNSTATE-KEY-CLASSIFICATION — every campaignState field says who writes it', () => {
  it('every CampaignStateSchema key, and every field kept on campaignState without one, is classified', () => {
    expect(fields.length).toBeGreaterThan(Object.keys(CampaignStateSchema).length);
    const unclassified = fields.filter(name => !classOf(name));
    expect(unclassified, [
      'A campaignState field with no classification. Decide who writes it and add it to CLASSIFICATION in this test:',
      '  STORE     — only its own writer writes it, straight to the store (most new fields): ALSO add it to',
      '              STORE_OWNED_FIELDS in src/moves/persistResolution.js, or the next move\'s record puts it',
      '              back to its move-start value (issue #362 AC55)',
      '  IDS       — an entity id list (src/entities/registry.js ENTITY_ID_LISTS)',
      '  SCENE     — an active-scene ledger (src/factContinuity/sceneLifecycle.js SCENE_FIELDS)',
      '  MERGED    — both sides write it: give mergeWithLatestState a rule for it',
      '  PIPELINE  — the move pipeline writes it on its working copy; name the module that does',
      '  UNWRITTEN — no production code writes it',
    ].join('\n')).toEqual([]);
  });

  it('nothing is classified that is no longer a campaignState field', () => {
    expect(Object.keys(CLASSIFICATION).filter(name => !fields.includes(name))).toEqual([]);
  });

  it('every classification is one of the six', () => {
    const known = new Set([STORE, IDS, SCENE, MERGED, PIPELINE, UNWRITTEN]);
    expect(Object.keys(CLASSIFICATION).filter(name => !known.has(classOf(name)))).toEqual([]);
  });
});

describe('issue #364 CAMPAIGNSTATE-KEY-CLASSIFICATION — the classification is the merge policy\'s own lists', () => {
  it('store-owned: exactly STORE_OWNED_FIELDS (persistResolution.js)', () => {
    expect(fieldsOf(STORE)).toEqual(listedNames('src/moves/persistResolution.js', 'STORE_OWNED_FIELDS').sort());
  });

  it('id lists: exactly ENTITY_ID_LISTS (entities/registry.js)', () => {
    expect(fieldsOf(IDS)).toEqual([...ENTITY_ID_LISTS].sort());
  });

  it('scene ledgers: exactly SCENE_FIELDS (sceneLifecycle.js)', () => {
    expect(fieldsOf(SCENE)).toEqual(listedNames('src/factContinuity/sceneLifecycle.js', 'SCENE_FIELDS').sort());
  });
});

describe('issue #364 CAMPAIGNSTATE-KEY-CLASSIFICATION — a move\'s record treats each field as it is classified', () => {
  it.each(fieldsOf(STORE))('store-owned: %s takes the stored value, not the move-start copy', async (name) => {
    const after = await recordAcrossScenes();
    expect(after[name], `${name} is classified store-owned, but a move's record wrote its working copy over the store`).toEqual(sample(name, 'store'));
  });

  it.each(fieldsOf(IDS))('id list: %s is the union of both sides, the store\'s first', async (name) => {
    const after = await recordAcrossScenes();
    expect(after[name]).toEqual([`store:${name}`, `working:${name}`]);
  });

  it.each(fieldsOf(SCENE))('scene ledger: %s is the store\'s when the scene changed while the move resolved', async (name) => {
    const after = await recordAcrossScenes();
    expect(after[name]).toEqual(scene('store', 'sc-store')[name]);
  });

  it('scene ledgers, same scene: the truths are unioned by id; the state, the frame and the spotlight keep the working copy', async () => {
    const after = await recordMove(stateOf('store', 'sc-1'), stateOf('working', 'sc-1'));
    expect(after.currentSceneId).toBe('sc-1');
    expect(after.sceneTruths.map(t => t.id)).toEqual(['t-store', 't-working']);
    for (const name of ['sceneState', 'sceneFrame', 'spotlight']) expect(after[name], name).toEqual(scene('working', 'sc-1')[name]);
  });

  it.each(fieldsOf(MERGED))('merged: %s is not the stale working copy when the store moved on', async (name) => {
    expect(Object.keys(MERGED_SIDES.store), 'each merged field has its two sides in MERGED_SIDES').toContain(name);
    const after = await recordAcrossScenes();
    // The store's record is the newer / the further along: it stands (the merge may add its own bookkeeping).
    expect(after[name]).toMatchObject(MERGED_SIDES.store[name]);
  });

  it.each(fieldsOf(PIPELINE))('pipeline-written: %s keeps the move\'s working copy', async (name) => {
    const after = await recordAcrossScenes();
    expect(after[name]).toEqual(sample(name, 'working'));
  });

  it.each(fieldsOf(PIPELINE))('pipeline-written: %s is assigned on the working copy by the pipeline module named', (name) => {
    const { file } = CLASSIFICATION[name];
    const source = productionSources().find(s => s.file === file);
    expect(source, `${file} is not a production source file`).toBeTruthy();
    expect(new RegExp(`\\bcampaignState\\.${name}\\s*=[^=]`).test(source.mask),
      `${name} is classified pipeline-written, but ${file} never assigns campaignState.${name} — a field only other writers write is store-owned`)
      .toBe(true);
  });

  it.each(fieldsOf(UNWRITTEN))('unwritten: no production code writes %s', (name) => {
    expect(campaignStateFields().get(name).writes).toEqual([]);
  });
});
