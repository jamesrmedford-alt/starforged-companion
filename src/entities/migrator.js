/**
 * STARFORGED COMPANION
 * src/entities/migrator.js — `!migrate-entities` chat command
 *
 * One-time GM-triggered migration from the legacy JournalEntry-backed entity
 * storage to native foundry-ironsworn Actor documents. See
 * docs/entities/entity-actor-migration-scope.md §5 for the full design.
 *
 * Phase 2 — handles only `ship` migration. Each found legacy ship journal:
 *   1. Reads the page-flag payload
 *   2. Creates a starship Actor with the equivalent shape (battered/cursed on
 *      system.debility, everything else on flags[MODULE].ship)
 *   3. Preserves the custom GUID (`ship._id`) so cross-document references
 *      survive
 *   4. Replaces the journal id in campaignState.shipIds[] with the new actor id
 *   5. Flags the source JournalEntry with migrated.{toActorId, at} so a
 *      deferred `!migrate-entities --cleanup` (run >7 days later) can delete
 *      it safely. The journal is NOT deleted in this pass.
 *
 * Idempotent — re-running skips entries already flagged `migrated` and skips
 * sectors / folders that already exist.
 */

import { createShip }       from "./ship.js";
import { createPlanet }     from "./planet.js";
import { createLocation }   from "./location.js";
import { createSettlement } from "./settlement.js";
import { getOrCreateSectorJournalFolder, getOrCreateSectorActorFolder, getOrCreateSectorNpcActorFolder, getOrCreateActorFolder, folderParentId } from "./folder.js";
import {
  rewriteSectorOverviewSettlements,
  cleanupSectorRecordPages,
} from "../sectors/sectorOverview.js";

const MODULE_ID = "starforged-companion";

// Per scope: deferred reaper deletes legacy journals at least N days old.
const CLEANUP_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

const TYPES = [
  { key: "ship",       creator: createShip,       campaignField: "shipIds"       },
  { key: "planet",     creator: createPlanet,     campaignField: "planetIds"     },
  { key: "location",   creator: createLocation,   campaignField: "locationIds"   },
  { key: "settlement", creator: createSettlement, campaignField: "settlementIds" },
];

/**
 * Entrypoint — invoked from src/index.js when the GM types `!migrate-entities`.
 * Args parsed from the chat message:
 *   --cleanup   delete legacy journals flagged with `migrated.at` older than 7d
 *
 * @param {Object} message  the Foundry ChatMessage that triggered the command
 * @returns {Promise<void>}
 */
export async function handleMigrateEntitiesCommand(message) {
  const user = message?.author ?? globalThis.game?.users?.get(message?.user);
  if (!user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Starforged Companion: only the GM can run !migrate-entities.");
    return;
  }

  const text = (message?.content ?? "").trim();
  const isCleanup = /--cleanup\b/i.test(text);

  if (isCleanup) {
    const summary = await runCleanup();
    await postSummaryCard("Migration Cleanup", summary);
    return;
  }

  const summary = await runMigration();
  await postSummaryCard("Entity Migration", summary);
}

/**
 * Forward migration pass — Actor creation + campaignState rewrite. Does NOT
 * delete the legacy journals; cleanup pass handles that after the safety window.
 */
