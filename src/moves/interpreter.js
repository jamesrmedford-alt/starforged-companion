/**
 * STARFORGED COMPANION
 * src/moves/interpreter.js — a line read for its move: the line reader's roll, chosen and open modes
 *
 * interpretMove keeps its name, its signature and its return (issue #384,
 * D10): the move pipeline calls it where a line is read for a move and no
 * reading was carried — a `!roll`, pacing switched off, a round's "Roll a
 * move instead" (`roll`: never no move), a card that chose the move
 * (`chosen`: its stat, target and stakes, read against the move's own text),
 * and a typed line whose open reading failed (`open` again, under the move
 * lock: the failed reading's second try, D13). Since the switch (slice 2)
 * the call is the line reader's (src/moves/reader.js readLine): the move
 * interpreter's own prompt, context and parse are gone with the pacing
 * classifier's (decisions.md → "Overhauls 1 and 4").
 *
 * Kept here, for the reader and the pipeline: the combat position's remap
 * (constrainMoveToPosition), a chosen move's own text (buildCanonicalMoveBlock),
 * the in-kind hold on a Balanced misread (keepMischiefInKind), and the shapes
 * a reading of no move and a failed reading come back as.
 */

import { MOVES } from "../schemas.js";
import { getCanonicalMove } from "../system/ironswornPacks.js";
import { moveDisplayName } from "../system/i18n.js";
import { readLine, READING_MODES } from "./reader.js";

// Combat moves that are only legal in one position. When the interpreter
// proposes a move for the wrong position, it is remapped to the same-intent
// move for the actual position: attack ↔ attack (Strike/Clash) and
// maneuver ↔ maneuver (Gain Ground/React Under Fire). Stat options are
// identical within each pair (schemas.js), so the model's chosen stat stays
// valid through the remap.
//   In control   → Strike, Gain Ground, Take Decisive Action
//   In a bad spot → Clash, React Under Fire, Take Decisive Action, Face Defeat
const POSITION_MOVE_REMAP = {
  in_control: { clash: "strike", react_under_fire: "gain_ground" },
  bad_spot:   { strike: "clash", gain_ground: "react_under_fire" },
};

/**
 * Force a combat move to be one that is legal for the current combat position.
 * The system prompt + combat directive already steer the model; this is the
 * deterministic guarantee. A wrong-position attack/maneuver move is remapped to
 * its same-position counterpart (stat options are identical within each pair).
 * Position-agnostic combat moves (enter_the_fray, take_decisive_action,
 * face_defeat, battle) and all non-combat moves pass through unchanged — as do
 * all moves when combatPosition is null (out of combat, or ambiguous
 * multi-combat where getActiveCombatPosition() cannot pick a single track).
 *
 * @param {string} moveId
 * @param {'in_control'|'bad_spot'|null} combatPosition
 * @returns {string} the position-legal move id
 */
export function constrainMoveToPosition(moveId, combatPosition) {
  if (combatPosition !== "in_control" && combatPosition !== "bad_spot") return moveId;
  return POSITION_MOVE_REMAP[combatPosition]?.[moveId] ?? moveId;
}

/**
 * Build a canonical-move grounding block for inclusion in the interpreter
 * user message. When the foundry-ironsworn `starforged-moves` compendium
 * contains an Item matching `slug`, its text is wrapped in a
 * `<canonical_move>...</canonical_move>` tag the model can ground against.
 *
 * The system's move document (`sfmove`) keeps its text in `system.Text`, an
 * HTMLField — a string (vendor src/module/item/subtypes/sfmove.ts; every
 * vendored starforged-moves / ironsworn-moves document). It was read as
 * `system.description ?? system.text ?? system.Text.text`, fields no move has,
 * so the block was "" for every real move and a forced move's stat reading
 * never got the move's text (issue #345 AA44). Those fields stay as fallbacks.
 * Its `@Compendium[…]{Pay the Price}` links are reduced to their labels, as
 * actorBridge.readAssets reduces an ability's.
 *
 * Returns "" when the slug is missing, no system is installed, or the
 * compendium document has no text. Never throws.
 *
 * Exported for unit testing of the grounding logic.
 *
 * @param {string} slug
 * @returns {Promise<string>}
 */
