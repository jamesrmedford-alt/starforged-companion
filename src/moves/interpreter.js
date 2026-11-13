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

import { MOVES, STATS, toMoveId } from "../schemas.js";
import { buildMischiefFraming } from "./mischief.js";
import { apiPost } from "../api-proxy.js";
import { getCanonicalMove } from "../system/ironswornPacks.js";
import { getPlayerActors, readVows, listSupportVehicleAssets, listCompanionAssets, companionGivenName, isPlayerCharacterActor } from "../character/actorBridge.js";
import { moveDisplayName } from "../system/i18n.js";
import { normaliseStakes, withPriceSource } from "./stakes.js";

const MODULE_ID     = "starforged-companion";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Heal's four situations (vendored Heal): each rolls its own stat.
const HEAL_SITUATIONS = new Set(["self", "treated", "companion", "ally"]);
const MODEL         = "claude-haiku-5-5";
// Room for the JSON reading: Haiku 5.5 counts the same text as about 30% more
// tokens than Haiku 4.5, whose cap was 1000.
const MAX_TOKENS    = 1300;

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
- The move (from the valid move list below) — or that no move is being made
- The stat to roll (from edge/heart/iron/shadow/wits, or a special meter)
- Your reasoning (internal only — not shown to the player)
- The stakes: what a hit gets and what a miss costs, shown to the player before the roll

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
- **develop_your_relationship** — When you deepen a connection. Un-bonded: no roll, mark progress. Bonded: roll +rank (the module fills the rank in; leave statUsed null).
- **test_your_relationship** — When a connection is strained or tested. Roll +heart.
- **forge_a_bond** — Progress move. When you cement a bond, compare progress to challenge dice.

### EXPLORATION MOVES
- **undertake_an_expedition** — When you travel through perilous or unknown space/terrain — including any journey toward a destination that is not a charted, known place (coordinates someone gave, a rumoured or unnamed place, the far side of the gap), even when the player says "set a course". Roll +edge (speed), +shadow (stealth), or +wits (vigilance).
- **explore_a_waypoint** — When you examine a notable location during an expedition. Roll +wits.
- **finish_an_expedition** — Progress move. When an expedition concludes.
- **set_a_course** — When you follow a known route to a charted, known place (a settlement or other place already on the map), or return to a familiar location. Roll +supply.
- **make_a_discovery** — Triggered by strong hit with match on explore_a_waypoint (no roll).
- **confront_chaos** — Triggered by miss with match on explore_a_waypoint (no roll).

### SCENE CHALLENGE MOVES
Only while a scene challenge is open — the context lists it among the open progress tracks as scene_challenge "<name>": an extended non-combat scene against a threat or time limit (a negotiation, a chase, a heist, defusing a bomb). Name the challenge in moveTarget. With no scene challenge open, use face_danger / secure_an_advantage; a fight is combat (enter_the_fray …), even mid-challenge.
- **face_danger_scene_challenge** — Face Danger within the scene challenge: attempting something risky or reacting to an imminent threat as part of it. Same stat options as face_danger.
- **secure_an_advantage_scene_challenge** — Secure an Advantage within the scene challenge: assessing the situation, making preparations or gaining leverage as part of it. Same stat options as face_danger.
- **finish_the_scene** — Progress move. When a scene challenge's progress track or tension clock is filled, or events lead to the scene's conclusion.

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
- **heal** — When receiving or providing medical care. Receive treatment from someone (not an ally): +iron. Mend your own wounds: +iron or +wits, whichever is lower. Obtain treatment for a companion: +heart. Provide care: +wits.
- **hearten** — When finding comfort or peace. Roll +heart.
- **resupply** — When replenishing supplies. Roll +heart/iron/shadow/wits (approach dependent).
- **repair** — When fixing vehicles or equipment. Roll +wits or +supply.

### THRESHOLD MOVES
- **face_death** — When at the brink of death. Roll +heart.
- **face_desolation** — When at the brink of desolation. Roll +heart.
- **overcome_destruction** — Progress move. When your command vehicle is destroyed. Rolls against the bonds legacy track.

