/**
 * STARFORGED COMPANION
 * src/oracles/customOracles.js
 *
 * Player-defined oracle tables (play kit "Oracles Worksheet", p. unnumbered).
 * The play kit ships blank d4 / d6 / d8 / d10 grids; this module exposes the
 * same idea via a free-form chat command that opens a DialogV2.
 *
 * Persistence: campaignState.customOracles is a map keyed by tableId, each
 * value is { name, entries: [{min, max, result}] }. campaignState is the
 * canonical store; the in-memory roller registry (ORACLE_TABLES, category
 * "custom") is a per-client mirror kept write-through by
 * syncCustomOraclesFromState — once at `ready` (rehydrateCustomOracles) and
 * again on every client whenever the campaignState world setting changes, so
 * a table the GM adds, edits or deletes reaches every player without a
 * reload.
 *
 * Dice: a custom table rolls its own die — 1..(highest max) — mirroring the
 * play kit's blank d4 / d6 / d8 / d10 worksheets (roller.js dieSizeForTable).
 * Entries must therefore cover 1..N contiguously; validateCustomOracleEntries
 * rejects gaps and overlaps at add time.
 */

import {
  registerOracleTable, unregisterOracleTable, rollOracle, ORACLE_TABLES,
  CUSTOM_ORACLE_CATEGORY, dieSizeForTable,
} from "./roller.js";
import { showD100 } from "../dice/diceAnimation.js";

const MODULE_ID = "starforged-companion";
const CAMPAIGN_STATE_KEY = `${MODULE_ID}.campaignState`;


// ─────────────────────────────────────────────────────────────────────────────
// Keep the in-memory registry in sync with campaignState.customOracles
// ─────────────────────────────────────────────────────────────────────────────

/** Stored table ids already warned about as unregistrable (warn once). */
const _unregistrable = new Set();

/** Stable fingerprint of one stored table, to detect edits. */
function tableFingerprint(name, entries) {
  return JSON.stringify([name, entries]);
}

/**
 * Make this client's custom-oracle registry match `state.customOracles`:
 * register tables that are new or changed, unregister custom tables that
 * are no longer stored. Built-in tables are never touched. Idempotent.
 *
 * @param {Object} state — campaignState
 * @returns {{ registered: string[], removed: string[] }}
 */
export function syncCustomOraclesFromState(state) {
  const stored     = state?.customOracles ?? {};
  const registered = [];
  const removed    = [];

  for (const [tableId, entry] of Object.entries(stored)) {
    const name    = entry?.name ?? tableId;
    const entries = Array.isArray(entry?.entries) ? entry.entries : [];
    const current = ORACLE_TABLES[tableId];
    if (current?.category === CUSTOM_ORACLE_CATEGORY &&
        tableFingerprint(current.name, current.table) === tableFingerprint(name, entries)) {
      continue;   // already in sync
    }
    try {
      registerOracleTable(tableId, { name, table: entries, category: CUSTOM_ORACLE_CATEGORY });
      registered.push(tableId);
      _unregistrable.delete(tableId);
    } catch (err) {
      // Built-in id collision or an empty stored table — the stored copy is
      // unusable on this client; say so rather than dropping it silently.
      // Once per table per session: this re-runs on every campaignState write.
      if (!_unregistrable.has(tableId)) {
        _unregistrable.add(tableId);
        console.warn(`${MODULE_ID} | custom oracles: could not register "${tableId}":`, err.message);
      } else {
        console.debug?.(`${MODULE_ID} | custom oracles: "${tableId}" still unregistrable (already warned).`);
      }
      continue;
    }
    // Tables saved before add-time validation existed may have gaps; they
    // still register (no data loss) but some rolls will land on "—".
    const check = validateCustomOracleEntries(entries);
    if (!check.ok) {
      console.warn(`${MODULE_ID} | custom oracles: "${tableId}" has invalid entries (${check.error}) — re-define it with !oracle-add.`);
    }
  }

  for (const [tableId, entry] of Object.entries(ORACLE_TABLES)) {
    if (entry.category !== CUSTOM_ORACLE_CATEGORY) continue;
    if (Object.prototype.hasOwnProperty.call(stored, tableId)) continue;
    if (unregisterOracleTable(tableId)) removed.push(tableId);
  }

  return { registered, removed };
}

