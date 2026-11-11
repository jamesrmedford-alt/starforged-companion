/**
 * STARFORGED COMPANION
 * src/entities/registry.js — host-document dispatch for entity records
 *
 * Every entity type (connection, ship, settlement, faction, planet, location,
 * creature) lives on a Foundry document. Today they are all hosted on a
 * JournalEntry, with the data stored as a flag on the embedded JournalEntryPage.
 * A later phase of the Entity → Actor Migration moves four types (ship, planet,
 * settlement, location) onto native foundry-ironsworn Actor documents while
 * connection / faction / creature stay journal-backed.
 *
 * This file is the single dispatch point for "where does this typeKey's data
 * live?" — call sites that don't care which kind of document hosts the entity
 * should use these helpers instead of reaching into game.journal or
 * game.actors directly. After the migration only this file changes; every
 * caller stays correct.
 *
 * See issue #228 (Entity → Actor Migration) §4 for the surface that uses this.
 */

import { readSheetPronouns, readCommandVehicleIntegrity, unreconciledRecordIntegrity } from '../character/actorBridge.js';
import { serialiseCampaignStateWrite } from '../multiplayer/campaignStateChain.js';

const MODULE_ID = 'starforged-companion';

/**
 * The campaignState id lists of entity host documents. Creators append to
 * them (registerEntityIdInStore); writers that hold a campaignState copy
 * across long awaits union them onto the latest store instead of replacing
 * them (persistResolution's merge, the sector store).
 */
export const ENTITY_ID_LISTS = Object.freeze([
  'characterIds',
  'connectionIds',
  'settlementIds',
  'locationIds',
  'creatureIds',
  'shipIds',
  'planetIds',
  'factionIds',
]);

/**
 * Ordered union of two id lists (store order first). null when neither is a list.
 * @param {Array|undefined} storeList
 * @param {Array|undefined} workingList
 * @returns {Array|null}
 */
export function unionIdList(storeList, workingList) {
  const a = Array.isArray(storeList)   ? storeList   : null;
  const b = Array.isArray(workingList) ? workingList : null;
  if (!a && !b) return null;
  const out = [...(a ?? [])];
  for (const id of b ?? []) if (!out.includes(id)) out.push(id);
  return out;
}

// Per typeKey → host document collection. All seven types currently host on
// JournalEntries; the Phase 2/3 rewrites flip ship/planet/settlement/location
// to 'actors' here without touching any caller.
const HOST_COLLECTION = {
  connection: 'actor',   // type='character' (NPC card)        — FOLDER-002
  ship:       'actor',   // type='starship'                    — Phase 2
  settlement: 'actor',   // type='location', subtype='settlement' — Phase 3
  faction:    'journal',
  planet:     'actor',   // type='location', subtype='planet'  — Phase 3
  location:   'actor',   // type='location', subtype=<type>    — Phase 3
  creature:   'journal',
};

/**
 * Resolve the Foundry document that hosts an entity record's flag payload.
 * Returns null if the id doesn't resolve in the expected collection.
 *
 * @param {string} typeKey  one of the seven entity typeKeys
 * @param {string} id       document id (journal id today; actor id post-migration)
 * @returns {ClientDocument|null}
 */
export function getEntityDocument(typeKey, id) {
  if (!id) return null;
  const collection = HOST_COLLECTION[typeKey] ?? 'journal';
  if (collection === 'actor') return globalThis.game?.actors?.get(id) ?? null;
  return globalThis.game?.journal?.get(id) ?? null;
}

/**
 * Read an entity's flag payload from its host document. For journal-hosted
 * types the payload sits on the embedded JournalEntryPage's flags; for actor-
 * hosted types it sits directly on the actor's flags. Either way the caller
 * just gets the entity data object.
 *
 * @param {string} typeKey
 * @param {ClientDocument} document  result of getEntityDocument()
 * @returns {Object|null}
 */
export function readEntityFlag(typeKey, document) {
  if (!document) return null;
  const collection = HOST_COLLECTION[typeKey] ?? 'journal';
  if (collection === 'actor') {
    return document.getFlag?.(MODULE_ID, typeKey) ?? null;
  }
  const page = document.pages?.contents?.[0];
  return page?.getFlag?.(MODULE_ID, typeKey) ?? null;
}

