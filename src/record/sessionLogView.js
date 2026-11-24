/**
 * STARFORGED COMPANION
 * src/record/sessionLogView.js — the Session Log page, a view of the session record (issue #382)
 *
 * A session's page in the Session Log journal is rendered from
 * `readRecord({ session })`, in code — no model:
 *
 *   What happened            a line a beat: who, their words, the move and its
 *                            outcome, what changed on a sheet. No narration is
 *                            reprinted; the chat has it.
 *   Established and standing the session's truths that stand, names corrected.
 *   Corrected by the table   a name changed (the new name; the old one is
 *                            written nowhere), a strike, "removed by the
 *                            table" for an X-Card, with nothing of it.
 *   Story                    the session's story (the one End a Session writes).
 *
 * The page's flag is the record; its body is this rendered mirror, keyed by
 * the hash of the read it was made from (`sessionRecord.views.log`): a
 * correction changes the hash and the page is rendered again — so a changed
 * name, a strike or an X-Card reaches the page with no code of its own
 * (known-issues SESSION-LOG-KEEPS-OLD-NAMES).
 *
 * Rendered on the canonical GM when its hash no longer matches: at once for a
 * session's begin and end and for a correction, and at most once a minute
 * during play. A page from before the record is never rendered here. With
 * `sessionLogAutoWrite` off the record is still written — it is the module's
 * memory — and the page's body is its title alone.
 */

import { readRecord, recordHash } from './read.js';
import { onRecordChain } from './record.js';
import { onRecordWritten, storedRecordView, writeRecordView } from './store.js';
import { pageMeta, recordPageOf, sessionLogPages } from './pages.js';
import { isCanonicalGM } from '../multiplayer/gmGate.js';

const MODULE_ID = 'starforged-companion';

/** The least time between two renders of one page during play. */
const RENDER_INTERVAL_MS = 60_000;

/** The kinds a page is rendered for at once: the session's edges, and every correction. */
const RENDER_NOW_KINDS = new Set(['session.begun', 'session.ended', 'truth.struck', 'name.changed', 'narration.removed']);

const OUTCOMES = { strong_hit: 'strong hit', weak_hit: 'weak hit', miss: 'miss' };
const METERS = { health: 'Health', spirit: 'Spirit', supply: 'Supply', momentum: 'Momentum', xp: 'XP', integrity: 'Integrity', 'companion-health': 'Companion health' };
const TOLD = {
  vignette_open: 'An opening scene was told.',
  vignette_close: 'A closing scene was told, elsewhere.',
  oracle: 'An oracle\'s answer was told.',
  clock: 'A clock\'s advance was told.',
  vow: 'A vow\'s swearing was told.',
  inciting: 'The inciting incident was told.',
  reflection: 'A reflection was published.',
  round: 'The round was told.',
};

const _lastRender = new Map();   // session → when its page was last rendered (ms)
const _timers = new Map();       // session → the timer of its next render

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function autoWriteEnabled() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, 'sessionLogAutoWrite') !== false;
  } catch {
    return true;
  }
}

/** "Momentum 2 → 3", "Wounded marked", "Quests legacy 4 → 6" — one sheet change, in words. */
function changeText(c) {
  const what = String(c.what ?? '');
  if (what.startsWith('impact:')) {
    const name = what.slice(7);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${c.to ? 'marked' : 'cleared'}`;
  }
  if (what.startsWith('legacy:')) {
    const name = what.slice(7);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} legacy ${c.from ?? '?'} → ${c.to ?? '?'} ticks`;
  }
  return `${METERS[what] ?? what} ${c.from ?? '?'} → ${c.to ?? '?'}`;
}

/** A beat's sheet changes, each named for whose sheet it is when that is not the beat's own character. */
function changesText(beat) {
  return beat.changes
    .filter(c => c.cause !== 'mirror')
    .map(c => (c.actor && c.actor !== beat.who.actor && c.name ? `${c.name}: ${changeText(c)}` : changeText(c)))
    .join('. ');
}

