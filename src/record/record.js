/**
 * STARFORGED COMPANION
 * src/record/record.js — the session record's one writer (issue #382)
 *
 * `recordEvent(kind, payload)` is how anything enters the session record: one
 * event, checked against RECORD_EVENTS (events.js), written by the canonical
 * GM onto the session's own page of the Session Log journal (store.js).
 *
 *   - **The canonical GM writes.** Called there, the event is queued for this
 *     client's record chain. Called on another GM's client — a co-GM's
 *     correction dialog — it is relayed (`record.append`). On a player's client
 *     it does nothing: every site runs on a GM (the pipeline is
 *     canonical-GM-gated; relay handlers run on the canonical GM).
 *   - **It never throws and never blocks play.** It returns at once; the write
 *     happens on a chain of its own, off campaignState and its write chain
 *     (rules/reachability.md §9 — "a writer that fires on every message keeps
 *     out of campaignState"). No site awaits it under the move lock. Events
 *     queued before the write ahead of them has landed go as one page update.
 *   - **A stale page writes nothing** (campaignStateChain.js's rule): a page
 *     whose connection dropped may have missed what the table did since.
 *   - **Called after the write it describes.** A site whose write can be
 *     refused calls it on the success path only: a refused write records
 *     nothing.
 *
 * State is never folded from the record: where things stand is read from the
 * sheet and the tracks. The record holds what happened.
 */

import { RECORD_REFS, recordEventRow } from './events.js';
import { isCanonicalGM } from '../multiplayer/gmGate.js';
import { pageIsStale } from '../multiplayer/connectionWatch.js';

const MODULE_ID = 'starforged-companion';

/** How many events one relayed `record.append` may carry, and how long one text field may be. */
const RELAYED_EVENTS_MAX = 50;
const TEXT_MAX_CHARS = 20_000;

// Events waiting for this client's next record write, and the chain the
// writes run on. The chain only ever resolves.
let _pending = [];
let _chain = Promise.resolve();
let _scheduled = false;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function storedCampaignState() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, 'campaignState') ?? null;
  } catch {
    return null;
  }
}