/**
 * Write an entity's flag payload back to its host document, preserving the
 * journal-page-vs-actor distinction. Callers should pass the *complete* next
 * payload, not a partial diff — this matches the existing setFlag pattern in
 * connection.js / settlement.js / etc.
 *
 * @param {string} typeKey
 * @param {ClientDocument} document
 * @param {Object} payload
 * @returns {Promise<*>}
 */
export async function writeEntityFlag(typeKey, document, payload) {
  if (!document) throw new Error(`writeEntityFlag(${typeKey}): no document`);
  const collection = HOST_COLLECTION[typeKey] ?? 'journal';
  if (collection === 'actor') {
    return document.setFlag(MODULE_ID, typeKey, payload);
  }
  const page = document.pages?.contents?.[0];
  if (!page) throw new Error(`writeEntityFlag(${typeKey}): no page on document ${document.id}`);
  const result = await page.setFlag(MODULE_ID, typeKey, payload);
  await rerenderEntityPageBody(typeKey, page, payload);
  return result;
}

// Journal-hosted entities whose page body is rendered from the record (the
// F19 / T3 "the JournalEntryPage isn't blank" body). Loaded on demand: the
// type modules import this one.
const BODY_RENDERERS = {
  faction:  () => import('./faction.js'),
  creature: () => import('./creature.js'),
};

/**
 * Re-render a journal-hosted entity's page body from its record, so the page
 * the GM opens shows the record as it is. The body was rendered once, at
 * creation: a draft-confirmed faction's seeded type, its stance and every
 * later edit — a creature's too — never reached it (issue #322 V31). The body
 * is a rendered mirror of the record, as the World Journal's own pages are;
 * a write that changes nothing leaves it alone, and a failed render is
 * logged, never thrown (the record is already saved).
 *
 * @param {string} typeKey
 * @param {JournalEntryPage} page
 * @param {Object} record
 * @returns {Promise<void>}
 */
export async function rerenderEntityPageBody(typeKey, page, record) {
  const load = BODY_RENDERERS[typeKey];
  if (!load || typeof page?.update !== 'function') return;
  try {
    const { renderEntityBody } = await load();
    const content = renderEntityBody(record);
    if (page.text?.content === content) return;
    await page.update({ text: { format: 1, content } });
  } catch (err) {
    console.warn(`${MODULE_ID} | registry: re-rendering the ${typeKey} page body failed:`, err?.message ?? err);
  }
}

// Entity types whose host Actor has a Notes tab (`system.notes`): an NPC card
// (an ironsworn `character`) and a ship (`starship`). For them the sheet's
// Notes are the entity's notes — what the GM edits and what the Auto-Seed
// writes; the record's own `notes` field is not read (issue #329 X12:
// decisions.md → "An NPC card's or ship's notes are its sheet's Notes tab").
const SHEET_NOTES_TYPES = new Set(['connection', 'ship']);

/** True when `typeKey`'s notes live on its host Actor's Notes tab. */
export function hasSheetNotes(typeKey) {
  return SHEET_NOTES_TYPES.has(typeKey);
}

/**
 * An entity record with the facts its sheet holds taken from the sheet, for
 * the types that have one (hasSheetNotes) — the record as stored otherwise:
 * its notes from the Notes tab, and an NPC card's pronouns from its Pronouns
 * field when that holds a value. The sheet is what the GM edits and what the
 * seed writes, for pronouns as for notes (issue #335 Y13: a correction made
 * there reached no narrator surface); an empty field leaves the record's — the
 * set the narration established, which a card has before its seed fills the
 * field. A command vehicle's integrity (and its max) is its STARSHIP asset's
 * Integrity track, which the starship sheet shows and the player marks (issue
 * #345 AA20; actorBridge readCommandVehicleIntegrity) — except that a record
 * from before that, not yet reconciled, reads the lower of its own and the
 * track's: the damage the module recorded there never reached the sheet
 * (issue #347 AB08; actorBridge unreconciledRecordIntegrity).
 *
 * @param {string} typeKey
 * @param {ClientDocument|null} document
 * @param {Object|null} data — readEntityFlag's payload
 * @returns {Object|null}
 */