export async function buildCanonicalMoveBlock(slug) {
  if (!slug) return "";
  let doc = null;
  try {
    doc = await getCanonicalMove(slug);
  } catch (err) {
    console.warn(`starforged-companion | interpreter: getCanonicalMove(${slug}) failed:`, err);
    return "";
  }
  if (!doc) return "";
  const sys = doc.system ?? {};
  const raw = [sys.Text, sys.description, sys.text, sys.Text?.text]
    .find(v => typeof v === "string" && v.trim()) ?? "";
  const text = raw
    .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/<[^>]*>/g, "")
    .trim();
  if (!text) return "";
  return `<canonical_move>\n${text}\n</canonical_move>`;
}

/**
 * Interpret player narration as a Starforged move — the line reader in the
 * mode the call asks for: `chosen` with a move already chosen, `roll` when a
 * roll was asked for, else `open` (a failed open reading's second try).
 *
 * @param {string} narration — raw player input (typed or transcribed)
 * @param {Object} options
 * @param {Object} options.campaignState — CampaignStateSchema
 * @param {string} options.mischiefLevel — "serious" | "balanced" | "chaotic"
 * @param {string} options.apiKey — Claude API key
 * @param {string} [options.expectedMoveSlug] — the move already chosen, by a
 *   card or button that forces it: the reader is told so, with the move's
 *   own text, and reads the line for its stat, target and stakes (issue #321 U04)
 * @param {string} [options.recentScene] — what the line follows (narrator.js getRecentSceneForReading)
 * @param {Actor|null} [options.roller] — the character speaking and acting: their situation is the reader's
 * @param {boolean} [options.allowNoMove] — whether the line may be read as no
 *   move (issue #354 P2-01): false when a roll was asked for. Never with a move chosen.
 * @param {Array<{ name: string, text: string }>|null} [options.round] — a round's other submitted actions
 * @returns {Promise<Object>} — partial MoveResolutionSchema (no dice yet);
 *   `{ noMove: true, rationale, … }` when no move is being made; a reply
 *   nobody could read is the fallback reading (`fallback: true`). A call that
 *   failed throws, as it always has: the pipeline tells the table.
 */
export async function interpretMove(narration, {
  campaignState, mischiefLevel, apiKey, expectedMoveSlug, recentScene = "", roller = null, allowNoMove = true, round = null,
}) {
  if (!apiKey) throw new Error("Claude API key not configured. Set it in module settings.");
  if (!narration?.trim()) throw new Error("No narration to interpret.");

  const expectedMove = expectedMoveSlug && MOVES[expectedMoveSlug] ? expectedMoveSlug : null;
  const mode = expectedMove ? READING_MODES.CHOSEN : allowNoMove === false ? READING_MODES.ROLL : READING_MODES.OPEN;
  const reading = await readLine({
    mode, text: narration, speakerActorId: roller?.id ?? null, campaignState, apiKey, mischiefLevel,
    chosen: expectedMove ? { moveId: expectedMove } : null,
    canonicalBlock: expectedMove ? await buildCanonicalMoveBlock(expectedMove) : "",
    recentScene, round,
  });
  if (reading.failed) {
    // A call that failed is the caller's to tell; a reply nobody could read is the fallback reading.
    if (/^the reader's call failed/.test(reading.failed)) throw new Error(reading.failed.replace(/^the reader's call failed: /, ""));
    return fallbackInterpretation(narration, mischiefLevel, expectedMove);
  }
  if (!reading.interpretation) return noMoveInterpretation(narration, mischiefLevel, { rationale: reading.reason, confidence: reading.confidence });
  return reading.interpretation;
}

// The categories a line of dialogue is never turned into by a Balanced
// misread (issue #354 P2-02, the maintainer's decision): travel, fate and
// suffer moves. MOVES[id].category, as schemas.js files them.
const OUT_OF_KIND_FOR_DIALOGUE = new Set(["exploration", "fate", "suffer"]);

