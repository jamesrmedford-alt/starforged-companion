/**
 * STARFORGED COMPANION
 * tests/unit/letGoStaysLetGo.test.js
 *
 * Overhaul 2, slice 1 (§7.3) — a lapsed question stays lapsed (known-issues
 * REFRAIN-OUTLIVES-THE-QUESTION). In the long haul's fourth live run the
 * scene's question was released after three unanswered beats, and the next
 * fact block set it again in other words: its count started over, and the
 * frame's Now line had carried it all along ("…while the pilot's offer and a
 * second hail both wait on the comm").
 *
 *   - At SCENE_QUESTION_BEATS the question goes onto the frame's `letGo` list
 *     — its text and its telling stems, the PCs' and the ship's names left out
 *     — and the frame's Now line goes with it.
 *   - A later question sharing one of its stems that the beat's player words
 *     do not hold is that question again, and is not set; a line that names
 *     the stem takes the hook up, and the question stands.
 *   - A later Now line that carries it is stored empty.
 *   - The list is code-kept: no fact block writes or drops it; at most four,
 *     the newest kept; an X-Card on the beat that let it go puts the question
 *     back.
 *   - The narrator is told it, under PLAY LET THESE GO, never dropped under
 *     the ledger's cap; the record keeps it on the frame's event.
 */

import { describe, it, expect } from 'vitest';
import { SCENE_QUESTION_BEATS, countSceneQuestionBeat, playersFrame } from '../../src/narration/narrator.js';
import { applySceneFrame, retractNarrations } from '../../src/factContinuity/ledgers.js';
import { normaliseSidecar } from '../../src/factContinuity/sidecarParser.js';
import { letGoEntry, withLetGo, touchesLetGo, normaliseLetGo, playersQuestion } from '../../src/factContinuity/provenance.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';
import { ledgerEvents } from '../../src/record/ledgerDiff.js';

const ABOUT = ['Mira Kestrel', 'Kobayashi IV'];
const LET_GO = "Will Mira answer the second hail before the pilot's offer lapses?";
const WHERE = 'Bleakhold Station market lock';

const state = () => ({ currentSceneId: 'sc-1', sceneTruths: [], sceneFrame: null });
/** One beat of play as applySidecarSideData applies it: the player's frame, the frame, the count. */
const beat = (cs, sidecarFrame, { line = '', narrationId } = {}) => {
  const prior = cs.sceneFrame;
  const framed = playersFrame(sidecarFrame, prior, { sceneId: cs.currentSceneId, line, about: ABOUT });
  if (applySceneFrame(framed, cs, { narrationId })) cs.sceneFrame = countSceneQuestionBeat(cs.sceneFrame, prior, { about: ABOUT });
  return cs.sceneFrame;
};
const frame = (over = {}) => ({ location: WHERE, present: ['Mira Kestrel'], situation: 'Mira works the lock', ...over });
const LINE = "I give up on the pilot for a moment and restock the ship's supplies.";

/** A scene whose question was set on LINE and let go after SCENE_QUESTION_BEATS beats. */
function lapsed() {
  const cs = state();
  beat(cs, frame({ question: LET_GO }), { line: LINE, narrationId: 'n0' });
  for (let i = 1; i <= SCENE_QUESTION_BEATS; i += 1) {
    beat(cs, frame({ question: LET_GO, situation: "Mira loads crates while the pilot's offer and a second hail wait on the comm" }),
      { line: 'I load the crates.', narrationId: `n${i}` });
  }
  return cs;
}

describe('overhaul 2 §7.3 — a lapse lets the question go', () => {
  it('onto the frame\'s list, with its own telling stems and not the names it is about; the Now line goes with it', () => {
    const cs = lapsed();
    expect(cs.sceneFrame).not.toHaveProperty('question');
    expect(cs.sceneFrame).not.toHaveProperty('questionBeats');
    expect(cs.sceneFrame.situation).toBe('');
    expect(cs.sceneFrame.location).toBe(WHERE);
    expect(cs.sceneFrame.letGo).toHaveLength(1);
    const [entry] = cs.sceneFrame.letGo;
    expect(entry.text).toBe(LET_GO);
    expect(entry.stems).toEqual(expect.arrayContaining(['answer', 'second', 'hail', 'pilot', 'offer']));
    expect(entry.stems).not.toContain('mira');
  });

  it('an answered question is never let go', () => {
    const cs = state();
    beat(cs, frame({ question: LET_GO }), { line: LINE, narrationId: 'n0' });
    beat(cs, frame({ question: LET_GO, questionAnswered: true }), { line: 'I answer the hail.', narrationId: 'n1' });
    for (let i = 2; i < 2 + SCENE_QUESTION_BEATS + 1; i += 1) beat(cs, frame(), { line: 'I wait.', narrationId: `n${i}` });
    expect(cs.sceneFrame).not.toHaveProperty('letGo');
    expect(cs.sceneFrame).toMatchObject({ question: LET_GO, questionAnswered: true });
  });
});