### LEGACY MOVES
- **earn_experience** — When filling a legacy box (no roll).
- **advance** — When spending experience on assets (no roll).
- **continue_a_legacy** — Progress move. When retiring or dying. One roll per legacy track — name the track rolled (quests, bonds or discoveries).

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
2. When two moves fit, prefer the one whose outcome matters more to the story. When none fits, answer NO MOVE (rule 7) — never reach for a move to have something to roll.
3. Session/legacy/fate moves (begin_a_session, earn_experience, ask_the_oracle, pay_the_price) are only chosen when the narration is explicitly about those activities. ask_the_oracle is never a way to say "nothing is rolled": that is NO MOVE.
4. If the narration describes a reaction to danger, prefer face_danger or react_under_fire over gather_information.
5. Suffer moves are only chosen when the player is explicitly describing taking damage/stress, not when they're trying to avoid it.
6. COMBAT POSITION: when the user message includes a COMBAT POSITION directive, you MUST pick a combat move that is available for that position. Strike and Gain Ground are available only when IN CONTROL; Clash and React Under Fire are available only when IN A BAD SPOT. Take Decisive Action (seize the objective) and Face Defeat (give up) are available in either position. Non-combat moves remain available when the narration clearly calls for one.
7. NO MOVE: a move is made when the character attempts something whose outcome is uncertain and matters. Plain conversation is not a move — asking a question, answering one, agreeing or refusing, choosing between options someone offered, saying a name, telling someone what happened. Neither is an everyday action with nothing at risk — answering a hail, opening a channel, powering a system up, walking to a station, picking something up. For these, return "moveId": null with the reason in "rationale" (statUsed and stakes null). A line is a move when it presses someone to do or give something they are reluctant to (compel), tests or deepens a relationship, or carries a threat or a danger — implied menace counts. Do not answer NO MOVE for an action taken in an open fight (a COMBAT POSITION directive is present), or when the user message says a roll was asked for.
8. WHO IS SPEAKING: the user message names the character speaking and acting this turn. The move, its stat and the rationale are that character's — never another character the recent scene happens to be about.
9. PACING READ: when the user message carries one, an earlier stage read the line as that move in that kind of scene. It is a hint about what the line is doing, not a ruling: choose the move that fits best, which may be a different one, or answer NO MOVE.

## RESPONSE FORMAT
Respond with ONLY a valid JSON object. No preamble, no markdown, no explanation outside the JSON.

{
  "moveId": "face_danger",
  "moveName": "Face Danger",
  "statUsed": "wits",
  "statValue": 0,
  "isProgressMove": false,
  "progressTicks": 0,
  "moveTarget": null,
  "expeditionRank": null,
  "combatRank": null,
  "healSituation": null,
  "rationale": "Player is threading their ship through a debris field — risky navigation requiring focus and observation.",
  "stakes": {
    "hit": "You thread the debris and come out ahead of the patrol.",
    "miss": "A shard tears through the hull plating as you clear the field.",
    "missSuffer": { "move": "withstand_damage", "amount": 1 }
  },
  "mischiefApplied": false,
  "confidence": "high"
}

