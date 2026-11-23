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
 *   - A connection already bonded — Develop Your Relationship's own text:
 *     "If you already share a bond with the connection, do not mark progress.
 *     Instead, roll +their rank to learn the impact on your legacy:
 *     troublesome=+1; dangerous=+2; formidable=+3; extreme=+4; epic=+5. On a
 *     strong hit, mark 2 ticks on your bonds legacy track. On a strong hit
 *     with a match, you may also envision how recent events bolstered your
 *     connection's standing and raise their rank by one (if not already
 *     epic). On a weak hit, take +2 momentum. On a miss, take no lasting
 *     benefit." The table raises the rank on a strong hit with a match
 *     (decisions.md → "Develop Your Relationship bond legacy": "a strong hit
 *     with a match raises the connection's rank by one").
 *     tests/unit/sequenceRules.test.js reads those sentences from the
 *     vendored move text and compares.
 *   - "Completing a quest to their benefit" is one of that move's triggers,
 *     so a vow fulfilled for a connection already bonded marks nothing on its
 *     track: the table offers that roll instead, once per vow (decisions.md →
 *     "A vow fulfilled for a bonded connection marks no progress: it offers
 *     the bonded roll").
 *   - An action roll: the action die plus what is added, against the two
 *     challenge dice; "the action score caps at 10", "ties go to the
 *     challenge dice", and two challenge dice showing one value are a match
 *     (docs/rules-reference/rulebook-summary.md). Momentum below zero
 *     cancels a matching action die; nothing here takes momentum below its
 *     starting +2, so the model has no need of it.
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

/** What a bonded Develop Your Relationship adds to its roll, by the connection's rank. */
export const BOND_ROLL_ADDS = Object.freeze({ troublesome: 1, dangerous: 2, formidable: 3, extreme: 4, epic: 5 });

/** What that roll pays: bonds legacy ticks on a strong hit, momentum on a weak hit. */
export const BONDED_DEVELOP_LEGACY_TICKS = 2;
export const BONDED_DEVELOP_MOMENTUM     = 2;

export const ACTION_SCORE_MAX = 10;

/** An action roll's score: the action die plus what is added, never above 10. */
export function actionScore(actionDie, adds) {
  return Math.min(ACTION_SCORE_MAX, actionDie + adds);
}

/** Both challenge dice show one value. */
export const isMatch = (challenge) => challenge[0] === challenge[1];

/**
 * A bonded Develop Your Relationship: roll +their rank. No progress is
 * marked whatever the dice say.
 *
 * @returns {{ outcome: "strong_hit"|"weak_hit"|"miss", bondsTicks: number, momentum: number, rank: string }}
 *   what it marks on the bonds legacy, the momentum its roller takes, and the connection's rank after it
 */
export function bondedDevelop(rank, actionDie, challenge) {
  const outcome = outcomeOf(actionScore(actionDie, BOND_ROLL_ADDS[rank]), challenge);
  return {
    outcome,
    bondsTicks: outcome === "strong_hit" ? BONDED_DEVELOP_LEGACY_TICKS : 0,
    momentum:   outcome === "weak_hit" ? BONDED_DEVELOP_MOMENTUM : 0,
    rank:       outcome === "strong_hit" && isMatch(challenge) ? rankAbove(rank) : rank,
  };
}

/** A recommit: the lower challenge die's boxes cleared, the rank raised by one. */
export function recommit(ticks, rank, challenge) {
  return {
    ticks: Math.max(0, ticks - Math.min(...challenge) * TICKS_PER_BOX),
    rank:  rankAbove(rank),
  };
}
