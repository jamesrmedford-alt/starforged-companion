/**
 * STARFORGED COMPANION
 * src/narration/snapshotEvents.js — what makes the narrator's world snapshot out of date (issue #357)
 *
 * The narrator reads the whole world state as one frozen, cached block: a
 * snapshot taken once and sent byte for byte on every call (worldSnapshot.js
 * renders it, worldSnapshotStore.js keeps it). A new one costs a full cache
 * write, so one is taken only when something in SNAPSHOT_EVENTS says so.
 *
 * This is the one place that list lives (decided: it must be easy to change).
 *   - One row an event: its id, what it is, and whether it takes a new
 *     snapshot. The events that do not count are rows too, set to `false`, so
 *     turning one on is a one-word change here and nothing else.
 *   - Every trigger site reports its event by id to reportSnapshotEvent, which
 *     looks the id up here. No trigger site decides for itself. The checks the
 *     store makes at a narrator call (no snapshot yet, a record gone, the
 *     changes grown large, the cache expired) go through the same table
 *     (snapshotCauses).
 *   - An event marks the snapshot out of date. The next narrator call takes
 *     the new one, so several events between two calls cost one snapshot,
 *     which holds all of them. The snapshot's log names the ids that caused it.
 *
 * The mark is kept in a world setting of their own (`worldSnapshotEvents`),
 * so any GM's client can report and the narrating GM reads it. It is one
 * opaque "out of date" mark and its time — never which event set it (issue
 * #362 D3, the maintainer's answer A): every client holds a world setting, and
 * named marks (`plan_made`, `plan_decided`, `new_enemy_revealed`) told a
 * player at the console that a hidden plan was just made or decided for the
 * beat they watched. Which events they were stays on the reporting GM's client
 * (its own pending marks, and `snapshotEventDetail` for the snapshot page's
 * log). A leaf module (no imports): the stores that report — the plans, the
 * entity registry, the sector generator, the X-Card — import it without a
 * cycle.
 */

const MODULE_ID = 'starforged-companion';

/** The world setting that switches the world snapshot on (default on; registered in ui/settingsPanel.js). */
const WORLD_SNAPSHOT_SETTING = 'worldSnapshot';

/** The world setting that marks the snapshot out of date: `{ events: [{ id: OUT_OF_DATE, at }] }` — one mark. */
const SNAPSHOT_EVENTS_SETTING = 'worldSnapshotEvents';

/**
 * The one mark the world setting holds (issue #362 D3): some event that takes
 * a snapshot was reported, on some GM's client — nothing of which. Not a row
 * of SNAPSHOT_EVENTS (no trigger site reports it); snapshotCauses counts it.
 */
const OUT_OF_DATE = 'out_of_date';

/**
 * Every event the snapshot's rules know, and whether it takes a new snapshot.
 * `docs/decisions.md` ("The world snapshot") and the narrator-context flow doc
 * carry the same table: change a row here and there.
 */
