// src/character/chronicle.js
// Manages the CharacterChronicle — a per-character narrative record stored as a
// dedicated JournalEntry named "Chronicle — {character.name}".
//
// Unlike entity journals (structured flag data), the Chronicle stores an array of
// human-readable narrative entries that can be edited freely by the player.
//
// Storage:  page.flags[MODULE_ID].chronicle = ChronicleEntry[]
// Identity: journal.flags[MODULE_ID].chronicleActorId — the journal belongs to
// that Actor whatever either is called (issue #301 B03). The name is a label,
// kept current on write.

import { getPlayerActors } from './actorBridge.js';

const MODULE_ID      = 'starforged-companion';
const CHRONICLE_KEY  = 'chronicle';
const ACTOR_FLAG     = 'chronicleActorId';
const JOURNAL_PREFIX = 'Chronicle — ';

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
  await writeChronicle(actorId, entries => [...entries, buildEntry(entry)], { create: true });
}

/**
 * Get all chronicle entries for a character, oldest first.
 * @param {string} actorId
 * @returns {Promise<Object[]>}
 */
export async function getChronicleEntries(actorId) {
  return readEntries(findChronicleJournals(actorId));
}

/**
 * Update the text of an existing chronicle entry (player annotation / correction).
 * @param {string} actorId
 * @param {string} entryId
 * @param {string} newText
 * @returns {Promise<void>}
 */
export async function updateChronicleEntry(actorId, entryId, newText) {
  await writeChronicle(actorId, (entries) => {
    const idx = entries.findIndex(e => e.id === entryId);
    if (idx < 0) return null;
    const next = [...entries];
    next[idx] = {
      ...entries[idx],
      text:       newText,
      playerEdited: true,
    };
    return next;
  });
}

/**
 * Replace a character's chronicle entries wholesale — the Chronicle panel's
 * delete, re-type and pin. Writes only a chronicle that already exists, through
 * the same identity lookup as every other access (the panel used to find the
 * journal by the actor's current name).
 * @param {string} actorId
 * @param {Object[]} entries
 * @returns {Promise<boolean>} true when the entries were written
 */
export async function saveChronicleEntries(actorId, entries) {
  return writeChronicle(actorId, () => (Array.isArray(entries) ? [...entries] : null));
}


// ─────────────────────────────────────────────────────────────────────────────
// Journal management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every Chronicle journal of an actor, the one to write first.
 *
 * A journal is the actor's by its chronicleActorId flag, never by its name
 * (issue #301 B03): finding it as "Chronicle — <name>" lost the history when
 * the actor was renamed (the next entry made a new journal under the new name)
 * and mixed two characters' histories when they shared a name. A rename made
 * before that fix left the history split over two flagged journals — reads
 * merge them and the next write folds them into one.
 *
 * A journal under the actor's current name with no actor flag is a legacy
 * record: it is adopted only when no other character has that name, and a
 * journal flagged for another actor never is.
 *
 * @param {string} actorId
 * @returns {JournalEntry[]}
 */
function findChronicleJournals(actorId) {
  const actor = game.actors?.get(actorId);
  if (!actor) return [];
  const label = journalName(actor);

  const flagged = (game.journal?.contents ?? []).filter(j => chronicleOwner(j) === actorId);
  if (flagged.length) {
    // The journal already labelled with the actor's current name leads.
    return [...flagged.filter(j => j.name === label), ...flagged.filter(j => j.name !== label)];
  }

  // getName as well as contents: a collection may resolve names it cannot list.
  const named = [game.journal?.getName?.(label), ...(game.journal?.contents ?? []).filter(j => j?.name === label)]
    .filter(Boolean);
  const own = named.find(j => chronicleOwner(j) === actorId);
  if (own) return [own];
  const legacy = named.find(j => !chronicleOwner(j));
  if (!legacy) return [];
  const namesakes = getPlayerActors().filter(a => a?.name === actor.name);
  if (namesakes.length > 1) {
    console.warn(`${MODULE_ID} | chronicle: "${label}" names no character and ${namesakes.length} characters are called "${actor.name}" — it is not attached to either.`);
    return [];
  }
  return [legacy];
}

/**
 * Read-modify-write a character's chronicle. `mutate(entries)` returns the new
 * list, or null to write nothing. With several journals (a rename split them)
 * the first receives the merged list and the others are emptied; it is stamped
 * with the actor and labelled with the actor's current name.
 *
 * @param {string} actorId
 * @param {(entries: Object[]) => Object[]|null} mutate
 * @param {{ create?: boolean }} [opts] create the journal when there is none
 * @returns {Promise<boolean>} true when the entries were written
 */
async function writeChronicle(actorId, mutate, { create = false } = {}) {
  let journals = findChronicleJournals(actorId);
  if (!journals.length && create) {
    const created = await createChronicleJournal(actorId);
    if (created) journals = [created];
  }
  const [journal, ...others] = journals;
  const page = journal?.pages?.contents?.[0];
  if (!page) return false;

  const next = mutate(readEntries(journals));
  if (!Array.isArray(next)) return false;
  await page.setFlag(MODULE_ID, CHRONICLE_KEY, next);

  await tidyChronicleJournals(actorId, journal, others);
  return true;
}

/**
 * Entries of a character's journals, oldest first. One journal: as stored.
 * Several: every entry once (the first journal's copy wins), by timestamp.
 */
function readEntries(journals) {
  if (journals.length <= 1) return getCurrentEntries(journals[0]?.pages?.contents?.[0]);
  const seen = new Set();
  const out  = [];
  for (const journal of journals) {
    for (const entry of getCurrentEntries(journal.pages?.contents?.[0])) {
      if (entry?.id && seen.has(entry.id)) continue;
      if (entry?.id) seen.add(entry.id);
      out.push(entry);
    }
  }
  return out.sort((a, b) => String(a?.timestamp ?? '').localeCompare(String(b?.timestamp ?? '')));
}

// Bookkeeping after a write, best-effort: if a step fails (a journal this
// user cannot edit), reads stay correct — they merge, first journal first.
async function tidyChronicleJournals(actorId, journal, others) {
  try {
    if (chronicleOwner(journal) !== actorId) await journal.setFlag?.(MODULE_ID, ACTOR_FLAG, actorId);
    const actor = game.actors?.get(actorId);
    const label = actor ? journalName(actor) : null;
    if (label && journal.name !== label) await journal.update?.({ name: label });
  } catch (err) {
    console.warn(`${MODULE_ID} | chronicle: could not stamp or relabel "${journal.name}":`, err?.message ?? err);
  }
  for (const other of others) {
    const page = other.pages?.contents?.[0];
    if (!getCurrentEntries(page).length) continue;
    try {
      await page.setFlag(MODULE_ID, CHRONICLE_KEY, []);
    } catch (err) {
      console.warn(`${MODULE_ID} | chronicle: could not fold "${other.name}" into "${journal.name}":`, err?.message ?? err);
    }
  }
}

async function createChronicleJournal(actorId) {
  const actor = game.actors?.get(actorId);
  if (!actor) return null;

  try {
    const journal = await JournalEntry.create({
      name: journalName(actor),
      flags: { [MODULE_ID]: { [ACTOR_FLAG]: actorId } },
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

function journalName(actor) {
  return `${JOURNAL_PREFIX}${actor.name}`;
}

function chronicleOwner(journal) {
  return journal?.flags?.[MODULE_ID]?.[ACTOR_FLAG] ?? null;
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
