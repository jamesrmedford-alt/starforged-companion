// src/world/worldJournalPanel.js
// ApplicationV2 compact action surface for the World Journal.
//
// Players read full WJ content via the native Foundry journal viewer. This
// panel only exposes actions that change narrator state:
//   1. Pending Lore       — Confirm / Dismiss narrator-asserted entries
//   2. Contradictions     — Review / Override / Dismiss flagged lore; a
//                           fact-continuity catch gets Correct… / Dismiss
//   3. Active Threats     — change severity inline
//   4. Journal Links      — open the underlying JournalEntries

import {
  JOURNAL_NAMES,
  FLAG_KEYS,
  THREAT_SEVERITIES,
  getNarratorAssertedLore,
  getActiveThreats,
  promoteLoreToConfirmed,
  updateThreatSeverity,
  writeEntryPage,
  findWorldJournal,
} from './worldJournal.js';
import { openCorrectionDialog } from '../factContinuity/correctionDialog.js';

const MODULE_ID = 'starforged-companion';

const SEVERITY_BADGE_CLASSES = {
  immediate: 'sf-wj-severity-immediate',
  active:    'sf-wj-severity-active',
  looming:   'sf-wj-severity-looming',
  resolved:  'sf-wj-severity-resolved',
};

const JOURNAL_LINKS = [
  { key: 'lore',       label: 'Lore Journal'     },
  { key: 'threats',    label: 'Threats Journal'  },
  { key: 'factions',   label: 'Factions Journal' },
  { key: 'sessionLog', label: 'Session Log'      },
];

// ─────────────────────────────────────────────────────────────────────────────
// ApplicationV2 panel
// ─────────────────────────────────────────────────────────────────────────────

