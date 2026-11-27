/**
 * STARFORGED COMPANION
 * tests/unit/arrivalHeldToWhoIsWhere.test.js
 *
 * PEOPLE-WAITING-AT-THE-ARRIVAL (found by the first-session playthrough's
 * re-records for PR #395; the maintainer's go-ahead after the eighth live
 * round): both re-records had the Hollow Spire dockmaster waiting at each end
 * of both journeys — "Vance Oduya is on the dock when the clamps seat … he
 * doesn't look pleased about being early" at Bleakhold Station, while the
 * record had him in the Hollow Spire dock office. A journey's own move took
 * no [here], so nothing held its arrival to who is where.
 *
 * A hit on Set a Course or Finish an Expedition is told NOT SO [arrival]:
 * whoever the record has at another place, and who was not with the
 * characters as they set out, is not waiting at the arrival nor arriving with
 * them. Its certain check reads the fact block's present alone — the
 * journey's narration speaks of the places it crosses.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from 'vitest';
import { obligationsFor, formatObligationsBlock } from '../../src/moves/contracts/obligations.js';
import { certainViolations } from '../../src/moves/contracts/checks.js';
import { hereOf, departedWith } from '../../src/factContinuity/whereabouts.js';
import { readRecord } from '../../src/record/read.js';
import { recordedEvent, recordSourceOf } from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';
const BLEAK = { id: 'act-bleak', type: 'settlement', name: 'Bleakhold Station' };
const SPIRE = { id: 'act-spire', type: 'settlement', name: 'Hollow Spire' };
const T = 1_800_000_000_000;
const VANCE = { name: 'Vance Oduya', where: 'at Hollow Spire', placeName: 'Hollow Spire' };
const ARRIVED = { here: 'Bleakhold Station', hereId: BLEAK.id, underway: null, places: [{ id: SPIRE.id, name: 'Hollow Spire' }],
  people: [VANCE], markers: ['Kobayashi IV'] };
const fenced = (present, location = 'the docking clamps, Bleakhold Station') => ({ sceneFrame: { location, present, remote: [] } });
const tags = (prose, lines, present, location) => certainViolations(prose, lines, { sidecar: fenced(present, location) }).map(v => v.tag);
const move = (moveId, outcome, here = ARRIVED) => obligationsFor({ mode: 'move', resolution: { moveId, outcome, moveTarget: 'Bleakhold Station' }, here });

describe('NOT SO [arrival] — a journey\'s hit', () => {
  it('Set a Course\'s or Finish an Expedition\'s hit is told who is elsewhere, by name; never [here]', () => {
    for (const moveId of ['set_a_course', 'finish_an_expedition']) {
      for (const outcome of ['strong_hit', 'weak_hit']) {
        const lines = move(moveId, outcome);
        expect(lines.map(l => l.kind), `${moveId} ${outcome}`).toContain('arrival');
        expect(lines.map(l => l.kind)).not.toContain('here');
      }
    }
    expect(formatObligationsBlock(move('set_a_course', 'strong_hit'))).toContain('- [arrival] The characters arrive at Bleakhold Station. '
      + 'Whoever was not with them as they set out is where the record has them — Vance Oduya at Hollow Spire: '
      + 'never waiting at Bleakhold Station, nor arriving with the characters.');
  });

  it('not on a miss, an expedition\'s leg, another move, or with no one elsewhere', () => {
    expect(move('set_a_course', 'miss').map(l => l.kind)).not.toContain('arrival');
    expect(move('undertake_an_expedition', 'strong_hit').map(l => l.kind)).not.toContain('arrival');
    expect(move('face_danger', 'strong_hit').map(l => l.kind)).toEqual(expect.arrayContaining(['here']));
    expect(move('face_danger', 'strong_hit').map(l => l.kind)).not.toContain('arrival');
    expect(move('set_a_course', 'strong_hit', { ...ARRIVED, people: [] }).map(l => l.kind)).not.toContain('arrival');
  });

  it('the re-records\' arrival — the dockmaster on the dock — is asked again; the journey\'s own words are not', () => {
    const lines = move('set_a_course', 'strong_hit');
    const told = 'Vance Oduya is on the dock when the clamps seat, and he doesn\'t look pleased about being early.';
    expect(tags(told, lines, ['Mira Kestrel', 'Vance Oduya'])).toEqual(['arrival']);
    // The crossing named: Hollow Spire left behind — no [here] motion reading on a journey.
    expect(tags('You leave Hollow Spire behind and burn hard for Bleakhold. The clamps seat with a shudder.', lines, ['Mira Kestrel'])).toEqual([]);
    // Over the comm is not in person.
    expect(certainViolations('Vance\'s voice crackles: "You made it."', lines,
      { sidecar: { sceneFrame: { location: 'the docking clamps, Bleakhold Station', present: ['Mira Kestrel'], remote: ['Vance Oduya'] } } })).toEqual([]);
  });
});

describe('who set out with the characters may have come along', () => {
  const at = (k, scene, when, opts = {}) => ({ ...recordedEvent('sess-1', k, { ...opts, at: when }), scene });
  function readOf(present) {
    return readRecord({ session: 'campaign' }, recordSourceOf('sess-1', [
      at('session.begun', null, T, { d: { number: 1, table: {} } }),
      at('scene.started', 'sc-office', T + 1_000, { d: { sceneId: 'sc-office', reason: 'first', cause: 'first', what: 'x', place: SPIRE } }),
      at('frame', 'sc-office', T + 1_500, { d: { location: 'the dock office, Hollow Spire', present: ['Mira Kestrel', 'Vance Oduya'] } }),
      at('scene.ended', 'sc-office', T + 2_000, { d: { sceneId: 'sc-office', turn: true } }),
      at('scene.started', 'sc-cockpit', T + 3_000, { d: { sceneId: 'sc-cockpit', reason: 'turn', cause: 'situation', what: 'y', place: SPIRE } }),
      at('frame', 'sc-cockpit', T + 3_500, { d: { location: 'the cockpit, Hollow Spire docks', present } }),
      at('scene.ended', 'sc-cockpit', T + 4_000, { d: { sceneId: 'sc-cockpit', turn: true } }),
    ], { number: 1 }));
  }
  function seat() {
    game.actors._reset();
    for (const p of [BLEAK, SPIRE]) {
      game.actors._set(p.id, makeTestActor({ id: p.id, name: p.name, type: 'location',
        flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${p.id}`, name: p.name } } } }));
    }
    game.actors._set('npc-vance', makeTestActor({ id: 'npc-vance', name: 'Vance Oduya', type: 'character',
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-vance', name: 'Vance Oduya', active: true } } } }));
    game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
    return { currentSessionId: 'sess-1', currentLocationId: BLEAK.id, currentLocationType: 'settlement',
      settlementIds: [BLEAK.id, SPIRE.id], connectionIds: ['npc-vance'], sceneFrame: null };
  }
  beforeEach(() => { game.messages = { contents: [] }; });

  it('the latest frame is the one they left from', () => {
    expect(departedWith(readOf(['Mira Kestrel']))).toEqual(['Mira Kestrel']);
  });

  it('left in his office, the dockmaster is held to Hollow Spire; aboard at the departure, he may have come along', () => {
    expect(hereOf(seat(), { read: readOf(['Mira Kestrel']), arriving: true }).people.map(p => p.name)).toEqual(['Vance Oduya']);
    expect(hereOf(seat(), { read: readOf(['Mira Kestrel', 'Vance Oduya']), arriving: true }).people).toEqual([]);
    // Not an arrival: every beat of play holds him to where he was last seen.
    expect(hereOf(seat(), { read: readOf(['Mira Kestrel', 'Vance Oduya']) }).people.map(p => p.name)).toEqual(['Vance Oduya']);
  });
});
