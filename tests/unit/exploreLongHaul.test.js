/**
 * STARFORGED COMPANION
 * tests/unit/exploreLongHaul.test.js
 *
 * The long haul (issue #373; #302 slice E part 1) — the parts of a long
 * exploration run that decide something without a browser, checked without
 * one:
 *
 *   - the fact ledger: a fact held, refused, probed at three layers and three
 *     distances; what the helpers wrote read against it; a scene that
 *     restates a fact before it is asked about; baits; leaks of a hidden plan;
 *   - the beats: the pointer the observer moves, a beat given up when it is
 *     not reached, a beat that needs one never done, the interruptions, and
 *     each beat's check on the world;
 *   - the run's class;
 *   - the GM's scripted dice: each gives the roll it promises, by the game's
 *     own arithmetic;
 *   - the player's two new actions, its bounded memory and its cached
 *     instructions;
 *   - the rehearsal that rolls: its scripted player reading buttons off the
 *     screen, its classifier calling a move, its narrator keeping the ledger;
 *   - what a run must have counted before it can be reviewed, and the
 *     generated layers of the two review documents;
 *   - the charter that ships: every beat checkable, every probe told apart.
 *
 * The mechanical checks have their own file (exploreMechanics.test.js). The
 * run itself — two browsers at a live Foundry table — is on demand
 * (test/ci/scripts/cloud.sh explore, EXPLORE_CHARTER=long-haul).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  NEAR_WORDS, clausesOf, containment, contentWords, distanceBand, factHeld, helperWritings, isProbeLine, refusalsIn, scoreBaits, scoreLedger, scoreLeaks, sentencesOf,
  markedCorrected,
} from '../../test/ci/playwright/lib/ledger.mjs';
import { BEAT_CHECKS, STALL_ACTIONS, classifyLongRun, createPointer } from '../../test/ci/playwright/lib/beats.mjs';
import { burnableDice, scriptedDice } from '../../test/ci/playwright/lib/gm.mjs';
import { plansSeen, recheckBeats, scoreLongRun } from '../../test/ci/playwright/lib/longrun.mjs';
import { faceOf, parseDiceLine, uniformFor } from '../../test/ci/playwright/lib/table.mjs';
import {
  ACTION_TOOL, HISTORY_ACTIONS, LABEL_RENAMES, NOTEBOOK_LINES, describeScreen, keepNote, playerSystemPrompt, playerTurnPrompt, resolveScripted, sayWithoutIds, scriptedForm,
  summariseAction, truthIdFor, validateAction,
} from '../../test/ci/playwright/lib/player.mjs';
import { buildRequest } from '../../test/ci/playwright/lib/anthropic.mjs';
import { createRehearsal, readScreenText } from '../../test/ci/playwright/lib/rehearsal.mjs';
import {
  annotatedTranscript, cachingOf, contentOverlap, costSplit, frictionOf, lengthOf, percentile, questionsOf, repetitionOf, rolesIn, scorecard, slipsOf, speedOf, spokenFor,
} from '../../test/ci/playwright/lib/review.mjs';
import { burnedOutcome, outcomeOf, rolledScore } from '../helpers/sequence/rules.js';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const CHARTER = { name: 'long-haul', ...JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'charters/long-haul.json'), 'utf8')) };
const CONFIG = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'explore.config.json'), 'utf8'));

// ── the ledger ───────────────────────────────────────────────────────────────

const COMPASS = {
  id: 'F1', kind: 'a possession', statement: 'Mira carries her sister\'s brass star-compass.', variants: ['star-compass', 'compass'],
  refusals: [{ id: 'lost', near: ['lost', 'sold', 'gave away'] }],
  probes: [{ id: 'F1-A', set: 'A', ask: 'What do I still carry that belonged to my sister?' }, { id: 'F1-B', set: 'B', ask: 'Remind me, which keepsake of my sister\'s is on me?' }],
};
const MANIFEST = {
  id: 'F3', kind: 'an item handed over', statement: 'Mira left the manifest with Tamsin.', variants: ['Tamsin'], anchor: ['manifest'],
  probes: [{ id: 'F3-A', set: 'A', ask: 'Who is holding the cargo manifest I was carrying?' }],
};
const CUTTER = {
  id: 'F6', kind: 'a corrected fact', from: 'world', statement: 'The cutter is the Cinder Wren.', variants: ['Cinder Wren'],
  refusals: [{ id: 'the old value', anywhere: ['Ashen Wake'], prompts: true }],
  probes: [{ id: 'F6-B', set: 'B', ask: 'What is the raider cutter called?' }],
};

/** A run as the observer records it: messages with their step and phase, a mark per step. */
function run(lines, { stores = {}, helpers = {} } = {}) {
  const messages = lines.map((l, i) => ({
    id: `m${i}`, step: l.step, phase: l.phase, text: l.text,
    fromPlayer: l.who === 'player', narrator: l.who === 'narrator' || l.who === 'vignette', vignette: l.who === 'vignette' ? 'galley_begin' : null,
  }));
  const steps = [...new Set(lines.map(l => l.step))];
  const marks = [{ step: '(setup)', phase: 'before', stores: {}, helpers: {} }, ...steps.map(step => ({
    step, phase: lines.find(l => l.step === step).phase, stores: stores[step] ?? stores['*'] ?? {}, helpers: helpers[step] ?? {},
  }))];
  return { messages, marks };
}
const narration = (step, text) => ({ step, kind: 'callNarratorAPI>narratePacedInput', system: '## WORLD SNAPSHOT\n', user: text });
const STORED = { 'F1': [{ store: 'campaign state → previousSessionSummary', memory: true, excerpt: 'her brass star-compass' }] };

describe('a fact, held and refused', () => {
  it('is held by its variant — and, where it needs an anchor, only in a sentence that has both', () => {
    expect(factHeld('The compass is warm in your palm.', COMPASS)).toBe(true);
    expect(factHeld('Tamsin waves from the dock.', MANIFEST), 'her name alone is in every prompt').toBe(false);
    expect(factHeld('Tamsin waves. The manifest is elsewhere.', MANIFEST), 'not the same sentence').toBe(false);
    expect(factHeld('You left the manifest with Tamsin.', MANIFEST)).toBe(true);
  });

  it('is refused by a word beside it, in the same sentence — and by a phrase anywhere', () => {
    expect(refusalsIn('You sold the compass at Bleakhold. The market was loud.', COMPASS)).toMatchObject([{ word: 'sold', sentence: 'You sold the compass at Bleakhold.' }]);
    expect(refusalsIn('The compass is safe. Somebody sold their boots.', COMPASS), 'another sentence').toEqual([]);
    expect(refusalsIn('The Ashen Wake burns off your bow.', CUTTER)).toMatchObject([{ refusal: 'the old value', word: 'Ashen Wake' }]);
  });

  it('a refusal can name its own subject: the wrong pronoun in a sentence that names her', () => {
    const tamsin = { id: 'F2', variants: ['Tamsin'], refusals: [{ id: 'pronoun', subject: ['Tamsin'], near: ['he', 'him', 'his'] }] };
    expect(refusalsIn('Tamsin sets his ledger down.', tamsin)).toHaveLength(1);
    expect(refusalsIn('Tamsin sets her ledger down. The dockhand takes his time.', tamsin)).toEqual([]);
    expect(refusalsIn('She looks up, the broker.', tamsin), 'no sentence names her').toEqual([]);
  });

  it('a refusal is said of the fact — in its clause, near it — not merely in its sentence (the first live run\'s false alarms)', () => {
    const compass = { id: 'F1', variants: ['star-compass', 'compass'], refusals: [{ id: 'lost, sold or given away', near: ['lost', 'sold', 'gave away'] }] };
    expect(refusalsIn('That man was Juro, who sold the lanes\' timings and who crossed the room to ask whether your sister Ilse\'s scratched brass star-compass was for sale.', compass),
      'sold is said of the timings, sixteen words off').toEqual([]);
    expect(refusalsIn('You sold the compass years ago.', compass)).toHaveLength(1);
    expect(refusalsIn('The compass was lost at Vigil Reach, she says.', compass)).toHaveLength(1);

    const manifest = { id: 'F3', variants: ['Tamsin'], anchor: ['manifest'], refusals: [{ id: 'she still has it', subject: ['manifest'], near: ['in your pocket', 'you still have'] }] };
    expect(refusalsIn('The compass is still face-down in your pocket, the manifest is still under Tamsin\'s ledger, and the promise is still owed.', manifest),
      'the pocket is the compass\'s clause').toEqual([]);
    expect(refusalsIn('The manifest is still in your pocket.', manifest)).toHaveLength(1);

    const tamsin = { id: 'F2', variants: ['Tamsin'], refusals: [{ id: 'the wrong pronoun', subject: ['Tamsin'], near: ['he', 'him', 'his'], after: true }] };
    for (const sentence of [
      'He also saw you hand the manifest to Tamsin.',
      'You give Tamsin what you have on Juro: the bright thread, the water-board end of the docks, the lane timings he sells by the hour.',
      'Mira traded her knowledge of Juro for Tamsin\'s, and Tamsin answered with a warning: he wants a rival left behind, and the ledger moves tonight.',
      'Juro signs for crates he never carries, per Tamsin Okoro.',
      'Mira Kestrel proved to Tamsin that Juro signs for crates he never carries and sells the lane timings to the raiders.',
    ]) expect(refusalsIn(sentence, tamsin), sentence).toEqual([]);
    expect(refusalsIn('Tamsin sets his ledger down.', tamsin), 'said of her').toHaveLength(1);
    expect(refusalsIn('Tamsin looks up, and he smiles.', tamsin), 'another clause').toEqual([]);
    // The second live run: every "he" was the clerk — named by his role in the
    // sentence, or in the one before.
    for (const text of [
      'Mira kept Tamsin talking on the comm and described the clerk\'s narrow face to her, until Tamsin quietly asked if he was smiling, and the corner of his mouth lifted.',
      'Mira kept Tamsin talking on the comm and described the smiling clerk to her, and Tamsin learned what he was paid to hear.',
      'The clerk\'s mouth moves, and the corner of it lifts. *If you want to hold Tamsin\'s trust while he listens, this could be a Develop Your Relationship.*',
      'The clerk\'s pen stops mid-line, and he tilts his head toward the comm. You tell Tamsin what you have of him: flat heels, a sash pressed too neat, a habit of reading upside down.',
    ]) expect(refusalsIn(text, tamsin), text).toEqual([]);
    expect(refusalsIn('The comm hisses. Tamsin sets his ledger down.', tamsin), 'nobody else in reach').toHaveLength(1);
    // …and the recap: the clerk three sentences up, the sentence before his "He".
    expect(refusalsIn('The clerk is the part that does not settle. He knew Tamsin\'s full name and the manifest under her ledger. He even knew where the compass was, and Tamsin denied ever having held it. Tamsin suspects his corrections are deliberate.', tamsin)).toEqual([]);

    const berth = { id: 'F5', variants: ['Bleakhold'], refusals: [{ id: 'another settlement', subject: ['Kobayashi', 'your ship'], near: ['berthed at Hollow Spire', 'docked at Hollow Spire'] }] };
    expect(refusalsIn('You believed you were berthed at Hollow Spire, but the dock log puts the Kobayashi IV at Bleakhold, cradle four, with you as captain.', berth)).toEqual([]);
    expect(refusalsIn('The Kobayashi IV is still docked at Hollow Spire.', berth)).toHaveLength(1);
    expect(clausesOf('One, two; three: four — five')).toEqual(['One', 'two', 'three', 'four', 'five']);
    expect(NEAR_WORDS).toBe(10);
  });

  it('reads sentences, content words, and how much of a question a line holds', () => {
    expect(sentencesOf('One. Two! "Three?" Four')).toEqual(['One.', 'Two!', '"Three?"', 'Four']);
    expect(contentWords('What do I still carry that belonged to my sister?')).toEqual(['carry', 'belonged', 'sister']);
    expect(containment(COMPASS.probes[0].ask, 'What do I still carry that belonged to my sister?')).toBe(1);
    expect(isProbeLine('So — what do I still carry that belonged to my sister, then?', COMPASS.probes[0])).toBe(true);
    expect(isProbeLine('Remind me, which keepsake of my sister\'s is on me?', COMPASS.probes[0]), 'another probe of the same fact is another line').toBe(false);
    expect([distanceBand(9), distanceBand(30), distanceBand(60), distanceBand(NaN)]).toEqual(['near', 'mid', 'far', null]);
  });
});

