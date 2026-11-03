// tests/unit/endureStatSubstitution.test.js
// A stat substitution chosen on the confirm dialog for Endure Harm / Endure
// Stress is rolled (issue #326 W49). The pipeline applies the dialog's
// substitution (statUsed = appliedStatReplacement, statSubstitutedFrom = the
// move's stat) before enrichInterpretationStatValue, whose PICK_HIGHER_OF
// rule — "whichever is higher" between the move's own two stats —
// overwrote it: Vanguard's "you may roll +wits" rolled +spirit. The rule now
// stands aside when a substitution was chosen.

import { describe, it, expect, beforeEach } from 'vitest';
import { enrichInterpretationStatValue } from '../../src/moves/statEnrichment.js';

let actor;

beforeEach(() => {
  actor = makeTestActor({
    id: 'pc-v', name: 'Vale',
    // foundry-ironsworn character schema: stats at the top of `system`.
    system: { edge: 1, heart: 1, iron: 2, shadow: 1, wits: 3, health: { value: 4 }, spirit: { value: 2 } },
  });
  game.actors._set('pc-v', actor);
});

describe('Endure Harm / Endure Stress with a stat substitution (issue #326 W49)', () => {
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
  it('Endure Harm keeps a chosen substitution too', () => {
    const interp = { moveId: 'endure_harm', statUsed: 'wits', statSubstitutedFrom: 'iron', isProgressMove: false };
    enrichInterpretationStatValue(actor, interp, {});
    expect(interp).toMatchObject({ statUsed: 'wits', statValue: 3 });
  });

  it('control: Endure Harm without a substitution rolls the higher of health and iron', () => {
    const interp = { moveId: 'endure_harm', statUsed: 'iron', isProgressMove: false };
    enrichInterpretationStatValue(actor, interp, {});
    expect(interp).toMatchObject({ statUsed: 'health', statValue: 4 });
  });
});
