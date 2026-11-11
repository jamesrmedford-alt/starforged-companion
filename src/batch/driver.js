/**
 * STARFORGED COMPANION
 * src/batch/driver.js — Batch Mode's round driver (issue #340)
 *
 * Batch Mode is an opt-in turn structure a GM switches on from the Companion
 * toolbar. Each round, every participant's Round window asks for their
 * character's action; a player writes one or passes. When every connected
 * participant is ready, or a GM presses Send now, the canonical GM rolls every
 * move for its roller and the narrator tells the whole round as one scene.
 *
 * This module is the round's one writer and its engine, on the canonical GM
 * (isCanonicalGM — single emitter):
 *
 *   - Settings: `batchMode.enabled` (world), `batchMode.round` (world — the
 *     open round, src/batch/round.js), `batchMode.draft` (client — the unsent
 *     draft, which never leaves its browser). Their onChange tells this
 *     client's listeners (the toolbar, the Round window).
 *   - queueRoundWrite: every round write is a pure transition applied to the
 *     latest stored value with no await between the read and the set, through
 *     one write chain on this client. The GM relay queue alone does not cover
 *     the driver, which runs outside it.
 *   - Opening: get-or-create by session and round number — when the mode
 *     turns on, a session begins, a round closes, and on `ready`.
 *   - Readings: readAction (src/moves/movePipeline.js) for each submission,
 *     outside the relay queue, on this client's key; a reading lands only
 *     while its submission is still the entry's.
 *   - Resolution (advanceRound): the move lock (`pendingMove`) is claimed for
 *     the rolls and records, and again for the narration, each released in a
 *     `finally` through the lock's own paths (a refused release retried once,
 *     then told) — never held across the wait for an upgrade decision. Each
 *     acting entry is rolled (rollMove) and recorded
 *     (recordMove) in confirm order; then the upgrades, the one narration
 *     (narrateRound), the close and the next round — and, off the advance
 *     pass, finishMove for each entry (a GM's rider prompt holds no round).
 *   - Recovery (rules/reachability.md §7): a round left rolling, upgrading or
 *     narrating is resumed on the canonical GM's `ready` and when the GM
 *     resolving it leaves; a collecting round's lost readings are started
 *     again then, and when a GM leaves it. A recorded entry is never rolled
 *     again; one with a result card but no record is reported to the GMs as
 *     possibly incomplete.
 *   - In the chat pipeline (handleBatchModeLine): a typed line is table talk;
 *     a card button's move becomes its roller's entry, or waits for the next
 *     round while one resolves. A participant's vow or bond progress roll
 *     made on the system sheet (index.js registerNativeProgressRollHook) is
 *     narrated with the round: its outcome becomes the roller's entry, ready
 *     (takeSheetRoll), or waits for the next round the same way.
 */

import { isCanonicalGM, hasKeyedActiveGM } from "../multiplayer/gmGate.js";
import { getPlayerActors, isPlayerCharacterActor } from "../character/actorBridge.js";
import { isSessionActive, sessionBeingReplaced, touchSessionActivity } from "../session/lifecycle.js";
import { messageAuthorId, resolveSpeakerActorId } from "../multiplayer/speaker.js";
import { stripHtml } from "../narration/narratorPrompt.js";
import { isXCardActive, narrateRound, narrateResolution } from "../narration/narrator.js";
import {
  readAction,
  interpretationForRoll,
  defaultChoices,
  rollMove,
  recordMove,
  finishMove,
  narrationInputFrom,
} from "../moves/movePipeline.js";
import { resultUpgradeBlocker } from "../moves/burnMomentum.js";
import { consequenceChosen, laterMoveFollows } from "../moves/resultUpgrade.js";
import { listProgressTracks } from "../ui/progressTracks.js";
import { resolveRelevance } from "../context/relevanceResolver.js";
import { selectSceneChallengeTrack, moveOutsideSceneChallenge, SCENE_CHALLENGE_VARIANTS } from "../moves/sceneChallenge.js";
import { moveDisplayName } from "../system/i18n.js";
import { getMischiefDial } from "../ui/settingsPanel.js";
import {
  ROUND_PHASE,
  ENTRY_STATUS,
  ENTRY_ERROR,
  READING_KIND,
  RoundRefusal,
  storedRound,
  roundIsOpen,
  isResolving,
  entryFor,
  participantsFrom,
  createRound,
  addParticipant,
  closeRound,
  nextRoundNumber,
  offerForcedMove,
  enterSheetRoll,
  isSheetRollEntry,
  takeCardMoves,
  recordReading,
  readingFailed,
  readyToResolve,
  readingsInFlight,
  beginResolution,
  takeOverResolution,
  handBackResolution,
  fixActing,
  markRolled,
  markRecorded,
  markRefused,
  allSettled,
  beginUpgrades,
  decideUpgrade,
  keepUndecidedUpgrades,
  upgradesSettled,
  undecidedUpgrades,
  beginNarration,
  claimNarration,
  recoveryPlan,
  markModeOffAfter,
} from "./round.js";

const MODULE_ID = "starforged-companion";

export const BATCH_ENABLED_SETTING = "batchMode.enabled";
export const BATCH_ROUND_SETTING   = "batchMode.round";
export const BATCH_DRAFT_SETTING   = "batchMode.draft";

/** What a typed line's author is told, once per round, while the mode is on. */
export const TABLE_TALK_NOTICE =
  "Batch Mode is on: chat is table talk, so this line wasn't narrated. Write your action in your Round window — it has this line as a draft.";

// ─────────────────────────────────────────────────────────────────────────────
// Settings and this client's listeners
// ─────────────────────────────────────────────────────────────────────────────

const _toggleListeners = new Set();
const _roundListeners  = new Set();
const _draftListeners  = new Set();

function notify(listeners, value, what) {
  for (const fn of listeners) {
    try { fn(value); }
    catch (err) { console.warn(`${MODULE_ID} | Batch Mode ${what} listener failed:`, err?.message ?? err); }
  }
}

/** Call `fn(enabled)` when the Batch Mode switch changes on this client. @returns {() => void} unsubscribe */
export function onBatchModeToggled(fn) {
  _toggleListeners.add(fn);
  return () => _toggleListeners.delete(fn);
}

/** Call `fn(round)` when the stored round changes on this client. @returns {() => void} unsubscribe */
export function onRoundChanged(fn) {
  _roundListeners.add(fn);
  return () => _roundListeners.delete(fn);
}

/** Call `fn(draft)` when this client's unsent draft changes outside its window. @returns {() => void} unsubscribe */
export function onRoundDraftChanged(fn) {
  _draftListeners.add(fn);
  return () => _draftListeners.delete(fn);
}

/**
 * Register Batch Mode's settings. Call from `init`. The switch and the round
 * are world settings only a GM writes (the round on the canonical GM alone);
 * their onChange runs on every client.
 */
export function registerBatchModeSettings() {
  game.settings.register(MODULE_ID, BATCH_ENABLED_SETTING, {
    name:    "Batch Mode",
    hint:    "Gather every player's action into a round, then narrate the round once. A GM switches it on and off from the Companion toolbar.",
    scope:   "world",
    config:  false,
    type:    Boolean,
    default: false,
    onChange: (value) => {
      const enabled = value === true;
      notify(_toggleListeners, enabled, "switch");
      onBatchModeSwitched(enabled);
    },
  });
  game.settings.register(MODULE_ID, BATCH_ROUND_SETTING, {
    name:    "Batch Mode round",
    scope:   "world",
    config:  false,
    type:    Object,
    default: null,
    onChange: (value) => notify(_roundListeners, storedRound(value), "round"),
  });
  game.settings.register(MODULE_ID, BATCH_DRAFT_SETTING, {
    name:    "Batch Mode draft",
    scope:   "client",
    config:  false,
    type:    String,
    default: "",
  });
}

/** @returns {boolean} whether Batch Mode is on (default off). */
export function isBatchModeEnabled() {
  try { return game.settings.get(MODULE_ID, BATCH_ENABLED_SETTING) === true; }
  catch { return false; }
}

/** @returns {Object|null} the stored round (src/batch/round.js), or null. */
export function getStoredRound() {
  try { return storedRound(game.settings.get(MODULE_ID, BATCH_ROUND_SETTING)); }
  catch { return null; }
}

/** @returns {string} this client's unsent draft. */
export function getRoundDraft() {
  try { return String(game.settings.get(MODULE_ID, BATCH_DRAFT_SETTING) ?? ""); }
  catch { return ""; }
}

/**
 * Keep this client's unsent draft (a client setting: nothing a player hasn't
 * submitted leaves their browser).
 *
 * @param {string} text
 * @param {{ fromOutside?: boolean }} [opts] — written by something other than the window (its listeners re-render)
 * @returns {Promise<void>}
 */
export async function setRoundDraft(text, { fromOutside = false } = {}) {
  try { await game.settings.set(MODULE_ID, BATCH_DRAFT_SETTING, String(text ?? "")); }
  catch (err) { console.warn(`${MODULE_ID} | Batch Mode: the draft could not be kept:`, err?.message ?? err); }
  if (fromOutside) notify(_draftListeners, String(text ?? ""), "draft");
}

// ─────────────────────────────────────────────────────────────────────────────
// The host's helpers (src/index.js)
// ─────────────────────────────────────────────────────────────────────────────

let _host = null;
let _freeFlowRunner = null;

/**
 * Hand the driver src/index.js's move-lock paths. Called once at load.
 *
 * @param {{ claimMoveLock: () => Promise<{ claim: string|null, busy?: boolean, refused?: boolean }>,
 *   releaseMoveLock: (claim: string|null) => Promise<boolean>,
 *   moveLockFree: () => boolean }} host — `moveLockFree`: the lock free in
 *   this client's store, and no claim of this client's on its way
 */
export function configureBatchDriver(host) {
  for (const name of ["claimMoveLock", "releaseMoveLock", "moveLockFree"]) {
    if (typeof host?.[name] !== "function") throw new Error(`batch driver: the host lacks ${name}`);
  }
  _host = { claimMoveLock: host.claimMoveLock, releaseMoveLock: host.releaseMoveLock, moveLockFree: host.moveLockFree };
}

/**
 * The free-flow pipeline, for a non-participant's forced move a resolving
 * round held: it runs once the round has closed. Set by registerChatHook.
 *
 * @param {(message: ChatMessage) => Promise<void>} fn
 */
export function setBatchFreeFlowRunner(fn) {
  _freeFlowRunner = typeof fn === "function" ? fn : null;
}

