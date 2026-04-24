// src/ui/entityPanel.js
// Entity panel — Starforged Companion module
// ApplicationV2 sidebar showing all tracked entities (Connections, Ships,
// Settlements, Factions, Planets) with portrait display, portrait generation /
// regeneration, and a detail view for each entity.
//
// Storage:
//   Entity data  — JournalEntry flags[MODULE_ID][entityType]
//   Art          — JournalEntryPage flags[MODULE_ID].art  (b64 via art/storage.js)
//
// Portrait lock (per session decisions):
//   State 0: no portrait      → Generate button shown
//   State 1: portrait, unlocked → Regenerate button shown (one permitted)
//   State 2: portrait, locked   → lock indicator only; no further generation
//
// Output path (Foundry): modules/starforged-companion/src/ui/entityPanel.js

import { buildPrompt }    from '../art/promptBuilder.js';
import { generateArt }    from '../art/generator.js';
import { loadArt, saveArt } from '../art/storage.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODULE_ID = 'starforged-companion';

/** Map of entity type key → display config */
const ENTITY_TYPES = {
  connection:  { label: 'Connections',  flag: 'connection',  icon: '⬡', artSize: '1024x1024' },
  ship:        { label: 'Ships',        flag: 'ship',        icon: '◈', artSize: '1792x1024' },
  settlement:  { label: 'Settlements',  flag: 'settlement',  icon: '⬟', artSize: '1024x1024' },
  faction:     { label: 'Factions',     flag: 'faction',     icon: '⬢', artSize: '1024x1024' },
  planet:      { label: 'Planets',      flag: 'planet',      icon: '◉', artSize: '1792x1024' },
};

/** Fields rendered in the detail view per entity type. */
const DETAIL_FIELDS = {
  connection: [
    { key: 'role',        label: 'Role'        },
    { key: 'goal',        label: 'Goal'        },
    { key: 'disposition', label: 'Disposition' },
    { key: 'location',    label: 'Location'    },
    { key: 'notes',       label: 'Notes'       },
  ],
  ship: [
    { key: 'type',      label: 'Type'      },
    { key: 'integrity', label: 'Integrity' },
    { key: 'battered',  label: 'Battered',  bool: true },
    { key: 'cursed',    label: 'Cursed',    bool: true },
    { key: 'notes',     label: 'Notes'     },
  ],
  settlement: [
    { key: 'location',  label: 'Location'  },
    { key: 'population', label: 'Population' },
    { key: 'authority', label: 'Authority' },
    { key: 'projects',  label: 'Projects'  },
    { key: 'notes',     label: 'Notes'     },
  ],
  faction: [
    { key: 'type',     label: 'Type'     },
    { key: 'goal',     label: 'Goal'     },
    { key: 'identity', label: 'Identity' },
    { key: 'quirks',   label: 'Quirks'   },
    { key: 'notes',    label: 'Notes'    },
  ],
  planet: [
    { key: 'type',    label: 'Type'    },
    { key: 'biomes',  label: 'Biomes'  },
    { key: 'peril',   label: 'Peril'   },
    { key: 'feature', label: 'Feature' },
    { key: 'notes',   label: 'Notes'   },
  ],
};

// ---------------------------------------------------------------------------
// Entity data helpers
// ---------------------------------------------------------------------------

/**
 * Load all entities of every type from the journal.
 * Returns a map: { connection: [...], ship: [...], ... }
 * Each entry is: { journalId, name, data, art }
 *   data — raw flag object from the entity module
 *   art  — { dataUri, locked, superseded } | null
 */
async function loadAllEntities() {
  const result = {};

  for (const [typeKey, config] of Object.entries(ENTITY_TYPES)) {
    result[typeKey] = [];

    for (const journal of game.journal) {
      const data = journal.getFlag(MODULE_ID, config.flag);
      if (!data) continue;

      const art = await loadArt(journal.id).catch(() => null);

      result[typeKey].push({
        journalId: journal.id,
        name: data.name ?? journal.name,
        typeKey,
        data,
        art,
      });
    }

    // Sort alphabetically within each type
    result[typeKey].sort((a, b) => a.name.localeCompare(b.name));
  }

  return result;
}

/**
 * Find a single entity record across all types.
 * @param {string} journalId
 * @returns {Promise<object|null>}
 */
async function findEntity(journalId) {
  for (const [typeKey, config] of Object.entries(ENTITY_TYPES)) {
    const journal = game.journal.get(journalId);
    if (!journal) continue;
    const data = journal.getFlag(MODULE_ID, config.flag);
    if (!data) continue;
    const art = await loadArt(journalId).catch(() => null);
    return { journalId, name: data.name ?? journal.name, typeKey, data, art };
  }
  return null;
}

