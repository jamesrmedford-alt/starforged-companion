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

  constructor(actorId, options = {}) {
    super(options);
    this._actorId = actorId;
    this._entries = [];
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions ?? {}, {
      id:      'sf-chronicle-panel',
      title:   'Chronicle',
      classes: ['starforged-companion', 'sf-chronicle'],
      width:   520,
      height:  640,
      resizable: true,
    });
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  async _prepareContext() {
    this._entries = await getChronicleEntries(this._actorId);
    const actor   = getActor(this._actorId);

    return {
      actorName: actor?.name ?? 'Unknown Character',
      entries:   [...this._entries].reverse(), // reverse-chron
      isGM:      game.user?.isGM ?? false,
      typeLabels: TYPE_LABELS,
      entryTypes: ENTRY_TYPES,
    };
  }

  async _renderHTML(context) {
    return buildChronicleHTML(context);
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    this._activateListeners(content);
  }

  // ── Event listeners ───────────────────────────────────────────────────────

  _activateListeners(html) {
    // Save edits on blur of any editable text area
    html.querySelectorAll('.sf-chronicle-text[contenteditable]').forEach(el => {
      el.addEventListener('blur', (e) => this._onTextBlur(e));
    });

    // Add annotation button
    const addBtn = html.querySelector('.sf-chronicle-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => this._onAddAnnotation());

    // Delete buttons (GM only)
    html.querySelectorAll('.sf-chronicle-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this._onDeleteEntry(e));
    });

    // Pin toggle
    html.querySelectorAll('.sf-chronicle-pin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this._onTogglePin(e));
    });

    // Type selector (GM only)
    html.querySelectorAll('.sf-chronicle-type-select').forEach(sel => {
      sel.addEventListener('change', (e) => this._onTypeChange(e));
    });
  }

  async _onTextBlur(e) {
    const el      = e.currentTarget;
    const entryId = el.closest('[data-entry-id]')?.dataset?.entryId;
    const newText = el.textContent?.trim() ?? '';
    if (!entryId || !newText) return;

    const entry = this._entries.find(en => en.id === entryId);
    if (entry && entry.text !== newText) {
      await updateChronicleEntry(this._actorId, entryId, newText);
      this._entries = await getChronicleEntries(this._actorId);
    }
  }

  async _onAddAnnotation() {
    const actorId    = this._actorId;
    const sessionId  = game.settings?.get(MODULE_ID, 'campaignState')?.currentSessionId ?? '';

    await addChronicleEntry(actorId, {
      type:      'annotation',
      text:      'New annotation — click to edit.',
      sessionId,
      automated: false,
    });

    await this.render(true);
  }

  async _onDeleteEntry(e) {
    if (!game.user?.isGM) return;
    const entryId = e.currentTarget.closest('[data-entry-id]')?.dataset?.entryId;
    if (!entryId) return;

    // Remove from entry list and persist via setFlag directly on the journal page
    const entries = this._entries.filter(en => en.id !== entryId);
    await this._saveEntries(entries);
    await this.render(true);
  }

  async _onTogglePin(e) {
    const entryId = e.currentTarget.closest('[data-entry-id]')?.dataset?.entryId;
    if (!entryId) return;

    const entry = this._entries.find(en => en.id === entryId);
    if (!entry) return;

    const updated = this._entries.map(en =>
      en.id === entryId ? { ...en, pinned: !en.pinned } : en
    );
    await this._saveEntries(updated);
    await this.render(true);
  }

  async _onTypeChange(e) {
    if (!game.user?.isGM) return;
    const entryId = e.currentTarget.closest('[data-entry-id]')?.dataset?.entryId;
    const newType = e.currentTarget.value;
    if (!entryId || !newType) return;

    const updated = this._entries.map(en =>
      en.id === entryId ? { ...en, type: newType } : en
    );
    await this._saveEntries(updated);
    await this.render(true);
  }

  // Write the full entries array back to the chronicle journal page.
  async _saveEntries(entries) {
    try {
      const actor = getActor(this._actorId);
      if (!actor) return;

      const journalName = `Chronicle — ${actor.name}`;
      const journal     = game.journal?.getName(journalName);
      if (!journal) return;

      const page = journal.pages?.contents?.[0];
      if (!page) return;

      await page.setFlag(MODULE_ID, 'chronicle', entries);
      this._entries = entries;
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
    <button type="button" class="sf-chronicle-add-btn" title="Add annotation">
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
    ? `<button type="button" class="sf-chronicle-delete-btn" title="Delete entry">✕</button>`
    : '';

  return `
<div class="sf-chronicle-entry${pinnedCls}${automCls}" data-entry-id="${escapeHtml(entry.id)}">
  <div class="sf-entry-meta">
    ${typeCell}
    <span class="sf-entry-date">${escapeHtml(dateStr)}</span>
    <button type="button" class="sf-chronicle-pin-btn" title="${entry.pinned ? 'Unpin' : 'Pin'} entry">
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
  _chroniclePanelInstance.render(true);
}

/**
 * Register the toolbar button for the chronicle panel in getSceneControlButtons.
 * Called from index.js alongside the other panel registrations.
 */
export function registerChroniclePanelHooks() {
  // Panel button is wired in index.js via getSceneControlButtons, same pattern
  // as progressTracks and entityPanel.
}
