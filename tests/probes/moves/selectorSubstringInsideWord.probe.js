/**
 * PROBE — MC-17 SELECTOR-SUBSTRING-INSIDE-WORD (eighth bug audit, moves-core)
 *
 * What the user does: names someone or something the module does not track
 * yet, whose name CONTAINS a tracked one's: "I stand with Lorenzo through the
 * blockade" (Develop Your Relationship) while the connections are Ren and
 * Mara, both bonded; or "Kade is avenged" (Fulfill Your Vow) while the open
 * vows are "Ade" and "Find the Archive".
 *
 * What happens: the move lands on Ren / "Ade". The selection ladders'
 * substring rung (developRelationship.selectConnection, milestone
 * selectFulfilVow's vowByName and selectMilestoneVow, combat.selectCombatTrack,
 * expedition.selectExpeditionTrack, vow.selectVowTrack) tests raw character
 * containment either way — "lorenzo".includes("ren") — so a short name
 * inside another word is a match. With two bonded connections the ladder
 * would otherwise return null (ambiguous: the picker asks); it develops Ren —
 * his rank rolled, his bonds-legacy ticks or rank raise paid.
 *
 * What should happen: the substring rung matches whole words (the repo's rule
 * for names elsewhere — decisions.md issue #322 V19, `wholeWordPattern`): "Ren"
 * matches "Captain Ren", not "Lorenzo".
 */

import { describe, it, expect } from 'vitest';
import { selectConnection } from '../../../src/moves/developRelationship.js';
import { selectFulfilVow } from '../../../src/moves/milestone.js';

const ren  = { _id: 'c-ren',  name: 'Ren',  rank: 'dangerous', bonded: true, active: true, __hostId: 'npc-ren' };
const mara = { _id: 'c-mara', name: 'Mara', rank: 'formidable', bonded: true, active: true, __hostId: 'npc-mara' };

describe('a name inside another word is not that name', () => {
  it('control: "Captain Ren" selects Ren (a whole-word substring)', () => {
    expect(selectConnection([ren, mara], 'Captain Ren')?.name).toBe('Ren');
  });

  it('control: a name matching no one, with two bonded connections, is ambiguous (null)', () => {
    expect(selectConnection([ren, mara], 'Tobias')).toBeNull();
  });

  it('"Lorenzo" does not select Ren', () => {
    expect(selectConnection([ren, mara], 'Lorenzo')).toBeNull();
  });

  it('a Fulfill Your Vow naming "Kade is avenged" does not score the vow "Ade"', () => {
    const vows = [
      { id: 'v1', name: 'Ade',              rank: 'formidable', ticks: 40, completed: false, actorId: 'pc-a', vowId: 'a' },
      { id: 'v2', name: 'Find the Archive', rank: 'dangerous',  ticks: 8,  completed: false, actorId: 'pc-a', vowId: 'b' },
    ];
    const { vow, choices } = selectFulfilVow(vows, 'Kade is avenged', { rollerActorId: 'pc-a' });
    expect(vow?.name ?? null).toBeNull();
    expect(choices.length).toBe(2);
  });
});
