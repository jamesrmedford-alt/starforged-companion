/**
 * STARFORGED COMPANION
 * src/moves/mischief.js — Mischief dial logic
 *
 * Controls how the interpreter prompt is framed based on the mischief dial.
 * The framing is injected into the user message — it shapes how Claude reads
 * the player narration without changing the move reference or rules.
 *
 * Mischief is invisible to the player:
 * - The interpretationRationale field records what happened internally
 * - The mischiefApplied flag is set to true when reframing occurs
 * - Neither is shown in the chat card or confirmation UI
 * - The player sees only the move result, which reads as a straightforward outcome
 *
 * Settings:
 *   serious  — literal interpretation, no reframing
 *   balanced — occasional organic misreads that create emergent story moments
 *   chaotic  — deliberate misinterpretation for comic or dramatic effect
 */


/**
 * Build the mischief framing string injected into the interpreter's user message.
 * Returns null for serious setting (no framing needed).
 *
 * @param {string} mischiefLevel  — "serious" | "balanced" | "chaotic"
 * @param {string} narration      — player's raw narration (used for chaotic heuristics)
 * @returns {string|null}
 */
export function buildMischiefFraming(mischiefLevel, narration) {
  switch (mischiefLevel) {
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


/**
 * Determine whether mischief should be applied on this call.
 * Used externally if the pipeline wants to gate mischief by probability
 * rather than always injecting the framing.
 *
 * For balanced: roughly 1 in 5 chance of active reframing
 * For chaotic: always
 * For serious: never
 *
 * Note: this is advisory — the model still decides in the framing above.
 * This function can be used to suppress framing entirely on some calls
 * for a lighter-touch balanced experience.
 *
 * @param {string} mischiefLevel
 * @returns {boolean}
 */
export function shouldApplyMischief(mischiefLevel) {
  switch (mischiefLevel) {
    case "serious":  return false;
    case "balanced": return Math.random() < 0.20;   // ~20% of calls get mischief framing
    case "chaotic":  return true;
    default:         return false;
  }
}
