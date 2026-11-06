/**
 * STARFORGED COMPANION
 * src/entities/migrator.js — `!migrate-entities` chat command
 *
 * One-time GM-triggered migration from the legacy JournalEntry-backed entity
 * storage to native foundry-ironsworn Actor documents. See
 * issue #228 (Entity → Actor Migration) §5 for the full design.
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
import { STARFORGED_CHARACTER_SHEET } from "./connection.js";
import { getEntityDocument, readEntityFlag, writeEntityFlag, iterEntityDocuments, hasSheetNotes, unionIdList } from "./registry.js";
import { serialiseCampaignStateWrite } from "../multiplayer/campaignStateChain.js";
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
      // The move lock as the store holds it now, never as this snapshot held
      // it across the awaits above: a move that claimed or released the lock
      // meanwhile keeps it — the lock's own paths alone write it
      // (LOCK-RESURRECTED-BY-COGM-STALE-WRITE). Read at this write's turn on
      // the client's campaignState write chain (CAMPSTATE-CHAIN-REST).
      await serialiseCampaignStateWrite(() => {
        const latest = globalThis.game.settings.get(MODULE_ID, "campaignState") ?? {};
        return globalThis.game.settings.set(MODULE_ID, "campaignState", {
          ...campaignState,
          pendingMove:      latest.pendingMove ?? false,
          pendingMoveBy:    latest.pendingMoveBy ?? null,
          pendingMoveClaim: latest.pendingMoveClaim ?? null,
        });
      }, "entity migration");
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
 * saves the swapped ids in connectionIds, and only then deletes the old
 * journals (issue #322 V29).
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

  // journal id → the Actor that replaces it, and the journals to delete once
  // the swap is saved. The journals used to be deleted inside the loop, before
  // the save: a refused or interrupted save left connectionIds pointing at
  // deleted journals — the connection gone from every reader (issue #322 V29).
  const swaps    = new Map();
  const journals = [];
  for (const id of ids) {
    if (globalThis.game?.actors?.get(id)) { summary.skipped += 1; continue; }  // already an Actor

    const journal = globalThis.game?.journal?.get(id) ?? null;
    const page    = journal?.pages?.contents?.[0];
    const payload = page?.flags?.[MODULE_ID]?.connection;
    if (!payload) { summary.skipped += 1; continue; }  // dangling id — leave as-is

    // A card an earlier load made for this connection, whose save did not
    // land: reuse it, never a second card (rules/reachability.md §7).
    let actor = findMigratedConnectionActor(payload._id);
    if (!actor) {
      const folderId = payload.sectorId
        ? await getOrCreateSectorNpcActorFolder(payload.sectorId, state)
        : await getOrCreateActorFolder("NPCs");
      try {
        actor = await globalThis.Actor?.create?.({
          name:   payload.name || journal.name || "Unknown Connection",
          type:   "character",
          folder: folderId,
          flags:  {
            [MODULE_ID]: { entityType: "connection", entityId: payload._id, connection: payload },
            core:        { sheetClass: STARFORGED_CHARACTER_SHEET },
          },
        });
      } catch (err) {
        console.error(`${MODULE_ID} | migrateJournalConnectionsToActors: Actor.create failed for ${id}:`, err);
      }
    }
    if (!actor?.id) { summary.skipped += 1; continue; }

    swaps.set(id, actor.id);
    journals.push({ id, journal });
    summary.migrated += 1;
  }

  if (!swaps.size) return summary;

  // The swap is saved first, onto the store as it is now — connectionIds
  // alone, with no await between the read and the write, at its turn on the
  // client's campaignState write chain (CAMPSTATE-CHAIN-REST). Only once it
  // landed are the old journals deleted; refused, they stay, and the next
  // load migrates them again (reusing the cards made here).
  try {
    await serialiseCampaignStateWrite(() => {
      const latest = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? state;
      const current = Array.isArray(latest.connectionIds) ? latest.connectionIds : ids;
      return globalThis.game?.settings?.set?.(MODULE_ID, "campaignState", {
        ...latest,
        connectionIds: current.map(id => swaps.get(id) ?? id),
      });
    }, "connection migration");
  } catch (err) {
    console.warn(`${MODULE_ID} | migrateJournalConnectionsToActors: persist failed — the old journals are kept for the next load:`, err);
    return summary;
  }
  for (const { id, journal } of journals) {
    try {
      await journal.delete?.();
    } catch (err) {
      console.warn(`${MODULE_ID} | migrateJournalConnectionsToActors: old journal delete failed for ${id}:`, err);
    }
  }
  return summary;
}

/** An NPC-card Actor already made for this connection record, by its id. */
function findMigratedConnectionActor(recordId) {
  if (!recordId) return null;
  return globalThis.game?.actors?.find?.(a =>
    a?.flags?.[MODULE_ID]?.entityType === "connection" && a.flags[MODULE_ID].entityId === recordId) ?? null;
}

