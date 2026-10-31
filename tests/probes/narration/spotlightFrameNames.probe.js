// tests/probes/narration/spotlightFrameNames.probe.test.js
//
// PROBE (audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// SPOTLIGHT-FRAME-EXACT: selectSpotlight (src/narration/spotlight.js) narrows
// the PC roster to the scene frame's `present` names by EXACT full-name match
// (lowercased), and when the frame lists fewer than two PCs that way it returns
// null — no SPOTLIGHT block at all. Third-person narration routinely records
// PCs by first name or callsign ("Kira", "Ren") in the frame, so a party whose
// PCs have two-word names gets no rotation for the rest of the scene.
// addSceneFrameCast resolves the same `present` names through
// resolveEntityName's first/last-name ladder; the spotlight does not.

import { describe, it, expect } from 'vitest';

import { selectSpotlight } from '../../../src/narration/spotlight.js';

describe('spotlight — PCs the frame lists by first name are in the scene', () => {
  it('rotates between two present PCs the frame names by first name', () => {
    const selection = selectSpotlight({
      roster:       [{ id: 'a-kira', name: 'Kira Voss' }, { id: 'b-ren', name: 'Ren Tal' }],
      presentNames: ['Kira', 'Ren', 'Dockmaster Vale'],
      lastActorId:  'a-kira',
    });
    expect(selection).not.toBeNull();
    expect(selection?.nextActorId).toBe('b-ren');
  });
});
