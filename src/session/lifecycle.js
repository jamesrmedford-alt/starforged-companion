/**
 * STARFORGED COMPANION
 * src/session/lifecycle.js — Session-active gate state machine.
 *
 * The module exposes three primitives for the rest of the codebase:
 *
 *   - `isSessionActive(campaignState)`  — read-only check the chat-hook
 *      gate calls before allowing automatic narration / paced detection
 *      / move-pipeline interception. Defaults to false (a fresh world
 *      with no campaignState mutation is treated as "not started").
 *
 *   - `beginSession(campaignState)`     — flips the gate ON and stamps
 *      `sessionActiveStartedAt`. GM-only — `campaignState` is a world-
 *      scoped game.settings document, so non-GM callers would hit a
 *      permissions error on the write. The caller persists; this
 *      function only mutates the in-memory packet.
 *
 *   - `endSession(campaignState)`       — flips the gate OFF and clears
 *      `sessionActiveStartedAt`. End a Session also marks the session
 *      ended (`sessionEndedId`, set by its relay handler).
 *
 * And the session-id cohort (issue #286 C4) — which session the ring, the
 * rolling summary and recent oracles belong to:
 *
 *   - `sessionNeedsMint(campaignState)` — a session is over once End a
 *      Session marked it, or after SESSION_IDLE_HOURS without chat
 *      activity. It used to be any reload four hours after the session was
 *      minted, so a long session re-minted mid-play, and End → Begin kept
 *      the same id.
 *   - `rollSessionIfDue(campaignState)` — at world load (src/index.js
 *      ready) and Begin a Session: when the session is over, bring its
 *      rolling summary up to date, close its scene under its own id, then
 *      `mintSession` — which keeps that summary as `previousSessionSummary`
 *      (issue #286 C3) for the narrator's LAST SESSION block.
 *   - `registerSessionActivityHook()` — the canonical GM refreshes
 *      `lastSessionTimestamp` on chat activity, at most every
 *      ACTIVITY_STAMP_MINUTES. Activity extends a live session; it never
 *      revives one that has gone idle.
 *
 * Why a separate module instead of inlining into src/index.js: the
 * SessionPanel UI in src/ui/sessionPanel.js needs to call these
 * functions without pulling in the entire index.js chat-hook surface,
 * and the Quench batch needs to verify the state machine in isolation
 * from the UI.
 */

import { isCanonicalGM } from "../multiplayer/gmGate.js";

const MODULE_ID = "starforged-companion";

/**
 * @param {Object|null|undefined} campaignState
 * @returns {boolean}
 */
export function isSessionActive(campaignState) {
  return campaignState?.sessionActive === true;
}

/**
 * Flip the gate ON. Returns the same `campaignState` reference (mutated
 * in place) so the caller can chain: `await persistCampaignState(state)`.
 *
 * Idempotent — calling it on an already-active session leaves the
 * existing `sessionActiveStartedAt` unchanged so the timer is stable
 * across accidental double-clicks of the Begin Session button.
 *
 * @param {Object} campaignState
 * @returns {Object}
 */
export function beginSession(campaignState) {
  if (!campaignState) throw new Error("beginSession requires a campaignState");
  if (campaignState.sessionActive === true) return campaignState;

  campaignState.sessionActive = true;
  campaignState.sessionActiveStartedAt = new Date().toISOString();
  return campaignState;
}

/**
 * Flip the gate OFF. Returns the same `campaignState` reference (mutated
 * in place). Idempotent on already-ended sessions.
 *
 * @param {Object} campaignState
 * @returns {Object}
 */
export function endSession(campaignState) {
  if (!campaignState) throw new Error("endSession requires a campaignState");
  if (campaignState.sessionActive !== true) {
    // Clear the stamp even on already-inactive states so a half-broken
    // packet (stamp set but flag false) self-heals on the next end.
    campaignState.sessionActiveStartedAt = null;
    return campaignState;
  }

  campaignState.sessionActive = false;
  campaignState.sessionActiveStartedAt = null;
  return campaignState;
}

/**
 * Minutes elapsed since the active session started. Used by the panel
 * for the "Active for N minutes" badge. Returns 0 when the session is
 * inactive or the stamp is missing.
 *
 * @param {Object|null|undefined} campaignState
 * @param {Date} [now] — injectable for testing
 * @returns {number}
 */
export function sessionMinutesActive(campaignState, now = new Date()) {
  if (!isSessionActive(campaignState)) return 0;
  const stamp = campaignState?.sessionActiveStartedAt;
  if (!stamp) return 0;
  const started = Date.parse(stamp);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((now.getTime() - started) / 60_000));
}


// ─────────────────────────────────────────────────────────────────────────────
// Session-id cohort (issue #286 C3, C4)
// ─────────────────────────────────────────────────────────────────────────────

/** Hours without chat activity after which the session is over. */
export const SESSION_IDLE_HOURS = 4;

/** Chat activity refreshes `lastSessionTimestamp` at most this often. */
const ACTIVITY_STAMP_MINUTES = 10;

/** campaignState fields mintSession writes — what its caller persists. */
export const SESSION_MINT_FIELDS = Object.freeze([
  "currentSessionId",
  "sessionNumber",
  "lastSessionTimestamp",
  "sessionEndedId",
  "previousSessionSummary",
]);

/** Milliseconds since the session was last seen live; Infinity when unknown. */
function idleMs(campaignState, now) {
  const last = Date.parse(campaignState?.lastSessionTimestamp ?? "");
  return Number.isFinite(last) ? now - last : Infinity;
}

