/**
 * STARFORGED COMPANION
 * src/moves/mischief.js — Mischief dial logic
 *
 * Controls how the interpreter prompt is framed based on the mischief dial.
 * The framing is injected into the user message — it shapes how Claude reads
 * the player narration without changing the move reference or rules.
 *
 * When mischiefApplied is true, a wry aside is shown in the move confirmation card.
 * The player sees the aside before accepting the interpretation — it acknowledges
 * the reframe with personality rather than hiding it. The aside is flavor only;
 * the player can still override the move choice regardless.
 *
 * The aside is generated deterministically from the narration and chosen move —
 * no extra API call. It's built from templates that surface the gap between what
 * the player said and what the Trickster decided.
 *
 * Dial values (internal / UI alias):
 *   "serious" / "lawful"  — literal interpretation, no reframing
 *   "balanced"            — occasional organic misreads that create emergent story moments
 *   "chaotic"             — deliberate misinterpretation for comic or dramatic effect
 *
 * "lawful" is the value stored by settingsPanel.js and returned by getMischiefDial().
 * normalizeDial() maps it to "serious" so both spellings work throughout.
 */


// ─────────────────────────────────────────────────────────────────────────────
// DIAL NORMALISATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise the dial value before any logic sees it.
 *
 * settingsPanel.js stores "lawful" | "balanced" | "chaotic".
 * mischief.js uses "serious" | "balanced" | "chaotic" internally.
 * Both spellings are accepted so the two modules stay decoupled.
 *
 * @param {string} level
 * @returns {"serious"|"balanced"|"chaotic"}
 */
function normalizeDial(level) {
  return level === "lawful" ? "serious" : (level ?? "serious");
}


// ─────────────────────────────────────────────────────────────────────────────
// FRAMING — injected into interpreter user message
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the mischief framing string injected into the interpreter's user message.
 * Returns null for serious/lawful setting (no framing needed).
 *
 * @param {string} mischiefLevel  — "serious"|"lawful"|"balanced"|"chaotic"
 * @param {string} narration      — player's raw narration (used for chaotic heuristics)
 * @returns {string|null}
 */
export function buildMischiefFraming(mischiefLevel, narration) {
  switch (normalizeDial(mischiefLevel)) {
    case "serious":
      return null;   // No framing — pure literal interpretation

    case "balanced":
      return buildBalancedFraming(narration);

    case "chaotic":
      return buildChaoticFraming(narration);

    default:
      return null;
  }
}

/**
 * Balanced framing — encourages organic misreads that feel narratively plausible.
 * The model is nudged to occasionally find the less obvious but more interesting move.
 * This produces emergent story moments without obviously breaking the fiction.
 *
 * Applied probabilistically — the framing itself prompts the model to decide
 * whether a reframe is warranted, rather than forcing one every time.
 */
function buildBalancedFraming(_narration) {
  return `INTERPRETATION NOTE: You are allowed to occasionally interpret this narration in a slightly unexpected but still plausible way. If there is a move that is less obvious but more dramatically interesting than the most literal reading — and it still fits the fiction — you may prefer it. This should feel like a natural misread, not a forced one. Set mischiefApplied to true if you do this.`;
}

/**
 * Chaotic framing — actively seeks square pegs for round holes.
 * The model is instructed to find the most dramatically incongruous move
 * that can still be argued to fit. Used for comic effect or high chaos games.
 *
 * The framing provides heuristics to guide the mismatch — preferring moves
 * from different categories, unexpected stats, or progress moves out of context.
 */
function buildChaoticFraming(narration) {
  const heuristics = selectChaoticHeuristics(narration);
  return `INTERPRETATION NOTE: You are playing the Trickster. Find the most dramatically unexpected move that can still be argued — with a straight face — to fit this narration. Prefer moves from a different category than the obvious one. Consider unusual stats. Progress moves can appear at strange moments. The result should feel absurd but not random — there should be a logic, however twisted. Set mischiefApplied to true. Heuristics for this narration: ${heuristics}`;
}

