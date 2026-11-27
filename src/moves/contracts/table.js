/**
 * STARFORGED COMPANION
 * src/moves/contracts/table.js — every move as a contract
 *
 * Overhaul 4, "moves as contracts" (decision D1: a table beside MOVES, not
 * fields on it — schemas.js is data the runner's independent rules model and
 * every file import, and a predicate reads the sheet through actorBridge).
 * One row a move id in MOVES (schemas.js), plus the one move the module makes
 * from a button with no MOVES id (toMoveId gives none): Begin the Scene. A row holds:
 *
 *   group     the move's category (MOVES[id].category; "scene_challenge" for Begin the Scene)
 *   trigger   the game's own trigger words — the vendored move's text
 *             (foundry-ironsworn json-packs/starforged-moves, `system.Text`),
 *             static so a cached reader prompt never waits on a compendium
 *             read; moveContracts.test.js holds each to the pack, word for word
 *   target    what the move is made with or for: "self" · "patient" · "ally" ·
 *             "person" · "connection" · "vow" · "fight" · "expedition" ·
 *             "challenge" · "vehicle" · "companion" · "legacy" · null
 *   requires  its preconditions (predicates.js), in the order the gate asks
 *   makes     move-only state its result makes (slice 3's MOVE_ONLY_STATE names
 *             every writer): "connection" · "bond" · "vow-progress" · "fight" ·
 *             "expedition" · "scene-challenge" · "progress:fight" · "progress:expedition"
 *   ends      move-only state its result ends: "vow" · "fight" · "expedition" · "scene-challenge"
 *   obliges   the obligation kinds its result carries beyond the generic ones
 *             (obligations.js OBLIGATION_KINDS — resultObligations reads it):
 *             "vow" (a fulfilment's hit says what the vow asked for),
 *             "milestone", "recommit" (a progress move's miss leaves the
 *             recommit to the player), "fight" (an Enter the Fray's fight
 *             still only offered), "foe" (a blow in an open fight does not
 *             end it — only Take Decisive Action does; FIGHT-PAST-ITS-END).
 *             The generic kinds — [outcome], [stakes],
 *             [price], [cost], [chosen], [match], [overridden], [state],
 *             [sheet], [apparatus] — every move's result may carry, by what
 *             the resolution and its cards say
 *   gated     "never" — safety and the table's own tools (Set a Flag, Change
 *             Your Fate, Take a Break, Ask the Oracle, Pay the Price): the
 *             gate passes them unread · "table" — made by the table's own
 *             panels, never a reader's (Begin / End a Session, Earn
 *             Experience) · absent: gated by its `requires`
 *   instead   the reroutes the gate does not apply itself, as data for the
 *             reader's MOVES NOW block (slice 6): `[{ to, when }]`. Set a
 *             Course's uncharted reroute stays readMove's
 *             (travel.js rerouteUnchartedCourse): it resolves the destination
 *             with the arrival's own place resolver, a host helper the pure
 *             gate does not hold.
 *
 * The shape is stable — overhaul 1's reader builds availableMoves /
 * formatAvailableMoves / moveTriggers on it (gate.js). A row lists only what
 * it adds to the generic contract: a move with `requires: []` is made
 * whenever its trigger fits the line (the pipeline's own gates — a player
 * character behind the line, a session in play — gate every line, move or not).
 */

import {
  OPEN_FIGHT, POSITION, OPEN_TRACK, EXPEDITION_OR_SITE, WITHIN_SCENE_CHALLENGE,
  OPEN_VOW, ROOM_ON_VOW,
  THEIR_CONNECTION, NOT_YET_THEIR_CONNECTION, ROOM_ON_RELATIONSHIP, NOT_BONDED, NOT_AT_A_PC,
  AN_ALLY, A_VEHICLE, A_COMPANION,
  RECOVERABLE, SOMETHING_DAMAGED, PARTY_HAS_SOMETHING_TO_RECOVER,
  FROM_A_WAYPOINT, LEGACY_TRACK_NAMED,
} from "./predicates.js";

const OPEN_VOW_ANY = OPEN_VOW();
const OPEN_VOW_OWN = OPEN_VOW({ own: true });

/** A row, frozen, its lists defaulted. */
function row(spec) {
  return Object.freeze({
    group: null, trigger: "", target: null, requires: [], makes: [], ends: [], obliges: [], gated: null, instead: [],
    ...spec,
  });
}

/**
 * The contracts, a row a move id. See the file header for the fields.
 * @type {Readonly<Object<string, Readonly<Object>>>}
 */
