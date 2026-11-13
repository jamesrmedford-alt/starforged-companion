// src/world/worldJournalPanel.js
// ApplicationV2 compact action surface for the World Journal.
//
// Players read full WJ content via the native Foundry journal viewer. This
// panel only exposes actions that change narrator state:
//   1. Pending Lore       — Confirm / Dismiss narrator-asserted entries
//   2. Contradictions     — Review / Override / Dismiss flagged lore; a
//                           fact-continuity catch gets Correct… / Dismiss
//   3. Active Threats     — change severity inline
//   4. Secrets            — the narrative skeleton's hidden plans (issue
//                           #353): each collapsed until clicked (in solo play
//                           the GM is also the player); Open, Edit, Reveal
//                           now, Retire
//   5. Journal Links      — open the underlying JournalEntries

import { decodeHtmlEntities } from '../system/htmlEntities.js';
import {
  JOURNAL_NAMES,
  FLAG_KEYS,
  THREAT_SEVERITIES,
  getNarratorAssertedLore,
  getActiveThreats,
  promoteLoreToConfirmed,
  updateThreatSeverity,
  findDuplicateThreats,
  mergeDuplicateThreats,
  writeEntryPage,
  findWorldJournal,
  findEntryPage,
} from './worldJournal.js';
import { openCorrectionDialog } from '../factContinuity/correctionDialog.js';
import { listSkeletons, getSkeleton, editSkeleton, revealSkeletonNow, retireSkeleton, skeletonsEnabled } from './secrets.js';
import { SKELETON_KIND_LABELS } from './skeletons.js';
import { sameSubject } from '../entities/nameMatch.js';

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
  { key: 'secrets',    label: 'Secrets Journal'  },
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
      openSecret:         WorldJournalPanelApp.#onOpenSecret,
      editSecret:         WorldJournalPanelApp.#onEditSecret,
      revealSecret:       WorldJournalPanelApp.#onRevealSecret,
      retireSecret:       WorldJournalPanelApp.#onRetireSecret,
      mergeThreats:       WorldJournalPanelApp.#onMergeThreats,
    },
  };

  // ── Rendering ───────────────────────────────────────────────────────────────

  async _prepareContext(_options) {
    const campaignState = readCampaignState();
    const isGM = game.user?.isGM ?? false;
    return {
      isGM,
      pendingLore:    getNarratorAssertedLore(campaignState),
      contradictions: readContradictions(),
      threats:        getActiveThreats(campaignState),
      // GM-only: the threats recorded more than once, for the Merge button (issue #354 P2-15).
      duplicateThreats: isGM ? findDuplicateThreats() : [],
      // GM-only: the panel is, and the plans are (issue #353).
      secrets:        isGM ? listSkeletons() : [],
      secretsOn:      skeletonsEnabled(),
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
    // By the entry its flag names, whatever the GM titled the page (WJ-PAGE-BY-TITLE).
    const page  = title ? findEntryPage(journal, title) : null;
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

  /** Fold the threats recorded more than once into one entry each — asked first (issue #354 P2-15). */
  static async #onMergeThreats(_event, _target) {
    if (!game.user?.isGM) return;
    const groups = findDuplicateThreats();
    if (!groups.length) return;
    const list = groups.map(g =>
      `<li><strong>${escapeHtml(g.keep)}</strong> takes in ${g.merge.map(n => `“${escapeHtml(n)}”`).join(', ')}</li>`).join('');
    const ok = await foundry.applications.api.DialogV2.confirm({
      window:  { title: 'Merge duplicate threats' },
      content: `<p>Each of these threats is recorded on more than one page:</p><ul>${list}</ul>` +
        `<p>The first keeps the history of the others and the latest severity and summary. The others are closed as resolved — their pages stay in the Threats journal.</p>`,
      rejectClose: false,
    }).catch(() => false);
    if (!ok) return;
    try {
      const done = await mergeDuplicateThreats(readCampaignState());
      ui?.notifications?.info?.(`Starforged Companion: merged ${done.merged} duplicate threat page${done.merged === 1 ? '' : 's'} into ${done.kept}.`);
    } catch (err) {
      console.error(`${MODULE_ID} | worldJournalPanel: merging duplicate threats failed:`, err);
      ui?.notifications?.warn?.('Starforged Companion: the duplicate threats were not merged — see the console.');
    }
    await this.render({ force: true });
  }

  // ── Secrets (issue #353) ────────────────────────────────────────────────────

  static async #onOpenSecret(_event, target) {
    const id = target?.dataset?.id;
    if (!id || !game.user?.isGM) return;
    const journal = findWorldJournal('secrets');
    const page = (journal?.pages?.contents ?? []).find(p => p?.flags?.[MODULE_ID]?.[FLAG_KEYS.secrets]?.id === id);
    if (!journal || !page) {
      ui?.notifications?.warn('Starforged Companion: that plan is no longer in the Secrets journal.');
      return;
    }
    journal.sheet?.render(true, { pageId: page.id });
  }

  static async #onEditSecret(_event, target) {
    const id = target?.dataset?.id;
    if (!id || !game.user?.isGM) return;
    const record = getSkeleton(id);
    if (!record) return;
    const fields = await promptSecretEdit(record);
    if (!fields) return;
    const saved = await editSkeleton(id, fields).catch(err => {
      console.error(`${MODULE_ID} | worldJournalPanel: editing the plan failed:`, err);
      return null;
    });
    if (!saved) ui?.notifications?.warn('Starforged Companion: the plan was not saved — see the console.');
    await this.render({ force: true });
  }

  static async #onRevealSecret(_event, target) {
    const id = target?.dataset?.id;
    if (!id || !game.user?.isGM) return;
    const record = getSkeleton(id);
    if (!record?.truth) {
      ui?.notifications?.warn('Starforged Companion: nothing is decided about this yet — there is nothing to reveal.');
      return;
    }
    const ok = await foundry.applications.api.DialogV2.confirm({
      window:  { title: 'Reveal now' },
      content: `<p>Tell the table what is true about <strong>${escapeHtml(secretTitle(record))}</strong>? It is posted to chat with the oracle rolls behind it, and becomes established lore.</p>`,
      rejectClose: false,
    }).catch(() => false);
    if (!ok) return;
    const revealed = await revealSkeletonNow(id).catch(err => {
      console.error(`${MODULE_ID} | worldJournalPanel: revealing the plan failed:`, err);
      return null;
    });
    if (!revealed) ui?.notifications?.warn('Starforged Companion: the plan was not revealed — see the console.');
    await this.render({ force: true });
  }

  static async #onRetireSecret(_event, target) {
    const id = target?.dataset?.id;
    if (!id || !game.user?.isGM) return;
    const retired = await retireSkeleton(id).catch(err => {
      console.error(`${MODULE_ID} | worldJournalPanel: retiring the plan failed:`, err);
      return null;
    });
    if (!retired) ui?.notifications?.warn('Starforged Companion: the plan was not retired — see the console.');
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
    // A threat a hidden plan is about carries the GM's marker (issue #353 Phase 4).
    buildThreatsSection(ctx.threats, ctx.isGM ? (ctx.secrets ?? []).map(r => r.subject?.name).filter(Boolean) : [],
      ctx.isGM ? (ctx.duplicateThreats ?? []) : []),
    ctx.isGM ? buildSecretsSection(ctx.secrets ?? [], ctx.secretsOn !== false) : '',
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
  ${c.evidence ? `<div class="sf-wj-entry-text"><em>The narration said:</em> “${escapeHtml(c.evidence)}”</div>` : ''}
  <div class="sf-wj-action-row">${actions(c)}
    <button type="button" class="sf-wj-dismiss-btn"
            data-action="dismissContradiction" data-message-id="${escapeHtml(c.messageId)}"
            title="Clear the contradiction flag">Dismiss</button>
  </div>
