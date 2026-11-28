/**
 * STARFORGED COMPANION
 * tests/unit/exploreRoundEleven.test.js
 *
 * The long haul's eleventh live round (2026-11-28), issue #402's live measure
 * — its six changes and Part 7's runner — kept with its review:
 * explorations/long-haul-live-20261128-052235/, commit 4bcee5fc, classed
 * `suspected-quality-issue` for one fact scored lost (F4, rightly: the answer
 * gave Tamsin's estimate of the tide as the promise). 27 of 27 beats; 1,445
 * checks, none violated.
 *
 * What it recorded, its verdict, its charter's scoring as it is now, and the
 * replies and prompts its findings rest on — the recorded evidence only, so
 * a fix to any of them leaves this test as it is. The first round whose
 * recording keeps every request's system prompt (#402, change 6), so each
 * finding is pinned to the call that made it: the reveal's own facts in no
 * later call; a culprit named by his job; the reply format's example name in
 * the story; a connection placed on another station; the clock's narration
 * with no scene block; a weak hit filed as clean; two false review cards.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isSceneQuestion } from '../../test/ci/playwright/lib/beats.mjs';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const CHARTER_NOW = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'charters/long-haul.json'), 'utf8'));
const checksById = (beats) => Object.fromEntries(beats.map(b => [b.id, b.check]));

const FOLDER = path.join(PLAYWRIGHT, 'explorations', 'long-haul-live-20261128-052235');
const RAW = fs.readFileSync(path.join(FOLDER, 'replay.json'), 'utf8');
const RUN = JSON.parse(RAW);
const SECTIONS = RUN.recording.systemSections ?? {};
const reply = (x) => x.response.content.map(c => c.text ?? '').join('');
const systemOf = (x) => (x.system ?? []).map(id => SECTIONS[id] ?? '').join('\n\n');
const of = (step, kind) => RUN.recording.exchanges.filter(x => x.step === step && kind.test(x.kind));
const said = (step, kind = /narrate|interrogateScene/) => of(step, kind).map(reply).join('\n');
const asked = (step, kind) => of(step, kind).map(x => `${systemOf(x)}\n${x.user ?? ''}`).join('\n');
const stepNo = (step) => (String(step).startsWith('a') ? Number(String(step).slice(1)) : 0);
const after = (n) => RUN.recording.exchanges.filter(x => stepNo(x.step) > n);
const typed = RUN.actions.filter(a => a.action === 'say' && a.text);
const file = (name) => fs.readFileSync(path.join(FOLDER, name), 'utf8');
const REASKED = 'YOUR DRAFT — NOT POSTED';

describe('the eleventh live round, kept as a replay (explorations/long-haul-live-20261128-052235)', () => {
  it('is a run the runner can take again: 94 actions with no document id, its dice, every reply filed under a step, its prompts kept', () => {
    expect(RUN.actions).toHaveLength(94);
    for (const a of RUN.actions) expect(Object.keys(a)).not.toContain('messageId');
    expect(RUN.dice.length).toBeGreaterThan(0);
    expect(RUN.recording.provenance).toMatchObject({ runner: 'test/ci/playwright/explore.mjs', commit: '4bcee5fca21004a6829036068fa20d722771962d' });
    const steps = new Set([...RUN.actions.map((_, i) => `a${i + 1}`), ...RUN.charter.beats.filter(b => b.interruption).map(b => `x${b.n}`), '(setup)', '(after)']);
    expect(RUN.recording.exchanges.filter(x => !steps.has(x.step)).map(x => `${x.step} ${x.kind}`)).toEqual([]);
    // Change 6: every narration's system prompt is kept, each section once.
    const narrations = RUN.recording.exchanges.filter(x => /^callNarratorAPI>narrate/.test(x.kind));
    expect(narrations).toHaveLength(56);
    expect(narrations.filter(x => !systemOf(x).includes('RESPONSE FORMAT'))).toEqual([]);
    expect(RAW).not.toMatch(/sk-ant-/);
  });

  it('expects what it found: every beat done, no check violated, the class for F4 — scored by the charter as it is now', () => {
    const beats = Object.entries(RUN.expected.beats);
    expect(beats).toHaveLength(27);
    expect(beats.filter(([, s]) => s !== 'done')).toEqual([]);
    expect(RUN.expected).toMatchObject({ violations: [], healthFailed: false, classification: 'suspected-quality-issue' });
    expect(RUN.charter.facts).toEqual(CHARTER_NOW.facts);
    expect(RUN.charter.baits).toEqual(CHARTER_NOW.baits);
    expect(checksById(RUN.charter.beats)).toEqual(checksById(CHARTER_NOW.beats));
    expect(typed.filter(a => isSceneQuestion(a.text))).toHaveLength(17);
    // F4-A, asked in play: Tamsin's estimate of the tide given as the promise.
    expect(said('a21', /narratePacedInput/)).toContain('"Two bells," Tamsin says, finally looking up. "You told me that yourself');
    expect(said('a13', /narratePacedInput/)).toContain('Tide\'s about two bells.');
  });

  it('what the charter made happen: every progress roll its scripted strong hit, challenge dice 1 and 2', () => {
    const progress = file('transcript.md').match(/Progress: \d+ \| Challenge: \d+, \d+/g) ?? [];
    expect(progress).toEqual(['Progress: 6 | Challenge: 1, 2', 'Progress: 4 | Challenge: 1, 2', 'Progress: 10 | Challenge: 1, 2', 'Progress: 4 | Challenge: 1, 2']);
  });

  it('issue #402\'s measure, as recorded: what held', () => {
    // 1a: the oracle's YES filed as the dice's, and carried into session 3's opening.
    expect(asked('a46', /runConsistencyCheck/)).toContain('Is anyone left alive aboard the Cinder Wren? — the oracle answered YES');
    expect(asked('a50', /narrateSessionVignette/)).toContain('Is anyone left alive aboard the Cinder Wren? — the oracle answered YES (the dice)');
    // 1b: the plan's own text reaches no call after the reveal.
    expect(asked('a79', /narrateResolution/)).toContain('Truth: The raids are run by Foreman');
    expect(after(79).filter(x => `${systemOf(x)}${x.user ?? ''}`.includes('The raids are run by Foreman'))).toEqual([]);
    // 2: the clerk's pronoun kept on the frame, across both breaks.
    expect(said('a26', /narrateResolution/)).toContain('"customs clerk (he/him)"');
    expect(said('a50', /narrateSessionVignette/)).toContain('"customs clerk (he/him)"');
    expect(said('a90', /narratePacedInput/)).toContain('"Clerk (he/him)"');
    // 3 R2: the Repair's weak hit told begun, not done.
    expect(said('a60', /narrateResolution/)).toContain('Whatever the hull will be when you finish, it is not yet that.');
    // 4: the milestone's clue, asked for and told.
    expect(asked('a76', /narrateResolution/)).toContain('[clue] THE HEADWAY TURNS SOMETHING UP');
    expect(said('a76', /narrateResolution/)).toContain('the same old freighter hold, the kind whose cranes sort crates with no hand on them');
    // 5: eight judge calls, one flag (a65's [whereabouts], wrong: an invitation), nothing re-asked.
    const judged = RUN.recording.exchanges.filter(x => /^judgeNarration/.test(x.kind));
    expect(judged).toHaveLength(8);
    expect(judged.filter(x => !/"violations"\s*:\s*\[\s*\]/.test(reply(x))).map(x => x.step)).toEqual(['a65']);
    expect(said('a65', /^judgeNarration/)).toContain('Come to the Spire, and I\'ll have a name for the chits ready.');
    expect(RUN.recording.exchanges.filter(x => (x.user ?? '').includes(REASKED))).toEqual([]);
  });

  it('holds what its review finds, in the recorded replies and the calls that made them', () => {
    // 1. The reveal's own truths reach no later call; the recaps cannot name the culprit.
    expect(said('a79', /narrateResolution/)).toContain('"The man who signs for the empty crates is Foreman," the clerk says');
    expect(said('a79', /narrateResolution/)).toContain('old hold-boss of the self-sorting freighter hold');
    expect(after(79).filter(x => `${systemOf(x)}${x.user ?? ''}`.includes('self-sorting freighter hold'))).toEqual([]);
    expect(said('a81', /getCampaignRecap/)).not.toContain('Foreman');
    // 2. The culprit is the flashback's job title, drafted as a person and chosen as one met.
    expect(said('a2', /narrateSessionVignette/)).toContain('A foreman came');
    expect(said('a3', /callNarratorAPI>call$/)).toContain('The raids are run by Foreman');
    // 3. The reply format's example name, told as a character: the only Quint in a75's request.
    expect(said('a75', /narrateResolution/)).toContain('*tasked by the broker\'s runner, Quint*');
    expect(asked('a75', /narrateResolution/).match(/Quint/g)).toHaveLength(1);
    expect(asked('a75', /narrateResolution/)).toContain('"present":   ["Venri Quint (she/her)"]');
    // 4. The player's shots, undone.
    expect(typed.map(a => a.text)).toContain('Alarms hammer along the ring as the Ashen Wake slides in and opens fire on the Kobayashi IV; from her berth I swing the point guns round and fire back at the cutter.');
    expect(said('a32', /narrateResolution/)).toContain('Nobody has fired yet.');
    // 5. Tamsin at the next berth on another station; the arrival line has no place for her.
    expect(said('a32', /narrateResolution/)).toContain('At the next berth, Tamsin Vey\'s shut ledger sits on its stack, her thumb still pinned to its edge.');
    expect(said('a32', /narrateResolution/)).toMatch(/"present": \[[^\]]*"Tamsin Vey \(she\/her\)"/);
    expect(asked('a26', /narrateResolution/)).toContain('Dock Watcher at Hollow Spire; Foreman at Hollow Spire');
    expect(asked('a26', /narrateResolution/)).not.toMatch(/Tamsin Vey at Hollow Spire/);
    // 6. The audit: 74 calls, six findings, two cards — both false.
    const audits = RUN.recording.exchanges.filter(x => /runConsistencyCheck/.test(x.kind));
    expect(audits).toHaveLength(74);
    expect(audits.filter(x => /"contradictions"\s*:\s*\[\s*\{/.test(reply(x))).map(x => x.step)).toEqual(['a26', 'a29', 'a39', 'a46', 'a57', 'a86']);
    expect(file('transcript.md')).toContain('Mira Kestrel — recorded — she/her The narration said: “The clerk edges out from behind his bulkhead, staring at the wreckage.”');
    expect(file('transcript.md')).toContain('Raider Cutter — recorded — is named the Ashen Wake The narration said: “the Cinder Wren drifts dark down the ring”');
    // 7. The clock's narration, given no scene block, changed the clerk's pronoun.
    expect(said('a94', /narrateClockAdvancement/)).toContain('goes back to her slate without another word');
    expect(asked('a94', /narrateClockAdvancement/)).not.toContain('Clerk (he/him)');
    // 8. A weak hit filed with the hit's words; the recap repeats them.
    expect(file('transcript.md')).toContain('Set a Course +supply (5) Action: 5 + 5 = 10 | Challenge: 1, 10 Weak Hit');
    expect(asked('a26', /runConsistencyCheck/)).toContain('You reach Bleakhold Station along the plotted route without trouble.');
    expect(said('a81', /getCampaignRecap/)).toContain('without trouble');
    // 9. The fight's end filed with no winner.
    expect(asked('a81', /getCampaignRecap/)).toContain('Take Decisive Action, strong hit — Momentum 2 → 3 — LASTING: a fight decided');
    // 10. The X-Carded image back at a46, under the redirect.
    expect(asked('a46', /narrateOracleFollowup/)).toContain('## X-CARD — REDIRECT');
    expect(said('a46', /narrateOracleFollowup/)).toContain('A hand, gloved and unsteady, slaps once against her cracked viewport');
    // 17. The summary tells the Repair done, on the wrong ship.
    expect(asked('a94', /narrateClockAdvancement/)).toContain('Mira repaired the cutter\'s damaged plating and power run by hand');
  });

  it('its review is written: the cold read first, every step noted, the questions answered, the findings filed', () => {
    const card = file('scorecard.md');
    const notes = file('annotated-transcript.md');
    expect(card.indexOf('## The cold read')).toBeGreaterThan(-1);
    expect(card.indexOf('## The cold read')).toBeLessThan(card.indexOf('## What this run was to answer'));
    expect(card).toContain('| Continuity — the narrator | 5 recalled, 1 carried unasked, 1 lost, 0 refused, 1 not probed of 8 |');
    expect(`${card}\n${notes}`).not.toContain('_To write');
    expect(fs.existsSync(path.join(FOLDER, 'cold-read.md'))).toBe(true);
    const review = file('review-notes.md');
    for (const heading of ['## Issue #402\'s live measure', '## 1. REVEAL-FACTS-NOT-FILED', '## 2. CULPRIT-A-JOB-TITLE',
      '## 3. EXAMPLE-NAME-IN-THE-STORY', '## 4. PLAYERS-SHOTS-UNDONE', '## 5. CONNECTION-WITH-NO-PLACE', '## 6. AUDIT-FALSE-CARDS',
      '## 7. CLOCK-VIGNETTE-NOT-GIVEN-THE-SCENE', '## 8. WEAK-HIT-FILED-AS-CLEAN', '## 9. FIGHT-WON-NOT-SAID', '## The cold read, checked']) {
      expect(review).toContain(heading);
    }
  });
});
