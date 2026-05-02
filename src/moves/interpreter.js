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

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL         = "claude-haiku-4-5-20251001";


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
- **aid_your_ally** — When you directly assist an ally. Triggers Secure an Advantage or Gain Ground for them.
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
  "rationale": "Player is threading their ship through a debris field — risky navigation requiring focus and observation.",
  "mischiefApplied": false,
  "confidence": "high"
}

confidence: "high" | "medium" | "low" — your certainty in the interpretation.
statValue: leave as 0 — filled in from character sheet by the calling code.
progressTicks: only relevant for progress moves — leave as 0 otherwise.`;
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
// MAIN INTERPRET FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interpret player narration as a Starforged move.
 *
 * @param {string} narration       — raw player input (typed or transcribed)
 * @param {Object} options
 * @param {Object} options.campaignState  — CampaignStateSchema
 * @param {string} options.mischiefLevel  — "serious" | "balanced" | "chaotic"
 * @param {string} options.apiKey         — Claude API key
 * @returns {Promise<Object>}      — partial MoveResolutionSchema (no dice yet)
 */
export async function interpretMove(narration, { campaignState, mischiefLevel, apiKey }) {
  if (!apiKey) throw new Error("Claude API key not configured. Set it in module settings.");
  if (!narration?.trim()) throw new Error("No narration to interpret.");

  const systemPrompt = buildSystemPrompt();
  const mischiefFraming = buildMischiefFraming(mischiefLevel, narration);
  const contextSummary  = buildContextSummary(campaignState);

  // User message: context + mischief framing + narration
  // Mischief framing is invisible to the player — it shapes how the model reads the input
  const userMessage = [
    contextSummary,
    mischiefFraming,
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

  const parsed = parseInterpretation(response, narration, mischiefLevel);
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
function parseInterpretation(rawText, originalNarration, mischiefLevel) {
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

  // Validate stat (null is valid for progress/narrative moves)
  const statValid = parsed.statUsed === null
    || STATS.includes(parsed.statUsed)
    || ["supply", "integrity", "health", "spirit", "companion_health"].includes(parsed.statUsed);

  if (!statValid) {
    console.warn(`Starforged Companion | Unknown stat in response: ${parsed.statUsed}`);
    parsed.statUsed = moveData.stat?.[0] ?? "wits";
  }

  return {
    playerNarration:        originalNarration,
    inputMethod:            "chat",
    mischiefLevel,
    moveId:                 parsed.moveId,
    moveName:               toDisplayName(parsed.moveId),
    statUsed:               parsed.statUsed,
    statValue:              parsed.statValue ?? 0,       // Filled from character sheet in pipeline
    adds:                   parsed.adds ?? 0,
    isProgressMove:         moveData.progressMove === true,
    progressTicks:          parsed.progressTicks ?? 0,
    rationale:               parsed.rationale ?? parsed.interpretationRationale ?? "",
    mischiefApplied:        parsed.mischiefApplied ?? false,
    confidence:             parsed.confidence ?? "medium",
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
