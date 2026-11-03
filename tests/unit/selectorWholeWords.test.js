/**
 * STARFORGED COMPANION
 * tests/unit/selectorWholeWords.test.js
 *
 * Issue #325 W30: every selection ladder's substring rung tested raw
 * containment either way (`n.includes(needle) || needle.includes(n)`), so a
 * short name inside another word was a match — "I stand with Lorenzo"
 * developed Ren (two bonded connections would otherwise make the picker ask),
 * "Kade is avenged" scored the vow "Ade". The rung now matches whole words
 * (`wholeWordsFit`, the `wholeWordPattern` rule of issue #322 V19), still in
 * either direction: "Captain Ren" is Ren.
 *
 * Converted from the audit probe moves/selectorSubstringInsideWord, extended
 * to the other ladders with the same rung.
 */

import { describe, it, expect } from 'vitest';
import { wholeWordsFit } from '../../src/context/relevanceResolver.js';
import { selectConnection } from '../../src/moves/developRelationship.js';
import { selectFulfilVow, selectMilestoneVow } from '../../src/moves/milestone.js';
import { selectCombatTrack } from '../../src/moves/combat.js';
import { selectExpeditionTrack } from '../../src/moves/expedition.js';
import { selectVowTrack } from '../../src/moves/vow.js';
import { selectSectorSite } from '../../src/sectors/precursorSites.js';

const ren  = { _id: 'c-ren',  name: 'Ren',  rank: 'dangerous',  bonded: true, active: true, __hostId: 'npc-ren' };
const mara = { _id: 'c-mara', name: 'Mara', rank: 'formidable', bonded: true, active: true, __hostId: 'npc-mara' };

describe('wholeWordsFit', () => {
  it('fits one name inside the other as whole words, either way', () => {
    expect(wholeWordsFit('ren', 'captain ren')).toBe(true);
    expect(wholeWordsFit('captain ren', 'ren')).toBe(true);
    expect(wholeWordsFit('ren', "ren's ship")).toBe(true);
  });

  it('never fits a name inside another word', () => {
    expect(wholeWordsFit('ren', 'lorenzo')).toBe(false);
    expect(wholeWordsFit('ade', 'kade is avenged')).toBe(false);
    expect(wholeWordsFit('', 'anything')).toBe(false);
  });
});

describe('selectConnection — a name inside another word is not that name', () => {
  it('"Captain Ren" selects Ren (a whole-word substring)', () => {
    expect(selectConnection([ren, mara], 'Captain Ren')?.name).toBe('Ren');
  });

  it('a name matching no one, with two bonded connections, is ambiguous (null)', () => {
    expect(selectConnection([ren, mara], 'Tobias')).toBeNull();
  });

  it('"Lorenzo" does not select Ren', () => {
    expect(selectConnection([ren, mara], 'Lorenzo')).toBeNull();
  });
});

describe('the vow ladders', () => {
  const vows = [
    { id: 'v1', name: 'Ade',              rank: 'formidable', ticks: 40, completed: false, actorId: 'pc-a', vowId: 'a' },
    { id: 'v2', name: 'Find the Archive', rank: 'dangerous',  ticks: 8,  completed: false, actorId: 'pc-a', vowId: 'b' },
  ];

  it('a Fulfill Your Vow naming "Kade is avenged" does not score the vow "Ade" — the roller picks', () => {
    const { vow, choices } = selectFulfilVow(vows, 'Kade is avenged', { rollerActorId: 'pc-a' });
    expect(vow?.name ?? null).toBeNull();
    expect(choices.length).toBe(2);
  });

  it('a Reach a Milestone naming "Kade is avenged" marks neither vow', () => {
    expect(selectMilestoneVow(vows, 'Kade is avenged')).toBeNull();
  });

  it('a vow named in a longer phrase is still found', () => {
    expect(selectFulfilVow(vows, 'the archive', { rollerActorId: 'pc-a' }).vow?.id).toBe('v2');
    expect(selectMilestoneVow(vows, 'I swore to find the archive')?.id).toBe('v2');
  });

  it('selectVowTrack: "Kade is avenged" is not the vow track "Ade"', () => {
    const tracks = [
      { id: 't1', label: 'Ade', type: 'vow', completed: false },
      { id: 't2', label: 'Find the Archive', type: 'vow', completed: false },
    ];
    expect(selectVowTrack(tracks, 'Kade is avenged')).toBeNull();
    expect(selectVowTrack(tracks, 'Archive')?.id).toBe('t2');
  });
});

describe('the track and site ladders', () => {
  it('selectCombatTrack: "Hornet swarm" is not the fight with "Orne"', () => {
    const tracks = [
      { id: 'c1', label: 'Orne', type: 'combat', completed: false },
      { id: 'c2', label: 'Security Bots', type: 'combat', completed: false },
    ];
    expect(selectCombatTrack(tracks, 'Hornet swarm')).toBeNull();
    expect(selectCombatTrack(tracks, 'the security bots on deck 3')?.id).toBe('c2');
  });

  it('selectExpeditionTrack: "Ironhold" is not the expedition to "Iron"', () => {
    const tracks = [
      { id: 'e1', label: 'Iron', type: 'expedition', completed: false },
      { id: 'e2', label: 'Expedition to Kell', type: 'expedition', completed: false },
    ];
    expect(selectExpeditionTrack(tracks, 'Ironhold')).toBeNull();
    expect(selectExpeditionTrack(tracks, 'Kell')?.id).toBe('e2');
  });

  it('selectSectorSite: "Archway" is not the site "Arch"; "Sunken" still finds the Sunken Vault', () => {
    const sites = [
      { id: 's1', name: 'Arch', type: 'derelict', discovered: false },
      { id: 's2', name: 'Sunken Vault', type: 'vault', discovered: false },
    ];
    const pick = (label) => selectSectorSite([{ id: 'sec', mapData: { discoveries: sites } }], label,
      { requireLabelMatch: true })?.site?.id ?? null;
    expect(pick('Archway')).toBeNull();
    expect(pick('Sunken')).toBe('s2');
  });
});