/**
 * Predicate for the chat-command router in src/index.js.
 */
export function isMigrateEntitiesCommand(message) {
  const text = (message?.content ?? "").trim();
  return /^!migrate-entities\b/i.test(text);
}

/**
 * One-time repair (v1.7.10 playtest findings #1/#4): pin the Starforged
 * character sheet on existing NPC-card Actors. Cards created before the
 * `core.sheetClass` pin shipped open with foundry-ironsworn's default —
 * the classic Ironsworn sheet — whose Notes tab binds system.biography,
 * hiding the seeded portrait + narrator intro on system.notes.
 *
 * Only touches `character` Actors carrying the module's
 * `entityType: "connection"` flag (NPC cards — never PCs) that have no
 * sheet override yet; a card the GM deliberately re-sheeted is left alone.
 * GM-only, idempotent.
 *
 * @returns {Promise<{updated: number}>}
 */
export async function backfillNpcCardSheets() {
  const summary = { updated: 0 };
  if (globalThis.game?.user && !globalThis.game.user.isGM) return summary;

  const actors = globalThis.game?.actors?.contents ?? [];
  for (const actor of actors) {
    if (actor?.type !== "character") continue;
    // v1.7.11 finding A: also cover PCs. foundry-ironsworn defaults every
    // `character` actor to the classic Ironsworn sheet; PCs created outside
    // the system's Starforged create-dialog (Playtest Quickstart) miss the
    // pin too — not just NPC cards. Pin any character lacking an explicit
    // sheet choice; an actor the GM deliberately re-sheeted is left alone.
    if (actor.flags?.core?.sheetClass) continue;   // explicit choice — keep
    try {
      await actor.update({ "flags.core.sheetClass": STARFORGED_CHARACTER_SHEET });
      summary.updated += 1;
    } catch (err) {
      console.warn(`${MODULE_ID} | backfillNpcCardSheets: ${actor.id} failed:`, err?.message ?? err);
    }
  }
  return summary;
}

// Actor-hosted entity types whose flag records carry a denormalised `name`
// (registry.js HOST_COLLECTION === 'actor'). Journal-hosted types (faction,
// creature) are out of scope — their host journal is named from the record.
const ACTOR_HOSTED_NAME_SYNC = [
  { typeKey: "connection", campaignField: "connectionIds" },
  { typeKey: "ship",       campaignField: "shipIds"       },
  { typeKey: "settlement", campaignField: "settlementIds" },
  { typeKey: "planet",     campaignField: "planetIds"     },
  { typeKey: "location",   campaignField: "locationIds"   },
];

/**
 * Ready-time repair (v1.7.10 playtest finding #2): reconcile entity flag
 * records whose denormalised `name` has drifted from the host Actor's name.
 * Renaming an Actor in the sidebar only touched `actor.name`; the flag
 * record kept the registration-time snapshot, so the Entities panel and
 * narrator context surfaced the stale name ("Ship" instead of "Kobayashi 8")
 * until a Finalise happened to rewrite it. Actor name is authoritative
 * (see seedStarshipActor). The live sync is the updateActor hook in
 * index.js; this pass repairs drift that predates it or happened while the
 * module was disabled. GM-only, idempotent.
 *
 * @param {Object} [campaignState]
 * @returns {Promise<{synced: number}>}
 */
