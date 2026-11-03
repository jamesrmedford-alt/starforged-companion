/**
 * PROBE — MC-11 ENDURE-SUBSTITUTION-DISCARDED (eighth bug audit, moves-core)
 *
 * What the user does: a PC with Vanguard's third ability ("When you Endure
 * Stress, you may roll +wits. If you do, take +1 momentum on a hit.") Endures
 * Stress; the confirm dialog offers "Substitute +wits" and the player picks
 * it (wits 3, spirit 2, heart 1).
 *
 * What happens: the roll is +spirit (2). The pipeline applies the dialog's
 * substitution (index.js: interpretation.statUsed = appliedStatReplacement)
 * and then calls statEnrichment.enrichInterpretationStatValue, whose
 * PICK_HIGHER_OF rule for Endure Harm / Endure Stress overwrites statUsed with
 * the higher of health/iron or spirit/heart — whatever stat was chosen.
 *
 * What should happen: the "whichever is higher" rule picks between the move's
 * own two stats; a substitution the player chose on the dialog stands
 * (index.js records it as statSubstitutedFrom, which the enrichment could
 * check).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { enrichInterpretationStatValue } from '../../../src/moves/statEnrichment.js';

let actor;

beforeEach(() => {
  actor = makeTestActor({
    id: 'pc-v', name: 'Vale',
    // foundry-ironsworn character schema: stats at the top of `system`.
    system: { edge: 1, heart: 1, iron: 2, shadow: 1, wits: 3, health: { value: 4 }, spirit: { value: 2 } },
  });
  game.actors._set('pc-v', actor);
});

describe('Endure Stress with a stat substitution', () => {
  it('control: without a substitution it rolls the higher of spirit and heart', () => {
    const interp = { moveId: 'endure_stress', statUsed: 'heart', isProgressMove: false };
    enrichInterpretationStatValue(actor, interp, {});
    expect(interp).toMatchObject({ statUsed: 'spirit', statValue: 2 });
  });

  it('control: the sheet reads wits 3 (a move that lists wits)', () => {
    const interp = { moveId: 'face_danger', statUsed: 'wits', isProgressMove: false };
    enrichInterpretationStatValue(actor, interp, {});
    expect(interp.statValue).toBe(3);
  });

  it('the +wits the player chose (Vanguard) is rolled: +3', () => {
    // As the pipeline leaves it after the confirm dialog's "Substitute +wits".
    const interp = { moveId: 'endure_stress', statUsed: 'wits', statSubstitutedFrom: 'spirit', isProgressMove: false };
    enrichInterpretationStatValue(actor, interp, {});
    expect(interp).toMatchObject({ statUsed: 'wits', statValue: 3 });
  });
});