function hasSceneContent(campaignState) {
  return !!(campaignState.currentSceneId
    || (campaignState.sceneTruths?.length ?? 0) > 0
    || Object.keys(campaignState.sceneState?.bySubject ?? {}).length > 0);
}

function newSessionId() {
  return globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 18);
}

/**
 * Whether the session in campaignState is over, so the next world load or
 * Begin a Session starts a new one: there is none yet, End a Session marked
 * it, or nothing has been posted to chat for SESSION_IDLE_HOURS.
 *
 * @param {Object} campaignState
 * @param {number} [now] — epoch ms (injectable for tests)
 * @returns {boolean}
 */
export function sessionNeedsMint(campaignState, now = Date.now()) {
  const id = campaignState?.currentSessionId;
  if (!id) return true;
  if (campaignState.sessionEndedId === id) return true;
  return idleMs(campaignState, now) >= SESSION_IDLE_HOURS * 3_600_000;
}

/**
 * Start a new session: keep the closing session's rolling summary as
 * `previousSessionSummary` (an older one stays when the closing session has
 * none), then mint the id, bump `sessionNumber` and stamp
 * `lastSessionTimestamp`. Mutates and returns campaignState; the caller
 * persists SESSION_MINT_FIELDS.
 *
 * @param {Object} campaignState
 * @param {number} [now] — epoch ms
 * @returns {Object}
 */
export function mintSession(campaignState, now = Date.now()) {
  const closing = campaignState.currentSessionId;
  const summary = campaignState.sessionSummary;
  if (closing && summary?.sessionId === closing && typeof summary.text === "string" && summary.text.trim()) {
    campaignState.previousSessionSummary = {
      sessionId:     closing,
      sessionNumber: campaignState.sessionNumber ?? null,
      text:          summary.text.trim(),
      updatedAt:     summary.updatedAt ?? null,
    };
  }
  campaignState.currentSessionId     = newSessionId();
  campaignState.sessionNumber        = (campaignState.sessionNumber ?? 0) + 1;
  campaignState.lastSessionTimestamp = new Date(now).toISOString();
  campaignState.sessionEndedId       = null;
  return campaignState;
}

/**
 * At world load and Begin a Session, on the canonical GM: when the session is
 * over (sessionNeedsMint), close it out and mint the next one. A session
 * nobody ended first gets its rolling summary brought up to date — End a
 * Session refreshes its own — so the summary carried forward covers all of
 * it. Its scene closes under its own id, so migrated truths, whereabouts and
 * strikes keep that session's number. Mutates campaignState; endScene
 * persists the scene fields itself, the caller persists SESSION_MINT_FIELDS.
 *
 * @param {Object} campaignState
 * @param {Object} [opts]
 * @param {number} [opts.now] — epoch ms
 * @returns {Promise<boolean>} true when a new session was minted
 */
export async function rollSessionIfDue(campaignState, { now = Date.now() } = {}) {
  if (!sessionNeedsMint(campaignState, now)) return false;
  const closing = campaignState.currentSessionId;
  const ended   = !!closing && campaignState.sessionEndedId === closing;
  if (closing && !ended) {
    try {
      const { finalizeSessionSummary } = await import("../narration/narrator.js");
      await finalizeSessionSummary(campaignState);
    } catch (err) {
      console.warn(`${MODULE_ID} | session roll: summary finalise failed:`, err?.message ?? err);
    }
  }
  if (closing && hasSceneContent(campaignState)) {
    try {
      const { endScene } = await import("../factContinuity/sceneLifecycle.js");
      await endScene(campaignState, { reason: ended ? "session_close" : "session_gap_remint" });
    } catch (err) {
      console.warn(`${MODULE_ID} | session roll: stale-scene close failed:`, err?.message ?? err);
    }
  }
  mintSession(campaignState, now);
  return true;
}

let _stampInFlight = false;

/**
 * Keep the session alive while the table plays: on the canonical GM, every
 * chat message may refresh `lastSessionTimestamp` (touchSessionActivity), so
 * the idle check measures from the last message rather than from the mint.
 */
export function registerSessionActivityHook() {
  Hooks.on("createChatMessage", () => {
    if (!isCanonicalGM()) return;
    touchSessionActivity().catch(err =>
      console.warn(`${MODULE_ID} | session activity stamp failed:`, err?.message ?? err));
  });
}

/**
 * Refresh `lastSessionTimestamp` on the latest stored campaignState, at most
 * every ACTIVITY_STAMP_MINUTES. Activity extends a live session; it never
 * revives one that is over — after SESSION_IDLE_HOURS, or once End a Session
 * marked it — so the message that opens Begin a Session cannot cancel the new
 * session that Begin is about to start.
 *
 * @param {number} [now] — epoch ms
 * @returns {Promise<boolean>} true when the timestamp was written
 */
export async function touchSessionActivity(now = Date.now()) {
  if (_stampInFlight) return false;
  const latest = game.settings.get(MODULE_ID, "campaignState");
  if (!latest?.currentSessionId || sessionNeedsMint(latest, now)) return false;
  if (idleMs(latest, now) < ACTIVITY_STAMP_MINUTES * 60_000) return false;
  _stampInFlight = true;
  try {
    await game.settings.set(MODULE_ID, "campaignState", {
      ...latest,
      lastSessionTimestamp: new Date(now).toISOString(),
    });
  } finally {
    _stampInFlight = false;
  }
  return true;
}
