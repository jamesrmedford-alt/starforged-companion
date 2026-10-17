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


// The narrator reads entries directly (getChronicleEntries — narrator.js
// selects its own recent window); the retired context assembler's
// getChronicleForContext summary/recent helper was removed in the 2026-10
// dead-export audit along with the chronicleContextCount setting it read.


// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function generateId() {
  try   { return foundry.utils.randomID(); }
  catch { return Math.random().toString(36).slice(2, 10); }
}