describe('the ledger, scored layer by layer', () => {
  const planted = { who: 'player', step: 'a3', phase: 'session-1', text: 'I turn my sister\'s brass star-compass over in my palm.' };
  const asked = { who: 'player', step: 'a14', phase: 'session-2', text: 'What do I still carry that belonged to my sister?' };

  it('recalled: stored, in the prompt, in the answer — with the distance from where it was planted', () => {
    const { messages, marks } = run([planted, { who: 'narrator', step: 'a3', phase: 'session-1', text: 'Noted.' }, asked,
      { who: 'narrator', step: 'a14', phase: 'session-2', text: 'Ilse\'s compass, brass warm from your palm.' }], { stores: { a3: STORED, '*': STORED } });
    const { facts, totals } = scoreLedger({ facts: [COMPASS], marks, messages, requests: [narration('a14', 'WORLD SNAPSHOT holds the star-compass')] });
    expect(facts[0]).toMatchObject({ verdict: 'recalled', plantedAt: 'a3', failingLayer: null });
    expect(facts[0].probes[0]).toMatchObject({ id: 'F1-A', asked: true, step: 'a14', distance: 11, band: 'near', stored: true, inPrompt: true, inAnswer: true, counted: true, refused: false });
    expect(facts[0].probes[1]).toMatchObject({ id: 'F1-B', asked: false });
    expect(totals).toMatchObject({ facts: 1, recalled: 1, probesAsked: 1, probesCounted: 1, probesRecalled: 1, bands: { near: 1, mid: 0, far: 0 } });
  });

  it.each([
    ['storage', {}, 'nothing', 'storage'],
    ['retrieval', { '*': STORED }, 'nothing', 'retrieval'],
    ['generation', { '*': STORED }, 'the star-compass is in WORLD SNAPSHOT', 'generation'],
  ])('lost at %s: the first layer the fact is missing from', (_name, stores, prompt, layer) => {
    const { messages, marks } = run([planted, asked, { who: 'narrator', step: 'a14', phase: 'session-2', text: 'You carry nothing of hers.' }], { stores });
    const { facts } = scoreLedger({ facts: [COMPASS], marks, messages, requests: [narration('a14', prompt)] });
    expect(facts[0]).toMatchObject({ verdict: 'lost', failingLayer: layer });
  });

  it('an answer at one distance does not make up for a miss at another: the fact is lost, at the question that missed', () => {
    const again = { who: 'player', step: 'a40', phase: 'session-3', text: COMPASS.probes[1].ask };
    const { messages, marks } = run([planted, asked,
      { who: 'narrator', step: 'a14', phase: 'session-2', text: 'Ilse\'s compass, brass warm from your palm.' }, again,
      { who: 'narrator', step: 'a40', phase: 'session-3', text: 'Nothing of hers comes to mind.' }], { stores: { '*': STORED } });
    const { facts, totals } = scoreLedger({ facts: [COMPASS], marks, messages, requests: [narration('a14', 'star-compass'), narration('a40', 'star-compass')] });
    expect(facts[0]).toMatchObject({ verdict: 'lost', failingLayer: 'generation', lostAt: ['F1-B'] });
    expect(totals).toMatchObject({ recalled: 0, lost: 1, probesCounted: 2, probesRecalled: 1 });
  });

  it('a question the fact was on the table for cannot earn recall — and still loses the fact when its answer has not got it', () => {
    const restated = { who: 'narrator', step: 'a13', phase: 'session-2', vignette: 'opening', text: 'The brass star-compass sits where you left it.' };
    const primed = (answer) => run([planted, restated, asked, { who: 'narrator', step: 'a14', phase: 'session-2', text: answer }], { stores: { '*': STORED } });
    const held = primed('Ilse\'s compass, brass warm from your palm.');
    const kept = scoreLedger({ facts: [COMPASS], marks: held.marks, messages: held.messages, requests: [narration('a14', 'star-compass')] }).facts[0];
    expect(kept.probes[0]).toMatchObject({ counted: false, inAnswer: true });
    expect(kept.verdict, 'answered, and not recall').not.toBe('recalled');
    const gone = primed('Nothing of hers comes to mind.');
    expect(scoreLedger({ facts: [COMPASS], marks: gone.marks, messages: gone.messages, requests: [narration('a14', 'star-compass')] }).facts[0])
      .toMatchObject({ verdict: 'lost', lostAt: ['F1-A'] });
  });

  it('refused in the answer fails it outright, whatever else the answer holds', () => {
    const { messages, marks } = run([planted, asked, { who: 'narrator', step: 'a14', phase: 'session-2', text: 'You sold the compass years ago.' }], { stores: { '*': STORED } });
    const { facts } = scoreLedger({ facts: [COMPASS], marks, messages, requests: [narration('a14', 'star-compass')] });
    expect(facts[0]).toMatchObject({ verdict: 'refused', failingLayer: 'generation' });
    expect(facts[0].probes[0]).toMatchObject({ inAnswer: true, refused: true });
    expect(facts[0].refusals[0]).toMatchObject({ step: 'a14', word: 'sold' });
  });

  it('a refusal in what a helper wrote fails the fact at the stored layer, whatever the narrator later answers', () => {
    const { messages, marks } = run([planted, asked, { who: 'narrator', step: 'a14', phase: 'session-2', text: 'Ilse\'s compass, of course.' }], {
      stores: { '*': STORED },
      helpers: { a14: { recap: 'She sold the compass at Bleakhold and has regretted it since.' } },
    });
    const { facts } = scoreLedger({ facts: [COMPASS], marks, messages, requests: [narration('a14', 'star-compass')] });
    expect(facts[0]).toMatchObject({ verdict: 'refused', failingLayer: 'storage' });
    expect(facts[0].refusals[0]).toMatchObject({ where: 'recap (campaign recap)' });
    expect(facts[0].helpers[0]).toMatchObject({ kind: 'recap', holds: true });
  });

  it('a scene that restates the fact before the question is recorded — its own prompt scored — and the question after it is not recall', () => {
    const opening = { who: 'vignette', step: 'a12', phase: 'session-2', text: 'The brass compass lies open on the galley table.' };
    const { messages, marks } = run([planted, opening, asked, { who: 'narrator', step: 'a14', phase: 'session-2', text: 'The compass.' }], { stores: { '*': STORED } });
    const requests = [{ step: 'a12', kind: 'callNarratorAPI>narrateSessionVignette', system: '## WORLD SNAPSHOT\nher brass star-compass\n## THIS NARRATION\n', user: '' }, narration('a14', 'compass')];
    const { facts, totals } = scoreLedger({ facts: [COMPASS], marks, messages, requests });
    expect(facts[0].probes[0]).toMatchObject({ inAnswer: true, counted: false, primedBy: { step: 'a12', by: 'the galley_begin scene' } });
    expect(facts[0].restatements).toMatchObject([{ step: 'a12', phase: 'session-2', inItsPrompt: true, promptSections: ['WORLD SNAPSHOT'] }]);
    expect(facts[0].verdict, 'the carry is seen, without a question that proves it').toBe('carried-unasked');
    expect(totals).toMatchObject({ probesAsked: 1, probesCounted: 0, carriedUnasked: 1 });
  });

  it('a question that names the fact proves nothing', () => {
    const naming = { ...asked, text: 'What do I still carry that belonged to my sister — the compass?' };
    const { messages, marks } = run([planted, naming, { who: 'narrator', step: 'a14', phase: 'session-2', text: 'The compass.' }]);
    expect(scoreLedger({ facts: [COMPASS], marks, messages, requests: [] }).facts[0].probes[0]).toMatchObject({ named: true, counted: false });
  });

  it('a fact the world makes true is planted at the step the runner names; its old value in a later prompt refuses it', () => {
    const { messages, marks } = run([
      { who: 'player', step: 'a40', phase: 'session-2', text: '!truth set "raider cutter" is named the Cinder Wren' },
      { who: 'player', step: 'a41', phase: 'session-2', text: 'I look over the wreck.' },
      { who: 'narrator', step: 'a41', phase: 'session-2', text: 'The hull turns slowly.' },
    ]);
    const clean = scoreLedger({ facts: [CUTTER], marks, messages, requests: [narration('a41', 'the Cinder Wren')], planted: { F6: 'a40' } });
    expect(clean.facts[0]).toMatchObject({ plantedAt: 'a40', verdict: 'not-probed', refusals: [] });
    const stale = scoreLedger({ facts: [CUTTER], marks, messages, requests: [{ ...narration('a41', ''), system: '## RECENT SCENE\nThe Ashen Wake cuts across your bow.\n' }], planted: { F6: 'a40' } });
    expect(stale.facts[0]).toMatchObject({ verdict: 'refused', failingLayer: 'retrieval' });
    expect(stale.facts[0].refusals[0]).toMatchObject({ step: 'a41', word: 'Ashen Wake', where: 'the prompt of callNarratorAPI>narratePacedInput', sentence: 'in RECENT SCENE — and nothing in the prompt says it was corrected' });
    expect(stale.facts[0].carried).toMatchObject([{ step: 'a41', word: 'Ashen Wake', sections: ['RECENT SCENE'], marked: false }]);
  });

  it('the old value in a prompt that says it was corrected is the module doing its work: listed, and no refusal', () => {
    const { messages, marks } = run([
      { who: 'player', step: 'a40', phase: 'session-2', text: '!truth set "raider cutter" is named the Cinder Wren' },
      { who: 'player', step: 'a41', phase: 'session-2', text: 'I look over the wreck.' },
      { who: 'narrator', step: 'a41', phase: 'session-2', text: 'The hull turns slowly.' },
    ]);
    // As the narrator is sent it (the third rehearsal, 2026-11-23).
    const block = [
      '## ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE', '',
      'TRUTHS:', '  raider cutter — is named the Cinder Wren', '',
      'CORRECTED (retracted by the table — do NOT re-assert these, even if', 'earlier narration mentions them):', '  raider cutter — is named the Ashen Wake', '',
      'COMMAND VEHICLE: Kobayashi IV — integrity 5/5', '',
      '## RECENT SCENE', 'The Ashen Wake cuts across your bow.', '',
    ].join('\n');
    expect(markedCorrected(block, 'Ashen Wake')).toBe(true);
    const told = scoreLedger({ facts: [CUTTER], marks, messages, requests: [{ ...narration('a41', ''), system: block }], planted: { F6: 'a40' } });
    expect(told.facts[0], 'the narrator was told: no refusal').toMatchObject({ verdict: 'not-probed', refusals: [] });
    expect(told.facts[0].carried).toMatchObject([{ step: 'a41', marked: true, sections: ['ACTIVE SCENE — BINDING TRUTHS AND CURRENT STATE', 'RECENT SCENE'] }]);

    // A summary's input: the retracted lines under a heading that says so.
    const summary = '## SESSION NARRATION (oldest first)\n\nThe hull turns.\n\n## RETRACTED BY THE TABLE — these did not happen; leave them out\n\nThe Ashen Wake burns.\n';
    expect(markedCorrected(summary, 'Ashen Wake')).toBe(true);
    // A word of the story is no label: a Chronicle entry about the fight.
    expect(markedCorrected('## CAMPAIGN CHRONICLE\n\n[11/23/2026]\nMira Kestrel swung the guns round and struck the Ashen Wake head-on, driving the cutter off.\n', 'Ashen Wake')).toBe(false);
    // Said of something else, it marks nothing.
    expect(markedCorrected('## RECENT SCENE\n\nThe course was corrected twice.\n\nThe Ashen Wake cuts across your bow.\n', 'Ashen Wake')).toBe(false);
    expect(markedCorrected('## RECENT SCENE\nNothing of it here.\n', 'Ashen Wake')).toBe(false);

    // Issue #377 item 1: the module's own note says it, in every later prompt
    // the old name reaches — the snapshot's plan, a clock, lore.
    const noted = [
      '#### Threat — Ashen Wake (id sk-Enye9o8yVxQGTh8x)', '',
      '## CLOCKS', '', '- Tension: Ashen Wake — 0/4', '',
      '## NAMES THE TABLE CHANGED', '', 'Each of these is one person, place or ship with one name.', '',
      '- "Ashen Wake" is now "Cinder Wren" (raider cutter) — corrected by the table.', '',
    ].join('\n');
    expect(markedCorrected(noted, 'Ashen Wake')).toBe(true);
    // …and the summary's source note.
    expect(markedCorrected('## SESSION NARRATION (oldest first)\n\nThe Ashen Wake burns.\n\n## NAMES THE TABLE CHANGED — one name each\n\n- "Ashen Wake" is now "Cinder Wren".\n', 'Ashen Wake')).toBe(true);
  });

  it('a probe is looked for among the lines of the beat that asks it: a short question\'s words elsewhere are not the question', () => {
    const { messages, marks } = run([
      { who: 'player', step: 'a20', phase: 'session-2', text: '!truth set "raider cutter" is named the Cinder Wren' },
      { who: 'player', step: 'a21', phase: 'session-2', text: 'The raider cutter Ashen Wake cuts across my bow — I enter the fray.' },
      { who: 'narrator', step: 'a21', phase: 'session-2', text: 'The cutter comes about.' },
      { who: 'player', step: 'a48', phase: 'session-3', text: 'What is the raider cutter called?' },
      { who: 'narrator', step: 'a48', phase: 'session-3', text: 'The Cinder Wren.' },
    ]);
    const loose = scoreLedger({ facts: [CUTTER], marks, messages, requests: [], planted: { F6: 'a20' } });
    expect(loose.facts[0].probes[0], 'two of the question\'s three words are in the line of play').toMatchObject({ asked: true, step: 'a21' });
    const scoped = scoreLedger({ facts: [CUTTER], marks, messages, requests: [], planted: { F6: 'a20' }, probeSteps: { B: ['a47', 'a48'] } });
    expect(scoped.facts[0].probes[0]).toMatchObject({ asked: true, step: 'a48', inAnswer: true });
  });

  it('never planted, never probed: said as such, not scored', () => {
    const { messages, marks } = run([{ who: 'player', step: 'a1', phase: 'session-1', text: 'Hello.' }]);
    expect(scoreLedger({ facts: [COMPASS], marks, messages, requests: [] }).facts[0]).toMatchObject({ verdict: 'not-planted', plantedAt: null });
  });

  it('what the helpers wrote is read once each, with the step it first appeared at', () => {
    const marks = [
      { step: 'a6', helpers: { summaries: [{ session: 's1', text: 'She carries the compass.' }], chronicle: [{ id: 'c1', text: 'A compass.' }], recap: '' } },
      { step: 'a7', helpers: { summaries: [{ session: 's1', text: 'She carries the compass.' }], chronicle: [{ id: 'c1', text: 'A compass.' }, { id: 'c2', text: 'An arrival.' }], recap: 'Previously.' } },
    ];
    expect(helperWritings(marks).map(h => `${h.kind}@${h.step}`)).toEqual(['summary@a6', 'chronicle@a6', 'chronicle@a7', 'recap@a7']);
  });
});

describe('baits and hidden plans', () => {
  const bait = { id: 'bait-compass', ask: 'Didn\'t I leave the compass with Tamsin?', agrees: ['you did', 'that\'s right'], corrects: ['manifest', 'still carry'] };
  const asked = (answer) => run([{ who: 'player', step: 'a80', phase: 'session-3', text: bait.ask }, ...(answer ? [{ who: 'narrator', step: 'a80', phase: 'session-3', text: answer }] : [])]).messages;

  it('a bait is corrected, taken, unclear or unanswered — and not asked is not asked', () => {
    expect(scoreBaits({ baits: [bait], messages: asked('No — it was the manifest you left with her.') })[0]).toMatchObject({ result: 'corrected', step: 'a80' });
    expect(scoreBaits({ baits: [bait], messages: asked('You did, the night you left.') })[0].result).toBe('taken');
    expect(scoreBaits({ baits: [bait], messages: asked('Tamsin shrugs.') })[0].result).toBe('unclear');
    // The first live run: scored "taken" on the "you did" of a denial.
    expect(scoreBaits({ baits: [bait], messages: asked('"You did not," Tamsin says over the comm. "It\'s face-down on your galley table, where you keep leaving it."') })[0].result).toBe('corrected');
    expect(scoreBaits({ baits: [bait], messages: asked('You didn\'t. It is on the table.') })[0].result).toBe('corrected');
    // The second live run: the denial opens a line of speech, not the answer.
    expect(scoreBaits({ baits: [bait], messages: asked('The clerk\'s pen stops. He lets the question sit, then reaches past your shoulder and taps your coat, where the brass lies against your ribs. "No," he says. "You carried it out." On the comm, Tamsin\'s chair creaks.') })[0].result).toBe('corrected');
    expect(scoreBaits({ baits: [bait], messages: asked(null) })[0].result).toBe('unanswered');
    expect(scoreBaits({ baits: [bait], messages: [] })[0]).toMatchObject({ asked: false, result: 'not-asked' });
  });

  it('a hidden plan\'s truth stated before its reveal is a suspected leak; after it, it is the reveal', () => {
    const plan = { id: 'p1', subject: 'the quiet buyer', truth: 'The quiet buyer underwrites the lane raids through a shell consortium and means to own the wreck rights.', firstSeen: 'a10', revealedAt: 'a50' };
    const { messages } = run([
      { who: 'narrator', step: 'a10', phase: 'session-1', text: 'A buyer nobody names has been asking after wrecks.' },
      { who: 'narrator', step: 'a20', phase: 'session-1', text: 'Word is a shell consortium underwrites the raids, to own the wreck rights outright.' },
      { who: 'narrator', step: 'a50', phase: 'session-2', text: 'It is out now: the consortium underwrites the raids and means to own the wreck rights.' },
    ]);
    const [scored] = scoreLeaks({ plans: [plan], messages, common: ['Cinder Expanse'] });
    expect(scored.leaks).toHaveLength(1);
    expect(scored.leaks[0]).toMatchObject({ step: 'a20' });
    expect(scoreLeaks({ plans: [{ ...plan, truth: 'It lies.' }], messages })[0], 'a truth of two words cannot be compared').toMatchObject({ leaks: [], note: expect.stringContaining('too few') });
  });
});

