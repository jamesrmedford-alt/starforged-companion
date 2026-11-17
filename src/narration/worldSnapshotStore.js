/**
 * STARFORGED COMPANION
 * src/narration/worldSnapshotStore.js — the narrator's world snapshot, kept (issue #357)
 *
 * A prompt-cache read needs the cached text byte-identical to an earlier
 * request's, and the world changes on nearly every beat: new lore, a threat's
 * severity, a plan's reveal. So the world is not rendered per call. It is
 * rendered once (worldSnapshot.js), the text is stored, and that stored text
 * is what every narrator call sends until a new snapshot is taken. This
 * module is the store and the decision.
 *
 * **Where it is kept.** One page of the GM-only World Journal — Secrets
 * journal, its record in the page's `worldSnapshot` flag: the text holds the
 * hidden plans, and a world setting is sent to every client. The page's body
 * shows the GM the snapshot and the log of new ones. So:
 *   - only a GM's client reads it. Narration on a player's own key (no keyed
 *     GM connected) has no snapshot and is sent as it was before one;
 *   - only the canonical GM writes it, like every narrator side-data write;
 *   - it survives a reload: the next narration reads the stored text and sends
 *     it unchanged, so it reads the same cache entry.
 *
 * **When a new one is taken** (resolveWorldSnapshot, at a narrator call):
 * when an event reported since the last one takes a snapshot, or when this
 * call finds no snapshot for its session, a record the snapshot holds gone,
 * the changes grown large, or the cache expired — each looked up in the one
 * table (snapshotEvents.js SNAPSHOT_EVENTS). Otherwise the stored snapshot is
 * sent as it is, with what changed since rendered beside it.
 */

import { isCanonicalGM } from '../multiplayer/gmGate.js';
import { settledWithin, WORLD_WRITE_WAIT_MS } from '../multiplayer/settleWithin.js';
import { findWorldJournal, getOrCreateWorldJournal } from '../world/worldJournal.js';
import {
  collectWorldUnits, renderWorldSnapshot, renderUnitSections, diffWorldUnits, estimateSnapshotTokens,
} from './worldSnapshot.js';
import {
  worldSnapshotEnabled, pendingSnapshotEvents, clearSnapshotEvents, snapshotCauses, describeSnapshotEvent, namedSnapshotCauses,
} from './snapshotEvents.js';
import { SNAPSHOT_BLOCK_HEADING } from './narratorPrompt.js';

const MODULE_ID = 'starforged-companion';

/** The page flag that holds the stored snapshot. */
const SNAPSHOT_FLAG = 'worldSnapshot';
const SNAPSHOT_PAGE_NAME = 'Narrator — world snapshot';

/**
 * How large the changes since a snapshot may grow before a new one is taken:
 * in estimated tokens, and as a share of the snapshot. A starting point
 * (issue #357) — a new snapshot pays for itself after about
 * 2 × (snapshot size ÷ changes size) calls.
 */
export const CHANGES_MAX_TOKENS = 2000;
export const CHANGES_MAX_SHARE  = 0.25;

/** How many new snapshots the page's log keeps. */
const LOG_ENTRIES = 60;

/** The snapshot this client last took or read — what a narration sends when the page's write is still out, or was refused. */
let _last = null;

/** When this client last sent a narrator request that carried the snapshot (ms). */
let _lastSentAt = 0;

/** One page write at a time on this client. */
let _writes = Promise.resolve();
function queueWrite(task) {
  const run = _writes.then(task, task);
  _writes = run.catch(() => {});
  return run;
}

// ─────────────────────────────────────────────────────────────────────────────
// The stored page
// ─────────────────────────────────────────────────────────────────────────────

function snapshotPageOf(journal) {
  return (journal?.pages?.contents ?? []).find(p => p?.flags?.[MODULE_ID]?.[SNAPSHOT_FLAG]) ?? null;
}

/** A stored record that can be sent: its text a snapshot block, its manifest a list. Else null. */
function usable(record) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.text !== 'string' || !record.text.startsWith(`${SNAPSHOT_BLOCK_HEADING}\n`)) return null;
  if (typeof record.sessionId !== 'string' || !Array.isArray(record.manifest)) return null;
  return record;
}

/** The snapshot the Secrets journal holds, or null — on a player's client, always null. */
function readStoredSnapshot() {
  try {
    return usable(snapshotPageOf(findWorldJournal('secrets'))?.flags?.[MODULE_ID]?.[SNAPSHOT_FLAG]);
  } catch (err) {
    console.debug?.(`${MODULE_ID} | world snapshot: the stored snapshot could not be read:`, err?.message ?? err);
    return null;
  }
}

