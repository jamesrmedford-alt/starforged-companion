/**
 * STARFORGED COMPANION
 * tests/unit/readerRoute.test.js
 *
 * What code decides from a reading (src/pacing/readAndRoute.js routeReading)
 * — issue #384 — decisions.md → "Overhauls 1 and 4", D1: the reader
 * says what the line does, and the table's dials, kept in code, turn that
 * into roll, offer or narrate. Every row and every band, table-driven:
 *
 *   1 no move → narrate · 2 the gate (its `instead` read on; else narrate,
 *   `unmade`) · 3 a social move at a fellow PC → narrate · 4 a fight → roll ·
 *   5 asked → roll · 6 no roll at all → offer · 7 the dial's bands over
 *   `risk` · 8 an unsure, low-dial-medium or dense roll from row 7 → offer.
 *
 * The bands are classifier.js's in effect (9–10 "MOVE whenever the player
 * describes a character action"; 6–8 "acting with intent toward an outcome …
 * otherwise NWMA"; 3–5 "reserve MOVE for clear, explicit attempts with
 * stakes"; 0–2 "NARRATIVE unless … explicit intent or stakes are
 * unambiguous").
 */

import { describe, it, expect } from 'vitest';
import { routeReading, isDense, DENSE_SHARE, ROUTE_DECISION, CONFIDENCE_NUMBER } from '../../src/pacing/readAndRoute.js';
import { PACING_DECISION } from '../../src/pacing/dials.js';

const dials = (d, override = null) => ({ dials: { combat: d, investigation: d, exploration: d, social: d, downtime: d }, sceneOverride: override });
const read = (over = {}) => ({ mode: 'open', moveId: 'face_danger', asked: false, risk: 'plain', category: 'exploration', confidence: 'high', reason: 'r', ...over });
const route = (reading, ctx = {}) => routeReading(reading, { pacingConfig: dials(6), ...ctx });

