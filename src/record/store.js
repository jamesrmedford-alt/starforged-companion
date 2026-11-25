/**
 * STARFORGED COMPANION
 * src/record/store.js — where the session record is kept (issue #382, decision D1)
 *
 * One record a session, on that session's own page of the Session Log
 * journal, beside the page's `sessionLogPage` flag:
 *
 *   flags["starforged-companion"].sessionRecord = {
 *     v, sessionId, createdAt,
 *     seq,                       // the page's counter — a tie-break at read
 *     events: { "<eventId>": Event, … },
 *     views:  { log: { sourceHash, renderedAt }, … },   // caches (read.js's hash)
 *   }
 *
 * - **An append is one dotted update**: `…sessionRecord.events.<id>` and
 *   `…sessionRecord.seq`. A flag object is merged key by key
 *   (docs/foundry-reference/foundry-api-reference.md, "Flags"), so an append
 *   never carries the session's other events and two writers never save the
 *   list over each other. And only that key goes on the wire: Foundry v13
 *   (13.351) sends an update's diff against the document's source — the
 *   update operation's `diff` defaults to true (common/abstract/backend.mjs),
 *   the client sends what `updateSource(changes, { dryRun: true })` returns
 *   (client/data/client-backend.mjs), and a flags scope diffs key by key
 *   (DocumentFlagsField → ObjectField `_updateDiff`, `diffObject`). A Quench
 *   test fails on an append whose change carries another event
 *   (src/integration/quench.js, "Session record"); were it ever to, the
 *   fallback is a page a scene, and `recordPageKey` is the one place that
 *   says which page an event goes to.
 * - **Never campaignState.** The record grows with every beat; campaignState
 *   is written whole, to every client, on a chain every relay shares.
 * - **The page is get-or-create by its session id**, made by the canonical GM
 *   only (worldJournal.js getOrCreateSessionLogPage).
 * - **The flag is the record; the page's body is its rendered mirror**
 *   (sessionLogView.js).
 * - **Nothing is edited after it is written — but for the X-Card**
 *   (`blankRemovedNarrations`, decision D3): a safety tool must not leave what
 *   it removed retrievable, so the removed narration's prose and what it
 *   established are blanked in the flag, in the write that records the removal.
 *
 * `sessionRecord.events` is read by read.js and nowhere else: pages.js hands
 * it the pages (`recordSource`), and this file asks it which stored events a
 * removal reaches (`eventsOfNarrations`).
 */

import { RECORD_VERSION, RECORD_VIEWS, RECORD_WRITE_OPTION, recordEventRow } from './events.js';
import { eventsOfNarrations } from './read.js';
import { RECORD_FLAG, recordOf, pageMeta, recordPageOf, sessionLogPages, storedCampaignState } from './pages.js';
import { getOrCreateSessionLogPage } from '../world/worldJournal.js';

const MODULE_ID = 'starforged-companion';

const base = `flags.${MODULE_ID}.${RECORD_FLAG}`;
const writeOptions = () => ({ [MODULE_ID]: { [RECORD_WRITE_OPTION]: true } });

// The highest counter this client has handed out for a session, so two
// batches written before the first one's answer is back never share a number.
const _seqSeen = new Map();

/**
 * Which page an event goes to: its session's. The one place that decides it —
 * a page a scene would be a change here and in pages.js `pageMeta` alone.
 *
 * @param {Object} event
 * @returns {string|null}
 */
function recordPageKey(event) {
  return typeof event?.s === 'string' && event.s ? event.s : null;
}

/**
 * Append events to their sessions' pages — one update a page, each event one
 * key. A session with no page yet gets one. Called on the canonical GM, on
 * the record chain (record.js). A refused write is logged and its events are
 * lost: the record never blocks play.
 *
 * @param {Object[]} events — built by record.js
 * @returns {Promise<string[]>} the sessions written
 */
export async function appendRecordEvents(events) {
  const bySession = new Map();
  for (const event of events) {
    const key = recordPageKey(event);
    if (!key) continue;
    if (!bySession.has(key)) bySession.set(key, []);
    bySession.get(key).push(event);
  }
  const written = [];
  for (const [sessionId, batch] of bySession) {
    try {
      const page = await pageFor(sessionId);
      if (!page) {
        console.warn(`${MODULE_ID} | session record: no Session Log page for session ${sessionId} — ${batch.length} event(s) not recorded.`);
        continue;
      }
      const rec = recordOf(page);
      const update = {};
      if (!rec?.v) {
        update[`${base}.v`] = RECORD_VERSION;
        update[`${base}.sessionId`] = sessionId;
        update[`${base}.createdAt`] = Date.now();
      }
      let seq = Math.max(Number(rec?.seq) || 0, _seqSeen.get(sessionId) ?? 0);
      for (const event of batch) {
        event.seq = seq;
        seq += 1;
        update[`${base}.events.${event.id}`] = event;
      }
      update[`${base}.seq`] = seq;
      _seqSeen.set(sessionId, seq);
      await page.update(update, writeOptions());
      written.push(sessionId);
    } catch (err) {
      console.warn(`${MODULE_ID} | session record: ${batch.length} event(s) of session ${sessionId} were not recorded:`, err?.message ?? err);
    }
  }
  if (written.length) notifyRecordWritten(written, events);
  return written;
}

