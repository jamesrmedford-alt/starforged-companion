/**
 * STARFORGED COMPANION
 * src/pacing/readAndRoute.js — a typed line read once, and its reading turned into roll, offer or narrate
 *
 * The one reader (src/moves/reader.js readLine) says what a line does in the
 * fiction — the move it sets about, whether the player asked for it, how much
 * hangs on it — and never decides roll, offer or narrate. The table's dials
 * are a setting, and a setting is kept in code (decisions.md → "A low pacing
 * dial holds in code"; issue #384, D1): every
 * pacing patch so far was one prompt rule losing to another over the dials —
 * the density lean beat the named-move rule (issue #383 finding 17), a
 * question to a connection was rolled at a dial of 1
 * (PACING-LOW-DIAL-QUESTION-TO-CONNECTION). routeReading is the one table
 * the holds scattered over router.js decidePacing and movePipeline.js
 * readMove become.
 *
 * readAndRoute is the composition decidePacing takes at the switch: the
 * situation read once (src/moves/readerSituation.js), what can be made now
 * (src/moves/contracts/available.js — the move contracts'), the open reading,
 * the route — returned in decidePacing's shape, plus the reading and what the
 * gate refused (`unmade`, told to the narration at the switch, D15). The
 * pacing config and the density window are its caller's (decidePacing reads
 * them for its master switch and `!roll` first), and so are the telemetry
 * and the density record.
 *
 * decidePacing calls readAndRoute for every typed line (issue #384, slice 2,
 * the switch), with the move contracts' gate (overhaul 4, moves/contracts/
 * gate.js checkMove) as routeReading's row 2; the readers' plain-line test
 * calls it as decidePacing does (test/ci/playwright/readers.mjs).
 */

import { MOVES } from "../schemas.js";
import { effectiveDial, PACING_DECISION } from "./dials.js";
import { selectSceneChallengeTrack, SCENE_CHALLENGE_VARIANTS } from "../moves/sceneChallenge.js";
import { readLineSituation } from "../moves/readerSituation.js";
import { availableMoves } from "../moves/contracts/available.js";
import { checkMove } from "../moves/contracts/gate.js";
import { readMoveSituation } from "../moves/situation.js";
import { CATALOGUE_MOVE_IDS } from "../moves/readerCatalogue.js";
import { readLine, isRolledMove, READING_MODES } from "../moves/reader.js";
import { getRecentSceneForReading, lineIsToAFellowPlayerCharacter } from "../narration/narrator.js";
import { moveDisplayName } from "../system/i18n.js";

const MODULE_ID = "starforged-companion";

/** The route a reading takes, as the pacing decision it was: roll = MOVE, offer = NWMA, narrate = NARRATIVE. */
export const ROUTE_DECISION = Object.freeze({
  roll:    PACING_DECISION.MOVE,
  offer:   PACING_DECISION.NARRATIVE_WITH_MOVE_AVAILABLE,
  narrate: PACING_DECISION.NARRATIVE,
});

/**
 * A dense window: at least this share of the last decisions rolled — 3 of
 * the last 5 at the default window (`pacing.densityWindow`). The pacing
 * reader was told the count and left to lean (classifier.js); here a dense
 * window turns an unasked roll into an offer, and nothing more.
 */
export const DENSE_SHARE = 3 / 5;
/** The top of the low band: at 0–2 the table has said "narrate unless asked" (router.js LOW_DIAL_MAX). */
const LOW_DIAL_MAX = 2;
/** The numbers decidePacing's callers read for a word of confidence (pacing/telemetry.js renders a share). */
export const CONFIDENCE_NUMBER = Object.freeze({ high: 0.9, medium: 0.6, low: 0.3 });

const isRecovery = (moveId) => MOVES[moveId]?.category === "recover";

/**
 * Whether the density window is dense.
 *
 * @param {{ count: number, window: number }|null} density
 * @returns {boolean}
 */
export function isDense(density) {
  const count = Number(density?.count);
  const window = Number(density?.window);
  return Number.isFinite(count) && Number.isFinite(window) && window > 0 && count / window >= DENSE_SHARE;
}

