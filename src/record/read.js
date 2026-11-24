/**
 * STARFORGED COMPANION
 * src/record/read.js — the session record, read with the table's corrections applied (issue #382)
 *
 * `readRecord(scope)` is the one read of the record: every view — the Session
 * Log page, the recap, the summary, the Chronicle's automatic entries, the
 * session card — is made from what it returns, and no view reads the stored
 * events (`sessionRecord.events` is read here and nowhere else; the sweep in
 * tests/unit/sessionRecordEvents.test.js fails on another reader).
 *
 * It returns the sessions as **beats**, each grouped from events by the ids
 * they already carry (no id is threaded down the pipeline to tie a beat
 * together), in the order a beat reads — the line, the move, what changed,
 * the telling, what it established — whatever order the events arrived in.
 *
 * **Corrections, in order** (the stored events are never changed by a read):
 *   1. Removals. Everything stamped with a removed narration's id is dropped.
 *      An X-Card's beat keeps its move and its sheet changes and is marked
 *      `removed: "xcard"`, its line and its telling gone. A narration an
 *      upgrade superseded is dropped; the re-narration stands in its beat.
 *   2. Strikes. A struck truth leaves `established`; its replacement stands.
 *      The beat whose telling stated it carries `leaveOut` — a table's strike
 *      may be named; an X-Card's never is.
 *   3. Names. Every changed name the campaign recorded is folded (A → B then
 *      B → C makes A → C; a change undone drops), uncapped, and written as the
 *      new one in every words, label and prose field (nameChanges.js
 *      writeNewNames) — and a field with an actor id is written with that
 *      actor's current name.
 *   4. Cutaways. A closing vignette is a beat of kind `cutaway`: an NPC
 *      elsewhere, not something the characters did.
 *
 * `hash` is FNV-1a over the corrected value: any correction changes it, and a
 * view stores the hash of the read it was made from (a stale view is never
 * shown — store.js `writeRecordView`).
 *
 * A session from before the record has no events: it is returned
 * `legacy: true`, with the story its Session Log page holds and no beats.
 *
 * Pure but for its default source (pages.js `recordSource`): given a source it
 * touches nothing else.
 */

import { RECORD_EVENTS } from './events.js';
import { recordSource } from './pages.js';
import { withNameChange, writeNewNames } from '../factContinuity/nameChanges.js';

/** `narration.removed`'s two causes. */
const BY_XCARD = 'xcard';
const BY_SUPERSEDED = 'superseded';

/** How long after a causeless sheet change another by the same hand joins its beat. */
const SHEET_EDIT_WINDOW_MS = 10_000;

const KNOWN_KINDS = new Set(RECORD_EVENTS.map(r => r.id));

const byTime = (a, b) => (a.at - b.at) || ((a.seq ?? 0) - (b.seq ?? 0));

/** A record's events as a list, oldest first; [] for none. The one place the stored map is opened. */
function eventsOf(record) {
  const map = record?.events;
  if (!map || typeof map !== 'object') return [];
  return Object.values(map)
    .filter(e => e && typeof e === 'object' && typeof e.k === 'string' && KNOWN_KINDS.has(e.k))
    .sort(byTime);
}

/**
 * The stored events of one record that the given narrations wrote: each
 * stamped with one of their ids (its narration, the truths it set, …), not yet
 * blanked. What the X-Card blanks (store.js blankRemovedNarrations).
 *
 * @param {Object|null} record — a page's `sessionRecord` flag
 * @param {string[]} narrationIds
 * @returns {Array<{ id: string, text?: string, d: Object }>}
 */
export function eventsOfNarrations(record, narrationIds) {
  const ids = new Set((Array.isArray(narrationIds) ? narrationIds : []).filter(id => typeof id === 'string' && id));
  if (!ids.size) return [];
  return eventsOf(record).filter(e => ids.has(e.ref?.nar) && e.removed !== true);
}

