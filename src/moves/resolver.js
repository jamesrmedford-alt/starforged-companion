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

import { MOVES, moveRollKind } from "../schemas.js";
import { rollOracle, rollPaired } from "../oracles/roller.js";
import { BONDED_DEVELOP_OUTCOMES } from "./developRelationship.js";
import { statedPrice } from "./stakes.js";


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
 * Negative momentum cancels a matching action die: with momentum below zero,
 * an action die showing its absolute value counts 0, and the action score is
 * the stat plus adds. A burn never meets this (it needs positive momentum),
 * and a progress roll has no action die.
 * Source: Reference Guide p.8 / Rules Summary p.117
 *
 * @param {number} actionDie
 * @param {number|null|undefined} momentum — the roller's momentum when rolling
 * @returns {boolean}
 */
export function cancelsActionDie(actionDie, momentum) {
  const m = Number(momentum);
  return Number.isFinite(m) && m < 0 && actionDie === -m;
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
 * @param {{ weakHitAsMiss?: boolean }} [opts] — the roll took an add that
 *   counts a weak hit as a miss (resolveMove's `weakHitAsMiss`): a burn
 *   landing on a weak hit is a miss, no improvement
 *   (HOVERBIKE-WEAK-AS-MISS-UNAPPLIED)
 * @returns {boolean}
 */
export function canBurnMomentum(currentMomentum, currentOutcome, challengeDice, isProgressMove, { weakHitAsMiss = false } = {}) {
  if (isProgressMove) return false;
  if (currentMomentum <= 0) return false;
  if (currentOutcome === "strong_hit") return false;  // Already optimal

  const { outcome: landed } = calcOutcome(currentMomentum, challengeDice);
  const burnedOutcome = weakHitAsMiss && landed === "weak_hit" ? "miss" : landed;
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
/**
 * Aid Your Ally's consequences (issue #325 W17): Secure an Advantage's — Gain
 * Ground's in a fight — with a hit's benefits for the ally (`beneficiary:
 * "ally"`: the momentum, the next-move bonus and a choice card's benefits are
 * the ally's — index.js resolves the ally). In a fight, "If you Gain Ground
 * and score a strong hit, you are both in control. On a weak hit, your ally is
 * in control but you are in a bad spot" (`allyCombatPosition` beside the
 * roller's `combatPosition`). A miss is the move's own: Pay the Price.
 *
 * @param {string} outcome
 * @param {boolean} isMatch
 * @param {boolean} inFight
 * @returns {Object} consequences
 */
export function aidYourAllyConsequences(outcome, isMatch, inFight) {
  const base = mapConsequences(inFight ? "gain_ground" : "secure_an_advantage", outcome, isMatch);
  const via  = inFight ? "Gain Ground" : "Secure an Advantage";
  if (outcome !== "strong_hit" && outcome !== "weak_hit") {
    return { ...base, otherEffect: `Aid Your Ally (as ${via}): ${base.otherEffect ?? ""}`.trim() };
  }
  const out = { ...base, beneficiary: "ally" };
  let positions = "";
  if (inFight) {
    out.allyCombatPosition = "in_control";
    out.combatPosition     = outcome === "strong_hit" ? "in_control" : "bad_spot";
    positions = outcome === "strong_hit" ? " You are both in control." : " Your ally is in control; you are in a bad spot.";
  }
  out.otherEffect = `Aid Your Ally (as ${via}) — your ally, not you, takes the benefits: ${base.otherEffect ?? ""}${positions}`;
  return out;
}

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
    // F16 §5.2: structured prompt that the SufferChoiceDialog renders
    // when the outcome requires a player choice (Shape B1 generic
    // suffer-pick or Shape B2 enumerated options). `null` means no
    // choice required. See docs/moves/suffer-routing-audit.md for the
    // per-move target shapes.
    sufferPrompt:        null,
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
    // true → pipeline completes the scene challenge and retires its tension
    // clock (Finish the Scene — every outcome; issue #326 D6).
    finishScene:         false,
    // A scene-challenge move (Face Danger / Secure an Advantage within a scene
    // challenge — issue #338 D2): the pipeline marks the open challenge's
    // track `sceneProgress` times and fills `sceneSegments` of its tension
    // clock (index.js applyOutcomeEffects → sceneChallenge.scoreSceneChallenge).
    sceneProgress:       0,
    sceneSegments:       0,
    // Combat lifecycle (audit 3.24–3.27): pipeline creates/reuses the combat track.
    enterCombat:           false,
    // Pipeline marks progress N times on the active combat track (Strike/Clash).
    combatProgress:        0,
    // true → pipeline completes the active combat track (Take Decisive Action hit, Face Defeat).
    endCombat:             false,
    // true → pipeline rolls decisive_action_cost d100 and posts a visible card (TDA weak hit).
    rollDecisiveActionCost: false,
    // true → pipeline rolls pay_the_price d100 and posts a visible card (Face Defeat, Battle).
    routePayThePrice:      false,
    // true → pipeline resolves the target connection and marks connection progress
    // (un-bonded) or bonds legacy (bonded, §3.3.5). See developRelationship.js.
    developRelationship:   false,
    // { ranksDown } — pipeline closes the target vow track and marks the quests legacy
    // reward (Fulfill Your Vow). One rank lower on weak hit. null = not a fulfillment.
    fulfillVow:            null,
    // true → pipeline marks every copy of the target vow forsaken (completed +
    // forsaken flag), closes the journal twin, and flips a promised reward to
    // lost (Forsake Your Vow — outcome-independent; the move is no-roll).
    forsakeVow:            false,
    // true → pipeline calls forgeBond on the target connection, marks bonds legacy.
    forgeABond:            false,
    // true → pipeline resolves the active vow and marks progress on it per its
    // rank (Reach a Milestone — a no-roll move). See moves/milestone.js.
    reachMilestone:        false,
    // Pipeline applies this delta to companion health (Companion Takes a Hit strong hit).
    companionHealthChange: 0,
    // "+N on your next move (not a progress move)" for the roller — Secure an
    // Advantage's strong hit. The pipeline records it (grantNextMoveBonus) and
    // adds it to that character's next action roll (issue #322 V02). The weak
    // hit's and Gain Ground's are a choice card's `nextBonus` option.
    nextMoveBonus:         0,
    otherEffect:         "",
  };
}

// Recover moves: a weak hit is the strong hit's recovery plus a cost (play kit:
// Heal "as strong, Lose Momentum (-2) OR Sacrifice Resources (-2)", Hearten
// "as strong, Lose Momentum (-1)"). Each recovery is written once and both
// outcomes use it; a fresh copy per call, since a prompt is stored on its card.

/** Heal's recovery: clear wounded + 2 health, else 3 health. */
function healRecovery() {
  return [
    { label: "Clear wounded + take/give +2 health", chain: [{ clearImpact: "wounded" }, { health: 2 }], requires: "wounded" },
    { label: "Take/give +3 health",                 health: 3, requires: "!wounded" },
  ];
}

/** Hearten's recovery: clear shaken + 1 spirit, else 2 spirit. */
function heartenRecovery() {
  return [
    { label: "Clear shaken + take +1 spirit", chain: [{ clearImpact: "shaken" }, { spirit: 1 }], requires: "shaken" },
    { label: "Take +2 spirit",                spirit: 2, requires: "!shaken" },
  ];
}

/**
 * Compose a weak hit's choice: every recovery option followed by each cost, as
 * one chained option keeping the recovery's `requires`. With one cost the
 * options mirror the recovery's; with two, each recovery comes in both.
 *
 * @param {Object[]} recovery — enumerated options (healRecovery / heartenRecovery)
 * @param {Object[]} costs    — enumerated options, e.g. `{ label, suffer, amount }`
 * @returns {Object[]}
 */
function withCost(recovery, costs) {
  const steps = ({ label: _label, requires: _requires, ...write }) => write.chain ?? [write];
  return recovery.flatMap(r => costs.map(c => ({
    label: `${r.label}, then ${c.label}`,
    chain: [...steps(r), ...steps(c)],
    ...(r.requires ? { requires: r.requires } : {}),
  })));
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
 *   (The deprecated `sufferMoveTriggered` alias went with its last reader,
 *   persistResolution's impact step — issue #326 W58.)
 * - Progress marking is never a generic consequence field: each kind has its
 *   own pipeline flag (reachMilestone, combatProgress, expeditionProgress,
 *   legacyMark, developRelationship, …) applied in src/index.js.
 *
 * Audit: docs/moves/suffer-routing-audit.md tabulates every move + outcome
 * against the play kit's outcome text and the target shape below. When
 * editing this map, update the audit row first so the doc and code stay
 * in lockstep.
 */
// A bonded Develop Your Relationship's card line, by its roll's outcome
// (BONDED_DEVELOP_OUTCOMES). No outcome — the un-bonded development, no roll —
// takes the move's generic line.
const BONDED_DEVELOP_EFFECT_TEXT = {
  strong_hit: "Bonded: mark 2 ticks on your bonds legacy track — on a match, raise their rank by one.",
  weak_hit:   "Bonded: take +2 momentum.",
  miss:       "Bonded: take no lasting benefit.",
};

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
        otherEffect: "Success with a cost. Make a suffer move (-1).",
      };
      case "miss": return {
        ...emptyConsequences(),
        routePayThePrice: true,
        otherEffect: "Fail or momentary success undermined. Pay the Price.",
      };
    }
  },

  secure_an_advantage: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return {
        ...emptyConsequences(),
        momentumChange: 2,
        // "Take both": the +1 is added to the roller's next action roll — it
        // was card text alone (issue #322 V02).
        nextMoveBonus:  1,
        otherEffect: "Strong hit: take both — +2 momentum AND +1 on your next move (added to your next action roll; not a progress move).",
      };
      case "weak_hit": return {
        ...emptyConsequences(),
        // B2: enumerated — the choice carries the momentum. A direct
        // `momentumChange: 2` beside it (kept for old delta-based fixtures)
        // landed on the roll AND again on the "+2 momentum" pick, and stayed
        // under "+1 on your next move" — the strong hit's "both" either way
        // (SAA-WEAK-DOUBLE-MOMENTUM).
        sufferPrompt: { kind: "enumerated", options: [
          { label: "+2 momentum",                momentum:   2 },
          { label: "+1 on your next move",       nextBonus:  1 },
        ]},
        otherEffect: "Weak hit: choose one — +2 momentum OR +1 on next move (not a progress move).",
      };
      case "miss": return {
        ...emptyConsequences(),
        routePayThePrice: true,
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
      case "miss": return { ...emptyConsequences(), routePayThePrice: true,
        otherEffect: "Dire threat or unwelcome truth uncovered. Pay the Price." };
    }
  },

  compel: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), momentumChange: 1,
        otherEffect: "They do what you want. Take +1 momentum." };
      // "As above" — they agree and you take +1 momentum — "but their
      // agreement comes with a demand or complication" (issue #325 W17).
      case "weak_hit": return { ...emptyConsequences(), momentumChange: 1,
        otherEffect: "They agree, but with a demand or complication — envision their counteroffer. Take +1 momentum." };
      case "miss": return { ...emptyConsequences(), routePayThePrice: true,
        otherEffect: "They refuse or make a demand that costs you greatly. Pay the Price." };
    }
  },

  // "Secure an Advantage or Gain Ground to take action. If you score a hit,
  // they (instead of you) take the benefits of the move." Resolved as Secure
  // an Advantage — as Gain Ground in a fight (resolveMove's `inFight`) — its
  // hit's benefits marked for the ally (`beneficiary: "ally"`), its miss
  // routing Pay the Price. It returned the same text for every outcome: no
  // price on a miss, no benefit on a hit (issue #325 W17).
  aid_your_ally: (outcome, isMatch) => aidYourAllyConsequences(outcome, isMatch, false),

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
      case "miss": return { ...emptyConsequences(), routePayThePrice: true,
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
    // Pipeline (GM-gated) resolves the target vow and marks progress per its
    // rank (moves/milestone.js). Replaced the old dead `progressMarked: 1`
    // route (removed 2026-10 — nothing ever set its progressTrackId).
    reachMilestone: true,
    otherEffect: "Mark progress on your vow per its rank.",
  }),

  fulfill_your_vow: (outcome, _isMatch) => {
    // Progress move — legacy reward ticks depend on vow rank, applied by caller
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), fulfillVow: { ranksDown: 0 },
        otherEffect: "Vow fulfilled. Legacy reward marked on quests track per vow rank." };
      case "weak_hit": return { ...emptyConsequences(), fulfillVow: { ranksDown: 1 },
        otherEffect: "Fulfilled, but more remains or truth revealed. Legacy reward marked one rank lower (none for troublesome). Swear an Iron Vow (formidable+) to claim full reward instead." };
      case "miss": return { ...emptyConsequences(),
        otherEffect: "Vow undone by complication. Choose: Forsake Your Vow OR recommit (clear progress per challenge dice, raise rank by one)." };
    }
  },

  forsake_your_vow: (_outcome, _isMatch) => ({
    ...emptyConsequences(),
    // The pipeline actually clears the vow (VOW-FORSAKE-COSMETIC fix — the
    // costs used to be presented while the vow item/track stayed open).
    forsakeVow: true,
    // B2: one-or-more costs. The dialog presents these as a multi-select;
    // suffer-routed options apply via the executor, the non-suffer ones
    // (test relationship, asset discard, narrative cost) post a card and
    // hand off to the GM.
    sufferPrompt: { kind: "enumerated", multi: true, options: [
      // Endure Stress at the size the fiction gives it — the move's own
      // minor / serious / major, picked next (issue #330 D7; was a fixed -2).
      { label: "Endure Stress (-1, -2 or -3)", suffer: "endure_stress", amountPick: [1, 2, 3] },
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
      case "miss": return { ...emptyConsequences(), routePayThePrice: true,
        otherEffect: "No connection made and situation worsens. Pay the Price." };
    }
  },

  develop_your_relationship: (outcome, _isMatch) => ({
    ...emptyConsequences(),
    // Pipeline (GM-gated) resolves the target connection and applies either a
    // connection-track mark (un-bonded) or the bonded roll's legacy ticks and
    // rank raise (§3.3.5). See src/moves/developRelationship.js. Replaced the
    // old dead `progressMarked: 1` route (removed 2026-10).
    developRelationship: true,
    // Only the bonded development is rolled (+rank — un-bonded is no roll, so
    // its outcome is null): a weak hit's +2 momentum is that roll's own, applied
    // with the move's other meters to the roller (BONDED_DEVELOP_OUTCOMES,
    // shared with `!bond` — issue #322 V01: the pipeline paid 1 bonds tick).
    momentumChange: BONDED_DEVELOP_OUTCOMES[outcome]?.momentum ?? 0,
    otherEffect: BONDED_DEVELOP_EFFECT_TEXT[outcome]
      ?? "Develop the relationship: mark progress on your connection's relationship track (once bonded, roll +their rank instead).",
  }),

  test_your_relationship: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), developRelationship: true,
        otherEffect: "Develop Your Relationship." };
      case "weak_hit": return { ...emptyConsequences(), developRelationship: true,
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
    // Progress move. The bond forms on ANY hit (play kit: a weak hit forges
    // it too, once their request is met) — pre-fix the weak hit was text-only,
    // so `bonded` never flipped and no legacy marked (BOND-WEAK-FORGE).
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), forgeABond: true,
        otherEffect: "Bond forged. Legacy reward marked on bonds track. Choose: Bolster Influence (+2) OR Expand Influence (second role, +1)." };
      case "weak_hit": return { ...emptyConsequences(), forgeABond: true,
        otherEffect: "Bond forged — but they ask something more of you first. Envision the request and do it (or Swear an Iron Vow)." };
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
      case "miss": return { ...emptyConsequences(), routePayThePrice: true,
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
      // A miss pays the price, routed like every other "Pay the Price" miss —
      // the card, its suffer route, the tension clocks (issue #321 U17,
      // WAYPOINT-MISS-NO-PTP: it said so and routed nothing). With a match the
      // player may instead Confront Chaos (the card's button), so the price
      // is theirs to choose, not routed — as Finish an Expedition's miss
      // offers its recommit.
      case "miss": return { ...emptyConsequences(), routePayThePrice: !isMatch,
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

  // ── SCENE CHALLENGE MOVES ───────────────────────────────────────────────────
  // Face Danger and Secure an Advantage within a scene challenge (Starforged
  // pp. 239–241; vendored Starforged/Moves/Scene_Challenge — issue #338 D2):
  // scored against the open challenge, a hit's progress on its track
  // (`sceneProgress`) and a weak hit's or miss's segments on its 4-segment
  // tension clock (`sceneSegments`). A miss's Pay the Price leaves that clock
  // to the move's own segments (index.js skips it in the price's advance).

  face_danger_scene_challenge: (outcome, isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), sceneProgress: isMatch ? 2 : 1,
        otherEffect: isMatch
          ? "You are successful. With the match, mark progress twice on the scene challenge."
          : "You are successful. Mark progress on the scene challenge." };
      case "weak_hit": return { ...emptyConsequences(), sceneProgress: 1, sceneSegments: 1,
        otherEffect: "You are successful and mark progress, but also encounter a complication or setback. Envision what occurs and fill a segment of the challenge's clock." };
      case "miss": return { ...emptyConsequences(), sceneSegments: isMatch ? 2 : 1, routePayThePrice: true,
        otherEffect: isMatch
          ? "You fail, or a momentary success is undermined by a dramatic turn of events. With the match, fill two segments of the challenge's clock and Pay the Price."
          : "You fail, or a momentary success is undermined by a dramatic turn of events. Fill a segment of the challenge's clock and Pay the Price." };
    }
  },

  secure_an_advantage_scene_challenge: (outcome, isMatch) => {
    switch (outcome) {
      // "Take both" — +2 momentum and +1 on the next move, as the ordinary
      // move's strong hit; with a match, "take both and mark progress".
      case "strong_hit": return { ...CONSEQUENCE_MAP.secure_an_advantage("strong_hit", isMatch), sceneProgress: isMatch ? 1 : 0,
        otherEffect: isMatch
          ? "You are successful: take both — +2 momentum AND +1 on your next move (not a progress move) — and, with the match, mark progress on the scene challenge."
          : "You are successful: take both — +2 momentum AND +1 on your next move (added to your next action roll; not a progress move)." };
      // "Choose one" — the ordinary move's weak-hit choice.
      case "weak_hit": return CONSEQUENCE_MAP.secure_an_advantage("weak_hit", isMatch);
      case "miss": return { ...emptyConsequences(), sceneSegments: isMatch ? 2 : 1, routePayThePrice: true,
        otherEffect: isMatch
          ? "You fail or your assumptions betray you. With the match, fill two segments of the challenge's clock and Pay the Price."
          : "You fail or your assumptions betray you. Fill a segment of the challenge's clock and Pay the Price." };
    }
  },

  finish_the_scene: (outcome, _isMatch) => {
    // Progress move (Starforged p. 241; issue #326 D6). The scene concludes on
    // every outcome: the challenge track completes and its tension clock
    // retires (the pipeline's finishScene). A weak hit pays a minor price, a
    // miss a dire one — Pay the Price routed, as Take Decisive Action's miss.
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), finishScene: true,
        otherEffect: "You achieve your objective unconditionally. The scene is finished." };
      case "weak_hit": return { ...emptyConsequences(), finishScene: true, routePayThePrice: true,
        otherEffect: "You succeed, but not without cost. Pay the Price — a minor cost relative to the scope of the scene." };
      case "miss": return { ...emptyConsequences(), finishScene: true, routePayThePrice: true,
        otherEffect: "You fail, or are undermined by a dramatic and costly turn of events. Pay the Price. Make it hurt." };
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
      case "miss": return { ...emptyConsequences(), routePayThePrice: true,
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
        // B2: choose one — +2 momentum OR in control. No pre-set position:
        // the pick sets it. Positions are binary, so taking the momentum
        // instead of control begins the fight in a bad spot — it set none, so
        // no bad-spot directive steered the interpreter and Take Decisive
        // Action was never downgraded (issue #321 U18).
        sufferPrompt: { kind: "enumerated", options: [
          { label: "+2 momentum (you begin in a bad spot)", chain: [{ momentum: 2 }, { combatPosition: "bad_spot" }] },
          { label: "You are in control",                    combatPosition: "in_control" },
        ]},
        otherEffect: "Weak hit: choose one — +2 momentum (and begin in a bad spot) OR you are in control."
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
        // applies the momentum delta, or grants the roller +1 on their next
        // action roll (issue #322 V02).
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
      case "miss": return { ...emptyConsequences(), combatPosition: "bad_spot", routePayThePrice: true,
        otherEffect: "Foe gains upper hand. You are in a bad spot. Pay the Price." };
    }
  },

  strike: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), combatProgress: 2, combatPosition: "in_control",
        otherEffect: "Mark progress twice. Dominate foe, stay in control." };
      case "weak_hit": return { ...emptyConsequences(), combatProgress: 2, combatPosition: "bad_spot",
        otherEffect: "Mark progress twice, but expose yourself to danger. You are in a bad spot." };
      case "miss": return { ...emptyConsequences(), combatPosition: "bad_spot", routePayThePrice: true,
        otherEffect: "Fight turns against you. You are in a bad spot. Pay the Price." };
    }
  },

  clash: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), combatProgress: 2, combatPosition: "in_control",
        otherEffect: "Mark progress twice. Overwhelm foe, you are in control." };
      case "weak_hit": return { ...emptyConsequences(), combatProgress: 1, combatPosition: "bad_spot", routePayThePrice: true,
        otherEffect: "Mark progress, but dealt a counterblow. Stay in a bad spot. Pay the Price." };
      case "miss": return { ...emptyConsequences(), combatPosition: "bad_spot", routePayThePrice: true,
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
        combatPosition: "bad_spot",
        otherEffect: "Avoid worst danger but not without cost. Suffer move (-1). Stay in a bad spot."
      };
      case "miss": return { ...emptyConsequences(), combatPosition: "bad_spot", routePayThePrice: true,
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
      case "miss": return { ...emptyConsequences(), routePayThePrice: true,
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
    // Battle resolves an entire fight in one roll, so every outcome ends combat
    // (endCombat closes any open combat track — a no-op when none exists, since
    // Battle is typically used without a move-by-move track). Weak hit and miss
    // both "Pay the Price", routed through the pipeline like Face Defeat.
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(), endCombat: true, momentumChange: 2,
        otherEffect: "Objective achieved unconditionally. You and allies may take +2 momentum. The fight is over." };
      case "weak_hit": return { ...emptyConsequences(), endCombat: true, routePayThePrice: true,
        otherEffect: "Objective achieved but at cost. The fight is over. Pay the Price." };
      case "miss": return { ...emptyConsequences(), endCombat: true, routePayThePrice: true,
        otherEffect: "Defeated or objective lost. The fight is over. Pay the Price." };
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
        // The -1 goes through the Endure Harm executor, so harm the meter
        // cannot take is momentum ("If your health is 0, Lose Momentum equal
        // to any remaining harm" — issue #314 Q02): as a bare meter delta it
        // clamped to 0, cost nothing at 0 health, and the card said "Applied:
        // Health -1" (issue #325 W14).
        // "If your health is 0, you must also mark …" holds for either option:
        // the Lose Momentum pick's at-0 choice follows it (`atZeroChoice`,
        // known-issues ENDURE-ZERO-ON-OTHER-OPTION).
        sufferPrompt: { kind: "enumerated", options: [
          { label: "-1 health",          suffer: "endure_harm", amount: 1 },
          { label: "Lose Momentum (-2)", suffer: "lose_momentum", amount: 2, atZeroChoice: "harm" },
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
        // Through the Endure Stress executor, as Endure Harm's (issue #325 W14).
        sufferPrompt: { kind: "enumerated", options: [
          { label: "-1 spirit",          suffer: "endure_stress", amount: 1 },
          { label: "Lose Momentum (-2)", suffer: "lose_momentum", amount: 2, atZeroChoice: "stress" },
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
        // The integrity options change the vehicle the move was rolled
        // against (sufferDialog applyVehicleIntegrity, issue #309 N02); the
        // damage the vehicle cannot take at 0 is momentum (sufferDialog
        // lossPastZero, issue #345 AA15). At 0, the vehicle-type cost is the
        // player's to apply (otherEffect).
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
      case "strong_hit": return { ...emptyConsequences(), companionHealthChange: 1,
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
        // not auto-discard). The harm the companion cannot take at 0 is
        // momentum (sufferDialog lossPastZero, issue #345 AA15).
        sufferPrompt: { kind: "enumerated", options: [
          { label: "-1 companion health", companionHealth: -1 },
          { label: "Lose Momentum (-2)",  suffer: "lose_momentum", amount: 2 },
        ]},
        // Dead or destroyed only at 0 health — as the executor gates it; the
        // card and the narrator's MOVE OUTCOME said so on the match alone
        // (issue #325 W17).
        otherEffect: isMatch
          ? "Worse than thought. Companion suffers -1 health or you Lose Momentum (-2). If its health is 0, it is out of action until aided — and with this match, if its health is 0 it is dead or destroyed: discard the asset."
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
        sufferPrompt: { kind: "enumerated", options: healRecovery() },
        otherEffect: "If wounded, clear impact and take/give +2 health. Otherwise take/give +3 health." };
      case "weak_hit": return {
        ...emptyConsequences(),
        // The strong hit's recovery, then the cost (issue #311 P02 — the cost
        // was the whole choice, so a weak hit healed nothing).
        sufferPrompt: { kind: "enumerated", options: withCost(healRecovery(), [
          { label: "Lose Momentum (-2)",       suffer: "lose_momentum",       amount: 2 },
          { label: "Sacrifice Resources (-2)", suffer: "sacrifice_resources", amount: 2 },
        ]) },
        otherEffect: "As a strong hit, but recovery costs extra time or resources: Lose Momentum (-2) OR Sacrifice Resources (-2)."
      };
      case "miss": return { ...emptyConsequences(), routePayThePrice: true,
        otherEffect: "Aid ineffective and situation worsens. Pay the Price." };
    }
  },

  hearten: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: heartenRecovery() },
        otherEffect: "If shaken, clear impact and take +1 spirit. Otherwise take +2 spirit. (+1 more if via Sojourn)." };
      // The strong hit's recovery, then Lose Momentum (-1) — the -1 alone was
      // the weak hit, so it recovered nothing (issue #311 P02).
      case "weak_hit": return { ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: withCost(heartenRecovery(), [
          { label: "Lose Momentum (-1)", suffer: "lose_momentum", amount: 1 },
        ]) },
        otherEffect: "As strong hit but fleeting — envision interruption or complication. Lose Momentum (-1)." };
      case "miss": return { ...emptyConsequences(), routePayThePrice: true,
        otherEffect: "No comfort and situation worsens. Pay the Price." };
    }
  },

  // Resupply's supply is conditional, as Heal's health is: unprepared, clear it
  // and take +1; otherwise take +2 (play kit p. 7). The unprepared branch gave
  // +2 and the +2 branch was open to an unprepared PC (issue #314 Q01).
  resupply: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: [
          { label: "Clear unprepared + take/give +1 supply", chain: [{ clearImpact: "unprepared" }, { supply: 1 }], requires: "unprepared" },
          { label: "Take/give +2 supply",                    supply: 2, requires: "!unprepared" },
          { label: "Acquire specific item + +1 momentum",    momentum: 1 },
        ]},
        otherEffect: "If unprepared, clear it and take/give +1 supply; otherwise take/give +2 supply. Or acquire a specific item and take +1 momentum." };
      // "As above" — the strong hit's choice, the specific item included
      // (issue #325 W17: issue #314 Q01 fixed the supply branches' gates and
      // left it out) — after a cost, complication or demand.
      case "weak_hit": return { ...emptyConsequences(),
        sufferPrompt: { kind: "enumerated", options: [
          { label: "Clear unprepared + +1 supply (pay cost first)", chain: [{ clearImpact: "unprepared" }, { supply: 1 }], requires: "unprepared" },
          { label: "+2 supply (pay cost first)",                    supply: 2, requires: "!unprepared" },
          { label: "Acquire specific item + +1 momentum (pay cost first)", momentum: 1 },
        ]},
        otherEffect: "At cost. If unprepared, clear it and take +1 supply; otherwise take +2 supply. Or acquire a specific item and take +1 momentum." };
      case "miss": return { ...emptyConsequences(), routePayThePrice: true,
        otherEffect: "Unexpected peril. Pay the Price." };
    }
  },

  repair: (outcome, _isMatch) => {
    switch (outcome) {
      case "strong_hit": return { ...emptyConsequences(),
        otherEffect: "Gain repair points: facility 5, field 3, under fire 2. Spend: clear battered (2), fix module (2), +1 integrity (1), +1 companion health (1), repair device (3)." };
      case "weak_hit": return { ...emptyConsequences(),
        otherEffect: "Gain repair points: facility 3, field 1, under fire 0. Same spend options." };
      case "miss": return { ...emptyConsequences(), routePayThePrice: true,
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
 * @param {Object} [options]
 * @param {string} [options.combatPosition] — the fight's position (Take Decisive Action)
 * @param {Object} [options.currentSite]    — the site the crew is in (waypoint seeds)
 * @param {number} [options.momentum]       — the roller's momentum: a negative
 *   value matching the action die cancels it (cancelsActionDie). Omitted, no
 *   die is cancelled.
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
  // How the move resolves (schemas.js moveRollKind). A no-roll move — Make a
  // Discovery, Confront Chaos, Reach a Milestone, Pay the Price, the session
  // moves — used to roll an action die against its null stat and come out a
  // "miss" or a "hit" the rules know nothing of, with a Burn Momentum offer on
  // the miss (issue #316 T05). The move's data decides, not a stat the
  // interpreter happened to name; a bonded Develop Your Relationship is the
  // one no-stat move that rolls, and its enrichment says so on the
  // interpretation (`rollKind: "action"`).
  const rollKind = isProgressMove ? "progress"
    : (moveRollKind(moveId) === "action" || interpretation.rollKind === "action") ? "action"
    : "none";

  let actionDie    = 0;
  let actionDieCancelled = false;
  let actionScore  = 0;
  let progressScore = 0;
  let challengeDice = [];
  let outcome = null;
  let isMatch = false;

  if (rollKind === "progress") {
    // Progress move: score from the relevant track's filled boxes. statValue
    // is repurposed as the tick carrier — filled from live module data
    // (combat/expedition tracks, vow items, connection records) by
    // enrichProgressTicks (src/moves/statEnrichment.js) before resolveMove
    // is called. The interpreter never supplies tick counts.
    const ticks = statValue;
    challengeDice = rollChallengeDice();
    ({ progressScore, outcome, isMatch } = calcProgressOutcome(ticks, challengeDice));
  } else if (rollKind === "action") {
    challengeDice = rollChallengeDice();
    actionDie   = rollActionDie();
    // The die stays on the record (the card shows it struck through); a
    // cancelled one adds nothing to the score.
    actionDieCancelled = cancelsActionDie(actionDie, options.momentum);
    actionScore = calcActionScore(actionDieCancelled ? 0 : actionDie, statValue, adds);
    ({ outcome, isMatch } = calcOutcome(actionScore, challengeDice));
  }
  // rollKind "none": no dice, no outcome — the consequences apply as written.

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

  // An add taken on the confirm dialog whose ability counts a weak hit as a
  // miss — the Hoverbike's afterburner: "you may add +integrity … If you do,
  // count a weak hit as a miss" — applied as the bad-spot downgrade above is.
  // The add was offered as a free bonus (HOVERBIKE-WEAK-AS-MISS-UNAPPLIED).
  // Kept on the resolution: a burn that lands on a weak hit is a miss too.
  const weakHitAsMiss = rollKind === "action" ? weakHitAsMissSource(interpretation) : null;
  const weakHitCounted = !!weakHitAsMiss && outcome === "weak_hit";
  if (weakHitCounted) outcome = "miss";

  const outcomeLabel   = rollKind === "none" ? "No roll" : buildOutcomeLabel(outcome, isMatch);
  // Aid Your Ally in a fight is Gain Ground's (the caller says whether a
  // fight is open — options.inFight); otherwise Secure an Advantage's.
  const consequences   = moveId === "aid_your_ally" && options.inFight === true
    ? aidYourAllyConsequences(outcome, isMatch, true)
    : mapConsequences(moveId, outcome, isMatch);
  if (downgradeApplied) {
    consequences.otherEffect = `In a bad spot — outcome downgraded (${downgradeApplied}). ${consequences.otherEffect ?? ""}`.trim();
  }
  if (weakHitCounted) {
    consequences.otherEffect = `Weak hit counted as a miss — the ${weakHitAsMiss}'s add was taken. ${consequences.otherEffect ?? ""}`.trim();
  }
  const loremasterContext = buildLoremasterContext({
    moveName, statUsed, statValue, adds,
    actionDie, actionDieCancelled, actionScore, challengeDice,
    outcome, outcomeLabel, isMatch,
    rollKind, isProgressMove, progressScore,
    consequences,
  });

  // Oracle seeding (narrator-entity-discovery scope §7) — runs after the
  // outcome is known so we can condition on hit-with-match etc. Only the
  // configured moves produce seeds; everything else gets null. A result the
  // pipeline routes to Pay the Price rolls no price here: the pipeline rolls
  // the one its card shows and the table pays, and seeds the narration with
  // it (withPayThePriceSeed — issue #321 U03).
  //
  // A miss whose Pay the Price is one of its choices (Sojourn's "No relief")
  // rolls its price once: the narration is seeded with that roll, and the
  // choice's option carries it, so picking it pays the price the narration
  // depicted — not a reminder to roll another (SOJOURN-PTP-ADVISORY).
  // So is a Take Decisive Action weak hit's cost (`rollDecisiveActionCost`):
  // the pipeline's cost card rolls it and seeds the narration with that one
  // (withDecisiveActionCostSeed — TDA-COST-DOUBLE-ROLL).
  const choicePrice = rollChoicePrice(moveId, outcome, consequences);
  if (choicePrice) consequences.sufferPrompt = withChoicePrice(consequences.sufferPrompt, choicePrice, moveName);
  const builtSeeds = buildOracleSeeds(moveId, outcome, isMatch, options.currentSite ?? null,
    { routesPayThePrice: consequences.routePayThePrice === true || !!choicePrice,
      rollsDecisiveActionCost: consequences.rollDecisiveActionCost === true,
      region: activeSectorRegion(campaignState),
      statedPriceText: statedPrice(interpretation.stakes)?.price ?? null });
  const oracleSeeds = choicePrice ? withPayThePriceSeed(builtSeeds, moveId, choicePrice.result) : builtSeeds;

  return {
    playerNarration,
    inputMethod,
    mischiefLevel,
    moveId,
    moveName,
    statUsed,
    statValue,
    // How the stat was chosen when the rule chose it — "lower of iron / wits"
    // for Heal's self-mend (statEnrichment, issue #330 D4); shown on the card.
    statRule: typeof interpretation.statRule === "string" ? interpretation.statRule : null,
    // What a hit gets and a miss costs, as the Confirm dialog stated them
    // (issue #353 R1): the narrator delivers the one the outcome calls for,
    // and a miss that pays the price pays the stated miss (movePipeline).
    stakes:   interpretation.stakes && typeof interpretation.stakes === "object" ? interpretation.stakes : null,
    adds,
    rationale,
    mischiefApplied,
    playerConfirmed: true,
    actionDie,
    actionDieCancelled,
    actionScore,
    challengeDice,
    isMatch,
    momentumBurned: false,
    momentumBurnedFrom: 0,
    outcome,
    outcomeLabel,
    rollKind,
    isProgressMove,
    progressScore,
    consequences,
    oracleSeeds,
    loremasterContext,
    // The asset whose taken add counts a weak hit as a miss (the burn reads it).
    ...(weakHitAsMiss ? { weakHitAsMiss } : {}),
    sessionId: campaignState.currentSessionId ?? "",
  };
}

/**
 * The asset whose add, taken on the confirm dialog, counts a weak hit as a
 * miss — an applicable ability the scanner marked `weakHitAsMiss` (the
 * Hoverbike's afterburner) whose box was checked (`appliedAbilityKeys`) —
 * else null (HOVERBIKE-WEAK-AS-MISS-UNAPPLIED).
 *
 * @param {Object} interpretation
 * @returns {string|null} the asset's name
 */
function weakHitAsMissSource(interpretation) {
  const taken = new Set(Array.isArray(interpretation?.appliedAbilityKeys) ? interpretation.appliedAbilityKeys : []);
  const costly = (Array.isArray(interpretation?.applicableAbilities) ? interpretation.applicableAbilities : [])
    .find(a => a?.weakHitAsMiss === true && taken.has(a.key));
  return costly ? (costly.assetName || "asset") : null;
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
 * And at the outcomes whose text says to envision something (issue #353
 * Phase 0, "Where to roll" — rolled once, here, never on a beat that is not
 * one of these):
 *   gather_information     → hit: Story Clue (what is learned); weak hit also,
 *                            and miss: Story Complication (the complication,
 *                            the unwelcome truth)
 *   compel                 → weak hit: action + theme (their counteroffer)
 *   undertake_an_expedition→ hit: Space Sighting for the active sector's
 *                            region (the waypoint reached)
 *   a price that reveals a new enemy ("A new enemy is revealed", a "Roll
 *   twice" leaf included) → character role + goal + disposition (what it is
 *   and what it wants — priceSeedLines)
 *
 * Returns null for moves that don't seed.
 *
 * @param {string} moveId
 * @param {string} outcome
 * @param {boolean} isMatch
 * @param {Object|null} [currentSite]
 * @param {Object} [opts]
 * @param {boolean} [opts.routesPayThePrice] — the result's consequences route
 *   Pay the Price (`routePayThePrice`): the pipeline rolls the price for its
 *   card and seeds the narration with that one, so none is rolled here
 *   (issue #321 U03)
 * @param {boolean} [opts.rollsDecisiveActionCost] — the result's consequences
 *   roll Take Decisive Action's weak-hit cost (`rollDecisiveActionCost`): the
 *   pipeline's cost card rolls it and seeds the narration with that one, so
 *   none is rolled here (TDA-COST-DOUBLE-ROLL — the U03 shape)
 * @param {string|null} [opts.region] — the active sector's region
 *   ("terminus" | "outlands" | "expanse"): an expedition's waypoint is that
 *   region's Space Sighting; Terminus with none (activeSectorRegion)
 * @param {string|null} [opts.statedPriceText] — the miss stated before the
 *   roll (stakes.js statedPrice): an unrouted miss's price is that one, not a
 *   table roll (issue #353 R1)
 * @returns {Object|null}
 */
// Moves whose miss outcome says "Pay the Price" per the play kit. A miss the
// pipeline routes (routePayThePrice) is seeded with its card's price by the
// pipeline; a miss whose price is one of its choices (Sojourn's) is seeded by
// resolveMove with the price its option carries (rollChoicePrice —
// SOJOURN-PTP-ADVISORY); only a miss that routes none and offers none (Explore
// a Waypoint's match, which may Confront Chaos instead) gets an advisory roll
// here.
const PAY_THE_PRICE_ON_MISS = new Set([
  "face_danger", "secure_an_advantage", "aid_your_ally", "gather_information", "compel",
  "check_your_gear", "set_a_course", "gain_ground", "react_under_fire",
  "strike", "clash", "take_decisive_action", "battle", "hearten",
  "resupply", "repair", "heal", "sojourn", "make_a_connection",
  "explore_a_waypoint",
]);

export function buildOracleSeeds(moveId, outcome, isMatch, currentSite = null, { routesPayThePrice = false, rollsDecisiveActionCost = false, region = null, statedPriceText = null } = {}) {
  try {
    const results = [];
    const names   = [];
    let context   = moveId;
    let connectionSeed = null;

    // ── PER-MOVE SEEDS ─────────────────────────────────────────────────────
    switch (moveId) {

      // The outcomes that say to envision something (issue #353 Phase 0):
      // the narrator used to fill them from its own defaults, so the same
      // images came back beat after beat. Rolled once, here, and given to the
      // narration as seeds are.
      case "gather_information": {
        // Strong hit: "the situation or path forward is clear"; weak hit: "a
        // new insight, but it complicates your quest"; miss: "a dire threat
        // or an unwelcome truth" (and Pay the Price — the pipeline's card).
        if (outcome === "strong_hit" || outcome === "weak_hit") {
          const clue = safeRoll("story_clue");
          if (clue) results.push(`What you learn — Story Clue: ${clue}`);
        }
        if (outcome === "weak_hit") {
          const complication = safeRoll("story_complication");
          if (complication) results.push(`How it complicates the quest — Story Complication: ${complication}`);
        } else if (outcome === "miss") {
          const truth = safeRoll("story_complication");
          if (truth) results.push(`The unwelcome truth — Story Complication: ${truth}`);
        }
        break;
      }

      case "compel": {
        // Weak hit: "they agree, but with a demand or complication" — the
        // counteroffer the narrator is told to envision.
        if (outcome === "weak_hit") {
          const pair = safeRollPaired("action", "theme");
          if (pair) results.push(`Their counteroffer — Action + Theme: ${pair}`);
        }
        break;
      }

      case "undertake_an_expedition": {
        // A hit reaches a waypoint: what it is, from the region's Space
        // Sighting table. A miss is waylaid — its Pay the Price is the
        // pipeline's card.
        if (outcome === "strong_hit" || outcome === "weak_hit") {
          const tableId = SPACE_SIGHTING_BY_REGION[region] ?? SPACE_SIGHTING_BY_REGION.terminus;
          const sight = safeRoll(tableId);
          if (sight) results.push(`The waypoint you reach — Space Sighting (${regionLabel(region)}): ${sight}`);
        }
        break;
      }

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
        // Theme as the prompt. A match lets the player Make a Discovery (or,
        // on a miss, Confront Chaos) INSTEAD — a choice the card's 🔭 / 🌀
        // button makes, whose forced move rolls its own table. The waypoint
        // seeds no table result: its narration depicted discovery X and the
        // button's move rolled discovery Y, and a player who took the
        // ordinary reward was narrated a discovery that never happened (issue
        // #326 W47, the issue #321 U03 shape).
        if (outcome === "strong_hit" && isMatch) {
          const pair = safeRollPaired("action", "theme");
          if (pair) results.push(`Notable aspect of this waypoint: ${pair}`);
        }
        // Site-aware seeds (SITE-WAYPOINT-BLIND fix, 2026-07): exploring a
        // waypoint INSIDE a vault or derelict rolls that site's canonical
        // interior tables so the narrator gets zone-true material instead of
        // generic space sights. Vaults: Interior Feature (Peril on a miss,
        // Opportunity on a strong-hit match). Derelicts: the Access suite —
        // the always-applicable entry tables; the per-zone Area tables are
        // registered for `!oracle` when the fiction names a specific zone.
        if (currentSite?.kind === "vault") {
          if (outcome === "miss") {
            const peril = safeRoll("vault_peril");
            if (peril) results.push(`Inside the vault — Interior Peril: ${peril}`);
          } else {
            const feat = safeRoll("vault_feature");
            if (feat) results.push(`Inside the vault — Interior Feature: ${feat}`);
          }
          if (outcome === "strong_hit" && isMatch) {
            const opp = safeRoll("vault_opportunity");
            if (opp) results.push(`Inside the vault — Interior Opportunity: ${opp}`);
          }
          context = `${moveId} (inside ${currentSite.name || "a precursor vault"})`;
        } else if (currentSite?.kind === "derelict") {
          if (outcome === "miss") {
            const peril = safeRoll("derelict_access_peril");
            if (peril) results.push(`Inside the derelict — Peril: ${peril}`);
          } else {
            const area = safeRoll("derelict_access_area");
            if (area) results.push(`Inside the derelict — Area: ${area}`);
            const feat = safeRoll("derelict_access_feature");
            if (feat) results.push(`Inside the derelict — Feature: ${feat}`);
          }
          if (outcome === "strong_hit" && isMatch) {
            const opp = safeRoll("derelict_access_opportunity");
            if (opp) results.push(`Inside the derelict — Opportunity: ${opp}`);
          }
          context = `${moveId} (inside ${currentSite.name || "a derelict"})`;
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
        if (ptp) results.push(...priceSeedLines(ptp));
        break;
      }

      case "take_decisive_action": {
        if (outcome === "weak_hit" && !rollsDecisiveActionCost) {
          const cost = safeRoll("decisive_action_cost");
          if (cost) results.push(`Decisive-action cost: ${cost}`);
        }
        break;
      }

      // Endure Harm / Endure Stress / Withstand Damage seed no table: the
      // mortal-wound, desolation and vehicle-damage d100s are due only at 0 on
      // the resist roll's miss, and then only if the player picks the table —
      // the at-0 choice card's one roll (sufferExecutor.rollImpactTable, whose
      // card the narrator is told of: RECENT ORACLE RESULTS). A seed rolled
      // here on every miss, "(if health at 0)", whatever the meter held, had
      // the narration depict a wound the table never rolled (issue #336 Y21 —
      // the issue #321 U03 / #326 W47 shape).
    }

    // ── PAY THE PRICE ON MISS — advisory, for a miss whose text says so but
    // that routes none. A routed price (routePayThePrice — Face Defeat's, on
    // any outcome, too) is the pipeline's card roll, which it seeds the
    // narration with: rolling one here too gave the narration one price and
    // the table another (issue #321 U03).
    if (outcome === "miss" && PAY_THE_PRICE_ON_MISS.has(moveId) && !routesPayThePrice) {
      // The miss stated before the roll is its price (issue #353 R1); the
      // table only when none was stated.
      const ptp = statedPriceText || safeRoll("pay_the_price");
      if (ptp) results.push(...priceSeedLines(ptp));
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

/**
 * A move's oracle seeds with the Pay the Price its pipeline rolled for the
 * card, so the narration depicts the price the table is shown and pays — one
 * roll per result (issue #321 U03). A new object; `seeds` is not changed.
 *
 * @param {Object|null} seeds — the resolution's oracleSeeds (null when none)
 * @param {string} moveId
 * @param {string|null} price — the card's Pay the Price result
 * @returns {Object|null}
 */
/**
 * The Pay the Price a miss's choice holds, rolled once (SOJOURN-PTP-ADVISORY):
 * a miss whose play-kit text says Pay the Price (PAY_THE_PRICE_ON_MISS) but
 * that routes none — the price is one of its choices, an enumerated option
 * routing `pay_the_price`. Null for any other result, or when the roll fails.
 *
 * @param {string} moveId
 * @param {string|null} outcome
 * @param {Object} consequences
 * @returns {{ roll: number, result: string }|null}
 */
export function rollChoicePrice(moveId, outcome, consequences) {
  if (outcome !== "miss" || !PAY_THE_PRICE_ON_MISS.has(moveId) || consequences?.routePayThePrice === true) return null;
  const prompt = consequences?.sufferPrompt;
  if (prompt?.kind !== "enumerated" || !(prompt.options ?? []).some(o => o?.route === "pay_the_price")) return null;
  try {
    const r = rollOracle("pay_the_price");
    return Number.isInteger(r?.roll) && r.result && r.result !== "—" ? { roll: r.roll, result: r.result } : null;
  } catch {
    return null;
  }
}

/**
 * A choice prompt whose `pay_the_price` option carries the rolled price (and
 * the move that owes it), for the pick to pay (sufferDialog's "route"). A new
 * prompt; `prompt` is not changed.
 *
 * @param {Object} prompt — an enumerated sufferPrompt
 * @param {{ roll: number, result: string }} price
 * @param {string|null} moveName
 * @returns {Object}
 */
export function withChoicePrice(prompt, price, moveName = null) {
  return {
    ...prompt,
    options: (prompt.options ?? []).map(o => (o?.route === "pay_the_price"
      ? { ...o, price: { roll: price.roll, result: price.result, ...(moveName ? { moveName } : {}) } }
      : o)),
  };
}

export function withPayThePriceSeed(seeds, moveId, price) {
  if (!price) return seeds ?? null;
  const base = seeds ?? { results: [], names: [], context: moveId };
  return { ...base, results: [...(base.results ?? []), ...priceSeedLines(price)] };
}

/** The Pay the Price result that reveals a new enemy (the play kit's 45–50). */
const NEW_ENEMY_PRICE = /\bA new enemy is revealed\b/i;

/**
 * Whether a Pay the Price result — or one leaf of a "Roll twice" (the roller
 * joins leaves with " / ") — reveals a new enemy.
 *
 * @param {string|null|undefined} price
 * @returns {boolean}
 */
export function priceRevealsNewEnemy(price) {
  return typeof price === "string" && NEW_ENEMY_PRICE.test(price);
}

/**
 * The seed lines for a Pay the Price result: the price, and — when it reveals
 * a new enemy — what that enemy is and wants, rolled once on Character Role,
 * Goal and Disposition (issue #353 Phase 0). The narration was seeded with the
 * bare price, so "a new enemy" became a voice with no nature or agenda.
 *
 * @param {string} price — the rolled result
 * @returns {string[]}
 */
function priceSeedLines(price) {
  const lines = [`Pay the Price: ${price}`];
  if (priceRevealsNewEnemy(price)) lines.push(...newEnemySeedLines());
  return lines;
}

/**
 * What a new enemy is and what it wants: Character Role, Goal and Disposition,
 * one roll each. A table that fails gives no line.
 *
 * @returns {string[]}
 */
export function newEnemySeedLines() {
  const lines = [];
  const role = safeRoll("character_role");
  const goal = safeRoll("character_goal");
  const disposition = safeRoll("character_disposition");
  if (role)        lines.push(`The new enemy — Character Role: ${role}`);
  if (goal)        lines.push(`The new enemy — Character Goal: ${goal}`);
  if (disposition) lines.push(`The new enemy — Character Disposition: ${disposition}`);
  return lines;
}

/**
 * The plan an expedition's first narration is asked to decide (issue #353
 * Phase 3, "Expedition ↔ progress track"): its waypoints, the danger along
 * the way and what waits at the end, seeded with two Space Sightings of the
 * active sector's region (waypoint ideas) and an Action + Theme (the end).
 * About the track, by id.
 *
 * @param {{ id: string, label?: string }} track — the expedition begun
 * @param {Object|null} campaignState
 * @param {string|null} resolutionId — the move that began it
 * @returns {{ ref: string, kind: "expedition", trigger: string, label: string,
 *   subject: { type: "track", id: string, name: string }, oracleSeeds: string[] }}
 */
export function expeditionPlanRequest(track, campaignState, resolutionId) {
  const region = activeSectorRegion(campaignState);
  const tableId = SPACE_SIGHTING_BY_REGION[region] ?? SPACE_SIGHTING_BY_REGION.terminus;
  const seeds = [];
  for (let i = 0; i < 2; i += 1) {
    const sight = safeRoll(tableId);
    if (sight) seeds.push(`A waypoint — Space Sighting (${regionLabel(region)}): ${sight}`);
  }
  const end = safeRollPaired("action", "theme");
  if (end) seeds.push(`What waits at the end — Action + Theme: ${end}`);
  const name = String(track?.label ?? "").trim() || "the expedition";
  return {
    ref:     `plan-${resolutionId ?? track?.id ?? "x"}-expedition`.slice(0, 64),
    kind:    "expedition",
    trigger: "expedition",
    label:   `the expedition to ${name}`,
    subject: { type: "track", id: track?.id ?? null, name },
    oracleSeeds: seeds,
  };
}

/**
 * The plan a vow's swearing scene is asked to decide (issue #353 Phase 4,
 * "Swear an Iron Vow / the inciting incident → vow"): what is really behind
 * the vow, seeded with an Action + Theme. About the vow, by its id when it
 * has one.
 *
 * @param {{ name?: string, vowId?: string|null }} vow
 * @param {string} refBase — unique to the narration
 * @returns {{ ref: string, kind: "vow", trigger: string, label: string,
 *   subject: { type: "vow", id: string|null, name: string }, oracleSeeds: string[] }|null}
 */
export function vowPlanRequest(vow, refBase) {
  const name = String(vow?.name ?? "").trim();
  if (!name || typeof refBase !== "string" || !refBase) return null;
  const behind = safeRollPaired("action", "theme");
  return {
    ref:         `plan-${refBase}-vow`.slice(0, 64),
    kind:        "vow",
    trigger:     "vow",
    label:       `what is really behind the vow "${name}"`,
    subject:     { type: "vow", id: typeof vow?.vowId === "string" && vow.vowId ? vow.vowId : null, name },
    oracleSeeds: behind ? [`What is behind it — Action + Theme: ${behind}`] : [],
  };
}

/** Each region's Space Sighting table (oracles/roller.js ORACLE_TABLES). */
const SPACE_SIGHTING_BY_REGION = Object.freeze({
  terminus: "space_sighting_terminus",
  outlands: "space_sighting_outlands",
  expanse:  "space_sighting_expanse",
});

/** "Outlands" for a region key; "Terminus" for none or an unknown one. */
function regionLabel(region) {
  const key = SPACE_SIGHTING_BY_REGION[region] ? region : "terminus";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * The active sector's region ("terminus" | "outlands" | "expanse"), or null
 * with no active sector — as `!oracle` reads it for its per-region tables.
 *
 * @param {Object|null} campaignState
 * @returns {string|null}
 */
function activeSectorRegion(campaignState) {
  const sectors = Array.isArray(campaignState?.sectors) ? campaignState.sectors : [];
  const region = sectors.find(s => s?.id === campaignState?.activeSectorId)?.region ?? null;
  return typeof region === "string" && SPACE_SIGHTING_BY_REGION[region] ? region : null;
}

/**
 * A Take Decisive Action weak hit's oracle seeds with the cost its pipeline
 * rolled for the cost card (index.js postDecisiveActionCostCard): the
 * narration depicts the cost the card shows and the table pays. The seed was
 * rolled again here, so the narration told one cost and the card another
 * (TDA-COST-DOUBLE-ROLL — the issue #321 U03 shape, withPayThePriceSeed).
 *
 * @param {Object|null} seeds — the resolution's oracleSeeds
 * @param {string} moveId
 * @param {string|null} cost — the card's result text; null when none was rolled
 * @returns {Object|null}
 */
export function withDecisiveActionCostSeed(seeds, moveId, cost) {
  if (!cost) return seeds ?? null;
  const base = seeds ?? { results: [], names: [], context: moveId };
  return { ...base, results: [...(base.results ?? []), `Decisive-action cost: ${cost}`] };
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
 * Gives Loremaster the full mechanical picture so narration is coherent —
 * the narrator's MOVE OUTCOME (buildNarratorUserMessage). Exported for the
 * resolutions built outside resolveMove: a Burn Momentum's (`momentumBurned`),
 * an Improve Result's (`resultImproved`, `improvedBy`) and a sheet-rolled
 * progress move's — their narrations were asked to "narrate the consequence"
 * of a move they were never named (issue #325 W20).
 *
 * @param {Object} r — the resolution's fields
 * @returns {string}
 */
export function buildLoremasterContext(r) {
  // A no-roll move: no dice, no outcome — only the move and what it does.
  if (r.rollKind === "none") {
    return [
      `[MOVE: ${r.moveName}]`,
      `[ROLL: none — this move has no action roll]`,
      r.consequences.otherEffect ? `[CONSEQUENCE: ${r.consequences.otherEffect}]` : "",
    ].filter(Boolean).join(" ");
  }

  const dieStr = r.actionDieCancelled ? `${r.actionDie} (cancelled by momentum -${r.actionDie})` : `${r.actionDie}`;
  const dice = Array.isArray(r.challengeDice) ? r.challengeDice : [];
  const vs = dice.length >= 2 ? ` vs Challenge: ${dice[0]}, ${dice[1]}` : "";
  const diceStr = r.momentumBurned
    ? `Momentum burned (${r.momentumBurnedFrom ?? r.actionScore})${vs}`
    : r.resultImproved
      ? `Result improved to a strong hit${r.improvedBy ? ` (${r.improvedBy})` : ""}`
      : r.isProgressMove
        ? `Progress score: ${r.progressScore}${vs}`
        : `Action: ${dieStr} + ${r.statValue}${r.adds ? ` + ${r.adds}` : ""} = ${r.actionScore}${vs}`;

  const matchStr = r.isMatch ? " [MATCH]" : "";

  return [
    `[MOVE: ${r.moveName}${r.statUsed ? ` +${r.statUsed}` : ""}]`,
    `[ROLL: ${diceStr}]`,
    `[OUTCOME: ${r.outcomeLabel}${matchStr}]`,
    r.consequences?.otherEffect ? `[CONSEQUENCE: ${r.consequences.otherEffect}]` : "",
  ].filter(Boolean).join(" ");
}
