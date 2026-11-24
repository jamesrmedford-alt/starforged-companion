/**
 * STARFORGED COMPANION
 * src/record/summaryView.js — the session summary, a view of the session record (issue #382, slice 3)
 *
 * The summary was written from the session's narrator cards — the prose, a
 * leave-out list of struck facts and a names note beside it — and kept in
 * campaignState (`sessionSummary`; LAST SESSION was a copy a mint made,
 * `previousSessionSummary`, with a mark for one owed, `unsummarisedSession`).
 * Each correction needed its own drop, mark, check or catch-up to reach it.
 * Its source is the record now, read with the table's corrections:
 *
 *   ## THE SESSION        numbered beats, oldest first: the facts of each — who
 *                         acted and the words their player typed, the move and
 *                         its outcome, what changed on a sheet, what play did,
 *                         what was established and stands — and under it,
 *                         TOLD AS, the narrator's prose (decision D4: the
 *                         summary is given the telling; the recap is not).
 *   ## QUESTIONS          what was asked of the narrator (nothing happened
 *                         because a question was asked).
 *   ## STRUCK BY THE TABLE — did not happen
 *   ## EARLIER THIS SESSION (written before the record) — for a session the
 *                         record opened in the middle of (a world upgraded
 *                         mid-session), the summary it had before.
 *
 * The view is kept on its session's page (`sessionRecord.views.summary`:
 * `{ text, cites, through, sourceHash, madeAt }`). It is **valid while the
 * same span reads the same**: the source built from the record through
 * `through` hashes to `sourceHash`. More play since leaves it valid and
 * behind (the debounce's case); a correction inside the span — an X-Card, a
 * strike, a changed name, an upgrade's supersede, all applied whenever they
 * are made (read.js) — makes it invalid: not shown, made again. One rule in
 * place of the per-store drops, marks, checks and catch-ups.
 *
 * LAST SESSION is the summary of the newest earlier session a table began,
 * with what was played in any session nobody began since given after it as
 * facts; a session from before the record is told by the story its page holds.
 *
 * Pure but for its default source (pages.js `recordSource`); no model call —
 * narrator.js getRollingSessionSummary makes the view, and is the one writer.
 */

import { readRecord, recordHash, recordStamp } from './read.js';
import { recordSource } from './pages.js';
import { beatFacts } from './recapView.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const quote = (s) => `“${clean(s)}”`;

/** The most of one beat's telling the source carries (characters). */
const TOLD_AS_MAX_CHARS = 1800;

/** What leads the facts of sessions nobody began, after LAST SESSION's own summary. */
const BETWEEN_SESSIONS_LEAD = 'Played between sessions, while no session was begun: ';

function subjectText(subject) {
  if (!subject || typeof subject !== 'object') return '';
  return clean(subject.text ?? subject.name ?? '');
}

function toldAs(beat) {
  const text = beat?.told && !beat.removed ? clean(beat.told.text) : '';
  if (!text) return '';
  return text.length > TOLD_AS_MAX_CHARS ? `${text.slice(0, TOLD_AS_MAX_CHARS).trimEnd()}…` : text;
}

/** A question beat as the summary is given it: who asked, the question, what its answer established. */
function questionFacts(beat) {
  const asked = clean(beat.line?.text);
  if (!asked) return '';
  const who = clean(beat.who?.name);
  const established = (beat.established ?? []).map(t => {
    const subject = subjectText(t.subject);
    return `established: ${subject ? `${subject} — ` : ''}${clean(t.fact)}`;
  });
  return [`${who ? `${who} asked` : 'Asked'} the narrator ${quote(asked)}`, ...established].join(' — ');
}

/**
 * The summary's source for one session's read. Pure.
 *
 * @param {Object|null} session — one of readRecord's sessions
 * @returns {{ text: string, ids: string[], lasting: string[], hash: string, empty: boolean, through: number }}
 *   `ids`: the beat numbers a sentence may cite; `empty`: no beat to tell
 */