export const SNAPSHOT_EVENTS = Object.freeze([
  // ── The session and its scenes ────────────────────────────────────────────
  { id: 'session_begin',          snapshot: true,  description: 'Begin a Session' },
  { id: 'no_snapshot',            snapshot: true,  description: 'a narration finds no snapshot stored for its session' },
  { id: 'scene_started',          snapshot: true,  description: 'the GM starts a scene (!scene start)' },
  { id: 'scene_ended',            snapshot: true,  description: 'the GM ends a scene (!scene end)' },
  // ── Major events ──────────────────────────────────────────────────────────
  { id: 'plan_made',              snapshot: true,  description: 'a hidden plan is made (a new enemy, a posed question, an expedition, an NPC\'s agenda, a vow, a discovery)' },
  { id: 'plan_decided',           snapshot: true,  description: 'a hidden plan is decided or corrected by a narration' },
  { id: 'plan_revealed',          snapshot: true,  description: 'a hidden plan\'s truth is revealed' },
  { id: 'plan_resolved',          snapshot: true,  description: 'a hidden plan\'s story ends' },
  { id: 'discovery_rolled',       snapshot: true,  description: 'Make a Discovery or Confront Chaos is rolled and narrated' },
  { id: 'new_enemy_revealed',     snapshot: true,  description: 'a price reveals a new enemy' },
  { id: 'sector_created',         snapshot: true,  description: 'a sector is created' },
  { id: 'sector_details_written', snapshot: true,  description: 'a new sector\'s settlement descriptions are written' },
  { id: 'entity_recorded',        snapshot: true,  description: 'a new entity is confirmed or created' },
  { id: 'threat_recorded',        snapshot: true,  description: 'a threat is recorded at significant salience or above' },
  // ── Retractions: the snapshot must never keep asserting removed content ───
  { id: 'xcard_played',           snapshot: true,  description: 'the X-Card is played' },
  { id: 'fact_retracted',         snapshot: true,  description: 'a fact is struck or corrected, and its copies retracted' },
  { id: 'plan_edited',            snapshot: true,  description: 'a GM edits a hidden plan' },
  { id: 'plan_retired',           snapshot: true,  description: 'a hidden plan is retired — a GM\'s Retire, its subject gone, an ended scene\'s unanswered mystery' },
  { id: 'record_removed',         snapshot: true,  description: 'a record the snapshot holds is gone or no longer stands' },
  // ── Size and age ──────────────────────────────────────────────────────────
  { id: 'changes_large',          snapshot: true,  description: 'the changes since the snapshot have grown large' },
  { id: 'cache_expired',          snapshot: true,  description: 'no narrator call for an hour: the cache has expired anyway' },
  // ── Not counted (decided): rows, so turning one on is a one-word change ───
  { id: 'oracle_seed_envisioned', snapshot: false, description: 'a routine oracle seed at an "envision" outcome (a Story Clue on a Gather Information hit)' },
  { id: 'oracle_yes_no',          snapshot: false, description: 'a yes/no answer from Ask the Oracle' },
  { id: 'oracle_table_rolled',    snapshot: false, description: 'an oracle table rolled with !oracle' },
  { id: 'price_paid',             snapshot: false, description: 'a price that reveals no new enemy (it routes a suffer move, or is told in the fiction)' },
  { id: 'plan_progressed',        snapshot: false, description: 'a hidden plan\'s clue is shown or its next step is played' },
  { id: 'sector_switched',        snapshot: false, description: 'the active sector is switched with !sector' },
].map(row => Object.freeze(row)));

const EVENT_BY_ID = new Map(SNAPSHOT_EVENTS.map(row => [row.id, row]));

/** Events reported on this client since its last snapshot, id → time (ms): seen at once, before the setting's write lands. */
const _local = new Map();

/**
 * The world's mark each event this client saved was written under, id →
 * markKey — which marks are this client's own, so the snapshot page's log can
 * name their events (namedSnapshotCauses; issue #362 D3).
 */
const _reportedUnder = new Map();

/**
 * Every event that takes a snapshot reported on this client, oldest first —
 * what the snapshot page's log names as a new snapshot's causes, now the
 * world's mark names none (issue #362 D3). Memory only; bounded.
 */
const _detail = [];
const DETAIL_KEPT = 100;

/**
 * The marks a snapshot taken on this client has answered (`id@time`), kept
 * until the setting has dropped them: the write that drops them takes a round
 * trip, and until it lands the stored list still names them — read as
 * pending, the same event reported again meanwhile would be taken for the
 * mark already answered and lost.
 */
const _answered = new Set();
const ANSWERED_KEPT = 200;
const markKey = (e) => `${e.id}@${e.at}`;

/** Register the pending-events setting. Call from `init`. */
export function registerSnapshotEventsSetting() {
  game.settings.register(MODULE_ID, SNAPSHOT_EVENTS_SETTING, {
    name:    'World snapshot — events since the last one',
    scope:   'world',
    config:  false,
    type:    Object,
    default: { events: [] },
  });
}

/** Whether the world snapshot is on (unregistered — a unit test — is on). */
export function worldSnapshotEnabled() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, WORLD_SNAPSHOT_SETTING) !== false;
  } catch {
    return true;
  }
}

/**
 * Of these event ids, the ones the table says take a new snapshot — each
 * once, in the order given. An id that is no row is dropped, with a warning.
 *
 * @param {string[]} ids
 * @returns {string[]}
 */