// ── the beats ────────────────────────────────────────────────────────────────

const PC = { id: 'pc', name: 'Mira', health: 5, spirit: 5, supply: 5, momentum: 2, momentumMax: 10, momentumReset: 2, vows: [], bonds: [], legacies: {} };
const tableOf = (over = {}) => ({
  session: { active: true, id: 's1', pendingMove: false, xCardActive: false, questFocus: '' }, location: { id: 'L1', name: 'Hollow Spire' },
  ship: { token: { x: 1, y: 1 }, tokenAt: 'Hollow Spire' }, pcs: [{ ...PC, ...(over.pc ?? {}) }], connections: [], entityCards: [], tracks: [],
  legacy: {}, scene: { truths: [] }, helpers: {}, plans: [], ...over, pc: undefined,
});
const markOf = (step, table, cards = []) => ({ step, phase: 'session-1', table, cards });

describe('a run\'s beats, checked again from its evidence', () => {
  // The first live long haul, in small: the X-Card retracted the truth and
  // the correction was made, and the checks as they then were said "failed"
  // and "not reached". The evidence is the same; the checks are corrected.
  const truth = (id, subject, fact, retracted, narrationId = null) => ({ id, subject, fact, retracted, narrationId });
  const named = truth('t1', 'raider cutter', 'is named the Ashen Wake', false);
  const drifting = (retracted) => truth('t2', 'Ashen Wake', 'a strip of its hull drifts in the bay mouth', retracted, 'N1');
  const marks = [
    markOf('a34', tableOf({ scene: { truths: [named] } })),
    markOf('a35', tableOf({ scene: { truths: [named, drifting(false)] } }), [{ id: 'n1', xCarded: false, narration: { narrationId: 'N1' } }]),
    markOf('x15', tableOf({ scene: { truths: [named, drifting(true)] } }), [{ id: 'n1', xCarded: true, narration: { narrationId: 'N1' } }, { id: 'x1', xcard: true }]),
    markOf('a36', tableOf({ scene: { truths: [named, drifting(true)] } })),
    markOf('a37', tableOf({ scene: { truths: [{ ...named, retracted: true }, drifting(true)] } })),
    markOf('a38', tableOf({ scene: { truths: [{ ...named, retracted: true }, drifting(true), truth('t3', 'raider cutter', 'is named the Cinder Wren', false), truth('t4', 'Ashen Wake', 'closing fast', false)] } })),
    markOf('a39', tableOf({ scene: { truths: [{ ...named, retracted: true }, drifting(true), truth('t3', 'raider cutter', 'is named the Cinder Wren', false), truth('t4', 'Ashen Wake', 'closing fast', false)] } })),
  ];
  const charter = {
    facts: [{ ...CUTTER, plantedBy: 'b16' }],
    beats: [
      { id: 'b15', n: 15, session: 2, title: 'the X-Card', interruption: 'xCard', check: { type: 'xCarded' } },
      { id: 'b16', n: 16, session: 2, title: 'Correct a fact', check: { type: 'corrected', fact: 'F6' } },
    ],
  };
  const was = [
    { id: 'b15', n: 15, status: 'failed', actions: 1, steps: ['a35', 'x15'], enteredAt: 'a34', doneAt: 'x15', detail: 'the removed narration still has 1 standing truth(s)' },
    { id: 'b16', n: 16, status: 'not-exercised', actions: 4, steps: ['a36', 'a37', 'a38', 'a39'], enteredAt: 'x15', doneAt: 'a39', detail: 'not reached in 8 actions — the corrected value is set and the old one still stands' },
  ];

  it('each beat is checked over the steps it had, and is done at the first of them its check says so', () => {
    const beats = recheckBeats({ charter, beats: was, marks, messages: [], actions: [] });
    expect(beats[0]).toMatchObject({ status: 'done', doneAt: 'x15', enteredAt: 'a34', steps: ['a35', 'x15'] });
    expect(beats[1]).toMatchObject({ status: 'done', doneAt: 'a38' });
    expect(beats[1].detail).toContain('1 other truth(s) are still filed under the old name');
    expect(was[0].status, 'the run\'s own record is not changed').toBe('failed');
  });

  it('a beat the corrected check still does not find done stays not exercised, with what the check sees', () => {
    const never = recheckBeats({ charter, beats: was, marks: marks.slice(0, 5), messages: [], actions: [] });
    expect(never[1]).toMatchObject({ status: 'not-exercised' });
    expect(never[1].detail).toMatch(/^not reached in 4 actions — no standing truth holds the corrected value/);
  });

  it('a beat that needs one no longer done is not exercised; the score is made from the beats as re-checked', () => {
    const needing = { ...charter, beats: [...charter.beats, { id: 'b17', n: 17, session: 2, title: 'after', needs: ['b99'], check: { type: 'oracleAsked' } }] };
    const beats = recheckBeats({ charter: needing, beats: [...was, { id: 'b17', n: 17, status: 'done', actions: 1, steps: ['a39'], enteredAt: 'a38', doneAt: 'a39', detail: 'x' }], marks, messages: [], actions: [] });
    expect(beats[2]).toMatchObject({ status: 'not-exercised', detail: 'it needs beat b99, which was not done' });

    const long = scoreLongRun({ charter, beats: recheckBeats({ charter, beats: was, marks, messages: [], actions: [] }), marks, messages: [], actions: [], requests: [] });
    expect(long.summary).toEqual({ beats: 2, done: 2, failed: 0, notExercised: 0 });
    expect(long.ledger.facts[0], 'the corrected fact is planted where its beat was done').toMatchObject({ id: 'F6', plantedAt: 'a38' });
    expect(long.mechanics.violations).toEqual([]);
  });

  it('the hidden plans seen over a run: when each was first seen, and when its truth was revealed', () => {
    const plan = (truthRevealed) => ({ id: 'sk-1', kind: 'threat', subject: 'Ashen Wake', truth: 'flown by a bounty hunter', truthRevealed });
    expect(plansSeen([{ step: 'a1', table: { plans: [] } }, { step: 'a2', table: { plans: [plan(false)] } }, { step: 'a3', table: { plans: [plan(true)] } }]))
      .toEqual([{ id: 'sk-1', kind: 'threat', subject: 'Ashen Wake', truth: 'flown by a bounty hunter', firstSeen: 'a2', revealedAt: 'a3' }]);
  });
});

describe('the pointer over the beats', () => {
  const beats = [
    { id: 'b1', n: 1, session: 1, title: 'Begin', check: { type: 'sessionBegun', n: 1 } },
    { id: 'b2', n: 2, session: 1, title: 'Meet', check: { type: 'connectionMade', name: 'Tamsin Vey' } },
    { id: 'b3', n: 3, session: 1, title: 'Link', needs: ['b2'], check: { type: 'vowLinked', name: 'Tamsin Vey' } },
    { id: 'b4', n: 4, session: 1, title: 'End', check: { type: 'sessionEnded', n: 1 } },
  ];
  const closed = tableOf({ session: { active: false, id: null } });
  const open = tableOf();

  it('the observer marks a beat done and moves on — the player is never asked', () => {
    const pointer = createPointer(beats);
    const marks = [markOf('(setup)', closed)];
    expect(pointer.advance({ marks, messages: [], actions: [], charter: {} }, '(setup)')).toEqual([]);
    expect(pointer.current().beat.id).toBe('b1');
    pointer.record('a1');
    marks.push(markOf('a1', open));
    const changes = pointer.advance({ marks, messages: [], actions: [], charter: {} }, 'a1');
    expect(changes).toMatchObject([{ id: 'b1', status: 'done', doneAt: 'a1', actions: 1 }]);
    expect(pointer.current().beat.id).toBe('b2');
    expect(pointer.brief()).toMatchObject({ n: 2, of: 4, title: 'Meet', actions: 0, note: expect.stringContaining('no connection card yet') });
  });

  it(`a beat not reached in ${STALL_ACTIONS} actions is not exercised, and the run goes on — as does a beat that needed it`, () => {
    const pointer = createPointer(beats);
    const marks = [markOf('(setup)', open)];
    pointer.advance({ marks, messages: [], actions: [], charter: {} }, '(setup)');
    for (let i = 1; i <= STALL_ACTIONS; i++) {
      pointer.record(`a${i}`);
      marks.push(markOf(`a${i}`, open));
      const changes = pointer.advance({ marks, messages: [], actions: [], charter: {} }, `a${i}`);
      if (i < STALL_ACTIONS) expect(changes).toEqual([]);
      else expect(changes.map(c => `${c.id}:${c.status}`)).toEqual(['b2:not-exercised', 'b3:not-exercised']);
    }
    expect(pointer.state[1].detail).toContain(`not reached in ${STALL_ACTIONS} actions`);
    expect(pointer.state[2].detail).toBe('it needs beat 2, which was not done');
    expect(pointer.current().beat.id).toBe('b4');
    expect(pointer.summary()).toEqual({ beats: 4, done: 1, failed: 0, notExercised: 3 });
  });

  it('a beat that moves is given its eight actions again from where it last moved', () => {
    const facts = [{ id: 'F1', variants: ['compass'] }, { id: 'F2', variants: ['Tamsin'] }];
    const pointer = createPointer([{ id: 'b5', n: 5, session: 1, title: 'Plant', check: { type: 'factsPlanted', facts: ['F1', 'F2'] } }]);
    const marks = [markOf('(setup)', open)];
    const messages = [];
    const go = (i, text) => {
      pointer.record(`a${i}`);
      marks.push(markOf(`a${i}`, open));
      if (text) messages.push({ id: `m${i}`, step: `a${i}`, phase: 'session-1', fromPlayer: true, text });
      return pointer.advance({ marks, messages, actions: [], charter: { facts } }, `a${i}`);
    };
    pointer.advance({ marks, messages, actions: [], charter: { facts } }, '(setup)');
    for (let i = 1; i <= 7; i++) expect(go(i)).toEqual([]);
    expect(go(8, 'I check my compass.'), 'progress on the eighth action').toEqual([]);
    for (let i = 9; i <= 15; i++) expect(go(i)).toEqual([]);
    expect(go(16)).toMatchObject([{ status: 'not-exercised', detail: expect.stringContaining('1 of 2 stated') }]);
  });

  it('an interruption waits for the runner to make it, and is checked once', () => {
    const pointer = createPointer([{ id: 'b14', n: 14, session: 2, title: 'End a Session opened and closed', interruption: 'endSessionCancelled', check: { type: 'nothingChanged' } }]);
    const marks = [markOf('a30', open)];
    expect(pointer.advance({ marks, messages: [], actions: [], charter: {} }, 'a30')).toEqual([]);
    expect(pointer.current().state.status).toBe('current');
    pointer.interrupted();
    marks.push(markOf('x14', tableOf({ pc: { momentum: 3 } })));
    expect(pointer.advance({ marks, messages: [], actions: [], charter: {} }, 'x14')).toMatchObject([{ status: 'failed', detail: 'Mira\'s momentum went from 2 to 3' }]);
    expect(pointer.finished()).toBe(true);
  });

  it('a beat the observer has no check for is the charter\'s error, said at once', () => {
    const pointer = createPointer([{ id: 'b1', n: 1, session: 1, title: 'X', check: { type: 'vibes' } }]);
    expect(() => pointer.advance({ marks: [markOf('(setup)', open)], messages: [], actions: [], charter: {} }, '(setup)')).toThrow(/no check the observer knows/);
  });
});

