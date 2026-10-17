/**
 * STARFORGED COMPANION
 * src/multiplayer/gmRelay.js — run a world-writing action on the canonical GM
 *
 * Background
 * ----------
 * World-scoped settings (campaignState) and other players' documents can only
 * be written by a GM. Several player-facing flows — Set a Flag, Begin / End a
 * Session, the X-Card, `!bond`, `!truth` / `!state`, `!repair`, the Burn
 * Momentum / Improve Result / milestone-picker buttons — are invoked on the
 * player's own client, so their writes were silently skipped (`if (isGM)`
 * guards) while the chat card claimed the effect had landed. Before the
 * 2026-10 audit some of these only "worked" by accident: the createChatMessage
 * hook ran every `!command` on every connected client, so the GM's client
 * executed the player's command with GM authority.
 *
 * Contract
 * --------
 *   requestGmAction(kind, payload)
 *     - On the canonical GM: runs the action locally (no socket round-trip).
 *     - Elsewhere: emits `{ kind: "gmRelay.<kind>", payload, requesterId }` on
 *       the module socket; the canonical GM runs it.
 *     - No active GM: warns the requester (no silent failures) and returns
 *       `{ ok: false, reason: "no-gm" }`.
 *   registerGmRelaySocket()
 *     - Installed once on every client from the `ready` hook; only the
 *       canonical GM acts on a relay.
 *
 * Every relayable action is declared in GM_ACTIONS below — one kind, one
 * handler, one owning module. The table is declarative so a grep for a
 * handler's export name finds its consumer (rules/reachability.md), and so
 * the canonical GM can serve a relay even when the owning module has not
 * been loaded on its client yet (each entry lazily imports its module).
 *
 * Handler signature: `async (payload, ctx) => void`, where
 *   ctx = { requesterId, requester, requesterIsGM, local }
 * `requester` is the Foundry User who asked (null if unknown). Handlers that
 * enforce permissions (e.g. GM-only fact-continuity corrections) must check
 * `ctx.requesterIsGM`, never `game.user.isGM` — on the relay path the code is
 * running on the GM's client on the player's behalf.
 */

import { isCanonicalGM } from "./gmGate.js";

const MODULE_ID = "starforged-companion";

/** The module socket channel — shared with the other module relays. */
export const GM_RELAY_SOCKET = `module.${MODULE_ID}`;

/** Socket `kind` prefix that marks a gmRelay message. */
export const GM_RELAY_KIND_PREFIX = "gmRelay.";

/**
 * kind → { load, fn }. `load` imports the owning module; `fn` names the
 * exported handler. Paths are relative to this file.
 */
export const GM_ACTIONS = Object.freeze({
  // Safety
  "xcard.activate":            { load: () => import("../context/safety.js"),                         fn: "suppressScene" },
  "safety.setFlag":            { load: () => import("../safety/sessionDialogs.js"),                  fn: "applySafetyFlag" },
  "session.takeBreak":         { load: () => import("../safety/sessionDialogs.js"),                  fn: "applyTakeBreak" },
  "safety.syncPrivateLines":   { load: () => import("../ui/settingsPanel.js"),                       fn: "applyPrivateLinesSync" },
  // Session lifecycle
  "session.begin":             { load: () => import("../safety/sessionLifecycleDialogs.js"),         fn: "applyBeginSession" },
  "session.end":               { load: () => import("../safety/sessionLifecycleDialogs.js"),         fn: "applyEndSession" },
  // Chat commands
  "bond.apply":                { load: () => import("../moves/bondCommand.js"),                      fn: "applyBondEffects" },
  "factContinuity.command":    { load: () => import("../factContinuity/chatCommands.js"),            fn: "applyFactContinuityCommand" },
  "oracle.narrate":            { load: () => import("../oracles/oracleFollowup.js"),                 fn: "narrateOracleFollowupOnGm" },
  "repair.apply":              { load: () => import("../moves/repair.js"),                           fn: "applyRepairSpends" },
  "payThePrice.advanceClocks": { load: () => import("../clocks/payThePriceClocks.js"),               fn: "advanceClocksForPayThePriceRelay" },
  // Chat-card buttons
  "move.burnMomentum":         { load: () => import("../moves/burnMomentum.js"),                     fn: "applyBurnFromRelay" },
  "move.improveResult":        { load: () => import("../moves/improveResult.js"),                    fn: "applyImproveFromRelay" },
  "milestone.pick":            { load: () => import("../moves/milestonePicker.js"),                  fn: "applyMilestonePick" },
});

