/**
 * STARFORGED COMPANION
 * src/moves/interpreter.js — Claude API call: narration → move identification
 *
 * Responsibilities:
 * - Build the interpretation prompt from player narration + campaign context
 * - Apply mischief dial framing via mischief.js
 * - Call the Claude API and parse the structured response
 * - Return a partial MoveResolutionSchema ready for resolver.js
 *
 * The module never overrides player intent — interpretation is a suggestion.
 * The confirmation UI (ui/settingsPanel.js) lets the player accept or change it.
 *
 * Mischief is applied silently. The player sees the result, not the framing.
 */

import { MOVES, STATS } from "../schemas.js";
import { buildMischiefFraming } from "./mischief.js";
import { apiPost } from "../api-proxy.js";
import { getCanonicalMove } from "../system/ironswornPacks.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL         = "claude-haiku-4-5-20251001";

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


// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the system prompt for the move interpreter.
 * This is the stable, cacheable portion of every interpretation call.
 * It contains the full move reference and interpretation rules.
 *
 * Prompt caching: this string is long and changes rarely.
 * It is sent as a cache_control: ephemeral block on every call.
 * After the first call, cache hits cost ~10% of normal input price.
 */
function buildSystemPrompt() {
  return `You are the move interpreter for an Ironsworn: Starforged tabletop RPG campaign. Your job is to read a player's narration and identify the single most appropriate Starforged move, along with the best stat to roll.

## YOUR TASK

Given player narration, return a JSON object identifying:
- The move (from the valid move list below)
- The stat to roll (from edge/heart/iron/shadow/wits, or a special meter)
- Your reasoning (internal only — not shown to the player)

## MOVE REFERENCE

### ADVENTURE MOVES
- **face_danger** — When you attempt something risky or react to an imminent threat. Use the stat that fits your approach: edge (speed/agility), heart (resolve/social), iron (force/endurance), shadow (stealth/deception), wits (expertise/observation).
- **secure_an_advantage** — When you assess a situation, make preparations, or bolster your position. Same stat options as face_danger.
- **gather_information** — When you search, investigate, or study. Roll +wits.
- **compel** — When you try to persuade, convince, or threaten someone. Roll +heart (charm/appeal), +iron (force/intimidation), or +shadow (deception/manipulation).
- **aid_your_ally** — When you act in direct support of an ally. You resolve this as Secure an Advantage (or Gain Ground in combat) and, on a hit, the ally takes the benefits. This IS a rolled action move: pick the stat that fits your approach — edge, heart, iron, shadow, or wits. Never leave statUsed null for this move.
- **check_your_gear** — When you check if you have a specific item. Roll +supply.

### QUEST MOVES
- **swear_an_iron_vow** — When you commit to a quest or promise. Roll +heart.
- **reach_a_milestone** — When you make meaningful progress on a vow (no roll).
- **fulfill_your_vow** — Progress move. When a vow is complete, compare progress to challenge dice.
- **forsake_your_vow** — When you abandon a vow (no roll, narrative consequences).

### CONNECTION MOVES
- **make_a_connection** — When you establish a relationship with an NPC. Roll +heart.
- **develop_your_relationship** — When you deepen a connection (no roll, mark progress).
- **test_your_relationship** — When a connection is strained or tested. Roll +heart.
- **forge_a_bond** — Progress move. When you cement a bond, compare progress to challenge dice.

### EXPLORATION MOVES
- **undertake_an_expedition** — When you travel through perilous or unknown space/terrain. Roll +edge (speed), +shadow (stealth), or +wits (vigilance).
- **explore_a_waypoint** — When you examine a notable location during an expedition. Roll +wits.
- **finish_an_expedition** — Progress move. When an expedition concludes.
- **set_a_course** — When you follow a known route. Roll +supply.
- **make_a_discovery** — Triggered by strong hit with match on explore_a_waypoint (no roll).
- **confront_chaos** — Triggered by miss with match on explore_a_waypoint (no roll).

### COMBAT MOVES
- **enter_the_fray** — When combat begins. Roll +edge (mobile), +heart (facing off), +iron (close quarters), +shadow (ambush), or +wits (sizing up).
- **gain_ground** — When in control, pressing an advantage. Roll +edge (pursuit), +heart (bold action), +iron (force), +shadow (ambush), or +wits (tactics).
- **strike** — When in control, attacking. Roll +iron (close) or +edge (ranged).
- **clash** — When in a bad spot, fighting back. Roll +iron (close) or +edge (ranged).
- **react_under_fire** — When in a bad spot, reacting to danger. Roll +edge (evasion), +heart (resolve), +iron (take the hit), +shadow (hide/distract), or +wits (improvise).
- **take_decisive_action** — Progress move. When seizing a combat objective.
- **face_defeat** — When abandoning a combat objective (no roll).
- **battle** — When fighting a chaotic engagement in a blur. Roll +edge/heart/iron/shadow/wits.

### SUFFER MOVES (triggered by other moves or situations)
- **lose_momentum** — When delayed or disadvantaged.
- **endure_harm** — When facing physical injury. Roll +health or +iron (whichever is higher).
- **endure_stress** — When facing mental strain. Roll +spirit or +heart (whichever is higher).
- **withstand_damage** — When your vehicle takes damage. Roll +integrity.
- **companion_takes_a_hit** — When your companion is harmed. Roll +companion_health.
- **sacrifice_resources** — When losing supplies (no roll).

### RECOVER MOVES
- **sojourn** — When recovering in a community. Roll +heart.
- **heal** — When receiving or providing medical care. Roll +iron or +wits or +heart (situation dependent).
- **hearten** — When finding comfort or peace. Roll +heart.
- **resupply** — When replenishing supplies. Roll +heart/iron/shadow/wits (approach dependent).
- **repair** — When fixing vehicles or equipment. Roll +wits or +supply.

### THRESHOLD MOVES
- **face_death** — When at the brink of death. Roll +heart.
- **face_desolation** — When at the brink of desolation. Roll +heart.
- **overcome_destruction** — Progress move. When your command vehicle is destroyed.

### LEGACY MOVES
- **earn_experience** — When filling a legacy box (no roll).
- **advance** — When spending experience on assets (no roll).
- **continue_a_legacy** — Progress move. When retiring or dying.

### FATE MOVES
- **ask_the_oracle** — When seeking answers or resolving uncertainty (no roll).
- **pay_the_price** — When suffering the outcome of a miss (no roll, narrative/table).

## STAT GUIDE
- **edge** — Speed, agility, mobility. Dodging, fast travel, quick draws, ranged attacks.
- **heart** — Resolve, empathy, leadership, sociability. Persuasion, morale, community.
- **iron** — Strength, endurance, aggression. Forcing through, close combat, physical hardship.
- **shadow** — Deception, stealth, cunning. Hiding, trickery, manipulation, ambush.
- **wits** — Expertise, observation, focus. Investigation, careful tactics, technical knowledge.

## INTERPRETATION RULES
1. Match the player's INTENT, not their exact words. "I punch the guard" → strike or clash depending on combat position.
2. For ambiguous situations, prefer the move that creates the most interesting mechanical outcome.
3. Session/legacy/fate moves (begin_a_session, earn_experience, ask_the_oracle, pay_the_price) are only chosen when the narration is explicitly about those activities.
4. If the narration describes a reaction to danger, prefer face_danger or react_under_fire over gather_information.
5. Suffer moves are only chosen when the player is explicitly describing taking damage/stress, not when they're trying to avoid it.
6. COMBAT POSITION: when the user message includes a COMBAT POSITION directive, you MUST pick a combat move that is available for that position. Strike and Gain Ground are available only when IN CONTROL; Clash and React Under Fire are available only when IN A BAD SPOT. Take Decisive Action (seize the objective) and Face Defeat (give up) are available in either position. Non-combat moves remain available when the narration clearly calls for one.

## RESPONSE FORMAT
Respond with ONLY a valid JSON object. No preamble, no markdown, no explanation outside the JSON.

{
  "moveId": "face_danger",
  "moveName": "Face Danger",
  "statUsed": "wits",
  "statValue": 0,
  "adds": 0,
  "isProgressMove": false,
  "progressTicks": 0,
  "moveTarget": null,
  "expeditionRank": null,
  "combatRank": null,
  "rationale": "Player is threading their ship through a debris field — risky navigation requiring focus and observation.",
  "mischiefApplied": false,
  "confidence": "high"
}

confidence: "high" | "medium" | "low" — your certainty in the interpretation.
statValue: ALWAYS leave as 0 — filled in by the calling code (from the character sheet for action moves, from the live progress track / vow / connection data for progress moves — see enrichInterpretationStatValue and enrichProgressTicks in src/moves/statEnrichment.js). Module data is ground truth; never estimate a value.
progressTicks: ALWAYS leave as 0 — for progress moves the module fills the score from the live track / vow / connection data. Never estimate a tick count.
moveTarget: the named thing the move acts on, taken from the player's narration. For movement moves (set_a_course, undertake_an_expedition, finish_an_expedition): the named destination ("Bleakhold Station", "the Vault of Tears"). For progress and quest moves: take_decisive_action → the foe or fight named, fulfill_your_vow / reach_a_milestone → the vow's name, forge_a_bond / develop_your_relationship → the connection's name. null when nothing is named or implied.
expeditionRank: only for undertake_an_expedition. When the narration implies the journey's scope, infer its rank — "troublesome" (a short, easy hop), "dangerous" (default), "formidable" (a long or hostile crossing), "extreme", or "epic" (a vast, perilous undertaking). null otherwise; the player can re-rank the track later.
combatRank: only for enter_the_fray. When the narration implies the foe’s danger level, infer its rank — "troublesome" (minor, easy to defeat), "dangerous" (default), "formidable" (a tough, seasoned opponent), "extreme" (an overwhelming threat), or "epic" (near-impossible odds). null otherwise; the player can re-rank the combat track later.`;
}


// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a compact campaign context summary to include in the user message.
 * This changes every call (different narration, possibly different state)
 * so it is NOT cached — it's the variable portion of the prompt.
 *
 * Kept short by design — the system prompt already has the full move reference.
 * This just gives the interpreter enough context to make good choices.
 */
function buildContextSummary(campaignState) {
  const lines = [];

  // Active vows — helps identify reach_a_milestone and fulfill_your_vow
  const activeTracks = (campaignState.progressTrackIds ?? []);
  if (activeTracks.length) {
    lines.push(`Active progress tracks: ${activeTracks.length} open (vows, expeditions, combats).`);
  }

  // Current session mischief level (informational — actual framing in system prompt)
  if (campaignState.currentSessionId) {
    lines.push(`Session active.`);
  }

  return lines.length ? lines.join(" ") : "New campaign — no active tracks yet.";
}


// ─────────────────────────────────────────────────────────────────────────────
// COMBAT POSITION CONSTRAINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the variable per-call directive that tells the interpreter the
 * character's current combat position and which combat moves are available.
 * This goes in the USER message — the system prompt is cached and must stay
 * position-agnostic. Returns "" when there is no single active combat
 * (combatPosition is null), so out-of-combat interpretation is unchanged.
 *
 * @param {'in_control'|'bad_spot'|null} combatPosition
 * @returns {string}
 */
