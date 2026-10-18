/**
 * STARFORGED COMPANION
 * src/multiplayer/gmRelay.js — run a world-writing action on the canonical GM
 *
 * Background
 * ----------
 * World-scoped settings (campaignState) and other players' documents can only
 * be written by a GM. Several player-facing flows — Set a Flag, Begin / End a
 * Session, the X-Card, `!bond`, `!truth` / `!state`, `!repair`, the Burn
 * Momentum / Improve Result / milestone-picker / connection-picker / won-fight
 * buttons — are invoked on the player's own client, so their writes were
 * silently skipped (`if (isGM)` guards) while the chat card claimed the effect
 * had landed. Before the 2026-10 audit some of these only "worked" by
 * accident: the createChatMessage hook ran every `!command` on every connected
 * client, so the GM's client executed the player's command with GM authority.
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
 *   announceGmRelayReady() / onGmRelayReady(callback)
 *     - Relays are fire-and-forget: a relay emitted while the GM's client is
 *       still loading (before its `ready` hook installs the listener) reaches
 *       no handler and is dropped. So once the canonical GM's listener is
 *       installed it broadcasts `{ kind: GM_RELAY_READY_KIND }`, and player
 *       clients that need to (re-)send state — e.g. their Private Lines —
 *       register onGmRelayReady(() => …) to answer it (pull, not push).
 *
 * Serialisation
 * -------------
 * Every action runs through ONE promise queue on the canonical GM
 * (runGmAction, local and socket paths alike), so handlers' campaignState
 * read-modify-writes never interleave (two Private Lines syncs, a `!bond`
 * landing mid-End a Session, …). A handler that rejects releases the queue in
 * a `finally`; one that never settles is waited on for at most
 * GM_ACTION_TIMEOUT_MS (warned) before the next action runs anyway — one bad
 * action can never wedge every later relay. Consequences:
 *   - a long handler (an oracle follow-up's or End a Session's Claude call)
 *     delays later relays until it settles or times out;
 *   - a handler must NOT call requestGmAction itself on the canonical GM — the
 *     nested action would queue behind its own caller until the timeout.
 * The exception is the X-Card (UNQUEUED_ACTIONS): it runs the moment it
 * arrives. Queued behind a Claude-calling handler it waited up to the timeout
 * while the move pipeline — which is not queued — narrated straight through
 * it. Running it unqueued is safe because suppressScene reads and writes the
 * store with no await in between, and no handler writes back a campaignState
 * snapshot held across an await (each merges only the fields it owns onto the
 * latest store — decisions.md → "Long-running pipeline writes merge
 * relay-owned fields").
 *
 * Trust model — read before relying on a permission check
 * -------------------------------------------------------
 * Foundry's module socket does not tell a listener which user emitted a
 * message (docs/foundry-reference/foundry-api-reference.md → "Sockets"), so
 * `requesterId` is CLIENT-ASSERTED: it is whatever the emitting client put in
 * the payload. Handler permission checks (ctx.requesterIsGM,
 * requesterOwnsActor, "a client may only write its own Private Lines") keep
 * honest clients — and the module's own UI — from acting on someone else's
 * behalf. They do NOT stop a player who emits a hand-crafted relay from the
 * browser console or a macro. Handlers also validate and clamp payload VALUES
 * (bond.apply, milestone.pick, connection.pick) so even a forged request can
 * only cause an effect the UI could legitimately have produced.
 *
 * Declared actions vs legacy relays
 * ---------------------------------
 * New relayable actions are declared in GM_ACTIONS below — one kind, one
 * handler, one owning module. The table is declarative so a grep for a
 * handler's export name finds its consumer (rules/reachability.md), and so the
 * canonical GM can serve a relay even when the owning module has not been
 * loaded on its client yet (each entry lazily imports its module).
 *
 * Older ad-hoc relays still share the same socket channel with their own
 * `kind`s and listeners (not gmRelay-prefixed, so this listener ignores them):
 *   - "expedition.recommit", "combat.enterFray"   — src/index.js
 *   - "vow.setReward", "vow.linkConnection"       — src/session/swearVow.js
 *   - "errorLog.append"                           — src/logging/errorLog.js
 *   - "audio.cache.write", "audio.synth.*"        — src/audio/index.js
 * The world-writing ones (the first four) predate this module, have no
 * requester context, no serialisation and no no-GM warning; fold them into
 * GM_ACTIONS when next touched.
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
 * Socket `kind` the canonical GM broadcasts once its relay listener is
 * installed (announceGmRelayReady). Not an action — never dispatched to
 * GM_ACTIONS.
 */