moveId: a move id from the MOVE REFERENCE, or null when no move is being made (rule 7).
confidence: "high" | "medium" | "low" — your certainty in the interpretation. Use "low" when the line may well be no move at all: a low-confidence reading is narrated, with the move offered, rather than rolled.
statValue: ALWAYS leave as 0 — filled in by the calling code (from the character sheet for action moves, from the live progress track / vow / connection data for progress moves — see enrichInterpretationStatValue and enrichProgressTicks in src/moves/statEnrichment.js). Module data is ground truth; never estimate a value.
progressTicks: ALWAYS leave as 0 — for progress moves the module fills the score from the live track / vow / connection data. Never estimate a tick count.
moveTarget: the named thing the move acts on, taken from the player's narration — or, when the narration refers to it without naming it ("her coordinates", "there", "the station", "him"), as the RECENT SCENE names it. For movement moves (set_a_course, undertake_an_expedition, finish_an_expedition): the named destination ("Bleakhold Station", "the Vault of Tears"); a destination the story refers to without a proper name gets a short working label saying whose or what it is and how the scene refers to it ("Archer's rendezvous — the gap"), never a bare pronoun or "there". For progress and quest moves: take_decisive_action → the foe or fight named, fulfill_your_vow / reach_a_milestone / forsake_your_vow → the vow's name, forge_a_bond / develop_your_relationship → the connection's name; finish_the_scene and the scene-challenge moves → the scene challenge's name; continue_a_legacy → the legacy track rolled: "quests", "bonds" or "discoveries"; heal → the ally or companion receiving the care (null when the character tends their own wounds or is treated by someone else); aid_your_ally → the ally aided; companion_takes_a_hit → the companion taking the hit, by its name ("Glowcat", "Rockhorn"); withstand_damage → the vehicle taking the damage when it is one of the character's support vehicles, by its name ("Hoverbike", "Rover", "Skiff") — null for the command starship, whatever other vehicle the line mentions. null when nothing is named or implied.
expeditionRank: only for undertake_an_expedition. When the narration implies the journey's scope, infer its rank — "troublesome" (a short, easy hop), "dangerous" (default), "formidable" (a long or hostile crossing), "extreme", or "epic" (a vast, perilous undertaking). null otherwise; the player can re-rank the track later.
healSituation: only for heal — "self" (the character mends their own wounds), "treated" (they receive treatment from someone who is not an ally), "companion" (they obtain treatment for a companion) or "ally" (they provide care to someone else). null for every other move.
combatRank: only for enter_the_fray. When the narration implies the foe’s danger level, infer its rank — "troublesome" (minor, easy to defeat), "dangerous" (default), "formidable" (a tough, seasoned opponent), "extreme" (an overwhelming threat), or "epic" (near-impossible odds). null otherwise; the player can re-rank the combat track later.
stakes: what this roll is for, shown to the player before they roll — only for a move that rolls a stat (statUsed is not null); null otherwise. One short line each, in the second person, drawn from the RECENT SCENE and the player's narration: "hit" — what the attempt gets the character; "miss" — its most obvious negative outcome (Pay the Price's first choice, "make the most obvious negative outcome happen"): concrete, and about what was attempted, never a vague setback. "miss" is null when no outcome follows obviously from the attempt — the Pay the Price table is rolled then. Never state what the move's own rules decide (progress marked, a combat position) — only what happens in the fiction.
missSuffer: when that miss plainly costs the character one of these, name it and its amount (1, or 2 for a serious blow): "endure_harm" (an injury), "endure_stress" (fear, shock or despair), "lose_momentum" (a delay, a lost edge), "sacrifice_resources" (supplies spent or lost), "withstand_damage" (their vehicle is damaged), "companion_takes_a_hit" (their companion is harmed). null when the miss costs something else — a position, an opportunity, someone's trust.`;
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
export function buildContextSummary(campaignState, { roller = null } = {}) {
  const lines = [];

  // Who is speaking (issue #354 P2-06): the classifier and the narrator were
  // told, the interpreter was not — so it took the speaker from the recent
  // scene, and after a beat that closed on Karthik it read Isaac's line as
  // "Karthik presses Archer", rolled as Isaac. In the narrator's own words.
  const speaker = speakerLine(roller);
  if (speaker) lines.push(speaker);

  // Open vows + other open tracks — helps identify reach_a_milestone,
  // fulfill_your_vow, finish_an_expedition, take_decisive_action, and name
  // the moveTarget. Read from the live stores: vow Items on the player
  // characters and the Progress Tracks journal. (This once read
  // campaignState.progressTrackIds, which nothing ever wrote — the
  // interpreter was never told about any track.)
  const vows = readOpenVowLabels();
  if (vows.length) lines.push(`Open vows: ${formatList(vows)}.`);

  const tracks = readOpenTrackLabels();
  if (tracks.length) lines.push(`Open progress tracks: ${formatList(tracks)}.`);

  // Current session mischief level (informational — actual framing in system prompt)
  if (campaignState?.currentSessionId) {
    lines.push(`Session active.`);
  }

  // The roller's own vehicles and companions, by name: withstand_damage names
  // the support vehicle taking the damage in moveTarget (null for the command
  // starship), companion_takes_a_hit the companion — and the interpreter was
  // told neither, so "The hoverbike skids across the scree" was the
  // starship's (SUPPORT-VEHICLES-UNLISTED).
  lines.push(...rollerAssetLines(roller));

  if (!vows.length && !tracks.length) lines.splice(speaker ? 1 : 0, 0, "No active tracks yet.");
  return lines.join(" ");
}

/**
 * "The character speaking and acting this turn is Isaac Sutton." — as the
 * narrator's PARTY block says it; '' with no roller who is a player character.
 *
 * @param {Actor|null} roller
 * @returns {string}
 */
