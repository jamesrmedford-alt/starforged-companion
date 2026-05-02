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

import { MOVES, RANK_TICKS } from "../schemas.js";


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
  return burnedOutcome !== currentOutcome;             // Only valid if it actually improves
}

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
    progressTrackId:     null,
    otherEffect:         "",
  };
}

/**
 * Full consequence map keyed by move ID.
 * Each entry is a function(outcome, isMatch) → consequences object.
 *
 * Conventions:
 * - "Pay the Price" is represented as otherEffect — Loremaster resolves it narratively
 * - "Make a suffer move (-X)" is represented as sufferMoveTriggered with amount
 * - Player choices are collapsed to the most mechanically significant option
 *   and noted in otherEffect so the confirmation UI can present alternatives
 * - Progress moves return progressMarked: 0 (progress is tracked separately per track)
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
        sufferMoveTriggered: { move: "suffer", amount: 1 },
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
        momentumChange: 2,   // Default to momentum; player may choose +1 on next move instead
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
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "You have it, but choose one: Sacrifice Resources (-1) OR Lose Momentum (-2)." };
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
    progressMarked: 0,   // Ticks applied by caller based on vow rank — rank not known here
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
    progressMarked: 0,   // Ticks per connection rank — applied by caller
    otherEffect: "Mark progress on connection track per connection rank.",
  }),

  test_your_relationship: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Develop Your Relationship." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Develop Your Relationship, but with a demand or complication as fallout." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Choose: lose the connection (Pay the Price) OR prove loyalty (Swear an Iron Vow, formidable or greater)." };
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
      case "strong_hit": return { ...emptyConsequences(), progressMarked: 0,
        otherEffect: "Reach a waypoint. Mark progress per expedition rank." };
      case "weak_hit": return { ...emptyConsequences(), progressMarked: 0,
        otherEffect: "Reach waypoint but at cost. Mark progress per rank. Choose: suffer move (-2) or two suffer moves (-1), OR face a peril at the waypoint." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Waylaid by crisis or immediate hardship at waypoint. No progress. Pay the Price." };
    }
  },

  explore_a_waypoint: (outcome, isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        momentumChange: isMatch ? 0 : 2,
        otherEffect: isMatch
          ? "Strong hit with a match — may Make a Discovery instead of choosing. Otherwise: find opportunity (+2 momentum) OR gain progress on expedition."
          : "Choose: find opportunity (+2 momentum) OR gain progress on expedition per rank." };
      case "weak_hit": return { ...emptyConsequences(), momentumChange: 1,
        otherEffect: "Interesting find bound up in peril or ominous aspect. Take +1 momentum." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: isMatch
          ? "Miss with a match — may Confront Chaos instead. Otherwise: immediate hardship or threat. Pay the Price."
          : "Immediate hardship or threat. Pay the Price." };
    }
  },

  finish_an_expedition: (outcome, _isMatch) => {
    // Progress move
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Expedition complete. Mark legacy reward on discoveries track per rank." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Complete but with unforeseen complication. Legacy reward one rank lower (none for troublesome). Envision what you encounter." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Destination lost or true cost revealed. Choose: abandon (Pay the Price) OR return (roll challenge dice, clear lowest in progress boxes, raise rank by one)." };
    }
  },

  set_a_course: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), momentumChange: 1,
        otherEffect: "Arrived, situation favors you. Take +1 momentum." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Arrived but with cost or complication. Choose: suffer move (-2) or two suffer moves (-1), OR face complication at destination." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Waylaid by significant threat. Pay the Price. If overcome, may push on safely." };
    }
  },

  make_a_discovery: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    otherEffect: "Mark 2 ticks on discoveries legacy track. Roll or choose a discovery from the table.",
  }),

  confront_chaos: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    otherEffect: "Decide aspects (1-3). Roll or choose on Confront Chaos table. Mark 1 tick on discoveries per aspect confronted.",
  }),


  // ── COMBAT MOVES ───────────────────────────────────────────────────────────

  enter_the_fray: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), momentumChange: 2,
        otherEffect: "Strong hit: take both — +2 momentum AND you are in control." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Weak hit: choose one — +2 momentum OR you are in control." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Fight begins with you in a bad spot." };
    }
  },

  gain_ground: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), momentumChange: 2, progressMarked: 0,
        otherEffect: "In control. Strong hit: choose two — mark progress / +2 momentum / +1 on next move." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "In control. Weak hit: choose one — mark progress / +2 momentum / +1 on next move." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Foe gains upper hand. You are in a bad spot. Pay the Price." };
    }
  },

  strike: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), progressMarked: 0,
        otherEffect: "Mark progress twice. Dominate foe, stay in control." };
      case "weak_hit": return { ...emptyConsequences(), progressMarked: 0,
        otherEffect: "Mark progress twice, but expose yourself to danger. You are in a bad spot." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Fight turns against you. You are in a bad spot. Pay the Price." };
    }
  },

  clash: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), progressMarked: 0,
        otherEffect: "Mark progress twice. Overwhelm foe, you are in control." };
      case "weak_hit": return { ...emptyConsequences(), progressMarked: 0,
        otherEffect: "Mark progress, but dealt a counterblow. Stay in a bad spot. Pay the Price." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Foe dominates. Stay in a bad spot. Pay the Price." };
    }
  },

  react_under_fire: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), momentumChange: 1,
        otherEffect: "Succeed and are in control. Take +1 momentum." };
      case "weak_hit": return { ...emptyConsequences(),
        sufferMoveTriggered: { move: "suffer", amount: 1 },
        otherEffect: "Avoid worst danger but not without cost. Suffer move (-1). Stay in a bad spot." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Situation worsens. Stay in a bad spot. Pay the Price." };
    }
  },

  take_decisive_action: (outcome, _isMatch) => {
    // Progress move — control state affects outcome interpretation (handled by caller)
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), momentumChange: 1,
        otherEffect: "Prevail. Take +1 momentum. If fight continues, you are in control." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Objective achieved but at cost. Roll or choose from weak hit table. If fight continues, you are in a bad spot." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Defeated or objective lost. Pay the Price." };
    }
  },

  face_defeat: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    otherEffect: "Objective abandoned or deprived. Clear objective and Pay the Price. Fight continues in a bad spot.",
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
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Choose: shake it off (if not wounded, +1 health) OR embrace the pain (+1 momentum)." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "If not wounded, may Lose Momentum (-1) for +1 health. Otherwise press on." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Worse than thought. Suffer -1 health or Lose Momentum (-2). If health 0, mark wounded or permanently harmed, or roll on the miss table." };
    }
  },

  endure_stress: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Choose: shake it off (if not shaken, +1 spirit) OR embrace the darkness (+1 momentum)." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "If not shaken, may Lose Momentum (-1) for +1 spirit. Otherwise press on." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Worse than thought. Suffer -1 spirit or Lose Momentum (-2). If spirit 0, mark shaken or traumatized, or roll on the miss table." };
    }
  },

  withstand_damage: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Choose: bypass (if not battered, +1 integrity) OR ride it out (+1 momentum)." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "If not battered, may Lose Momentum (-1) for +1 integrity. Otherwise press on." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Worse than thought. Suffer -1 integrity or Lose Momentum (-2). If integrity 0, suffer vehicle-type cost." };
    }
  },

  companion_takes_a_hit: (outcome, isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Companion rallies. Give them +1 health." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "If companion health not 0, may Lose Momentum (-1) and give +1 health. Otherwise press on." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: isMatch
          ? "Miss with a match — companion is dead or destroyed. Discard the asset."
          : "Worse than thought. Companion suffers -1 health or you Lose Momentum (-2). If health 0, out of action until aided." };
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
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Choose: community needs help (do it or Swear an Iron Vow → resolves as strong hit) OR no relief and situation worsens (Pay the Price)." };
    }
  },

  heal: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "If wounded, clear impact and take/give +2 health. Otherwise take/give +3 health." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Recovery costs extra time or resources. Choose: Lose Momentum (-2) OR Sacrifice Resources (-2)." };
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
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Choose: noble sacrifice (envision final moments) OR Swear an Iron Vow (extreme quest), return and mark doomed." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "You are dead." };
    }
  },

  face_desolation: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Resist and press on." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Choose: spirit breaks (noble sacrifice, envision final moments) OR vision of dire future (Swear an Iron Vow extreme quest, return and mark tormented)." };
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
export function resolveMove(interpretation, campaignState) {
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

  const outcomeLabel   = buildOutcomeLabel(outcome, isMatch);
  const consequences   = mapConsequences(moveId, outcome, isMatch);
  const loremasterContext = buildLoremasterContext({
    moveName, statUsed, statValue, adds,
    actionDie, actionScore, challengeDice,
    outcome, outcomeLabel, isMatch,
    isProgressMove, progressScore,
    consequences,
  });

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
    loremasterContext,
    sessionId: campaignState.currentSessionId ?? "",
  };
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
