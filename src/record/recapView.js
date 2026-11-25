/**
 * STARFORGED COMPANION
 * src/record/recapView.js — the campaign recap, a view of the session record (issue #382, slice 2)
 *
 * The recap was written from the Chronicle alone — a scribe's sentence a
 * beat, written from the narration — and each hop could change the story: a
 * pronoun flipped ("whatever I haul" → "her hauls"), a fact added (the
 * scribe's "he"), the gap an X-Card left filled in, a dropped change carried
 * forward as standing (known-issues RECAP-STATES-WHAT-DID-NOT-HAPPEN). Its
 * source is the record now, in four parts:
 *
 *   THE RECORD          each session's turning points — its lasting beats —
 *                       and the newest session in full: who acted and the
 *                       words their player typed, the move and its outcome,
 *                       what changed on a sheet, what play did (a vow sworn,
 *                       an arrival…), what was established and stands. Facts
 *                       only: no narration (decision D4). A recap told at a
 *                       session's start (`sessionStart` — narrator.js
 *                       sessionStartRecap, the world load's "Previously On")
 *                       leaves the session under way out: what it is told is
 *                       what came before, the last session in full.
 *   WHERE THINGS STAND  read live from the sheets and the tracks — never added
 *                       up from the record: each PC's meters and impacts, the
 *                       vows and their progress, the connections, the open
 *                       tracks, the current place, the scene's question.
 *   THE PLAYERS' OWN NOTES  Chronicle entries a player wrote, edited or pinned:
 *                       their words (decision D7).
 *   EARLIER SESSIONS    a session played before the record, as its Session Log
 *                       story and its Chronicle entries have it, labelled as
 *                       such (they may hold a name since changed).
 *
 * Every line carries an id. The reply is cited sentences (decision D11): a
 * sentence that cites nothing, or only ids it was not sent, is dropped in code;
 * a lasting beat no sentence cites sends the reply back once with those beats
 * named. The text kept has every changed name written as the new one
 * (nameChanges.js writeNewNames). The recap is a cache keyed by the hash of
 * this source (`campaignRecapCache.sourceHash`): a correction moves the hash,
 * and a stale recap is never shown.
 *
 * `recapSource` and `citedRecap` are pure; `collectRecapInputs` reads the
 * world through its own modules' readers (actorBridge.js for every actor).
 */

import { binds } from '../factContinuity/provenance.js';
import { readRecord, recordHash } from './read.js';
import { didText, changeText, moveText, OWN_WORDS } from './phrasing.js';
import { writeNewNames } from '../factContinuity/nameChanges.js';

const MODULE_ID = 'starforged-companion';

/** How long the source may run before its earliest turning points are cut (characters, ~6k tokens). */
const SOURCE_MAX_CHARS = 24_000;
/** The most turning points one earlier session is given. */
const TURNING_POINTS_PER_SESSION = 24;

/** What a truth rests on, as a view says it (overhaul 2 §5.7): only what binds is told. */
const BASIS = { player: 'said by the player', dice: 'the dice', gm: 'the GM', setup: 'the premise' };

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const quote = (s) => `“${clean(s)}”`;

function subjectText(subject) {
  if (!subject || typeof subject !== 'object') return '';
  return clean(subject.text ?? subject.name ?? '');
}

/**
 * One beat as the recap is given it — facts, no narration — or '' for a beat
 * with nothing to state (a telling alone, a cutaway).
 *
 * @param {Object} beat — one of readRecord's beats
 * @returns {string}
 */
export function beatFacts(beat) {
  if (!beat || beat.kind === 'cutaway') return '';
  const parts = [];
  const words = beat.line && !beat.line.repost && OWN_WORDS.has(beat.line.via) && clean(beat.line.text)
    ? `the player wrote ${quote(beat.line.text)}` : '';
  if (words) parts.push(words);
  if (beat.move) parts.push(moveText(beat.move));
  const changes = beat.changes.filter(c => c.cause !== 'mirror').map(c =>
    (c.actor && c.actor !== beat.who.actor && c.name ? `${c.name}: ${changeText(c)}` : changeText(c)));
  if (changes.length) parts.push(changes.join(', '));
  for (const d of beat.did ?? []) {
    const text = didText(d);
    if (text) parts.push(text);
  }
  for (const t of beat.established) {
    const subject = subjectText(t.subject);
    parts.push(`established${BASIS[t.basis] ? ` (${BASIS[t.basis]})` : ''}: ${subject ? `${subject} — ` : ''}${clean(t.fact)}`);
  }
  if (!parts.length) return '';
  const who = clean(beat.who.name) || (beat.kind === 'table' ? 'At the table' : '');
  const lasting = beat.lasting ? ` — LASTING: ${beat.lasting}` : '';
  return `${who ? `${who} — ` : ''}${parts.join(' — ')}${lasting}`;
}

