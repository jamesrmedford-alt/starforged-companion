/**
 * STARFORGED COMPANION
 * src/moves/readerCatalogue.js — the moves the line reader names, by the game's own triggers
 *
 * The line reader (src/moves/reader.js) is told what each move is by the
 * game's words, not ours. Today's two readers paraphrase: Develop Your
 * Relationship is "deepen a connection" (interpreter.js, classifier.js), and
 * the pacing reader's always-offered block says "something done for a
 * connection that costs the character or meets a real need" — so five pleas
 * for a tie ("Will you be that?") were booked as Develop, the track filled
 * 0 → 10 with no roll (issue #383 finding 1, CONNECTION-MADE-BY-CONFIRMING-A-
 * DRAFT). The game's trigger is seven deeds, and asking is none of them. Its
 * Reach a Milestone is "When you make headway in your quest", by six named
 * kinds of headway — the vow-step rule read the claim instead (finding 3).
 *
 * So each entry quotes the system's own move text (foundry-ironsworn's
 * `starforgedmoves` pack, an `sfmove` document's `system.Text`): the trigger,
 * and the list after it where the list decides — the deeds, the kinds of
 * headway, the approaches and their stats. A module ruling sits beside it in
 * brackets, one sentence, each one already decided (issue #384, D3) — never a paraphrase in its place.
 * The outcomes are left out: the reader does not need them.
 *
 * The set is the one the move reader lists today (interpreter.js's MOVE
 * REFERENCE): none added, none dropped. The session moves are not in it —
 * they are the table's own buttons, never a line's.
 *
 * Every quoted fragment (`when` and each `list` item) is a verbatim span of
 * its move's text once the text is reduced as buildCanonicalMoveBlock reduces
 * it (links to their labels, tags dropped) with its `__` emphasis, its list
 * bullets and its runs of whitespace taken out. A Quench test holds the
 * catalogue to the installed pack — the drift check for a system update
 * (src/integration/quench.js, "the line reader's catalogue quotes…").
 *
 * Pure data and a pure renderer: no Foundry, no model call. Its bytes go into
 * the reader's cached system prompt, so nothing here varies per call.
 */

import { moveTriggers } from "./contracts/available.js";
import { MOVES } from "../schemas.js";

const entry = (id, name, more = {}) => Object.freeze({ id, name, ...more });
const group = (title, moves, note = null) => Object.freeze({ title, note, moves: Object.freeze(moves) });

const FACE_DANGER_APPROACHES = Object.freeze([
  "With speed, mobility, or agility: Roll +edge",
  "With resolve, command, or sociability: Roll +heart",
  "With strength, endurance, or aggression: Roll +iron",
  "With deception, stealth, or trickery: Roll +shadow",
  "With expertise, focus, or observation: Roll +wits",
]);
// The system's own text for Secure an Advantage writes its iron approach without "or".
const SECURE_APPROACHES = Object.freeze([
  "With speed, mobility, or agility: Roll +edge",
  "With resolve, command, or sociability: Roll +heart",
  "With strength, endurance, aggression: Roll +iron",
  "With deception, stealth, or trickery: Roll +shadow",
  "With expertise, focus, or observation: Roll +wits",
]);

/**
 * The catalogue, grouped as the game groups its moves. Each entry: the move's
 * id (a MOVES key), the system's name for it, `when` — its trigger, quoted —
 * and, where they decide, `list` (the items after the trigger, each quoted)
 * and `ruling` (the module's, in its own words). A group's `note` is a ruling
 * for every move in it.
 */
