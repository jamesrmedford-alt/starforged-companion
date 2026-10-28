/**
 * STARFORGED COMPANION
 * src/private-channel/transcript.js — per-player private-channel transcript storage
 *
 * Storage model (issue #226 (Private Channel) §5): one JournalEntry per player,
 * named "Private Channel — {playerName}", in the existing "Starforged Companion"
 * folder, with per-player ownership ({ default: NONE, [playerId]: OWNER,
 * [gmId]: OBSERVER }). One embedded page per session, matched on a sessionId
 * flag so a resume lands on the right page regardless of the date-derived name.
 *
 * Writes are debounced: turns accumulate in a module-scoped in-memory buffer
 * (never on campaignState) and flush 5 s after the last append, or immediately
 * on window close / session end, or when the page is hidden or unloaded. This
 * avoids a Foundry document write per message while keeping transcripts
 * durable across unexpected disconnects.
 *
 * A player's flushes run one at a time, and turns leave the buffer only once
 * their page write lands (issue #300 F01): a flush used to drop its turns
 * before writing, so a failed write lost them, and two overlapping flushes
 * each appended to the same old page content — the later write erased the
 * other's turns. A failed batch goes back ahead of newer turns, with its
 * session id, and is retried.
 */

const MODULE_ID   = "starforged-companion";
const FOLDER_NAME = "Starforged Companion";
const FLAG_KEY    = "privateChannelPage";
const DEFAULT_DEBOUNCE_MS = 5000;
/** Automatic retries after a failed write (5 s, 10 s, 15 s); the next flush trigger retries after that. */
const MAX_AUTO_RETRIES = 3;

// userId → { batches: Batch[], timerId, chain: Promise, failures: number }
// Batch = { sessionId: string, turns: Turn[] } — turns waiting for their page
// write, oldest first; the session id is captured on the batch's first append.
// Turn  = { who: "player"|"narrator", name: string, text: string }
const _buffers = new Map();


// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render a list of turns to the speaker-attributed paragraph HTML used on the
 * session page (issue #226 (Private Channel) §5.4).
 * @param {Array<{who:string,name:string,text:string}>} turns
 * @returns {string}
 */
export function renderTurnsHtml(turns) {
  return (Array.isArray(turns) ? turns : [])
    .filter(t => t && typeof t.text === "string" && t.text.trim())
    .map(t => {
      const who  = t.who === "narrator" ? "narrator" : "player";
      const name = escapeHtml(t.name || (who === "narrator" ? "Narrator" : "You"));
      return `<p class="pc-turn pc-turn-${who}"><strong>${name}:</strong> ${escapeHtml(t.text)}</p>`;
    })
    .join("");
}


// ─────────────────────────────────────────────────────────────────────────────
// Journal + page resolution
// ─────────────────────────────────────────────────────────────────────────────

function currentSessionId() {
  try { return game.settings?.get?.(MODULE_ID, "campaignState")?.currentSessionId ?? ""; }
  catch { return ""; }
}

function journalNameFor(userId) {
  const player = game.users?.get?.(userId);
  return `Private Channel — ${player?.name ?? userId}`;
}

/** Prefer the connected GM; fall back to any GM; null if none (test/transient). */
function resolveGmUserId() {
  const users = game.users?.contents ?? game.users ?? [];
  const list  = Array.isArray(users) ? users : (users.contents ?? []);
  return (list.find(u => u?.isGM && u?.active) ?? list.find(u => u?.isGM))?.id ?? null;
}

/**
 * Build the ownership object for a player's private journal. Collapses to a
 * single OWNER when the player is the GM (solo-GM play) or when no GM exists.
 */
export function buildOwnership(userId) {
  const L = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS ?? { NONE: 0, OBSERVER: 2, OWNER: 3 };
  const ownership = { default: L.NONE, [userId]: L.OWNER };
  const gmId = resolveGmUserId();
  if (gmId && gmId !== userId) ownership[gmId] = L.OBSERVER;
  return ownership;
}

function findPrivateJournal(userId) {
  const name = journalNameFor(userId);
  return game.journal?.getName?.(name)
      ?? game.journal?.find?.(j => j.name === name)
      ?? null;
}

async function getOrCreatePrivateJournal(userId) {
  const existing = findPrivateJournal(userId);
  if (existing) return existing;

  // Folder lookup mirrors worldJournal.js; create lazily, tolerate failure.
  let folderId = null;
  try {
    const folder = game.folders?.find(f => f.type === "JournalEntry" && f.name === FOLDER_NAME)
      ?? (globalThis.Folder?.create
            ? await globalThis.Folder.create({ name: FOLDER_NAME, type: "JournalEntry" })
            : null);
    folderId = folder?.id ?? null;
  } catch (err) {
    console.warn(`${MODULE_ID} | privateChannel: folder resolve failed:`, err?.message ?? err);
  }

  try {
    return await JournalEntry.create({
      name:      journalNameFor(userId),
      folder:    folderId,
      ownership: buildOwnership(userId),
      flags:     { [MODULE_ID]: { privateChannelOwner: userId } },
    }) ?? null;
  } catch (err) {
    console.error(`${MODULE_ID} | privateChannel: journal create failed:`, err?.message ?? err);
    return null;
  }
}

function findSessionPage(journal, sessionId) {
  return (journal?.pages?.contents ?? []).find(
    p => p?.flags?.[MODULE_ID]?.[FLAG_KEY]?.sessionId === sessionId,
  ) ?? null;
}

async function getOrCreateSessionPage(journal, sessionId) {
  if (!journal) return null;
  const existing = findSessionPage(journal, sessionId);
  if (existing) return existing;

  const now  = new Date().toISOString();
  const name = sessionId ? `Session ${sessionId} — ${now.slice(0, 16).replace("T", " ")}`
                         : `Session — ${now}`;
  try {
    const created = await journal.createEmbeddedDocuments("JournalEntryPage", [{
      name,
      type:  "text",
      text:  { format: 1, content: "" },
      flags: { [MODULE_ID]: { [FLAG_KEY]: { sessionId, createdAt: now } } },
    }]);
    return Array.isArray(created) ? created[0] : created;
  } catch (err) {
    console.error(`${MODULE_ID} | privateChannel: session page create failed:`, err?.message ?? err);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the current session's transcript HTML for a player, or "" when none
 * exists. Read-only — never creates the journal or page.
 *
 * @param {string} userId
 * @param {string} sessionId
 * @returns {Promise<string>}
 */
export async function loadCurrentSessionTranscript(userId, sessionId) {
  const journal = findPrivateJournal(userId);
  if (!journal) return "";
  const page = findSessionPage(journal, sessionId);
  return page?.text?.content ?? "";
}

/**
 * Buffer a turn for a later debounced write. A batch captures the session id
 * on its first turn, so its write lands on that session's page even if the
 * session changes before the flush fires. A turn joins the waiting batch only
 * when that batch is the current session's; otherwise it starts a new batch
 * (issue #306 R07 — a batch kept for a retry, or one not yet flushed, took
 * the next session's turns onto the old session's page).
 *
 * @param {string} userId
 * @param {{who:"player"|"narrator", name?:string, text:string}} turn
 */
export function appendToBuffer(userId, turn) {
  if (!userId || !turn?.text) return;
  registerFlushOnHide();
  let entry = _buffers.get(userId);
  if (!entry) {
    entry = { batches: [], timerId: null, chain: Promise.resolve(), failures: 0 };
    _buffers.set(userId, entry);
  }
  const sessionId = currentSessionId();
  let batch = entry.batches.at(-1);
  if (!batch || batch.sessionId !== sessionId) {
    batch = { sessionId, turns: [] };
    entry.batches.push(batch);
  }
  batch.turns.push({
    who:  turn.who === "narrator" ? "narrator" : "player",
    name: turn.name ?? "",
    text: String(turn.text),
  });
}

/**
 * (Re)arm the debounced write. Subsequent calls reset the timer.
 * @param {string} userId
 * @param {number} [delayMs]
 */
export function scheduleDebouncedWrite(userId, delayMs = DEFAULT_DEBOUNCE_MS) {
  const entry = _buffers.get(userId);
  if (!entry) return;
  if (entry.timerId) clearTimeout(entry.timerId);
  entry.timerId = setTimeout(() => { flushNow(userId).catch(() => {}); }, delayMs);
}

/**
 * Flush buffered turns to their session pages now. No-op when nothing is
 * buffered. Runs after any flush of this player's already under way, so each
 * write builds on the page the previous one wrote; a batch whose write fails
 * goes back ahead of newer turns and a retry is scheduled.
 *
 * @param {string} userId
 * @returns {Promise<JournalEntryPage|null>} the last page written, or null
 *   when nothing was written (nothing buffered, or a write failed)
 */
export function flushNow(userId) {
  const entry = _buffers.get(userId);
  if (!entry) return Promise.resolve(null);
  if (entry.timerId) { clearTimeout(entry.timerId); entry.timerId = null; }
  const run = entry.chain.then(() => writePending(userId, entry));
  entry.chain = run.catch(() => {});
  return run;
}

async function writePending(userId, entry) {
  // Taken for this write: turns appended meanwhile start a fresh batch.
  const batches = entry.batches.splice(0);
  let page = null;
  for (let i = 0; i < batches.length; i++) {
    const written = await writeBatch(userId, batches[i]);
    if (!written) {
      entry.batches.unshift(...batches.slice(i));
      entry.failures += 1;
      if (entry.failures <= MAX_AUTO_RETRIES) scheduleDebouncedWrite(userId, DEFAULT_DEBOUNCE_MS * entry.failures);
      return null;
    }
    page = written;
  }
  if (page) entry.failures = 0;
  return page;
}

/** Append one batch to its session page; the page, or null when the write failed. */
async function writeBatch(userId, { sessionId, turns }) {
  const journal = await getOrCreatePrivateJournal(userId);
  const page    = await getOrCreateSessionPage(journal, sessionId);
  if (!page) {
    console.warn(`${MODULE_ID} | privateChannel: no session page — ${turns.length} turn(s) kept for a retry`);
    return null;
  }

  const appended = (page.text?.content ?? "") + renderTurnsHtml(turns);
  try {
    await page.update({ text: { format: 1, content: appended } });
    return page;
  } catch (err) {
    console.warn(`${MODULE_ID} | privateChannel: page write failed — ${turns.length} turn(s) kept for a retry:`, err?.message ?? err);
    return null;
  }
}

// A phone may suspend or discard a background tab before the debounce fires
// (issue #293), so pending turns are also flushed when the page is hidden
// (app switch, screen lock) or unloaded. Registered once, on the first
// buffered turn, where a document or window exists.
let _flushOnHideRegistered = false;

function registerFlushOnHide() {
  if (_flushOnHideRegistered) return;
  const doc = globalThis.document;
  const win = globalThis.window;
  if (!doc && !win) return;
  _flushOnHideRegistered = true;
  doc?.addEventListener?.("visibilitychange", () => {
    if (doc.visibilityState === "hidden") flushAllPending();
  });
  win?.addEventListener?.("pagehide", () => flushAllPending());
}

function flushAllPending() {
  for (const userId of [..._buffers.keys()]) flushNow(userId).catch(() => {});
}

/** Test seam — clear all in-memory buffers (and any pending timers). */
export function _resetBuffers() {
  for (const entry of _buffers.values()) {
    if (entry.timerId) clearTimeout(entry.timerId);
  }
  _buffers.clear();
  _flushOnHideRegistered = false;
}
