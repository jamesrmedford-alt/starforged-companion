// src/ui/settingsPanel.js
// Settings Panel + Move Confirmation Dialog — Starforged Companion module
//
// Exports:
//   SettingsPanelApp        — tabbed ApplicationV2: Safety | Mischief | About
//   MoveConfirmDialog       — ApplicationV2 dialog replacing confirmInterpretation() stub
//   registerSettings()      — register game.settings (call from init hook)
//   registerSettingsHooks() — wire X-Card chat hook (call from ready hook)
//   openSettingsPanel()     — public opener
//   confirmInterpretation() — await-able wrapper for MoveConfirmDialog
//
// Output path: modules/starforged-companion/src/ui/settingsPanel.js

import { suppressScene } from '../context/safety.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODULE_ID = 'starforged-companion';

/** Mischief dial positions — matches session language exactly. */
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

// Setting keys
const SETTING = {
  DIAL:           'mischiefDial',
  GLOBAL_LINES:   'globalSafetyLines',
  GLOBAL_VEILS:   'globalSafetyVeils',
  PRIVATE_LINES:  'privateLines',   // client-scoped
};

// ---------------------------------------------------------------------------
// game.settings registration
// ---------------------------------------------------------------------------

/**
 * Register all module settings with Foundry.
 * Must be called from the `init` hook before any UI is rendered.
 */