/**
 * Turn a reading into roll, offer or narrate — the first row that applies:
 *
 *   1. No move → narrate.
 *   2. The gate refuses the move: its `instead` (Strike → Clash in a bad
 *      spot) is read on from row 3; with none, narrate — what was refused
 *      rides as `unmade` for the narration (D15).
 *   3. A social move at a fellow player character, no tracked NPC named →
 *      narrate, nothing offered (finding G).
 *   4. A fight is open → roll, whatever the move: a fight never hedges.
 *   5. Asked → roll.
 *   6. A move with no roll at all (no stat, no progress roll: Reach a
 *      Milestone, Develop Your Relationship, Forsake Your Vow, …) → offer.
 *      A bonded Develop's +rank roll is no action roll against uncertainty,
 *      so it is offered too; asked, or in a fight, it is made.
 *   7. By the effective dial d of the reading's category: 9–10 roll; 6–8
 *      roll when the risk is high or plain, else offer; 3–5 roll when high,
 *      else offer; 0–2 roll when high, else offer a recovery move or a move
 *      the reader is sure of (confidence high), else narrate — the low
 *      dial's band is "narrate unless asked or the stakes are plain", and a
 *      move a line plainly sets about is offered on a button, never rolled
 *      (decisions.md → "A low pacing dial holds in code"; the pacing reader
 *      offered Check Your Gear at downtime 1 where this band narrated it —
 *      the one reader's first measure, issue #384).
 *   8. A roll from row 7 — never one from rows 4–5 — is an offer when the
 *      reading is unsure (confidence low), when it is medium at d 0–2 (the
 *      low dial's floor), or when the density window is dense. Row 8 only
 *      ever demotes a roll.
 *
 * Pure: the gate and the fellow-PC test are the caller's (`ctx.check`,
 * `ctx.toFellowPc`).
 *
 * @param {import("../moves/reader.js").Reading} reading
 * @param {{ pacingConfig: Object, density?: { count: number, window: number }|null, fightOpen?: boolean,
 *   check?: (moveId: string) => { ok: boolean, why: string, instead: string|null },
 *   toFellowPc?: (moveId: string) => boolean }} ctx
 * @returns {{ route: "roll"|"offer"|"narrate", why: string, moveId: string|null, offeredMove: string|null,
 *   unmade: { moveId: string, why: string }|null, remapped: { from: string, why: string }|null, dial: number|null }}
 */
export function routeReading(reading, ctx = {}) {
  const result = (route, why, extra = {}) => ({ route, why, moveId: null, offeredMove: null, unmade: null, remapped: null, dial: null, ...extra });
  let moveId = reading?.moveId && MOVES[reading.moveId] ? reading.moveId : null;
  if (!moveId) return result("narrate", "no move");

  // 2. The gate.
  let remapped = null;
  const gate = typeof ctx.check === "function" ? ctx.check(moveId) : null;
  if (gate && gate.ok === false) {
    if (gate.instead && MOVES[gate.instead]) {
      remapped = { from: moveId, why: gate.why };
      moveId = gate.instead;
    } else {
      // The contracts' verdict rides with it: its premise is told to the narration, its offer is the card's Roll.
      return result("narrate", `not now: ${gate.why}`, { unmade: { moveId, why: gate.why, ...(gate.verdict ? { verdict: gate.verdict } : {}) } });
    }
  }
  const made = (route, why, extra = {}) => result(route, why, { moveId, remapped, offeredMove: route === "offer" ? moveId : null, ...extra });

  // 3. A social move at a fellow player character.
  if (typeof ctx.toFellowPc === "function" && ctx.toFellowPc(moveId)) {
    return result("narrate", "spoken to a fellow player character: roleplay, not a roll", { remapped });
  }
  // 4. A fight never hedges.
  if (ctx.fightOpen) return made("roll", "a fight is open: a fight never hedges");
  // 5. Asked.
  if (reading.asked === true) return made("roll", "the player asked for it");
  // 6. A move with no roll is offered, not rolled.
  if (!isRolledMove(moveId)) return made("offer", "a move with no roll is offered, not rolled");

  // 7. The dial.
  const d = effectiveDial(reading.category, ctx.pacingConfig);
  const risk = reading.risk ?? "plain";
  let route;
  if (d >= 9) route = "roll";
  else if (d >= 6) route = risk === "high" || risk === "plain" ? "roll" : "offer";
  else if (d >= 3) route = risk === "high" ? "roll" : "offer";
  else route = risk === "high" ? "roll" : isRecovery(moveId) || reading.confidence === "high" ? "offer" : "narrate";
  let why = `dial ${d} (${reading.category}), risk ${risk}`;

  // 8. Demotions of a roll.
  if (route === "roll") {
    if (reading.confidence === "low") { route = "offer"; why += "; an unsure reading is offered, not rolled"; }
    else if (reading.confidence === "medium" && d <= LOW_DIAL_MAX) { route = "offer"; why += "; low dial: an unsure move is offered, not rolled"; }
    else if (isDense(ctx.density)) { route = "offer"; why += "; a dense run of rolls: offered, not rolled"; }
  }
  return made(route, why, { dial: d });
}