function host() {
  if (!_host) throw new Error("batch driver: no host configured — src/index.js calls configureBatchDriver at load");
  return _host;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small reads
// ─────────────────────────────────────────────────────────────────────────────

const nowIso = () => new Date().toISOString();
const randomId = () => foundry.utils.randomID();

function campaignStateNow() {
  try { return game.settings.get(MODULE_ID, "campaignState") ?? {}; }
  catch { return {}; }
}

/** A working copy of campaignState — never the cached value (rules/foundry-api.md). */
const workingCopy = () => foundry.utils.deepClone(campaignStateNow());

function connectedUserIds() {
  return Array.from(game.users ?? []).filter(u => u?.active).map(u => u.id);
}

const gmIds = () => Array.from(game.users ?? []).filter(u => u?.isGM).map(u => u.id);

function ownsActor(actor, user) {
  if (!actor || !user) return false;
  if (typeof actor.testUserPermission === "function") return !!actor.testUserPermission(user, "OWNER");
  const own = actor.ownership ?? {};
  return own[user.id] === 3 || own.default === 3;
}

/**
 * Who takes part in a round now: every connected user with a PC of their own
 * (round.js participantsFrom) — the table's PCs, NPC cards and the ship left
 * out (getPlayerActors).
 *
 * @returns {Array<Object>}
 */
export function currentParticipants() {
  const users = Array.from(game.users ?? []).map(u => ({
    id: u.id, name: u.name, isGM: !!u.isGM, active: !!u.active,
    characterId: (typeof u.character === "string" ? u.character : u.character?.id) ?? null,
  }));
  const players = Array.from(game.users ?? []).filter(u => u && !u.isGM);
  const pcs = getPlayerActors().map(a => ({
    id: a.id, name: a.name, ownerIds: players.filter(u => ownsActor(a, u)).map(u => u.id),
  }));
  return participantsFrom({ users, pcs });
}

const escapeHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Whisper a short Batch Mode notice. Never throws. */
async function whisper(userIds, title, body, flags = {}) {
  const to = [...new Set((userIds ?? []).filter(Boolean))];
  if (!to.length) return;
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card sf-batch-notice"><strong>${escapeHtml(title)}</strong><p>${body}</p></div>`,
      whisper: to,
      flags:   { [MODULE_ID]: { batchNotice: true, ...flags } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | Batch Mode: a notice could not be posted:`, err?.message ?? err);
  }
}

const tellGms = (title, body, flags) => whisper(gmIds(), title, body, flags);

// ─────────────────────────────────────────────────────────────────────────────
// One writer, one chain
// ─────────────────────────────────────────────────────────────────────────────

let _roundWrites = Promise.resolve();

/**
 * Apply a round transition to the latest stored round and write it — the
 * round's one write path, on the canonical GM. `transition(latest)` is pure
 * and synchronous (src/batch/round.js), so nothing awaits between the read
 * and the set; it may throw a RoundRefusal, which the caller is given and
 * nothing is written. A refused write rejects the same way and leaves the
 * stored round — and this client's cache — as they were.
 *
 * @param {(latest: Object|null) => Object|null|undefined} transition
 * @returns {Promise<Object|null>} the round as written (or unchanged)
 */
export function queueRoundWrite(transition) {
  const run = _roundWrites.then(async () => {
    const latest = getStoredRound();
    const next = transition(latest);
    if (next === undefined || next === latest) return latest;
    await game.settings.set(MODULE_ID, BATCH_ROUND_SETTING, next);
    return next;
  });
  _roundWrites = run.then(() => undefined, () => undefined);
  return run;
}

const isRefusal = (err) => err instanceof RoundRefusal || err?.name === "RoundRefusal";

/** Whether this client holds a Claude key — the readings and the narration run on it. */
function claudeKeyHere() {
  try { return !!game.settings.get(MODULE_ID, "claudeApiKey"); } catch { return false; }
}

/**
 * Whether a round's narration waits for a GM with a Claude key instead of
 * running here: this GM has none, and the table has one — a GM the keyed-GM
 * registry lists, connected or not (the keyed GM reloading, a keyless co-GM
 * canonical for those seconds). A keyless takeover posted "narration
 * unavailable" and closed the round, its narration gone for good though the
 * keyed GM was back within a page load (issue #347 D3 — the maintainer's
 * option A: it waits, as the readings and Send now do). With no keyed GM at
 * all the narration falls back as before (issue #345 D1).
 */
function narrationWaitsForKey() {
  if (claudeKeyHere()) return false;
  let keyed = [];
  try { keyed = game.settings.get(MODULE_ID, "keyedGmUserIds") ?? []; } catch { keyed = []; }
  return Array.isArray(keyed) && keyed.some(id => id && id !== game.user?.id && game.users?.get?.(id)?.isGM === true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening and closing rounds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the next round when one is due: Batch Mode on, a session active, and
 * no round open in this session — get-or-create, so a reload or a second
 * call never opens two. A collecting round left from an ended session is
 * replaced; one still resolving finishes first. Then the card-button moves
 * held for the next round join it.
 *
 * @param {string} [reason]
 * @returns {Promise<Object|null>} the open round
 */
export async function openRoundIfDue(reason = "due") {
  if (!isCanonicalGM() || !isBatchModeEnabled()) return null;
  const cs = campaignStateNow();
  if (!isSessionActive(cs) || sessionBeingReplaced(cs)) return null;
  const sessionId = cs.currentSessionId ?? null;
  let opened = null;
  try {
    opened = await queueRoundWrite((latest) => {
      if (roundIsOpen(latest) && (latest.sessionId === sessionId || isResolving(latest))) return latest;
      return createRound({
        id: randomId(), number: nextRoundNumber(latest, sessionId), sessionId,
        now: nowIso(), participants: currentParticipants(),
      });
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | Batch Mode: a round could not be opened (${reason}):`, err?.message ?? err);
    await tellGms("Batch Mode — the round did not open",
      "The world did not save the new round. Turn Batch Mode off and on again, or begin the session again, to retry.");
    return null;
  }
  if (roundIsOpen(opened) && opened.phase === ROUND_PHASE.COLLECTING) {
    await joinHeldMoves();
  }
  return opened;
}

/**
 * Close a collecting round no one will resolve — End a Session, Discard, the
 * mode off. Submitted entries are not rolled; their authors are told, and
 * each window keeps the text as a draft (src/ui/roundWindow.js, on the
 * close it sees). A card button's move — an entry, or an offer beside one —
 * is held for the next round instead (takeCardMoves): its card is claimed.
 *
 * @param {string} reason — "session-ended" | "discarded" | "mode-off"
 * @returns {Promise<Object|null>} the closed round, or null when none was closed
 */
