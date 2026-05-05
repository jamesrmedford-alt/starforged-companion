// src/ui/entityPanel.js
// Entity panel — Starforged Companion module
// ApplicationV2 sidebar showing all tracked entities (Connections, Ships,
// Settlements, Factions, Planets) with portrait display, portrait generation /
// regeneration, and a detail view for each entity.
//
// Storage:
//   Entity data  — JournalEntry flags[MODULE_ID][entityType]
//   Art          — ArtAsset records via art/storage.js, indexed by entity.portraitId
//
// Portrait lock (per session decisions):
//   State 0: no portrait        → Generate button shown
//   State 1: portrait, unlocked → Regenerate button shown (one permitted)
//   State 2: portrait, locked   → lock indicator only; no further generation
//
// Output path (Foundry): modules/starforged-companion/src/ui/entityPanel.js

import { generatePortrait, regeneratePortrait } from '../art/generator.js';
import { loadArtAsset, getDataUri }             from '../art/storage.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODULE_ID = 'starforged-companion';

const ENTITY_TYPES = {
  connection:  { label: 'Connections',  flag: 'connection',  icon: '⬡' },
  ship:        { label: 'Ships',        flag: 'ship',        icon: '◈' },
  settlement:  { label: 'Settlements',  flag: 'settlement',  icon: '⬟' },
  faction:     { label: 'Factions',     flag: 'faction',     icon: '⬢' },
  planet:      { label: 'Planets',      flag: 'planet',      icon: '◉' },
  location:    { label: 'Locations',    flag: 'location',    icon: '◧' },
  creature:    { label: 'Creatures',    flag: 'creature',    icon: '⬣' },
};

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
    { key: 'location',   label: 'Location'   },
    { key: 'population', label: 'Population' },
    { key: 'authority',  label: 'Authority'  },
    { key: 'projects',   label: 'Projects'   },
    { key: 'notes',      label: 'Notes'      },
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
  location: [
    { key: 'type',        label: 'Type'        },
    { key: 'region',      label: 'Region'      },
    { key: 'status',      label: 'Status'      },
    { key: 'firstLook',   label: 'First look'  },
    { key: 'feature',     label: 'Feature'     },
    { key: 'description', label: 'Description' },
    { key: 'notes',       label: 'Notes'       },
  ],
  creature: [
    { key: 'scale',       label: 'Scale'       },
    { key: 'environment', label: 'Environment' },
    { key: 'form',        label: 'Form'        },
    { key: 'behavior',    label: 'Behavior'    },
    { key: 'rank',        label: 'Rank'        },
    { key: 'description', label: 'Description' },
    { key: 'notes',       label: 'Notes'       },
  ],
};

// ---------------------------------------------------------------------------
// Entity data helpers
// ---------------------------------------------------------------------------

/**
 * Load all entities of every type from the journal, with their art assets.
 * Art is looked up via entity.data.portraitId → loadArtAsset().
 */
async function loadAllEntities() {
  const campaignState = game.settings.get(MODULE_ID, 'campaignState') ?? {};
  const result = {};

  for (const [typeKey, config] of Object.entries(ENTITY_TYPES)) {
    result[typeKey] = [];

    for (const journal of game.journal) {
      const data = journal.getFlag(MODULE_ID, config.flag);
      if (!data) continue;

      // Load art asset via entity's portraitId
      const art = data.portraitId
        ? await loadArtAsset(data.portraitId, campaignState).catch(() => null)
        : null;

      const dataUri = art ? getDataUri(art) : null;

      result[typeKey].push({
        journalId: journal.id,
        name:      data.name ?? journal.name,
        typeKey,
        data,
        art:    art   ? { ...art, dataUri } : null,
      });
    }

    result[typeKey].sort((a, b) => a.name.localeCompare(b.name));
  }

  return result;
}

/**
 * Find a single entity record across all types.
 */