describe('each beat\'s check on the world', () => {
  const conn = { hostId: 'A1', recordId: 'r1', name: 'Tamsin Vey', rank: 'dangerous', bonded: false, active: true, ticks: 0 };
  const bond = { id: 'i1', name: 'Tamsin Vey', rank: 'dangerous', ticks: 0, completed: false, connectionId: 'r1' };
  const vow = { id: 'v1', vowId: 'v1', name: 'Find the raiders', rank: 'dangerous', ticks: 0, completed: false, linkedConnectionId: null, linkedConnectionName: null };
  const moveCard = (id, name, diceLine, shown, extra = {}) => ({ id, move: { resolutionId: id, actorId: 'pc', name, diceLine, shown, burn: null, held: null, ...extra } });
  const check = (type, c, marks, extra = {}) => {
    const pointer = createPointer([{ id: 'b', n: 1, session: 1, title: type, check: { type, ...c } }]);
    pointer.advance({ marks: marks.slice(0, 1), messages: [], actions: [], charter: extra.charter ?? {} }, marks[0].step);
    pointer.advance({ marks, messages: extra.messages ?? [], actions: [], charter: extra.charter ?? { cast: { connection: { name: 'Tamsin Vey' } } } }, marks.at(-1).step);
    return pointer.state[0];
  };
  const setup = markOf('a0', tableOf());

  it('a connection is made: one card, held by the character, its bond Item mirroring it — and two cards of one name fail it', () => {
    const made = tableOf({ connections: [conn], entityCards: [{ id: 'A1', name: 'Tamsin Vey', entityType: 'connection' }], pc: { bonds: [bond] } });
    expect(check('connectionMade', { name: 'Tamsin Vey' }, [setup, markOf('a1', made)])).toMatchObject({ status: 'done' });
    // Where the beat asks for the move too, the card alone is not the beat.
    expect(check('connectionMade', { name: 'Tamsin Vey', move: 'make_a_connection' }, [setup, markOf('a1', made)]).detail).toContain('make_a_connection has not been rolled');
    const rolled = moveCard('r0', 'Make a Connection', 'Action: 6 + 2 = 8 | Challenge: 1, 2', 'strong_hit');
    expect(check('connectionMade', { name: 'Tamsin Vey', move: 'make_a_connection' }, [setup, markOf('a1', made, [rolled])]))
      .toMatchObject({ status: 'done', detail: expect.stringContaining('still one card') });
    const noBond = tableOf({ connections: [conn], entityCards: [{ id: 'A1', name: 'Tamsin Vey', entityType: 'connection' }] });
    expect(check('connectionMade', { name: 'Tamsin Vey' }, [setup, markOf('a1', noBond)])).toMatchObject({ status: 'current', detail: expect.stringContaining('holds no bond Item') });
    const twice = tableOf({ connections: [conn], entityCards: [{ id: 'A1', name: 'Tamsin Vey' }, { id: 'A2', name: 'Tamsin Vey' }], pc: { bonds: [bond] } });
    expect(check('connectionMade', { name: 'Tamsin Vey' }, [setup, markOf('a1', twice)])).toMatchObject({ status: 'failed', detail: '2 cards are named Tamsin Vey' });
  });

  it('a vow is linked to the card, by its id — and a vow card with no Link is named as why not', () => {
    const linked = tableOf({ connections: [conn], pc: { vows: [{ ...vow, linkedConnectionId: 'A1', linkedConnectionName: 'Tamsin Vey' }] } });
    expect(check('vowLinked', {}, [setup, markOf('a1', linked)])).toMatchObject({ status: 'done' });
    const elsewhere = tableOf({ connections: [conn], pc: { vows: [{ ...vow, linkedConnectionId: 'ZZ', linkedConnectionName: 'Tamsin Vey' }] } });
    expect(check('vowLinked', {}, [setup, markOf('a1', elsewhere)])).toMatchObject({ status: 'failed' });
    const noRow = markOf('a1', tableOf({ connections: [conn], pc: { vows: [vow] } }), [{ id: 'c1', vowCard: { vowId: 'v1', hasLinkRow: false } }]);
    expect(check('vowLinked', {}, [setup, noRow]).detail).toBe('no vow is linked; the vow\'s card offers no Link');
  });

  it('a move is rolled while the beat is current — a roll from the step before belongs to the beat before', () => {
    const roll = moveCard('r1', 'Gather Information', 'Action: 4 + 3 = 7 | Challenge: 2, 9', 'weak_hit');
    expect(check('moveRolled', { moves: ['gather_information'] }, [setup, markOf('a1', tableOf(), [roll])])).toMatchObject({ status: 'done', detail: expect.stringContaining('weak_hit') });
    expect(check('moveRolled', { moves: ['gather_information'] }, [markOf('a0', tableOf(), [roll]), markOf('a1', tableOf())])).toMatchObject({ status: 'current' });
    expect(check('moveRolled', { moves: ['strike'], outcome: 'miss' }, [setup, markOf('a1', tableOf(), [moveCard('r2', 'Strike', 'Action: 6 + 2 = 8 | Challenge: 1, 2', 'strong_hit')])]).detail).toContain('not miss');
  });

  it('the ship arrives, token and all; a course that missed and moved it fails', () => {
    const there = tableOf({ location: { id: 'L2', name: 'Bleakhold Station' }, ship: { token: { x: 2, y: 2 }, tokenAt: 'Bleakhold Station' } });
    const course = (shown) => moveCard('r1', 'Set a Course', 'Action: 3 + 5 = 8 | Challenge: 2, 4', shown);
    expect(check('arrived', { settlement: 'Bleakhold Station' }, [setup, markOf('a1', there, [course('strong_hit')])])).toMatchObject({ status: 'done' });
    expect(check('arrived', { settlement: 'Bleakhold Station' }, [setup, markOf('a1', there, [course('miss')])])).toMatchObject({ status: 'failed', detail: 'a Set a Course that missed moved the ship' });
    const tokenLeft = tableOf({ location: { id: 'L2', name: 'Bleakhold Station' } });
    expect(check('arrived', { settlement: 'Bleakhold Station' }, [setup, markOf('a1', tokenLeft, [course('strong_hit')])])).toMatchObject({ status: 'failed', detail: expect.stringContaining('token is at Hollow Spire') });
  });

  it('a fight is open and serves the vow; a miss in it is paid for; momentum is burned on a roll', () => {
    const fight = { id: 't1', label: 'Ashen Wake', type: 'combat', rank: 'dangerous', ticks: 0, completed: false, linkedVowName: 'Find the raiders', combatState: 'in_control' };
    expect(check('fightBegun', {}, [setup, markOf('a1', tableOf({ tracks: [fight], pc: { vows: [vow] } }))])).toMatchObject({ status: 'done' });
    expect(check('fightBegun', {}, [setup, markOf('a1', tableOf({ tracks: [{ ...fight, linkedVowName: null }], pc: { vows: [vow] } }))]).detail).toContain('serves no vow');
    const miss = moveCard('r1', 'Strike', 'Action: 1 + 2 = 3 | Challenge: 10, 9', 'miss');
    const offered = { id: 's1', suffer: { resolved: false, picked: [], moveId: 'strike' } };
    expect(check('sufferPaid', {}, [setup, markOf('a1', tableOf(), [miss, offered])]).detail).toBe('a suffer card is offered and not answered');
    // The first live run: the price was stated before the roll and told in
    // the story; a voluntary Endure Stress three actions later brought a
    // choice card of its own, which was taken for the miss's.
    const stated = { id: 'p1', price: { text: 'Pay the Price Strike As stated before the roll: Your rounds scatter wide and the raider cutter closes on the hull.', actorId: 'pc' } };
    const told = check('sufferPaid', {}, [setup, markOf('a1', tableOf(), [miss, stated])]);
    expect(told).toMatchObject({ status: 'done' });
    expect(told.detail).toContain('named no suffer move and was paid in the story — the suffer path was not exercised');
    const another = { id: 's2', suffer: { resolved: true, picked: [0], moveId: 'endure_stress', resolutionId: 'r9' } };
    expect(check('sufferPaid', {}, [setup, markOf('a1', tableOf(), [miss, another])]).detail, 'another move\'s card is not this miss\'s').toBe('strike missed at a1; no price has been paid');
    expect(check('sufferPaid', {}, [setup, markOf('a1', tableOf(), [miss, offered]), markOf('a2', tableOf(), [{ ...offered, suffer: { ...offered.suffer, resolved: true, picked: [0] } }])])).toMatchObject({ status: 'done' });
    // A miss momentum could improve is held: nothing is paid until it is kept.
    const held = moveCard('r1', 'Strike', 'Action: 1 + 2 = 3 | Challenge: 10, 9', 'miss', { held: { open: true } });
    expect(check('sufferPaid', {}, [setup, markOf('a1', tableOf(), [held])]).detail).toContain('its result is held');
    // Kept, its price names the suffer move and the table takes it: no card to answer.
    const kept = { ...held, move: { ...held.move, held: { open: false, resolvedBy: 'keep' } } };
    const harmed = { id: 'p1', price: { text: 'Pay the Price Strike d100 = 78 · You are harmed Routes to Endure Harm (-1).' } };
    expect(check('sufferPaid', {}, [setup, markOf('a1', tableOf(), [held]), markOf('a2', tableOf(), [kept, harmed])]))
      .toMatchObject({ status: 'done', detail: 'strike missed at a1; its price (78: "You are harmed") was endure_harm (-1), taken at a2' });
    const elsewhere = { id: 'p1', price: { text: 'Pay the Price Strike d100 = 36 · Something of value is lost or destroyed' } };
    expect(check('sufferPaid', {}, [setup, markOf('a1', tableOf(), [miss, elsewhere])]).detail).toContain('named no suffer move');
    const weak = moveCard('r2', 'Strike', 'Action: 1 + 2 = 3 | Challenge: 1, 5', 'weak_hit', { burn: { canBurn: true, originalOutcome: 'weak_hit', previewOutcome: 'strong_hit' } });
    expect(check('burned', { moves: ['strike'] }, [setup, markOf('a1', tableOf(), [weak])]).detail).toContain('momentum has not been burned');
    const burned = { ...weak, move: { ...weak.move, burn: { ...weak.move.burn, consumed: true } } };
    expect(check('burned', { moves: ['strike'] }, [setup, markOf('a1', tableOf(), [weak]), markOf('a2', tableOf(), [burned])])).toMatchObject({ status: 'done' });
  });

  it('a recovery beat is done by any recover move\'s hit, not the first roll\'s (the second live run: Heal missed, Resupply hit)', () => {
    const heal = moveCard('r1', 'Heal', 'Action: 4 + 1 = 5 | Challenge: 10, 6', 'miss');
    const resupply = moveCard('r2', 'Resupply', 'Action: 6 + 2 = 8 | Challenge: 5, 5', 'strong_hit');
    const choice = { id: 's1', suffer: { resolved: false, picked: [], moveId: 'resupply' } };
    const taken = { ...choice, suffer: { ...choice.suffer, resolved: true, picked: [1] } };
    expect(check('recovered', {}, [setup, markOf('a1', tableOf(), [heal])]).detail).toBe('heal missed');
    expect(check('recovered', {}, [setup, markOf('a1', tableOf(), [heal]), markOf('a2', tableOf(), [heal, resupply, choice])]).detail)
      .toBe('resupply came up strong_hit; its choice is not made');
    expect(check('recovered', {}, [setup, markOf('a1', tableOf(), [heal]), markOf('a2', tableOf(), [heal, resupply, choice]), markOf('a3', tableOf(), [heal, resupply, taken])]))
      .toMatchObject({ status: 'done', detail: 'resupply came up strong_hit at a2' });
  });

  it('the cast\'s connection is one card, followed by its id: renamed since it was made, its bond is still found', () => {
    const made = markOf('a1', tableOf({ connections: [{ ...conn, name: 'Tamsin Vey', ticks: 0 }] }));
    const renamed = (extra) => tableOf({ connections: [{ ...conn, name: 'Tamsin Okoro', ...extra }] });
    expect(check('bondForged', {}, [setup, made, markOf('a2', renamed({ ticks: 32, bonded: false }))]).detail).toBe('the relationship with Tamsin Okoro stands at 32 of 40 ticks');
    expect(check('bondForged', {}, [setup, made, markOf('a2', renamed({ ticks: 40, bonded: true }))])).toMatchObject({ status: 'done', detail: expect.stringContaining('a bond is forged with Tamsin Okoro') });
    // A card that only shares the old name is not the cast's.
    const other = tableOf({ connections: [{ ...conn, hostId: 'A9', recordId: 'c9', name: 'Tamsin Okoro', ticks: 40, bonded: true }] });
    expect(check('bondForged', {}, [setup, made, markOf('a2', other)]).detail).toBe('no such connection');
  });

  it('a bonded roll that marks progress fails; a vow fulfilled for a bonded connection leaves its track alone and offers one roll', () => {
    const bonded = { ...conn, name: 'Tamsin Vey', bonded: true, ticks: 40 };
    const develop = moveCard('r1', 'Develop Your Relationship', 'Action: 4 + 2 = 6 | Challenge: 3, 9', 'weak_hit');
    const before = markOf('a1', tableOf({ connections: [bonded] }));
    expect(check('bondedDevelop', {}, [setup, before, markOf('a2', tableOf({ connections: [bonded] }), [develop])])).toMatchObject({ status: 'done' });
    expect(check('bondedDevelop', {}, [setup, markOf('a1', tableOf({ connections: [{ ...bonded, ticks: 32 }] })), markOf('a2', tableOf({ connections: [bonded] }), [develop])]))
      .toMatchObject({ status: 'failed', detail: 'the bonded roll marked progress: 32 → 40 ticks' });

    const sworn = { ...vow, linkedConnectionId: 'A1', linkedConnectionName: 'Tamsin Vey', ticks: 24 };
    const fulfil = moveCard('r2', 'Fulfill Your Vow', 'Progress: 6 | Challenge: 1, 2', 'strong_hit');
    const offer = { id: 'p1', picker: { pickAction: 'develop', resolved: false, choices: [{ hostId: 'A1', name: 'Tamsin Vey' }] } };
    const start = markOf('a1', tableOf({ connections: [{ ...bonded, ticks: 20 }], pc: { vows: [sworn] } }));
    const done = (ticks, cards) => markOf('a2', tableOf({ connections: [{ ...bonded, ticks }], pc: { vows: [{ ...sworn, completed: true }] } }), cards);
    expect(check('vowFulfilled', {}, [setup, start, done(20, [fulfil, offer])])).toMatchObject({ status: 'done', detail: expect.stringContaining('one bonded roll is offered') });
    expect(check('vowFulfilled', {}, [setup, start, done(28, [fulfil, offer])])).toMatchObject({ status: 'failed', detail: expect.stringContaining('20 → 28') });
    expect(check('vowFulfilled', {}, [setup, start, done(20, [fulfil])])).toMatchObject({ status: 'failed', detail: expect.stringContaining('0 bonded roll(s) offered') });
  });

  it('a correction: the old value struck, the new one standing', () => {
    const charter = { facts: [CUTTER] };
    const truths = (...list) => tableOf({ scene: { truths: list.map(([fact, retracted], i) => ({ id: `t${i}`, subject: 'raider cutter', fact, retracted })) } });
    expect(check('corrected', { fact: 'F6' }, [setup, markOf('a1', truths(['is named the Ashen Wake', true], ['is named the Cinder Wren', false]))], { charter })).toMatchObject({ status: 'done' });
    expect(check('corrected', { fact: 'F6' }, [setup, markOf('a1', truths(['is named the Ashen Wake', false], ['is named the Cinder Wren', false]))], { charter }).detail).toContain('the old one still stands');
    expect(check('corrected', { fact: 'F6' }, [setup, markOf('a1', truths(['is named the Ashen Wake', true]))], { charter }).detail).toContain('the old one is struck');
    // The first live run: the naming truth struck, the new one set — and two
    // truths the narrator had filed under the old name as their subject.
    const filed = tableOf({ scene: { truths: [
      { id: 't0', subject: 'raider cutter', fact: 'is named the Ashen Wake', retracted: true },
      { id: 't1', subject: 'raider cutter', fact: 'is named the Cinder Wren', retracted: false },
      { id: 't2', subject: 'Ashen Wake', fact: 'raider cutter that has jumped the Kobayashi IV off Bleakhold Station', retracted: false },
    ] } });
    const corrected = check('corrected', { fact: 'F6' }, [setup, markOf('a1', filed)], { charter });
    expect(corrected).toMatchObject({ status: 'done' });
    expect(corrected.detail).toContain('1 other truth(s) are still filed under the old name ("Ashen Wake — raider cutter');
  });

  it('the interruptions: a reload that moved a fight, an X-Card that left a fact standing, a rename that left two people', () => {
    const fight = { id: 't1', label: 'Ashen Wake', type: 'combat', rank: 'dangerous', ticks: 16, completed: false, combatState: 'in_control' };
    const during = markOf('a1', tableOf({ tracks: [fight] }));
    const interruption = (type, c, marks) => {
      const pointer = createPointer([{ id: 'b', n: 1, session: 2, title: type, interruption: 'x', check: { type, ...c } }]);
      pointer.advance({ marks: marks.slice(0, 1), messages: [], actions: [], charter: {} }, marks[0].step);
      pointer.interrupted();
      pointer.advance({ marks, messages: [], actions: [], charter: {} }, marks.at(-1).step);
      return pointer.state[0];
    };
    expect(interruption('survivedReload', {}, [during, markOf('x12', tableOf({ tracks: [fight] }))])).toMatchObject({ status: 'done' });
    expect(interruption('survivedReload', {}, [during, markOf('x12', tableOf({ tracks: [{ ...fight, ticks: 24 }] }))])).toMatchObject({ status: 'failed', detail: expect.stringContaining('the fight\'s track changed') });
    expect(interruption('survivedReload', {}, [during, markOf('x12', tableOf({ tracks: [fight], session: { active: true, id: 's1', pendingMove: true } }))]).detail).toContain('the move lock is held');

    const carded = { id: 'n1', xCarded: true, narration: { narrationId: 'N1' } };
    const xcard = { id: 'x1', xcard: true };
    const truth = (retracted) => ({ id: 't1', subject: 'wreck', fact: 'The wreck is venting.', retracted, narrationId: 'N1' });
    const start = markOf('a1', tableOf({ scene: { truths: [truth(false)] } }));
    expect(interruption('xCarded', {}, [start, markOf('x15', tableOf({ scene: { truths: [truth(true)] } }), [carded, xcard])])).toMatchObject({ status: 'done' });
    expect(interruption('xCarded', {}, [start, markOf('x15', tableOf({ scene: { truths: [truth(false)] } }), [carded, xcard])])).toMatchObject({ status: 'failed', detail: expect.stringContaining('1 standing truth') });
    // The first live run: the truth stood in the step the narration was
    // made, inside the beat, and the card then retracted it. Done.
    const narrated = markOf('a35', tableOf({ scene: { truths: [truth(false)] } }), [{ id: 'n1', xCarded: false, narration: { narrationId: 'N1' } }]);
    expect(interruption('xCarded', {}, [start, narrated, markOf('x15', tableOf({ scene: { truths: [truth(true)] } }), [carded, xcard])])).toMatchObject({ status: 'done' });

    const renamedTo = { hostId: 'A1', recordId: 'r1', name: 'Tamsin Okoro', rank: 'dangerous', bonded: false, active: true, ticks: 0 };
    const linkedVow = (name) => ({ id: 'v1', name: 'Find the raiders', rank: 'dangerous', ticks: 0, completed: false, linkedConnectionId: 'A1', linkedConnectionName: name });
    const after = (name, cards = [{ id: 'A1', name: 'Tamsin Okoro' }]) => markOf('x18', tableOf({ connections: [renamedTo], entityCards: cards, pc: { vows: [linkedVow(name)] } }));
    expect(interruption('renamed', { from: 'Tamsin Vey', to: 'Tamsin Okoro' }, [during, after('Tamsin Okoro')])).toMatchObject({ status: 'done' });
    expect(interruption('renamed', { from: 'Tamsin Vey', to: 'Tamsin Okoro' }, [during, after('Tamsin Vey')])).toMatchObject({ status: 'failed', detail: expect.stringContaining('still shows its link as "Tamsin Vey"') });
    expect(interruption('renamed', { from: 'Tamsin Vey', to: 'Tamsin Okoro' }, [during, after('Tamsin Okoro', [{ id: 'A1', name: 'Tamsin Okoro' }, { id: 'A2', name: 'Tamsin Vey' }])]).detail).toContain('two people');
  });

  it('every check type the charter uses is one the observer knows', () => {
    for (const beat of CHARTER.beats) expect(BEAT_CHECKS[beat.check.type], `beat ${beat.n}: ${beat.check.type}`).toBeTypeOf('function');
  });
});

