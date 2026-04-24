/**
 * STARFORGED COMPANION
 * src/art/storage.js — Art asset persistence
 *
 * Responsibilities:
 * - Store base64 image data as a Foundry journal entry
 * - Retrieve asset records by ID
 * - Manage the asset index in campaign state
 * - Provide a data URI for rendering in Foundry UI panels
 *
 * Storage format:
 *   Each asset is a JournalEntry named "Art: [entityType] [entityId]".
 *   The base64 data lives in a JournalEntryPage flag.
 *   The asset metadata (id, entity link, lock state) is in campaign state.
 *
 * Why journal entries and not FilePicker?
 *   Writing to the filesystem requires server-side permissions that players
 *   may not have on The Forge. Journal entries are always writable by the GM
 *   and readable by players with appropriate permissions. The base64 approach
 *   is slightly heavier but avoids any hosting dependency.
 *
 * Size budget:
 *   DALL-E 3 standard 1024×1024 PNG ≈ 1–2 MB as base64 ≈ 1.3–2.7 MB string.
 *   Foundry journal entries can hold this comfortably.
 *   1792×1024 (ships/planets) ≈ 1.5–3 MB base64. Still fine.
 *   A full campaign with 20 entities ≈ 20–60 MB of journal data. Manageable.
 */

const MODULE_ID = "starforged-companion";
const FLAG_KEY  = "artAsset";


// ─────────────────────────────────────────────────────────────────────────────
// STORE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Store an ArtAsset record. Creates a journal entry if none exists,
 * updates the existing one if it does (e.g. on lock state change).
 * Registers the asset ID in campaign state.
 *
 * @param {ArtAsset} asset
 * @param {Object}   campaignState — mutated in place
 * @returns {Promise<ArtAsset>}
 */
export async function storeArtAsset(asset, campaignState) {
  const entryName = buildEntryName(asset);
  const existing  = game.journal?.getName(entryName);

  if (existing) {
    await updateAssetEntry(existing, asset);
  } else {
    await createAssetEntry(entryName, asset);
  }

  // Register in campaign state asset index
  if (!campaignState.artAssetIds) campaignState.artAssetIds = {};
  campaignState.artAssetIds[asset._id] = entryName;

  await persistCampaignState(campaignState);
  return asset;
}


// ─────────────────────────────────────────────────────────────────────────────
// LOAD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load an ArtAsset by ID.
 * Looks up the journal entry name from campaign state, then reads the flag.
 *
 * @param {string} assetId
 * @param {Object} [campaignState]  — if not provided, scans all journal entries (slow)
 * @returns {Promise<ArtAsset|null>}
 */
export async function loadArtAsset(assetId, campaignState = null) {
  try {
    // Fast path: look up entry name from campaign state index
    if (campaignState?.artAssetIds?.[assetId]) {
      const entryName = campaignState.artAssetIds[assetId];
      return readAssetFromEntry(game.journal?.getName(entryName));
    }

    // Slow path: scan all journal entries for this asset ID
    for (const entry of game.journal?.contents ?? []) {
      if (entry.flags?.[MODULE_ID]?.entityType === "artAsset") {
        const page = entry.pages?.contents?.[0];
        const asset = page?.flags?.[MODULE_ID]?.[FLAG_KEY];
        if (asset?._id === assetId) return asset;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Load all art assets for a specific entity.
 *
 * @param {string} entityId
 * @param {Object} [campaignState]
 * @returns {Promise<ArtAsset[]>}
 */
export async function loadEntityAssets(entityId, campaignState = null) {
  const assets = [];
  try {
    for (const entry of game.journal?.contents ?? []) {
      if (entry.flags?.[MODULE_ID]?.entityType !== "artAsset") continue;
      const page  = entry.pages?.contents?.[0];
      const asset = page?.flags?.[MODULE_ID]?.[FLAG_KEY];
      if (asset?.entityId === entityId) assets.push(asset);
    }
  } catch {
    // Scan failed — return what we have
  }
  return assets;
}


// ─────────────────────────────────────────────────────────────────────────────
// RENDERING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a data URI for rendering an asset in a Foundry UI panel or chat card.
 * Returns null if the asset has no image data.
 *
 * @param {ArtAsset} asset
 * @returns {string|null}
 */
export function getDataUri(asset) {
  if (!asset?.b64) return null;
  return `data:image/png;base64,${asset.b64}`;
}

/**
 * Get the data URI for an entity's current portrait.
 * Convenience wrapper used by UI panels.
 *
 * @param {string} portraitId   — from entity.portraitId
 * @param {Object} campaignState
 * @returns {Promise<string|null>}
 */
export async function getPortraitDataUri(portraitId, campaignState) {
  if (!portraitId) return null;
  const asset = await loadArtAsset(portraitId, campaignState);
  return getDataUri(asset);
}


// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL
// ─────────────────────────────────────────────────────────────────────────────

async function createAssetEntry(entryName, asset) {
  const entry = await JournalEntry.create({
    name:  entryName,
    flags: { [MODULE_ID]: { entityType: "artAsset", assetId: asset._id } },
  });

  await entry.createEmbeddedDocuments("JournalEntryPage", [{
    name:  "Asset Data",
    type:  "text",
    flags: { [MODULE_ID]: { [FLAG_KEY]: asset } },
  }]);

  return entry;
}

async function updateAssetEntry(entry, asset) {
  const page = entry.pages?.contents?.[0];
  if (!page) return createAssetEntry(buildEntryName(asset), asset);
  await page.setFlag(MODULE_ID, FLAG_KEY, asset);
}

function readAssetFromEntry(entry) {
  if (!entry) return null;
  const page = entry.pages?.contents?.[0];
  return page?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? null;
}

function buildEntryName(asset) {
  return `Art: ${asset.entityType} ${asset.entityId}`;
}

async function persistCampaignState(campaignState) {
  try {
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
  } catch {
    // non-Foundry context
  }
}