function moveText(move) {
  const outcome = move.upgraded
    ? `${OUTCOMES[move.upgraded.from] ?? move.upgraded.from ?? '?'}, made a ${OUTCOMES[move.outcome] ?? move.outcome ?? '?'} by ${move.upgraded.how === 'burn' ? 'burning momentum' : 'an asset'}`
    : (OUTCOMES[move.outcome] ?? move.outcome ?? '');
  return [move.name ?? move.moveId ?? 'A move', outcome].filter(Boolean).join(', ') + (move.match ? ' (a match)' : '');
}

/**
 * How a line came to the table, for whether its text is someone's own words:
 * typed in chat, or a Batch Mode round's entry. A card's button posts the
 * module's own wording of the move (or an earlier line again), a ship token's
 * drop a Set a Course for it — the move is what the page lists for those.
 */
const OWN_WORDS = new Set(['typed', 'round', 'narrate-only']);

/** One beat as one line of the page, or '' for a beat the page does not list. */
function beatLine(beat) {
  const who = beat.who.name ? `<strong>${escapeHtml(beat.who.name)}</strong>` : '';
  const parts = [];
  if (beat.line?.text && !beat.line.repost && OWN_WORDS.has(beat.line.via)) parts.push(`“${escapeHtml(beat.line.text)}”`);
  if (beat.move) parts.push(escapeHtml(moveText(beat.move)));
  const changes = changesText(beat);
  if (changes) parts.push(escapeHtml(changes));
  if (beat.removed) parts.push('<em>its telling was removed by the table</em>');
  if (!parts.length) {
    if (beat.kind === 'table' || !beat.told) return '';
    const told = TOLD[beat.told.mode];
    return told ? `<li>${who ? `${who} — ` : ''}${escapeHtml(told)}</li>` : '';
  }
  const body = parts.join(' — ');
  const byHand = beat.kind === 'table' && beat.changes.some(c => c.cause === 'sheet') ? ' <em>(changed on the sheet)</em>' : '';
  return `<li>${who ? `${who}: ` : ''}${body}${/[.!?”>]$/.test(body) ? '' : '.'}${byHand}</li>`;
}

function subjectText(subject) {
  if (!subject || typeof subject !== 'object') return '';
  return typeof subject.text === 'string' ? subject.text : (typeof subject.name === 'string' ? subject.name : '');
}

function truthLine(t) {
  const subject = subjectText(t.subject);
  const whose = t.by === 'gm' ? ' <em>(set by the GM)</em>' : t.by === 'player' ? ' <em>(set by a player)</em>' : '';
  return `<li>${subject ? `<strong>${escapeHtml(subject)}</strong> — ` : ''}${escapeHtml(t.fact)}${whose}</li>`;
}

function correctionLine(c) {
  if (c.kind === 'name') {
    // The new name alone: the old one is written nowhere a view shows.
    const how = c.how === 'corrected' ? 'A name was corrected' : 'A name was changed';
    return `<li>${how}: <strong>${escapeHtml(c.to)}</strong>${c.about ? ` (${escapeHtml(c.about)})` : ''}.</li>`;
  }
  if (c.kind === 'strike') {
    const subject = subjectText(c.subject);
    const was = `${subject ? `${escapeHtml(subject)} — ` : ''}<s>${escapeHtml(c.fact)}</s>`;
    return `<li>Struck: ${was}${c.replacedBy ? ` — now: ${escapeHtml(c.replacedBy)}` : ''}</li>`;
  }
  if (c.kind === 'removed') {
    return `<li>${c.count === 1 ? 'One beat was' : `${c.count} beats were`} removed by the table.</li>`;
  }
  return '';
}

/**
 * The page's body for one session of the read.
 *
 * @param {Object} session — one of readRecord's sessions
 * @param {{ story?: string, enabled?: boolean }} [opts] — the session's story; `enabled: false` gives the title alone
 * @returns {string} HTML
 */
