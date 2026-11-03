/**
 * PROBE — FC-15 XCARD-LOSES-EARLIER-STATE
 * (src/factContinuity/ledgers.js applySidecar state loop + retractNarrations)
 *
 * What the user does: narration A (kept) records "the dockmaster — location:
 * the cargo bay" and the scene frame (Where: the docking ring; Present: the
 * dockmaster). Narration B moves him — "location: the interrogation cell",
 * with a new frame — and a player plays the X-Card on B.
 *
 * What happens: applySidecar stores a state change by REPLACING the entry for
 * that subject + attribute in place (`list[idx] = entry`), and applySceneFrame
 * replaces the frame — neither keeps the value it superseded. The X-Card's
 * retractNarrations then removes B's entry and clears B's frame, so the
 * dockmaster has no location at all and the scene has no frame: narration
 * A's facts — which the X-Card did not touch — are gone too. After Resume the
 * redirect narration is written with no SCENE FRAME and no whereabouts for
 * the dockmaster (a REQUIRED emission that A made and nothing re-makes), and
 * at scene end his card's LAST KNOWN location is not updated from A.
 *
 * What should happen: the X-Card takes out what the removed narration
 * contributed and nothing more — the dockmaster is in the cargo bay again, as
 * A left him (issue #321 U07: "its state … removed" — B's, not A's). The
 * frame half of this is pinned as decided ("a frame they wrote cleared",
 * tests/unit/xcardNarratorMemory.test.js), so this probe asserts the state.
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect } from 'vitest';
import { applySidecar, applySceneFrame, retractNarrations } from '../../../src/factContinuity/ledgers.js';

function narrate(cs, narrationId, sidecar) {
  applySidecar(sidecar, { campaignState: cs, narrationId });
  if (sidecar.sceneFrame) applySceneFrame(sidecar.sceneFrame, cs, { narrationId });
}

const A = {
  newTruths: [],
  stateChanges: [{ subject: 'the dockmaster', attribute: 'location', value: 'the cargo bay' }],
  sceneFrame: { location: 'the docking ring', present: ['the dockmaster'], situation: 'Haggling over berths' },
};
const B = {
  newTruths: [],
  stateChanges: [{ subject: 'the dockmaster', attribute: 'location', value: 'the interrogation cell' }],
  sceneFrame: { location: 'the interrogation cell', present: ['the dockmaster'], situation: 'The torch comes out' },
};

describe('the X-Card on narration B leaves narration A\'s facts in place', () => {
  it("control: B's own values are gone after the X-Card", () => {
    const cs = { currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' } };
    narrate(cs, 'nar-A', A);
    narrate(cs, 'nar-B', B);
    retractNarrations(cs, ['nar-B']);
    expect(JSON.stringify(cs.sceneState)).not.toMatch(/interrogation cell/);
    expect(cs.sceneFrame?.location ?? null).not.toBe('the interrogation cell');
  });

  // The frame half (A's frame cleared with B's) is pinned as decided by
  // tests/unit/xcardNarratorMemory.test.js ("a frame they wrote cleared");
  // the state half is not.
  it("the dockmaster's location is A's again, not erased", () => {
    const cs = { currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' } };
    narrate(cs, 'nar-A', A);
    narrate(cs, 'nar-B', B);
    retractNarrations(cs, ['nar-B']);   // what the X-Card's pause write does (applyXCardToNarratorMemory)

    // Today: bySubject {} — the dockmaster has no location at all.
    expect(cs.sceneState.bySubject['the dockmaster']).toEqual([expect.objectContaining({ value: 'the cargo bay' })]);
  });
});