/**
 * Re-register saved custom oracles at world ready (called from index.js's
 * `ready` hook on every client) and install the campaignState change hook
 * that keeps them in sync for the rest of the session.
 */
export function rehydrateCustomOracles() {
  registerCustomOracleSyncHook();
  const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
  syncCustomOraclesFromState(state);
}

/**
 * `updateSetting` / `createSetting` fire on every client when a world
 * setting write lands. On a campaignState change, re-sync the custom-oracle
 * mirror and refresh the Custom Oracles panel if it is open. Idempotent.
 */
export function registerCustomOracleSyncHook() {
  if (registerCustomOracleSyncHook._installed) return;
  registerCustomOracleSyncHook._installed = true;
  Hooks.on("updateSetting", onCampaignStateSettingChanged);
  Hooks.on("createSetting", onCampaignStateSettingChanged);
}

/** Test seam — forget the install guard. */
export function _resetCustomOracleSyncHookForTests() {
  registerCustomOracleSyncHook._installed = false;
  _unregistrable.clear();
}

function onCampaignStateSettingChanged(setting) {
  if (setting?.key !== CAMPAIGN_STATE_KEY) return;
  try {
    const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
    const { registered, removed } = syncCustomOraclesFromState(state);
    if ((registered.length || removed.length) && _panelInstance?.rendered) {
      _panelInstance.render({ force: false });
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | custom oracles: campaignState sync failed:`, err?.message ?? err);
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
      omit the dash, e.g. <code>6 Critical</code>. Entries must run from 1
      with no gaps or overlaps; the table rolls a die as large as its highest
      entry (1–6 → d6, 1–100 → d100). Re-using an existing table ID replaces
      that table.</p>
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

        await saveCustomOracle(tableId, name, parseEntries(raw));
      },
    },
  });
}

/**
 * Validate, register and persist one custom table, then post the outcome
 * card. Re-using an existing custom id overwrites that table; a built-in id
 * is refused. Exported for tests — the dialog is the production caller.
 *
 * @param {string} tableId
 * @param {string} name
 * @param {Array<{min:number,max:number,result:string}>} entries — parsed
 * @returns {Promise<boolean>} true when the table was saved
 */
export async function saveCustomOracle(tableId, name, entries) {
  // `!oracle <tableId> [question]` splits on whitespace, so an id with a
  // space (or other punctuation) could never be rolled from chat.
  if (!/^[A-Za-z0-9_]+$/.test(String(tableId ?? ""))) {
    await postCard("<strong>Custom oracle not saved</strong><p>Table ID may only contain letters, numbers and underscores.</p>");
    return false;
  }
  if (!entries?.length) {
    await postCard("<strong>Custom oracle</strong><p>No valid entries parsed. Expected lines like <code>1-3 Result text</code>.</p>");
    return false;
  }

  const check = validateCustomOracleEntries(entries);
  if (!check.ok) {
    await postCard(`<strong>Custom oracle not saved</strong><p>${escapeHtml(check.error)}</p>`);
    return false;
  }

  const existing  = ORACLE_TABLES[tableId];
  const isUpdate  = existing?.category === CUSTOM_ORACLE_CATEGORY;
  try {
    registerOracleTable(tableId, { name, table: entries, category: CUSTOM_ORACLE_CATEGORY });
  } catch (err) {
    await postCard(`<strong>Custom oracle not saved</strong><p>${escapeHtml(err.message)}</p>`);
    return false;
  }

  // Persist to campaignState (the canonical store) so the table survives a
  // reload; the updateSetting hook mirrors it onto every other client.
  const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
  state.customOracles ??= {};
  state.customOracles[tableId] = { name, entries };
  await game.settings.set(MODULE_ID, "campaignState", state);

  const safeId = escapeHtml(tableId);
  await postCard(
    `<strong>Custom oracle ${isUpdate ? "updated" : "registered"}</strong>` +
    `<p><code>${safeId}</code> — ${escapeHtml(name)} (d${check.die}, ${entries.length} entries).</p>` +
    `<p>Anyone can roll it with <code>!oracle ${safeId}</code>, or use the 🎲 button in the Custom Oracles panel.</p>`,
  );
  return true;
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

/**
 * A custom table rolls 1..(highest max), so its entries must tile that range
 * exactly: start at 1, no gaps, no overlaps. Entry order does not matter.
 *
 * @param {Array<{min:number,max:number}>} entries
 * @returns {{ ok: true, die: number } | { ok: false, error: string }}
 */
export function validateCustomOracleEntries(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return { ok: false, error: "The table has no entries." };
  }
  const rows = [...entries].sort((a, b) => a.min - b.min);
  for (const r of rows) {
    if (!Number.isInteger(r.min) || !Number.isInteger(r.max) || r.min < 1 || r.max < r.min) {
      return { ok: false, error: `Entry ${r.min}-${r.max} is not a valid range (whole numbers, 1 or more, low-high).` };
    }
  }
  if (rows[0].min !== 1) {
    return { ok: false, error: `Entries must start at 1, but the lowest entry starts at ${rows[0].min}.` };
  }
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const cur  = rows[i];
    if (cur.min <= prev.max) {
      return { ok: false, error: `Entries ${prev.min}-${prev.max} and ${cur.min}-${cur.max} overlap.` };
    }
    if (cur.min > prev.max + 1) {
      const gap = cur.min - 1 === prev.max + 1 ? `${prev.max + 1}` : `${prev.max + 1}-${cur.min - 1}`;
      return { ok: false, error: `Nothing covers ${gap} — entries must be contiguous with no gaps.` };
    }
  }
  return { ok: true, die: dieSizeForTable(rows) };
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

/**
 * Roll a custom table (panel 🎲 button) and post the result card, naming the
 * table's own die ("d6 = 4"). The card carries the same `oracleMemory` flag
 * as `!oracle <tableId>` so the canonical GM ledgers it for the narrator.
 * Throws when the table is unknown — the caller surfaces that.
 *
 * @param {string} tableId
 * @returns {Promise<Object>} the rollOracle result
 */
export async function postCustomOracleRoll(tableId) {
  const r = rollOracle(tableId);
  // Dice So Nice animation is d100-only (diceAnimation.showD100); smaller
  // custom dice post their card without the 3D dice.
  if (r.die === 100) void showD100(r.roll);
  await ChatMessage.create({
    content: `<div class="sf-oracle-card"><strong>${escapeHtml(r.tableName)}</strong><p>d${r.die} = <strong>${r.roll}</strong> → ${escapeHtml(r.result)}</p></div>`,
    flags:   {
      [MODULE_ID]: {
        customOracleCard: true,
        oracleTableId:    tableId,
        oracleMemory:     { name: r.tableName, question: "", answer: r.result },
      },
    },
  });
  return r;
}

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
          die:     entry.die ?? dieSizeForTable(entry.table),
        });
      }
      tables.sort((a, b) => a.name.localeCompare(b.name));
      return { tables };
    }

    async _renderHTML({ tables }) {
      const row = (t) => `
        <div class="oracle-row" data-oracle-id="${escapeHtml(t.id)}">
          <div class="oracle-meta"><strong>${escapeHtml(t.name)}</strong> · <code>${escapeHtml(t.id)}</code> · d${t.die} · ${t.entries} entries</div>
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
        await postCustomOracleRoll(id);
      } catch (err) {
        console.error(`${MODULE_ID} | custom oracle roll "${id}" failed:`, err);
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
