/**
 * STARFORGED COMPANION
 * src/logging/errorLog.js
 *
 * Persistent error log — intercepts console.warn / console.error calls that
 * carry the module prefix and appends them to a Foundry JournalEntry so they
 * survive the session without console access.
 *
 * Install once in Hooks.once("init") via installConsoleInterceptor().
 * Flush the pre-ready buffer in Hooks.once("ready") via flushErrorLogBuffer().
 */

export const JOURNAL_NAME = "Starforged Companion — Error Log";
export const PAGE_NAME    = "Error Log";
const MODULE_PREFIX       = "starforged-companion";
const MAX_ENTRIES         = 200;  // rotate oldest when page reaches this count

// Pre-ready buffer: entries captured before game.ready is true.
export const pending = [];

let _journalId = null;
let _pageId    = null;
let _installed = false;
let _writing   = false; // reentrancy guard — journal writes must not recurse

// Serialised write queue so concurrent errors don't race on the same page.
let _writeQueue = Promise.resolve();

// ── Pure helpers (exported for unit tests) ───────────────────────────────────

export function matchesModule(args) {
  return args.length > 0 && typeof args[0] === "string" && args[0].startsWith(MODULE_PREFIX);
}

export function formatEntry(level, args) {
  const ts  = new Date().toLocaleString();
  const msg = args
    .map(a =>
      a instanceof Error
        ? `${a.message}${a.stack ? `\n${a.stack}` : ""}`
        : typeof a === "object" && a !== null
        ? JSON.stringify(a)
        : String(a)
    )
    .join(" ");
  const escaped = msg
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  return `<p>[${ts}] ${level}: ${escaped}</p>\n`;
}

// ── Journal I/O ───────────────────────────────────────────────────────────────

async function ensureJournal() {
  if (!globalThis.game?.journal) return null;
  if (!globalThis.game?.user?.isGM) return null;

  if (_journalId) {
    const existing = game.journal.get(_journalId);
    if (existing) return existing;
  }

  let journal = game.journal.getName(JOURNAL_NAME);
  if (!journal) {
    journal = await JournalEntry.create({ name: JOURNAL_NAME });
    await journal.createEmbeddedDocuments("JournalEntryPage", [
      { name: PAGE_NAME, type: "text", text: { content: "" } },
    ]);
  }
  _journalId = journal.id;
  _pageId    = journal.pages.contents[0]?.id ?? null;
  return journal;
}

async function doWrite(html) {
  if (_writing) return;
  _writing = true;
  try {
    const journal = await ensureJournal();
    if (!journal) return;

    const page = (_pageId && journal.pages.get(_pageId)) ?? journal.pages.contents[0];
    if (!page) return;
    _pageId = page.id;

    let content = page.text?.content ?? "";
    // Rotate: drop the oldest entry when the page is full.
    const count = (content.match(/<\/p>/g) ?? []).length;
    if (count >= MAX_ENTRIES) {
      content = content.replace(/<p>[\s\S]*?<\/p>\n?/, "");
    }
    await page.update({ "text.content": content + html });
  } finally {
    _writing = false;
  }
}

function enqueue(html) {
  _writeQueue = _writeQueue.then(() => doWrite(html)).catch(() => {});
}

// ── Capture (called from the intercepted console methods) ─────────────────────

function capture(level, args) {
  if (!matchesModule(args)) return;
  const html = formatEntry(level, args);
  if (!globalThis.game?.ready) {
    pending.push(html);
    return;
  }
  if (!globalThis.game?.user?.isGM) return;
  enqueue(html);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Wrap console.warn / console.error to mirror module-prefixed messages to the
 * persistent Error Log journal. Safe to call multiple times (no-op after the
 * first). Call in Hooks.once("init").
 */
export function installConsoleInterceptor() {
  if (_installed) return;
  _installed = true;
  const _warn  = console.warn.bind(console);
  const _error = console.error.bind(console);
  console.warn  = (...args) => { _warn(...args);  capture("WARN",  args); };
  console.error = (...args) => { _error(...args); capture("ERROR", args); };
}

/**
 * Write pre-ready buffered entries to the journal. Call in Hooks.once("ready").
 */
export async function flushErrorLogBuffer() {
  if (!globalThis.game?.user?.isGM) {
    pending.length = 0;
    return;
  }
  for (const html of pending.splice(0)) enqueue(html);
}

/**
 * Reset all module-level state. For unit tests only.
 */
export function _reset(origWarn, origError) {
  pending.length = 0;
  _journalId    = null;
  _pageId       = null;
  _writing      = false;
  _writeQueue   = Promise.resolve();
  if (_installed) {
    if (origWarn)  console.warn  = origWarn;
    if (origError) console.error = origError;
    _installed = false;
  }
}
