/**
 * STARFORGED COMPANION
 * tests/unit/exploreRoundEight.test.js
 *
 * The long haul's eighth live round (2026-11-26), the measure of the six
 * fixes after round 7's review — NOT SO [here], the sheet as the only meter
 * source, [person] on every beat, a who-vow named, an offer's Roll posting no
 * line again, details already worn — kept with its review:
 * explorations/long-haul-live-20261126-184225/, commit 3cf00fd7, classed
 * `pass` (24 of 27 beats, 3 not exercised; 1,593 checks, none violated).
 *
 * What it recorded, its verdict, its charter's scoring as it is now, and the
 * replies and prompts its findings rest on: the six fixes held where they
 * were reached; a vow won by a stranger, a fight told past its end, a
 * complication told twice, a visitor across two settlements' docks.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isSceneQuestion } from '../../test/ci/playwright/lib/beats.mjs';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const CHARTER_NOW = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'charters/long-haul.json'), 'utf8'));
const checksById = (beats) => Object.fromEntries(beats.map(b => [b.id, b.check]));

const FOLDER = path.join(PLAYWRIGHT, 'explorations', 'long-haul-live-20261126-184225');
const RAW = fs.readFileSync(path.join(FOLDER, 'replay.json'), 'utf8');
const RUN = JSON.parse(RAW);
const reply = (x) => x.response.content.map(c => c.text ?? '').join('');
const said = (step, kind = /narrate|interrogateScene/) => RUN.recording.exchanges.filter(x => x.step === step && kind.test(x.kind)).map(reply).join('\n');
const asked = (step, kind) => RUN.recording.exchanges.filter(x => x.step === step && kind.test(x.kind)).map(x => x.user ?? '').join('\n');
const typed = RUN.actions.map((a, i) => ({ ...a, step: `a${i + 1}` })).filter(a => a.action === 'say' && a.text);
const file = (name) => fs.readFileSync(path.join(FOLDER, name), 'utf8');
const REASKED = 'YOUR DRAFT — NOT POSTED';

describe('the eighth live round, kept as a replay (explorations/long-haul-live-20261126-184225)', () => {
  it('is a run the runner can take again: 100 actions with no document id, its dice, and every reply filed under a step', () => {
    expect(RUN.actions).toHaveLength(100);
    for (const a of RUN.actions) expect(Object.keys(a)).not.toContain('messageId');
    expect(RUN.dice.length).toBeGreaterThan(0);
    expect(RUN.recording.provenance).toMatchObject({ runner: 'test/ci/playwright/explore.mjs', commit: '3cf00fd7300a1fde30578753ef4f0e266f7cb6fe' });
    const steps = new Set([...RUN.actions.map((_, i) => `a${i + 1}`), ...RUN.charter.beats.filter(b => b.interruption).map(b => `x${b.n}`), '(setup)', '(after)']);
    expect(RUN.recording.exchanges.filter(x => !steps.has(x.step)).map(x => `${x.step} ${x.kind}`)).toEqual([]);
    expect(RAW).not.toMatch(/sk-ant-/);
  });

  it('expects what it found: 24 beats done, beat 12 not exercised, the cap at beat 26 — scored by the charter as it is now', () => {
    const beats = Object.entries(RUN.expected.beats);
    expect(beats).toHaveLength(27);
    // Beat 12 (b11): a weak hit the runner could not script with momentum 2;
    // its eight actions spent, the 100-action cap stopped beat 26 (b25) and 27.
    expect(beats.filter(([, s]) => s !== 'done')).toEqual([['b11', 'not-exercised'], ['b25', 'current'], ['b26', 'pending']]);
    expect(RUN.expected).toMatchObject({ violations: [], healthFailed: false, classification: 'pass' });
    expect(RUN.charter.facts).toEqual(CHARTER_NOW.facts);
    expect(RUN.charter.baits).toEqual(CHARTER_NOW.baits);
    expect(checksById(RUN.charter.beats)).toEqual(checksById(CHARTER_NOW.beats));
    expect(typed.filter(a => isSceneQuestion(a.text))).toHaveLength(16);
  });

  it('what the charter made happen: every progress roll its scripted strong hit, challenge dice 1 and 2', () => {
    const progress = file('transcript.md').match(/Progress: \d+ \| Challenge: \d+, \d+/g) ?? [];
    expect(progress).toHaveLength(4);
    expect(progress.every(p => p.endsWith('Challenge: 1, 2'))).toBe(true);
  });

  it('holds the six fixes where the run reached them', () => {
    // 1. NOT SO [here] is given to the beats of play — never fired; the place
    //    moved on journeys only: a71's line that sought Tamsin elsewhere was
    //    read as the journey there.
    expect(asked('a4', /narratePacedInput/)).toContain('- [here] The characters are at Hollow Spire: they go to another place only by a journey\'s move');
    expect(asked('a25', /narrateResolution/)).toContain('- [here] The characters are between places, on the expedition');
    expect(asked('a33', /narrateResolution/)).toContain('- [here] The characters are at Bleakhold Station');
    expect(said('a71', /readLine/)).toContain('"move": "set_a_course"');
    expect(said('a71', /readLine/)).toContain('"plainMove": "develop_your_relationship"');
    // The run's one re-ask: a17's opening, whose first draft began with the
    // model's working notes — [material] and [person] — and none of [here].
    const reasks = RUN.recording.exchanges.filter(x => (x.user ?? '').includes(REASKED));
    expect(reasks.map(x => x.step)).toEqual(['a17']);
    expect(asked('a17', /narrateSessionVignette/)).toContain('- [material]');
    expect(asked('a17', /narrateSessionVignette/)).toContain('- [person]');
    expect(asked('a17', /narrateSessionVignette/)).toContain('can be read as Mira trying to keep things even');
    // 1. The comm voice: under "remote", never "present".
    expect(said('a43', /narrateResolution/)).toContain('"remote": ["unknown voice"]');
    // 4. The who-vow: the plan decided at the oath names him; a91 tells it.
    expect(said('a3', /callNarratorAPI>call$/)).toContain('The raids are orchestrated by Dalen Voss');
    expect(said('a91', /narrateResolution/)).toContain('Dalen Voss, of the Spire\'s own administration, is the one behind the raids');
    // 5. An offer's Roll posts the move, never the line again — ten of them.
    expect(file('transcript.md').match(/↳ [^\n]+ — rolled from the offer above/g)).toHaveLength(10);
    // 2. No fact block offered a meter change: nothing for the filter to drop.
    const meterClaims = RUN.recording.exchanges.filter(x => /narrate/.test(x.kind))
      .map(x => (reply(x).match(/```json\s*([\s\S]*?)```/) ?? [])[1] ?? '')
      .filter(block => /"(?:fact|value)"\s*:\s*"[^"]*\b(?:health|spirit|supply|momentum)\b/i.test(block));
    expect(meterClaims).toEqual([]);
  });

  it('holds what its review finds, in the recorded replies and the calls that made them', () => {
    // 1. The vow won by a stranger.
    expect(said('a91', /narrateResolution/)).toContain('Voss\'s face is not one you have seen');
    // 2. The fight told past its end: the track full by a39, the cutter killed
    //    again and again, and a45's stakes still had her fire back.
    expect(said('a38', /narrateResolution/)).toContain('drifting dead and hurt');
    expect(said('a43', /narrateResolution/)).toContain('a dead thing with no guns left');
    expect(said('a45', /readLine/)).toContain('The cutter\'s return fire rakes the berth');
    // 3. The complication told twice: a72's follow-up told it, and a73 was
    //    asked to tell it again ([chosen-since]) — as a25 and a32 were.
    expect(asked('a73', /narrateResolution/)).toContain('- [chosen-since] Since the last narration, Mira Kestrel chose Complication at destination.');
    expect(said('a73', /narrateResolution/)).toContain('A complication has followed you here');
    expect(asked('a25', /narrateResolution/)).toContain('chose Peril at the waypoint');
    expect(asked('a32', /narratePacedInput/)).toContain('chose Complication at destination');
    expect(asked('a71', /narrateResolution/)).toContain('chose Take/give +3 health, then Lose Momentum (-2)');
    // 4. The visitor across two settlements' docks, on an oracle follow-up,
    //    which takes no [here].
    expect(said('a72', /narrateOracleFollowup/)).toContain('The man from the berth has followed you across the docks');
    expect(asked('a72', /narrateOracleFollowup/)).not.toContain('- [here]');
    // 5. Harm told with no cost: a44's price was the ship's.
    expect(said('a44', /narrateResolution/)).toContain('heat rakes your ribs');
    expect(file('transcript.md')).toContain('Withstand Damage (-1) Kobayashi IV: 4 → 3');
    // 6. A line said twice.
    expect(said('a84', /narratePacedInput/)).toContain('"Then you\'re in it as deep as I am," she says.');
    expect(said('a92', /narrateResolution/)).toContain('"Then you\'re in it as deep as I am," she says.');
    // 7. The recap's place, from the line cited last.
    expect(said('a93', /getCampaignRecap/)).toContain('Back at Hollow Spire you rewrapped your burn');
    // The judge is off in the long haul: [sheet] is told and never checked.
    expect(RUN.recording.exchanges.filter(x => /obligationJudge/.test(x.kind))).toEqual([]);
    expect(JSON.parse(file('run.json')).settings).toMatchObject({ 'factContinuity.consistencyCheck': false });
  });

  it('its review is written: the cold read first, every step noted, the questions answered, the findings filed', () => {
    const card = file('scorecard.md');
    const notes = file('annotated-transcript.md');
    expect(card.indexOf('## The cold read')).toBeGreaterThan(-1);
    expect(card.indexOf('## The cold read')).toBeLessThan(card.indexOf('## What this run was to answer'));
    expect(card).toContain('| Continuity — the narrator | 5 recalled, 2 carried unasked, 0 lost, 0 refused, 1 not probed of 8 |');
    expect(`${card}\n${notes}`).not.toContain('_To write');
    expect(fs.existsSync(path.join(FOLDER, 'cold-read.md'))).toBe(true);
    const review = file('review-notes.md');
    for (const heading of ['## 1. VOW-WON-BY-A-STRANGER', '## 2. FIGHT-PAST-ITS-END', '## 3. CHOSEN-COST-TOLD-TWICE',
      '## 4. PEOPLE-WAITING-AT-THE-ARRIVAL', '## 5. HARM-TOLD-WITHOUT-A-COST', '## 6. THE-REFRAINS-THE-LIST-CANNOT-NAME',
      '## 7. RECAP-PLACES-AN-EVENT-BY-THE-NEXT', '## The cold read, checked']) {
      expect(review).toContain(heading);
    }
  });
});