export const GM_RELAY_READY_KIND = `${GM_RELAY_KIND_PREFIX}ready`;

/**
 * How long a queued action waits for the action ahead of it before running
 * anyway (with a warning), so a handler that never settles cannot block later
 * relays. Generous: an action may make a Claude call (oracle follow-up
 * narration, session vignettes).
 */
export const GM_ACTION_TIMEOUT_MS = 60_000;

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
  "connection.pick":           { load: () => import("../moves/cardActions.js"),                      fn: "applyConnectionPick" },
  "fightVow.markMilestone":    { load: () => import("../moves/cardActions.js"),                      fn: "applyFightVowMarkMilestone" },
  "fightVow.deepenBond":       { load: () => import("../moves/cardActions.js"),                      fn: "applyFightVowDeepenBond" },
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

// ─────────────────────────────────────────────────────────────────────────────
// GM-side action queue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kinds that run immediately instead of waiting in the queue — the X-Card must
 * take effect the moment it is played (see "Serialisation" in the header).
 */
const UNQUEUED_ACTIONS = new Set(["xcard.activate"]);

// Tail of the queue: resolves when the last enqueued action has released it.
// Gates only ever resolve (never reject), so a failed action cannot poison the
// chain. `_pending` counts actions queued or running; while it is 0 the queue
// is idle and a new action starts without arming any timer.
let _queueTail = Promise.resolve();
let _pending   = 0;

const WAIT_TIMED_OUT = Symbol("gmRelay.waitTimedOut");

/**
 * Run `task` after every previously enqueued action has released the queue.
 * The caller gets the task's own result (or rejection). The queue is released
 * in a `finally` when the task settles; an action that waits more than
 * `timeoutMs` for its predecessor (a handler that never settles) is warned
 * about and run anyway, so a hung handler cannot wedge every later relay.
 *
 * @template T
 * @param {string} kind
 * @param {() => Promise<T>} task
 * @param {number} [timeoutMs]
 * @returns {Promise<T>}
 */
function enqueueGmAction(kind, task, timeoutMs = GM_ACTION_TIMEOUT_MS) {
  const prev = _queueTail;
  const idle = _pending === 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  _queueTail = gate;
  _pending += 1;

  return (async () => {
    try {
      if (!idle) await waitForPrevious(prev, kind, timeoutMs);
      return await task();
    } finally {
      _pending = Math.max(0, _pending - 1);
      release();
    }
  })();
}

