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
  return page.setFlag(MODULE_ID, typeKey, payload);
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
export async function registerEntityIdInStore(listKey, id, label = listKey) {
  // Always written: the caller's copy is often the setting's cached object,
  // which already holds the id the creator pushed onto it — a "registered
  // already" check would read that copy, not what is stored.
  const latest = globalThis.game?.settings?.get?.(MODULE_ID, 'campaignState') ?? {};
  const list   = unionIdList(latest[listKey], [id]);
  try {
    await globalThis.game.settings.set(MODULE_ID, 'campaignState', { ...latest, [listKey]: list });
  } catch (err) {
    console.error(`${MODULE_ID} | ${label}: registering ${listKey} failed:`, err);
    throw err;
  }
}
