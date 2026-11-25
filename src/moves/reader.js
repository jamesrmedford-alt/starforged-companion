/**
 * STARFORGED COMPANION
 * src/moves/reader.js — the line reader: one model call reads a typed line, told the whole situation
 *
 * Two model calls read every typed line today: the pacing reader
 * (src/pacing/classifier.js classifyInput — MOVE / offer / narrate by the
 * dials) and, on a MOVE, the move reader (src/moves/interpreter.js
 * interpretMove — which move, stat, target, stakes). Each is told part of the
 * picture, the second needs the first's verdict as a hint, and three rounds of
 * fixes (issues #373, #377, #380) added rules to both prompts that the fourth
 * live long haul (issue #383) found losing to each other: five pleas for a
 * tie booked as Develop Your Relationship, a milestone offered for a claim the
 * story refuted, a named move offered for the density.
 *
 * This is the one reader (issue #384; decisions.md → "Overhauls 1 and 4"). It reads a line once and replies with one
 * reading: the move the line sets about by the game's own triggers, quoted
 * (src/moves/readerCatalogue.js) — or none; whether the player asked for it;
 * how much hangs on it (`risk`); the dial category; how sure it is; a
 * one-sentence reason; and, for a move, its stat, target and stakes. It never
 * decides roll, offer or narrate: code does, by the table's dials
 * (src/pacing/readAndRoute.js routeReading, D1).
 *
 * Told: the speaker and the other player characters; the SITUATION
 * (src/moves/readerSituation.js — the sheet, the fights with the speaker's
 * position, the scene challenges and expeditions, the place, the charted
 * places, the party's vows, the vehicles and companions); POSSIBLE NOW / NOT
 * NOW (src/moves/availability.js, the contracts' stand-in); a Batch Mode
 * round's other submitted actions; the Mischief framing; the recent scene;
 * the line. Not told: the dials or the density (code applies them), and
 * nothing hidden — no plan, no unrevealed truth, no Private Line, no world
 * snapshot (rules/narrator-memory.md 7c).
 *
 * Three modes, one prompt (D7): the mode is the user message's first line,
 * so the system prompt is the same bytes for every call and every world —
 * one cache entry, kept an hour (the narrator's reason: a human table's lines
 * are often more than five minutes apart).
 *
 *   open    a typed line with pacing on; a round's Submit — "no move" allowed
 *   roll    `!roll`, pacing off, a round's "Roll a move instead" — never none
 *   chosen  a card's button chose the move: stat, target and stakes only
 *
 * Sonnet 5.5, thinking off (api-proxy.js sends the model's own off form,
 * narration/thinking.js), as the readers are (decisions.md → "The readers run
 * on Sonnet 5.5", D6). Through api-proxy.js, labelled `lineReader`, by its own
 * call function — the playtest runner names a call by the two module
 * functions above the proxy (`callReaderAPI>readLine`). One retry after a
 * rate limit, five seconds later, none after any other failure (D13); a
 * reply cut short or unreadable is a failed reading, never a throw.
 *
 * Its consumers since the switch (slice 2): readAndRoute (src/pacing/
 * readAndRoute.js), which decidePacing calls for every typed line — the open
 * reading — and interpretMove (src/moves/interpreter.js) for the roll and
 * chosen modes and a failed open reading's second try.
 */

import { MOVES, STATS, toMoveId } from "../schemas.js";
import { apiPost } from "../api-proxy.js";
import { buildMischiefFraming } from "./mischief.js";
import { constrainMoveToPosition, keepMischiefInKind } from "./interpreter.js";
import { normaliseStakes, withPriceSource } from "./stakes.js";
import { missPaysPrice } from "./resolver.js";
import { moveDisplayName } from "../system/i18n.js";
import { PACING_CATEGORIES } from "../pacing/dials.js";
import { renderReaderCatalogue } from "./readerCatalogue.js";
import { readLineSituation, buildReaderSituationBlock } from "./readerSituation.js";
import { availableMoves } from "./availability.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// The readers' model (decisions.md → "The readers run on Sonnet 5.5").
const MODEL = "claude-sonnet-5-5";
// The move reader's cap: the longest of 116 measured readings was 472 tokens,
// with a longer reply than this one's. A cap costs nothing unused.
const MAX_TOKENS = 1300;
// One hour (decisions.md, D7): the narrator's lifetime for its standing block.
const CACHE_TTL = "1h";
const RETRY_DELAY_MS = 5000;
const MODULE_ID = "starforged-companion";

/** The three ways a line is read. */
export const READING_MODES = Object.freeze({ OPEN: "open", ROLL: "roll", CHOSEN: "chosen" });
const MODES = new Set(Object.values(READING_MODES));

