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

import { registerOracleTable, unregisterOracleTable, rollOracle, ORACLE_TABLES } from "./roller.js";
import { showD100 } from "../dice/diceAnimation.js";

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


// ─────────────────────────────────────────────────────────────────────────────
// Panel — ApplicationV2 singleton
// ─────────────────────────────────────────────────────────────────────────────

let _panelClass = null;
let _panelInstance = null;

function getPanelClass() {
  if (_panelClass) return _panelClass;
  const { ApplicationV2 } = foundry.applications.api;

  _panelClass = class CustomOraclesPanelApp extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id:  "sf-custom-oracles-panel",
      tag: "div",
      window: { title: "Custom Oracles", resizable: true, minimizable: true },
      position: { width: 520, height: "auto" },
      actions: {
        addOracle:    CustomOraclesPanelApp.#onAddOracle,
        rollOracle:   CustomOraclesPanelApp.#onRollOracle,
        removeOracle: CustomOraclesPanelApp.#onRemoveOracle,
      },
    };

    async _prepareContext() {
      const tables = [];
      for (const [id, entry] of Object.entries(ORACLE_TABLES)) {
        if (entry.category !== "custom") continue;
        tables.push({
          id,
          name:    entry.name ?? id,
          entries: entry.table?.length ?? 0,
        });
      }
      tables.sort((a, b) => a.name.localeCompare(b.name));
      return { tables };
    }

    async _renderHTML({ tables }) {
      const row = (t) => `
        <div class="oracle-row" data-oracle-id="${escapeHtml(t.id)}">
          <div class="oracle-meta"><strong>${escapeHtml(t.name)}</strong> · <code>${escapeHtml(t.id)}</code> · ${t.entries} entries</div>
          <div class="oracle-actions">
            <button data-action="rollOracle"   data-oracle-id="${escapeHtml(t.id)}" title="Roll on this table">🎲</button>
            <button data-action="removeOracle" data-oracle-id="${escapeHtml(t.id)}" title="Delete table">✕</button>
          </div>
        </div>
      `;

      const html = `
        <div class="sf-custom-oracles-panel">
          <section class="add-oracle-section">
            <button data-action="addOracle">+ Add Custom Oracle</button>
          </section>
          <section class="oracles-section">
            ${tables.length ? tables.map(row).join("") : '<p class="empty-state">No custom oracles yet. Click <strong>+ Add Custom Oracle</strong> to define one.</p>'}
          </section>
        </div>
      `;
      const tmp = document.createElement("div");
      tmp.innerHTML = html.trim();
      return tmp.firstElementChild;
    }

    _replaceHTML(result, content) {
      content.innerHTML = "";
      content.append(result);
    }

    static async #onAddOracle() {
      if (!game.user?.isGM) {
        ui.notifications?.warn("Add Custom Oracle is GM-only.");
        return;
      }
      await openOracleAddDialog();
      this.render();
    }

    static async #onRollOracle(_event, target) {
      const id = target.dataset.oracleId;
      try {
        const r = rollOracle(id);
        void showD100(r.roll);   // 3D dice for the d100 (fire-and-forget, fail-open)
        await ChatMessage.create({
          content: `<div class="sf-oracle-card"><strong>${escapeHtml(r.tableName)}</strong><p>d100 = <strong>${r.roll}</strong> → ${escapeHtml(r.result)}</p></div>`,
          flags:   { [MODULE_ID]: { customOracleCard: true } },
        });
      } catch (err) {
        ui.notifications?.error(`Roll failed: ${err.message}`);
      }
    }

    static async #onRemoveOracle(_event, target) {
      if (!game.user?.isGM) {
        ui.notifications?.warn("Remove Custom Oracle is GM-only.");
        return;
      }
      const { DialogV2 } = foundry.applications.api;
      const id = target.dataset.oracleId;

      const confirmed = await DialogV2.confirm({
        window:  { title: "Remove Custom Oracle" },
        content: `<p>Delete custom oracle <code>${escapeHtml(id)}</code>? This cannot be undone.</p>`,
      });
      if (!confirmed) return;

      await removeCustomOracle(id);
      this.render();
    }
  };

  return _panelClass;
}

export function openCustomOraclesPanel() {
  const Cls = getPanelClass();
  if (!_panelInstance) _panelInstance = new Cls();
  _panelInstance.render({ force: true });
  return _panelInstance;
}
