// src/character/chronicle.js
// Manages the CharacterChronicle — a per-character narrative record stored as a
// dedicated JournalEntry named "Chronicle — {character.name}".
//
// Unlike entity journals (structured flag data), the Chronicle stores an array of
// human-readable narrative entries that can be edited freely by the player.
//
// Storage: page.flags[MODULE_ID].chronicle = ChronicleEntry[]

const MODULE_ID    = 'starforged-companion';
const CHRONICLE_KEY = 'chronicle';

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add an entry to a character's chronicle.
 * Creates the chronicle JournalEntry if none exists.
 * @param {string} actorId
 * @param {{ type: string, text: string, moveId?: string, sessionId?: string }} entry
 * @returns {Promise<void>}
 */
export async function addChronicleEntry(actorId, entry) {
  const journal = await getOrCreateChronicleJournal(actorId);
  if (!journal) return;

  const page    = journal.pages?.contents?.[0];
  if (!page) return;

  const entries = getCurrentEntries(page);
  const newEntry = buildEntry(entry);
  entries.push(newEntry);

  await page.setFlag(MODULE_ID, CHRONICLE_KEY, entries);
}

/**
 * Get all chronicle entries for a character, oldest first.
 * @param {string} actorId
 * @returns {Promise<Object[]>}
 */
export async function getChronicleEntries(actorId) {
  const journal = findChronicleJournal(actorId);
  if (!journal) return [];

  const page = journal.pages?.contents?.[0];
  if (!page) return [];

  return getCurrentEntries(page);
}

/**
 * Get a condensed summary + recent entries for context injection.
 * Returns: { summary: string, recent: Object[] }
 *
 * Summary: the first N entries condensed to one paragraph (static, from old entries).
 * Recent: last N entries (configurable via chronicleContextCount setting), pinned first.
 *
 * @param {string} actorId
 * @returns {Promise<{ summary: string, recent: Object[] }>}
 */
export async function getChronicleForContext(actorId) {
  const entries = await getChronicleEntries(actorId);
  if (!entries.length) return { summary: '', recent: [] };

  const contextCount = getContextCount();
  const summary = buildSummary(entries);
  const recent  = selectRecentEntries(entries, contextCount);

  return { summary, recent };
}

/**
 * Update the text of an existing chronicle entry (player annotation / correction).
 * @param {string} actorId
 * @param {string} entryId
 * @param {string} newText
 * @returns {Promise<void>}
 */
export async function updateChronicleEntry(actorId, entryId, newText) {
  const journal = findChronicleJournal(actorId);
  if (!journal) return;

  const page    = journal.pages?.contents?.[0];
  if (!page) return;

  const entries = getCurrentEntries(page);
  const idx     = entries.findIndex(e => e.id === entryId);
  if (idx < 0) return;

  entries[idx] = {
    ...entries[idx],
    text:       newText,
    playerEdited: true,
  };

  await page.setFlag(MODULE_ID, CHRONICLE_KEY, entries);
}


// ─────────────────────────────────────────────────────────────────────────────
// Journal management
// ─────────────────────────────────────────────────────────────────────────────

function findChronicleJournal(actorId) {
  const actor = game.actors?.get(actorId);
  if (!actor) return null;

  const journalName = `Chronicle — ${actor.name}`;
  return game.journal?.getName(journalName) ?? null;
}

async function getOrCreateChronicleJournal(actorId) {
  const existing = findChronicleJournal(actorId);
  if (existing) return existing;

  const actor = game.actors?.get(actorId);
  if (!actor) return null;

  const journalName = `Chronicle — ${actor.name}`;
  try {
    const journal = await JournalEntry.create({
      name: journalName,
      flags: { [MODULE_ID]: { chronicleActorId: actorId } },
    });

    if (journal) {
      await journal.createEmbeddedDocuments('JournalEntryPage', [
        { name: 'Chronicle', type: 'text', flags: { [MODULE_ID]: { [CHRONICLE_KEY]: [] } } },
      ]);
    }

    return journal ?? null;
  } catch (err) {
    console.error(`${MODULE_ID} | chronicle: failed to create chronicle journal`, err);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Entry construction
// ─────────────────────────────────────────────────────────────────────────────

function buildEntry(entry) {
  return {
    id:         generateId(),
    timestamp:  new Date().toISOString(),
    sessionId:  entry.sessionId ?? '',
    type:       entry.type ?? 'annotation',
    text:       entry.text ?? '',
    moveId:     entry.moveId ?? null,
    automated:  entry.automated ?? false,
    pinned:     false,
    playerEdited: false,
  };
}

function getCurrentEntries(page) {
  const raw = page?.flags?.[MODULE_ID]?.[CHRONICLE_KEY];
  return Array.isArray(raw) ? [...raw] : [];
}


// ─────────────────────────────────────────────────────────────────────────────
// Context helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildSummary(entries) {
  const firstThree = entries.slice(0, 3);
  if (!firstThree.length) return '';

  // Condense first 3 entries to a plain-text paragraph.
  // In production, a cached Claude-generated summary replaces this. The generated
  // summary is stored alongside the entries and returned here when available.
  const cached = entries[0]?._cachedSummary;
  if (cached) return cached;

  return firstThree.map(e => e.text).join(' ').trim();
}

function selectRecentEntries(entries, count) {
  const pinned   = entries.filter(e => e.pinned);
  const unpinned = entries.filter(e => !e.pinned);
  const recent   = unpinned.slice(-count).reverse();

  // Prepend any pinned entries not already in recent
  const recentIds   = new Set(recent.map(e => e.id));
  const extraPinned = pinned.filter(e => !recentIds.has(e.id));

  return [...extraPinned, ...recent];
}

function getContextCount() {
  try {
    return game.settings?.get(MODULE_ID, 'chronicleContextCount') ?? 5;
  } catch (err) {
    console.warn(`${MODULE_ID} | chronicle: chronicleContextCount settings read failed; defaulting to 5:`, err);
    return 5;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function generateId() {
  try   { return foundry.utils.randomID(); }
  catch { return Math.random().toString(36).slice(2, 10); }
}