/** "Session 3", or the session's page name when it has no number. */
const sessionLabel = (s) => (Number.isFinite(s.number) ? `Session ${s.number}` : (clean(s.name) || 'A session'));

/**
 * The recap's source, from its inputs. Pure.
 *
 * @param {Object} inputs
 * @param {Object} inputs.read — readRecord({ session: "campaign" })
 * @param {string[]} [inputs.standing] — WHERE THINGS STAND, a line each
 * @param {Array<{ who: string, text: string, pinned?: boolean, session?: string|null }>} [inputs.notes]
 * @param {Array<{ label: string, text: string }>} [inputs.earlier] — sessions from before the record
 * @param {string|null} [inputs.currentSessionId] — the session under way
 * @param {boolean} [inputs.sessionStart] — the recap a session's start is told: the session under
 *   way is left out of THE RECORD, so the last session before it is the latest, in full. Its
 *   first beats (Begin's vow, a clock, a momentum) are no "previously": counted, they made the
 *   session just played an earlier session, told by its turning points alone. End a Session's
 *   and `!recap`'s recaps tell the session under way, in full
 * @returns {{ text: string, ids: string[], lasting: string[], hash: string, empty: boolean, before: boolean, earlierTexts: string[] }}
 *   `empty`: nothing to retell — no line of the record, the notes or the sessions before it;
 *   `before`: a session before the current one is in it — a recorded session that holds a
 *   beat, or one from before the record (what a session's start is told — narrator.js
 *   sessionStartRecap; known-issues RECAP-AT-THE-FIRST-BEGIN)
 */
export function recapSource({ read, standing = [], notes = [], earlier = [], currentSessionId = null, sessionStart = false } = {}) {
  const sessions = (read?.sessions ?? [])
    .filter(s => !s.legacy && !(sessionStart && currentSessionId && s.sessionId === currentSessionId));
  const ids = [];
  const lasting = [];
  const blocks = [];

  sessions.forEach((session, i) => {
    const newest = i === sessions.length - 1;
    const key = Number.isFinite(session.number) ? `s${session.number}` : `s${i + 1}`;
    let lines = [];
    session.beats.forEach((beat, n) => {
      const facts = beatFacts(beat);
      if (!facts) return;
      if (!newest && !beat.lasting) return;
      const id = `${key}-${n + 1}`;
      lines.push({ id, text: `[${id}] ${facts}`, lasting: !!beat.lasting });
    });
    if (!newest && lines.length > TURNING_POINTS_PER_SESSION) lines = lines.slice(-TURNING_POINTS_PER_SESSION);
    // A strike as struck, a name changed since beside it (read.js).
    const struck = session.corrections.filter(c => c.kind === 'strike')
      .map(c => `- ${subjectText(c.subject) ? `${subjectText(c.subject)} — ` : ''}${clean(c.fact)}${c.replacedBy ? ` (now: ${clean(c.replacedBy)})` : (c.now?.length ? ` (now: ${c.now.join(', ')})` : '')}`);
    blocks.push({
      session, newest, lines,
      head: `### ${sessionLabel(session)}${newest ? ' — the latest session, in full' : ' — its turning points'}`,
      struck,
    });
  });

  // Over the length the source may run, the earliest turning points go first.
  const size = () => blocks.reduce((n, b) => n + b.lines.reduce((m, l) => m + l.text.length + 1, 0), 0);
  let cut = false;
  for (const block of blocks) {
    while (!block.newest && block.lines.length && size() > SOURCE_MAX_CHARS) {
      block.lines.shift();
      cut = true;
    }
  }

  const out = [];
  const record = [];
  for (const block of blocks) {
    record.push(block.head);
    record.push(block.lines.length ? block.lines.map(l => l.text).join('\n') : '(nothing lasting recorded)');
    if (block.struck.length) record.push(`STRUCK BY THE TABLE — these did not happen:\n${block.struck.join('\n')}`);
    for (const l of block.lines) {
      ids.push(l.id);
      if (l.lasting) lasting.push(l.id);
    }
  }
  if (record.length) {
    out.push(`## THE RECORD\n\n${cut ? '(The earliest turning points are left out for length.)\n\n' : ''}${record.join('\n\n')}`);
  }

  if (standing.length) {
    const lines = standing.map((text, n) => {
      const id = `now-${n + 1}`;
      ids.push(id);
      return `[${id}] ${text}`;
    });
    out.push(`## WHERE THINGS STAND — read from the sheets and tracks as play stopped\n\n${lines.join('\n')}`);
  }

  if (notes.length) {
    const lines = notes.map((note, n) => {
      const id = `note-${n + 1}`;
      ids.push(id);
      return `[${id}] ${clean(note.who)}${note.session ? ` (${note.session})` : ''}: ${quote(note.text)}`;
    });
    out.push(`## THE PLAYERS' OWN NOTES — from their Chronicles, in their words\n\n${lines.join('\n')}`);
  }

  const earlierTexts = [];
  if (earlier.length) {
    const lines = earlier.map((e, n) => {
      const id = `old-${n + 1}`;
      ids.push(id);
      earlierTexts.push(e.text);
      return `[${id}] ${clean(e.label)}: ${quote(e.text)}`;
    });
    out.push(`## EARLIER SESSIONS, FROM THE CHRONICLE AND THE SESSION LOG (written before the record; they may hold a name since changed)\n\n${lines.join('\n')}`);
  }

  const text = out.join('\n\n');
  // Nothing to retell — no beat on the record, no note, no session from before
  // it — is no recap, whatever stands on the sheets (a campaign's first
  // narration asks for none).
  const empty = !ids.some(id => !id.startsWith('now-'));
  // A campaign's first session has no session before it, however many beats
  // it has played — the vow sworn in Begin is its own first beat.
  const before = earlier.length > 0 || sessions.some(s => s.sessionId !== currentSessionId && s.beats.length > 0);
  return { text, ids, lasting, hash: recordHash(text), empty, before, earlierTexts };
}

