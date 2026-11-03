/**
 * STARFORGED COMPANION
 * src/factContinuity/correctionDialog.js
 *
 * Correction affordance for active-scene fact-continuity ledgers
 * (fact-continuity scope §10). Renders a DialogV2 listing the truths and
 * state values in scope for a given narrator card, with per-row strike /
 * replace controls.
 *
 * Permission asymmetry (scope §10.1): the GM may correct anything; a
 * player may correct anything EXCEPT a truth asserted by the GM.
 *
 * The dialog is the primary affordance. Backing `!truth` / `!state`
 * commands provide keyboard / accessibility parity (see scope §10.3).
 */

import {
  strikeTruth,
  replaceTruth,
  strikeStateValue,
  setStateValue,
  subjectKey,
  subjectFromStateKey,
  sameStateAttribute,
} from './ledgers.js';
import { resolveEntityById } from '../entities/registry.js';
import { propagateRetraction, markSummaryForRegen } from './retractions.js';
import { persistSceneLedgerFields } from './sceneLifecycle.js';

const MODULE_ID = 'starforged-companion';

/**
 * Open the correction dialog for a narrator chat card. Reads the card's
 * `flags[MODULE_ID].matchedEntityIds` to scope the truth/state listing.
 *
 * The dialog is non-blocking and stays open while play goes on, so it holds
 * no campaignState: each render and each row action reads the store as it is
 * then (issue #321 U06e).
 *
 * @param {ChatMessage} message — the narrator card
 * @returns {Promise<void>}
 */
export async function openCorrectionDialog(message) {
  if (!message) return;
  const campaignState = readCampaignState();
  if (!campaignState) return;

  const ctx = {
    isGM:  game.user?.isGM ?? false,
    actor: game.user?.isGM ? 'gm' : 'player',
  };

  const matchedIds   = new Set(message.flags?.[MODULE_ID]?.matchedEntityIds ?? []);
  const currentLocId = campaignState.currentLocationId;
  if (currentLocId) matchedIds.add(currentLocId);
  // A Narrative Review card names the truth it caught (issue #326 W63): it is
  // listed first, marked, whatever its subject's scope.
  const flaggedId = message.flags?.[MODULE_ID]?.contradictedTruthId ?? null;

  const { DialogV2 } = foundry.applications.api;

  // Re-rendered after each correction, from the store as it is then, so the
  // user sees the result of their own action without closing/reopening.
  const rerender = (dlg) => {
    const root = dlg.element;
    if (!root) return;
    const fresh = renderDialogContent(readCampaignState() ?? {}, matchedIds, ctx, flaggedId);
    const body  = root.querySelector('.sf-correct-body');
    if (body) body.innerHTML = fresh;
    attachRowHandlers(root, ctx, () => rerender(dlg));
  };

  const dlg = new DialogV2({
    window:  { title: 'Correct Active Scene Facts' },
    classes: ['sf-correct-dialog', 'sf-window'],
    content: `<div class="sf-correct-body">${renderDialogContent(campaignState, matchedIds, ctx, flaggedId)}</div>`,
    buttons: [
      { action: 'close', label: 'Close', default: true, callback: () => true },
    ],
    rejectClose: false,
  });

  // The row controls are wired from the dialog's "render" event (issue #321
  // U38). `render` is a DialogV2.wait() option — wait() itself attaches it
  // with addEventListener("render") — so on a dialog built with `new` it was
  // an unread option, the Strike / Replace handlers never attached, and the
  // rows' buttons submitted (closed) the dialog.
  dlg.addEventListener('render', () => attachRowHandlers(dlg.element, ctx, () => rerender(dlg)));
  dlg.render({ force: true });
}

