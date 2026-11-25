/**
 * STARFORGED COMPANION
 * tests/unit/summaryView.test.js — the session summary, a view of the session record (issue #382, slice 3)
 *
 * The summary's source is a session's read: numbered beats — the facts of
 * each, and TOLD AS the narrator's prose — the questions asked, what the table
 * struck. Its view is valid while the span it was made from reads the same;
 * a correction made since inside that span makes it stale, more play since
 * makes it behind. LAST SESSION is the newest begun earlier session's story,
 * with what was played in sessions nobody began since given as facts.
 *
 * Pure: the source is a page list as pages.js hands it over. The writer and
 * its readers are tests/unit/sessionSummary.test.js.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readRecord } from '../../src/record/read.js';
import {
  summarySource, summaryState, lastSessionStory, earlierSessionStories, sessionSummaryText,
  summariesOwed, sessionIdOfNumber, recordedSessionNumber, _resetSummaryViewForTests,
} from '../../src/record/summaryView.js';

const S1 = 'sess-1';
const S2 = 'sess-2';
const S3 = 'sess-3';
let n = 0;
const ev = (k, { s = S1, at, who = {}, ref = {}, d = {}, text } = {}) => {
  n += 1;
  return {
    id: `e${String(n).padStart(4, '0')}`, k, at: at ?? n * 1000, seq: n, s, scene: 'sc-1',
    who: { user: who.user ?? null, actor: who.actor ?? null }, ref, d, ...(text !== undefined ? { text } : {}),
  };
};
const page = (sessionId, events, { number = 1, story = '', createdAt = 1, summary = null } = {}) => ({
  pageId: `p-${sessionId}`, sessionId, number, name: `Session ${number}`, createdAt, story,
  record: events === null ? null : {
    v: 1, sessionId, seq: Math.max(0, ...events.map(e => e.seq)),
    events: Object.fromEntries(events.map(e => [e.id, e])), views: summary ? { summary } : {},
  },
});
const ACTORS = { 'pc-mira': 'Mira Kestrel' };
const source = (pages, current = S3) => ({ pages, currentSessionId: current, nameOf: (id) => ACTORS[id] ?? null, otherNames: Object.values(ACTORS) });

const begun = (s, number) => ev('session.begun', { s, d: { number } });
const line = (s, text, res) => ev('line', { s, who: { actor: 'pc-mira' }, ref: { line: `m-${n}`, ...(res ? { res } : {}) }, d: { via: 'typed' }, text });
const move = (s, res, moveId, outcome) => ev('move.resolved', { s, who: { actor: 'pc-mira' }, ref: { res },
  d: { moveId, moveName: moveId.replace(/_/g, ' '), statUsed: 'heart', outcome, actionScore: 7, actionDie: 5, challengeDice: [3, 6] } });
const told = (s, nar, res, text, mode = 'move') => ev('narration', { s, who: { actor: 'pc-mira' }, ref: { nar, ...(res ? { res } : {}) }, d: { mode }, text });
// What the move decided (overhaul 2 §5.2: the dice's — it binds, and the views tell it).
const truth = (s, id, nar, fact) => ev('truth.set', { s, ref: { truth: id, nar }, d: { subject: { kind: 'text', text: 'the hatch' }, fact, by: 'narrator', basis: 'dice' } });

/** A summary view as the writer stores it, made from `session`'s read now. */
const viewOf = (pages, sessionId, text = 'Mira forced the hatch.') => {
  const src = summarySource(readRecord({ session: sessionId }, source(pages)).sessions[0]);
  return { text, cites: [['1']], through: src.through, sourceHash: src.hash, madeAt: 1 };
};

beforeEach(() => { _resetSummaryViewForTests(); });

