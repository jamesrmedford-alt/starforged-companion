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
} from './ledgers.js';

const MODULE_ID = 'starforged-companion';

/**
 * Open the correction dialog for a narrator chat card. Reads the card's
 * `flags[MODULE_ID].matchedEntityIds` to scope the truth/state listing.
 *
 * @param {ChatMessage} message — the narrator card
 * @returns {Promise<void>}
 */
export async function openCorrectionDialog(message) {
  if (!message) return;
  const campaignState = game.settings.get(MODULE_ID, 'campaignState');
  if (!campaignState) return;

  const ctx = {
    isGM:  game.user?.isGM ?? false,
    actor: game.user?.isGM ? 'gm' : 'player',
  };

  const matchedIds   = new Set(message.flags?.[MODULE_ID]?.matchedEntityIds ?? []);
  const currentLocId = campaignState.currentLocationId;
  if (currentLocId) matchedIds.add(currentLocId);

  const { DialogV2 } = foundry.applications.api;

  // Re-rendered after each correction so the user sees the result of their
  // own action without closing/reopening.
  const rerender = (dlg) => {
    const root = dlg.element;
    if (!root) return;
    const fresh = renderDialogContent(campaignState, matchedIds, ctx);
    const body  = root.querySelector('.sf-correct-body');
    if (body) body.innerHTML = fresh;
    attachRowHandlers(root, campaignState, matchedIds, ctx, () => rerender(dlg));
  };

  const dlg = new DialogV2({
    window:  { title: 'Correct Active Scene Facts' },
    classes: ['sf-correct-dialog'],
    content: `<div class="sf-correct-body">${renderDialogContent(campaignState, matchedIds, ctx)}</div>`,
    buttons: [
      { action: 'close', label: 'Close', default: true, callback: () => true },
    ],
    rejectClose: false,
    render: (_event, dialog) => attachRowHandlers(dialog.element, campaignState, matchedIds, ctx, () => rerender(dialog)),
  });

  dlg.render({ force: true });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderDialogContent(campaignState, matchedIds, ctx) {
  const truths = (campaignState.sceneTruths ?? []).filter(t =>
    t && !t.retracted && isSubjectInDialogScope(t.subject, matchedIds),
  );
  const stateRows = collectInScopeState(campaignState, matchedIds);

  if (!truths.length && !stateRows.length) {
    return `<p class="sf-correct-empty">No active-scene truths or state for the subjects in this card.</p>`;
  }

  const truthsHtml = truths.length
    ? `<h4>Truths</h4><ul class="sf-correct-list">${truths.map(t => renderTruthRow(t, ctx)).join('')}</ul>`
    : '';
  const stateHtml = stateRows.length
    ? `<h4>State</h4><ul class="sf-correct-list">${stateRows.map(s => renderStateRow(s, ctx)).join('')}</ul>`
    : '';

  return `${truthsHtml}${stateHtml}`;
}

function renderTruthRow(truth, ctx) {
  const canStrike = ctx.isGM || truth.asserter !== 'gm';
  const idPrefix  = String(truth.id ?? '').slice(0, 8);
  const subjLabel = escape(formatSubjectLabel(truth.subject));
  const fact      = escape(truth.fact ?? '');
  const actor     = escape(truth.asserter ?? '');
  const lockHint  = canStrike ? '' : ` <span class="sf-correct-lock" title="GM-asserted — players cannot strike">🔒</span>`;
  const buttons   = canStrike
    ? `
      <button class="sf-correct-btn" data-action="strike-truth" data-truth-id="${escape(truth.id)}">Strike</button>
      <button class="sf-correct-btn" data-action="replace-truth" data-truth-id="${escape(truth.id)}">Replace…</button>
    `
    : '';
  return `
    <li class="sf-correct-row">
      <div class="sf-correct-meta">
        <code class="sf-correct-id">${idPrefix}</code>
        <span class="sf-correct-subject">${subjLabel}</span>
        <span class="sf-correct-asserter">(${actor})</span>${lockHint}
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
    <button class="sf-correct-btn" data-action="strike-state"
            data-state-key="${escape(row.key)}" data-attribute="${attribute}">Strike</button>
    <button class="sf-correct-btn" data-action="replace-state"
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

function attachRowHandlers(root, campaignState, matchedIds, ctx, rerender) {
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
      await handleRowAction(fresh, campaignState, matchedIds, ctx);
      await persistCampaignState(campaignState);
      rerender();
    });
  }
}

async function handleRowAction(button, campaignState, matchedIds, ctx) {
  const action = button.dataset.action;
  switch (action) {
    case 'strike-truth':
      strikeTruth(button.dataset.truthId, campaignState, ctx);
      return;
    case 'replace-truth': {
      const truth = (campaignState.sceneTruths ?? []).find(t => t?.id === button.dataset.truthId);
      const next  = await promptForText(`Replacement fact for "${truth?.fact ?? ''}"`, truth?.fact ?? '');
      if (!next) return;
      replaceTruth(truth.id, { fact: next }, campaignState, ctx);
      return;
    }
    case 'strike-state':
      strikeStateValue(button.dataset.stateKey, button.dataset.attribute, campaignState);
      return;
    case 'replace-state': {
      const key  = button.dataset.stateKey;
      const attr = button.dataset.attribute;
      const list = campaignState?.sceneState?.bySubject?.[key] ?? [];
      const cur  = list.find(e => e.attribute === attr);
      const next = await promptForText(`New value for "${attr}"`, String(cur?.value ?? ''));
      if (!next) return;
      setStateValue(key, attr, next, campaignState);
      return;
    }
    default:
      return;
  }
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

function subjectFromStateKey(key) {
  if (key === 'scene') return { kind: 'scene' };
  if (/^[A-Za-z0-9._-]+$/u.test(key) && key !== key.toLowerCase()) {
    return { kind: 'entity', entityId: key };
  }
  return { kind: 'text', text: key };
}

function formatSubjectLabel(subject) {
  if (!subject || typeof subject !== 'object') return 'unknown';
  switch (subject.kind) {
    case 'entity': return subject.entityId ?? 'entity';
    case 'scene':  return 'scene';
    case 'text':   return String(subject.text ?? '').trim() || 'unknown';
    default:       return 'unknown';
  }
}

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function persistCampaignState(campaignState) {
  try {
    await game.settings.set(MODULE_ID, 'campaignState', campaignState);
  } catch (err) {
    console.warn(`${MODULE_ID} | correctionDialog: campaignState persist failed:`, err);
  }
}

// Avoid unused-parameter lint when subjectKey is imported only for the type
// hint above — keep it referenced.
export { subjectKey };
