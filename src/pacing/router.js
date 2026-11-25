/**
 * STARFORGED COMPANION
 * src/pacing/router.js — Routes paced input by classifier decision
 *
 * Pipeline integration: src/index.js calls `routePacedInput(message,
 * campaignState)` for undecorated player narration (everything that today
 * goes into `isPlayerNarration()` after all `!`/`@scene` intercepts).
 * `routePacedInput` is `decidePacing` (the decision) followed by the
 * narration a NARRATIVE decision gets; a Batch Mode round's reading calls
 * `decidePacing` alone and shows the decision in the player's Round window
 * (issue #340 — src/moves/movePipeline.js readAction).
 *
 * Three outcomes:
 *   - MOVE                          → run the move interpreter pipeline (unchanged)
 *   - NARRATIVE                     → narrator-only response, no roll
 *   - NARRATIVE_WITH_MOVE_AVAILABLE → narrator response with inline move hint
 *
 * The classifier sees recent move density per scene. We track decisions in
 * an in-memory ring buffer keyed by scene/session — recent decisions reset
 * on `@scene` (handled via resetRecentDensity from outside) or session end.
 *
 * Concurrency: the classifier itself runs freely. The MOVE branch defers to
 * the existing pendingMove lock in src/index.js — that lock is only claimed
 * when a move actually runs. NARRATIVE branches make no campaignState writes
 * that would race.
 *
 * Telemetry: every classifier decision is recorded via the telemetry helper
 * (src/pacing/telemetry.js) so dials can be tuned from real session data.
 *
 * A typed line is read once, by the line reader (moves/reader.js readLine),
 * told the whole situation, and its reading is routed by code
 * (pacing/readAndRoute.js routeReading — the table's dials, the density
 * window, a fight never hedging, the player's ask), with the move contracts'
 * gate (moves/contracts/gate.js checkMove) as its row 2: a move that cannot
 * be made is narrated, told why, with the move the refusal offers on its card
 * (issue #384, slice 2 — decisions.md → "Overhauls 1 and 4").
 */

import { PACING_DECISION, PACING_CATEGORIES } from "./dials.js";
import { readAndRoute } from "./readAndRoute.js";
import { readMoveSituation } from "../moves/situation.js";
import { refusalOf } from "../moves/contracts/gate.js";
import { narratePacedInput, tellPacedLineNotNarrated } from "../narration/narrator.js";
import { claudeFailureReason } from "../narration/failureReason.js";
import { logPacingDecision } from "./telemetry.js";
import { serialiseCampaignStateWrite } from "../multiplayer/campaignStateChain.js";

const MODULE_ID = "starforged-companion";


// ─────────────────────────────────────────────────────────────────────────────
// RECENT MOVE DENSITY — in-memory ring buffer
// ─────────────────────────────────────────────────────────────────────────────

const _recent = [];
let _lastSceneTag = null;

/**
 * Record a classifier decision in the recent-density buffer. Capped at
 * `window`; the oldest entry is dropped when full. Scene tag changes reset
 * the buffer.
 *
 * Exposed so external callers (the test suite, the @scene intercept) can
 * push decisions directly without re-running the classifier.
 *
 * @param {{decision:string, sceneTag?:string, window?:number}} entry
 */
export function recordRecentDecision({ decision, sceneTag = null, window = 5 }) {
  const tag = sceneTag ?? "global";
  if (_lastSceneTag !== tag) {
    _recent.length = 0;
    _lastSceneTag = tag;
  }
  _recent.push({ decision, timestamp: Date.now(), sceneTag: tag });
  while (_recent.length > window) _recent.shift();
}

/**
 * Rewrite the newest decision in the density buffer — a line the classifier
 * called a MOVE that was narrated after all (the interpreter read no move in
 * it, or its author turned the reading down: issue #354 P2-01), so it does not
 * count toward "recent moves". A no-op on an empty buffer.
 *
 * @param {string} decision — a PACING_DECISION value
 */
export function reviseLastDecision(decision) {
  const last = _recent[_recent.length - 1];
  if (last) last.decision = decision;
}

