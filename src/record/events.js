/**
 * STARFORGED COMPANION
 * src/record/events.js — what the session record holds (issue #382)
 *
 * The session record is one append-only list of events a session, written by
 * the canonical GM as each thing happens at the table (record.js), stored on
 * the session's own page of the Session Log journal (store.js) and read
 * through one function, with the table's corrections applied (read.js). Every
 * summary of play — the Session Log page, the campaign recap, the session
 * summary, the Chronicle's automatic entries, `!recap session` — is a view of
 * that read. No view reads another view.
 *
 * This is the one place the event kinds live, as SNAPSHOT_EVENTS is for the
 * world snapshot (narration/snapshotEvents.js):
 *   - One row a kind: its id, the fact fields its `d` may hold, the stable ids
 *     its `ref` may hold, whether it carries a text field, and the views that
 *     read it. `recordEvent` drops a field its row does not name, so a new
 *     field is a row edit in the same commit.
 *   - A row with no reader is refused (tests/unit/sessionRecordEvents.test.js):
 *     `campaignState.sessionLogs` grew with every move and nothing read it.
 *   - A kind is written at one place — the function, or the store funnel,
 *     where that thing already happens (docs/flows/session-record-flow.md).
 *
 * An event holds facts — stable ids, numbers, enum values and the table's own
 * words — and at most one text field. Prose (`text` on a `narration` event)
 * belongs to its event and is never read as a fact.
 *
 * Never recorded: hidden plans (made, decided, their clocks and rolls),
 * Private Lines, a safety flag's text, whispered cards, Private Channel
 * turns, the detector's drafts, dismissals, art, telemetry.
 *
 * A leaf module (no imports).
 */

/** The record's shape version, stored beside it (`sessionRecord.v`). */
export const RECORD_VERSION = 1;

/** The stable ids an event's `ref` may hold. Nothing else is kept on it. */
export const RECORD_REFS = Object.freeze([
  'line', 'res', 'nar', 'card', 'round', 'track', 'vow', 'conn', 'entity', 'truth', 'clock', 'place',
]);

/**
 * The views of the record: id → the module that makes it from `readRecord`.
 * The id is also the key a view's cache is stored under on its session's
 * page (`sessionRecord.views.<id>` — store.js writeRecordView refuses any
 * other). A row's `readBy` names these; the sweep test fails on one that is
 * no key here, and on a module here that does not call `readRecord`.
 */
export const RECORD_VIEWS = Object.freeze({
  log: 'src/record/sessionLogView.js',
});

/**
 * The update option every write of the record carries (store.js): a
 * `updateJournalEntryPage` listener that has nothing to do with the record
 * returns on it — an append fires that hook on every client, for every beat.
 */
export const RECORD_WRITE_OPTION = 'recordWrite';

/**
 * Whether a journal page update is one of the record's own writes.
 *
 * @param {Object} [options] — the update hook's options
 * @returns {boolean}
 */
export function isRecordWrite(options) {
  return options?.['starforged-companion']?.[RECORD_WRITE_OPTION] === true;
}

const row = (id, slice, fields, refs, readBy, { text = false, blank = [] } = {}) => Object.freeze({
  id, slice, fields: Object.freeze(fields), refs: Object.freeze(refs), text,
  blank: Object.freeze(blank), readBy: Object.freeze(readBy),
});

/**
 * Every kind of event. `fields`: the keys of `d`. `refs`: the keys of `ref`.
 * `text`: whether the event carries the one text field (the table's words, or
 * the narration). `blank`: the fields of `d` that hold what a narration told —
 * an event stamped with a narration the X-Card removed has them, and its
 * text, blanked in the stored record (store.js blankRemovedNarrations,
 * decision D3); the fields that only place it (its mode, whose it is) stay,
 * so the read still finds the beat it belonged to. `readBy`: the views that
 * read it (RECORD_VIEWS).
 */
export const RECORD_EVENTS = Object.freeze([
  // ── The session ───────────────────────────────────────────────────────────
  row('session.begun', 1, ['number', 'perspective', 'focus', 'pcs', 'vows', 'tracks', 'place', 'resumed'], [], ['log']),
  row('session.ended', 1, ['reason', 'focus', 'pcs', 'vows', 'tracks', 'place'], [], ['log']),
  // ── A beat of play ────────────────────────────────────────────────────────
  row('line', 1, ['via', 'forcedMoveId', 'repost'], ['line', 'round'], ['log'], { text: true }),
  row('move.resolved', 1, [
    'moveId', 'moveName', 'rollKind', 'statUsed', 'statValue', 'adds', 'actionDie', 'actionDieCancelled',
    'challengeDice', 'actionScore', 'progressScore', 'isMatch', 'outcome', 'target', 'held',
  ], ['res', 'round'], ['log']),
  row('move.upgraded', 1, ['how', 'from', 'to', 'momentum'], ['res'], ['log']),
  row('move.kept', 1, ['by'], ['res'], ['log']),
  row('sheet.changed', 1, ['actorId', 'itemId', 'name', 'what', 'from', 'to', 'cause'], ['res', 'card'], ['log']),
  row('narration', 1, ['mode', 'upgradeOf', 'actorId'], ['nar', 'card', 'res', 'round'], ['log'], { text: true }),
  // ── What the table established, corrected or removed ──────────────────────
  row('truth.set', 1, ['subject', 'fact', 'by', 'place', 'replaces'], ['truth', 'nar', 'entity'], ['log'], { blank: ['subject', 'fact', 'place'] }),
  row('truth.struck', 1, ['by', 'replacedBy'], ['truth'], ['log']),
  row('name.changed', 1, ['from', 'to', 'how', 'about'], ['entity'], ['log']),
  row('narration.removed', 1, ['narrationIds', 'by'], ['res'], ['log']),
]);

const ROW_BY_ID = new Map(RECORD_EVENTS.map(r => [r.id, r]));

/**
 * A kind's row, or null when it is none.
 *
 * @param {string} kind
 * @returns {{ id: string, slice: number, fields: string[], refs: string[], text: boolean, blank: string[], readBy: string[] }|null}
 */
export function recordEventRow(kind) {
  return ROW_BY_ID.get(kind) ?? null;
}
