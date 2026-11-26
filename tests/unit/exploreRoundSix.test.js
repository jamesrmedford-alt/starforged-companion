/**
 * STARFORGED COMPANION
 * tests/unit/exploreRoundSix.test.js
 *
 * The long haul's sixth live round (2026-11-25), the measure of issue #388's
 * fixes, kept with its reviews:
 *
 *   - its first run (explorations/long-haul-live-20261125-225635/, commit
 *     1dcf83d3) stopped at beat 22 on a runner fault — a recovery beat with
 *     nothing spent — mended before the second (e62fa124). Kept as a partial
 *     run, with a summary review;
 *   - its second run (explorations/long-haul-live-20261125-232143/, commit
 *     e62fa124) played all 27 beats. Its own two failures were the checks'
 *     (beat 8's last resort after the expedition was over, beat 25's deepen
 *     spent by the won fight's 🤝), mended in 77c1751a and held in
 *     exploreLongHaul.test.js. Kept in full: cold read, step notes, answers,
 *     and the findings the issue files.
 *
 * What each run recorded, its expected verdict as re-scored, its charter's
 * scoring as it is now, and the replies the findings rest on.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { movesNamedIn } from '../../test/ci/playwright/lib/moveNames.mjs';
import { isSceneQuestion } from '../../test/ci/playwright/lib/beats.mjs';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const CHARTER_NOW = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'charters/long-haul.json'), 'utf8'));
const checksById = (beats) => Object.fromEntries(beats.map(b => [b.id, b.check]));

/** A kept run: its replay, and readers of its recorded replies and the calls that made them. */
function keptRun(folder) {
  const FOLDER = path.join(PLAYWRIGHT, 'explorations', folder);
  const RAW = fs.readFileSync(path.join(FOLDER, 'replay.json'), 'utf8');
  const RUN = JSON.parse(RAW);
  const reply = (x) => x.response.content.map(c => c.text ?? '').join('');
  const said = (step, kind = /narrate|interrogateScene/) => RUN.recording.exchanges.filter(x => x.step === step && kind.test(x.kind)).map(reply).join('\n');
  const asked = (step, kind) => RUN.recording.exchanges.filter(x => x.step === step && kind.test(x.kind)).map(x => x.user ?? '').join('\n');
  const typed = RUN.actions.map((a, i) => ({ ...a, step: `a${i + 1}` })).filter(a => a.action === 'say' && a.text);
  const file = (name) => fs.readFileSync(path.join(FOLDER, name), 'utf8');
  return { FOLDER, RAW, RUN, said, asked, typed, file };
}

/** A replay the runner can take again: no document id, its dice, every reply filed under a step, no key. */
function isReplayable({ RUN, RAW }, { actions, commit }) {
  expect(RUN.actions).toHaveLength(actions);
  for (const a of RUN.actions) expect(Object.keys(a)).not.toContain('messageId');
  expect(RUN.dice.length).toBeGreaterThan(0);
  expect(RUN.recording.provenance).toMatchObject({ runner: 'test/ci/playwright/explore.mjs', commit });
  const steps = new Set([...RUN.actions.map((_, i) => `a${i + 1}`), ...RUN.charter.beats.filter(b => b.interruption).map(b => `x${b.n}`), '(setup)', '(after)']);
  expect(RUN.recording.exchanges.filter(x => !steps.has(x.step)).map(x => `${x.step} ${x.kind}`)).toEqual([]);
  expect(RAW).not.toMatch(/sk-ant-/);
}

/** Re-scored by the checks as they are now, with the charter's scoring as it is now. */
function isScoredByTheChecksNow({ RUN }) {
  expect(RUN.rescored).toMatchObject({ commit: expect.stringMatching(/^[0-9a-f]{40}$/) });
  expect(RUN.charter.facts).toEqual(CHARTER_NOW.facts);
  expect(RUN.charter.baits).toEqual(CHARTER_NOW.baits);
  expect(checksById(RUN.charter.beats)).toEqual(checksById(CHARTER_NOW.beats));
}

// ── the second run: the whole charter, the measure of #388 ─────────────────

