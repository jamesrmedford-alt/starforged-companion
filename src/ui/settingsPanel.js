// src/ui/settingsPanel.js
// Settings Panel + Move Confirmation Dialog — Starforged Companion module
//
// Exports:
//   SettingsPanelApp        — tabbed ApplicationV2: Safety | Mischief | About
//   MoveConfirmDialog       — ApplicationV2 dialog replacing confirmInterpretation() stub
//   registerSettings()      — register game.settings (call from init hook)
//   registerSettingsHooks() — wire X-Card chat hook + initial safety sync (call from ready hook)
//   openSettingsPanel()     — public opener
//   confirmInterpretation() — await-able wrapper for MoveConfirmDialog
//   getSafetyConfig()       — read safety config (for assembler.js)
//   getMischiefDial()       — read dial value (for mischief.js / index.js)
//
// Safety config storage fix:
//   Lines/Veils are stored in game.settings (world/client-scoped).
//   assembler.js reads from campaignState.safety.lines / .veils / .privateLines.
//   syncSafetyToCampaignState() bridges the two, called on every write and on ready.

import { suppressScene } from '../context/safety.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODULE_ID = 'starforged-companion';

const DIAL_POSITIONS = [
  {
    value: 'lawful',
    label: 'Lawful',
    description: 'Always interprets the most rules-literal reading of player narration. No misdirection. Confirmations are plain.',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Default. Interprets with context and intent. Occasional wry asides when interpretation is ambiguous. No mechanical misdirection.',
  },
  {
    value: 'chaotic',
    label: 'Chaotic',
    description: 'May read subtext over surface text. Asides are openly smug. May choose a mechanically distinct but narratively fitting move when interpretation is genuinely ambiguous.',
  },
];

const SETTING = {
  DIAL:          'mischiefDial',
  GLOBAL_LINES:  'globalSafetyLines',
  GLOBAL_VEILS:  'globalSafetyVeils',
  PRIVATE_LINES: 'privateLines',   // client-scoped
};

// ---------------------------------------------------------------------------
// game.settings registration
// ---------------------------------------------------------------------------

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTING.DIAL, {
    name:    'Mischief Dial',
    hint:    'Controls how aggressively the module interprets ambiguous player narration.',
    scope:   'world',
    config:  false,
    type:    String,
    default: 'balanced',
    choices: Object.fromEntries(DIAL_POSITIONS.map(d => [d.value, d.label])),
  });

  game.settings.register(MODULE_ID, SETTING.GLOBAL_LINES, {
    name:    'Global Lines (Hard)',
    hint:    'Hard content limits. Always injected first in every Loremaster context packet.',
    scope:   'world',
    config:  false,
    type:    Array,
    default: [
      'No situations that endanger children. Children may not appear as characters in peril under any circumstances.',
    ],
  });

  game.settings.register(MODULE_ID, SETTING.GLOBAL_VEILS, {
    name:    'Global Veils (Soft)',
    hint:    'Soft content limits. Present in context packet but may be acknowledged rather than strictly excluded.',
    scope:   'world',
    config:  false,
    type:    Array,
    default: [
      'Children as plot-significant characters. Children may exist in the setting but may not drive or feature prominently in storylines.',
    ],
  });

  game.settings.register(MODULE_ID, SETTING.PRIVATE_LINES, {
    name:    'Private Lines',
    hint:    'Personal hard limits visible only to you. Injected into your context packets.',
    scope:   'client',
    config:  false,
    type:    Array,
    default: [],
  });
}

// ---------------------------------------------------------------------------
// Settings helpers — read
// ---------------------------------------------------------------------------

function getDial()         { return game.settings.get(MODULE_ID, SETTING.DIAL); }
function getGlobalLines()  { return game.settings.get(MODULE_ID, SETTING.GLOBAL_LINES) ?? []; }
function getGlobalVeils()  { return game.settings.get(MODULE_ID, SETTING.GLOBAL_VEILS) ?? []; }
function getPrivateLines() { return game.settings.get(MODULE_ID, SETTING.PRIVATE_LINES) ?? []; }

// ---------------------------------------------------------------------------
// Settings helpers — write (always sync to campaignState after writing)
// ---------------------------------------------------------------------------

async function setDial(val) {
  await game.settings.set(MODULE_ID, SETTING.DIAL, val);
  // Dial doesn't live in campaignState.safety — no sync needed
}