/**
 * Select chaotic heuristics based on surface features of the narration.
 * These guide the model toward productive mischief rather than random noise.
 *
 * Not exhaustive — just enough to nudge the model in an interesting direction.
 */
function selectChaoticHeuristics(narration) {
  const lower = narration.toLowerCase();
  const hints = [];

  // Combat narration → push toward non-combat moves
  if (/fight|attack|shoot|punch|strike|blast|fire/.test(lower)) {
    hints.push("The narration sounds like combat — consider whether it might actually be a social or exploration move in disguise.");
  }

  // Social narration → push toward physical or exploration moves
  if (/talk|ask|tell|convince|persuade|negotiate/.test(lower)) {
    hints.push("The narration sounds social — consider whether the character's body language or physical approach matters more than the words.");
  }

  // Careful/cautious narration → push toward bold or reactive moves
  if (/careful|slowly|quietly|sneak|hide|check/.test(lower)) {
    hints.push("The narration sounds cautious — consider whether the situation is already more out of control than the player thinks.");
  }

  // Technical/repair narration → push toward suffer or social moves
  if (/fix|repair|hack|system|console|panel|wire/.test(lower)) {
    hints.push("The narration sounds technical — consider whether the real obstacle is trust, endurance, or something that can't be solved with tools.");
  }

  // Fallback hint if nothing specific matches
  if (hints.length === 0) {
    hints.push("Find the stat that seems least relevant to what the player described and make a compelling case for it.");
  }

  return hints.join(" ");
}


// ─────────────────────────────────────────────────────────────────────────────
// GATING — should mischief be applied at all?
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine whether mischief should be applied on this call.
 * Used externally if the pipeline wants to gate mischief by probability
 * rather than always injecting the framing.
 *
 * For balanced: roughly 1 in 5 chance of active reframing
 * For chaotic: always
 * For serious/lawful: never
 *
 * Note: this is advisory — the model still decides in the framing above.
 * This function can be used to suppress framing entirely on some calls
 * for a lighter-touch balanced experience.
 *
 * @param {string} mischiefLevel  — "serious"|"lawful"|"balanced"|"chaotic"
 * @returns {boolean}
 */
