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
 *      (issue #286 C3) for the narrator's LAST SESSION block, and closes the
 *      session-active gate: a new session is begun at Begin a Session
 *      (issue #321 U12).
 *   - `registerSessionActivityHook()` — the canonical GM refreshes the
 *      session's activity stamp on chat activity, at most every
 *      ACTIVITY_STAMP_MINUTES — the world setting `sessionActivity`
 *      (`registerSessionActivitySetting`), never campaignState (issue #342
 *      Z01). The idle check measures from the later of it and the mint's
 *      `lastSessionTimestamp` (`sessionLastSeenAt`). Activity extends a live
 *      session; it never revives one that has gone idle.
 *
 * Why a separate module instead of inlining into src/index.js: the
 * SessionPanel UI in src/ui/sessionPanel.js needs to call these
 * functions without pulling in the entire index.js chat-hook surface,
 * and the Quench batch needs to verify the state machine in isolation
 * from the UI.
 */

import { isCanonicalGM } from "../multiplayer/gmGate.js";
import { settledWithin } from "../multiplayer/settleWithin.js";

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

/** Chat activity refreshes the session's activity stamp at most this often. */
const ACTIVITY_STAMP_MINUTES = 10;

/**
 * The chat-activity stamp's own world setting, `{ sessionId, at }` — never a
 * campaignState field (issue #342 Z01). The stamp runs on whatever message
 * lands on the canonical GM, typically while that GM's own campaignState write
 * is still on its way to the server (a relayed X-Card's pause, Set a Flag,
 * Take a Break or End a Session, whose card follows the relay): written as
 * `{ ...cached campaignState, lastSessionTimestamp }`, it was built from a
 * cache that had not seen that write yet, landed after it and put every field
 * back. A setting of its own carries nothing else.
 */
const SESSION_ACTIVITY_SETTING = "sessionActivity";

/** Register the activity stamp's world setting. Call from `init`. */
export function registerSessionActivitySetting() {
  game.settings.register(MODULE_ID, SESSION_ACTIVITY_SETTING, {
    name:    "Session activity",
    scope:   "world",
    config:  false,
    type:    Object,
    default: null,
  });
}

/** campaignState fields mintSession writes — what its caller persists. */
export const SESSION_MINT_FIELDS = Object.freeze([
  "currentSessionId",
  "sessionNumber",
  "lastSessionTimestamp",
  "sessionEndedId",
  "previousSessionSummary",
  "unsummarisedSession",
  "sessionActive",
  "sessionActiveStartedAt",
]);

/** Epoch ms of the activity stamp for `sessionId`; NaN when there is none for it. */
function activityMs(sessionId) {
  if (!sessionId) return NaN;
  let stamp = null;
  try {
    stamp = game.settings.get(MODULE_ID, SESSION_ACTIVITY_SETTING);
  } catch (err) {
    console.debug?.(`${MODULE_ID} | session activity stamp unread:`, err?.message ?? err);
  }
  return stamp?.sessionId === sessionId ? Date.parse(stamp.at ?? "") : NaN;
}

/**
 * Epoch ms the session was last seen live: the later of its mint
 * (`lastSessionTimestamp`) and its last chat-activity stamp; NaN when neither
 * is known.
 */
function lastSeenMs(campaignState) {
  const times = [Date.parse(campaignState?.lastSessionTimestamp ?? ""), activityMs(campaignState?.currentSessionId)]
    .filter(Number.isFinite);
  return times.length ? Math.max(...times) : NaN;
}

/**
 * When the session in campaignState was last seen live — its mint or its
 * latest chat activity, whichever is later — as an ISO string; null when
 * unknown. For display (the settings panel's About pane).
 *
 * @param {Object|null|undefined} campaignState
 * @returns {string|null}
 */
export function sessionLastSeenAt(campaignState) {
  const last = lastSeenMs(campaignState);
  return Number.isFinite(last) ? new Date(last).toISOString() : null;
}

/** Milliseconds since the session was last seen live; Infinity when unknown. */
function idleMs(campaignState, now) {
  const last = lastSeenMs(campaignState);
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

// The session the canonical GM's world load is replacing (issue #342 Z24):
// its mint (rollSessionIfDue) lands only after the summary finalise and the
// scene close, and until it does the stored session still reads live — its
// gate open, its id current. It is over at once: no Batch Mode round reads,
// resolves or opens in it (batch/driver.js), and no typed line is narrated
// into it after its LAST SESSION was taken — under its old id, lost to the
// new session's ring too (index.js's chat gate, issue #345 AA58).
let _sessionBeingReplaced = null;

/**
 * At the canonical GM's world load, before its mint starts — and at any mint's
 * start (rollSessionIfDue: Begin a Session's too, BEGIN-MINT-LINE-WINDOW):
 * when the stored session is over (sessionNeedsMint), it is the one being
 * replaced.
 *
 * @param {Object} campaignState — as the load (or the mint) read it
 * @param {number} [now] — epoch ms
 */
export function noteSessionBeingReplaced(campaignState, now = Date.now()) {
  _sessionBeingReplaced = sessionNeedsMint(campaignState, now) ? (campaignState?.currentSessionId ?? "") : null;
}

// The world load's session mint on this client, until it is persisted
// (serialiseSessionMint); a Begin a Session waits for it (sessionMintsSettled).
let _mintChain = Promise.resolve();

/**
 * How long a Begin waits for the load's mint: as long as a Begin waits for
 * the Begin ahead (sessionLifecycleDialogs.js SESSION_CHAIN_WAIT_MS) — a mint
 * whose write the server never answers must not hold every later Begin (issue
 * #347 AB05).
 */
const SESSION_MINT_WAIT_MS = 5 * 60_000;

/**
 * Run the world load's session mint — rollSessionIfDue and the persist of
 * what it minted — as the mint a Begin a Session waits for
 * (sessionMintsSettled). The load's mint and a Begin landing during its
 * summary call both read the closing session as over and both minted; the
 * load's write then overwrote Begin's session id and its open gate
 * (SESSION-MINT-RACE). Behind the load's, Begin reads the session the load
 * minted, which needs no mint, and begins it. (Begins wait for each other on
 * their own chain; the load's mint starts at `ready`, before a Begin can be
 * relayed to this page.) The caller gets the task's own result or rejection.
 *
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export function serialiseSessionMint(task) {
  const run = _mintChain.then(() => task());
  _mintChain = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Settles once the world load's mint on this client has been persisted (or
 * failed) — at most SESSION_MINT_WAIT_MS, warned. Begin a Session and the
 * Campaign Start's begin read campaignState only after it (SESSION-MINT-RACE).
 *
 * @returns {Promise<boolean>} whether it settled in time
 */
export function sessionMintsSettled() {
  return settledWithin(_mintChain, SESSION_MINT_WAIT_MS, "the world load's session mint");
}

/**
 * A mint has landed — the load's, or Begin a Session's: the session it replaced is no longer current.
 * (A refused mint leaves the note: the stored session stays over until the
 * next mint — a Begin a Session — changes its id.)
 */
export function noteSessionReplaced() {
  _sessionBeingReplaced = null;
}

/**
 * True while campaignState still holds the session this client's world load
 * is replacing; false once the mint has landed (or a newer session is current).
 *
 * @param {Object} campaignState
 * @returns {boolean}
 */
export function sessionBeingReplaced(campaignState) {
  if (_sessionBeingReplaced === null) return false;
  if ((campaignState?.currentSessionId ?? "") === _sessionBeingReplaced) return true;
  _sessionBeingReplaced = null;
  return false;
}

/**
 * Start a new session: keep the closing session's rolling summary as
 * `previousSessionSummary` (an older one stays when the closing session has
 * none; a closing session nobody began adds its summary to the older one,
 * which keeps its number — issue #331 X65), then mint the id, bump
 * `sessionNumber` and stamp
 * `lastSessionTimestamp`. `sessionNumber` counts the sessions a table began:
 * a closing session nobody began (no Begin stamped it `sessionStartedId`,
 * its gate is shut, and End a Session did not close it — issue #331 X64) — a
 * world opened only to prepare — hands its number on
 * to the next instead of burning one, so the table's session after session 3
 * is "Session #4" however often the world was opened between them (issue
 * #330 D12). The id changes either way. The new session has not been begun, so its
 * session-active gate is closed until Begin a Session opens it: a session
 * nobody ended (it went idle) used to hand its open gate to the next one —
 * "Active" since last week, Begin disabled, and the campaign clocks, the
 * Spotlight Vignette and the foci skipped (issue #321 U12). Mutates and
 * returns campaignState; the caller persists SESSION_MINT_FIELDS.
 *
 * @param {Object} campaignState
 * @param {number} [now] — epoch ms
 * @returns {Object}
 */
/**
 * Whether the session `campaignState` is about to close out was never begun:
 * Begin a Session (or the Campaign Start's) stamped it, its gate is open —
 * only a Begin opens it, and a world from before the stamp has its open gate
 * to show for it — or End a Session closed it. A session ended before the
 * stamp existed (issue #300 F11), or begun by a Campaign Start before it
 * stamped, read as unbegun: the next session took its number, and the count
 * stayed one behind (issue #331 X64).
 *
 * @param {Object} campaignState
 * @returns {boolean}
 */
function closingSessionUnbegun(campaignState) {
  const closing = campaignState?.currentSessionId;
  return !!closing && campaignState.sessionStartedId !== closing
    && campaignState.sessionActive !== true && campaignState.sessionEndedId !== closing;
}

export function mintSession(campaignState, now = Date.now()) {
  const closing = campaignState.currentSessionId;
  const summary = campaignState.sessionSummary;
  const closingUnbegun = closingSessionUnbegun(campaignState);
  if (closing && summary?.sessionId === closing && typeof summary.text === "string" && summary.text.trim()) {
    const text     = summary.text.trim();
    const prev     = campaignState.previousSessionSummary;
    const prevText = typeof prev?.text === "string" ? prev.text.trim() : "";
    if (closingUnbegun && prevText) {
      // What was narrated in a session nobody began — a world opened to
      // prepare (`@scene`, `!oracle`) — is added to the summary of the
      // session before it, which stays LAST SESSION under its own number. It
      // replaced that summary, so the narrator lost what the table last
      // played (issue #331 X65).
      campaignState.previousSessionSummary = {
        ...prev,
        text:      `${prevText}\n\nNarrated between sessions, while no session was begun: ${text}`,
        updatedAt: summary.updatedAt ?? prev.updatedAt ?? null,
      };
    } else {
      campaignState.previousSessionSummary = {
        sessionId:     closing,
        // An unbegun session's number passes to the next one, so its summary
        // carries none — LAST SESSION, not "Session 4" while session 4 runs.
        sessionNumber: closingUnbegun ? null : (campaignState.sessionNumber ?? null),
        text,
        updatedAt:     summary.updatedAt ?? null,
      };
    }
  }
  campaignState.currentSessionId       = newSessionId();
  campaignState.sessionNumber          = closingUnbegun && campaignState.sessionNumber > 0
    ? campaignState.sessionNumber
    : (campaignState.sessionNumber ?? 0) + 1;
  campaignState.lastSessionTimestamp   = new Date(now).toISOString();
  campaignState.sessionEndedId         = null;
  campaignState.sessionActive          = false;
  campaignState.sessionActiveStartedAt = null;
  return campaignState;
}

/**
 * At world load and Begin a Session, on the canonical GM: when the session is
 * over (sessionNeedsMint), close it out and mint the next one. The closing
 * session first gets its rolling summary brought up to date
 * (finalizeSessionSummary, no call when it covers every card), so the summary
 * carried forward covers all of it — an ended session's too. End a Session
 * refreshes its own, but that refresh can fail or never land; a Batch Mode
 * round resolving at End, or a move narrated while End runs, posts into the
 * ended session after it (issue #345 AA21 — the mint kept any ended summary
 * with text, and LAST SESSION missed the session's last beats); and an X-Card
 * played on End's closing vignette empties a summary that covered the beat it
 * removed (issue #342 Z41). End's own closing vignette, which posts after its
 * refresh, is the one card left out of that check — not worth a second
 * summary call. Its scene closes under its own id, so migrated
 * truths, whereabouts and strikes keep that session's number. Mutates
 * campaignState; endScene persists the scene fields itself, the caller
 * persists SESSION_MINT_FIELDS.
 *
 * @param {Object} campaignState
 * @param {Object} [opts]
 * @param {number} [opts.now] — epoch ms
 * @returns {Promise<boolean>} true when a new session was minted
 */
export async function rollSessionIfDue(campaignState, { now = Date.now() } = {}) {
  if (!sessionNeedsMint(campaignState, now)) return false;
  // The closing session is over at once, for every caller — the world load and
  // Begin a Session alike: no typed line is narrated into it, and no Batch
  // Mode round reads, resolves or opens in it, while its summary call and
  // scene close run (issue #345 AA58's window, at Begin's own mint —
  // BEGIN-MINT-LINE-WINDOW). The note clears itself once the minted session is
  // stored (sessionBeingReplaced).
  noteSessionBeingReplaced(campaignState, now);
  const closing = campaignState.currentSessionId;
  const ended   = !!closing && campaignState.sessionEndedId === closing;
  // Whether the closing session's summary covers it now. The finalise is
  // fail-open — no key on this client yet, or its one call failed — and the
  // mint goes ahead regardless; a session closed out short is marked, and
  // LAST SESSION summarised from its cards once a keyed canonical GM can
  // (narrator.js catchUpUnsummarisedSession, issue #347 AB15). It was never
  // looked at again.
  let caughtUp = true;
  if (closing) {
    try {
      const { finalizeSessionSummary } = await import("../narration/narrator.js");
      caughtUp = (await finalizeSessionSummary(campaignState)) !== false;
    } catch (err) {
      caughtUp = false;
      console.warn(`${MODULE_ID} | session roll: summary finalise failed:`, err?.message ?? err);
    }
  }
  // A session nobody began is folded into the one before it (X65): not marked.
  const unsummarised = closing && !caughtUp && !closingSessionUnbegun(campaignState)
    ? { sessionId: closing, sessionNumber: campaignState.sessionNumber ?? null }
    : null;
  if (closing && hasSceneContent(campaignState)) {
    try {
      const { endScene } = await import("../factContinuity/sceneLifecycle.js");
      await endScene(campaignState, { reason: ended ? "session_close" : "session_gap_remint" });
    } catch (err) {
      console.warn(`${MODULE_ID} | session roll: stale-scene close failed:`, err?.message ?? err);
    }
  }
  mintSession(campaignState, now);
  campaignState.unsummarisedSession = unsummarised;
  return true;
}

let _stampInFlight = false;

/**
 * Keep the session alive while the table plays: on the canonical GM, every
 * chat message may refresh the session's activity stamp (touchSessionActivity),
 * so the idle check measures from the last message rather than from the mint.
 */
export function registerSessionActivityHook() {
  Hooks.on("createChatMessage", () => {
    if (!isCanonicalGM()) return;
    touchSessionActivity().catch(err =>
      console.warn(`${MODULE_ID} | session activity stamp failed:`, err?.message ?? err));
  });
}

/**
 * Refresh the session's activity stamp, at most every ACTIVITY_STAMP_MINUTES.
 * It is written to its own world setting (`{ sessionId, at }`), never to
 * campaignState: a campaignState write here would carry this client's cached
 * value — which may not yet hold a write still on its way to the server — back
 * over that write (issue #342 Z01). Activity extends a live session; it never
 * revives one that is over — after SESSION_IDLE_HOURS, or once End a Session
 * marked it — so the message that opens Begin a Session cannot cancel the new
 * session that Begin is about to start, and a stamp counts only for the
 * session it names.
 *
 * @param {number} [now] — epoch ms
 * @returns {Promise<boolean>} true when the stamp was written
 */
export async function touchSessionActivity(now = Date.now()) {
  if (_stampInFlight) return false;
  const latest = game.settings.get(MODULE_ID, "campaignState");
  if (!latest?.currentSessionId || sessionNeedsMint(latest, now)) return false;
  if (idleMs(latest, now) < ACTIVITY_STAMP_MINUTES * 60_000) return false;
  _stampInFlight = true;
  try {
    await game.settings.set(MODULE_ID, SESSION_ACTIVITY_SETTING, {
      sessionId: latest.currentSessionId,
      at:        new Date(now).toISOString(),
    });
  } finally {
    _stampInFlight = false;
  }
  return true;
}