export const READER_CATALOGUE = Object.freeze([
  group("ADVENTURE", [
    entry("face_danger", "Face Danger", { list: FACE_DANGER_APPROACHES }),
    entry("secure_an_advantage", "Secure an Advantage", { list: SECURE_APPROACHES }),
    entry("gather_information", "Gather Information"),
    entry("compel", "Compel", {
      list: ["Charm, pacify, encourage, or barter: Roll +heart", "Threaten or incite: Roll +iron", "Lie or swindle: Roll +shadow"],
    }),
    entry("aid_your_ally", "Aid Your Ally", {
        ruling: "An ally is another player character. It is rolled: its stat is the approach's — edge, heart, iron, shadow or wits.",
      }),
    entry("check_your_gear", "Check Your Gear"),
  ]),
  group("QUEST", [
    entry("swear_an_iron_vow", "Swear an Iron Vow", {
      ruling: "A vow sworn in a connection's service is this, never Develop Your Relationship's deed in its place (that follows from the vow).",
    }),
    entry("reach_a_milestone", "Reach a Milestone", {
      list: ["overcoming a critical obstacle", "gaining meaningful insight", "completing a perilous expedition",
        "acquiring a crucial item or resource", "earning vital support", "defeating a notable foe"],
      ruling: "It marks the vow's progress with no roll. The RECENT SCENE bears the headway out (rule 6).",
    }),
    entry("fulfill_your_vow", "Fulfill Your Vow", {
      ruling: "When the line claims what the vow swore — its goal reached — as the scene bears out: this, not a milestone (rule 6).",
    }),
    entry("forsake_your_vow", "Forsake Your Vow"),
  ]),
  group("CONNECTION", [
    entry("make_a_connection", "Make a Connection", {
        ruling: "Not for someone who is already the character's connection: the SITUATION lists them.",
      }),
    entry("develop_your_relationship", "Develop Your Relationship", {
      list: ["swearing a vow to undertake a perilous quest in their service", "completing a quest to their benefit",
        "leveraging their help in desperate circumstances", "giving them something of worth", "sharing a profound moment",
        "standing with them against hardship", "overcoming a test of your relationship"],
      ruling: "A favour that costs the giver time or standing, or bringing them what they lack, is giving them something of worth; a risk taken for them is standing with them against hardship; offering it is doing it. Asking for the relationship itself while it is being built — trust, friendship, to count on each other — is talk, no deed (rule 4). A vow sworn in their service is Swear an Iron Vow, never this in its place. No roll for a connection not yet bonded: it marks progress. Bonded, it is rolled +their rank, which the module fills in.",
    }),
    entry("test_your_relationship", "Test Your Relationship"),
    entry("forge_a_bond", "Forge a Bond", {
      ruling: "A full relationship track is ready for it; less does not forbid it, at worse odds. Never for a connection already bonded. Asking to make the tie lasting — for good, whatever comes — with the track ready is this, not talk (rule 4).",
    }),
  ]),
  group("EXPLORATION", [
    entry("undertake_an_expedition", "Undertake an Expedition", {
        list: ["Move at speed: Roll +edge", "Keep under the radar: Roll +shadow", "Stay vigilant: Roll +wits"],
        ruling: "Any journey toward a destination that is not a charted place, even when the player says \"set a course\".",
      }),
    entry("explore_a_waypoint", "Explore a Waypoint", {
      ruling: "During an expedition, or exploring inside a site (a vault, a derelict).",
    }),
    entry("finish_an_expedition", "Finish an Expedition"),
    entry("set_a_course", "Set a Course", {
        ruling: "A known route to one of the SITUATION's charted places, or back to a familiar one.",
      }),
    entry("make_a_discovery", "Make a Discovery", {
      ruling: "Made by an Explore a Waypoint roll's match, not by a line.",
    }),
    entry("confront_chaos", "Confront Chaos", {
      ruling: "Made by an Explore a Waypoint roll's match, not by a line.",
    }),
  ]),
  group("SCENE CHALLENGE", [
    entry("face_danger_scene_challenge", "Face Danger (Scene Challenge)", { ruling: "Its approaches and stats are Face Danger's." }),
    entry("secure_an_advantage_scene_challenge", "Secure an Advantage (Scene Challenge)", { ruling: "Its approaches and stats are Secure an Advantage's." }),
    entry("finish_the_scene", "Finish the Scene"),
  ], "Only while the SITUATION shows a scene challenge open: name it in sceneChallenge and in target."),
  group("COMBAT", [
    entry("enter_the_fray", "Enter the Fray", {
      list: ["On the move: Roll +edge", "Facing off against your foe: Roll +heart", "In the thick of it at close quarters: Roll +iron",
        "Preparing to act against an unaware foe: Roll +shadow", "Caught in a trap or sizing up the situation: Roll +wits"],
    }),
    entry("gain_ground", "Gain Ground", {
      list: ["In pursuit, fleeing, or maneuvering: Roll +edge",
        "Charging boldly into action, coming to the aid of others, negotiating, or commanding: Roll +heart",
        "Gaining leverage with force, powering through, or making a threat: Roll +iron",
        "Hiding, preparing an ambush, or misdirecting: Roll +shadow",
        "Coordinating a plan, studying a situation, or cleverly gaining leverage: Roll +wits"],
    }),
    entry("strike", "Strike"),
    entry("clash", "Clash"),
    entry("react_under_fire", "React Under Fire", {
      list: ["In pursuit, fleeing, dodging, getting back into position, or taking cover: Roll +edge",
        "Remaining stalwart against fear or temptation: Roll +heart", "Blocking or diverting with force, or taking the hit: Roll +iron",
        "Moving into hiding or creating a distraction: Roll +shadow",
        "Changing the plan, finding a way out, or cleverly bypassing an obstacle: Roll +wits"],
    }),
    entry("take_decisive_action", "Take Decisive Action"),
    entry("face_defeat", "Face Defeat"),
    entry("battle", "Battle", {
      list: ["Fight at range, or using your speed and the environment to your advantage: Roll +edge",
        "Fight depending on your courage, leadership, or companions: Roll +heart", "Fight in close to overpower your foe: Roll +iron",
        "Fight using trickery to befuddle your foe: Roll +shadow", "Fight using careful tactics to outsmart your foe: Roll +wits"],
    }),
  ], "The speaker's position in each open fight is in the SITUATION; POSSIBLE NOW says which of these it allows."),
  group("SUFFER", [
    entry("lose_momentum", "Lose Momentum"),
    entry("endure_harm", "Endure Harm"),
    entry("endure_stress", "Endure Stress"),
    entry("withstand_damage", "Withstand Damage"),
    entry("companion_takes_a_hit", "Companion Takes a Hit"),
    entry("sacrifice_resources", "Sacrifice Resources"),
  ], "Only when the line describes taking the harm, stress, damage or loss — never trying to avoid it."),
  group("RECOVER", [
    entry("sojourn", "Sojourn"),
    entry("heal", "Heal", {
      list: ["Receive treatment from someone (not an ally): Roll +iron", "Mend your own wounds: Roll +iron or +wits, whichever is lower",
        "Obtain treatment for a companion: Roll +heart", "Provide care: Roll +wits"],
      ruling: "Name which of the four it is in healSituation.",
    }),
    entry("hearten", "Hearten"),
    entry("resupply", "Resupply", {
      list: ["Barter or make an appeal: Roll +heart", "Threaten or seize: Roll +iron", "Steal or swindle: Roll +shadow", "Scavenge or craft: Roll +wits"],
    }),
    entry("repair", "Repair", {
      list: ["Make your own repairs, or direct a companion to make repairs: Roll +wits", "Obtain repairs from someone (not an ally): Roll +supply"],
    }),
  ]),
  group("THRESHOLD", [
    entry("face_death", "Face Death"),
    entry("face_desolation", "Face Desolation"),
    entry("overcome_destruction", "Overcome Destruction"),
  ]),
  group("LEGACY", [
    entry("earn_experience", "Earn Experience"),
    entry("advance", "Advance"),
    entry("continue_a_legacy", "Continue a Legacy", {
      ruling: "One roll per legacy track: name the track rolled in target — quests, bonds or discoveries.",
    }),
  ], "Only when the line is plainly about it."),
  group("FATE", [
    entry("ask_the_oracle", "Ask the Oracle", {
        ruling: "Never a way to say nothing is rolled: a line that makes no move is no move.",
      }),
    entry("pay_the_price", "Pay the Price"),
  ], "Only when the line is plainly about it."),
]);

