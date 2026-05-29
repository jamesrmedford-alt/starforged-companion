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
 *      `sessionActiveStartedAt`. The `sessionNumber` / `currentSessionId`
 *      tracking on the schema is unchanged here — those are managed by
 *      `initSessionId()` in src/index.js on world ready and on the 4h
 *      gap. End Session marks the *active* state, not the session-id
 *      cohort.
 *
 * Why a separate module instead of inlining into src/index.js: the
 * SessionPanel UI in src/ui/sessionPanel.js needs to call these
 * functions without pulling in the entire index.js chat-hook surface,
 * and the Quench batch needs to verify the state machine in isolation
 * from the UI.
 */

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
