/**
 * STARFORGED COMPANION
 * tests/unit/readerAvailability.test.js
 *
 * What can be made now, and the gate after the reading — the stand-in for
 * the move contracts' interface (src/moves/availability.js; decisions.md →
 * issue #384, D14). Rule by rule: what it TELLS
 * the reader (availableMoves → POSSIBLE NOW / NOT NOW), and what it REFUSES
 * or REMAPS (checkMove) — only what today's code refuses (Hearten, and Heal
 * with nobody else to treat, by the sheet alone) and remaps (the position
 * pair, a scene-challenge variant with no challenge open).
 */

import { describe, it, expect } from 'vitest';
import { availableMoves, checkMove } from '../../src/moves/availability.js';
import { CATALOGUE_MOVE_IDS } from '../../src/moves/readerCatalogue.js';

/** A situation as readLineSituation gives it: Mira, whole, alone, with one connection and one vow. */
const situation = (over = {}, sheet = {}) => ({
  speaker: { actorId: 'pc-mira', name: 'Mira' },
  sheet: {
    name: 'Mira',
    meters: { health: 5, spirit: 5, supply: 5 }, impacts: { wounded: false, shaken: false, unprepared: false },
    vehicle: { name: 'Kobayashi IV', integrity: 5, max: 5, battered: false },
    vows: [{ name: 'Find the raiders', rank: 'dangerous', ticks: 8, swornTo: null }],
    connections: [{ name: 'Tamsin', rank: 'dangerous', ticks: 16, bonded: false, full: false }],
    othersToTreat: 0,
    ...sheet,
  },
  party: [], othersVows: [], vehicles: [], companions: [],
  fights: [], position: null, challenges: [], expeditions: [],
  place: null, ship: null, frame: null, site: null, xCard: false, charted: { shown: [], more: 0 }, unread: [],
  ...over,
});
const entry = (s, id, opts) => availableMoves(s, opts).find(e => e.moveId === id);

describe('availableMoves — every move of the catalogue, once', () => {
  it('lists each catalogue move once, in its order; one with no precondition the stand-in knows is a can with no reason', () => {
    const list = availableMoves(situation());
    expect(list.map(e => e.moveId)).toEqual(CATALOGUE_MOVE_IDS);
    expect(entry(situation(), 'face_danger')).toEqual({ moveId: 'face_danger', can: true, why: '' });
    expect(availableMoves(null).map(e => e.moveId)).toEqual(CATALOGUE_MOVE_IDS);
  });
});

describe('recovery with nothing to recover (situation.js nothingToRecover)', () => {
  it('Heal: told for the speaker, and for whoever else the care could be for — refused only with nobody else to treat', () => {
    expect(entry(situation(), 'heal')).toMatchObject({ can: false, why: 'health 5 of 5, full, not wounded, and nobody else to treat: nothing to heal' });
    expect(checkMove('heal', situation())).toEqual({ ok: false, why: 'health 5 of 5, full, not wounded, and nobody else to treat: nothing to heal', instead: null });

    const wounded = situation({}, { meters: { health: 3, spirit: 5, supply: 5 }, impacts: { wounded: true, shaken: false, unprepared: false } });
    expect(entry(wounded, 'heal')).toMatchObject({ can: true, why: 'Mira (health 3 of 5, wounded)' });
    expect(checkMove('heal', wounded).ok).toBe(true);

    // Whole herself, with a companion who could be treated: told so, and not refused.
    const withPip = situation({ companions: [{ name: 'Glowcat', given: 'Pip' }] }, { othersToTreat: 1 });
    expect(entry(withPip, 'heal')).toMatchObject({ can: true, why: 'not Mira (health 5 of 5, full, not wounded); Glowcat "Pip"' });
    expect(checkMove('heal', withPip).ok).toBe(true);

    // A crewmate at full health: nobody is hurt, but the sheet does not settle it — told, not refused.
    const crew = situation({ party: [{ actorId: 'pc-k', name: 'Karthik', health: 5, wounded: false }] }, { othersToTreat: 1 });
    expect(entry(crew, 'heal')).toMatchObject({ can: false, why: 'health 5 of 5, full, not wounded, and nobody else is hurt: nothing to heal' });
    expect(checkMove('heal', crew).ok).toBe(true);
    const hurtCrew = situation({ party: [{ actorId: 'pc-k', name: 'Karthik', health: 2, wounded: true }] }, { othersToTreat: 1 });
    expect(entry(hurtCrew, 'heal').why).toBe('not Mira (health 5 of 5, full, not wounded); Karthik (health 2 of 5, wounded)');
  });

  it('Hearten: told and refused when spirit is full and she is not shaken — in a fight too', () => {
    expect(entry(situation(), 'hearten')).toMatchObject({ can: false, why: 'spirit 5 of 5, full, not shaken: nothing to recover' });
    expect(checkMove('hearten', situation())).toMatchObject({ ok: false, instead: null });
    const fight = situation({ fights: [{ id: 'f1', label: 'Ashen Wake', rank: 'dangerous', ticks: 8, position: 'in_control' }], position: 'in_control' });
    expect(checkMove('hearten', fight).ok, 'the precondition is the game\'s, fight or no fight').toBe(false);
    const shaken = situation({}, { meters: { health: 5, spirit: 3, supply: 5 }, impacts: { wounded: false, shaken: true, unprepared: false } });
    expect(entry(shaken, 'hearten')).toMatchObject({ can: true, why: 'spirit 3 of 5, shaken' });
    expect(checkMove('hearten', shaken).ok).toBe(true);
  });

  it('Resupply and Repair: told with nothing to recover, never refused — an item, a device', () => {
    expect(entry(situation(), 'resupply')).toMatchObject({ can: false, why: 'supply 5 of 5, full, not unprepared: nothing to restock, unless the line is after one particular item' });
    expect(entry(situation(), 'repair').why).toBe('"Kobayashi IV" is at integrity 5 of 5, full, not battered: nothing to mend on her, unless the line is about another vehicle, a module, a companion or a device');
    expect(checkMove('resupply', situation()).ok).toBe(true);
    expect(checkMove('repair', situation()).ok).toBe(true);
    const damaged = situation({}, { vehicle: { name: 'Kobayashi IV', integrity: 3, max: 5, battered: true } });
    expect(entry(damaged, 'repair')).toMatchObject({ can: true, why: '"Kobayashi IV" (integrity 3 of 5, battered)' });
    // No command vehicle recorded: unknown, never "nothing".
    expect(entry(situation({}, { vehicle: null }), 'repair')).toEqual({ moveId: 'repair', can: true, why: '' });
  });

  it('a roll asked for: nothing the sheet settles is a "cannot" — the player who means it rolls it', () => {
    for (const id of ['heal', 'hearten', 'resupply']) expect(entry(situation(), id, { mode: 'roll' }).can, id).toBe(true);
    expect(checkMove('heal', situation(), { mode: 'roll' }).ok).toBe(true);
    expect(checkMove('hearten', situation(), { mode: 'chosen' }).ok).toBe(true);
  });

  it('an unknown sheet refuses nothing', () => {
    const none = situation({ speaker: null, sheet: null });
    expect(checkMove('heal', none).ok).toBe(true);
    expect(checkMove('hearten', none).ok).toBe(true);
    expect(entry(none, 'develop_your_relationship')).toMatchObject({ can: true, why: "the speaker's connections are unknown" });
  });
});

