/**
 * STARFORGED COMPANION
 * tests/unit/exploreSessionRecord.test.js — the AI playtest runner meets the session record (issue #382, slices 1–4)
 *
 * The Session Log page is rendered from the record now — what happened (each
 * beat with its player's own words, a question put to the narrator as one),
 * what stands, what the table corrected (a struck fact struck through), the
 * story — and the campaign recap is written from it: its user message carries
 * THE RECORD, and its reply is JSON sentences, each citing the ids of the
 * lines it rests on. What the runner does about it:
 *   - the rehearsal's stand-in answers the recap with the cited JSON (a reply
 *     that is not that JSON leaves the recap empty), citing for each fact the
 *     lines that hold it and telling every LASTING beat;
 *   - the ledger reads a record page's refusals from the page's own words, not
 *     from the player's lines and questions it quotes, nor a fact it shows
 *     struck — a quoted "Do you still have the manifest, Tamsin?" is no
 *     refusal of the manifest left with Tamsin;
 *   - the recap beat wants a recap with something in it: the module posts an
 *     empty card ("No campaign history available yet") when the recap came
 *     back empty.
 * Since the session summary is a view of the record too (slice 3) — its source
 * the session's numbered beats, its reply a cited JSON list, kept on the
 * session's page (`sessionRecord.views.summary`) — and End a Session writes no
 * story of its own:
 *   - both stand-ins answer the summary with the cited list (a prose reply is
 *     asked for once more, then dropped), telling no fact when forgetful;
 *   - the playthroughs' `sessionLog` check reads the record's summary view,
 *     under the page's "Session summary" heading;
 *   - the ledger takes the summary's STRUCK BY THE TABLE for the module's mark
 *     of a corrected value;
 *   - the review prints each recap sentence beside the lines it cites (the
 *     cache's `cites` against the recap's recorded request; a cited id that is
 *     no line fails), and how large each session's record grows.
 * Each is held to the module's own builders (recapView.js, summaryView.js,
 * sessionLogView.js, narratorPrompt.js), not to a copy of their text.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { citedRecapReply, citedSummaryReply, createRehearsal } from '../../test/ci/playwright/lib/rehearsal.mjs';
import { sessionLogOwnText, sessionLogSummaryProblem } from '../../test/ci/playwright/lib/table.mjs';
import { markedCorrected, refusalsIn, scoreLedger } from '../../test/ci/playwright/lib/ledger.mjs';
import { createPointer } from '../../test/ci/playwright/lib/beats.mjs';
import { recapCitesOf, recordSizesOf, scorecard } from '../../test/ci/playwright/lib/review.mjs';
import { recapSource, citedRecap, recapText } from '../../src/record/recapView.js';
import { SESSION_SUMMARY_SYSTEM_PROMPT, sessionSummaryUserMessage, summarySource } from '../../src/record/summaryView.js';
import { readRecord } from '../../src/record/read.js';
import { renderSessionLogBody } from '../../src/record/sessionLogView.js';
import { buildCampaignRecapUserMessage, buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';

// ── the record, in small (as tests/unit/recapView.test.js makes it) ─────────

let n = 0;
const ev = (k, { s, who = {}, ref = {}, d = {}, text } = {}) => {
  n += 1;
  return { id: `e${n}`, k, at: n * 1000, seq: n, s, scene: 'sc-1',
    who: { user: who.user ?? null, actor: who.actor ?? null }, ref, d, ...(text !== undefined ? { text } : {}) };
};
const page = (sessionId, number, events, story = '') => ({
  pageId: `p-${sessionId}`, sessionId, number, name: `Session ${number}`, createdAt: number, story,
  record: { v: 1, sessionId, events: Object.fromEntries(events.map(e => [e.id, e])) },
});
const readOf = (pages, session = 'campaign') => readRecord({ session }, {
  pages, currentSessionId: pages.at(-1).sessionId,
  nameOf: (id) => ({ 'pc-mira': 'Mira Kestrel' })[id] ?? null, otherNames: ['Mira Kestrel'],
});
const mira = { actor: 'pc-mira' };

const COMPASS_LINE = 'I turn my sister Ilse\'s brass star-compass over in my palm.';
const sessionOne = () => [
  ev('move.resolved', { s: 'sess-1', who: mira, ref: { res: 'r-v' }, d: { moveId: 'swear_an_iron_vow', moveName: 'Swear an Iron Vow', statUsed: 'heart', outcome: 'strong_hit' } }),
  ev('line', { s: 'sess-1', who: mira, d: { via: 'typed' }, text: 'I check the hold.' }),
  ev('narration', { s: 'sess-1', who: mira, ref: { nar: 'n-hold' }, d: { mode: 'paced', actorId: 'pc-mira' }, text: 'The hold is quiet.' }),
];
const sessionTwo = () => [
  ev('line', { s: 'sess-2', who: mira, d: { via: 'typed' }, text: COMPASS_LINE }),
  ev('narration', { s: 'sess-2', who: mira, ref: { nar: 'n-c' }, d: { mode: 'paced', actorId: 'pc-mira' }, text: 'Its needle settles.' }),
];

// The long haul's facts, from its charter.
const CHARTER = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../test/ci/playwright/charters/long-haul.json'), 'utf8'));
const factOf = (id) => CHARTER.facts.find(f => f.id === id);
const COMPASS = factOf('F1');
const MANIFEST = factOf('F3');
const BERTH = factOf('F5');

/** The recap's request as the module builds it: its system prompt in the recap's mode, its user message from the source. */
function recapRequest(source) {
  const system = buildNarratorSystemPrompt({}, {}, null, '', { mode: 'campaign_recap' });
  return { system, messages: [{ role: 'user', content: buildCampaignRecapUserMessage(source) }] };
}
const replyText = (reply) => reply.content.map(c => c.text ?? '').join('');

