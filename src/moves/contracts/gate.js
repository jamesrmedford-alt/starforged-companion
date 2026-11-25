/**
 * STARFORGED COMPANION
 * src/moves/contracts/gate.js — whether a move can be made now, and if not, why
 *
 * Overhaul 4, "moves as contracts" (slice 1). One gate, called where a move
 * is offered and where it is made — the offer checks are so nothing is
 * offered that the roll would refuse; the roll is the authority:
 *
 *   src/pacing/router.js decidePacing     an offer (NWMA) or a MOVE decision
 *   src/moves/movePipeline.js readMove    every reading: a typed line's, a
 *                                         forced move's, a `!roll`'s
 *   src/moves/movePipeline.js rollAndApply every roll — free-flow, a forced
 *                                         move, a Batch Mode round's entry
 *   src/batch/driver.js refusalFor        a round's entry at resolution
 *
 * It reads the situation (situation.js readMoveSituation, read once by the
 * caller) and the reading — `{ moveId, target, targetId, patient, line,
 * readAsNoMove, fromWaypoint }` — and runs the move's preconditions
 * (table.js MOVE_CONTRACTS, predicates.js) in order. Pure and synchronous;
 * never throws (a precondition that throws holds — an unknown is never a
 * refusal).
 *
 *   checkMove(...) → { ok: true,  moveId, instead: null|moveId, note: null|string }
 *                  | { ok: false, moveId, code, hard, why, premise, offer: null|moveId }
 *
 * `instead` is applied by the caller as the reroutes always were (the
 * interpretation's moveId and moveName). `override` passes a soft failure —
 * a GM's Accept on the confirm dialog — and returns the `note` the move card
 * and its narration carry ("rolled at the GM's word: …"). A hard failure is
 * never overridden: there is nothing for the move to act on, and the table's
 * own hand (the sheet, the Progress Tracks panel) makes it first (D2).
 *
 * Soft preconditions are not applied while a fight is open — in a fight the
 * outcomes are earned with dice and the reader decides (the router's and
 * readMove's old `!combatActive` / `!combatPosition` rule); a reader-settled
 * one (Resupply's item, Repair's device) only where no reader read the line
 * as the move — an offer re-made after a reading of no move (`readAsNoMove`).
 *
 * The other builder's reader (overhaul 1, "one reader, told the whole
 * situation") consumes checkMove too, and builds availableMoves /
 * formatAvailableMoves / moveTriggers on the same table (its slice 4; this
 * design's slice 6): nothing here is built ahead of its caller.
 */

import { contractFor } from "./table.js";

const MODULE_ID = "starforged-companion";

const call = (fn, s, r, fallback = null) => {
  if (typeof fn !== "function") return fn ?? fallback;
  try { return fn(s, r) ?? fallback; } catch (err) {
    console.warn(`${MODULE_ID} | move gate: a precondition's words could not be built:`, err?.message ?? err);
    return fallback;
  }
};

/**
 * Whether `moveId` can be made now.
 *
 * @param {string|null} moveId
 * @param {Object|null} situation — readMoveSituation's; null: nothing could be read, so nothing is refused
 * @param {{ target?: string|null, targetId?: string|null, patient?: Object|null, line?: string,
 *   readAsNoMove?: boolean, fromWaypoint?: boolean }} [reading]
 * @param {{ stage?: "offer"|"read"|"roll", override?: boolean }} [opts]
 * @returns {{ ok: true, moveId: string|null, instead: string|null, note: string|null }
 *   | { ok: false, moveId: string, code: string, hard: boolean, why: string,
 *       premise: { claim: string, never: string|null }|null, offer: string|null }}
 */
export function checkMove(moveId, situation, reading = {}, { stage = "read", override = false, _rerouted = false } = {}) {
  const pass = { ok: true, moveId: moveId ?? null, instead: null, note: null };
  const contract = contractFor(moveId);
  if (!contract || contract.gated || !situation) return pass;
  const r = { ...(reading ?? {}), moveId };
  const inFight = Array.isArray(situation.tracks?.fights) && situation.tracks.fights.length > 0;
  let instead = null;
  let note = null;
  for (const p of contract.requires) {
    if (Array.isArray(p.stages) && !p.stages.includes(stage)) continue;
    const reroute = p.instead != null;
    const soft = !p.hard && !reroute;
    if (soft && inFight) continue;
    if (p.readerSettled && r.readAsNoMove !== true) continue;
    let held;
    try { held = p.test(situation, r); } catch (err) {
      console.warn(`${MODULE_ID} | move gate: ${moveId}'s "${p.id}" could not be checked — it holds:`, err?.message ?? err);
      held = null;
    }
    if (held !== false) continue;
    if (reroute) {
      const to = call(p.instead, situation, r);
      if (!instead && typeof to === "string" && to && to !== moveId) instead = to;
      continue;
    }
    const why = String(call(p.why, situation, r, "") || "it cannot be made now");
    if (soft && override) {
      note = note ?? `rolled at the GM's word: ${why}`;
      continue;
    }
    return {
      ok: false, moveId, code: p.id, hard: p.hard === true, why,
      premise: call(p.premise, situation, r),
      offer: (() => { const o = call(p.offer, situation, r); return typeof o === "string" && o && o !== moveId ? o : null; })(),
    };
  }
  if (instead && !_rerouted) {
    // The move it is made as answers to its own contract — one step, no more.
    const then = checkMove(instead, situation, reading, { stage, override, _rerouted: true });
    if (!then.ok) return then;
    note = note ?? then.note;
  }
  return { ...pass, instead, note };
}

/**
 * The refusal as it rides a decision, a reading or a card's flags — plain
 * JSON, the verdict's own words: `{ moveId, code, hard, why, premise, offer }`.
 *
 * @param {Object} verdict — a checkMove refusal
 * @returns {Object|null}
 */
export function refusalOf(verdict) {
  if (!verdict || verdict.ok !== false) return null;
  return {
    moveId: verdict.moveId, code: verdict.code, hard: verdict.hard === true, why: verdict.why,
    premise: verdict.premise ? { claim: String(verdict.premise.claim ?? ""), never: verdict.premise.never ?? null } : null,
    offer: verdict.offer ?? null,
  };
}