/**
 * Read a line once and route it: the situation, the availability, the open
 * reading and the route — in decidePacing's shape, with the reading.
 *
 * A failed reading (no key, a failed call, an unreadable reply — after one
 * retry on a rate limit) is today's fallback: the line goes on as a move with
 * no reading (`fallback: true`), and is read once more under the move lock,
 * as a failed pacing call's line is read by the move reader today (D13).
 *
 * @param {Object} args
 * @param {string} args.playerText
 * @param {Object} args.campaignState
 * @param {{ name?: string|null, actorId?: string|null }|null} args.character — the speaker
 * @param {string|null} args.apiKey
 * @param {Object} args.pacingConfig — router.js readPacingConfig's
 * @param {{ count: number, window: number }|null} [args.recentMoveDensity] — router.js
 *   getRecentMoveDensity's; null in a Batch Mode round (D12: a round is its own pacing)
 * @param {string} [args.mischiefLevel] — the Mischief dial
 * @param {Array<{ name: string, text: string }>|null} [args.round] — a round's other submitted actions
 * @param {Object|null} [args.moveSituation] — the speaker's situation as the move contracts read it
 *   (moves/situation.js readMoveSituation); read here when not given. It is what the reader is told can
 *   be made now (contracts/available.js) and routeReading's row 2 (contracts/gate.js checkMove).
 * @returns {Promise<{ runMove: boolean, decision: string, suggestedMove: string|null, suggestedTargetId: string|null,
 *   category: string, confidence: number, reasoning: string, moveId: string|null,
 *   reading: import("../moves/reader.js").Reading, route: Object|null,
 *   unmade: { moveId: string, why: string }|null, fallback?: boolean, errorMessage?: string }>}
 */
export async function readAndRoute({
  playerText, campaignState, character = null, apiKey, pacingConfig, recentMoveDensity = null, mischiefLevel = "serious", round = null,
  moveSituation = undefined,
}) {
  let actor = null;
  try { actor = character?.actorId ? (globalThis.game?.actors?.get?.(character.actorId) ?? null) : null; } catch { actor = null; }
  const situation = readLineSituation(actor, { campaignState });
  // What the move contracts say can be made now: told to the reader, and its gate (one authority).
  const contracts = moveSituation !== undefined ? moveSituation : await readContractSituation(character?.actorId ?? null, campaignState);
  const available = availableMoves(contracts, CATALOGUE_MOVE_IDS);
  const gate = contracts ? (moveId) => checkMove(moveId, contracts, { line: playerText ?? "" }, { stage: "offer" }) : null;
  // The current scene's part of the ring (overhaul 2, slice 5), as the move pipeline reads it.
  const recentScene = getRecentSceneForReading(campaignState?.currentSessionId ?? null, campaignState);

  let reading = await readLine({
    mode: READING_MODES.OPEN, text: playerText, speakerActorId: character?.actorId ?? null, campaignState, apiKey,
    mischiefLevel, round, recentScene, situation, available,
  });
  if (reading.failed) {
    return {
      runMove: true, decision: PACING_DECISION.MOVE, suggestedMove: null, suggestedTargetId: null, category: "exploration",
      confidence: 0, reasoning: `fallback: ${reading.failed}`, moveId: null, reading, route: null, unmade: null,
      fallback: true, errorMessage: reading.failed,
    };
  }

  const speakerName = character?.name ?? situation.speaker?.name ?? null;
  const route = routeReading(reading, {
    pacingConfig,
    density: recentMoveDensity,
    fightOpen: situation.fights.length > 0,
    check: gateCheck(gate),
    toFellowPc: (moveId) => lineIsToAFellowPlayerCharacter(moveId, playerText, speakerName, { campaignState }),
  });
  if (route.remapped && route.moveId) reading = readAs(reading, route.moveId, route.remapped.why);

  // The challenge an offered scene-challenge move is part of, by id — the
  // one the reading named, else the sole open one (router.js's rule).
  const suggestedMove = route.route === "offer" ? route.offeredMove : null;
  const suggestedTargetId = suggestedMove && SCENE_CHALLENGE_VARIANTS[suggestedMove]
    ? (selectSceneChallengeTrack(situation.challenges, reading.sceneChallenge ?? null)?.id ?? null)
    : null;

  const reasoning = `${reading.reason || "(no reason given)"} [${route.why}]`;
  console.debug(`${MODULE_ID} | line reader: "${String(playerText ?? "").slice(0, 80)}" → ${route.route}`
    + `${route.moveId ? ` ${route.moveId}` : ""}${route.unmade ? ` (not now: ${route.unmade.moveId} — ${route.unmade.why})` : ""} — ${reasoning}`);
  return {
    runMove: route.route === "roll",
    decision: ROUTE_DECISION[route.route],
    suggestedMove,
    suggestedTargetId,
    category: reading.category,
    confidence: CONFIDENCE_NUMBER[reading.confidence] ?? CONFIDENCE_NUMBER.medium,
    reasoning,
    moveId: route.moveId,
    reading,
    route,
    unmade: route.unmade,
  };
}

