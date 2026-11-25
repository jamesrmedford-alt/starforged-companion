/**
 * STARFORGED COMPANION
 * tests/unit/summaryToldLetGo.test.js
 *
 * Overhaul 2, slice 1 (§5.7, §7.4) — the session summary is told what play
 * let go, and never tells it. The long haul's fourth live run: session 1's
 * summary opened on a3's untaken hook ("an amber hail light began blinking on
 * the comm panel behind her") — a hook no line took up — and the two
 * sessions after it opened on that light again.
 *
 *   - The record's `frame` event carries the frame's let-go questions
 *     (ledgerDiff), the read gathers a session's (read.js `letGo`), and the
 *     summary's source lists them under LET GO.
 *   - The summary's rules say TOLD AS holds the narrator's own colour — a
 *     place's look, a prop, the hook a beat ends on — none of it an event, and
 *     that nothing under LET GO is told at all.
 *   - A frame the X-Card removed lets nothing go.
 *
 * The frames are written by the real producers (playersFrame,
 * applySceneFrame, countSceneQuestionBeat) and recorded by the real differ.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SCENE_QUESTION_BEATS, countSceneQuestionBeat, playersFrame } from '../../src/narration/narrator.js';
import { applySceneFrame } from '../../src/factContinuity/ledgers.js';
import { ledgerEvents } from '../../src/record/ledgerDiff.js';
import { readRecord } from '../../src/record/read.js';
import { summarySource, SESSION_SUMMARY_SYSTEM_PROMPT, _resetSummaryViewForTests } from '../../src/record/summaryView.js';

const S1 = 'sess-1';
const ABOUT = ['Mira Kestrel', 'Kobayashi IV'];
const HOOK = 'Who is hailing the Kobayashi IV?';
const LINE = 'I answer the hailing on the comm panel.';

let n = 0;
/** An event as record.js stores it. */
const stored = (k, { ref = {}, d = {}, text, who = {} } = {}) => {
  n += 1;
  return { id: `e${String(n).padStart(4, '0')}`, k, at: n * 1000, seq: n, s: S1, scene: 'sc-1',
    who: { user: null, actor: who.actor ?? null }, ref, d, ...(text !== undefined ? { text } : {}) };
};
const page = (events) => ({
  pageId: 'p-1', sessionId: S1, number: 1, name: 'Session 1', createdAt: 1, story: '',
  record: { v: 1, sessionId: S1, seq: n, events: Object.fromEntries(events.map(e => [e.id, e])), views: {} },
});
const source = (events) => ({ pages: [page(events)], currentSessionId: S1, nameOf: () => 'Mira Kestrel', otherNames: ['Mira Kestrel'] });

/**
 * Play a scene beat by beat — each a line, its narration and the save of its
 * frame — and record it as the table records it: the line, the narration
 * card, and what the ledger save amounts to (ledgerDiff.ledgerEvents).
 */
function playScene(beats) {
  const events = [stored('session.begun', { d: { number: 1 } })];
  let cs = { currentSessionId: S1, currentSceneId: 'sc-1', sceneTruths: [], sceneFrame: null };
  beats.forEach(({ line, frame }, i) => {
    const nar = `nar-${i + 1}`;
    const before = structuredClone(cs);
    const prior = cs.sceneFrame;
    const framed = playersFrame(frame, prior, { sceneId: 'sc-1', line, about: ABOUT });
    if (applySceneFrame(framed, cs, { narrationId: nar })) cs.sceneFrame = countSceneQuestionBeat(cs.sceneFrame, prior, { about: ABOUT });
    events.push(stored('line', { who: { actor: 'pc-mira' }, ref: { line: `m-${i}` }, d: { via: 'typed' }, text: line }));
    events.push(stored('narration', { who: { actor: 'pc-mira' }, ref: { nar }, d: { mode: 'paced', actorId: 'pc-mira' },
      text: 'An amber light blinks on the comm panel behind her.' }));
    for (const { kind, payload } of ledgerEvents(before, cs)) events.push(stored(kind, { ref: payload.ref, d: payload.d }));
    cs = structuredClone(cs);
  });
  return events;
}

const where = { location: 'Kobayashi IV, mess hall', present: ['Mira Kestrel'] };
/** The hook set on a line that takes it up, then left unanswered until it is let go. */
const lapse = () => [
  { line: LINE, frame: { ...where, situation: 'A hail light blinks amber', question: HOOK } },
  ...Array.from({ length: SCENE_QUESTION_BEATS }, (_, i) => ({ line: `I eat my ration ${i + 1}.`,
    frame: { ...where, situation: 'A hail light blinks amber', question: HOOK } })),
];

beforeEach(() => { _resetSummaryViewForTests(); n = 0; });

describe('overhaul 2 §7.4 — the summary is told LET GO', () => {
  it('a question play let go is in the session\'s read and under LET GO in the summary\'s source', () => {
    const events = playScene(lapse());
    const session = readRecord({ session: S1 }, source(events)).sessions[0];
    expect(session.letGo).toEqual([HOOK]);
    const src = summarySource(session);
    expect(src.text).toContain('## LET GO — the narration posed these; play never took them up');
    expect(src.text).toContain(`- “${HOOK}”`);
    // Every beat is still told as it was.
    expect(src.ids).toHaveLength(SCENE_QUESTION_BEATS + 1);
  });

  it('a session that let nothing go has no LET GO section', () => {
    const events = playScene(lapse().slice(0, 2));
    const session = readRecord({ session: S1 }, source(events)).sessions[0];
    expect(session.letGo).toEqual([]);
    expect(summarySource(session).text).not.toContain('## LET GO');
  });

  it('the frame of a narration the X-Card removed lets nothing go', () => {
    const events = playScene(lapse());
    const lastNar = `nar-${SCENE_QUESTION_BEATS + 1}`;
    events.push(stored('narration.removed', { d: { narrationIds: [lastNar], by: 'xcard' } }));
    const session = readRecord({ session: S1 }, source(events)).sessions[0];
    expect(session.letGo).toEqual([]);
  });

  it('the summary\'s rules: TOLD AS holds the narrator\'s own colour, none of it an event; LET GO is never told', () => {
    expect(SESSION_SUMMARY_SYSTEM_PROMPT).toContain("TOLD AS is the narrator's telling and holds its own colour — the look of a place, a prop, the hook a beat ends on.");
    expect(SESSION_SUMMARY_SYSTEM_PROMPT).toContain('nothing under LET GO is told at all, as an event or as something still waiting.');
  });
});
