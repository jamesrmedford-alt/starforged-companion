/**
 * STARFORGED COMPANION
 * src/entities/migrator.js — `!migrate-entities` chat command
 *
 * One-time GM-triggered migration from the legacy JournalEntry-backed entity
 * storage to native foundry-ironsworn Actor documents. See
 * docs/entity-actor-migration-scope.md §5 for the full design.
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
import { getOrCreateSectorJournalFolder } from "./folder.js";

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

  // Step 6 — delete the orphan "Starforged Sectors" JournalEntry. Nothing
  // reads it post-migration; safe to remove now rather than waiting on the
  // 7-day window.
  await deleteOrphanSectorsJournal(summary);

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
  if (summary.orphanJournalDeleted) {
    lines.push(`<li>Removed legacy "Starforged Sectors" journal.</li>`);
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

/**
 * Predicate for the chat-command router in src/index.js.
 */
export function isMigrateEntitiesCommand(message) {
  const text = (message?.content ?? "").trim();
  return /^!migrate-entities\b/i.test(text);
}