export function shouldApplyMischief(mischiefLevel) {
  switch (normalizeDial(mischiefLevel)) {
    case "serious":  return false;
    case "balanced": return Math.random() < 0.20;   // ~20% of calls get mischief framing
    case "chaotic":  return true;
    default:         return false;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// WRY ASIDE — shown in the confirmation card when mischiefApplied is true
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the wry aside shown in the move confirmation card.
 * Only called when mischiefApplied is true.
 *
 * Generated without an extra API call. Uses the gap between the player's
 * narration surface (what they said) and the chosen move (what the Trickster
 * decided) to pick a template that acknowledges the reframe with personality.
 *
 * The aside is always one line. It's flavor, not an explanation — the Trickster
 * is smug about it, not apologetic.
 *
 * @param {string} narration      — raw player narration
 * @param {string} moveId         — chosen move ID
 * @param {string} statUsed       — stat chosen
 * @param {string} mischiefLevel  — "serious"|"lawful"|"balanced"|"chaotic"
 * @returns {string}
 */
export function buildMischiefAside(narration, moveId, statUsed, mischiefLevel) {
  const lower    = narration.toLowerCase();
  const category = getMoveCategory(moveId);

  // Chaotic gets more aggressive asides
  if (normalizeDial(mischiefLevel) === "chaotic") {
    return pickChaoticAside(lower, moveId, statUsed, category);
  }

  return pickBalancedAside(lower, moveId, statUsed, category);
}

/**
 * Balanced asides — a gentle nudge, slightly knowing.
 * The Trickster noticed something the player didn't say out loud.
 */
function pickBalancedAside(narration, moveId, statUsed, category) {
  // Stat-specific commentary
  const statAsides = {
    heart: [
      "This one's about nerve, not cleverness.",
      "Resolve will carry you further than a plan right now.",
      "Turns out the real challenge here is keeping it together.",
    ],
    iron: [
      "Sometimes you just have to push through.",
      "This is a test of endurance, not tactics.",
      "The elegant solution left on an earlier ship.",
    ],
    shadow: [
      "The indirect approach has a certain appeal.",
      "What you don't say matters more than what you do.",
      "Subtlety, noted.",
    ],
    edge: [
      "Speed is the variable that matters here.",
      "The window is narrow — good thing you're fast.",
      "Commit or don't. No half measures.",
    ],
    wits: [
      "Observation first, action second.",
      "There's more going on here than you've accounted for.",
      "Read the situation before you commit.",
    ],
  };

  // Category-based commentary when the move category surprises
  const categoryAsides = {
    suffer:      ["Ah. This is going to cost something.",
                  "The damage was already done before you acted."],
    connection:  ["This moment is really about the relationship, isn't it.",
                  "Whatever you do next, it will change how they see you."],
    quest:       ["A vow hangs over this. You feel it.",
                  "What you're doing here matters more than it looks."],
    exploration: ["You're further into the unknown than you intended to be.",
                  "The place itself is the obstacle."],
    threshold:   ["This is a threshold moment. Choose carefully.",
                  "Not every challenge has a clean outcome."],
  };

  // Try a stat aside first (50% of the time if stat matches)
  if (statAsides[statUsed] && Math.random() < 0.5) {
    return pick(statAsides[statUsed]);
  }

  // Then try a category aside
  if (categoryAsides[category]) {
    return pick(categoryAsides[category]);
  }

  // Generic balanced fallbacks
  return pick([
    "There's more going on here than the obvious move.",
    "Interesting. Not the approach I'd have predicted.",
    "The situation has its own ideas about how this goes.",
    "The Forge has opinions about what kind of problem this is.",
    "You said one thing. The moment is asking for another.",
  ]);
}

/**
 * Chaotic asides — the Trickster is openly smug.
 * It knows exactly what it's doing and wants credit.
 */
function pickChaoticAside(narration, moveId, statUsed, category) {
  // Move-specific roasts
  const moveAsides = {
    endure_harm:    ["You walked into that.",
                     "The harm was always going to happen. You just didn't know yet."],
    endure_stress:  ["Turns out the Forge gets inside your head.",
                     "The scariest thing in this scene is your own reaction to it."],
    swear_an_iron_vow: ["Congratulations. You have a new obligation.",
                        "Nothing like a vow to make a bad situation load-bearing."],
    face_death:     ["I'm sure this will be fine.",
                     "The good news is: you're still rolling dice."],
    test_your_relationship: ["You had to bring feelings into this.",
                             "The connection you needed is the one you put at risk."],
    fulfill_your_vow: ["Done? Let's find out.",
                       "Progress tracks are optimistic. Challenge dice are honest."],
    compel:         ["They're not going to like what you're about to say.",
                     "Persuasion has consequences. Even when it works."],
    repair:         ["The machine has opinions about being fixed.",
                     "Nothing fixes cleanly in the Forge."],
  };

  if (moveAsides[moveId]) {
    return pick(moveAsides[moveId]);
  }

  // Surface reading vs actual move
  if (/fight|attack|shoot|punch|strike/.test(narration) && category !== "combat") {
    return pick([
      "That was never going to be a clean fight.",
      "You brought fists to a feelings problem.",
      "The real threat here isn't something you can shoot.",
      "Bold. Tactically irrelevant, but bold.",
    ]);
  }

  if (/talk|ask|convince|persuade/.test(narration) && category !== "adventure") {
    return pick([
      "Words are doing a lot of work here. Watch them strain.",
      "This negotiation has a mechanical undercarriage.",
      "Diplomacy is just momentum with better manners.",
      "What you're actually testing is whether they trust you.",
    ]);
  }

  if (/fix|repair|hack|system/.test(narration) && category !== "recover") {
    return pick([
      "The problem isn't the equipment. The equipment is a symptom.",
      "Technical competence: necessary, insufficient.",
      "The machine will cooperate. Whether you survive is another matter.",
      "You can fix the panel. You cannot fix what broke the panel.",
    ]);
  }

  if (/careful|slowly|quietly|sneak/.test(narration)) {
    return pick([
      "Caution is a mood, not a plan.",
      "You were quiet. The situation was not.",
      "The slow approach. Admirable. Irrelevant.",
      "Sneaking implies there's somewhere to sneak to.",
    ]);
  }

  // Stat-specific chaos commentary
  const chaoticStatAsides = {
    heart:  ["The Forge wants your feelings about this.",
             "Resolve is the variable. Everything else is set dressing.",
             "Your morale is on the line, not your skill."],
    iron:   ["Brute endurance. The Forge respects the commitment.",
             "No clever solution available. Just pushing through.",
             "Your body is the instrument. Hope it's tuned."],
    shadow: ["The interesting move is the one nobody sees coming.",
             "Deception is just a different kind of honesty.",
             "What you're concealing matters more than what you're doing."],
    edge:   ["Fast is the only kind of right available here.",
             "Commitment. Now. No revisions.",
             "The hesitation already happened. This is the aftermath."],
    wits:   ["You need to understand the situation before you survive it.",
             "Information is the resource you actually need.",
             "The Forge is a puzzle. You're inside it."],
  };

  if (chaoticStatAsides[statUsed]) {
    return pick(chaoticStatAsides[statUsed]);
  }

  // Absolute fallbacks — generic chaos
  return pick([
    "You asked for an interpretation. I gave you one.",
    "The obvious move was right there. You're welcome.",
    "This is what happens when you narrate ambiguously.",
    "The Trickster Layer has no notes. The Trickster Layer has opinions.",
    "Consider this a reframe. Mechanically sound, narratively spicy.",
    "I see your intent and raise you a complication.",
    "The dice don't care what you meant to do.",
    "Technically correct. The best kind.",
  ]);
}


// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the move category for a given moveId.
 * Used to pick contextually appropriate asides.
 */
function getMoveCategory(moveId) {
  const categoryMap = {
    // Session
    begin_a_session: "session", end_a_session: "session",
    // Adventure
    face_danger: "adventure", secure_an_advantage: "adventure",
    gather_information: "adventure", compel: "adventure",
    aid_your_ally: "adventure", check_your_gear: "adventure",
    // Quest
    swear_an_iron_vow: "quest", reach_a_milestone: "quest",
    fulfill_your_vow: "quest", forsake_your_vow: "quest",
    // Connection
    make_a_connection: "connection", develop_your_relationship: "connection",
    test_your_relationship: "connection", forge_a_bond: "connection",
    // Exploration
    undertake_an_expedition: "exploration", explore_a_waypoint: "exploration",
    finish_an_expedition: "exploration", set_a_course: "exploration",
    // Combat
    enter_the_fray: "combat", gain_ground: "combat", strike: "combat",
    clash: "combat", react_under_fire: "combat", take_decisive_action: "combat",
    battle: "combat",
    // Suffer
    endure_harm: "suffer", endure_stress: "suffer", withstand_damage: "suffer",
    companion_takes_a_hit: "suffer", lose_momentum: "suffer", sacrifice_resources: "suffer",
    // Recover
    sojourn: "recover", heal: "recover", hearten: "recover",
    resupply: "recover", repair: "recover",
    // Threshold
    face_death: "threshold", face_desolation: "threshold", overcome_destruction: "threshold",
    // Legacy
    earn_experience: "legacy", advance: "legacy", continue_a_legacy: "legacy",
    // Fate
    ask_the_oracle: "fate", pay_the_price: "fate",
  };
  return categoryMap[moveId] ?? "adventure";
}

/** Pick a random element from an array. */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