describe('a long run\'s class', () => {
  const healthy = { failures: [], waitingOnGm: [] };
  const beats = (statuses) => statuses.map((status, i) => ({ id: `b${i + 1}`, n: i + 1, title: `Beat ${i + 1}`, status, detail: '' }));
  const mechanics = { checks: 40, violations: [] };
  const ledger = { totals: { refused: 0, lost: 0 } };
  const all = (n, status) => Array.from({ length: n }, () => status);

  it('a deterministic failure outranks an opinion: infrastructure, health, a violated check, a beat brought about wrongly', () => {
    const base = { health: healthy, beats: beats(all(8, 'done')), mechanics, ledger };
    expect(classifyLongRun({ ...base, infrastructure: 'the page closed' }).classification).toBe('infrastructure-error');
    expect(classifyLongRun({ ...base, health: { failures: ['the move lock was still held'], waitingOnGm: [] } }).classification).toBe('product-failure');
    expect(classifyLongRun({ ...base, mechanics: { checks: 40, violations: [{ step: 'a9', check: 'burn', detail: 'momentum is 7 after the burn' }] } }))
      .toEqual({ classification: 'product-failure', because: '1 mechanical check(s) violated — the first, at a9: burn: momentum is 7 after the burn' });
    expect(classifyLongRun({ ...base, beats: [...beats(all(7, 'done')), { id: 'b8', n: 8, title: 'Fulfil', status: 'failed', detail: 'the fulfilment marked the track' }] }).classification).toBe('product-failure');
  });

  it('more than a quarter of the beats never exercised: the run is not counted — and a cap that caused it is named', () => {
    const base = { health: healthy, mechanics, ledger };
    const thin = beats([...all(5, 'done'), ...all(3, 'not-exercised')]);
    expect(classifyLongRun({ ...base, beats: thin })).toMatchObject({ classification: 'not-exercised', because: expect.stringContaining('3 of 8 beats were not exercised') });
    expect(classifyLongRun({ ...base, beats: thin, budgetStop: { cap: 'actions', detail: '100 player actions' } }).classification).toBe('budget-exhausted');
    expect(classifyLongRun({ ...base, beats: beats([...all(6, 'done'), ...all(2, 'not-exercised')]) }).classification, 'a quarter exactly is still counted').toBe('pass');
  });

  it('a fact lost or refused is suspected; else the run\'s own verdict is pass — one line of its review', () => {
    const base = { health: healthy, beats: beats(all(8, 'done')), mechanics };
    expect(classifyLongRun({ ...base, ledger: { totals: { refused: 1, lost: 0 } } }).classification).toBe('suspected-quality-issue');
    expect(classifyLongRun({ ...base, ledger })).toEqual({ classification: 'pass', because: '8 of 8 beats done; no check violated, no fact lost or refused' });
  });
});

// ── the GM's scripted dice ───────────────────────────────────────────────────

describe('the scripted rolls', () => {
  it('each gives the roll it promises, whatever the stat — by the game\'s own arithmetic', () => {
    for (const [roll, outcome] of [['miss', 'miss'], ['weak_hit', 'weak_hit'], ['strong_hit', 'strong_hit']]) {
      const { faces, queue } = scriptedDice({ roll });
      expect(queue.map((u, i) => faceOf(u, i < 2 ? 10 : 6)), 'the queue rolls those faces').toEqual(faces);
      for (let stat = 0; stat <= 4; stat++) for (let adds = 0; adds <= 2; adds++) {
        const score = rolledScore({ actionDie: faces[2], stat, adds });
        expect(outcomeOf(score, faces.slice(0, 2)), `${roll} at +${stat}+${adds}`).toBe(outcome);
      }
    }
    expect(scriptedDice({ roll: 'strong_hit', kind: 'progress' }).faces).toEqual([1, 2]);
    expect(outcomeOf(3, [1, 2]), 'three boxes beat both').toBe('strong_hit');
    expect(scriptedDice({ roll: 'burnable' }), 'decided in the page, from momentum and stat').toBeNull();
  });

  it('a burnable weak hit: a weak hit as rolled, a strong hit once momentum is burned — or no script at all', () => {
    for (let momentum = 3; momentum <= 10; momentum++) for (let stat = 1; stat <= 3; stat++) {
      const dice = burnableDice(momentum, stat);
      if (momentum < stat + 2) { expect(dice, `momentum ${momentum}, stat ${stat}`).toBeNull(); continue; }
      const challenge = dice.faces.slice(0, 2);
      expect(outcomeOf(rolledScore({ actionDie: dice.faces[2], stat }), challenge), `as rolled: momentum ${momentum}, stat ${stat}`).toBe('weak_hit');
      expect(burnedOutcome(momentum, challenge), `burned: momentum ${momentum}, stat ${stat}`).toBe('strong_hit');
      expect(challenge[0]).not.toBe(challenge[1]);
    }
  });

  it('a die face is the uniform value that rolls it, and back', () => {
    for (let face = 1; face <= 10; face++) expect(faceOf(uniformFor(face, 10), 10)).toBe(face);
    for (let face = 1; face <= 6; face++) expect(faceOf(uniformFor(face, 6), 6)).toBe(face);
  });

  it('a move card\'s dice line is read as the table was shown it', () => {
    expect(parseDiceLine('Action: 4 + 3 + 1 = 8 | Challenge: 2, 9')).toEqual({ kind: 'action', actionDie: 4, cancelled: false, stat: 3, adds: 1, score: 8, challenge: [2, 9], match: false });
    expect(parseDiceLine('Action: 4 (cancelled by momentum -4) + 2 = 2 | Challenge: 7, 7 ✦ Match')).toMatchObject({ cancelled: true, score: 2, match: true });
    expect(parseDiceLine('Progress: 6 | Challenge: 1, 2')).toEqual({ kind: 'progress', score: 6, challenge: [1, 2], match: false });
    expect(parseDiceLine('no action roll — progress is marked')).toBeNull();
  });
});

// ── the player ───────────────────────────────────────────────────────────────

const SCREEN = {
  character: { name: 'Mira Kestrel', health: 5, spirit: 5, supply: 5, momentum: 3 },
  windows: [{ title: 'End a Session', text: '', fields: [{ name: 'questFocus', type: 'text', label: 'Quest', value: '' }], buttons: ['End Session'] }],
  messages: [
    { ref: 'm1', id: 'idA', speaker: 'Gamemaster', text: 'New vow recorded', buttons: [{ n: 1, label: 'Link', disabled: false }],
      selects: [{ n: 1, label: 'For a connection?', value: '— none —', options: ['— none —', 'Tamsin Vey'] }] },
    { ref: 'm2', id: 'idB', speaker: 'Gamemaster', text: 'A fight looms', buttons: [{ n: 1, label: '⚔ Enter the Fray', disabled: false }],
      selects: [{ n: 1, label: '', value: 'dangerous', options: ['troublesome', 'dangerous'] }, { n: 2, label: '', value: '(not tied to a vow)', options: ['(not tied to a vow)', 'Find the raiders'] }] },
  ],
};

describe('the player\'s two new actions', () => {
  it('a typed line that names a truth by its id is kept for a replay by what the id stood before — ids differ in every world', () => {
    const list = (ids) => ({
      ...SCREEN,
      messages: [{ ref: 'm1', id: 'idL', speaker: 'Mira Kestrel', buttons: [], selects: [],
        text: `◈ Fact Continuity Truths in this scene — strike one with !truth strike <id> : ${ids[0]} Tamsin Vey — is closing her ledger stall tonight ${ids[1]} raider cutter — is named the Ashen Wake ${ids[2]} Ashen Wake — raider cutter that has jumped the Kobayashi IV` }],
    });
    const struck = { action: 'say', text: '!truth strike tr-ca277', reason: 'strike old entry' };
    const kept = scriptedForm(struck, list(['tr-a7f8f', 'tr-ca277', 'tr-dd719']));
    expect(kept).toEqual({ action: 'say', text: '!truth strike {truth}', reason: 'strike old entry', truth: 'raider cutter — is named the Ashen Wake' });
    // In another world the same truth has another id, and the line finds it.
    expect(resolveScripted(kept, list(['tr-11111', 'tr-22222', 'tr-33333'])))
      .toEqual({ ok: true, action: { action: 'say', text: '!truth strike tr-22222', reason: 'strike old entry' } });
    expect(resolveScripted(kept, SCREEN)).toEqual({ ok: false, problem: 'no truth on screen reads "raider cutter — is named the Ashen Wake"' });
    // A line with no id, or an id the screen does not show, is kept as typed.
    expect(scriptedForm({ action: 'say', text: 'I look over the wreck.' }, SCREEN)).toEqual({ action: 'say', text: 'I look over the wreck.' });
    expect(sayWithoutIds(struck, 'nothing listed')).toEqual(struck);
    expect(truthIdFor('raider cutter — is named the Ashen Wake', 'tr-0aa11 raider cutter — is named the Ashen Wake tr-0bb22 other')).toBe('tr-0aa11');
  });

  it('a kept run\'s press of a button the module has since renamed finds it by its new name (LABEL_RENAMES)', () => {
    const now = { ...SCREEN, messages: [{ ...SCREEN.messages[1], buttons: [{ n: 1, label: '⚔ Begin the fight', disabled: false }, { n: 2, label: '🚪 Find another way', disabled: false }] }] };
    // The first live long haul pressed "⚔ Enter the Fray" on the fight's card.
    expect(LABEL_RENAMES['⚔ Enter the Fray']).toBe('⚔ Begin the fight');
    expect(resolveScripted({ action: 'click', label: '⚔ Enter the Fray', fromNewest: 0, reason: 'begin it' }, now))
      .toEqual({ ok: true, action: { action: 'click', messageId: 'idB', message: 'm2', button: 1, label: '⚔ Begin the fight', reason: 'begin it' } });
    // A screen that still offers the recorded label is pressed as recorded.
    expect(resolveScripted({ action: 'click', label: '⚔ Enter the Fray', fromNewest: 0 }, SCREEN).action.label).toBe('⚔ Enter the Fray');
    expect(resolveScripted({ action: 'click', label: 'Nothing like it', fromNewest: 0 }, now)).toEqual({ ok: false, problem: 'no message on screen offers "Nothing like it"' });
  });

  it('a card further up the chat that can still be answered is on its screen, under its own heading, and is clicked by its own reference', () => {
    const screen = {
      ...SCREEN,
      messages: [
        { ref: 'e1', id: 'idOld', earlier: true, speaker: 'Gamemaster', text: 'New vow recorded', buttons: [{ n: 1, label: 'Link', disabled: false }],
          selects: [{ n: 1, label: '', value: '— none —', options: ['— none —', 'Tamsin Vey'] }] },
        { ref: 'm1', id: 'idNew', speaker: 'Gamemaster', text: 'The docks are quiet.', buttons: [], selects: [] },
      ],
    };
    const text = describeScreen(screen);
    const up = text.indexOf('FURTHER UP THE CHAT, STILL OPEN');
    const chat = text.indexOf('CHAT (oldest first');
    expect(up).toBeGreaterThan(-1);
    expect(text.indexOf('[e1] Gamemaster: New vow recorded')).toBeGreaterThan(up);
    expect(text.indexOf('[e1] Gamemaster: New vow recorded'), 'above the chat\'s last lines').toBeLessThan(chat);
    expect(text.indexOf('[m1] Gamemaster: The docks are quiet.')).toBeGreaterThan(chat);
    expect(validateAction({ action: 'choose', message: 'e1', button: 1, option: 'Tamsin Vey' }, screen))
      .toMatchObject({ ok: true, action: { messageId: 'idOld', message: 'e1', select: 1 } });
    expect(validateAction({ action: 'click', message: 'e1', button: 1 }, screen)).toMatchObject({ ok: true, action: { messageId: 'idOld', label: 'Link' } });
    // The rehearsal's stand-in reads the same screen back.
    expect(readScreenText(`YOUR SCREEN NOW:\n${text}`).messages.map(m => m.ref)).toEqual(['e1', 'm1']);
    expect(describeScreen(SCREEN), 'nothing further up: no heading').not.toContain('FURTHER UP THE CHAT');
  });

  it('a dropdown on a card is on its screen, and an option in it can be chosen', () => {
    expect(describeScreen(SCREEN)).toContain('dropdown (1) "For a connection?" = "— none —" options: — none — | Tamsin Vey');
    expect(validateAction({ action: 'choose', message: 'm1', button: 1, option: 'Tamsin Vey' }, SCREEN))
      .toEqual({ ok: true, action: { action: 'choose', messageId: 'idA', message: 'm1', select: 1, option: 'Tamsin Vey', reason: '' } });
    expect(validateAction({ action: 'choose', message: 'm1', button: 1, option: 'Vance Oduya' }, SCREEN)).toMatchObject({ ok: false, problem: expect.stringContaining('has no option "Vance Oduya"') });
    expect(validateAction({ action: 'choose', message: 'm1', button: 3, option: 'Tamsin Vey' }, SCREEN)).toMatchObject({ ok: false, problem: 'message m1 has no dropdown 3' });
  });

  it('a window can be closed without answering it', () => {
    expect(validateAction({ action: 'close', window: 1, reason: 'not now' }, SCREEN)).toEqual({ ok: true, action: { action: 'close', title: 'End a Session', reason: 'not now' } });
    expect(validateAction({ action: 'close', window: 2 }, SCREEN)).toMatchObject({ ok: false, problem: 'no open window 2' });
  });

  it('both are kept for a replay without a document id, and found again in another world', () => {
    const chosen = validateAction({ action: 'choose', message: 'm2', button: 2, option: 'Find the raiders' }, SCREEN).action;
    const kept = scriptedForm(chosen, SCREEN);
    expect(kept).toEqual({ action: 'choose', select: 2, option: 'Find the raiders', fromNewest: 0, reason: '' });
    const elsewhere = { ...SCREEN, messages: SCREEN.messages.map(m => ({ ...m, id: `${m.id}-other` })) };
    expect(resolveScripted(kept, elsewhere)).toMatchObject({ ok: true, action: { messageId: 'idB-other', select: 2, option: 'Find the raiders' } });
    expect(resolveScripted(kept, { ...SCREEN, messages: [] })).toMatchObject({ ok: false, problem: expect.stringContaining('no message on screen has a dropdown') });
    expect(resolveScripted({ action: 'close', title: 'End a Session' }, SCREEN)).toMatchObject({ ok: true, action: { action: 'close', title: 'End a Session' } });
    expect(resolveScripted({ action: 'close', title: 'End a Session' }, { ...SCREEN, windows: [] }).ok).toBe(false);
    expect(summariseAction(chosen)).toBe('choose "Find the raiders" in dropdown 2 on m2');
    expect(summariseAction({ action: 'close', title: 'End a Session' })).toBe('close the window "End a Session"');
  });

  it('the tool stays strict with them: every property required, nothing extra', () => {
    expect(ACTION_TOOL.input_schema.properties.action.enum).toEqual(['say', 'click', 'choose', 'dialog', 'close', 'wait', 'stop']);
    expect([...ACTION_TOOL.input_schema.required].sort()).toEqual(Object.keys(ACTION_TOOL.input_schema.properties).sort());
  });
});