function newEventId() {
  const id = globalThis.foundry?.utils?.randomID?.();
  return typeof id === 'string' && /^[A-Za-z0-9]+$/.test(id)
    ? id
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** A JSON copy with no undefined, no function and no document in it; null when it cannot be made. */
function plainCopy(value) {
  try {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

/**
 * The event as it is stored, or null when `kind` is no row or it names no
 * session: the envelope, the row's own `d` fields and `ref` ids (anything
 * else is dropped), and the text when the row carries one.
 *
 * @param {string} kind
 * @param {Object} payload
 * @returns {Object|null}
 */
function buildEvent(kind, payload) {
  const row = recordEventRow(kind);
  if (!row) {
    console.warn(`${MODULE_ID} | session record: "${kind}" is not a row of RECORD_EVENTS — nothing recorded.`);
    return null;
  }
  const cs = storedCampaignState();
  const session = typeof payload.session === 'string' && payload.session ? payload.session : (cs?.currentSessionId ?? null);
  if (!session) return null;

  const given = isPlainObject(payload.d) ? payload.d : {};
  const d = {};
  for (const field of row.fields) {
    if (given[field] === undefined) continue;
    const value = plainCopy(given[field]);
    if (value !== undefined) d[field] = value;
  }
  const ref = {};
  for (const key of RECORD_REFS) {
    const value = payload.ref?.[key];
    if (row.refs.includes(key) && typeof value === 'string' && value) ref[key] = value;
  }
  const who = {
    user:  typeof payload.who?.user  === 'string' && payload.who.user  ? payload.who.user  : null,
    actor: typeof payload.who?.actor === 'string' && payload.who.actor ? payload.who.actor : null,
  };
  const event = {
    id:    newEventId(),
    k:     kind,
    at:    Number.isFinite(payload.at) ? payload.at : Date.now(),
    s:     session,
    scene: payload.scene !== undefined ? (payload.scene ?? null) : (session === cs?.currentSessionId ? (cs?.currentSceneId ?? null) : null),
    who,
    ref,
    d,
  };
  if (row.text && typeof payload.text === 'string') event.text = payload.text.slice(0, TEXT_MAX_CHARS);
  // What a narration the X-Card already removed told is never written down:
  // an event stamped with it that arrives after the removal (a capture's late
  // truth) is stored blanked, as the removal blanked the ones before it
  // (store.js blankRemovedNarrations, decision D3).
  const removed = Array.isArray(cs?.xCardedNarrationIds) ? cs.xCardedNarrationIds : [];
  if (ref.nar && removed.includes(ref.nar)) {
    event.removed = true;
    if (typeof event.text === 'string') event.text = '';
    for (const key of row.blank) if (key in d) d[key] = null;
  }
  return event;
}

/**
 * Record that something happened at the table. See the header. Returns at
 * once; `recordSettled()` resolves when every event queued so far is written.
 *
 * @param {string} kind — a RECORD_EVENTS row's id
 * @param {Object} [payload]
 * @param {Object} [payload.d]       — the kind's facts (the row's `fields`)
 * @param {Object} [payload.ref]     — stable ids (the row's `refs`)
 * @param {{ user?: string|null, actor?: string|null }} [payload.who] — who acted; whom it is credited to
 * @param {string} [payload.text]    — the table's words, or the narration
 * @param {string} [payload.session] — the session it belongs to (default: the current one)
 * @param {string|null} [payload.scene]
 * @param {number} [payload.at]
 * @returns {boolean} whether the event was queued (here) or sent to the canonical GM
 */
export function recordEvent(kind, payload = {}) {
  try {
    if (globalThis.game?.user?.isGM !== true) return false;
    const event = buildEvent(kind, isPlainObject(payload) ? payload : {});
    if (!event) return false;
    if (isCanonicalGM()) {
      queueEvents([event]);
      return true;
    }
    relayEvents([event]);
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | session record: "${kind}" was not recorded:`, err?.message ?? err);
    return false;
  }
}

/** Send events to the canonical GM (`record.append`). Fire-and-forget; never throws. */
function relayEvents(events) {
  import('../multiplayer/gmRelay.js')
    .then(({ requestGmAction }) => requestGmAction('record.append', { events }))
    .catch(err => console.warn(`${MODULE_ID} | session record: relaying ${events.length} event(s) to the canonical GM failed:`, err?.message ?? err));
}

/**
 * gmRelay handler for "record.append" — a GM's events, written by the
 * canonical GM. Only a GM's: a player's client records nothing (every site
 * runs on a GM), and the requester is client-asserted, so each event is
 * rebuilt against its row here (rules/reachability.md §8).
 *
 * @param {{ events?: Object[] }} payload
 * @param {{ requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ recorded: number }>}
 */
export async function applyRecordAppendFromRelay(payload = {}, ctx = {}) {
  if (ctx.requesterIsGM !== true) return { recorded: 0 };
  const events = [];
  for (const e of (Array.isArray(payload.events) ? payload.events : []).slice(0, RELAYED_EVENTS_MAX)) {
    if (!isPlainObject(e) || typeof e.k !== 'string') continue;
    const event = buildEvent(e.k, { d: e.d, ref: e.ref, who: e.who, text: e.text, session: e.s, scene: e.scene ?? null, at: e.at });
    if (event) events.push(event);
  }
  if (events.length) queueEvents(events);
  return { recorded: events.length };
}

function queueEvents(events) {
  _pending.push(...events);
  if (_scheduled) return;
  _scheduled = true;
  _chain = _chain.then(flush).catch(err =>
    console.warn(`${MODULE_ID} | session record: a write failed — its events are not recorded:`, err?.message ?? err));
}

/** Write everything queued so far, one page update a session. The record chain's step. */
async function flush() {
  _scheduled = false;
  const batch = _pending;
  _pending = [];
  if (!batch.length) return;
  if (pageIsStale()) {
    console.warn(`${MODULE_ID} | session record: ${batch.length} event(s) not recorded — this page lost its connection to the server; reload it.`);
    return;
  }
  const { appendRecordEvents } = await import('./store.js');
  await appendRecordEvents([...(await resumedSessionEvents(batch)), ...batch]);
}

// The sessions this client has seen a record for (or opened one for).
const _recordOpen = new Set();

/**
 * A world upgraded in the middle of a session has a session that began before
 * its record did: the record opens at its next event with a `session.begun`
 * marked `resumed`, carrying the table as it stands then. One for each such
 * session in the batch; none for a session whose page already has a record,
 * one nobody has begun, or one whose own `session.begun` is in the batch.
 *
 * @param {Object[]} batch
 * @returns {Promise<Object[]>}
 */
async function resumedSessionEvents(batch) {
  const out = [];
  const cs = storedCampaignState();
  for (const session of new Set(batch.map(e => e.s))) {
    if (_recordOpen.has(session)) continue;
    _recordOpen.add(session);
    if (batch.some(e => e.s === session && e.k === 'session.begun')) continue;
    if (cs?.currentSessionId !== session || cs.sessionStartedId !== session) continue;
    try {
      const { recordOf, recordPageOf } = await import('./pages.js');
      if (recordOf(recordPageOf(session))) continue;
      const { tableSnapshot } = await import('./tableSnapshot.js');
      const first = batch.find(e => e.s === session);
      const event = buildEvent('session.begun', {
        session, at: (first?.at ?? Date.now()) - 1,
        d: { ...(await tableSnapshot(cs)), number: cs.sessionNumber ?? null, resumed: true },
      });
      if (event) out.push(event);
    } catch (err) {
      console.warn(`${MODULE_ID} | session record: the table as session ${session}'s record opens could not be read:`, err?.message ?? err);
    }
  }
  return out;
}

/**
 * Run `task` on the record chain, after every event queued so far is written
 * — the X-Card's blanking, and a view's render, read the record as those
 * events left it. Resolves with the task's result; a failure is logged and
 * resolves undefined (the chain is never poisoned).
 *
 * @template T
 * @param {() => Promise<T>} task
 * @param {string} [label]
 * @returns {Promise<T|undefined>}
 */
export function onRecordChain(task, label = 'a record write') {
  const run = _chain.then(task);
  _chain = run.then(() => {}, err =>
    console.warn(`${MODULE_ID} | session record: ${label} failed:`, err?.message ?? err));
  return run.catch(() => undefined);
}

/**
 * Record that narrations were removed — by the X-Card, or superseded by a
 * Burn Momentum / Improve Result — and, for the X-Card, blank what they wrote
 * in the stored record (decision D3: a safety tool must not leave what it
 * removed retrievable; store.js blankRemovedNarrations). Awaited by the
 * X-Card's finish, before any view is made again; a superseded narration is
 * hidden at read and not blanked — the table did not object to it. Canonical
 * GM; never throws.
 *
 * @param {string[]} narrationIds
 * @param {{ by?: "xcard"|"superseded", session?: string|null, res?: string|null }} [opts]
 * @returns {Promise<void>}
 */
export async function recordNarrationsRemoved(narrationIds, { by = 'xcard', session = null, res = null } = {}) {
  const ids = [...new Set((Array.isArray(narrationIds) ? narrationIds : []).filter(id => typeof id === 'string' && id))];
  if (!ids.length) return;
  recordEvent('narration.removed', { ...(session ? { session } : {}), ref: { res }, d: { narrationIds: ids, by } });
  if (by !== 'xcard' || !isCanonicalGM()) return;
  await onRecordChain(async () => {
    const { blankRemovedNarrations } = await import('./store.js');
    await blankRemovedNarrations(ids);
  }, 'blanking what the X-Card removed');
}

/**
 * Resolves once every event recorded so far on this client is written (or
 * dropped with a warning). Never rejects.
 *
 * @returns {Promise<void>}
 */
export function recordSettled() {
  return _chain.then(() => (_scheduled || _pending.length ? recordSettled() : undefined));
}

/** Test seam: forget what is queued. */
export function _resetRecordForTests() {
  _pending = [];
  _chain = Promise.resolve();
  _scheduled = false;
  _recordOpen.clear();
}