/** Every move id the catalogue names, in its order. */
export const CATALOGUE_MOVE_IDS = Object.freeze(READER_CATALOGUE.flatMap(g => g.moves.map(m => m.id)));

/** How a move is made, from its MOVES row: an action roll, a progress roll, or none. */
function rollKind(id) {
  const move = MOVES[id];
  if (move?.progressMove === true) return "progress roll";
  return Array.isArray(move?.stat) && move.stat.length ? null : "no roll";
}

/** Each catalogue move's trigger words, from the move contracts' table (read once). */
const TRIGGERS = moveTriggers(CATALOGUE_MOVE_IDS);

/**
 * The catalogue as THE MOVES section of the reader's system prompt: a group
 * at a time, each move as its id, its name and how it is made, the trigger in
 * quotes, the list after it, and the module's ruling in brackets. Pure: the
 * same bytes every call.
 *
 * @returns {string}
 */
export function renderReaderCatalogue() {
  const out = [];
  for (const g of READER_CATALOGUE) {
    out.push(`${g.title}${g.note ? ` [${g.note}]` : ""}`);
    for (const m of g.moves) {
      const kind = rollKind(m.id);
      // The trigger as the move contracts hold it (the one store — contracts/available.js moveTriggers),
      // its own list where the trigger does not already say it (an approach's stat).
      const trigger = String(TRIGGERS[m.id] ?? "").trim().replace(/[.:]$/, "");
      const listed = (m.list ?? []).filter(item => !trigger.includes(item));
      const list = listed.length ? ` — ${listed.join("; ")}.` : ".";
      out.push(`- ${m.id} (${m.name}${kind ? `; ${kind}` : ""}): "${trigger}"${list}${m.ruling ? ` [${m.ruling}]` : ""}`);
    }
    out.push("");
  }
  return out.join("\n").trim();
}