export async function syncEntityRecordNames(campaignState) {
  const summary = { synced: 0 };
  if (globalThis.game?.user && !globalThis.game.user.isGM) return summary;

  const state = campaignState
    ?? globalThis.game?.settings?.get?.(MODULE_ID, "campaignState")
    ?? {};

  for (const { typeKey, campaignField } of ACTOR_HOSTED_NAME_SYNC) {
    const ids = Array.isArray(state[campaignField]) ? state[campaignField] : [];
    for (const id of ids) {
      try {
        // For these typeKeys getEntityDocument only consults game.actors —
        // the registry's host dispatch is the actor-hosted guarantee.
        const document = getEntityDocument(typeKey, id);
        if (!document) continue;
        const record = readEntityFlag(typeKey, document);
        if (!record || !document.name) continue;
        if (record.name === document.name) continue;
        await writeEntityFlag(typeKey, document, {
          ...record,
          name:      document.name,
          updatedAt: new Date().toISOString(),
        });
        summary.synced += 1;
      } catch (err) {
        console.warn(`${MODULE_ID} | syncEntityRecordNames: ${typeKey} ${id} failed:`, err?.message ?? err);
      }
    }
  }
  return summary;
}

// The entity types the load-time registration repair lists: the Actor-hosted
// ones, and the two a JournalEntry hosts (a faction, a creature — known-issues
// JOURNAL-ORPHAN-ON-REFUSAL), each with its campaignState id list.
const UNLISTED_ENTITY_TYPES = [
  ...ACTOR_HOSTED_NAME_SYNC,
  { typeKey: "faction",  campaignField: "factionIds"  },
  { typeKey: "creature", campaignField: "creatureIds" },
];

/**
 * Ready-time repair (issue #337 Y34): an entity whose registration the world
 * refused — an NPC card, a ship, a settlement, a planet or a location Actor,
 * or a faction's or creature's JournalEntry (known-issues
 * JOURNAL-ORPHAN-ON-REFUSAL), carrying the module's record (`entityType` and
 * its flag) that its campaignState id list does not name — is listed. The
 * Entities panel shows such an Actor (it walks every flagged Actor) while
 * every list-driven reader skips it: a sidebar ship never reached
 * getCommandVehicle, SHIP POSITION or Withstand Damage, a faction never
 * reached the FACTION LANDSCAPE, and no other load pass lists a document
 * that already carries a record. Left alone: a copy of a listed record (the
 * sidebar's Duplicate, or a card whose journal the connection migration has
 * yet to swap — the same record id), and the leftovers of a sector creation
 * whose sector the campaign never stored (known-issues SECTOR-CREATE-PARTIAL
 * — a retry of that creation adopts them). GM-only; one write, onto the
 * latest store; idempotent.
 *
 * @returns {Promise<{ listed: number }>}
 */