/** The JSON a reply holds — the object or the list — or null. */
function replyJson(reply) {
  const s = String(reply ?? '').replace(/```(?:json)?/gi, '');
  const starts = [s.indexOf('{'), s.indexOf('[')].filter(i => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * A reply's cited sentences, checked against the source it was given (decision
 * D11): each sentence keeps the ids it cites that were sent; a sentence left
 * citing none is dropped. Pure.
 *
 * @param {string} reply — the model's text
 * @param {{ ids: string[], lasting: string[] }} source
 * @returns {{ ok: boolean, paragraphs: Array<Array<{ text: string, because: string[] }>>, dropped: number, missing: string[] }}
 *   `ok`: the reply was the JSON asked for; `missing`: lasting beats no kept sentence cites
 */
export function citedRecap(reply, source) {
  const json = replyJson(reply);
  const raw = Array.isArray(json?.paragraphs) ? json.paragraphs
    : Array.isArray(json) ? [json]
      : null;
  if (!raw) return { ok: false, paragraphs: [], dropped: 0, missing: [...(source?.lasting ?? [])] };
  const sent = new Set(source?.ids ?? []);
  let dropped = 0;
  const paragraphs = [];
  for (const para of raw) {
    const sentences = [];
    for (const s of Array.isArray(para) ? para : [para]) {
      const text = clean(s?.text);
      const because = (Array.isArray(s?.because) ? s.because : []).map(String).filter(id => sent.has(id));
      if (!text || !because.length) { dropped += 1; continue; }
      sentences.push({ text, because });
    }
    if (sentences.length) paragraphs.push(sentences);
  }
  const cited = new Set(paragraphs.flat().flatMap(s => s.because));
  const missing = (source?.lasting ?? []).filter(id => !cited.has(id));
  return { ok: true, paragraphs, dropped, missing };
}

/**
 * The recap's text from its cited sentences, every changed name written as
 * its new one (section 7.5: a view's text that still holds an old name is
 * corrected in code). Pure.
 *
 * @param {Array<Array<{ text: string }>>} paragraphs
 * @param {{ names?: Array, otherNames?: string[] }} [naming]
 * @returns {string}
 */
export function recapText(paragraphs, { names = [], otherNames = [] } = {}) {
  const text = paragraphs.map(p => p.map(s => s.text).join(' ')).filter(Boolean).join('\n\n');
  return names.length ? writeNewNames(text, names, { otherNames }) : text;
}

/** What a reply that was not the JSON asked for is sent back with, once. */
export function recapReplyAgain() {
  return 'Your reply was not the JSON asked for. Reply with the JSON object alone — {"paragraphs": [[{"text": …, "because": […]}]]} — and nothing around it.';
}

/**
 * What a reply that told no sentence of a lasting beat is sent back with, once
 * (decision D11): those beats, by id.
 *
 * @param {string[]} ids
 * @returns {string}
 */
export function recapLastingUntold(ids) {
  return `Your recap left out ${ids.length === 1 ? 'a beat marked LASTING' : 'beats marked LASTING'}: ${ids.map(id => `[${id}]`).join(', ')}. ` +
    'Write the recap again, as JSON, telling each of them in a sentence that cites it.';
}

// ─────────────────────────────────────────────────────────────────────────────
// The world as the source reads it
// ─────────────────────────────────────────────────────────────────────────────

const METER_KEYS = ['health', 'spirit', 'supply', 'momentum'];

/** A scene-state subject's name: an entity's current name (its host Actor's, through the bridge), else the key's own words. */
function subjectName(key, getActor) {
  const k = String(key ?? '');
  if (k.startsWith('entity:')) {
    try {
      return clean(getActor(k.slice(7))?.name) || 'someone';
    } catch {
      return 'someone';
    }
  }
  return k;
}
const BOXES = (ticks) => Math.floor((Number(ticks) || 0) / 4);

/**
 * WHERE THINGS STAND, read live (never added up from the record): a line
 * each. Every actor read is the bridge's.
 *
 * @param {Object} campaignState
 * @returns {Promise<string[]>}
 */
export async function standingLines(campaignState) {
  const lines = [];
  const bridge = await import('../character/actorBridge.js');
  let pcs = [];
  try { pcs = bridge.getPlayerActors(); } catch { pcs = []; }
  for (const actor of pcs) {
    const snap = bridge.readCharacterSnapshot(actor);
    if (!snap) continue;
    const meters = METER_KEYS.map(k => `${k} ${snap.meters?.[k] ?? '?'}`).join(', ');
    const impacts = Object.entries(snap.debilities ?? {}).filter(([, on]) => on).map(([k]) => k);
    lines.push(`${clean(actor.name)} — ${meters}${impacts.length ? `; impacts: ${impacts.join(', ')}` : ''}.`);
  }
  // A shared vow is one vow, held by each of its copies' PCs.
  const vows = new Map();
  for (const actor of pcs) {
    for (const v of bridge.readVows(actor)) {
      const key = v.vowId ?? `item:${v.id}`;
      const held = vows.get(key) ?? { ...v, holders: [] };
      held.holders.push(clean(actor.name));
      held.ticks = Math.max(held.ticks, v.ticks);
      vows.set(key, held);
    }
  }
  for (const v of vows.values()) {
    const status = v.forsaken ? 'forsaken' : v.completed ? 'fulfilled' : `${BOXES(v.ticks)} of 10 boxes marked`;
    lines.push(`The vow ${quote(v.name)} (${v.rank}) — ${status}; held by ${v.holders.join(' and ')}.`);
  }
  // Each PC's connections are the bond Items on their sheet, told in the
  // sheet's words (situation.js connectionStanding — TRACK-TOLD-AS-A-BOND);
  // an NPC card no PC holds a bond Item for is a person met, never "a
  // connection" (FOLDER-002; overhaul 4 — a person recorded from a draft's
  // Confirm reached the recap as a connection made).
  try {
    const { connectionStanding } = await import('../moves/situation.js');
    const held = new Set();
    for (const actor of pcs) {
      for (const c of bridge.readConnections(actor)) {
        if (!clean(c.name)) continue;
        if (c.connectionId) held.add(c.connectionId);
        held.add(clean(c.name).toLowerCase());
        lines.push(`${clean(c.name)} — ${clean(actor.name)}'s connection${c.rank ? ` (${c.rank})` : ''}, ${connectionStanding(c)}.`);
      }
    }
    const { listConnections } = await import('../entities/connection.js');
    for (const c of listConnections(campaignState ?? {})) {
      if (!clean(c.name) || held.has(c._id) || held.has(clean(c.name).toLowerCase()) || c.active === false) continue;
      lines.push(`${clean(c.name)} — a person met${c.role ? ` (${clean(c.role)})` : ''}; no one's connection.`);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | recap: the connections could not be read for where things stand:`, err?.message ?? err);
  }
  try {
    const { listOpenProgressTracks } = await import('../ui/progressTracks.js');
    for (const t of listOpenProgressTracks()) {
      lines.push(`The ${clean(t.type).replace(/_/g, ' ')} track ${quote(t.label)} (${t.rank}) — ${BOXES(t.ticks)} of 10 boxes, open.`);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | recap: the progress tracks could not be read for where things stand:`, err?.message ?? err);
  }
  try {
    const { currentLocationName } = await import('../narration/narrator.js');
    const place = campaignState?.currentLocationId ? currentLocationName(campaignState) : null;
    if (place) lines.push(`The current place: ${clean(place)}.`);
  } catch (err) {
    console.warn(`${MODULE_ID} | recap: the current place could not be read for where things stand:`, err?.message ?? err);
  }
  // The open scene's state as it stands — where someone is, the state a
  // thing is in, which way it points: the a65 recap said the compass "still
  // swings toward the dark lane" after it had settled on north. What binds
  // alone (overhaul 2 §5.7): the narration's own placements and colour are
  // no part of how things stand.
  const state = campaignState?.sceneState;
  if (state?.bySubject && typeof state.bySubject === 'object'
      && (!state.sceneId || state.sceneId === (campaignState?.currentSceneId ?? null))) {
    for (const [key, entries] of Object.entries(state.bySubject)) {
      for (const e of Array.isArray(entries) ? entries : []) {
        const value = clean(typeof e?.value === 'string' ? e.value : (e?.value ?? ''));
        if (!clean(e?.attribute) || !value || !binds(e)) continue;
        lines.push(`${clean(e.subjectText) || subjectName(key, bridge.getActor)} — ${clean(e.attribute)}: ${value}.`);
      }
    }
  }
  // The scene's question is the player's (overhaul 2 §7.2): set only from a
  // line of theirs, never one of the narration's own hooks — a hook play let
  // go is no part of where things stand.
  const frame = campaignState?.sceneFrame;
  if (frame && typeof frame === 'object' && clean(frame.question)) {
    lines.push(`The open scene's question, from the player's line: ${quote(frame.question)} — ${frame.questionAnswered === true ? 'answered' : 'not yet answered'}.`);
  }
  return lines;
}

