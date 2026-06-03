/**
 * STARFORGED COMPANION
 * src/entities/folder.js — folder helpers for entity records
 *
 * Pre-migration, every entity type lives as a JournalEntry under a single
 * flat "Starforged Entities" folder. The Entity → Actor Migration (Phase 2/3,
 * see docs/entities/entity-actor-migration-scope.md) moves four types onto native
 * foundry-ironsworn Actor documents, organised in a flat per-sector layout:
 *
 *   Actors/
 *     Starships/                  ← ship Actors (cross-sector)
 *     NPCs/                       ← reserved for future connection migration
 *     PCs/                        ← adopted/created during migration
 *     Sectors/
 *       <Sector Name>/            ← every settlement / planet / location for
 *                                   that sector lands directly here, no
 *                                   per-type subfolder
 *
 * Connection / faction / creature stay journal-backed and continue to land
 * in the existing "Starforged Entities" Journal folder.
 *
 * Foundry folders are typed — a folder is either an Actor folder OR a
 * JournalEntry folder, not both — so each typed tree is independent.
 *
 * Earlier versions of this module added a per-type subfolder under each
 * `<Sector Name>` ("Settlements", "Planets", "Locations"). That sub-tier
 * produced "next folder down is named 'Settlements' for every sector"
 * confusion in the Actors sidebar; the per-type level was removed and
 * existing entities are reparented by `flattenSectorActorFolders` in
 * migrator.js.
 */

const FOLDER_NAME = "Starforged Entities";
const FOLDER_COLOR = "#4A6FA5";

// path-keyed cache so a deep ensure() doesn't refetch the same parents
// every call. Key is `${type}:${segments.join('/')}`.
const _cache = new Map();

let _legacyCachedId = null;

/**
 * Normalise a folder's parent reference to an id (or null).
 *
 * Foundry v13's `Folder#folder` getter returns the **parent Folder document**,
 * not its id — but our test mocks (and `_source.folder`) use a plain id string.
 * Comparing the raw getter against an id string silently fails in production,
 * which spawned a duplicate nested folder on every world load (FOLDER-001).
 * This accepts a document, an id string, or null/undefined and always yields an
 * id-or-null so parent comparisons are reliable in both environments.
 *
 * @param {object|string|null|undefined} folderRef  `f.folder` (document or id)
 * @returns {string|null}
 */
export function folderParentId(folderRef) {
  if (!folderRef) return null;
  if (typeof folderRef === "object") return folderRef.id ?? null;
  return folderRef;
}

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
        f => f.type === type && f.name === name && folderParentId(f.folder) === parentId
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
 * Per-sector Actor folder. Every entity type (settlement / planet / location)
 * for a given sector lands directly in `Sectors / <Sector Name>`. The sector
 * name is resolved from `campaignState.sectors[sectorId].name`; if it can't
 * be resolved the helper falls back to a shared `Sectors / Unsorted` folder
 * and emits a single console warning so the missing sector record is visible.
 *
 * @param {string} sectorId
 * @param {Object} [campaignState]
 * @returns {Promise<string|null>}
 */
export async function getOrCreateSectorActorFolder(sectorId, campaignState) {
  const state = campaignState ?? globalThis.game?.settings?.get?.("starforged-companion", "campaignState") ?? {};
  const sector = (state.sectors ?? []).find(s => s.id === sectorId);
  if (!sector?.name) {
    console.warn(`starforged-companion | folder: sector ${sectorId} not found in campaignState; falling back to Sectors / Unsorted`);
    return ensureFolderPath("Actor", ["Sectors", "Unsorted"]);
  }
  return ensureFolderPath("Actor", ["Sectors", sector.name]);
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