/**
 * Reset the density buffer. Called from @scene intercept and on session
 * change so a new scene starts with a clean rolling window.
 */
export function resetRecentDensity() {
  _recent.length = 0;
  _lastSceneTag = null;
}

/**
 * Snapshot of current density for the classifier. Counts how many of the
 * last `window` decisions resolved as MOVE.
 *
 * @param {number} window
 * @returns {{count:number, window:number}}
 */
export function getRecentMoveDensity(window = 5) {
  const slice = _recent.slice(-window);
  const count = slice.filter(e => e.decision === PACING_DECISION.MOVE).length;
  return { count, window };
}


// ─────────────────────────────────────────────────────────────────────────────
// PACING CONFIG — reads from game.settings, no UI dep
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the live pacing config. Settings are registered in
 * src/ui/settingsPanel.js. The scene override and recent-decision state live
 * on campaignState.pacing.
 *
 * @param {Object} campaignState
 * @returns {{
 *   enabled: boolean,
 *   dials: Object,
 *   sceneOverride: {modifier:number,label:string}|null,
 *   densityWindow: number,
 *   forceMove: boolean,
 * }}
 */
export function readPacingConfig(campaignState) {
  const cfg = {
    enabled:       safeGet("pacing.enabled",       true),
    densityWindow: safeGet("pacing.densityWindow", 5),
    dials:         {},
    sceneOverride: campaignState?.pacing?.sceneOverride ?? null,
    forceMove:     !!campaignState?.pacing?.forceNextAsMove,
  };
  for (const cat of PACING_CATEGORIES) {
    cfg.dials[cat] = safeGet(`pacing.dial.${cat}`, defaultDial(cat));
  }
  return cfg;
}