function speakerLine(roller) {
  try {
    const name = isPlayerCharacterActor(roller) ? String(roller.name ?? "").replace(/["\r\n]+/g, " ").trim() : "";
    return name ? `The character speaking and acting this turn is ${name}.` : "";
  } catch {
    return "";
  }
}

/**
 * The context lines naming the roller's support vehicles and companions (a
 * companion's given name beside its asset's) — none for no roller, or one
 * with neither. Never throws.
 *
 * @param {Actor|null} roller
 * @returns {string[]}
 */
function rollerAssetLines(roller) {
  try {
    if (!isPlayerCharacterActor(roller)) return [];
    const who = roller.name ?? "The character";
    const out = [];
    const vehicles = listSupportVehicleAssets(roller).map(i => `"${i.name}"`);
    if (vehicles.length) out.push(`${who}'s support vehicles: ${formatList(vehicles)} (withstand_damage to one names it in moveTarget; the command starship is null).`);
    const companions = listCompanionAssets(roller).map(c => {
      const given = companionGivenName(c);
      return given ? `"${c.name}" (named "${given}")` : `"${c.name}"`;
    });
    if (companions.length) out.push(`${who}'s companions: ${formatList(companions)}.`);
    return out;
  } catch (err) {
    console.warn(`${MODULE_ID} | interpreter: the roller's vehicles and companions could not be read:`, err?.message ?? err);
    return [];
  }
}

const CONTEXT_LIST_CAP = 8;

// The Progress Tracks journal (src/ui/progressTracks.js JOURNAL_NAME /
// FLAG_KEY, found as its findTracksJournal finds it: by the tracks flag, the
// name only for a journal no track was saved to — a renamed journal hid every
// track, issue #345 AA62). Read directly — importing the UI panel module here
// would pull ApplicationV2 code into the interpreter.
const PROGRESS_JOURNAL_NAME = "Starforged Progress Tracks";
const PROGRESS_FLAG_KEY     = "tracks";

/** `"Vow name"` for each open vow on the player characters (owner-tagged when >1 PC). */
function readOpenVowLabels() {
  try {
    const pcs   = getPlayerActors();
    const multi = pcs.length > 1;
    const out   = [];
    for (const actor of pcs) {
      for (const vow of readVows(actor)) {
        if (vow.completed || !vow.name) continue;
        out.push(multi ? `"${vow.name}" (${actor.name})` : `"${vow.name}"`);
      }
    }
    return out;
  } catch (err) {
    console.debug(`${MODULE_ID} | interpreter: open-vow read failed — omitting vows from context:`, err?.message ?? err);
    return [];
  }
}

/** `type "label"` for each open non-vow track in the Progress Tracks journal. */
function readOpenTrackLabels() {
  try {
    // Of two flagged journals (a pre-fix rename split), the default-named one
    // — what the sessions since wrote (issue #347 AB16).
    // Never a copy a split's merge retired (JOURNAL-MERGE-DIFFERING-ENTRY).
    const retired = (j) => !!j?.getFlag?.(MODULE_ID, "journalMerged");
    const flagged = (j) => Array.isArray(j?.getFlag?.(MODULE_ID, PROGRESS_FLAG_KEY)) && !retired(j);
    const journal = game.journal?.find?.(j => flagged(j) && j?.name === PROGRESS_JOURNAL_NAME)
                 ?? game.journal?.find?.(flagged)
                 ?? game.journal?.find?.(j => j?.name === PROGRESS_JOURNAL_NAME && !retired(j));
    if (!journal) return [];
    const tracks = journal.getFlag?.(MODULE_ID, PROGRESS_FLAG_KEY) ?? [];
    return (Array.isArray(tracks) ? tracks : [])
      .filter(t => t && !t.completed && t.type !== "vow" && t.label)
      .map(t => `${t.type ?? "track"} "${t.label}"`);
  } catch (err) {
    console.debug(`${MODULE_ID} | interpreter: progress-track read failed — omitting tracks from context:`, err?.message ?? err);
    return [];
  }
}

function formatList(items) {
  if (items.length <= CONTEXT_LIST_CAP) return items.join(", ");
  return `${items.slice(0, CONTEXT_LIST_CAP).join(", ")}, +${items.length - CONTEXT_LIST_CAP} more`;
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
 * contains an Item matching `slug`, its text is wrapped in a
 * `<canonical_move>...</canonical_move>` tag the model can ground against.
 *
 * The system's move document (`sfmove`) keeps its text in `system.Text`, an
 * HTMLField — a string (vendor src/module/item/subtypes/sfmove.ts; every
 * vendored starforged-moves / ironsworn-moves document). It was read as
 * `system.description ?? system.text ?? system.Text.text`, fields no move has,
 * so the block was "" for every real move and a forced move's stat reading
 * never got the move's text (issue #345 AA44). Those fields stay as fallbacks.
 * Its `@Compendium[…]{Pay the Price}` links are reduced to their labels, as
 * actorBridge.readAssets reduces an ability's.
 *
 * Returns "" when the slug is missing, no system is installed, or the
 * compendium document has no text. Never throws.
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
  const sys = doc.system ?? {};
  const raw = [sys.Text, sys.description, sys.text, sys.Text?.text]
    .find(v => typeof v === "string" && v.trim()) ?? "";
  const text = raw
    .replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1")
    .replace(/<[^>]*>/g, "")
    .trim();
  if (!text) return "";
  return `<canonical_move>\n${text}\n</canonical_move>`;
}

/**
 * Interpret player narration as a Starforged move.
 *
 * @param {string} narration       — raw player input (typed or transcribed)
 * @param {Object} options
 * @param {Object} options.campaignState   — CampaignStateSchema
 * @param {string} options.mischiefLevel   — "serious" | "balanced" | "chaotic"
 * @param {string} options.apiKey          — Claude API key
 * @param {string} [options.expectedMoveSlug] — The move already chosen — by a
 *   card or button that forces it (the pacing "Roll ⟨move⟩" button, the
 *   way-out and Battle buttons …). The move is fixed: the model is told so
 *   and reads the narration for the rest — the stat above all — grounded in
 *   the canonical move text from foundry-ironsworn (a `<canonical_move>`
 *   block). The result is that move, with a stat it lists: the model's when
 *   it is one, else the move's first. No mischief framing and no combat
 *   position steer apply — both are about choosing the move (issue #321 U04).
 * @param {('in_control'|'bad_spot'|null)} [options.combatPosition] — The active
 *   combat track's position (from getActiveCombatPosition()). When set, the
 *   interpreter is steered to a position-appropriate combat move and the result
 *   is forced legal via constrainMoveToPosition(). null = no constraint.
 * @param {string} [options.recentScene] — the last few narration cards
 *   (narrator.js getRecentSceneForReading): what the line follows, so a
 *   reference ("her coordinates") is read — and named as moveTarget — from it
 * @param {Actor|null} [options.roller] — the character speaking and acting:
 *   named to the model (issue #354 P2-06), with their vehicles and companions
 * @param {{ moveId?: string|null, category?: string|null, reasoning?: string|null }|null} [options.classifier] —
 *   the pacing classifier's reading of the line (issue #354 P2-02): given to
 *   the model as a hint, and what a Balanced Mischief reading that leaves the
 *   line's kind is put back to (keepMischiefInKind)
 * @param {boolean} [options.allowNoMove] — whether the model may answer that no
 *   move is being made (issue #354 P2-01). Default true; false when a roll was
 *   asked for (`!roll`, a round's "Roll a move instead"). Never with a move
 *   already chosen.
 * @returns {Promise<Object>}      — partial MoveResolutionSchema (no dice yet);
 *   `{ noMove: true, rationale, … }` when no move is being made
 */
export async function interpretMove(narration, {
  campaignState, mischiefLevel, apiKey, expectedMoveSlug, combatPosition = null, recentScene = "", roller = null,
  classifier = null, allowNoMove = true,
}) {
  if (!apiKey) throw new Error("Claude API key not configured. Set it in module settings.");
  if (!narration?.trim()) throw new Error("No narration to interpret.");

  const expectedMove    = expectedMoveSlug && MOVES[expectedMoveSlug] ? expectedMoveSlug : null;
  const position        = expectedMove ? null : combatPosition;
  const mayDecline      = !expectedMove && allowNoMove !== false;
  const pacingRead      = expectedMove ? null : normalisePacingRead(classifier);
  const systemPrompt = buildSystemPrompt();
  const mischiefFraming = expectedMove ? null : buildMischiefFraming(mischiefLevel, narration);
  const contextSummary  = buildContextSummary(campaignState, { roller });
  const combatDirective = buildCombatPositionDirective(position);
  const expectedDirective = buildExpectedMoveDirective(expectedMove);
  const pacingDirective = buildPacingReadDirective(pacingRead);
  // A roll was asked for (`!roll`, "Roll a move instead"): the line is a move.
  const rollAskedDirective = !expectedMove && allowNoMove === false
    ? "A ROLL WAS ASKED FOR: the player chose to roll this line. Choose the move that fits it best — do not answer NO MOVE."
    : "";
  const canonicalBlock  = expectedMove
    ? await buildCanonicalMoveBlock(expectedMove)
    : "";

  // User message: context + mischief framing + combat-position directive +
  // the chosen move + canonical block + narration. Mischief framing is
  // invisible to the player — it shapes how the model reads the input. The
  // combat directive (empty out of combat) restricts the candidate combat
  // moves to the current position.
  // The recent scene (narrator.js getRecentSceneForReading) goes just before
  // the line it explains: "we're on our way" is Set a Course to the
  // coordinates an NPC just gave only to a reader who saw them (alpha 23
  // playtest).
  const sceneBlock = typeof recentScene === "string" && recentScene.trim()
    ? `RECENT SCENE (what the player's line follows — context only; interpret the player narration):\n${recentScene.trim()}`
    : "";
  const userMessage = [
    contextSummary,
    pacingDirective,
    mischiefFraming,
    combatDirective,
    expectedDirective,
    rollAskedDirective,
    canonicalBlock,
    sceneBlock,
    `Player narration: "${narration}"`,
  ].filter(Boolean).join("\n\n");

  const response = await callClaudeAPI({
    apiKey,
    systemPrompt,
    userMessage,
    // The interpreter's own model and cap — never the copy a world stored at
    // creation (schemas.js `api`), which pinned it to that day's model.
    model: MODEL,
    maxTokens: MAX_TOKENS,
    promptCachingEnabled: campaignState.api?.promptCachingEnabled ?? true,
  });

  const parsed = parseInterpretation(response, narration, mischiefLevel, position, expectedMove, { mayDecline, pacingRead });
  return keepMischiefInKind(parsed, pacingRead, mischiefLevel);
}

/**
 * The pacing classifier's reading, as the interpreter takes it: a known move
 * id (or none), its category and its one-line reasoning. null for none.
 *
 * @param {Object|null} classifier
 * @returns {{ moveId: string|null, category: string|null, reasoning: string }|null}
 */
function normalisePacingRead(classifier) {
  if (!classifier || typeof classifier !== "object") return null;
  const moveId    = toMoveId(classifier.moveId) ?? null;
  const category  = typeof classifier.category === "string" && classifier.category.trim() ? classifier.category.trim().toLowerCase() : null;
  const reasoning = typeof classifier.reasoning === "string" ? classifier.reasoning.replace(/[\r\n]+/g, " ").trim().slice(0, 280) : "";
  if (!moveId && !category && !reasoning) return null;
  return { moveId, category, reasoning };
}

/**
 * The user-message line giving the model the pacing classifier's reading
 * (issue #354 P2-02): the classifier named a move and the router threw it
 * away, so the interpreter read the line from scratch — a different move on
 * five of the playtest's seven rolled lines. '' for none.
 *
 * @param {{ moveId: string|null, category: string|null, reasoning: string }|null} read
 * @returns {string}
 */
function buildPacingReadDirective(read) {
  if (!read) return "";
  const what = [
    read.moveId ? `as ${read.moveId}` : null,
    read.category ? `in a ${read.category} scene` : null,
  ].filter(Boolean).join(" ");
  return `PACING READ (a hint, not a ruling — rule 9): the stage before you read this line ${what || "as a move"}`
    + `${read.reasoning ? ` — "${read.reasoning.replace(/"/g, "'")}"` : ""}.`;
}