describe('rows 1–6', () => {
  it('1: no move is narrated, at any dial', () => {
    for (const d of [0, 5, 10]) expect(route(read({ moveId: null, risk: null }), { pacingConfig: dials(d) })).toMatchObject({ route: 'narrate', why: 'no move', moveId: null, offeredMove: null });
  });

  it('1: a move the reader names as blocked is asked of the gate — refused, it is told as unmade (issue #388 #7)', () => {
    // The fifth live long haul's a58: "I Hearten myself with a quiet hour in the galley." at spirit 5 of 5,
    // read as no move with nothing told. The reader now names the move it set about; the gate's refusal rides as unmade.
    const verdict = { ok: false, code: 'recoverable-spirit' };
    const refuse = (id) => (id === 'hearten' ? { ok: false, why: 'spirit 5 of 5: nothing to recover', instead: null, verdict } : { ok: true });
    expect(route(read({ moveId: null, blocked: 'hearten', risk: null, category: 'downtime' }), { check: refuse })).toMatchObject({
      route: 'narrate', moveId: null, offeredMove: null, unmade: { moveId: 'hearten', why: 'spirit 5 of 5: nothing to recover', verdict },
    });
    // The gate allowing it leaves the reader's no move; no gate, no telling.
    expect(route(read({ moveId: null, blocked: 'hearten', risk: null }), { check: () => ({ ok: true }) })).toMatchObject({ route: 'narrate', why: 'no move', unmade: null });
    expect(route(read({ moveId: null, blocked: 'hearten', risk: null }), {})).toMatchObject({ route: 'narrate', why: 'no move', unmade: null });
    // A blocked move with an instead is read on as it: a Strike with no fight under way is Enter the Fray.
    const noFight = (id) => (id === 'strike' ? { ok: false, why: 'no fight is under way', instead: 'enter_the_fray' } : { ok: true });
    expect(route(read({ moveId: null, blocked: 'strike', category: 'combat', risk: 'high' }), { check: noFight, pacingConfig: dials(6) }))
      .toMatchObject({ route: 'roll', moveId: 'enter_the_fray', remapped: { from: 'strike', why: 'no fight is under way' }, unmade: null });
    // An unknown blocked id is no move.
    expect(route(read({ moveId: null, blocked: 'not_a_move', risk: null }), { check: refuse })).toMatchObject({ route: 'narrate', why: 'no move', unmade: null });
  });

  it('2: the gate refuses — narrated, what it refused told as unmade; its instead is read on as that move', () => {
    const refuse = () => ({ ok: false, why: 'spirit 5 of 5: nothing to recover', instead: null });
    expect(route(read({ moveId: 'hearten' }), { check: refuse, fightOpen: true, pacingConfig: dials(10) })).toMatchObject({
      route: 'narrate', moveId: null, offeredMove: null, unmade: { moveId: 'hearten', why: 'spirit 5 of 5: nothing to recover' },
    });
    // A Strike in a bad spot is a Clash, and a fight never hedges.
    const swap = (moveId) => (moveId === 'strike' ? { ok: false, why: 'Mira is in a bad spot', instead: 'clash' } : { ok: true });
    expect(route(read({ moveId: 'strike', category: 'combat' }), { check: swap, fightOpen: true }))
      .toMatchObject({ route: 'roll', moveId: 'clash', remapped: { from: 'strike', why: 'Mira is in a bad spot' }, unmade: null });
    // A scene-challenge variant with none open is offered as its ordinary move.
    const ordinary = (moveId) => (moveId === 'face_danger_scene_challenge' ? { ok: false, why: 'no scene challenge is open', instead: 'face_danger' } : { ok: true });
    expect(route(read({ moveId: 'face_danger_scene_challenge', risk: 'slight' }), { check: ordinary }))
      .toMatchObject({ route: 'offer', moveId: 'face_danger', offeredMove: 'face_danger' });
  });

  it('3: a social move at a fellow player character is narrated with nothing offered — in a fight too', () => {
    const toFellowPc = (moveId) => moveId === 'compel';
    expect(route(read({ moveId: 'compel', asked: true }), { toFellowPc, fightOpen: true, pacingConfig: dials(10) }))
      .toMatchObject({ route: 'narrate', offeredMove: null, why: 'spoken to a fellow player character: roleplay, not a roll' });
    expect(route(read({ moveId: 'face_danger' }), { toFellowPc }).route).not.toBe('narrate');
  });

  it('4: in an open fight every move is rolled — unsure, at a dial of 0, a dense window, a move with no roll', () => {
    for (const reading of [read({ confidence: 'low' }), read({ risk: 'slight' }), read({ moveId: 'reach_a_milestone', risk: null }), read({ moveId: 'gather_information', category: 'investigation' })]) {
      expect(route(reading, { fightOpen: true, pacingConfig: dials(0), density: { count: 5, window: 5 } }), reading.moveId).toMatchObject({ route: 'roll', why: 'a fight is open: a fight never hedges' });
    }
  });

  it('5: a move the player asked for is rolled at any dial, unsure or in a dense window', () => {
    for (const d of [0, 2, 5, 8]) {
      expect(route(read({ asked: true, risk: 'slight', confidence: 'low' }), { pacingConfig: dials(d), density: { count: 5, window: 5 } }), `dial ${d}`)
        .toMatchObject({ route: 'roll', why: 'the player asked for it', moveId: 'face_danger' });
    }
  });

  it('6: a move with no roll at all is offered at any dial — a milestone is claimed, not rolled; so is Develop, bonded or not', () => {
    for (const moveId of ['reach_a_milestone', 'develop_your_relationship', 'forsake_your_vow', 'face_defeat', 'ask_the_oracle']) {
      for (const d of [0, 10]) {
        expect(route(read({ moveId, risk: null }), { pacingConfig: dials(d) }), `${moveId} at ${d}`).toMatchObject({ route: 'offer', offeredMove: moveId });
      }
    }
    // A progress roll is rolled: it goes on to the dial.
    expect(route(read({ moveId: 'fulfill_your_vow', risk: 'high' }), { pacingConfig: dials(5) }).route).toBe('roll');
  });
});

