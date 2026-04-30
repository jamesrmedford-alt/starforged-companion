// src/character/chroniclePanel.js
// ApplicationV2 panel for the CharacterChronicle — a reverse-chronological
// timeline of significant character moments.
//
// Players can:
//   - Edit any entry's text inline (both automated and their own)
//   - Add a new annotation at any point in the timeline
//   - Pin entries (pinned entries always appear in context)
//
// GMs additionally can:
//   - Delete entries
//   - Change entry type
//   - Mark entries as canon/non-canon

import {
  getChronicleEntries,
  addChronicleEntry,
  updateChronicleEntry,
} from './chronicle.js';

import { getPlayerActors, getActor } from './actorBridge.js';

const MODULE_ID = 'starforged-companion';

const ENTRY_TYPES = ['revelation', 'relationship', 'vow', 'scar', 'legacy', 'annotation'];

const TYPE_LABELS = {
  revelation:   'Revelation',
  relationship: 'Relationship',
  vow:          'Vow',
  scar:         'Scar',
  legacy:       'Legacy',
  annotation:   'Annotation',
};

// ─────────────────────────────────────────────────────────────────────────────
// ApplicationV2 panel
// ─────────────────────────────────────────────────────────────────────────────

export class ChroniclePanelApp extends foundry.applications.api.ApplicationV2 {

  #actorId;
  #entries = [];

  constructor(actorId, options = {}) {
    super(options);
    this.#actorId = actorId;
  }

  static DEFAULT_OPTIONS = {
    id:      'sf-chronicle-panel',
    classes: ['starforged-companion', 'sf-chronicle'],
    tag:     'div',
    window: {
      title:       'Chronicle',
      resizable:   true,
      minimizable: true,
    },
    position: { width: 520, height: 640 },
    actions: {
      addAnnotation: ChroniclePanelApp.#onAddAnnotation,
      deleteEntry:   ChroniclePanelApp.#onDeleteEntry,
      togglePin:     ChroniclePanelApp.#onTogglePin,
    },
  };

  // ── Rendering ─────────────────────────────────────────────────────────────

  async _prepareContext(_options) {
    this.#entries = await getChronicleEntries(this.#actorId);
    const actor   = getActor(this.#actorId);

    return {
      actorName:  actor?.name ?? 'Unknown Character',
      entries:    [...this.#entries].reverse(), // reverse-chron
      isGM:       game.user?.isGM ?? false,
      typeLabels: TYPE_LABELS,
      entryTypes: ENTRY_TYPES,
    };
  }

  async _renderHTML(context, _options) {
    const tmp = document.createElement('div');
    tmp.innerHTML = buildChronicleHTML(context).trim();
    return tmp.firstElementChild;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = '';
    content.append(result);
    // Wire non-click events that cannot use data-action
    content.querySelectorAll('.sf-chronicle-text[contenteditable]').forEach(el => {
      el.addEventListener('blur', e => this.#onTextBlur(e));
    });
    content.querySelectorAll('.sf-chronicle-type-select').forEach(sel => {
      sel.addEventListener('change', e => this.#onTypeChange(e));
    });
  }

  // ── Instance event handlers (blur, change) ────────────────────────────────

  async #onTextBlur(e) {
    const el      = e.currentTarget;
    const entryId = el.closest('[data-entry-id]')?.dataset?.entryId;
    const newText = el.textContent?.trim() ?? '';
    if (!entryId || !newText) return;

    const entry = this.#entries.find(en => en.id === entryId);
    if (entry && entry.text !== newText) {
      await updateChronicleEntry(this.#actorId, entryId, newText);
      this.#entries = await getChronicleEntries(this.#actorId);
    }
  }

  async #onTypeChange(e) {
    if (!game.user?.isGM) return;
    const entryId = e.currentTarget.closest('[data-entry-id]')?.dataset?.entryId;
    const newType = e.currentTarget.value;
    if (!entryId || !newType) return;

    const updated = this.#entries.map(en =>
      en.id === entryId ? { ...en, type: newType } : en
    );
    await this.#saveEntries(updated);
    this.render();
  }

  // ── Static action handlers (click via data-action) ─────────────────────────

  static async #onAddAnnotation(_event, _target) {
    const sessionId = game.settings?.get(MODULE_ID, 'campaignState')?.currentSessionId ?? '';
    await addChronicleEntry(this.#actorId, {
      type:      'annotation',
      text:      'New annotation — click to edit.',
      sessionId,
      automated: false,
    });
    this.render();
  }

  static async #onDeleteEntry(_event, target) {
    if (!game.user?.isGM) return;
    const entryId = target.dataset.entryId;
    if (!entryId) return;

