/**
 * STARFORGED COMPANION
 * tests/unit/exploreRoundTen.test.js
 *
 * The long haul's tenth live round (2026-11-27), issue #399's last measure —
 * the judge and the audit reworked, with the bug audit's nine fixes — kept
 * with its review: explorations/long-haul-live-20261127-202557/, commit
 * 4a49c93f, classed `suspected-quality-issue` for one fact scored lost (F3),
 * which the review finds the charter's miss: the answer named Tamsin by her
 * new name, Okoro (27 of 27 beats; 1,389 checks, none violated).
 *
 * What it recorded, its verdict, its charter's scoring as it is now, and the
 * replies and prompts its findings rest on — the recorded evidence only, so
 * a fix to any of them leaves this test as it is: one review card, and it
 * false; one judge re-ask, on a passed kind, its verdict wrong and its
 * redraft carrying a note about the draft; a cost told and never taken; a
 * culprit no prompt was told to show first; a clerk whose pronoun changed;
 * a survivor left behind; truths listed a scene early.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isSceneQuestion } from '../../test/ci/playwright/lib/beats.mjs';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const CHARTER_NOW = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'charters/long-haul.json'), 'utf8'));
const checksById = (beats) => Object.fromEntries(beats.map(b => [b.id, b.check]));

const FOLDER = path.join(PLAYWRIGHT, 'explorations', 'long-haul-live-20261127-202557');
const RAW = fs.readFileSync(path.join(FOLDER, 'replay.json'), 'utf8');
const RUN = JSON.parse(RAW);
const reply = (x) => x.response.content.map(c => c.text ?? '').join('');
const of = (step, kind) => RUN.recording.exchanges.filter(x => x.step === step && kind.test(x.kind));
const said = (step, kind = /narrate|interrogateScene/) => of(step, kind).map(reply).join('\n');
const asked = (step, kind) => of(step, kind).map(x => x.user ?? '').join('\n');
const typed = RUN.actions.map((a, i) => ({ ...a, step: `a${i + 1}` })).filter(a => a.action === 'say' && a.text);
const file = (name) => fs.readFileSync(path.join(FOLDER, name), 'utf8');
const stepNo = (step) => Number(String(step).replace(/^[ax]/, '')) || 0;
const REASKED = 'YOUR DRAFT — NOT POSTED';

describe('the tenth live round, kept as a replay (explorations/long-haul-live-20261127-202557)', () => {
  it('is a run the runner can take again: 91 actions with no document id, its dice, and every reply filed under a step', () => {
    expect(RUN.actions).toHaveLength(91);
    for (const a of RUN.actions) expect(Object.keys(a)).not.toContain('messageId');
    expect(RUN.dice.length).toBeGreaterThan(0);
    expect(RUN.recording.provenance).toMatchObject({ runner: 'test/ci/playwright/explore.mjs', commit: '4a49c93fdf6c8933d9dfef15d567699e54949765' });
    const steps = new Set([...RUN.actions.map((_, i) => `a${i + 1}`), ...RUN.charter.beats.filter(b => b.interruption).map(b => `x${b.n}`), '(setup)', '(after)']);
    expect(RUN.recording.exchanges.filter(x => !steps.has(x.step)).map(x => `${x.step} ${x.kind}`)).toEqual([]);
    expect(RAW).not.toMatch(/sk-ant-/);
  });

  it('expects what it found: every beat done, no check violated, F3 scored lost — scored by the charter as it is now', () => {
    const beats = Object.entries(RUN.expected.beats);
    expect(beats).toHaveLength(27);
    expect(beats.filter(([, s]) => s !== 'done')).toEqual([]);
    expect(RUN.expected).toMatchObject({ violations: [], healthFailed: false, classification: 'suspected-quality-issue' });
    expect(RUN.charter.facts).toEqual(CHARTER_NOW.facts);
    expect(RUN.charter.baits).toEqual(CHARTER_NOW.baits);
    expect(checksById(RUN.charter.beats)).toEqual(checksById(CHARTER_NOW.beats));
    expect(typed.filter(a => isSceneQuestion(a.text))).toHaveLength(17);
    // The charter's miss (review finding 4): F3 is counted by "Tamsin" alone,
    // and the far probe's right answer calls her by the name beat 19 gave her.
    expect(RUN.charter.facts.find(f => f.id === 'F3').variants).toEqual(['Tamsin']);
    expect(said('a81', /narratePacedInput/)).toContain('The manifest is under Okoro\'s ledger, where you left it on the Hollow Spire docks.');
  });

  it('what the charter made happen: every progress roll its scripted strong hit, challenge dice 1 and 2', () => {
    const progress = file('transcript.md').match(/Progress: \d+ \| Challenge: \d+, \d+/g) ?? [];
    expect(progress).toHaveLength(4);
    expect(progress.every(p => p.endsWith('Challenge: 1, 2'))).toBe(true);
  });

  it('issue #399\'s measure, as recorded: the audit carded once, falsely; the judge re-asked once, on a passed kind, wrongly', () => {
    // The audit: 71 calls, two findings, one card — high confidence alone is
    // posted. a49's Place card, on an answer that looked back (review finding
    // 1); a85's, low and posted nothing, held a truth to an answer that agrees with it.
    const audits = RUN.recording.exchanges.filter(x => /runConsistencyCheck/.test(x.kind));
    expect(audits).toHaveLength(71);
    const found = audits.filter(x => /"contradictions"\s*:\s*\[\s*\{/.test(reply(x)));
    expect(found.map(x => x.step)).toEqual(['a49', 'a85']);
    expect(reply(found[0])).toContain('"evidence":"Back at Hollow Spire, the only dock trader the story has recorded as yours is Tamsin Okoro","kind":"place","confidence":"high"');
    expect(reply(found[1])).toMatch(/"kind": "truth", "confidence": "low"/);
    expect(typed.find(a => a.step === 'a49').text).toBe('@scene Who do I count as a friend among the dock traders back where this began?');
    // The judge: 15 calls; its one violation, a77's [unsaid], quotes speech Okoro says (finding 2).
    const judged = RUN.recording.exchanges.filter(x => /^judgeNarration/.test(x.kind));
    expect(judged).toHaveLength(15);
    expect(judged.filter(x => !/"violations"\s*:\s*\[\s*\]/.test(reply(x))).map(x => x.step)).toEqual(['a77']);
    expect(said('a77', /^judgeNarration/)).toBe('{"violations":[{"line":1,"quote":"\\"Hold the line,\\" she says at last."}]}');
    expect(asked('a77', /callNarratorAPI>narrateResolution/)).toContain('- [unsaid] No line of the player\'s made this move');
    // The run's two re-asks: a2's opening on [person], and a77 on the judge's verdict.
    const reasks = RUN.recording.exchanges.filter(x => (x.user ?? '').includes(REASKED));
    expect(reasks.map(x => `${x.step} ${x.kind}`)).toEqual(['a2 callNarratorAPI>narrateSessionVignette', 'a77 callNarratorAPI>narrateResolution']);
    expect(reasks[0].user).toContain('which gave Mira a great deal of bench');
    // The redraft that posted opens with a note about its draft (finding 3).
    expect(reply(of('a77', /callNarratorAPI>narrateResolution/).at(-1))).toMatch(/^The draft says nothing in your voice\. The break is Okoro's "Hold the line,"/);
  });

  it('holds what its review finds, in the recorded replies and the calls that made them', () => {
    // 6. A cost told and never taken: the stakes promised the mending, and the
    //    weak hit's narration spent supplies the sheet kept (5 throughout).
    expect(asked('a57', /narrateResolution/)).toContain('On a hit: The plating holds and the guns and engine feeds run true again.');
    expect(said('a57', /narrateResolution/)).toContain('your supplies run thinner than you left them');
    expect(file('transcript.md')).toContain('Gain repair points: facility 3, field 1, under fire 0.');
    // 7. The vow's culprit: the oath chose the met foreman — its reply names
    //    no one else — and the name the recap gives besides was appended in
    //    code (secrets.js namedIfAWhoVow); no narration before the fulfilment
    //    showed her. (The prompts that held the truth are in the run's
    //    requests.json, not kept: a replay keeps a call's user turn alone.)
    expect(said('a3', /callNarratorAPI>call$/)).toContain('The raids are run by the foreman who once collected on Mira\'s family debt');
    expect(said('a3', /callNarratorAPI>call$/)).not.toContain('Tolari');
    const before = RUN.recording.exchanges.filter(x => stepNo(x.step) < 75);
    expect(before.filter(x => /narrate|interrogateScene/.test(x.kind) && reply(x).replace(/```json[\s\S]*?```/g, '').includes('Tolari'))).toEqual([]);
    expect(said('a75', /narrateResolution/)).toContain('"Talia Tolari," Okoro says, reading it off the page you sent her.');
    expect(said('a78', /getCampaignRecap/)).toContain('The one behind it is Talia Tolari');
    // 8. The customs clerk: "her" in session 2, "he" in session 3.
    expect(said('a43', /narrateOracleFollowup/)).toContain('The clerk takes her palm off the curled page');
    expect(said('a53', /narratePacedInput/)).toContain('"Cinder Wren," he says');
    // 9. The survivor the oracle's YES showed: handed to session 3's opening, which kept the lock alone.
    expect(said('a43', /narrateOracleFollowup/)).toContain('a figure hauling itself along a bulkhead, one arm pressed to its ribs');
    expect(asked('a47', /narrateSessionVignette/)).toContain('a figure hauling itself along a bulkhead');
    expect(said('a47', /narrateSessionVignette/)).toContain('hangs adrift with a lock still standing open');
    expect(said('a47', /narrateSessionVignette/)).not.toMatch(/figure|survivor|someone aboard/);
    // 10. The truths of a move that began a scene, listed under the scene before it.
    expect(file('transcript.md')).toContain('Scene 1 — the session begins (Tamsin Vey\'s ledger stall on the Hollow Spire docks): tr-47925 Kobayashi IV — followed the clipped hauler distress call');
  });

  it('its review is written: the cold read first, every step noted, the questions answered, the findings filed', () => {
    const card = file('scorecard.md');
    const notes = file('annotated-transcript.md');
    expect(card.indexOf('## The cold read')).toBeGreaterThan(-1);
    expect(card.indexOf('## The cold read')).toBeLessThan(card.indexOf('## What this run was to answer'));
    expect(card).toContain('| Continuity — the narrator | 4 recalled, 2 carried unasked, 1 lost, 0 refused, 1 not probed of 8 |');
    expect(`${card}\n${notes}`).not.toContain('_To write');
    expect(fs.existsSync(path.join(FOLDER, 'cold-read.md'))).toBe(true);
    const review = file('review-notes.md');
    for (const heading of ['## Issue #399\'s live measure', '## 1. REVIEW-CARD-ON-A-RECALLED-PLACE', '## 2. JUDGE-UNSAID-ON-AN-NPC-LINE',
      '## 3. REDRAFT-NARRATES-ITS-FIX', '## 4. LEDGER-RENAME-NOT-A-VARIANT', '## 6. EFFECT-TOLD-BEFORE-APPLIED', '## 7. VOW-WON-BY-A-STRANGER, again',
      '## 8. NPC-PRONOUN-NOT-KEPT', '## 9. ORACLE-YES-LEFT-BEHIND', '## 10. TRUTHS-FILED-A-SCENE-EARLY', '## The cold read, checked']) {
      expect(review).toContain(heading);
    }
  });
});