/** The words a reading's `risk` may be: how much hangs on a rolled move. */
const RISK_WORDS = new Set(["high", "plain", "slight"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);
const CATEGORIES = new Set(PACING_CATEGORIES);
const HEAL_SITUATIONS = new Set(["self", "treated", "companion", "ally"]);
const METER_STATS = new Set(["supply", "integrity", "health", "spirit", "companion_health"]);

/** Whether a move is rolled at all: an action roll (a stat) or a progress roll. */
export const isRolledMove = (moveId) => !!MOVES[moveId] && (MOVES[moveId].progressMove === true || (Array.isArray(MOVES[moveId].stat) && MOVES[moveId].stat.length > 0));

// ─────────────────────────────────────────────────────────────────────────────
// A line that names its move asks for it
// ─────────────────────────────────────────────────────────────────────────────

// The pacing reader's rule (classifier.js "A LINE THAT NAMES ITS MOVE ASKS FOR
// IT"), held in code: a move's name of two words or more, as a player types
// it — its verb in any tense, "your" as any possessive, "a" or "an" — asks
// for that move, even where the name is everyday English. "I set a course for
// Bleakhold Station." was offered for the density in the fourth live run
// (issue #383 finding 17), and the one reader's own `asked` missed it in its
// first measure. A one-word name (Heal, Strike, Compel) is an everyday verb,
// and is left to the reader.
const NAME_VERBS = Object.freeze({
  make: "ma(?:ke|kes|de|king)", take: "t(?:ake|akes|ook|aking|aken)", undertake: "undert(?:ake|akes|ook|aking|aken)",
  swear: "sw(?:ear|ears|ore|orn|earing)", set: "set(?:s|ting)?", lose: "los(?:e|es|t|ing)", pay: "pa(?:y|ys|id|ying)",
  withstand: "withst(?:and|ands|ood|anding)", overcome: "overc(?:ome|omes|ame|oming)", fulfill: "fulfil+(?:s|ed|ing)?",
  forsake: "fors(?:ake|akes|ook|aking|aken)", companion: "companion",
});
const POSSESSIVE = "(?:your|my|our|her|his|their|the|this|that)";
const NAME_PATTERNS = new Map();

/** Whether the line names the move: two words or more of its name, as a player would type them. */
function lineNamesMove(text, moveId) {
  const id = String(moveId ?? "").replace(/_scene_challenge$/, "");
  if (!id.includes("_") || !MOVES[id]) return false;
  if (!NAME_PATTERNS.has(id)) {
    const [first, ...rest] = id.split("_");
    const verb = NAME_VERBS[first] ?? `${first.replace(/e$/, "")}(?:e|es|ed|ing)?`;
    const tail = rest.map(w => (w === "your" ? POSSESSIVE : w === "a" || w === "an" ? "an?" : w));
    NAME_PATTERNS.set(id, new RegExp(`\\b${verb}\\s+${tail.join("\\s+")}\\b`, "i"));
  }
  return NAME_PATTERNS.get(id).test(String(text ?? ""));
}

// ─────────────────────────────────────────────────────────────────────────────
// The system prompt — the same bytes for every call
// ─────────────────────────────────────────────────────────────────────────────

const ROLE = `You are the line reader for an Ironsworn: Starforged tabletop RPG companion. A player has typed one line of play. Read it and say which move of the game it sets about — by the game's own triggers, quoted under THE MOVES — or that it sets about none. You never narrate. You never decide whether the line is rolled, offered or narrated: the table's settings decide that from your reading. You say what the line does in the fiction: the move it sets about, whether the player asked for it, how much hangs on it, the kind of scene it is in, how sure you are and why — and, for a move, its stat, its target and its stakes.`;

const RULES = `## HOW TO READ A LINE

1. Intent over words. Read what the character does in the fiction, not the verbs used. The player's words are what the character attempts; what happens is the dice's and the narrator's.
2. The line in its place. Read it against the SITUATION and the RECENT SCENE: who is there, what has happened, what a short line refers to ("let's go" after a destination was set; "do it" after someone asked for something). What you read is the PLAYER LINE; the rest is context.
3. Only what can be made now. POSSIBLE NOW says what the situation allows, and for whom; NOT NOW names what cannot be made, and why. Read the line as a move that can be made — the same intent's move where NOT NOW names one ("clash instead") — or as no move. Within an open scene challenge, a Face Danger or Secure an Advantage made as part of it is its scene-challenge move: name the challenge.
4. Talk is narration, to anyone, a connection included: asking, answering, agreeing, refusing, choosing between options offered, saying a name, telling what happened — and asking for the relationship itself while it is still being built: to be trusted, to be friends, to count on each other, to be someone's contact. A plea for a tie is none of develop_your_relationship's deeds, however warmly it is put. Asking to make the tie lasting — "for good", "whatever comes", as kin — when the SITUATION shows the relationship ready to forge (its track full) is forge_a_bond. Talk is a move only when it does what a trigger names: it presses someone to do or give what they are reluctant to (compel), puts a relationship to the test by conflict or betrayal (test_your_relationship), offers or does one of develop_your_relationship's deeds (rule 5), or seeks company or peace for its own sake while the SITUATION shows something to recover (hearten). A threat, implied menace included, is compel or face_danger.
5. Nothing at risk is no rolled move: answering a hail, opening a channel, walking to a station, picking something up. Working a ship's systems is a move only when the fiction puts something at risk. A move with no roll needs nothing at risk — its trigger is the deed. Something done for one of the speaker's connections — a gift of worth, a favour that costs the giver time or standing, a risk taken for them, bringing them what they lack — is one of develop_your_relationship's deeds (THE MOVES), and offering to do it is doing it (rule 1). A vow sworn, in anyone's service, is swear_an_iron_vow: Develop's "swearing a vow … in their service" follows from that vow and is never read in its place. Small talk, news traded, a plain question and a courtesy that costs nothing are not.
6. Headway is in the story. reach_a_milestone is for headway the RECENT SCENE bears out — an obstacle overcome, an insight gained, a foe beaten, support earned, as the scene shows it — that the line claims or builds on, in its own words, however broadly it sums it up. A claim the scene contradicts, or that nothing in the scene supports — a plan, a hope, a question, a passing remark — is no move: the story has not made it. A line that attempts something with stakes is that attempt's move (the milestone is what it may earn). When what the line claims is what the vow swore — its goal reached, its quest at an end, as the scene bears out — it is fulfill_your_vow, not a milestone, whether or not the player says it is done.
7. In a fight (an open fight in the SITUATION) any action the character takes is a move — the fight puts it at risk — and a result the player states against a foe ("I gun them down") is the attempt, never the outcome. Only observation, inner thought and a question to the narrator are no move. Use the fight's moves for the speaker's position; an action against a danger that is no foe is face_danger.
8. Travel. A known route to one of the charted places is set_a_course; a journey anywhere else — coordinates someone gave, an unnamed or rumoured place, beyond the charts — is undertake_an_expedition, even when the player says "set a course". A time skip across a journey not yet made ("wake me when we get there") is that journey (category exploration, never downtime). Examining a notable place during an expedition is explore_a_waypoint.
9. Asked. When the player names the move — its name in their own words, in any tense or person, even where the name is everyday English ("I set a course for…", "I gather information on…", "I check my gear") — or says they try, attempt or roll, set asked and read the move they named, unless it cannot be made now (rule 3).
10. Two moves fit: prefer the one whose outcome matters more to the story; a reaction to an imminent threat is face_danger (react_under_fire in a bad spot) before gather_information.
11. Rare moves: suffer moves only when the line describes taking harm, stress or loss; legacy and fate moves only when the line is plainly about them; ask_the_oracle is never a way to say nothing is rolled.
12. The speaker. The move, its stat and the reason are the SPEAKER's, never another character's whom the scene is about. A social move at another player character is roleplay: no move. category is the line's, whatever move an INTERPRETATION NOTE leads you to.`;

const RISK = `## WHAT HANGS ON IT (risk)

For a move that is rolled — an action roll, or a progress roll such as fulfill_your_vow — say how much hangs on the roll:
- "high": the outcome is in doubt and failure plainly costs something that matters — harm, a loss, a danger met, a door closed. Leaping between two drifting cargo pods in vacuum.
- "plain": the outcome is uncertain and would matter. Searching a dead ship's logs for its last port of call.
- "slight": it could go either way, and little hangs on it. Bargaining over the price of a meal with a cook who has plenty.
null for a move with no roll. Who the line is spoken to is not a stake: a question put to a connection, a bonded ally or a rival is still a question.`;

const CATEGORIES_TEXT = `## THE DIAL CATEGORIES (category)

Pick the category from what is happening in the fiction, not the apparatus being used:
- combat: fighting or under direct attack right now — and acting against any other immediate physical danger as it happens (a fire, a hull breach, a collapse). The category sets the dial only: a danger with no foe in it is still face_danger, not a combat move.
- investigation: searching, studying, questioning, analysing for answers.
- exploration: travel, navigation, route-finding, scanning unknowns, expedition work — including operating ship systems to move through or survey space.
- social: conversation, persuasion, relationships, negotiation.
- downtime: ONLY when there are no immediate stakes — rest, repair, resupply, reflection in genuine safety. Never a journey still to be made, however it is skipped over. An activity carried out under an active hazard, deadline, or pursuit is NEVER downtime: classify it by the situation (working the nav computer mid-crisis to thread a debris field = exploration; patching the hull while boarders cut through = combat).`;

const REPLY = `## THE REPLY

Return ONLY one JSON object — no preamble, no markdown, nothing outside it — with the keys below in this order. Leave out a key whose value would be null or false; always give move (null when the line sets about none), category, confidence and reason:

{"move": "face_danger", "risk": "high", "category": "exploration", "confidence": "high", "reason": "Crossing the gantry before it collapses is attempting something risky.", "stat": "edge", "stakes": {"hit": "You reach the far hatch before the gantry gives way.", "miss": "The gantry buckles under you and you fall hard.", "missSuffer": {"move": "endure_harm", "amount": 1}}}

{"move": null, "category": "social", "confidence": "high", "reason": "Asking the dockhand the time is talk; it meets no trigger."}

- move: a move id from THE MOVES, or null when the line sets about no move. Never null where THE MODES say so.
- asked: true when the player asks for the move in their own words — names it (rule 9), or says they try, attempt or roll. Nothing tells a player to: a line that does not is read just as well.
- risk: "high", "plain" or "slight" for a move that is rolled; null for a move with no roll (WHAT HANGS ON IT).
- category: "combat", "investigation", "exploration", "social" or "downtime" (THE DIAL CATEGORIES).
- confidence: "high", "medium" or "low" — how sure you are of the reading; "low" when the line may well be no move at all.
- reason: one sentence of at most 25 words: the trigger the line meets, or why it meets none.
- target: the named thing the move acts on, taken from the PLAYER LINE — or, when the line refers to it without naming it ("her coordinates", "there", "him"), as the RECENT SCENE names it. For set_a_course, undertake_an_expedition and finish_an_expedition: the named destination; one the story refers to without a proper name gets a short working label saying whose or what it is and how the scene refers to it ("Archer's rendezvous — the gap"), never a bare pronoun or "there". For a vow's moves the vow's name and for a connection's moves the connection's name, as the SITUATION names them; take_decisive_action the foe or fight; finish_the_scene and the scene-challenge moves the challenge; continue_a_legacy the legacy track rolled ("quests", "bonds" or "discoveries"); heal the ally or companion receiving the care (null when the character tends their own wounds or is treated by someone else); aid_your_ally the ally aided; companion_takes_a_hit the companion, by its name; withstand_damage a support vehicle taking the damage, by its name — null for the command starship. null when nothing is named or implied.
- sceneChallenge: the open scene challenge a scene-challenge move is part of, as the SITUATION names it; null for any other move.
- stat: the stat the move is rolled with — the one its list gives for the line's approach: edge, heart, iron, shadow or wits, or the meter it names (supply, integrity, health, spirit, companion_health). null for a progress roll or a move with no roll.
- healSituation: for heal only — "self" (the character mends their own wounds), "treated" (they receive treatment from someone who is not an ally), "companion" (they obtain treatment for a companion) or "ally" (they provide care to someone else).
- expeditionRank: for undertake_an_expedition only, when the line implies the journey's scope — "troublesome" (a short, easy hop), "dangerous" (the default), "formidable" (a long or hostile crossing), "extreme", or "epic" (a vast, perilous undertaking).
- combatRank: for enter_the_fray only, when the line implies the foe's danger — "troublesome", "dangerous" (the default), "formidable", "extreme" or "epic".
- stakes: for any move rolled with a stat — whether the table rolls it now or offers it — what the roll is for, shown to the player before it: {"hit": "…", "miss": "…", "missSuffer": …}. One line each, at most 14 words, in the second person, drawn from the RECENT SCENE and the line: "hit" what the attempt gets the character; "miss" its most obvious negative outcome — concrete, and about what was attempted — or null when no outcome follows obviously from the attempt (the Pay the Price table is rolled then). Never state what the move's own rules decide (progress marked, a combat position). null for a progress roll or a move with no roll.
- missSuffer: inside stakes, when the miss plainly costs the character one of these, name it and its amount (1, or 2 for a serious blow): "endure_harm" (an injury), "endure_stress" (fear, shock or despair), "lose_momentum" (a delay, a lost edge), "sacrifice_resources" (supplies spent or lost), "withstand_damage" (their vehicle is damaged), "companion_takes_a_hit" (their companion is harmed) — {"move": "…", "amount": 1}, with "target" only for withstand_damage and companion_takes_a_hit: the support vehicle or companion by its name as the SITUATION lists it, left out for the command starship. null when the miss costs something else — a position, an opportunity, someone's trust.
- mischiefApplied: true when an INTERPRETATION NOTE led you to a less obvious move or stat than the plain reading.
- plainMove: only when mischiefApplied is true — the move the line is read as without the misread. null otherwise.`;

const MODES_TEXT = `## THE MODES

The user message opens with its MODE:
- READ THE LINE: say which move the line sets about, if any. null is a right answer for a line that makes none.
- A ROLL WAS ASKED FOR: the player chose to roll this line — choose the move that fits it best, never null. NOT NOW then names only what cannot be rolled at all.
- THE MOVE IS CHOSEN: a card the table pressed chose the move, and the move's own text follows. Answer with that move's id in move and read its stat, target and stakes from the line — never another move, never null. No INTERPRETATION NOTE applies.`;

/**
 * The reader's system prompt: the role, HOW TO READ A LINE, WHAT HANGS ON IT,
 * THE DIAL CATEGORIES, THE MOVES, THE REPLY and THE MODES. Nothing per world
 * or per call — no name, no dial, no date — so every call reads one cache
 * entry (tests/unit/readerPrompt.test.js holds it to that).
 *
 * @returns {string}
 */
export function buildReaderSystemPrompt() {
  return [
    ROLE,
    RULES,
    RISK,
    CATEGORIES_TEXT,
    `## THE MOVES\n\nEach move by its id — the one to answer with — its name and how it is made, then the game's own trigger in quotes, with the list after it where the list decides. A ruling of the module's is in brackets.\n\n${renderReaderCatalogue()}`,
    REPLY,
    MODES_TEXT,
  ].join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// The user message — per call
// ─────────────────────────────────────────────────────────────────────────────

const oneLine = (text) => String(text ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();

/** The heading of the system's second block: the table's Mischief note, for every line it reads. */
const MISCHIEF_HEADING = "## THE TABLE'S MISCHIEF — for every line read here";
/** The Mischief note (mischief.js buildMischiefFraming), held to which move and stat. */
const mischiefNote = (framing) => `${String(framing).trim()} It is about which move and stat; it never makes a move of a line that makes none.`;

/**
 * POSSIBLE NOW / NOT NOW: the availability, grouped. Moves that share a
 * reason share a line; a "cannot" that is made as another says which. A move
 * with nothing to say of it is not listed: POSSIBLE NOW says that every move
 * the not-now list does not name can be made (the catalogue lists them all),
 * and the two dozen ids it saves were near a tenth of the reader's uncached
 * input (the first measure, issue #384).
 *
 * @param {ReturnType<typeof availableMoves>} available
 * @returns {string}
 */
export function renderAvailability(available) {
  const list = Array.isArray(available) ? available : [];
  const groups = new Map();
  for (const e of list) {
    if (e.can && !e.why) continue;
    const key = `${e.can ? "can" : "not"}\u0000${e.why}`;
    if (!groups.has(key)) groups.set(key, { can: e.can, why: e.why, ids: [], instead: [] });
    const g = groups.get(key);
    g.ids.push(e.moveId);
    if (e.instead && !g.instead.includes(e.instead)) g.instead.push(e.instead);
  }
  const line = (g) => `- ${g.ids.join(", ")} — ${g.why}${g.instead.length ? ` (${g.instead.join(", ")} instead)` : ""}`;
  const can = [...groups.values()].filter(g => g.can);
  const not = [...groups.values()].filter(g => !g.can);
  return [
    `POSSIBLE NOW — every move of THE MOVES but those named after this list${can.length ? ", and these as told:" : "."}`,
    ...can.map(line),
    "NOT NOW",
    ...(not.length ? not.map(line) : ["- nothing"]),
  ].join("\n");
}

/**
 * The reader's user message, in order: the mode, the speaker and the other
 * player characters, the SITUATION, POSSIBLE NOW / NOT NOW (not for a chosen
 * move), a Batch Mode round's other actions, the Mischief framing (the open
 * and roll modes), the recent scene, the line.
 *
 * @param {Object} args
 * @param {"open"|"roll"|"chosen"} args.mode
 * @param {string} args.text — the player's line
 * @param {ReturnType<typeof readLineSituation>} args.situation
 * @param {ReturnType<typeof availableMoves>} [args.available]
 * @param {{ moveId: string }|null} [args.chosen] — the chosen move (`chosen` mode)
 * @param {string} [args.canonicalBlock] — the chosen move's own text (interpreter.js buildCanonicalMoveBlock)
 * @param {Array<{ name: string, text: string }>|null} [args.round] — the round's other submitted actions
 * @param {string|null} [args.mischiefFraming] — mischief.js buildMischiefFraming's note, or null
 * @param {string} [args.recentScene] — narrator.js getRecentSceneForReading
 * @returns {string}
 */
export function buildReaderUserMessage({
  mode = READING_MODES.OPEN, text, situation, available = null, chosen = null, canonicalBlock = "", round = null,
  mischiefFraming = null, recentScene = "",
}) {
  const s = situation ?? {};
  const parts = [];
  if (mode === READING_MODES.CHOSEN && chosen?.moveId) {
    parts.push(`MODE — THE MOVE IS CHOSEN: ${chosen.moveId} (${moveDisplayName(chosen.moveId)}), by a card the table pressed. Read its stat, target and stakes from the line; never another move.`
      + `${typeof canonicalBlock === "string" && canonicalBlock.trim() ? `\n${canonicalBlock.trim()}` : ""}`);
  } else if (mode === READING_MODES.ROLL) {
    parts.push("MODE — A ROLL WAS ASKED FOR: choose the move that fits it best; never no move.");
  } else {
    parts.push("MODE — READ THE LINE: say which move it sets about, if any.");
  }

  const party = (s.party ?? []).map(p => p.name).filter(Boolean);
  parts.push(s.speaker
    ? `SPEAKER — The character speaking and acting this turn is ${s.speaker.name}.\nOther player characters: ${party.length ? party.join(", ") : "none"}.`
    : `SPEAKER — no player character is known behind this line.\nPlayer characters at the table: ${party.length ? party.join(", ") : "none"}.`);

  parts.push(buildReaderSituationBlock(s));
  if (mode !== READING_MODES.CHOSEN) parts.push(renderAvailability(available ?? availableMoves(s, { mode })));

  const others = (Array.isArray(round) ? round : [])
    .map(r => ({ name: oneLine(r?.name), text: oneLine(r?.text).replace(/"/g, "'") }))
    .filter(r => r.name && r.text);
  if (others.length) {
    parts.push(`ROUND — Other actions already submitted this round (context only; read this player's action):\n${others.map(r => `- ${r.name}: "${r.text}"`).join("\n")}`);
  }

  if (mode !== READING_MODES.CHOSEN && typeof mischiefFraming === "string" && mischiefFraming.trim()) {
    parts.push(mischiefNote(mischiefFraming));
  }

  if (typeof recentScene === "string" && recentScene.trim()) {
    parts.push(`RECENT SCENE (what the line follows — context only; read the PLAYER LINE):\n${recentScene.trim()}`);
  }
  parts.push(`PLAYER LINE\n"${String(text ?? "").trim()}"`);
  return parts.join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// The call
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A reading: what the reader made of the line.
 *
 * @typedef {Object} Reading
 * @property {"open"|"roll"|"chosen"} mode
 * @property {string|null} moveId — the move the line sets about (after the
 *   position remap and the in-kind hold), or null for none
 * @property {boolean} asked — the player asked for it in their own words
 * @property {"high"|"plain"|"slight"|null} risk — null for a move with no roll
 * @property {string} category — a PACING_CATEGORIES value
 * @property {"high"|"medium"|"low"} confidence
 * @property {string} reason
 * @property {string|null} plainMove — with a Mischief misread, the plain move
 * @property {string|null} sceneChallenge — the challenge a variant names
 * @property {Object|null} interpretation — the partial MoveResolution
 *   interpretMove returns, for moveId; null when there is no move
 * @property {string|null} failed — why there is no reading (the call, the reply), or null
 */

/**
 * Read one line.
 *
 * @param {Object} args
 * @param {"open"|"roll"|"chosen"} [args.mode]
 * @param {string} args.text — the player's line
 * @param {string|null} [args.speakerActorId] — the speaker's character
 * @param {Object} args.campaignState
 * @param {string|null} args.apiKey
 * @param {string} [args.mischiefLevel] — the Mischief dial ("serious" | "lawful" | "balanced" | "chaotic")
 * @param {{ moveId: string }|null} [args.chosen] — `chosen` mode: the move a card chose
 * @param {string} [args.canonicalBlock] — `chosen` mode: that move's own text
 * @param {Array<{ name: string, text: string }>|null} [args.round] — a round's other submitted actions
 * @param {string} [args.recentScene] — what the line follows (narrator.js getRecentSceneForReading)
 * @param {ReturnType<typeof readLineSituation>|null} [args.situation] — read once by the
 *   caller and handed to the availability and the gate too; read here when not given
 * @param {ReturnType<typeof availableMoves>|null} [args.available]
 * @returns {Promise<Reading>} never throws
 */
export async function readLine({
  mode = READING_MODES.OPEN, text, speakerActorId = null, campaignState = null, apiKey = null, mischiefLevel = "serious",
  chosen = null, canonicalBlock = "", round = null, recentScene = "", situation = null, available = null,
}) {
  const readingMode = MODES.has(mode) ? mode : READING_MODES.OPEN;
  const chosenMove = readingMode === READING_MODES.CHOSEN && MOVES[chosen?.moveId] ? { moveId: chosen.moveId } : null;
  if (readingMode === READING_MODES.CHOSEN && !chosenMove) return failedReading(readingMode, "no move was chosen");
  if (!apiKey) return failedReading(readingMode, "no Claude API key is set");
  if (!String(text ?? "").trim()) return failedReading(readingMode, "the line is empty");

  let s = situation;
  if (!s) {
    let actor = null;
    try { actor = speakerActorId ? (globalThis.game?.actors?.get?.(speakerActorId) ?? null) : null; } catch { actor = null; }
    s = readLineSituation(actor, { campaignState });
  }
  const systemPrompt = buildReaderSystemPrompt();
  // The Mischief note (never for a chosen move). Balanced's is the same for
  // every line, so it is the system's second block, cached with the first;
  // Chaotic's heuristics are built from the line, so it rides with the line.
  const framing = readingMode === READING_MODES.CHOSEN ? null : buildMischiefFraming(mischiefLevel, text);
  const standingNote = framing && mischiefLevel === "balanced" ? `${MISCHIEF_HEADING}\n\n${mischiefNote(framing)}` : null;
  const userMessage = buildReaderUserMessage({
    mode: readingMode, text, situation: s, available, chosen: chosenMove, canonicalBlock, round, recentScene,
    mischiefFraming: standingNote ? null : framing,
  });

  // One call, and one retry after a rate limit (narrator.js's rule). The
  // call is made here, not in a helper above it, so the runner's kind is
  // `callReaderAPI>readLine` whichever caller reads the line.
  let failure = "the reader's call failed";
  for (let tries = 0; tries < 2; tries += 1) {
    try {
      if (tries) await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      const reply = await callReaderAPI({ apiKey, systemPrompt, standingNote, userMessage, promptCachingEnabled: campaignState?.api?.promptCachingEnabled ?? true });
      return parseReading(reply.text, {
        mode: readingMode, chosen: chosenMove, mischiefLevel, combatPosition: s?.position ?? null, narration: text, cutShort: reply.cutShort,
      });
    } catch (err) {
      failure = `the reader's call failed: ${String(err?.message ?? err).slice(0, 200)}`;
      if (!tries && isRateLimit(err)) continue;
      console.warn(`${MODULE_ID} | line reader: ${failure}`);
      break;
    }
  }
  return failedReading(readingMode, failure);
}

function isRateLimit(err) {
  const message = String(err?.message ?? "");
  return message.includes("429") || message.toLowerCase().includes("rate limit");
}

/**
 * The reader's call: its system prompt cached for an hour (unless the
 * world's prompt caching is off), the user message uncached.
 *
 * @returns {Promise<{ text: string, cutShort: boolean }>}
 */
async function callReaderAPI({ apiKey, systemPrompt, standingNote = null, userMessage, promptCachingEnabled = true }) {
  const block = (text) => (promptCachingEnabled
    ? { type: "text", text, cache_control: { type: "ephemeral", ttl: CACHE_TTL } }
    : { type: "text", text });
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // The rules — the same bytes for every call and world — then the table's
    // standing Mischief note where it has one (the same for every line).
    system: [block(systemPrompt), ...(standingNote ? [block(standingNote)] : [])],
    messages: [{ role: "user", content: userMessage }],
  };
  const headers = { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  const data = await apiPost(ANTHROPIC_URL, headers, body, { label: "lineReader" });
  const text = (data?.content ?? []).filter(b => b?.type === "text").map(b => b.text).join("");
  if (!text) throw new Error(data?.stop_reason === "refusal" ? "the model declined the request" : "the reply held no text");
  return { text, cutShort: data?.stop_reason === "max_tokens" };
}

// ─────────────────────────────────────────────────────────────────────────────
// The parse — tolerant, never throwing
// ─────────────────────────────────────────────────────────────────────────────

/** A reading that is none: the call failed, or its reply could not be read. */
function failedReading(mode, why) {
  return {
    mode, moveId: null, asked: false, risk: null, category: "exploration", confidence: "low", reason: "",
    plainMove: null, sceneChallenge: null, interpretation: null, failed: why,
  };
}

/** The JSON object in a reply: fences stripped, prose around it ignored. Null when there is none. */
function replyObject(rawText) {
  const text = String(rawText ?? "").replace(/```(?:json)?|```/g, "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    const parsed = JSON.parse(text.slice(first, last + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const declines = (value) => value === null || (typeof value === "string" && /^(none|null|no[ _-]?move)$/i.test(value.trim()));
const word = (value, allowed, fallback) => {
  const w = typeof value === "string" ? value.trim().toLowerCase() : "";
  return allowed.has(w) ? w : fallback;
};
const nameText = (value, cap) => (typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim().slice(0, cap) : null);

function confidenceOf(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value >= 0.75 ? "high" : value >= 0.45 ? "medium" : "low";
  return word(value, CONFIDENCES, "medium");
}

/**
 * The reply as a reading: today's two parses joined. Fences and prose
 * around the object are stripped; a move's display name is its id; an
 * unknown move, a reply with no `move` key, or no move where a roll was
 * asked for is a failed reading; a chosen move stands whatever the reply
 * named; `asked` / `risk` / `confidence` / `category` are held to their
 * words (an unknown risk on a rolled move is "plain", an unknown confidence
 * "medium", an unknown category "exploration"). Then the holds that need no
 * more than the reading: the position remap (interpreter.js
 * constrainMoveToPosition), a stat the move lists (the Chaotic dial excepted;
 * a chosen move always), Heal's situation, the stakes normalised and priced,
 * and a Balanced misread kept in kind on its own plain move
 * (keepMischiefInKind, D16). Pure.
 *
 * @param {string} rawText
 * @param {{ mode?: string, chosen?: { moveId: string }|null, mischiefLevel?: string,
 *   combatPosition?: "in_control"|"bad_spot"|null, narration?: string, cutShort?: boolean }} [opts]
 * @returns {Reading}
 */
export function parseReading(rawText, { mode = READING_MODES.OPEN, chosen = null, mischiefLevel = "serious", combatPosition = null, narration = "", cutShort = false } = {}) {
  const parsed = replyObject(rawText);
  if (!parsed) return failedReading(mode, cutShort ? "the reply was cut short" : "the reply could not be read");
  const chosenId = mode === READING_MODES.CHOSEN && MOVES[chosen?.moveId] ? chosen.moveId : null;

  const category = word(parsed.category, CATEGORIES, "exploration");
  const confidence = confidenceOf(parsed.confidence);
  const reason = typeof parsed.reason === "string" ? parsed.reason.replace(/\s+/g, " ").trim().slice(0, 280)
    : typeof parsed.rationale === "string" ? parsed.rationale.replace(/\s+/g, " ").trim().slice(0, 280) : "";
  const asked = parsed.asked === true || parsed.asked === "true";
  const base = { mode, asked, category, confidence, reason, failed: null };

  // The move. A reply with no `move` key says nothing: a failed reading.
  const hasMove = Object.hasOwn(parsed, "move") || Object.hasOwn(parsed, "moveId");
  const raw = Object.hasOwn(parsed, "move") ? parsed.move : parsed.moveId;
  let moveId = chosenId;
  if (!moveId) {
    if (!hasMove) return failedReading(mode, cutShort ? "the reply was cut short" : "the reply named no move and said none was made");
    if (declines(raw)) {
      if (mode === READING_MODES.ROLL) return failedReading(mode, "a roll was asked for, and the reply named no move");
      return { ...base, moveId: null, risk: null, plainMove: null, sceneChallenge: null, interpretation: null };
    }
    // An id it does not know with a name it does is read by the name (issue #326 W38).
    moveId = toMoveId(raw) ?? toMoveId(parsed.moveName);
    if (!moveId) return failedReading(mode, `the reply named no move the module knows (${String(raw).slice(0, 60)})`);
  }

  // The position remap: a combat move for the wrong position is the same intent's for the speaker's.
  const named = moveId;
  if (!chosenId) moveId = constrainMoveToPosition(moveId, combatPosition);
  const remapped = moveId !== named;
  const move = MOVES[moveId];
  // A line that names the move it is read as asks for it, whatever the reply said.
  const askedByName = !chosenId && (lineNamesMove(narration, named) || lineNamesMove(narration, moveId));

  // The stat: one the move lists (Chaotic keeps an unlisted one; a chosen move never).
  const listed = Array.isArray(move.stat) ? move.stat : [];
  let statUsed = typeof parsed.stat === "string" ? parsed.stat.trim().toLowerCase()
    : typeof parsed.statUsed === "string" ? parsed.statUsed.trim().toLowerCase() : null;
  if (!listed.length || move.progressMove === true) statUsed = null;
  else {
    const valid = STATS.includes(statUsed) || METER_STATS.has(statUsed);
    const keepUnlisted = !chosenId && mischiefLevel === "chaotic" && valid;
    if (!listed.includes(statUsed) && !keepUnlisted) statUsed = listed[0];
  }
  // How much hangs on the line: the reply's word, for a move that is rolled.
  const riskWord = word(parsed.risk, RISK_WORDS, "plain");
  const mischiefApplied = !chosenId && parsed.mischiefApplied === true;
  const sceneChallenge = nameText(parsed.sceneChallenge, 80);
  const rationale = remapped
    ? `${reason}${reason ? " " : ""}(Adjusted to ${moveDisplayName(moveId)} — you are ${combatPosition === "bad_spot" ? "in a bad spot" : "in control"}.)`
    : reason;

  let interpretation = {
    playerNarration:  narration,
    inputMethod:      "chat",
    mischiefLevel,
    moveId,
    moveName:         moveDisplayName(moveId),
    statUsed,
    // The numbers are the module's, never the model's (interpreter.js, issue #322 V08).
    statValue:        0,
    adds:             0,
    isProgressMove:   move.progressMove === true,
    progressTicks:    0,
    moveTarget:       nameText(parsed.target ?? parsed.moveTarget, 120) ?? (sceneChallenge && moveId.endsWith("_scene_challenge") ? sceneChallenge : null),
    expeditionRank:   nameText(parsed.expeditionRank, 20)?.toLowerCase() ?? null,
    combatRank:       nameText(parsed.combatRank, 20)?.toLowerCase() ?? null,
    healSituation:    moveId === "heal" && HEAL_SITUATIONS.has(parsed.healSituation) ? parsed.healSituation : null,
    rationale,
    stakes:           move.progressMove !== true && statUsed ? withPriceSource(normaliseStakes(parsed.stakes), missPaysPrice(moveId)) : null,
    mischiefApplied,
    confidence,
    positionConstraintApplied: remapped,
    playerConfirmed:  false,
  };
  const plainMove = mischiefApplied ? toMoveId(parsed.plainMove) : null;
  interpretation = keepMischiefInKind(interpretation, plainMove ? { moveId: plainMove, category } : null, mischiefLevel);

  return {
    ...base,
    asked: base.asked || askedByName,
    moveId: interpretation.moveId,
    risk: isRolledMove(interpretation.moveId) ? riskWord : null,
    plainMove,
    sceneChallenge,
    interpretation,
  };
}