const ROLLING = {
  seed: { pc: { name: 'Mira Kestrel' } }, cast: {}, facts: [COMPASS, MANIFEST],
  beats: [{ id: 'b1', n: 1, title: 'Begin a Session', check: { type: 'sessionBegun' } }], rehearsal: [],
};

describe('the stand-in answers the recap the module asks for now: cited JSON', () => {
  const source = recapSource({
    read: readOf([page('sess-1', 1, sessionOne()), page('sess-2', 2, sessionTwo())]),
    standing: ['Mira Kestrel — health 5, spirit 5, supply 5, momentum 2.'],
  });

  it('control: the source has a fact\'s line and a LASTING beat, and the request is the recap\'s', () => {
    expect(source.text).toContain(`the player wrote “${COMPASS_LINE}”`);
    expect(source.lasting).toEqual(['s1-1']);
    expect(recapRequest(source).system).toContain('## THIS SUMMARY');
  });

  it('remembering: each fact a line holds is told, citing that line; every LASTING beat is told — nothing for the module to send back', () => {
    const reply = replyText(createRehearsal({ charter: ROLLING }).reply(recapRequest(source)));
    const cited = citedRecap(reply, source);
    expect(cited).toMatchObject({ ok: true, dropped: 0, missing: [] });
    const told = recapText(cited.paragraphs, source);
    expect(told).toContain(COMPASS.statement);
    expect(told, 'no line holds the manifest: nothing to cite, so not said').not.toContain('manifest');
    expect(cited.paragraphs.flat().find(s => s.text === COMPASS.statement).because).toEqual(['s2-1']);
    expect(told).toContain('That stood: a vow sworn.');
  });

  it('forgetful: no fact, the LASTING beats still told — a recap with something in it and nothing of the facts', () => {
    const reply = replyText(createRehearsal({ charter: ROLLING, forget: true }).reply(recapRequest(source)));
    const cited = citedRecap(reply, source);
    expect(cited).toMatchObject({ ok: true, missing: [] });
    expect(cited.paragraphs.length).toBeGreaterThan(0);
    expect(recapText(cited.paragraphs, source)).not.toMatch(/compass/i);
  });

  it('a charter without beats (the memory charter) answers it the same way', () => {
    const memory = { seed: { pc: { name: 'Mira Kestrel' } }, facts: [{ ...COMPASS, required: true }], rehearsal: [] };
    const cited = citedRecap(replyText(createRehearsal({ charter: memory }).reply(recapRequest(source))), source);
    expect(cited).toMatchObject({ ok: true, missing: [] });
    expect(recapText(cited.paragraphs, source)).toContain(COMPASS.statement);
  });

  it('cites only ids the source sent, and with no line to cite says nothing', () => {
    const holds = (t, f) => f.variants.some(v => t.includes(v));
    expect(JSON.parse(citedRecapReply('no lines here', { facts: [COMPASS], holds }))).toEqual({ paragraphs: [] });
    const reply = JSON.parse(citedRecapReply(buildCampaignRecapUserMessage(source), { facts: [COMPASS], holds }));
    expect(reply.paragraphs.flat().flatMap(s => s.because).every(id => source.ids.includes(id))).toBe(true);
  });
});

