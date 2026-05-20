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
 * See docs/entity-actor-migration-scope.md §4 for the surface that uses this.
 */

const MODULE_ID = 'starforged-companion';

// Per typeKey → host document collection. All seven types currently host on
// JournalEntries; the Phase 2/3 rewrites flip ship/planet/settlement/location
// to 'actors' here without touching any caller.
const HOST_COLLECTION = {
  connection: 'journal',
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
 * Resolve a typeKey from a host document by inspecting which flag is set.
 * Useful when a caller has a document id but doesn't already know its type
 * (entity-panel's tier promotion / canonical-lock handlers do this today by
 * walking ENTITY_TYPES). Returns the first matching typeKey or null.
 *
 * @param {ClientDocument} document
 * @returns {string|null}
 */
export function resolveTypeKeyFromDocument(document) {
  if (!document) return null;
  for (const typeKey of Object.keys(HOST_COLLECTION)) {
    if (HOST_COLLECTION[typeKey] === 'journal') {
      const page = document.pages?.contents?.[0];
      if (page?.flags?.[MODULE_ID]?.[typeKey]) return typeKey;
    } else if (document.flags?.[MODULE_ID]?.[typeKey]) {
      return typeKey;
    }
  }
  return null;
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