</div>`.trim()).join('');
  return `${heading}<div class="sf-wj-entry-list">${rows}</div>`;
}

function buildThreatsSection(threats, plannedNames = [], duplicates = []) {
  const heading = '<h3 class="sf-wj-section-heading">Active Threats</h3>';
  if (!threats.length) {
    return `${heading}<div class="sf-wj-empty-compact">No active threats.</div>`;
  }
  // One threat recorded on several pages (issue #354 P2-15): a GM folds them
  // into one — nothing is merged unasked.
  const extra = duplicates.reduce((n, g) => n + g.merge.length, 0);
  const mergeRow = extra ? `
<div class="sf-wj-action-row">
  <button type="button" data-action="mergeThreats"
          title="Fold each threat recorded more than once into one entry. The other pages are closed as resolved, not deleted.">Merge ${extra} duplicate${extra === 1 ? '' : 's'}</button>
</div>` : '';
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
  <span class="sf-wj-entry-title">${escapeHtml(t.name ?? '')}${plannedNames.some(n => sameSubject(n, t.name)) ? ' <span class="sf-plan-marker" title="The narrator holds a hidden plan for this (GM only)">◆</span>' : ''}</span>
  ${select}
</div>`.trim();
  }).join('');
  return `${heading}<div class="sf-wj-threat-list">${rows}</div>${mergeRow}`;
}