/**
 * True when at least one GM is connected.
 * @returns {boolean}
 */
export function hasActiveGM() {
  try {
    return Array.from(globalThis.game?.users ?? []).some(u => u?.isGM && u?.active);
  } catch (err) {
    console.warn(`${MODULE_ID} | gmRelay: active-GM lookup failed:`, err?.message ?? err);
    return false;
  }
}

/**
 * Resolve and run one action on this client. Throws when the kind is unknown
 * or the owning module does not export the handler (a wiring bug — surfaced,
 * never swallowed).
 *
 * @param {string} kind
 * @param {Object} payload
 * @param {{ requesterId?: string|null, local?: boolean }} [meta]
 * @returns {Promise<*>} the handler's return value
 */
export async function runGmAction(kind, payload = {}, { requesterId = null, local = false } = {}) {
  const entry = GM_ACTIONS[kind];
  if (!entry) throw new Error(`gmRelay: unknown action kind "${kind}"`);

  const mod     = await entry.load();
  const handler = mod?.[entry.fn];
  if (typeof handler !== "function") {
    throw new Error(`gmRelay: action "${kind}" has no handler export "${entry.fn}"`);
  }

  const requester = requesterId ? (globalThis.game?.users?.get?.(requesterId) ?? null) : null;
  const ctx = {
    requesterId,
    requester,
    requesterIsGM: !!requester?.isGM,
    local,
  };
  return handler(payload ?? {}, ctx);
}

/**
 * Ask the canonical GM to perform a world-writing action.
 *
 * @param {string} kind     a key of GM_ACTIONS
 * @param {Object} [payload] plain JSON-serialisable data
 * @returns {Promise<{ ok: boolean, relayed?: boolean, reason?: string }>}
 */
export async function requestGmAction(kind, payload = {}) {
  if (!GM_ACTIONS[kind]) throw new Error(`gmRelay: unknown action kind "${kind}"`);
  const requesterId = globalThis.game?.user?.id ?? null;

  if (isCanonicalGM()) {
    await runGmAction(kind, payload, { requesterId, local: true });
    return { ok: true, relayed: false };
  }

  if (!hasActiveGM()) {
    console.warn(`${MODULE_ID} | gmRelay: "${kind}" not applied — no GM is connected.`);
    globalThis.ui?.notifications?.warn?.(
      "Starforged Companion: no GM is connected, so this change could not be saved. " +
      "Try again once a GM has joined.",
    );
    return { ok: false, reason: "no-gm" };
  }

  globalThis.game.socket.emit(GM_RELAY_SOCKET, {
    kind:    `${GM_RELAY_KIND_PREFIX}${kind}`,
    payload: payload ?? {},
    requesterId,
  });
  return { ok: true, relayed: true };
}

/**
 * Install the relay listener (idempotent). Every client installs it; only the
 * canonical GM acts. Other module relays share the channel and filter on their
 * own `kind`s, so non-gmRelay messages are ignored here.
 */
export function registerGmRelaySocket() {
  if (registerGmRelaySocket._installed) return;
  if (!globalThis.game?.socket?.on) {
    console.warn(`${MODULE_ID} | gmRelay: game.socket unavailable — relay listener not installed.`);
    return;
  }
  registerGmRelaySocket._installed = true;

  globalThis.game.socket.on(GM_RELAY_SOCKET, async (message) => {
    const rawKind = message?.kind;
    if (typeof rawKind !== "string" || !rawKind.startsWith(GM_RELAY_KIND_PREFIX)) return;
    const kind = rawKind.slice(GM_RELAY_KIND_PREFIX.length);

    if (!isCanonicalGM()) {
      console.debug?.(`${MODULE_ID} | gmRelay: "${kind}" — not the canonical GM, standing down.`);
      return;
    }
    if (!GM_ACTIONS[kind]) {
      console.warn(`${MODULE_ID} | gmRelay: ignoring unknown action "${kind}".`);
      return;
    }
    try {
      await runGmAction(kind, message.payload ?? {}, {
        requesterId: typeof message.requesterId === "string" ? message.requesterId : null,
        local:       false,
      });
    } catch (err) {
      console.error(`${MODULE_ID} | gmRelay: action "${kind}" failed:`, err);
    }
  });
}

/** Test seam — forget the install guard. */
export function _resetGmRelayForTests() {
  registerGmRelaySocket._installed = false;
}
