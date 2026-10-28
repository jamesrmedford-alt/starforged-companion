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
// Writers: one — the canonical GM (issue #306 R11). A Chronicle journal is the
// GM's document, which a player's client cannot update, so the panel and the
// automatic writer ask for every change with requestChronicleEdit
// ("chronicle.edit", applied by applyChronicleEditFromRelay); on the GM, an
// actor's writes run one at a time (writeChronicle).

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
  return writeChronicle(actorId, entries => [...entries, buildEntry(entry)], { create: true });
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
  return changeEntry(actorId, entryId, entry => ({ ...entry, text: newText, playerEdited: true }));
}

/**
 * Pin or unpin one chronicle entry (the Chronicle panel's pin button).
 * @param {string} actorId
 * @param {string} entryId
 * @param {boolean} pinned
 * @returns {Promise<boolean>} true when the entry was found and written
 */
export async function setChronicleEntryPinned(actorId, entryId, pinned) {
  return changeEntry(actorId, entryId, entry => ({ ...entry, pinned: pinned === true }));
}

/**
 * Change one chronicle entry's type (the Chronicle panel's GM type select).
 * @param {string} actorId
 * @param {string} entryId
 * @param {string} type  — one of CHRONICLE_ENTRY_TYPES
 * @returns {Promise<boolean>} true when the entry was found and written
 */
export async function setChronicleEntryType(actorId, entryId, type) {
  if (!CHRONICLE_ENTRY_TYPES.includes(type)) return false;
  return changeEntry(actorId, entryId, entry => ({ ...entry, type }));
}

/**
 * Delete one chronicle entry (the Chronicle panel's GM delete button).
 * @param {string} actorId
 * @param {string} entryId
 * @returns {Promise<boolean>} true when the entry was found and removed
 */
export async function deleteChronicleEntry(actorId, entryId) {
  return changeEntry(actorId, entryId, () => null);
}

/** The entry types the Chronicle panel's GM type select offers. */
export const CHRONICLE_ENTRY_TYPES = Object.freeze([
  'revelation', 'relationship', 'vow', 'scar', 'legacy', 'annotation',
]);

/**
 * Change one entry, found by id among the entries as stored when the write
 * runs (issue #306 R02). The panel used to map its own copy of the entries,
 * made when it rendered, and save that whole list: an entry written since —
 * an automatic one after the next narration — was erased by a pin, a delete
 * or a re-type. `change(entry)` returns the new entry, or null to delete it.
 *
 * @returns {Promise<boolean>} true when the entry was found and written
 */
