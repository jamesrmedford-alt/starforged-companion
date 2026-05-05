// src/world/clarificationDialog.js
// Blocking ApplicationV2 dialog posted when the relevance resolver detects
// a hybrid move with an implicit reference (pronoun / role / possessive).
// Lets the player select which known entity they meant — or declare a
// new entity — before the narrator is called. Pattern mirrors the existing
// MoveConfirmDialog (settingsPanel.js) and resolves a Promise on close.
//
// Per narrator-entity-discovery scope §6 the options are:
//   - Each connection entity in the campaign
//   - "Someone new"        → resolves as discovery
//   - "No specific entity" → resolves as embellishment

import { listConnections } from '../entities/connection.js';
import { getSettlement }   from '../entities/settlement.js';
import { getLocation }     from '../entities/location.js';
import { getPlanet }       from '../entities/planet.js';

const MODULE_ID = 'starforged-companion';

const ApplicationV2 = foundry?.applications?.api?.ApplicationV2 ?? class {};

/**
 * @typedef {Object} ClarificationSelection
 * @property {"entity"|"new"|"none"} kind
 * @property {string|null}           entityId
 * @property {string|null}           entityType
 * @property {string|null}           entityName
 */

export class ClarificationDialog extends ApplicationV2 {

  #resolve = null;
  #options = [];
  #referenceType = 'none';

  static DEFAULT_OPTIONS = {
    id:      `${MODULE_ID}-clarification`,
    classes: [MODULE_ID, 'sf-clarification-dialog'],
    tag:     'div',
    window: {
      title:       'Who are you interacting with?',
      resizable:   false,
      minimizable: false,
    },
    position: { width: 420, height: 'auto' },
    actions: {
      pick:   ClarificationDialog.#onPick,
      newOne: ClarificationDialog.#onNew,
      none:   ClarificationDialog.#onNone,
    },
  };

  /**
   * Show the dialog. Returns the player's selection.
   * @param {Object} campaignState
   * @param {Object} relevance — RelevanceResult from resolveRelevance
   * @returns {Promise<ClarificationSelection>}
   */
  static async prompt(campaignState, relevance) {
    return new Promise((resolve) => {
      const dialog = new ClarificationDialog();
      dialog.#options = collectOptions(campaignState);
      dialog.#referenceType = relevance?.referenceType ?? 'none';
      dialog.#resolve = resolve;
      dialog.render({ force: true });
    });
  }

  async _prepareContext(_options) {
    return {
      options:       this.#options,
      referenceType: this.#referenceType,
    };
  }

  async _renderHTML(context, _options) {
    const optionRows = context.options.map(o => `
      <button class="sf-clarif-option" data-action="pick"
              data-id="${escapeHtml(o.journalId)}"
              data-type="${escapeHtml(o.type)}"
              data-name="${escapeHtml(o.name)}">
        ${escapeHtml(typeGlyph(o.type))} ${escapeHtml(o.name)}
        ${o.role ? `<span class="sf-clarif-role">— ${escapeHtml(o.role)}</span>` : ''}
      </button>
    `).join('');

    const referenceHint = context.referenceType && context.referenceType !== 'none'
      ? `<p class="sf-clarif-hint">The narrator detected an implicit ${escapeHtml(context.referenceType)} reference.</p>`
      : '';

    const html = `
<div class="sf-clarification">
  ${referenceHint}
  <div class="sf-clarif-options">
    ${optionRows || '<p class="sf-clarif-empty">No known connections in the campaign yet.</p>'}
    <button class="sf-clarif-option sf-clarif-new"  data-action="newOne">Someone new</button>
    <button class="sf-clarif-option sf-clarif-none" data-action="none">No specific entity — continue</button>
  </div>
</div>`.trim();

    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.firstElementChild;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = '';
    content.append(result);
  }

  async close(options) {
    // If the user closes the window without picking, treat it as "no specific
    // entity — continue" so the pipeline isn't stuck.
    if (this.#resolve) {
      const r = this.#resolve;
      this.#resolve = null;
      r({ kind: 'none', entityId: null, entityType: null, entityName: null });
    }
    return super.close?.(options);
  }