export function withSheetNotes(typeKey, document, data) {
  if (!data || !SHEET_NOTES_TYPES.has(typeKey)) return data;
  const sheet = {};
  const notes = document?.system?.notes;
  if (typeof notes === 'string') sheet.notes = notes;
  const pronouns = typeKey === 'connection' ? readSheetPronouns(document) : '';
  if (pronouns) sheet.pronouns = pronouns;
  const integrity = typeKey === 'ship' ? readCommandVehicleIntegrity(document) : null;
  if (integrity) {
    sheet.integrity    = unreconciledRecordIntegrity(data, integrity) ?? integrity.value;
    sheet.integrityMax = integrity.max;
  }
  return Object.keys(sheet).length ? { ...data, ...sheet } : data;
}

/**
 * Iterate every host document that carries a flag payload for `typeKey`.
 * Yields { document, data } pairs. Callers can read the same data via
 * readEntityFlag(typeKey, document); it's surfaced here as a convenience so a
 * "load all of type X" pass only touches each document once.
 *
 * @param {string} typeKey
 * @returns {Generator<{ document: ClientDocument, data: Object }>}
 */
export function* iterEntityDocuments(typeKey) {
  const collection = HOST_COLLECTION[typeKey] ?? 'journal';
  const docs = collection === 'actor'
    ? (globalThis.game?.actors ?? [])
    : (globalThis.game?.journal ?? []);
  for (const document of docs) {
    const data = readEntityFlag(typeKey, document);
    if (!data) continue;
    yield { document, data };
  }
}

/**
 * Walk every typeKey and ask the appropriate collection for `id`. Returns the
 * first match as { typeKey, document, data } or null if no entity has that id.
 * Use this when you have a host document id but don't know whether it lives on
 * a journal or an actor and don't know the entity type either.
 *
 * @param {string} id
 * @returns {{ typeKey: string, document: ClientDocument, data: Object } | null}
 */
export function resolveEntityById(id) {
  if (!id) return null;
  for (const typeKey of Object.keys(HOST_COLLECTION)) {
    const document = getEntityDocument(typeKey, id);
    if (!document) continue;
    const data = readEntityFlag(typeKey, document);
    if (data) return { typeKey, document, data };
  }
  return null;
}

/**
 * Register an entity's host-document id in a campaignState id list, on the
 * LATEST stored campaignState — never by writing the caller's whole object
 * (issue #300 F14, CREATE-PERSIST-WHOLE). Creators run inside long-lived
 * callers — the move pipeline's Make a Connection auto-create, a vow card's
 * connection prompt — whose snapshot predates writes relayed meanwhile (an
 * X-Card, a flag, Private Lines, clocks), and writing it whole reverted them.
 * The creator still pushes the id onto the caller's copy, so a caller's own
 * later persist (persistResolution's id-list union) keeps it. No await
 * between the read and the write.
 *
 * @param {string} listKey   the campaignState id list, e.g. "connectionIds"
 * @param {string} id        the host document id
 * @param {string} [label]   the caller, for the error log
 * @returns {Promise<void>}  rejects when the setting write fails
 */
/**
 * Register a new entity's host id in a campaignState id list: on the latest
 * stored campaignState first (registerEntityIdInStore), then — once the world
 * has taken it — on the caller's copy, so a caller's own later persist keeps
 * it (persistResolution's id-list union). The caller's copy is often the
 * setting's cached object (a draft card's Confirm, the createActor hooks):
 * the id used to be pushed onto it before the write, and a refused write left
 * the GM's cache listing an entity the world never registered — shown in the
 * Entities panel and the roster, "existing" to the next Confirm of the name,
 * an unlisted orphan after a reload (issue #331 X35). `persist: false` — a
 * caller that saves its copy itself — writes nothing. An id the caller's copy
 * already lists is left as it is.
 *
 * The push itself is the caller's (`campaignState.<list>.push(id)` when this
 * resolves true): each list keeps a writer the source scan sees
 * (tests/unit/campaignStateFields.test.js).
 *
 * @param {Object|null} campaignState — the caller's copy (its list made an array)
 * @param {string} listKey — e.g. "connectionIds"
 * @param {string} id — the host document id
 * @param {{ label?: string, persist?: boolean }} [opts]
 * @returns {Promise<boolean>} true: push the id onto the copy's list now;
 *   rejects when the store write is refused (push nothing then)
 */
export async function registerEntityId(campaignState, listKey, id, { label = listKey, persist = true } = {}) {
  if (!id || !campaignState || typeof campaignState !== 'object') return false;
  if (!Array.isArray(campaignState[listKey])) campaignState[listKey] = [];
  if (campaignState[listKey].includes(id)) return false;
  if (persist) await registerEntityIdInStore(listKey, id, label);
  return !campaignState[listKey].includes(id);
}

