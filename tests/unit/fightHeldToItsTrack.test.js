/**
 * STARFORGED COMPANION
 * tests/unit/fightHeldToItsTrack.test.js
 *
 * FIGHT-PAST-ITS-END (the long haul's eighth live round, 2026-11-26,
 * explorations/long-haul-live-20261126-184225/): the fight's track was full
 * by a39 and the attacks went on to a45; the narration told the cutter
 * destroyed four times — "drifting dead and hurt" (a38), "the last of her guns
 * goes dark" (a41), "goes up in a white flash" (a42), "a dead thing with no
 * guns left" (a43) — and no card said the track was full.
 *
 * Only Take Decisive Action decides a fight. A blow struck in an open fight
 * (Strike, Clash, Gain Ground, React Under Fire) carries NOT SO [foe], a judge
 * line tripped by the fight told as over; on a full track it says so, and so
 * do the combat-progress card and the reader's SITUATION.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { obligationsFor, formatObligationsBlock } from '../../src/moves/contracts/obligations.js';
import { trippedLines } from '../../src/moves/contracts/checks.js';
import { buildReaderSituationBlock } from '../../src/moves/readerSituation.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { resetSkeletonTable, gmOf, narrationCallsOf, narrateMoveOn, moveResolution, onGm } from '../helpers/skeletonTable.js';

const RUN = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../test/ci/playwright/explorations/long-haul-live-20261126-184225/replay.json'), 'utf8'));
const prose = (step) => RUN.recording.exchanges.filter(x => x.step === step && /narrateResolution/.test(x.kind))
  .map(x => x.response.content.map(c => c.text ?? '').join('').split('```')[0]).join('\n');
const foeOf = (moveId, fightStanding) => obligationsFor({ mode: 'move', resolution: { moveId, outcome: 'weak_hit', fightStanding } })
  .find(o => o.kind === 'foe') ?? null;

describe('a blow in an open fight does not end it', () => {
  it('Strike, Clash, Gain Ground and React Under Fire carry NOT SO [foe]; Take Decisive Action and Enter the Fray do not', () => {
    for (const moveId of ['strike', 'clash', 'gain_ground', 'react_under_fire']) {
      expect(foeOf(moveId, { label: 'the Ashen Wake cutter', full: false }), moveId).toMatchObject({ list: 'NOT SO' });
    }
    expect(foeOf('take_decisive_action', { label: 'x', full: true })).toBeNull();
    expect(foeOf('enter_the_fray', { label: 'x', full: false })).toBeNull();
    // No open fight read: no line.
    expect(foeOf('clash', null)).toBeNull();
  });

  it('on a full track it says the foe is beaten in all but the deciding blow', () => {
    const block = formatObligationsBlock(obligationsFor({ mode: 'move',
      resolution: { moveId: 'clash', outcome: 'weak_hit', fightStanding: { label: 'the Ashen Wake cutter', full: true } } }));
    expect(block).toContain('- [foe] THE FIGHT\'S TRACK IS FULL (the Ashen Wake cutter). The foe is beaten in all but the deciding blow');
    expect(block).toContain('never destroyed, dead, wrecked, fled, surrendered or beaten');
    const open = formatObligationsBlock(obligationsFor({ mode: 'move',
      resolution: { moveId: 'strike', outcome: 'strong_hit', fightStanding: { label: null, full: false } } }));
    expect(open).toContain('- [foe] THE FIGHT IS NOT DECIDED. Only Take Decisive Action ends it');
  });

  it('round 8\'s replies trip it where they tell the cutter dead or a hulk — a36\'s and a37\'s blows do not', () => {
    const foe = [foeOf('clash', { label: 'the Ashen Wake cutter', full: true })];
    expect(prose('a38')).toContain('drifting dead and hurt');
    expect(prose('a43')).toContain('a dead thing with no guns left');
    for (const step of ['a38', 'a39', 'a42', 'a43', 'a45']) expect(trippedLines(prose(step), foe).map(o => o.kind), step).toEqual(['foe']);
    // A blow that leaves the fight going: the barrel jammed (a36), the flank hatch hit (a37).
    for (const step of ['a36', 'a37']) expect(trippedLines(prose(step), foe), step).toEqual([]);
  });

  // Issue #397, Code fix 4: a possessive hid a tripwire word ("hulk's"), and
  // the list lacked forms of its own words.
  it('a possessive or another form of a foe-down word trips it too', () => {
    const foe = [foeOf('clash', { label: 'the Ashen Wake cutter', full: false })];
    for (const told of ['The hulk\'s guns are cold.', 'The wreck\'s lights gutter out.', 'Her reactor destroys itself in a white flare.',
      'Wreckage tumbles past the canopy.', 'She will flee before the next pass.', 'They retreat behind the ice.', 'The cutter\'s crew are dying.']) {
      expect(trippedLines(told, foe).map(o => o.kind), told).toEqual(['foe']);
    }
    expect(trippedLines('Her guns swing round to find you again.', foe)).toEqual([]);
  });

  it('the reader is told the track is full', () => {
    const text = buildReaderSituationBlock({ speaker: { name: 'Mira Kestrel' }, fights: [
      { id: 'f1', label: 'the Ashen Wake cutter', rank: 'dangerous', ticks: 40, position: 'bad_spot' },
    ], challenges: [], expeditions: [] });
    expect(text).toContain('its track full: only Take Decisive Action ends it');
    const half = buildReaderSituationBlock({ speaker: { name: 'Mira Kestrel' }, fights: [
      { id: 'f1', label: 'the Ashen Wake cutter', rank: 'dangerous', ticks: 24, position: 'bad_spot' },
    ], challenges: [], expeditions: [] });
    expect(half).not.toContain('its track full');
  });
});

describe('the move\'s narration reads the open fight off its track', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => { restore = await resetSkeletonTable(table); });
  afterEach(() => restore?.());

  async function fightAt(marks) {
    const store = await gmOf(table).import('../../src/ui/progressTracks.js');
    const fight = await onGm(table, () => store.addProgressTrack({ type: 'combat', label: 'the Ashen Wake cutter', rank: 'dangerous' }));
    if (marks) await onGm(table, () => store.markProgressById(fight.id, marks));
    return fight;
  }

  it('a Clash on a full track is told the track is full', async () => {
    await fightAt(5);
    await narrateMoveOn(table, moveResolution({ moveId: 'clash', moveName: 'Clash', outcome: 'weak_hit', outcomeLabel: 'Weak Hit',
      playerNarration: 'I fire on the cutter again from the berth.', loremasterContext: '[MOVE: Clash +edge] [OUTCOME: Weak Hit]' }));
    const asked = narrationCallsOf(table).at(-1)?.userText ?? '';
    expect(asked).toContain('- [foe] THE FIGHT\'S TRACK IS FULL (the Ashen Wake cutter).');
  }, 40_000);

  it('control: a Strike part-way along its track is told only that the fight is not decided', async () => {
    await fightAt(2);
    await narrateMoveOn(table, moveResolution({ moveId: 'strike', moveName: 'Strike', outcome: 'strong_hit', outcomeLabel: 'Strong Hit',
      playerNarration: 'I fire into her open flank.', loremasterContext: '[MOVE: Strike +edge] [OUTCOME: Strong Hit]' }));
    const asked = narrationCallsOf(table).at(-1)?.userText ?? '';
    expect(asked).toContain('- [foe] THE FIGHT IS NOT DECIDED (the Ashen Wake cutter).');
    expect(asked).not.toContain('TRACK IS FULL');
  }, 40_000);
});
