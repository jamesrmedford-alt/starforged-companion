/**
 * STARFORGED COMPANION
 * src/art/storage.js — Art asset persistence
 *
 * Responsibilities:
 * - Store base64 image data as a Foundry journal entry
 * - Retrieve asset records by ID
 * - Manage the asset index in campaign state
 * - Delete an entity's portraits with the entity (deleteEntityArtAssets)
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

import { isCanonicalGM } from "../multiplayer/gmGate.js";
import { serialiseCampaignStateWrite } from "../multiplayer/campaignStateChain.js";

const MODULE_ID   = "starforged-companion";
const FLAG_KEY    = "artAsset";
const ART_FOLDER_NAME = "Starforged Companion — Art Cache";


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
    // An earlier portrait of this entity whose page the world refused left
    // its "Art: …" entry page-less — no asset to read off it — and the next
    // Generate made a second entry beside it, the first left empty in the Art
    // Cache for good (issue #345 AA54). It is the entry this asset completes,
    // as a page-less faction or Chronicle journal is (decisions.md "A
    // page-less journal is completed, not duplicated").
    const pageless = findPagelessAssetEntry(asset.entityType, asset.entityId);
    if (pageless) await completeAssetEntry(pageless, entryName, asset);
    else await createAssetEntry(entryName, asset);
  }

  // Register in campaign state asset index — on the caller's copy, and on
  // the latest stored campaignState rather than by writing that copy whole: a
  // portrait finishes long after its caller read campaignState (the move
  // pipeline's Make a Connection auto-create, sector creation), and the whole
  // write reverted every write relayed meanwhile — an X-Card included
  // (issue #300 F14).
  // The store first, the caller's copy once the world took it: the copy is
  // often the cached setting, and a refused write left the GM's index
  // naming an asset the world never registered (issue #331 X35).
  // A refused index write is not the asset's loss: its journal entry holds
  // it, where loadArtAsset finds it by its flags. The caller goes on to link
  // the portrait to its entity — the refusal aborted that, so the entity kept
  // no portraitId and its next Finalise paid for another (issue #337 Y34).
  try {
    await registerArtAssetInStore(asset._id, entryName);
  } catch (err) {
    console.warn(`${MODULE_ID} | art/storage: portrait ${asset._id} kept unindexed — it is found by its journal entry:`, err?.message ?? err);
    return asset;
  }
  if (!campaignState.artAssetIds) campaignState.artAssetIds = {};
  campaignState.artAssetIds[asset._id] = entryName;
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
    // Fast path: look up entry name from campaign state index — the entry it
    // names must still hold this asset. A GM who renamed the opaque "Art: …"
    // entry in the Art Cache folder hid the portrait for good: the name found
    // nothing and the scan below never ran (issue #322 V25).
    if (campaignState?.artAssetIds?.[assetId]) {
      const entryName = campaignState.artAssetIds[assetId];
      const byName = readAssetFromEntry(game.journal?.getName(entryName));
      if (byName?._id === assetId) return byName;
    }

    // Slow path (and the fast path's fallback): scan journal entries for this
    // asset ID — the flags a rename leaves alone.
    for (const entry of game.journal?.contents ?? []) {
      if (entry.flags?.[MODULE_ID]?.entityType === "artAsset") {
        const page = entry.pages?.contents?.[0];
        const asset = page?.flags?.[MODULE_ID]?.[FLAG_KEY];
        if (asset?._id === assetId) return asset;
      }
    }

    return null;
  } catch (err) {
    console.warn(`${MODULE_ID} | art/storage: loadArtAsset(${assetId}) failed:`, err);
    return null;
  }
}

/**
 * The newest portrait the Art Cache holds for an entity that no regeneration
 * superseded — or null. The generator asks only for an entity whose record
 * names no portrait it can load, so the one found is one no record names: a
 * first portrait made and stored whose link the world refused (known-issues
 * FIRST-PORTRAIT-LINK-REFUSED). Linking it saves it without buying a second
 * image (generator.js).
 *
 * @param {string} entityType — the asset's entityType ("connection", …)
 * @param {string} entityId   — the entity record's `_id` (the asset's entityId)
 * @returns {ArtAsset|null}
 */