// The categories a line of dialogue is never turned into by a Balanced
// misread (issue #354 P2-02, the maintainer's decision): travel, fate and
// suffer moves. MOVES[id].category, as schemas.js files them.
const OUT_OF_KIND_FOR_DIALOGUE = new Set(["exploration", "fate", "suffer"]);

/**
 * A Balanced Mischief reading stays inside what the line is doing (issue #354
 * P2-02; decisions.md → "Issue #354"). The Balanced framing lets the model
 * prefer a "less obvious but more dramatically interesting" move, and it read
 * a line spoken to an NPC — "we've come this far…" — as Undertake an
 * Expedition. It may still change the stat or pick a neighbouring move; but a
 * misread (`mischiefApplied`) of a line the classifier placed in a social
 * scene that lands on a travel, fate or suffer move is put back to the move
 * the classifier named, with a stat that move lists, and says so. Chaotic
 * keeps its freedom; a reading that is not a misread is left alone (the
 * interpreter turning Face Danger into Undertake an Expedition for a journey
 * through uncharted space is a correction, not mischief — issue #348 PT06).
 *
 * @param {Object} interpretation — parseInterpretation's result
 * @param {{ moveId: string|null, category: string|null }|null} pacingRead
 * @param {string} mischiefLevel
 * @returns {Object} the interpretation, or the one put back in kind
 */
