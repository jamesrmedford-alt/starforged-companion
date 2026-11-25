/**
 * STARFORGED COMPANION
 * tests/unit/shipRecordKeptAgainstTheNarration.test.js
 *
 * Issue #388 #2 (SHIP-POSITION-BY-THE-NARRATION). A narration's fact block
 * wrote the ship's position whatever its basis, as the narrator's — which
 * the SHIP POSITION line reads as "near". In the long haul's fifth live run:
 *
 *   - a27: Set a Course docked the Kobayashi IV at Bleakhold Station; its own
 *     narration's block, `{ "subject": "ship", "attribute": "position",
 *     "value": "Bleakhold Station", "from": "line" }`, re-wrote her as
 *     "near", and every narration after it had her berthed against a record
 *     that did not;
 *   - a25: an untagged block — the narrator's colour — moved her "at the
 *     source of the distress call, in a drift of frozen asteroids";
 *   - a26: an untagged restatement undid the expedition's arrival.
 *
 * Now the narration moves her only by what binds (the player's line, a
 * rolled move's result, the premise — D17), and one that says where she
 * already is keeps her record. A line that moves her, docked to drifting
 * clear, still does.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { applyNarratorSidecar } from '../../src/narration/narrator.js';
import { formatShipPositionLine } from '../../src/factContinuity/shipPosition.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const position = () => game.actors.get('actor-ship').flags[MODULE_ID].ship.position;
const DOCKED = { nearestSettlementId: 'act-bleak', updatedBy: 'set_a_course' };

/** A narration's fact block with one ship change, applied as the narrator applies one. */
function narrate(change, ctx) {
  const sidecar = { newTruths: [], stateChanges: [{ subject: 'ship', attribute: 'position', ...change }] };
  applyNarratorSidecar(`The Kobayashi IV sits in the ring's light.\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``, stored(),
    { narrationId: `nar-${Math.random().toString(36).slice(2, 8)}`, ...ctx });
}
const settle = () => new Promise(r => setTimeout(r, 30));

beforeEach(() => {
  game.settings._store.clear();
  game.actors._reset();
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.actors._set('act-bleak', makeTestActor({
    id: 'act-bleak', name: 'Bleakhold Station', type: 'location',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold Station' } } },
  }));
  game.actors._set('actor-ship', makeTestActor({
    id: 'actor-ship', type: 'starship', name: 'Kobayashi IV',
    flags: { [MODULE_ID]: { entityType: 'ship', ship: {
      _id: 'rec-ship', name: 'Kobayashi IV', isCommandVehicle: true,
      position: { nearestSettlementId: 'act-bleak', nearestPlanetId: null, sectorId: null, freeText: '', updatedBy: 'set_a_course' },
    } } },
  }));
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    shipIds: ['actor-ship'], settlementIds: ['act-bleak'], xCardActive: false, xCardPlays: 0,
  });
});

describe('the ship\'s record against her narration (issue #388 #2)', () => {
  it('a27: Set a Course\'s narration restating "Bleakhold Station" keeps her docked', async () => {
    narrate({ value: 'Bleakhold Station', from: 'line' }, { mode: 'move_resolution',
      ground: { line: 'I leave the hauler behind, plot the route to Bleakhold Station, and take the Kobayashi IV there.', decided: '', rolled: true } });
    await settle();
    expect(position()).toMatchObject(DOCKED);
    expect(formatShipPositionLine(position(), stored(), 'Kobayashi IV')).toBe('SHIP POSITION: Kobayashi IV docked at Bleakhold Station');
  });

  it('…and "docked at Bleakhold Station" or "in her berth at Bleakhold Station" restates it too', async () => {
    for (const value of ['docked at Bleakhold Station', 'in her berth at Bleakhold Station', "Bleakhold Station's docking bay"]) {
      narrate({ value, from: 'result' }, { mode: 'move_resolution', ground: { line: '', decided: '', rolled: true } });
      await settle();
      expect(position(), value).toMatchObject(DOCKED);
    }
  });

  it('a25: the narration\'s colour — an untagged block — never moves her', async () => {
    narrate({ value: 'at the source of the distress call, in a drift of frozen asteroids in uncharted space' }, { mode: 'move_resolution',
      ground: { line: 'I slow the Kobayashi IV at the source of the call and go over the place carefully.', decided: '', rolled: true } });
    await settle();
    expect(position()).toMatchObject(DOCKED);
  });

  it('a result tag on a move with no roll, or a line tag the line does not bear out, is colour too', async () => {
    narrate({ value: 'off the far side of the ring', from: 'result' }, { mode: 'move_resolution', ground: { line: '', decided: '' } });
    narrate({ value: 'off the far side of the ring', from: 'line' }, { mode: 'paced_narrative', ground: { line: 'I sit with Tamsin over the ledger.', decided: '' } });
    await settle();
    expect(position()).toMatchObject(DOCKED);
  });

  it('a line that moves her does: docked, then drifting clear of the ring, read as near', async () => {
    narrate({ value: "drifting clear of Bleakhold Station's docking ring", from: 'line' }, { mode: 'paced_narrative',
      ground: { line: 'I release the clamps and let her drift clear of the docking ring.', decided: '' } });
    await vi.waitFor(() => expect(position().updatedBy).toBe('narrator_sidecar'));
    expect(position().nearestSettlementId).toBe('act-bleak');
    expect(formatShipPositionLine(position(), stored(), 'Kobayashi IV')).toBe('SHIP POSITION: Kobayashi IV near Bleakhold Station');
  });

  it('a24: the player\'s line taking her out into uncharted space moves her', async () => {
    narrate({ value: "uncharted space off the Cinder Expanse lane, following the distress call's bearing", from: 'line' }, { mode: 'move_resolution',
      ground: { line: "I turn the Kobayashi IV off the charted lane, out into uncharted space along its bearing.", decided: '', rolled: true } });
    await vi.waitFor(() => expect(position().freeText).toBe("uncharted space off the Cinder Expanse lane, following the distress call's bearing"));
  });
});
