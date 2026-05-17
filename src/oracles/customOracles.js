/**
 * STARFORGED COMPANION
 * src/oracles/customOracles.js
 *
 * Player-defined oracle tables (play kit "Oracles Worksheet", p. unnumbered).
 * The play kit ships blank d4 / d6 / d8 / d10 grids; this module exposes the
 * same idea via a free-form chat command that opens a DialogV2.
 *
 * Persistence: campaignState.customOracles is a map keyed by tableId, each
 * value is { name, entries: [{min, max, result}] }. On `ready` the module
 * re-registers every saved custom oracle with the in-memory roller.
 */

import { registerOracleTable, unregisterOracleTable } from "./roller.js";

const MODULE_ID = "starforged-companion";


// ─────────────────────────────────────────────────────────────────────────────
// Re-register saved custom oracles at world ready
// ─────────────────────────────────────────────────────────────────────────────

export function rehydrateCustomOracles() {
  const state   = game.settings.get(MODULE_ID, "campaignState") ?? {};
  const custom  = state.customOracles ?? {};
  for (const [tableId, entry] of Object.entries(custom)) {
    try {
      registerOracleTable(tableId, {
        name:     entry.name ?? tableId,
        table:    entry.entries ?? [],
        category: "custom",
      });
    } catch (err) {
      // Likely a tableId collision; skip.
      console.warn(`${MODULE_ID} | rehydrateCustomOracles: skipped ${tableId}:`, err.message);
    }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Chat command + dialog
// ─────────────────────────────────────────────────────────────────────────────

export function isOracleAddCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.customOracleCard) return false;
  return /^!oracle-add(\s|$)/i.test(text);
}

export async function handleOracleAddCommand(message) {
  if (!game.user?.isGM) {
    ui.notifications?.warn("!oracle-add is GM-only (writes campaign state).");
    return;
  }

  // !oracle-add <id?> opens the dialog with the id prefilled if supplied.
  const text  = message.content?.trim() ?? "";
  const arg   = text.slice("!oracle-add".length).trim();
  await openOracleAddDialog(arg);
}

async function openOracleAddDialog(prefillId = "") {
  const { DialogV2 } = foundry.applications.api;

  const content = `
    <form class="sf-oracle-add-form">
      <p class="hint">Define a custom oracle table. Enter one entry per line in
      the format <code>min-max Result text</code>. Single-value entries may
      omit the dash, e.g. <code>7 Critical</code>.</p>
      <label>
        <span>Table ID (no spaces — used by !oracle and rolls)</span>
        <input type="text" name="tableId" value="${escapeAttr(prefillId)}"
               pattern="[a-z0-9_]+" maxlength="40" required>
      </label>
      <label>
        <span>Display name</span>
        <input type="text" name="name" maxlength="60" required>
      </label>
      <label>
        <span>Entries (one per line, <code>min-max Result</code>)</span>
        <textarea name="entries" rows="10" required></textarea>
      </label>
    </form>
  `;

  await DialogV2.prompt({
    window:  { title: "Add Custom Oracle Table" },
    content,
    ok: {
      label:    "Register Table",
      callback: async (_event, button) => {
        const form    = button.form;
        const tableId = form?.querySelector('input[name="tableId"]')?.value.trim();
        const name    = form?.querySelector('input[name="name"]')?.value.trim();
        const raw     = form?.querySelector('textarea[name="entries"]')?.value ?? "";

        if (!tableId || !name) {
          await postCard("<strong>Custom oracle</strong><p>Table ID and name are required.</p>");
          return;
        }

        const entries = parseEntries(raw);
        if (!entries.length) {
          await postCard("<strong>Custom oracle</strong><p>No valid entries parsed. Expected lines like <code>1-30 Result text</code>.</p>");
          return;
        }

        try {
          registerOracleTable(tableId, { name, table: entries, category: "custom" });
        } catch (err) {
          await postCard(`<strong>Custom oracle</strong><p>${escapeHtml(err.message)}</p>`);
          return;
        }

        // Persist to campaignState so the table survives world reload.
        const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
        state.customOracles ??= {};
        state.customOracles[tableId] = { name, entries };
        await game.settings.set(MODULE_ID, "campaignState", state);

        await postCard(
          `<strong>Custom oracle registered</strong><p><code>${escapeHtml(tableId)}</code> — ${escapeHtml(name)} (${entries.length} entries).</p><p>Roll with <code>!oracle ${escapeHtml(tableId)}</code> once that form is implemented; for now use code paths.</p>`,
        );
      },
    },
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a textarea body into table entries. Accepts:
 *   1-30 Triumph
 *   31-60 Stalemate
 *   7 Critical
 * Whitespace between range and result is required. Lines starting with #
 * are treated as comments and ignored.
 */
export function parseEntries(raw) {
  const out = [];
  for (const line of String(raw).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const m = trimmed.match(/^(\d+)(?:\s*-\s*(\d+))?\s+(.+)$/);
    if (!m) continue;

    const min = Number(m[1]);
    const max = m[2] !== undefined ? Number(m[2]) : min;
    if (Number.isNaN(min) || Number.isNaN(max) || max < min) continue;

    out.push({ min, max, result: m[3].trim() });
  }
  return out;
}


// ─────────────────────────────────────────────────────────────────────────────
// Removal helper (mostly for tests / cleanup)
// ─────────────────────────────────────────────────────────────────────────────

export async function removeCustomOracle(tableId) {
  unregisterOracleTable(tableId);
  const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
  if (state.customOracles?.[tableId]) {
    delete state.customOracles[tableId];
    await game.settings.set(MODULE_ID, "campaignState", state);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Small utilities
// ─────────────────────────────────────────────────────────────────────────────

async function postCard(html) {
  await ChatMessage.create({
    content: `<div class="sf-oracle-card">${html}</div>`,
    flags:   { [MODULE_ID]: { customOracleCard: true } },
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s);
}