export function buildCombatPositionDirective(combatPosition) {
  if (combatPosition === "in_control") {
    return [
      "COMBAT POSITION: The character is currently IN CONTROL.",
      "Available combat moves: strike (attack a foe), gain_ground (press an advantage / maneuver), take_decisive_action (seize the objective).",
      "Do NOT choose clash or react_under_fire — those are available only in a bad spot.",
      "If the narration is an attack, choose strike; if it presses an advantage or maneuvers, choose gain_ground.",
    ].join(" ");
  }
  if (combatPosition === "bad_spot") {
    return [
      "COMBAT POSITION: The character is currently IN A BAD SPOT.",
      "Available combat moves: clash (fight back against a dominating foe), react_under_fire (respond to an imminent threat), take_decisive_action (seize the objective), face_defeat (give up the objective).",
      "Do NOT choose strike or gain_ground — those are available only when in control.",
      "If the narration is an attack, choose clash; if it reacts to or evades danger, choose react_under_fire.",
    ].join(" ");
  }
  return "";
}

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


// ─────────────────────────────────────────────────────────────────────────────
// MAIN INTERPRET FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a canonical-move grounding block for inclusion in the interpreter
 * user message. When the foundry-ironsworn `starforged-moves` compendium
 * contains an Item matching `slug`, its description is wrapped in a
 * `<canonical_move>...</canonical_move>` tag the model can ground against.
 *
 * Returns "" when the slug is missing, no system is installed, or the
 * compendium document has no description text. Never throws.
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
  const description =
    doc.system?.description
    ?? doc.system?.text
    ?? doc.system?.Text?.text
    ?? "";
  if (!description) return "";
  return `<canonical_move>\n${String(description).trim()}\n</canonical_move>`;
}