/**
 * Adopt the Actor an earlier creation of this entity made, when the world
 * refused its registration (issue #337 Y34): an Actor of an Actor-hosted type
 * carrying the module's record (`entityType` and the type's flag), with this
 * name and sector, that no id list names — neither the stored campaignState's
 * nor the caller's copy. It is registered as a new entity would be, and its
 * record returned; the creator then makes no second card. A retried draft
 * Confirm made a second "Vex" — the get-or-create of rules/reachability.md §7,
 * as migrateJournalConnectionsToActors reuses a card by its record id. null
 * when there is none (or no name to match).
 *
 * @param {string} typeKey — an Actor-hosted type: connection, ship, settlement, planet, location
 * @param {string} listKey — its campaignState id list, e.g. "connectionIds"
 * @param {string} name
 * @param {Object} campaignState — the caller's copy
 * @param {{ sectorId?: string|null, persist?: boolean, label?: string }} [opts]
 * @returns {Promise<Object|null>} the adopted record; rejects when its registration is refused
 */
export async function adoptUnlistedEntityActor(typeKey, listKey, name, campaignState, { sectorId = null, persist = true, label = typeKey } = {}) {
  if (HOST_COLLECTION[typeKey] !== 'actor' || !campaignState || typeof campaignState !== 'object') return null;
  const target = String(name ?? '').trim().toLowerCase();
  if (!target) return null;
  const listed = listedEntityIds(listKey, campaignState);
  for (const { document, data } of iterEntityDocuments(typeKey)) {
    if (!document?.id || listed.has(document.id)) continue;
    if (document.flags?.[MODULE_ID]?.entityType !== typeKey) continue;
    if (String(document.name ?? '').trim().toLowerCase() !== target) continue;
    if ((data?.sectorId || null) !== (sectorId || null)) continue;
    if (await registerEntityId(campaignState, listKey, document.id, { label, persist })) {
      campaignState[listKey].push(document.id);
    }
    console.log(`${MODULE_ID} | ${label}: adopted the unregistered card "${document.name}" (${document.id})`);
    return data;
  }
  return null;
}

/**
 * The journal-hosted twin of adoptUnlistedEntityActor (known-issues
 * JOURNAL-ORPHAN-ON-REFUSAL): a faction or creature lives on a JournalEntry
 * its creator makes before the id-list write (issue #331 X35's order), and a
 * refused write left an entry no list names — the retried draft Confirm made
 * a second one. The unlisted entry of `typeKey` (`entityType` on the entry,
 * the type's flag on its page) whose record bears this name is registered as
 * a new entity would be, and its record returned; the creator makes no
 * second. The name matches case-blind, else by `opts.nameKey` — a faction's
 * identity key (faction.factionNameKey, issue #336 Y31), so "The Iron
 * Syndicate" is the Iron Syndicate's — an exact name first, as
 * findFactionByName. null when there is none (or no name to match).
 *
 * With `opts.page`, an unlisted entry of `typeKey` with no page at all — a
 * creation whose page the world refused after the entry landed — is the
 * creation to complete (known-issues FACTION-PAGELESS-JOURNAL, the Chronicle's
 * issue #342 Z62 shape): nothing reads a record off it, so the retried Confirm
 * made a second journal and the first stayed empty and unlisted. Matched by
 * the entry's own name (its creator names it after the record), it gets the
 * page `opts.page(entityId)` describes — the creator's record under the id
 * the entry's `entityId` flag names — and is registered as above. One with a
 * record still wins.
 *
 * @param {string} typeKey — a journal-hosted type: faction, creature
 * @param {string} listKey — its campaignState id list, e.g. "factionIds"
 * @param {string} name
 * @param {Object} campaignState — the caller's copy
 * @param {{ label?: string, nameKey?: (name: string) => string,
 *   page?: (entityId: string|null) => Object }} [opts]
 * @returns {Promise<Object|null>} the adopted record; rejects when its page
 *   or its registration is refused
 */
