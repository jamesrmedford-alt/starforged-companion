/**
 * STARFORGED COMPANION
 * src/private-channel/index.js — Private Channel module entry
 *
 * Registers the feature's settings and exposes the gated open wrapper. The
 * toolbar tool itself is registered by src/index.js (buildCompanionTools() +
 * the renderSceneControls buttonMap) per private-channel-scope.md §6 — this
 * module supplies the click target and the enable gate.
 */

import { PrivateChannelApp } from "./app.js";

const MODULE_ID = "starforged-companion";

export function registerPrivateChannelSettings() {
  game.settings.register(MODULE_ID, "privateChannel.enabled", {
    name:    "Private Channel",
    hint:    "Per-player side window for a private narrator conversation. When off, the toolbar button is hidden for all players.",
    scope:   "world",
    config:  false,
    type:    Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, "privateChannel.windowPosition", {
    scope:   "client",
    config:  false,
    type:    Object,
    default: { left: null, top: null, width: 480, height: 640 },
  });
}

/** @returns {boolean} master gate for the feature (default true). */
export function isPrivateChannelEnabled() {
  try { return game.settings?.get?.(MODULE_ID, "privateChannel.enabled") !== false; }
  catch { return true; }
}

/**
 * Open the calling user's private channel window. No-op (with a notice) when the
 * feature is disabled — a belt to the toolbar's hidden state.
 * @returns {Promise<PrivateChannelApp>|null}
 */
export function openPrivateChannel() {
  if (!isPrivateChannelEnabled()) {
    globalThis.ui?.notifications?.info?.("The Private Channel is disabled in Companion Settings.");
    return null;
  }
  return PrivateChannelApp.open({ userId: game.user.id });
}
