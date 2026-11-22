/**
 * STARFORGED COMPANION
 * tests/helpers/sequence/rules.js — the rules a generated sequence expects
 *
 * Issue #302 slice C. The expected-state model (model.js) must not compute
 * its answers with the functions it checks: an expectation taken from
 * production code agrees with production code whatever it does. Everything
 * here is transcribed from the game's own text and from the recorded
 * decisions, and imports nothing from src/:
 *
 *   - Progress per mark, by rank — the play kit's "Mark progress"
 *     (docs/rules-reference/playkit-rules-and-coverage.md §1): 3 boxes,
 *     2 boxes, 1 box, 2 ticks, 1 tick.
 *   - The legacy reward, by rank — Fulfill Your Vow and Forge a Bond, in the
 *     moves' own words: "troublesome=1 tick; dangerous=2 ticks; formidable=1
 *     box; extreme=2 boxes; epic=3 boxes". tests/unit/sequenceRules.test.js
 *     reads that sentence from the vendored move text and compares.
 *   - A weak hit on Fulfill Your Vow, the legacy reward "one rank lower (none
 *     for a troublesome quest)" — the move's text when no new vow is sworn.
 *   - A recommit after a miss: "roll both challenge dice, take the lowest
 *     value, and clear that number of progress boxes. Then, raise the …
 *     rank by one (if not already epic)".
 *   - Hits and misses: a score beats a challenge die only when greater; a
 *     progress score is the filled boxes.
 *   - The legacy tracks are the crew's, one set for the table, shown on
 *     every sheet (decisions.md → "Legacy XP pays at the tick write, to
 *     every player character").
 *   - A vow sworn to a connection: fulfilled, it deepens that connection —
 *     "a milestone on its relationship track" — and "the source challenge's
 *     rank sets the mark count, the target track's rank sets ticks/mark":
 *     "troublesome/dangerous 1, formidable/extreme 2, epic 3" (decisions.md →
 *     "Vow ↔ combat ↔ bond stakes & rewards"). The "weak-hit win N−1" beside
 *     those numbers is written for a won fight's marks on its vow; nothing
 *     says a weak hit on the vow itself deepens less, so it does not here.
 *     Once per vow (decisions.md → "A vow deepens its connection once").
 *   - A session: Begin a Session with a vignette spotlighted, "all players
 *     take +1 momentum"; End a Session with a focus noted for next time,
 *     "make note of it and take +1 momentum". Momentum is never above +10
 *     (docs/rules-reference/rulebook-summary.md, "Momentum (–6 to +10)").
 */

export const RANKS = Object.freeze(["troublesome", "dangerous", "formidable", "extreme", "epic"]);

export const TICKS_PER_BOX = 4;
export const TRACK_BOXES   = 10;
export const TRACK_TICKS   = TICKS_PER_BOX * TRACK_BOXES;

/** Ticks one "mark progress" adds, by the track's rank. */
export const PROGRESS_TICKS = Object.freeze({
  troublesome: 3 * TICKS_PER_BOX,
  dangerous:   2 * TICKS_PER_BOX,
  formidable:  1 * TICKS_PER_BOX,
  extreme:     2,
  epic:        1,
});

/** Ticks marked on a legacy track for a finished vow or a forged bond, by its rank. */
export const LEGACY_REWARD_TICKS = Object.freeze({
  troublesome: 1,
  dangerous:   2,
  formidable:  1 * TICKS_PER_BOX,
  extreme:     2 * TICKS_PER_BOX,
  epic:        3 * TICKS_PER_BOX,
});

export const MOMENTUM_START = 2;
export const MOMENTUM_MAX   = 10;

/** Momentum gained, never past the maximum. */
export function gainMomentum(momentum, gain = 1) {
  return Math.min(MOMENTUM_MAX, momentum + gain);
}

/** The vendor sheet stores a rank as 1–5; the module writes its name. Either reads as the name. */
export function rankOf(value) {
  if (typeof value === "number") return RANKS[value - 1] ?? null;
  const name = String(value ?? "").toLowerCase();
  return RANKS.includes(name) ? name : null;
}

/** The rank as the vendor sheet stores it. */
export const sheetRank = (rank) => RANKS.indexOf(rank) + 1;

/** One mark of progress, never past the tenth box. */
export function markProgress(ticks, rank) {
  return Math.min(TRACK_TICKS, ticks + PROGRESS_TICKS[rank]);
}

/** A progress move's score: the boxes filled. */
export function progressScore(ticks) {
  return Math.min(TRACK_BOXES, Math.floor(ticks / TICKS_PER_BOX));
}

/** @returns {"strong_hit"|"weak_hit"|"miss"} */
export function outcomeOf(score, challenge) {
  const beaten = challenge.filter(die => score > die).length;
  return beaten === 2 ? "strong_hit" : beaten === 1 ? "weak_hit" : "miss";
}

/** The rank below, or null under troublesome. */
export function rankBelow(rank) {
  const i = RANKS.indexOf(rank);
  return i > 0 ? RANKS[i - 1] : null;
}

/** The rank above; epic stays epic. */
export function rankAbove(rank) {
  return RANKS[Math.min(RANKS.length - 1, RANKS.indexOf(rank) + 1)];
}

/** Legacy ticks for a fulfilled vow: its rank on a strong hit, one rank lower on a weak hit, none on a miss. */
export function fulfilReward(rank, outcome) {
  if (outcome === "strong_hit") return LEGACY_REWARD_TICKS[rank];
  if (outcome === "weak_hit") return LEGACY_REWARD_TICKS[rankBelow(rank)] ?? 0;
  return 0;
}

/** Legacy ticks for a forged bond: the connection's rank on any hit. */
export function bondReward(rank, outcome) {
  return outcome === "miss" ? 0 : LEGACY_REWARD_TICKS[rank];
}

/** Marks a fulfilled vow puts on the relationship of the connection it was sworn to, by the vow's rank. */
export const DEEPEN_MARKS = Object.freeze({ troublesome: 1, dangerous: 1, formidable: 2, extreme: 2, epic: 3 });

/** A sworn-to connection's relationship after its vow is fulfilled: the vow's marks, each at the connection's own rank. */
export function deepen(ticks, connectionRank, vowRank) {
  let out = ticks;
  for (let i = 0; i < DEEPEN_MARKS[vowRank]; i++) out = markProgress(out, connectionRank);
  return out;
}

/** A recommit: the lower challenge die's boxes cleared, the rank raised by one. */
export function recommit(ticks, rank, challenge) {
  return {
    ticks: Math.max(0, ticks - Math.min(...challenge) * TICKS_PER_BOX),
    rank:  rankAbove(rank),
  };
}