describe('a Session Log page from the record: its refusals are read from its own words', () => {
  const events = [
    ev('line', { s: 'sess-3', who: mira, d: { via: 'typed' }, text: 'Do you still have the manifest, Tamsin?' }),
    ev('move.resolved', { s: 'sess-3', who: mira, ref: { res: 'r-c' }, d: { moveId: 'compel', moveName: 'Compel', statUsed: 'heart', outcome: 'weak_hit' } }),
    ev('narration', { s: 'sess-3', ref: { nar: 'n-m', res: 'r-c' }, d: { mode: 'move' }, text: 'She pats the ledger.' }),
    ev('question', { s: 'sess-3', who: mira, text: 'Is the Kobayashi IV still docked at Hollow Spire?' }),
    ev('truth.set', { s: 'sess-3', ref: { truth: 't-x', nar: 'n-m' }, d: { subject: { kind: 'text', text: 'the compass' }, fact: 'was sold at Hollow Spire', by: 'narrator' } }),
    ev('truth.struck', { s: 'sess-3', ref: { truth: 't-x' }, d: { by: 'gm' } }),
    ev('truth.set', { s: 'sess-3', ref: { truth: 't-y', nar: 'n-m' }, d: { subject: { kind: 'text', text: 'Tamsin' }, fact: 'keeps a ledger', by: 'narrator' } }),
  ];
  const story = 'Mira kept her sister\'s compass close, and Tamsin kept the manifest.';
  const session = readOf([page('sess-3', 3, events)], 'sess-3').sessions[0];
  const html = renderSessionLogBody(session, { story });
  const whole = `${html.replace(/<[^>]+>/g, ' ')} ${story}`.replace(/\s+/g, ' ').trim();
  const own = sessionLogOwnText(html, story);

  it('control: the page quotes the player\'s line and question and shows the strike — and the whole page refuses two facts', () => {
    expect(html).toContain('“Do you still have the manifest, Tamsin?”');
    expect(html).toContain('<em>Asked of the narrator:</em> “Is the Kobayashi IV still docked at Hollow Spire?”');
    expect(html).toMatch(/Struck: the compass — <s>was sold at Hollow Spire<\/s>/);
    expect(refusalsIn(whole, MANIFEST)).toHaveLength(1);
    expect(refusalsIn(whole, BERTH)).toHaveLength(1);
  });

  it('its own words keep who acted, the move, what stands and the story — without the quotes or the struck fact', () => {
    expect(own).toContain('Mira Kestrel');
    expect(own).toContain('Compel');
    expect(own).toContain('keeps a ledger');
    expect(own).toContain(story);
    expect(own).not.toMatch(/still have|still docked|was sold/);
    for (const fact of [MANIFEST, BERTH, COMPASS]) expect(refusalsIn(own, fact), fact.id).toEqual([]);
  });

  it('a page from before the record has no own words: it is read whole, as before', () => {
    expect(sessionLogOwnText('<h2>Session 1</h2><h3>Scene log</h3><ul><li><strong>Lore:</strong> x</li></ul><h3>Session summary</h3>', 'y')).toBeNull();
  });

  it('the ledger: no refusal of the manifest from the page\'s quote — and, read whole (a page with no own words), the refusal is there', () => {
    const messages = [
      { id: 'm1', step: 'a1', phase: 'session-1', text: 'I leave the cargo manifest with Tamsin for safekeeping.', fromPlayer: true, narrator: false },
      { id: 'm2', step: 'a2', phase: 'session-3', text: 'Do you still have the manifest, Tamsin?', fromPlayer: true, narrator: false },
    ];
    const marksWith = (sessionLog) => [
      { step: '(setup)', phase: 'before', stores: {}, helpers: {} },
      { step: 'a1', phase: 'session-1', stores: {}, helpers: {} },
      { step: 'a2', phase: 'session-3', stores: {}, helpers: { sessionLog } },
    ];
    const scored = (sessionLog) => scoreLedger({ facts: [MANIFEST], marks: marksWith(sessionLog), messages, requests: [] }).facts[0];
    const fromPage = scored([{ name: 'Session 3', text: whole, own }]);
    expect(fromPage.refusals.filter(r => /^sessionLog/.test(r.where))).toEqual([]);
    expect(fromPage.helpers[0]).toMatchObject({ kind: 'sessionLog', holds: true });
    const legacy = scored([{ name: 'Session 3', text: whole }]);
    expect(legacy.refusals.filter(r => /^sessionLog/.test(r.where))).toHaveLength(1);
  });
});