/** Wait for the previous action's gate, at most `timeoutMs` (then warn). */
async function waitForPrevious(prev, kind, timeoutMs) {
  let timer = null;
  const timedOut = new Promise(resolve => { timer = setTimeout(() => resolve(WAIT_TIMED_OUT), timeoutMs); });
  try {
    const outcome = await Promise.race([prev, timedOut]);
    if (outcome === WAIT_TIMED_OUT) {
      console.warn(
        `${MODULE_ID} | gmRelay: the action ahead of "${kind}" is still running after ${timeoutMs}ms — ` +
        `running "${kind}" anyway so the queue is not wedged.`,
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve and run one action on this client, serialised behind every other
 * action this client is running (see "Serialisation" above) unless its kind is
 * in UNQUEUED_ACTIONS. Throws when the kind is unknown or the owning module
 * does not export the handler (a wiring bug — surfaced, never swallowed).
 *
 * @param {string} kind
 * @param {Object} payload
 * @param {{ requesterId?: string|null, local?: boolean }} [meta]
 * @returns {Promise<*>} the handler's return value
 */
export async function runGmAction(kind, payload = {}, { requesterId = null, local = false } = {}) {
  const entry = GM_ACTIONS[kind];
  if (!entry) throw new Error(`gmRelay: unknown action kind "${kind}"`);

  const task = async () => {
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
  };
  return UNQUEUED_ACTIONS.has(kind) ? task() : enqueueGmAction(kind, task);
}

/**
 * Ask the canonical GM to perform a world-writing action.
 *
 * @param {string} kind     a key of GM_ACTIONS
 * @param {Object} [payload] plain JSON-serialisable data
 * @returns {Promise<{ ok: boolean, relayed?: boolean, reason?: string, result?: * }>}
 *   `result` (local runs only) is the handler's return value.
 */
export async function requestGmAction(kind, payload = {}) {
  if (!GM_ACTIONS[kind]) throw new Error(`gmRelay: unknown action kind "${kind}"`);
  const requesterId = globalThis.game?.user?.id ?? null;

  if (isCanonicalGM()) {
    const result = await runGmAction(kind, payload, { requesterId, local: true });
    return { ok: true, relayed: false, result };
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
    // The GM-ready broadcast shares the prefix but is not an action — players'
    // onGmRelayReady listeners handle it.
    if (rawKind === GM_RELAY_READY_KIND) return;
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
        // CLIENT-ASSERTED: the module socket does not identify the sender, so
        // this is whatever the emitting client wrote into the payload. The
        // handlers' permission checks built on it protect honest clients
        // only — a hand-crafted emit can claim any user id (see the header,
        // "Trust model").
        requesterId: typeof message.requesterId === "string" ? message.requesterId : null,
        local:       false,
      });
    } catch (err) {
      console.error(`${MODULE_ID} | gmRelay: action "${kind}" failed:`, err);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GM-ready broadcast
// ─────────────────────────────────────────────────────────────────────────────

const _readyCallbacks = new Set();

/**
 * Broadcast that the canonical GM's relay listener is now installed. Called
 * from the `ready` hook right after registerGmRelaySocket(). Only the
 * canonical GM announces (players and other GMs log and skip).
 *
 * @returns {boolean} true when the broadcast was emitted
 */
export function announceGmRelayReady() {
  if (!isCanonicalGM()) {
    console.debug?.(`${MODULE_ID} | gmRelay: not the canonical GM — no relay-ready broadcast from this client.`);
    return false;
  }
  if (!globalThis.game?.socket?.emit) {
    console.warn(`${MODULE_ID} | gmRelay: game.socket unavailable — relay-ready broadcast not sent.`);
    return false;
  }
  globalThis.game.socket.emit(GM_RELAY_SOCKET, { kind: GM_RELAY_READY_KIND });
  return true;
}

/**
 * Run `callback()` on this (non-GM) client whenever the canonical GM announces
 * its relay listener is ready. The socket listener is installed once; every
 * registered callback runs per announcement. GM clients ignore the broadcast
 * (they write world state directly). A callback that throws or rejects is
 * logged and does not stop the others.
 *
 * @param {() => (void|Promise<void>)} callback
 */
export function onGmRelayReady(callback) {
  if (typeof callback !== "function") {
    throw new TypeError("gmRelay: onGmRelayReady needs a callback function");
  }
  _readyCallbacks.add(callback);
  if (onGmRelayReady._installed) return;
  if (!globalThis.game?.socket?.on) {
    console.warn(`${MODULE_ID} | gmRelay: game.socket unavailable — relay-ready listener not installed yet.`);
    return;
  }
  onGmRelayReady._installed = true;

  globalThis.game.socket.on(GM_RELAY_SOCKET, (message) => {
    if (message?.kind !== GM_RELAY_READY_KIND) return;
    if (globalThis.game?.user?.isGM) {
      console.debug?.(`${MODULE_ID} | gmRelay: relay-ready broadcast ignored on a GM client.`);
      return;
    }
    for (const cb of _readyCallbacks) {
      try {
        const out = cb();
        if (out && typeof out.catch === "function") {
          out.catch(err => console.warn(`${MODULE_ID} | gmRelay: relay-ready callback failed:`, err?.message ?? err));
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | gmRelay: relay-ready callback failed:`, err?.message ?? err);
      }
    }
  });
}

/** Test seam — forget the install guards, the ready callbacks and the queue. */
export function _resetGmRelayForTests() {
  registerGmRelaySocket._installed = false;
  onGmRelayReady._installed = false;
  _readyCallbacks.clear();
  _queueTail = Promise.resolve();
  _pending   = 0;
}