export function findEntityPortrait(entityType, entityId) {
  if (!entityType || !entityId) return null;
  let found = null;
  for (const entry of game.journal?.contents ?? []) {
    if (entry?.flags?.[MODULE_ID]?.entityType !== "artAsset") continue;
    const asset = readAssetFromEntry(entry);
    if (asset?.entityType !== entityType || asset?.entityId !== entityId || asset.superseded) continue;
    if (!found || String(asset.generatedAt ?? "") > String(found.generatedAt ?? "")) found = asset;
  }
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Delete an entity's portraits with the entity — every "Art: …" journal entry
 * holding an asset generated for it (a superseded one too; the asset's own
 * `entityType` / `entityId`, plus the record's `portraitId`) and their entries
 * in the art index. The X-Card's removal of a connection its narration
 * created deleted the NPC card and left its portrait behind, an orphan in the
 * Art Cache folder that nothing links to (connection.
 * retractNarrationConnections, issue #338 D6(ii) —
 * XCARD-CONNECTION-PORTRAIT-ORPHAN). The image file the portrait was uploaded
 * as stays: the client has no file delete.
 *
 * Canonical GM only (single emitter). The index write is a copy of the latest
 * stored campaignState with no await between its read and write, on the
 * client's campaignState write chain; a refused write is logged, never
 * thrown, and leaves index entries no journal entry answers, which
 * loadArtAsset passes over.
 *
 * @param {string} entityType — the asset's entityType ("connection", …)
 * @param {string} entityId   — the entity record's `_id` (the asset's entityId)
 * @param {{ portraitId?: string|null }} [opts] — the record's linked portrait
 * @returns {Promise<number>} journal entries deleted
 */
export async function deleteEntityArtAssets(entityType, entityId, { portraitId = null } = {}) {
  if (!entityType || !entityId || !isCanonicalGM()) return 0;
  const owned = (entry) => {
    if (entry?.flags?.[MODULE_ID]?.entityType !== "artAsset") return false;
    const asset = readAssetFromEntry(entry);
    if (asset?.entityType === entityType && asset?.entityId === entityId) return true;
    // A page-less entry made for the entity — its portrait's page refused —
    // goes with it too: nothing reads an asset off it (issue #345 AA54).
    if (!asset && isPagelessEntryOf(entry, entityType, entityId)) return true;
    return !!portraitId && (asset?._id === portraitId || entry.flags[MODULE_ID].assetId === portraitId);
  };
  const entries = (game.journal?.contents ?? []).filter(owned);

  const gone = new Set();
  let deleted = 0;
  for (const entry of entries) {
    const assetId = entry.flags?.[MODULE_ID]?.assetId ?? readAssetFromEntry(entry)?._id ?? null;
    try {
      await entry.delete();
      deleted += 1;
      if (assetId) gone.add(assetId);
    } catch (err) {
      console.warn(`${MODULE_ID} | art/storage: deleting the portrait entry "${entry?.name}" failed:`, err?.message ?? err);
    }
  }
  // The linked portrait's index entry goes when no entry holds it any more.
  if (portraitId && !(game.journal?.contents ?? []).some(owned)) gone.add(portraitId);

  // Read and written at its turn on the client's campaignState write chain:
  // read inside the round trip of a write ahead (a clock advance, an oracle
  // capture), it put that write's fields back (ART-INDEX-WRITE-OFF-CHAIN).
  try {
    await serialiseCampaignStateWrite(async () => {
      const latest = game.settings.get(MODULE_ID, "campaignState") ?? {};
      const index = latest.artAssetIds ?? {};
      const drop = [...gone].filter(id => Object.prototype.hasOwnProperty.call(index, id));
      if (!drop.length) return;
      const next = { ...index };
      for (const id of drop) delete next[id];
      await game.settings.set(MODULE_ID, "campaignState", { ...latest, artAssetIds: next });
    }, "art index: deleted portraits");
  } catch (err) {
    console.warn(`${MODULE_ID} | art/storage: dropping deleted portraits from the art index failed — the entries name nothing now:`, err?.message ?? err);
  }
  return deleted;
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

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL
// ─────────────────────────────────────────────────────────────────────────────

async function createAssetEntry(entryName, asset) {
  const folderId = await getOrCreateArtFolder();
  const entry = await JournalEntry.create({
    name:   entryName,
    folder: folderId,
    flags:  { [MODULE_ID]: assetEntryFlags(asset) },
  });

  await entry.createEmbeddedDocuments("JournalEntryPage", [assetPageData(asset)]);

  return entry;
}

/**
 * Give a page-less "Art: …" entry `asset`'s page, under the asset's name and
 * flags — the creation the world refused the page of, completed, never a
 * second entry beside it (issue #345 AA54). Rejects when the rename or the
 * page is refused: the entry stays page-less, for the next store to complete.
 */
async function completeAssetEntry(entry, entryName, asset) {
  const own   = entry.flags?.[MODULE_ID] ?? {};
  const flags = assetEntryFlags(asset);
  if (entry.name !== entryName || Object.keys(flags).some(key => own[key] !== flags[key])) {
    await entry.update({ name: entryName, flags: { [MODULE_ID]: { ...own, ...flags } } });
  }
  await entry.createEmbeddedDocuments("JournalEntryPage", [assetPageData(asset)]);
  console.log(`${MODULE_ID} | art/storage: completed the page-less Art Cache entry "${entryName}" (${entry.id})`);
  return entry;
}

/**
 * An "Art: …" entry's flags: its asset, and the entity that asset was made
 * for — what names a page-less entry's entity (isPagelessEntryOf) when no
 * page holds the asset.
 */
function assetEntryFlags(asset) {
  return {
    entityType:      "artAsset",
    assetId:         asset._id,
    assetEntityType: asset.entityType ?? null,
    assetEntityId:   asset.entityId ?? null,
  };
}

function assetPageData(asset) {
  return {
    name:  "Asset Data",
    type:  "text",
    text:  { content: buildPageContent(asset), format: 1 },
    flags: { [MODULE_ID]: { [FLAG_KEY]: asset } },
  };
}

/** The page-less "Art: …" entry made for an entity (isPagelessEntryOf), or null. */
function findPagelessAssetEntry(entityType, entityId) {
  if (!entityType || !entityId) return null;
  return (game.journal?.contents ?? []).find(entry => isPagelessEntryOf(entry, entityType, entityId)) ?? null;
}

/**
 * Whether `entry` is an "Art: …" entry with no page, made for this entity:
 * named by its `assetEntityType` / `assetEntityId` flags, else — an entry
 * made before those flags — by the name its creator gave it
 * ("Art: <entityType> <entityId> <assetId>", buildEntryName).
 */
function isPagelessEntryOf(entry, entityType, entityId) {
  const flags = entry?.flags?.[MODULE_ID];
  if (flags?.entityType !== "artAsset" || entry.pages?.contents?.length) return false;
  if (flags.assetEntityId) return flags.assetEntityType === entityType && flags.assetEntityId === entityId;
  return String(entry.name ?? "").startsWith(`Art: ${entityType} ${entityId} `);
}

async function updateAssetEntry(entry, asset) {
  const page = entry.pages?.contents?.[0];
  // A page-less entry of this asset's own name is given its page — it made a
  // second entry of that name beside it (issue #345 AA54).
  if (!page) return completeAssetEntry(entry, buildEntryName(asset), asset);
  await page.setFlag(MODULE_ID, FLAG_KEY, asset);
  // Refresh the visible page body so opening the entry shows the image
  // rather than an empty "Asset Data" heading.
  try {
    await page.update({ "text.content": buildPageContent(asset) });
  } catch (err) {
    console.warn(`${MODULE_ID} | art/storage: failed to refresh page content:`, err);
  }
}

/**
 * Render the visible body of an art-asset page. The base64 data lives in a
 * page flag — historically `text.content` was left empty, so opening the
 * entry showed nothing. Embedding a data URI here makes the entry render
 * the portrait when the GM clicks into it.
 */
function buildPageContent(asset) {
  const uri = asset?.b64 ? `data:image/png;base64,${asset.b64}` : null;
  if (!uri) return "<p><em>Generated portrait — pending image data.</em></p>";
  return `<figure><img src="${uri}" style="max-width:100%;height:auto;" alt="Generated portrait"></figure>`;
}

/**
 * Find or create the dedicated folder for art-asset journal entries. Keeps
 * the generated "Art: …" entries out of the Starforged Entities folder
 * where they were previously appearing as gibberish-named orphans.
 */
async function getOrCreateArtFolder() {
  try {
    const existing = game.folders?.find?.(
      f => f.name === ART_FOLDER_NAME && f.type === "JournalEntry"
    );
    if (existing) return existing.id;
    const FolderCls = globalThis.Folder;
    if (!FolderCls?.create) return null;
    const created = await FolderCls.create({
      name:    ART_FOLDER_NAME,
      type:    "JournalEntry",
      sorting: "a",
    });
    return created?.id ?? null;
  } catch (err) {
    console.warn(`${MODULE_ID} | art/storage: getOrCreateArtFolder failed:`, err);
    return null;
  }
}

function readAssetFromEntry(entry) {
  if (!entry) return null;
  const page = entry.pages?.contents?.[0];
  return page?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? null;
}

function buildEntryName(asset) {
  // Include asset._id so superseded predecessors keep their own journal entry
  // instead of being clobbered by the regenerated portrait that shares the
  // same entityType + entityId. loadArtAsset's fast path keys off
  // campaignState.artAssetIds[assetId] → entryName, so the change is
  // transparent to callers.
  return `Art: ${asset.entityType} ${asset.entityId} ${asset._id}`;
}

/**
 * Add one entry to the art index on the latest stored campaignState (no await
 * between read and write), read at its turn on the client's campaignState
 * write chain: read inside the round trip of a write ahead (a clock advance,
 * an oracle capture), it put that write's fields back
 * (ART-INDEX-WRITE-OFF-CHAIN). Decided on the store, never on the caller's
 * copy — that is often the setting's cached object, already holding the
 * entry: nothing is written when the store already names it (a portrait's
 * lock or regeneration state changing re-stores the same asset).
 */
async function registerArtAssetInStore(assetId, entryName) {
  try {
    await serialiseCampaignStateWrite(async () => {
      const latest = game.settings.get(MODULE_ID, "campaignState") ?? {};
      if (latest.artAssetIds?.[assetId] === entryName) return;
      await game.settings.set(MODULE_ID, "campaignState", {
        ...latest,
        artAssetIds: { ...(latest.artAssetIds ?? {}), [assetId]: entryName },
      });
    }, "art index");
  } catch (err) {
    console.error(`${MODULE_ID} | art/storage: registering the art asset failed:`, err);
    throw err;
  }
}