/** The stored campaignState (the cached value — read only), or null. */
function readCampaignState() {
  try {
    return game.settings.get(MODULE_ID, 'campaignState') ?? null;
  } catch (err) {
    console.warn(`${MODULE_ID} | correctionDialog: campaignState read failed:`, err?.message ?? err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderDialogContent(campaignState, matchedIds, ctx, flaggedId = null) {
  const truths = (campaignState.sceneTruths ?? []).filter(t =>
    t && !t.retracted && (t.id === flaggedId || isSubjectInDialogScope(t.subject, matchedIds)),
  ).sort((a, b) => (b.id === flaggedId ? 1 : 0) - (a.id === flaggedId ? 1 : 0));
  const stateRows = collectInScopeState(campaignState, matchedIds);

  if (!truths.length && !stateRows.length) {
    return `<p class="sf-correct-empty">No active-scene truths or state for the subjects in this card.</p>`;
  }

  const truthsHtml = truths.length
    ? `<h4>Truths</h4><ul class="sf-correct-list">${truths.map(t => renderTruthRow(t, ctx, t.id === flaggedId)).join('')}</ul>`
    : '';
  const stateHtml = stateRows.length
    ? `<h4>State</h4><ul class="sf-correct-list">${stateRows.map(s => renderStateRow(s, ctx)).join('')}</ul>`
    : '';

  return `${truthsHtml}${stateHtml}`;
}

function renderTruthRow(truth, ctx, flagged = false) {
  const canStrike = ctx.isGM || truth.asserter !== 'gm';
  const idPrefix  = String(truth.id ?? '').slice(0, 8);
  const subjLabel = escape(formatSubjectLabel(truth.subject));
  const fact      = escape(truth.fact ?? '');
  const actor     = escape(truth.asserter ?? '');
  const lockHint  = canStrike ? '' : ` <span class="sf-correct-lock" title="GM-asserted — players cannot strike">🔒</span>`;
  const buttons   = canStrike
    ? `
      <button type="button" class="sf-correct-btn" data-action="strike-truth" data-truth-id="${escape(truth.id)}">Strike</button>
      <button type="button" class="sf-correct-btn" data-action="replace-truth" data-truth-id="${escape(truth.id)}">Replace…</button>
    `
    : '';
  const flagHint  = flagged ? ` <span class="sf-correct-flagged" title="The fact the Narrative Review caught">⚠ flagged by the review</span>` : '';
  return `
    <li class="sf-correct-row${flagged ? ' sf-correct-row--flagged' : ''}">
      <div class="sf-correct-meta">
        <code class="sf-correct-id">${idPrefix}</code>
        <span class="sf-correct-subject">${subjLabel}</span>
        <span class="sf-correct-asserter">(${actor})</span>${lockHint}${flagHint}
      </div>
      <div class="sf-correct-fact">${fact}</div>
      <div class="sf-correct-actions">${buttons}</div>
    </li>
  `;
}

function renderStateRow(row, ctx) {
  const subjLabel = escape(row.subjectLabel);
  const attribute = escape(row.attribute);
  const value     = escape(String(row.value ?? ''));
  // All actors can strike/replace state values (scope §10.1 — state is no-asymmetry).
  const buttons   = ctx ? `
    <button type="button" class="sf-correct-btn" data-action="strike-state"
            data-state-key="${escape(row.key)}" data-attribute="${attribute}">Strike</button>
    <button type="button" class="sf-correct-btn" data-action="replace-state"
            data-state-key="${escape(row.key)}" data-attribute="${attribute}">Replace…</button>
  ` : '';
  return `
    <li class="sf-correct-row">
      <div class="sf-correct-meta">
        <span class="sf-correct-subject">${subjLabel}</span>
        <span class="sf-correct-attribute">${attribute}:</span>
        <span class="sf-correct-value">${value}</span>
      </div>
      <div class="sf-correct-actions">${buttons}</div>
    </li>
  `;
}

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

function attachRowHandlers(root, ctx, rerender) {
  if (!root) return;
  for (const btn of root.querySelectorAll('[data-action]')) {
    // Replace each button with a clone to drop any previously attached
    // listener — this hook may run multiple times (initial render + every
    // rerender after a correction).
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await handleRowAction(fresh, ctx);
      rerender();
    });
  }
}

/**
 * Apply one row's correction to the store as it is at the click — never to
 * the campaignState read when the dialog opened (issue #321 U06e: each click
 * wrote that snapshot whole, reverting an X-Card played, the next
 * narration's truths and a released move lock) — and persist only the
 * ledger field it changed, merged onto the latest store; a Strike or Replace
 * also marks the stored rolling summary for a regen. A Replace reads the
 * store after its prompt closes. A cancelled prompt, or a row that no longer
 * matches, writes nothing.
 *
 * @param {HTMLElement} button
 * @param {{ isGM: boolean, actor: "gm"|"player" }} ctx
 * @returns {Promise<void>}
 */
async function handleRowAction(button, ctx) {
  const action = button.dataset.action;
  switch (action) {
    case 'strike-truth': {
      const working = workingCopy();
      const struck  = strikeTruth(button.dataset.truthId, working, ctx);
      if (!struck) return;
      await propagateRetraction(struck, working);   // issue #286 B6
      await persistCorrection(working, 'sceneTruths', { regenSummary: true });
      return;
    }
    case 'replace-truth': {
      const truth = (readCampaignState()?.sceneTruths ?? []).find(t => t?.id === button.dataset.truthId);
      if (!truth) return;
      const next  = await promptForText(`Replacement fact for "${truth.fact ?? ''}"`, truth.fact ?? '');
      if (!next) return;
      const working  = workingCopy();
      const replaced = replaceTruth(truth.id, { fact: next }, working, ctx);
      if (!replaced) return;
      await propagateRetraction(replaced.struck, working);
      await persistCorrection(working, 'sceneTruths', { regenSummary: true });
      return;
    }
    case 'strike-state': {
      const working = workingCopy();
      if (!strikeStateValue(button.dataset.stateKey, button.dataset.attribute, working)) return;
      await persistCorrection(working, 'sceneState');
      return;
    }
    case 'replace-state': {
      const key  = button.dataset.stateKey;
      const attr = button.dataset.attribute;
      const list = readCampaignState()?.sceneState?.bySubject?.[key] ?? [];
      const cur  = list.find(e => sameStateAttribute(e.attribute, attr));
      const next = await promptForText(`New value for "${attr}"`, String(cur?.value ?? ''));
      if (!next) return;
      const working = workingCopy();
      if (!setStateValue(key, attr, next, working)) return;
      await persistCorrection(working, 'sceneState');
      return;
    }
    default:
      return;
  }
}

/** A copy of the stored campaignState to correct — the cached value is never changed in place. */
function workingCopy() {
  return foundry.utils.deepClone(readCampaignState() ?? {});
}

async function promptForText(prompt, defaultValue) {
  const { DialogV2 } = foundry.applications.api;
  try {
    const result = await DialogV2.prompt({
      window:  { title: 'Correct Fact' },
      content: `
        <p>${escape(prompt)}</p>
        <input class="sf-correct-input" name="value" type="text"
               value="${escape(defaultValue ?? '')}" autocomplete="off" spellcheck="false"
               style="width: 100%;">
      `,
      ok: {
        label: 'Save',
        callback: (_event, _button, dialog) => {
          const root = dialog?.element ?? null;
          const input = root?.querySelector('[name="value"]');
          return input?.value?.trim() ?? '';
        },
      },
      rejectClose: false,
    });
    return typeof result === 'string' ? result : '';
  } catch (err) {
    console.warn(`${MODULE_ID} | correctionDialog: promptForText failed:`, err);
    return '';
  }
}

// ---------------------------------------------------------------------------
// Filters / labels
// ---------------------------------------------------------------------------

function isSubjectInDialogScope(subject, matchedIds) {
  if (!subject || typeof subject !== 'object') return false;
  if (subject.kind === 'scene')  return true;
  if (subject.kind === 'entity') return matchedIds.has(subject.entityId);
  if (subject.kind === 'text')   return true;  // free-text subjects are always
                                                // surfaced for correction
  return false;
}

function collectInScopeState(campaignState, matchedIds) {
  const bySubject = campaignState?.sceneState?.bySubject ?? {};
  const rows = [];
  for (const [key, list] of Object.entries(bySubject)) {
    if (!Array.isArray(list) || !list.length) continue;
    const subject     = subjectFromStateKey(key);
    const subjectLabel = formatSubjectLabel(subject);
    if (!isSubjectInDialogScope(subject, matchedIds)) continue;
    for (const e of list) {
      rows.push({ key, attribute: e.attribute, value: e.value, subjectLabel });
    }
  }
  return rows;
}

function formatSubjectLabel(subject) {
  if (!subject || typeof subject !== 'object') return 'unknown';
  switch (subject.kind) {
    case 'entity': return entityName(subject.entityId) || subject.entityId || 'entity';
    case 'scene':  return 'scene';
    case 'text':   return String(subject.text ?? '').trim() || 'unknown';
    default:       return 'unknown';
  }
}

/** The entity record's name for its host document id, or '' — so a row reads "Kael Dros", not an Actor id. */
function entityName(id) {
  if (!id) return '';
  try {
    const name = resolveEntityById(id)?.data?.name;
    return typeof name === 'string' ? name.trim() : '';
  } catch {
    return '';
  }
}

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Persist a correction's ledger field onto the latest store
 * (persistSceneLedgerFields: truths unioned by id with a retraction
 * sticking; nothing when the scene closed meanwhile) and, after a Strike or
 * Replace, the regen mark on the stored rolling summary. Failures are logged
 * there, never thrown.
 *
 * @param {Object} working — the corrected copy
 * @param {"sceneTruths"|"sceneState"} field
 * @param {{ regenSummary?: boolean }} [opts]
 * @returns {Promise<void>}
 */
async function persistCorrection(working, field, { regenSummary = false } = {}) {
  await persistSceneLedgerFields(working, [field], 'correction dialog', {
    onto: regenSummary ? markSummaryForRegen : null,
  });
}

// Avoid unused-parameter lint when subjectKey is imported only for the type
// hint above — keep it referenced.
export { subjectKey };
