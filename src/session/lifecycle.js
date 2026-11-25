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
 *   - `beginSession(campaignState)`     — flips the gate ON, stamps
 *      `sessionActiveStartedAt` and records the session's Auto narration
 *      perspective (`sessionPerspective`, issue #348 PT03). GM-only —
 *      `campaignState` is a world-scoped game.settings document, so
 *      non-GM callers would hit a permissions error on the write. The caller persists; this
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
 *      summary up to date, close its scene under its own id, then
 *      `mintSession`, which closes the session-active gate: a new session is
 *      begun at Begin a Session (issue #321 U12). The narrator's LAST
 *      SESSION block is read from the session record (`lastSessionToTell` —
 *      record/summaryView.js, issue #382): nothing is carried.
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
import { resolveNarrationPerspective } from "../narration/narratorPrompt.js";
import { settledWithin } from "../multiplayer/settleWithin.js";
import { recordSessionEdge } from "../record/tableSnapshot.js";
import { lastSessionStory } from "../record/summaryView.js";

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
  // Auto perspective is decided here, once per session, from the table as it
  // sits down (issue #348 PT03), and kept until the next mint clears it;
  // every narration of the session reads it (sessionPerspectiveOf).
  const sessionId = campaignState.currentSessionId || null;
  if (sessionId && campaignState.sessionPerspective?.sessionId !== sessionId) {
    campaignState.sessionPerspective = { sessionId, perspective: resolveNarrationPerspective("auto") };
  }
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
  "sessionActive",
  "sessionActiveStartedAt",
  "deletedChatMessages",
  // Cleared by the mint, decided by Begin (beginSession) — every Begin path
  // persists this list (issue #348 PT03).
  "sessionPerspective",
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
 * Whether a typed line is narrated into the session in campaignState — the
 * chat gate's question, and its mirrors' (index.js): the session is begun
 * (its gate open), this GM's world load is not replacing it, and it is not
 * over. Over is End a Session's mark, or SESSION_IDLE_HOURS since it was last
 * seen live (its mint or its latest chat activity). With the GM's game left
 * loaded through four idle hours nothing mints, so play went on in a session
 * the Session panel read as "Over", and the first reload closed it mid-scene;
 * now the gate tells the table no session has begun, and Begin a Session
 * takes the boundary when play resumes (issue #362 D14). A session whose
 * last sighting is unknown is not taken as over — the gate fails open on what
 * it cannot read, as it does on an unreadable state; the world load's
 * sessionNeedsMint mints such a session.
 *
 * @param {Object|null|undefined} campaignState
 * @param {number} [now] — epoch ms
 * @returns {boolean}
 */
export function sessionInPlay(campaignState, now = Date.now()) {
  if (!isSessionActive(campaignState) || sessionBeingReplaced(campaignState)) return false;
  const id = campaignState.currentSessionId;
  if (id && campaignState.sessionEndedId === id) return false;
  const last = lastSeenMs(campaignState);
  return !Number.isFinite(last) || now - last < SESSION_IDLE_HOURS * 3_600_000;
}

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

/**
 * Where the last session stopped — LAST SESSION, the one accessor: the
 * summary of the newest earlier session a table began, followed by what was
 * played in any session nobody began since, as facts; a session from before
 * the record told by the story its Session Log page holds. Read from the
 * session record (record/summaryView.js lastSessionStory, issue #382 slice 3)
 * — nothing is carried from session to session, and nothing is marked owed:
 * a summary a correction made stale is not told until it is made again.
 * Null when nothing tells it (a campaign's first session). Read by the
 * narrator's LAST SESSION block (narrator.js previousSessionSummaryFor), the
 * world snapshot's earlier sessions and the opening scene (galleyVignette.js).
 *
 * @param {Object|null|undefined} campaignState
 * @returns {{ sessionId: string|null, sessionNumber: number|null, text: string }|null}
 */
export function lastSessionToTell(campaignState) {
  try {
    return lastSessionStory(campaignState ?? null);
  } catch (err) {
    console.warn(`${MODULE_ID} | LAST SESSION could not be read from the session record:`, err?.message ?? err);
    return null;
  }
}

/**
 * Start a new session: mint the id, bump `sessionNumber` and stamp
 * `lastSessionTimestamp`. `sessionNumber` counts the sessions a table began:
 * a closing session nobody began (no Begin stamped it `sessionStartedId`,
 * its gate is shut, and End a Session did not close it — issue #331 X64) — a
 * world opened only to prepare — hands its number on to the next instead of
 * burning one, so the table's session after session 3 is "Session #4" however
 * often the world was opened between them (issue #330 D12). The id changes
 * either way. The new session has not been begun, so its session-active gate
 * is closed until Begin a Session opens it: a session nobody ended (it went
 * idle) used to hand its open gate to the next one — "Active" since last
 * week, Begin disabled, and the campaign clocks, the Spotlight Vignette and
 * the foci skipped (issue #321 U12). Nothing of the closing session's summary
 * is carried: LAST SESSION is read from the session record (lastSessionToTell
 * — issue #382). Mutates and returns campaignState; the caller persists
 * SESSION_MINT_FIELDS.
 *
 * @param {Object} campaignState
 * @param {number} [now] — epoch ms
 * @returns {Object}
 */
export function mintSession(campaignState, now = Date.now()) {
  const closingUnbegun = closingSessionUnbegun(campaignState);
  campaignState.currentSessionId       = newSessionId();
  campaignState.sessionNumber          = closingUnbegun && campaignState.sessionNumber > 0
    ? campaignState.sessionNumber
    : (campaignState.sessionNumber ?? 0) + 1;
  campaignState.lastSessionTimestamp   = new Date(now).toISOString();
  campaignState.sessionEndedId         = null;
  campaignState.sessionActive          = false;
  campaignState.sessionActiveStartedAt = null;
  // The deleted chat messages the X-Card's pick reads after a reload belong
  // to the session closing out: its pick reads the new session's alone, so
  // they are let go (DELETED-MESSAGES-KEPT).
  campaignState.deletedChatMessages    = [];
  // The new session's perspective is decided when it begins (issue #348 PT03).
  campaignState.sessionPerspective     = null;
  return campaignState;
}

/** The stored campaignState as this client has it, or null. */
function storedCampaignState() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? null;
  } catch {
    return null;
  }
}

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Keep every result still held at the table before its session is closed out
 * (rollSessionIfDue — HELD-RESULT-IDLE-SESSION), as End a Session does
 * (heldResult.js keepEveryHeldResult, "session-end": the canonical GM's; a
 * no-op with nothing held). A keep pays its price and narrates it, which
 * write the store — the scene's ledgers, its ring, the rolling summary — so
 * when one landed, `campaignState` (the mint's working copy, read before the
 * keep) takes the store's value for every field the keep changed: the scene
 * close that follows closes the scene the kept narration opened, migrates what
 * it recorded, and writes none of it back as it was before. A field the
 * caller had changed on the copy — the world load's stale-lock reset —
 * stands. Never throws.
 *
 * @param {Object} campaignState — the mint's working copy (mutated)
 * @returns {Promise<number>} how many were kept
 */
async function keepHeldResultsOfClosingSession(campaignState) {
  const before = storedCampaignState();
  let kept = 0;
  try {
    const { keepEveryHeldResult } = await import("../moves/heldResult.js");
    kept = await keepEveryHeldResult("session-end");
  } catch (err) {
    console.warn(`${MODULE_ID} | session roll: the held results could not be kept first:`, err?.message ?? err);
  }
  const after = kept > 0 ? storedCampaignState() : null;
  if (!after || typeof after !== "object") return kept;
  for (const key of new Set([...Object.keys(after), ...Object.keys(campaignState)])) {
    if (!sameValue(campaignState[key], before?.[key])) continue;      // the caller's own change
    if (sameValue(after[key], before?.[key])) continue;               // the keep left it alone
    if (after[key] === undefined) delete campaignState[key];
    else campaignState[key] = JSON.parse(JSON.stringify(after[key]));
  }
  return kept;
}

/**
 * At world load and Begin a Session, on the canonical GM: when the session is
 * over (sessionNeedsMint), close it out and mint the next one. A result still
 * held for Burn / Improve / Keep is kept first (keepHeldResultsOfClosingSession).
 * The closing session's summary is then brought up to date from its record
 * (narrator.js getRollingSessionSummary, forced; no call when it tells every
 * beat — End's closing vignette is a cutaway, not one): End a Session makes
 * its own, but that call can fail, and a Batch Mode round resolving at End,
 * or a move narrated while End runs, lands in the ended session after it
 * (issue #345 AA21). Its scene closes under its own id, so migrated
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
  // A result still held for its roller's Burn / Improve / Keep is kept — paid
  // and narrated — before its session is closed out (HELD-RESULT-IDLE-SESSION).
  // End a Session keeps them (issue #362 D5), but a session that ends by four
  // idle hours (D14) never gets one: its held results stayed held, and each
  // roller's first line of the next session paid last session's price and
  // narrated last session's roll into the new session's story. Kept here, on
  // every mint — a result held after End a Session too — before the summary
  // is finalised and the scene closed, so its narration is in the session it
  // was rolled in. What the keep stored is then read back.
  if (campaignState.currentSessionId) await keepHeldResultsOfClosingSession(campaignState);
  const closing = campaignState.currentSessionId;
  const ended   = !!closing && campaignState.sessionEndedId === closing;
  // A begun session that End a Session never closed ends here, by idleness:
  // its record's last event, on its own page (issue #382). End a Session
  // records its own; a session nobody began has nothing to end.
  if (closing && !ended && campaignState.sessionStartedId === closing) {
    void recordSessionEdge("session.ended", campaignState, { reason: "idle" }, { session: closing });
  }
  // The closing session's summary brought up to date — the record holds
  // every beat of it, a Batch Mode round narrated after End a Session or a
  // move narrated while End ran among them (issue #345 AA21). Fail-open: no
  // key on this client yet, or its call failed, and the mint goes ahead; the
  // record says the summary is owed, and the keyed canonical GM makes it at
  // the next narration, world load or key (narrator.js refreshStaleSummaries).
  // A session nobody began is told by its facts: no summary is made for it.
  if (closing && !closingSessionUnbegun(campaignState)) {
    try {
      const { getRollingSessionSummary } = await import("../narration/narrator.js");
      await getRollingSessionSummary(campaignState, { sessionId: closing, forceRefresh: true });
    } catch (err) {
      console.warn(`${MODULE_ID} | session roll: bringing the closing session's summary up to date failed:`, err?.message ?? err);
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