describe('the summary\'s source is the session read with its corrections', () => {
  it('numbered beats: the facts, the player\'s own words, and TOLD AS under them — a cutaway left out', () => {
    const events = [
      begun(S1, 1),
      line(S1, 'I put my shoulder to the hatch.'),
      move(S1, 'r1', 'face_danger', 'strong_hit'),
      told(S1, 'n1', 'r1', 'The hatch gives with a shriek of metal.'),
      truth(S1, 't1', 'n1', 'is forced open'),
      told(S1, 'n2', null, 'Far off, a courier burns a letter.', 'vignette_close'),
    ];
    const src = summarySource(readRecord({ session: S1 }, source([page(S1, events)])).sessions[0]);
    expect(src.ids).toEqual(['1']);
    expect(src.text).toMatch(/^## THE SESSION \(oldest first\)/);
    expect(src.text).toMatch(/\[1\] Mira Kestrel — the player wrote “I put my shoulder to the hatch\.” — face danger \(\+heart\), strong hit — established \(the dice\): the hatch — is forced open/);
    expect(src.text).toMatch(/TOLD AS: “The hatch gives with a shriek of metal\.”/);
    expect(src.text).not.toMatch(/courier/);          // a cutaway is no beat of the session's
    expect(src.empty).toBe(false);
  });

  it('a question is listed as asked, a strike as did-not-happen, a lasting beat marked', () => {
    const events = [
      begun(S1, 1),
      ev('question', { s: S1, who: { actor: 'pc-mira' }, ref: { nar: 'nq' }, text: 'Who owns the yard?' }),
      told(S1, 'nq', null, 'The yard is the Guild\'s, by its sigil.', 'scene_answer'),
      line(S1, 'I swear to find my sister.'),
      move(S1, 'r2', 'swear_an_iron_vow', 'strong_hit'),
      told(S1, 'n3', 'r2', 'The vow settles in you like a stone.'),
      truth(S1, 't2', 'n3', 'was sealed by the Guild'),
      ev('truth.struck', { s: S1, ref: { truth: 't2' }, d: { by: 'gm' } }),
    ];
    const src = summarySource(readRecord({ session: S1 }, source([page(S1, events)])).sessions[0]);
    expect(src.text).toMatch(/## QUESTIONS — asked of the narrator; nothing happened because one was asked\n\n\[\d\] Mira Kestrel asked the narrator “Who owns the yard\?”/);
    expect(src.text).toMatch(/## STRUCK BY THE TABLE — did not happen\n\n- the hatch — was sealed by the Guild/);
    expect(src.text).toMatch(/swear an iron vow \(\+heart\), strong hit — LASTING: a vow sworn/);
    expect(src.lasting).toHaveLength(1);
  });

  it('a Batch Mode round: each entry is its player\'s own words, the round told once', () => {
    const events = [
      begun(S1, 1),
      ev('line', { s: S1, who: { actor: 'pc-mira' }, ref: { round: 'round-3' }, d: { via: 'round' }, text: 'I slip through the vent.' }),
      ev('line', { s: S1, who: { actor: 'pc-ren' }, ref: { round: 'round-3' }, d: { via: 'round' }, text: 'I keep the corridor covered.' }),
      ev('narration', { s: S1, ref: { nar: 'nr', round: 'round-3' }, d: { mode: 'round' }, text: 'Mira slips through while Ren holds the corridor.' }),
    ];
    const src = summarySource(readRecord({ session: S1 }, source([page(S1, events)])).sessions[0]);
    expect(src.text).toContain('the player wrote “I slip through the vent.”');
    expect(src.text).toContain('the player wrote “I keep the corridor covered.”');
    expect(src.text.match(/TOLD AS: “Mira slips through while Ren holds the corridor\.”/g)).toHaveLength(1);
  });

  it('a session with nothing to tell is empty; a session from before the record has no source', () => {
    expect(summarySource(readRecord({ session: S1 }, source([page(S1, [begun(S1, 1)])])).sessions[0]).empty).toBe(true);
    expect(summarySource(readRecord({ session: S1 }, source([page(S1, null, { story: 'Old.' })])).sessions[0]).empty).toBe(true);
  });
});

describe('a view is valid while its span reads the same', () => {
  const play = () => [begun(S1, 1), line(S1, 'I force the hatch.'), move(S1, 'r1', 'face_danger', 'strong_hit'),
    told(S1, 'n1', 'r1', 'The hatch gives.'), truth(S1, 't1', 'n1', 'is forced open')];

  it('no view: not valid, and behind', () => {
    const state = summaryState(S1, source([page(S1, play())]));
    expect(state).toMatchObject({ view: null, valid: false, behind: true });
  });

  it('a view made from the session as it stands: valid, not behind — more play since: valid and behind, by its new beats', () => {
    const events = play();
    const summary = viewOf([page(S1, events)], S1);
    expect(summaryState(S1, source([page(S1, events, { summary })]))).toMatchObject({ valid: true, behind: false, newBeats: 0 });
    _resetSummaryViewForTests();
    const more = [...events, line(S1, 'I slip inside.'), move(S1, 'r2', 'face_danger', 'weak_hit'), told(S1, 'n2', 'r2', 'Dark inside.')];
    const state = summaryState(S1, source([page(S1, more, { summary })]));
    expect(state).toMatchObject({ valid: true, behind: true, newBeats: 1 });
    expect(sessionSummaryText(S1, source([page(S1, more, { summary })], S1))).toBe('Mira forced the hatch.');
  });

  it('an X-Card on a narration inside the span, recorded after it, makes the view stale — not shown', () => {
    const events = play();
    const summary = viewOf([page(S1, events)], S1);
    const later = [...events, ev('narration.removed', { s: S1, d: { narrationIds: ['n1'], by: 'xcard' } })];
    expect(summaryState(S1, source([page(S1, later, { summary })]))).toMatchObject({ valid: false });
    expect(sessionSummaryText(S1, source([page(S1, later, { summary })], S1))).toBe('');
  });

  it('a strike of a truth inside the span, made after it, makes the view stale', () => {
    const events = play();
    const summary = viewOf([page(S1, events)], S1);
    const later = [...events, ev('truth.struck', { s: S1, ref: { truth: 't1' }, d: { by: 'gm' } })];
    expect(summaryState(S1, source([page(S1, later, { summary })])).valid).toBe(false);
  });

  it('a name changed since, where the span names it, makes the view stale', () => {
    const events = [begun(S1, 1), line(S1, 'I hail the Ashen Wake.'), move(S1, 'r1', 'compel', 'strong_hit')];
    const summary = viewOf([page(S1, events)], S1);
    const later = [...events, ev('name.changed', { s: S1, d: { from: 'Ashen Wake', to: 'Cinder Wren', how: 'renamed' } })];
    expect(summaryState(S1, source([page(S1, later, { summary })])).valid).toBe(false);
  });
});

describe('LAST SESSION, and the earlier sessions the snapshot tells', () => {
  const s1 = () => [begun(S1, 1), line(S1, 'I swear to find her.'), move(S1, 'r1', 'swear_an_iron_vow', 'strong_hit')];
  const s2 = () => [begun(S2, 2), line(S2, 'I take the lane to Bleakhold.'), move(S2, 'r2', 'set_a_course', 'strong_hit')];

  it('is the newest earlier begun session\'s valid summary — the current session never', () => {
    const e1 = s1(); const e2 = s2();
    const pages = [page(S1, e1, { number: 1, createdAt: 1 }), page(S2, e2, { number: 2, createdAt: 2 })];
    const summary = viewOf(pages, S2, 'Mira set a course for Bleakhold.');
    const withView = [page(S1, e1, { number: 1, createdAt: 1 }), page(S2, e2, { number: 2, createdAt: 2, summary })];
    expect(lastSessionStory({ currentSessionId: S3 }, source(withView))).toEqual({ sessionId: S2, sessionNumber: 2, text: 'Mira set a course for Bleakhold.' });
    _resetSummaryViewForTests();
    expect(lastSessionStory({ currentSessionId: S2 }, source(withView, S2))?.sessionId).not.toBe(S2);
  });

  it('a session nobody began since is given after it, as facts', () => {
    const e1 = s1();
    const summary = viewOf([page(S1, e1)], S1, 'Mira swore to find her sister.');
    const unbegun = [line(S2, 'I ask the oracle of the lanes.'), move(S2, 'r9', 'gather_information', 'weak_hit')];
    const pages = [page(S1, e1, { number: 1, createdAt: 1, summary }), page(S2, unbegun, { number: null, createdAt: 2 })];
    const last = lastSessionStory({ currentSessionId: S3 }, source(pages));
    expect(last.sessionId).toBe(S1);
    expect(last.text).toMatch(/^Mira swore to find her sister\.\n\nPlayed between sessions, while no session was begun: Mira Kestrel — the player wrote “I ask the oracle of the lanes\.” — gather information/);
  });

  it('a stale summary is not told; a session with no summary yet is told by the story its page held; a legacy one by its story', () => {
    const e1 = s1();
    const summary = viewOf([page(S1, e1)], S1, 'Mira swore to find her sister.');
    const removed = [...e1, ev('narration.removed', { s: S1, d: { narrationIds: [], by: 'xcard' } }), ev('truth.struck', { s: S1, ref: { truth: 'none' } })];
    // (a correction that touches nothing of the span leaves it standing)
    expect(lastSessionStory({ currentSessionId: S3 }, source([page(S1, removed, { summary })]))?.text).toBe('Mira swore to find her sister.');
    _resetSummaryViewForTests();
    const noView = [page(S1, e1, { story: 'The story End wrote.' })];
    expect(lastSessionStory({ currentSessionId: S3 }, source(noView))?.text).toBe('The story End wrote.');
    _resetSummaryViewForTests();
    const legacy = [page(S1, null, { story: 'A session from before the record.' })];
    expect(lastSessionStory({ currentSessionId: S3 }, source(legacy))?.text).toBe('A session from before the record.');
    _resetSummaryViewForTests();
    expect(lastSessionStory({ currentSessionId: S3 }, source([]))).toBeNull();
  });

  it('earlier sessions newest first; the summaries owed are the begun ones never made, stale or behind', () => {
    const e1 = s1(); const e2 = s2();
    const pages = [page(S1, e1, { number: 1, createdAt: 1 }), page(S2, e2, { number: 2, createdAt: 2 })];
    const summary = viewOf(pages, S2, 'Mira set a course.');
    const both = [page(S1, e1, { number: 1, createdAt: 1, story: 'Session one, as End wrote it.' }), page(S2, e2, { number: 2, createdAt: 2, summary })];
    expect(earlierSessionStories({ currentSessionId: S3 }, {}, source(both)).map(s => [s.sessionId, s.text, s.last]))
      .toEqual([[S2, 'Mira set a course.', true], [S1, 'Session one, as End wrote it.', false]]);
    expect(summariesOwed({ currentSessionId: S3 }, {}, source(both))).toEqual([S1]);
  });

  it('a session is found by the number the record gives it', () => {
    const pages = [page(S1, s1(), { number: 1, createdAt: 1 }), page(S2, s2(), { number: 2, createdAt: 2 })];
    expect(sessionIdOfNumber(2, source(pages))).toBe(S2);
    expect(recordedSessionNumber(S1, source(pages))).toBe(1);
    expect(sessionIdOfNumber(7, source(pages))).toBeNull();
  });
});