/**
 * The speaker's situation as the move contracts read it, or null when it
 * cannot be read — then nothing is refused (an unknown is never a refusal).
 *
 * @param {string|null} actorId
 * @param {Object|null} campaignState
 * @returns {Promise<Object|null>}
 */
async function readContractSituation(actorId, campaignState) {
  try {
    return await readMoveSituation(actorId, { campaignState });
  } catch (err) {
    console.warn(`${MODULE_ID} | line reader: the move contracts' situation could not be read — nothing is refused:`, err?.message ?? err);
    return null;
  }
}

/**
 * The move contracts' verdict (contracts/gate.js checkMove) as routeReading's
 * check: a reroute (`ok` with `instead` — the position's own move, a
 * variant's ordinary one) is a remap; a refusal carries its verdict for the
 * narration and the card; an unknown is never a refusal.
 *
 * @param {(moveId: string) => Object|null} gate
 * @returns {(moveId: string) => { ok: boolean, why: string, instead: string|null, verdict?: Object }}
 */
function gateCheck(gate) {
  return (moveId) => {
    let verdict = null;
    if (typeof gate !== "function") return { ok: true, why: "", instead: null };
    try { verdict = gate(moveId); } catch (err) {
      console.warn(`${MODULE_ID} | line reader: the move gate could not be asked — nothing is refused:`, err?.message ?? err);
    }
    if (!verdict) return { ok: true, why: "", instead: null };
    if (verdict.ok) {
      return verdict.instead && verdict.instead !== moveId && MOVES[verdict.instead]
        ? { ok: false, why: verdict.note || `made as ${moveDisplayName(verdict.instead)}`, instead: verdict.instead }
        : { ok: true, why: "", instead: null };
    }
    return { ok: false, why: verdict.why || "it cannot be made now", instead: null, verdict };
  };
}

/**
 * The reading made as another move — the gate's `instead`: the position
 * pair's other, a scene-challenge variant's ordinary move. Its stat stays
 * where the other lists it, else that move's first; its stakes stand (the
 * same attempt).
 */
function readAs(reading, moveId, why) {
  const move = MOVES[moveId];
  const was = reading.interpretation;
  if (!move || !was) return { ...reading, moveId };
  const listed = Array.isArray(move.stat) ? move.stat : [];
  return {
    ...reading,
    moveId,
    interpretation: {
      ...was,
      moveId,
      moveName: moveDisplayName(moveId),
      statUsed: listed.length && move.progressMove !== true ? (listed.includes(was.statUsed) ? was.statUsed : listed[0]) : null,
      isProgressMove: move.progressMove === true,
      rationale: `${was.rationale ? `${was.rationale} ` : ""}(Made as ${moveDisplayName(moveId)}: ${why}.)`,
    },
  };
}