async function runMigration() {
  const campaignState = globalThis.game?.settings?.get(MODULE_ID, "campaignState") ?? {};
  const summary = {
    ship:               { migrated: 0, alreadyMigrated: 0, errors: 0 },
    planet:             { migrated: 0, alreadyMigrated: 0, errors: 0 },
    location:           { migrated: 0, alreadyMigrated: 0, errors: 0 },
    settlement:         { migrated: 0, alreadyMigrated: 0, errors: 0 },
    sectorJournalsMoved: 0,
    orphanJournalDeleted: false,
    notes:              [],
  };

  // Step 2 (scope §5) — reparent existing sector-record JournalEntries into
  // per-sector subfolders before we add new Actor folders to the tree.
  await reparentSectorRecordJournals(campaignState, summary);

  // Step 3 — migrate every legacy entity journal of a migrated type.
  for (const journal of [...(globalThis.game?.journal ?? [])]) {
    const page = journal.pages?.contents?.[0];
    if (!page) continue;

    const existingMigrated = journal.flags?.[MODULE_ID]?.migrated;

    for (const { key, creator, campaignField } of TYPES) {
      const data = page.getFlag?.(MODULE_ID, key) ?? page.flags?.[MODULE_ID]?.[key];
      if (!data) continue;

      if (existingMigrated?.toActorId) {
        summary[key].alreadyMigrated += 1;
        break;
      }
      try {
        await migrateEntityJournal(journal, key, data, creator, campaignField, campaignState);
        summary[key].migrated += 1;
      } catch (err) {
        console.error(`${MODULE_ID} | migrator: ${key} migration failed for ${journal.id}:`, err);
        summary[key].errors += 1;
        summary.notes.push(`${key} "${data.name ?? journal.id}" — ${err.message ?? "unknown error"}`);
      }
      break;  // a journal carries one typed payload; stop after the first match
    }
  }

  // Step 4 — patch every campaignState.sectors[] entry so its settlement /
  // planet / location references point at the new Actor ids. The migrator
  // updated the top-level *Ids[] arrays inside migrateEntityJournal; this
  // walks the per-sector reference subsets and rewrites any that still hold
  // a legacy journal id.
  rewriteSectorEntityReferences(campaignState, summary);

  // Step 5 — for every sector-record JournalEntry, replace the overview's
  // settlements list with @UUID document links and delete the per-settlement
  // embedded pages. Idempotent: rewriteSectorOverviewSettlements returns
  // false when the page is already up to date, and cleanupSectorRecordPages
  // returns 0 when there's nothing extra to delete.
  await rewriteSectorOverviews(campaignState, summary);

  // Step 6 — delete the orphan "Starforged Sectors" JournalEntry. Nothing
  // reads it post-migration; safe to remove now rather than waiting on the
  // 7-day window.
  await deleteOrphanSectorsJournal(summary);

  // Step 7 — flatten the per-sector Actor folder structure. Earlier builds
  // wrote settlement/planet/location actors into
  // `Sectors / <Sector Name> / Settlements` (and Planets/Locations); they
  // now live directly in `Sectors / <Sector Name>`. Move any actors still
  // sitting in the legacy subfolder, then drop empty subfolders.
  const flat = await flattenSectorActorFolders(campaignState);
  summary.actorsReparented        = flat.moved;
  summary.legacyTypeFoldersRemoved = flat.foldersDeleted;

  const anyMigrated = TYPES.some(t => summary[t.key].migrated > 0);
  if (anyMigrated) {
    try {
      await globalThis.game.settings.set(MODULE_ID, "campaignState", campaignState);
    } catch (err) {
      console.error(`${MODULE_ID} | migrator: persistCampaignState failed:`, err);
      summary.notes.push(`Failed to persist campaignState: ${err.message}`);
    }
  }

  return summary;
}

async function migrateEntityJournal(journal, typeKey, payload, creator, campaignField, campaignState) {
  const before = (campaignState[campaignField] ?? []).slice();

  // Pass the legacy journal id as a hint into createXxx so the Actor
  // creator's persist:false short-circuit doesn't accidentally rewrite
  // campaignState — the migrator manages the array itself.
  await creator(payload, campaignState, { persist: false });

  const all   = campaignState[campaignField] ?? [];
  const added = all.find(id => !before.includes(id));
  if (!added) {
    throw new Error(`create${capitalize(typeKey)} returned without registering an actor id`);
  }
  const filtered = all.filter(id => id === added || id !== journal.id);
  campaignState[campaignField] = filtered;

  // Update currentLocationId pointer if it referenced the legacy journal id.
  if (campaignState.currentLocationId === journal.id) {
    campaignState.currentLocationId = added;
  }

  await journal.setFlag?.(MODULE_ID, "migrated", {
    toActorId: added,
    at:        new Date().toISOString(),
  });
}