describe('the recap beat wants a recap with something in it', () => {
  const beat = { id: 'b', n: 1, session: 1, title: 'Recap', check: { type: 'probesAsked', set: 'Z', recap: true } };
  const table = { session: { active: true, id: 's1' }, pcs: [], connections: [], tracks: [], scene: { truths: [] }, helpers: {}, plans: [] };
  const walk = (cards) => {
    const marks = [{ step: 'a1', phase: 'session-1', table, cards: [] }, { step: 'a2', phase: 'session-1', table, cards }];
    const pointer = createPointer([beat]);
    const charter = { cast: {}, facts: [], baits: [], seed: { pc: { name: 'Mira Kestrel' } } };
    pointer.advance({ marks: marks.slice(0, 1), messages: [], actions: [], charter }, 'a1');
    pointer.advance({ marks, messages: [], actions: [], charter }, 'a2');
    return pointer.state[0];
  };

  it('an empty recap card ("No campaign history available yet") is not the recap — and says so', () => {
    expect(walk([{ id: 'r1', recap: { recapType: 'campaign', recapEmpty: true } }]))
      .toMatchObject({ status: 'current', detail: expect.stringContaining('the recap card came up empty') });
  });

  it('a recap with text in it is', () => {
    expect(walk([{ id: 'r1', recap: { recapType: 'campaign' } }])).toMatchObject({ status: 'done', detail: expect.stringContaining('the recap was posted') });
  });

  it('none at all: no recap card yet', () => {
    expect(walk([])).toMatchObject({ status: 'current', detail: expect.stringContaining('no recap card yet') });
  });
});

// ── slice 3: the session summary, a view of the record ──────────────────────