describe('overhaul 2 §7.3 — a let-go question is not set again', () => {
  it('reworded, on a line that touches it in passing — refused (D10: the line check alone would set it)', () => {
    const cs = lapsed();
    // Shares "pilot" with the line, so the line check passes; "answer", "second" and "hail" are the let-go
    // question's, and the line holds none of them.
    const q = 'Will the pilot answer for the second hail?';
    expect(playersQuestion(q, 'I turn back to the pilot.', [], { about: ABOUT })).toBe(q);
    beat(cs, frame({ question: q }), { line: 'I turn back to the pilot.', narrationId: 'n9' });
    expect(cs.sceneFrame).not.toHaveProperty('question');
  });

  it('a line that names its words takes the hook up: the question stands', () => {
    const cs = lapsed();
    beat(cs, frame({ question: 'Who is on the second hail?' }), { line: 'I answer the second hail.', narrationId: 'n9' });
    expect(cs.sceneFrame).toMatchObject({ question: 'Who is on the second hail?', questionBeats: 0 });
  });

  it('a Now line that carries it is stored empty — unless the line takes it up', () => {
    const cs = lapsed();
    beat(cs, frame({ situation: "Mira tends her wounds while the pilot's offer and the second hail both wait on the comm" }),
      { line: 'I tend my wounds.', narrationId: 'n9' });
    expect(cs.sceneFrame.situation).toBe('');
    beat(cs, frame({ situation: 'Mira answers the second hail at last' }), { line: 'I answer the second hail.', narrationId: 'n10' });
    expect(cs.sceneFrame.situation).toBe('Mira answers the second hail at last');
    // A Now line about something else stands.
    beat(cs, frame({ situation: 'Mira counts the ration bars' }), { line: 'I count the ration bars.', narrationId: 'n11' });
    expect(cs.sceneFrame.situation).toBe('Mira counts the ration bars');
  });

  it('touchesLetGo reads the stems the line does not hold, and nothing else', () => {
    const list = [letGoEntry(LET_GO, { about: ABOUT })];
    expect(touchesLetGo('Which channel will Mira answer?', 'I tend my injuries.', list)).toBe(true);
    expect(touchesLetGo('Which channel will Mira answer?', 'I answer it.', list)).toBe(false);
    expect(touchesLetGo('Will Mira rest?', 'I rest.', list)).toBe(false);
    expect(touchesLetGo('anything', 'line', [])).toBe(false);
  });
});

describe('overhaul 2 §7.3 — the list is code-kept', () => {
  it('a fact block can neither write nor drop it: the parser has no such key, and the frame carries it', () => {
    const { sceneFrame } = normaliseSidecar({ sceneFrame: { ...frame(), letGo: [{ text: 'planted', stems: ['plant'] }] } });
    expect(sceneFrame).not.toHaveProperty('letGo');
    const cs = lapsed();
    applySceneFrame(frame({ situation: 'Mira waits' }), cs, { narrationId: 'n9' });
    expect(cs.sceneFrame.letGo.map(e => e.text)).toEqual([LET_GO]);
  });

  it('a new scene starts with none of the old one\'s', () => {
    const cs = lapsed();
    cs.currentSceneId = 'sc-2';
    applySceneFrame(frame(), cs, { narrationId: 'n9' });
    expect(cs.sceneFrame).not.toHaveProperty('letGo');
  });

  it('at most four, the newest kept; one entry a text', () => {
    let list = [];
    for (const q of ['Who hails?', 'Who waits?', 'Who knocks?', 'Who calls?', 'Who sings?']) list = withLetGo(list, letGoEntry(q));
    expect(list.map(e => e.text)).toEqual(['Who waits?', 'Who knocks?', 'Who calls?', 'Who sings?']);
    expect(withLetGo(list, letGoEntry('Who calls?')).map(e => e.text)).toEqual(['Who waits?', 'Who knocks?', 'Who sings?', 'Who calls?']);
    expect(normaliseLetGo([{ text: '' }, 'x', null, { text: 'ok', stems: [1, 'ok'] }])).toEqual([{ text: 'ok', stems: ['ok'] }]);
  });

  it('the X-Card on the beat that let it go puts the question back, with its count and its Now line', () => {
    const cs = lapsed();
    retractNarrations(cs, [`n${SCENE_QUESTION_BEATS}`]);
    expect(cs.sceneFrame).toMatchObject({ question: LET_GO, questionBeats: SCENE_QUESTION_BEATS - 1 });
    expect(cs.sceneFrame.situation).not.toBe('');
    expect(cs.sceneFrame).not.toHaveProperty('letGo');
  });
});

describe('overhaul 2 §7.3 — the narrator is told, and the record keeps it', () => {
  it('PLAY LET THESE GO lists it, and is never dropped under the ledger\'s cap', () => {
    const cs = lapsed();
    cs.sceneState = { bySubject: { 'tamsin vey': [{ attribute: 'mood', value: 'wary', updatedAt: 1 }] } };
    const block = buildLedgerBlock(cs, { maxTokens: 10 });
    expect(block.letGo).toContain('PLAY LET THESE GO — hooks the narration posed that play did not take up.');
    expect(block.letGo).toContain(`  "${LET_GO}"`);
    expect(block.combined).toContain(block.letGo);
    expect(block.state).toBe('');                       // state shed; the list stands
    expect(buildLedgerBlock(state()).letGo).toBe('');
  });

  it('the frame\'s record event carries the list\'s texts, and a change of it alone is recorded', () => {
    const before = lapsed();
    const held = { ...before, sceneFrame: { ...before.sceneFrame } };
    delete held.sceneFrame.letGo;
    const [event] = ledgerEvents(held, before).filter(e => e.kind === 'frame');
    expect(event.payload.d.letGo).toEqual([LET_GO]);
  });
});
