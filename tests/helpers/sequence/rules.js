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

// ── Play at a live table (issue #373: the long haul's mechanical checks) ────
//
// What test/ci/playwright/lib/mechanics.mjs holds a live run to, after every
// action. Transcribed, like everything above, from the game's text —
// docs/rules-reference/playkit-rules-and-coverage.md Part 1 — and importing
// nothing from src/:
//
//   - "Action roll — d6 (action die) + a stat + any 'add +X' bonuses, compared
//     against two d10 challenge dice. Final action score is capped at 10."
//   - "Match — both challenge dice show the same value."
//   - A negative momentum equal to the action die cancels the die (the
//     rulebook's "Suffering negative momentum": the die counts as 0).
//   - "Condition meters (0–5): health, spirit, supply." "Momentum (−6 to
//     +10)." "Max momentum starts at +10 and is reduced by 1 per marked
//     impact." "Momentum reset … 0 impacts → +2, 1 impact → +1, 2 or more
//     impacts → 0."
//   - "Burn momentum — on an action roll only … if your current momentum is
//     positive and higher than your action die, you may replace the action
//     die with your current momentum, then reset momentum": the burned score
//     is the momentum itself, held against the same challenge dice.
//   - Take Decisive Action: "If in bad spot, downgrade results one step" — a
//     strong hit without a match counts as a weak hit, a weak hit as a miss.
//   - "Earn Experience — +2 XP per legacy box filled (+1 once a track is
//     cleared)."
//   - Develop Your Relationship, bonded: "roll +their rank … On a strong hit,
//     mark 2 ticks on your bonds legacy track. … On a weak hit, take +2
//     momentum. On a miss, take no lasting benefit."
//   - The momentum a move's outcome gives, where the text gives one number
//     and no choice (the tables of §1.3): Gather Information "strong: +2
//     momentum • weak: +1 momentum"; Set a Course "strong: arrive, +1
//     momentum"; Enter the Fray "strong: +2 momentum and in control"; Take
//     Decisive Action "strong: prevail +1 momentum"; Face Danger, React Under
//     Fire and Check Your Gear "strong: +1 momentum"; Swear an Iron Vow
//     "strong: +2 momentum • weak: +1 momentum".
//   - Strike "strong: mark progress twice • weak: mark twice"; Clash "strong:
//     mark progress twice • weak: mark once".
//   - The suffer moves: Endure Harm "−1/−2/−3 health; at 0 also Lose Momentum
//     by the remainder", Endure Stress "symmetric … against spirit", Lose
//     Momentum, Sacrifice Resources "−1/−2/−3 supply".

export const METER_MIN = 0;
export const METER_MAX = 5;
export const MOMENTUM_MIN = -6;

/** A negative momentum equal to the action die cancels it. */
export const dieCancelled = (actionDie, momentum) => momentum < 0 && actionDie === -momentum;

/** A roll's score as its card shows it: the die (0 when cancelled) + the stat + the adds, never above 10. */
export function rolledScore({ actionDie, stat, adds = 0, cancelled = false }) {
  return actionScore(cancelled ? 0 : actionDie, stat + adds);
}

/** Max momentum and the reset value, by marked impacts. */
export const momentumMaxFor = (impacts) => MOMENTUM_MAX - impacts;
export const momentumResetFor = (impacts) => (impacts <= 0 ? MOMENTUM_START : impacts === 1 ? 1 : 0);

/** Whether burning momentum can be chosen at all: positive, and higher than the action die. */
export const canBurn = (momentum, actionDie) => momentum > 0 && momentum > actionDie;

/** The outcome a burn gives: the momentum as the score, against the dice that fell. */
export const burnedOutcome = (momentum, challenge) => outcomeOf(momentum, challenge);

/** Take Decisive Action in a bad spot: one step down — except a strong hit with a match. */
export function decisiveOutcome(outcome, { inBadSpot = false, match = false } = {}) {
  if (!inBadSpot) return outcome;
  if (outcome === "strong_hit") return match ? "strong_hit" : "weak_hit";
  return "miss";
}

/** Experience for legacy boxes filled: 2 a box, 1 once the track has been cleared. */
export const xpForBoxes = (boxes, cleared = false) => boxes * (cleared ? 1 : 2);

/** Legacy boxes filled by going from one tick count to another. */
export const boxesFilled = (before, after) => Math.max(0, Math.floor(after / TICKS_PER_BOX) - Math.floor(before / TICKS_PER_BOX));