/** The newest snapshot of `sessionId` this client can send: the stored page's, or the one it took itself. */
function currentSnapshot(sessionId) {
  const mine = [readStoredSnapshot(), usable(_last)].filter(r => r && r.sessionId === sessionId);
  if (!mine.length) return null;
  return mine.sort((a, b) => String(b.takenAt ?? '').localeCompare(String(a.takenAt ?? '')))[0];
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** What the GM reads on the page: what it is, the log of new snapshots, and the text as sent. */
function renderSnapshotPage(record) {
  const when = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : escapeHtml(d.toLocaleString());
  };
  const session = (e) => (Number.isFinite(e?.sessionNumber) ? `Session ${e.sessionNumber}` : escapeHtml(e?.sessionId ?? '—'));
  // Each cause by its id — the row of the events table it is — and what that row says.
  const because = (e) => (Array.isArray(e?.causes) ? e.causes : [])
    .map(id => `<code>${escapeHtml(id)}</code> ${escapeHtml(describeSnapshotEvent(id))}`).join('<br>');
  const rows = [...(Array.isArray(record.log) ? record.log : [])].reverse().map(e =>
    `<tr><td>${when(e.at)}</td><td>${session(e)}</td><td>${because(e)}</td>` +
    `<td>${Number(e.tokens) || 0}</td><td>${Number(e.units) || 0}</td><td>${Number(e.changesTokens) || 0}</td></tr>`).join('');
  return [
    `<p>The world as the narrator is sent it: rendered once, stored here, and sent unchanged with every narration ` +
    `until a new snapshot is taken, so it is read from the prompt cache. It holds the hidden plans — this journal is ` +
    `the GMs' alone. It is rewritten with each new snapshot; an edit made here is lost.</p>`,
    `<p><strong>${session(record)}</strong> · taken ${when(record.takenAt)} · about ${Number(record.tokens) || 0} tokens · ` +
    `${record.manifest.length} records</p>`,
    `<h3>New snapshots</h3>`,
    `<p>Newest first, with what caused each one. A new snapshot is written to the prompt cache in full, so a ` +
    `session that takes one on most narrations is paying for it: the Narrator Usage page shows the cost.</p>`,
    `<table><thead><tr><th>Taken</th><th>Session</th><th>Because</th><th>Tokens</th><th>Records</th>` +
    `<th>Changes it replaced (tokens)</th></tr></thead><tbody>${rows}</tbody></table>`,
    `<h3>The snapshot, as sent</h3>`,
    `<pre>${escapeHtml(record.text)}</pre>`,
  ].join('');
}

/**
 * Store a snapshot on its page, with its line added to the page's log. The
 * record holds no object the next write could merge into: Foundry merges a
 * flag key by key, and a manifest kept as an object would keep every key a
 * later snapshot dropped — its records then read as removed, for good.
 */