/**
 * The hash a view is keyed by: FNV-1a over a value's JSON. A view stores the
 * hash of what it was made from, and is valid while that still hashes the same.
 *
 * @param {*} value
 * @returns {string}
 */
export function recordHash(value) {
  return fnv1a(JSON.stringify(value ?? null));
}

/** FNV-1a, 32-bit, over a string. */
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * What the whole campaign's records say was removed and renamed — a
 * correction reaches every session, whichever page recorded it.
 */
function campaignCorrections(pages) {
  const xcarded = new Set();
  const superseded = new Set();
  const renames = [];
  for (const page of pages) {
    for (const e of eventsOf(page.record)) {
      if (e.k === 'narration.removed') {
        const into = e.d?.by === BY_SUPERSEDED ? superseded : xcarded;
        for (const id of Array.isArray(e.d?.narrationIds) ? e.d.narrationIds : []) {
          if (typeof id === 'string' && id) into.add(id);
        }
      } else if (e.k === 'name.changed') {
        renames.push(e);
      }
    }
  }
  renames.sort(byTime);
  let names = [];
  for (const e of renames) {
    names = withNameChange(names, {
      from: e.d?.from, to: e.d?.to, kind: e.d?.how, about: e.d?.about, entityId: e.ref?.entity ?? null, sessionId: e.s, at: e.at,
    }, { cap: Infinity });
  }
  // An X-Card on a narration an upgrade had already superseded is the X-Card's.
  for (const id of xcarded) superseded.delete(id);
  return { xcarded, superseded, names };
}

function newBeat(kind, event) {
  return {
    id: event.id, at: event.at, seq: event.seq ?? 0, kind,
    who: { user: event.who?.user ?? null, actor: event.who?.actor ?? null, name: null },
    line: null, move: null, changes: [], choices: [], did: [], told: null, established: [],
    where: null, lasting: null, removed: null, leaveOut: [], round: event.ref?.round ?? null,
    events: [],
  };
}

const moveOf = (d) => ({
  moveId: d.moveId ?? null, name: d.moveName ?? d.moveId ?? null, rollKind: d.rollKind ?? null,
  stat: d.statUsed ?? null, statValue: d.statValue ?? null, adds: d.adds ?? 0,
  dice: { action: d.actionDie ?? null, cancelled: d.actionDieCancelled === true, challenge: Array.isArray(d.challengeDice) ? d.challengeDice : [] },
  score: d.rollKind === 'progress' ? (d.progressScore ?? null) : (d.actionScore ?? null),
  outcome: d.outcome ?? null, match: d.isMatch === true, target: d.target ?? null, held: d.held === true,
  upgraded: null, kept: null,
});

/**
 * One session's corrected beats, from its events.
 *
 * @param {Object[]} events — the session's, oldest first
 * @param {{ xcarded: Set<string>, superseded: Set<string> }} corrections
 * @returns {{ begun: Object|null, ended: Object|null, beats: Object[], strikes: Object[], renames: Object[], removed: number }}
 */
