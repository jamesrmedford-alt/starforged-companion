/**
 * STARFORGED COMPANION
 * tests/unit/sceneQuestionIsThePlayers.test.js
 *
 * Overhaul 2, slice 1 (§7.2) — known-issues REFRAIN-OUTLIVES-THE-QUESTION:
 * the long haul's fourth live run
 * (test/ci/playwright/explorations/long-haul-live-20261124-213912/). Session 3
 * held "the second hail light" in 15 of its 17 narrations of play. The
 * scene's question was released after three unanswered beats as designed —
 * and the next fact block set it again in other words, from the narrator's
 * own hook. The question is the player's now: set only on a beat with the
 * player's words, and only when it shares a telling word with them (a name is
 * no evidence — the player names whom they talk to); a beat no line prompted
 * — a bookend, a clock vignette, the oath scene, the inciting incident — sets
 * none.
 *
 * The questions and the lines below are the run's own (its replay.json): each
 * question as its fact block set it, under the line of the beat that set it.
 * Read so, a3's and a60's are refused; a65's is the player's (it shares
 * "pilot" with its line) and stands until it is let go with a68; a69's, a73's
 * and a85's are refused — one set, where the run had four over twenty beats.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf, onGm, moveResolution, narrateMoveOn, narrationCallsOf } from '../helpers/skeletonTable.js';
import { playersQuestion, groundOf, QUESTION_MODES } from '../../src/factContinuity/provenance.js';
import { playersFrame } from '../../src/narration/narrator.js';

const ABOUT = ['Mira Kestrel', 'Kobayashi IV'];

// ── The run's own words ──────────────────────────────────────────────────────

/** a3 — the vow's roll: its narration set a hook from no word of the line. */
const A3 = { line: 'Swear an iron vow: Find who is raiding the Cinder Expanse lanes.', question: 'Who is hailing the Kobayashi IV?' };
/** a3 — the oath scene's own fact block, before the roll. */
const A3_OATH = 'What will the vow demand of Mira first?';
/** a60 — the line asked the cutter's name; the block set whether Mira will hear who sent her. */
const A60 = { line: 'What is the raider cutter called?', question: 'Will Mira hear the name of whoever sent the Cinder Wren?' };
/** a65 — the line set the pilot aside; the block's question took "pilot" from it. */
const A65 = {
  line: "I give up on the pilot for a moment and restock the ship's supplies from Bleakhold's market, loading what I need aboard.",
  question: "Will Mira answer the second hail before the pilot's offer lapses?",
  situation: "Mira turns from the pilot to arrange supplies from Bleakhold's market while a second hail blinks on another channel",
};
const A66 = { line: 'I Resupply at the market: I pay the dockhand in scrip and load fresh supplies aboard.',
  situation: "Mira has paid for a sealed supply crate while the pilot's offer and a second hail both wait on the comm" };
const A67 = { line: "I open the sealed crate and stock the ship's supplies properly, checking each item against my list.",
  situation: "Mira is checking the opened supply crate while the pilot's offer and a second hail wait on the comm" };
const A68 = { line: 'I Resupply: I finish stocking the ship from the crate and mark my supplies restored.',
  situation: "Mira has finished checking the crate while the pilot's offer and a second hail both wait on the comm" };
const A69 = { line: 'I pick up the medkit again and tend my injuries, bandaging each wound carefully.',
  question: 'Which channel will Mira answer?',
  situation: "Mira tends her wounds while the pilot's offer and the second hail both wait on the comm" };
const A73 = { line: 'I mark progress on my vow: this is a milestone.', question: 'Who will answer the second hail light?' };
const A85 = { line: "We are still docked at Hollow Spire, aren't we?", question: 'Who is on the second hail channel?' };

const WHERE = 'Bleakhold Station market lock, with the Kobayashi IV off the station';