export function renderSessionLogBody(session, { story = '', enabled = true } = {}) {
  const lines = [`<h2>${escapeHtml(session?.name || 'Session')}</h2>`];
  if (!enabled || !session) return lines.join('');

  const beats = session.beats.map(beatLine).filter(Boolean);
  lines.push('<h3>What happened</h3>');
  lines.push(beats.length ? `<ul>${beats.join('')}</ul>` : '<p><em>Nothing recorded yet.</em></p>');

  const standing = session.open.established;
  if (standing.length) lines.push('<h3>Established and standing</h3>', `<ul>${standing.map(truthLine).join('')}</ul>`);

  const corrections = session.corrections.map(correctionLine).filter(Boolean);
  if (corrections.length) lines.push('<h3>Corrected by the table</h3>', `<ul>${corrections.join('')}</ul>`);

  const told = typeof story === 'string' ? story.trim() : '';
  if (told) {
    lines.push('<h3>Story</h3>');
    for (const p of told.split(/\n\n+/)) lines.push(`<p>${escapeHtml(p.trim())}</p>`);
  }
  return lines.join('');
}

/**
 * Render a session's page from the record when its stored hash no longer
 * matches. Canonical GM (a journal write); a page from before the record is
 * left exactly as it is. On the record's own chain, after every event queued
 * so far is written and never between two appends to the page. Never throws.
 *
 * @param {string} sessionId
 * @returns {Promise<boolean>} whether the page was rewritten
 */
export async function renderSessionLog(sessionId) {
  if (!isCanonicalGM()) return false;
  return (await onRecordChain(() => renderNow(sessionId), `rendering the Session Log page of session ${sessionId}`)) === true;
}

async function renderNow(sessionId) {
  try {
    const meta = pageMeta(recordPageOf(sessionId));
    if (!meta.record) return false;
    const read = readRecord({ session: sessionId });
    const session = read.sessions[0];
    if (!session) return false;
    const enabled = autoWriteEnabled();
    const sourceHash = recordHash([read.hash, meta.story, meta.name, enabled]);
    if (storedRecordView(sessionId, 'log')?.sourceHash === sourceHash) return false;
    _lastRender.set(sessionId, Date.now());
    return await writeRecordView(sessionId, 'log', { sourceHash, renderedAt: Date.now() }, {
      'text.format': 1,
      'text.content': renderSessionLogBody(session, { story: meta.story, enabled }),
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | the Session Log page of session ${sessionId} could not be rendered:`, err?.message ?? err);
    return false;
  }
}

/** Render a session's page now, or once its minute is up. */
function scheduleRender(sessionId, { now = false } = {}) {
  const wait = now ? 0 : Math.max(0, (_lastRender.get(sessionId) ?? 0) + RENDER_INTERVAL_MS - Date.now());
  if (_timers.has(sessionId)) {
    if (!now) return;
    clearTimeout(_timers.get(sessionId));
  }
  const timer = setTimeout(() => {
    _timers.delete(sessionId);
    renderSessionLog(sessionId);
  }, wait);
  timer?.unref?.();
  _timers.set(sessionId, timer);
}

/**
 * Keep the Session Log's pages in step with the record: registered once at
 * `ready` (index.js). A name change reaches every session's page that holds
 * the old name — each is read again, and rewritten only when its hash moved.
 */
export function registerSessionLogView() {
  if (registerSessionLogView._installed) return;
  registerSessionLogView._installed = true;
  onRecordWritten((sessionIds, events) => {
    if (!isCanonicalGM()) return;
    const now = events.some(e => RENDER_NOW_KINDS.has(e.k));
    const everywhere = events.some(e => e.k === 'name.changed' || e.k === 'narration.removed');
    const sessions = everywhere
      ? sessionLogPages().map(p => pageMeta(p)).filter(m => m.record && m.sessionId).map(m => m.sessionId)
      : sessionIds;
    for (const sessionId of new Set([...sessionIds, ...sessions])) scheduleRender(sessionId, { now });
  });
}