function sessionBeats(events, { xcarded, superseded }) {
  const beats = [];
  const byRes = new Map();
  const byNar = new Map();
  const openLine = new Map();          // actor → the latest line beat with no telling yet
  const truths = new Map();            // truth id → { beat, entry }
  const struck = [];
  const renames = [];
  let begun = null;
  let ended = null;
  let lastSheetEdit = null;

  // Each rolled move's roller, by its resolution: what a move caused may be
  // recorded before its roll card is (an effect lands, then the card posts).
  const rollerOf = new Map();
  for (const e of events) {
    if (e.k === 'move.resolved' && e.ref?.res) rollerOf.set(e.ref.res, e.who?.actor ?? null);
  }

  const open = (kind, e) => {
    const beat = newBeat(kind, e);
    beats.push(beat);
    return beat;
  };
  const lineOf = (actor) => {
    const beat = openLine.get(actor ?? '');
    return beat && !beat.told ? beat : null;
  };
  // The beat of a rolled move: the one its resolution already has, else its
  // roller's line still waiting for a move, else a new one.
  const beatOfMove = (res, e) => {
    let beat = byRes.get(res) ?? null;
    if (!beat) {
      const line = lineOf(rollerOf.get(res));
      beat = line && !line.move && !line.claimed ? line : open('play', e);
      beat.claimed = true;
      byRes.set(res, beat);
    }
    return beat;
  };

  for (const e of events) {
    const d = e.d ?? {};
    const nar = e.ref?.nar ?? null;
    // What a superseded narration wrote is gone; the re-narration stands in its beat.
    if (nar && superseded.has(nar)) continue;
    const viaXCard = !!nar && (xcarded.has(nar) || e.removed === true);
    let beat = null;

    switch (e.k) {
      case 'session.begun':
        if (!begun) begun = { at: e.at, ...d };
        continue;
      case 'session.ended':
        ended = { at: e.at, ...d };
        continue;
      case 'name.changed':
        renames.push({ at: e.at, from: d.from ?? '', to: d.to ?? '', how: d.how ?? 'renamed', about: d.about ?? null });
        continue;
      case 'narration.removed':
        continue;
      case 'truth.struck':
        struck.push({ at: e.at, truthId: e.ref?.truth ?? null, by: d.by ?? 'gm', replacedBy: d.replacedBy ?? null });
        continue;

      case 'line': {
        // A card's button that posts an earlier line again (a paced card's
        // Roll, a "Not rolled" notice's Narrate it) is that line's beat while
        // nothing has come of it yet: one beat, its words once.
        const earlier = d.repost === true ? lineOf(e.who?.actor) : null;
        if (earlier && !earlier.move && !earlier.claimed) {
          beat = earlier;
          break;
        }
        beat = open('play', e);
        beat.line = { text: typeof e.text === 'string' ? e.text : '', via: d.via ?? 'typed', repost: d.repost === true };
        openLine.set(e.who?.actor ?? '', beat);
        break;
      }

      case 'move.resolved': {
        const res = e.ref?.res ?? null;
        beat = res ? beatOfMove(res, e) : open('play', e);
        beat.move = moveOf(d);
        if (!beat.who.actor) beat.who.actor = e.who?.actor ?? null;
        break;
      }

      case 'move.upgraded':
      case 'move.kept': {
        beat = byRes.get(e.ref?.res ?? '') ?? null;
        if (!beat?.move) continue;
        if (e.k === 'move.kept') beat.move.kept = d.by ?? 'keep';
        else {
          beat.move.upgraded = { how: d.how ?? null, from: d.from ?? beat.move.outcome, to: d.to ?? null, momentum: d.momentum ?? null };
          if (d.to) beat.move.outcome = d.to;
        }
        break;
      }

      case 'sheet.changed': {
        const res = e.ref?.res ?? null;
        beat = res && (byRes.has(res) || rollerOf.has(res)) ? beatOfMove(res, e) : null;
        if (!beat) {
          const same = lastSheetEdit && lastSheetEdit.user === (e.who?.user ?? null)
            && lastSheetEdit.actor === (d.actorId ?? null) && e.at - lastSheetEdit.at <= SHEET_EDIT_WINDOW_MS;
          beat = same ? lastSheetEdit.beat : open('table', e);
          if (!beat.who.actor) beat.who.actor = d.actorId ?? null;
          lastSheetEdit = { beat, user: e.who?.user ?? null, actor: d.actorId ?? null, at: e.at };
        }
        beat.changes.push({
          actor: d.actorId ?? null, item: d.itemId ?? null, name: d.name ?? null,
          what: d.what ?? null, from: d.from ?? null, to: d.to ?? null, cause: d.cause?.kind ?? 'sheet',
        });
        break;
      }

      case 'narration': {
        const res = e.ref?.res ?? null;
        const round = e.ref?.round ?? null;
        const upgraded = typeof d.upgradeOf === 'string' && d.upgradeOf ? byRes.get(d.upgradeOf) : null;
        beat = upgraded || (res && (byRes.has(res) || rollerOf.has(res)) ? beatOfMove(res, e) : null);
        // A Batch Mode round is told once, for every entry: its card goes on
        // the round's last beat that has no telling yet.
        if (!beat && round) beat = beats.findLast(b => b.round === round && !b.told && !b.removed) ?? null;
        if (!beat && d.mode === 'paced') beat = lineOf(d.actorId ?? e.who?.actor);
        if (!beat) beat = open(d.mode === 'vignette_close' ? 'cutaway' : 'play', e);
        if (res) byRes.set(res, beat);
        if (nar) byNar.set(nar, beat);
        if (viaXCard) {
          // The table removed this telling: its move and its changes stay,
          // nothing of it is kept — the line it told with it, and for a
          // round, every line the round told.
          const told = round ? beats.filter(b => b.round === round) : [];
          for (const b of new Set([beat, ...told])) {
            b.removed = BY_XCARD;
            b.told = null;
            b.line = null;
          }
        } else {
          beat.told = { text: typeof e.text === 'string' ? e.text : '', mode: d.mode ?? 'move' };
        }
        break;
      }

      case 'truth.set': {
        if (viaXCard) continue;
        // One truth is set once: a save that carried it back is no new truth (ledgerDiff.js).
        if (e.ref?.truth && truths.has(e.ref.truth)) continue;
        beat = (nar && byNar.get(nar)) || open('table', e);
        const entry = {
          truthId: e.ref?.truth ?? null, subject: d.subject ?? null, fact: typeof d.fact === 'string' ? d.fact : '',
          by: d.by ?? 'narrator', place: d.place ?? null, replaces: d.replaces ?? null,
        };
        beat.established.push(entry);
        if (entry.truthId) truths.set(entry.truthId, { beat, entry });
        break;
      }

      default:
        continue;
    }
    if (beat) beat.events.push(e.id);
  }

  // Strikes: the truth leaves; the beat that told it is given what to leave out.
  const strikes = [];
  for (const s of struck) {
    const hit = s.truthId ? truths.get(s.truthId) : null;
    if (!hit) continue;
    hit.beat.established = hit.beat.established.filter(t => t !== hit.entry);
    const replacement = s.replacedBy ? truths.get(s.replacedBy)?.entry ?? null : null;
    if (s.by !== BY_XCARD && s.by !== BY_SUPERSEDED) {
      if (hit.beat.told) hit.beat.leaveOut.push(hit.entry.fact);
      strikes.push({ at: s.at, by: s.by, subject: hit.entry.subject, fact: hit.entry.fact, replacedBy: replacement?.fact ?? null });
    }
  }

  for (const b of beats) delete b.claimed;
  const removed = beats.filter(b => b.removed === BY_XCARD).length;
  // A beat with nothing left to say — a table beat whose one truth was struck — is no beat.
  const kept = beats.filter(b => b.removed || b.line || b.move || b.told || b.changes.length || b.established.length
    || b.choices.length || b.did.length);
  return { begun, ended, beats: kept, strikes, renames, removed };
}

