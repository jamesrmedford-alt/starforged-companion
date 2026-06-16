/**
 * STARFORGED COMPANION
 * src/moves/resolver.js — Dice rolling, outcome calculation, consequence mapping
 *
 * Pure logic — no Foundry globals, no API calls.
 * All functions are exported and fully unit-testable with Jest.
 *
 * Responsibilities:
 * - Roll action die (d6) and challenge dice (2d10)
 * - Calculate action score (die + stat + adds, capped at 10)
 * - Determine outcome (strong hit / weak hit / miss) and match state
 * - Map move + outcome to specific mechanical consequences from move text
 * - Handle momentum burn
 * - Handle progress moves (no action die; tally filled boxes vs challenge dice)
 *
 * Source: Ironsworn: Starforged Reference Guide pp.8-25, Rules Summary pp.116-121
 */

import { MOVES } from "../schemas.js";
import { rollOracle, rollPaired } from "../oracles/roller.js";


// ─────────────────────────────────────────────────────────────────────────────
// DICE
// ─────────────────────────────────────────────────────────────────────────────

/** Roll a single die with the given number of faces. */
export function rollDie(faces) {
  return Math.floor(Math.random() * faces) + 1;
}

/** Roll the action die (d6). */
export function rollActionDie() {
  return rollDie(6);
}

/** Roll both challenge dice (2d10). Returns [d1, d2]. */
export function rollChallengeDice() {
  return [rollDie(10), rollDie(10)];
}

/**
 * Calculate the action score.
 * actionDie + statValue + adds, capped at 10.
 * Source: Reference Guide p.8
 */
export function calcActionScore(actionDie, statValue, adds = 0) {
  return Math.min(10, actionDie + statValue + adds);
}

/**
 * Determine the outcome of an action roll.
 * Score must beat (not equal) a challenge die to count as a hit.
 * Ties go to the challenge dice.
 * Source: Reference Guide p.8
 *
 * @param {number} actionScore
 * @param {[number, number]} challengeDice
 * @returns {{ outcome: string, isMatch: boolean }}
 */
export function calcOutcome(actionScore, challengeDice) {
  const [c1, c2] = challengeDice;
  const beatsFirst  = actionScore > c1;
  const beatsSecond = actionScore > c2;
  const isMatch     = c1 === c2;

  let outcome;
  if (beatsFirst && beatsSecond) {
    outcome = "strong_hit";
  } else if (beatsFirst || beatsSecond) {
    outcome = "weak_hit";
  } else {
    outcome = "miss";
  }

  return { outcome, isMatch };
}

/**
 * Build the human-readable outcome label for the chat card.
 * e.g. "Strong Hit", "Strong Hit with a Match", "Miss with a Match"
 */
export function buildOutcomeLabel(outcome, isMatch) {
  const labels = {
    strong_hit: "Strong Hit",
    weak_hit:   "Weak Hit",
    miss:       "Miss",
  };
  const base = labels[outcome] ?? outcome;
  return isMatch ? `${base} with a Match` : base;
}

/**
 * Determine the outcome of a progress move.
 * No action die — tally filled boxes as the progress score,
 * then compare against challenge dice.
 * Momentum does not apply to progress moves.
 * Source: Reference Guide p.8 / Rules Summary p.118
 *
 * @param {number} ticks  — total ticks on the progress track (0-40)
 * @param {[number, number]} challengeDice
 * @returns {{ progressScore: number, outcome: string, isMatch: boolean }}
 */
export function calcProgressOutcome(ticks, challengeDice) {
  const progressScore = Math.floor(ticks / 4);   // Only fully filled boxes count
  const { outcome, isMatch } = calcOutcome(progressScore, challengeDice);
  return { progressScore, outcome, isMatch };
}


// ─────────────────────────────────────────────────────────────────────────────
// MOMENTUM BURN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether burning momentum would improve the outcome.
 * Momentum burn is only valid if it changes miss → hit or weak → strong.
 * Cannot burn momentum on a progress move.
 * Source: Rules Summary p.117
 *
 * @param {number} currentMomentum
 * @param {string} currentOutcome   — "strong_hit" | "weak_hit" | "miss"
 * @param {[number, number]} challengeDice
 * @param {boolean} isProgressMove
 * @returns {boolean}
 */
export function canBurnMomentum(currentMomentum, currentOutcome, challengeDice, isProgressMove) {
  if (isProgressMove) return false;
  if (currentMomentum <= 0) return false;
  if (currentOutcome === "strong_hit") return false;  // Already optimal

  const { outcome: burnedOutcome } = calcOutcome(currentMomentum, challengeDice);
  // Only valid if it STRICTLY improves. A bare `!==` check would also offer a
  // burn that makes the outcome worse — e.g. action score 7 (weak hit) but
  // current momentum 6 burns down to a miss. Compare outcome rank instead.
  return OUTCOME_RANK[burnedOutcome] > OUTCOME_RANK[currentOutcome];
}

/**
 * Outcome severity ranking, worst → best. Used to decide whether a momentum
 * burn (or any re-resolution) is an improvement. miss < weak_hit < strong_hit.
 */
export const OUTCOME_RANK = {
  miss:       0,
  weak_hit:   1,
  strong_hit: 2,
};

/**
 * Apply momentum burn. Returns the new outcome after replacing action score
 * with current momentum, and the momentum reset value.
 *
 * Momentum reset:
 *   0 impacts → reset to +2
 *   1 impact  → reset to +1
 *   2+ impacts → reset to 0
 * Source: Rules Summary p.117, 120
 *
 * @param {number} momentum
 * @param {[number, number]} challengeDice
 * @param {number} markedImpactCount
 * @returns {{ outcome: string, isMatch: boolean, newMomentum: number }}
 */
export function applyMomentumBurn(momentum, challengeDice, markedImpactCount) {
  const { outcome, isMatch } = calcOutcome(momentum, challengeDice);
  const newMomentum = markedImpactCount >= 2 ? 0
                    : markedImpactCount === 1 ? 1
                    : 2;
  return { outcome, isMatch, newMomentum };
}

