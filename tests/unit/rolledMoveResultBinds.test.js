/**
 * STARFORGED COMPANION
 * tests/unit/rolledMoveResultBinds.test.js
 *
 * Issue #388 #5 (RESULT-FLOOR-BY-SHARED-WORD). A narrator fact tagged
 * `"from": "result"` bound as the dice's only when one of its telling words
 * stood in what the dice decided — the stakes line the outcome delivered, or
 * the move's target. A progress roll has no stakes line, and an action roll's
 * stakes rarely share a word with what its narration says it decided, so the
 * long haul's fifth live run refused five results of a roll and bound two
 * colours by an accident of words:
 *
 *   - refused: a71's Forge a Bond, "agreed to stand with Mira past the raids;
 *     the bond between them is formed"; a37's Take Decisive Action, "her gun
 *     port is wrecked and a hatch on her ring is jammed half-open"; a11's
 *     Gather Information report; a81's fulfilment;
 *   - bound: a64's "Tamsin asks how the Cinder Wren got Mira's berth number"
 *     — a Develop Your Relationship with no roll, its target's name in the
 *     fact; a81's "heard Mira's finding" — "finding" for "Find who is…".
 *
 * Now a rolled move's narration binds its `result` facts (`ground.rolled`),
 * and a move with no roll decided nothing — its `result` is colour. The
 * oracle's and a filled clock's grounds keep the word test.
 */

import { describe, it, expect } from 'vitest';
import { factBasis, groundOf, normaliseGround, decidedOfMove, rolledMove } from '../../src/factContinuity/provenance.js';

const PCS = ['Mira Kestrel', 'Kobayashi IV'];
const about = (subject) => [subject, ...PCS];

// The run's resolutions, as its cards had them.
const FORGE_A_BOND = { moveId: 'forge_a_bond', outcome: 'strong_hit', moveTarget: 'Tamsin Okoro' };
const DECISIVE     = { moveId: 'take_decisive_action', outcome: 'strong_hit', moveTarget: 'The Cinder Wren' };
const GATHER       = { moveId: 'gather_information', outcome: 'strong_hit', stakes: { hit: 'You learn who saw the raiders last', miss: 'The crews clam up' } };
const DEVELOP      = { moveId: 'develop_your_relationship', outcome: null, moveTarget: 'Tamsin Okoro' };
const groundFor = (resolution, line = '') => groundOf({ line, decided: decidedOfMove(resolution, { moveTarget: resolution.moveTarget ?? null }), rolled: rolledMove(resolution) });

describe('a rolled move\'s narration binds its result (issue #388 #5)', () => {
  it('a71\'s bond formed and a37\'s decisive action — refused by the word test — are the dice\'s', () => {
    expect(factBasis('result', 'agreed to stand with Mira past the raids; the bond between them is formed',
      groundFor(FORGE_A_BOND), { about: about('Tamsin Okoro') })).toBe('dice');
    expect(factBasis('result', 'her gun port is wrecked and a hatch on her ring is jammed half-open; her crew has not come out',
      groundFor(DECISIVE), { about: about('Ashen Wake') })).toBe('dice');
    expect(factBasis('result', 'saw two dark-running hulls haul a tanker out of the lane at Lyra\'s debris field three shifts ago',
      groundFor(GATHER), { about: about('dock hand') })).toBe('dice');
  });

  it('a64\'s colour on a move with no roll is the narrator\'s, though it names the target', () => {
    expect(rolledMove(DEVELOP)).toBe(false);
    expect(decidedOfMove(DEVELOP, { moveTarget: 'Tamsin Okoro' })).toEqual([]);
    expect(factBasis('result', 'Tamsin asks how the Cinder Wren got Mira\'s berth number', groundFor(DEVELOP), { about: about('Cinder Wren') })).toBe('narrator');
  });

  it('untagged, or tagged `line` with none of the line\'s words, is still colour on a rolled move', () => {
    expect(factBasis(null, 'the bond between them is formed', groundFor(FORGE_A_BOND), { about: about('Tamsin Okoro') })).toBe('narrator');
    expect(factBasis('line', 'gave Mira her spare pen as a sign of trust', groundFor(FORGE_A_BOND, 'Tamsin, will you stand with me?'), { about: about('Tamsin Okoro') })).toBe('narrator');
  });

  it('a paced line has no dice: its `result` facts are colour (a15: "turned the salvage crate…")', () => {
    expect(factBasis('result', 'turned the salvage crate so its hatch mark faces the wall',
      groundOf({ line: "I promise Tamsin I'll be back before the next tide of cargo." }), { about: about('Tamsin Vey') })).toBe('narrator');
  });

  it('an oracle\'s answer keeps the word test: a44\'s YES binds by its question\'s words, an aside does not', () => {
    const oracle = groundOf({ line: 'Is anyone left alive aboard the wreck?', decided: ['Is anyone left alive aboard the wreck?', 'YES'] });
    expect(oracle.rolled).toBe(false);
    expect(factBasis('result', 'has at least one crew member alive aboard, trapped behind the jammed hatch', oracle, { about: about('Cinder Wren') })).toBe('dice');
    expect(factBasis('result', 'the station lights flicker twice', oracle, { about: about('Bleakhold Station') })).toBe('narrator');
  });

  it('a relayed ground keeps whether it was rolled; anything else reads as not', () => {
    expect(normaliseGround({ line: 'x', decided: 'y', rolled: true })).toMatchObject({ rolled: true });
    expect(normaliseGround({ line: 'x', decided: 'y', rolled: 'yes' })).toMatchObject({ rolled: false });
    expect(normaliseGround(null)).toMatchObject({ rolled: false });
  });

  it('rolledMove: an action or progress roll\'s outcome — strong, weak or miss — and nothing else', () => {
    for (const outcome of ['strong_hit', 'weak_hit', 'miss']) expect(rolledMove({ outcome }), outcome).toBe(true);
    for (const outcome of [null, undefined, 'none', 'no_roll']) expect(rolledMove({ outcome }), String(outcome)).toBe(false);
    expect(rolledMove(null)).toBe(false);
  });
});
