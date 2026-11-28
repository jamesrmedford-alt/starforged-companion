/**
 * STARFORGED COMPANION
 * tests/unit/proofBeforeALiveRound.test.js
 *
 * Issue #402, change 6 — a fix is proved on the kept runs before a live
 * round. Here: a beat the charter forces is labelled so, and the review files
 * what follows from it as the charter's (round 10's vow fulfilled at 4 of 10
 * boxes, six Develop lines in one scene); a scenario for each open fault, in
 * the suite or — the refrains test's twelve-line standing scene — a charter
 * of its own; and the stand-in narrator of the vow scenario tells what a
 * vow's plan owes a milestone, so its rehearsal walks change 4.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { charterProblem } from '../../test/ci/playwright/lib/charter.mjs';
import { forcedOf, BEAT_CHECKS } from '../../test/ci/playwright/lib/beats.mjs';
import { scorecard, annotatedTranscript } from '../../test/ci/playwright/lib/review.mjs';
import { owedToTell } from '../../test/ci/playwright/lib/rehearsal.mjs';
import { scenarioProblem } from '../../test/ci/playwright/lib/suite.mjs';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, rel), 'utf8'));
const LONG_HAUL = read('charters/long-haul.json');
const SUITE = { name: 'scenarios', ...read('suites/scenarios.json') };

describe('a beat the charter forces is labelled so', () => {
  it('the long haul\'s two: the track filled line on line (b22), the vow fulfilled at three boxes on a scripted roll (b24)', () => {
    const forced = LONG_HAUL.beats.filter(b => forcedOf(b)).map(b => b.id);
    expect(forced).toEqual(['b22', 'b24']);
    expect(forcedOf(LONG_HAUL.beats.find(b => b.id === 'b24'))).toMatch(/three boxes, its roll scripted to a strong hit/);
    expect(charterProblem(LONG_HAUL)).toBeNull();
  });

  it('a forced beat says why in words', () => {
    const bad = { ...LONG_HAUL, beats: LONG_HAUL.beats.map(b => (b.id === 'b24' ? { ...b, forced: '  ' } : b)) };
    expect(charterProblem(bad)).toBe('beat 25 is forced, and must say why in words');
    expect(forcedOf({ forced: 42 })).toBeNull();
  });

  it('the scorecard\'s beats say which were forced, and file what follows as the charter\'s; the transcript\'s heading says it', () => {
    const beats = [
      { id: 'b23', n: 23, title: 'Develop the relationship to a full track; Forge a Bond', status: 'done', actions: 7, steps: ['a60'], doneAt: 'a66', detail: '', forced: 'six Develop lines in one scene' },
      { id: 'b1', n: 1, title: 'Begin a Session', status: 'done', actions: 1, steps: ['a1'], doneAt: 'a1', detail: '', forced: null },
    ];
    const card = scorecard({ charter: { name: 'long-haul' }, run: { id: 'r', mode: 'live' }, beats });
    expect(card).toContain('| # | Beat | Status | Actions | At | Detail | Forced by the charter |');
    expect(card).toContain('| 23 | Develop the relationship to a full track; Forge a Bond | done | 7 | a66 |  | six Develop lines in one scene |');
    expect(card).toContain('is filed as the charter\'s, not as the module\'s fault');
    const text = annotatedTranscript({ charter: { name: 'long-haul' }, run: { id: 'r', mode: 'live' }, beats,
      actions: [{ step: 'a60', phase: 'session 3', action: { action: 'say', text: 'I bring Tamsin the ledger.' }, summary: 'said a line' }] });
    expect(text).toContain('### a60 · beat 23: Develop the relationship to a full track; Forge a Bond — forced by the charter');
  });
});

describe('a scenario for each open fault', () => {
  it('a Repair spent late, and a session break, are in the suite and can run there', () => {
    for (const name of ['scenario-repair', 'scenario-break']) {
      expect(SUITE.scenarios, name).toContain(name);
      expect(scenarioProblem({ name, ...read(`charters/${name}.json`) }, SUITE), name).toBeNull();
    }
    const repair = read('charters/scenario-repair.json');
    expect(repair.beats.find(b => b.id === 'p2').dice).toEqual({ moves: ['repair'], roll: 'weak_hit' });
    const brk = read('charters/scenario-break.json');
    expect(brk.beats.map(b => b.check.type)).toEqual(['sessionBegun', 'moveOffered', 'oracleAsked', 'sessionEnded', 'sessionBegun']);
  });

  it('the Repair scenario\'s last beat is its spend, read off the Repair card (repairSpent)', () => {
    const repair = read('charters/scenario-repair.json');
    expect(repair.beats.find(b => b.id === 'p4').check).toEqual({ type: 'repairSpent' });
    expect(BEAT_CHECKS.repairSpent({ allCards: [] })).toMatchObject({ done: false });
    expect(BEAT_CHECKS.repairSpent({ allCards: [{ repair: { spent: false } }] })).toMatchObject({ done: false, detail: 'the Repair\'s points are not spent yet' });
    expect(BEAT_CHECKS.repairSpent({ allCards: [{ repair: { spent: true } }] })).toMatchObject({ done: true });
  });

  it('the standing scene is a charter of its own: twelve lines of play, more than a scenario holds', () => {
    const standing = { name: 'standing-scene', ...read('charters/standing-scene.json') };
    expect(charterProblem(standing)).toBeNull();
    expect(standing.beats).toHaveLength(13);
    expect(SUITE.scenarios).not.toContain('standing-scene');
    expect(scenarioProblem(standing, SUITE)).toMatch(/a scenario has 3 to 8 beats/);
  });

  it('the vow scenario\'s stand-in tells what a vow\'s plan owes the beat: the clue\'s words, the culprit\'s name, the step\'s', () => {
    expect(read('charters/scenario-vow.json').rehearsalPlan).toMatchObject({ tellsVowTruth: true, tellsWhatIsOwed: true });
    const user = [
      'TELL — this has happened:',
      '- [milestone] Tell the headway as the scene has shown it.',
      '- [clue] THE HEADWAY TURNS SOMETHING UP. Show this in the beat — seen, found, heard or let slip — in the fiction, never explained: "A consortium seal on a raider\'s crate."',
      '- [culprit] Odile Marr enters the story in this beat, by name — seen, heard or spoken of — with nothing said yet of what they have done.',
      '- [escalation] WHAT THE VOW IS UP AGAINST MOVES. This miss plays it, as something that happens in the scene, never explained: "A second convoy goes dark."',
    ].join('\n');
    expect(owedToTell(user)).toEqual(['A consortium seal on a raider\'s crate.', 'Odile Marr is there, and you mark the name.', 'A second convoy goes dark.']);
    expect(owedToTell('- [milestone] Tell the headway as the scene has shown it.')).toEqual([]);
  });
});