describe('overhaul 2 §7.2 — the scene\'s question is the player\'s', () => {
  it('a question that shares a telling word with the player\'s line is set — a65\'s, by "pilot"', () => {
    expect(playersQuestion(A65.question, A65.line, [], { about: ABOUT })).toBe(A65.question);
  });

  it('one that shares none is refused — a3\'s roll, a60, a69, a73, a85', () => {
    for (const { line, question } of [A3, A60, A69, A73, A85]) {
      expect(playersQuestion(question, line, [], { about: ABOUT }), question).toBe('');
    }
  });

  it('a name is no evidence: the PCs\' and the command vehicle\'s names are no telling word', () => {
    // "Kobayashi IV" is the only word a3's question and a line naming the ship share.
    expect(playersQuestion(A3.question, 'I bring the Kobayashi IV about.', [], { about: ABOUT })).toBe('');
    expect(playersQuestion('Will Mira Kestrel hold?', 'Mira Kestrel braces.', [], { about: ABOUT })).toBe('');
    // Without the names set aside, they would have counted.
    expect(playersQuestion(A3.question, 'I bring the Kobayashi IV about.', [], { about: [] })).toBe(A3.question);
  });

  it('a beat with no player words sets none; a question with no telling word of its own shares nothing', () => {
    expect(playersQuestion(A65.question, '', [], { about: ABOUT })).toBe('');
    expect(playersQuestion('Will she?', 'Will she hold the line?', [], { about: ABOUT })).toBe('');
  });

  it('only a beat of play the player\'s words prompted may set one', () => {
    expect([...QUESTION_MODES].sort()).toEqual(['move_resolution', 'oracle_followup', 'paced_narrative', 'round_resolution']);
    for (const mode of ['session_vignette', 'clock_advance', 'vow_swearing', 'inciting_incident', 'scene_interrogation']) {
      expect(QUESTION_MODES.has(mode), mode).toBe(false);
    }
  });

  it('the ground is the beat\'s player words, bounded', () => {
    expect(groundOf({ line: `  ${A65.line} ` })).toEqual({ line: A65.line });
    expect(groundOf({ lines: ['I draw.', '', 'I fire.'] })).toEqual({ line: 'I draw.\nI fire.' });
    expect(groundOf({ line: 'x'.repeat(9000) }).line.length).toBeLessThanOrEqual(4000);
    expect(groundOf()).toEqual({ line: '' });
  });

  it('playersFrame reads only a new question: one the frame holds is kept as before, and an answer still marks it', () => {
    const prior = { sceneId: 'sc-1', location: WHERE, present: [], situation: '', question: A65.question, questionBeats: 1 };
    // The held question is copied — or reworded — by a block on a line that shares nothing: kept, untouched.
    expect(playersFrame({ location: WHERE, present: [], situation: A66.situation, question: 'Who hails?' }, prior,
      { sceneId: 'sc-1', line: A66.line, about: ABOUT })).toMatchObject({ question: 'Who hails?' });
    expect(playersFrame({ location: WHERE, present: [], situation: '', question: A65.question, questionAnswered: true }, prior,
      { sceneId: 'sc-1', line: 'I answer the hail.', about: ABOUT })).toMatchObject({ questionAnswered: true });
    // With none held, the block's own is refused.
    const open = { ...prior };
    delete open.question;
    const framed = playersFrame({ location: WHERE, present: [], situation: '', question: A69.question, questionAnswered: true }, open,
      { sceneId: 'sc-1', line: A69.line, about: ABOUT });
    expect(framed).not.toHaveProperty('question');
    expect(framed).not.toHaveProperty('questionAnswered');
  });
});

// ── On the table: the run's session 3, beat by beat ──────────────────────────