describe('the player\'s bounded memory', () => {
  const history = (n) => Array.from({ length: n }, (_, i) => ({ action: { action: 'say', text: `Line number ${i + 1} of the session.` }, outcome: { ok: true } }));
  const beat = { n: 9, of: 26, session: 2, title: 'Enter a fight', tell: 'Enter the fray.', actions: 2, note: 'the observer sees: no fight has begun' };

  it(`shows its last ${HISTORY_ACTIONS} actions, numbered as they were, and nothing older`, () => {
    const prompt = playerTurnPrompt({ history: history(60), snapshot: SCREEN, notebook: ['The broker is Tamsin Vey.'], beat });
    expect(prompt).toContain('46. say: Line number 46 of the session.');
    expect(prompt).toContain('60. say: Line number 60 of the session.');
    expect(prompt).not.toContain('Line number 45 ');
    expect(prompt).toContain('CURRENT BEAT: 9 of 26 [session 2] — Enter a fight\nEnter the fray.\n(2 actions spent on this beat so far; the observer sees: no fight has begun.)');
    expect(prompt).toContain('YOUR NOTEBOOK:\n- The broker is Tamsin Vey.');
  });

  it('the prompt does not grow with the run: ninety actions in, it is the size it was at fifteen', () => {
    const at = (n) => playerTurnPrompt({ history: history(n), snapshot: SCREEN, notebook: [], beat }).length;
    expect(Math.abs(at(90) - at(15))).toBeLessThan(60);         // the action numbers' digits, the "(of 90 so far)"
    expect(at(15)).toBeGreaterThan(at(3));
  });

  it('the notebook keeps its newest lines; a note rides on any action and is cut to length', () => {
    let notebook = [];
    for (let i = 1; i <= NOTEBOOK_LINES + 5; i++) notebook = keepNote(notebook, { action: 'wait', note: `note ${i}` });
    expect(notebook).toHaveLength(NOTEBOOK_LINES);
    expect(notebook[0]).toBe('note 6');
    expect(keepNote(notebook, { action: 'wait' })).toBe(notebook);
    const noted = validateAction({ action: 'wait', seconds: 2, note: `  The   cutter is the Ashen Wake. ${'x'.repeat(400)}` }, SCREEN).action;
    expect(noted.note.startsWith('The cutter is the Ashen Wake. x')).toBe(true);
    expect(noted.note.length).toBe(220);
  });

  it('its standing instructions are the same every turn, list every beat, and are sent as a cached block', () => {
    const system = playerSystemPrompt(CHARTER);
    expect(playerSystemPrompt(CHARTER)).toBe(system);
    // The title the player is shown names no move (decisions.md → "A player is never made to name a move").
    for (const b of CHARTER.beats) expect(system).toContain(`${b.n}. [session ${b.session}] ${b.playerTitle ?? b.title}`);
    expect(system).toContain('You do not decide when a beat is done');
    expect(system.length, 'long enough to be cached at all').toBeGreaterThan(6000);
    const body = buildRequest({ model: CONFIG.player.model, effort: 'low', maxTokens: 1000, system, user: 'U', tool: ACTION_TOOL, cache: true });
    expect(body.system).toEqual([{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]);
    expect(buildRequest({ model: 'm', effort: 'low', maxTokens: 1, system: 'S', user: 'U' }).system, 'unasked, a plain string as before').toBe('S');
  });

  it('the player the long haul runs on is the maintainer\'s choice, and its caps are the issue\'s', () => {
    expect(CONFIG.player).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'low' });
    expect(CHARTER.caps).toEqual({ actions: 100, calls: 400, minutes: 60, usd: 15 });
  });
});

// ── the rehearsal that rolls ─────────────────────────────────────────────────

describe('a rehearsal that rolls', () => {
  const turn = (screen, beat) => ({ system: 'You are playtesting', tools: [{ name: 'take_action' }], messages: [{ role: 'user', content: `CURRENT BEAT: ${beat} of 26 [session 1] — x\n\nYOUR SCREEN NOW:\n${screen}` }] });
  const module = (system, user = '') => ({ system, messages: [{ role: 'user', content: user }] });
  const textOf = (r) => r.content[0].text;
  const mini = {
    ...CHARTER,
    rehearsal: [
      { beat: 1, action: 'say', text: '!begin-session' },
      { beat: 1, action: 'click', label: 'Swear it', move: { id: 'swear_an_iron_vow' } },
      { beat: 2, action: 'say', text: 'I work the docks.', move: { id: 'gather_information', stat: 'wits' } },
      { beat: 3, action: 'choose', option: 'Tamsin Vey' },
      { beat: 3, action: 'click', label: 'Endure Harm', optional: true },
      { beat: 5, action: 'say', text: 'I turn my sister Ilse\'s brass star-compass over in my palm.', plants: ['F1'] },
      { beat: 7, action: 'say', text: 'What do I still carry that belonged to my sister?', probe: 'F1' },
      { action: 'stop', reason: 'done' },
    ],
  };

  it('reads the buttons, dropdowns, windows and beat off the screen the player is shown', () => {
    const text = `CURRENT BEAT: 3 of 26 [session 1] — Link\n\nYOUR SCREEN NOW:\n${describeScreen(SCREEN)}`;
    expect(readScreenText(text)).toMatchObject({
      beat: 3, windows: [{ n: 1, title: 'End a Session' }],
      messages: [{ ref: 'm1', buttons: [{ n: 1, label: 'Link' }], selects: [{ n: 1, options: ['— none —', 'Tamsin Vey'] }] }, { ref: 'm2', selects: [{ n: 1 }, { n: 2, options: ['(not tied to a vow)', 'Find the raiders'] }] }],
    });
  });

  it('its scripted player presses a button by its label, waits for one that is not there yet, and skips what the table never offered', () => {
    const r = createRehearsal({ charter: mini });
    const input = (screen, beat = 1) => r.reply(turn(screen, beat)).content[0].input;
    expect(input('CHAT: empty')).toMatchObject({ action: 'say', text: '!begin-session' });
    expect(input('CHAT: empty'), 'the vow card is not up yet').toMatchObject({ action: 'wait', reason: 'waiting for "Swear it"' });
    expect(input('[m4] Gamemaster: New vow recorded\n     buttons: (1) "⚔ Swear it (roll)"')).toMatchObject({ action: 'click', message: 'm4', button: 1 });
    expect(input('CHAT: empty', 2)).toMatchObject({ action: 'say', text: 'I work the docks.' });
    expect(input(describeScreen(SCREEN), 3)).toMatchObject({ action: 'choose', message: 'm1', button: 1, option: 'Tamsin Vey' });
    // The optional click is never offered: one wait, then it is given up —
    // and the next line, beat 5's, waits until beat 5 comes: said while beat 3
    // is current it would be beat 3's line (the fourth live run, issue #383).
    expect(input('CHAT: empty', 3)).toMatchObject({ action: 'wait' });
    expect(input('CHAT: empty', 3)).toMatchObject({ action: 'wait', reason: 'waiting for beat 5: beat 3 is not over' });
    expect(input('CHAT: empty', 5)).toMatchObject({ action: 'say', text: expect.stringContaining('star-compass') });
    expect(r.skipped).toMatchObject([{ why: '"Endure Harm" was never on screen' }]);
  });

  it('an entry whose beat is over is skipped: the pointer has moved on', () => {
    const r = createRehearsal({ charter: mini });
    expect(r.reply(turn('CHAT: empty', 5)).content[0].input.text).toContain('star-compass');
    expect(r.skipped.map(s => s.why)).toEqual(['beat 1 was over', 'beat 1 was over', 'beat 2 was over', 'beat 3 was over', 'beat 3 was over']);
  });

  it('its classifier calls a move where the script makes the line one, and its interpreter names it', () => {
    const r = createRehearsal({ charter: mini });
    r.reply(turn('CHAT: empty', 2));                                   // skips to "I work the docks."
    expect(JSON.parse(textOf(r.reply(module('You are the pacing pre-classifier …'))))).toMatchObject({ decision: 'MOVE', suggestedMove: 'gather_information', confidence: 0.95 });
    expect(JSON.parse(textOf(r.reply(module('You are the move interpreter …'))))).toMatchObject({ moveId: 'gather_information', moveName: 'Gather Information', statUsed: 'wits', isProgressMove: false });
    const plain = createRehearsal({ charter: mini });
    plain.reply(turn('CHAT: empty', 1));
    expect(JSON.parse(textOf(plain.reply(module('You are the pacing pre-classifier …')))).decision, 'a line the script does not make a move is narrated').toBe('NARRATIVE');
  });

  it('its narrator records what the player plants, answers a probe only when the fact is in front of it, and decides a plan it is asked to', () => {
    const narrator = '## NARRATOR ROLE AND VOICE\n## RESPONSE FORMAT — MANDATORY SIDECAR\n';
    const r = createRehearsal({ charter: mini });
    r.reply(turn('CHAT: empty', 5));
    const planted = textOf(r.reply(module(narrator, 'The player says it.')));
    expect(planted).toContain(CHARTER.facts[0].statement);
    expect(JSON.parse(/```json\n([\s\S]*?)\n```/.exec(planted)[1]).newTruths).toEqual([{ subject: 'Mira Kestrel', fact: CHARTER.facts[0].statement, from: 'line' }]);   // the player's own words: they bind (overhaul 2, D5)
    r.reply(turn('CHAT: empty', 7));
    expect(textOf(r.reply(module(`${narrator}## WORLD SNAPSHOT\nher brass star-compass`, 'What do I still carry that belonged to my sister?')))).toContain('It comes back to you at once');
    expect(textOf(r.reply(module(narrator, 'What do I still carry that belonged to my sister?'))), 'nothing carried it').toContain('nothing comes');
    const decided = textOf(r.reply(module(`${narrator}### DECIDE NOW\n- id plan-7: A threat — the buyer.\n`, '')));
    expect(JSON.parse(/```json\n([\s\S]*?)\n```/.exec(decided)[1]).plans).toMatchObject([{ id: 'plan-7', truth: CHARTER.rehearsalPlan.truth }]);

    const forgetful = createRehearsal({ charter: mini, forget: true });
    forgetful.reply(turn('CHAT: empty', 5));
    expect(textOf(forgetful.reply(module(narrator, 'x')))).not.toContain('star-compass');
  });

  it('the detector sees the cast when a narration names them, and nobody else', () => {
    const r = createRehearsal({ charter: mini });
    const seen = JSON.parse(textOf(r.reply(module('You are analysing an Ironsworn: Starforged narration.', 'Tamsin Vey looks up from her ledger. A dockhand passes.'))));
    expect(seen.entities).toMatchObject([{ type: 'connection', name: 'Tamsin Vey', pronouns: 'she/her' }]);
    expect(JSON.parse(textOf(r.reply(module('You are analysing an Ironsworn: Starforged narration.', 'A dockhand passes.')))).entities).toEqual([]);
  });
});

// ── what a review is written from ────────────────────────────────────────────

