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
 */

import { classifyInput, PACING_DECISION, PACING_CATEGORIES } from "./classifier.js";
import { SCENE_CHALLENGE_VARIANTS, selectSceneChallengeTrack } from "../moves/sceneChallenge.js";
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
 * Decide how a paced player input should be handled — the classifier's
 * decision, without acting on it: the pacing master switch, a `!roll` force,
 * the classifier, the combat backstop, the recent-density window and the
 * telemetry. routePacedInput dispatches the narration for a NARRATIVE
 * decision; a Batch Mode round's reading (src/moves/movePipeline.js
 * readAction) shows the decision in the player's Round window instead — so
 * it passes `ignoreForceMove`: a round's readings ignore `!roll` (the window
 * has "Roll a move instead"), while `!pace` overrides still apply.
 *
 * @param {Object} args
 * @param {string} args.playerText
 * @param {Object} args.campaignState
 * @param {Object|null} args.character
 * @param {string} args.apiKey
 * @param {boolean} [args.ignoreForceMove] — a round's reading: `pacing.forceNextAsMove` is not read
 * @returns {Promise<{
 *   runMove: boolean,
 *   decision: string,
 *   suggestedMove: string|null,
 *   suggestedTargetId?: string|null,
 *   category: string,
 *   confidence: number,
 *   reasoning: string,
 *   forced?: boolean,
 * }>}
 */
export async function decidePacing({
  playerText, campaignState, character, apiKey, ignoreForceMove = false,
}) {
  const pacingConfig = readPacingConfig(campaignState);

  // Master switch — when disabled, behave exactly like the existing pipeline.
  if (!pacingConfig.enabled) {
    return { runMove: true, decision: PACING_DECISION.MOVE, suggestedMove: null, category: "exploration", confidence: 1, reasoning: "pacing disabled" };
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

  const recentMoveDensity = getRecentMoveDensity(pacingConfig.densityWindow);
  const combatActive      = await detectCombatActive();
  const openChallenges    = await detectOpenSceneChallenges();
  const sceneChallenges   = openChallenges.map(t => String(t.label ?? ""));

  const result = await classifyInput({
    playerText, campaignState, character, recentMoveDensity, pacingConfig, apiKey, combatActive, sceneChallenges,
  });

  // Backstop: during an active fight the classifier must not hedge. If it
  // returned NARRATIVE_WITH_MOVE_AVAILABLE it already identified a move — in
  // combat, that means roll it. Plain NARRATIVE (pure observation, no action)
  // is left untouched. Mirrors the COMBAT IS ACTIVE rule in the classifier so
  // the routing holds even when the model under-commits — a player can't end a
  // fight by asserting an outcome against an adversary as narration.
  if (combatActive && result.decision === PACING_DECISION.NARRATIVE_WITH_MOVE_AVAILABLE) {
    result.decision  = PACING_DECISION.MOVE;
    result.reasoning = `[combat-active backstop: NWMA→MOVE] ${result.reasoning ?? ""}`.trim();
  }

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

  // NARRATIVE / NARRATIVE_WITH_MOVE_AVAILABLE — narration, no roll.
  const suggestedMove = result.decision === PACING_DECISION.NARRATIVE_WITH_MOVE_AVAILABLE
    ? result.suggestedMove
    : null;

  // The challenge a scene-challenge nomination is part of — the one the
  // classifier named, else the sole open one — by id, for the paced card's
  // Roll to carry as its target: with two open it named none, and its scoring
  // asked "which scene challenge?" (PACED-VARIANT-NO-TARGET).
  const suggestedTargetId = SCENE_CHALLENGE_VARIANTS[suggestedMove]
    ? (selectSceneChallengeTrack(openChallenges, result.sceneChallenge ?? null)?.id ?? null)
    : null;

  return {
    runMove: false,
    decision: result.decision,
    suggestedMove,
    suggestedTargetId,
    category: result.category,
    confidence: result.confidence,
    reasoning: result.reasoning,
  };
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
  const pacing = await decidePacing({ playerText, campaignState, character, apiKey });
  if (pacing.runMove) return pacing;

  // NARRATIVE / NARRATIVE_WITH_MOVE_AVAILABLE — run the narrator and stop.
  const { suggestedMove, suggestedTargetId } = pacing;
  await narratePacedInput(playerText, campaignState, { suggestedMove, speakerActorId, ...(suggestedTargetId ? { suggestedTargetId } : {}) })
    .catch(err => console.error(`${MODULE_ID} | narratePacedInput failed:`, err));

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
 * Detect whether a fight is currently underway — i.e. there is at least one
 * open (non-completed) combat progress track. When true, the classifier and
 * router force player actions through the move pipeline so combat outcomes are
 * earned with dice rather than asserted as narration (playtest finding:
 * "I was able to thwart the drama during combat by asserting outcomes").
 *
 * Lazy-imports progressTracks to avoid load-order coupling, and fails open to
 * `false` (no combat) so a storage hiccup never blocks normal narration.
 *
 * @returns {Promise<boolean>}
 */
async function detectCombatActive() {
  try {
    const { listProgressTracks } = await import("../ui/progressTracks.js");
    const tracks = await listProgressTracks();
    return Array.isArray(tracks) && tracks.some(t => t.type === "combat" && !t.completed);
  } catch {
    return false;
  }
}

/**
 * The open scene challenges, for the classifier as the fight is
 * (detectCombatActive) — by name — and for the paced card's Roll target — by
 * id: within one, Face Danger and Secure an Advantage are its own moves (issue
 * #338 D2), and a paced "Roll Face Danger" during a challenge forced the
 * ordinary move — the classifier knew of no challenge
 * (PACING-ROLL-NO-SCENE-CHALLENGE). Fails open to none.
 *
 * @returns {Promise<Array<{ id: string, label: string, type: string, completed: boolean }>>}
 */
async function detectOpenSceneChallenges() {
  try {
    const { listProgressTracks } = await import("../ui/progressTracks.js");
    const tracks = await listProgressTracks();
    return (Array.isArray(tracks) ? tracks : [])
      .filter(t => t.type === "scene_challenge" && !t.completed);
  } catch {
    return [];
  }
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
    const latest = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? campaignState;
    await globalThis.game?.settings?.set?.(MODULE_ID, "campaignState",
      { ...latest, pacing: { ...(latest.pacing ?? campaignState.pacing), forceNextAsMove: false } });
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
  if (!await persist({ ...campaignState, pacing })) {
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
 * Write a campaignState (a copy — never the cached value) on a GM client.
 *
 * @param {Object} campaignState
 * @returns {Promise<boolean>} true when the world took it
 */
async function persist(campaignState) {
  if (!globalThis.game?.user?.isGM) return false;
  try {
    await globalThis.game?.settings?.set?.(MODULE_ID, "campaignState", campaignState);
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
  if (!await persist({ ...campaignState, pacing })) return false;
  if (campaignState) campaignState.pacing = pacing;
  return true;
}