/**
 * Everything the recap's source is built from, read from the world now.
 *
 * @param {Object} campaignState
 * @param {{ chronicle?: Array<Object>, sessionStart?: boolean }} [opts] — every PC's Chronicle entries,
 *   oldest first (`_actorId` on each); `sessionStart`: the recap a session's start is told (recapSource)
 * @returns {Promise<{ read: Object, standing: string[], notes: Object[], earlier: Object[], currentSessionId: string|null, sessionStart: boolean }>}
 */
export async function collectRecapInputs(campaignState, { chronicle = [], sessionStart = false } = {}) {
  const read = readRecord({ session: 'campaign' });
  const standing = await standingLines(campaignState);
  const recorded = new Set(read.sessions.filter(s => !s.legacy).map(s => s.sessionId));
  const numberOf = new Map(read.sessions.map(s => [s.sessionId, s]));
  let actorName = (id) => id;
  try {
    const bridge = await import('../character/actorBridge.js');
    actorName = (id) => bridge.getActor(id)?.name ?? id;
  } catch (err) {
    console.warn(`${MODULE_ID} | recap: the Chronicles' characters could not be named:`, err?.message ?? err);
  }
  const notes = [];
  const fromChronicle = new Map();
  for (const e of chronicle) {
    const text = clean(e?.text ?? e?.content);
    if (!text) continue;
    const session = numberOf.get(e.sessionId) ?? null;
    const own = e.automated !== true || e.playerEdited === true || e.pinned === true;
    if (own) {
      notes.push({ who: `${actorName(e._actorId)}'s Chronicle`, text, pinned: e.pinned === true, session: session ? sessionLabel(session) : null });
    } else if (!recorded.has(e.sessionId)) {
      const key = e.sessionId || '';
      if (!fromChronicle.has(key)) fromChronicle.set(key, []);
      fromChronicle.get(key).push(text);
    }
  }
  const earlier = [];
  for (const s of read.sessions.filter(x => x.legacy)) {
    if (clean(s.story)) earlier.push({ label: `${sessionLabel(s)}, its Session Log story`, text: s.story });
    for (const text of fromChronicle.get(s.sessionId) ?? []) earlier.push({ label: `${sessionLabel(s)}, the Chronicle`, text });
    fromChronicle.delete(s.sessionId);
  }
  for (const texts of fromChronicle.values()) {
    for (const text of texts) earlier.push({ label: 'An earlier session, the Chronicle', text });
  }
  return { read, standing, notes, earlier, currentSessionId: campaignState?.currentSessionId ?? null, sessionStart: sessionStart === true };
}

/**
 * The recap's source as the world stands now.
 *
 * @param {Object} campaignState
 * @param {{ chronicle?: Array<Object>, sessionStart?: boolean }} [opts]
 * @returns {Promise<ReturnType<typeof recapSource> & { names: Array, otherNames: string[] }>}
 */
export async function campaignRecapSourceOf(campaignState, opts = {}) {
  const inputs = await collectRecapInputs(campaignState, opts);
  return { ...recapSource(inputs), names: inputs.read.names ?? [], otherNames: inputs.read.otherNames ?? [] };
}