describe('the stand-in answers the session summary the module asks for now: a cited JSON list', () => {
  const QUESTION = "Didn't I leave the compass with Tamsin?";
  const events = [
    ev('move.resolved', { s: 'sess-5', who: mira, ref: { res: 'r-v5' }, d: { moveId: 'swear_an_iron_vow', moveName: 'Swear an Iron Vow', statUsed: 'heart', outcome: 'strong_hit' } }),
    ev('line', { s: 'sess-5', who: mira, d: { via: 'typed' }, text: COMPASS_LINE }),
    ev('narration', { s: 'sess-5', who: mira, ref: { nar: 'n-c5' }, d: { mode: 'paced', actorId: 'pc-mira' }, text: 'Its needle settles.' }),
    ev('question', { s: 'sess-5', who: mira, text: QUESTION }),
  ];
  const source = summarySource(readOf([page('sess-5', 5, events)], 'sess-5').sessions[0]);
  const request = { system: SESSION_SUMMARY_SYSTEM_PROMPT, messages: [{ role: 'user', content: sessionSummaryUserMessage(source) }] };
  const lineBeat = source.text.match(/^\[(\d+)\] .*star-compass/m)?.[1];
  const questionBeat = source.text.match(/^\[(\d+)\] .*asked the narrator/m)?.[1];

  it('control: the source holds the compass line, a LASTING beat and a question beat, and the prompt is the summary\'s', () => {
    expect(lineBeat).toBeTruthy();
    expect(questionBeat).toBeTruthy();
    expect(source.lasting.length).toBe(1);
    expect(request.system).toContain('continuity scribe');
    expect(source.text).toContain(`asked the narrator “${QUESTION}”`);
  });

  it('remembering: the fact is told citing the beat whose facts hold it — never the question; every LASTING beat is told', () => {
    const cited = citedRecap(replyText(createRehearsal({ charter: ROLLING }).reply(request)), source);
    expect(cited).toMatchObject({ ok: true, dropped: 0, missing: [] });
    const said = cited.paragraphs.flat();
    expect(said.find(x => x.text === COMPASS.statement)?.because).toEqual([lineBeat]);
    expect(said.some(x => x.because.includes(questionBeat)), 'a question is not an event').toBe(false);
    expect(said[0].text).toBe('Mira Kestrel went about the day\'s business.');
  });

  it('forgetful: a summary is there, and it holds no fact — what the review sees', () => {
    const cited = citedRecap(replyText(createRehearsal({ charter: ROLLING, forget: true }).reply(request)), source);
    expect(cited).toMatchObject({ ok: true, missing: [] });
    const told = recapText(cited.paragraphs, source);
    expect(told).toContain('went about the day\'s business');
    expect(told).not.toMatch(/compass/i);
  });

  it('a charter without beats answers it the same way; with no beat to tell, an empty list', () => {
    const memory = { seed: { pc: { name: 'Mira Kestrel' } }, facts: [{ ...COMPASS, required: true }], rehearsal: [] };
    const cited = citedRecap(replyText(createRehearsal({ charter: memory }).reply(request)), source);
    expect(cited).toMatchObject({ ok: true, missing: [] });
    expect(recapText(cited.paragraphs, source)).toContain(COMPASS.statement);
    expect(citedSummaryReply('## QUESTIONS\n\n[1] Mira asked', { facts: [COMPASS], holds: () => true })).toBe('[]');
  });

  it('the summary\'s STRUCK BY THE TABLE marks a corrected value as the module\'s own work (the ledger\'s corrected-value check)', () => {
    const struck = [
      ev('truth.set', { s: 'sess-6', ref: { truth: 't-z', nar: 'n-z' }, d: { subject: { kind: 'text', text: 'the cutter' }, fact: 'flies the Ashen Wake colours', by: 'narrator' } }),
      ev('truth.struck', { s: 'sess-6', ref: { truth: 't-z' }, d: { by: 'gm' } }),
      ev('line', { s: 'sess-6', who: mira, d: { via: 'typed' }, text: 'I hail the cutter.' }),
    ];
    const text = sessionSummaryUserMessage(summarySource(readOf([page('sess-6', 6, struck)], 'sess-6').sessions[0]));
    expect(text).toMatch(/## STRUCK BY THE TABLE — did not happen\n\n- the cutter — flies the Ashen Wake colours/);
    expect(markedCorrected(`${SESSION_SUMMARY_SYSTEM_PROMPT}\n${text}`, 'Ashen Wake')).toBe(true);
  });
});

describe('the playthroughs\' sessionLog check reads the record\'s summary view', () => {
  const session = readOf([page('sess-7', 7, sessionTwo().map(e => ({ ...e, s: 'sess-7' })))], 'sess-7').sessions[0];
  const story = 'Mira Kestrel turned her sister\'s compass over in her palm, and its needle settled.';

  it('passes with the view\'s text shown under the page\'s "Session summary" heading', () => {
    expect(sessionLogSummaryProblem({ content: renderSessionLogBody(session, { story }), summary: story }, 7)).toBeNull();
  });

  it('fails with no page, an empty view, no heading, or a page showing another story', () => {
    expect(sessionLogSummaryProblem(null, 7)).toBe('no Session Log page for session 7');
    expect(sessionLogSummaryProblem({ content: renderSessionLogBody(session, { story }), summary: '' }, 7)).toMatch(/has no summary — its record's summary view is empty/);
    expect(sessionLogSummaryProblem({ content: renderSessionLogBody(session, { story: '' }), summary: story }, 7)).toMatch(/doesn't render its summary/);
    expect(sessionLogSummaryProblem({ content: renderSessionLogBody(session, { story: 'Something else happened entirely.' }), summary: story }, 7))
      .toMatch(/doesn't show its summary under its "Session summary" heading/);
  });
});

// ── the review: the recap, sentence by sentence; the size of the record ─────

describe('the review prints each recap sentence beside the lines it cites (RECAP-CITES-UNREAD)', () => {
  const source = recapSource({
    read: readOf([page('sess-1', 1, sessionOne()), page('sess-2', 2, sessionTwo())]),
    standing: ['Mira Kestrel — health 5, spirit 5, supply 5, momentum 2.'],
  });
  const system = buildNarratorSystemPrompt({}, {}, null, '', { mode: 'campaign_recap' });
  const request = { step: 'a40', kind: 'callNarratorAPI>ask', system, user: buildCampaignRecapUserMessage(source) };
  // The cache as narrator.js getCampaignRecap stores it, from the module's own parse of a reply.
  const cacheOf = (reply) => {
    const cited = citedRecap(reply, source);
    return { text: recapText(cited.paragraphs, source), cites: cited.paragraphs.map(p => p.map(x => x.because)), madeAt: '2026-11-24T18:00:00.000Z' };
  };
  const reply = JSON.stringify({ paragraphs: [
    [{ text: 'You swore a vow and meant it.', because: ['s1-1'] }, { text: 'Your sister\'s compass turned in your palm.', because: ['s2-1'] }],
    [{ text: 'You stand at full health.', because: ['now-1'] }],
  ] });
  const markWith = (step, recapCache) => ({ step, phase: 'session-2', table: { session: { active: true }, helpers: { recapCache } } });

  it('each sentence, its ids, and the text of each line it cites', () => {
    const r = recapCitesOf({ marks: [markWith('a39', null), markWith('a40', cacheOf(reply)), markWith('a41', cacheOf(reply))], requests: [request] });
    expect(r.totals).toMatchObject({ recaps: 1, sentences: 3, cites: 3, unknown: 0, unpaired: 0, readWhole: 0 });
    expect(r.recaps[0]).toMatchObject({ step: 'a40', sourceStep: 'a40' });
    expect(r.recaps[0].sentences.map(x => [x.paragraph, x.text, x.ids])).toEqual([
      [1, 'You swore a vow and meant it.', ['s1-1']],
      [1, 'Your sister\'s compass turned in your palm.', ['s2-1']],
      [2, 'You stand at full health.', ['now-1']],
    ]);
    expect(r.recaps[0].sentences[1].cites[0].line).toContain(`the player wrote “${COMPASS_LINE}”`);
    expect(r.recaps[0].sentences[2].cites[0].line).toBe('Mira Kestrel — health 5, spirit 5, supply 5, momentum 2.');
  });

  it('a cited id that is no line of the source fails — on the scorecard\'s row and in its section', () => {
    const cache = { ...cacheOf(reply), cites: [[['s1-1'], ['s9-9']], [['now-1']]] };
    const recapCites = recapCitesOf({ marks: [markWith('a40', cache)], requests: [request] });
    expect(recapCites.recaps[0].unknown).toEqual(['s9-9']);
    const card = scorecard({ charter: { name: 'long-haul' }, run: { id: 'r', mode: 'rehearsal' }, recapCites, recordSizes: { ends: [], last: null } });
    expect(card).toMatch(/\| Recap — what it rests on \| 1 recap\(s\), 3 sentence\(s\), 3 citation\(s\): \*\*1 cited id\(s\) no line of the recap's source — fails\*\*/);
    expect(card).toContain('## The recap, sentence by sentence — what each rests on');
    expect(card).toContain('[s9-9] — NO SUCH LINE');
  });

  it('a recap with no recorded request before it is not read against one; a paragraph that will not split is read whole', () => {
    const early = recapCitesOf({ marks: [markWith('a38', cacheOf(reply)), markWith('a40', null)], requests: [request] });
    expect(early.totals).toMatchObject({ recaps: 1, unpaired: 1, unknown: 0 });
    const odd = { ...cacheOf(reply), text: 'You swore a vow, and the compass turned\n\nYou stand at full health.' };
    const whole = recapCitesOf({ marks: [markWith('a40', odd)], requests: [request] });
    expect(whole.totals.readWhole).toBe(1);
    expect(whole.recaps[0].sentences[0]).toMatchObject({ whole: true, ids: ['s1-1', 's2-1'] });
  });
});

describe('the review measures each session\'s record after each End a Session (RECORD-SIZES-UNMEASURED)', () => {
  const tableAt = (active, number, records) => ({ session: { active, number }, records });
  const marks = [
    { step: 'a13', table: tableAt(true, 1, [{ name: 'Session 1 — 2026-11-24', chars: 9000 }]) },
    { step: 'a14', table: tableAt(false, 1, [{ name: 'Session 1 — 2026-11-24', chars: 12345 }]) },
    { step: 'a15', table: tableAt(true, 2, [{ name: 'Session 1 — 2026-11-24', chars: 12345 }, { name: 'Session 2 — 2026-11-24', chars: 800 }]) },
    { step: '(after)', table: tableAt(true, 2, [{ name: 'Session 1 — 2026-11-24', chars: 12345 }, { name: 'Session 2 — 2026-11-24', chars: 40210 }]) },
  ];

  it('the sizes at the step each session closed, and at the end', () => {
    expect(recordSizesOf({ marks })).toEqual({
      ends: [{ step: 'a14', session: 1, pages: [{ name: 'Session 1', chars: 12345 }] }],
      last: { step: '(after)', pages: [{ name: 'Session 1', chars: 12345 }, { name: 'Session 2', chars: 40210 }] },
    });
  });

  it('a scorecard row and a section', () => {
    const card = scorecard({ charter: { name: 'long-haul' }, run: { id: 'r', mode: 'rehearsal' }, recordSizes: recordSizesOf({ marks }) });
    expect(card).toContain('| Record sizes | after End 1 (a14): Session 1 12.3k; the largest 40.2k characters |');
    expect(card).toContain('| at the end ((after)) | Session 2 | 40210 |');
  });
});