/** A plan's name in the panel: its question for a mystery, else its subject. */
function secretTitle(r) {
  return r?.kind === 'mystery' && r.question ? r.question : (r?.subject?.name ?? '');
}

/**
 * The Secrets section (issue #353): each active plan collapsed to its kind and
 * name until clicked — in solo play the GM is the only player, and seeing a
 * plan spoils it — with Open, Edit, Reveal now and Retire.
 */
function buildSecretsSection(secrets, enabled) {
  const heading = '<h3 class="sf-wj-section-heading">Secrets</h3>';
  if (!secrets.length) {
    const why = enabled ? 'No hidden plans yet.' : 'Narrative skeletons are off (Companion Settings → Narrator).';
    return `${heading}<div class="sf-wj-empty-compact">${why}</div>`;
  }
  const field = (label, value) => (value ? `<div class="sf-wj-entry-text"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>` : '');
  const list = (label, items) => (items.length
    ? `<div class="sf-wj-entry-text"><strong>${escapeHtml(label)}:</strong></div><ol class="sf-wj-secret-list">${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ol>` : '');
  const rows = secrets.map(r => {
    const state = !r.truth ? 'undecided' : (r.truthRevealed ? 'revealed' : 'hidden');
    const id = escapeHtml(r.id);
    return `
<details class="sf-wj-entry sf-wj-secret" data-id="${id}">
  <summary class="sf-wj-entry-meta">
    <span class="sf-wj-badge">${escapeHtml((SKELETON_KIND_LABELS[r.kind] ?? 'Plan').toUpperCase())}</span>
    <span class="sf-wj-entry-title">${escapeHtml(secretTitle(r))}</span>
    <span class="sf-wj-entry-session">${state}</span>
  </summary>
  ${r.kind === 'mystery' ? field('About', r.subject?.name) : ''}
  ${field(r.kind === 'mystery' ? 'Answer' : 'Truth', r.truth || 'Not yet decided — the narrator decides it from the oracle rolls.')}
  ${field('Wants', r.wants)}
  ${field('Knows', r.knows)}
  ${list('Escalation', (r.escalation ?? []).map(e => `${e.text}${e.done ? ' (played)' : ''}`))}
  ${list('Clues', (r.clues ?? []).map(c => `${c.text}${c.revealed ? ' (shown)' : ''}`))}
  ${list('Could end', r.resolutions ?? [])}
  ${field('Oracle rolls', (r.oracleSeeds ?? []).join('; '))}
  <div class="sf-wj-action-row">
    <button type="button" data-action="openSecret" data-id="${id}" title="Open its page in the Secrets journal">Open</button>
    <button type="button" data-action="editSecret" data-id="${id}" title="Change what is true about it">Edit</button>
    <button type="button" data-action="revealSecret" data-id="${id}" ${r.truth ? '' : 'disabled'}
            title="Tell the table what is true about it (posted to chat; becomes lore)">Reveal now</button>
    <button type="button" class="sf-wj-dismiss-btn" data-action="retireSecret" data-id="${id}"
            title="Take it out of play — the narrator no longer sees it">Retire</button>
  </div>
</details>`.trim();
  }).join('');
  return `${heading}<div class="sf-wj-entry-list">${rows}</div>`;
}

