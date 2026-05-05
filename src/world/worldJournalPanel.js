// src/world/worldJournalPanel.js
// ApplicationV2 read-only panel for the World Journal.
// Four tabs: Lore, Threats, Factions, Locations. Each tab lists entries
// from the corresponding journal in chronological order, with severity /
// attitude / status / lock badges as appropriate.
//
// Phase 3: read-only. Promote/Confirm and annotation UI are added in
// Phase 5 once the combined detection pass is wired up.

import {
  JOURNAL_NAMES,
  THREAT_SEVERITIES,
  getConfirmedLore,
  getNarratorAssertedLore,
  getActiveThreats,
  getFactionLandscape,
  listLocationEntries,
  promoteLoreToConfirmed,
  updateThreatSeverity,
} from './worldJournal.js';

const MODULE_ID = 'starforged-companion';

const TAB_DEFINITIONS = [
  { key: 'lore',      label: 'Lore'      },
  { key: 'threats',   label: 'Threats'   },
  { key: 'factions',  label: 'Factions'  },
  { key: 'locations', label: 'Locations' },
];

const SEVERITY_BADGE_CLASSES = {
  immediate: 'sf-wj-severity-immediate',
  active:    'sf-wj-severity-active',
  looming:   'sf-wj-severity-looming',
  resolved:  'sf-wj-severity-resolved',
};

const ATTITUDE_BADGE_CLASSES = {
  hostile: 'sf-wj-attitude-hostile',
  neutral: 'sf-wj-attitude-neutral',
  allied:  'sf-wj-attitude-allied',
  unknown: 'sf-wj-attitude-unknown',
};

const STATUS_BADGE_CLASSES = {
  current:   'sf-wj-status-current',
  departed:  'sf-wj-status-departed',
  destroyed: 'sf-wj-status-destroyed',
  unknown:   'sf-wj-status-unknown',
};

// ─────────────────────────────────────────────────────────────────────────────
// ApplicationV2 panel
// ─────────────────────────────────────────────────────────────────────────────

export class WorldJournalPanelApp extends foundry.applications.api.ApplicationV2 {

  #activeTab = 'lore';

  static DEFAULT_OPTIONS = {
    id:      'sf-world-journal-panel',
    classes: ['starforged-companion', 'sf-world-journal'],
    tag:     'div',
    window: {
      title:       'World Journal',
      resizable:   true,
      minimizable: true,
    },
    position: { width: 640, height: 720 },
    actions: {
      switchTab:       WorldJournalPanelApp.#onSwitchTab,
      openSessionLog:  WorldJournalPanelApp.#onOpenSessionLog,
      confirmLore:     WorldJournalPanelApp.#onConfirmLore,
      changeSeverity:  WorldJournalPanelApp.#onChangeSeverity,
      openEntity:      WorldJournalPanelApp.#onOpenEntity,
    },
  };

  // ── Rendering ───────────────────────────────────────────────────────────────

  async _prepareContext(_options) {
    const campaignState = readCampaignState();
    return {
      isGM:       game.user?.isGM ?? false,
      activeTab:  this.#activeTab,
      tabs:       TAB_DEFINITIONS.map(t => ({ ...t, active: t.key === this.#activeTab })),
      sections: {
        lore: {
          confirmed: getConfirmedLore(campaignState),
          asserted:  getNarratorAssertedLore(campaignState),
        },
        threats:   getActiveThreats(campaignState),
        factions:  getFactionLandscape(campaignState),
        locations: listLocationEntries(campaignState),
      },
    };
  }

  async _renderHTML(context, _options) {
    const tmp = document.createElement('div');
    tmp.innerHTML = buildPanelHTML(context).trim();
    return tmp.firstElementChild;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = '';
    content.append(result);
    // ApplicationV2 actions fire on click; wire <select> changes manually.
    content.querySelectorAll('.sf-wj-severity-select').forEach(sel => {
      sel.addEventListener('change', (e) =>
        WorldJournalPanelApp.#onChangeSeverity.call(this, e, e.currentTarget),
      );
    });
  }

  // ── Action handlers ─────────────────────────────────────────────────────────

  static async #onSwitchTab(event, target) {
    const tab = target?.dataset?.tab;
    if (!tab) return;
    this.#activeTab = tab;
    await this.render({ force: true });
  }

  static async #onConfirmLore(_event, target) {
    const title = target?.dataset?.title;
    if (!title) return;
    if (!game.user.isGM) {
      ui?.notifications?.warn('Confirming lore is GM-only (writes campaign state).');
      return;
    }
    const campaignState = readCampaignState();
    try {
      const result = await promoteLoreToConfirmed(title, campaignState);
      if (result) {
        ui?.notifications?.info?.(`Lore confirmed: ${title}.`);
      } else {
        ui?.notifications?.warn?.(`Could not confirm "${title}" — see console.`);
      }
    } catch (err) {
      console.error(`${MODULE_ID} | worldJournalPanel: confirmLore failed:`, err);
    }
    await this.render({ force: true });
  }

  static async #onChangeSeverity(event, target) {
    const name     = target?.dataset?.name;
    const severity = target?.value;
    if (!name || !severity) return;
    if (!game.user.isGM) {
      ui?.notifications?.warn('Updating threat severity is GM-only.');
      return;
    }
    const campaignState = readCampaignState();
    try {
      await updateThreatSeverity(name, severity, campaignState);
    } catch (err) {
      console.error(`${MODULE_ID} | worldJournalPanel: changeSeverity failed:`, err);
    }
    await this.render({ force: true });
  }

