/**
 * STARFORGED COMPANION
 * tests/unit/arrivalHeldToThePlace.test.js
 *
 * PEOPLE-WAITING-AT-THE-ARRIVAL (the long haul's eighth live round,
 * 2026-11-26, explorations/long-haul-live-20261126-184225/): a71's line "I
 * find Tamsin at her ledger stall …" was rolled as Set a Course to Hollow
 * Spire; its arrival opened at her stall with no word of the crossing (the
 * cold read: it "quietly becomes a Set a Course from Bleakhold, with no
 * journey shown"), and a72's complication — narrated by an oracle follow-up,
 * which took no NOT SO [here] — had the Bleakhold berth's visitor follow the
 * PC "across the docks", two settlements made one dock.
 *
 * A journey's complication is told at the arrival and held to the place by
 * [here], as a beat of play is; it is told to come from what is there; and a
 * journey the line never asked for says the crossing in a sentence ([journey]).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { obligationsFor } from '../../src/moves/contracts/obligations.js';
import { certainViolations } from '../../src/moves/contracts/checks.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { resetSkeletonTable, gmOf, narrationCallsOf, onGm } from '../helpers/skeletonTable.js';

const HERE = { here: 'Hollow Spire', underway: null, places: [{ id: 'loc-bleak', name: 'Bleakhold Station' }],
  people: [{ name: 'Vance Oduya', where: 'at the berth on Bleakhold Station', placeName: 'Bleakhold Station' }], markers: ['Kobayashi IV'] };
const fenced = (frame) => ({ newTruths: [], stateChanges: [],
  sceneFrame: { location: 'Tamsin\'s ledger stall, Hollow Spire docks', present: ['Tamsin Okoro'], remote: [], ...frame } });
const A72 = 'A hand lands on the counter beside your credits, flat and unhurried. The man from the berth has followed you across the docks.';
const tags = (prose, lines, sidecar) => certainViolations(prose, lines, { sidecar }).map(v => v.tag);

describe('a journey\'s complication is held to the place it arrived at', () => {
  it('the oracle mode carries [here] when given the place — and a plain oracle none', () => {
    const lines = obligationsFor({ mode: 'oracle', here: HERE });
    // …and the table's words, as every oracle follow-up is (issue #397, Code fix 4).
    expect(lines.map(l => l.kind)).toEqual(['here', 'apparatus']);
    expect(lines[0].text).toContain('The characters are at Hollow Spire');
    expect(obligationsFor({ mode: 'oracle', oracle: { kind: 'oracle_yes_no', question: 'Is anyone aboard?', rolledLine: 'd100 = 99 → NO' } })
      .map(l => l.kind)).not.toContain('here');
  });

  it('its frame, its present and its prose are read against the record', () => {
    const lines = obligationsFor({ mode: 'oracle', here: HERE });
    expect(tags(A72, lines, fenced({}))).toEqual([]);
    expect(tags(A72, lines, fenced({ location: 'the berth on Bleakhold Station' }))).toEqual(['here']);
    expect(tags(A72, lines, fenced({ present: ['Tamsin Okoro', 'Vance Oduya'] }))).toEqual(['here']);
    expect(tags('You walk back to Bleakhold Station to meet him.', lines, fenced({}))).toEqual(['here']);
  });
});

describe('[journey] — a crossing the line never asked for is said', () => {
  const A71 = 'I find Tamsin at her ledger stall and set the brass star-compass\'s worth in credits on her counter, to cover her debts.';
  const A28 = 'I plot the route to Bleakhold Station and take the Kobayashi IV there, leaving the wreck behind.';
  const kinds = (over, line) => obligationsFor({ mode: 'move', line,
    resolution: { moveId: 'set_a_course', outcome: 'weak_hit', moveTarget: 'Hollow Spire', ...over } }).map(l => l.kind);

  it('a71\'s line, rolled as Set a Course, is told to say the crossing', () => {
    const block = obligationsFor({ mode: 'move', line: A71,
      resolution: { moveId: 'set_a_course', outcome: 'weak_hit', moveTarget: 'Hollow Spire' } }).find(l => l.kind === 'journey');
    expect(block?.text).toBe('THE JOURNEY WAS NOT ASKED FOR IN WORDS. The player\'s line went looking for what is at Hollow Spire, '
      + 'and this move takes them there: say so in one sentence — the crossing made — and then open the scene there.');
  });

  it('not for a line that asks for the journey, a button\'s move, a miss, or another move', () => {
    expect(kinds({}, A28)).not.toContain('journey');
    expect(obligationsFor({ mode: 'move', line: A71, madeLine: true,
      resolution: { moveId: 'set_a_course', outcome: 'strong_hit', moveTarget: 'Hollow Spire' } }).map(l => l.kind)).not.toContain('journey');
    expect(kinds({ outcome: 'miss' }, A71)).not.toContain('journey');
    expect(kinds({ moveId: 'develop_your_relationship' }, A71)).not.toContain('journey');
  });
});

describe('a destination\'s complication is told to come from what is there', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => { restore = await resetSkeletonTable(table); });
  afterEach(() => restore?.());

  async function complication(scope, label) {
    const { narrateOracleFollowup } = await gmOf(table).import('../../src/narration/narrator.js');
    await onGm(table, () => narrateOracleFollowup({ kind: 'complication', oracleName: label, rolledLine: '', scope,
      speakerActorId: 'pc-kira', campaignState: foundry.utils.deepClone(game.settings.get('starforged-companion', 'campaignState')) }));
    return narrationCallsOf(table).at(-1)?.userText ?? '';
  }

  it('at the destination: from its people, its trouble, the place itself', async () => {
    expect(await complication('destination', 'Complication at destination'))
      .toContain('It comes from what is at the destination — its people, its trouble, the place itself — never someone or something the characters left behind.');
  }, 40_000);

  it('control: a scene\'s cost is told nothing of a destination', async () => {
    expect(await complication('scene', 'Narrative cost')).not.toContain('It comes from what is at the destination');
  }, 40_000);
});
