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
 * on window close / session end. This avoids a Foundry document write per
 * message while keeping transcripts durable across unexpected disconnects.
 */

const MODULE_ID   = "starforged-companion";
const FOLDER_NAME = "Starforged Companion";
const FLAG_KEY    = "privateChannelPage";
const DEFAULT_DEBOUNCE_MS = 5000;

// userId → { turns: Turn[], timerId: ReturnType<setTimeout>|null, sessionId: string }
// Turn = { who: "player"|"narrator", name: string, text: string }
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
 * Buffer a turn for a later debounced write. Captures the session id on the
 * first append of a flush cycle so the write lands on the right page even if
 * the session changes before the flush fires.
 *
 * @param {string} userId
 * @param {{who:"player"|"narrator", name?:string, text:string}} turn
 */
export function appendToBuffer(userId, turn) {
  if (!userId || !turn?.text) return;
  let entry = _buffers.get(userId);
  if (!entry) {
    entry = { turns: [], timerId: null, sessionId: currentSessionId() };
    _buffers.set(userId, entry);
  }
  entry.turns.push({
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
 * Flush buffered turns to the session page immediately. No-op when the buffer
 * is empty. Clears the buffer (and its timer) on success.
 *
 * @param {string} userId
 * @returns {Promise<JournalEntryPage|null>}
 */
export async function flushNow(userId) {
  const entry = _buffers.get(userId);
  if (entry?.timerId) { clearTimeout(entry.timerId); entry.timerId = null; }
  if (!entry || entry.turns.length === 0) return null;

  // Detach the pending turns up front so concurrent appends start a fresh cycle.
  const turns     = entry.turns.splice(0);
  const sessionId = entry.sessionId;
  _buffers.delete(userId);

  const journal = await getOrCreatePrivateJournal(userId);
  const page    = await getOrCreateSessionPage(journal, sessionId);
  if (!page) {
    console.warn(`${MODULE_ID} | privateChannel: flush dropped ${turns.length} turn(s) — no page`);
    return null;
  }

  const appended = (page.text?.content ?? "") + renderTurnsHtml(turns);
  try {
    await page.update({ text: { format: 1, content: appended } });
    return page;
  } catch (err) {
    console.warn(`${MODULE_ID} | privateChannel: page write failed:`, err?.message ?? err);
    return null;
  }
}

/** Test seam — clear all in-memory buffers (and any pending timers). */
export function _resetBuffers() {
  for (const entry of _buffers.values()) {
    if (entry.timerId) clearTimeout(entry.timerId);
  }
  _buffers.clear();
}
