/**
 * STARFORGED COMPANION
 * tests/unit/pacingOverrideSurvivesATurn.test.js
 *
 * Overhaul 2, slice 2 (§4.4, D16 — amends issue #322 V21's "the override ends
 * with the scene" for a scene that turns): under scenes that turn on their
 * own, a fight's start would end the `!pace hot` set for it. A turn leaves the
 * `!pace` override; the GM's `!scene end` clears it as before, as do a
 * `!scene start` over the scene and End a Session (paceOverrideSceneEnd.test.js).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/world/worldJournal.js', () => ({ archiveSceneTruth: vi.fn(async () => ({ pageId: null })) }));
vi.mock('../../src/entities/entityExtractor.js', () => ({ appendMigratedTruthToTier: vi.fn(async () => false) }));

import { endScene, turnSceneIfDue } from '../../src/factContinuity/sceneLifecycle.js';
import { applyPaceCommand } from '../../src/pacing/router.js';

const CS = 'starforged-companion.campaignState';
const stored = () => game.settings._store.get(CS);
const ANCHOR = { sceneId: 'sc-1', at: 1, cause: 'first', what: '', place: { id: 'set-bleak', type: 'settlement', name: 'Bleakhold' },
  ship: null, tracks: { combat: [], expedition: [], scene_challenge: [] } };

beforeEach(() => {
  game.settings._store.set(CS, {
    currentSessionId: 's1', currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
    currentLocationId: 'set-bleak', currentLocationType: 'settlement', sceneBegan: ANCHOR,
    pacing: { sceneOverride: null, forceNextAsMove: false },
  });
});

describe('overhaul 2 D16 — a `!pace` override lasts across a turn', () => {
  it('`!pace hot`, then the characters move on: the scene turns, and the override stands in the new one', async () => {
    await applyPaceCommand(structuredClone(stored()), 'hot');
    expect(stored().pacing.sceneOverride).toMatchObject({ modifier: 3 });
    const turned = await turnSceneIfDue({ ...structuredClone(stored()), currentLocationId: 'set-hollow' }, {});
    expect(turned).toMatchObject({ cause: 'place' });
    expect(stored().currentSceneId).not.toBe('sc-1');
    expect(stored().pacing.sceneOverride).toMatchObject({ modifier: 3 });
  });

  it('…and the GM\'s `!scene end` clears it, as before', async () => {
    await applyPaceCommand(structuredClone(stored()), 'hot');
    await turnSceneIfDue({ ...structuredClone(stored()), currentLocationId: 'set-hollow' }, {});
    await endScene(structuredClone(stored()), { reason: 'scene_command' });
    expect(stored().pacing.sceneOverride).toBeNull();
  });

  it('a turn\'s end leaves the override however it was made; its anchor goes with the scene', async () => {
    await applyPaceCommand(structuredClone(stored()), 'quiet');
    await endScene(structuredClone(stored()), { reason: 'place', turn: true });
    expect(stored().pacing.sceneOverride).toMatchObject({ modifier: -3 });
    expect(stored().currentSceneId).toBeNull();
    expect(stored().sceneBegan ?? null).toBeNull();
  });

  it('control: nothing changed — no turn, the scene and the override as they were', async () => {
    await applyPaceCommand(structuredClone(stored()), 'hot');
    expect(await turnSceneIfDue(structuredClone(stored()), { line: 'I look around.' })).toBeNull();
    expect(stored().currentSceneId).toBe('sc-1');
  });
});