/** Write a session's names anew: every words, label and prose field, and each actor's current name. */
function correctNames(session, { names, nameOf, otherNames }) {
  const fix = (text) => (typeof text === 'string' && text ? writeNewNames(text, names, { otherNames }) : text);
  const actorName = (id) => (id ? nameOf(id) : null);
  const subject = (s) => (s && typeof s === 'object' ? { ...s, ...(typeof s.text === 'string' ? { text: fix(s.text) } : {}) } : s);
  for (const beat of session.beats) {
    beat.who.name = actorName(beat.who.actor);
    if (beat.line) beat.line.text = fix(beat.line.text);
    if (beat.told) beat.told.text = fix(beat.told.text);
    if (beat.move?.target?.name) beat.move.target = { ...beat.move.target, name: fix(beat.move.target.name) };
    for (const c of beat.changes) c.name = actorName(c.actor) ?? fix(c.name);
    for (const t of beat.established) {
      t.fact = fix(t.fact);
      t.subject = subject(t.subject);
    }
    beat.leaveOut = beat.leaveOut.map(fix);
  }
  for (const s of session.corrections) {
    if (s.kind !== 'strike') continue;
    s.fact = fix(s.fact);
    s.replacedBy = fix(s.replacedBy);
    s.subject = subject(s.subject);
  }
  const snapshot = (snap) => {
    if (!snap) return;
    for (const pc of Array.isArray(snap.pcs) ? snap.pcs : []) pc.name = actorName(pc.actorId) ?? fix(pc.name);
    for (const v of Array.isArray(snap.vows) ? snap.vows : []) v.name = fix(v.name);
    for (const t of Array.isArray(snap.tracks) ? snap.tracks : []) t.label = fix(t.label);
    if (snap.place?.name) snap.place = { ...snap.place, name: fix(snap.place.name) };
  };
  snapshot(session.begun);
  snapshot(session.ended);
}