async function findEntity(journalId) {
  const campaignState = game.settings.get(MODULE_ID, 'campaignState') ?? {};

  for (const [typeKey, config] of Object.entries(ENTITY_TYPES)) {
    const journal = game.journal.get(journalId);
    if (!journal) continue;
    const data = journal.getFlag(MODULE_ID, config.flag);
    if (!data) continue;

    const art = data.portraitId
      ? await loadArtAsset(data.portraitId, campaignState).catch(() => null)
      : null;

    const dataUri = art ? getDataUri(art) : null;

    return {
      journalId,
      name: data.name ?? journal.name,
      typeKey,
      data,
      art: art ? { ...art, dataUri } : null,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// ApplicationV2 panel
// ---------------------------------------------------------------------------

const { ApplicationV2, DialogV2 } = foundry.applications.api;

export class EntityPanelApp extends ApplicationV2 {

  static #instance = null;

  #selectedId = null;
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
    position: { width: 380, height: 600 },
    actions: {
      selectEntity:       EntityPanelApp.#onSelectEntity,
      backToList:         EntityPanelApp.#onBackToList,
      generatePortrait:   EntityPanelApp.#onGeneratePortrait,
      regeneratePortrait: EntityPanelApp.#onRegeneratePortrait,
      pinTier:            EntityPanelApp.#onPinTier,
      promoteTier:        EntityPanelApp.#onPromoteTier,
      removeTier:         EntityPanelApp.#onRemoveTier,
      toggleCanonicalLock:EntityPanelApp.#onToggleCanonicalLock,
      setCurrentLocation: EntityPanelApp.#onSetCurrentLocation,
      switchTopTab:       EntityPanelApp.#onSwitchTopTab,
      undismiss:          EntityPanelApp.#onUndismiss,
    },
  };

  #activeTopTab = 'entities';   // 'entities' | 'dismissed'

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

  async _prepareContext(_options) {
    const campaignState = game.settings.get(MODULE_ID, 'campaignState') ?? {};
    const isCurrentLocation = (id) =>
      !!campaignState.currentLocationId && campaignState.currentLocationId === id;

    if (this.#selectedId) {
      const entity = await findEntity(this.#selectedId);
      return { view: 'detail', entity, isCurrentLocation: isCurrentLocation(this.#selectedId) };
    }

    if (this.#activeTopTab === 'dismissed') {
      return {
        view:               'dismissed',
        dismissedEntities:  campaignState.dismissedEntities ?? [],
        topTab:             'dismissed',
      };
    }

    const groups = await loadAllEntities();
    const sections = Object.entries(ENTITY_TYPES).map(([typeKey, config]) => ({
      typeKey,
      label:    config.label,
      icon:     config.icon,
      entities: groups[typeKey] ?? [],
    })).filter(s => s.entities.length > 0);

    const totalCount = Object.values(groups).reduce((n, arr) => n + arr.length, 0);
    return { view: 'list', sections, totalCount, topTab: 'entities' };
  }

  async _renderHTML(context, _options) {
    let html;
    if (context.view === 'detail') {
      html = this.#renderDetail(context.entity, context.isCurrentLocation);
    } else if (context.view === 'dismissed') {
      html = this.#renderDismissed(context.dismissedEntities);
    } else {
      html = this.#renderList(context.sections, context.totalCount, context.topTab);
    }

    const tmp = document.createElement('div');
    tmp.innerHTML = html.trim();
    return tmp.firstElementChild;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = '';
    content.append(result);
  }

  // -----------------------------------------------------------------------
  // List view
  // -----------------------------------------------------------------------

  #renderList(sections, totalCount, topTab = 'entities') {
    const tabs = `
      <div class="sf-entity-toptabs">
        <button class="sf-entity-toptab${topTab === 'entities' ? ' sf-entity-toptab-active' : ''}"
                data-action="switchTopTab" data-tab="entities">Entities</button>
        <button class="sf-entity-toptab${topTab === 'dismissed' ? ' sf-entity-toptab-active' : ''}"
                data-action="switchTopTab" data-tab="dismissed">Dismissed</button>
      </div>`;

    if (totalCount === 0) {
      return `
        <div class="sf-entity-panel sf-entity-list">
          ${tabs}
          <p class="entity-empty-state">
            No entities tracked yet.<br>
            They appear here when created via the entity modules.
          </p>
        </div>`;
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
      </section>`).join('');

    return `<div class="sf-entity-panel sf-entity-list">${tabs}${sectionHtml}</div>`;
  }

  #renderDismissed(dismissedEntities) {
    const tabs = `
      <div class="sf-entity-toptabs">
        <button class="sf-entity-toptab" data-action="switchTopTab" data-tab="entities">Entities</button>
        <button class="sf-entity-toptab sf-entity-toptab-active"
                data-action="switchTopTab" data-tab="dismissed">Dismissed</button>
      </div>`;

    const list = dismissedEntities.length
      ? dismissedEntities.map(name => `
          <li class="sf-dismissed-row">
            <span class="sf-dismissed-name">${escapeHtml(name)}</span>
            <button class="entity-btn sf-undismiss-btn"
                    data-action="undismiss" data-name="${escapeHtml(name)}">Undismiss</button>
          </li>`).join('')
      : '';

    const body = list
      ? `<ul class="sf-dismissed-list">${list}</ul>`
      : `<p class="entity-empty-state">No dismissed entities. Names dismissed from the entity-discovery
         draft card appear here so you can restore them.</p>`;

    return `<div class="sf-entity-panel sf-entity-dismissed">${tabs}${body}</div>`;
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
        <div class="entity-thumb-wrap">${thumb}${lockBadge}</div>
        <div class="entity-row-info">
          <span class="entity-row-name">${entity.name}</span>
          ${this.#renderRowSubtitle(entity)}
        </div>
        <span class="entity-row-chevron">›</span>
      </li>`;
  }

  #renderRowSubtitle(entity) {
    const d = entity.data;
    let text = '';
    switch (entity.typeKey) {
      case 'connection':  text = [d.role, d.goal].filter(Boolean).join(' · '); break;
      case 'ship':        text = [d.type, d.integrity ? `Integrity ${d.integrity}` : ''].filter(Boolean).join(' · '); break;
      case 'settlement':  text = [d.location, d.population].filter(Boolean).join(' · '); break;
      case 'faction':     text = [d.type, d.goal].filter(Boolean).join(' · '); break;
      case 'planet':      text = [d.type, d.biomes].filter(Boolean).join(' · '); break;
      case 'location':    text = [d.type, d.status].filter(Boolean).join(' · '); break;
      case 'creature':    text = [d.scale, d.environment].filter(Boolean).join(' · '); break;
    }
    return text ? `<span class="entity-row-subtitle">${text}</span>` : '';
  }

  // -----------------------------------------------------------------------
  // Detail view
  // -----------------------------------------------------------------------

  #renderDetail(entity, isCurrentLocation = false) {
    if (!entity) {
      return `
        <div class="sf-entity-panel sf-entity-detail">
          <div class="detail-back">
            <button class="entity-btn btn-back" data-action="backToList">← Back</button>
          </div>
          <p class="entity-empty-state">Entity not found.</p>
        </div>`;
    }

    const config = ENTITY_TYPES[entity.typeKey];
    const isGenerating = this.#generatingIds.has(entity.journalId);
    const canonicalLocked = !!entity.data.canonicalLocked;
    const lockToggleTitle = canonicalLocked
      ? 'Canonical fields are locked — narrator may not contradict'
      : 'Canonical fields are unlocked — narrator prefers consistency';
    const lockToggleHtml = `
      <button class="sf-canonical-lock${canonicalLocked ? ' sf-canonical-locked' : ''}"
              data-action="toggleCanonicalLock"
              data-journal-id="${escapeHtml(entity.journalId)}"
              title="${escapeHtml(lockToggleTitle)}">
        ${canonicalLocked ? '🔒 Locked' : '🔓 Unlocked'}
      </button>`;

    const supportsCurrentLocation = ['settlement', 'location', 'planet'].includes(entity.typeKey);
    const currentLocationBtn = supportsCurrentLocation
      ? `<button class="sf-set-current-location${isCurrentLocation ? ' sf-current-location-active' : ''}"
                 data-action="setCurrentLocation"
                 data-journal-id="${escapeHtml(entity.journalId)}"
                 data-type="${escapeHtml(entity.typeKey)}">
           ${isCurrentLocation ? '✓ Current location' : 'Set as current location'}
         </button>`
      : '';

    let portraitHtml;
    if (entity.art?.dataUri) {
      const lockBadge = entity.art.locked
        ? '<div class="portrait-lock-badge">🔒 Portrait locked</div>'
        : '';
      const regenBtn = (!entity.art.locked && !entity.art.regenerationUsed && !isGenerating)
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
        </div>`;
    } else {
      const canGenerate = !!entity.data.portraitSourceDescription;
      const genBtn = isGenerating
        ? `<button class="entity-btn btn-generate" disabled>Generating…</button>`
        : canGenerate
          ? `<button class="entity-btn btn-generate" data-action="generatePortrait"
                     data-journal-id="${entity.journalId}">
               Generate portrait
             </button>`
          : `<button class="entity-btn btn-generate" disabled
                     title="No source description yet — portrait will generate after Loremaster's first description">
               Awaiting description
             </button>`;
      portraitHtml = `
        <div class="portrait-wrap portrait-placeholder">
          <div class="portrait-placeholder-icon">${config.icon}</div>
          <div class="portrait-actions">${genBtn}</div>
        </div>`;
    }

    const fields = DETAIL_FIELDS[entity.typeKey] ?? [];
    const fieldsHtml = fields
      .filter(f => entity.data[f.key] !== undefined && entity.data[f.key] !== null && entity.data[f.key] !== '')
      .map(f => {
        const val = f.bool ? (entity.data[f.key] ? 'Yes' : 'No') : String(entity.data[f.key]);
        return `
          <div class="detail-field">
            <dt class="detail-label">${f.label}</dt>
            <dd class="detail-value">${val}</dd>
          </div>`;
      }).join('');

    const progressHtml = entity.typeKey === 'connection' && entity.data.progress
      ? `<div class="detail-progress">
           <span class="detail-label">Progress</span>
           <span class="detail-value">
             ${Math.floor((entity.data.progress.ticks ?? 0) / 4)} / 10 boxes
             (${entity.data.progress.rank ?? '—'})
           </span>
         </div>`
      : '';

    const historyHtml = entity.typeKey === 'connection' && entity.data.history?.length
      ? `<details class="detail-history">
           <summary>History (${entity.data.history.length})</summary>
           <ul class="history-list">
             ${entity.data.history.map(h => `<li class="history-item">${h}</li>`).join('')}
           </ul>
         </details>`
      : '';

    const tierHtml = this.#renderGenerativeTier(entity);
    const headerActions = `
      <div class="detail-header-actions">
        ${lockToggleHtml}
        ${currentLocationBtn}
      </div>`;

    return `
      <div class="sf-entity-panel sf-entity-detail">
        <div class="detail-back">
          <button class="entity-btn btn-back" data-action="backToList">← All Entities</button>
        </div>
        <div class="detail-header">
          <span class="detail-type-icon">${config.icon}</span>
          <div class="detail-titles">
            <h2 class="detail-name">${escapeHtml(entity.name)}</h2>
            <span class="detail-type-label">${config.label.replace(/s$/, '')}</span>
          </div>
        </div>
        ${headerActions}
        ${portraitHtml}
        <dl class="detail-fields">
          ${fieldsHtml}
          ${progressHtml}
        </dl>
        ${tierHtml}
        ${historyHtml}
      </div>`;
  }

  /**
   * Render the generative-tier section (collapsible) per
   * narrator-entity-discovery scope §3. Pinned entries appear first; promoted
   * entries are filtered out (they live on the canonical fields now).
   */
  #renderGenerativeTier(entity) {
    const tier = Array.isArray(entity?.data?.generativeTier)
      ? entity.data.generativeTier
      : [];
    const visible = tier.filter(e => !e?.promoted);
    if (!visible.length) {
      return `
        <details class="sf-generative-tier sf-generative-tier-empty">
          <summary>Narrator-added details (0)</summary>
          <p class="sf-tier-empty">
            No narrator-added details yet. The combined detection pass appends
            them automatically when the narrator references this entity.
          </p>
        </details>`;
    }

    const sorted = visible.slice().sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.sessionNum ?? 0) - (a.sessionNum ?? 0);
    });

    const rows = sorted.map((e, idx) => {
      const sessionTag = e.sessionNum
        ? `Session ${escapeHtml(String(e.sessionNum))}`
        : (e.sessionId ? escapeHtml(String(e.sessionId)) : '');
      const pinnedClass = e.pinned ? ' sf-tier-pinned' : '';
      const pinIcon     = e.pinned ? '📌' : '📍';
      const pinTitle    = e.pinned ? 'Unpin' : 'Pin (always include in narrator prompt)';
      return `
        <li class="sf-tier-row${pinnedClass}" data-entry-index="${idx}">
          <div class="sf-tier-meta">
            <span class="sf-tier-session">${sessionTag}</span>
            <button class="sf-tier-pin-btn" data-action="pinTier"
                    data-journal-id="${escapeHtml(entity.journalId)}"
                    data-detail="${escapeHtml(e.detail ?? '')}"
                    title="${escapeHtml(pinTitle)}">${pinIcon}</button>
            <button class="sf-tier-promote-btn" data-action="promoteTier"
                    data-journal-id="${escapeHtml(entity.journalId)}"
                    data-detail="${escapeHtml(e.detail ?? '')}"
                    title="Promote to canonical (append to notes)">⤴</button>
            <button class="sf-tier-remove-btn" data-action="removeTier"
                    data-journal-id="${escapeHtml(entity.journalId)}"
                    data-detail="${escapeHtml(e.detail ?? '')}"
                    title="Remove">✕</button>
          </div>
          <div class="sf-tier-detail">${escapeHtml(e.detail ?? '')}</div>
        </li>`;
    }).join('');

    return `
      <details class="sf-generative-tier" open>
        <summary>Narrator-added details (${visible.length})</summary>
        <ul class="sf-tier-list">${rows}</ul>
      </details>`;
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
   * Generate a portrait using the real generator.js API.
   * generator.js handles prompt building, DALL-E call, storage, and entity linking.
   */
  static async #onGeneratePortrait(event, target) {
    const journalId = target.dataset.journalId;
    if (this.#generatingIds.has(journalId)) return;

    this.#generatingIds.add(journalId);
    this.render();

    try {
      const entity       = await findEntity(journalId);
      if (!entity) throw new Error(`Entity not found: ${journalId}`);

      const campaignState = game.settings.get(MODULE_ID, 'campaignState') ?? {};

      const asset = await generatePortrait(
        journalId,
        entity.typeKey,
        entity.data,
        campaignState,
      );

      if (asset) {
        ui.notifications.info(`Portrait generated for ${entity.name}.`);
      } else {
        ui.notifications.warn(`Portrait generation failed for ${entity.name}. Check console for details.`);
      }
    } catch (err) {
      console.error(`${MODULE_ID} | Portrait generation failed:`, err);
      ui.notifications.warn(`Portrait generation failed. Check console for details.`);
    } finally {
      this.#generatingIds.delete(journalId);
      this.render();
    }
  }

  /**
   * Regenerate a portrait using the real generator.js API.
   * generator.js enforces the one-regeneration policy and locks immediately.
   */
  static async #onRegeneratePortrait(event, target) {
    const journalId = target.dataset.journalId;
    if (this.#generatingIds.has(journalId)) return;

    const confirmed = await DialogV2.confirm({
      window:  { title: 'Regenerate Portrait' },
      content: `<p>This is your one permitted regeneration. The new portrait will be <strong>permanently locked</strong>. Continue?</p>`,
    });
    if (!confirmed) return;

    this.#generatingIds.add(journalId);
    this.render();

    try {
      const entity = await findEntity(journalId);
      if (!entity) throw new Error(`Entity not found: ${journalId}`);

      const campaignState = game.settings.get(MODULE_ID, 'campaignState') ?? {};

      const asset = await regeneratePortrait(
        journalId,
        entity.typeKey,
        entity.data,
        campaignState,
      );

      if (asset) {
        ui.notifications.info(`Portrait regenerated and locked for ${entity.name}.`);
      } else {
        ui.notifications.warn(`Portrait regeneration failed for ${entity.name}. Check console for details.`);
      }
    } catch (err) {
      console.error(`${MODULE_ID} | Portrait regeneration failed:`, err);
      ui.notifications.warn(`Portrait regeneration failed. Check console for details.`);
    } finally {
      this.#generatingIds.delete(journalId);
      this.render();
    }
  }

  // -----------------------------------------------------------------------
  // Generative tier handlers
  // -----------------------------------------------------------------------

  static async #onPinTier(event, target) {
    const journalId = target.dataset.journalId;
    const detail    = target.dataset.detail;
    if (!journalId || !detail) return;
    await mutateGenerativeTier(journalId, (tier) => {
      const idx = tier.findIndex(e => (e?.detail ?? '') === detail);
      if (idx === -1) return tier;
      const updated = [...tier];
      updated[idx] = { ...updated[idx], pinned: !updated[idx].pinned };
      return updated;
    });
    this.render();
  }

  static async #onPromoteTier(event, target) {
    const journalId = target.dataset.journalId;
    const detail    = target.dataset.detail;
    if (!journalId || !detail) return;

    const confirmed = await DialogV2.confirm({
      window:  { title: 'Promote to canonical' },
      content:
        `<p>Promoting this detail appends it to the entity's <strong>notes</strong> field ` +
        `and removes it from the generative-tier display. The narrator will then treat it ` +
        `as canonical (not soft-established).</p>` +
        `<p>Continue?</p>`,
    });
    if (!confirmed) return;

    const journal = game.journal?.get(journalId);
    const page    = journal?.pages?.contents?.[0];
    if (!page) return;
    const entityType = Object.keys(ENTITY_TYPES).find(k => page.flags?.[MODULE_ID]?.[k]);
    if (!entityType) return;
    const data = { ...(page.flags[MODULE_ID][entityType] ?? {}) };

    const tier = Array.isArray(data.generativeTier) ? [...data.generativeTier] : [];
    const idx  = tier.findIndex(e => (e?.detail ?? '') === detail);
    if (idx === -1) return;

    const promotedAt = new Date().toISOString();
    tier[idx] = { ...tier[idx], promoted: true, promotedAt };

    const existingNotes = data.notes ?? '';
    const appended      = existingNotes
      ? `${existingNotes}\n\n${detail}`
      : detail;

    await page.setFlag(MODULE_ID, entityType, {
      ...data,
      notes:          appended,
      generativeTier: tier,
      updatedAt:      promotedAt,
    });
    this.render();
  }

  static async #onRemoveTier(event, target) {
    const journalId = target.dataset.journalId;
    const detail    = target.dataset.detail;
    if (!journalId || !detail) return;
    await mutateGenerativeTier(journalId, (tier) =>
      tier.filter(e => (e?.detail ?? '') !== detail),
    );
    this.render();
  }

  // -----------------------------------------------------------------------
  // canonicalLocked toggle + current-location button
  // -----------------------------------------------------------------------

  static async #onToggleCanonicalLock(event, target) {
    const journalId = target.dataset.journalId;
    if (!journalId) return;
    const journal = game.journal?.get(journalId);
    const page    = journal?.pages?.contents?.[0];
    if (!page) return;
    const entityType = Object.keys(ENTITY_TYPES).find(k => page.flags?.[MODULE_ID]?.[k]);
    if (!entityType) return;
    const data = { ...(page.flags[MODULE_ID][entityType] ?? {}) };
    const next = !data.canonicalLocked;
    await page.setFlag(MODULE_ID, entityType, {
      ...data,
      canonicalLocked: next,
      updatedAt:       new Date().toISOString(),
    });
    this.render();
  }

  static async #onSetCurrentLocation(event, target) {
    const journalId = target.dataset.journalId;
    const type      = target.dataset.type;
    if (!journalId || !type) return;
    if (!game.user.isGM) {
      ui?.notifications?.warn('Setting the current location is GM-only (writes campaign state).');
      return;
    }

    const campaignState = game.settings.get(MODULE_ID, 'campaignState') ?? {};
    const isAlreadyCurrent = campaignState.currentLocationId === journalId;
    campaignState.currentLocationId   = isAlreadyCurrent ? null : journalId;
    campaignState.currentLocationType = isAlreadyCurrent ? null : type;
    await game.settings.set(MODULE_ID, 'campaignState', campaignState);
    this.render();
  }

  // -----------------------------------------------------------------------
  // Top-tab switcher + dismissed-entities undo
  // -----------------------------------------------------------------------

  static async #onSwitchTopTab(event, target) {
    const tab = target?.dataset?.tab;
    if (!tab) return;
    this.#activeTopTab = tab;
    this.#selectedId   = null;
    this.render();
  }

  static async #onUndismiss(event, target) {
    const name = target.dataset.name;
    if (!name) return;
    if (!game.user.isGM) {
      ui?.notifications?.warn('Undismissing an entity is GM-only (writes campaign state).');
      return;
    }
    const campaignState = game.settings.get(MODULE_ID, 'campaignState') ?? {};
    const list = (campaignState.dismissedEntities ?? []).filter(n => n !== name);
    campaignState.dismissedEntities = list;
    await game.settings.set(MODULE_ID, 'campaignState', campaignState);
    this.render();
  }

  // -----------------------------------------------------------------------
  // Foundry hooks
  // -----------------------------------------------------------------------

  static registerHooks() {
    Hooks.on('updateJournalEntry', (doc, change) => {
      const instance = EntityPanelApp.#instance;
      if (!instance?.rendered) return;
      if (!foundry.utils.hasProperty(change, `flags.${MODULE_ID}`)) return;
      instance.render();
    });

    Hooks.on('createJournalEntry', () => {
      const instance = EntityPanelApp.#instance;
      if (instance?.rendered) instance.render();
    });

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

export function openEntityPanel(journalId = null) {
  const app = EntityPanelApp.open();
  if (journalId) {
    app._EntityPanelApp__selectedId = journalId;
    app.render();
  }
  return app;
}

export function registerEntityPanelHooks() {
  EntityPanelApp.registerHooks();
}


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Read the entity record on a journal's first page, apply a transformation
 * to its generativeTier array, and persist the result via page.setFlag.
 * Returns the resulting tier (or null if the page/record could not be
 * resolved). Used by Pin / Remove handlers.
 */
async function mutateGenerativeTier(journalId, transform) {
  try {
    const journal = game.journal?.get(journalId);
    const page    = journal?.pages?.contents?.[0];
    if (!page) return null;
    const entityType = Object.keys(ENTITY_TYPES).find(k => page.flags?.[MODULE_ID]?.[k]);
    if (!entityType) return null;

    const data = { ...(page.flags[MODULE_ID][entityType] ?? {}) };
    const tier = Array.isArray(data.generativeTier) ? data.generativeTier : [];
    const next = transform(tier) ?? tier;
    await page.setFlag(MODULE_ID, entityType, {
      ...data,
      generativeTier: next,
      updatedAt:      new Date().toISOString(),
    });
    return next;
  } catch (err) {
    console.error(`${MODULE_ID} | mutateGenerativeTier failed:`, err);
    return null;
  }
}
