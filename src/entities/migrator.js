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

import { createShip } from "./ship.js";

const MODULE_ID = "starforged-companion";

// Per scope: deferred reaper deletes legacy journals at least N days old.
const CLEANUP_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

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
    ship:    { migrated: 0, alreadyMigrated: 0, errors: 0 },
    notes:   [],
  };

  // Walk every JournalEntry. A pre-migration ship entry has its page-flag
  // payload at page.flags[MODULE_ID].ship.
  for (const journal of globalThis.game?.journal ?? []) {
    const page = journal.pages?.contents?.[0];
    if (!page) continue;

    const existingMigrated = journal.flags?.[MODULE_ID]?.migrated;

    const shipData = page.getFlag?.(MODULE_ID, "ship") ?? page.flags?.[MODULE_ID]?.ship;
    if (shipData) {
      if (existingMigrated?.toActorId) {
        summary.ship.alreadyMigrated += 1;
        continue;
      }
      try {
        await migrateShipJournal(journal, shipData, campaignState);
        summary.ship.migrated += 1;
      } catch (err) {
        console.error(`${MODULE_ID} | migrator: ship migration failed for ${journal.id}:`, err);
        summary.ship.errors += 1;
        summary.notes.push(`Ship "${shipData.name ?? journal.id}" — ${err.message ?? "unknown error"}`);
      }
    }
  }

  if (summary.ship.migrated > 0) {
    try {
      await globalThis.game.settings.set(MODULE_ID, "campaignState", campaignState);
    } catch (err) {
      console.error(`${MODULE_ID} | migrator: persistCampaignState failed:`, err);
      summary.notes.push(`Failed to persist campaignState: ${err.message}`);
    }
  }

  return summary;
}

async function migrateShipJournal(journal, shipData, campaignState) {
  // Re-create through the production path so the Actor lands in the right
  // folder and the system.debility fields are mirrored. createShip writes
  // its own campaignState entry — but we want to *replace* the journal id,
  // not append, so we suppress its persist and rewrite ourselves.
  const before = (campaignState.shipIds ?? []).slice();
  await createShip(shipData, campaignState);

  // createShip pushed the new actor id; remove the legacy journal id from
  // the same array so the list stays the right length.
  const all      = campaignState.shipIds ?? [];
  const added    = all.find(id => !before.includes(id));
  if (!added) {
    throw new Error("createShip returned without registering an actor id");
  }
  const filtered = all.filter(id => id === added || id !== journal.id);
  campaignState.shipIds = filtered;

  // Mark the source journal as migrated so the cleanup pass can find it.
  await journal.setFlag?.(MODULE_ID, "migrated", {
    toActorId: added,
    at:        new Date().toISOString(),
  });
}

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
  if ("ship" in summary) {
    lines.push(`<li>Ships migrated: <strong>${summary.ship.migrated}</strong></li>`);
    if (summary.ship.alreadyMigrated) {
      lines.push(`<li>Already migrated: ${summary.ship.alreadyMigrated}</li>`);
    }
    if (summary.ship.errors) {
      lines.push(`<li>Errors: ${summary.ship.errors}</li>`);
    }
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