async function reparentSectorRecordJournals(campaignState, summary) {
  for (const journal of globalThis.game?.journal ?? []) {
    if (!journal.flags?.[MODULE_ID]?.sectorRecord) continue;
    const sectorId = journal.flags[MODULE_ID].sectorId;
    if (!sectorId) continue;

    try {
      const targetFolder = await getOrCreateSectorJournalFolder(sectorId, campaignState);
      if (!targetFolder || journal.folder === targetFolder) continue;
      await journal.update?.({ folder: targetFolder });
      summary.sectorJournalsMoved += 1;
    } catch (err) {
      console.error(`${MODULE_ID} | migrator: reparent sector journal ${journal.id} failed:`, err);
      summary.notes.push(`sector journal "${journal.name ?? journal.id}" — ${err.message ?? "reparent failed"}`);
    }
  }
}

function rewriteSectorEntityReferences(campaignState, summary) {
  if (!Array.isArray(campaignState?.sectors)) return;
  let touched = 0;
  for (const sector of campaignState.sectors) {
    // Resolve legacy hostId → migrated actor id by walking game.journal for
    // each id. Faster than scanning all journals once: most sectors hold a
    // handful of references.
    const remap = (id) => {
      if (!id) return id;
      const actor = globalThis.game?.actors?.get?.(id);
      if (actor) return id; // already an actor id
      const journal   = globalThis.game?.journal?.get?.(id) ?? null;
      const toActorId = journal?.flags?.[MODULE_ID]?.migrated?.toActorId ?? null;
      return toActorId ?? id;
    };
    if (Array.isArray(sector.settlementIds)) {
      const before = sector.settlementIds.slice();
      sector.settlementIds = sector.settlementIds.map(remap);
      if (before.some((v, i) => v !== sector.settlementIds[i])) touched += 1;
    }
    if (sector.entityJournalIds && typeof sector.entityJournalIds === "object") {
      let changed = false;
      const next = {};
      for (const [k, v] of Object.entries(sector.entityJournalIds)) {
        const nv = remap(v);
        next[k] = nv;
        if (nv !== v) changed = true;
      }
      if (changed) {
        sector.entityJournalIds = next;
        touched += 1;
      }
    }
  }
  if (touched) summary.sectorReferencesUpdated = (summary.sectorReferencesUpdated ?? 0) + touched;
}

async function rewriteSectorOverviews(campaignState, summary) {
  if (!Array.isArray(campaignState?.sectors)) return;
  let rewritten = 0;
  let pagesRemoved = 0;
  for (const sector of campaignState.sectors) {
    try {
      if (await rewriteSectorOverviewSettlements(sector.id, campaignState)) rewritten += 1;
      pagesRemoved += await cleanupSectorRecordPages(sector.id, campaignState);
    } catch (err) {
      console.error(`${MODULE_ID} | migrator: rewrite sector overview for ${sector.id} failed:`, err);
      summary.notes.push(`sector "${sector.name ?? sector.id}" overview — ${err.message ?? "rewrite failed"}`);
    }
  }
  if (rewritten)    summary.sectorOverviewsRewritten = rewritten;
  if (pagesRemoved) summary.sectorEmbeddedPagesRemoved = pagesRemoved;
}