async function setGlobalLines(arr) {
  await game.settings.set(MODULE_ID, SETTING.GLOBAL_LINES, arr);
  await syncSafetyToCampaignState();
}

async function setGlobalVeils(arr) {
  await game.settings.set(MODULE_ID, SETTING.GLOBAL_VEILS, arr);
  await syncSafetyToCampaignState();
}

async function setPrivateLines(arr) {
  await game.settings.set(MODULE_ID, SETTING.PRIVATE_LINES, arr);
  await syncSafetyToCampaignState();
}

// ---------------------------------------------------------------------------
// Safety sync — bridges game.settings → campaignState.safety
// ---------------------------------------------------------------------------

/**
 * Sync the current safety settings into campaignState.safety so that
 * assembler.js / safety.js always have live values.
 *
 * Called automatically after every write to Lines/Veils/PrivateLines,
 * and once from registerSettingsHooks() on the ready hook to initialise.
 *
 * Private Lines are stored in campaignState as an array of
 * { playerId, lines } objects — one entry per player. Each client only
 * updates its own entry; other players' entries are preserved.
 * This matches the shape that safety.js's resolvePrivateLines() expects.
 */
async function syncSafetyToCampaignState() {
  try {
    const campaignState = game.settings.get(MODULE_ID, 'campaignState') ?? {};
    if (!campaignState.safety) campaignState.safety = {};

    // Global Lines and Veils — GM-controlled, world-scoped
    campaignState.safety.lines = getGlobalLines();
    campaignState.safety.veils = getGlobalVeils();

    // Private Lines — client-scoped, keyed by player ID in campaignState
    // Each player only writes their own entry; others are preserved
    const userId = game.user?.id;
    if (userId) {
      const existing = campaignState.safety.privateLines ?? [];
      const others   = existing.filter(e => e.playerId !== userId);
      const myLines  = getPrivateLines();

      campaignState.safety.privateLines = myLines.length > 0
        ? [...others, { playerId: userId, lines: myLines }]
        : others;   // Don't write an empty entry — avoids noise in the state
    }

    await game.settings.set(MODULE_ID, 'campaignState', campaignState);
  } catch (err) {
    // Non-Foundry context (tests) or settings not yet available
    console.warn(`${MODULE_ID} | syncSafetyToCampaignState: could not sync:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// X-Card hook
// ---------------------------------------------------------------------------

function registerXCardHook() {
  Hooks.on('chatMessage', (chatLog, message, chatData) => {
    if (message.trim().toLowerCase() !== '/x') return true;

    suppressScene();

    ChatMessage.create({
      content: `
        <div class="starforged-move-card xcard-card">
          <div class="move-header">
            <span class="move-type">X-Card</span>
          </div>
          <div class="move-body">
            <p class="xcard-message">
              Scene paused. Current content is suppressed.<br>
              The story will redirect at the next narration beat.
            </p>
          </div>
        </div>
      `.trim(),
      flags: { [MODULE_ID]: { type: 'xcard' } },
    });

    return false;
  });
}

// ---------------------------------------------------------------------------
// ApplicationV2 — Settings Panel
// ---------------------------------------------------------------------------

const { ApplicationV2 } = foundry.applications.api;

export class SettingsPanelApp extends ApplicationV2 {

  static #instance = null;
  #activeTab = 'safety';

  static DEFAULT_OPTIONS = {
    id:      `${MODULE_ID}-settings`,
    classes: [MODULE_ID, 'settings-panel'],
    tag:     'div',
    window: {
      title:       'Starforged Companion — Settings',
      resizable:   false,
      minimizable: true,
    },
    position: { width: 520, height: 'auto' },
    actions: {
      switchTab:         SettingsPanelApp.#onSwitchTab,
      addLine:           SettingsPanelApp.#onAddLine,
      removeLine:        SettingsPanelApp.#onRemoveLine,
      addVeil:           SettingsPanelApp.#onAddVeil,
      removeVeil:        SettingsPanelApp.#onRemoveVeil,
      addPrivateLine:    SettingsPanelApp.#onAddPrivateLine,
      removePrivateLine: SettingsPanelApp.#onRemovePrivateLine,
      setDial:           SettingsPanelApp.#onSetDial,
    },
  };

  static open() {
    if (!SettingsPanelApp.#instance) {
      SettingsPanelApp.#instance = new SettingsPanelApp();
    }
    SettingsPanelApp.#instance.render({ force: true });
    return SettingsPanelApp.#instance;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async _prepareContext(_options) {
    return {
      activeTab:     this.#activeTab,
      isGM:          game.user.isGM,
      dial:          getDial(),
      dialPositions: DIAL_POSITIONS,
      globalLines:   getGlobalLines(),
      globalVeils:   getGlobalVeils(),
      privateLines:  getPrivateLines(),
    };
  }

  async _renderHTML(context, _options) {
    const tabs = [
      { id: 'safety',   label: 'Safety'   },
      { id: 'mischief', label: 'Mischief' },
      { id: 'about',    label: 'About'    },
    ];

    const tabNav = tabs.map(t => `
      <button class="settings-tab-btn ${t.id === context.activeTab ? 'is-active' : ''}"
              data-action="switchTab" data-tab="${t.id}">
        ${t.label}
      </button>
    `).join('');

    let paneHtml;
    switch (context.activeTab) {
      case 'safety':   paneHtml = this.#renderSafetyPane(context);   break;
      case 'mischief': paneHtml = this.#renderMischiefPane(context); break;
      case 'about':    paneHtml = this.#renderAboutPane();            break;
    }

    const html = `
      <div class="sf-settings-panel">
        <nav class="settings-tab-nav">${tabNav}</nav>
        <div class="settings-pane">${paneHtml}</div>
      </div>
    `;

    const tmp = document.createElement('div');
    tmp.innerHTML = html.trim();
    return tmp.firstElementChild;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = '';
    content.append(result);
  }

  // -----------------------------------------------------------------------
  // Pane renderers
  // -----------------------------------------------------------------------

  #renderSafetyPane(ctx) {
    const renderList = (items, removeAction, addAction, inputName, placeholder, label, description) => `
      <div class="safety-list-block">
        <div class="safety-block-header">
          <strong>${label}</strong>
          <span class="safety-block-desc">${description}</span>
        </div>
        <ul class="safety-item-list">
          ${items.length
            ? items.map((item, i) => `
              <li class="safety-item">
                <span class="safety-item-text">${item}</span>
                ${ctx.isGM || addAction.includes('Private')
                  ? `<button class="settings-btn btn-remove-item" data-action="${removeAction}"
                             data-index="${i}" title="Remove">✕</button>`
                  : ''}
              </li>`).join('')
            : '<li class="safety-item safety-item-empty">None set.</li>'
          }
        </ul>
        ${ctx.isGM || addAction.includes('Private') ? `
          <div class="safety-add-row">
            <input class="settings-input" name="${inputName}" type="text"
                   placeholder="${placeholder}" maxlength="200">
            <button class="settings-btn btn-add-item" data-action="${addAction}">Add</button>
          </div>
        ` : '<p class="safety-readonly-note">Set by GM.</p>'}
      </div>
    `;

    const gmNote = ctx.isGM ? '' : `
      <p class="safety-gm-note">
        Global Lines and Veils are set by the GM. Your private Lines are visible only to you.
      </p>
    `;

    return `
      <div class="safety-pane">
        ${gmNote}
        ${renderList(
          ctx.globalLines, 'removeLine', 'addLine', 'newLine',
          'No situations that endanger…',
          'Lines — Hard Limits',
          'Absolute. Content matching a Line will never appear regardless of other settings.',
        )}
        ${renderList(
          ctx.globalVeils, 'removeVeil', 'addVeil', 'newVeil',
          'Children as plot-significant characters…',
          'Veils — Soft Limits',
          'Present in context packets. Content will be redirected, not strictly excluded.',
        )}
        <hr class="safety-divider">
        ${renderList(
          ctx.privateLines, 'removePrivateLine', 'addPrivateLine', 'newPrivateLine',
          'My personal hard limit…',
          'Private Lines — Visible only to you',
          'Stored on this client. Never shared with GM or other players.',
        )}
        <div class="safety-xcard-note">
          <strong>X-Card:</strong> Type <code>/x</code> in chat at any time to immediately suppress the current scene.
        </div>
      </div>
    `;
  }

  #renderMischiefPane(ctx) {
    const dialHtml = ctx.dialPositions.map(pos => `
      <label class="dial-option ${pos.value === ctx.dial ? 'is-selected' : ''}"
             data-action="setDial" data-value="${pos.value}"
             role="radio" aria-checked="${pos.value === ctx.dial}" tabindex="0">
        <div class="dial-option-header">
          <span class="dial-radio ${pos.value === ctx.dial ? 'is-checked' : ''}"></span>
          <span class="dial-label">${pos.label}</span>
          ${pos.value === ctx.dial ? '<span class="dial-current-badge">Current</span>' : ''}
        </div>
        <p class="dial-description">${pos.description}</p>
      </label>
    `).join('');

    const gmNote = ctx.isGM ? '' : `
      <p class="dial-player-note">Mischief dial is controlled by the GM.</p>
    `;

    return `
      <div class="mischief-pane">
        ${gmNote}
        <div class="dial-options ${!ctx.isGM ? 'dial-readonly' : ''}">
          ${dialHtml}
        </div>
        <div class="dial-ceiling-note">
          <strong>Note:</strong> Safety configuration is always a hard ceiling on the mischief layer.
          Active Lines and Veils are injected before any mischief is applied, regardless of dial setting.
        </div>
      </div>
    `;
  }

  #renderAboutPane() {
    return `
      <div class="about-pane">
        <h3 class="about-module-name">Starforged Companion</h3>
        <p class="about-desc">
          Move interpretation, narration, entity tracking, and art generation for Ironsworn: Starforged.
        </p>
        <dl class="about-fields">
          <div class="about-field">
            <dt>Move AI</dt>
            <dd>claude-haiku-4-5-20251001 · system prompt cached</dd>
          </div>
          <div class="about-field">
            <dt>Narration AI</dt>
            <dd>Loremaster (hosted proxy)</dd>
          </div>
          <div class="about-field">
            <dt>Art generation</dt>
            <dd>DALL-E 3 · standard quality · natural style</dd>
          </div>
          <div class="about-field">
            <dt>Foundry target</dt>
            <dd>v12 minimum · v13 verified</dd>
          </div>
        </dl>
        <div class="about-open-issues">
          <strong>Open items requiring manual resolution:</strong>
          <ul>
            <li>Confirm Loremaster flag path for context consumption</li>
          </ul>
        </div>
      </div>
    `;
  }

  // -----------------------------------------------------------------------
  // Action handlers
  // -----------------------------------------------------------------------

  static async #onSwitchTab(event, target) {
    this.#activeTab = target.dataset.tab;
    this.render();
  }

  static async #onSetDial(event, target) {
    if (!game.user.isGM) return;
    await setDial(target.dataset.value);
    this.render();
  }

  static async #onAddLine(event, target) {
    if (!game.user.isGM) return;
    const input = this.element.querySelector('[name="newLine"]');
    const text = input?.value.trim();
    if (!text) return;
    const lines = getGlobalLines();
    lines.push(text);
    await setGlobalLines(lines);   // sync included
    this.render();
  }

  static async #onRemoveLine(event, target) {
    if (!game.user.isGM) return;
    const idx = Number(target.dataset.index);
    const lines = getGlobalLines();
    lines.splice(idx, 1);
    await setGlobalLines(lines);   // sync included
    this.render();
  }

  static async #onAddVeil(event, target) {
    if (!game.user.isGM) return;
    const input = this.element.querySelector('[name="newVeil"]');
    const text = input?.value.trim();
    if (!text) return;
    const veils = getGlobalVeils();
    veils.push(text);
    await setGlobalVeils(veils);   // sync included
    this.render();
  }

  static async #onRemoveVeil(event, target) {
    if (!game.user.isGM) return;
    const idx = Number(target.dataset.index);
    const veils = getGlobalVeils();
    veils.splice(idx, 1);
    await setGlobalVeils(veils);   // sync included
    this.render();
  }

  static async #onAddPrivateLine(event, target) {
    const input = this.element.querySelector('[name="newPrivateLine"]');
    const text = input?.value.trim();
    if (!text) return;
    const lines = getPrivateLines();
    lines.push(text);
    await setPrivateLines(lines);  // sync included
    this.render();
  }

  static async #onRemovePrivateLine(event, target) {
    const idx = Number(target.dataset.index);
    const lines = getPrivateLines();
    lines.splice(idx, 1);
    await setPrivateLines(lines);  // sync included
    this.render();
  }
}

// ---------------------------------------------------------------------------
// ApplicationV2 — Move Confirmation Dialog
// ---------------------------------------------------------------------------

export class MoveConfirmDialog extends ApplicationV2 {

  #resolve = null;
  #interp  = null;

  static DEFAULT_OPTIONS = {
    id:      `${MODULE_ID}-move-confirm`,
    classes: [MODULE_ID, 'move-confirm-dialog'],
    tag:     'div',
    window: {
      title:       'Confirm Move Interpretation',
      resizable:   false,
      minimizable: false,
    },
    position: { width: 440, height: 'auto' },
    actions: {
      accept: MoveConfirmDialog.#onAccept,
      reject: MoveConfirmDialog.#onReject,
    },
  };

  /**
   * Show the dialog for an interpretation and return the player's choice.
   * @param {object} interpretation
   * @returns {Promise<boolean>}
   */
  static async prompt(interpretation) {
    return new Promise((resolve) => {
      const dialog = new MoveConfirmDialog();
      dialog.#interp  = interpretation;
      dialog.#resolve = resolve;
      dialog.render({ force: true });
    });
  }

  async _prepareContext(_options) {
    const interp   = this.#interp ?? {};
    const dialLabel = DIAL_POSITIONS.find(d => d.value === getDial())?.label ?? 'Balanced';
    return {
      moveId:          interp.moveId    ?? '—',
      statUsed:        interp.statUsed  ?? '—',
      rationale:       interp.rationale ?? '',
      mischiefApplied: !!interp.mischiefApplied,
      mischiefAside:   interp._mischiefAside ?? '',
      dialLabel,
    };
  }

  async _renderHTML(context, _options) {
    const mischiefBlock = context.mischiefApplied && context.mischiefAside ? `
      <div class="confirm-mischief-aside">
        <span class="mischief-label">Mischief (${context.dialLabel})</span>
        <p class="mischief-aside-text">${context.mischiefAside}</p>
      </div>
    ` : '';

    const html = `
      <div class="sf-move-confirm">
        <div class="confirm-move-row">
          <span class="confirm-field-label">Move</span>
          <span class="confirm-field-value confirm-move-id">${context.moveId}</span>
        </div>
        <div class="confirm-move-row">
          <span class="confirm-field-label">Stat</span>
          <span class="confirm-field-value">${context.statUsed}</span>
        </div>
        <div class="confirm-rationale">
          <span class="confirm-field-label">Interpretation</span>
          <p class="confirm-rationale-text">${context.rationale}</p>
        </div>
        ${mischiefBlock}
        <div class="confirm-actions">
          <button class="settings-btn btn-accept" data-action="accept">Accept — Roll</button>
          <button class="settings-btn btn-reject" data-action="reject">Re-interpret</button>
        </div>
      </div>
    `;

    const tmp = document.createElement('div');
    tmp.innerHTML = html.trim();
    return tmp.firstElementChild;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = '';
    content.append(result);
  }

  async close(options) {
    this.#resolve?.(false);
    this.#resolve = null;
    return super.close(options);
  }

  static async #onAccept(event, target) {
    this.#resolve?.(true);
    this.#resolve = null;
    this.close({ animate: false });
  }

  static async #onReject(event, target) {
    this.#resolve?.(false);
    this.#resolve = null;
    this.close({ animate: false });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function openSettingsPanel() {
  return SettingsPanelApp.open();
}

export async function confirmInterpretation(interpretation) {
  return MoveConfirmDialog.prompt(interpretation);
}

/**
 * Register hooks. Called from index.js ready hook.
 * Also runs the initial safety sync so campaignState.safety is populated
 * from whatever is currently in game.settings before the first move fires.
 */
export function registerSettingsHooks() {
  registerXCardHook();

  // Initialise campaignState.safety from current game.settings values.
  // This covers first load and the case where settings existed before this
  // sync mechanism was deployed.
  syncSafetyToCampaignState().catch(err =>
    console.warn(`${MODULE_ID} | Initial safety sync failed:`, err.message)
  );
}

/**
 * Read safety config from game.settings.
 * Shape matches what safety.js's formatSafetyContext expects when called
 * without a campaignState (e.g. from tests or direct use).
 */
export function getSafetyConfig() {
  return {
    lines:        getGlobalLines(),
    veils:        getGlobalVeils(),
    privateLines: getPrivateLines(),
  };
}

export { getDial as getMischiefDial };