  static #onPick(_event, target) {
    const id   = target?.dataset?.id   ?? null;
    const type = target?.dataset?.type ?? null;
    const name = target?.dataset?.name ?? null;
    this.#finish({ kind: 'entity', entityId: id, entityType: type, entityName: name });
  }
  static #onNew(_event, _target) {
    this.#finish({ kind: 'new', entityId: null, entityType: null, entityName: null });
  }
  static #onNone(_event, _target) {
    this.#finish({ kind: 'none', entityId: null, entityType: null, entityName: null });
  }

  #finish(selection) {
    const r = this.#resolve;
    this.#resolve = null;
    this.close({ animate: false }).catch(() => {});
    r?.(selection);
  }
}

/**
 * Apply a clarification selection to a relevance result. Returns a NEW
 * relevance object — does not mutate the original.
 *
 * @param {Object} relevance — original relevance result
 * @param {ClarificationSelection} selection
 * @returns {Object} new relevance result
 */
export function applyClarificationSelection(relevance, selection) {
  if (!selection) return relevance;
  switch (selection.kind) {
    case 'entity': {
      return {
        ...relevance,
        resolvedClass: 'interaction',
        entityIds:     selection.entityId   ? [selection.entityId]   : [],
        entityTypes:   selection.entityType ? [selection.entityType] : [],
        matchedNames:  selection.entityName ? [selection.entityName] : [],
        needsClarification: false,
      };
    }
    case 'new':
      return {
        ...relevance,
        resolvedClass:    'discovery',
        entityIds:        [],
        entityTypes:      [],
        matchedNames:     [],
        needsClarification: false,
      };
    case 'none':
    default:
      return {
        ...relevance,
        resolvedClass:    'embellishment',
        entityIds:        [],
        entityTypes:      [],
        matchedNames:     [],
        needsClarification: false,
      };
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function collectOptions(campaignState) {
  const options = [];
  if (!campaignState) return options;

  // All connections — primary clarification candidates
  for (const conn of (() => { try { return listConnections(campaignState); } catch { return []; } })()) {
    if (!conn?.name || conn.active === false) continue;
    options.push({
      journalId: resolveJournalId(conn._id, campaignState.connectionIds, "connection"),
      type:      'connection',
      name:      conn.name,
      role:      conn.role ?? '',
    });
  }

  // Current location's associated entity, if a settlement/location/planet
  if (campaignState.currentLocationId && campaignState.currentLocationType) {
    const getter = ({
      settlement: getSettlement,
      location:   getLocation,
      planet:     getPlanet,
    })[campaignState.currentLocationType];
    let rec = null;
    if (getter) { try { rec = getter(campaignState.currentLocationId); } catch { rec = null; } }
    if (rec?.name) {
      options.push({
        journalId: campaignState.currentLocationId,
        type:      campaignState.currentLocationType,
        name:      rec.name,
        role:      'current location',
      });
    }
  }

  return options;
}

function resolveJournalId(connectionInternalId, connectionIds, _type) {
  // Connections store their internal _id alongside the JournalEntry id used
  // by campaignState.connectionIds. The cheapest lookup is to scan the
  // journal collection for a flag match — but listConnections only returns
  // the data records. Cross-reference here by walking ids, loading each
  // entry, and matching the _id field.
  if (!Array.isArray(connectionIds)) return null;
  for (const journalId of connectionIds) {
    try {
      const entry = game.journal?.get(journalId);
      const page  = entry?.pages?.contents?.[0];
      const data  = page?.flags?.[MODULE_ID]?.connection;
      if (data?._id === connectionInternalId) return journalId;
    } catch (err) {
      console.warn(`${MODULE_ID} | clarificationDialog: resolveJournalId failed for ${journalId}:`, err);
    }
  }
  return null;
}

function typeGlyph(type) {
  return ({
    connection: '⬡',
    settlement: '⬟',
    location:   '◧',
    planet:     '◉',
  })[type] ?? '◇';
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
