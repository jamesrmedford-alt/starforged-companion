/**
 * STARFORGED COMPANION
 * src/entities/folder.js — folder helpers for entity records
 *
 * Pre-migration, every entity type lives as a JournalEntry under a single
 * flat "Starforged Entities" folder. The Entity → Actor Migration (Phase 2/3,
 * see docs/entity-actor-migration-scope.md) moves four types onto native
 * foundry-ironsworn Actor documents, organised in a different folder layout:
 *
 *   Actors/
 *     Starships/                  ← ship Actors (cross-sector)
 *     NPCs/                       ← reserved for future connection migration
 *     PCs/                        ← adopted/created during migration
 *     Sectors/
 *       <Sector Name>/
 *         Settlements/            ← settlement Actors
 *         Locations/              ← POI Actors
 *         Planets/                ← planet Actors
 *
 * Connection / faction / creature stay journal-backed and continue to land
 * in the existing "Starforged Entities" Journal folder.
 *
 * Foundry folders are typed — a folder is either an Actor folder OR a
 * JournalEntry folder, not both — so each typed tree is independent.
 */

const FOLDER_NAME = "Starforged Entities";
const FOLDER_COLOR = "#4A6FA5";

// path-keyed cache so a deep ensure() doesn't refetch the same parents
// every call. Key is `${type}:${segments.join('/')}`.
const _cache = new Map();

let _legacyCachedId = null;

/**
 * The pre-migration flat folder for every journal-backed entity. Kept for
 * connection / faction / creature; ship / planet / settlement / location
 * use the actor-folder helpers below.
 */
export async function getOrCreateEntitiesFolder() {
  return getOrCreateJournalEntitiesFolder();
}

export async function getOrCreateJournalEntitiesFolder() {
  if (_legacyCachedId && globalThis.game?.folders?.get(_legacyCachedId)) return _legacyCachedId;
  const existing = globalThis.game?.folders?.find(
    f => f.type === "JournalEntry" && f.name === FOLDER_NAME
  );
  if (existing) {
    _legacyCachedId = existing.id;
    return _legacyCachedId;
  }
  try {
    const created = await globalThis.Folder?.create?.({
      name:  FOLDER_NAME,
      type:  "JournalEntry",
      color: FOLDER_COLOR,
    });
    _legacyCachedId = created?.id ?? null;
  } catch (err) {
    console.warn(`starforged-companion | entities/folder: create failed:`, err);
    _legacyCachedId = null;
  }
  return _legacyCachedId;
}

/**
 * Resolve (or create) a folder path in a typed Foundry folder tree. Used by
 * the actor-folder helpers below; exposed so future helpers can reuse the
 * same path-walking logic.
 *
 * @param {string} type  Foundry document type ("Actor" | "JournalEntry")
 * @param {string[]} segments  Folder names in order from root to leaf
 * @returns {Promise<string|null>}  Leaf folder id, or null on failure
 */
export async function ensureFolderPath(type, segments) {
  if (!segments?.length) return null;
  const cacheKey = `${type}:${segments.join('/')}`;
  const cached = _cache.get(cacheKey);
  if (cached && globalThis.game?.folders?.get(cached)) return cached;

  let parentId = null;
  for (let i = 0; i < segments.length; i += 1) {
    const name = segments[i];
    const subKey = `${type}:${segments.slice(0, i + 1).join('/')}`;
    let folderId = _cache.get(subKey);
    let folder = folderId && globalThis.game?.folders?.get(folderId);
    if (!folder) {
      folder = globalThis.game?.folders?.find(
        f => f.type === type && f.name === name && (f.folder ?? null) === parentId
      );
    }
    if (!folder) {
      try {
        folder = await globalThis.Folder?.create?.({
          name,
          type,
          color: FOLDER_COLOR,
          folder: parentId,
        });
      } catch (err) {
        console.warn(`starforged-companion | entities/folder: ensureFolderPath(${type}, ${name}) failed:`, err);
        return null;
      }
    }
    if (!folder?.id) return null;
    _cache.set(subKey, folder.id);
    parentId = folder.id;
  }
  return parentId;
}

/**
 * Top-level Actor folder ("Starships", "NPCs", "PCs", "Sectors"). Created on
 * demand if missing. Ship creation calls this with "Starships".
 *
 * @param {"Starships"|"NPCs"|"PCs"|"Sectors"} name
 * @returns {Promise<string|null>}
 */
export async function getOrCreateActorFolder(name) {
  return ensureFolderPath("Actor", [name]);
}

/**
 * Per-sector Actor subfolder for migrated entity types. The leaf path is
 * `Sectors / <Sector Name> / <typePlural>` (e.g. "Settlements"). The sector
 * name is resolved from campaignState.sectors[sectorId].name; if unavailable
 * the helper falls back to the top-level type folder under Sectors (no
 * per-sector grouping) and emits a single console warning.
 *
 * @param {string} sectorId
 * @param {"Settlements"|"Locations"|"Planets"} typePlural
 * @param {Object} [campaignState]
 * @returns {Promise<string|null>}
 */
export async function getOrCreateSectorActorFolder(sectorId, typePlural, campaignState) {
  const state = campaignState ?? globalThis.game?.settings?.get?.("starforged-companion", "campaignState") ?? {};
  const sector = (state.sectors ?? []).find(s => s.id === sectorId);
  if (!sector?.name) {
    console.warn(`starforged-companion | folder: sector ${sectorId} not found in campaignState; falling back to flat type folder`);
    return ensureFolderPath("Actor", ["Sectors", typePlural]);
  }
  return ensureFolderPath("Actor", ["Sectors", sector.name, typePlural]);
}

/**
 * Per-sector Journal subfolder for the sector-record JournalEntry. The leaf
 * path is `Sectors / <Sector Name>`. Used by createSectorJournal and the
 * one-time migrator.
 *
 * @param {string} sectorId
 * @param {Object} [campaignState]
 * @returns {Promise<string|null>}
 */
export async function getOrCreateSectorJournalFolder(sectorId, campaignState) {
  const state = campaignState ?? globalThis.game?.settings?.get?.("starforged-companion", "campaignState") ?? {};
  const sector = (state.sectors ?? []).find(s => s.id === sectorId);
  if (!sector?.name) {
    console.warn(`starforged-companion | folder: sector ${sectorId} not found in campaignState; falling back to flat Sectors folder`);
    return ensureFolderPath("JournalEntry", ["Sectors"]);
  }
  return ensureFolderPath("JournalEntry", ["Sectors", sector.name]);
}

// Test helper — vitest doesn't reset module-scoped caches between files.
export function _resetFolderCache() {
  _cache.clear();
  _legacyCachedId = null;
}