export async function closeCollectingRound(reason) {
  if (!isCanonicalGM()) return null;
  let closed = null;
  let held = [];
  const before = getStoredRound();
  try {
    closed = await queueRoundWrite((latest) => {
      if (!roundIsOpen(latest) || latest.phase !== ROUND_PHASE.COLLECTING) return latest;
      const taken = takeCardMoves(latest);
      held = taken.held;
      return closeRound(taken.round, { reason, now: nowIso() });
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | Batch Mode: the round could not be closed (${reason}):`, err?.message ?? err);
    return null;
  }
  if (!closed || closed === before || closed.phase !== ROUND_PHASE.CLOSED) return null;
  holdCardMoves(held, before);
  // A card's move held for the next round is not its author's draft.
  const authors = Object.values(before?.entries ?? {})
    .filter(e => [ENTRY_STATUS.SUBMITTED, ENTRY_STATUS.READ, ENTRY_STATUS.READY].includes(e.status) && !e.readAs?.messageId)
    .map(e => e.userId);
  if (authors.length) {
    const why = reason === "session-ended" ? "The session ended before the round was resolved"
      : reason === "discarded" ? "A GM discarded the round"
      : "Batch Mode was turned off before the round was resolved";
    await whisper(authors, "Round not resolved", `${why}, so your action wasn't rolled. Your Round window keeps it as a draft.`,
      { batchRoundClosedNotice: true });
  }
  return closed;
}

/** The switch changed (every client): the canonical GM opens a round, or closes a collecting one. */
function onBatchModeSwitched(enabled) {
  if (!isCanonicalGM()) return;
  const work = enabled ? openRoundIfDue("mode-on") : turnedOff();
  Promise.resolve(work).catch(err => console.warn(`${MODULE_ID} | Batch Mode switch:`, err?.message ?? err));
}

/**
 * The mode is off: a collecting round closes, and the card-button moves held
 * for the next round — there is none now — run as free-flow, as a forced
 * move whose roller isn't in a round does. A claimed card's move is held,
 * never dropped (issue #325 W02): with the mode switched off they were lost,
 * their buttons still reading taken (issue #342 Z29).
 */
async function turnedOff() {
  await closeCollectingRound("mode-off");
  if (!_heldForRound.length) return;
  for (const id of _heldForRound.splice(0)) {
    if (!_heldForFreeFlow.includes(id)) _heldForFreeFlow.push(id);
  }
  runHeldMovesSoon();
}

// ─────────────────────────────────────────────────────────────────────────────
// Readings
// ─────────────────────────────────────────────────────────────────────────────

// userId → { submissionId, promise } — the readings running on this client.
const _readings = new Map();

/** True while a round entry's character is still a player character in the game. */
function entryCharacterPresent(entry) {
  return isPlayerCharacterActor(game.actors?.get?.(entry?.actorId) ?? null);
}

/** The combat moves whose fight a round checks is still open before rolling. */
const ROUND_FIGHT_MOVES = new Set(["strike", "clash", "gain_ground", "react_under_fire", "take_decisive_action", "battle"]);

/**
 * Read an entry's submission (readAction), on this client's key, outside the
 * relay queue. The reading lands only while its submission is still the
 * entry's (recordReading); a failed reading leaves the entry submitted with
 * the error its window shows. With no key here the entry waits: it is read
 * once a keyed GM is canonical (recoverRound).
 *
 * @param {string} userId
 * @returns {Promise<void>|null} the reading, or null when there is nothing to read
 */
export function startReading(userId) {
  if (!isCanonicalGM()) return null;
  const entry = entryFor(getStoredRound(), userId);
  if (!entry || entry.status !== ENTRY_STATUS.SUBMITTED || entry.error) return null;
  const submissionId = entry.submissionId;
  // Read as its own PC or not at all: with the PC gone, the reading (and its
  // ability scan) fell back to the first PC — another player's (issue #342 Z35).
  if (!entryCharacterPresent(entry)) {
    console.warn(`${MODULE_ID} | Batch Mode: ${entry.actorName}'s character is no longer in the game — the action is not read.`);
    queueRoundWrite(r => readingFailed(r, { userId, submissionId, error: ENTRY_ERROR.CHARACTER_GONE }))
      .catch(e => console.warn(`${MODULE_ID} | Batch Mode: the unread action could not be recorded:`, e?.message ?? e));
    return null;
  }
  const running = _readings.get(userId);
  if (running?.submissionId === submissionId) return running.promise;
  const apiKey = (() => { try { return game.settings.get(MODULE_ID, "claudeApiKey") || null; } catch { return null; } })();
  if (!apiKey) {
    console.debug(`${MODULE_ID} | Batch Mode: no Claude key on this GM — ${entry.actorName}'s action waits to be read.`);
    return null;
  }
  const promise = (async () => {
    // No chat message marks a round's activity: a submission keeps the session alive.
    touchSessionActivity().catch(err => console.warn(`${MODULE_ID} | session activity stamp failed:`, err?.message ?? err));
    try {
      const reading = await readAction({
        text: entry.text, speakerActorId: entry.actorId, campaignState: workingCopy(),
        apiKey, dial: getMischiefDial(), readAs: entry.readAs ?? null,
      });
      await noteReadTrack(reading);
      // A reading lands only while its submission is still the entry's.
      await queueRoundWrite(r => recordReading(r, { userId, submissionId, reading }));
    } catch (err) {
      console.warn(`${MODULE_ID} | Batch Mode: ${entry.actorName}'s action could not be read:`, err?.message ?? err);
      await queueRoundWrite(r => readingFailed(r, { userId, submissionId, error: String(err?.message ?? err ?? "unread") }))
        .catch(e => console.warn(`${MODULE_ID} | Batch Mode: the failed reading could not be recorded:`, e?.message ?? e));
    } finally {
      if (_readings.get(userId)?.submissionId === submissionId) _readings.delete(userId);
      advanceRound("reading");
    }
  })();
  _readings.set(userId, { submissionId, promise });
  return promise;
}

/**
 * The fight, expedition or scene challenge a combat, expedition or Finish the
 * Scene move acts on, as read — its id, so the roll can tell when it ended
 * earlier in the round (a round entry is rolled later than it was read): a
 * second Finish the Scene is refused, not rolled against an ended scene
 * (issue #342 Z07). A scene-challenge variant's challenge is noted apart
 * (`variantChallengeId`): rolled after that one ended, the variant is the
 * ordinary move (rollEntry), not refused — whatever else is open
 * (ROUND-VARIANT-TWO-CHALLENGES).
 *
 * @param {Object} reading
 */
async function noteReadTrack(reading) {
  if (reading?.kind !== READING_KIND.MOVE) return;
  const moveId = reading.moveId;
  const variant = Object.prototype.hasOwnProperty.call(SCENE_CHALLENGE_VARIANTS, moveId);
  const type = ROUND_FIGHT_MOVES.has(moveId) ? "combat"
    : (moveId === "undertake_an_expedition" || moveId === "finish_an_expedition") ? "expedition"
    : (moveId === "finish_the_scene" || variant) ? "scene_challenge" : null;
  if (!type) return;
  const all = await listProgressTracks().catch(() => []);
  const open = all.filter(t => t.type === type && !t.completed);
  const named = reading.interpretation?.moveTargetId ?? null;
  const target = String(reading.interpretation?.moveTarget ?? "").trim().toLowerCase();
  // A scene challenge resolves as the roll resolves it (by id, the name, else the sole open one).
  const track = type === "scene_challenge"
    ? selectSceneChallengeTrack(all, reading.interpretation?.moveTarget ?? null, { trackId: named })
    : named ? open.find(t => t.id === named)
      : (target ? open.find(t => String(t.label ?? "").trim().toLowerCase() === target) : null)
        ?? (open.length === 1 ? open[0] : null);
  if (track && variant) {
    reading.variantChallengeId = track.id;
  } else if (track) {
    reading.trackId = track.id;
    reading.trackLabel = track.label ?? null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution — one pass at a time on this client
// ─────────────────────────────────────────────────────────────────────────────

let _advancing = null;
let _advanceAgain = false;
let _waitingForLock = false;
// A GM's Send now, waiting for the advance pass to start the resolution: the
// id of the round it was pressed for. One that waited on a busy lock is not
// the next round's when its own closed another way meanwhile (a Discard, End
// a Session): it resolved that round at once, rolling a reading its player
// had not confirmed (issue #345 AA38).
let _sendNowRoundId = null;
let _narratingRoundId = null;
// The rolled stage results of the round this client rolls, by user id
// (finishMove), and the users whose record (recordMove) ran here.
const _rolledHere = new Map();
const _recordedHere = new Set();
let _rolledHereRoundId = null;

function forgetRolledHere() {
  _rolledHere.clear();
  _recordedHere.clear();
  _rolledHereRoundId = null;
}

function noteRolledHere(roundId, userId, rolled) {
  if (_rolledHereRoundId !== roundId) forgetRolledHere();
  _rolledHereRoundId = roundId;
  _rolledHere.set(userId, rolled);
}

/** This client's own roll of a round's entry, or null (rolled elsewhere, or before a reload). */
const rolledHere = (roundId, userId) => (_rolledHereRoundId === roundId ? _rolledHere.get(userId) ?? null : null);

/**
 * Move the open round on as far as it can go now — resolve it once every
 * connected participant is ready, roll and record its entries, wait for the
 * upgrades, narrate it, close it and open the next. One pass at a time on the
 * canonical GM; a call while one runs asks for another pass after it.
 *
 * @param {string} [reason]
 * @returns {Promise<void>}
 */
export function advanceRound(reason = "advance") {
  if (!isCanonicalGM()) return Promise.resolve();
  if (_advancing) { _advanceAgain = true; return _advancing; }
  _advancing = (async () => {
    try {
      let guard = 0;
      do {
        _advanceAgain = false;
        const moved = await advanceOnce(reason);
        if (moved) _advanceAgain = true;
        guard += 1;
      } while (_advanceAgain && guard < 50);
    } catch (err) {
      console.error(`${MODULE_ID} | Batch Mode: the round could not go on:`, err);
      tellRoundStopped();
    } finally {
      _advancing = null;
    }
  })();
  return _advancing;
}

/**
 * The advance pass stopped while the round was being resolved — a step the
 * world did not save: the GMs are told, with the way on (Send now runs the
 * pass again; a recorded entry is never rolled again, a posted round card
 * never narrated again). It used to say nothing, and nothing re-entered the
 * pass short of a reload (issue #342 Z18). Never throws.
 */
function tellRoundStopped() {
  if (!isResolving(getStoredRound())) return;
  tellGms("Batch Mode — the round stopped",
    "The round stopped while it was being resolved: the world did not save a step of it. Press Send now in the Round window to try again.",
    { batchRoundStoppedNotice: true });
}

/** One step. @returns {Promise<boolean>} whether the round moved (another pass is due) */
async function advanceOnce() {
  const round = getStoredRound();
  if (!roundIsOpen(round)) return false;
  switch (round.phase) {
    case ROUND_PHASE.COLLECTING: {
      if (isXCardActive(null)) return false;
      if (_sendNowRoundId !== null && _sendNowRoundId !== round.id) _sendNowRoundId = null;
      const sendNow = _sendNowRoundId === round.id;
      if (!sendNow && !readyToResolve(round, { connectedUserIds: connectedUserIds() })) return false;
      return startResolution({ sendNow });
    }
    case ROUND_PHASE.ROLLING:
      return rollRound(null);
    case ROUND_PHASE.UPGRADING:
      await keepUndecidable(round);
      if (!upgradesSettled(getStoredRound())) return false;
      // The X-Card stops a round resolving: decided, it waits for a GM to
      // resume (the lift runs this pass again), as a collecting round does —
      // it went on to its narration, and closed behind the paused notice,
      // its moves never narrated (issue #345 AA43).
      if (isXCardActive(null)) return false;
      await queueRoundWrite(r => beginNarration(r));
      return true;
    case ROUND_PHASE.NARRATING:
      return narrateTheRound();
    default:
      return false;
  }
}

/**
 * A GM pressed Send now: resolve the round at once, with whoever acted.
 * Anyone who hasn't submitted is simply not in it; a reading still running
 * is waited for, and a reading not yet confirmed is used as read. During the
 * upgrade step it means Keep for everyone still deciding; while the round
 * rolls or narrates it runs the advance pass again, for a round a refused
 * step stopped (issue #342 Z18). The resolution itself runs on the advance
 * pass, never inside the relay handler that asked (its rolls and narration
 * must not hold the GM relay queue). A Send now waiting on a busy move lock
 * is this round's alone: a round closed meanwhile takes it with it.
 *
 * With `modeOffAfter` (the toolbar's switch, or its "Send now, then turn off"
 * for a collecting round), Batch Mode turns off once the round is done. A
 * round already resolving is only marked: it finishes as it would — a roller
 * deciding Burn / Improve / Keep still decides — and only a GM's own Send now
 * keeps for them (issue #342 Z04: the switch forced Keep on every roller
 * still deciding, and closed their card's Burn and Improve). A collecting
 * round is marked only once its send is accepted: one the X-Card (or no key
 * for its readings) refused kept the mark, and resolving later the ordinary
 * way it switched Batch Mode off — a change the GM was told had not happened
 * (issue #345 AA39).
 *
 * @param {{ modeOffAfter?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function requestSendNow({ modeOffAfter = false } = {}) {
  if (!isCanonicalGM()) return { ok: false, reason: "not-canonical" };
  const round = getStoredRound();
  if (!roundIsOpen(round)) return { ok: false, reason: "no-round" };
  if (modeOffAfter && isResolving(round)) {
    await markRoundModeOffAfter(round.id);
    return { ok: true, reason: "mode-off-after" };
  }
  if (round.phase === ROUND_PHASE.UPGRADING) {
    await keepUpgrades(null);
    advanceRound("send-now");
    return { ok: true };
  }
  // A narration that waits for a GM with a Claude key is not sent from a
  // keyless one: the key is what it waits for (issue #347 D3).
  if (round.phase === ROUND_PHASE.NARRATING && narrationWaitsForKey()) return { ok: false, reason: "narration-no-key" };
  if (round.phase !== ROUND_PHASE.COLLECTING) {
    // Rolling or narrating: the round goes on — a pass a refused step stopped
    // runs again (a pass already running just goes round once more).
    advanceRound("send-now");
    return { ok: true, reason: "resolving" };
  }
  if (isXCardActive(null)) return { ok: false, reason: "x-card" };
  const unread = readingsInFlight(round);
  if (unread.length && !claudeKeyHere()) return { ok: false, reason: "no-key" };
  if (modeOffAfter) await markRoundModeOffAfter(round.id);
  _sendNowRoundId = round.id;
  advanceRound("send-now");
  return { ok: true };
}

/** Mark the round a Send now was asked for to turn Batch Mode off once it is done. Never throws. */
function markRoundModeOffAfter(roundId) {
  return queueRoundWrite(r => (r?.id === roundId ? markModeOffAfter(r) : r))
    .catch(err => console.warn(`${MODULE_ID} | Batch Mode: mode-off-after not saved:`, err?.message ?? err));
}

// Claims of this client's whose release the world refused, retry included:
// the round's next claim takes the lock back from them, where it would wait
// on itself (issue #342 Z19).
const _unreleasedClaims = new Set();

/**
 * Claim the move lock for the round (index.js claimPendingMoveLock) — or take
 * back this client's own claim whose release the world refused: the store
 * still holds it, and a round waiting for it to free waited forever. Not an
 * async function: the claim's answer comes back as soon as the host's does.
 *
 * @returns {Promise<{ claim: string|null, busy?: boolean, refused?: boolean }>}
 */
function claimRoundLock() {
  const cs = campaignStateNow();
  const held = cs.pendingMove ? (cs.pendingMoveClaim ?? null) : null;
  for (const c of _unreleasedClaims) if (c !== held) _unreleasedClaims.delete(c);
  if (held && cs.pendingMoveBy === game.user?.id && _unreleasedClaims.has(held)) {
    _unreleasedClaims.delete(held);
    return Promise.resolve({ claim: held });
  }
  return host().claimMoveLock();
}

/**
 * The round's claim met a busy lock: wait for the campaignState write that
 * frees it (onCampaignStateChanged runs the pass again). The wait is marked
 * once the claim's answer is back, so a release that landed between the
 * claim's read and this mark was heard with nothing waiting, and no later
 * write woke the round (ROUND-LOCK-WAIT-MARKED-LATE). The lock is read again
 * once the wait is marked — as this client knows it, a free-flow claim still
 * on its way counting as taken (its write and then its release wake the
 * round): free already, the pass goes round again.
 */
function waitForLock() {
  _waitingForLock = true;
  if (!host().moveLockFree()) return;
  _waitingForLock = false;
  advanceRound("lock-free");
}

/**
 * A claim the advance pass made for a round already resolving — its rolls
 * re-entered, or its narration — came back without the lock: a busy lock is
 * waited for; one the world refused stops the round, and the GMs are told
 * (Send now claims it again). Only a busy lock was handled: refused, the
 * round sat rolling or narrating with no one told and nothing waiting to wake
 * it, every window saying "The round is being resolved…" (issue #345 AA40).
 *
 * @param {{ busy?: boolean, refused?: boolean }} lock — claimRoundLock's answer, with no claim
 */
function lockNotClaimed(lock) {
  if (lock.busy) waitForLock();
  else tellRoundStopped();
}

/**
 * The move lock is free again with no campaignState write to say so: a claim
 * on its way was refused (index.js claimPendingMoveLock). A round waiting for
 * the lock goes on, as the write that frees it would let it — waiting behind
 * a free-flow claim the world refused, it sat collecting, ready, until
 * someone acted again (ROUND-WAIT-AFTER-REFUSED-CLAIM).
 */
export function noteMoveLockFreed() {
  if (!_waitingForLock || !host().moveLockFree()) return;
  _waitingForLock = false;
  advanceRound("lock-free");
}

/**
 * Release the round's claim (index.js releasePendingMoveLock). A release the
 * world refuses is tried once more, as free-flow's `finally` retries its own
 * (issue #315 S01); refused again, the GMs are told and the round's next
 * claim takes it back. The round dropped the refusal: its own narration then
 * waited on the lock it still held, the table stopped (issue #342 Z19).
 *
 * @param {string|null} claim
 * @returns {Promise<boolean>} whether the lock is free (or no longer this claim's)
 */
async function releaseRoundLock(claim) {
  if (!claim) return true;
  if (await host().releaseMoveLock(claim)) return true;
  if (await host().releaseMoveLock(claim)) return true;
  _unreleasedClaims.add(claim);
  await tellGms("Batch Mode — the move lock was not released",
    `The world did not save the move lock's release. The round goes on, but a move outside it may be refused ("A move is already being resolved") until the lock is freed — reloading ${escapeHtml(game.user?.name ?? "the resolving GM")}'s browser frees it.`,
    { batchLockNotice: true });
  return false;
}

/**
 * Collecting → rolling, with the move lock claimed first: a refused claim
 * leaves the round collecting, and the GMs are told; a busy lock (another
 * move resolving) is waited for. Then the round is rolled under the claim.
 *
 * @param {{ sendNow: boolean }} opts
 * @returns {Promise<boolean>}
 */
async function startResolution({ sendNow }) {
  const lock = await claimRoundLock();
  if (!lock.claim) {
    if (lock.busy) {
      waitForLock();
      console.debug(`${MODULE_ID} | Batch Mode: a move holds the lock — the round resolves once it is free.`);
      return false;
    }
    _sendNowRoundId = null;
    await tellGms("Batch Mode — the round did not start",
      "The world did not save the move lock, so the round is still collecting. Press Send now to try again.");
    return false;
  }
  _waitingForLock = false;
  let begun = false;
  try {
    try {
      await queueRoundWrite(r => beginResolution(r, { resolverId: game.user.id, now: nowIso(), sendNow }));
    } finally {
      // Begun, or refused: either way this Send now is spent (a busy lock above keeps it).
      _sendNowRoundId = null;
    }
    begun = true;
    await rollRound(lock.claim);
    return true;
  } catch (err) {
    if (!begun) {
      console.warn(`${MODULE_ID} | Batch Mode: the round could not start:`, err?.message ?? err);
      if (!isRefusal(err)) {
        await tellGms("Batch Mode — the round did not start",
          "The world did not save the round, so it is still collecting. Press Send now to try again.");
      }
      return false;
    }
    throw err;
  } finally {
    await releaseRoundLock(lock.claim);
  }
}

/**
 * Roll and record every acting entry, in order, under the move lock — this
 * call's claim, or `claim` when the caller holds it. Recovery-safe: a
 * recorded entry is skipped, and one whose result card is up without a record
 * is reported to the GMs and not rolled again.
 *
 * @param {string|null} claim — the lock claim the caller holds, or null to claim it here
 * @returns {Promise<boolean>}
 */
async function rollRound(claim) {
  let own = null;
  if (!claim) {
    const lock = await claimRoundLock();
    if (!lock.claim) {
      lockNotClaimed(lock);
      return false;
    }
    own = lock.claim;
  }
  try {
    let round = getStoredRound();
    if (round?.phase !== ROUND_PHASE.ROLLING) return false;

    // The readings Send now waits for — this client's, or one a reload lost.
    // Who acts is fixed then; the card moves the round does not take — an
    // offer not chosen, a card move not confirmed — are held for the next.
    if (!Array.isArray(round.acting)) {
      for (const id of readingsInFlight(round)) startReading(id);
      await Promise.allSettled([..._readings.values()].map(r => r.promise));
      const before = round;
      let held = [];
      round = await queueRoundWrite((r) => {
        if (r?.phase !== ROUND_PHASE.ROLLING || Array.isArray(r.acting)) return fixActing(r);
        const fixed = fixActing(r);
        const taken = takeCardMoves(fixed, { acting: fixed.acting });
        held = taken.held;
        return taken.round;
      });
      holdCardMoves(held, before);
    }
    if (!round.acting.length) {
      await finishRound(round, "nobody-acted");
      return true;
    }

    for (const userId of round.acting) {
      round = getStoredRound();
      const entry = round?.entries?.[userId];
      if (!entry || entry.status === ENTRY_STATUS.RECORDED || entry.status === ENTRY_STATUS.REFUSED) continue;
      await rollEntry(round, entry);
    }

    round = getStoredRound();
    if (!allSettled(round)) return false;
    await queueRoundWrite(r => beginUpgrades(r, { offers: upgradeOffers(r) }));
    return true;
  } finally {
    if (own) await releaseRoundLock(own);
  }
}

/** The result card a round entry's roll posted, found by its round and player. */
function roundResultCard(roundId, userId) {
  return (game.messages?.contents ?? []).find(m => {
    const f = m?.flags?.[MODULE_ID];
    return f?.moveResolution === true && f.roundId === roundId && f.roundUserId === userId;
  }) ?? null;
}

/**
 * Roll one acting entry and record it (rollMove → recordMove), as a typed
 * move is rolled — credited to its own PC — stamping `rolled` and its record
 * as it goes. A narrative entry is recorded as it is, and a move rolled on
 * the character sheet with the outcome it was rolled with. An entry the roll
 * stage cannot roll (its track ended earlier in the round, a vow already
 * fulfilled, no target picked) is refused: its card says why, and it is
 * narrated as an action with no roll.
 */
async function rollEntry(round, entry) {
  const userId = entry.userId;
  const reading = entry.reading;

  // Rolled already, its record not known to the round: never rolled again. A
  // roll this client made and recorded (the round's own write of it refused)
  // takes its record as made; one from before a reload is reported.
  const card = entry.rolled?.cardId ? game.messages?.get?.(entry.rolled.cardId) : roundResultCard(round.id, userId);
  if (entry.status === ENTRY_STATUS.ROLLED || card) {
    const here = rolledHere(round.id, userId);
    if (!here || !_recordedHere.has(userId)) {
      await tellGms("Batch Mode — a move may be incomplete",
        `${escapeHtml(entry.actorName)}'s move was rolled before the round stopped, and its result may not have been recorded. Check its card; the round goes on without rolling it again.`,
        { batchIncompleteNotice: true });
    }
    const rolledInfo = here ? rolledInfoFrom(here) : null;
    await queueRoundWrite(r => markRecorded(rolledInfo ? markRolled(r, { userId, rolled: rolledInfo }) : r, {
      userId, recordedAt: nowIso(), narrationInput: rolledInfo?.narrationInput ?? entry.rolled?.narrationInput ?? { kind: "narrative" },
    }));
    return;
  }

  // Rolled on the character sheet, and paid there (issue #345 D1): the round
  // narrates it with that outcome and rolls nothing — so nothing is rolled as
  // another PC either, whoever its character is now.
  if (reading?.kind === READING_KIND.SHEET_ROLL) {
    const input = reading.narrationInput ?? { kind: "narrative" };
    await queueRoundWrite(r => markRecorded(markRolled(r, {
      userId, rolled: { moveId: input.moveId ?? null, outcome: input.outcome ?? null, narrationInput: input },
    }), { userId, recordedAt: nowIso() }));
    _sheetRolls.delete(entry.readAs?.messageId);
    return;
  }

  // Its PC was deleted (or is no PC now) since the round opened: not rolled.
  // rollMove and the record would fall back to the first PC — another
  // player's stats, momentum and Pay the Price (issue #342 Z35; free-flow's
  // no-PC rule, issue #326 D8: credit the roller, never the first PC).
  if (!entryCharacterPresent(entry)) {
    const reason = "Its character is no longer in the game.";
    await postRefusedCard(round, entry, reading ?? {}, reason);
    await queueRoundWrite(r => markRefused(r, {
      userId, reason, recordedAt: nowIso(),
      narrationInput: { kind: "refused", moveId: reading?.moveId ?? null, moveName: reading?.moveName ?? null, reason },
    }));
    return;
  }

  if (!reading || reading.kind !== READING_KIND.MOVE) {
    await queueRoundWrite(r => markRecorded(r, { userId, recordedAt: nowIso(), narrationInput: { kind: "narrative" } }));
    return;
  }

  const choices = entry.status === ENTRY_STATUS.READY && entry.choices ? entry.choices : defaultChoices(reading);
  const refusal = await refusalFor(reading, choices);
  if (refusal) {
    await postRefusedCard(round, entry, reading, refusal);
    await queueRoundWrite(r => markRefused(r, {
      userId, reason: refusal, recordedAt: nowIso(),
      narrationInput: { kind: "refused", moveId: reading.moveId, moveName: reading.moveName, reason: refusal },
    }));
    return;
  }

  const campaignState = workingCopy();
  const interpretation = interpretationForRoll(reading, choices);
  // A scene-challenge variant whose own challenge ended before its roll (an
  // earlier entry's Finish the Scene) is the ordinary move, though another
  // challenge stays open: rollMove's rule looks for any open one (Z39), and
  // the scoring took that other one (ROUND-VARIANT-TWO-CHALLENGES).
  if (reading.variantChallengeId) {
    const ordinary = moveOutsideSceneChallenge(interpretation.moveId, await listProgressTracks().catch(() => []),
      { trackId: reading.variantChallengeId });
    if (ordinary !== interpretation.moveId) {
      console.debug(`${MODULE_ID} | Batch Mode: ${entry.actorName}'s ${interpretation.moveId} — its scene challenge ended earlier in the round; rolled as ${ordinary}.`);
      interpretation.moveId   = ordinary;
      interpretation.moveName = moveDisplayName(ordinary);
    }
  }
  const rolled = await rollMove({
    interpretation, campaignState, speakerActorId: entry.actorId, narration: entry.text,
    tokenDragSetCourse:     reading.forced?.tokenDragSetCourse ?? null,
    incitingSwearMessageId: reading.forced?.incitingSwearMessageId ?? null,
    cardFlags: { roundId: round.id, roundNumber: round.number, roundUserId: userId },
  });
  if (rolled.refused) {
    // rollMove posted the track-gone card ("not rolled — it was deleted or finished").
    const reason = "The track it named was deleted or finished before the roll.";
    await queueRoundWrite(r => markRefused(r, {
      userId, reason, recordedAt: nowIso(),
      narrationInput: { kind: "refused", moveId: reading.moveId, moveName: reading.moveName, reason },
    }));
    return;
  }
  const rolledInfo = rolledInfoFrom(rolled);
  noteRolledHere(round.id, userId, rolled);
  // The round's bookkeeping never gates the move's own record: a refused
  // "rolled" stamp is carried by the "recorded" one. It used to throw before
  // recordMove — the move's meters and record lost, the round stuck rolling
  // (issue #342 Z18).
  await queueRoundWrite(r => markRolled(r, { userId, rolled: rolledInfo })).catch(err =>
    console.warn(`${MODULE_ID} | Batch Mode: ${entry.actorName}'s roll was not saved on the round — recording the move all the same:`, err?.message ?? err));
  await recordMove(rolled, campaignState);
  _recordedHere.add(userId);
  await queueRoundWrite(r => markRecorded(markRolled(r, { userId, rolled: rolledInfo }), { userId, recordedAt: nowIso() }));
}

/**
 * What the round keeps of a rolled move (markRolled): its card, outcome and
 * narration input. (The match rides the narration input: a copy beside it was
 * read by nothing — issue #342 Z37.)
 */
function rolledInfoFrom({ resolution, relevance, moveResultMessage }) {
  return {
    resolutionId: resolution?._id ?? null, cardId: moveResultMessage?.id ?? null,
    moveId: resolution?.moveId ?? null, outcome: resolution?.outcome ?? null,
    narrationInput: narrationInputFrom(resolution, relevance),
  };
}

/**
 * Why an entry can't be rolled as read, or null: a reading the roll could not
 * use (a vow already fulfilled), a target pick a reading not confirmed never
 * made, or the fight or expedition it acts on ended earlier in the round.
 */
async function refusalFor(reading, choices) {
  if (reading.blocked === "vow-gone") return "The vow it named is already fulfilled.";
  const options = reading.targetChoices?.options ?? [];
  if (options.length && !choices?.targetId) {
    return `${reading.targetChoices.prompt ?? "Which one?"} — nothing was chosen before the round was sent.`;
  }
  const trackId = (reading.targetChoices?.kind === "track" && choices?.targetId) ? choices.targetId : (reading.trackId ?? null);
  if (!trackId) return null;
  const track = (await listProgressTracks().catch(() => [])).find(t => t.id === trackId) ?? null;
  if (track && !track.completed) return null;
  const label = track?.label ?? reading.trackLabel ?? "Its track";
  return `${label} ended earlier in this round.`;
}

/** The card an entry the roll stage refused gets instead of a result card. */
async function postRefusedCard(round, entry, reading, reason) {
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card sf-round-refused"><strong>${escapeHtml(entry.actorName)} — ${escapeHtml(reading.moveName ?? "the move")}: not rolled</strong>`
        + `<p>${escapeHtml(reason)} Nothing was rolled; the round narrates it as an action with no roll.</p></div>`,
      flags: { [MODULE_ID]: { roundRefusedCard: true, roundId: round.id, roundUserId: entry.userId } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | Batch Mode: the not-rolled card could not be posted:`, err?.message ?? err);
  }
}

/**
 * The Burn Momentum / Improve Result offers the round's result cards make —
 * by roller, with the upgraded outcome — for the rollers who have not
 * decided: only an upgrade its card would still take (upgradeOpen). A card
 * already burned or improved offers nothing, nor one whose consequence was
 * chosen on its choice card — the round waited on a Burn the card refused
 * (issue #342 Z27).
 *
 * @param {Object} round
 * @returns {Object<string, { burn: Object|null, improve: Object|null, cardId: string }>}
 */
function upgradeOffers(round) {
  const offers = {};
  for (const userId of round?.acting ?? []) {
    const e = round.entries[userId];
    if (e?.status !== ENTRY_STATUS.RECORDED || !e.rolled?.cardId || e.upgrade?.decided) continue;
    const card = game.messages?.get?.(e.rolled.cardId) ?? null;
    const f = card?.flags?.[MODULE_ID];
    if (!f || f.burn?.consumed || f.improve?.consumed) continue;
    const burn = upgradeOpen(card, "burn") ? { momentum: f.burn.momentum ?? null, previewOutcome: f.burn.previewOutcome ?? null } : null;
    const improve = upgradeOpen(card, "improve") ? { previewOutcome: f.improve.improveTo ?? "strong_hit", label: f.improve.assetName || null } : null;
    if (burn || improve) offers[userId] = { burn, improve, cardId: e.rolled.cardId };
  }
  return offers;
}

/**
 * Whether a move card's Burn Momentum ("burn") or Improve Result ("improve")
 * can still be pressed — what its GM handler checks (burnMomentum.js
 * applyBurnFromRelay, improveResult.js applyImproveFromRelay): offered, not
 * used, not closed (resultUpgradeBlocker: a chosen consequence, a later move,
 * the round's own close), no later move of the roller's, no choice made on
 * the outcome's choice card.
 *
 * @param {ChatMessage|null} card
 * @param {"burn"|"improve"} kind
 * @returns {boolean}
 */
function upgradeOpen(card, kind) {
  const f = card?.flags?.[MODULE_ID];
  const state = f?.[kind];
  if (!(kind === "burn" ? state?.canBurn : state?.canImprove) || state.consumed) return false;
  if (resultUpgradeBlocker(state, f[kind === "burn" ? "improve" : "burn"])) return false;
  if (laterMoveFollows(card)) return false;
  return !consequenceChosen(state.resolutionId ?? f.resolutionId ?? null);
}

/**
 * Close the Burn Momentum / Improve Result on round result cards — decided
 * before the round was narrated (`roundClosed`; burnMomentum.js
 * resultUpgradeBlocker). For the users named, or every acting entry.
 *
 * @param {Object} round
 * @param {string[]|null} userIds
 */
async function closeCardUpgrades(round, userIds = null) {
  for (const userId of round?.acting ?? []) {
    if (userIds && !userIds.includes(userId)) continue;
    const card = round.entries[userId]?.rolled?.cardId ? game.messages?.get?.(round.entries[userId].rolled.cardId) : null;
    const f = card?.flags?.[MODULE_ID];
    if (!f) continue;
    const update = {};
    for (const kind of ["burn", "improve"]) {
      if (f[kind] && !f[kind].consumed && !f[kind].roundClosed) update[`flags.${MODULE_ID}.${kind}.roundClosed`] = true;
    }
    if (!Object.keys(update).length) continue;
    await card.update(update).catch(err =>
      console.warn(`${MODULE_ID} | Batch Mode: closing card ${card.id}'s upgrades failed:`, err?.message ?? err));
  }
}

/**
 * Keep the result for every roller still deciding (Send now during the
 * upgrade step), or for those named (they left).
 *
 * @param {string[]|null} userIds
 */
async function keepUpgrades(userIds) {
  const before = getStoredRound();
  const after = await queueRoundWrite(r => keepUndecidedUpgrades(r, { now: nowIso(), userIds }))
    .catch(err => { console.warn(`${MODULE_ID} | Batch Mode: keep not saved:`, err?.message ?? err); return null; });
  if (after && after !== before) {
    const kept = Object.values(after.entries).filter(e => e.upgrade?.decided === "keep" && !before?.entries?.[e.userId]?.upgrade?.decided).map(e => e.userId);
    await closeCardUpgrades(after, kept);
  }
}

/**
 * The upgrade offers no one can answer are kept, as the round's lifecycle
 * keeps them ("the roller left = Keep", round.js): a roller who isn't
 * connected — gone before the step began, or since. Only a leave during the
 * step was kept, so a roller who confirmed and dropped before it kept the
 * round waiting until a GM pressed Send now (issue #342 Z26). Silent, as a
 * pass is. So is an offer its card closed since it was made — the roller
 * chose the consequence on its choice card, which closes Burn and Improve
 * (issue #311 P03): that choice is the roller's Keep (Z27). A card being
 * burned or improved is not one: its upgrade decides the entry itself
 * (acceptRoundUpgrade).
 *
 * @param {Object} round — upgrading
 */
async function keepUndecidable(round) {
  const connected = new Set(connectedUserIds());
  const moot = undecidedUpgrades(round).filter(id => !connected.has(id) || !offerAnswerable(round.entries[id]));
  if (moot.length) await keepUpgrades(moot);
}

/** Whether an undecided offer can still be decided on its card: an upgrade still open, or one landing now. */
function offerAnswerable(entry) {
  const card = game.messages?.get?.(entry?.upgrade?.cardId ?? entry?.rolled?.cardId) ?? null;
  const f = card?.flags?.[MODULE_ID];
  if (!f) return false;
  if (f.burn?.consumed || f.improve?.consumed) return true;
  return (!!entry.upgrade.burn && upgradeOpen(card, "burn")) || (!!entry.upgrade.improve && upgradeOpen(card, "improve"));
}

/**
 * A roller keeps their result (the window's Keep, relayed as batch.keep).
 *
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function keepUpgrade(userId) {
  const round = await queueRoundWrite(r => decideUpgrade(r, { userId, decision: "keep", now: nowIso() }));
  await closeCardUpgrades(round, [userId]);
  advanceRound("keep");
}

/**
 * Burn Momentum / Improve Result upgraded a round entry's result before the
 * round was narrated: the round takes the upgraded resolution — keyed by the
 * original resolution's id — instead of a narration of its own (src/index.js
 * hands it here from the upgrade's re-narration). True when the round took it.
 *
 * @param {string|null} upgradeOf — the original resolution's id
 * @param {Object} resolution — the upgraded outcome's
 * @param {"burn"|"improve"} kind
 * @returns {Promise<boolean>}
 */
export async function acceptRoundUpgrade(upgradeOf, resolution, kind) {
  if (!upgradeOf || !isCanonicalGM()) return false;
  const round = getStoredRound();
  if (!isResolving(round)) return false;
  const userId = (round.acting ?? []).find(id => round.entries[id]?.rolled?.resolutionId === upgradeOf) ?? null;
  if (!userId) return false;
  // Too late for the narration already being written: its card's buttons were
  // closed when it began; the round tells the result it began with.
  if (round.phase === ROUND_PHASE.NARRATING) return true;
  const relevance = round.entries[userId].rolled?.narrationInput?.relevance ?? null;
  const narrationInput = { ...narrationInputFrom(resolution, null), relevance, resolutionId: upgradeOf };
  try {
    await queueRoundWrite(r => decideUpgrade(r, { userId, decision: kind === "improve" ? "improve" : "burn", narrationInput, now: nowIso() }));
  } catch (err) {
    console.warn(`${MODULE_ID} | Batch Mode: the upgrade could not be saved on the round:`, err?.message ?? err);
  }
  advanceRound("upgrade");
  return true;
}

/**
 * Narrate the round once, under the move lock (claimed again here): close
 * the result cards' upgrades, claim the narration on the round, narrate
 * (narrateRound — its card, its fallback, or the X-Card's paused notice when
 * the X-Card is played while it is written), then finish the round. While
 * the X-Card is in play it is not begun. A claim a departed GM left, with no
 * card posted, is taken over.
 *
 * @returns {Promise<boolean>}
 */
async function narrateTheRound() {
  let round = getStoredRound();
  if (round?.phase !== ROUND_PHASE.NARRATING) return false;
  if (_narratingRoundId === round.id) return false;
  if (round.narrationClaim && roundNarrationPosted(round.id)) {
    await finishRound(round, "resolved");
    return true;
  }
  // Not begun while the X-Card is in play: the round waits for a GM to resume
  // (the lift runs the pass again). Played once the narration is written,
  // narrateRound discards the reply and posts the paused notice instead.
  if (isXCardActive(null)) return false;
  // Not narrated without a Claude key while the table has a keyed GM: the
  // round waits for them, handed back so their recovery (their load, a keyed
  // GM joining) narrates it (issue #347 D3).
  if (narrationWaitsForKey()) {
    await waitForKeyedNarrator(round);
    return false;
  }
  const lock = await claimRoundLock();
  if (!lock.claim) {
    lockNotClaimed(lock);
    return false;
  }
  _narratingRoundId = round.id;
  try {
    round = await queueRoundWrite(r => claimNarration(r, {
      narrationClaim: lock.claim, now: nowIso(), takeOver: !!r?.narrationClaim, resolverId: game.user.id,
    }));
    await closeCardUpgrades(round, null);
    await narrateRound({ round, campaignState: workingCopy() }).catch((err) => {
      console.error(`${MODULE_ID} | Batch Mode: the round's narration failed:`, err);
      tellNarrationUnposted();
    });
  } finally {
    _narratingRoundId = null;
    await releaseRoundLock(lock.claim);
  }
  await finishRound(getStoredRound() ?? round, "resolved");
  return true;
}

/**
 * The round's narration could not be posted — its card and its fallback both
 * refused: the moves stand, and the GMs are told, as free-flow tells them
 * (issue #322 V09). It was a console line only (issue #342 Z21). This GM by a
 * notification — a whisper can be refused as the cards were — the others by
 * a whisper. Never throws.
 */
function tellNarrationUnposted() {
  globalThis.ui?.notifications?.warn?.("Starforged Companion: the round's narration could not be posted to chat; its moves' results were still applied.");
  whisper(gmIds().filter(id => id !== game.user?.id), "Batch Mode — the round's narration was not posted",
    "The round's narration could not be posted to chat. Its moves' results were still applied — their result cards show them.",
    { batchNarrationUnpostedNotice: true });
}

// Round ids whose wait for a keyed narrator this client has told the GMs of.
const _toldNarrationWaits = new Set();

/**
 * The round waits for a GM with a Claude key to narrate it (issue #347 D3):
 * handed back when it names this GM as its resolver — a keyless GM that took
 * over its rolls — so the keyed GM's recovery resumes it rather than leaving
 * it to this one; the GMs told once. Never throws.
 *
 * @param {Object} round — narrating
 */
async function waitForKeyedNarrator(round) {
  if (round.resolverId === game.user?.id) {
    await queueRoundWrite(r => (r?.id === round.id ? handBackResolution(r, { resolverId: game.user.id }) : r))
      .catch(err => console.warn(`${MODULE_ID} | Batch Mode: round ${round.number} could not be handed back for a keyed GM:`, err?.message ?? err));
  }
  if (_toldNarrationWaits.has(round.id)) return;
  _toldNarrationWaits.add(round.id);
  console.debug(`${MODULE_ID} | Batch Mode: no Claude key on this GM — round ${round.number} waits for a keyed GM to narrate it.`);
  await tellGms("Batch Mode — the round waits for a GM with a Claude key",
    "The round's moves are rolled and recorded. Its narration needs a GM with a Claude key: it is narrated as soon as one is connected.",
    { batchNarrationWaitsNotice: true });
}

/** True once a round's narration — its card, fallback or paused notice — is in chat. */
function roundNarrationPosted(roundId) {
  return (game.messages?.contents ?? []).some(m => {
    const f = m?.flags?.[MODULE_ID];
    return f?.roundId === roundId && (f.narratorCard === true || f.narrationPaused === true);
  });
}

/**
 * The round is done: close it, open the next (or turn Batch Mode off when a
 * GM asked for that once it finished), then each entry's finishMove — the
 * asset riders, a GM prompt included, after the narration with the lock free
 * — and the non-participants' forced moves it held run as free-flow.
 *
 * Only the call whose close ends the round does the rest: a round another
 * call already closed is that call's, so its riders pay once (a refused close
 * used to run them, then the advance pass's retry ran them again — issue #342
 * Z20). The riders and the held moves run off the advance pass: an
 * unanswered "✦ Apply asset effects" prompt, or a held move's own prompts,
 * held every later round — Send now included — until the GM answered it
 * (Z03). Free-flow runs its riders with the move lock released for the same
 * reason (PLAYTEST-1712 M/N).
 *
 * @param {Object} round
 * @param {string} reason
 * @returns {Promise<boolean>} whether this call closed the round
 */
async function finishRound(round, reason) {
  const closed = await closeRoundHere(round, reason);
  if (!closed) {
    forgetRolledHere();
    return false;
  }
  if (closed.modeOffAfter) {
    await game.settings.set(MODULE_ID, BATCH_ENABLED_SETTING, false).catch(err =>
      console.warn(`${MODULE_ID} | Batch Mode: could not be turned off after the round:`, err?.message ?? err));
  } else {
    await openRoundIfDue("next-round");
  }
  const cs = workingCopy();
  const moves = (closed.acting ?? []).map(id => rolledFor(closed.id, closed.entries[id])).filter(Boolean);
  forgetRolledHere();
  afterTheRound(async () => {
    for (const rolled of moves) {
      await finishMove(rolled, cs).catch(err => console.warn(`${MODULE_ID} | Batch Mode: consequence riders failed:`, err?.message ?? err));
    }
  });
  runHeldMovesSoon();
  return true;
}

/**
 * Close the round as this call's own close: the round as written, or null
 * when it was already closed (another call finished it). A close the world
 * refuses is tried once more; refused again, it throws — the advance pass
 * stops with the round as it was.
 *
 * @param {Object} round
 * @param {string} reason
 * @returns {Promise<Object|null>}
 */
async function closeRoundHere(round, reason) {
  for (let attempt = 0; ; attempt += 1) {
    let closing = false;
    try {
      const written = await queueRoundWrite((r) => {
        closing = r?.id === round.id && r.phase !== ROUND_PHASE.CLOSED;
        return closing ? closeRound(r, { reason, now: nowIso() }) : r;
      });
      return closing ? written : null;
    } catch (err) {
      if (attempt >= 1) throw err;
      console.warn(`${MODULE_ID} | Batch Mode: the round's close was not saved — trying again:`, err?.message ?? err);
    }
  }
}

// What finished rounds leave to run — each round's consequence riders, one
// round after another, never on the advance pass (finishRound).
let _afterRounds = Promise.resolve();

function afterTheRound(work) {
  _afterRounds = _afterRounds.then(work).catch(err =>
    console.warn(`${MODULE_ID} | Batch Mode: after the round:`, err?.message ?? err));
}

/** The forced moves a resolving round held, run as free-flow off the advance pass. */
function runHeldMovesSoon() {
  Promise.resolve().then(runHeldFreeFlowMoves).catch(err =>
    console.warn(`${MODULE_ID} | Batch Mode: the held moves:`, err?.message ?? err));
}

/**
 * What finishMove takes for an entry: this client's own roll when it rolled
 * it, else one rebuilt from the round — the final outcome (after an upgrade)
 * and the reading's riders — so a round resumed after a reload still finishes
 * its moves. Not a move rolled on the character sheet: the round only
 * narrates it, as the sheet's own narration ran no riders (issue #345 D1).
 */
function rolledFor(roundId, entry) {
  if (entry?.status !== ENTRY_STATUS.RECORDED) return null;
  if (entry.reading?.kind === READING_KIND.SHEET_ROLL) return null;
  const input = entry.rolled?.narrationInput;
  if (input?.kind !== "move") return null;
  const here = rolledHere(roundId, entry.userId);
  const resolution = { ...(here?.resolution ?? {}), _id: entry.rolled.resolutionId ?? here?.resolution?._id ?? null,
    moveId: input.moveId, outcome: input.outcome, isMatch: input.isMatch === true };
  const interpretation = here?.interpretation ?? { extractedRiders: entry.reading?.interpretation?.extractedRiders ?? [] };
  const rollerActor = game.actors?.get?.(entry.actorId) ?? null;
  return { resolution, interpretation, rollerActor };
}

// ─────────────────────────────────────────────────────────────────────────────
// Card-button moves, and lines typed while the mode is on
// ─────────────────────────────────────────────────────────────────────────────

// Message ids, oldest first: a participant's card-button move (or sheet
// roll) held for the next round, and a non-participant's held until the
// resolving round closes.
const _heldForRound = [];
const _heldForFreeFlow = [];
// Round ids whose table-talk notice this client's user has had.
const _toldTableTalk = new Set();
// The sheet rolls the round took or holds, by their roll card's id: the
// parsed outcome as a resolution, and its roller — for the round's entry, or
// its own narration when no round takes it after all (takeSheetRoll — issue
// #345 D1).
const _sheetRolls = new Map();

/**
 * The chat pipeline's Batch Mode step (src/index.js onMessage), on every
 * client, for a line that is player narration. A typed line is table talk: it
 * is not narrated, its author is told once per round, and their window keeps
 * it as a draft when the box is empty. A card button's move (a forced move)
 * becomes its roller's entry on the canonical GM — or waits for the next
 * round while one resolves. True when the round took the line; false lets a
 * non-participant's forced move run as free-flow now.
 *
 * @param {ChatMessage} message
 * @returns {Promise<boolean>}
 */
export async function handleBatchModeLine(message) {
  const f = message?.flags?.[MODULE_ID] ?? {};
  const forced = f.bypassPacing === true || typeof f.forcedMoveId === "string";
  if (forced) {
    if (!isCanonicalGM()) return true;
    return takeForcedMove(message);
  }
  if (messageAuthorId(message) === game.user?.id) await keepTableTalk(message);
  return true;
}

/** The author's client: tell them once per round, and keep the line as a draft. */
async function keepTableTalk(message) {
  const round = getStoredRound();
  const key = roundIsOpen(round) ? round.id : "none";
  if (!_toldTableTalk.has(key)) {
    _toldTableTalk.add(key);
    ui.notifications?.info?.(`Starforged Companion: ${TABLE_TALK_NOTICE}`);
  }
  const text = stripHtml(String(message?.content ?? "")).trim();
  if (text && !getRoundDraft().trim()) await setRoundDraft(text, { fromOutside: true });
}

/**
 * A card button's move on the canonical GM. Its roller is the card's
 * (resolveSpeakerActorId). A participant's becomes their entry — or an offer
 * beside an entry already submitted, the window asking which to keep — while
 * the round collects; while it resolves (or before a session or round), it
 * waits for the next round. A non-participant's runs as free-flow: now while
 * the round collects, after it while it resolves.
 */
async function takeForcedMove(message) {
  const cs = campaignStateNow();
  // The inciting vow is sworn once for the crew: a second press is not rolled.
  const taken = incitingSwearTaken(message);
  if (taken) {
    await tellSwearNotRolled(message, taken);
    return true;
  }
  const actorId = resolveSpeakerActorId(message, cs);
  const participant = currentParticipants().find(p => p.actorId === actorId) ?? null;
  const round = getStoredRound();
  if (!participant) {
    if (!isResolving(round)) return false;
    if (!_heldForFreeFlow.includes(message.id)) _heldForFreeFlow.push(message.id);
    return true;
  }
  if (!roundIsOpen(round) || round.phase !== ROUND_PHASE.COLLECTING || !entryFor(round, participant.userId)) {
    holdForNextRound(message, participant);
    return true;
  }
  await joinRound(message, participant.userId);
  return true;
}

// The statuses of an entry whose action is still the round's to roll, or rolled.
const SWEARING = new Set([ENTRY_STATUS.SUBMITTED, ENTRY_STATUS.READ, ENTRY_STATUS.READY, ENTRY_STATUS.ROLLED, ENTRY_STATUS.RECORDED]);

/**
 * An inciting card's ⚔ Swear this vow is the crew's one swear (the shared
 * founding vow: one swear, its roll the clicker's), and the card is not
 * claimed — every client may press it, and a press held per presser would
 * roll the swear once per press (issue #337 Y36). So in Batch Mode a press is
 * not rolled when the card is sworn already, or when its swear is already
 * some participant's entry, an offer beside one, or held for the next round
 * (issue #342 Z30). Null when the press is the card's first.
 *
 * @param {ChatMessage} message — a forced post
 * @returns {{ sworn: true }|{ by: string }|null}
 */
function incitingSwearTaken(message) {
  const cardId = message?.flags?.[MODULE_ID]?.incitingSwearMessageId;
  if (typeof cardId !== "string" || !cardId) return null;
  if (game.messages?.get?.(cardId)?.flags?.[MODULE_ID]?.vowSworn === true) return { sworn: true };
  const swears = (forced) => forced?.incitingSwearMessageId === cardId;
  const round = getStoredRound();
  if (roundIsOpen(round)) {
    for (const e of Object.values(round.entries ?? {})) {
      if (e.readAs?.messageId === message.id || e.offer?.messageId === message.id) continue;   // this very post again
      if ((SWEARING.has(e.status) && swears(e.readAs?.forced)) || swears(e.offer?.forced)) return { by: e.actorName ?? "" };
    }
  }
  for (const id of _heldForRound) {
    if (id === message.id) continue;
    const held = game.messages?.get?.(id) ?? null;
    if (held?.flags?.[MODULE_ID]?.incitingSwearMessageId !== cardId) continue;
    const actorId = resolveSpeakerActorId(held, campaignStateNow());
    return { by: game.actors?.get?.(actorId)?.name ?? "" };
  }
  return null;
}

/**
 * Tell the presser — and the GMs — that their ⚔ press was not rolled, and
 * why. The notice names the post (`gatedMessageId`), so the presser's own
 * client re-arms its button (swearVow.js rearmSwearOnGateRefusal), as the
 * session gate's notice does.
 */
async function tellSwearNotRolled(message, taken) {
  const author = messageAuthorId(message);
  const body = taken.sworn
    ? "This vow has already been sworn — the crew swears it once, so this press was not rolled."
    : `${taken.by ? `${escapeHtml(taken.by)} is` : "Someone is"} already swearing this vow for the crew this round — it is sworn once, so this press was not rolled.`;
  await whisper([author, ...gmIds()], "Swear this vow", body, { swearPressDropped: true, gatedMessageId: message?.id ?? null });
}

function forcedFromFlags(f) {
  return {
    moveId:                 typeof f.forcedMoveId === "string" ? f.forcedMoveId : null,
    moveTarget:             typeof f.forcedMoveTarget === "string" ? f.forcedMoveTarget : null,
    moveTargetId:           typeof f.forcedMoveTargetId === "string" ? f.forcedMoveTargetId : null,
    swearToConnection:      typeof f.swearToConnection === "string" ? f.swearToConnection : null,
    tokenDragSetCourse:     f.tokenDragSetCourse ?? null,
    incitingSwearMessageId: typeof f.incitingSwearMessageId === "string" ? f.incitingSwearMessageId : null,
    // A move the card owes (the resist roll at 0): the roller's entry, never an offer (issue #342 D2).
    ...(f.owedMove === true ? { owed: true } : {}),
  };
}

/**
 * Make a forced move its roller's entry (or an offer beside theirs). A move
 * the card owes takes the entry even beside one written (round.js
 * offerForcedMove); a card move it displaces — or a second owed move — is
 * held for the next round.
 */
async function joinRound(message, userId) {
  const f = message?.flags?.[MODULE_ID] ?? {};
  const forced = forcedFromFlags(f);
  let read = false;
  let held = [];
  let written = null;
  try {
    written = await queueRoundWrite((latest) => {
      const res = offerForcedMove(latest, {
        userId, text: stripHtml(String(message?.content ?? "")), forced, submissionId: randomId(), now: nowIso(),
        messageId: message?.id ?? null,
      });
      read = res.read;
      held = res.held ?? [];
      return res.round;
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | Batch Mode: a card's move could not join the round:`, err?.message ?? err);
    const participant = currentParticipants().find(p => p.userId === userId);
    if (participant) holdForNextRound(message, participant);
    return;
  }
  holdCardMoves(held, written);
  if (read) startReading(userId);
}

/**
 * The card moves a round left behind (round.js takeCardMoves) wait for the
 * next round, as one pressed while a round resolves does — each roller told.
 *
 * @param {Array<{ userId: string, messageId: string }>} held
 * @param {Object|null} round — the round they were taken from (for the roller's name)
 */
function holdCardMoves(held, round) {
  for (const { userId, messageId } of held ?? []) {
    const message = game.messages?.get?.(messageId) ?? null;
    if (!message) continue;
    const entry = round?.entries?.[userId] ?? null;
    if (isSheetRollEntry(entry) && entry.readAs?.messageId === messageId && !_sheetRolls.has(messageId)) {
      _sheetRolls.set(messageId, sheetRollFromEntry(entry));
    }
    holdForNextRound(message, { userId, actorName: entry?.actorName ?? "" });
  }
}

function holdForNextRound(message, participant) {
  if (!message?.id || _heldForRound.includes(message.id)) return;
  _heldForRound.push(message.id);
  const owners = Array.from(game.users ?? []).filter(u => !u.isGM && u.id === participant.userId).map(u => u.id);
  const what = _sheetRolls.has(message.id) ? "roll on the character sheet is narrated with" : "move from the card joins";
  whisper([...owners, ...gmIds()], "Held for the next round",
    `${escapeHtml(participant.actorName)}'s ${what} the next round, in the Round window.`,
    { batchHeldMoveNotice: true }).catch(err => console.warn(`${MODULE_ID} | Batch Mode: held-move notice failed:`, err?.message ?? err));
}

/**
 * Whether a vow or bond progress roll made on the system sheet is narrated
 * with a Batch Mode round (issue #345 D1): the mode on, a GM connected to run
 * the round, and its roller — the roll card's speaker — a participant's
 * character. Every client reaches the same answer from shared data, so the
 * others stand down while the canonical GM takes it (takeSheetRoll). Anyone
 * else's sheet roll is narrated at once, as a non-participant's card move
 * runs as free-flow.
 *
 * @param {ChatMessage} message — a chat message (any: cheap when the mode is off)
 * @returns {boolean}
 */
export function sheetRollJoinsRound(message) {
  if (!isBatchModeEnabled()) return false;
  if (!Array.from(game.users ?? []).some(u => u?.isGM && u?.active)) return false;
  const actorId = typeof message?.speaker?.actor === "string" ? message.speaker.actor : null;
  return !!actorId && currentParticipants().some(p => p.actorId === actorId);
}

/**
 * A participant's vow or bond progress roll made on the system sheet, on the
 * canonical GM (src/index.js registerNativeProgressRollHook; issue #345 D1 —
 * the maintainer's option A). The system rolled it and the module's payoff
 * hook paid it, as it always does — fulfilment, legacy, a miss's recommit
 * offer; the round takes only its narration. While the round collects it
 * becomes the roller's entry, ready, carrying the parsed outcome
 * (joinSheetRoll); with no round collecting — one resolving, none open before
 * a session, the roller not in it yet — it is held for the next round, as a
 * card's move is, and with the mode turned off before one opens it gets its
 * own narration (narrateSheetRoll), as before Batch Mode.
 *
 * @param {ChatMessage} message — the system's roll card
 * @param {Object} resolution — its outcome, as the sheet's own narration takes it
 * @returns {Promise<boolean>} true when the round took or holds it; false —
 *   narrate it now (its roller is no participant)
 */
export async function takeSheetRoll(message, resolution) {
  if (!isCanonicalGM() || !isBatchModeEnabled() || !message?.id || !resolution) return false;
  const actorId = typeof message?.speaker?.actor === "string" ? message.speaker.actor : null;
  const participant = currentParticipants().find(p => p.actorId === actorId) ?? null;
  if (!participant) return false;
  _sheetRolls.set(message.id, { resolution, actorId });
  const round = getStoredRound();
  if (!roundIsOpen(round) || round.phase !== ROUND_PHASE.COLLECTING || !entryFor(round, participant.userId)) {
    holdForNextRound(message, participant);
    return true;
  }
  await joinSheetRoll(message, participant.userId);
  return true;
}

/**
 * Make a sheet roll its roller's entry (round.js enterSheetRoll): ready, with
 * the narration input its outcome gives — the relevance its narration would
 * have resolved, as the sheet's own narration did. A card move it displaces,
 * or the sheet roll itself beside an owed roll or another sheet roll, is held
 * for the next round; a join the world refused is too.
 */
async function joinSheetRoll(message, userId) {
  const sheet = _sheetRolls.get(message?.id);
  if (!sheet) return;
  const { resolution } = sheet;
  const relevance = await resolveRelevance(resolution.playerNarration ?? "", resolution.moveId, resolution.outcome, workingCopy())
    .catch((err) => {
      console.warn(`${MODULE_ID} | Batch Mode: the sheet roll's relevance failed; narrated at embellishment:`, err?.message ?? err);
      return null;
    });
  const narrationInput = narrationInputFrom(resolution, relevance);
  let held = [];
  let written = null;
  try {
    written = await queueRoundWrite((latest) => {
      const res = enterSheetRoll(latest, {
        userId, text: resolution.playerNarration ?? "", narrationInput, submissionId: randomId(), now: nowIso(),
        messageId: message.id,
      });
      held = res.held;
      return res.round;
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | Batch Mode: a sheet roll could not join the round:`, err?.message ?? err);
    const participant = currentParticipants().find(p => p.userId === userId);
    if (participant) holdForNextRound(message, participant);
    return;
  }
  holdCardMoves(held, written);
  advanceRound("sheet-roll");
}

/**
 * A sheet roll no round took, narrated on its own as before Batch Mode —
 * the sheet narration's call (narrateResolution) on a working copy taken now,
 * as its roller. Never throws.
 */
async function narrateSheetRoll(sheet) {
  try {
    await narrateResolution(sheet.resolution, workingCopy(), { speakerActorId: sheet.actorId ?? null });
  } catch (err) {
    console.warn(`${MODULE_ID} | Batch Mode: a held sheet roll's narration failed:`, err?.message ?? err);
  }
}

/**
 * A sheet roll as a stored entry keeps it — for one this client did not take
 * (another GM's game took it before leaving, or this page reloaded since)
 * that a round hands back: its outcome rebuilt from the entry's narration
 * input, so it joins the next round as a sheet roll, never as a card's move
 * to read and roll.
 *
 * @param {Object} entry — isSheetRollEntry
 * @returns {{ resolution: Object, actorId: string|null }}
 */
function sheetRollFromEntry(entry) {
  const input = entry.reading?.narrationInput ?? {};
  return {
    actorId: entry.actorId ?? null,
    resolution: {
      _id: input.resolutionId ?? null, moveId: input.moveId ?? null, moveName: input.moveName ?? null,
      outcome: input.outcome ?? null, outcomeLabel: input.outcomeLabel ?? null, isMatch: input.isMatch === true,
      isProgressMove: true, statUsed: null, loremasterContext: input.loremasterContext ?? "",
      oracleSeeds: input.oracleSeeds ?? null, playerNarration: entry.text ?? "",
    },
  };
}

// The round the held moves last joined: they join a round once. Its opening
// is heard twice (the closer's own open and the close's onRoundWritten), and
// a second drain took again what the first one's round had handed back.
let _heldJoinedRoundId = null;

/**
 * The card-button moves held for the next round join it, oldest first — the
 * ones held as it opens. A move the round hands back (round.js
 * offerForcedMove: a second owed roll beside an owed entry, or a card move
 * an owed roll displaced) or a join the world refused is held again for the
 * round after. Taken again in the same drain, a second owed roll looped
 * forever, whispering "Held for the next round" and stopping the canonical
 * GM's page (issue #345 AA08).
 */
async function joinHeldMoves() {
  const round = getStoredRound();
  if (round?.phase !== ROUND_PHASE.COLLECTING || round.id === _heldJoinedRoundId) return;
  _heldJoinedRoundId = round.id;
  for (const id of [..._heldForRound]) {
    // Each id leaves the list as it is taken, so a press meanwhile still sees
    // the ones waiting (incitingSwearTaken); one gone meanwhile went free-flow
    // with the mode turned off (turnedOff).
    const at = _heldForRound.indexOf(id);
    if (at === -1) continue;
    _heldForRound.splice(at, 1);
    const message = game.messages?.get?.(id) ?? null;
    if (!message) continue;
    // An inciting swear sworn while it was held is not rolled again.
    const taken = incitingSwearTaken(message);
    if (taken) {
      await tellSwearNotRolled(message, taken);
      continue;
    }
    const actorId = resolveSpeakerActorId(message, campaignStateNow());
    const entry = Object.values(getStoredRound()?.entries ?? {}).find(e => e.actorId === actorId) ?? null;
    if (!entry) {
      // Its roller is not in this round (they left): free-flow, as today.
      _heldForFreeFlow.push(id);
      continue;
    }
    if (_sheetRolls.has(id)) await joinSheetRoll(message, entry.userId);
    else await joinRound(message, entry.userId);
  }
}

// True while runHeldFreeFlowMoves is draining: one drain at a time, oldest first.
let _runningHeld = false;

/**
 * A non-participant's forced move a resolving round held runs now, as
 * free-flow — and a sheet roll no round took gets the narration it had
 * before Batch Mode (narrateSheetRoll).
 */
async function runHeldFreeFlowMoves() {
  if (_runningHeld || isResolving(getStoredRound())) return;
  _runningHeld = true;
  try {
    while (_heldForFreeFlow.length) {
      const id = _heldForFreeFlow.shift();
      const message = game.messages?.get?.(id) ?? null;
      if (!message) continue;
      const sheet = _sheetRolls.get(id);
      if (sheet) {
        _sheetRolls.delete(id);
        await narrateSheetRoll(sheet);
        continue;
      }
      if (!_freeFlowRunner) continue;
      await Promise.resolve(_freeFlowRunner(message)).catch(err =>
        console.warn(`${MODULE_ID} | Batch Mode: a held move failed:`, err?.message ?? err));
    }
  } finally {
    _runningHeld = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery, and the canonical GM's hooks
// ─────────────────────────────────────────────────────────────────────────────

// The session this load is replacing (session/lifecycle.js
// sessionBeingReplaced, noted by the canonical GM's `ready` before its mint):
// until the mint lands the stored session still reads live (its gate open,
// its id current), and the recovery at load read last session's submissions
// again on the GM's key and advanced its round (issue #342 Z24). Its rounds
// are over: none reads, resolves or opens until a new session is current.

// The recoveries issue #340 names ("Recovery"): the canonical GM's `ready`,
// and the GM resolving a round leaving. On these a round still resolving from
// an ended session is closed; on any other (a user joining, a GM entering a
// key) it finishes first, as End a Session lets it — those closed it, its
// narration and riders never run (issue #342 Z23).
const CLOSES_RESOLVING_ROUND = new Set(["ready", "resolver-left"]);

/**
 * On the canonical GM's `ready`, when it becomes canonical (the resolving GM
 * left; a GM left while the round collects), when a user joins and when a
 * keyed GM joins: a collecting round from an ended session is closed, and a
 * resolving one too on `ready` or when its GM left (CLOSES_RESOLVING_ROUND) —
 * otherwise it finishes first; one left resolving whose GM is gone is
 * resumed; a collecting one has its lost readings started again and gains
 * the participants who joined. Then a round opens when one is due.
 *
 * @param {string} [reason]
 * @returns {Promise<void>}
 */
export async function recoverRound(reason = "recovery") {
  if (!isCanonicalGM()) return;
  const round = getStoredRound();
  const cs = campaignStateNow();
  if (roundIsOpen(round)) {
    const sessionOver = !isSessionActive(cs) || round.sessionId !== (cs.currentSessionId ?? null) || sessionBeingReplaced(cs);
    if (sessionOver && !isResolving(round)) {
      await closeCollectingRound("session-ended");
    } else if (sessionOver && CLOSES_RESOLVING_ROUND.has(reason)) {
      await queueRoundWrite(r => (r?.id === round.id ? closeRound(r, { reason: "session-ended", now: nowIso() }) : r))
        .catch(err => console.warn(`${MODULE_ID} | Batch Mode: an ended session's round could not be closed:`, err?.message ?? err));
    } else if (isResolving(round)) {
      const resolver = round.resolverId && round.resolverId !== game.user.id ? game.users?.get?.(round.resolverId) : null;
      if (resolver?.active) return;   // that GM is resolving it
      // This GM takes it over, and the round says so: the GM who began it,
      // back on a fresh page and canonical again, leaves it to this one. The
      // takeover kept the first GM's id, so that GM's recovery read the round
      // as its own and resumed it beside this one — both closed it, and every
      // asset rider paid twice (issue #347 AB18). A refused stamp still lets
      // the round go on. Not a narration this keyless GM leaves to a keyed
      // one (issue #347 D3): the keyed GM's own recovery then finds no
      // resolver to leave it to.
      if (!(round.phase === ROUND_PHASE.NARRATING && narrationWaitsForKey())) {
        await queueRoundWrite(r => (r?.id === round.id ? takeOverResolution(r, { resolverId: game.user.id }) : r))
          .catch(err => console.warn(`${MODULE_ID} | Batch Mode: the takeover of round ${round.number} was not saved:`, err?.message ?? err));
      }
      const plan = recoveryPlan(round);
      console.log(`${MODULE_ID} | Batch Mode: resuming round ${round.number} (${reason}) — ${plan.recorded.length} recorded, ${plan.unrecorded.length} unrecorded, ${plan.toRoll.length} to roll.`);
      advanceRound("recovery");
      return;
    } else {
      for (const p of currentParticipants()) {
        if (!round.entries[p.userId]) await queueRoundWrite(r => addParticipant(r, p)).catch(() => null);
      }
      for (const id of readingsInFlight(getStoredRound())) startReading(id);
      advanceRound("recovery");
      return;
    }
  }
  await openRoundIfDue(reason);
}

let _xCardWas = false;

/**
 * campaignState changed (the canonical GM acts; every client keeps its X-Card
 * memory, so a GM who becomes canonical later starts from the truth): a
 * collecting round that belongs to no active session — End a Session, a
 * session re-minted after four idle hours — is closed, and a round opens when
 * none is (Begin a Session; get-or-create, so a repeat opens nothing). Read
 * from the state as it is, never from a remembered "last session", which a
 * client that was not canonical then could hold stale. The X-Card lifting and
 * the move lock freeing let a waiting round go on.
 */
function onCampaignStateChanged(setting) {
  if (setting?.key !== `${MODULE_ID}.campaignState`) return;
  const cs = campaignStateNow();
  const xCard = !!cs.xCardActive;
  const lifted = _xCardWas && !xCard;
  _xCardWas = xCard;
  if (!isCanonicalGM()) return;
  if (isBatchModeEnabled()) {
    const active = isSessionActive(cs);
    const sessionId = cs.currentSessionId ?? null;
    const round = getStoredRound();
    const work = (async () => {
      if (roundIsOpen(round) && round.phase === ROUND_PHASE.COLLECTING && (!active || round.sessionId !== sessionId)) {
        await closeCollectingRound("session-ended");
      }
      if (active && (!roundIsOpen(getStoredRound()) || getStoredRound()?.sessionId !== sessionId)) {
        await openRoundIfDue("session-began");
      }
    })();
    work.catch(err => console.warn(`${MODULE_ID} | Batch Mode: the session change:`, err?.message ?? err));
  }
  if (lifted) advanceRound("x-card-lifted");
  if (_waitingForLock && !cs.pendingMove) {
    _waitingForLock = false;
    advanceRound("lock-free");
  }
}

/**
 * A world setting was written (every client hears it; the canonical GM acts).
 * The keyed-GM registry: a GM with a Claude key is canonical now, and reads
 * the submissions a keyless GM could not (and resumes a round left
 * resolving). The round: a closed one is followed by the next
 * (onRoundWritten). campaignState: onCampaignStateChanged.
 *
 * @param {{ key?: string }} setting
 */
function onBatchSettingWrite(setting) {
  if (setting?.key === `${MODULE_ID}.keyedGmUserIds`) {
    if (!isCanonicalGM() || !isBatchModeEnabled()) return;
    recoverRound("keyed-gm").catch(err => console.warn(`${MODULE_ID} | Batch Mode: recovery for a keyed GM:`, err?.message ?? err));
    return;
  }
  if (setting?.key === `${MODULE_ID}.${BATCH_ROUND_SETTING}`) {
    onRoundWritten();
    return;
  }
  // Every client keeps its X-Card memory; only the canonical GM acts on it.
  if (setting?.key !== `${MODULE_ID}.campaignState`) return;
  onCampaignStateChanged(setting);
}

/**
 * The round was written (every client hears it; the canonical GM acts): once
 * it is closed — whoever closed it — the next one opens. A GM who stopped
 * being canonical while narrating a round (a lower-id GM entered a Claude
 * key) closes it but cannot open the next, and the new canonical GM heard
 * nothing it acted on: the table was left with no round (issue #342 Z22).
 * Get-or-create, so the closer's own open makes this a repeat; a round that
 * turns the mode off when it finishes opens nothing.
 */
function onRoundWritten() {
  if (!isCanonicalGM() || !isBatchModeEnabled()) return;
  const round = getStoredRound();
  if (!round || roundIsOpen(round) || round.modeOffAfter) return;
  openRoundIfDue("round-closed").catch(err =>
    console.warn(`${MODULE_ID} | Batch Mode: the next round after a close:`, err?.message ?? err));
}

/**
 * A chat card changed (every client hears it; the canonical GM acts): while
 * the round waits on upgrades, a change to an offer's move card or to its
 * outcome's choice card — the consequence chosen there closes the card's
 * Burn and Improve — moves the round on (keepUndecidable, on the advance
 * pass). The round kept waiting on the Burn the card refused (issue #342
 * Z27).
 *
 * @param {ChatMessage} message
 */
function onChatCardUpdated(message) {
  if (!isCanonicalGM()) return;
  const round = getStoredRound();
  if (round?.phase !== ROUND_PHASE.UPGRADING) return;
  const f = message?.flags?.[MODULE_ID];
  if (!f || !message?.id) return;
  const concerned = undecidedUpgrades(round).map(id => round.entries[id]).some(e =>
    e?.upgrade?.cardId === message.id || e?.rolled?.cardId === message.id
    || (f.sufferCard === true && !!f.resolutionId && f.resolutionId === e?.rolled?.resolutionId));
  if (concerned) advanceRound("card-changed");
}

/** A user joined or left (canonical GM). */
async function onUserConnected(user, connected) {
  if (!isBatchModeEnabled()) return;
  if (!isCanonicalGM()) return;
  const round = getStoredRound();
  if (connected) {
    const p = currentParticipants().find(x => x.userId === user?.id);
    if (p && roundIsOpen(round) && round.phase === ROUND_PHASE.COLLECTING && !round.entries[p.userId]) {
      await queueRoundWrite(r => addParticipant(r, p)).catch(err =>
        console.warn(`${MODULE_ID} | Batch Mode: a joining player could not be added:`, err?.message ?? err));
    }
    // A keyed GM who joined is canonical now: the submissions waiting are read here.
    await recoverRound("user-joined");
    return;
  }
  if (round?.phase === ROUND_PHASE.UPGRADING && round.entries[user?.id]?.upgrade && !round.entries[user.id].upgrade.decided) {
    await keepUpgrades([user.id]);
  }
  if (round?.resolverId === user?.id && isResolving(round)) {
    await recoverRound("resolver-left");
    return;
  }
  // A GM leaving may leave this GM canonical: the readings that GM's game ran
  // died with its browser, and nothing read them again — the player's window
  // said "Reading your action…" for good and the round could not resolve by
  // itself (issue #345 AA42). recoverRound starts them again here, as on a
  // load or a keyed GM joining; a reading this client runs is left to run.
  if (user?.isGM && roundIsOpen(round) && round.phase === ROUND_PHASE.COLLECTING) {
    await recoverRound("gm-left");
    return;
  }
  advanceRound("user-left");
}

/**
 * Install the driver's hooks (every client registers; the canonical GM acts).
 * Call from `ready`, after the chat hook.
 */
export function registerBatchModeDriver() {
  _xCardWas = !!campaignStateNow().xCardActive;
  // A setting's first write is a createSetting, every later one an updateSetting.
  Hooks.on("createSetting", onBatchSettingWrite);
  Hooks.on("updateSetting", onBatchSettingWrite);
  Hooks.on("updateChatMessage", onChatCardUpdated);
  Hooks.on("userConnected", (user, connected) => {
    onUserConnected(user, connected).catch(err =>
      console.warn(`${MODULE_ID} | Batch Mode: a connection change:`, err?.message ?? err));
  });
  if (isCanonicalGM() && isBatchModeEnabled()) {
    recoverRound("ready").catch(err => console.warn(`${MODULE_ID} | Batch Mode: recovery on ready:`, err?.message ?? err));
  }
}

/** Whether a keyed GM is connected (the readings and the narration run there). */
export function batchModeKeyedGm() {
  try { return hasKeyedActiveGM(); }
  catch { return false; }
}
