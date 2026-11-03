/**
 * PROBE — FC-01 SCENE-PLACE-AT-END
 * (src/factContinuity/sceneLifecycle.js endScene → resolveScenePlace;
 *  src/factContinuity/ledgers.js applySidecar)
 *
 * What the user does: plays a session that moves between recorded places.
 * While the scene frame says "Bleakhold" the narrator records a scene-subject
 * truth ("the bar is called the Rusty Lantern" — the decision's own example).
 * The crew then sets a course and the frame moves to "Ironway". Nothing ends
 * the scene on travel: scenes end only at `!scene end`, End a Session, the
 * four-hour re-mint and closeWorld, so a whole session is usually one scene.
 *
 * What happens: endScene resolves ONE place for the whole scene — the frame's
 * location when the scene ends (resolveScenePlace reads
 * campaignState.sceneFrame.location once) — and files every scene-subject
 * truth on that place's card. The Rusty Lantern lands on Ironway's card as a
 * binding "scene_truth_migration" detail, and the narrator is told about it
 * whenever Ironway is in play.
 *
 * What should happen: a scene truth is filed on the place it was asserted at
 * (or archived as lore when that place is unknown) — never on a place the
 * scene reached later. decisions.md "Scene end keeps whereabouts and place
 * details": "a detail filed on the wrong place is worse than one archived as
 * lore" (sceneLifecycle.js:309-310 says the same).
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/world/worldJournal.js', () => ({
  archiveSceneTruth: vi.fn(async (truth) => ({ pageId: `page-${truth?.id ?? 'auto'}`, journalId: 'journal-lore' })),
}));
vi.mock('../../../src/entities/entityExtractor.js', () => ({
  appendMigratedTruthToTier: vi.fn(async () => true),
}));

import { endScene } from '../../../src/factContinuity/sceneLifecycle.js';
import { applySidecar, applySceneFrame } from '../../../src/factContinuity/ledgers.js';
import { appendMigratedTruthToTier } from '../../../src/entities/entityExtractor.js';

const MODULE_ID = 'starforged-companion';

function addPlace(id, name) {
  const actor = globalThis.makeTestActor({
    id, name, type: 'location',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name } } },
  });
  global.game.actors._set(id, actor);
}

function sessionScene() {
  addPlace('act-bleak', 'Bleakhold');
  addPlace('act-iron',  'Ironway');
  return {
    currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1',
    settlementIds: ['act-bleak', 'act-iron'], dismissedEntities: [],
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
  };
}

/** One narration: its frame and its truths, as applySidecarSideData applies them. */
function narrate(cs, location, truths = []) {
  applySidecar({ newTruths: truths, stateChanges: [] }, { campaignState: cs });
  applySceneFrame({ location, present: [], situation: `At ${location}` }, cs);
}

const RUSTY = { subject: 'scene', fact: 'the bar is called the Rusty Lantern' };
const filedOn = (placeId) => appendMigratedTruthToTier.mock.calls
  .filter(([id, , entry]) => id === placeId && entry?.detail === RUSTY.fact);

beforeEach(() => {
  global.game.actors._reset();
  appendMigratedTruthToTier.mockClear();
});

describe('a scene-subject truth is filed on the place it was asserted at', () => {
  it('control: a scene that stays at Bleakhold files the truth on Bleakhold', async () => {
    const cs = sessionScene();
    narrate(cs, 'Bleakhold', [RUSTY]);
    await endScene(cs, { reason: 'session_close' });
    expect(filedOn('act-bleak')).toHaveLength(1);
  });

  it('a truth asserted at Bleakhold is not filed on Ironway because the session ended there', async () => {
    const cs = sessionScene();
    narrate(cs, 'Bleakhold', [RUSTY]);        // in the bar at Bleakhold
    narrate(cs, 'Ironway');                   // Set a Course; the frame moves on
    await endScene(cs, { reason: 'session_close' });

    // Today: appendMigratedTruthToTier('act-iron', 'settlement', { detail: 'the bar is called the Rusty Lantern' }).
    expect(filedOn('act-iron')).toHaveLength(0);
  });
});
