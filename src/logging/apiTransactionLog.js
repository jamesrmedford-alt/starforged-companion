/**
 * STARFORGED COMPANION
 * src/logging/apiTransactionLog.js
 *
 * API transaction log — records every Anthropic API call (model, input tokens,
 * cache tokens, output tokens) to a Foundry JournalEntry so token usage is
 * visible without console access.
 *
 * Enabled via the `apiTransactionLog.enabled` world setting (default: on).
 * Only the GM can write; non-GM calls are silently dropped.
 *
 * Call logApiTransaction() from api-proxy.js after each successful response.
 * Flush the pre-ready buffer in Hooks.once("ready") via flushApiTransactionLogBuffer().
 */

export const JOURNAL_NAME = "Starforged Companion — API Log";
export const PAGE_NAME    = "Transaction Log";
const MODULE_ID           = "starforged-companion";
const SETTING_KEY         = "apiTransactionLog.enabled";
const MAX_ENTRIES         = 500; // rotate oldest when page reaches this count

// Pre-ready buffer: entries captured before game.ready is true.
export const pending = [];

let _journalId  = null;
let _pageId     = null;
let _writing    = false; // reentrancy guard
let _writeQueue = Promise.resolve();

// ── Pure helpers (exported for unit tests) ───────────────────────────────────

export function isEnabled() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, SETTING_KEY) ?? true;
  } catch {
    return true;
  }
}

export function formatTransactionEntry({ model, inputTokens, cacheWriteTokens, cacheReadTokens, outputTokens }) {
  const ts    = new Date().toLocaleString();
  const parts = [`in: ${inputTokens}`];
  if (cacheWriteTokens > 0) parts.push(`cache-write: ${cacheWriteTokens}`);
  if (cacheReadTokens  > 0) parts.push(`cache-read: ${cacheReadTokens}`);
  parts.push(`out: ${outputTokens}`);
  return `<p>[${ts}] ${model} | ${parts.join(' | ')}</p>\n`;
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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record one API call. Fire-and-forget — never throws.
 * Called from api-proxy.js after each successful Anthropic response.
 *
 * @param {{ model: string, inputTokens: number, cacheWriteTokens: number, cacheReadTokens: number, outputTokens: number }} entry
 */
export function logApiTransaction(entry) {
  if (!isEnabled()) return;
  const html = formatTransactionEntry({
    model:            entry.model            ?? 'unknown',
    inputTokens:      entry.inputTokens      ?? 0,
    cacheWriteTokens: entry.cacheWriteTokens ?? 0,
    cacheReadTokens:  entry.cacheReadTokens  ?? 0,
    outputTokens:     entry.outputTokens     ?? 0,
  });

  if (!globalThis.game?.ready || !globalThis.game?.user?.isGM) {
    pending.push(html);
    return;
  }
  enqueue(html);
}

/**
 * Write pre-ready buffered entries to the journal. Call in Hooks.once("ready").
 */
export async function flushApiTransactionLogBuffer() {
  if (!globalThis.game?.user?.isGM) {
    pending.length = 0;
    return;
  }
  for (const html of pending.splice(0)) enqueue(html);
}

/**
 * Reset all module-level state. For unit tests only.
 */
export function _reset() {
  pending.length = 0;
  _journalId     = null;
  _pageId        = null;
  _writing       = false;
  _writeQueue    = Promise.resolve();
}
