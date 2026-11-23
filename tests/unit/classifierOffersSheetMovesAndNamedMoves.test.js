/**
 * STARFORGED COMPANION
 * tests/unit/classifierOffersSheetMovesAndNamedMoves.test.js
 *
 * The pacing reader, as the long haul's second live run (2026-11-23) read two
 * lines — the reader's own replies, recorded in the run:
 *
 *   a49 "I treat my wounds with the ship's medkit." → NARRATIVE, no move:
 *       "an everyday recovery action with no immediate hazard, and the
 *       downtime dial is 1/10, so it stays narrative rather than invoking the
 *       heal move". Since issue #377 item 3 the narration heals nobody, so
 *       with no move offered nothing happened; the player had to type the
 *       line again to roll (the first live run, a56: the narration healed her).
 *   a63 "I keep Tamsin talking on the comm and describe the clerk's face to
 *       her, to Develop Your Relationship." → the move offered, not made:
 *       "the player names a move … offering the move rather than forcing a
 *       roll fits the pacing" (#377 item 6, NAMED-MOVE-READ-AS-ANOTHER).
 *
 * The reader's guidance now says a line that sets about what only a move
 * changes (heal, resupply, repair, hearten, sojourn) is always at least
 * offered, and a line that names its move asks for that move.
 */

import { describe, it, expect } from 'vitest';
import { buildClassifierContext } from '../../src/pacing/classifier.js';

const DIALS = { dials: { combat: 9, investigation: 6, exploration: 6, social: 5, downtime: 1 } };
const prompt = () => buildClassifierContext({
  playerText: "I treat my wounds with the ship's medkit.", campaignState: {}, character: { name: 'Mira Kestrel' },
  recentMoveDensity: { count: 0, window: 5 }, pacingConfig: DIALS,
}).systemPrompt.replace(/\s+/g, ' ');

describe('the pacing reader offers what only a move changes, and takes a named move', () => {
  it('a line that sets about a sheet-changing move is never plain NARRATIVE, at any dial', () => {
    const text = prompt();
    expect(text).toContain('WHAT ONLY A MOVE CHANGES IS ALWAYS OFFERED');
    expect(text).toMatch(/treating a wound or an ailment \(heal\), restocking supplies \(resupply\), repairing a vehicle or gear \(repair\)/);
    expect(text).toMatch(/At any dial, answer at least NARRATIVE_WITH_MOVE_AVAILABLE with that move as suggestedMove/);
    // The run's own line, as the example.
    expect(text).toMatch(/"I treat my wounds with the ship's medkit" at a downtime dial of 1 → NARRATIVE_WITH_MOVE_AVAILABLE, suggestedMove heal/);
  });

  it('a line that names its move asks for that move', () => {
    const text = prompt();
    expect(text).toContain('A LINE THAT NAMES ITS MOVE ASKS FOR IT');
    expect(text).toMatch(/"…, to Develop Your Relationship"/);
    expect(text).toMatch(/explicit intent at any dial: classify MOVE with that move as suggestedMove, not another move/);
  });

  it('control: an everyday action with nothing at risk is still narration', () => {
    expect(prompt()).toContain('AN EVERYDAY ACTION WITH NOTHING AT RISK IS NOT A MOVE');
  });
});