export const MOVE_CONTRACTS = Object.freeze({
  // ── Session — the table's tools ─────────────────────────────────────────
  begin_a_session: row({ group: "session", gated: "table",
    trigger: "When you begin a significant session or chapter of play, do all of the following." }),
  set_a_flag: row({ group: "session", gated: "never",
    trigger: "When you identify situations or topics you don’t want to include, don’t want to envision in detail, or otherwise may need mindfulness when approaching, that content is now flagged." }),
  change_your_fate: row({ group: "session", gated: "never",
    trigger: "When you encounter flagged content, reject an oracle, resist a consequence, or otherwise need to shift your circumstances within the game for your comfort or enjoyment, pause and identify what needs to be changed." }),
  take_a_break: row({ group: "session", gated: "never",
    trigger: "When you resolve a progress move or complete an intense scenario, take a few deep breaths and take some time to attend to the needs of your body." }),
  end_a_session: row({ group: "session", gated: "table",
    trigger: "When you end a significant session or chapter of play, reflect on the events of the game and identify any missed opportunities to mark progress." }),

  // ── Adventure ───────────────────────────────────────────────────────────
  face_danger: row({ group: "adventure",
    trigger: "When you attempt something risky or react to an imminent threat, envision your action and roll." }),
  secure_an_advantage: row({ group: "adventure",
    trigger: "When you assess a situation, make preparations, or attempt to gain leverage, envision your action and roll." }),
  gather_information: row({ group: "adventure",
    trigger: "When you search for clues, conduct an investigation, analyze evidence, or do research, roll +wits." }),
  compel: row({ group: "adventure", target: "person", requires: [NOT_AT_A_PC],
    trigger: "When you try to persuade someone or make them an offer, envision your approach." }),
  aid_your_ally: row({ group: "adventure", target: "ally", requires: [AN_ALLY],
    trigger: "When you act in direct support of an ally, envision how you aid them." }),
  check_your_gear: row({ group: "adventure",
    trigger: "When you check to see if you have a specific helpful item or resource, roll +supply." }),

  // ── Quest ───────────────────────────────────────────────────────────────
  swear_an_iron_vow: row({ group: "quest", target: "vow",
    trigger: "When you swear upon iron to complete a quest, write your vow and give it a rank." }),
  reach_a_milestone: row({ group: "quest", target: "vow", requires: [OPEN_VOW_ANY, ROOM_ON_VOW], makes: ["vow-progress"], obliges: ["milestone"],
    trigger: "When you make headway in your quest by doing any of the following: overcoming a critical obstacle; gaining meaningful insight; completing a perilous expedition; acquiring a crucial item or resource; earning vital support; defeating a notable foe — you may mark progress per the rank of the vow." }),
  fulfill_your_vow: row({ group: "quest", target: "vow", requires: [OPEN_VOW_ANY], ends: ["vow"], obliges: ["vow", "recommit"],
    trigger: "When you reach the end of your quest, roll the challenge dice and compare to your progress." }),
  forsake_your_vow: row({ group: "quest", target: "vow", requires: [OPEN_VOW_OWN], ends: ["vow"],
    trigger: "When you renounce your quest, betray your promise, or the goal is lost to you, clear the vow." }),

  // ── Connection ──────────────────────────────────────────────────────────
  make_a_connection: row({ group: "connection", target: "person", requires: [NOT_AT_A_PC, NOT_YET_THEIR_CONNECTION], makes: ["connection"],
    trigger: "When you search out a new relationship or give focus to an existing relationship (not an ally or companion), roll +heart." }),
  develop_your_relationship: row({ group: "connection", target: "connection", requires: [NOT_AT_A_PC, THEIR_CONNECTION, ROOM_ON_RELATIONSHIP],
    trigger: "When you reinforce your relationship with a connection by doing any of the following: swearing a vow to undertake a perilous quest in their service; completing a quest to their benefit; leveraging their help in desperate circumstances; giving them something of worth; sharing a profound moment; standing with them against hardship; overcoming a test of your relationship — you may mark progress per the rank of the connection." }),
  test_your_relationship: row({ group: "connection", target: "connection", requires: [NOT_AT_A_PC, THEIR_CONNECTION],
    trigger: "When your relationship with a connection is tested through conflict, betrayal, or circumstance, roll +heart." }),
  forge_a_bond: row({ group: "connection", target: "connection", requires: [NOT_AT_A_PC, THEIR_CONNECTION, NOT_BONDED], makes: ["bond"], obliges: ["recommit"],
    trigger: "When your relationship with a connection is ready to evolve, roll the challenge dice and compare to your progress." }),

  // ── Exploration ─────────────────────────────────────────────────────────
  undertake_an_expedition: row({ group: "exploration", target: "expedition", makes: ["expedition", "progress:expedition"],
    trigger: "When you trailblaze a route through perilous space, journey over hazardous terrain, or survey a mysterious site, give the expedition a name and rank." }),
  explore_a_waypoint: row({ group: "exploration", target: "expedition", requires: [EXPEDITION_OR_SITE], makes: ["progress:expedition"],
    trigger: "When you divert from an expedition to examine a notable location, roll +wits." }),
  finish_an_expedition: row({ group: "exploration", target: "expedition", requires: [OPEN_TRACK("expedition")], ends: ["expedition"], obliges: ["recommit"],
    trigger: "When your expedition comes to an end, roll the challenge dice and compare to your progress." }),
  set_a_course: row({ group: "exploration", target: "place",
    instead: [{ to: "undertake_an_expedition", when: "the destination is no charted, known place" }],
    trigger: "When you follow a known route through perilous space, across hazardous terrain, or within a mysterious site, roll +supply." }),
  make_a_discovery: row({ group: "exploration", requires: [FROM_A_WAYPOINT],
    trigger: "When your exploration of a waypoint uncovers something wondrous, roll on the table below or choose one." }),
  confront_chaos: row({ group: "exploration", requires: [FROM_A_WAYPOINT],
    trigger: "When your exploration of a waypoint uncovers something dreadful, decide the number of aspects: one, two, or three." }),

  // ── Scene challenge ─────────────────────────────────────────────────────
  face_danger_scene_challenge: row({ group: "scene_challenge", target: "challenge", requires: [WITHIN_SCENE_CHALLENGE],
    trigger: "When you attempt something risky or react to an imminent threat within a scene challenge, envision your action and roll." }),
  secure_an_advantage_scene_challenge: row({ group: "scene_challenge", target: "challenge", requires: [WITHIN_SCENE_CHALLENGE],
    trigger: "When you assess a situation, make preparations, or attempt to gain leverage within a scene challenge, envision your action and roll." }),
  finish_the_scene: row({ group: "scene_challenge", target: "challenge", requires: [OPEN_TRACK("scene_challenge")], ends: ["scene-challenge"],
    trigger: "When the scene challenge tension clock or progress track is filled, or when events lead to the scene’s conclusion, roll the challenge dice and compare to your progress." }),
  begin_the_scene: row({ group: "scene_challenge", target: "challenge", makes: ["scene-challenge"],
    trigger: "When you face an extended or complex challenge, name your objective and choose a rank as appropriate to the situation." }),

  // ── Combat ──────────────────────────────────────────────────────────────
  enter_the_fray: row({ group: "combat", target: "fight", makes: ["fight"], obliges: ["fight"],
    trigger: "When you initiate combat or are forced into a fight, envision your objective and give it a rank." }),
  gain_ground: row({ group: "combat", target: "fight", requires: [OPEN_FIGHT, POSITION("in_control", { instead: "react_under_fire" })], makes: ["progress:fight"], obliges: ["foe"],
    trigger: "When you are in control and take action in a fight to reinforce your position or move toward an objective, envision your approach and roll." }),
  strike: row({ group: "combat", target: "fight", requires: [OPEN_FIGHT, POSITION("in_control", { instead: "clash" })], makes: ["progress:fight"], obliges: ["foe"],
    trigger: "When you are in control and assault a foe at close quarters, roll +iron; when you attack at a distance, roll +edge." }),
  clash: row({ group: "combat", target: "fight", requires: [OPEN_FIGHT, POSITION("bad_spot", { instead: "strike" })], makes: ["progress:fight"], obliges: ["foe"],
    trigger: "When you are in a bad spot and fight back against a foe at close quarters, roll +iron; when you exchange fire at a distance, roll +edge." }),
  react_under_fire: row({ group: "combat", target: "fight", requires: [OPEN_FIGHT, POSITION("bad_spot", { instead: "gain_ground" })], obliges: ["foe"],
    trigger: "When you are in a bad spot and take action in a fight to avoid danger or overcome an obstacle, envision your approach and roll." }),
  take_decisive_action: row({ group: "combat", target: "fight", requires: [OPEN_FIGHT], ends: ["fight"],
    trigger: "When you seize an objective in a fight, envision how you take decisive action." }),
  face_defeat: row({ group: "combat", target: "fight", requires: [OPEN_FIGHT],
    trigger: "When you abandon or are deprived of an objective, envision the consequence of this failure, clear the objective, and Pay the Price." }),
  battle: row({ group: "combat", target: "fight", requires: [OPEN_TRACK("combat", { onlyNamed: true })], ends: ["fight"],
    trigger: "When you fight a battle and it happens in a blur, envision your objective and roll." }),

  // ── Suffer ──────────────────────────────────────────────────────────────
  lose_momentum: row({ group: "suffer",
    trigger: "When you are delayed or disadvantaged, suffer -1 momentum for a minor setback, -2 for a serious setback, or -3 for a major setback." }),
  endure_harm: row({ group: "suffer", target: "self",
    trigger: "When you face physical injury, fatigue, or illness, suffer -1 health for minor harm, -2 for serious harm, or -3 for major harm." }),
  endure_stress: row({ group: "suffer", target: "self",
    trigger: "When you face mental strain, shock, or despair, suffer -1 spirit for minor stress, -2 for serious stress, or -3 for major stress." }),
  withstand_damage: row({ group: "suffer", target: "vehicle", requires: [A_VEHICLE],
    trigger: "When your vehicle faces a damaging situation or environment, suffer -1 integrity for minor damage, -2 for serious damage, or -3 for major damage." }),
  companion_takes_a_hit: row({ group: "suffer", target: "companion", requires: [A_COMPANION],
    trigger: "When your companion faces physical hardship, they suffer -1 health for minor harm, -2 for serious harm, or -3 for major harm." }),
  sacrifice_resources: row({ group: "suffer", target: "self",
    trigger: "When you lose or consume resources, suffer -1 supply for a minor loss, -2 for a serious loss, or -3 for a major loss." }),

  // ── Recover ─────────────────────────────────────────────────────────────
  sojourn: row({ group: "recover", requires: [PARTY_HAS_SOMETHING_TO_RECOVER],
    trigger: "When you spend time recovering within a community, roll +heart." }),
  heal: row({ group: "recover", target: "patient", requires: [RECOVERABLE({ meter: "health", of: "patient" })],
    trigger: "When you receive medical care or provide treatment, envision the situation and roll." }),
  hearten: row({ group: "recover", target: "self", requires: [RECOVERABLE({ meter: "spirit" })],
    trigger: "When you socialize, share intimacy, or find a moment of peace, roll +heart." }),
  resupply: row({ group: "recover", target: "self", requires: [RECOVERABLE({ meter: "supply", readerSettled: true })],
    trigger: "When you attempt to bolster your readiness, envision the opportunity and your approach." }),
  repair: row({ group: "recover", target: "vehicle", requires: [SOMETHING_DAMAGED],
    trigger: "When you make repairs to your vehicles, modules, mechanical companions, or other devices, envision the situation and roll." }),

  // ── Threshold — the brink is the fiction's, which no meter settles ───────
  face_death: row({ group: "threshold", target: "self",
    trigger: "When you encounter a situation where death is an immediate and unavoidable outcome, you are dead. When you are instead brought to the brink of death with a chance for recovery or redemption, roll +heart." }),
  face_desolation: row({ group: "threshold", target: "self",
    trigger: "When you are brought to the brink of desolation, roll +heart." }),
  overcome_destruction: row({ group: "threshold", target: "vehicle",
    trigger: "When your command vehicle is destroyed or irrevocably lost, you must discard the asset, along with any modules and docked support vehicles." }),

  // ── Legacy ──────────────────────────────────────────────────────────────
  earn_experience: row({ group: "legacy", gated: "table",
    trigger: "When you fill a box (four ticks) on any legacy track, take 2 experience." }),
  advance: row({ group: "legacy",
    trigger: "When you develop your abilities, improve your resources, gain a reward, or boost your influence, you may spend 3 experience to add a new asset, or 2 experience to upgrade an asset." }),
  continue_a_legacy: row({ group: "legacy", target: "legacy", requires: [LEGACY_TRACK_NAMED],
    trigger: "When you retire from your life as Ironsworn, or succumb to death or desolation, you may create a new character in your established setting." }),

  // ── Fate — never gated ──────────────────────────────────────────────────
  ask_the_oracle: row({ group: "fate", gated: "never",
    trigger: "When you seek to resolve questions, reveal details, discover locations, determine how other characters respond, or trigger encounters or events, you may…" }),
  pay_the_price: row({ group: "fate", gated: "never",
    trigger: "When you suffer the outcome of an action, choose one." }),
});

/**
 * The contract for a move id, or null for an id no row holds.
 *
 * @param {string|null} moveId
 * @returns {Readonly<Object>|null}
 */
export function contractFor(moveId) {
  return typeof moveId === "string" && Object.prototype.hasOwnProperty.call(MOVE_CONTRACTS, moveId)
    ? MOVE_CONTRACTS[moveId] : null;
}
