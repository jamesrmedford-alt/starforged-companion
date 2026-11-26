/**
 * STARFORGED COMPANION
 * tests/unit/exploreRoundSeven.test.js
 *
 * The long haul's seventh live round (2026-11-26), the measure of #390's
 * fixes — overhaul 8 (#393), the dice rule and the six of #391 among them —
 * kept with its review: explorations/long-haul-live-20261126-030646/, commit
 * 126a547f, the first live long haul classed `pass` (27 of 27 beats, 1,381
 * checks, none violated, no fact lost).
 *
 * What it recorded, its verdict, its charter's scoring as it is now, and the
 * replies and prompts its findings rest on: the record held where the
 * characters are, and the prose did not (a60's skiff to Hollow Spire).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isSceneQuestion } from '../../test/ci/playwright/lib/beats.mjs';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const CHARTER_NOW = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'charters/long-haul.json'), 'utf8'));
const checksById = (beats) => Object.fromEntries(beats.map(b => [b.id, b.check]));

const FOLDER = path.join(PLAYWRIGHT, 'explorations', 'long-haul-live-20261126-030646');
const RAW = fs.readFileSync(path.join(FOLDER, 'replay.json'), 'utf8');
const RUN = JSON.parse(RAW);
const reply = (x) => x.response.content.map(c => c.text ?? '').join('');
const said = (step, kind = /narrate|interrogateScene/) => RUN.recording.exchanges.filter(x => x.step === step && kind.test(x.kind)).map(reply).join('\n');
const asked = (step, kind) => RUN.recording.exchanges.filter(x => x.step === step && kind.test(x.kind)).map(x => x.user ?? '').join('\n');
const typed = RUN.actions.map((a, i) => ({ ...a, step: `a${i + 1}` })).filter(a => a.action === 'say' && a.text);
const file = (name) => fs.readFileSync(path.join(FOLDER, name), 'utf8');

describe('the seventh live round, kept as a replay (explorations/long-haul-live-20261126-030646)', () => {
  it('is a run the runner can take again: 90 actions with no document id, its dice, and every reply filed under a step', () => {
    expect(RUN.actions).toHaveLength(90);
    for (const a of RUN.actions) expect(Object.keys(a)).not.toContain('messageId');
    expect(RUN.dice.length).toBeGreaterThan(0);
    expect(RUN.recording.provenance).toMatchObject({ runner: 'test/ci/playwright/explore.mjs', commit: '126a547f76a741aebd9fb400ffc5cf1d119fdec4' });
    const steps = new Set([...RUN.actions.map((_, i) => `a${i + 1}`), ...RUN.charter.beats.filter(b => b.interruption).map(b => `x${b.n}`), '(setup)', '(after)']);
    expect(RUN.recording.exchanges.filter(x => !steps.has(x.step)).map(x => `${x.step} ${x.kind}`)).toEqual([]);
    expect(RAW).not.toMatch(/sk-ant-/);
  });

  it('expects what it found: all 27 beats done, no rule broken — scored by the charter as it is now', () => {
    const beats = Object.entries(RUN.expected.beats);
    expect(beats).toHaveLength(27);
    expect(beats.filter(([, s]) => s !== 'done')).toEqual([]);
    expect(RUN.expected).toMatchObject({ violations: [], healthFailed: false, classification: 'pass' });
    expect(RUN.charter.facts).toEqual(CHARTER_NOW.facts);
    expect(RUN.charter.baits).toEqual(CHARTER_NOW.baits);
    expect(checksById(RUN.charter.beats)).toEqual(checksById(CHARTER_NOW.beats));
    // The charter's memory questions: 17 through @scene; F3-C, reworded, in play at a80.
    expect(typed.filter(a => isSceneQuestion(a.text))).toHaveLength(17);
    expect(RUN.actions[79].text).toBe('Who has my cargo manifest in their keeping today?');
  });

  it('what the charter made happen: every progress roll its scripted strong hit, challenge dice 1 and 2', () => {
    const progress = file('transcript.md').match(/Progress: \d+ \| Challenge: \d+, \d+/g) ?? [];
    expect(progress).toHaveLength(4);
    expect(progress.every(p => p.endsWith('Challenge: 1, 2'))).toBe(true);
  });

  it('holds what its review finds, in the recorded replies and the calls that made them', () => {
    // #393 held for the record: the expedition set out, and the reader was told it.
    expect(asked('a23', /readLine/)).toContain('- Place: none — between places, on the expedition The clipped hauler\'s distress source.');
    // 1. The prose flew to another settlement: a comm call made Tamsin "present";
    //    the line named nobody; the reader read Develop; five frames at the
    //    Hollow Spire docks were refused; then the stall moved to Bleakhold.
    expect(said('a57', /narratePacedInput/)).toContain('"present": ["Mira Kestrel", "gantry hand", "Tamsin Okoro"]');
    expect(RUN.actions[59].text).toContain('I fly the Kobayashi IV\'s skiff to her stall');
    expect(said('a60', /readLine/)).toContain('"move": "develop_your_relationship"');
    expect(asked('a60', /readLine/)).not.toContain('- Elsewhere:');
    expect(said('a60', /narratePacedInput/)).toContain('The skiff clears the ring and noses down toward Hollow Spire\'s docks');
    for (const step of ['a60', 'a61', 'a62', 'a63', 'a64']) expect(said(step, /narratePacedInput|narrateResolution/), step).toMatch(/"location": "[^"]*Hollow Spire docks"/);
    expect(said('a65', /narrateResolution/)).toContain('"location": "Tamsin\'s ledger stall, Bleakhold docks"');
    expect(asked('a86', /narratePacedInput/)).toContain('- [whereabouts] The characters are at Bleakhold Station. Hollow Spire is another place');
    expect(said('a86', /narratePacedInput/)).toContain('Hollow Spire is where you left me');
    // 2. The dice's lines: the PC's own ship, two that contradict each other.
    expect(asked('a60', /narratePacedInput/)).toContain('- [dice] What the dice decided stands — Kobayashi IV: lost her firing angle on the Cinder Wren\'s drive');
    expect(asked('a60', /narratePacedInput/)).toContain('- [dice] What the dice decided stands — Kobayashi IV: docked guns trained on the Cinder Wren\'s drive');
    // 3. Two beats of play in the third person.
    expect(said('a11', /narratePacedInput/)).toContain('Mira turns the brass star-compass over in her palm');
    expect(said('a69', /narratePacedInput/)).toContain('Mira\'s hand lingers on the chit');
    // 4. No judge call: the charter turns the consistency check off.
    expect(RUN.recording.exchanges.filter(x => /obligationJudge/.test(x.kind))).toEqual([]);
    expect(JSON.parse(file('run.json')).settings).toMatchObject({ 'factContinuity.consistencyCheck': false });
    // 7. The chosen price told with a supply cost the table never took.
    expect(said('a25', /narrateResolution/)).toContain('your supplies thinned working through it');
    // The set-piece check, held: a46's opening re-asked for a rolled label.
    expect(asked('a46', /narrateSessionVignette/)).toContain('YOUR DRAFT — NOT POSTED');
    expect(asked('a46', /narrateSessionVignette/)).toContain('Clash Time:');
  });

  it('its review is written: the cold read first, every step noted, the questions answered, the findings filed', () => {
    const card = file('scorecard.md');
    const notes = file('annotated-transcript.md');
    expect(card.indexOf('## The cold read')).toBeGreaterThan(-1);
    expect(card.indexOf('## The cold read')).toBeLessThan(card.indexOf('## What this run was to answer'));
    expect(card).toContain('| Continuity — the narrator | 4 recalled, 4 carried unasked, 0 lost, 0 refused, 0 not probed of 8 |');
    expect(`${card}\n${notes}`).not.toContain('_To write');
    expect(fs.existsSync(path.join(FOLDER, 'cold-read.md'))).toBe(true);
    const review = file('review-notes.md');
    for (const heading of ['## What the charter made happen', '## 1. CHARACTERS-MOVED-BY-THE-NARRATION', '## 2. DICE-LINES-UNBOUNDED',
      '## 3. BEAT-IN-THE-THIRD-PERSON', '## 4. JUDGE-OFF-IN-THE-LONG-HAUL', '## #390\'s fixes, in play']) {
      expect(review).toContain(heading);
    }
  });
});