/**
 * The GM's edit of a plan: one field each, lists one item per line. Resolves
 * the fields, or null when cancelled or closed (DialogV2.prompt settles on
 * close — rules/foundry-api.md).
 *
 * @param {Object} r — the plan
 * @returns {Promise<Object|null>}
 */
async function promptSecretEdit(r) {
  const area = (name, label, value, rows = 2) =>
    `<label><span>${escapeHtml(label)}</span><textarea name="${name}" rows="${rows}">${escapeHtml(value)}</textarea></label>`;
  const lines = (items) => items.join('\n');
  const content = `<form class="sf-secret-edit">
    <label><span>Name in the story</span><input type="text" name="subject" maxlength="120" value="${escapeHtml(r.subject?.name ?? '')}"></label>
    ${area('truth', r.kind === 'mystery' ? 'Answer' : 'Truth', r.truth, 3)}
    ${area('wants', 'Wants', r.wants)}
    ${area('knows', 'Knows', r.knows)}
    ${area('escalation', 'Escalation (one step per line, in order)', lines((r.escalation ?? []).map(e => e.text)), 3)}
    ${area('clues', 'Clues (one per line)', lines((r.clues ?? []).map(c => c.text)), 3)}
    ${area('resolutions', 'Could end (one per line)', lines(r.resolutions ?? []), 2)}
  </form>`;
  const split = (v) => String(v ?? '').split('\n').map(t => t.trim()).filter(Boolean);
  const result = await foundry.applications.api.DialogV2.prompt({
    window:  { title: `Edit plan — ${secretTitle(r)}` },
    content,
    ok: {
      label: 'Save',
      callback: (_event, button) => {
        const form = button.form;
        const val = (n) => form?.querySelector(`[name="${n}"]`)?.value ?? '';
        return {
          subject: val('subject'), truth: val('truth'), wants: val('wants'), knows: val('knows'),
          escalation: split(val('escalation')), clues: split(val('clues')), resolutions: split(val('resolutions')),
        };
      },
    },
    rejectClose: false,
  }).catch(() => null);
  return result && typeof result === 'object' ? result : null;
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
  // What a fact-continuity catch recorded on its card (issue #354 P2-19):
  // the fact as the ledger holds it and the narration's conflicting words.
  const said = msg.flags?.[MODULE_ID]?.contradiction ?? null;
  return {
    messageId: msg.id,
    name:      said?.subject || (nameMatch ? decodeEntities(nameMatch[1]) : ''),
    detail:    said?.recorded ? `Recorded: ${said.recorded}` : (detailMatch ? decodeEntities(detailMatch[1]) : ''),
    evidence:  typeof said?.evidence === 'string' ? said.evidence : '',
    // A ◈ Narrative Review card from the fact-continuity check (issue #325 W34).
    factContinuity: msg.flags?.[MODULE_ID]?.factContinuityReview === true,
    correctable:    content.includes('data-action="openCorrectionDialog"'),
  };
}

// The shared one-pass decoder (CHARACTER-STATE-ENTITY-UNDECODED).
function decodeEntities(s) {
  return decodeHtmlEntities(s);
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
  const page = findEntryPage(journal, title);   // the renamed page too (WJ-PAGE-BY-TITLE)
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

// The entry pages the panel lists: Lore (its review queue), Threats (each
// active threat's severity) and Secrets (the hidden plans, issue #353).
const PANEL_PAGE_FLAGS = [FLAG_KEYS.lore, FLAG_KEYS.threats, FLAG_KEYS.secrets];

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