describe('overhaul 2 §7.2 — on the table: session 3\'s questions under their lines', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    restore = await resetSkeletonTable(table, {}, { sceneFrame: null, sceneState: { bySubject: {}, sceneId: 'sc-1' } });
    table.addActor({ id: 'pc-mira', name: 'Mira Kestrel', ownership: { 'pl-1': 3 } });
  });
  afterEach(() => restore?.());

  const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
  const reply = (frame) => () => ({ prose: 'The comm light blinks on the panel.', sidecar: { newTruths: [], stateChanges: [],
    sceneFrame: { location: WHERE, present: ['Mira Kestrel'], situation: frame.situation ?? 'Mira works the market lock', ...frame } } });
  async function narrateLine(line) {
    const { narratePacedInput } = await gmOf(table).import('../../src/narration/narrator.js');
    return onGm(table, () => narratePacedInput(line,
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-mira' }));
  }

  it('a60\'s hook is refused; a65\'s is set and stands three beats, then is let go with a68; a69\'s is refused', async () => {
    table.replies = reply({ question: A60.question, situation: "The Cinder Wren's pilot offers to name who sent her" });
    await narrateLine(A60.line);
    expect(stored().sceneFrame).not.toHaveProperty('question');

    table.replies = reply({ question: A65.question, situation: A65.situation });
    await narrateLine(A65.line);
    expect(stored().sceneFrame).toMatchObject({ question: A65.question, questionBeats: 0 });

    for (const [i, beat] of [A66, A67].entries()) {
      table.replies = reply({ question: A65.question, situation: beat.situation });
      await narrateLine(beat.line);
      expect(stored().sceneFrame, `a${66 + i}`).toMatchObject({ question: A65.question, questionBeats: i + 1 });
    }
    table.replies = reply({ question: A65.question, situation: A68.situation });
    await narrateLine(A68.line);
    expect(stored().sceneFrame).not.toHaveProperty('question');
    expect(stored().sceneFrame.letGo.map(e => e.text)).toEqual([A65.question]);

    table.replies = reply({ question: A69.question, situation: A69.situation });
    await narrateLine(A69.line);
    expect(stored().sceneFrame).not.toHaveProperty('question');
  }, 120_000);

  it('a73\'s move and a85\'s line set none of their blocks\' hooks', async () => {
    table.replies = reply({ question: A73.question });
    await narrateMoveOn(table, moveResolution({ moveId: 'reach_a_milestone', moveName: 'Reach a Milestone',
      outcome: 'strong_hit', outcomeLabel: 'Strong Hit', playerNarration: A73.line }));
    expect(stored().sceneFrame).not.toHaveProperty('question');
    table.replies = reply({ question: A85.question });
    await narrateLine(A85.line);
    expect(stored().sceneFrame).not.toHaveProperty('question');
  }, 120_000);

  it('a bookend, the oath scene and a clock vignette set none, whatever their blocks say', async () => {
    const { narrateSessionVignette, narrateVowSwearing, narrateClockAdvancement } = await gmOf(table).import('../../src/narration/narrator.js');
    const copy = () => foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));

    let calls = narrationCallsOf(table).length;
    const narrated = () => { const now = narrationCallsOf(table).length; const ran = now > calls; calls = now; return ran; };

    table.replies = reply({ question: 'What is the speaker over the hatch about to say?' });
    await onGm(table, () => narrateSessionVignette({ userMessage: "OPENING VIGNETTE — begin-session ship's galley.", campaignState: copy(), actorIds: ['pc-mira'] }));
    expect(narrated(), 'the opening was narrated').toBe(true);
    expect(stored().sceneFrame).not.toHaveProperty('question');

    table.replies = reply({ question: A3_OATH });
    await onGm(table, () => narrateVowSwearing({ vow: { name: 'Find who is raiding the Cinder Expanse lanes', rank: 'dangerous' },
      campaignState: copy(), speakerActorId: 'pc-mira' }));
    expect(narrated(), 'the oath scene was narrated').toBe(true);
    expect(stored().sceneFrame).not.toHaveProperty('question');

    table.replies = reply({ question: 'Who will the raiders strike next?' });
    await onGm(table, () => narrateClockAdvancement({
      clock: { _id: 'clk-1', name: 'Raider fleet gathers', type: 'campaign', filled: 3, segments: 6, triggered: false }, campaignState: copy() }));
    expect(narrated(), 'the clock vignette was narrated').toBe(true);
    expect(stored().sceneFrame).not.toHaveProperty('question');
    // Each wrote its frame: the question alone was refused.
    expect(stored().sceneFrame).toMatchObject({ location: WHERE });
  }, 120_000);
});