function safeGet(key, fallback) {
  try {
    const v = globalThis.game?.settings?.get?.(MODULE_ID, key);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function defaultDial(category) {
  // Suggestion-loop remediation §B3 — exploration 5→6, social 3→5; combat,
  // investigation, and downtime unchanged. Worlds with existing per-dial
  // values keep them; new worlds and unset categories pick up the new
  // priors.
  return ({ combat: 9, investigation: 6, exploration: 6, social: 5, downtime: 1 })[category] ?? 5;
}



// ─────────────────────────────────────────────────────────────────────────────
// MAIN ROUTER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide how a paced player input should be handled, without acting on it:
 * the pacing master switch, a `!roll` force, then the line read once and
 * routed (readAndRoute — the line reader's reading; routeReading's rows, the
 * move gate's among them: a move that cannot be made is narrated, `refused`),
 * the recent-density window and the telemetry. routePacedInput dispatches the narration for a NARRATIVE
 * decision; a Batch Mode round's reading (src/moves/movePipeline.js
 * readAction) shows the decision in the player's Round window instead — so
 * it passes `ignoreForceMove`: a round's readings ignore `!roll` (the window
 * has "Roll a move instead"), while `!pace` overrides still apply.
 *
 * @param {Object} args
 * @param {string} args.playerText
 * @param {Object} args.campaignState
 * @param {{ name?: string|null, actorId?: string|null }|null} args.character — the
 *   speaker (their Actor id reads their own connections — issue #354 P2-04)
 * @param {string} args.apiKey
 * @param {boolean} [args.ignoreForceMove] — a round's reading: `pacing.forceNextAsMove` is not read
 * @param {Array<{ name: string, text: string }>|null} [args.round] — a Batch Mode round's reading: the round's
 *   other submitted actions (told to the reader), and no density window (D12)
 * @param {string|null} [args.mischiefLevel] — the Mischief dial; read from the settings when not given
 * @returns {Promise<{
 *   runMove: boolean,
 *   decision: string,
 *   suggestedMove: string|null,
 *   suggestedTargetId?: string|null,
 *   category: string,
 *   confidence: number,
 *   reasoning: string,
 *   forced?: boolean,
 *   pacingDisabled?: boolean,
 *   reading?: Object|null,
 *   fallback?: boolean,
 *   refused?: { moveId: string, code: string, hard: boolean, why: string, premise: Object|null, offer: string|null },
 * }>} `reading`: the line reader's (carried to readMove on a MOVE); `fallback`: the reading failed, and readMove
 *   reads the line again; `refused`: the move the line was read as cannot be made (the gate's refusal)
 */
export async function decidePacing({
  playerText, campaignState, character, apiKey, ignoreForceMove = false, round = null, mischiefLevel = null,
}) {
  const pacingConfig = readPacingConfig(campaignState);

  // Master switch — when disabled, behave exactly like the existing pipeline.
  if (!pacingConfig.enabled) {
    return { runMove: true, decision: PACING_DECISION.MOVE, suggestedMove: null, category: "exploration", confidence: 1, reasoning: "pacing disabled", pacingDisabled: true };
  }

  // Recovery override — `!roll` sets forceNextAsMove on campaignState. Not
  // spent here: the line can still be refused after routing (the move lock,
  // a player with no character), and a refused line spent the `!roll` — the
  // retyped line went back through the classifier (issue #331 X37). The
  // pipeline spends it once the line holds the move lock (consumeForceMove).
  if (pacingConfig.forceMove && !ignoreForceMove) {
    return { runMove: true, decision: PACING_DECISION.MOVE, suggestedMove: null, category: "exploration", confidence: 1, reasoning: "!roll override", forced: true };
  }

  const sceneTag = campaignState?.currentSessionId ?? "global";
  // A round is its own pacing (D12): a round's reading is told no density,
  // and adds none to the window.
  const recentMoveDensity = round ? null : getRecentMoveDensity(pacingConfig.densityWindow);
  const level = mischiefLevel ?? await readMischiefDial();

  // The move contracts' gate (overhaul 4, moves/contracts/gate.js), on the
  // speaker's situation read once: routeReading's row 2. A move the sheet,
  // the tracks or the table say cannot be made is neither rolled nor offered
  // — a Heal at 5 health of 5 (HEAL-ROLLED-AT-FULL-HEALTH), a social move
  // against a fellow player character (finding G; issue #354 P2-06), a Strike
  // with no fight under way (D6) — and the line is narrated and told why: its
  // narration is given the premise as NOT SO and its card one line
  // (NOTHING-TO-RECOVER-UNTOLD); a move the refusal offers instead is the
  // card's Roll. readMove and the roll check again. A `!roll` never comes here.
  const moveSituation = await readSituationForGate(character, campaignState);

  // One call reads the line, told the whole situation; code routes the
  // reading by the table's dials (issue #384, D1 — pacing/readAndRoute.js).
  const result = await readAndRoute({
    playerText, campaignState, character, apiKey, pacingConfig, recentMoveDensity, mischiefLevel: level, round, moveSituation,
  });

  let refused = null;
  if (result.unmade?.verdict) {
    refused = refusalOf(result.unmade.verdict);
    if (refused?.offer) {
      result.decision      = PACING_DECISION.NARRATIVE_WITH_MOVE_AVAILABLE;
      result.suggestedMove = refused.offer;
      result.suggestedTargetId = null;
    }
  }

  // Record the decision for both the in-memory density window and the
  // persistent telemetry journal.
  if (!round) {
    recordRecentDecision({
      decision: result.decision,
      sceneTag,
      window:   pacingConfig.densityWindow,
    });
  }

  logPacingDecision({
    playerText,
    decision:      result.decision,
    suggestedMove: result.suggestedMove,
    category:      result.category,
    confidence:    result.confidence,
    reasoning:     result.reasoning,
    fallback:      !!result.fallback,
    sessionId:     campaignState?.currentSessionId ?? null,
    sessionNumber: campaignState?.sessionNumber ?? null,
  }).catch(err => console.warn(`${MODULE_ID} | pacing telemetry write failed:`, err));

  if (result.decision === PACING_DECISION.MOVE) {
    return {
      runMove: true,
      decision: result.decision,
      suggestedMove: null,
      category: result.category,
      confidence: result.confidence,
      reasoning: result.reasoning,
      // The reading, carried to readMove: a line routed to a roll is not
      // read again (the gate is asked once more under the lock). A failed
      // reading (`fallback`) is read again there — the second try (D13).
      reading: result.reading ?? null,
      // How the reading was routed (routeReading's row and why), for the telemetry and the readers' test.
      route: result.route ?? null, moveId: result.moveId ?? null,
      ...(result.fallback ? { fallback: true } : {}),
    };
  }

  // NARRATIVE / NARRATIVE_WITH_MOVE_AVAILABLE — narration, no roll.
  const suggestedMove = result.decision === PACING_DECISION.NARRATIVE_WITH_MOVE_AVAILABLE
    ? result.suggestedMove
    : null;

  return {
    runMove: false,
    decision: result.decision,
    suggestedMove,
    // The challenge an offered scene-challenge move is part of, by id
    // (PACED-VARIANT-NO-TARGET): readAndRoute's, from the reading.
    suggestedTargetId: suggestedMove ? (result.suggestedTargetId ?? null) : null,
    category: result.category,
    confidence: result.confidence,
    reasoning: result.reasoning,
    reading: result.reading ?? null,
    route: result.route ?? null, moveId: result.moveId ?? null,
    unmade: result.unmade ? { moveId: result.unmade.moveId, why: result.unmade.why } : null,
    // The move the line was read as, refused by the gate — told in the
    // narration and on its card (narrator.js narratePacedInput `refusal`).
    ...(refused ? { refused } : {}),
  };
}

/**
 * The speaker's situation for the move gate (moves/situation.js
 * readMoveSituation), read live; null when it cannot be read — then nothing
 * is refused (an unknown is never a refusal).
 *
 * @param {{ actorId?: string|null }|null} character
 * @param {Object|null} campaignState
 * @returns {Promise<Object|null>}
 */
async function readSituationForGate(character, campaignState) {
  try {
    return await readMoveSituation(character?.actorId ?? null, { campaignState });
  } catch (err) {
    console.warn(`${MODULE_ID} | pacing: the move gate could not be asked — nothing is decided from it:`, err?.message ?? err);
    return null;
  }
}

/** The Mischief dial, for the open reading (D16); "serious" when it cannot be read. */
async function readMischiefDial() {
  try {
    const { getMischiefDial } = await import("../ui/settingsPanel.js");
    return getMischiefDial() ?? "serious";
  } catch {
    return "serious";
  }
}

/**
 * Decide how to handle a paced player input and dispatch accordingly — the
 * free-flow path: decidePacing, then the narration for a NARRATIVE decision.
 *
 * Returns an object describing what was done so the caller can decide whether
 * to continue with the move pipeline. When `runMove === true` the caller
 * (src/index.js) runs the existing interpretMove → confirm → resolve flow.
 *
 * Recovery commands (`!roll`) bypass the classifier by setting
 * `campaignState.pacing.forceNextAsMove = true` before this is called.
 *
 * @param {Object} args
 * @param {string} args.playerText
 * @param {Object} args.campaignState
 * @param {Object|null} args.character
 * @param {string} args.apiKey
 * @returns {Promise<{
 *   runMove: boolean,
 *   decision: string,
 *   suggestedMove: string|null,
 *   category: string,
 *   confidence: number,
 *   reasoning: string,
 * }>}
 */
export async function routePacedInput({
  playerText, campaignState, character, apiKey, speakerActorId = null,
}) {
  // A throw here, before the narration starts, reached the caller's catch,
  // which only logged it (known-issues PACED-ROUTER-THROW): the line went on
  // to the move pipeline with nobody told why it was read as a move.
  let pacing;
  try {
    pacing = await decidePacing({ playerText, campaignState, character, apiKey });
  } catch (err) {
    console.error(`${MODULE_ID} | pacing router failed; the line is read as a move:`, err);
    ui.notifications?.warn?.(`Starforged Companion: the pacing check failed — ${claudeFailureReason(err)}. The line is read as a move instead.`);
    return { runMove: true, decision: PACING_DECISION.MOVE, suggestedMove: null, category: "exploration", confidence: 0, reasoning: "pacing router failed" };
  }
  if (pacing.runMove) return pacing;

  // NARRATIVE / NARRATIVE_WITH_MOVE_AVAILABLE — run the narrator and stop.
  // On a working copy: the caller's object is the canonical GM's cached
  // campaignState, and the narrator mints a scene, advances the spotlight and
  // applies its sidecar on the object it is given, each before a write the
  // world can refuse — a refusal left the scene and the facts on this GM's
  // cache alone, and its next whole-object write carried them into the world
  // (issue #342 Z02; the X09 / Y04 rule, rules/foundry-api.md).
  // A line the classifier read as narrative is never rolled for a throw
  // here: the table is told it was not narrated (PACED-ROUTER-THROW).
  // narratePacedInput itself never throws — it tells the table of its own.
  const { suggestedMove, suggestedTargetId, refused = null } = pacing;
  try {
    const working = foundry.utils.deepClone(campaignState);
    // The offer's reading rides on its card (issue #384, slice 3): its Roll reads nothing again.
    const offerReading = suggestedMove && pacing.reading?.interpretation?.moveId === suggestedMove ? pacing.reading.interpretation : null;
    await narratePacedInput(playerText, working, { suggestedMove, speakerActorId, ...(suggestedTargetId ? { suggestedTargetId } : {}), ...(refused ? { refusal: refused } : {}),
      ...(offerReading ? { offerReading } : {}) });
  } catch (err) {
    console.error(`${MODULE_ID} | the paced narration could not be started:`, err);
    await tellPacedLineNotNarrated(campaignState, err);
  }

  return {
    runMove: false,
    decision: pacing.decision,
    suggestedMove,
    category: pacing.category,
    confidence: pacing.confidence,
    reasoning: pacing.reasoning,
  };
}

/**
 * Spend a `!roll` force: clear `pacing.forceNextAsMove` on the store (a copy
 * of the latest stored campaignState with the flag off) and on `campaignState`
 * once the write lands. The move pipeline calls it once a forced line holds
 * the move lock (issue #331 X37). GM only; a refused clear leaves the flag for
 * the next line. Never throws.
 *
 * @param {Object} campaignState — the pipeline's working copy
 * @returns {Promise<void>}
 */
export async function consumeForceMove(campaignState) {
  if (!campaignState?.pacing) return;
  if (!campaignState.pacing.forceNextAsMove) return;
  if (!globalThis.game?.user?.isGM) {
    // Best-effort: only the GM can write world-scoped settings. Player
    // clients leave the flag for the GM's next read — the GM client will
    // clear it on the next pipeline pass.
    return;
  }
  // A copy (rules/foundry-api.md): a refused clear leaves the flag set
  // everywhere, for the next pass to clear (issue #326 W51). Onto the store
  // as it is now, not the working copy (rules/reachability.md §9): that holds
  // the move lock as the pipeline claimed it, and the lock's fields are the
  // lock's own paths' to write — a whole working copy carries a lock back
  // (LOCK-RESURRECTED-BY-COGM-STALE-WRITE).
  const pacing = { ...campaignState.pacing, forceNextAsMove: false };
  try {
    // At its turn on the client's campaignState write chain (CAMPSTATE-CHAIN-REST).
    await serialiseCampaignStateWrite(() => {
      const latest = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? campaignState;
      return globalThis.game?.settings?.set?.(MODULE_ID, "campaignState",
        { ...latest, pacing: { ...(latest.pacing ?? campaignState.pacing), forceNextAsMove: false } });
    }, "!roll spent");
    campaignState.pacing = pacing;
  } catch (err) {
    console.warn(`${MODULE_ID} | pacing: failed to clear forceNextAsMove:`, err);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// SCENE OVERRIDE — !pace command implementation
// ─────────────────────────────────────────────────────────────────────────────

const SCENE_OVERRIDES = {
  hot:   { modifier:  3, label: "hot"   },
  quiet: { modifier: -3, label: "quiet" },
};

/**
 * Apply a !pace command to campaignState. Returns a human-readable status
 * string for the chat card. GM-only at the caller; this function does not
 * gate by itself so tests can drive it directly.
 *
 * @param {Object} campaignState
 * @param {string} subcommand — "hot" | "quiet" | "clear" | "status"
 * @returns {Promise<{status: string, persisted: boolean}>}
 */
export async function applyPaceCommand(campaignState, subcommand) {
  const sub = String(subcommand ?? "").toLowerCase().trim();

  if (sub === "status") {
    return { status: formatPaceStatus(campaignState ?? {}), persisted: false };
  }

  let sceneOverride, done;
  if (sub === "clear") {
    sceneOverride = null;
    done = "Pacing scene override cleared.";
  } else if (sub in SCENE_OVERRIDES) {
    sceneOverride = { ...SCENE_OVERRIDES[sub] };
    done = `Pacing override set to **${sub}** (${SCENE_OVERRIDES[sub].modifier >= 0 ? "+" : ""}${SCENE_OVERRIDES[sub].modifier}).`;
  } else {
    return { status: `Unknown subcommand: ${subcommand}. Use hot, quiet, clear, or status.`, persisted: false };
  }

  // A copy is written (rules/foundry-api.md): the caller hands in the cached
  // setting, and setting the override on it before a refused write left the
  // GM's client — and the card — claiming an override the world never got
  // (issue #326 W51). The caller's object takes the change once it landed.
  const pacing = { ...(campaignState?.pacing ?? {}), sceneOverride };
  if (!await persistPacing({ sceneOverride })) {
    return {
      status: `The pacing override was not ${sub === "clear" ? "cleared" : "set"} — the world did not take the write.`,
      persisted: false,
      refused: true,
    };
  }
  if (campaignState) campaignState.pacing = pacing;
  return { status: done, persisted: true };
}

function formatPaceStatus(campaignState) {
  const cfg = readPacingConfig(campaignState);
  const lines = ["Pacing dials (effective):"];
  for (const cat of PACING_CATEGORIES) {
    const base = cfg.dials[cat];
    const mod  = cfg.sceneOverride?.modifier ?? 0;
    const eff  = Math.max(0, Math.min(10, base + mod));
    lines.push(`  ${cat.padEnd(14, " ")} ${eff}/10 (base ${base})`);
  }
  if (cfg.sceneOverride) {
    lines.push("");
    lines.push(`Scene override: ${cfg.sceneOverride.label} (${cfg.sceneOverride.modifier >= 0 ? "+" : ""}${cfg.sceneOverride.modifier})`);
  }
  return lines.join("\n");
}

/**
 * Write a change to `campaignState.pacing` on a GM client — onto a copy of the
 * stored campaignState (never the cached value) as it is at the write's turn
 * on the client's campaignState write chain. The caller's object was written
 * whole, putting back whatever landed after it was read (CAMPSTATE-CHAIN-REST).
 *
 * @param {Object} change — the pacing fields this write sets
 * @returns {Promise<boolean>} true when the world took it
 */
async function persistPacing(change) {
  if (!globalThis.game?.user?.isGM) return false;
  try {
    await serialiseCampaignStateWrite(() => {
      const latest = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {};
      return globalThis.game?.settings?.set?.(MODULE_ID, "campaignState",
        { ...latest, pacing: { ...(latest.pacing ?? {}), ...change } });
    }, "pacing");
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | pacing: persist failed:`, err);
    return false;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// `!roll` RECOVERY — force the next undecorated input through the move pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark the next undecorated input to bypass the classifier and route directly
 * to the move pipeline. Used as a false-negative recovery: when the classifier
 * said NARRATIVE but the player wanted a roll.
 *
 * GM-only at the call site (writes world-scoped state). A copy is written —
 * a refused write leaves the caller's (cached) object unchanged and returns
 * false, so the card does not claim it (issue #326 W51).
 *
 * @param {Object} campaignState
 * @returns {Promise<boolean>} true when the world took it
 */
export async function markForceNextAsMove(campaignState) {
  const pacing = { ...(campaignState?.pacing ?? {}), forceNextAsMove: true };
  if (!await persistPacing({ forceNextAsMove: true })) return false;
  if (campaignState) campaignState.pacing = pacing;
  return true;
}