/**
 * Count marked impacts from a character's impacts object.
 * Vehicle troubles (battered, cursed) only count when aboard — caller's responsibility.
 */
export function countMarkedImpacts(impacts) {
  return Object.values(impacts).filter(Boolean).length;
}


// ─────────────────────────────────────────────────────────────────────────────
// CONSEQUENCE MAPPING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a move ID + outcome to its specific mechanical consequences.
 *
 * Returns a consequences object matching MoveResolutionSchema.consequences.
 * Where a move offers player choice (e.g. "take +2 momentum OR add +1 on next move"),
 * we return the first/default option and flag it as a choice in otherEffect.
 * The confirmation UI can present the choice before finalising.
 *
 * Source: Reference Guide pp.9-25 (each move's outcome text)
 */
export function mapConsequences(moveId, outcome, isMatch) {
  const handler = CONSEQUENCE_MAP[moveId];
  if (!handler) {
    // Unknown move — return empty consequences with a note for Loremaster
    return {
      ...emptyConsequences(),
      otherEffect: `Resolve ${moveId} consequences manually.`,
    };
  }
  return handler(outcome, isMatch);
}

/** Blank consequences object — used as base and for moves with no mechanical output. */
function emptyConsequences() {
  return {
    momentumChange:      0,
    healthChange:        0,
    spiritChange:        0,
    supplyChange:        0,
    progressMarked:      0,
    sufferMoveTriggered: null,
    // F16 §5.2: structured prompt that the SufferChoiceDialog renders
    // when the outcome requires a player choice (Shape B1 generic
    // suffer-pick or Shape B2 enumerated options). `null` means no
    // choice required. See docs/moves/suffer-routing-audit.md for the
    // per-move target shapes.
    sufferPrompt:        null,
    progressTrackId:     null,
    combatPosition:      null,
    // Exploration lifecycle: when true, the pipeline marks one rank-step on the
    // shared expedition progress track (resolve-or-create). See moves/expedition.js.
    expeditionProgress:  false,
    // { track: "discoveries"|"quests"|"bonds", ticks } — pipeline marks the
    // legacy track (Make a Discovery / Confront Chaos). null = none.
    legacyMark:          null,
    // { ranksDown } — pipeline completes the open expedition track and pays its
    // rank's legacy reward (Finish an Expedition). null = not a finish.
    finishExpedition:    null,
    // Combat lifecycle (audit 3.24–3.27): pipeline creates/reuses the combat track.
    enterCombat:           false,
    // Pipeline marks progress N times on the active combat track (Strike/Clash).
    combatProgress:        0,
    // true → pipeline completes the active combat track (Take Decisive Action hit, Face Defeat).
    endCombat:             false,
    // true → pipeline rolls decisive_action_cost d100 and posts a visible card (TDA weak hit).
    rollDecisiveActionCost: false,
    // true → pipeline rolls pay_the_price d100 and posts a visible card (Face Defeat).
    routePayThePrice:      false,
    otherEffect:         "",
  };
}

/**
 * Full consequence map keyed by move ID.
 * Each entry is a function(outcome, isMatch) → consequences object.
 *
 * Conventions:
 * - "Pay the Price" is represented as otherEffect — Phase E (F16) will annotate
 *   the PAY_THE_PRICE d100 entries with sufferRoute and dispatch from the
 *   `pay_the_price` resolver branch into the suffer executors.
 * - "Make a suffer move (-X)" → `sufferPrompt: { kind: "any", amount, count }`
 *   (Shape B1). Player picks any of the six suffer moves.
 * - "Choose: X or Y or …" → `sufferPrompt: { kind: "enumerated", options: [...],
 *   allowComplication? }` (Shape B2). Player picks from listed options.
 *   `sufferMoveTriggered` remains set in parallel as a deprecated back-compat
 *   field for one release; new code reads from `sufferPrompt`.
 * - Progress moves return progressMarked: 0 (progress is tracked separately per track)
 *
 * Audit: docs/moves/suffer-routing-audit.md tabulates every move + outcome
 * against the play kit's outcome text and the target shape below. When
 * editing this map, update the audit row first so the doc and code stay
 * in lockstep.
 */
const CONSEQUENCE_MAP = {

  // ── SESSION MOVES ──────────────────────────────────────────────────────────
  // Narrative only — no mechanical consequences

  begin_a_session: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    momentumChange: 1,   // All players take +1 momentum on the vignette option
    otherEffect: "Begin a Session: review flags, recap, set the scene. Optional vignette grants +1 momentum.",
  }),

  set_a_flag:      (_outcome, _isMatch) => ({ ...emptyConsequences(), otherEffect: "Flag set." }),
  change_your_fate:(_outcome, _isMatch) => ({ ...emptyConsequences(), otherEffect: "Fate changed." }),
  take_a_break:    (_outcome, _isMatch) => ({ ...emptyConsequences(), otherEffect: "Take a break." }),
  end_a_session:   (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    momentumChange: 1,   // +1 momentum if you note a focus for next session
    otherEffect: "End a Session: mark missed milestones, note focus for next session (+1 momentum).",
  }),


  // ── ADVENTURE MOVES ────────────────────────────────────────────────────────

  face_danger: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), momentumChange: 1 };
      case "weak_hit":   return {
        ...emptyConsequences(),
        // B1: generic "make a suffer move (-1)" — player picks which.
        sufferPrompt:        { kind: "any", amount: 1, count: 1 },
        sufferMoveTriggered: { move: "suffer", amount: 1 },  // deprecated alias
        otherEffect: "Success with a cost. Make a suffer move (-1).",
      };
      case "miss": return {
        ...emptyConsequences(),
        otherEffect: "Fail or momentary success undermined. Pay the Price.",
      };
    }
  },

  secure_an_advantage: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return {
        ...emptyConsequences(),
        momentumChange: 2,
        otherEffect: "Strong hit: take both — +2 momentum AND +1 on next move (not a progress move).",
      };
      case "weak_hit": return {
        ...emptyConsequences(),
        // B2: enumerated. Default option is +2 momentum so the existing
        // delta-based test fixtures keep their pre-F16 shape; the dialog
        // surfaces the alternative.
        momentumChange: 2,
        sufferPrompt: { kind: "enumerated", options: [
          { label: "+2 momentum",                momentum:   2 },
          { label: "+1 on your next move",       nextBonus:  1 },
        ]},
        otherEffect: "Weak hit: choose one — +2 momentum OR +1 on next move (not a progress move).",
      };
      case "miss": return {
        ...emptyConsequences(),
        otherEffect: "Fail or assumptions betray you. Pay the Price.",
      };
    }
  },

  gather_information: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), momentumChange: 2,
        otherEffect: "Path or action to make progress is clear. Take +2 momentum." };
      case "weak_hit":   return { ...emptyConsequences(), momentumChange: 1,
        otherEffect: "New insight but also complicates quest. Take +1 momentum." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Dire threat or unwelcome truth uncovered. Pay the Price." };
    }
  },

  compel: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), momentumChange: 1,
        otherEffect: "They do what you want. Take +1 momentum." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Agreement comes with a demand or complication. Envision their counteroffer." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "They refuse or make a demand that costs you greatly. Pay the Price." };
    }
  },

  aid_your_ally: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    otherEffect: "Secure an Advantage or Gain Ground — ally takes the benefits on a hit.",
  }),

  check_your_gear: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), momentumChange: 1,
        otherEffect: "You have it and are ready to act. Take +1 momentum." };
      case "weak_hit": return {
        ...emptyConsequences(),
        // B2: explicit two-option pick.
        sufferPrompt: { kind: "enumerated", options: [
          { label: "Sacrifice Resources (-1)", suffer: "sacrifice_resources", amount: 1 },
          { label: "Lose Momentum (-2)",       suffer: "lose_momentum",       amount: 2 },
        ]},
        otherEffect: "You have it, but choose one: Sacrifice Resources (-1) OR Lose Momentum (-2)."
      };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "You don't have it and situation grows more perilous. Pay the Price." };
    }
  },


  // ── QUEST MOVES ────────────────────────────────────────────────────────────

  swear_an_iron_vow: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), momentumChange: 2,
        otherEffect: "Emboldened — clear next step. Take +2 momentum." };
      case "weak_hit": return { ...emptyConsequences(), momentumChange: 1,
        otherEffect: "Determined but uncertain. Take +1 momentum, envision how you find a path forward." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Significant obstacle stands in your way before the quest begins. Envision it." };
    }
  },

  reach_a_milestone: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    progressMarked: 1,   // One mark; persistence layer multiplies by track's ticksPerMark
    otherEffect: "Mark progress on your vow per its rank.",
  }),

  fulfill_your_vow: (outcome, _isMatch) => {
    // Progress move — legacy reward ticks depend on vow rank, applied by caller
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Vow fulfilled. Mark legacy reward on quests track per vow rank." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Fulfilled, but more remains or truth revealed. Mark legacy reward (or vow at full reward if you Swear an Iron Vow to set it right)." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Vow undone by complication. Choose: Forsake Your Vow OR recommit (clear progress per challenge dice, raise rank by one)." };
    }
  },

  forsake_your_vow: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    // B2: one-or-more costs. The dialog presents these as a multi-select;
    // suffer-routed options apply via the executor, the non-suffer ones
    // (test relationship, asset discard, narrative cost) post a card and
    // hand off to the GM.
    sufferPrompt: { kind: "enumerated", multi: true, options: [
      { label: "Endure Stress (-2)",          suffer: "endure_stress", amount: 2 },
      { label: "Test Your Relationship",      route:  "test_your_relationship" },
      { label: "Discard an asset",            route:  "asset_discard" },
      { label: "Narrative cost",              complication: true },
    ]},
    otherEffect: "Vow cleared. Envision the impact and choose one or more costs: Endure Stress, Test Your Relationship, discard an asset, or narrative costs.",
  }),


  // ── CONNECTION MOVES ───────────────────────────────────────────────────────

  make_a_connection: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Connection made. Give them a role and rank." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Connection made, but with a complication or cost. Envision what they reveal or demand." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "No connection made and situation worsens. Pay the Price." };
    }
  },

  develop_your_relationship: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    progressMarked: 1,   // One mark; persistence multiplies by track's ticksPerMark
    otherEffect: "Mark progress on connection track per connection rank.",
  }),

  test_your_relationship: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Develop Your Relationship." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Develop Your Relationship, but with a demand or complication as fallout." };
      case "miss": return {
        ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: [
          { label: "Lose the connection (Pay the Price)", route: "pay_the_price" },
          { label: "Swear an Iron Vow (formidable+)",     route: "swear_an_iron_vow", rank: "formidable" },
        ]},
        otherEffect: "Choose: lose the connection (Pay the Price) OR prove loyalty (Swear an Iron Vow, formidable or greater)."
      };
    }
  },

  forge_a_bond: (outcome, _isMatch) => {
    // Progress move
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Bond forged. Mark legacy reward on bonds track per connection rank. Choose: Bolster Influence (add +2) OR Expand Influence (second role, add +1)." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Bond forged, but they ask something more first. Envision the request and do it (or Swear an Iron Vow)." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Conflicting motivation revealed. Recommit: roll challenge dice, clear lowest value in progress boxes, raise rank by one." };
    }
  },


  // ── EXPLORATION MOVES ──────────────────────────────────────────────────────

  undertake_an_expedition: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), expeditionProgress: true,
        otherEffect: "Reach a waypoint. Mark progress per expedition rank." };
      case "weak_hit": return {
        ...emptyConsequences(),
        expeditionProgress: true,
        sufferPrompt: { kind: "enumerated", options: [
          { label: "One suffer move (-2)",        kind: "any", amount: 2, count: 1 },
          { label: "Two suffer moves (-1 each)",  kind: "any", amount: 1, count: 2 },
          { label: "Peril at the waypoint",       complication: true, scope: "waypoint" },
        ]},
        otherEffect: "Reach waypoint but at cost. Mark progress per rank. Choose: suffer move (-2) or two suffer moves (-1), OR face a peril at the waypoint."
      };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Waylaid by crisis or immediate hardship at waypoint. No progress. Pay the Price." };
    }
  },

  explore_a_waypoint: (outcome, isMatch) => {
    switch (outcome) {
      // Strong hit: player chooses expedition progress OR +2 momentum.
      // The dialog surfaces this as a B2 single-pick; the "expedition-progress"
      // option kind marks the active expedition track from inside the dialog runner.
      case "strong_hit": return {
        ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", multi: 1, options: [
          { label: "Mark expedition progress", expeditionProgress: 1 },
          { label: "+2 momentum",              momentum: 2 },
        ]},
        otherEffect: isMatch
          ? "Strong hit with a match — choose: mark expedition progress OR take +2 momentum. With the match you may instead Make a Discovery."
          : "Strong hit — choose: mark expedition progress OR take +2 momentum." };
      case "weak_hit": return { ...emptyConsequences(), momentumChange: 1,
        otherEffect: "Interesting find bound up in peril or ominous aspect. Take +1 momentum." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: isMatch
          ? "Miss with a match — may Confront Chaos instead. Otherwise: immediate hardship or threat. Pay the Price."
          : "Immediate hardship or threat. Pay the Price." };
    }
  },

  finish_an_expedition: (outcome, _isMatch) => {
    // Progress move. Strong/weak complete the open expedition track and pay its
    // legacy reward (weak = one rank lower) via the pipeline finishExpedition
    // handler; a miss leaves the track open (abandon or recommit — GM-adjudicated).
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), finishExpedition: { ranksDown: 0 },
        otherEffect: "Expedition complete. Mark legacy reward on discoveries track per rank." };
      case "weak_hit": return { ...emptyConsequences(), finishExpedition: { ranksDown: 1 },
        otherEffect: "Complete but with unforeseen complication. Legacy reward one rank lower (none for troublesome). Envision what you encounter." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Destination lost or true cost revealed. Choose: abandon (Pay the Price) OR return (roll challenge dice, clear lowest in progress boxes, raise rank by one)." };
    }
  },

  set_a_course: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), momentumChange: 1,
        otherEffect: "Arrived, situation favors you. Take +1 momentum." };
      case "weak_hit": return {
        ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: [
          { label: "One suffer move (-2)",          kind: "any", amount: 2, count: 1 },
          { label: "Two suffer moves (-1 each)",    kind: "any", amount: 1, count: 2 },
          { label: "Complication at destination",   complication: true, scope: "destination" },
        ]},
        otherEffect: "Arrived but with cost or complication. Choose: suffer move (-2) or two suffer moves (-1), OR face complication at destination."
      };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Waylaid by significant threat. Pay the Price. If overcome, may push on safely." };
    }
  },

  make_a_discovery: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    legacyMark: { track: "discoveries", ticks: 2 },
    otherEffect: "Mark 2 ticks on discoveries legacy track. Roll or choose a discovery from the table.",
  }),

  confront_chaos: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    // 1 tick for the minimum (one aspect); mark again for each further aspect
    // confronted — the per-aspect count is the player's call, surfaced in text.
    legacyMark: { track: "discoveries", ticks: 1 },
    otherEffect: "Decide aspects (1-3). Roll or choose on Confront Chaos table. Mark 1 tick on discoveries per aspect confronted.",
  }),


  // ── COMBAT MOVES ───────────────────────────────────────────────────────────

  enter_the_fray: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), enterCombat: true, momentumChange: 2, combatPosition: "in_control",
        otherEffect: "Strong hit: take both — +2 momentum AND you are in control." };
      case "weak_hit": return {
        ...emptyConsequences(),
        enterCombat: true,
        // B2: choose one — +2 momentum OR in control. No pre-set position.
        sufferPrompt: { kind: "enumerated", options: [
          { label: "+2 momentum",        momentum: 2 },
          { label: "You are in control", combatPosition: "in_control" },
        ]},
        otherEffect: "Weak hit: choose one — +2 momentum OR you are in control."
      };
      case "miss": return { ...emptyConsequences(), enterCombat: true, combatPosition: "bad_spot",
        otherEffect: "Fight begins with you in a bad spot." };
    }
  },

  gain_ground: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return {
        ...emptyConsequences(),
        combatPosition: "in_control",
        // B2 multi: choose two of three. The dialog marks combat progress,
        // applies the momentum delta, or posts a next-bonus reminder.
        sufferPrompt: { kind: "enumerated", multi: 2, options: [
          { label: "Mark progress",        combatProgress: 1 },
          { label: "+2 momentum",          momentum:       2 },
          { label: "+1 on your next move", nextBonus:      1 },
        ]},
        otherEffect: "In control. Strong hit: choose two — mark progress / +2 momentum / +1 on next move."
      };
      case "weak_hit": return {
        ...emptyConsequences(),
        combatPosition: "in_control",
        sufferPrompt: { kind: "enumerated", multi: 1, options: [
          { label: "Mark progress",        combatProgress: 1 },
          { label: "+2 momentum",          momentum:       2 },
          { label: "+1 on your next move", nextBonus:      1 },
        ]},
        otherEffect: "In control. Weak hit: choose one — mark progress / +2 momentum / +1 on next move."
      };
      case "miss": return { ...emptyConsequences(), combatPosition: "bad_spot",
        otherEffect: "Foe gains upper hand. You are in a bad spot. Pay the Price." };
    }
  },

  strike: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), combatProgress: 2, combatPosition: "in_control",
        otherEffect: "Mark progress twice. Dominate foe, stay in control." };
      case "weak_hit": return { ...emptyConsequences(), combatProgress: 2, combatPosition: "bad_spot",
        otherEffect: "Mark progress twice, but expose yourself to danger. You are in a bad spot." };
      case "miss": return { ...emptyConsequences(), combatPosition: "bad_spot",
        otherEffect: "Fight turns against you. You are in a bad spot. Pay the Price." };
    }
  },

  clash: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), combatProgress: 2, combatPosition: "in_control",
        otherEffect: "Mark progress twice. Overwhelm foe, you are in control." };
      case "weak_hit": return { ...emptyConsequences(), combatProgress: 1, combatPosition: "bad_spot",
        otherEffect: "Mark progress, but dealt a counterblow. Stay in a bad spot. Pay the Price." };
      case "miss": return { ...emptyConsequences(), combatPosition: "bad_spot",
        otherEffect: "Foe dominates. Stay in a bad spot. Pay the Price." };
    }
  },

  react_under_fire: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), momentumChange: 1, combatPosition: "in_control",
        otherEffect: "Succeed and are in control. Take +1 momentum." };
      case "weak_hit": return {
        ...emptyConsequences(),
        // B1: generic "suffer move (-1)" pick.
        sufferPrompt:        { kind: "any", amount: 1, count: 1 },
        sufferMoveTriggered: { move: "suffer", amount: 1 },  // deprecated alias
        combatPosition: "bad_spot",
        otherEffect: "Avoid worst danger but not without cost. Suffer move (-1). Stay in a bad spot."
      };
      case "miss": return { ...emptyConsequences(), combatPosition: "bad_spot",
        otherEffect: "Situation worsens. Stay in a bad spot. Pay the Price." };
    }
  },

  take_decisive_action: (outcome, _isMatch) => {
    // Progress move — per play kit, "if in a bad spot, count a strong hit
    // without a match as a weak hit, and a weak hit as a miss." That
    // downgrade is applied by the caller (resolveMove) when the bound
    // combat track's controlState is "bad_spot"; this handler maps the
    // post-downgrade outcome to consequences.
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), endCombat: true, momentumChange: 1,
        otherEffect: "Prevail. Take +1 momentum." };
      case "weak_hit": return { ...emptyConsequences(), endCombat: true, rollDecisiveActionCost: true,
        otherEffect: "Objective achieved but at cost. Roll on the weak hit table." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Defeated or objective lost. Pay the Price." };
    }
  },

  face_defeat: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    endCombat:        true,
    routePayThePrice: true,
    otherEffect: "Objective abandoned. Clear the combat objective and Pay the Price.",
  }),

  battle: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), momentumChange: 2,
        otherEffect: "Objective achieved unconditionally. You and allies may take +2 momentum." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Objective achieved but at cost. Pay the Price." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Defeated or objective lost. Pay the Price." };
    }
  },


  // ── SUFFER MOVES ───────────────────────────────────────────────────────────

  lose_momentum: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    otherEffect: "Suffer -1 (minor), -2 (serious), or -3 (major) momentum. Amount set by triggering move or situation.",
  }),

  endure_harm: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return {
        ...emptyConsequences(),
        // B2 — "shake it off" requires !wounded; the dialog filters.
        sufferPrompt: { kind: "enumerated", options: [
          { label: "+1 health (if not wounded)", health: 1, requires: "!wounded" },
          { label: "+1 momentum",                momentum: 1 },
        ]},
        otherEffect: "Choose: shake it off (if not wounded, +1 health) OR embrace the pain (+1 momentum)."
      };
      case "weak_hit": return {
        ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: [
          { label: "Lose Momentum (-1) for +1 health",
            chain: [{ suffer: "lose_momentum", amount: 1 }, { health: 1 }],
            requires: "!wounded" },
          { label: "Press on", noop: true },
        ]},
        otherEffect: "If not wounded, may Lose Momentum (-1) for +1 health. Otherwise press on."
      };
      case "miss": return {
        ...emptyConsequences(),
        // The miss-at-0-health → mortal wound d100 is executor-side (Phase C).
        sufferPrompt: { kind: "enumerated", options: [
          { label: "-1 health",          health:  -1 },
          { label: "Lose Momentum (-2)", suffer: "lose_momentum", amount: 2 },
        ]},
        otherEffect: "Worse than thought. Suffer -1 health or Lose Momentum (-2). If health 0, mark wounded or permanently harmed, or roll on the miss table."
      };
    }
  },

  endure_stress: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return {
        ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: [
          { label: "+1 spirit (if not shaken)", spirit: 1, requires: "!shaken" },
          { label: "+1 momentum",               momentum: 1 },
        ]},
        otherEffect: "Choose: shake it off (if not shaken, +1 spirit) OR embrace the darkness (+1 momentum)."
      };
      case "weak_hit": return {
        ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: [
          { label: "Lose Momentum (-1) for +1 spirit",
            chain: [{ suffer: "lose_momentum", amount: 1 }, { spirit: 1 }],
            requires: "!shaken" },
          { label: "Press on", noop: true },
        ]},
        otherEffect: "If not shaken, may Lose Momentum (-1) for +1 spirit. Otherwise press on."
      };
      case "miss": return {
        ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: [
          { label: "-1 spirit",          spirit:  -1 },
          { label: "Lose Momentum (-2)", suffer: "lose_momentum", amount: 2 },
        ]},
        otherEffect: "Worse than thought. Suffer -1 spirit or Lose Momentum (-2). If spirit 0, mark shaken or traumatized, or roll on the miss table."
      };
    }
  },

  withstand_damage: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return {
        ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: [
          { label: "+1 integrity (if not battered)", integrity: 1, requires: "!battered" },
          { label: "+1 momentum",                    momentum: 1 },
        ]},
        otherEffect: "Choose: bypass (if not battered, +1 integrity) OR ride it out (+1 momentum)."
      };
      case "weak_hit": return {
        ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: [
          { label: "Lose Momentum (-1) for +1 integrity",
            chain: [{ suffer: "lose_momentum", amount: 1 }, { integrity: 1 }],
            requires: "!battered" },
          { label: "Press on", noop: true },
        ]},
        otherEffect: "If not battered, may Lose Momentum (-1) for +1 integrity. Otherwise press on."
      };
      case "miss": return {
        ...emptyConsequences(),
        // Executor handles at-0 (vehicle-damage d100) and command-vehicle
        // destruction → Overcome Destruction prompt.
        sufferPrompt: { kind: "enumerated", options: [
          { label: "-1 integrity",       integrity: -1 },
          { label: "Lose Momentum (-2)", suffer: "lose_momentum", amount: 2 },
        ]},
        otherEffect: "Worse than thought. Suffer -1 integrity or Lose Momentum (-2). If integrity 0, suffer vehicle-type cost."
      };
    }
  },

  companion_takes_a_hit: (outcome, isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Companion rallies. Give them +1 health." };
      case "weak_hit": return {
        ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: [
          { label: "Lose Momentum (-1), companion +1 health",
            chain: [{ suffer: "lose_momentum", amount: 1 }, { companionHealth: 1 }],
            requires: "companionHealth>0" },
          { label: "Press on", noop: true },
        ]},
        otherEffect: "If companion health not 0, may Lose Momentum (-1) and give +1 health. Otherwise press on."
      };
      case "miss": return {
        ...emptyConsequences(),
        // Executor handles at-0 + match → companion destroyed (Q2: prompt,
        // not auto-discard).
        sufferPrompt: { kind: "enumerated", options: [
          { label: "-1 companion health", companionHealth: -1 },
          { label: "Lose Momentum (-2)",  suffer: "lose_momentum", amount: 2 },
        ]},
        otherEffect: isMatch
          ? "Miss with a match — companion is dead or destroyed. Discard the asset."
          : "Worse than thought. Companion suffers -1 health or you Lose Momentum (-2). If health 0, out of action until aided."
      };
    }
  },

  sacrifice_resources: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    otherEffect: "Suffer -1 (minor), -2 (serious), or -3 (major) supply. If reduced to 0, mark unprepared.",
  }),


  // ── RECOVER MOVES ──────────────────────────────────────────────────────────

  sojourn: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Safe refuge. You and allies each choose two recover moves (Heal/Hearten/Repair/Resupply) as automatic strong hits." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Time short or resources strained. Each make one recover move instead of two (max three total)." };
      case "miss": return {
        ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: [
          { label: "Community needs help (Swear an Iron Vow)", route: "swear_an_iron_vow" },
          { label: "No relief — Pay the Price",                route: "pay_the_price" },
        ]},
        otherEffect: "Choose: community needs help (do it or Swear an Iron Vow → resolves as strong hit) OR no relief and situation worsens (Pay the Price)."
      };
    }
  },

  heal: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "If wounded, clear impact and take/give +2 health. Otherwise take/give +3 health." };
      case "weak_hit": return {
        ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: [
          { label: "Lose Momentum (-2)",       suffer: "lose_momentum",       amount: 2 },
          { label: "Sacrifice Resources (-2)", suffer: "sacrifice_resources", amount: 2 },
        ]},
        otherEffect: "Recovery costs extra time or resources. Choose: Lose Momentum (-2) OR Sacrifice Resources (-2)."
      };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Aid ineffective and situation worsens. Pay the Price." };
    }
  },

  hearten: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "If shaken, clear impact and take +1 spirit. Otherwise take +2 spirit. (+1 more if via Sojourn)." };
      case "weak_hit": return { ...emptyConsequences(), momentumChange: -1,
        otherEffect: "As strong hit but fleeting — envision interruption or complication. Lose Momentum (-1)." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "No comfort and situation worsens. Pay the Price." };
    }
  },

  resupply: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Choose: if unprepared clear impact and +1 supply, otherwise +2 supply; OR acquire specific item and +1 momentum." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "As strong hit but deal with cost/complication/demand first. Envision the obstacle." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Unexpected peril. Pay the Price." };
    }
  },

  repair: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Gain repair points: facility 5, field 3, under fire 2. Spend: clear battered (2), fix module (2), +1 integrity (1), +1 companion health (1), repair device (3)." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Gain repair points: facility 3, field 1, under fire 0. Same spend options." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Repairs not made and situation worsens. Pay the Price." };
    }
  },


  // ── THRESHOLD MOVES ────────────────────────────────────────────────────────

  face_death: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Cast back into the mortal world." };
      case "weak_hit": return {
        ...emptyConsequences(),
        // PC death is permanent — Q2-family prompt, not auto-execute.
        sufferPrompt: { kind: "enumerated", options: [
          { label: "Noble sacrifice (PC dies)",                  route: "character_death" },
          { label: "Swear extreme vow + mark doomed",
            chain: [{ route: "swear_an_iron_vow", rank: "extreme" }, { mark: "doomed" }] },
        ]},
        otherEffect: "Choose: noble sacrifice (envision final moments) OR Swear an Iron Vow (extreme quest), return and mark doomed."
      };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "You are dead." };
    }
  },

  face_desolation: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Resist and press on." };
      case "weak_hit": return {
        ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: [
          { label: "Spirit breaks (noble sacrifice)",            route: "character_breaks" },
          { label: "Swear extreme vow + mark tormented",
            chain: [{ route: "swear_an_iron_vow", rank: "extreme" }, { mark: "tormented" }] },
        ]},
        otherEffect: "Choose: spirit breaks (noble sacrifice, envision final moments) OR vision of dire future (Swear an Iron Vow extreme quest, return and mark tormented)."
      };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Succumb to despair or horror — lost." };
    }
  },

  overcome_destruction: (outcome, _isMatch) => {
    // Progress move — rolls against bonds legacy track
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Call in a favor — no conditions. Take experience for marked abilities on discarded assets (min 3). Spend only on new command vehicle/modules/support vehicles." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Mark indebted and Swear an Iron Vow (extreme quest) in their service. Same experience grant." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "As weak hit, but quest is against your nature or in service of an enemy. Same experience grant." };
    }
  },


  // ── LEGACY MOVES ───────────────────────────────────────────────────────────

  earn_experience: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    otherEffect: "Take 2 experience per newly filled legacy box (1 per box if track was previously cleared).",
  }),

  advance: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    otherEffect: "Spend 3 experience for a new asset, or 2 experience to upgrade an existing asset.",
  }),

  continue_a_legacy: (outcome, _isMatch) => {
    // Progress move — rolled against each legacy track separately
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Strong hit per legacy track: choose — follow their path / share a connection / accept an inheritance." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Weak hit per legacy track: choose — see it through / rebuild a connection / explore familiar ground." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Miss per legacy track: choose — deal with aftermath / switch loyalties / open Pandora's box." };
    }
  },


  // ── FATE MOVES ─────────────────────────────────────────────────────────────

  ask_the_oracle: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    otherEffect: "Draw conclusion / spark idea / yes-no question / pick two. On match: extreme result or twist.",
  }),

  pay_the_price: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    otherEffect: "Make the most obvious negative outcome happen, Ask the Oracle, or roll on the Pay the Price table.",
  }),
};