async function deleteOrphanSectorsJournal(summary) {
  try {
    const journal = globalThis.game?.journal?.getName?.("Starforged Sectors");
    if (!journal) return;
    await journal.delete?.();
    summary.orphanJournalDeleted = true;
  } catch (err) {
    console.error(`${MODULE_ID} | migrator: delete orphan "Starforged Sectors" failed:`, err);
    summary.notes.push(`Starforged Sectors journal — ${err.message ?? "delete failed"}`);
  }
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/**
 * Cleanup pass — delete legacy journals that have been migrated for at least
 * CLEANUP_DELAY_MS. The migration writes `flags[MODULE].migrated.at` on every
 * journal it ports; this looks for journals whose timestamp predates the
 * safety window and deletes them.
 */
async function runCleanup() {
  const cutoff = Date.now() - CLEANUP_DELAY_MS;
  const summary = { deleted: 0, kept: 0, errors: 0, notes: [] };

  for (const journal of [...(globalThis.game?.journal ?? [])]) {
    const meta = journal.flags?.[MODULE_ID]?.migrated;
    if (!meta?.at) continue;
    const ts = Date.parse(meta.at);
    if (Number.isNaN(ts)) continue;
    if (ts > cutoff) {
      summary.kept += 1;
      continue;
    }
    try {
      await journal.delete?.();
      summary.deleted += 1;
    } catch (err) {
      console.error(`${MODULE_ID} | migrator cleanup: delete failed for ${journal.id}:`, err);
      summary.errors += 1;
      summary.notes.push(`${journal.name ?? journal.id} — ${err.message ?? "delete failed"}`);
    }
  }

  return summary;
}

async function postSummaryCard(title, summary) {
  const lines = [];
  for (const { key } of TYPES) {
    if (!(key in summary)) continue;
    const counts = summary[key];
    if (counts.migrated || counts.alreadyMigrated || counts.errors) {
      const label = `${capitalize(key)}s`;
      lines.push(`<li>${label} migrated: <strong>${counts.migrated}</strong>` +
        (counts.alreadyMigrated ? ` (already migrated: ${counts.alreadyMigrated})` : "") +
        (counts.errors ? ` <em>(${counts.errors} error${counts.errors === 1 ? "" : "s"})</em>` : "") +
        `</li>`);
    }
  }
  if (summary.sectorJournalsMoved) {
    lines.push(`<li>Sector journals reparented: ${summary.sectorJournalsMoved}</li>`);
  }
  if (summary.sectorOverviewsRewritten) {
    lines.push(`<li>Sector overviews rewritten with @UUID links: ${summary.sectorOverviewsRewritten}</li>`);
  }
  if (summary.sectorEmbeddedPagesRemoved) {
    lines.push(`<li>Legacy embedded settlement pages removed: ${summary.sectorEmbeddedPagesRemoved}</li>`);
  }
  if (summary.sectorReferencesUpdated) {
    lines.push(`<li>Sector entity references repointed at Actors: ${summary.sectorReferencesUpdated}</li>`);
  }
  if (summary.orphanJournalDeleted) {
    lines.push(`<li>Removed legacy "Starforged Sectors" journal.</li>`);
  }
  if (summary.actorsReparented) {
    lines.push(`<li>Actors moved into per-sector folder: ${summary.actorsReparented}</li>`);
  }
  if (summary.legacyTypeFoldersRemoved) {
    lines.push(`<li>Empty legacy Settlements/Planets/Locations folders removed: ${summary.legacyTypeFoldersRemoved}</li>`);
  }
  if ("deleted" in summary) {
    lines.push(`<li>Legacy journals deleted: <strong>${summary.deleted}</strong></li>`);
    if (summary.kept) lines.push(`<li>Still within 7-day grace window: ${summary.kept}</li>`);
    if (summary.errors) lines.push(`<li>Delete errors: ${summary.errors}</li>`);
  }
  for (const note of summary.notes ?? []) {
    lines.push(`<li class="sf-migrate-note">${escapeHtml(note)}</li>`);
  }

  const content =
    `<div class="sf-migrate-card">` +
    `<div class="sf-migrate-label">◈ ${escapeHtml(title)}</div>` +
    `<ul class="sf-migrate-list">${lines.join("")}</ul>` +
    `</div>`;

  try {
    await globalThis.ChatMessage?.create?.({
      content,
      whisper: collectGmIds(),
      flags:   { [MODULE_ID]: { migrateEntitiesCard: true } },
    });
  } catch (err) {
    console.error(`${MODULE_ID} | migrator: failed to post summary card:`, err);
  }
}

function collectGmIds() {
  try {
    const users = globalThis.game?.users;
    if (!users?.filter) return [];
    return users.filter(u => u.isGM).map(u => u.id);
  } catch {
    return [];
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─────────────────────────────────────────────────────────────────────────────
// Sector folder flatten — Settlements/Planets/Locations → flat per-sector
// ─────────────────────────────────────────────────────────────────────────────

const FLATTEN_ENTITY_TYPES = ["settlement", "planet", "location"];
const LEGACY_TYPE_FOLDER_NAMES = ["Settlements", "Planets", "Locations"];

/**
 * Move every settlement / planet / location Actor out of the legacy per-type
 * subfolder (`Sectors / <Sector Name> / Settlements`, or the no-sector
 * fallback `Sectors / Settlements`) and into a flat per-sector folder
 * (`Sectors / <Sector Name>`). Then delete any now-empty legacy
 * "Settlements" / "Planets" / "Locations" Actor folders.
 *
 * Idempotent — actors already sitting in the right folder are skipped, and a
 * run that finds nothing to do is a no-op. Safe to invoke on every world
 * load.
 *
 * Folders are only deleted when they are empty AND parented either directly
 * under `Sectors` (the no-sector fallback path) or one level deeper under a
 * sector subfolder. Folders with the same name parked anywhere else in the
 * tree are left alone.
 *
 * @param {Object} [campaignState]
 * @returns {Promise<{moved: number, foldersDeleted: number, skipped: number}>}
 */
export async function flattenSectorActorFolders(campaignState) {
  const state = campaignState
    ?? globalThis.game?.settings?.get?.(MODULE_ID, "campaignState")
    ?? {};
  const summary = { moved: 0, foldersDeleted: 0, skipped: 0 };

  // Foundry's Collection is iterable but not an Array, so spread to a real
  // array before reaching for array methods (some / filter / etc).
  const allActors = [...(globalThis.game?.actors ?? [])];

  // Step 1 — reparent every entity-typed Actor that isn't already directly
  // under its sector folder. Actors with a resolvable sectorId go to
  // `Sectors / <Name>`; actors whose sector can't be resolved go to the
  // shared `Sectors / Unsorted` fallback (via getOrCreateSectorActorFolder).
  for (const actor of allActors) {
    const flags     = actor.flags?.[MODULE_ID];
    const typeKey   = flags?.entityType;
    if (!typeKey || !FLATTEN_ENTITY_TYPES.includes(typeKey)) continue;

    const sectorId = flags?.[typeKey]?.sectorId ?? null;

    // #1 — when the sector can't be resolved (a sector record the GM removed,
    // or a transient load-order gap on `ready`), do NOT yank an actor that is
    // already settled in a real per-sector folder (`Sectors / <Name>`) into the
    // `Sectors / Unsorted` fallback — leave it where the creator placed it.
    // Actors that are loose, in `Unsorted`, or in a legacy per-type folder
    // (`Settlements`/`Planets`/`Locations`) still get the fallback so they
    // migrate out of the deprecated layout.
    const sectorResolved = (state.sectors ?? []).some(s => s?.id === sectorId && s?.name);
    if (!sectorResolved) {
      const currentFolderId = actor.folder?.id ?? actor.folder ?? null;
      const currentFolder   = currentFolderId ? globalThis.game?.folders?.get?.(currentFolderId) : null;
      if (currentFolder) {
        const parentId = folderParentId(currentFolder.folder);
        const parent   = parentId ? globalThis.game?.folders?.get?.(parentId) : null;
        const settledInSectorFolder =
          parent?.type === "Actor" && parent?.name === "Sectors" && !parent?.folder &&
          currentFolder.name !== "Unsorted" &&
          !LEGACY_TYPE_FOLDER_NAMES.includes(currentFolder.name);
        if (settledInSectorFolder) {
          summary.skipped += 1;
          continue;
        }
      }
    }

    const targetFolderId = await getOrCreateSectorActorFolder(sectorId, state);
    if (!targetFolderId) {
      summary.skipped += 1;
      continue;
    }
    if (actor.folder === targetFolderId || actor.folder?.id === targetFolderId) {
      summary.skipped += 1;
      continue;
    }

    try {
      await actor.update?.({ folder: targetFolderId });
      summary.moved += 1;
    } catch (err) {
      console.error(`${MODULE_ID} | flattenSectorActorFolders: move failed for ${actor.id}:`, err);
    }
  }

  // Step 2 — delete now-empty legacy type folders. Re-snapshot actors so the
  // emptiness check sees the post-move state.
  const actorsAfterMove = [...(globalThis.game?.actors ?? [])];
  const allFolders      = [...(globalThis.game?.folders ?? [])];
  const sectorsRoot     = allFolders.find(
    f => f.type === "Actor" && f.name === "Sectors" && !f.folder
  );

  for (const folder of allFolders) {
    if (folder.type !== "Actor") continue;
    if (!LEGACY_TYPE_FOLDER_NAMES.includes(folder.name)) continue;

    // Parent must be Sectors itself OR a folder whose parent is Sectors
    // (i.e. a sector subfolder). Refuse to delete anything else, even if the
    // name matches — the user may have made their own.
    const parent = folder.folder ? globalThis.game?.folders?.get?.(folder.folder) : null;
    const isUnderSectors          = sectorsRoot && parent?.id === sectorsRoot.id;
    const isUnderSectorSubfolder  = sectorsRoot && parent?.folder === sectorsRoot.id;
    if (!isUnderSectors && !isUnderSectorSubfolder) continue;

    const hasActors   = actorsAfterMove.some(a => a.folder === folder.id || a.folder?.id === folder.id);
    const hasChildren = allFolders.some(f => f.folder === folder.id);
    if (hasActors || hasChildren) continue;

    try {
      await folder.delete?.();
      summary.foldersDeleted += 1;
    } catch (err) {
      console.error(`${MODULE_ID} | flattenSectorActorFolders: delete folder ${folder.id} failed:`, err);
    }
  }

  // Step 3 — remove empty *duplicate* per-sector Actor subfolders left behind by
  // the pre-FOLDER-001-fix bug, which minted a fresh `Sectors / <Name>` folder on
  // every world load (the parent-id comparison in ensureFolderPath compared a
  // Folder document to an id string and never matched). For each name with more
  // than one folder directly under the Sectors root, keep one (the populated one
  // if any, else the first) and delete the rest — but only ever an *empty*
  // folder (no actors, no child folders). A unique sector folder, even an empty
  // one, is never touched.
  if (sectorsRoot) {
    const foldersNow = [...(globalThis.game?.folders ?? [])];
    const sectorSubs = foldersNow.filter(
      f => f.type === "Actor" && folderParentId(f.folder) === sectorsRoot.id
    );
    const isEmptyFolder = folder =>
      !actorsAfterMove.some(a => (a.folder?.id ?? a.folder) === folder.id) &&
      !foldersNow.some(f => folderParentId(f.folder) === folder.id);

    const byName = new Map();
    for (const f of sectorSubs) {
      if (!byName.has(f.name)) byName.set(f.name, []);
      byName.get(f.name).push(f);
    }

    for (const group of byName.values()) {
      if (group.length < 2) continue;                  // unique name → keep
      const keeper = group.find(f => !isEmptyFolder(f)) ?? group[0];
      for (const folder of group) {
        if (folder.id === keeper.id) continue;
        if (!isEmptyFolder(folder)) continue;          // never delete a populated dupe
        try {
          await folder.delete?.();
          summary.foldersDeleted += 1;
        } catch (err) {
          console.error(`${MODULE_ID} | flattenSectorActorFolders: dedup delete folder ${folder.id} failed:`, err);
        }
      }
    }
  }

  return summary;
}

/**
 * Activation-time scaffolding for the top-level Actor folders the Companion
 * organises into: `PCs/` (player characters) and `Starships/` (ships). Creates
 * each folder if absent, then reparents *loose* actors (those with no folder)
 * into the right one — character actors into `PCs/`, starship actors into
 * `Starships/`. Actors already filed in any folder are left untouched, so a
 * user's own organisation is never disturbed.
 *
 * Guard: a `character` actor carrying a `flags[MODULE].entityType` is a
 * module-managed NPC/connection card, not a player character, so it is skipped
 * here and left for the per-sector NPC folder logic (see
 * getOrCreateSectorNpcActorFolder).
 *
 * Idempotent and safe to run on every world load.
 *
 * @returns {Promise<{pcsFolder: string|null, shipsFolder: string|null, moved: number}>}
 */
export async function scaffoldPcShipFolders() {
  const summary = { pcsFolder: null, shipsFolder: null, moved: 0 };
  summary.pcsFolder   = await getOrCreateActorFolder("PCs");
  summary.shipsFolder = await getOrCreateActorFolder("Starships");

  const allActors = [...(globalThis.game?.actors ?? [])];
  for (const actor of allActors) {
    const parent = actor.folder?.id ?? actor.folder ?? null;
    if (parent) continue;  // already filed — never disturb user organisation

    let target = null;
    if (actor.type === "character") {
      if (actor.flags?.[MODULE_ID]?.entityType) continue;  // NPC/connection card, not a PC
      target = summary.pcsFolder;
    } else if (actor.type === "starship") {
      target = summary.shipsFolder;
    }
    if (!target) continue;

    try {
      await actor.update?.({ folder: target });
      summary.moved += 1;
    } catch (err) {
      console.error(`${MODULE_ID} | scaffoldPcShipFolders: move ${actor.id} failed:`, err);
    }
  }
  return summary;
}

/**
 * One-time migration of pre-existing journal-backed connections to NPC-card
 * `character` Actors (FOLDER-002). Connections used to live on JournalEntries;
 * after the storage flip their ids in `campaignState.connectionIds[]` would no
 * longer resolve via the registry. This walks those ids, and for any that still
 * point at a JournalEntry carrying a connection flag payload, creates an
 * equivalent NPC-card Actor (in the sector's NPC folder, or top-level NPCs/),
 * swaps the id in connectionIds, and deletes the old journal.
 *
 * The createActor seed hook then populates each migrated card (Characteristics /
 * Notes / portrait) just like a freshly created connection.
 *
 * GM-only (creates/deletes world documents). Idempotent — ids that already
 * resolve to an Actor are skipped, so re-running on later loads is a no-op.
 *
 * @param {Object} [campaignState]
 * @returns {Promise<{migrated: number, skipped: number}>}
 */
export async function migrateJournalConnectionsToActors(campaignState) {
  const summary = { migrated: 0, skipped: 0 };
  if (globalThis.game?.user && !globalThis.game.user.isGM) return summary;

  const state = campaignState
    ?? globalThis.game?.settings?.get?.(MODULE_ID, "campaignState")
    ?? {};
  const ids = Array.isArray(state.connectionIds) ? state.connectionIds : [];
  if (!ids.length) return summary;

  let changed = false;
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    if (globalThis.game?.actors?.get(id)) { summary.skipped += 1; continue; }  // already an Actor

    const journal = globalThis.game?.journal?.get(id) ?? null;
    const page    = journal?.pages?.contents?.[0];
    const payload = page?.flags?.[MODULE_ID]?.connection;
    if (!payload) { summary.skipped += 1; continue; }  // dangling id — leave as-is

    const folderId = payload.sectorId
      ? await getOrCreateSectorNpcActorFolder(payload.sectorId, state)
      : await getOrCreateActorFolder("NPCs");

    let actor = null;
    try {
      actor = await globalThis.Actor?.create?.({
        name:   payload.name || journal.name || "Unknown Connection",
        type:   "character",
        folder: folderId,
        flags:  { [MODULE_ID]: { entityType: "connection", entityId: payload._id, connection: payload } },
      });
    } catch (err) {
      console.error(`${MODULE_ID} | migrateJournalConnectionsToActors: Actor.create failed for ${id}:`, err);
    }
    if (!actor?.id) { summary.skipped += 1; continue; }

    ids[i] = actor.id;            // swap journal id → actor id in place
    changed = true;
    summary.migrated += 1;

    try {
      await journal.delete?.();
    } catch (err) {
      console.warn(`${MODULE_ID} | migrateJournalConnectionsToActors: old journal delete failed for ${id}:`, err);
    }
  }

  if (changed) {
    state.connectionIds = ids;
    try {
      await globalThis.game?.settings?.set?.(MODULE_ID, "campaignState", state);
    } catch (err) {
      console.warn(`${MODULE_ID} | migrateJournalConnectionsToActors: persist failed:`, err);
    }
  }
  return summary;
}

/**
 * Predicate for the chat-command router in src/index.js.
 */
export function isMigrateEntitiesCommand(message) {
  const text = (message?.content ?? "").trim();
  return /^!migrate-entities\b/i.test(text);
}