  static async #onOpenEntity(_event, target) {
    const journalId = target?.dataset?.journalId;
    if (!journalId) return;
    const entry = game.journal?.get?.(journalId);
    if (!entry) {
      ui?.notifications?.warn('Linked entity record not found.');
      return;
    }
    entry.sheet?.render?.(true);
  }

  static async #onOpenSessionLog() {
    const journal = game.journal?.getName?.(JOURNAL_NAMES.sessionLog);
    if (!journal) {
      ui.notifications?.warn('Session Log journal has not been created yet.');
      return;
    }
    journal.sheet?.render(true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML builder
// ─────────────────────────────────────────────────────────────────────────────

function buildPanelHTML(ctx) {
  const tabsHtml = ctx.tabs.map(t =>
    `<button type="button" class="sf-wj-tab${t.active ? ' sf-wj-tab-active' : ''}"
             data-action="switchTab" data-tab="${escapeHtml(t.key)}">${escapeHtml(t.label)}</button>`
  ).join('');

  let body;
  switch (ctx.activeTab) {
    case 'lore':      body = buildLoreTab(ctx.sections.lore);       break;
    case 'threats':   body = buildThreatsTab(ctx.sections.threats); break;
    case 'factions':  body = buildFactionsTab(ctx.sections.factions); break;
    case 'locations': body = buildLocationsTab(ctx.sections.locations); break;
    default:          body = '<div class="sf-wj-empty">Unknown tab.</div>';
  }

  return `
<div class="sf-wj-panel">
  <header class="sf-wj-header">
    <div class="sf-wj-tabs">${tabsHtml}</div>
  </header>
  <div class="sf-wj-body">${body}</div>
  <footer class="sf-wj-footer">
    <button type="button" class="sf-wj-session-log-btn" data-action="openSessionLog"
            title="Open the Session Log journal">Session Log →</button>
  </footer>
</div>`.trim();
}

function buildLoreTab({ confirmed, asserted }) {
  const sections = [];

  if (confirmed.length) {
    sections.push(`<h3 class="sf-wj-section-heading">Confirmed Lore</h3>`);
    sections.push('<div class="sf-wj-entry-list">');
    for (const e of confirmed) sections.push(buildLoreRow(e, true));
    sections.push('</div>');
  }

  if (asserted.length) {
    sections.push(`<h3 class="sf-wj-section-heading">Narrator-Asserted</h3>`);
    sections.push('<div class="sf-wj-entry-list">');
    for (const e of asserted) sections.push(buildLoreRow(e, false));
    sections.push('</div>');
  }

  if (!confirmed.length && !asserted.length) {
    return '<div class="sf-wj-empty">No lore recorded yet. Use !journal lore "title" confirmed — text.</div>';
  }
  return sections.join('');
}

function buildLoreRow(entry, isConfirmed) {
  const lockBadge = isConfirmed
    ? '<span class="sf-wj-badge sf-wj-lock">🔒 Confirmed</span>'
    : '<span class="sf-wj-badge sf-wj-asserted">Narrator-asserted</span>';
  const session = entry.sessionNumber
    ? `Session ${escapeHtml(String(entry.sessionNumber))}`
    : entry.sessionId ? escapeHtml(entry.sessionId) : '';

  // Confirm button surfaces only on narrator-asserted (soft) entries.
  const confirmBtn = isConfirmed
    ? ''
    : `<button class="sf-wj-confirm-btn"
               data-action="confirmLore"
               data-title="${escapeHtml(entry.title ?? '')}"
               title="Promote to canonical (the narrator may not contradict)">
         Confirm
       </button>`;

  return `
<div class="sf-wj-entry">
  <div class="sf-wj-entry-meta">
    ${lockBadge}
    <span class="sf-wj-entry-session">${session}</span>
    ${confirmBtn}
  </div>
  <div class="sf-wj-entry-title">${escapeHtml(entry.title ?? '')}</div>
  ${entry.text ? `<div class="sf-wj-entry-text">${escapeHtml(entry.text)}</div>` : ''}
</div>`.trim();
}

function buildThreatsTab(threats) {
  if (!threats.length) {
    return '<div class="sf-wj-empty">No active threats. Use !journal threat "name" severity — summary.</div>';
  }
  const rows = threats.map(t => {
    const cls = SEVERITY_BADGE_CLASSES[t.severity] ?? '';
    const severitySelect = `
      <select class="sf-wj-severity-select" data-action="changeSeverity"
              data-name="${escapeHtml(t.name ?? '')}">
        ${THREAT_SEVERITIES.map(s =>
          `<option value="${s}"${s === t.severity ? ' selected' : ''}>${s}</option>`,
        ).join('')}
      </select>`;

    const history = Array.isArray(t.history) ? t.history : [];
    const historyHtml = history.length
      ? `<details class="sf-wj-history">
           <summary>History (${history.length})</summary>
           <ul class="sf-wj-history-list">
             ${history.map(h => `
               <li class="sf-wj-history-item">
                 <span class="sf-wj-history-severity">${escapeHtml(h.severity ?? '')}</span>
                 <span class="sf-wj-history-session">${escapeHtml(h.sessionId ?? '')}</span>
                 ${h.summary ? `<span class="sf-wj-history-summary">${escapeHtml(h.summary)}</span>` : ''}
               </li>`).join('')}
           </ul>
         </details>`
      : '';

    return `
<div class="sf-wj-entry">
  <div class="sf-wj-entry-meta">
    <span class="sf-wj-badge ${cls}">${escapeHtml((t.severity ?? '').toUpperCase())}</span>
    <span class="sf-wj-entry-session">${escapeHtml(t.lastUpdated ?? '')}</span>
    ${severitySelect}
  </div>
  <div class="sf-wj-entry-title">${escapeHtml(t.name ?? '')}</div>
  ${t.summary ? `<div class="sf-wj-entry-text">${escapeHtml(t.summary)}</div>` : ''}
  ${historyHtml}
</div>`.trim();
  }).join('');
  return `<div class="sf-wj-entry-list">${rows}</div>`;
}

function buildFactionsTab(factions) {
  if (!factions.length) {
    return '<div class="sf-wj-empty">No faction intelligence. Use !journal faction "name" attitude — summary.</div>';
  }
  const rows = factions.map(f => {
    const cls    = ATTITUDE_BADGE_CLASSES[f.attitude] ?? '';
    const link   = f.entityId
      ? `<button class="sf-wj-entity-link-btn" data-action="openEntity"
                data-journal-id="${escapeHtml(f.entityId)}"
                title="Open the linked entity record">
           ↗ Entity record
         </button>`
      : '';
    const lastEnc = f.encounters?.[f.encounters.length - 1];
    return `
<div class="sf-wj-entry">
  <div class="sf-wj-entry-meta">
    <span class="sf-wj-badge ${cls}">${escapeHtml((f.attitude ?? 'unknown').toUpperCase())}</span>
    <span class="sf-wj-entry-session">${escapeHtml(f.updatedAt?.slice(0, 10) ?? '')}</span>
    ${link}
  </div>
  <div class="sf-wj-entry-title">${escapeHtml(f.factionName ?? '')}</div>
  ${f.knownGoal ? `<div class="sf-wj-entry-text">Goal: ${escapeHtml(f.knownGoal)}</div>` : ''}
  ${lastEnc?.summary ? `<div class="sf-wj-entry-text">Last: ${escapeHtml(lastEnc.summary)}</div>` : ''}
</div>`.trim();
  }).join('');
  return `<div class="sf-wj-entry-list">${rows}</div>`;
}

function buildLocationsTab(locations) {
  if (!locations.length) {
    return '<div class="sf-wj-empty">No location intelligence. Use !journal location "name" type — description.</div>';
  }
  const rows = locations.map(l => {
    const cls    = STATUS_BADGE_CLASSES[l.status] ?? '';
    const link   = l.entityId
      ? `<button class="sf-wj-entity-link-btn" data-action="openEntity"
                data-journal-id="${escapeHtml(l.entityId)}"
                title="Open the linked entity record">
           ↗ Entity record
         </button>`
      : '';
    return `
<div class="sf-wj-entry">
  <div class="sf-wj-entry-meta">
    <span class="sf-wj-badge ${cls}">${escapeHtml((l.status ?? 'unknown').toUpperCase())}</span>
    <span class="sf-wj-entry-session">${escapeHtml(l.lastVisited ?? '')}</span>
    ${link}
  </div>
  <div class="sf-wj-entry-title">${escapeHtml(l.locationName ?? '')}</div>
  ${l.type ? `<div class="sf-wj-entry-text">Type: ${escapeHtml(l.type)}</div>` : ''}
  ${l.description ? `<div class="sf-wj-entry-text">${escapeHtml(l.description)}</div>` : ''}
</div>`.trim();
  }).join('');
  return `<div class="sf-wj-entry-list">${rows}</div>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readCampaignState() {
  try {
    return game.settings?.get?.(MODULE_ID, 'campaignState') ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public opener
// ─────────────────────────────────────────────────────────────────────────────

let _wjPanelInstance = null;

export function openWorldJournalPanel() {
  if (!game.user?.isGM) {
    ui?.notifications?.warn('Starforged Companion: World Journal panel is GM-only.');
    return;
  }
  if (_wjPanelInstance?.rendered) {
    _wjPanelInstance.bringToTop?.();
    return;
  }
  _wjPanelInstance = new WorldJournalPanelApp();
  _wjPanelInstance.render({ force: true });
}
