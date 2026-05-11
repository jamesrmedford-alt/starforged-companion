/**
 * STARFORGED COMPANION
 * src/entities/folder.js — shared Journal folder for entity records
 *
 * Settlements, connections, planets, locations, factions, creatures, and
 * ships each create their own JournalEntry. Without an explicit folder
 * they land at the root of the Foundry Journals tab — visually
 * indistinguishable from blank top-level entries and easy to confuse with
 * duplicate journal stubs. This helper funnels every entity entry into a
 * single "Starforged Entities" folder so the root stays clean.
 *
 * The "Sectors" folder (sectorGenerator.js) is unrelated and keeps holding
 * the sector wrapper journals.
 */

const FOLDER_NAME = "Starforged Entities";
const FOLDER_COLOR = "#4A6FA5";

let _cachedId = null;

export async function getOrCreateEntitiesFolder() {
  if (_cachedId && game.folders?.get(_cachedId)) return _cachedId;
  const existing = game.folders?.find(
    f => f.type === "JournalEntry" && f.name === FOLDER_NAME
  );
  if (existing) {
    _cachedId = existing.id;
    return _cachedId;
  }
  try {
    const created = await globalThis.Folder?.create?.({
      name:  FOLDER_NAME,
      type:  "JournalEntry",
      color: FOLDER_COLOR,
    });
    _cachedId = created?.id ?? null;
  } catch (err) {
    console.warn(`starforged-companion | entities/folder: create failed:`, err);
    _cachedId = null;
  }
  return _cachedId;
}