// ─────────────────────────────────────────────────────────────────────────────
// MAIN RESOLVE FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a confirmed move interpretation into a full MoveResolution record.
 *
 * @param {Object} interpretation  — from moves/interpreter.js
 * @param {Object} campaignState   — current CampaignStateSchema
 * @returns {Object}               — MoveResolutionSchema (minus _id/timestamp, set by caller)
 */
export function resolveMove(interpretation, campaignState, options = {}) {
  const {
    moveId,
    moveName,
    statUsed,
    statValue,
    adds = 0,
    rationale,
    mischiefApplied,
    mischiefLevel,
    playerNarration,
    inputMethod = "chat",
  } = interpretation;

  const moveData = MOVES[moveId];
  if (!moveData) throw new Error(`Unknown move: ${moveId}`);

  const isProgressMove = moveData.progressMove === true;

  let actionDie    = 0;
  let actionScore  = 0;
  let progressScore = 0;
  const challengeDice = rollChallengeDice();
  let outcome, isMatch;

  if (isProgressMove) {
    // Progress move: tally filled boxes from the relevant progress track
    // statValue is repurposed here to carry the progress ticks from interpretation
    const ticks = statValue;
    ({ progressScore, outcome, isMatch } = calcProgressOutcome(ticks, challengeDice));
  } else {
    actionDie   = rollActionDie();
    actionScore = calcActionScore(actionDie, statValue, adds);
    ({ outcome, isMatch } = calcOutcome(actionScore, challengeDice));
  }

  // Take Decisive Action — play kit p. 5: "If you are in control, check the
  // result as normal. If you are in a bad spot, count a strong hit without
  // a match as a weak hit, and a weak hit as a miss." The caller is
  // responsible for passing the bound combat track's combatState in
  // options.combatPosition (typically resolved via
  // getActiveCombatPosition() from the progress-tracks panel).
  let downgradeApplied = null;
  if (moveId === "take_decisive_action" && options.combatPosition === "bad_spot") {
    if (outcome === "strong_hit" && !isMatch) {
      outcome = "weak_hit";
      downgradeApplied = "strong_hit→weak_hit";
    } else if (outcome === "weak_hit") {
      outcome = "miss";
      downgradeApplied = "weak_hit→miss";
    }
  }

  const outcomeLabel   = buildOutcomeLabel(outcome, isMatch);
  const consequences   = mapConsequences(moveId, outcome, isMatch);
  if (downgradeApplied) {
    consequences.otherEffect = `In a bad spot — outcome downgraded (${downgradeApplied}). ${consequences.otherEffect ?? ""}`.trim();
  }
  const loremasterContext = buildLoremasterContext({
    moveName, statUsed, statValue, adds,
    actionDie, actionScore, challengeDice,
    outcome, outcomeLabel, isMatch,
    isProgressMove, progressScore,
    consequences,
  });

  // Oracle seeding (narrator-entity-discovery scope §7) — runs after the
  // outcome is known so we can condition on hit-with-match etc. Only the
  // configured moves produce seeds; everything else gets null.
  const oracleSeeds = buildOracleSeeds(moveId, outcome, isMatch);

  return {
    playerNarration,
    inputMethod,
    mischiefLevel,
    moveId,
    moveName,
    statUsed,
    statValue,
    adds,
    rationale,
    mischiefApplied,
    playerConfirmed: true,
    actionDie,
    actionScore,
    challengeDice,
    isMatch,
    momentumBurned: false,
    momentumBurnedFrom: 0,
    outcome,
    outcomeLabel,
    isProgressMove,
    progressScore,
    consequences,
    oracleSeeds,
    loremasterContext,
    sessionId: campaignState.currentSessionId ?? "",
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// ORACLE SEEDING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build oracle seeds for the narrator prompt for moves where the rulebook
 * recommends rolling on oracle tables to inform the scene.
 *
 * Per scope §7 — applicable moves:
 *   make_a_connection      → role + goal + first look + given name
 *   explore_a_waypoint     → action + theme (only on strong hit with match)
 *   make_a_discovery       → descriptor + focus
 *   confront_chaos         → action + theme
 *   ask_the_oracle         → action + theme (default fallback)
 *
 * Returns null for moves that don't seed.
 *
 * @param {string} moveId
 * @param {string} outcome
 * @param {boolean} isMatch
 * @returns {Object|null}
 */
// Moves whose miss outcome triggers a Pay the Price prompt per the play kit.
// Listed by moveId so the resolver can auto-roll the d100 table and surface
// it as an advisory seed on the move card.
const PAY_THE_PRICE_ON_MISS = new Set([
  "face_danger", "secure_an_advantage", "gather_information", "compel",
  "check_your_gear", "set_a_course", "gain_ground", "react_under_fire",
  "strike", "clash", "take_decisive_action", "battle", "hearten",
  "resupply", "repair", "heal", "sojourn", "make_a_connection",
  "explore_a_waypoint",
]);

export function buildOracleSeeds(moveId, outcome, isMatch) {
  try {
    const results = [];
    const names   = [];
    let context   = moveId;
    let connectionSeed = null;

    // ── PER-MOVE SEEDS ─────────────────────────────────────────────────────
    switch (moveId) {

      case "make_a_connection": {
        const role      = safeRoll("character_role");
        const goal      = safeRoll("character_goal");
        const firstLook = safeRoll("character_first_look");
        const given     = safeRoll("given_name");
        if (role)      results.push(`Character role: ${role}`);
        if (goal)      results.push(`Character goal: ${goal}`);
        if (firstLook) results.push(`Character first look: ${firstLook}`);
        if (given)     names.push(given);
        // connectionSeed carries the same rolls in structured form so the
        // auto-create path in routeEntityDrafts can populate the journal
        // fields (role, motivation, description) without re-rolling. Only
        // emit the structured seed if at least one field came back populated.
        if (role || goal || firstLook || given) {
          connectionSeed = { role, goal, firstLook, givenName: given };
        }
        break;
      }

      case "explore_a_waypoint": {
        // Per the Reference Guide: "If you roll a match on a strong hit,
        // envision a notable encounter or aspect of this place." Use Action +
        // Theme as the prompt, plus the play-kit Make a Discovery table.
        if (outcome === "strong_hit" && isMatch) {
          const pair = safeRollPaired("action", "theme");
          if (pair) results.push(`Notable aspect of this waypoint: ${pair}`);
          const disc = safeRoll("make_a_discovery");
          if (disc) results.push(`Make a Discovery: ${disc}`);
        }
        if (outcome === "miss" && isMatch) {
          const chaos = safeRoll("confront_chaos");
          if (chaos) results.push(`Confront Chaos: ${chaos}`);
        }
        break;
      }

      case "make_a_discovery": {
        const pair = safeRollPaired("descriptor", "focus");
        if (pair) results.push(`Discovery descriptor and focus: ${pair}`);
        const disc = safeRoll("make_a_discovery");
        if (disc) results.push(`Make a Discovery: ${disc}`);
        break;
      }

      case "confront_chaos": {
        const pair = safeRollPaired("action", "theme");
        if (pair) results.push(`Chaos prompt (action + theme): ${pair}`);
        const chaos = safeRoll("confront_chaos");
        if (chaos) results.push(`Confront Chaos: ${chaos}`);
        break;
      }

      case "ask_the_oracle": {
        // Default fallback — Action + Theme provides a flexible prompt that
        // suits free-form oracle questions.
        const pair = safeRollPaired("action", "theme");
        if (pair) results.push(`Oracle prompt (action + theme): ${pair}`);
        break;
      }

      case "begin_a_session": {
        // Optional spotlight vignette (play kit p. 1). Always rolled so the
        // GM/player can use it; +1 momentum applies if they opt in.
        const vignette = safeRoll("spotlight_vignette");
        if (vignette) results.push(`Spotlight vignette: ${vignette}`);
        break;
      }

      case "pay_the_price": {
        // Pay the Price as a deliberate fate move — always roll the d100 table.
        const ptp = safeRoll("pay_the_price");
        if (ptp) results.push(`Pay the Price: ${ptp}`);
        break;
      }

      case "take_decisive_action": {
        if (outcome === "weak_hit") {
          const cost = safeRoll("decisive_action_cost");
          if (cost) results.push(`Decisive-action cost: ${cost}`);
        }
        break;
      }

      case "face_defeat": {
        // Face Defeat always calls Pay the Price — seed the narrator with the roll
        // so it can ground the narration. A second visible card is also posted by
        // the pipeline (routePayThePrice: true → postFaceDefeatPayThePriceCard).
        const ptp = safeRoll("pay_the_price");
        if (ptp) results.push(`Pay the Price: ${ptp}`);
        break;
      }

      case "endure_harm": {
        if (outcome === "miss") {
          const wound = safeRoll("mortal_wound");
          if (wound) results.push(`Mortal wound (if health at 0): ${wound}`);
        }
        break;
      }

      case "endure_stress": {
        if (outcome === "miss") {
          const deso = safeRoll("desolation");
          if (deso) results.push(`Desolation (if spirit at 0): ${deso}`);
        }
        break;
      }

      case "withstand_damage": {
        if (outcome === "miss") {
          const dmg = safeRoll("vehicle_damage");
          if (dmg) results.push(`Vehicle damage (if integrity at 0): ${dmg}`);
        }
        break;
      }
    }

    // ── PAY THE PRICE ON MISS (advisory for any move whose miss text says so)
    if (outcome === "miss" && PAY_THE_PRICE_ON_MISS.has(moveId)) {
      const ptp = safeRoll("pay_the_price");
      if (ptp) results.push(`Pay the Price: ${ptp}`);
    }

    if (!results.length && !names.length && !connectionSeed) return null;

    return {
      results,
      names,
      context,
      ...(connectionSeed ? { connectionSeed } : {}),
    };
  } catch (err) {
    console.warn("starforged-companion | buildOracleSeeds failed:", err);
    return null;
  }
}

function safeRoll(tableId) {
  try {
    const r = rollOracle(tableId);
    return r?.result && r.result !== "—" ? r.result : null;
  } catch {
    return null;
  }
}

function safeRollPaired(t1, t2) {
  try {
    const r = rollPaired(t1, t2);
    return r?.combined ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the formatted string injected into the Loremaster context packet.
 * Gives Loremaster the full mechanical picture so narration is coherent.
 */
function buildLoremasterContext(r) {
  const diceStr = r.isProgressMove
    ? `Progress score: ${r.progressScore} vs Challenge: ${r.challengeDice[0]}, ${r.challengeDice[1]}`
    : `Action: ${r.actionDie} + ${r.statValue}${r.adds ? ` + ${r.adds}` : ""} = ${r.actionScore} vs Challenge: ${r.challengeDice[0]}, ${r.challengeDice[1]}`;

  const matchStr = r.isMatch ? " [MATCH]" : "";

  return [
    `[MOVE: ${r.moveName} +${r.statUsed}]`,
    `[ROLL: ${diceStr}]`,
    `[OUTCOME: ${r.outcomeLabel}${matchStr}]`,
    r.consequences.otherEffect ? `[CONSEQUENCE: ${r.consequences.otherEffect}]` : "",
  ].filter(Boolean).join(" ");
}
