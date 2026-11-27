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
 *     - No active GM — or none whose page can act, every one having stood
 *       down after its connection dropped (hasActiveGM): warns the requester
 *       (no silent failures) and returns `{ ok: false, reason: "no-gm" }`.
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
 * read-modify-writes never interleave (a `!bond` landing mid-End a Session,
 * …). A handler that rejects releases the queue in
 * a `finally`; one that never settles is waited on for at most its run budget
 * (warned) before the next action runs anyway — one bad action can never
 * wedge every later relay. The budget is GM_ACTION_TIMEOUT_MS, or for a kind
 * that makes a Claude call (`claude: true`) GM_CLAUDE_ACTION_TIMEOUT_MS — two
 * bounded requests in sequence — and it counts from the moment
 * the predecessor starts running, not from when the waiting action was queued
 * (issue #300 F15: a flat 60 s cap, shorter than one 120 s Claude request,
 * let an ordinary slow narration run alongside the action behind it, and a
 * backlog behind one slow action timed out together). Consequences:
 *   - a long handler (an oracle follow-up's or End a Session's Claude call)
 *     delays later relays until it settles or times out;
 *   - a handler must NOT call requestGmAction itself on the canonical GM — the
 *     nested action would queue behind its own caller until the timeout.
 * The exceptions are the two safety writes (UNQUEUED_ACTIONS): the X-Card and
 * a player's Private Lines sync run the moment they arrive. Queued behind a
 * Claude-calling handler each waited up to the timeout while the move
 * pipeline — which is not queued — narrated straight through it: the paused
 * scene went on (XCARD-QUEUED), the Private Line just added was missing from
 * the narration (issue #345 D5). Running them unqueued is safe because each
 * reads and writes the store with no await in between — suppressScene, and
 * applyPrivateLinesSync's one read-and-set at its turn on the client's
 * campaignState write chain, which still orders two syncs — and no handler
 * writes back a campaignState snapshot held across an await (each merges only
 * the fields it owns onto the latest store — decisions.md → "Long-running
 * pipeline writes merge relay-owned fields"). The chat-activity stamp the
 * X-Card's own card fires writes its own setting, not campaignState (issue
 * #342 Z01).
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
 *   - "errorLog.append"                           — src/logging/errorLog.js
 *   - "audio.cache.write", "audio.synth.*"        — src/audio/index.js
 * The world-writing ones that predated this module are folded into
 * GM_ACTIONS: "expedition.recommit" (issue #321 U20), "vow.setReward" and
 * "vow.linkConnection" as "vow.reward" and "vow.link" (issue #325 W11), and
 * "combat.enterFray" as "combat.threshold" (issue #329 X06).
 *
 * Handler signature: `async (payload, ctx) => void`, where
 *   ctx = { requesterId, requester, requesterIsGM, local }
 * `requester` is the Foundry User who asked (null if unknown). Handlers that
 * enforce permissions (e.g. GM-only fact-continuity corrections) must check
 * `ctx.requesterIsGM`, never `game.user.isGM` — on the relay path the code is
 * running on the GM's client on the player's behalf.
 *
 * A refused card press is told
 * ----------------------------
 * The relay has no ack: a press the handler refuses re-arms its button after
 * 15 s (burnMomentum.js RELAY_RECOVERY_MS) and nothing more. A handler that refuses a press for
 * whose the card is — the requester owns none of its character, or that
 * character is gone — names it with refusePress(ctx, reason, actor), and
 * runGmAction whispers the requester and the GMs once, saying whose button it
 * is (known-issues RELAY-REFUSED-PRESS-UNTOLD).
 */

import { isCanonicalGM, noteGmLoading, noteGmReady, noteGmStoodDown, forgetGmLoad, gmPageCanAct, _resetGmLoadForTests } from "./gmGate.js";
import { pageIsStale, onPageStale } from "./connectionWatch.js";
import { DEFAULT_TIMEOUT_MS } from "../net/fetchWithTimeout.js";

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
 * Every GM's own page-ready announcement, `{ kind, userId }` (issue #347
 * AB03): the canonical-GM election passes over a GM whose connect a client saw
 * until this arrives (gmGate.js). Not an action — never dispatched to a
 * handler.
 */
export const GM_PAGE_READY_KIND = `${GM_RELAY_KIND_PREFIX}gm-page-ready`;

/**
 * A GM page whose connection dropped and came back, `{ kind, userId }`: its
 * cache may lack what changed meanwhile, so it stands down until it reloads
 * (connectionWatch.js) — every client passes it over in the election, as a
 * page still loading, and the canonical GM takes over what it held (gmGate.js
 * noteGmStoodDown; issue #347 AB19-STALE-CACHE-WRITES). Its reload's
 * page-ready announcement counts it again. Not an action. (A GM whose socket
 * came back on a loaded page used to answer an "is your page ready?" question
 * at once — issue #347 AB03; every such page is stale now, so nothing asks.)
 */
export const GM_PAGE_STALE_KIND = `${GM_RELAY_KIND_PREFIX}gm-page-stale`;

/**
 * How long a queued action waits for the action ahead of it — counted from
 * when that action started running — before running anyway (with a warning),
 * so a handler that never settles cannot block later relays.
 */
export const GM_ACTION_TIMEOUT_MS = 60_000;

/**
 * The same budget for an action that makes a Claude call (`claude: true`):
 * two bounded requests in sequence (DEFAULT_TIMEOUT_MS each, body included —
 * a call and its rate-limit retry, or a helper call ahead of the narration),
 * with headroom. An ordinary slow narration keeps the queue serialised; only
 * a hung handler is passed.
 */
export const GM_CLAUDE_ACTION_TIMEOUT_MS = 2 * DEFAULT_TIMEOUT_MS + 30_000;

/**
 * kind → { load, fn, claude? }. `load` imports the owning module; `fn` names
 * the exported handler; `claude` marks a handler that awaits a Claude call
 * (its run budget is GM_CLAUDE_ACTION_TIMEOUT_MS). Paths are relative to this
 * file.
 */
export const GM_ACTIONS = Object.freeze({
  // Safety
  "xcard.activate":            { load: () => import("../context/safety.js"),                         fn: "suppressScene" },
  "safety.setFlag":            { load: () => import("../safety/sessionDialogs.js"),                  fn: "applySafetyFlag" },
  "session.takeBreak":         { load: () => import("../safety/sessionDialogs.js"),                  fn: "applyTakeBreak" },
  "safety.syncPrivateLines":   { load: () => import("../ui/settingsPanel.js"),                       fn: "applyPrivateLinesSync" },
  // Session lifecycle
  "session.begin":             { load: () => import("../safety/sessionLifecycleDialogs.js"),         fn: "applyBeginSession", claude: true },
  "session.end":               { load: () => import("../safety/sessionLifecycleDialogs.js"),         fn: "applyEndSession",   claude: true },
  // Chat commands
  "bond.apply":                { load: () => import("../moves/bondCommand.js"),                      fn: "applyBondEffects" },
  "factContinuity.command":    { load: () => import("../factContinuity/chatCommands.js"),            fn: "applyFactContinuityCommand" },
  "oracle.narrate":            { load: () => import("../oracles/oracleFollowup.js"),                 fn: "narrateOracleFollowupOnGm", claude: true },
  "oracle.forgetResult":       { load: () => import("../oracles/oracleFollowup.js"),                 fn: "forgetOracleResultFromRelay" },
  "repair.apply":              { load: () => import("../moves/repair.js"),                           fn: "applyRepairSpends" },
  "payThePrice.advanceClocks": { load: () => import("../clocks/payThePriceClocks.js"),               fn: "advanceClocksForPayThePriceRelay" },
  "payThePrice.suffer":        { load: () => import("../index.js"),                                  fn: "applyPayThePriceSufferFromRelay" },
  // Issue #347 AB06 — forced moves a GM held, handed to the GM who became canonical
  "forcedMove.hold":           { load: () => import("../index.js"),                                  fn: "holdHandedOverForcedMoves" },
  // Issue #382 — the session record: an event a co-GM's client reports, written by the canonical GM (its one writer)
  "record.append":             { load: () => import("../record/record.js"),                          fn: "applyRecordAppendFromRelay" },
  // Issue #399's audit N27 — a co-GM's Consistency Check row, written by the canonical GM (its one writer)
  "telemetry.consistency":     { load: () => import("../pacing/telemetry.js"),                       fn: "applyRelayedConsistencyDecision" },
  // Narration on a player's own key (no keyed GM online)
  "narrator.sidecar":          { load: () => import("../narration/narrator.js"),                     fn: "applyRelayedNarratorSidecar" },
  // Known-issues SUMMARY-KEYLESS-GM — the rolling summary a keyed player's client made, for a keyless GM to store
  "narrator.summary":          { load: () => import("../narration/narrator.js"),                     fn: "applyRelayedSessionSummary" },
  // Known-issues DRAFT-CONFIRM-TWO-GMS — a "New Entities Detected" card's Confirm / Dismiss, one press at a time
  "draft.confirm":             { load: () => import("../entities/entityExtractor.js"),               fn: "applyDraftConfirmFromRelay" },
  "draft.dismiss":             { load: () => import("../entities/entityExtractor.js"),               fn: "applyDraftDismissFromRelay" },
  // Issue #362 D10 — "No — a new person" on a row read as someone the table knows
  "draft.newPerson":           { load: () => import("../entities/entityExtractor.js"),               fn: "applyDraftNewPersonFromRelay" },
  // A draft row's 🤝 Make a Connection — a Confirm records the person, the move makes the connection (overhaul 4, D4).
  "draft.makeConnection":      { load: () => import("../entities/entityExtractor.js"),               fn: "applyDraftMakeConnectionFromRelay", record: true },
  // Chat-card buttons
  "move.burnMomentum":         { load: () => import("../moves/burnMomentum.js"),                     fn: "applyBurnFromRelay",    claude: true },
  "move.improveResult":        { load: () => import("../moves/improveResult.js"),                    fn: "applyImproveFromRelay", claude: true },
  // Issue #354 P2-10 — a free-flow result held for Burn / Improve / Keep: "Keep the result" pays its price and narrates it
  "move.keepResult":           { load: () => import("../moves/heldResult.js"),                       fn: "applyKeepResultFromRelay", claude: true },
  // Issue #364 SOJOURN-VOW-OPTION-REMINDER-ONLY — the community's need card of a Sojourn miss: "⚔ Swear an Iron Vow"
  // writes the vow on the roller's sheet; "✔ It is done" resolves the Sojourn as a strong hit and narrates it
  "sojourn.need":              { load: () => import("../moves/sojournNeed.js"),                      fn: "applySojournNeedFromRelay", claude: true, record: true },
  "milestone.pick":            { load: () => import("../moves/milestonePicker.js"),                  fn: "applyMilestonePick", record: true },
  "connection.pick":           { load: () => import("../moves/cardActions.js"),                      fn: "applyConnectionPick", record: true },
  "waypoint.oracle":           { load: () => import("../moves/cardActions.js"),                      fn: "applyWaypointOraclePick", record: true },
  "combatTrack.battle":        { load: () => import("../moves/cardActions.js"),                      fn: "applyCombatTrackBattle", record: true },
  "wayOut.pick":               { load: () => import("../moves/cardActions.js"),                      fn: "applyWayOutPick", record: true },
  // Issue #329 X06 — the "⚔ A fight looms" card's ⚔ Begin the fight / Find another
  // way, claimed once on the card (the legacy "combat.enterFray" socket, folded in)
  "combat.threshold":          { load: () => import("../moves/cardActions.js"),                      fn: "applyCombatThresholdChoice", record: true },
  "connection.suggest":        { load: () => import("../moves/cardActions.js"),                      fn: "applyConnectionSuggestion", record: true },
  "vow.reward":                { load: () => import("../session/swearVow.js"),                       fn: "applyRewardPickFromRelay", record: true },
  "vow.link":                  { load: () => import("../session/swearVow.js"),                       fn: "applyPlayerVowLinkFromRelay", record: true },
  // The sworn card's 🤝 Make a Connection — the inciting vow's target is a person (overhaul 4, D5).
  "vow.makeConnection":        { load: () => import("../session/swearVow.js"),                       fn: "applyVowTargetMakeConnection", record: true },
  "fightVow.markMilestone":    { load: () => import("../moves/cardActions.js"),                      fn: "applyFightVowMarkMilestone", record: true },
  "fightVow.deepenBond":       { load: () => import("../moves/cardActions.js"),                      fn: "applyFightVowDeepenBond", record: true },
  // Claude: a pick that keeps a held result its card answers on a card of its own waits for that result's narration
  // (Sojourn's "Community needs help" — issue #364 SOJOURN-OATH-NARRATED-BEFORE-MISS)
  "suffer.pick":               { load: () => import("../moves/sufferCard.js"),                       fn: "applySufferPickFromRelay", claude: true, record: true },
  "payoff.retry":              { load: () => import("../moves/cardActions.js"),                      fn: "applyPayoffRetry" },
  // Issue #347 residual TRACKS-JOURNAL-SPLIT-NOT-MERGED — a split journal's Merge, a GM's press claimed once on the card
  "journal.merge":             { load: () => import("../world/journalSplitMerge.js"),                fn: "applyJournalMerge" },
  // Issue #353 Phase 3 — a countdown's "Begin the scene challenge", a GM's press claimed once on the card
  "sceneChallenge.begin":      { load: () => import("../moves/sceneChallengeOffer.js"),              fn: "applySceneChallengeOffer", record: true },
  // Issue #321 group A — one-shot card buttons claimed on the GM-authored card:
  // U02 "Which vow?" (a Fulfill Your Vow that named none of several open vows);
  // U20 a move card's "⚑ Mark Progress on Vow", and an expedition's "🔁 Recommit"
  // (the legacy "expedition.recommit" socket relay, folded in — RELAY-LEGACY-KINDS)
  "fulfilVow.pick":            { load: () => import("../moves/cardActions.js"),                      fn: "applyFulfilVowPick", record: true },
  // Issue #331 X63 — "Which legacy track?" (a Continue a Legacy that named none), each track claimed once
  "legacy.pick":               { load: () => import("../moves/cardActions.js"),                      fn: "applyLegacyTrackPick", record: true },
  "milestone.suggestion":      { load: () => import("../moves/cardActions.js"),                      fn: "applyMilestoneSuggestion", record: true },
  // Known-issues FULFIL-BUTTON-LOCAL-DISABLE — a move card's and a won-fight card's
  // "🏁 Attempt to Fulfill", claimed once on the card
  "fulfilVow.attempt":         { load: () => import("../moves/cardActions.js"),                      fn: "applyAttemptFulfilVow", record: true },
  // Issue #338 D1 — a card's forced follow-up, the roller's to press, claimed once on the card:
  // "⚔ Attempt to Finish the Fight", "🗺 Finish the Expedition", a new vow's "⚔ Swear it (roll)"
  "tda.attempt":               { load: () => import("../moves/cardActions.js"),                      fn: "applyTakeDecisiveActionAttempt", record: true },
  "expedition.finish":         { load: () => import("../moves/cardActions.js"),                      fn: "applyFinishExpeditionAttempt", record: true },
  "vow.swearRoll":             { load: () => import("../session/swearVow.js"),                       fn: "applyPlayerVowSwearFromRelay", record: true },
  // Known-issues PACED-ROLL-OPEN-PRESS — the same shape for a paced card's "Roll <move>"
  // and a "Which fight?" pick (checked against the card's own fights)
  "paced.roll":                { load: () => import("../moves/cardActions.js"),                      fn: "applyPacedRoll", record: true },
  // Issue #354 P2-01 — a "Not rolled" notice's "Narrate it — no move", claimed once on the notice
  "notRolled.narrate":         { load: () => import("../moves/cardActions.js"),                      fn: "applyNotRolledNarrate", record: true },
  // Overhaul 4 (D2) — a "Not rolled" notice's GM "Roll anyway" on a soft refusal, claimed once
  "notRolled.rollAnyway":      { load: () => import("../moves/cardActions.js"),                      fn: "applyNotRolledRollAnyway", record: true },
  "whichFight.pick":           { load: () => import("../moves/cardActions.js"),                      fn: "applyWhichFightPick", record: true },
  "expedition.recommit":       { load: () => import("../moves/cardActions.js"),                      fn: "applyRecommitOffer", record: true },
  // Issue #330 D1 — a Fulfill Your Vow's / Forge a Bond's miss "🔁 Recommit", claimed once on the card
  "vow.recommit":              { load: () => import("../moves/cardActions.js"),                      fn: "applyVowRecommitOffer", record: true },
  "bond.recommit":             { load: () => import("../moves/cardActions.js"),                      fn: "applyBondRecommitOffer", record: true },
  // The Chronicle: the panel's edits and automatic entries (the GM is its one writer)
  "chronicle.edit":            { load: () => import("../character/chronicle.js"),                    fn: "applyChronicleEditFromRelay" },
  // The Progress Tracks and Entities panels: every edit, from any user (issue #321 U05)
  "progressTrack.edit":        { load: () => import("../ui/progressTracks.js"),                      fn: "applyProgressTrackEditFromRelay" },
  "entity.edit":               { load: () => import("../ui/entityPanel.js"),                         fn: "applyEntityEditFromRelay" },
  // Issue #321 U10 — the Private Channel: a default Player cannot create a JournalEntry, so the GM
  // creates the player's transcript journal, with the player as its OWNER
  "privateChannel.createJournal": { load: () => import("../private-channel/transcript.js"),         fn: "applyPrivateJournalCreate" },
  // Issue #362 D13 — a published reflection, checked against every player's Private Lines
  // (one short call when another player has some) and posted by the GM, who holds them
  "privateChannel.publish":    { load: () => import("../private-channel/publish.js"),                fn: "applyPrivateChannelPublish", claude: true },
  // Issue #340 — Batch Mode: a round's entry, from its own player's Round window (the
  // requester is the entry), and the GM controls. Each is a write to the round; its
  // reading and the round's resolution run outside this queue (src/batch/driver.js),
  // so no handler here waits on a Claude call. Burn / Improve from the window use
  // the card's own move.burnMomentum / move.improveResult.
  "batch.submit":              { load: () => import("../batch/relay.js"),                           fn: "applyBatchSubmit" },
  "batch.withdraw":            { load: () => import("../batch/relay.js"),                           fn: "applyBatchWithdraw" },
  "batch.pass":                { load: () => import("../batch/relay.js"),                           fn: "applyBatchPass" },
  "batch.confirm":             { load: () => import("../batch/relay.js"),                           fn: "applyBatchConfirm" },
  "batch.reread":              { load: () => import("../batch/relay.js"),                           fn: "applyBatchReread" },
  "batch.keep":                { load: () => import("../batch/relay.js"),                           fn: "applyBatchKeep" },
  "batch.sendNow":             { load: () => import("../batch/relay.js"),                           fn: "applyBatchSendNow" },
  "batch.discard":             { load: () => import("../batch/relay.js"),                           fn: "applyBatchDiscard" },
  // The toolbar switch's "Discard the round", decided on the canonical GM's round chain.
  "batch.discardThenOff":      { load: () => import("../batch/relay.js"),                           fn: "applyBatchDiscardThenOff" },
});

/**
 * True when at least one GM is connected whose page can act for the table —
 * not one that stood down after its connection dropped, until it reloads
 * (gmGate.js gmPageCanAct; issue #347 AB19-STALE-CACHE-WRITES). A relay to a
 * stood-down page is dropped there: an X-Card relayed to a sole GM's stale
 * page said "Scene paused" and was never recorded.
 * @returns {boolean}
 */
export function hasActiveGM() {
  try {
    return Array.from(globalThis.game?.users ?? []).some(u => u?.isGM && u?.active && gmPageCanAct(u.id));
  } catch (err) {
    console.warn(`${MODULE_ID} | gmRelay: active-GM lookup failed:`, err?.message ?? err);
    return false;
  }
}

/**
 * True when every connected GM's page has stood down after its connection
 * dropped (none can act until one reloads) — and at least one is connected.
 * @returns {boolean}
 */
export function onlyStoodDownGMs() {
  try {
    const active = Array.from(globalThis.game?.users ?? []).filter(u => u?.isGM && u?.active);
    return active.length > 0 && !active.some(u => gmPageCanAct(u.id));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GM-side action queue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kinds that run immediately instead of waiting in the queue — the two safety
 * writes: the X-Card must take effect the moment it is played, and a player's
 * Private Lines the moment they are set (issue #345 D5; see "Serialisation" in
 * the header).
 */
const UNQUEUED_ACTIONS = new Set(["xcard.activate", "safety.syncPrivateLines"]);

// The last action enqueued, or null when the queue is idle. Each entry knows
// when its action started running and when it settled; both only ever resolve
// (never reject), so a failed action cannot poison the chain.
let _queueTail = null;

const WAIT_TIMED_OUT = Symbol("gmRelay.waitTimedOut");

/** How long an action of `kind` may run before the action behind it stops waiting. */
function actionBudgetMs(kind) {
  return GM_ACTIONS[kind]?.claude ? GM_CLAUDE_ACTION_TIMEOUT_MS : GM_ACTION_TIMEOUT_MS;
}

/**
 * Run `task` after every previously enqueued action has released the queue.
 * The caller gets the task's own result (or rejection). The queue is released
 * in a `finally` when the task settles; an action whose predecessor has run
 * longer than its budget (a handler that never settles) is warned about and
 * run anyway, so a hung handler cannot wedge every later relay.
 *
 * @template T
 * @param {string} kind
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function enqueueGmAction(kind, task) {
  const prev = _queueTail;
  let markStarted, release;
  const entry = {
    kind,
    budgetMs: actionBudgetMs(kind),
    started:  new Promise(resolve => { markStarted = resolve; }),
    done:     new Promise(resolve => { release = resolve; }),
  };
  _queueTail = entry;

  return (async () => {
    try {
      if (prev) await waitForPrevious(prev, kind);
      markStarted();
      return await task();
    } finally {
      markStarted();   // no-op once started; releases successors if the wait threw
      release();
      if (_queueTail === entry) _queueTail = null;
    }
  })();
}

/**
 * Wait for the previous action to settle — at most its run budget, counted
 * from when it started running (its own wait for the action ahead of it
 * doesn't count against it); then warn and go.
 */
async function waitForPrevious(prev, kind) {
  await prev.started;
  let timer = null;
  const timedOut = new Promise(resolve => { timer = setTimeout(() => resolve(WAIT_TIMED_OUT), prev.budgetMs); });
  try {
    const outcome = await Promise.race([prev.done, timedOut]);
    if (outcome === WAIT_TIMED_OUT) {
      console.warn(
        `${MODULE_ID} | gmRelay: the action ahead of "${kind}" ("${prev.kind}") is still running after ${prev.budgetMs}ms — ` +
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
    // The words of the button pressed, read off its card before the handler
    // can write the card over (pressedLabel).
    const pressed = entry.record === true ? pressedLabel(kind, payload ?? {}) : null;
    const result = await handler(payload ?? {}, ctx);
    const refused = _refusedPresses.get(ctx);
    if (refused) await tellRefusedPress(ctx, refused);
    else if (entry.record === true) recordChoice(kind, payload ?? {}, ctx, result, pressed);
    return result;
  };
  return UNQUEUED_ACTIONS.has(kind) ? task() : enqueueGmAction(kind, task);
}

// ─────────────────────────────────────────────────────────────────────────────
// A choice made on a card is a choice on the session record (issue #382)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The presses whose button carries no data of its pick — it is named by its
 * own action alone: the payload key that holds the pick and, for each of its
 * values, the action of its button (moves/combatThreshold.js
 * buildCombatThresholdHtml, which index.js registerCombatThresholdHook sends
 * as "fray" / "wayOut"; moves/sojournNeed.js's two, sent as "vow" / "done").
 */
const ACTION_OF_PICK = Object.freeze({
  'combat.threshold': Object.freeze({ key: 'choice', actions: Object.freeze({ fray: 'sf-enter-fray', wayOut: 'sf-way-out' }) }),
  'sojourn.need':     Object.freeze({ key: 'way', actions: Object.freeze({ vow: 'sf-sojourn-need-swear', done: 'sf-sojourn-need-done' }) }),
});

/** A payload key that never names the button pressed: the card's id, and the presser's own PC (client-asserted). */
const NOT_A_PICK = new Set(['action', 'messageId', 'actorId']);

/** The most of a button's words a choice keeps. */
const PICKED_MAX = 160;

const HTML_ENTITIES = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', times: '×',
});

function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e) => {
    const k = e.toLowerCase();
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith('#')) return String.fromCodePoint(Number(k.slice(1)));
    return HTML_ENTITIES[k] ?? whole;
  });
}

/**
 * A card's buttons as its HTML has them: each one's `data-*`, camel-cased as
 * `HTMLElement.dataset` reads them, and the words it shows — with the marks
 * around them left out (an icon before them, "✓ ", " (unavailable)").
 */
function cardButtons(content) {
  const out = [];
  for (const [, attrs, inner] of String(content ?? '').matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const data = {};
    for (const [, name, value] of attrs.matchAll(/\bdata-([a-z0-9-]+)="([^"]*)"/gi)) {
      data[name.toLowerCase().replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())] = decodeEntities(value);
    }
    const words = decodeEntities(inner.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
      .replace(/^[^\p{L}\p{N}“"‘'(]+/u, '')
      .replace(/\s*\(unavailable\)$/i, '')
      .trim();
    out.push({ data, words });
  }
  return out;
}

/**
 * The words of the button a card press names, as its card showed them when it
 * was pressed — read before its handler runs, which may write the card over
 * ("◈ Consequence resolved"). The button is the one its action names
 * (ACTION_OF_PICK), else the card's one button whose data the press carries:
 * each `data-*` of it the payload names, equal. Null when no one button is it
 * — the card gone, a press no button names, a press of a card's only button
 * with no pick to it. Never throws.
 *
 * @param {string} kind
 * @param {Object} payload
 * @returns {string|null}
 */
function pressedLabel(kind, payload) {
  try {
    const messageId = typeof payload?.messageId === 'string' && payload.messageId ? payload.messageId : null;
    const content = messageId ? globalThis.game?.messages?.get?.(messageId)?.content : null;
    if (typeof content !== 'string' || !content) return null;
    const buttons = cardButtons(content);
    const byAction = ACTION_OF_PICK[kind];
    const action = byAction ? byAction.actions[payload[byAction.key]] : null;
    const named = action
      ? buttons.filter(b => b.data.action === action)
      : buttons.filter((b) => {
        const keys = Object.keys(b.data).filter(k => !NOT_A_PICK.has(k) && payload[k] !== undefined && payload[k] !== null && payload[k] !== '');
        return keys.length > 0 && keys.every(k => String(payload[k]) === b.data[k]);
      });
    const words = [...new Set(named.map(b => b.words).filter(Boolean))];
    return words.length === 1 ? words[0].slice(0, PICKED_MAX) : null;
  } catch {
    return null;
  }
}

/**
 * Put a card press its handler took on the session record as a `choice` —
 * the rows of GM_ACTIONS marked `record` (tests/unit/sessionRecordEvents.test.js
 * names every other row and why it records none). The pick is the words of
 * the button pressed (pressedLabel), or none: it was the press's own option
 * id, and the views printed it — "chose “enum”", "chose “any”", "chose
 * “fray”" (known-issues RECORD-VIEW-SMALLER, the fourth live run). A refusal —
 * the handler said nothing was applied — records nothing. The card's
 * resolution, when it has one, ties the choice to its move's beat.
 * Fire-and-forget; never throws.
 */
function recordChoice(kind, payload, ctx, result, picked = null) {
  if (result === false || result?.applied === false || result?.posted === false || result?.ok === false) return;
  const messageId = typeof payload.messageId === 'string' && payload.messageId ? payload.messageId : null;
  let res = null;
  try { res = (messageId && globalThis.game?.messages?.get?.(messageId)?.flags?.[MODULE_ID]?.resolutionId) || null; } catch { res = null; }
  const typed = [payload.objective, payload.text].find(t => typeof t === 'string' && t.trim());
  import('../record/record.js')
    .then(({ recordEvent }) => recordEvent('choice', {
      who: { user: ctx?.requesterId ?? null, actor: typeof payload.actorId === 'string' ? payload.actorId : null },
      ref: { card: messageId, res },
      d: { action: kind, picked: typeof picked === 'string' && picked ? picked : null },
      ...(typed ? { text: typed } : {}),
    }))
    .catch(err => console.warn(`${MODULE_ID} | gmRelay: "${kind}" was not put on the session record:`, err?.message ?? err));
}

// ─────────────────────────────────────────────────────────────────────────────
// A refused card press is told to the presser
// ─────────────────────────────────────────────────────────────────────────────

// The ctx runGmAction built → the card press its handler refused for whose
// the card is (refusePress). Keyed by the dispatch's own ctx, so a handler's
// word reaches its own dispatch only and no handler's result changes shape.
const _refusedPresses = new WeakMap();

/**
 * A handler refused its requester's card press for whose the card is
 * (known-issues RELAY-REFUSED-PRESS-UNTOLD): "not-owner" — the press acts for
 * a character the requester does not own (a card that names none of theirs
 * is a GM's to press); "no-actor" / "not-a-pc" — the character it is for is
 * no longer one of the table's player characters. The relay has no ack, so
 * the press was logged on the GM's console only and its button re-armed
 * 15 s later with nothing said. runGmAction tells the requester
 * — and the GMs, as the module's refusal notices do — once, when the handler
 * returns; a helper's record and its caller's are the one refusal (the last
 * stands). "cannot" — the move the button makes cannot be made now: the move
 * gate's refusal (overhaul 4, contracts/pressGate.js gatePress), told in its
 * one line (`note`) and carried on the notice as `cannotMake`.
 *
 * @param {Object} ctx — the handler's relay context
 * @param {"not-owner"|"no-actor"|"not-a-pc"|"cannot"} reason
 * @param {{ name?: string }|null} [actor] — the character the press was for
 * @param {{ note?: string|null, refusal?: Object|null }} [why] — "cannot"'s:
 *   gate.js refusalOf's refusal and obligations.js refusalNote's line
 */
export function refusePress(ctx, reason, actor = null, { note = null, refusal = null } = {}) {
  if (!ctx || typeof ctx !== "object") return;
  const name = typeof actor?.name === "string" && actor.name.trim() ? actor.name.trim() : null;
  _refusedPresses.set(ctx, { reason, name, note, refusal });
}

/** Whisper the requester and the GMs why their press changed nothing (refusePress). Never throws. */
async function tellRefusedPress(ctx, { reason, name, note = null, refusal = null }) {
  const presser = typeof ctx?.requester?.name === "string" && ctx.requester.name ? ctx.requester.name : null;
  // "cannot": the move gate refused the move the button makes (overhaul 4 —
  // contracts/pressGate.js), told in the line every refusal carries.
  const [title, why] = reason === "cannot"
    ? ["Not made", escapeHtml(note ?? "That move cannot be made now.")]
    : reason !== "not-owner"
    ? ["Character gone", "The character that button was for is no longer one of the table&rsquo;s player characters."]
    : name
      ? ["Not your button", `That button is ${escapeHtml(name)}&rsquo;s: only ${escapeHtml(name)}&rsquo;s player or a GM can press it.`]
      : ["Not your button", "That button names no character of yours, so only a GM can press it."];
  const outcome = presser ? `${escapeHtml(presser)}&rsquo;s press changed nothing.` : "The press changed nothing.";
  const gmIds = Array.from(globalThis.game?.users ?? []).filter(u => u?.isGM).map(u => u.id);
  try {
    await globalThis.ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>${title}</strong><p>${why} ${outcome}</p></div>`,
      whisper: [...new Set([ctx?.requesterId, ...gmIds].filter(Boolean))],
      flags:   { [MODULE_ID]: { pressRefusedNotice: true,
        ...(reason === "cannot" && refusal?.moveId ? { cannotMake: { moveId: refusal.moveId, code: refusal.code ?? null, why: refusal.why ?? "", hard: refusal.hard === true } } : {}) } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | gmRelay: telling ${ctx?.requesterId ?? "?"} their press was refused failed:`, err?.message ?? err);
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    // Connected, but every GM's page stood down after its connection dropped
    // (issue #347 AB19-STALE-CACHE-WRITES): the same refusal, saying why.
    const reloadFirst = onlyStoodDownGMs();
    console.warn(`${MODULE_ID} | gmRelay: "${kind}" not applied — ${reloadFirst ? "the GM's browser must be reloaded first (its connection dropped)" : "no GM is connected"}.`);
    globalThis.ui?.notifications?.warn?.(reloadFirst
      ? "Starforged Companion: the GM's browser lost its connection to the server and must be reloaded, so this change could not be saved. Try again once it has."
      : "Starforged Companion: no GM is connected, so this change could not be saved. Try again once a GM has joined.");
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
    // onGmRelayReady listeners handle it — nor is a GM's page-ready
    // announcement (registerGmReadiness).
    if (rawKind === GM_RELAY_READY_KIND || rawKind === GM_PAGE_READY_KIND || rawKind === GM_PAGE_STALE_KIND) return;
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
// GM page readiness (issue #347 AB03)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Track the other GMs' page loads for the canonical-GM election, and announce
 * this GM's own. A GM is `active` from its socket's connect, at the start of
 * its page load; its handlers exist only from its `ready`. Every client: a
 * GM's connect marks it loading, its announcement marks it ready, its
 * departure is forgotten (gmGate.js noteGmLoading / noteGmReady /
 * forgetGmLoad), and its page standing down — its connection dropped — marks
 * it loading again until its reload announces ready (noteGmStoodDown). A GM
 * client announces its own page ready to the table — call this early in
 * `ready`, before any canonical-gated work — and, should its connection drop,
 * that it stood down. Idempotent.
 */
export function registerGmReadiness() {
  if (registerGmReadiness._installed) return;
  registerGmReadiness._installed = true;
  const socket = globalThis.game?.socket ?? null;
  // A stale page — its connection dropped — is not ready: it announces
  // nothing until it reloads (issue #347 AB19-STALE-CACHE-WRITES).
  const announce = () => {
    if (globalThis.game?.user?.isGM && socket?.emit && !pageIsStale()) {
      socket.emit(GM_RELAY_SOCKET, { kind: GM_PAGE_READY_KIND, userId: globalThis.game.user.id });
    }
  };
  onPageStale(() => {
    if (globalThis.game?.user?.isGM && socket?.emit) {
      socket.emit(GM_RELAY_SOCKET, { kind: GM_PAGE_STALE_KIND, userId: globalThis.game.user.id });
    }
  });
  globalThis.Hooks?.on?.("userConnected", (user, connected) => {
    if (!user?.isGM || user.id === globalThis.game?.user?.id) return;
    if (!connected) { forgetGmLoad(user.id); return; }
    noteGmLoading(user.id);
  });
  if (socket?.on) {
    socket.on(GM_RELAY_SOCKET, (message) => {
      const userId = typeof message?.userId === "string" ? message.userId : null;
      if (message?.kind === GM_PAGE_STALE_KIND) {
        if (userId) noteGmStoodDown(userId);
        return;
      }
      if (message?.kind !== GM_PAGE_READY_KIND) return;
      const user = userId ? globalThis.game?.users?.get?.(userId) : null;
      if (user?.isGM) noteGmReady(userId);
    });
  } else {
    console.warn(`${MODULE_ID} | gmRelay: game.socket unavailable — GM page readiness not tracked.`);
  }
  announce();
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
  registerGmReadiness._installed = false;
  _resetGmLoadForTests();
  onGmRelayReady._installed = false;
  _readyCallbacks.clear();
  _queueTail = null;
}