async function changeEntry(actorId, entryId, change) {
  if (!entryId) return false;
  return writeChronicle(actorId, (entries) => {
    const idx = entries.findIndex(e => e?.id === entryId);
    if (idx < 0) return null;
    const next = [...entries];
    const changed = change(entries[idx]);
    if (changed) next[idx] = changed;
    else next.splice(idx, 1);
    return next;
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Edits through the canonical GM (issue #306 R11)
// ─────────────────────────────────────────────────────────────────────────────

/** The longest entry text a relayed edit may store. */
const MAX_ENTRY_TEXT = 4000;
/** The longest entry type a GM's relayed add may store. */
const MAX_TYPE_LENGTH = 40;

/**
 * Ask the canonical GM to change a character's chronicle — every Chronicle
 * write a client starts (the panel's add / text / pin / re-type / delete, the
 * automatic writer's add). Local on the canonical GM, relayed elsewhere;
 * with no GM connected requestGmAction warns and nothing is written.
 *
 * @param {string} actorId
 * @param {{ op: "add"|"text"|"pin"|"type"|"delete", entryId?: string,
 *           text?: string, pinned?: boolean, type?: string, entry?: Object }} edit
 * @returns {Promise<{ ok: boolean, relayed?: boolean, reason?: string,
 *                     result?: { applied: boolean, reason?: string } }>}
 */
export async function requestChronicleEdit(actorId, edit) {
  const { requestGmAction } = await import('../multiplayer/gmRelay.js');
  return requestGmAction('chronicle.edit', { ...edit, actorId });
}

/**
 * gmRelay handler for "chronicle.edit" — runs on the canonical GM, which can
 * write every Chronicle journal; a player's client cannot (Foundry gives a
 * journal's non-creators no ownership, and owning the PC doesn't give its
 * journal — issue #306 R11). The requester must be a GM or own the actor.
 * Values are checked against what the panel can produce: a player adds only
 * an annotation; re-type and delete are a GM's (the panel shows them to GMs
 * only); text is clamped.
 *
 * @param {Object} payload  — see requestChronicleEdit
 * @param {{ requesterIsGM?: boolean, requester?: User|null }} [ctx]
 * @returns {Promise<{ applied: boolean, reason?: string }>}
 */
export async function applyChronicleEditFromRelay(payload = {}, ctx = {}) {
  const actorId = typeof payload.actorId === 'string' ? payload.actorId : '';
  const actor   = actorId ? game.actors?.get(actorId) : null;
  if (!actor) return refused('no-actor', payload);
  const { requesterOwnsActor } = await import('../moves/burnMomentum.js');
  if (!requesterOwnsActor(actor, ctx)) return refused('not-owner', payload);

  const gm      = ctx.requesterIsGM === true;
  const entryId = typeof payload.entryId === 'string' ? payload.entryId : '';
  let applied;
  switch (payload.op) {
    case 'add': {
      const entry = addableEntry(payload.entry, gm);
      if (!entry) return refused('invalid', payload);
      applied = await addChronicleEntry(actorId, entry);
      break;
    }
    case 'text': {
      const text = typeof payload.text === 'string' ? payload.text.trim().slice(0, MAX_ENTRY_TEXT) : '';
      if (!text) return refused('invalid', payload);
      applied = await updateChronicleEntry(actorId, entryId, text);
      break;
    }
    case 'pin':
      applied = await setChronicleEntryPinned(actorId, entryId, payload.pinned === true);
      break;
    case 'type':
      if (!gm) return refused('gm-only', payload);
      applied = await setChronicleEntryType(actorId, entryId, payload.type);
      break;
    case 'delete':
      if (!gm) return refused('gm-only', payload);
      applied = await deleteChronicleEntry(actorId, entryId);
      break;
    default:
      return refused('invalid', payload);
  }
  return applied ? { applied: true } : refused('no-entry', payload);
}

/** An add's entry as the panel or the writer can produce it, or null. */
function addableEntry(raw, gm) {
  if (!raw || typeof raw !== 'object') return null;
  const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, MAX_ENTRY_TEXT) : '';
  if (!text) return null;
  const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : '';
  if (!gm) return { type: 'annotation', text, sessionId, automated: false };
  const type = typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim().slice(0, MAX_TYPE_LENGTH) : 'annotation';
  return {
    type, text, sessionId,
    moveId:    typeof raw.moveId === 'string' && raw.moveId ? raw.moveId : null,
    automated: raw.automated === true,
  };
}

function refused(reason, payload) {
  console.warn(`${MODULE_ID} | chronicle: "${payload?.op ?? '?'}" on ${payload?.actorId ?? '?'} not applied (${reason}).`);
  return { applied: false, reason };
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

// actorId → the tail of that actor's write chain on this client (never rejects).
const _writeChains = new Map();

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
async function writeChronicle(actorId, mutate, opts = {}) {
  // One read-modify-write at a time per actor: two writes that both read the
  // entries before either landed each saved their own list, and the later
  // erased the other's entry (issue #306 R02).
  const run = (_writeChains.get(actorId) ?? Promise.resolve()).then(() => writeChronicleNow(actorId, mutate, opts));
  const tail = run.catch(() => {});
  _writeChains.set(actorId, tail);
  tail.then(() => { if (_writeChains.get(actorId) === tail) _writeChains.delete(actorId); });
  return run;
}

async function writeChronicleNow(actorId, mutate, { create = false } = {}) {
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