/**
 * Interpret player narration as a Starforged move.
 *
 * @param {string} narration       — raw player input (typed or transcribed)
 * @param {Object} options
 * @param {Object} options.campaignState   — CampaignStateSchema
 * @param {string} options.mischiefLevel   — "serious" | "balanced" | "chaotic"
 * @param {string} options.apiKey          — Claude API key
 * @param {string} [options.expectedMoveSlug] — When provided (e.g. on a
 *   re-interpretation pass after the player overrode the move in the
 *   confirmation dialog), the canonical move text from foundry-ironsworn
 *   is injected as a `<canonical_move>` block to ground the response.
 * @param {('in_control'|'bad_spot'|null)} [options.combatPosition] — The active
 *   combat track's position (from getActiveCombatPosition()). When set, the
 *   interpreter is steered to a position-appropriate combat move and the result
 *   is forced legal via constrainMoveToPosition(). null = no constraint.
 * @returns {Promise<Object>}      — partial MoveResolutionSchema (no dice yet)
 */
export async function interpretMove(narration, {
  campaignState, mischiefLevel, apiKey, expectedMoveSlug, combatPosition = null,
}) {
  if (!apiKey) throw new Error("Claude API key not configured. Set it in module settings.");
  if (!narration?.trim()) throw new Error("No narration to interpret.");

  const systemPrompt = buildSystemPrompt();
  const mischiefFraming = buildMischiefFraming(mischiefLevel, narration);
  const contextSummary  = buildContextSummary(campaignState);
  const combatDirective = buildCombatPositionDirective(combatPosition);
  const canonicalBlock  = expectedMoveSlug
    ? await buildCanonicalMoveBlock(expectedMoveSlug)
    : "";

  // User message: context + mischief framing + combat-position directive +
  // canonical block + narration. Mischief framing is invisible to the player —
  // it shapes how the model reads the input. The combat directive (empty out of
  // combat) restricts the candidate combat moves to the current position.
  const userMessage = [
    contextSummary,
    mischiefFraming,
    combatDirective,
    canonicalBlock,
    `Player narration: "${narration}"`,
  ].filter(Boolean).join("\n\n");

  const response = await callClaudeAPI({
    apiKey,
    systemPrompt,
    userMessage,
    model: campaignState.api?.model ?? MODEL,
    maxTokens: campaignState.api?.maxTokens ?? 1000,
    promptCachingEnabled: campaignState.api?.promptCachingEnabled ?? true,
  });

  const parsed = parseInterpretation(response, narration, mischiefLevel, combatPosition);
  return parsed;
}


// ─────────────────────────────────────────────────────────────────────────────
// API CALL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call the Claude API with optional prompt caching on the system prompt.
 * Prompt caching is applied to the system prompt block — it's long and stable.
 *
 * @param {Object} params
 * @returns {Promise<string>}  — raw text content from the API response
 */

async function callClaudeAPI({ apiKey, systemPrompt, userMessage, model, maxTokens, promptCachingEnabled }) {
  const systemBlock = promptCachingEnabled
    ? [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }]
    : [{ type: "text", text: systemPrompt }];

  const body = {
    model,
    max_tokens: maxTokens,
    system:     systemBlock,
    messages:   [{ role: "user", content: userMessage }],
  };

  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
    ...(promptCachingEnabled ? { "anthropic-beta": "prompt-caching-2024-07-31" } : {}),
  };

  const data = await apiPost(ANTHROPIC_URL, headers, body);

  const text = (data.content ?? [])
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("");

  if (!text) throw new Error("Claude API returned no text content.");
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE PARSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse and validate the Claude API response into a partial MoveResolution.
 * Strips any markdown fences, validates the move ID and stat, and fills
 * in derived fields (moveName, isProgressMove).
 *
 * Falls back gracefully if the response is malformed — returns face_danger +wits
 * with a note so the confirmation UI can catch it.
 */
