/**
 * STARFORGED COMPANION
 * tests/unit/recapView.test.js — the campaign recap's source is the session record (issue #382, slice 2)
 *
 * The recap was written from the Chronicle alone, and each hop between the
 * table and it could change the story (known-issues
 * RECAP-STATES-WHAT-DID-NOT-HAPPEN): "whatever I haul" became "her hauls" by
 * way of a scribe, the scribe's "he" became the recap's, a gap the X-Card left
 * was filled in, a dropped change was carried forward. Its source now is the
 * record's facts — the player's own words, the move and its outcome, what
 * changed, what play did — with every line an id its sentences cite (D11).
 * Facts only: no narration (D4). Pure functions over a readRecord result.
 */

import { describe, it, expect } from 'vitest';
import { recapSource, citedRecap, recapText, beatFacts } from '../../src/record/recapView.js';
import { readRecord } from '../../src/record/read.js';

let n = 0;
const ev = (k, { s = 'sess-3', who = {}, ref = {}, d = {}, text } = {}) => {
  n += 1;
  return { id: `e${n}`, k, at: n * 1000, seq: n, s, scene: 'sc-1',
    who: { user: who.user ?? null, actor: who.actor ?? null }, ref, d, ...(text !== undefined ? { text } : {}) };
};
const page = (sessionId, number, events, story = '') => ({
  pageId: `p-${sessionId}`, sessionId, number, name: `Session ${number}`, createdAt: number, story,
  record: events === null ? null : { v: 1, sessionId, events: Object.fromEntries(events.map(e => [e.id, e])) },
});
const read = (pages) => readRecord({ session: 'campaign' }, {
  pages, currentSessionId: pages.at(-1).sessionId,
  nameOf: (id) => ({ 'pc-mira': 'Mira Kestrel' })[id] ?? null, otherNames: ['Mira Kestrel'],
});
const LINE = "Tamsin, I'll give you a fair cut of my salvage leads and first pick of whatever I haul.";
const PROSE = '“First pick, and a fair cut,” Tamsin says, and spits on her palm.';

/** A session's beat: a line, a Compel, its momentum, its telling, a truth it set. */
function deal(s, extra = []) {
  return [
    ev('line', { s, who: { actor: 'pc-mira' }, d: { via: 'typed' }, text: LINE }),
    ev('move.resolved', { s, who: { actor: 'pc-mira' }, ref: { res: `r-${s}` }, d: { moveId: 'compel', moveName: 'Compel', statUsed: 'heart', outcome: 'strong_hit' } }),
    ev('sheet.changed', { s, ref: { res: `r-${s}` }, d: { actorId: 'pc-mira', what: 'momentum', from: 2, to: 3, cause: { kind: 'move' } } }),
    ev('narration', { s, ref: { nar: `n-${s}`, res: `r-${s}` }, d: { mode: 'move' }, text: PROSE }),
    ev('truth.set', { s, ref: { truth: `t-${s}`, nar: `n-${s}` }, d: { subject: { kind: 'text', text: 'the dark beacon\'s haulers' }, fact: 'carry water and medical stores', by: 'narrator', basis: 'dice' } }),
    ...extra,
  ];
}