    const entries = this.#entries.filter(en => en.id !== entryId);
    await this.#saveEntries(entries);
    this.render();
  }

  static async #onTogglePin(_event, target) {
    const entryId = target.dataset.entryId;
    if (!entryId) return;

    const updated = this.#entries.map(en =>
      en.id === entryId ? { ...en, pinned: !en.pinned } : en
    );
    await this.#saveEntries(updated);
    this.render();
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  async #saveEntries(entries) {
    try {
      const actor = getActor(this.#actorId);
      if (!actor) return;

      const journalName = `Chronicle — ${actor.name}`;
      const journal     = game.journal?.getName(journalName);
      if (!journal) return;

      const page = journal.pages?.contents?.[0];
      if (!page) return;

      await page.setFlag(MODULE_ID, 'chronicle', entries);
      this.#entries = entries;
    } catch (err) {
      console.error(`${MODULE_ID} | chroniclePanel: failed to save entries`, err);
    }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// HTML builder
// ─────────────────────────────────────────────────────────────────────────────

function buildChronicleHTML(ctx) {
  const { actorName, entries, isGM, typeLabels, entryTypes } = ctx;

  const entryRows = entries.length
    ? entries.map(e => buildEntryRow(e, isGM, typeLabels, entryTypes)).join('')
    : '<div class="sf-chronicle-empty">No chronicle entries yet.</div>';

  return `
<div class="sf-chronicle-panel">
  <header class="sf-chronicle-header">
    <h2>${escapeHtml(actorName)}</h2>
    <button type="button" class="sf-chronicle-add-btn" data-action="addAnnotation"
            title="Add annotation">
      + Add Note
    </button>
  </header>
  <div class="sf-chronicle-entries">
    ${entryRows}
  </div>
</div>`.trim();
}

function buildEntryRow(entry, isGM, typeLabels, entryTypes) {
  const typeLabel  = typeLabels[entry.type] ?? entry.type;
  const pinnedCls  = entry.pinned ? ' sf-pinned' : '';
  const automCls   = entry.automated ? ' sf-automated' : '';
  const pinIcon    = entry.pinned ? '📌' : '📍';
  const dateStr    = entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : '';

  const typeCell = isGM
    ? `<select class="sf-chronicle-type-select" value="${escapeHtml(entry.type)}">
        ${entryTypes.map(t =>
          `<option value="${t}"${t === entry.type ? ' selected' : ''}>${typeLabels[t] ?? t}</option>`
        ).join('')}
       </select>`
    : `<span class="sf-type-badge sf-type-${escapeHtml(entry.type)}">${escapeHtml(typeLabel)}</span>`;

  const deleteBtn = isGM
    ? `<button type="button" class="sf-chronicle-delete-btn"
               data-action="deleteEntry" data-entry-id="${escapeHtml(entry.id)}"
               title="Delete entry">✕</button>`
    : '';

  return `
<div class="sf-chronicle-entry${pinnedCls}${automCls}" data-entry-id="${escapeHtml(entry.id)}">
  <div class="sf-entry-meta">
    ${typeCell}
    <span class="sf-entry-date">${escapeHtml(dateStr)}</span>
    <button type="button" class="sf-chronicle-pin-btn"
            data-action="togglePin" data-entry-id="${escapeHtml(entry.id)}"
            title="${entry.pinned ? 'Unpin' : 'Pin'} entry">
      ${pinIcon}
    </button>
    ${deleteBtn}
  </div>
  <div class="sf-chronicle-text" contenteditable="true">${escapeHtml(entry.text)}</div>
</div>`.trim();
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// ─────────────────────────────────────────────────────────────────────────────
// Public openers
// ─────────────────────────────────────────────────────────────────────────────

let _chroniclePanelInstance = null;

/**
 * Open the chronicle panel for a specific actor.
 * If no actorId given, uses game.user.character or the first player actor.
 * @param {string} [actorId]
 */
export function openChroniclePanel(actorId) {
  const resolvedId = actorId
    ?? game.user?.character?.id
    ?? getPlayerActors()[0]?.id;

  if (!resolvedId) {
    ui?.notifications?.warn('Starforged Companion: No player character found.');
    return;
  }

  if (_chroniclePanelInstance?.rendered) {
    _chroniclePanelInstance.bringToTop?.();
    return;
  }

  _chroniclePanelInstance = new ChroniclePanelApp(resolvedId);
  _chroniclePanelInstance.render({ force: true });
}

/**
 * Register the toolbar button for the chronicle panel in getSceneControlButtons.
 * Called from index.js alongside the other panel registrations.
 */
export function registerChroniclePanelHooks() {
  // Panel button is wired in index.js via getSceneControlButtons, same pattern
  // as progressTracks and entityPanel.
}
