/**
 * STARFORGED COMPANION
 * src/private-channel/index.js — Private Channel module entry
 *
 * Registers the feature's settings and exposes the gated open wrapper. The
 * launcher button itself lives on the floating Companion toolbar
 * (src/ui/companionToolbar.js); its visibility is gated by
 * isPrivateChannelEnabled() exported here — this module supplies the click
 * target (openPrivateChannel) and the enable gate.
 */

import { PrivateChannelApp } from "./app.js";

const MODULE_ID = "starforged-companion";

// This client's listeners for a change of the Private Channel switch — the
// floating toolbar, whose ✦ button the switch shows or hides.
const _toggleListeners = new Set();

/**
 * Call `fn(enabled)` whenever the Private Channel setting changes on this
 * client (the setting's onChange runs on every client). The toolbar listens,
 * so the switch shows or hides its button at once (issue #326 W86).
 *
 * @param {(enabled: boolean) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onPrivateChannelToggled(fn) {
  _toggleListeners.add(fn);
  return () => _toggleListeners.delete(fn);
}

function notifyPrivateChannelToggled(enabled) {
  for (const fn of _toggleListeners) {
    try { fn(enabled); }
    catch (err) { console.warn(`${MODULE_ID} | Private Channel toggle listener failed:`, err?.message ?? err); }
  }
}

export function registerPrivateChannelSettings() {
  game.settings.register(MODULE_ID, "privateChannel.enabled", {
    name:    "Private Channel",
    hint:    "Per-player side window for a private narrator conversation. When off, the toolbar button is hidden for all players.",
    scope:   "world",
    config:  false,
    type:    Boolean,
    default: true,
    // The toolbar computes its buttons when it renders: without this, every
    // client kept the old button set until a reload (issue #326 W86).
    onChange: (value) => notifyPrivateChannelToggled(value !== false),
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
