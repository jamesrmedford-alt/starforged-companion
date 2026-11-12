/**
 * END-SCENE-NEXT-SCENE (known-issues; pre-existing). endScene's final write
 * cleared the scene fields — `sceneTruths`, `sceneState`, `sceneFrame`,
 * `currentSceneId`, the spotlight, a `!pace` override — on the latest store,
 * whatever scene the store held by then. A scene started on another client
 * during its awaits (another GM's `!scene start`, a narration there) was
 * closed with the old one: its id, truths, state and frame were wiped, none
 * of them migrated (issue #325 W24 migrates the OLD scene's late facts; it
 * does not guard this). The end now leaves a scene it did not end open, and
 * writes only the session's kept retractions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ duringArchive: null }));

vi.mock('../../src/world/worldJournal.js', () => ({
  archiveSceneTruth: vi.fn(async (truth) => {
    const run = hooks.duringArchive;
    hooks.duringArchive = null;
    if (run) await run();
    return { pageId: `page-${truth?.id ?? 'auto'}`, journalId: 'journal-lore' };
  }),
}));
vi.mock('../../src/entities/entityExtractor.js', () => ({
  appendMigratedTruthToTier: vi.fn(async () => true),
}));

import { endScene } from '../../src/factContinuity/sceneLifecycle.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');

const truth = (id, sceneId, fact, extra = {}) => ({
  id, subject: { kind: 'text', text: 'the dockmaster' }, fact,
  sessionId: 'sess-5', sessionNum: 5, sceneId, moveId: null, source: 'narrator_sidecar',
  asserter: 'narrator', createdAt: 1, retracted: false, retractedBy: null, retractedAt: null,
  correctedTo: null, migratedTo: null, ...extra,
});

beforeEach(() => {
  hooks.duringArchive = null;
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-5', sessionNumber: 5, currentSceneId: 'sc-1', dismissedEntities: [],
    sceneTruths: [
      truth('tr-old00001', 'sc-1', 'Owes the crew a favour'),
      truth('tr-old00002', 'sc-1', 'Is dead', { retracted: true, retractedBy: 'gm', retractedAt: 2 }),
    ],
    sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: { location: 'Bleakhold docks' },
    pacing: { sceneOverride: 'hot' },
  });
});

/** Another client starts scene sc-2 — and narrates a fact into it — while this end is migrating sc-1. */
function nextSceneStartsMeanwhile() {
  hooks.duringArchive = async () => {
    const cs = stored();
    game.settings._store.set(KEY, {
      ...cs,
      currentSceneId: 'sc-2',
      sceneTruths: [truth('tr-new00001', 'sc-2', 'Locked the outer gate')],
      sceneState: { bySubject: { 'the warden': [{ attribute: 'location', value: 'the outer gate', updatedAt: 3 }] }, sceneId: 'sc-2' },
      sceneFrame: { location: 'the outer gate' },
      spotlight: { lastActorId: 'pc-1', sceneId: 'sc-2' },
      pacing: { sceneOverride: 'quiet' },
    });
  };
}

describe('END-SCENE-NEXT-SCENE — a scene started during endScene\'s awaits is not closed with the old one', () => {
  it('control: with no other scene started, the end clears the scene and its pacing override', async () => {
    await endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });
    expect(stored().currentSceneId).toBeNull();
    expect(stored().sceneTruths).toEqual([]);
    expect(stored().sceneFrame).toBeNull();
    expect(stored().pacing.sceneOverride).toBeNull();
  });

  it('the new scene keeps its id, truths, state, frame, spotlight and pacing', async () => {
    nextSceneStartsMeanwhile();
    await endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });
    const now = stored();
    expect(now.currentSceneId).toBe('sc-2');
    expect(now.sceneTruths.map(t => t.fact)).toEqual(['Locked the outer gate']);
    expect(now.sceneState.bySubject['the warden']).toHaveLength(1);
    expect(now.sceneFrame).toEqual({ location: 'the outer gate' });
    expect(now.spotlight).toEqual({ lastActorId: 'pc-1', sceneId: 'sc-2' });
    expect(now.pacing.sceneOverride).toBe('quiet');
  });

  it('the ended scene\'s strike is still kept for the session', async () => {
    nextSceneStartsMeanwhile();
    await endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });
    expect((stored().sessionRetractions?.facts ?? []).map(f => `${f.label} — ${f.fact}`))
      .toEqual(['the dockmaster — Is dead']);
  });
});