export function keepMischiefInKind(interpretation, pacingRead, mischiefLevel) {
  if (!interpretation || interpretation.noMove) return interpretation;
  if (mischiefLevel !== "balanced" || interpretation.mischiefApplied !== true) return interpretation;
  if (pacingRead?.category !== "social" || !pacingRead.moveId) return interpretation;
  const readAs = MOVES[interpretation.moveId];
  const named  = MOVES[pacingRead.moveId];
  if (!readAs || !named || !OUT_OF_KIND_FOR_DIALOGUE.has(readAs.category) || OUT_OF_KIND_FOR_DIALOGUE.has(named.category)) {
    return interpretation;
  }
  const listed = Array.isArray(named.stat) ? named.stat : [];
  const statUsed = listed.includes(interpretation.statUsed) ? interpretation.statUsed : (listed[0] ?? null);
  return {
    ...interpretation,
    moveId:          pacingRead.moveId,
    moveName:        moveDisplayName(pacingRead.moveId),
    statUsed,
    isProgressMove:  named.progressMove === true,
    moveTarget:      null,
    expeditionRank:  null,
    combatRank:      null,
    healSituation:   null,
    // The stakes were written for the other move.
    stakes:          null,
    mischiefApplied: false,
    keptInKind:      interpretation.moveId,
    rationale:       `${interpretation.rationale ? `${interpretation.rationale} ` : ""}(Read as ${moveDisplayName(pacingRead.moveId)}: a line of dialogue is not turned into ${moveDisplayName(interpretation.moveId)}.)`,
  };
}