/** The session's page, made when it has none (canonical GM — the caller is). */
async function pageFor(sessionId) {
  const existing = recordPageOf(sessionId);
  if (existing) return existing;
  const cs = storedCampaignState();
  const made = await getOrCreateSessionLogPage({
    currentSessionId: sessionId,
    sessionNumber: cs?.currentSessionId === sessionId ? (cs?.sessionNumber ?? null) : null,
  });
  return made?.page ?? null;
}

// Who is told a record write landed (the Session Log page's renderer —
// sessionLogView.js — which this file does not import: the store knows no view).
const _writeListeners = new Set();

/**
 * Be told when events are written: `fn(sessionIds, events)`. Returns a
 * function that stops it.
 *
 * @param {(sessionIds: string[], events: Object[]) => void} fn
 * @returns {() => void}
 */
export function onRecordWritten(fn) {
  if (typeof fn !== 'function') return () => {};
  _writeListeners.add(fn);
  return () => _writeListeners.delete(fn);
}

function notifyRecordWritten(sessionIds, events) {
  for (const fn of _writeListeners) {
    try {
      fn(sessionIds, events);
    } catch (err) {
      console.warn(`${MODULE_ID} | session record: a write listener failed:`, err?.message ?? err);
    }
  }
}

/**
 * The X-Card's one edit of the record (decision D3): blank, on every page,
 * each stored event the removed narrations wrote — the narration's prose, the
 * truths it set, anything else stamped with its id — and mark it removed. A
 * move's own facts (its dice, its outcome, the sheet changes) carry no
 * narration id and stay: the move happened. What is blanked is the event's
 * text and the fields its row names as told (RECORD_EVENTS `blank`), each
 * written null — an update merges an object key by key, so a key left out
 * would keep its words; the fields that only place it (a narration's mode,
 * whose it is) stay, so the read still finds its beat. Canonical GM, on the
 * record chain. Never throws.
 *
 * @param {string[]} narrationIds
 * @returns {Promise<string[]>} the sessions whose pages changed
 */
export async function blankRemovedNarrations(narrationIds) {
  const ids = (Array.isArray(narrationIds) ? narrationIds : []).filter(id => typeof id === 'string' && id);
  if (!ids.length) return [];
  const changed = [];
  for (const page of sessionLogPages()) {
    const meta = pageMeta(page);
    const stamped = eventsOfNarrations(meta.record, ids);
    if (!stamped.length) continue;
    const update = {};
    for (const event of stamped) {
      const at = `${base}.events.${event.id}`;
      update[`${at}.removed`] = true;
      if (typeof event.text === 'string') update[`${at}.text`] = '';
      for (const key of recordEventRow(event.k)?.blank ?? []) {
        if (event.d && key in event.d) update[`${at}.d.${key}`] = null;
      }
    }
    try {
      await page.update(update, writeOptions());
      if (meta.sessionId) changed.push(meta.sessionId);
    } catch (err) {
      console.warn(`${MODULE_ID} | session record: what the X-Card removed could not be blanked on "${page?.name ?? page?.id}":`, err?.message ?? err);
    }
  }
  return changed;
}

/**
 * Store a view's cache entry on its session's page (`sessionRecord.views.<view>`),
 * with anything else that goes in the same write — the page body a render
 * made. A view is valid while re-reading its span gives its `sourceHash`.
 * Canonical GM. Returns whether it was written.
 *
 * @param {string} sessionId
 * @param {string} view — a RECORD_VIEWS id
 * @param {Object} entry — `{ sourceHash, … }`
 * @param {Object} [also] — further keys of the same page update
 * @returns {Promise<boolean>}
 */
export async function writeRecordView(sessionId, view, entry, also = {}) {
  if (!Object.prototype.hasOwnProperty.call(RECORD_VIEWS, view)) {
    console.warn(`${MODULE_ID} | session record: "${view}" is not a view of the record (RECORD_VIEWS) — not stored.`);
    return false;
  }
  const page = recordPageOf(sessionId);
  if (!page) return false;
  try {
    await page.update({ ...also, [`${base}.views.${view}`]: entry }, writeOptions());
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | session record: the "${view}" view of session ${sessionId} was not stored:`, err?.message ?? err);
    return false;
  }
}

/**
 * A view's cache entry as stored, or null.
 *
 * @param {string} sessionId
 * @param {string} view
 * @returns {Object|null}
 */
export function storedRecordView(sessionId, view) {
  const entry = recordOf(recordPageOf(sessionId))?.views?.[view];
  return entry && typeof entry === 'object' ? entry : null;
}

/** Test seam: forget the counters this client handed out, and who listens. */
export function _resetRecordStoreForTests() {
  _seqSeen.clear();
  _writeListeners.clear();
}
