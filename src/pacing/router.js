/**
 * STARFORGED COMPANION
 * src/pacing/router.js — Routes paced input by classifier decision
 *
 * Pipeline integration: src/index.js calls `routePacedInput(message,
 * campaignState)` for undecorated player narration (everything that today
 * goes into `isPlayerNarration()` after all `!`/`@scene` intercepts).
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
 */

import { classifyInput, PACING_DECISION, PACING_CATEGORIES } from "./classifier.js";
import { narratePacedInput } from "../narration/narrator.js";
import { logPacingDecision } from "./telemetry.js";

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
 * Decide how to handle a paced player input and dispatch accordingly.
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
 * @param {string} [args.mischiefDial]  — "lawful" | "balanced" | "chaotic".
 *   Passed through to the classifier so its interpretation posture matches
 *   the mischief dial. Defaults to "balanced" when omitted.
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
  playerText, campaignState, character, apiKey, mischiefDial,
}) {
  const pacingConfig = readPacingConfig(campaignState);

  // Master switch — when disabled, behave exactly like the existing pipeline.
  if (!pacingConfig.enabled) {
    return { runMove: true, decision: PACING_DECISION.MOVE, suggestedMove: null, category: "exploration", confidence: 1, reasoning: "pacing disabled" };
  }

  // Recovery override — `!roll` sets forceNextAsMove on campaignState.
  if (pacingConfig.forceMove) {
    await clearForceMove(campaignState);
    return { runMove: true, decision: PACING_DECISION.MOVE, suggestedMove: null, category: "exploration", confidence: 1, reasoning: "!roll override" };
  }

  const sceneTag = campaignState?.currentSessionId ?? "global";

  const recentMoveDensity = getRecentMoveDensity(pacingConfig.densityWindow);

  const result = await classifyInput({
    playerText, campaignState, character, recentMoveDensity, pacingConfig, apiKey,
    mischiefDial,
  });

  // Record the decision for both the in-memory density window and the
  // persistent telemetry journal.
  recordRecentDecision({
    decision: result.decision,
    sceneTag,
    window:   pacingConfig.densityWindow,
  });

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
    };
  }

  // NARRATIVE / NARRATIVE_WITH_MOVE_AVAILABLE — run the narrator and stop.
  const suggestedMove = result.decision === PACING_DECISION.NARRATIVE_WITH_MOVE_AVAILABLE
    ? result.suggestedMove
    : null;

  await narratePacedInput(playerText, campaignState, { suggestedMove, mischiefDial })
    .catch(err => console.error(`${MODULE_ID} | narratePacedInput failed:`, err));

  return {
    runMove: false,
    decision: result.decision,
    suggestedMove,
    category: result.category,
    confidence: result.confidence,
    reasoning: result.reasoning,
  };
}

async function clearForceMove(campaignState) {
  if (!campaignState?.pacing) return;
  if (!campaignState.pacing.forceNextAsMove) return;
  if (!globalThis.game?.user?.isGM) {
    // Best-effort: only the GM can write world-scoped settings. Player
    // clients leave the flag for the GM's next read — the GM client will
    // clear it on the next pipeline pass.
    return;
  }
  try {
    campaignState.pacing.forceNextAsMove = false;
    await globalThis.game?.settings?.set?.(MODULE_ID, "campaignState", campaignState);
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
  campaignState.pacing ??= {};
  const sub = String(subcommand ?? "").toLowerCase().trim();

  if (sub === "status") {
    return { status: formatPaceStatus(campaignState), persisted: false };
  }

  if (sub === "clear") {
    campaignState.pacing.sceneOverride = null;
    await persist(campaignState);
    return { status: "Pacing scene override cleared.", persisted: true };
  }

  if (sub in SCENE_OVERRIDES) {
    campaignState.pacing.sceneOverride = { ...SCENE_OVERRIDES[sub] };
    await persist(campaignState);
    return {
      status: `Pacing override set to **${sub}** (${SCENE_OVERRIDES[sub].modifier >= 0 ? "+" : ""}${SCENE_OVERRIDES[sub].modifier}).`,
      persisted: true,
    };
  }

  return { status: `Unknown subcommand: ${subcommand}. Use hot, quiet, clear, or status.`, persisted: false };
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

async function persist(campaignState) {
  if (!globalThis.game?.user?.isGM) return;
  try {
    await globalThis.game?.settings?.set?.(MODULE_ID, "campaignState", campaignState);
  } catch (err) {
    console.warn(`${MODULE_ID} | pacing: persist failed:`, err);
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
 * GM-only at the call site (writes world-scoped state).
 *
 * @param {Object} campaignState
 * @returns {Promise<void>}
 */
export async function markForceNextAsMove(campaignState) {
  campaignState.pacing ??= {};
  campaignState.pacing.forceNextAsMove = true;
  await persist(campaignState);
}
