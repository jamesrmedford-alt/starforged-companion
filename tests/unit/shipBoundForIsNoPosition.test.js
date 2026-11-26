/**
 * STARFORGED COMPANION
 * tests/unit/shipBoundForIsNoPosition.test.js
 *
 * Issue #389 #8, SHIP-BOUND-FOR-READ-AS-NEAR. The sixth live long haul's a31:
 * "I plot the route out of the hauler's bay and take the Kobayashi IV to
 * Bleakhold Station." was offered Set a Course, and nothing was rolled. The
 * narration had it right ("Nothing has been flown yet"), and so did its fact
 * block — `{ "subject": "ship", "attribute": "position", "value": "leaving
 * the clipped hauler, bound for Bleakhold Station", "from": "line" }`. But the
 * ship's record became "Kobayashi IV near Bleakhold Station":
 * `inferShipPosition` reads on to the first place a phrase names, and
 * "bound for" names where she is going. A miss would have left her there with
 * nothing flown.
 *
 * Now:
 *   - a place after a destination's words ("bound for", "toward", "en route
 *     to", …) is no position there, and the phrase is kept as its words;
 *   - a beat that offers a journey move (Set a Course, Undertake or Finish an
 *     Expedition) moves the ship nowhere before its roll: the arrival is the
 *     move's own, as the walk rule already has it.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { applyNarratorSidecar } from '../../src/narration/narrator.js';
import { inferShipPosition, whereSheIsOf, formatShipPositionLine } from '../../src/factContinuity/shipPosition.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const position = () => game.actors.get('actor-ship').flags[MODULE_ID].ship.position;
const settle = () => new Promise(r => setTimeout(r, 30));
const A31 = 'leaving the clipped hauler, bound for Bleakhold Station';
const LINE = 'I plot the route out of the hauler\'s bay and take the Kobayashi IV to Bleakhold Station.';

function narrate(change, ctx) {
  const sidecar = { newTruths: [], stateChanges: [{ subject: 'ship', attribute: 'position', ...change }] };
  applyNarratorSidecar(`You turn the bow toward Bleakhold Station and lay the heading in.\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``, stored(),
    { narrationId: `nar-${Math.random().toString(36).slice(2, 8)}`, ...ctx });
}

beforeEach(() => {
  game.settings._store.clear();
  game.actors._reset();
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  for (const [id, name] of [['act-bleak', 'Bleakhold Station'], ['act-spire', 'Hollow Spire']]) {
    game.actors._set(id, makeTestActor({
      id, name, type: 'location',
      flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name } } },
    }));
  }
  game.actors._set('actor-ship', makeTestActor({
    id: 'actor-ship', type: 'starship', name: 'Kobayashi IV',
    flags: { [MODULE_ID]: { entityType: 'ship', ship: {
      _id: 'rec-ship', name: 'Kobayashi IV', isCommandVehicle: true,
      position: { nearestSettlementId: null, nearestPlanetId: null, sectorId: null, freeText: 'docked in the clipped hauler\'s bay', updatedBy: 'expedition' },
    } } },
  }));
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    shipIds: ['actor-ship'], settlementIds: ['act-bleak', 'act-spire'], xCardActive: false, xCardPlays: 0,
  });
});

describe('a destination is no position (issue #389 #8)', () => {
  it('the words before a destination\'s are where she is', () => {
    expect(whereSheIsOf(A31)).toBe('leaving the clipped hauler, ');
    expect(whereSheIsOf('docked at Hollow Spire, heading for Bleakhold Station')).toBe('docked at Hollow Spire, ');
    expect(whereSheIsOf('en route to Bleakhold Station')).toBe('');
    expect(whereSheIsOf('drifting toward the ring')).toBe('drifting ');
    expect(whereSheIsOf('docked at Bleakhold Station')).toBe('docked at Bleakhold Station');
  });

  it('a31\'s phrase is kept as its words, not "near Bleakhold Station"; a place named before it is still the place', () => {
    const bound = inferShipPosition(A31, stored(), { source: 'narrator_sidecar' });
    expect(bound).toMatchObject({ nearestSettlementId: null, freeText: A31 });
    expect(formatShipPositionLine(bound, stored(), 'Kobayashi IV')).not.toMatch(/near Bleakhold/);
    expect(inferShipPosition('docked at Hollow Spire, bound for Bleakhold Station', stored(), {})).toMatchObject({ nearestSettlementId: 'act-spire' });
    expect(inferShipPosition('in a berth at Bleakhold Station', stored(), {})).toMatchObject({ nearestSettlementId: 'act-bleak' });
  });
});

describe('an offered journey moves the ship nowhere before its roll (issue #389 #8)', () => {
  // The write is asynchronous: a line with no journey offered moves her first,
  // and is waited for, so the import path is warm and "unchanged" means
  // unchanged — not "not landed yet".
  async function movedByALine() {
    narrate({ value: 'out past the ring', from: 'line' }, { mode: 'paced_narrative', offer: null,
      ground: { line: 'I take the Kobayashi IV out past the ring.', decided: '' } });
    await vi.waitFor(() => expect(position().freeText).toBe('out past the ring'));
  }
  const longSettle = () => new Promise(r => setTimeout(r, 150));

  it('a31: Set a Course offered — the line\'s change is dropped, and her record stays', async () => {
    await movedByALine();
    narrate({ value: 'docked at Bleakhold Station', from: 'line' }, { mode: 'paced_narrative', offer: 'set_a_course',
      ground: { line: 'I take the Kobayashi IV in to dock at Bleakhold Station.', decided: '' } });
    await longSettle();
    expect(position()).toMatchObject({ nearestSettlementId: null, freeText: 'out past the ring' });
  });

  it('an offered expedition the same', async () => {
    await movedByALine();
    narrate({ value: 'docked at Hollow Spire', from: 'line' }, { mode: 'paced_narrative', offer: 'undertake_an_expedition',
      ground: { line: 'I take the Kobayashi IV out and dock at Hollow Spire.', decided: '' } });
    await longSettle();
    expect(position()).toMatchObject({ nearestSettlementId: null, freeText: 'out past the ring' });
  });
});