/**
 * A Balanced Mischief reading stays inside what the line is doing (issue #354
 * P2-02; decisions.md → "Issue #354"). The Balanced framing lets the model
 * prefer a "less obvious but more dramatically interesting" move, and it read
 * a line spoken to an NPC — "we've come this far…" — as Undertake an
 * Expedition. It may still change the stat or pick a neighbouring move; but a
 * misread (`mischiefApplied`) of a line the classifier placed in a social
 * scene that lands on a travel, fate or suffer move is put back to the move
 * the classifier named, with a stat that move lists, and says so. Chaotic
 * keeps its freedom; a reading that is not a misread is left alone (the
 * interpreter turning Face Danger into Undertake an Expedition for a journey
 * through uncharted space is a correction, not mischief — issue #348 PT06).
 *
 * @param {Object} interpretation — parseInterpretation's result
 * @param {{ moveId: string|null, category: string|null }|null} pacingRead
 * @param {string} mischiefLevel
 * @returns {Object} the interpretation, or the one put back in kind
 */
export function keepMischiefInKind(interpretation, pacingRead, mischiefLevel) {
  if (!interpretation || interpretation.noMove) return interpretation;
  if (mischiefLevel !== "balanced" || interpretation.mischiefApplied !== true) return interpretation;
  if (pacingRead?.category !== "social" || !pacingRead.moveId) return interpretation;
  const readAs = MOVES[interpretation.moveId];
  const named  = MOVES[pacingRead.moveId];
  if (!readAs || !named || !OUT_OF_KIND_FOR_DIALOGUE.has(readAs.category) || OUT_OF_KIND_FOR_DIALOGUE.has(named.category)) {
    return interpretation;
  }
  const listed = Array.isArray(named.stat) ? named.stat : [];
  const statUsed = listed.includes(interpretation.statUsed) ? interpretation.statUsed : (listed[0] ?? null);
  return {
    ...interpretation,
    moveId:          pacingRead.moveId,
    moveName:        moveDisplayName(pacingRead.moveId),
    statUsed,
    isProgressMove:  named.progressMove === true,
    moveTarget:      null,
    expeditionRank:  null,
    combatRank:      null,
    healSituation:   null,
    // The stakes were written for the other move.
    stakes:          null,
    mischiefApplied: false,
    keptInKind:      interpretation.moveId,
    rationale:       `${interpretation.rationale ? `${interpretation.rationale} ` : ""}(Read as ${moveDisplayName(pacingRead.moveId)}: a line of dialogue is not turned into ${moveDisplayName(interpretation.moveId)}.)`,
  };
}

/**
 * The reading of a line as no move (issue #354 P2-01): the pipeline narrates
 * it, with the classifier's move offered, instead of opening the roll dialog.
 *
 * @returns {{ noMove: true, playerNarration: string, mischiefLevel: string, rationale: string, confidence: string }}
 */
function noMoveInterpretation(narration, mischiefLevel, parsed) {
  return {
    noMove:          true,
    playerNarration: narration,
    inputMethod:     "chat",
    mischiefLevel,
    moveId:          null,
    moveName:        null,
    rationale:       typeof parsed?.rationale === "string" ? parsed.rationale.trim() : "",
    confidence:      parsed?.confidence ?? "medium",
    mischiefApplied: false,
    playerConfirmed: false,
  };
}

/**
 * Safe fallback interpretation when the API response cannot be parsed.
 * Defaults to Face Danger +wits — the most common adventure move; a move
 * already chosen (`expectedMoveId`) keeps that move and its first listed stat,
 * since nothing was read. Low confidence flags it for the confirmation UI to
 * highlight.
 */
function fallbackInterpretation(narration, mischiefLevel, expectedMoveId = null) {
  const expected = expectedMoveId && MOVES[expectedMoveId] ? expectedMoveId : null;
  return {
    playerNarration:         narration,
    inputMethod:             "chat",
    mischiefLevel,
    moveId:                  expected ?? "face_danger",
    moveName:                expected ? moveDisplayName(expected) : "Face Danger",
    statUsed:                expected ? (MOVES[expected].stat?.[0] ?? null) : "wits",
    statValue:               0,
    adds:                    0,
    isProgressMove:          expected ? MOVES[expected].progressMove === true : false,
    progressTicks:           0,
    moveTarget:              null,
    expeditionRank:          null,
    combatRank:              null,
    healSituation:           null,
    rationale:               "Fallback — API response could not be parsed.",
    stakes:                  null,
    mischiefApplied:         false,
    // A failed reading, not an unsure one: the confirm dialog shows it — it is
    // not narrated as a low-confidence reading is (movePipeline.js readMove).
    fallback:                true,
    confidence:              "low",
    playerConfirmed:         false,
  };
}
