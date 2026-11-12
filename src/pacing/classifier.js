/**
 * STARFORGED COMPANION
 * src/pacing/classifier.js — Pacing pre-classifier
 *
 * Decides whether a player input warrants a move (MOVE), should be pure
 * narration (NARRATIVE), or is narration with a move available
 * (NARRATIVE_WITH_MOVE_AVAILABLE). One Haiku call per undecorated chat
 * input. Output is structured JSON; the router consumes it.
 *
 * Transport: all Anthropic calls go through src/api-proxy.js per CLAUDE.md.
 * Prompt caching applies to the system prompt (move catalog summary, decision
 * guidance) so subsequent calls in a session are ~10% of the input cost.
 */

import { apiPost } from "../api-proxy.js";
import { getConnection } from "../entities/connection.js";
import { toMoveId } from "../schemas.js";
import { SCENE_CHALLENGE_VARIANTS } from "../moves/sceneChallenge.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL         = "claude-haiku-5-5";

export const PACING_DECISION = Object.freeze({
  MOVE:                          "MOVE",
  NARRATIVE:                     "NARRATIVE",
  NARRATIVE_WITH_MOVE_AVAILABLE: "NARRATIVE_WITH_MOVE_AVAILABLE",
});

export const PACING_CATEGORIES = Object.freeze([
  "combat", "investigation", "exploration", "social", "downtime",
]);

const PACING_DECISION_VALUES = new Set(Object.values(PACING_DECISION));
const PACING_CATEGORY_VALUES = new Set(PACING_CATEGORIES);


// ─────────────────────────────────────────────────────────────────────────────
// DIAL MATH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the effective dial value for a category after the scene override
 * modifier is applied. Returns a number clamped to [0, 10].
 *
 * @param {string} category
 * @param {{dials?: Object, sceneOverride?: {modifier?: number}|null}} pacingConfig
 * @returns {number}
 */
export function effectiveDial(category, pacingConfig) {
  const base = Number(pacingConfig?.dials?.[category] ?? 0);
  const mod  = Number(pacingConfig?.sceneOverride?.modifier ?? 0);
  const raw  = base + mod;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(10, Math.round(raw)));
}


// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — cacheable
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt() {
  return `You are the pacing pre-classifier for an Ironsworn: Starforged tabletop RPG companion. Your sole job is to decide whether a player's input should trigger a Starforged move, be handled as pure narration with no roll, or be handled as narration with a single inline move suggestion.

You decide only IF a move is invoked. You do NOT decide which move the player
ultimately rolls or how strictly it is interpreted — a separate downstream
stage handles that. Do not second-guess yourself on tone or strictness; rely
on the dial values below.

## OUTPUT

Return ONLY a valid JSON object — no preamble, no markdown, no text outside the JSON. Schema:

{
  "decision":      "MOVE" | "NARRATIVE" | "NARRATIVE_WITH_MOVE_AVAILABLE",
  "suggestedMove": "<move id from the MOVE CATALOG>" | null,
  "sceneChallenge": "<the open scene challenge a scene-challenge move is part of, named as the CURRENT SCENE names it>" | null,
  "category":      "combat" | "investigation" | "exploration" | "social" | "downtime",
  "confidence":    <number between 0.0 and 1.0>,
  "reasoning":     "<one short sentence — internal, not shown to the player>"
}

## DECISION GUIDANCE

The pacing dials below are the primary signal and override any default
caution. Treat the dial for the input's category as a strong prior on a 0–10
scale:

  - 9–10: classify as MOVE whenever the player describes a character action —
          reaching, grabbing, hacking, pressing, attempting, speaking with
          stakes, moving toward an outcome. The ONLY exceptions at this dial
          are inputs that contain NO character action: pure observation
          ("I look out the viewport"), internal monologue ("I wonder if…"),
          or scene-atmosphere description with no character verb.
  - 6–8:  classify as MOVE when the narration depicts the character acting
          with intent toward an outcome — pressing for information, taking a
          risk, attempting something with stakes. Otherwise prefer
          NARRATIVE_WITH_MOVE_AVAILABLE and nominate the most likely move.
  - 3–5:  classify as NARRATIVE_WITH_MOVE_AVAILABLE for borderline input;
          reserve MOVE for clear, explicit attempts with stakes.
  - 0–2:  classify as NARRATIVE unless the player has signalled explicit
          intent ("I try to", "I attempt", "I roll to") or stakes are
          unambiguous. At this dial, prefer NARRATIVE even when the outcome
          could matter — let the fiction breathe.

TIE-BREAK: if you have identified a clear suggestedMove AND the input's
category dial is 9 or 10, the answer is MOVE — not NARRATIVE_WITH_MOVE_AVAILABLE.
NWMA is for borderline dials (3–8) and for genuinely ambiguous high-dial
input where the character verb is missing or the action is purely observational.

A Starforged move triggers from FICTION + UNCERTAINTY, but at dial 9–10 the
table has declared this scene type is a high-roll context — do not apply
default narrative caution there. Apply the "outcome not in doubt / too small
to matter" filter only at dial 0–5.

Read commitment from what the player describes, not from whether they used a
specific verb.

COMBAT IS ACTIVE — when the CURRENT SCENE below reports "COMBAT STATUS:
ACTIVE", a fight is underway and this rule OVERRIDES every category dial:

  - Classify as MOVE any input that describes a character action — attacking,
    shooting, striking, maneuvering, taking cover, using gear, or speaking
    with stakes (threatening, demanding, pleading under fire) — in ANY
    category, not just combat. The player's words are their DESIRED outcome, a
    suggestion to the narrator; the roll decides what actually happens.
  - A player may NOT narrate the result of an action against an adversary for
    free. "I gun down the raiders", "I catch one in the arm", "I take out the
    turret" are attempts (MOVE), never accomplished facts (NARRATIVE) — even
    when phrased in the past tense or as a finished deed. This is the whole
    point of combat: outcomes are earned with dice, not asserted.
  - The ONLY inputs that stay NARRATIVE during active combat are those with NO
    character action: pure observation ("the bay fills with smoke"), internal
    monologue ("I wonder if they'll break"), or a question to the narrator.
  - Never answer NARRATIVE_WITH_MOVE_AVAILABLE during active combat — if a move
    is available, the answer is MOVE.

SCENE CHALLENGE IS OPEN — when the CURRENT SCENE below reports "SCENE
CHALLENGE: OPEN", the scene is an extended challenge against a threat or a
time limit (a negotiation, a chase, a heist). A Face Danger or Secure an
Advantage made as part of it is its scene-challenge move: nominate
face_danger_scene_challenge or secure_an_advantage_scene_challenge, not
face_danger / secure_an_advantage, and name the challenge it is part of in
sceneChallenge (null for any other move). A fight is still combat
(enter_the_fray …) even mid-challenge, and any other move is itself. With no
scene challenge open, never nominate them.

READ THE INPUT AGAINST THE RECENT SCENE — a short line takes its meaning from
what it follows. "We're on our way", "let's go", "head there", "wake me when we
get there" after the scene set up a destination is travel toward that
destination; "do it" after an NPC asked for something is doing that thing.
The recent scene is context only: what you classify is the player's input.

MOVEMENT WITH STAKES — if the input expresses movement or travel intent
(setting out, picking a route, closing on a destination) AND there is an
established hazard or explicit time pressure — in the input itself OR the
scene context below — then "if there's a risk, there's a move": classify at
minimum NARRATIVE_WITH_MOVE_AVAILABLE, nominating set_a_course (a known route
to a charted place), undertake_an_expedition (perilous or unknown space, or a
destination that is not charted), or face_danger (crossing an immediate
hazard). At dial 6+ with clear commitment, classify MOVE. The journey must
never resolve for free when the fiction says failure costs something.

TRAVEL TO AN UNCHARTED DESTINATION — a journey toward a destination that is
not one of the CHARTED PLACES below (coordinates someone gave, a rumoured or
unnamed place, the far side of charted space, somewhere the crew has never
been) is an expedition by the rules, hazard or not. When the input sets out,
agrees to go, or skips ahead toward such a destination, classify at minimum
NARRATIVE_WITH_MOVE_AVAILABLE with suggestedMove undertake_an_expedition (MOVE
at dial 6+ with clear commitment) — even when the player says "set a course".
Category: exploration.

A TIME SKIP IS NOT DOWNTIME — "wake me when we get there", "we fly through
the night", "skip to when we arrive" across a journey that has not been made
yet is travel (category exploration), never downtime: the journey still has
to be made. Nominate undertake_an_expedition for an uncharted destination,
set_a_course for a charted one.
Example: "Let's pick the fastest path. Getting there in time is crucial"
through an established debris field → NARRATIVE_WITH_MOVE_AVAILABLE,
suggestedMove set_a_course (or MOVE at dial 6+). NOT plain NARRATIVE.

If recent move density in the scene is high, lean toward NARRATIVE to allow
pacing recovery — don't stack rolls.

If the addressee is a Connection (the player's input talks to, presses, reads,
or reaches toward a named connection), bias toward MOVE in the social category.
Random NPCs do not carry this bias.

## CATEGORY DEFINITIONS

Pick the category from the SITUATION, not the apparatus being used:

- combat:        fighting or under direct attack right now.
- investigation: searching, studying, questioning, analysing for answers.
- exploration:   travel, navigation, route-finding, scanning unknowns,
                 expedition work — including operating ship systems to move
                 through or survey space.
- social:        conversation, persuasion, relationships, negotiation.
- downtime:      ONLY when there are no immediate stakes — rest, repair,
                 resupply, reflection in genuine safety. Never a journey
                 still to be made, however it is skipped over. An activity carried
                 out under an active hazard, deadline, or pursuit is NEVER
                 downtime: classify it by the situation (working the nav
                 computer mid-crisis to thread a debris field = exploration;
                 patching the hull while boarders cut through = combat).

## MOVE CATALOG (shallow)

ADVENTURE
- face_danger: attempt something risky or react to imminent threat
- secure_an_advantage: assess, prepare, or bolster position
- gather_information: search, investigate, or study
- compel: persuade, convince, or threaten
- aid_your_ally: directly assist an ally
- check_your_gear: confirm you have a specific item

QUEST
- swear_an_iron_vow: commit to a quest
- reach_a_milestone: meaningful progress on a vow
- fulfill_your_vow: progress move when vow completes

CONNECTION
- make_a_connection: establish a relationship with an NPC
- develop_your_relationship: deepen a connection
- test_your_relationship: connection strained or tested

EXPLORATION
- undertake_an_expedition: travel through perilous or unknown space, or toward a destination that is not charted
- explore_a_waypoint: examine a notable location during an expedition
- set_a_course: follow a known route to a charted place

SCENE CHALLENGE (only while the CURRENT SCENE reports an open scene challenge)
- face_danger_scene_challenge: face_danger as part of the scene challenge
- secure_an_advantage_scene_challenge: secure_an_advantage as part of the scene challenge

COMBAT
- enter_the_fray: combat begins
- gain_ground: in control, pressing an advantage
- strike: in control, attacking
- clash: in a bad spot, fighting back
- react_under_fire: in a bad spot, reacting to danger
- battle: chaotic engagement in a blur

SUFFER (only when player describes taking damage)
- endure_harm, endure_stress, withstand_damage, sacrifice_resources

RECOVER
- sojourn: recover in a community
- heal: medical care
- hearten: find comfort or peace
- resupply: replenish supplies
- repair: fix vehicles or equipment

FATE
- ask_the_oracle: seek answers or resolve uncertainty (no roll)
- pay_the_price: suffer outcome of a miss (no roll)`;
}