/**
 * Read the record.
 *
 * @param {Object} [scope]
 * @param {string} [scope.session] — a session id, or "campaign" (every session, oldest first). Default: the current session.
 * @param {number} [scope.through] — one session only: read no event past this counter (`seq`)
 * @param {"beats"} [scope.detail]
 * @param {Object} [source] — what to read (default: the stored pages — pages.js recordSource)
 * @returns {{ sessions: Array<{ sessionId: string, number: number|null, name: string, begun: Object|null, ended: Object|null,
 *   legacy: boolean, resumed: boolean, story: string, beats: Object[], corrections: Object[],
 *   open: { established: Object[] }, through: number }>, hash: string }}
 */
export function readRecord(scope = {}, source = recordSource()) {
  const pages = [...(Array.isArray(source?.pages) ? source.pages : [])]
    .sort((a, b) => (a.createdAt - b.createdAt) || ((a.number ?? 0) - (b.number ?? 0)));
  const wanted = scope?.session ?? source?.currentSessionId ?? null;
  const corrections = campaignCorrections(pages);
  const naming = {
    names: corrections.names,
    nameOf: typeof source?.nameOf === 'function' ? source.nameOf : () => null,
    otherNames: Array.isArray(source?.otherNames) ? source.otherNames : [],
  };
  const through = wanted !== 'campaign' && Number.isFinite(scope?.through) ? scope.through : null;

  const sessions = [];
  for (const page of pages) {
    if (wanted !== 'campaign' && page.sessionId !== wanted) continue;
    const all = eventsOf(page.record);
    const events = through === null ? all : all.filter(e => (e.seq ?? 0) <= through);
    const legacy = !page.record;
    const read = sessionBeats(events, corrections);
    const session = {
      sessionId: page.sessionId,
      number: Number.isFinite(read.begun?.number) ? read.begun.number : (page.number ?? null),
      name: page.name ?? '',
      begun: read.begun,
      ended: read.ended,
      legacy,
      resumed: read.begun?.resumed === true,
      // What its Session Log page held before the record (a legacy session's story).
      story: page.story ?? '',
      beats: read.beats,
      corrections: [
        ...read.renames.map(r => ({ kind: 'name', ...r })),
        ...read.strikes.map(s => ({ kind: 'strike', ...s })),
        ...(read.removed ? [{ kind: 'removed', count: read.removed }] : []),
      ],
      open: { established: [] },
      through: events.length ? Math.max(...events.map(e => e.seq ?? 0)) : -1,
    };
    correctNames(session, naming);
    session.open.established = session.beats.filter(b => !b.removed).flatMap(b => b.established);
    sessions.push(session);
  }
  return { sessions, hash: recordHash(sessions) };
}