async function writeSnapshotPage(record, logEntry) {
  const journal = await getOrCreateWorldJournal('secrets');
  if (!journal) throw new Error('the Secrets journal could not be opened');
  const page = snapshotPageOf(journal);
  const earlier = page?.flags?.[MODULE_ID]?.[SNAPSHOT_FLAG]?.log;
  const data = { ...record, log: [...(Array.isArray(earlier) ? earlier : []), logEntry].slice(-LOG_ENTRIES) };
  const content = renderSnapshotPage(data);
  if (!page) {
    await journal.createEmbeddedDocuments('JournalEntryPage', [{
      name:  SNAPSHOT_PAGE_NAME,
      type:  'text',
      text:  { format: 1, content },
      flags: { [MODULE_ID]: { [SNAPSHOT_FLAG]: data } },
    }]);
    return;
  }
  await page.setFlag(MODULE_ID, SNAPSHOT_FLAG, data);
  try {
    await page.update({ text: { format: 1, content } });
  } catch (err) {
    console.warn(`${MODULE_ID} | world snapshot: the page's body was not updated (the stored snapshot stands):`, err?.message ?? err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Take, or send the one held
// ─────────────────────────────────────────────────────────────────────────────

/** Whether the cache entry that holds `held` has lapsed: no request has carried a snapshot for `cacheTtlMs`. */
function cacheExpired(held, { now, lastNarrationAt, cacheTtlMs }) {
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs <= 0) return false;
  const lastUse = Math.max(Date.parse(held.takenAt) || 0, _lastSentAt, Number(lastNarrationAt) || 0);
  return now - lastUse >= cacheTtlMs;
}

/**
 * The world snapshot a narrator call sends, and what has changed since it was
 * taken — taking a new one first when the table says so.
 *
 * Null when this narration has no snapshot: the switch is off, this is a
 * player's client (the page is the GMs'), no session, the world could not be
 * read, or a new snapshot is due and this GM is not the canonical one. The
 * request is then built as it was before the snapshot.
 *
 * @param {Object} campaignState — the narration's campaignState (its session)
 * @param {Object} [opts]
 * @param {Object} [opts.world] — the campaignState to read the world from (the store's; default the narration's)
 * @param {Object[]} [opts.progressTracks] — the open tracks
 * @param {boolean} [opts.summaries] — earlier sessions' summaries
 * @param {{ threats?: boolean, factions?: boolean, lore?: boolean }} [opts.include]
 * @param {number} [opts.now] — ms
 * @param {number|null} [opts.lastNarrationAt] — when the session's newest narrator card posted (ms)
 * @param {number} [opts.cacheTtlMs] — the cached blocks' lifetime
 * @returns {Promise<{ text: string, changesText: string, units: Object[], takenAt: string,
 *   causes: string[], fresh: boolean }|null>} `units`: the world's units as they stand now
 */
export async function resolveWorldSnapshot(campaignState, {
  world = campaignState, progressTracks = [], summaries = true, include = {},
  now = Date.now(), lastNarrationAt = null, cacheTtlMs = 60 * 60 * 1000,
} = {}) {
  if (!worldSnapshotEnabled() || globalThis.game?.user?.isGM !== true) return null;
  const sessionId = campaignState?.currentSessionId ?? null;
  if (!sessionId) return null;
  try {
    // Read with no await between: the events pending now, the world now.
    const reported = pendingSnapshotEvents();
    const units = collectWorldUnits(world, { progressTracks, summaries, include });
    const held = currentSnapshot(sessionId);
    const diff = held ? diffWorldUnits(held.manifest, units) : { changed: [], removed: [] };
    const changesText = renderUnitSections(diff.changed);
    const changesTokens = estimateSnapshotTokens(changesText);

    const found = [];
    if (!held) found.push('no_snapshot');
    else {
      if (diff.removed.length) found.push('record_removed');
      if (changesTokens > CHANGES_MAX_TOKENS || changesTokens > (Number(held.tokens) || 0) * CHANGES_MAX_SHARE) found.push('changes_large');
      if (cacheExpired(held, { now, lastNarrationAt, cacheTtlMs })) found.push('cache_expired');
    }
    const due = snapshotCauses([...reported.map(e => e.id), ...found]);
    if (!due.length) {
      _last = held;
      return { text: held.text, changesText, units, takenAt: held.takenAt, causes: [], fresh: false };
    }
    // A new snapshot is the canonical GM's to take. Without one, this
    // narration is sent with none: the snapshot held may assert what a
    // retraction removed.
    if (!isCanonicalGM()) return null;
    // What caused it, as the page's log names it: the world's mark names no
    // event (issue #362 D3), so the events this client reported since the
    // snapshot it replaces are named in its place.
    const causes = namedSnapshotCauses(reported, { sinceMs: held ? (Date.parse(held.takenAt) || 0) : 0, also: found });

    const activeSectorId = campaignState?.activeSectorId ?? world?.activeSectorId ?? null;
    const activeSector = (world?.sectors ?? []).find(s => s?.id === activeSectorId)?.name ?? null;
    const rendered = renderWorldSnapshot(units, { activeSector });
    const record = {
      v: 1, sessionId,
      sessionNumber: Number.isFinite(Number(campaignState?.sessionNumber)) ? Number(campaignState.sessionNumber) : null,
      takenAt: new Date(now).toISOString(),
      causes, text: rendered.text, manifest: rendered.manifest, tokens: rendered.tokens,
    };
    _last = record;
    // The events it answers stop counting now; one reported from here on is the next snapshot's.
    const cleared = clearSnapshotEvents(reported);
    const stored = queueWrite(() => writeSnapshotPage(record, {
      at: record.takenAt, sessionId, sessionNumber: record.sessionNumber, causes,
      tokens: record.tokens, units: record.manifest.length, changesTokens,
    })).catch(err =>
      console.warn(`${MODULE_ID} | world snapshot: the new snapshot was not stored — this client keeps it until the page takes one:`, err?.message ?? err));
    await settledWithin(Promise.all([cleared, stored]), WORLD_WRITE_WAIT_MS, 'world snapshot: storing the new snapshot');
    console.debug?.(`${MODULE_ID} | world snapshot: new snapshot (${causes.join(', ')}) — about ${record.tokens} tokens, ${record.manifest.length} records.`);
    return { text: record.text, changesText: '', units, takenAt: record.takenAt, causes, fresh: true };
  } catch (err) {
    console.warn(`${MODULE_ID} | world snapshot: could not be read or taken — this narration is sent without one:`, err?.message ?? err);
    return null;
  }
}

/**
 * A narrator request that carries the snapshot is being sent: every read of
 * the cache restarts its hour, so this is what the expiry check counts from.
 *
 * @param {number} [now] — ms
 */
export function noteWorldSnapshotSent(now = Date.now()) {
  _lastSentAt = Math.max(_lastSentAt, Number(now) || 0);
}

/** Test seam: forget what this client holds in memory (a page reload). */
export function _resetWorldSnapshotStoreForTests() {
  _last = null;
  _lastSentAt = 0;
  _writes = Promise.resolve();
}
