// tests/probes/narration/xcardShipPositionStays.probe.js
//
// PROBE (eighth audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// NR XCARD-SHIP-POSITION — a ship move written by the narration the X-Card
// removes stays on the ship, and SHIP POSITION keeps telling the narrator.
//
// What the user does: a narration ends with the crew's ship arriving at "the
// Bone Pits" (its sidecar emits the REQUIRED `ship / position` stateChange).
// A player plays the X-Card on that narration.
//
// What happens: applySidecarSideData (src/narration/narrator.js) routes the
// `ship / position` change out of the ledger to applyShipPositionChanges,
// which writes it to the command vehicle (updateShip) and moves the map token
// — with no narrationId. applyXCardToNarratorMemory retracts what the
// narration wrote BY narrationId (truths, state, frame) and never touches the
// ship record. The ledger block's SHIP POSITION line (buildShipPositionLine,
// never dropped) keeps rendering "Wayfarer — near the Bone Pits" in every
// later prompt, and the X-CARD — REDIRECT block's "do not … bring back
// anything it introduced" is contradicted by the binding position line.
// Full exclusion (decisions.md "X-Card: anyone plays it, a GM resumes it")
// removes the narration's facts.
//
// What should happen: the position the X-carded narration set is undone (the
// ship back where it was before), or at least no longer asserted.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { buildShipPositionLine } from '../../../src/narration/narratorPrompt.js';
import { suppressScene } from '../../../src/context/safety.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-3';
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)); };

beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.actors._set('ship-1', makeTestActor({
    id: 'ship-1', type: 'starship', name: 'Wayfarer', ownership: { default: 3 },
    flags: { [MODULE_ID]: { entityType: 'ship', ship: {
      _id: 'rec-ship', name: 'Wayfarer', isCommandVehicle: true,
      position: { freeText: 'the Kaan relay', updatedBy: 'manual', updatedAt: '2026-11-01T00:00:00.000Z' },
    } } },
  }));
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 3, currentSceneId: 'sc-1', shipIds: ['ship-1'],
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0,
  });
});

describe('the X-Card takes back the ship move its narration made', () => {
  it('SHIP POSITION no longer names the place the X-carded narration moved the ship to', async () => {
    expect(buildShipPositionLine(stored())).toContain('Kaan relay');            // control: before

    const raw = 'The Wayfarer drops out of the slipstream above the Bone Pits.\n```json\n'
      + JSON.stringify({ newTruths: [], stateChanges: [{ subject: 'ship', attribute: 'position', value: 'the Bone Pits' }] })
      + '\n```';
    const text = applyNarratorSidecar(raw, stored(), { narrationId: 'nar-pits' });
    await settle();
    await postNarrationCard(text, { moveId: 'set_a_course', outcome: 'strong_hit', _id: 'res-1' }, stored(),
      { playerText: 'We head for the Pits.', playerName: 'Kira', narrationId: 'nar-pits' });
    global.game.messages = { contents: ChatMessage._created.slice() };
    expect(buildShipPositionLine(stored())).toContain('Bone Pits');             // the narration moved it

    await suppressScene({}, { local: true });                                   // the X-Card on that narration
    await settle();

    expect(buildShipPositionLine(stored())).not.toContain('Bone Pits');
  });
});