// ---------------------------------------------------------------------------
// ApplicationV2 panel
// ---------------------------------------------------------------------------

const { ApplicationV2 } = foundry.applications.api;

export class EntityPanelApp extends ApplicationV2 {

  static #instance = null;

  /** journalId of the currently selected entity, or null for list view. */
  #selectedId = null;

  /** Track in-progress art generation to prevent double-clicks. */
  #generatingIds = new Set();

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-entity-panel`,
    classes: [MODULE_ID, 'entity-panel'],
    tag: 'div',
    window: {
      title: 'Entities',
      resizable: true,
      minimizable: true,
    },
    position: {
      width: 380,
      height: 600,
    },
    actions: {
      selectEntity:      EntityPanelApp.#onSelectEntity,
      backToList:        EntityPanelApp.#onBackToList,
      generatePortrait:  EntityPanelApp.#onGeneratePortrait,
      regeneratePortrait: EntityPanelApp.#onRegeneratePortrait,
    },
  };

  static open() {
    if (!EntityPanelApp.#instance) {
      EntityPanelApp.#instance = new EntityPanelApp();
    }
    EntityPanelApp.#instance.render({ force: true });
    return EntityPanelApp.#instance;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** @override */
  async _prepareContext(options) {
    if (this.#selectedId) {
      const entity = await findEntity(this.#selectedId);
      return { view: 'detail', entity };
    }

    const groups = await loadAllEntities();

    // Flatten to sections for template
    const sections = Object.entries(ENTITY_TYPES).map(([typeKey, config]) => ({
      typeKey,
      label: config.label,
      icon: config.icon,
      entities: groups[typeKey] ?? [],
    })).filter(s => s.entities.length > 0);

    const totalCount = Object.values(groups).reduce((n, arr) => n + arr.length, 0);

    return { view: 'list', sections, totalCount };
  }

  /** @override */
  async _renderHTML(context, options) {
    const html = context.view === 'detail'
      ? this.#renderDetail(context.entity)
      : this.#renderList(context.sections, context.totalCount);

    const tmp = document.createElement('div');
    tmp.innerHTML = html.trim();
    return tmp.firstElementChild;
  }

  /** @override */
  _replaceHTML(result, content, options) {
    content.innerHTML = '';
    content.append(result);
  }

  // -----------------------------------------------------------------------
  // List view
  // -----------------------------------------------------------------------

  #renderList(sections, totalCount) {
    if (totalCount === 0) {
      return `
        <div class="sf-entity-panel sf-entity-list">
          <p class="entity-empty-state">
            No entities tracked yet.<br>
            They appear here when created via the entity modules.
          </p>
        </div>
      `;
    }

    const sectionHtml = sections.map(s => `
      <section class="entity-section" data-type="${s.typeKey}">
        <h3 class="entity-section-title">
          <span class="entity-type-icon">${s.icon}</span>
          ${s.label}
          <span class="entity-count">${s.entities.length}</span>
        </h3>
        <ul class="entity-list">
          ${s.entities.map(e => this.#renderEntityRow(e)).join('')}
        </ul>
      </section>
    `).join('');

    return `<div class="sf-entity-panel sf-entity-list">${sectionHtml}</div>`;
  }

  #renderEntityRow(entity) {
    const thumb = entity.art?.dataUri
      ? `<img class="entity-thumb" src="${entity.art.dataUri}" alt="${entity.name}" loading="lazy">`
      : `<div class="entity-thumb entity-thumb-placeholder">${ENTITY_TYPES[entity.typeKey].icon}</div>`;

    const lockBadge = entity.art?.locked
      ? '<span class="art-lock-badge" title="Portrait locked">🔒</span>'
      : '';

    return `
      <li class="entity-row" data-action="selectEntity" data-journal-id="${entity.journalId}"
          role="button" tabindex="0">
        <div class="entity-thumb-wrap">
          ${thumb}
          ${lockBadge}
        </div>
        <div class="entity-row-info">
          <span class="entity-row-name">${entity.name}</span>
          ${this.#renderRowSubtitle(entity)}
        </div>
        <span class="entity-row-chevron">›</span>
      </li>
    `;
  }

  /** One-line subtitle per entity type, pulled from the most useful field. */
  #renderRowSubtitle(entity) {
    const d = entity.data;
    let text = '';
    switch (entity.typeKey) {
      case 'connection':  text = [d.role, d.goal].filter(Boolean).join(' · '); break;
      case 'ship':        text = [d.type, d.integrity ? `Integrity ${d.integrity}` : ''].filter(Boolean).join(' · '); break;
      case 'settlement':  text = [d.location, d.population].filter(Boolean).join(' · '); break;
      case 'faction':     text = [d.type, d.goal].filter(Boolean).join(' · '); break;
      case 'planet':      text = [d.type, d.biomes].filter(Boolean).join(' · '); break;
    }
    return text ? `<span class="entity-row-subtitle">${text}</span>` : '';
  }

  // -----------------------------------------------------------------------
  // Detail view
  // -----------------------------------------------------------------------

  #renderDetail(entity) {
    if (!entity) {
      return `
        <div class="sf-entity-panel sf-entity-detail">
          <div class="detail-back">
            <button class="entity-btn btn-back" data-action="backToList">← Back</button>
          </div>
          <p class="entity-empty-state">Entity not found.</p>
        </div>
      `;
    }

    const config = ENTITY_TYPES[entity.typeKey];
    const isGenerating = this.#generatingIds.has(entity.journalId);

    // Portrait section
    let portraitHtml;
    if (entity.art?.dataUri) {
      const lockBadge = entity.art.locked
        ? '<div class="portrait-lock-badge">🔒 Portrait locked</div>'
        : '';
      const regenBtn = (!entity.art.locked && !isGenerating)
        ? `<button class="entity-btn btn-regen" data-action="regeneratePortrait"
                   data-journal-id="${entity.journalId}">
             Regenerate portrait
           </button>`
        : '';
      portraitHtml = `
        <div class="portrait-wrap">
          <img class="entity-portrait" src="${entity.art.dataUri}" alt="${entity.name} portrait">
          ${lockBadge}
          <div class="portrait-actions">${regenBtn}</div>
        </div>
      `;
    } else {
      const genBtn = isGenerating
        ? `<button class="entity-btn btn-generate" disabled>Generating…</button>`
        : `<button class="entity-btn btn-generate" data-action="generatePortrait"
                   data-journal-id="${entity.journalId}">
             Generate portrait
           </button>`;
      portraitHtml = `
        <div class="portrait-wrap portrait-placeholder">
          <div class="portrait-placeholder-icon">${config.icon}</div>
          <div class="portrait-actions">${genBtn}</div>
        </div>
      `;
    }

    // Entity fields
    const fields = DETAIL_FIELDS[entity.typeKey] ?? [];
    const fieldsHtml = fields
      .filter(f => entity.data[f.key] !== undefined && entity.data[f.key] !== null && entity.data[f.key] !== '')
      .map(f => {
        const val = f.bool
          ? (entity.data[f.key] ? 'Yes' : 'No')
          : String(entity.data[f.key]);
        return `
          <div class="detail-field">
            <dt class="detail-label">${f.label}</dt>
            <dd class="detail-value">${val}</dd>
          </div>
        `;
      }).join('');

    // Connection-specific: progress track link
    const progressHtml = entity.typeKey === 'connection' && entity.data.progress
      ? `<div class="detail-progress">
           <span class="detail-label">Progress</span>
           <span class="detail-value">
             ${Math.floor((entity.data.progress.ticks ?? 0) / 4)} / 10 boxes
             (${entity.data.progress.rank ?? '—'})
           </span>
         </div>`
      : '';

    // History (connections)
    const historyHtml = entity.typeKey === 'connection' && entity.data.history?.length
      ? `<details class="detail-history">
           <summary>History (${entity.data.history.length})</summary>
           <ul class="history-list">
             ${entity.data.history.map(h => `<li class="history-item">${h}</li>`).join('')}
           </ul>
         </details>`
      : '';

    return `
      <div class="sf-entity-panel sf-entity-detail">
        <div class="detail-back">
          <button class="entity-btn btn-back" data-action="backToList">← All Entities</button>
        </div>

        <div class="detail-header">
          <span class="detail-type-icon">${config.icon}</span>
          <div class="detail-titles">
            <h2 class="detail-name">${entity.name}</h2>
            <span class="detail-type-label">${config.label.replace(/s$/, '')}</span>
          </div>
        </div>

        ${portraitHtml}

        <dl class="detail-fields">
          ${fieldsHtml}
          ${progressHtml}
        </dl>

        ${historyHtml}
      </div>
    `;
  }

  // -----------------------------------------------------------------------
  // Action handlers
  // -----------------------------------------------------------------------

  static async #onSelectEntity(event, target) {
    this.#selectedId = target.dataset.journalId;
    this.render();
  }

  static async #onBackToList(event, target) {
    this.#selectedId = null;
    this.render();
  }

  /**
   * Generate a portrait for an entity that has none yet.
   * Calls art/promptBuilder → art/generator → art/storage.
   * On success, marks the entity's art as unlocked (state 1).
   */
  static async #onGeneratePortrait(event, target) {
    const journalId = target.dataset.journalId;
    if (this.#generatingIds.has(journalId)) return;

    this.#generatingIds.add(journalId);
    this.render(); // show "Generating…" state immediately

    try {
      const entity = await findEntity(journalId);
      if (!entity) throw new Error(`Entity not found: ${journalId}`);

      const config = ENTITY_TYPES[entity.typeKey];
      const prompt = buildPrompt(entity.typeKey, entity.data);
      const b64 = await generateArt({ prompt, size: config.artSize });

      await saveArt(journalId, { b64, locked: false, superseded: false });

      ui.notifications.info(`Portrait generated for ${entity.name}.`);
    } catch (err) {
      console.error(`${MODULE_ID} | Portrait generation failed:`, err);
      ui.notifications.warn(`Portrait generation failed for this entity. Check console for details.`);
    } finally {
      this.#generatingIds.delete(journalId);
      this.render();
    }
  }

  /**
   * Regenerate a portrait (permitted once; immediately locks after).
   * Marks the previous asset as superseded, stores the new one as locked.
   */
  static async #onRegeneratePortrait(event, target) {
    const journalId = target.dataset.journalId;
    if (this.#generatingIds.has(journalId)) return;

    const confirmed = await Dialog.confirm({
      title: 'Regenerate Portrait',
      content: `<p>This is your one permitted regeneration. The new portrait will be <strong>permanently locked</strong>. Continue?</p>`,
    });
    if (!confirmed) return;

    this.#generatingIds.add(journalId);
    this.render();

    try {
      const entity = await findEntity(journalId);
      if (!entity) throw new Error(`Entity not found: ${journalId}`);

      const config = ENTITY_TYPES[entity.typeKey];

      // Mark old asset superseded
      if (entity.art?.dataUri) {
        await saveArt(journalId, { ...entity.art, superseded: true });
      }

      // Build prompt with 'alternative composition' instruction (per session decisions)
      const prompt = buildPrompt(entity.typeKey, entity.data, { alternativeComposition: true });
      const b64 = await generateArt({ prompt, size: config.artSize });

      // Save new asset as locked immediately
      await saveArt(journalId, { b64, locked: true, superseded: false });

      ui.notifications.info(`Portrait regenerated and locked for ${entity.name}.`);
    } catch (err) {
      console.error(`${MODULE_ID} | Portrait regeneration failed:`, err);
      ui.notifications.warn(`Portrait regeneration failed. Check console for details.`);
    } finally {
      this.#generatingIds.delete(journalId);
      this.render();
    }
  }

  // -----------------------------------------------------------------------
  // Foundry hooks — live refresh
  // -----------------------------------------------------------------------

  /**
   * Register hooks to refresh the panel when entity journals update.
   * Called once from index.js init.
   */
  static registerHooks() {
    // Re-render when any journal entry's flags change — entity data or art.
    Hooks.on('updateJournalEntry', (doc, change) => {
      const instance = EntityPanelApp.#instance;
      if (!instance?.rendered) return;
      const hasModuleFlags = foundry.utils.hasProperty(change, `flags.${MODULE_ID}`);
      if (!hasModuleFlags) return;
      instance.render();
    });

    // Re-render when a journal is created (new entity added from connection.js etc.)
    Hooks.on('createJournalEntry', () => {
      const instance = EntityPanelApp.#instance;
      if (instance?.rendered) instance.render();
    });

    // Re-render (back to list) when a journal is deleted
    Hooks.on('deleteJournalEntry', (doc) => {
      const instance = EntityPanelApp.#instance;
      if (!instance?.rendered) return;
      if (instance.#selectedId === doc.id) instance.#selectedId = null;
      instance.render();
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open the entity panel, optionally jumping straight to a specific entity.
 * @param {string} [journalId]  If provided, opens in detail view for that entity.
 * @returns {EntityPanelApp}
 */
export function openEntityPanel(journalId = null) {
  const app = EntityPanelApp.open();
  if (journalId) {
    app._EntityPanelApp__selectedId = journalId;
    app.render();
  }
  return app;
}

/**
 * Register Foundry hooks. Called once from index.js init.
 */
export function registerEntityPanelHooks() {
  EntityPanelApp.registerHooks();
}