export async function adoptUnlistedEntityJournal(typeKey, listKey, name, campaignState, { label = typeKey, nameKey = caseBlindName, page = null } = {}) {
  if (HOST_COLLECTION[typeKey] !== 'journal' || !campaignState || typeof campaignState !== 'object') return null;
  const exact = caseBlindName(name);
  const key   = nameKey(name);
  if (!exact || !key) return null;
  const listed = listedEntityIds(listKey, campaignState);
  let match = null;
  for (const { document, data } of iterEntityDocuments(typeKey)) {
    if (!document?.id || listed.has(document.id)) continue;
    if (document.flags?.[MODULE_ID]?.entityType !== typeKey) continue;
    const recordName = data?.name || document.name;
    if (caseBlindName(recordName) === exact) { match = { document, data }; break; }
    if (!match && nameKey(recordName) === key) match = { document, data };
  }
  if (!match && typeof page === 'function') match = await completePagelessEntityJournal(typeKey, listed, exact, key, nameKey, page);
  if (!match) return null;
  if (await registerEntityId(campaignState, listKey, match.document.id, { label })) {
    campaignState[listKey].push(match.document.id);
  }
  console.log(`${MODULE_ID} | ${label}: adopted the unregistered journal "${match.document.name}" (${match.document.id})`);
  return match.data;
}

/**
 * adoptUnlistedEntityJournal's page-less half: the unlisted entry of
 * `typeKey` with no page whose own name is `exact` (else has `key`), given
 * the page `page(entityId)` describes. Rejects when the page is refused —
 * the entry stays page-less and unlisted, for the next creation to complete.
 *
 * @returns {Promise<{ document: JournalEntry, data: Object }|null>}
 */
async function completePagelessEntityJournal(typeKey, listed, exact, key, nameKey, page) {
  let target = null;
  for (const document of globalThis.game?.journal ?? []) {
    if (!document?.id || listed.has(document.id)) continue;
    if (document.flags?.[MODULE_ID]?.entityType !== typeKey) continue;
    if (document.pages?.contents?.length) continue;
    if (caseBlindName(document.name) === exact) { target = document; break; }
    if (!target && nameKey(document.name) === key) target = document;
  }
  if (!target) return null;
  const pageData = page(target.flags[MODULE_ID].entityId ?? null);
  await target.createEmbeddedDocuments('JournalEntryPage', [pageData]);
  console.log(`${MODULE_ID} | ${typeKey}: completed the page-less journal "${target.name}" (${target.id})`);
  return { document: target, data: readEntityFlag(typeKey, target) ?? pageData?.flags?.[MODULE_ID]?.[typeKey] ?? null };
}

/** A name trimmed and lowercased — "" for none. */
function caseBlindName(name) {
  return String(name ?? '').trim().toLowerCase();
}

/** The ids `listKey` names, in the stored campaignState or the caller's copy. */
function listedEntityIds(listKey, campaignState) {
  const stored = globalThis.game?.settings?.get?.(MODULE_ID, 'campaignState') ?? {};
  return new Set([
    ...(Array.isArray(stored?.[listKey]) ? stored[listKey] : []),
    ...(Array.isArray(campaignState?.[listKey]) ? campaignState[listKey] : []),
  ]);
}

/**
 * Tell the GM a new entity's registration was refused (issue #337 Y34): the
 * Actor exists — the Entities panel shows it — but no list names it, so the
 * narrator and every list-driven reader skip it until the next world load
 * registers it (migrator.registerUnlistedEntityActors). It was a console
 * warning only.
 *
 * @param {string} kind — e.g. "starship"
 * @param {string} [name]
 */
export function warnEntityNotRegistered(kind, name) {
  const named = name ? ` "${name}"` : '';
  globalThis.ui?.notifications?.warn?.(
    `The ${kind}${named} was not registered — the world did not save it. Loading the world again registers it.`);
}

export async function registerEntityIdInStore(listKey, id, label = listKey) {
  // Always written: the caller's copy is often the setting's cached object,
  // which already holds the id the creator pushed onto it — a "registered
  // already" check would read that copy, not what is stored. Read and written
  // at its turn on the client's campaignState write chain (CAMPSTATE-CHAIN-REST).
  try {
    await serialiseCampaignStateWrite(() => {
      const latest = globalThis.game?.settings?.get?.(MODULE_ID, 'campaignState') ?? {};
      const list   = unionIdList(latest[listKey], [id]);
      return globalThis.game.settings.set(MODULE_ID, 'campaignState', { ...latest, [listKey]: list });
    }, `${label}: registration`);
  } catch (err) {
    console.error(`${MODULE_ID} | ${label}: registering ${listKey} failed:`, err);
    throw err;
  }
}