describe('row 7: the bands', () => {
  // [dial, high, plain, slight] → the route of a non-recovery move read with high confidence.
  const BANDS = [
    [10, 'roll', 'roll', 'roll'], [9, 'roll', 'roll', 'roll'],
    [8, 'roll', 'roll', 'offer'], [7, 'roll', 'roll', 'offer'], [6, 'roll', 'roll', 'offer'],
    [5, 'roll', 'offer', 'offer'], [4, 'roll', 'offer', 'offer'], [3, 'roll', 'offer', 'offer'],
    // At 0–2 a move the reader is sure of is offered on a button, never rolled (the low dial holds in code).
    [2, 'roll', 'offer', 'offer'], [1, 'roll', 'offer', 'offer'], [0, 'roll', 'offer', 'offer'],
  ];
  for (const [d, high, plain, slight] of BANDS) {
    it(`dial ${d}: high ${high}, plain ${plain}, slight ${slight}`, () => {
      const got = ['high', 'plain', 'slight'].map(risk => route(read({ risk }), { pacingConfig: dials(d) }));
      expect(got.map(g => g.route)).toEqual([high, plain, slight]);
      for (const g of got) expect(g.dial).toBe(d);
      expect(got.find(g => g.route === 'offer')?.offeredMove ?? 'face_danger').toBe('face_danger');
    });
  }

  it('at 0–2 a recovery move is offered, not narrated: only a move changes the sheet', () => {
    for (const moveId of ['heal', 'hearten', 'resupply', 'repair', 'sojourn']) {
      expect(route(read({ moveId, risk: 'slight', category: 'downtime', confidence: 'medium' }), { pacingConfig: dials(1) }), moveId).toMatchObject({ route: 'offer', offeredMove: moveId });
    }
  });

  it('at 0–2 any other move is offered only when the reader is sure of it; unsure, the line is narrated', () => {
    // The first measure's Check Your Gear at downtime 1: read surely, slight risk — the pacing reader offered it.
    expect(route(read({ moveId: 'check_your_gear', risk: 'slight', category: 'downtime' }), { pacingConfig: dials(1) })).toMatchObject({ route: 'offer', offeredMove: 'check_your_gear', dial: 1 });
    for (const confidence of ['medium', 'low']) {
      for (const risk of ['plain', 'slight']) {
        expect(route(read({ risk, confidence }), { pacingConfig: dials(2) }).route, `${confidence} ${risk}`).toBe('narrate');
      }
    }
    // Above the low band the confidence word does not narrate a move.
    expect(route(read({ risk: 'slight', confidence: 'medium' }), { pacingConfig: dials(3) }).route).toBe('offer');
  });

  it('the dial is the category\'s, with the scene override', () => {
    const config = { dials: { combat: 9, investigation: 6, exploration: 6, social: 1, downtime: 1 }, sceneOverride: null };
    expect(route(read({ category: 'social', risk: 'plain', confidence: 'medium' }), { pacingConfig: config }).route).toBe('narrate');
    expect(route(read({ category: 'investigation', risk: 'plain' }), { pacingConfig: config }).route).toBe('roll');
    expect(route(read({ category: 'social', risk: 'plain', confidence: 'medium' }), { pacingConfig: { ...config, sceneOverride: { modifier: 3, label: 'hot' } } }).route).toBe('offer');
  });
});

describe('row 8: a roll from the dial demoted — never a narration promoted', () => {
  it('an unsure reading is offered, at any dial', () => {
    for (const d of [10, 7, 3, 0]) expect(route(read({ risk: 'high', confidence: 'low' }), { pacingConfig: dials(d) }).route, `dial ${d}`).toBe('offer');
  });

  it('a medium reading is offered at 0–2 (the low dial\'s floor) and rolled above it', () => {
    expect(route(read({ risk: 'high', confidence: 'medium' }), { pacingConfig: dials(2) }).route).toBe('offer');
    expect(route(read({ risk: 'high', confidence: 'medium' }), { pacingConfig: dials(3) }).route).toBe('roll');
    expect(route(read({ risk: 'high', confidence: 'medium' }), { pacingConfig: dials(10) }).route).toBe('roll');
  });

  it('a dense window — at least 3 of the last 5 rolled — offers an unasked roll; it never narrates one', () => {
    expect(DENSE_SHARE).toBeCloseTo(0.6, 6);
    expect(route(read({ risk: 'high' }), { pacingConfig: dials(10), density: { count: 3, window: 5 } })).toMatchObject({ route: 'offer', offeredMove: 'face_danger' });
    expect(route(read({ risk: 'high' }), { pacingConfig: dials(10), density: { count: 2, window: 5 } }).route).toBe('roll');
    expect(route(read({ risk: 'plain', confidence: 'medium' }), { pacingConfig: dials(1), density: { count: 5, window: 5 } }).route, 'a narration stays one').toBe('narrate');
    expect(route(read({ risk: 'high' }), { pacingConfig: dials(10), density: null }).route, 'a round has no window').toBe('roll');
  });

  it('isDense: a share of the window, any window size', () => {
    expect([isDense({ count: 3, window: 5 }), isDense({ count: 2, window: 5 }), isDense({ count: 6, window: 10 }), isDense({ count: 1, window: 0 }), isDense(null)])
      .toEqual([true, false, true, false, false]);
  });
});

describe('the route as the decision it was', () => {
  it('roll is MOVE, offer is NWMA, narrate is NARRATIVE; the confidence words are numbers for the telemetry', () => {
    expect(ROUTE_DECISION).toEqual({ roll: PACING_DECISION.MOVE, offer: PACING_DECISION.NARRATIVE_WITH_MOVE_AVAILABLE, narrate: PACING_DECISION.NARRATIVE });
    expect(CONFIDENCE_NUMBER).toEqual({ high: 0.9, medium: 0.6, low: 0.3 });
  });
});