export function registerSettings() {
  // Mischief dial (world-scoped — GM controls, shared across all players)
  game.settings.register(MODULE_ID, SETTING.DIAL, {
    name: 'Mischief Dial',
    hint: 'Controls how aggressively the module interprets ambiguous player narration.',
    scope: 'world',
    config: false,   // We render our own UI
    type: String,
    default: 'balanced',
    choices: Object.fromEntries(DIAL_POSITIONS.map(d => [d.value, d.label])),
  });

  // Global Lines — hard limits applied to all content (world-scoped, GM-set)
  game.settings.register(MODULE_ID, SETTING.GLOBAL_LINES, {
    name: 'Global Lines (Hard)',
    hint: 'Hard content limits. Always injected first in every Loremaster context packet.',
    scope: 'world',
    config: false,
    type: Array,
    default: [
      'No situations that endanger children. Children may not appear as characters in peril under any circumstances.',
    ],
  });

  // Global Veils — soft limits (world-scoped, GM-set)
  game.settings.register(MODULE_ID, SETTING.GLOBAL_VEILS, {
    name: 'Global Veils (Soft)',
    hint: 'Soft content limits. Present in context packet but may be acknowledged rather than strictly excluded.',
    scope: 'world',
    config: false,
    type: Array,
    default: [
      'Children as plot-significant characters. Children may exist in the setting but may not drive or feature prominently in storylines.',
    ],
  });

  // Private Lines — per-player, client-scoped (never visible to other players or GM)
  game.settings.register(MODULE_ID, SETTING.PRIVATE_LINES, {
    name: 'Private Lines',
    hint: 'Personal hard limits visible only to you. Injected into your context packets.',
    scope: 'client',
    config: false,
    type: Array,
    default: [],
  });
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

function getDial()         { return game.settings.get(MODULE_ID, SETTING.DIAL); }
function getGlobalLines()  { return game.settings.get(MODULE_ID, SETTING.GLOBAL_LINES) ?? []; }
function getGlobalVeils()  { return game.settings.get(MODULE_ID, SETTING.GLOBAL_VEILS) ?? []; }
function getPrivateLines() { return game.settings.get(MODULE_ID, SETTING.PRIVATE_LINES) ?? []; }

async function setDial(val)         { await game.settings.set(MODULE_ID, SETTING.DIAL, val); }
async function setGlobalLines(arr)  { await game.settings.set(MODULE_ID, SETTING.GLOBAL_LINES, arr); }
async function setGlobalVeils(arr)  { await game.settings.set(MODULE_ID, SETTING.GLOBAL_VEILS, arr); }
async function setPrivateLines(arr) { await game.settings.set(MODULE_ID, SETTING.PRIVATE_LINES, arr); }

// ---------------------------------------------------------------------------
// X-Card hook
// ---------------------------------------------------------------------------

/**
 * Register the /x chat command hook.
 * Returns false from chatMessage to suppress the chat bubble — just processes
 * the X-Card and posts a module card confirming the scene is suppressed.
 */
function registerXCardHook() {
  Hooks.on('chatMessage', (chatLog, message, chatData) => {
    if (message.trim().toLowerCase() !== '/x') return true; // allow normal processing

    // Suppress the chat input itself
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

    return false; // prevent the '/x' text from appearing in chat
  });
}

// ---------------------------------------------------------------------------
// ApplicationV2 — Settings Panel
// ---------------------------------------------------------------------------

const { ApplicationV2 } = foundry.applications.api;

export class SettingsPanelApp extends ApplicationV2 {

  static #instance = null;

  /** Which tab is active: 'safety' | 'mischief' | 'about' */
  #activeTab = 'safety';

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-settings`,
    classes: [MODULE_ID, 'settings-panel'],
    tag: 'div',
    window: {
      title: 'Starforged Companion — Settings',
      resizable: false,
      minimizable: true,
    },
    position: {
      width: 520,
      height: 'auto',
    },
    actions: {
      switchTab:          SettingsPanelApp.#onSwitchTab,
      addLine:            SettingsPanelApp.#onAddLine,
      removeLine:         SettingsPanelApp.#onRemoveLine,
      addVeil:            SettingsPanelApp.#onAddVeil,
      removeVeil:         SettingsPanelApp.#onRemoveVeil,
      addPrivateLine:     SettingsPanelApp.#onAddPrivateLine,
      removePrivateLine:  SettingsPanelApp.#onRemovePrivateLine,
      setDial:            SettingsPanelApp.#onSetDial,
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

  /** @override */
  async _prepareContext(options) {
    return {
      activeTab:    this.#activeTab,
      isGM:         game.user.isGM,
      dial:         getDial(),
      dialPositions: DIAL_POSITIONS,
      globalLines:  getGlobalLines(),
      globalVeils:  getGlobalVeils(),
      privateLines: getPrivateLines(),
    };
  }

  /** @override */
  async _renderHTML(context, options) {
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

  /** @override */
  _replaceHTML(result, content, options) {
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
                  : ''
                }
              </li>
            `).join('')
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

    const ceilingNote = `
      <div class="dial-ceiling-note">
        <strong>Note:</strong> Safety configuration is always a hard ceiling on the mischief layer.
        Active Lines and Veils are injected before any mischief is applied, regardless of dial setting.
      </div>
    `;

    return `
      <div class="mischief-pane">
        ${gmNote}
        <div class="dial-options ${!ctx.isGM ? 'dial-readonly' : ''}">
          ${dialHtml}
        </div>
        ${ceilingNote}
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
            <li>Confirm Loremaster module ID (replace <code>"loremaster"</code> placeholder in index.js)</li>
            <li>Confirm Loremaster flag path for context consumption</li>
            <li>Implement <code>persistResolution()</code> (currently stubbed in index.js)</li>
            <li>Create GitHub repository</li>
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

  // Lines

  static async #onAddLine(event, target) {
    if (!game.user.isGM) return;
    const input = this.element.querySelector('[name="newLine"]');
    const text = input?.value.trim();
    if (!text) return;
    const lines = getGlobalLines();
    lines.push(text);
    await setGlobalLines(lines);
    this.render();
  }

  static async #onRemoveLine(event, target) {
    if (!game.user.isGM) return;
    const idx = Number(target.dataset.index);
    const lines = getGlobalLines();
    lines.splice(idx, 1);
    await setGlobalLines(lines);
    this.render();
  }

  // Veils

  static async #onAddVeil(event, target) {
    if (!game.user.isGM) return;
    const input = this.element.querySelector('[name="newVeil"]');
    const text = input?.value.trim();
    if (!text) return;
    const veils = getGlobalVeils();
    veils.push(text);
    await setGlobalVeils(veils);
    this.render();
  }

  static async #onRemoveVeil(event, target) {
    if (!game.user.isGM) return;
    const idx = Number(target.dataset.index);
    const veils = getGlobalVeils();
    veils.splice(idx, 1);
    await setGlobalVeils(veils);
    this.render();
  }

  // Private Lines (client-scoped, any user)

  static async #onAddPrivateLine(event, target) {
    const input = this.element.querySelector('[name="newPrivateLine"]');
    const text = input?.value.trim();
    if (!text) return;
    const lines = getPrivateLines();
    lines.push(text);
    await setPrivateLines(lines);
    this.render();
  }

  static async #onRemovePrivateLine(event, target) {
    const idx = Number(target.dataset.index);
    const lines = getPrivateLines();
    lines.splice(idx, 1);
    await setPrivateLines(lines);
    this.render();
  }
}

// ---------------------------------------------------------------------------
// ApplicationV2 — Move Confirmation Dialog
// ---------------------------------------------------------------------------

/**
 * Shown after move interpretation, before resolution.
 * Displays the interpreted move, stat, rationale, and mischief aside.
 * Resolves with true (accept) or false (reject / re-interpret).
 *
 * Usage in index.js:
 *   const accepted = await confirmInterpretation(interpretation);
 *   if (!accepted) return;   // player rejected; pipeline stops
 */
export class MoveConfirmDialog extends ApplicationV2 {

  /** @type {(value: boolean) => void} */
  #resolve = null;

  /** @type {object}  The interpretation object from interpreter.js */
  #interp = null;

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-move-confirm`,
    classes: [MODULE_ID, 'move-confirm-dialog'],
    tag: 'div',
    window: {
      title: 'Confirm Move Interpretation',
      resizable: false,
      minimizable: false,
    },
    position: {
      width: 440,
      height: 'auto',
    },
    actions: {
      accept: MoveConfirmDialog.#onAccept,
      reject: MoveConfirmDialog.#onReject,
    },
  };

  /**
   * @param {object} interpretation  From interpreter.js: {moveId, statUsed, rationale, mischiefApplied, _mischiefAside}
   * @returns {Promise<boolean>}
   */
  static async prompt(interpretation) {
    return new Promise((resolve) => {
      const dialog = new MoveConfirmDialog();
      dialog.#interp = interpretation;
      dialog.#resolve = resolve;
      dialog.render({ force: true });
    });
  }

  /** @override */
  async _prepareContext(options) {
    const interp = this.#interp ?? {};
    const dialLabel = DIAL_POSITIONS.find(d => d.value === getDial())?.label ?? 'Balanced';

    return {
      moveId:         interp.moveId    ?? '—',
      statUsed:       interp.statUsed  ?? '—',
      rationale:      interp.rationale ?? '',
      mischiefApplied: !!interp.mischiefApplied,
      mischiefAside:  interp._mischiefAside ?? '',
      dialLabel,
    };
  }

  /** @override */
  async _renderHTML(context, options) {
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

  /** @override */
  _replaceHTML(result, content, options) {
    content.innerHTML = '';
    content.append(result);
  }

  /** @override */
  async close(options) {
    // If closed via window X without choosing, treat as reject.
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

/**
 * Open the settings panel.
 * @returns {SettingsPanelApp}
 */
export function openSettingsPanel() {
  return SettingsPanelApp.open();
}

/**
 * Replaces the confirmInterpretation() stub in index.js.
 * Shows the MoveConfirmDialog and returns the player's choice.
 *
 * @param {object} interpretation  From interpreter.js
 * @returns {Promise<boolean>}     true = accepted, false = rejected
 */
export async function confirmInterpretation(interpretation) {
  return MoveConfirmDialog.prompt(interpretation);
}

/**
 * Register game.settings. Call from the Foundry `init` hook in index.js.
 */
export { registerSettings };

/**
 * Wire the X-Card hook and any other event listeners.
 * Call from the Foundry `ready` hook in index.js.
 */
export function registerSettingsHooks() {
  registerXCardHook();
}

/**
 * Read safety configuration — used by assembleContextPacket() in context/assembler.js.
 * Returns the combined Lines/Veils in the format the assembler expects.
 *
 * @returns {{ lines: string[], veils: string[], privateLines: string[] }}
 */
export function getSafetyConfig() {
  return {
    lines:        getGlobalLines(),
    veils:        getGlobalVeils(),
    privateLines: getPrivateLines(),
  };
}

/**
 * Read the current mischief dial value.
 * Used by mischief.js when generating wry asides.
 * @returns {'lawful'|'balanced'|'chaotic'}
 */
export { getDial as getMischiefDial };