export class WorldJournalPanelApp extends foundry.applications.api.ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id:      'sf-world-journal-panel',
    classes: ['starforged-companion', 'sf-world-journal', 'sf-window'],
    tag:     'div',
    window: {
      title:       'World Journal',
      resizable:   true,
      minimizable: true,
    },
    position: { width: 320, height: 400 },
    actions: {
      confirmLore:        WorldJournalPanelApp.#onConfirmLore,
      dismissAssertion:   WorldJournalPanelApp.#onDismissAssertion,
      reviewContradiction: WorldJournalPanelApp.#onReviewContradiction,
      overrideContradiction: WorldJournalPanelApp.#onOverrideContradiction,
      correctContradiction: WorldJournalPanelApp.#onCorrectContradiction,
      dismissContradiction: WorldJournalPanelApp.#onDismissContradiction,
      openJournal:        WorldJournalPanelApp.#onOpenJournal,
    },
  };

  // ── Rendering ───────────────────────────────────────────────────────────────

  async _prepareContext(_options) {
    const campaignState = readCampaignState();
    return {
      isGM:           game.user?.isGM ?? false,
      pendingLore:    getNarratorAssertedLore(campaignState),
      contradictions: readContradictions(),
      threats:        getActiveThreats(campaignState),
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

  static async #onDismissAssertion(_event, target) {
    const title = target?.dataset?.title;
    if (!title) return;
    if (!game.user.isGM) {
      ui?.notifications?.warn('Dismissing an assertion is GM-only.');
      return;
    }
    try {
      await clearNarratorAssertion(title);
    } catch (err) {
      console.error(`${MODULE_ID} | worldJournalPanel: dismissAssertion failed:`, err);
    }
    await this.render({ force: true });
  }

  static async #onReviewContradiction(_event, target) {
    const messageId = target?.dataset?.messageId;
    // By its category, whatever the GM named it (issue #345 AA63).
    const journal   = findWorldJournal('lore');
    if (!journal) {
      ui?.notifications?.warn('Lore journal has not been created yet.');
      return;
    }
    const title = readContradictionMessage(messageId)?.name;
    const page  = title
      ? journal.pages?.contents?.find(p => p.name === title)
      : null;
    journal.sheet?.render(true, page ? { pageId: page.id } : undefined);
  }

  static async #onOverrideContradiction(_event, target) {
    const messageId = target?.dataset?.messageId;
    if (!game.user.isGM) {
      ui?.notifications?.warn('Override is GM-only.');
      return;
    }
    const meta = readContradictionMessage(messageId);
    if (!meta) return;
    // A fact-continuity catch (◈ Narrative Review) is about a binding scene
    // fact, not a lore page: promoting "lore" by the subject's name changed
    // nothing, and deleting the card took its Retract button with it while
    // the check's per-scene dedup never posted the catch again (issue #325
    // W34). Its remedy is the correction dialog (Correct…).
    if (meta.factContinuity) {
      ui?.notifications?.warn('This is a fact-continuity catch, not lore — use Correct… to strike or replace the fact.');
      return;
    }
    try {
      if (meta.name) await promoteLoreToConfirmed(meta.name, readCampaignState());
      await deleteChatMessage(messageId);
    } catch (err) {
      console.error(`${MODULE_ID} | worldJournalPanel: overrideContradiction failed:`, err);
    }
    await this.render({ force: true });
  }

  /** A fact-continuity catch's remedy: the card's correction dialog (the card stays). */
  static async #onCorrectContradiction(_event, target) {
    const messageId = target?.dataset?.messageId;
    const message = messageId ? globalThis.game?.messages?.get?.(messageId) : null;
    if (!message?.flags?.[MODULE_ID]?.factContinuityReview) return;
    try {
      await openCorrectionDialog(message);
    } catch (err) {
      console.error(`${MODULE_ID} | worldJournalPanel: correctContradiction failed:`, err);
    }
  }

  static async #onDismissContradiction(_event, target) {
    const messageId = target?.dataset?.messageId;
    if (!game.user.isGM) {
      ui?.notifications?.warn('Dismiss is GM-only.');
      return;
    }
    try {
      await deleteChatMessage(messageId);
    } catch (err) {
      console.error(`${MODULE_ID} | worldJournalPanel: dismissContradiction failed:`, err);
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

  static async #onOpenJournal(_event, target) {
    const key  = target?.dataset?.journalKey;
    const name = JOURNAL_NAMES[key];
    if (!name) return;
    const journal = findWorldJournal(key);
    if (!journal) {
      ui?.notifications?.warn(`${name} has not been created yet.`);
      return;
    }
    journal.sheet?.render(true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML builder
// ─────────────────────────────────────────────────────────────────────────────

function buildPanelHTML(ctx) {
  const sections = [
    buildPendingLoreSection(ctx.pendingLore),
    buildContradictionsSection(ctx.contradictions),
    buildThreatsSection(ctx.threats),
  ].join('');

  const links = JOURNAL_LINKS.map(l =>
    `<button type="button" class="sf-wj-link-btn"
             data-action="openJournal" data-journal-key="${escapeHtml(l.key)}">
       ${escapeHtml(l.label)} ↗
     </button>`,
  ).join('');

  return `
<div class="sf-wj-panel sf-wj-compact">
  <div class="sf-wj-body">${sections}</div>
  <footer class="sf-wj-footer sf-wj-link-grid">${links}</footer>
</div>`.trim();
}

function buildPendingLoreSection(entries) {
  const heading = '<h3 class="sf-wj-section-heading">Pending Lore</h3>';
  if (!entries.length) {
    return `${heading}<div class="sf-wj-empty-compact">No entries awaiting review.</div>`;
  }
  const rows = entries.map(e => {
    const session = e.sessionNumber
      ? `Session ${escapeHtml(String(e.sessionNumber))}`
      : escapeHtml(e.sessionId ?? '');
    const preview = (e.text ?? '').slice(0, 140);
    return `
<div class="sf-wj-entry">
  <div class="sf-wj-entry-meta">
    <span class="sf-wj-entry-title">${escapeHtml(e.title ?? '')}</span>
    <span class="sf-wj-entry-session">${session}</span>
  </div>
  ${preview ? `<div class="sf-wj-entry-text">${escapeHtml(preview)}${e.text?.length > 140 ? '…' : ''}</div>` : ''}
  <div class="sf-wj-action-row">
    <button type="button" class="sf-wj-confirm-btn"
            data-action="confirmLore" data-title="${escapeHtml(e.title ?? '')}"
            title="Promote to canonical lore">Confirm</button>
    <button type="button" class="sf-wj-dismiss-btn"
            data-action="dismissAssertion" data-title="${escapeHtml(e.title ?? '')}"
            title="Clear the narrator-asserted flag (entry stays in journal)">Dismiss</button>
  </div>
</div>`.trim();
  }).join('');
  return `${heading}<div class="sf-wj-entry-list">${rows}</div>`;
}

function buildContradictionsSection(items) {
  if (!items.length) return '';
  const heading = '<h3 class="sf-wj-section-heading">Contradictions</h3>';
  // A fact-continuity catch takes its own remedy, never the lore actions
  // (issue #325 W34): Correct… opens its correction dialog when the card
  // offers one (a frame / ship / identity catch names its remedy on the card).
  const actions = (c) => c.factContinuity
    ? (c.correctable ? `
    <button type="button" class="sf-wj-correct-btn"
            data-action="correctContradiction" data-message-id="${escapeHtml(c.messageId)}"
            title="Strike or replace the contradicted fact">Correct…</button>` : '')
    : `
    <button type="button" class="sf-wj-review-btn"
            data-action="reviewContradiction" data-message-id="${escapeHtml(c.messageId)}"
            title="Open the lore journal">Review</button>
    <button type="button" class="sf-wj-override-btn"
            data-action="overrideContradiction" data-message-id="${escapeHtml(c.messageId)}"
            title="Mark the new narration as correct (promotes lore)">Override</button>`;
  const rows = items.map(c => `
<div class="sf-wj-entry sf-wj-contradiction-entry">
  <div class="sf-wj-entry-title">${escapeHtml(c.name ?? '(unknown)')}</div>
  ${c.detail ? `<div class="sf-wj-entry-text">${escapeHtml(c.detail)}</div>` : ''}
  <div class="sf-wj-action-row">${actions(c)}
    <button type="button" class="sf-wj-dismiss-btn"
            data-action="dismissContradiction" data-message-id="${escapeHtml(c.messageId)}"
            title="Clear the contradiction flag">Dismiss</button>
  </div>
</div>`.trim()).join('');
  return `${heading}<div class="sf-wj-entry-list">${rows}</div>`;
}

function buildThreatsSection(threats) {
  const heading = '<h3 class="sf-wj-section-heading">Active Threats</h3>';
  if (!threats.length) {
    return `${heading}<div class="sf-wj-empty-compact">No active threats.</div>`;
  }
  const rows = threats.map(t => {
    const cls = SEVERITY_BADGE_CLASSES[t.severity] ?? '';
    const select = `
      <select class="sf-wj-severity-select" data-name="${escapeHtml(t.name ?? '')}">
        ${THREAT_SEVERITIES.map(s =>
          `<option value="${s}"${s === t.severity ? ' selected' : ''}>${s}</option>`,
        ).join('')}
      </select>`;
    return `
<div class="sf-wj-threat-row">
  <span class="sf-wj-badge ${cls}">${escapeHtml((t.severity ?? '').toUpperCase())}</span>
  <span class="sf-wj-entry-title">${escapeHtml(t.name ?? '')}</span>
  ${select}
</div>`.trim();
  }).join('');
  return `${heading}<div class="sf-wj-threat-list">${rows}</div>`;
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
// Contradiction sourcing — reads GM-whispered chat cards posted by
// worldJournal.applyStateTransition() when lore is contradicted.
// ─────────────────────────────────────────────────────────────────────────────

function readContradictions() {
  const messages = globalThis.game?.messages?.contents;
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const msg of messages) {
    if (!msg.flags?.[MODULE_ID]?.worldJournalContradiction) continue;
    out.push(parseContradictionMessage(msg));
  }
  return out;
}

function readContradictionMessage(messageId) {
  if (!messageId) return null;
  const msg = globalThis.game?.messages?.get?.(messageId);
  if (!msg?.flags?.[MODULE_ID]?.worldJournalContradiction) return null;
  return parseContradictionMessage(msg);
}

function parseContradictionMessage(msg) {
  const content = msg.content ?? '';
  const nameMatch   = /<strong>([^<]*)<\/strong>/.exec(content);
  const detailMatch = /<strong>[^<]*<\/strong>\s*—\s*([^<]+)<\/p>/.exec(content);
  return {
    messageId: msg.id,
    name:      nameMatch ? decodeEntities(nameMatch[1]) : '',
    detail:    detailMatch ? decodeEntities(detailMatch[1]) : '',
    // A ◈ Narrative Review card from the fact-continuity check (issue #325 W34).
    factContinuity: msg.flags?.[MODULE_ID]?.factContinuityReview === true,
    correctable:    content.includes('data-action="openCorrectionDialog"'),
  };
}

function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

async function deleteChatMessage(messageId) {
  const msg = globalThis.game?.messages?.get?.(messageId);
  if (!msg) return;
  await msg.delete();
}

// ─────────────────────────────────────────────────────────────────────────────
// Lore-assertion dismissal — clears narratorAsserted on the journal page
// without affecting any worldJournal.js function the assembler depends on.
// ─────────────────────────────────────────────────────────────────────────────

async function clearNarratorAssertion(title) {
  const journal = findWorldJournal('lore');
  if (!journal) return null;
  const page = journal.pages?.contents?.find(p => p.name === title);
  if (!page) return null;
  const existing = page.flags?.[MODULE_ID]?.[FLAG_KEYS.lore];
  if (!existing) return null;
  const updated = {
    ...existing,
    narratorAsserted: false,
    updatedAt:        new Date().toISOString(),
  };
  // The flag and the page body players read, together (issue #331 X30).
  await writeEntryPage(page, FLAG_KEYS.lore, updated);
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh — the open panel shows what another client's write changed
// ─────────────────────────────────────────────────────────────────────────────

// The entry pages the panel lists: Lore (its review queue) and Threats (each
// active threat's severity).
const PANEL_PAGE_FLAGS = [FLAG_KEYS.lore, FLAG_KEYS.threats];

function isPanelPage(page, change = null) {
  const own = page?.flags?.[MODULE_ID];
  if (own && PANEL_PAGE_FLAGS.some(key => own[key])) return true;
  return !!change && PANEL_PAGE_FLAGS.some(key => foundry.utils.hasProperty(change, `flags.${MODULE_ID}.${key}`));
}

function isContradictionCard(message) {
  return message?.flags?.[MODULE_ID]?.worldJournalContradiction === true;
}

function refreshOpenPanel() {
  if (_wjPanelInstance?.rendered) _wjPanelInstance.render();
}

/** createJournalEntryPage / deleteJournalEntryPage: a Lore or Threats entry came or went. */
function onPanelPageWritten(page) {
  if (isPanelPage(page)) refreshOpenPanel();
}

/** updateJournalEntryPage: a Lore or Threats entry changed (a threat's severity). */
function onPanelPageUpdated(page, change) {
  if (isPanelPage(page, change)) refreshOpenPanel();
}

/** create / update / deleteChatMessage: a contradiction card posted, changed or dismissed. */
function onContradictionCardWritten(message) {
  if (isContradictionCard(message)) refreshOpenPanel();
}

/**
 * Re-render the open panel when what it lists changes on any client: a Lore
 * or Threats entry page created, changed or deleted (a threat a narration
 * escalated, a new threat), or a contradiction card posted, changed or
 * deleted (another GM's Dismiss). The panel registered no hook, so an open
 * one never showed a new contradiction card or a severity change (issue #345
 * AA66) — every sibling panel re-renders on another client's write (issue
 * #322 V12). Local only: it writes nothing. Registered once, when the panel
 * is first opened (it is GM-only, and nothing to refresh before then).
 */
function registerPanelRefreshHooks() {
  if (registerPanelRefreshHooks.installed) return;
  registerPanelRefreshHooks.installed = true;
  Hooks.on('createJournalEntryPage', onPanelPageWritten);
  Hooks.on('deleteJournalEntryPage', onPanelPageWritten);
  Hooks.on('updateJournalEntryPage', onPanelPageUpdated);
  Hooks.on('createChatMessage', onContradictionCardWritten);
  Hooks.on('updateChatMessage', onContradictionCardWritten);
  Hooks.on('deleteChatMessage', onContradictionCardWritten);
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
  registerPanelRefreshHooks();
  // Pressed again while open, it shows what changed meanwhile — it only
  // brought the panel to the front (issue #345 AA66).
  if (_wjPanelInstance?.rendered) {
    _wjPanelInstance.render({ force: true });
    _wjPanelInstance.bringToFront?.();
    return;
  }
  _wjPanelInstance = new WorldJournalPanelApp();
  _wjPanelInstance.render({ force: true });
}