describe('what a run counts for its review', () => {
  it('each call kind\'s latency, and the time from a line to its reply', () => {
    expect([percentile([1, 2, 3, 4, 100], 50), percentile([1, 2, 3, 4, 100], 95), percentile([], 50)]).toEqual([3, 100, null]);
    const speed = speedOf({
      requests: [{ kind: 'narrate', ms: 4000 }, { kind: 'narrate', ms: 6000 }, { kind: 'classify', ms: 800 }],
      actions: [
        { step: 'a1', action: { action: 'say', text: 'A line.' }, saidAt: 1000, repliedAt: 9000 },
        { step: 'a2', action: { action: 'say', text: '!begin-session' }, saidAt: 1000, repliedAt: 2000 },
        { step: 'a3', action: { action: 'say', text: 'Another.' }, saidAt: 1000, repliedAt: null },
      ],
    });
    expect(speed.calls.narrate).toEqual({ n: 2, p50: 4000, p95: 6000, max: 6000 });
    expect(speed.lineToReply).toMatchObject({ n: 1, p50: 8000 });
    expect(speed.unanswered, 'a line that got no narration is named').toEqual(['a3']);
  });

  it('caching by call kind: what was read, written and sent uncached, what it saved — and a kind that writes and never reads', () => {
    const prices = { sonnet: { input: 2, output: 10, cacheRead: 0.1 }, haiku: { input: 0.1, output: 0.5 } };
    const caching = cachingOf([
      { kind: 'narrate', model: 'sonnet', usage: { input_tokens: 1000, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0, output_tokens: 500 } },
      { kind: 'interpret', model: 'haiku', usage: { input_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 5000, output_tokens: 100 } },
      { kind: 'detect', model: 'haiku', usage: { input_tokens: 3000, output_tokens: 100 } },
      { kind: 'failed', model: 'haiku', usage: null },
    ], prices);
    expect(caching.byKind.find(k => k.kind === 'narrate')).toMatchObject({ calls: 1, prompt: 10000, read: 9000, readShare: 0.9, savedUsd: 0.0171 });
    expect(caching.writesNeverRead).toEqual([{ kind: 'interpret', calls: 1, written: 5000 }]);
    expect(caching.uncachedKinds).toEqual([{ kind: 'detect', calls: 1, prompt: 3000 }]);
    expect(caching.total).toMatchObject({ calls: 3, read: 9000, written: 5000 });
  });

  it('the cost, split between the module under test and the test\'s own models', () => {
    const cost = costSplit({ byRole: { module: { usd: 1.5, calls: 200 }, player: { usd: 0.5, calls: 90 } } }, { actions: 90, lines: 40 });
    expect(cost).toMatchObject({ total: 2, module: { usd: 1.5, share: 0.75 }, player: { share: 0.25 }, test: { usd: 0.5, share: 0.25 }, perLine: 0.05 });
  });

  it('prompt length against the action number: a prompt that grows shows its slope; one that is bounded shows none', () => {
    const grows = Array.from({ length: 10 }, (_, i) => ({ step: `a${i + 1}`, kind: 'narrate', system: 'x'.repeat(1000 + 200 * i), user: '' }));
    const bounded = Array.from({ length: 10 }, (_, i) => ({ step: `a${i + 1}`, kind: 'the AI player', system: 'x'.repeat(5000), user: 'y'.repeat(i % 2 ? 900 : 910) }));
    const length = lengthOf([...grows, ...bounded, { step: '(after)', kind: 'narrate', system: 'x', user: '' }]);
    expect(length.narrate).toMatchObject({ calls: 10, first: 1000, last: 2800, charsPerAction: 200 });
    expect(Math.abs(length['the AI player'].charsPerAction)).toBeLessThan(2);
  });

  it('repetition is measured by content, not by wording: two openings that say the same in new words', () => {
    const first = 'The galley smells of burnt sugar. You say that Okonkwo is in the aft crawlspace, teaching the coolant pump some manners. Dree is in the laundry, recalibrating the gravity for her socks.';
    const second = 'Burnt sugar again in the galley this morning. Somewhere aft, Okonkwo argues with the coolant pump in the crawlspace. Dree has taken her socks to the laundry, where the gravity needs a word.';
    const overlap = contentOverlap(first, second);
    expect(overlap.sharedShare).toBeGreaterThan(0.5);
    expect(overlap.repeatedActs.map(a => a.who).sort()).toEqual(['Dree', 'Okonkwo']);
    expect(contentOverlap(first, 'Rain on the Bleakhold docks. A crane swings a pallet of ration tins over the water.').sharedShare).toBeLessThan(0.1);
    const scenes = repetitionOf([
      { step: 'a2', phase: 'session-1', narrator: true, vignette: 'galley_begin', text: first },
      { step: 'a9', phase: 'session-1', narrator: true, vignette: null, text: 'Not a scene of that kind.' },
      { step: 'a30', phase: 'session-2', narrator: true, vignette: 'galley_begin', text: second },
    ]);
    expect(scenes.galley_begin.pairs).toMatchObject([{ earlier: 'a2', later: 'a30' }]);
    expect(scenes.galley_begin.worst.repeatedActs).toHaveLength(2);
    // Somebody called by their role is somebody too (the live memory run of
    // 2026-11-23: the names-only measure reported no repeated act here).
    const opening = 'The galley smells of lentils. The navigator, you suspect, is in the cargo bay, teaching the loader drone to say good morning. The deck hums.';
    const reopening = 'You hold a mug of barley tea. The navigator, by the sound of it, is still teaching the loader drone to say good morning. Across the galley table lies the compass.';
    expect(rolesIn(reopening)).toEqual(expect.arrayContaining(['navigator', 'loader', 'galley']));
    const acts = contentOverlap(opening, reopening).repeatedActs;
    expect(acts.map(a => a.who)).toContain('the navigator');
    expect(acts.find(a => a.who === 'the navigator').doing).toEqual(expect.arrayContaining(['teaching', 'drone', 'morning']));
    expect(acts.map(a => a.who), 'the galley is in both, with nothing said of it twice').not.toContain('the galley');
    expect(acts, 'one sentence said twice is one act').toHaveLength(1);
  });

  it('counts the sentences that speak for the character, and what the GM was asked', () => {
    expect(spokenFor([{ step: 'a3', narrator: true, text: '"Ilse always said a compass points to what you owe it," you say to the empty galley. The needle swings.' }]))
      .toMatchObject([{ step: 'a3', sentence: expect.stringContaining('you say to the empty galley') }]);
    const friction = frictionOf({
      actions: [{ step: 'a1', action: { action: 'say', text: 'A line.' } }, { step: 'a2', action: { action: 'wait' } }, { step: 'a3', action: { action: 'click', label: 'Link' }, outcome: { ok: false, detail: 'the button is disabled now' } }],
      beats: [{ id: 'b1', status: 'done', actions: 3 }],
      autopilot: [{ did: 'accepted the proposed move' }, { did: 'accepted the proposed move' }],
      messages: [{ card: ['draftEntityCard'] }],
    });
    expect(friction).toMatchObject({ actions: 3, lines: 1, actionsPerLine: 3, waits: 1, gmAnswers: 2, gmAsked: { 'accepted the proposed move': 2 }, draftCards: 1, didNotLand: [{ step: 'a3' }] });
    // The first live run: the verb outside the quote, and somebody else's speech.
    const answered = spokenFor([{ step: 'a52', narrator: true, text: 'The visitor shifts. You answer the hatch. "Before the next cargo tide. I told Tamsin that." Silence stretches.' }]);
    expect(answered).toHaveLength(1);
    expect(answered[0].sentence).toContain('You answer the hatch. "Before the next cargo tide.');
    expect(spokenFor([{ step: 'a60', narrator: true, text: 'The visitor is listening. "Careful what you tell her," the voice says. "I know that compass."' }]), 'the voice speaks, not you').toEqual([]);
    expect(spokenFor([{ step: 'a51', narrator: true, text: '"Tamsin\'s," you say, and the plating gives back a short pause.' }])).toHaveLength(1);
  });

  it('counts what the narrator was told and wrote anyway — the first live run\'s own sentences (issue #377 items 2, 4)', () => {
    const slips = slipsOf([
      { step: 'a57', narrator: true, text: 'Open on the hatch, not you. The handle turns its quarter inch and stops.' },
      { step: 'a79', narrator: true, text: '*Open on Tamsin, not the hatch.* Her answer comes over the comm.' },
      { step: 'a15', narrator: true, vignette: 'galley_begin', text: 'You eat slowly, because Wits 3 is a lot of thinking to do on bland food. So you have invented a crew: the engineer is teaching the coolant pump to hum.' },
      { step: 'a20', narrator: true, text: 'Iron rings on iron. The open door waits.' },
      { step: 'a48', narrator: true, vignette: 'npc_end', text: 'The cook at the next stall burns the lentils again.' },
    ]);
    expect(slips.directives.map(s => s.step)).toEqual(['a57', 'a79']);
    expect(slips.statsAloud.map(s => s.sentence)).toEqual(['You eat slowly, because Wits 3 is a lot of thinking to do on bland food.']);
    expect(slips.crewInOpenings.map(s => s.sentence)).toEqual(['So you have invented a crew: the engineer is teaching the coolant pump to hum.']);
    // A closing's cook is no opening's crew; "iron rings on iron" is no stat.
    expect(slips.crewInOpenings.some(s => s.step === 'a48')).toBe(false);
    const card = scorecard({ charter: { name: 'long-haul' }, run: { id: 'r', mode: 'live' }, slips });
    expect(card).toContain('2 instruction(s) written as prose; 1 stat(s) read aloud; 1 opening sentence(s) naming a crew role');
    expect(card).toContain('## Told, and written anyway — each to be read');
  });
});

describe('the generated layers of the review', () => {
  const run = { id: 'long-haul-live-1', mode: 'live', startedAt: '2026-11-23T03:00:00Z', classification: 'pass', because: 'all done' };
  const beats = [{ id: 'b1', n: 1, title: 'Begin a Session', status: 'done', actions: 2, steps: ['a1', 'a2'], doneAt: 'a2', detail: 'session 1 is open' }];
  const mechanics = { checks: 3, byCheck: { 'roll-outcome': { made: 1, violated: 1 }, burn: { made: 0, violated: 0 } },
    violations: [{ step: 'a2', check: 'roll-outcome', detail: 'the card says a strong hit' }], rolls: [{ step: 'a2', moveId: 'swear_an_iron_vow', outcome: 'strong_hit', dice: 'Action: 6 + 2 = 8 | Challenge: 1, 2', scripted: false }] };

  it('a run\'s questions are kept one to a line and head its scorecard, each with a place for its answer', () => {
    expect(questionsOf(' 1. Does the recap place the character where F5 says?\n\n- Is the corrected name in any answer?\n  * What does a line cost to answer?  \n')).toEqual([
      'Does the recap place the character where F5 says?', 'Is the corrected name in any answer?', 'What does a line cost to answer?',
    ]);
    expect(questionsOf('')).toEqual([]);
    expect(questionsOf(undefined)).toEqual([]);
    const asked = scorecard({ charter: { name: 'long-haul' }, run: { id: 'r1', mode: 'live', classification: 'achieved', because: '', questions: ['Does the recap hold?'] } });
    expect(asked).toContain('## What this run was to answer\n\n1. Does the recap hold?\n\n_To write — the answer to each');
    expect(scorecard({ charter: { name: 'long-haul' }, run: { id: 'r1', mode: 'rehearsal' } }), 'a rehearsal is asked nothing').not.toContain('What this run was to answer');
  });

  it('the annotated transcript: every step with its beat, the player\'s reason, the calls, the roll, the GM\'s answer and the finding — and a place for the reader\'s notes', () => {
    const text = annotatedTranscript({
      charter: CHARTER, run, beats, mechanics,
      actions: [{ step: 'a2', action: { action: 'click', label: 'Swear it', reason: 'the beat asks for it', note: 'vow sworn' }, summary: 'click "Swear it" on m3', ms: 9000, usd: 0.012, phase: 'session-1' }],
      messages: [{ step: 'a2', phase: 'session-1', narrator: true, speaker: 'Narrator', text: 'The vow holds.' }],
      requests: [{ step: 'a2', kind: 'callNarratorAPI>narrateResolution', ms: 5200 }],
      autopilot: [{ step: 'a2', did: 'accepted the proposed move', note: 'swear_an_iron_vow' }],
      interruptions: [],
    });
    expect(text).toContain('### a2 · beat 1: Begin a Session');
    expect(text).toContain('- **Player:** click "Swear it" on m3 — _the beat asks for it_');
    expect(text).toContain('- **Notebook:** vow sworn');
    expect(text).toContain('- **Calls (1):** callNarratorAPI>narrateResolution (5.2 s)');
    expect(text).toContain('- **Roll:** swear_an_iron_vow → strong_hit — Action: 6 + 2 = 8 \\| Challenge: 1, 2');
    expect(text).toContain('- **GM\'s rules:** accepted the proposed move (swear_an_iron_vow)');
    expect(text).toContain('- **Beat 1 done:** session 1 is open');
    expect(text).toContain('- **CHECK VIOLATED — roll-outcome:** the card says a strong hit');
    expect(text).toContain('> **NARRATOR — Narrator**');
    expect(text).toContain('_To write — the reader\'s notes');
  });

  it('a run without beats has its goal where a long run has beats: the memory charter gets the same scorecard', () => {
    const goal = { status: 'not-achieved', failingLayer: 'retrieval', reason: 'the fact was stored and not in the question\'s prompt', milestones: { established: true, sessionEnded: true, askedLater: true, stored: true, inPrompt: false, inAnswer: false } };
    const text = scorecard({ charter: { name: 'memory' }, run: { id: 'r1', mode: 'live', classification: 'suspected-quality-issue', because: 'x', questions: [] }, goal });
    expect(text).toContain('| Goal | not-achieved — lost at retrieval: the fact was stored and not in the question\'s prompt |');
    expect(text).not.toContain('Goal and beats');
    expect(text).not.toContain('## Beats');
    expect(text).toContain('## The goal, layer by layer');
    expect(text).toContain('| inPrompt | no |');
    expect(text).toContain('## The reading');
  });

  it('the annotated transcript keeps the order things happened in: a step that posted nothing stands where it was taken', () => {
    const messages = [
      { step: 'a1', phase: 'session-1', fromPlayer: true, who: 'player', text: 'I look.' },
      { step: 'a3', phase: 'session-1', narrator: true, who: 'narrator', text: 'The dock is quiet.' },
    ];
    const actions = [
      { step: 'a1', action: { action: 'say', text: 'I look.' } },
      { step: 'a2', action: { action: 'wait', seconds: 5 } },
      { step: 'a3', action: { action: 'say', text: 'I wait.' } },
      { step: 'a4', action: { action: 'click', label: 'Link' } },
    ];
    const text = annotatedTranscript({ charter: { name: 'long-haul' }, run: { id: 'r', mode: 'live' }, actions, messages });
    const at = (step) => text.indexOf(`### ${step}`);
    expect([at('a1'), at('a2'), at('a3'), at('a4')].every(n => n >= 0)).toBe(true);
    expect(at('a1')).toBeLessThan(at('a2'));
    expect(at('a2'), 'the wait, between the lines it was taken between').toBeLessThan(at('a3'));
    expect(at('a3')).toBeLessThan(at('a4'));
  });

  it('the scorecard: one row per dimension with its basis and how far to trust it; what was never exercised; the reading left to write', () => {
    const text = scorecard({ charter: CHARTER, run, beats, mechanics, ledger: scoreLedger({ facts: [COMPASS], marks: [], messages: [], requests: [] }) });
    for (const dimension of ['Goal and beats', 'Mechanics', 'Continuity — the narrator', 'Continuity — the helpers', 'Agency', 'Friction', 'Narrator quality', 'Speed', 'Length', 'Caching', 'Cost']) {
      expect(text, dimension).toContain(`| ${dimension} |`);
    }
    expect(text).toContain('| Mechanics | 3 checks, 1 violated |');
    expect(text).toContain('Never exercised: burn.');
    expect(text).toContain('| F1 | a possession | never | not-planted |');
    expect(text).toContain('## The reading');
  });

  // The long haul's second review was written step by step against its own
  // eight questions, by the session that wrote the charter and the fixes: it
  // reported each fix holding and missed what one plain reading showed. The
  // cold read is written first, so its place is first (rules/ci-e2e.md).
  it('a live run\'s scorecard opens with the cold read, left to write — above its questions and its rows; a rehearsal has none', () => {
    const live = scorecard({ charter: CHARTER, run: { ...run, questions: ['Does the correction reach the recap?'] }, beats, mechanics });
    const at = (s) => live.indexOf(s);
    expect(at('## The cold read')).toBeGreaterThan(-1);
    expect(at('## The cold read')).toBeLessThan(at('## What this run was to answer'));
    expect(at('## The cold read')).toBeLessThan(at('| Dimension |'));
    expect(live).toContain('a reader who has seen neither the charter, this run\'s questions nor the fixes it was to verify');
    expect(live).toContain('what the charter itself made the player do');
    expect(scorecard({ charter: CHARTER, run: { ...run, mode: 'rehearsal' }, beats, mechanics })).not.toContain('The cold read');
    expect(scorecard({ charter: CHARTER, run: { ...run, mode: 'replay' }, beats, mechanics })).not.toContain('The cold read');
  });
});