function parseInterpretation(rawText, originalNarration, mischiefLevel, combatPosition = null) {
  let parsed;

  try {
    // Strip markdown code fences if present (model sometimes adds them)
    const cleaned = rawText.replace(/```(?:json)?|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn("Starforged Companion | Failed to parse API response as JSON:", rawText);
    return fallbackInterpretation(originalNarration, mischiefLevel);
  }

  // Validate move ID
  const moveData = MOVES[parsed.moveId];
  if (!moveData) {
    console.warn(`Starforged Companion | Unknown move ID in response: ${parsed.moveId}`);
    return fallbackInterpretation(originalNarration, mischiefLevel);
  }

  // Force the move to be legal for the current combat position. The prompt
  // already steers the model; this guarantees a wrong-position attack/maneuver
  // is remapped to its same-position counterpart (see constrainMoveToPosition).
  const requestedMoveId  = parsed.moveId;
  parsed.moveId          = constrainMoveToPosition(parsed.moveId, combatPosition);
  const positionRemapped = parsed.moveId !== requestedMoveId;
  const finalMoveData    = MOVES[parsed.moveId] ?? moveData;

  // Validate stat (null is valid for progress/narrative moves)
  const statValid = parsed.statUsed === null
    || STATS.includes(parsed.statUsed)
    || ["supply", "integrity", "health", "spirit", "companion_health"].includes(parsed.statUsed);

  if (!statValid) {
    console.warn(`Starforged Companion | Unknown stat in response: ${parsed.statUsed}`);
    parsed.statUsed = finalMoveData.stat?.[0] ?? "wits";
  }

  const baseRationale = parsed.rationale ?? parsed.interpretationRationale ?? "";
  const rationale = positionRemapped
    ? `${baseRationale}${baseRationale ? " " : ""}(Adjusted to ${toDisplayName(parsed.moveId)} — you are ${combatPosition === "bad_spot" ? "in a bad spot" : "in control"}.)`
    : baseRationale;

  return {
    playerNarration:        originalNarration,
    inputMethod:            "chat",
    mischiefLevel,
    moveId:                 parsed.moveId,
    moveName:               toDisplayName(parsed.moveId),
    statUsed:               parsed.statUsed,
    statValue:              parsed.statValue ?? 0,       // Filled in by enrichInterpretationStatValue (see src/moves/statEnrichment.js); model is instructed to leave it 0
    adds:                   parsed.adds ?? 0,
    isProgressMove:         finalMoveData.progressMove === true,
    progressTicks:          parsed.progressTicks ?? 0,
    moveTarget:              typeof parsed.moveTarget === "string" && parsed.moveTarget.trim() ? parsed.moveTarget.trim() : null,
    expeditionRank:          typeof parsed.expeditionRank === "string" && parsed.expeditionRank.trim() ? parsed.expeditionRank.trim().toLowerCase() : null,
    combatRank:              typeof parsed.combatRank === "string" && parsed.combatRank.trim() ? parsed.combatRank.trim().toLowerCase() : null,
    rationale,
    mischiefApplied:        parsed.mischiefApplied ?? false,
    confidence:             parsed.confidence ?? "medium",
    positionConstraintApplied: positionRemapped,         // true when a wrong-position move was remapped
    playerConfirmed:        false,                       // Set to true after confirmation UI
  };
}

/**
 * Safe fallback interpretation when the API response cannot be parsed.
 * Defaults to Face Danger +wits — the most common adventure move.
 * Low confidence flags it for the confirmation UI to highlight.
 */
function fallbackInterpretation(narration, mischiefLevel) {
  return {
    playerNarration:         narration,
    inputMethod:             "chat",
    mischiefLevel,
    moveId:                  "face_danger",
    moveName:                "Face Danger",
    statUsed:                "wits",
    statValue:               0,
    adds:                    0,
    isProgressMove:          false,
    progressTicks:           0,
    moveTarget:              null,
    expeditionRank:          null,
    combatRank:              null,
    rationale:               "Fallback — API response could not be parsed.",
    mischiefApplied:         false,
    confidence:              "low",
    playerConfirmed:         false,
  };
}

/**
 * Convert a move ID to its display name.
 * e.g. "face_danger" → "Face Danger"
 */
function toDisplayName(moveId) {
  return moveId
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
