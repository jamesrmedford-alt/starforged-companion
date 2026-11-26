/**
 * STARFORGED COMPANION
 * tests/unit/expeditionLegsOneScene.test.js
 *
 * Issue #389 #9, EXPEDITION-LEGS-TURN-THE-SCENE. The sixth live round turned
 * the scene on every leg of an expedition:
 *   - the second run's a22 began a scene for the expedition ("the expedition
 *     Source of the clipped hauler's distress call has begun"), and a23 — the
 *     peril's choice, with no new place — turned it again for the ship
 *     ("Kobayashi IV is now uncharted space on the bearing …");
 *   - the first run's a23, a24 and a25 each began a scene of one beat (ship,
 *     ship, place).
 * Each leg's narration moves the ship, as the move's result, after the scene's
 * anchor was written; out in uncharted space every new phrase is a new place.
 *
 * Now, while an expedition is under way, the ship moving is the journey's and
 * turns nothing; a new expedition still turns the scene, and its arrival turns
 * it as a place.
 */

import { describe, it, expect } from 'vitest';
import { sceneTurnDue, sceneAnchorOf, sceneStores } from '../../src/factContinuity/sceneTurns.js';

const HOLLOW = { id: 'set-hollow', type: 'settlement', name: 'Hollow Spire' };
const SOURCE = { id: 'loc-source', type: 'location', name: 'Source of the Clipped Hauler\'s Distress Call' };
const AT_HOLLOW = { key: 'id:set-hollow', line: 'SHIP POSITION: Kobayashi IV docked at Hollow Spire (Cinder Expanse)', name: 'Kobayashi IV' };
const LEG_1 = { key: 'text:uncharted space on the bearing to the distress call\'s source', line: 'SHIP POSITION: Kobayashi IV uncharted space on the bearing to the distress call\'s source', name: 'Kobayashi IV' };
const LEG_2 = { key: 'text:at a debris field', line: 'SHIP POSITION: Kobayashi IV at a debris field', name: 'Kobayashi IV' };
const EXPEDITION = { id: 'trk-source', type: 'expedition', label: 'Source of the clipped hauler\'s distress call' };

const stores = (over = {}) => sceneStores({ place: HOLLOW, ship: AT_HOLLOW, openTracks: [], ...over });
const anchorOf = (over, cause, what) => sceneAnchorOf(stores(over), { sceneId: 'sc-1', cause, what });

describe('an expedition\'s legs are one scene (issue #389 #9)', () => {
  it('a22 → a23: the expedition\'s scene does not turn again when its leg moves the ship', () => {
    const began = anchorOf({ openTracks: [EXPEDITION] }, 'expedition', 'the expedition Source of the clipped hauler\'s distress call has begun');
    expect(sceneTurnDue(began, stores({ ship: LEG_1, openTracks: [EXPEDITION] }))).toBeNull();
    expect(sceneTurnDue(began, stores({ ship: LEG_2, openTracks: [EXPEDITION] }))).toBeNull();
  });

  it('the first run\'s a23: the leg that begins the expedition turns the scene for the expedition, not the ship', () => {
    const docked = anchorOf({}, 'session', 'the session begins');
    expect(sceneTurnDue(docked, stores({ ship: LEG_1, openTracks: [EXPEDITION] })))
      .toEqual({ cause: 'expedition', what: expect.stringContaining('Source of the clipped hauler') });
  });

  it('the arrival turns, as a place', () => {
    const began = anchorOf({ openTracks: [EXPEDITION] }, 'expedition', 'the expedition has begun');
    expect(sceneTurnDue(began, stores({ place: SOURCE, ship: LEG_2, openTracks: [EXPEDITION] }), { moveId: 'finish_an_expedition' }))
      .toEqual({ cause: 'place', what: 'the characters have reached Source of the Clipped Hauler\'s Distress Call' });
  });

  it('control: with no expedition under way, the ship moving still turns the scene', () => {
    const docked = anchorOf({}, 'session', 'the session begins');
    expect(sceneTurnDue(docked, stores({ ship: LEG_1 }))).toEqual({ cause: 'ship', what: expect.stringContaining('uncharted space') });
  });
});