export function snapshotCauses(ids) {
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    // The world's opaque mark (issue #362 D3) takes a snapshot: whatever set it did.
    if (id === OUT_OF_DATE) {
      if (!out.includes(id)) out.push(id);
      continue;
    }
    const row = EVENT_BY_ID.get(id);
    if (!row) {
      console.warn(`${MODULE_ID} | world snapshot: "${id}" is not a row of SNAPSHOT_EVENTS — ignored.`);
      continue;
    }
    if (row.snapshot && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * What an event is, in the table's words — for the snapshot page's log, which
 * names the events that caused each new snapshot. The id itself for one that
 * is no row.
 *
 * @param {string} id
 * @returns {string}
 */
export function describeSnapshotEvent(id) {
  if (id === OUT_OF_DATE) return 'the world\'s mark: an event that takes a snapshot was reported on a GM\'s client (the mark names none)';
  return EVENT_BY_ID.get(id)?.description ?? String(id ?? '');
}

/** The events that take a snapshot reported on this client at or after `sinceMs`, each id once, oldest first. */
function snapshotEventDetail(sinceMs = 0) {
  const out = [];
  for (const e of _detail) {
    if (e.at >= (Number(sinceMs) || 0) && !out.includes(e.id)) out.push(e.id);
  }
  return out;
}

/**
 * A new snapshot's causes as the snapshot page's log names them (issue #362
 * D3): the world's mark names no event, so the events this client reported
 * since the snapshot being replaced (`sinceMs`) are named in its place when
 * the mark is this client's own; a mark another GM's client wrote stays
 * "out_of_date" — what set it is that client's to know. Memory only: after a
 * reload this client's own mark is "out_of_date" too.
 *
 * @param {Array<{ id: string, at: number }>} events — pendingSnapshotEvents' list, as the snapshot read it
 * @param {{ sinceMs?: number, also?: string[] }} [opts] — `also`: the causes the call found itself
 * @returns {string[]}
 */
export function namedSnapshotCauses(events, { sinceMs = 0, also = [] } = {}) {
  const own = new Set(_reportedUnder.values());
  const ids = (Array.isArray(events) ? events : [])
    .filter(e => !(e?.id === OUT_OF_DATE && own.has(markKey(e))))
    .map(e => e?.id);
  return snapshotCauses([...snapshotEventDetail(sinceMs), ...ids, ...(Array.isArray(also) ? also : [])]);
}

/** The setting's marks, as stored: `[{ id, at }]` — the one opaque mark (a world from before issue #362 D3 may hold named ones). Fail-open: none. */
function rawStoredEvents() {
  try {
    const events = globalThis.game?.settings?.get?.(MODULE_ID, SNAPSHOT_EVENTS_SETTING)?.events;
    return (Array.isArray(events) ? events : []).filter(e => typeof e?.id === 'string' && Number.isFinite(e.at));
  } catch {
    return [];
  }
}

/** The stored marks still waiting for a snapshot: those no snapshot on this client has answered. */
function storedEvents() {
  return rawStoredEvents().filter(e => !_answered.has(markKey(e)));
}

/** Drop the answered marks from the setting (read and set with no await between). A GM's write. */
async function dropAnsweredFromStore() {
  const stored = rawStoredEvents();
  const kept = stored.filter(e => !_answered.has(markKey(e)));
  if (kept.length === stored.length) return;
  if (globalThis.game?.user?.isGM !== true || typeof globalThis.game?.settings?.set !== 'function') return;
  await globalThis.game.settings.set(MODULE_ID, SNAPSHOT_EVENTS_SETTING, { events: kept });
}

/**
 * Report that something happened that may put the world snapshot out of
 * date. The table decides: an event whose row takes a snapshot is marked —
 * on this client at once, and in the world's setting for the GM who narrates
 * next — and the next narrator call takes the new snapshot. An event whose
 * row does not, or the same event reported again before that call, changes
 * nothing.
 *
 * Marks are a GM's to write (a world setting): every trigger site runs on a
 * GM's client. A report from a player's client is logged and dropped. With
 * the snapshot switched off nothing is marked.
 *
 * The world's setting is given one opaque mark (issue #362 D3) — the event's
 * id stays on this client (snapshotEventDetail, for the page's log). While a
 * mark no snapshot on this client has answered stands, any event is covered
 * by it and writes nothing: the next snapshot, which answers it, reads the
 * world after the event (the residual the named marks had for the same event
 * reported again — a report on another GM's client inside the round trip of
 * the snapshot that answers the mark — now holds for any event).
 *
 * @param {string} id — a SNAPSHOT_EVENTS row's id
 * @param {{ now?: number }} [opts]
 * @returns {boolean} whether the snapshot is now marked out of date for it
 */
export function reportSnapshotEvent(id, { now = Date.now() } = {}) {
  const row = EVENT_BY_ID.get(id);
  if (!row) {
    console.warn(`${MODULE_ID} | world snapshot: "${id}" is not a row of SNAPSHOT_EVENTS — nothing reported.`);
    return false;
  }
  if (!row.snapshot || !worldSnapshotEnabled()) return false;
  if (globalThis.game?.user?.isGM !== true) {
    console.debug?.(`${MODULE_ID} | world snapshot: "${id}" reported on a player's client — not marked (a GM's client reports it).`);
    return false;
  }
  _detail.push({ id, at: now });
  if (_detail.length > DETAIL_KEPT) _detail.splice(0, _detail.length - DETAIL_KEPT);
  if (_local.has(id) || storedEvents().length) return true;
  _local.set(id, now);
  persistEvents().catch(err =>
    console.warn(`${MODULE_ID} | world snapshot: the "${id}" mark was not saved — it stands on this client only:`, err?.message ?? err));
  return true;
}

/** This client's own marks, by event id (memory — the world's setting names none). */
function localEvents() {
  return [..._local].map(([id, at]) => ({ id, at }));
}

/**
 * Write the world's mark (read and set with no await between): one opaque
 * mark covering this client's events and any mark the setting still holds,
 * timed after all of them — a new mark, so a GM whose snapshot answered an
 * older one reads it as pending (issue #362 D3). A mark the world took leaves
 * this client's own list: the setting holds it from then on, and the GM whose
 * snapshot answers it clears it there — kept here too, this client would
 * write it back with its next mark.
 */
async function persistEvents() {
  if (typeof globalThis.game?.settings?.set !== 'function') return;
  const writing = localEvents();
  if (!writing.length) return;
  const covered = [...storedEvents(), ...writing];
  const mark = { id: OUT_OF_DATE, at: Math.max(...writing.map(e => e.at), ...storedEvents().map(e => e.at + 1)) };
  // Known as this client's own from the moment it is written: a snapshot read
  // while the write is out names its events, not "out_of_date". A refused
  // write leaves no such mark stored, so the events are reported afresh.
  for (const e of writing) _reportedUnder.set(e.id, markKey(mark));
  await globalThis.game.settings.set(MODULE_ID, SNAPSHOT_EVENTS_SETTING, { events: [mark] });
  for (const e of writing) if (_local.get(e.id) === e.at) _local.delete(e.id);
  // A snapshot taken while this write was out answered every mark it carries:
  // it answered this one too.
  if (covered.every(e => _answered.has(markKey(e)))) {
    _answered.add(markKey(mark));
    await dropAnsweredFromStore();
  }
}

/**
 * The events reported since the last snapshot — the world's mark and this
 * client's own events (by id: they are its own) — oldest first.
 *
 * @returns {Array<{ id: string, at: number }>}
 */
export function pendingSnapshotEvents() {
  return [...storedEvents(), ...localEvents()].sort((a, b) => a.at - b.at);
}

/**
 * A snapshot is being taken: forget the events it answers — the marks that
 * were pending when its records were read (pendingSnapshotEvents' list). They
 * stop counting on this client at once; the setting drops them when its write
 * lands. An event reported after that read — the same one again included —
 * is a new mark, for the next snapshot. A GM's write; never throws.
 *
 * @param {Array<{ id: string, at: number }>} events
 * @returns {Promise<void>}
 */
export async function clearSnapshotEvents(events) {
  for (const e of Array.isArray(events) ? events : []) {
    if (typeof e?.id !== 'string' || !Number.isFinite(e.at)) continue;
    _answered.add(markKey(e));
    if (_local.get(e.id) === e.at) _local.delete(e.id);
  }
  for (const key of [..._answered].slice(0, Math.max(0, _answered.size - ANSWERED_KEPT))) _answered.delete(key);
  try {
    await dropAnsweredFromStore();
  } catch (err) {
    console.warn(`${MODULE_ID} | world snapshot: the events the new snapshot answered were not cleared:`, err?.message ?? err);
  }
}

/** Test seam: forget this client's marks. */
export function _resetSnapshotEventsForTests() {
  _local.clear();
  _answered.clear();
  _reportedUnder.clear();
  _detail.length = 0;
}