describe('the recap is given the record\'s facts, never the narration (D4)', () => {
  it('the latest session in full: the player\'s own words, the move and its outcome, what changed, what stands — each line an id', () => {
    const source = recapSource({ read: read([page('sess-3', 3, deal('sess-3'))]) });
    expect(source.text).toContain(`the player wrote “${LINE}”`);
    expect(source.text).toMatch(/\[s3-1\] Mira Kestrel — .*Compel \(\+heart\), strong hit — Momentum 2 → 3 — established \(the dice\): the dark beacon's haulers — carry water and medical stores/);
    expect(source.text).not.toContain('spits on her palm');
    expect(source.ids).toEqual(['s3-1']);
  });

  it('an earlier session gives its turning points only; a lasting beat is marked and listed', () => {
    const chatter = [
      ev('line', { s: 'sess-2', who: { actor: 'pc-mira' }, d: { via: 'typed' }, text: 'I check the hold.' }),
      ev('narration', { s: 'sess-2', who: { actor: 'pc-mira' }, ref: { nar: 'n-hold' }, d: { mode: 'paced', actorId: 'pc-mira' }, text: 'The hold is quiet.' }),
    ];
    const vow = [ev('move.resolved', { s: 'sess-2', who: { actor: 'pc-mira' }, ref: { res: 'r-v' }, d: { moveId: 'swear_an_iron_vow', moveName: 'Swear an Iron Vow', statUsed: 'heart', outcome: 'weak_hit' } })];
    const source = recapSource({ read: read([page('sess-2', 2, [...chatter, ...vow]), page('sess-3', 3, deal('sess-3'))]) });
    expect(source.text).toMatch(/### Session 2 — its turning points\n\n\[s2-2\] Mira Kestrel — Swear an Iron Vow \(\+heart\), weak hit — LASTING: a vow sworn/);
    expect(source.text).not.toContain('I check the hold');
    expect(source.lasting).toEqual(['s2-2']);
  });

  it('what the X-Card removed is not in it, and nothing says a beat was removed; the move and its change stay', () => {
    const removed = deal('sess-3', [ev('narration.removed', { d: { narrationIds: ['n-sess-3'], by: 'xcard' } })]);
    const source = recapSource({ read: read([page('sess-3', 3, removed)]) });
    expect(source.text).not.toMatch(/whatever I haul|medical stores|removed/);
    expect(source.text).toMatch(/Compel \(\+heart\), strong hit — Momentum 2 → 3/);
  });

  it('WHERE THINGS STAND, the players\' own notes and the sessions from before the record each have their ids and their heading', () => {
    const source = recapSource({
      read: read([page('sess-1', 1, null, 'The crew reached Bleakhold.'), page('sess-3', 3, deal('sess-3'))]),
      standing: ['Mira Kestrel — health 5, spirit 4, supply 3, momentum 3.'],
      notes: [{ who: "Mira Kestrel's Chronicle", text: 'I owe Tamsin.', pinned: true }],
      earlier: [{ label: 'Session 1, its Session Log story', text: 'The crew reached Bleakhold.' }],
    });
    expect(source.text).toMatch(/## WHERE THINGS STAND[^\n]*\n\n\[now-1\] Mira Kestrel — health 5/);
    expect(source.text).toMatch(/## THE PLAYERS' OWN NOTES[^\n]*\n\n\[note-1\] Mira Kestrel's Chronicle: “I owe Tamsin\.”/);
    expect(source.text).toMatch(/## EARLIER SESSIONS, FROM THE CHRONICLE AND THE SESSION LOG \(written before the record; they may hold a name since changed\)\n\n\[old-1\] Session 1, its Session Log story: “The crew reached Bleakhold\.”/);
    expect(source.ids).toEqual(['s3-1', 'now-1', 'note-1', 'old-1']);
    expect(source.earlierTexts).toEqual(['The crew reached Bleakhold.']);
  });

  it('the hash moves with a correction of the record', () => {
    const a = recapSource({ read: read([page('sess-3', 3, deal('sess-3'))]) });
    const b = recapSource({ read: read([page('sess-3', 3, deal('sess-3', [ev('truth.struck', { ref: { truth: 't-sess-3' }, d: { by: 'gm' } })]))]) });
    expect(b.hash).not.toBe(a.hash);
    expect(b.text).toMatch(/STRUCK BY THE TABLE — these did not happen:\n- the dark beacon's haulers — carry water and medical stores/);
  });
});

describe('the reply is cited sentences (D11)', () => {
  const source = { ids: ['s3-1', 'now-1'], lasting: ['s3-1'] };

  it('keeps each sentence with the ids it was sent; drops one that cites nothing, or only ids it was not sent', () => {
    const reply = '```json\n' + JSON.stringify({ paragraphs: [[
      { text: 'You offered Tamsin first pick of whatever you haul.', because: ['s3-1'] },
      { text: 'What you found there was the point of it all.', because: [] },
      { text: 'The compass still swings toward the dark lane.', because: ['s9-9'] },
    ], [{ text: 'Your momentum stands at 3.', because: ['now-1', 'bogus'] }]] }) + '\n```';
    const cited = citedRecap(reply, source);
    expect(cited).toMatchObject({ ok: true, dropped: 2, missing: [] });
    expect(cited.paragraphs).toEqual([
      [{ text: 'You offered Tamsin first pick of whatever you haul.', because: ['s3-1'] }],
      [{ text: 'Your momentum stands at 3.', because: ['now-1'] }],
    ]);
  });

  it('names the lasting beats no kept sentence cites; a reply that is not the JSON is not ok', () => {
    expect(citedRecap(JSON.stringify({ paragraphs: [[{ text: 'Your momentum stands at 3.', because: ['now-1'] }]] }), source).missing).toEqual(['s3-1']);
    expect(citedRecap('Once upon a time…', source)).toMatchObject({ ok: false, paragraphs: [] });
  });

  it('the text kept has every changed name written as the new one', () => {
    const text = recapText([[{ text: 'You docked beside the Wake\'s registry.' }], [{ text: 'The Ashen Wake waits.' }]],
      { names: [{ from: 'Ashen Wake', to: 'Cinder Wren', kind: 'corrected' }], otherNames: [] });
    expect(text).toBe('You docked beside the Cinder Wren\'s registry.\n\nThe Cinder Wren waits.');
  });
});

describe('a beat with nothing to state is no line', () => {
  it('a telling alone, a cutaway, a question\'s answer', () => {
    expect(beatFacts({ kind: 'play', who: { name: 'Mira' }, line: null, move: null, changes: [], did: [], established: [], told: { text: 'x' } })).toBe('');
    expect(beatFacts({ kind: 'cutaway', who: {}, line: null, move: null, changes: [], did: [], established: [] })).toBe('');
  });
});