describe('the sixth live round\'s second run, kept as a replay (explorations/long-haul-live-20261125-232143)', () => {
  const kept = keptRun('long-haul-live-20261125-232143');
  const { RUN, said, asked, typed, file } = kept;

  it('is a run the runner can take again: 98 actions with no document id, its dice, and every reply filed under a step', () => {
    isReplayable(kept, { actions: 98, commit: 'e62fa124da74e7193c2edb380dd05b477a7205f5' });
  });

  it('its player named a move only at a beat\'s last resort — a30 and a70 — and asked its questions as the charter says', () => {
    const named = typed.filter(a => movesNamedIn(a.text).length);
    expect(named.map(a => a.step)).toEqual(['a30', 'a70']);
    for (const a of named) expect(`${a.reason} ${a.note}`).toMatch(/last.resort/i);
    expect(typed.filter(a => isSceneQuestion(a.text))).toHaveLength(17);
  });

  it('expects what it was found to be: 26 beats done, beat 8 not exercised, no rule broken — its own two failures the checks\'', () => {
    const beats = Object.entries(RUN.expected.beats);
    expect(beats).toHaveLength(27);
    expect(beats.filter(([, s]) => s !== 'done')).toEqual([['b7a', 'not-exercised']]);
    expect(RUN.expected).toMatchObject({ violations: [], healthFailed: false });
    expect(RUN.rescored.was).toMatchObject({ classification: 'product-failure', beats: { done: 25, failed: 2 } });
    isScoredByTheChecksNow(kept);
  });

  it('holds what its review finds, in the recorded replies and the calls that made them', () => {
    // 1. CHARACTERS-MOVED-BY-THE-NARRATION: walked to another station, no journey made.
    expect(said('a64', /narratePacedInput/)).toContain('The walk to the Hollow Spire docks takes the better part of the morning');
    expect(said('a94', /narrate/)).toContain('Hollow Spire is where Tamsin keeps her stall, and where you stood watch.');
    // 2. LINE-CLAIM-OVER-THE-DICE: the dice sent the cutter fleeing; the line found her wreck.
    expect(said('a41', /narrateResolution/)).toContain('The cutter is gone from the ring');
    expect(RUN.actions[76].text).toContain('I go down to the cutter\'s wreck');
    expect(said('a77', /narrateResolution/)).toContain('The wreck of the Cinder Wren lists in the shallows of the docking ring');
    // 3. SIDECAR-NOTE-IN-THE-PROSE: the reply's text between its two blocks.
    expect(said('a17', /narrateSessionVignette/)).toMatch(/```\s*\n+Hmm — correction to the block above[^\n]*\n+```json/);
    expect(file('transcript.md')).toContain('neither has the manifest. Hmm — correction to the block above');
    // 4. OPENING-IN-THE-THIRD-PERSON, and the MATERIAL that names her so.
    expect(said('a52', /narrateSessionVignette/)).toContain('Mira is counting the water ration for the third time');
    expect(said('a98', /narrateSessionVignette/)).toContain('Mira is holding out against a loose-fitting habit of rationing');
    expect(asked('a52', /narrateSessionVignette/)).toContain('What Mira Kestrel is doing in this lull');
    // 5. REPAIR-POINTS-UNREACHABLE: the points, with nothing to spend them by.
    expect(file('transcript.md')).toContain('Gain repair points: facility 5, field 3, under fire 2.');
    // 6. UNNAMED-FIGURE-PRONOUN-DRIFT.
    expect(said('a34', /narrate/)).toContain('slate clutched to her chest');
    expect(said('a58', /narrate/)).toContain('like a man reading a debt');
    // 7. FULFILMENT-SILENT-ON-A-SPENT-DEEPEN: no "already" card in the run.
    expect(file('transcript.md')).not.toMatch(/already counted for your bond|has already deepened for/);
    // 8. SHIP-BOUND-FOR-READ-AS-NEAR: the fact block was right; the record read "near".
    expect(said('a31', /narratePacedInput/)).toContain('"value": "leaving the clipped hauler, bound for Bleakhold Station", "from": "line"');
    // #388's fixes, held: the plea offered, an offer's Roll told its line was narrated, the set-piece re-asked.
    expect(said('a5', /readLine/)).toContain('"move": "make_a_connection"');
    expect(asked('a65', /narrateResolution/)).toContain('This line was narrated before the move was made');
    expect(said('a96', /narrateSessionVignette/)).toContain('A sealed message');
    expect(said('a96', /narrateSessionVignette/)).toContain('A letter sits in her palm, its wax unbroken');
    // The misread F3-C: the records office's own file, not the manifest left with Tamsin.
    expect(said('a88', /narrate/)).toContain('The manifest is out of this office');
  });

  it('its review is written: the cold read first, every step noted, the questions answered, the findings filed', () => {
    const card = file('scorecard.md');
    const notes = file('annotated-transcript.md');
    expect(card.indexOf('## The cold read')).toBeGreaterThan(-1);
    expect(card.indexOf('## The cold read')).toBeLessThan(card.indexOf('## What this run was to answer'));
    expect(card).toContain('| Continuity — the narrator | 5 recalled, 2 carried unasked, 1 lost, 0 refused, 0 not probed of 8 |');
    expect(`${card}\n${notes}`).not.toContain('_To write');
    expect(fs.existsSync(path.join(kept.FOLDER, 'cold-read.md'))).toBe(true);
    const review = file('review-notes.md');
    for (const heading of ['## 1. CHARACTERS-MOVED-BY-THE-NARRATION', '## 2. LINE-CLAIM-OVER-THE-DICE', '## 3. SIDECAR-NOTE-IN-THE-PROSE', '## 11. SCENE-TURNS-INSIDE-A-PLACE']) {
      expect(review).toContain(heading);
    }
  });
});