export function summarySource(session) {
  if (!session || session.legacy) return { text: '', ids: [], lasting: [], hash: recordHash(''), empty: true, through: -1 };
  const told = [];
  const asked = [];
  const ids = [];
  const lasting = [];
  let n = 0;
  for (const beat of session.beats ?? []) {
    if (beat.kind === 'cutaway') continue;
    const facts = beat.kind === 'question' ? questionFacts(beat) : beatFacts(beat);
    if (!facts) continue;
    n += 1;
    const id = String(n);
    ids.push(id);
    if (beat.lasting) lasting.push(id);
    const telling = toldAs(beat);
    const entry = `[${id}] ${facts}${telling ? `\nTOLD AS: ${quote(telling)}` : ''}`;
    (beat.kind === 'question' ? asked : told).push(entry);
  }
  const struck = (session.corrections ?? []).filter(c => c.kind === 'strike')
    .map(c => `- ${subjectText(c.subject) ? `${subjectText(c.subject)} — ` : ''}${clean(c.fact)}${c.replacedBy ? ` (now: ${clean(c.replacedBy)})` : ''}`);
  const out = [];
  const earlier = session.resumed && clean(session.story) ? clean(session.story) : '';
  if (earlier) out.push(`## EARLIER THIS SESSION (written before the record)\n\n${earlier}`);
  if (told.length) out.push(`## THE SESSION (oldest first)\n\n${told.join('\n\n')}`);
  if (asked.length) out.push(`## QUESTIONS — asked of the narrator; nothing happened because one was asked\n\n${asked.join('\n\n')}`);
  if (struck.length) out.push(`## STRUCK BY THE TABLE — did not happen\n\n${struck.join('\n')}`);
  const text = out.join('\n\n');
  return { text, ids, lasting, hash: recordHash(text), empty: !ids.length && !earlier, through: session.through ?? -1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// The view as stored, and whether it stands
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A fingerprint of what a read depends on: each page — its id, its counter,
 * its events, its summary, its story — the names in play and the current
 * session. Two reads with one fingerprint read the same.
 */
function fingerprint(source) {
  const pages = (source?.pages ?? []).map(p => {
    const view = p.record?.views?.summary;
    return [p.pageId ?? '', p.sessionId, p.createdAt ?? '', recordStamp(p.record),
      view?.sourceHash ?? '', view?.through ?? '', view?.madeAt ?? '', p.story ?? '', p.number ?? ''].join(':');
  });
  return `${pages.join('|')}#${(source?.otherNames ?? []).join('\u0001')}#${source?.currentSessionId ?? ''}`;
}

let _memo = { key: null, campaign: null, states: new Map() };

function memoFor(source) {
  const key = fingerprint(source);
  if (_memo.key !== key) _memo = { key, campaign: null, states: new Map() };
  return _memo;
}

/** Test seam: forget what was read. */
export function _resetSummaryViewForTests() {
  _memo = { key: null, campaign: null, states: new Map() };
}

/** The whole campaign's read, once for a fingerprint. */
function campaignRead(source) {
  const memo = memoFor(source);
  if (!memo.campaign) memo.campaign = readRecord({ session: 'campaign' }, source);
  return memo.campaign;
}

/** The stored summary view of a session, as the source's page holds it, or null. */
function storedSummary(sessionId, source) {
  const page = (source?.pages ?? []).find(p => p.sessionId === sessionId);
  const view = page?.record?.views?.summary;
  return view && typeof view === 'object' ? view : null;
}

/**
 * Where a session's summary stands. Pure but for its default source.
 *
 * @param {string} sessionId
 * @param {Object} [source] — pages.js recordSource's shape
 * @returns {{ view: Object|null, valid: boolean, behind: boolean, newBeats: number, source: ReturnType<typeof summarySource>,
 *   session: Object|null, naming: { names: Array, otherNames: string[] } }}
 *   `valid`: the view may be shown; `behind`: the record holds more to tell than it does
 */
export function summaryState(sessionId, source = recordSource()) {
  const memo = memoFor(source);
  if (memo.states.has(sessionId)) return memo.states.get(sessionId);
  const read = readRecord({ session: sessionId }, source);
  const session = read.sessions[0] ?? null;
  const full = summarySource(session);
  const view = storedSummary(sessionId, source);
  // The names a model's text is corrected by (recapView.js recapText).
  const naming = { names: read.names ?? [], otherNames: read.otherNames ?? [] };
  let state;
  if (!view || !Number.isFinite(view.through)) {
    state = { view, valid: false, behind: !full.empty, newBeats: full.ids.length, source: full, session, naming };
  } else {
    const span = summarySource(readRecord({ session: sessionId, through: view.through }, source).sessions[0] ?? null);
    const valid = typeof view.text === 'string' && view.text.trim() !== '' && span.hash === view.sourceHash;
    state = { view, valid, behind: full.hash !== span.hash, newBeats: Math.max(0, full.ids.length - span.ids.length), source: full, session, naming };
  }
  memo.states.set(sessionId, state);
  return state;
}

/**
 * The source a reply is checked against once it is back: the session read
 * through `through`, as the view will be checked when it is shown.
 *
 * @param {string} sessionId
 * @param {number} through
 * @param {Object} [source]
 */
export function summarySourceThrough(sessionId, through, source = recordSource()) {
  return summarySource(readRecord({ session: sessionId, through }, source).sessions[0] ?? null);
}

/**
 * A session's story as every reader is given it: its valid summary view; with
 * no view ever made — a session played before this slice — the story its page
 * holds; a session from before the record, its page's story. '' for a stale
 * view (it is made again), or none.
 *
 * @param {Object} session — one of readRecord's sessions
 * @param {Object} [source]
 * @returns {string}
 */
export function sessionStoryOf(session, source = recordSource()) {
  if (!session) return '';
  if (session.legacy) return clean(session.story) ? String(session.story).trim() : '';
  const state = summaryState(session.sessionId, source);
  if (state.valid) return state.view.text.trim();
  return state.view ? '' : (typeof session.story === 'string' ? session.story.trim() : '');
}

/**
 * The session summary's text for one session (STORY SO FAR for the current
 * one, the Session Log page's "Session summary"), or ''.
 *
 * @param {string} sessionId
 * @param {Object} [source]
 * @returns {string}
 */
export function sessionSummaryText(sessionId, source = recordSource()) {
  if (typeof sessionId !== 'string' || !sessionId) return '';
  return sessionStoryOf(summaryState(sessionId, source).session, source);
}

/**
 * Whether a table began the session: its record opened with `session.begun`;
 * or its page holds a story — End a Session wrote it before the summary was a
 * view, or the world load copied LAST SESSION there — which only a begun
 * session has. A page from before the record with no story has nothing to
 * tell, and is passed over.
 */
const begunOf = (s) => (s.legacy ? !!clean(s.story) : !!s.begun || !!clean(s.story));

/**
 * The earlier sessions a table began, newest first, each with its story —
 * the newest one's (LAST SESSION) followed by the facts of what was played in
 * any session nobody began since — at most `limit` of them (the world
 * snapshot tells three).
 *
 * @param {Object} campaignState
 * @param {{ limit?: number }} [opts]
 * @param {Object} [source]
 * @returns {Array<{ sessionId: string, sessionNumber: number|null, text: string, last: boolean }>}
 */
export function earlierSessionStories(campaignState, { limit = 3 } = {}, source = recordSource()) {
  const current = campaignState?.currentSessionId ?? source?.currentSessionId ?? null;
  const earlier = campaignRead(source).sessions.filter(s => s.sessionId !== current);
  let last = earlier.length - 1;
  while (last >= 0 && !begunOf(earlier[last])) last -= 1;
  const between = earlier.slice(last + 1).flatMap(s => (s.beats ?? []).map(beatFacts).filter(Boolean));
  const betweenText = between.length ? `${BETWEEN_SESSIONS_LEAD}${between.join('; ')}.` : '';
  const out = [];
  for (let i = last; i >= 0 && out.length < limit; i -= 1) {
    const s = earlier[i];
    if (!begunOf(s)) continue;
    const own = sessionStoryOf(s, source);
    const text = i === last ? [own, betweenText].filter(Boolean).join('\n\n') : own;
    if (text) out.push({ sessionId: s.sessionId, sessionNumber: Number.isFinite(s.number) ? s.number : null, text, last: i === last });
  }
  if (last < 0 && betweenText) out.push({ sessionId: null, sessionNumber: null, text: betweenText, last: true });
  return out;
}

/**
 * LAST SESSION: where the last session stopped, as the record tells it — or
 * null when nothing does (a campaign's first session; a stale summary not yet
 * made again).
 *
 * @param {Object} campaignState
 * @param {Object} [source]
 * @returns {{ sessionId: string|null, sessionNumber: number|null, text: string }|null}
 */
export function lastSessionStory(campaignState, source = recordSource()) {
  const newest = earlierSessionStories(campaignState, { limit: 1 }, source).find(s => s.last) ?? null;
  return newest ? { sessionId: newest.sessionId, sessionNumber: newest.sessionNumber, text: newest.text } : null;
}

/**
 * The earlier sessions whose summary is owed — never made, made stale by a
 * correction, or behind what the record holds (a Batch Mode round narrated
 * after its session closed) — newest first, at most `limit`: the ones LAST
 * SESSION and the world snapshot read.
 *
 * @param {Object} campaignState
 * @param {{ limit?: number }} [opts]
 * @param {Object} [source]
 * @returns {string[]} session ids
 */
export function summariesOwed(campaignState, { limit = 3 } = {}, source = recordSource()) {
  const current = campaignState?.currentSessionId ?? source?.currentSessionId ?? null;
  const owed = [];
  // A session nobody began is told by its facts (earlierSessionStories): no summary is owed it.
  const earlier = campaignRead(source).sessions.filter(s => s.sessionId !== current && !s.legacy && begunOf(s));
  for (let i = earlier.length - 1; i >= 0 && owed.length < limit; i -= 1) {
    const state = summaryState(earlier[i].sessionId, source);
    if (state.source.empty) continue;
    if (!state.valid || state.behind) owed.push(earlier[i].sessionId);
  }
  return owed;
}

/**
 * The session the record numbers `number` — the newest of that number — or
 * null (`!recap session N` once its cards are gone from the chat).
 *
 * @param {number} number
 * @param {Object} [source]
 * @returns {string|null}
 */
export function sessionIdOfNumber(number, source = recordSource()) {
  const n = Number(number);
  if (!Number.isFinite(n) || n <= 0) return null;
  return campaignRead(source).sessions.findLast(s => s.number === n)?.sessionId ?? null;
}

/**
 * A session's number as the record has it (its `session.begun`, else its
 * page), or null.
 *
 * @param {string} sessionId
 * @param {Object} [source]
 * @returns {number|null}
 */
export function recordedSessionNumber(sessionId, source = recordSource()) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  const n = campaignRead(source).sessions.find(s => s.sessionId === sessionId)?.number;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The summary's prompt — its rules (design 8.2). */
export const SESSION_SUMMARY_SYSTEM_PROMPT =
  `You are the continuity scribe for an Ironsworn: Starforged campaign. You are given one play ` +
  `session as its record: numbered beats, oldest first. A beat's first line is its facts — who ` +
  `acted and the words their player typed, the move and its outcome, what changed on a sheet, what ` +
  `play did, what was established and still stands. Under some is TOLD AS: the narrator's prose ` +
  `for that beat.\n\n` +
  `Write the story so far of THIS SESSION for the narrator to hold as background memory: 4-8 ` +
  `sentences, past tense, plain prose.\n` +
  `- State only what the facts state. TOLD AS may lend wording for what a fact line already says; ` +
  `nothing found only in TOLD AS is an event, a change, an injury, a gain, an arrival, a name or a ` +
  `decision. Where the record shows nothing between two beats, write nothing between them.\n` +
  `- What a player's line claims about the world is their character's claim, unless an outcome or ` +
  `an established line supports it.\n` +
  `- Every beat marked LASTING is told.\n` +
  `- A question asked of the narrator is not an event: nothing happened because one was asked.\n` +
  `- What is STRUCK BY THE TABLE did not happen: never tell it.\n` +
  `- Keep whose things are whose, and use each name as the record writes it — and no other.\n` +
  `- This is narrative memory, not a recap card: do not address the player, do not propose ` +
  `actions, and do not mention dice, moves, momentum or any game mechanic.\n\n` +
  `Reply with JSON only: [{"text": "<one sentence>", "because": ["<beat number>", …]}, …] — each ` +
  `sentence with the numbers of the beats it tells. A sentence that rests on no beat is left out.`;

/**
 * The summary's user message.
 *
 * @param {{ text: string }} source — summarySource's
 * @returns {string}
 */
export function sessionSummaryUserMessage(source) {
  return `${source?.text ?? ''}\n\nWrite the summary of this session now, as the JSON list asked for.`;
}

/** What a reply that left a lasting beat untold is sent back with, once (decision D11). */
export function summaryLastingUntold(ids) {
  return `Your summary left out ${ids.length === 1 ? 'a beat marked LASTING' : 'beats marked LASTING'}: ${ids.map(id => `[${id}]`).join(', ')}. ` +
    'Write the summary again, as the JSON list, telling each of them in a sentence that cites it.';
}

/** What a reply that was not the JSON asked for is sent back with, once. */
export function summaryReplyAgain() {
  return 'Your reply was not the JSON asked for. Reply with the JSON list alone — [{"text": …, "because": […]}] — and nothing around it.';
}
