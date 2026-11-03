// tests/probes/narration/hintCommonNounMove.probe.js
//
// PROBE (eighth audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// NR HINT-COMMON-NOUN — the paced card's Roll button follows the longest move
// name anywhere in the closing hint, so a common noun in the hint beats the
// move the narrator actually invited.
//
// What the user does: free narration ("I patch my side before we push on")
// gets a paced card whose closing hint reads "*Binding that wound before the
// battle could be a Heal.*"
//
// What happens: extractMoveFromNarrationHint (src/narration/narrator.js) tests
// MOVE_HINT_MATCHERS — every MOVES id as a case-insensitive whole phrase,
// longest name first — against the last italic span and returns the first that
// matches anywhere in it. "battle" (6 letters) is tried before "heal" (4), and
// the lowercase noun "battle" matches, so reconcileSuggestedMove sets the
// card's button to "Roll Battle": a click forces the Battle combat move
// (forcedMoveId "battle") outside any fight. Same for "repair" vs "battle"
// (equal length, Battle comes first in MOVES), "strike a deal", "a clash of
// wills" and so on. decisions.md ("The Roll button reflects the narrator's
// prose") counts on the hint naming the move it invites.
//
// What should happen: the move the hint invites (Heal) wins — e.g. the name
// written as a move (capitalised) or the last one named, not the longest.

import { describe, it, expect } from 'vitest';
import { extractMoveFromNarrationHint, reconcileSuggestedMove } from '../../../src/narration/narrator.js';

describe("the Roll button is the move the hint invites", () => {
  it('"…before the battle could be a Heal." is Heal, not Battle', () => {
    const text = 'You press the gauze into the cut. *Binding that wound before the battle could be a Heal.*';
    expect(extractMoveFromNarrationHint(text)).toBe('heal');
    expect(reconcileSuggestedMove(text, 'heal')).toBe('heal');
  });

  it('"…before the next battle would be a Repair." is Repair, not Battle', () => {
    const text = 'The hull plate rattles loose. *Patching it before the next battle would be a Repair.*';
    expect(extractMoveFromNarrationHint(text)).toBe('repair');
  });

  it('control: a hint that names only the move reads correctly', () => {
    expect(extractMoveFromNarrationHint('The gauze is ready. *This could be a Heal.*')).toBe('heal');
  });
});
