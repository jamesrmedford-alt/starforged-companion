/**
 * STARFORGED COMPANION
 * tests/unit/availableMovesContracts.test.js
 *
 * Overhaul 1, slice 4 (issue #384 — overhaul 4's slice 6, issue #385): what
 * the line reader is told can be made now is what the move contracts' gate
 * lets be made (src/moves/contracts/available.js availableMoves, over
 * gate.js checkMove), and the triggers it quotes are the table's
 * (moveTriggers). It replaces the reader's stand-in (moves/availability.js,
 * deleted), whose rules these hold to the gate's.
 */

import { describe, it, expect } from 'vitest';
import { availableMoves, formatAvailableMoves, moveTriggers } from '../../src/moves/contracts/available.js';
import { contractFor } from '../../src/moves/contracts/table.js';
import { CATALOGUE_MOVE_IDS } from '../../src/moves/readerCatalogue.js';

/** The situation readMoveSituation reads, as plain data: Mira, whole, one connection and one vow. */
const situation = (over = {}) => ({
  roller: {
    actorId: 'pc-mira', name: 'Mira Kestrel',
    meters: { health: 5, spirit: 5, supply: 5, momentum: 2 }, impacts: { wounded: false, shaken: false, unprepared: false },
    companions: [], vehicles: [],
    vows: [{ vowId: 'v1', itemId: 'i1', name: 'Find the raiders', rank: 'dangerous', ticks: 8, completed: false, forsaken: false }],
    connections: [{ connectionId: 'c1', itemId: 'b1', name: 'Tamsin Okoro', rank: 'dangerous', ticks: 16, bonded: false, lost: false, full: false }],
    ...over.roller,
  },
  party: over.party ?? [],
  people: over.people ?? [],
  tracks: { fights: [], expeditions: [], sceneChallenges: [], rollerPosition: null, fightsOffered: [], ...over.tracks },
  scene: { sceneId: 's', placeId: null, atSite: false, siteKind: null, combatActive: false },
  table: { pcCount: 1, spokenToAFellowPc: () => false },
});
const entry = (s, id, opts) => availableMoves(s, CATALOGUE_MOVE_IDS, opts).find(e => e.moveId === id);

describe('availableMoves — the gate, asked for every move', () => {
  it('a move with nothing to say of it can be made; one with a target is told what it can be made for', () => {
    expect(entry(situation(), 'face_danger')).toEqual({ moveId: 'face_danger', can: true, why: '' });
    expect(entry(situation(), 'develop_your_relationship')).toEqual({ moveId: 'develop_your_relationship', can: true, why: '"Tamsin Okoro"' });
    expect(entry(situation(), 'reach_a_milestone').why).toBe('"Find the raiders"');
    // Swear an Iron Vow swears a new one.
    expect(entry(situation(), 'swear_an_iron_vow')).toEqual({ moveId: 'swear_an_iron_vow', can: true, why: '' });
  });

  it('a refusal is told in the gate\'s own words, with the move it offers; nothing to recover is soft, no fight is hard', () => {
    const hearten = entry(situation(), 'hearten');
    expect(hearten).toMatchObject({ can: false, hard: false });
    expect(hearten.why).toMatch(/^nothing to ease: /);
    const strike = entry(situation(), 'strike');
    expect(strike).toMatchObject({ can: false, hard: true, instead: 'enter_the_fray' });
  });

  it('a roll asked for: a soft refusal is no "cannot" (a GM may roll it at their word); a hard one still is', () => {
    expect(entry(situation(), 'hearten', { mode: 'roll' })).toEqual({ moveId: 'hearten', can: true, why: '' });
    expect(entry(situation(), 'strike', { mode: 'roll' })).toMatchObject({ can: false, hard: true });
  });

  it('in a fight the position\'s pair is a reroute, told by her position; the fight\'s moves are made for the fight', () => {
    const fight = situation({ tracks: { fights: [{ id: 'f1', label: 'Ashen Wake', rank: 'dangerous', ticks: 0 }], rollerPosition: 'bad_spot' } });
    expect(entry(fight, 'strike')).toEqual({ moveId: 'strike', can: false, why: 'Mira Kestrel is in a bad spot', instead: 'clash' });
    expect(entry(fight, 'clash')).toEqual({ moveId: 'clash', can: true, why: '"Ashen Wake"' });
    // A refusal the sheet settles is not applied in a fight: the dice decide (overhaul 4's rule).
    expect(entry(fight, 'hearten').can).toBe(true);
  });

  it('nothing known refuses nothing', () => {
    expect(availableMoves(null, CATALOGUE_MOVE_IDS).every(e => e.can)).toBe(true);
  });
});

describe('formatAvailableMoves and moveTriggers', () => {
  it('groups the moves that share a reason, the offered or rerouted move after them', () => {
    const text = formatAvailableMoves(availableMoves(situation(), CATALOGUE_MOVE_IDS));
    expect(text.startsWith('POSSIBLE NOW — every move of THE MOVES but those named after this list, and these as told:')).toBe(true);
    expect(text).toContain('- develop_your_relationship, test_your_relationship, forge_a_bond — "Tamsin Okoro"');
    expect(text).toMatch(/\nNOT NOW\n/);
    expect(text).toMatch(/strike[^\n]* — [^\n]*\(enter_the_fray instead\)/);
    expect(formatAvailableMoves([])).toBe('POSSIBLE NOW — every move of THE MOVES but those named after this list.\nNOT NOW\n- nothing');
  });

  it('the triggers are the table\'s, the one store the catalogue quotes', () => {
    const triggers = moveTriggers(CATALOGUE_MOVE_IDS);
    expect(Object.keys(triggers)).toEqual([...CATALOGUE_MOVE_IDS]);
    for (const id of CATALOGUE_MOVE_IDS) expect(triggers[id], id).toBe(contractFor(id).trigger);
    expect(moveTriggers(['no_such_move'])).toEqual({ no_such_move: '' });
  });
});