describe('the fight: the speaker\'s position (interpreter.js POSITION_MOVE_REMAP)', () => {
  const fight = (position) => situation({ fights: [{ id: 'f1', label: 'Ashen Wake', rank: 'dangerous', ticks: 8, position }], position });

  it('in a bad spot: clash, react under fire, decisive action, defeat; strike and gain ground remapped', () => {
    const s = fight('bad_spot');
    for (const id of ['clash', 'react_under_fire', 'take_decisive_action', 'face_defeat']) {
      expect(entry(s, id), id).toMatchObject({ can: true, group: 'fight', why: 'in the fight "Ashen Wake" (Mira is in a bad spot)' });
    }
    expect(entry(s, 'strike')).toMatchObject({ can: false, instead: 'clash', why: 'Mira is in a bad spot' });
    expect(checkMove('strike', s)).toEqual({ ok: false, why: 'Mira is in a bad spot', instead: 'clash' });
    expect(checkMove('gain_ground', s, { mode: 'roll' }).instead, 'a remap applies in every mode').toBe('react_under_fire');
  });

  it('in control: the other pair', () => {
    const s = fight('in_control');
    expect(checkMove('clash', s)).toMatchObject({ ok: false, instead: 'strike' });
    expect(checkMove('react_under_fire', s)).toMatchObject({ ok: false, instead: 'gain_ground' });
    expect(checkMove('strike', s).ok).toBe(true);
  });

  it('a fight whose position for her is not recorded: all six can be made; with no fight open they are told, not refused', () => {
    expect(entry(fight(null), 'strike')).toMatchObject({ can: true, why: 'in the fight "Ashen Wake" (Mira\'s position is not recorded)' });
    expect(entry(situation(), 'strike')).toMatchObject({ can: false, why: 'no fight is open: enter_the_fray begins one' });
    expect(checkMove('strike', situation()).ok, 'a Strike with no fight open begins one (combat.js)').toBe(true);
    expect(entry(situation(), 'enter_the_fray').can).toBe(true);
  });
});

describe('the scene challenge (sceneChallenge.js moveOutsideSceneChallenge)', () => {
  it('with none open the variants are their ordinary moves; with one open they are its own', () => {
    expect(entry(situation(), 'face_danger_scene_challenge')).toMatchObject({ can: false, why: 'no scene challenge is open', instead: 'face_danger' });
    expect(entry(situation(), 'finish_the_scene')).toMatchObject({ can: false, instead: null });
    expect(checkMove('secure_an_advantage_scene_challenge', situation())).toEqual({ ok: false, why: 'no scene challenge is open', instead: 'secure_an_advantage' });
    expect(checkMove('finish_the_scene', situation()).ok, 'told, not refused').toBe(true);
    const open = situation({ challenges: [{ id: 'c1', label: 'The Long Haggle', rank: 'dangerous', ticks: 4, type: 'scene_challenge', completed: false }] });
    expect(entry(open, 'face_danger_scene_challenge')).toMatchObject({ can: true, group: 'scene', why: 'within the scene challenge "The Long Haggle" (1 of 10 boxes)' });
    expect(checkMove('face_danger_scene_challenge', open).ok).toBe(true);
    expect(checkMove('face_danger_scene_challenge', open, { targetId: 'c-gone' })).toMatchObject({ ok: false, why: 'its scene challenge has ended', instead: 'face_danger' });
  });
});