/**
 * The user-message directive for a move already chosen (interpretMove's
 * expectedMoveSlug): the move is fixed, so the model reads the narration for
 * the stat among the ones the move lists. '' when no move is given.
 *
 * @param {string|null} moveId — a MOVES key, or null
 * @returns {string}
 */
function buildExpectedMoveDirective(moveId) {
  const move = moveId ? MOVES[moveId] : null;
  if (!move) return "";
  const stats = Array.isArray(move.stat) && move.stat.length ? move.stat : null;
  return [
    `MOVE ALREADY CHOSEN: the player chose ${moveDisplayName(moveId)}. Return moveId "${moveId}" — do not choose a different move.`,
    stats ? `Choose statUsed from ${stats.join(", ")}: the one that fits how the narration approaches the move.` : null,
  ].filter(Boolean).join(" ");
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
 * with a note so the confirmation UI can catch it (an expected move, with its
 * first listed stat).
 *
 * `expectedMoveId` (interpretMove's expectedMoveSlug) is the move already
 * chosen: it stands whatever the model named, with a stat it lists — the
 * model's when it is one, else its first.
 */
function parseInterpretation(rawText, originalNarration, mischiefLevel, combatPosition = null, expectedMoveId = null,
  { mayDecline = false, pacingRead = null } = {}) {
  let parsed;

  try {
    // Strip markdown code fences if present (model sometimes adds them)
    const cleaned = rawText.replace(/```(?:json)?|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn("Starforged Companion | Failed to parse API response as JSON:", rawText);
    return fallbackInterpretation(originalNarration, mischiefLevel, expectedMoveId);
  }

  if (expectedMoveId && parsed && typeof parsed === "object") parsed.moveId = expectedMoveId;

  // No move is being made (issue #354 P2-01): the model could reason its way
  // to "this is a narrative exchange" and had no way to say it — every reply
  // carried a move, and the line was rolled. Only where it may decline: not
  // with a move already chosen, nor when a roll was asked for — there the
  // move the classifier named stands in, else the fallback.
  if (!expectedMoveId && parsed && typeof parsed === "object" && declinesMove(parsed)) {
    if (mayDecline) return noMoveInterpretation(originalNarration, mischiefLevel, parsed);
    if (pacingRead?.moveId) parsed.moveId = pacingRead.moveId;
    else return fallbackInterpretation(originalNarration, mischiefLevel, expectedMoveId);
  }

  // The model may name the move by its display name ("Gather Information",
  // "gather-information") instead of its key: read it as the key it names
  // (issue #326 W38 — an unknown key fell back to Face Danger; issue #321
  // U45's toMoveId was wired into the pacing classifier only).
  if (parsed && typeof parsed === "object" && !MOVES[parsed.moveId]) {
    const named = toMoveId(parsed.moveId) ?? toMoveId(parsed.moveName);
    if (named) parsed.moveId = named;
  }

  // Validate move ID
  const moveData = MOVES[parsed?.moveId];
  if (!moveData) {
    console.warn(`Starforged Companion | Unknown move ID in response: ${parsed?.moveId}`);
    return fallbackInterpretation(originalNarration, mischiefLevel, expectedMoveId);
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
  // A stat the move does not list gives way to the move's first (issue #325
  // W19): Gather Information +iron or Check Your Gear +wits was rolled with
  // that stat's sheet value, and the confirm dialog has no stat picker. Only
  // the Chaotic dial keeps an unlisted stat — its Trickster framing asks the
  // model to "consider unusual stats", a departure from the move text the
  // maintainer chose to keep (decisions.md, issue #325). A move already
  // chosen (expectedMoveId — issue #321 U04) is held to its list whatever
  // the dial.
  const listedStats = Array.isArray(finalMoveData.stat) ? finalMoveData.stat : [];
  const chaotic = mischiefLevel === "chaotic";
  if ((expectedMoveId || !chaotic) && listedStats.length && !listedStats.includes(parsed.statUsed)) {
    parsed.statUsed = listedStats[0];
  }

  const baseRationale = parsed.rationale ?? parsed.interpretationRationale ?? "";
  const rationale = positionRemapped
    ? `${baseRationale}${baseRationale ? " " : ""}(Adjusted to ${moveDisplayName(parsed.moveId)} — you are ${combatPosition === "bad_spot" ? "in a bad spot" : "in control"}.)`
    : baseRationale;

  return {
    playerNarration:        originalNarration,
    inputMethod:            "chat",
    mischiefLevel,
    moveId:                 parsed.moveId,
    moveName:               moveDisplayName(parsed.moveId),
    statUsed:               parsed.statUsed,
    // The numbers are the module's, never the model's (issue #322 V08): the
    // stat value and a progress score come from the sheet and the live tracks
    // (enrichInterpretationStatValue / enrichProgressTicks,
    // src/moves/statEnrichment.js), the adds from the confirm dialog's asset
    // abilities and the pending +1s. The model's were copied unchecked — a
    // string "1" in `adds` concatenated (1 + 2 + "1" = "31", capped to 10: a
    // strong hit), and a `statValue` it was told to leave 0 became the score.
    statValue:              0,
    adds:                   0,
    isProgressMove:         finalMoveData.progressMove === true,
    progressTicks:          0,
    moveTarget:              typeof parsed.moveTarget === "string" && parsed.moveTarget.trim() ? parsed.moveTarget.trim() : null,
    expeditionRank:          typeof parsed.expeditionRank === "string" && parsed.expeditionRank.trim() ? parsed.expeditionRank.trim().toLowerCase() : null,
    combatRank:              typeof parsed.combatRank === "string" && parsed.combatRank.trim() ? parsed.combatRank.trim().toLowerCase() : null,
    // Which of Heal's four situations the narration is — the self-mend rolls
    // the lower of iron / wits (statEnrichment, issue #330 D4).
    healSituation:           parsed.moveId === "heal" && HEAL_SITUATIONS.has(parsed.healSituation) ? parsed.healSituation : null,
    rationale,
    // What a hit gets and a miss costs, stated before the roll (issue #353
    // R1) — only for a move that rolls a stat; a stated miss is its price.
    stakes:                 finalMoveData.progressMove !== true && parsed.statUsed
      ? withPriceSource(normaliseStakes(parsed.stakes))
      : null,
    mischiefApplied:        parsed.mischiefApplied ?? false,
    confidence:             parsed.confidence ?? "medium",
    positionConstraintApplied: positionRemapped,         // true when a wrong-position move was remapped
    playerConfirmed:        false,                       // Set to true after confirmation UI
  };
}

/** Whether a parsed reply says no move is being made: `moveId` null / "none" / absent, or `noMove: true`. */
function declinesMove(parsed) {
  if (parsed.noMove === true) return true;
  const id = parsed.moveId;
  if (id === null || id === undefined) return !parsed.moveName;
  return typeof id === "string" && /^(none|null|no[ _-]?move)$/i.test(id.trim());
}

/**
 * The reading of a line as no move (issue #354 P2-01): the pipeline narrates
 * it, with the classifier's move offered, instead of opening the roll dialog.
 *
 * @returns {{ noMove: true, playerNarration: string, mischiefLevel: string, rationale: string, confidence: string }}
 */
function noMoveInterpretation(narration, mischiefLevel, parsed) {
  return {
    noMove:          true,
    playerNarration: narration,
    inputMethod:     "chat",
    mischiefLevel,
    moveId:          null,
    moveName:        null,
    rationale:       typeof parsed?.rationale === "string" ? parsed.rationale.trim() : "",
    confidence:      parsed?.confidence ?? "medium",
    mischiefApplied: false,
    playerConfirmed: false,
  };
}

/**
 * Safe fallback interpretation when the API response cannot be parsed.
 * Defaults to Face Danger +wits — the most common adventure move; a move
 * already chosen (`expectedMoveId`) keeps that move and its first listed stat,
 * since nothing was read. Low confidence flags it for the confirmation UI to
 * highlight.
 */
function fallbackInterpretation(narration, mischiefLevel, expectedMoveId = null) {
  const expected = expectedMoveId && MOVES[expectedMoveId] ? expectedMoveId : null;
  return {
    playerNarration:         narration,
    inputMethod:             "chat",
    mischiefLevel,
    moveId:                  expected ?? "face_danger",
    moveName:                expected ? moveDisplayName(expected) : "Face Danger",
    statUsed:                expected ? (MOVES[expected].stat?.[0] ?? null) : "wits",
    statValue:               0,
    adds:                    0,
    isProgressMove:          expected ? MOVES[expected].progressMove === true : false,
    progressTicks:           0,
    moveTarget:              null,
    expeditionRank:          null,
    combatRank:              null,
    healSituation:           null,
    rationale:               "Fallback — API response could not be parsed.",
    stakes:                  null,
    mischiefApplied:         false,
    confidence:              "low",
    playerConfirmed:         false,
  };
}