// ── the first run: stopped at beat 22, kept for its evidence ────────────────

describe('the sixth live round\'s first run, kept as a partial run (explorations/long-haul-live-20261125-225635)', () => {
  const kept = keptRun('long-haul-live-20261125-225635');
  const { RUN, said, typed, file } = kept;

  it('is a run the runner can take again: 57 actions with no document id, its dice, and every reply filed under a step', () => {
    isReplayable(kept, { actions: 57, commit: '1dcf83d35e5186009f7cd2ea92d4131be9bdca44' });
  });

  it('its player named no move and asked its questions as the charter says', () => {
    expect(typed.filter(a => movesNamedIn(a.text).length)).toEqual([]);
    expect(typed.filter(a => isSceneQuestion(a.text))).toHaveLength(10);
  });

  it('expects what it was found to be: 21 beats done, beat 22 not exercised, 23–27 never reached, no rule broken', () => {
    const beats = Object.entries(RUN.expected.beats);
    expect(beats).toHaveLength(27);
    expect(beats.filter(([, s]) => s === 'done')).toHaveLength(21);
    expect(RUN.expected.beats.b21).toBe('not-exercised');
    expect(['b22', 'b23', 'b24', 'b25', 'b26'].map(id => RUN.expected.beats[id])).toEqual(Array(5).fill('pending'));
    expect(RUN.expected).toMatchObject({ violations: [], healthFailed: false });
    isScoredByTheChecksNow(kept);
  });

  it('holds the replies its summary rests on', () => {
    // CHARTER-RECOVER-NOTHING-SPENT's night line, and FORMER_MARK's sentence.
    expect(RUN.actions.map(a => a.text ?? '')).toContain('I rest aboard until the next morning.');
    expect(said('a55', /interrogateScene/)).toContain('that name was the table\'s mistake, and Okoro is what you know her by.');
    // The third-person opening, the round's third sample.
    expect(said('a48', /narrateSessionVignette/)).toContain('Mira has taken up an odd occupation at the gunnery console');
  });

  it('its review is a summary: the scorecard\'s places filled, no step notes kept', () => {
    expect(file('scorecard.md')).not.toContain('_To write');
    expect(fs.existsSync(path.join(kept.FOLDER, 'annotated-transcript.md'))).toBe(false);
    expect(file('review-notes.md')).toContain('## Why it stopped');
  });
});
