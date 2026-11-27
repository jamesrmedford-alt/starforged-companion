/**
 * STARFORGED COMPANION
 * tests/unit/presentHoldsWhoIsHere.test.js
 *
 * Issue #397, Code fix 5 (b). The fact block's "present" asked for "every
 * named character here in person" and said nothing of the player characters:
 * 40 of round 8's 68 fact blocks left Mira out, 14 were empty, and each
 * change of `present` is a new frame event in the session record. In a
 * one-character game she has just acted in a beat of play, so she is here:
 * the stored frame lists her when the block's does not. A bookend (an
 * opening, a closing, a spotlight) and a game of two or more player
 * characters are left as they came — the code cannot tell a split party.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { applyNarratorSidecar } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const RUN = JSON.parse(fs.readFileSync(path.resolve(__dirname,
  '../../test/ci/playwright/explorations/long-haul-live-20261126-184225/replay.json'), 'utf8'));
/** a72's reply (the arrival's complication, an oracle follow-up): its fact block's present is ["Tamsin Okoro"] alone. */
const A72 = RUN.recording.exchanges.find(x => x.step === 'a72' && /narrateOracleFollowup$/.test(x.kind))
  .response.content.map(c => c.text ?? '').join('');

function seat(pcs) {
  game.actors._reset();
  for (const [id, name] of pcs) game.actors._set(id, makeTestActor({ id, name }));
  game.messages = { contents: [] };
  return {
    currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-3',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-3' },
    sceneFrame: { location: 'Tamsin\'s ledger stall', present: ['Mira Kestrel', 'Tamsin Okoro'], sceneId: 'sc-3' },
  };
}

describe('a beat of play\'s frame holds who is here', () => {
  beforeEach(() => game.settings._store.clear());

  it('r8 a72\'s fact block left Mira out; in a one-character game she is stored present', () => {
    expect(/"present":\s*\[\s*"Tamsin Okoro"\s*\]/.test(A72)).toBe(true);
    const cs = seat([['pc-mira', 'Mira Kestrel']]);
    applyNarratorSidecar(A72, cs, { mode: 'oracle_followup', narrationId: 'nar-a72' });
    expect(cs.sceneFrame.present).toEqual(['Mira Kestrel', 'Tamsin Okoro']);
  });

  it('a session opening is left as it came', () => {
    const cs = seat([['pc-mira', 'Mira Kestrel']]);
    applyNarratorSidecar(A72, cs, { mode: 'session_vignette', bookend: true, narrationId: 'nar-open' });
    expect(cs.sceneFrame.present).not.toContain('Mira Kestrel');
  });

  it('a game of two player characters is left as it came', () => {
    const cs = seat([['pc-mira', 'Mira Kestrel'], ['pc-ren', 'Ren Ashe']]);
    applyNarratorSidecar(A72, cs, { mode: 'oracle_followup', narrationId: 'nar-a72' });
    expect(cs.sceneFrame.present).toEqual(['Tamsin Okoro']);
  });
});