// ─────────────────────────────────────────────────────────────────────────────
// USER MESSAGE — volatile (uncached)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the classifier context packet. Splits the call into a cacheable
 * prefix (the system prompt) and a volatile tail (this user message).
 *
 * @param {Object} args
 * @param {string}   args.playerText
 * @param {Object}   args.campaignState
 * @param {Object|null} args.character
 * @param {{count: number, window: number}} args.recentMoveDensity
 * @param {{dials: Object, sceneOverride?: {modifier:number,label:string}|null}} args.pacingConfig
 * @param {boolean} [args.combatActive] — a fight is open (the COMBAT IS ACTIVE rule)
 * @param {string[]} [args.sceneChallenges] — the open scene challenges' names
 *   (the SCENE CHALLENGE IS OPEN rule — issue #338 D2's variant moves)
 * @param {string} [args.recentScene] — the last few narration cards
 *   (narrator.js getRecentSceneForReading): what the input follows
 * @returns {{systemPrompt: string, userMessage: string, effective: Object}}
 */
export function buildClassifierContext({
  playerText, campaignState, character, recentMoveDensity, pacingConfig,
  combatActive = false, sceneChallenges = [], recentScene = "",
}) {
  const effective = {};
  for (const cat of PACING_CATEGORIES) {
    effective[cat] = effectiveDial(cat, pacingConfig);
  }
  // A fight in progress is a high-roll context regardless of the configured
  // combat dial — pin it to 10 so an in-combat action is never waved through as
  // narration. The cross-category override lives in the COMBAT IS ACTIVE rule.
  if (combatActive) effective.combat = 10;

  const overrideLabel = pacingConfig?.sceneOverride?.label
    ? `${pacingConfig.sceneOverride.label} (${pacingConfig.sceneOverride.modifier >= 0 ? "+" : ""}${pacingConfig.sceneOverride.modifier})`
    : "none";

  const density = recentMoveDensity ?? { count: 0, window: 5 };
  const densityLine = `Last ${density.window} inputs in current scene: ${density.count} were moves.`;

  const connectionLine = formatConnections(campaignState, character);
  const sceneLine      = formatScene(campaignState);
  const chartedLine    = formatChartedPlaces(campaignState);
  const combatLine     = combatActive
    ? "COMBAT STATUS: ACTIVE — a fight is underway. Apply the COMBAT IS ACTIVE rule: any input describing a character action is a MOVE; the player's words are a suggested outcome, not an established fact."
    : null;
  // The open scene challenge, as the fight is given above: within it Face
  // Danger and Secure an Advantage are its own moves (issue #338 D2), and a
  // paced Roll offered the ordinary one (PACING-ROLL-NO-SCENE-CHALLENGE).
  const challenges     = (Array.isArray(sceneChallenges) ? sceneChallenges : [])
    .slice(0, 8)
    .map(name => String(name ?? "").replace(/["\r\n]+/g, " ").trim() || "(unnamed)");
  const challengeLine  = challenges.length
    ? `SCENE CHALLENGE: OPEN — ${challenges.map(n => `"${n}"`).join(", ")}. Apply the SCENE CHALLENGE IS OPEN rule: a Face Danger or Secure an Advantage made as part of it is its scene-challenge move.`
    : null;

  const parts = [
    "## PACING DIALS (effective values)",
    `combat:        ${effective.combat}/10`,
    `investigation: ${effective.investigation}/10`,
    `exploration:   ${effective.exploration}/10`,
    `social:        ${effective.social}/10`,
    `downtime:      ${effective.downtime}/10`,
    `Scene override: ${overrideLabel}`,
    "",
    "## RECENT MOVE DENSITY",
    densityLine,
    "If density is high, lean toward NARRATIVE to allow pacing recovery.",
    "",
    "## CHARACTER",
    character?.name ? `Name: ${character.name}` : "Name: (none set)",
    connectionLine,
    "",
    "## CURRENT SCENE",
    ...(combatLine ? [combatLine] : []),
    ...(challengeLine ? [challengeLine] : []),
    sceneLine || "(no scene context available)",
    chartedLine,
    "",
    ...(typeof recentScene === "string" && recentScene.trim()
      ? ["## RECENT SCENE (what the input follows — context only; classify the PLAYER INPUT)", recentScene.trim(), ""]
      : []),
    "## PLAYER INPUT",
    `"${(playerText ?? "").trim()}"`,
  ];

  return {
    systemPrompt: buildSystemPrompt(),
    userMessage:  parts.join("\n"),
    effective,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN CLASSIFY FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a player input. Returns a structured decision suitable for the
 * pacing router. Never throws — on any failure returns a safe MOVE decision
 * so the existing pipeline still runs (failures should not silently swallow
 * gameplay).
 *
 * @param {Object} args
 * @param {string} args.playerText
 * @param {Object} args.campaignState
 * @param {Object|null} args.character
 * @param {{count:number, window:number}} args.recentMoveDensity
 * @param {{dials:Object, sceneOverride?: Object|null}} args.pacingConfig
 * @param {string} args.apiKey
 * @param {string} [args.model]
 * @param {boolean} [args.combatActive]
 * @param {string[]} [args.sceneChallenges] — the open scene challenges' names
 * @returns {Promise<{
 *   decision: string,
 *   suggestedMove: string|null,
 *   category: string,
 *   confidence: number,
 *   reasoning: string,
 *   fallback?: boolean,
 *   errorMessage?: string,
 * }>}
 */
export async function classifyInput({
  playerText, campaignState, character, recentMoveDensity, pacingConfig,
  apiKey, model, combatActive = false, sceneChallenges = [], recentScene = "",
}) {
  if (!apiKey)             return fallbackDecision("missing api key");
  if (!playerText?.trim()) return fallbackDecision("empty input");

  const { systemPrompt, userMessage } = buildClassifierContext({
    playerText, campaignState, character, recentMoveDensity, pacingConfig, combatActive, sceneChallenges, recentScene,
  });

  try {
    const text = await callClassifierAPI({
      apiKey,
      systemPrompt,
      userMessage,
      // Its own model — never a world's stored `api.model` (schemas.js).
      model: model ?? MODEL,
    });
    const result = parseDecision(text);
    // A scene-challenge move named with no challenge open is the ordinary
    // move it varies — the pipeline makes it so (moveOutsideSceneChallenge),
    // and the Roll button must not offer a move that will not be made.
    const ordinary = SCENE_CHALLENGE_VARIANTS[result.suggestedMove];
    if (ordinary && !(Array.isArray(sceneChallenges) && sceneChallenges.length)) result.suggestedMove = ordinary;
    return result;
  } catch (err) {
    console.warn(`starforged-companion | pacing classifier: API call failed; defaulting to MOVE:`, err);
    return fallbackDecision(err?.message ?? "api error");
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// API CALL
// ─────────────────────────────────────────────────────────────────────────────

async function callClassifierAPI({ apiKey, systemPrompt, userMessage, model }) {
  const body = {
    model,
    max_tokens: 330,   // was 250 — Haiku 5.5 counts the same text as about 30% more tokens than Haiku 4.5
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userMessage }],
  };

  const headers = {
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-beta":    "prompt-caching-2024-07-31",
  };

  const data = await apiPost(ANTHROPIC_URL, headers, body);
  const text = (data.content ?? [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");
  if (!text) throw new Error("Pacing classifier returned no text content.");
  return text;
}


// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE PARSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse and validate the JSON response. Falls back to a safe MOVE decision on
 * any malformed or unexpected output so the move pipeline always runs.
 */
function parseDecision(rawText) {
  let parsed;
  try {
    const cleaned = String(rawText ?? "").replace(/```(?:json)?|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return fallbackDecision("unparseable JSON");
  }

  if (!parsed || typeof parsed !== "object") return fallbackDecision("non-object JSON");

  const decision = String(parsed.decision ?? "").toUpperCase();
  if (!PACING_DECISION_VALUES.has(decision)) return fallbackDecision(`unknown decision: ${parsed.decision}`);

  const category = String(parsed.category ?? "").toLowerCase();
  const safeCategory = PACING_CATEGORY_VALUES.has(category) ? category : "exploration";

  // The suggestion becomes a move id downstream (the NWMA card's Roll button
  // posts it as forcedMoveId; the PC-directed social-move check keys on it), so
  // a display name maps to its MOVES key and anything that names no move is
  // dropped (issue #321 U45).
  const suggestedMove = decision === PACING_DECISION.MOVE || decision === PACING_DECISION.NARRATIVE_WITH_MOVE_AVAILABLE
    ? toMoveId(parsed.suggestedMove)
    : null;

  const confidence = clampConfidence(parsed.confidence);

  // The scene challenge a scene-challenge nomination is part of, by name: the
  // router resolves it against the open challenges, and the paced card's Roll
  // carries it as the move's target (PACED-VARIANT-NO-TARGET).
  const sceneChallenge = typeof parsed.sceneChallenge === "string" && parsed.sceneChallenge.trim()
    ? parsed.sceneChallenge.trim().slice(0, 80)
    : null;

  return {
    decision,
    suggestedMove,
    sceneChallenge,
    category:   safeCategory,
    confidence,
    reasoning:  String(parsed.reasoning ?? "").slice(0, 280),
  };
}

function clampConfidence(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/**
 * Safe fallback decision. Returns MOVE so the existing pipeline still runs
 * when the classifier cannot reach a verdict — better to roll than to swallow
 * the player's input.
 */
function fallbackDecision(reason) {
  return {
    decision:      PACING_DECISION.MOVE,
    suggestedMove: null,
    category:      "exploration",
    confidence:    0,
    reasoning:     `fallback: ${reason}`,
    fallback:      true,
    errorMessage:  reason,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT EXTRACTION — minimal pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatConnections(campaignState, _character) {
  const ids = campaignState?.connectionIds ?? [];
  if (!ids.length) return "Connections: (none recorded)";
  // Connections are NPC-card Actors (FOLDER-002): read each record through its
  // host id (issue #321 U44 — they were looked up in game.journal, so the
  // classifier only ever saw "names unavailable" and its addressee-is-a-
  // Connection rule never fired). getConnection never throws.
  const names = [];
  for (const id of ids.slice(0, 8)) {
    const data = getConnection(id);
    if (!data?.name) continue;
    // Its disposition — the field the record holds (issue #325 W22).
    const status = data.disposition ?? "";
    names.push(status ? `${data.name} (${status})` : data.name);
  }
  return `Connections: ${names.length ? names.join(", ") : `${ids.length} active (names unavailable)`}`;
}

// The most charted places the classifier is told of.
const CHARTED_PLACES_CAP = 12;

/**
 * The charted, known places — the TRAVEL TO AN UNCHARTED DESTINATION rule
 * tells travel to one of them (Set a Course) from travel anywhere else (an
 * expedition) by this list (issue #348 PT05). The tracked settlements,
 * planets and locations, the active sector's first, without the sites still
 * unexplored (on the map only as "Unexplored Site"). Read through each
 * place's host Actor, as the current location is. Never throws.
 *
 * @param {Object} campaignState
 * @returns {string}
 */
function formatChartedPlaces(campaignState) {
  const places = [];
  try {
    const activeSectorId = campaignState?.activeSectorId ?? null;
    for (const [type, ids] of [["settlement", campaignState?.settlementIds], ["planet", campaignState?.planetIds], ["location", campaignState?.locationIds]]) {
      for (const id of Array.isArray(ids) ? ids : []) {
        const actor = globalThis.game?.actors?.get?.(id);
        const data  = actor?.flags?.["starforged-companion"]?.[type];
        const name  = data?.name ?? actor?.name;
        if (!name) continue;
        if (type === "location" && String(data?.status ?? "").toLowerCase() === "unexplored") continue;
        places.push({ name: String(name).replace(/[\r\n]+/g, " ").trim(), here: !!activeSectorId && data?.sectorId === activeSectorId });
      }
    }
  } catch (err) {
    console.warn(`starforged-companion | pacing classifier: charted-place read failed:`, err?.message ?? err);
  }
  const names = [...places.filter(p => p.here), ...places.filter(p => !p.here)].map(p => p.name).filter(Boolean);
  const unique = [...new Set(names)];
  if (!unique.length) return "Charted places: (none recorded)";
  const shown = unique.slice(0, CHARTED_PLACES_CAP);
  return `Charted places: ${shown.join(", ")}${unique.length > shown.length ? `, +${unique.length - shown.length} more` : ""}`;
}

function formatScene(campaignState) {
  const parts = [];
  if (campaignState?.currentLocationId && campaignState?.currentLocationType) {
    try {
      const id   = campaignState.currentLocationId;
      const type = campaignState.currentLocationType;
      // Post-PR#100 location-family entities are Actors; pre-migration
      // records were JournalEntries. Try both hosts, tolerate either.
      const actor = globalThis.game?.actors?.get?.(id);
      const entry = globalThis.game?.journal?.get?.(id);
      const data  = actor?.flags?.["starforged-companion"]?.[type]
        ?? entry?.pages?.contents?.[0]?.flags?.["starforged-companion"]?.[type];
      const name  = data?.name ?? actor?.name ?? entry?.name;
      if (name) parts.push(`Current location: ${name} (${type})`);
    } catch (err) {
      console.warn(`starforged-companion | pacing classifier: current-location read failed:`, err);
    }
  }

  // Narrator-memory scene frame (Cluster A4) — gives the classifier the
  // established-hazard / time-pressure signal the MOVEMENT WITH STAKES rule
  // keys on (F9: travel was waved through as plain NARRATIVE because the
  // classifier had no scene stakes context).
  const frame = campaignState?.sceneFrame;
  if (frame && typeof frame === "object") {
    if (frame.location)  parts.push(`Scene frame — where: ${frame.location}`);
    if (Array.isArray(frame.present) && frame.present.length) {
      parts.push(`Scene frame — present: ${frame.present.join(", ")}`);
    }
    if (frame.situation) parts.push(`Scene frame — now: ${frame.situation}`);
  }

  if (campaignState?.xCardActive) parts.push("X-Card is active — scene paused.");
  return parts.join("\n");
}