/** A bonded Develop Your Relationship: what each outcome leaves. */
export const BONDED_DEVELOP = Object.freeze({
  strong_hit: Object.freeze({ bondsTicks: BONDED_DEVELOP_LEGACY_TICKS, momentum: 0 }),
  weak_hit:   Object.freeze({ bondsTicks: 0, momentum: BONDED_DEVELOP_MOMENTUM }),
  miss:       Object.freeze({ bondsTicks: 0, momentum: 0 }),
});

/** The momentum an outcome gives, for the moves whose text names one number and offers no choice. */
export const MOVE_MOMENTUM = Object.freeze({
  gather_information:   Object.freeze({ strong_hit: 2, weak_hit: 1 }),
  set_a_course:         Object.freeze({ strong_hit: 1 }),
  enter_the_fray:       Object.freeze({ strong_hit: 2 }),
  take_decisive_action: Object.freeze({ strong_hit: 1 }),
  face_danger:          Object.freeze({ strong_hit: 1 }),
  react_under_fire:     Object.freeze({ strong_hit: 1 }),
  check_your_gear:      Object.freeze({ strong_hit: 1 }),
  swear_an_iron_vow:    Object.freeze({ strong_hit: 2, weak_hit: 1 }),
  // "On a weak hit, you uncover something interesting … Then, take +1
  // momentum." A strong hit's momentum is a choice (WAYPOINT_CHOICE), so it
  // is not here.
  explore_a_waypoint:   Object.freeze({ weak_hit: 1 }),
});

/** Marks of progress on the fight's track, by move and outcome. */
export const FIGHT_MARKS = Object.freeze({
  strike: Object.freeze({ strong_hit: 2, weak_hit: 2, miss: 0 }),
  clash:  Object.freeze({ strong_hit: 2, weak_hit: 1, miss: 0 }),
});

/** The meter each suffer move takes from. */
export const SUFFER_METER = Object.freeze({
  endure_harm: "health", endure_stress: "spirit", lose_momentum: "momentum", sacrifice_resources: "supply",
});

/**
 * A meter after a cost: never below its floor. What the floor kept back is
 * the `remainder` — for health and spirit, lost from momentum instead.
 */
export function sufferCost(value, amount, floor = METER_MIN) {
  const after = Math.max(floor, value - amount);
  return { after, remainder: amount - (value - after) };
}

/** A meter after a gain: never above its ceiling. */
export const recover = (value, amount, ceiling = METER_MAX) => Math.min(ceiling, value + amount);

// ── An expedition (the long haul's exploration beat) ────────────────────────
//
// In the moves' own words, as the game system ships them (Starforged →
// Exploration), and docs/rules-reference/playkit-rules-and-coverage.md §1.3:
//
//   - Undertake an Expedition: "On a strong hit, you reach a waypoint.
//     Envision the location and mark progress per the rank of the expedition.
//     On a weak hit, as above, but this progress costs you. … On a miss, you
//     are waylaid by a crisis … Do not mark progress, and Pay the Price."
//   - Explore a Waypoint: "On a strong hit, choose one. … Find an
//     opportunity: … take +2 momentum. Gain progress: Mark progress on your
//     expedition, per its rank. On a weak hit, you uncover something
//     interesting, but it is bound up in a peril … Then, take +1 momentum. On
//     a miss, you encounter an immediate hardship or threat, and must Pay the
//     Price."
//   - Finish an Expedition: "roll the challenge dice and compare to your
//     progress. On a strong hit, … Mark a reward on your discoveries legacy
//     track per expedition's rank: troublesome=1 tick; dangerous=2 ticks;
//     formidable=1 box; extreme=2 boxes; epic=3 boxes. … On a weak hit, as
//     above, but … Make the legacy reward one rank lower". A miss completes
//     nothing: the expedition is abandoned or returned to.

/** Marks of progress Undertake an Expedition puts on the expedition, by outcome. */
export const EXPEDITION_MARKS = Object.freeze({ strong_hit: 1, weak_hit: 1, miss: 0 });

/** What a strong hit on Explore a Waypoint lets its roller choose between: one mark of progress, or this much momentum. */
export const WAYPOINT_CHOICE = Object.freeze({ marks: 1, momentum: 2 });

/** Discoveries legacy ticks for a finished expedition: its rank on a strong hit, one rank lower on a weak hit, none on a miss. */
export function expeditionReward(rank, outcome) {
  if (outcome === "strong_hit") return LEGACY_REWARD_TICKS[rank];
  if (outcome === "weak_hit") return LEGACY_REWARD_TICKS[rankBelow(rank)] ?? 0;
  return 0;
}

/** Whether a Finish an Expedition completes the expedition: any hit does, a miss leaves it open. */
export const expeditionFinished = (outcome) => outcome === "strong_hit" || outcome === "weak_hit";