export async function registerUnlistedEntityActors() {
  const summary = { listed: 0 };
  if (globalThis.game?.user && !globalThis.game.user.isGM) return summary;

  const state     = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {};
  const sectorIds = new Set((Array.isArray(state.sectors) ? state.sectors : []).map(s => s?.id).filter(Boolean));
  const additions = {};
  for (const { typeKey, campaignField } of UNLISTED_ENTITY_TYPES) {
    const listed = new Set(Array.isArray(state[campaignField]) ? state[campaignField] : []);
    // The record ids the list already names — on an Actor, or on a legacy journal page.
    const known = new Set();
    for (const id of listed) {
      const actor = globalThis.game?.actors?.get?.(id) ?? null;
      const flags = actor ? actor.flags : globalThis.game?.journal?.get?.(id)?.pages?.contents?.[0]?.flags;
      const rid   = flags?.[MODULE_ID]?.[typeKey]?._id;
      if (rid) known.add(rid);
    }
    for (const { document, data } of iterEntityDocuments(typeKey)) {
      if (!document?.id || listed.has(document.id)) continue;
      if (document.flags?.[MODULE_ID]?.entityType !== typeKey) continue;
      if (data?.sectorId && !sectorIds.has(data.sectorId)) continue;
      if (data?._id && known.has(data._id)) continue;
      if (data?._id) known.add(data._id);
      (additions[campaignField] ??= []).push(document.id);
    }
  }
  const fields = Object.keys(additions);
  if (!fields.length) return summary;

  // Onto the store as it is now, the id lists alone — no await between the
  // read and the write, at its turn on the client's campaignState write chain
  // (CAMPSTATE-CHAIN-REST).
  try {
    await serialiseCampaignStateWrite(() => {
      const latest = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {};
      const next   = { ...latest };
      for (const field of fields) next[field] = unionIdList(latest[field], additions[field]);
      return globalThis.game.settings.set(MODULE_ID, "campaignState", next);
    }, "unlisted entity registration");
  } catch (err) {
    console.warn(`${MODULE_ID} | registerUnlistedEntityActors: listing the unregistered entities failed — the next load tries again:`, err);
    return summary;
  }
  summary.listed = fields.reduce((n, field) => n + additions[field].length, 0);
  return summary;
}

// The record-notes blocks a pre-X12 ⤴ Promote wrote: plain text joined by a
// blank line (entityPanel's promote). A block with markup is a whole-notes
// copy `updateShip({ notes })` wrote to the sheet as well — never moved.
function promotedNoteBlocks(notes) {
  return String(notes ?? "").split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(b => b && !/<[a-z/][^>]*>/i.test(b));
}

const plainNotes = (html) => String(html ?? "")
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim().toLowerCase();

const escapeNoteHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Ready-time repair (known-issues NOTES-PROMOTED-BEFORE). An NPC card's or a
 * ship's notes are its sheet's Notes tab (issue #329 X12; decisions.md → "An
 * NPC card's or ship's notes are its sheet's Notes tab"): the record's own
 * `notes` is no longer read. A detail ⤴ Promoted before that change sits only
 * there — each such paragraph the tab does not already hold is appended to
 * the tab, and the record's copy is cleared (an `!ship envision` / `!ship
 * history` section, which `updateShip` wrote to both, is in the tab already).
 * GM-only, idempotent: a record with no notes is left alone.
 *
 * @returns {Promise<{ moved: number, cleared: number }>} records whose notes
 *   reached the tab / whose copy was only cleared
 */
export async function moveRecordNotesToSheets() {
  const summary = { moved: 0, cleared: 0 };
  if (globalThis.game?.user && !globalThis.game.user.isGM) return summary;

  for (const typeKey of ["connection", "ship"]) {
    if (!hasSheetNotes(typeKey)) continue;
    for (const { document, data } of [...iterEntityDocuments(typeKey)]) {
      try {
        if (typeof data?.notes !== "string" || !data.notes.trim() || !document?.system) continue;
        const sheet   = String(document.system.notes ?? "");
        const onSheet = plainNotes(sheet);
        const missing = promotedNoteBlocks(data.notes).filter(b => !onSheet.includes(plainNotes(b)));
        if (missing.length) {
          await document.update({ "system.notes": `${sheet}${missing.map(b => `<p>${escapeNoteHtml(b)}</p>`).join("")}` });
        }
        await writeEntityFlag(typeKey, document, { ...data, notes: "", updatedAt: new Date().toISOString() });
        summary[missing.length ? "moved" : "cleared"] += 1;
      } catch (err) {
        console.warn(`${MODULE_ID} | moveRecordNotesToSheets: ${typeKey} ${document?.id ?? "?"} failed:`, err?.message ?? err);
      }
    }
  }
  return summary;
}
