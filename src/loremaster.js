// src/loremaster.js
// Loremaster integration — module ID resolution and context delivery.
//
// The Loremaster module is distributed via Patreon and is not in the Foundry
// package registry, so its module ID is not known at build time. Rather than
// a hardcoded placeholder that requires a code change, this module surfaces
// two world-scoped settings that the GM fills in once during setup:
//
//   STARFORGED.Loremaster.ModuleID   — the id field from Loremaster's module.json
//   STARFORGED.Loremaster.FlagPath   — the flag path Loremaster reads for injected context
//
// Finding the values:
//   Module ID   — open Loremaster's module.json in your Foundry Data/modules/ folder
//                 and copy the "id" field. Or run in the Foundry console:
//                 [...game.modules.keys()].filter(k => k.includes('lore'))
//   Flag path   — check Loremaster's source for where it reads injected context.
//                 The module currently writes to:
//                   chatMessage.flags["starforged-companion"].loremasterContext
//                 Confirm this path matches Loremaster's actual injection mechanism.
//
// Output path: modules/starforged-companion/src/loremaster.js

const MODULE_ID = 'starforged-companion';

// ─────────────────────────────────────────────────────────────────────────────
// Settings registration — call from index.js init hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register Loremaster integration settings.
 * Call once from the Foundry `init` hook, alongside other game.settings.register calls.
 */
export function registerLoremasterSettings() {
  game.settings.register(MODULE_ID, 'loremasterModuleId', {
    name:  'Loremaster Module ID',
    hint:  "The exact module ID from Loremaster's module.json. Find it by running: [...game.modules.keys()].filter(k => k.includes('lore')) in the Foundry console while Loremaster is installed.",
    scope:  'world',
    config: true,
    type:   String,
    default: '',     // Intentionally blank — must be set by GM
    onChange: () => {
      // Re-run the runtime check when the setting changes
      checkLoremaster();
    },
  });

  game.settings.register(MODULE_ID, 'loremasterFlagPath', {
    name:  'Loremaster Context Flag Path',
    hint:  "The flag path Loremaster reads for injected context. Default: loremasterContext. Change only if Loremaster reads from a different path.",
    scope:  'world',
    config: true,
    type:   String,
    default: 'loremasterContext',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime accessors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the configured Loremaster module ID.
 * Returns null if not configured.
 * @returns {string|null}
 */
export function getLoremasterModuleId() {
  const id = game.settings.get(MODULE_ID, 'loremasterModuleId');
  return id?.trim() || null;
}

/**
 * Get the flag path under which Loremaster reads injected context.
 * Defaults to 'loremasterContext' if not overridden.
 * @returns {string}
 */
export function getLoremasterFlagPath() {
  return game.settings.get(MODULE_ID, 'loremasterFlagPath') || 'loremasterContext';
}

/**
 * Return the live Loremaster module reference, or null.
 * @returns {Module|null}
 */
export function getLoremasterModule() {
  const id = getLoremasterModuleId();
  if (!id) return null;
  return game.modules.get(id) ?? null;
}

/**
 * Return true if Loremaster is installed and active.
 * @returns {boolean}
 */
export function isLoremasterActive() {
  const mod = getLoremasterModule();
  return !!mod?.active;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime check — replaces checkLoremaster() in index.js
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check Loremaster status and surface actionable warnings to the GM.
 * Call from the Foundry `ready` hook.
 */
export function checkLoremaster() {
  if (!game.user.isGM) return;

  const configuredId = getLoremasterModuleId();

  // Case 1: GM has never configured the module ID
  if (!configuredId) {
    ui.notifications.warn(
      'Starforged Companion: Loremaster module ID is not configured. ' +
      'Open Module Settings → Loremaster Module ID and enter the ID from ' +
      "Loremaster's module.json. Run [...game.modules.keys()].filter(k => k.includes(\"lore\")) " +
      'in the console to find it.',
      { permanent: true }
    );
    return;
  }

  // Case 2: Module ID is set but Loremaster is not installed
  const mod = game.modules.get(configuredId);
  if (!mod) {
    ui.notifications.warn(
      `Starforged Companion: Loremaster ("${configuredId}") is not installed. ` +
      'Install it via the Loremaster Patreon before running a session.',
      { permanent: true }
    );
    return;
  }

  // Case 3: Installed but not active
  if (!mod.active) {
    ui.notifications.warn(
      `Starforged Companion: Loremaster ("${configuredId}") is installed but not active. ` +
      'Enable it in your module list.',
      { permanent: true }
    );
    return;
  }

  // All good — log silently
  console.log(`${MODULE_ID} | Loremaster active: ${configuredId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Context delivery — replaces the hardcoded flag path in index.js / postMoveResult()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attach the assembled Loremaster context packet to a chat message's flags.
 *
 * The flag path is:
 *   chatMessage.flags["starforged-companion"][loremasterFlagPath]
 *
 * Loremaster reads from this flag when it processes chat messages. The exact
 * flag path must match Loremaster's injection mechanism — confirm against
 * Loremaster's source or documentation.
 *
 * @param {ChatMessage} chatMessage   — The move result chat message
 * @param {string}      contextPacket — Assembled packet string from assembler.js
 * @returns {Promise<void>}
 */
export async function attachLoremasterContext(chatMessage, contextPacket) {
  if (!chatMessage) return;

  const flagPath = getLoremasterFlagPath();

  try {
    await chatMessage.setFlag(MODULE_ID, flagPath, contextPacket);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to attach Loremaster context to chat message`, err);
  }
}

/**
 * Build the full flag key used when attaching context.
 * Useful for reading context back from a message (e.g. in tests or debugging).
 *
 * @returns {string}  e.g. "starforged-companion.loremasterContext"
 */
export function loremasterContextFlagKey() {
  return `${MODULE_ID}.${getLoremasterFlagPath()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// index.js wiring instructions
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. ADD IMPORT (top of index.js):
//
//   import {
//     registerLoremasterSettings,
//     checkLoremaster,
//     attachLoremasterContext,
//   } from './loremaster.js';
//
// 2. IN init HOOK — add after other registerSettings calls:
//
//   registerLoremasterSettings();
//
// 3. IN ready HOOK — replace the existing checkLoremaster() call:
//
//   checkLoremaster();   // now uses the configured module ID, not the hardcoded placeholder
//
// 4. IN postMoveResult() — replace:
//
//   await chatMessage.setFlag(MODULE_ID, 'loremasterContext', packet);
//
//   WITH:
//
//   import { attachLoremasterContext } from './loremaster.js';
//   await attachLoremasterContext(chatMessage, packet);
//
// 5. DELETE the old checkLoremaster() function from index.js entirely.
//    The new one lives here.
//
// First-session GM setup:
//   Module Settings → "Loremaster Module ID" → enter value from Loremaster's module.json
//   Module Settings → "Loremaster Context Flag Path" → leave as "loremasterContext"
//                     unless Loremaster's source shows a different path