describe('what the game\'s text says — told, not refused', () => {
  it('the expedition, or a site to explore', () => {
    expect(entry(situation(), 'explore_a_waypoint')).toMatchObject({ can: false, why: 'no expedition is open' });
    expect(checkMove('explore_a_waypoint', situation()).ok).toBe(true);
    const out = situation({ expeditions: [{ id: 'e1', label: 'The Ashfall Drift', rank: 'dangerous', ticks: 8 }] });
    expect(entry(out, 'explore_a_waypoint')).toMatchObject({ can: true, group: 'expedition', why: 'in the expedition "The Ashfall Drift" (2 of 10 boxes)' });
    const inside = situation({ site: { kind: 'derelict', name: 'The Hollow Saint', status: 'explored' } });
    expect(entry(inside, 'explore_a_waypoint')).toMatchObject({ can: true, why: 'inside the derelict "The Hollow Saint"' });
    expect(entry(inside, 'finish_an_expedition').can).toBe(false);
  });

  it('the connections: each with its track; a bonded one is never bonded again; one already a connection is not made one', () => {
    expect(entry(situation(), 'develop_your_relationship')).toMatchObject({ can: true, why: '"Tamsin"', targets: [{ kind: 'connection', name: 'Tamsin', can: true }] });
    expect(entry(situation(), 'forge_a_bond')).toMatchObject({ can: true, why: '"Tamsin" (relationship 4 of 10 boxes: at worse odds)' });
    const full = situation({}, { connections: [{ name: 'Tamsin', rank: 'dangerous', ticks: 40, bonded: false, full: true }] });
    expect(entry(full, 'forge_a_bond').why).toBe('"Tamsin" (relationship full: ready)');
    const bonded = situation({}, { connections: [{ name: 'Tamsin', rank: 'dangerous', ticks: 40, bonded: true, full: false }] });
    expect(entry(bonded, 'forge_a_bond')).toMatchObject({ can: false, why: "every connection of Mira's is bonded already: develop_your_relationship instead" });
    expect(entry(situation(), 'make_a_connection').why).toBe("anyone who is not yet Mira's connection (Tamsin already is)");
    const alone = situation({}, { connections: [] });
    expect(entry(alone, 'test_your_relationship')).toMatchObject({ can: false, why: 'Mira has no connection yet: make_a_connection makes one' });
    expect(checkMove('develop_your_relationship', alone).ok, 'the refusals stay in rollMove').toBe(true);
  });

  it('the vows: hers, else the table\'s; none open is told', () => {
    expect(entry(situation(), 'reach_a_milestone').why).toBe('"Find the raiders" (dangerous, 2 of 10 boxes)');
    const others = situation({ othersVows: [{ name: 'Bring Joss home', owner: 'Karthik' }] }, { vows: [] });
    expect(entry(others, 'fulfill_your_vow').why).toBe('Mira holds no open vow; the table\'s: "Bring Joss home" (Karthik)');
    expect(entry(situation({}, { vows: [] }), 'forsake_your_vow')).toMatchObject({ can: false, why: 'no vow is open: swear_an_iron_vow makes one' });
  });

  it('an ally to aid, a companion to take a hit, a waypoint\'s own discoveries', () => {
    expect(entry(situation(), 'aid_your_ally')).toMatchObject({ can: false, why: 'no other player character is here to aid' });
    expect(entry(situation({ party: [{ actorId: 'pc-k', name: 'Karthik', health: 5, wounded: false }] }), 'aid_your_ally')).toMatchObject({ can: true, why: 'Karthik' });
    expect(entry(situation(), 'companion_takes_a_hit')).toMatchObject({ can: false, why: 'Mira has no companion' });
    expect(entry(situation(), 'make_a_discovery')).toMatchObject({ can: false, why: "made by an Explore a Waypoint roll's match, not by a line" });
    expect(checkMove('make_a_discovery', situation()).ok).toBe(true);
  });

  it('a roll asked for: only a remap stays a "cannot"', () => {
    const roll = availableMoves(situation(), { mode: 'roll' });
    expect(roll.filter(e => !e.can).map(e => e.moveId).sort()).toEqual(['face_danger_scene_challenge', 'secure_an_advantage_scene_challenge']);
  });

  it('an unknown move is never refused', () => {
    expect(checkMove('tend_wounds', situation())).toEqual({ ok: true, why: '', instead: null });
    expect(checkMove(null, null)).toEqual({ ok: true, why: '', instead: null });
  });
});