// ── the charter that ships ───────────────────────────────────────────────────

describe('the long-haul charter', () => {
  it('has twenty-seven beats over three sessions — the issue\'s twenty-six and the expedition — its four interruptions and its seven scripted rolls', () => {
    expect(CHARTER.beats.map(b => b.n)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
    expect(CHARTER.beats.filter(b => b.session === 1).length + CHARTER.beats.filter(b => b.session === 2).length + CHARTER.beats.filter(b => b.session === 3).length).toBe(27);
    expect(CHARTER.beats.filter(b => b.interruption).map(b => `${b.n}:${b.interruption}`)).toEqual(['13:gmReload', '15:endSessionCancelled', '16:xCard', '19:rename']);
    expect(CHARTER.beats.filter(b => b.dice).map(b => `${b.n}:${b.dice.moves[0]}:${b.dice.roll}`))
      .toEqual(['2:make_a_connection:strong_hit', '8:finish_an_expedition:strong_hit', '11:strike:miss', '12:strike:burnable', '14:take_decisive_action:strong_hit', '23:forge_a_bond:strong_hit', '25:fulfill_your_vow:strong_hit']);
    for (const b of CHARTER.beats) for (const need of b.needs ?? []) expect(CHARTER.beats.some(x => x.id === need), `beat ${b.n} needs ${need}`).toBe(true);
  });

  // A beat's id is its name for good: the kept runs' beats, the facts'
  // `plantedBy` and the beats' `needs` are told by it. Its number is where it
  // stands now. The expedition was added eighth and took no other beat's id.
  it('a beat keeps its id when another is added before it: the issue\'s twenty-six are b1…b26 still, in order, and the expedition is b7a', () => {
    expect(CHARTER.beats.map(b => b.id)).toEqual([...Array.from({ length: 7 }, (_, i) => `b${i + 1}`), 'b7a', ...Array.from({ length: 19 }, (_, i) => `b${i + 8}`)]);
    expect(new Set(CHARTER.beats.map(b => b.id)).size).toBe(27);
    expect(CHARTER.beats.find(b => b.id === 'b7a')).toMatchObject({ n: 8, session: 2, check: { type: 'expedition', finished: true } });
    expect(CHARTER.beats.find(b => b.id === 'b8')).toMatchObject({ n: 9, check: { type: 'arrived', settlement: 'Bleakhold Station' } });
    expect(CHARTER.facts.filter(f => f.plantedBy).map(f => `${f.id}:${f.plantedBy}:${CHARTER.beats.find(b => b.id === f.plantedBy).check.type}`))
      .toEqual(['F5:b8:arrived', 'F6:b16:corrected', 'F7:b18:renamed']);
  });

  it('its facts are the issue\'s — a possession, a name, a handover, a promise, the ship, a correction, a rename — each with what refuses it', () => {
    expect(CHARTER.facts.map(f => f.id)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7']);
    for (const f of CHARTER.facts) {
      expect(f.refusals?.length, `${f.id} has a refusal`).toBeGreaterThan(0);
      expect(f.probes.length, `${f.id} is probed`).toBeGreaterThanOrEqual(2);
      expect(f.from === 'world' ? CHARTER.beats.some(b => b.id === f.plantedBy) : true, `${f.id} is planted by a beat that exists`).toBe(true);
    }
    expect(CHARTER.baits).toHaveLength(2);
  });

  it('no question names the fact it asks about, and every question is told apart from every other', () => {
    const asks = [...CHARTER.facts.flatMap(f => f.probes.map(p => ({ ...p, fact: f }))), ...CHARTER.baits.map(b => ({ ...b, fact: null }))];
    for (const p of asks) {
      if (p.fact && !p.fact.anchor) for (const v of p.fact.variants) expect(p.ask.toLowerCase(), `${p.id} names "${v}"`).not.toContain(v.toLowerCase());
      for (const other of asks) if (other !== p) expect(isProbeLine(other.ask, p), `"${other.ask}" would be taken for ${p.id}`).toBe(false);
    }
  });

  it('every question of a set is in the beat that asks it, word for word — and the planted lines hold their facts', () => {
    for (const [set, n] of [['A', 7], ['B', 21], ['C', 26]]) {
      const tell = CHARTER.beats.find(b => b.n === n).tell;
      for (const f of CHARTER.facts) for (const p of f.probes.filter(x => x.set === set)) expect(tell, `${p.id} in beat ${n}`).toContain(p.ask);
    }
    const planted = CHARTER.rehearsal.filter(e => e.plants);
    for (const entry of planted) for (const id of entry.plants) expect(factHeld(entry.text, CHARTER.facts.find(f => f.id === id)), `${id} in "${entry.text}"`).toBe(true);
    expect(CHARTER.beats.find(b => b.n === 5).tell).toContain(planted[0].text);
  });

  it('its rehearsal script walks every beat that is the player\'s, and makes a move where the beat is one', () => {
    const scripted = new Set(CHARTER.rehearsal.map(e => e.beat));
    for (const b of CHARTER.beats.filter(x => !x.interruption || x.after === 'line')) expect(scripted.has(b.n), `beat ${b.n}`).toBe(true);
    const moves = CHARTER.rehearsal.filter(e => e.move).map(e => e.move.id);
    for (const b of CHARTER.beats.filter(x => x.dice)) expect(b.dice.moves.some(m => moves.includes(m)), `beat ${b.n}'s roll`).toBe(true);
  });
});

// ── the first live run, kept as a replay ─────────────────────────────────────

/**
 * Each beat's check by the beat's id — the current charter's held against a
 * kept run's by the beats that run had. A beat added since (the expedition,
 * `b7a`) is no part of a run made before it, and a beat's number is only
 * where it stands now.
 */
const checksById = (beats, among = beats) => Object.fromEntries(beats.filter(b => among.some(x => x.id === b.id)).map(b => [b.id, b.check]));

describe('the first live run of the long haul, kept as a replay (explorations/long-haul-live-20261123)', () => {
  const FOLDER = path.join(PLAYWRIGHT, 'explorations/long-haul-live-20261123');
  const RAW = fs.readFileSync(path.join(FOLDER, 'replay.json'), 'utf8');
  const RUN = JSON.parse(RAW);
  const CONFIG = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'explore.config.json'), 'utf8'));

  it('is a run the runner can take again: 87 actions with no document id in them, its dice, and every recorded reply filed under a step of the run', () => {
    expect(RUN.actions).toHaveLength(87);
    for (const a of RUN.actions) expect(Object.keys(a)).not.toContain('messageId');
    expect(RUN.actions.filter(a => a.action === 'choose').map(a => a.option), 'the two choices it made in a card\'s dropdown').toEqual(['Tamsin Vey', 'Find who is raiding the Cinder Expanse lanes']);
    expect(RUN.dice.length).toBeGreaterThan(0);
    expect(RUN.actions.filter(a => /\btr-[a-z0-9]{4,}\b/.test(a.text ?? '')).map(a => a.text), 'a truth is named by its entry, not its id').toEqual([]);
    expect(RUN.actions.find(a => a.truth)).toMatchObject({ action: 'say', text: '!truth strike {truth}', truth: 'raider cutter — is named the Ashen Wake' });
    expect(RUN.recording.provenance).toMatchObject({ runner: 'test/ci/playwright/explore.mjs', commit: expect.stringMatching(/^[0-9a-f]{40}$/) });
    const steps = new Set([...RUN.actions.map((_, i) => `a${i + 1}`), ...RUN.charter.beats.filter(b => b.interruption).map(b => `x${b.n}`), '(setup)', '(after)']);
    expect(RUN.recording.exchanges.filter(x => !steps.has(x.step)).map(x => `${x.step} ${x.kind}`)).toEqual([]);
    expect(RUN.recording.exchanges.length).toBeGreaterThan(200);
  });

  it('expects what the corrected checks found in it: every beat done, no rule broken — and says it was scored again, and what the run first said', () => {
    expect(Object.keys(RUN.expected.beats)).toHaveLength(26);
    expect(Object.keys(RUN.expected.beats), 'the beats it had: the expedition was added after it').toEqual(RUN.charter.beats.map(b => b.id));
    expect(Object.values(RUN.expected.beats).every(status => status === 'done')).toBe(true);
    expect(RUN.expected).toMatchObject({ violations: [], healthFailed: false, classification: 'suspected-quality-issue' });
    expect(RUN.rescored.was).toMatchObject({ classification: 'product-failure' });
    expect(RUN.rescored.was.because).toContain('beat 15');
    // The scoring data it carries is the charter's as it is now.
    const now = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'charters/long-haul.json'), 'utf8'));
    expect(RUN.charter.facts).toEqual(now.facts);
    expect(RUN.charter.baits).toEqual(now.baits);
    expect(checksById(RUN.charter.beats)).toEqual(checksById(now.beats, RUN.charter.beats));
  });

  it('holds what its review says of it, in the narrator\'s own recorded words', () => {
    const said = (step) => RUN.recording.exchanges.filter(x => x.step === step && /narrate/.test(x.kind)).map(x => x.response.content.map(c => c.text ?? '').join('')).join('\n');
    // The corrected name, used once more six actions after its correction.
    expect(said('a44')).toContain('Ashen Wake');
    // The renamed connection, made a woman of two names.
    expect(said('a55')).toMatch(/Tamsin Okoro\. Though the docks swear she's Vey/);
    // One of the prompt's own instructions, written as a sentence.
    expect(said('a57')).toContain('Open on the hatch, not you.');
    // And what held: the ship's berth, and the first bait refused.
    expect(said('a53')).toContain('Berthed at Bleakhold');
    expect(said('a82')).toMatch(/^"You did not,"/);
  });

  it('carries no key, every model it recorded has a price, and its review is written: no marked place is left', () => {
    expect(RAW).not.toMatch(/sk-ant-/);
    expect(Object.keys(CONFIG.prices.usdPerMillionTokens)).toEqual(expect.arrayContaining(RUN.recording.provenance.models));
    for (const file of ['annotated-transcript.md', 'scorecard.md']) {
      const text = fs.readFileSync(path.join(FOLDER, file), 'utf8');
      expect(text, file).not.toContain('_To write');
      expect(text, file).toContain('Re-scored');
    }
  });
});

// ── the second live run, after issue #377's fixes ────────────────────────────

describe('the second live run of the long haul, kept as a replay (explorations/long-haul-live-20261123-1459)', () => {
  const FOLDER = path.join(PLAYWRIGHT, 'explorations/long-haul-live-20261123-1459');
  const RAW = fs.readFileSync(path.join(FOLDER, 'replay.json'), 'utf8');
  const RUN = JSON.parse(RAW);
  const CONFIG = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'explore.config.json'), 'utf8'));
  const said = (step, kind = /narrate/) => RUN.recording.exchanges.filter(x => x.step === step && kind.test(x.kind)).map(x => x.response.content.map(c => c.text ?? '').join('')).join('\n');

  it('is a run the runner can take again: 89 actions with no document id, its dice, and every reply filed under a step', () => {
    expect(RUN.actions).toHaveLength(89);
    for (const a of RUN.actions) expect(Object.keys(a)).not.toContain('messageId');
    expect(RUN.actions.filter(a => a.action === 'choose').map(a => a.option)).toEqual(['Tamsin Vey', 'Find who is raiding the Cinder Expanse lanes']);
    expect(RUN.dice.length).toBeGreaterThan(0);
    expect(RUN.actions.filter(a => /\btr-[a-z0-9]{4,}\b/.test(a.text ?? '')).map(a => a.text), 'a truth is named by its entry, not its id').toEqual([]);
    expect(RUN.recording.provenance).toMatchObject({ runner: 'test/ci/playwright/explore.mjs', commit: expect.stringMatching(/^[0-9a-f]{40}$/) });
    const steps = new Set([...RUN.actions.map((_, i) => `a${i + 1}`), ...RUN.charter.beats.filter(b => b.interruption).map(b => `x${b.n}`), '(setup)', '(after)']);
    expect(RUN.recording.exchanges.filter(x => !steps.has(x.step)).map(x => `${x.step} ${x.kind}`)).toEqual([]);
  });

  it('expects what the corrected checks found: the fight\'s five beats not exercised, the rest done, no rule broken', () => {
    const notDone = Object.entries(RUN.expected.beats).filter(([, s]) => s !== 'done').map(([b]) => b);
    expect(notDone).toEqual(['b9', 'b10', 'b11', 'b12', 'b13']);
    expect(Object.values(RUN.expected.beats).filter(s => s === 'not-exercised')).toHaveLength(5);
    expect(RUN.expected).toMatchObject({ violations: [], healthFailed: false, classification: 'suspected-quality-issue' });
    expect(RUN.rescored).toMatchObject({ commit: expect.stringMatching(/^[0-9a-f]{40}$/), was: { classification: 'suspected-quality-issue', beats: { done: 20, notExercised: 6 } } });
    const now = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'charters/long-haul.json'), 'utf8'));
    expect(RUN.charter.facts).toEqual(now.facts);
    expect(RUN.charter.baits).toEqual(now.baits);
    expect(checksById(RUN.charter.beats)).toEqual(checksById(now.beats, RUN.charter.beats));
  });

  it('holds what its review says of it, in the recorded replies', () => {
    // Issue #377 item 1: the corrected and the renamed names, and the change told as a story.
    expect(said('a47')).toContain('The *Cinder Wren*, Mira');
    expect(said('a48')).toContain('You crossed it out, and wrote it again.');
    // A memory slip: the manifest handed over before the promise.
    expect(said('a45')).toContain('with the manifest still in your hand');
    // Item 3: the medkit line narrated without healing — and offered nothing.
    expect(said('a49')).toContain('spread the gauze across the galley table');
    expect(said('a49', /classifyInput/)).toMatch(/"decision":"NARRATIVE","suggestedMove":null/);
    // The named bond read as a connection, the track full.
    expect(said('a65', /interpretMove/)).toMatch(/"moveId":"make_a_connection"[\s\S]*needs an established bond track/);
    // A bait refused inside a line of speech.
    expect(said('a84')).toMatch(/"No," he says\. "You carried it out\."/);
  });

  it('carries no key, every model it recorded has a price, and its review is written', () => {
    expect(RAW).not.toMatch(/sk-ant-/);
    expect(Object.keys(CONFIG.prices.usdPerMillionTokens)).toEqual(expect.arrayContaining(RUN.recording.provenance.models));
    for (const file of ['annotated-transcript.md', 'scorecard.md']) {
      const text = fs.readFileSync(path.join(FOLDER, file), 'utf8');
      expect(text, file).not.toContain('_To write');
      expect(text, file).toContain('Re-scored');
    }
  });
});
