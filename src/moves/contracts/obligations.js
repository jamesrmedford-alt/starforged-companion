/**
 * STARFORGED COMPANION
 * src/moves/contracts/obligations.js — what a narration must tell, and must not
 *
 * Overhaul 4, "moves as contracts" (decision D8). One block in a narration's
 * user message — last before its instruction, never in a cached block
 * (rules/narrator-memory.md invariant 7b) — in three lists, a tag a line:
 *
 *   TELL     this has happened
 *   NOT YET  the table has not decided this; bring the beat to it and stop
 *   NOT SO   never tell it as true
 *
 * Each line is an obligation `{ kind, list, text }`; OBLIGATION_KINDS holds
 * one row a kind — its list and the class of check that holds a narration to
 * it (slice 4: "certain" a regular expression, "floor" a lexical minimum,
 * "judge" a tripwire that sends a small model call, "logged" the post-
 * narration audit). The texts keep the words of the blocks they replace,
 * line for line — those words were tuned in live runs:
 *
 *   [outcome]    MOVE OUTCOME is what happened (new)
 *   [stakes]     what the player saw before the roll, and which of it this
 *                outcome delivers (stakes.js formatStakesBlock, issue #353 R1)
 *   [price]      a miss whose price is one of the player's choices, as the
 *                choice stands (formatPriceChoiceBlock — EXPLORE-WAYPOINT-
 *                MATCH-MISS-ADVISORY, SOJOURN-MISS-PRICE-NARRATED-BEFORE-CHOICE)
 *   [cost]       a cost that is its player's to choose, not chosen yet
 *                (formatOpenChoiceBlock — COST-NARRATED-BEFORE-IT-IS-CHOSEN)
 *   [chosen]     the cost the player chose before this narration (new)
 *   [fight]      an Enter the Fray whose fight is offered, or was declined
 *                (formatFightOfferBlock — FIGHT-NARRATED-BEFORE-IT-IS-BEGUN)
 *   [vow]        a vow fulfilled says what it asked for (narratorPrompt.js
 *                formatVowFulfilledBlock — VOW-FULFILLED-WITH-NOBODY-NAMED)
 *   [recommit]   a progress miss's recommit is the player's (new)
 *   [milestone]  Reach a Milestone's headway, as the scene showed it (new)
 *   [oracle]     a yes/no answer binds the narration (formatOracleAnswerRule —
 *                ORACLE-NO-NARRATED-AS-YES)
 *   [match]      a match's twist, never the word (MATCH_TOLD_AS_TWIST)
 *   [premise]    a refusal's premise, told as not so (slice 1 —
 *                NOTHING-TO-RECOVER-UNTOLD)
 *   [offer]      the move offered and not made (slice 1 — OFFERED-MOVE-
 *                NARRATED-AS-DONE; SUGGESTED MOVE's "It has not been made…")
 *   [overridden] a soft refusal the GM rolled anyway — told as rolled (slice 1)
 *   [state]      what the sheet says of a person, a vow or a fight the beat
 *                touches (TRACK-TOLD-AS-A-BOND — a full relationship track
 *                told as a bond)
 *   [sheet]      no sheet changes in narration but what TELL names
 *   [apparatus]  no dice, no sheet number, no outcome's or move's name
 *   [unsaid]     a move pressed on a card, with no line of the player's: no
 *                words for the character (issue #388 #10)
 *   [material]   a set-piece's rolled words, never written as rolled — as a
 *                name, a label or together (issue #388 #11; the MATERIAL
 *                block's own rule, sceneSeeds.js formatMaterial)
 *   [person]     a second-person set-piece's character is "you", never their
 *                name (issue #389 #4, OPENING-IN-THE-THIRD-PERSON)
 *   [whereabouts] what the line names elsewhere — another place, a person at
 *                one — is reached only by a journey's move (issue #393 D6;
 *                factContinuity/whereabouts.js elsewhereOf)
 *   [here]       where the characters are by the record, on every beat of
 *                play but a journey's move: the narration's frame, its
 *                present and its prose never put them at another place
 *                (CHARACTERS-MOVED-BY-THE-NARRATION, round 7; whereabouts.js
 *                hereOf; held by checks.js hereViolations)
 *   [dice]       what the dice decided of what the player's line names
 *                stands over what the line takes for granted (issue #389 #2,
 *                LINE-CLAIM-OVER-THE-DICE; narrator.js diceFactsOf)
 *
 * The table's cards a result's obligations read (unansweredCardsFor — moved
 * here from resultUpgrade.js withUnansweredCards): the outcome's choice card
 * (open, or picked and which option), the threshold card (the fight offered,
 * begun or declined); the price choice is read by resultUpgrade.js
 * priceChoiceStatus and settled on the resolution (resolver.js
 * settlePriceChoice) before the kinds are built.
 */

import { moveDisplayName } from "../../system/i18n.js";
import { MOVES } from "../../schemas.js";
import { stakesShown, stakesLine } from "../stakes.js";
import { findThresholdCard } from "../combatThreshold.js";
import { contractFor } from "./table.js";
import { instructionFaults, SPEND_EFFECTS, WEAK_HIT_COST_CLAUSE } from "./blockCheck.js";

const MODULE_ID = "starforged-companion";

/** The moves that take the characters to another place: [whereabouts] is not theirs to keep (issue #393 D6). */
const JOURNEY_MOVES = new Set(["set_a_course", "undertake_an_expedition", "finish_an_expedition"]);

/** The journey moves whose hit arrives: the characters are at the destination when it is narrated. */
const ARRIVAL_MOVES = new Set(["set_a_course", "finish_an_expedition"]);

/** At most this many people elsewhere are named in an arrival's line (all are checked). */
const ARRIVAL_PEOPLE_TOLD = 4;

/** The three lists, in the order the block renders them. */
const OBLIGATION_LISTS = Object.freeze(["TELL", "NOT YET", "NOT SO"]);

const LIST_HEADINGS = Object.freeze({
  "TELL":    "TELL — this has happened:",
  "NOT YET": "NOT YET — the table has not decided this; bring the beat to it and stop:",
  "NOT SO":  "NOT SO — never tell it as true:",
});

/** A move id or a name, as the narration's lines name it. */
const moveName = (move) => (MOVES[move] ? moveDisplayName(move) : String(move ?? "").trim()) || "The move";
const cap = (s) => String(s ?? "").replace(/^\s*(\S)/, (m, c) => m.replace(c, c.toUpperCase()));
const sentence = (s) => { const t = String(s ?? "").trim(); return t ? (/[.!?…]$/.test(t) ? t : `${t}.`) : ""; };
const isHit = (outcome) => outcome === "strong_hit" || outcome === "weak_hit";

// ─────────────────────────────────────────────────────────────────────────────
// The words the old blocks held — kept line for line
// ─────────────────────────────────────────────────────────────────────────────

/** Whether a price choice is not (yet) paid: still open, or declined for what replaces it. */
function priceChoiceOpen(priceChoice) {
  return priceChoice?.status === "pending" || priceChoice?.status === "declined";
}

// How a price still on offer is shown, whatever stands beside it.
const SHOW_PRICE_ARRIVING = "Show that price as the hardship or threat the miss confronts them with — arriving, about to cost them — and stop there. " +
  "Do not show its cost as already paid, and do not resolve it: whether it lands is the player's to choose.";

/**
 * How the narrator is told a price that is one of the player's choices, by
 * what the other choice does instead (`priceChoice.instead` — resolver.js
 * priceChoiceOf). Each: `miss` — what [stakes] calls the miss; `offered` and
 * `show` — the choice still open; `declined` and `after` — the price declined
 * ("no price is paid" goes between them).
 */
const PRICE_ALTERNATIVES = Object.freeze({
  // Explore a Waypoint's miss with a match: a move made instead of the price.
  confront_chaos: Object.freeze({
    miss:     "a miss with a match",
    offered:  "This miss came with a match: the player may Pay the Price or Confront Chaos instead, and has not chosen yet (a card asks them).",
    show:     SHOW_PRICE_ARRIVING,
    declined: "This miss came with a match, and the player chose to Confront Chaos instead of paying a price",
    after:    "Show the hardship or threat the miss confronts them with and leave it open — " +
      "what follows is Confront Chaos's to tell: its own roll decides it, and its narration comes after this one.",
  }),
  // Sojourn's miss: "The community needs help, or makes a costly demand in
  // exchange for safe harbor. If you do it, or Swear an Iron Vow to see it
  // done, resolve this move as a strong hit" — or no relief, and the price
  // (issue #364 SOJOURN-MISS-PRICE-NARRATED-BEFORE-CHOICE).
  swear_an_iron_vow: Object.freeze({
    miss:     "a miss",
    offered:  "This miss leaves a choice, and the player has not chosen yet (a card asks them): the community needs help, or makes a costly " +
      "demand in exchange for safe harbor, which they may do or Swear an Iron Vow to see done; or they find no relief and Pay the Price.",
    show:     "Show the refuge withheld — what the community needs or demands, and that price as what looms if they find no relief: " +
      "arriving, about to cost them — and stop there. Do not show its cost as already paid, do not show the vow sworn or the help given, " +
      "and do not resolve it: which it comes to is the player's to choose.",
    declined: "On this miss the player chose to answer the community's need — to do what it asks, or Swear an Iron Vow to see it done — instead of paying a price",
    after:    "Show what the community needs, or the costly demand it makes in exchange for safe harbor, and the character taking it on — " +
      "and leave it there, the refuge not yet given: a vow is Swear an Iron Vow's to tell (its own move, narrated after this one), and once the vow is sworn " +
      "or the help is done this move is resolved as a strong hit — the refuge it wins is told then, in a narration of its own, not here.",
  }),
});

// An alternative the table above does not name: the choice, with nothing said of what the other way is.
const OTHER_PRICE_ALTERNATIVE = Object.freeze({
  miss:     "a miss",
  offered:  "This miss leaves a choice, and the player has not chosen yet (a card asks them): Pay the Price, or the other way the move offers instead.",
  show:     SHOW_PRICE_ARRIVING,
  declined: "On this miss the player chose the other way the move offers instead of paying a price",
  after:    "Show the hardship or threat the miss confronts them with and leave it open — what follows is told after this narration.",
});

/** How a price choice's alternative is told (PRICE_ALTERNATIVES), whatever it names. */
function priceAlternative(priceChoice) {
  const instead = priceChoice?.instead;
  return typeof instead === "string" && Object.hasOwn(PRICE_ALTERNATIVES, instead) ? PRICE_ALTERNATIVES[instead] : OTHER_PRICE_ALTERNATIVE;
}

// What no cost still to be chosen may be narrated as, whichever it turns out to be.
const NO_COST_PAID = "nothing spent, used up, run short, lost or damaged, no harm or strain taken, and no time or ground lost";

/** Whether an Enter the Fray's fight has not been begun: still offered, or declined for a way out. */
function fightNotBegun(fightOffer) {
  return fightOffer?.status === "offered" || fightOffer?.status === "declined";
}

/** A list carried under its line, each item on its own indented row. */
const items = (list) => list.map(x => `\n  - ${x}`).join("");

// ─────────────────────────────────────────────────────────────────────────────
// What a judge reads (issue #399, D2)
// ─────────────────────────────────────────────────────────────────────────────

// What an offered move would decide, said as the thing an [offer] breach tells
// as done. A move not named here is judged on its name alone.
const OFFER_DECIDES = Object.freeze({
  set_a_course:              "the characters arriving where the course leads",
  undertake_an_expedition:   "the expedition made, its waypoints or its end reached",
  explore_a_waypoint:        "the waypoint explored, and what it holds found",
  finish_an_expedition:      "the expedition's end reached",
  make_a_connection:         "the connection made: a tie between them begun",
  develop_your_relationship: "the relationship deepened",
  test_your_relationship:    "the relationship tested and settled",
  forge_a_bond:              "the bond forged",
  compel:                    "the other side persuaded, or giving way",
  gather_information:        "the answer found",
  heal:                      "the wound treated or healed",
  repair:                    "the damage repaired: patched, fixed, welded or replaced",
  resupply:                  "supplies found or restocked",
  sojourn:                   "the refuge's rest and help given",
  enter_the_fray:            "the fight begun: a blow struck or a shot fired",
  take_decisive_action:      "the fight decided",
  reach_a_milestone:         "headway made on the vow",
  fulfill_your_vow:          "the vow fulfilled",
  swear_an_iron_vow:         "the vow sworn",
});

/**
 * A [state] fact put as its breach. The facts are the sheet's (stateFacts),
 * and under NOT SO a statement of what is so reads backwards ("never tell it
 * as true: No fight is under way").
 */
function stateBreach(fact) {
  const f = String(fact ?? "").trim();
  let m;
  if ((m = /^(.+?) is (.+?)'s connection, not a bond\b/.exec(f))) {
    return `The narration tells a bond forged between ${m[2]} and ${m[1]}, sworn, sealed or named a bond, though the sheet holds ${m[1]} `
      + "a connection, not a bond. Trust or closeness short of a bond breaks nothing.";
  }
  if ((m = /^(.+?) is no longer (.+?)'s connection\b/.exec(f))) {
    return `The narration tells ${m[1]} still ${m[2]}'s connection, their tie standing, though the sheet holds the bond severed.`;
  }
  if (/^No fight is under way\b/.test(f)) {
    return "The narration has the characters fighting, striking blows or firing on a foe in a fight already under way, though the "
      + "sheet holds no fight. A foe's attack beginning, a threat, or a weapon drawn or aimed breaks nothing: a fight is begun by a move.";
  }
  return `The narration contradicts what the sheet holds: ${f} Telling it as the sheet holds it, or not at all, breaks nothing.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// The kinds
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row a kind: its list (a function where the kind's list depends on what
 * it tells — a price pending is NOT YET, declined NOT SO), its check class
 * (slice 4; since issue #399 D4 the class checks.js holds the line to —
 * checkClassOf), its text builder, and for a judge line the words the judge
 * reads (`judge`). The scene's own lines are rows too, built by
 * factContinuity/sceneTurns.js through obligationLine.
 * @type {Readonly<Object<string, { list: string|Function, check: "certain"|"floor"|"judge"|"logged", text: Function }>>}
 */
export const OBLIGATION_KINDS = Object.freeze({
  // The scene's own lines (overhaul 2 §6.2, §7.3, §10.3 — sceneTurns.js
  // sceneObligations): a beat that opens a scene, a docked ship's fight, and
  // what play let go. Their class was declared nowhere (issue #399, D4).
  scene: Object.freeze({
    list: "TELL", check: "logged",
    text: ({ opening }) => `This beat opens a new scene: ${opening}. Open it there — where the characters `
      + "are now, who is here. What still binds is under ACTIVE SCENE; the last scene's description is not carried: describe "
      + "this place fresh.",
  }),
  // Retired from both judges by the measure (issue #399 D10): the pre-post
  // judge read a ship firing from her clamps, where the dice had her pinned,
  // as the breach, and the audit flagged one narration it kept. The narrator
  // is told it; no judge reads it. Its sentence was: "<ship> fighting as a
  // ship — firing, turning, running — while the narration still has her
  // docked, berthed or in the clamps at <place>. A fight on foot while she
  // stays docked breaks nothing."
  place: Object.freeze({
    list: "NOT SO", check: "logged",
    text: ({ ship, at }) => `${ship} is docked at ${at} by the ship's record. If this fight `
      + "is the ship's, she is no longer docked: say where she is in your fact block (ship/position). If it is fought on foot, "
      + "she stays docked.",
  }),
  letgo: Object.freeze({
    list: "NOT SO", check: "floor",
    text: ({ letGo }) => `Play let this go: "${letGo.text}". Do not end on it or bring it back unless the `
      + "player's line takes it up.",
  }),
  // A line of speech said again, word for word (THE-REFRAINS-THE-LIST-CANNOT-NAME,
  // round 8: a92 gave Tamsin a84's "Then you're in it as deep as I am").
  // Held by its certain check (checks.js); the session's lines ride on it.
  quote: Object.freeze({
    list: "NOT SO", check: "certain",
    text: () => "No one says again, word for word, a line of speech an earlier narration of this session already gave: say it new, or let the moment carry it.",
  }),
  // A journey made from a line that never asked for one (PEOPLE-WAITING-AT-THE-
  // ARRIVAL, round 8's a71: "I find Tamsin at her ledger stall …" was rolled
  // as Set a Course to Hollow Spire, and its arrival opened at her stall with
  // no word of the crossing — the cold read: "quietly becomes a Set a Course").
  journey: Object.freeze({
    list: "TELL", check: "logged",
    text: ({ place = null } = {}) => `THE JOURNEY WAS NOT ASKED FOR IN WORDS. The player's line went looking for what is `
      + `${place ? `at ${place}` : "elsewhere"}, and this move takes them there: say so in one sentence — the crossing made — `
      + "and then open the scene there.",
  }),
  outcome: Object.freeze({
    list: "TELL", check: "logged",
    // A round's entry has no MOVE OUTCOME heading: its outcome is on its own line, above.
    text: ({ resolution, entry = false }) => {
      const words = { strong_hit: "a strong hit", weak_hit: "a weak hit", miss: "a miss" }[resolution?.outcome] ?? "the roll's result";
      return `${entry ? "The outcome above" : "MOVE OUTCOME"} is what happened: ${words}${resolution?.isMatch === true ? ", with a match" : ""}. Tell it as it fell — no better and no worse.`;
    },
  }),
  stakes: Object.freeze({
    list: "TELL", check: "logged",
    // What the player saw before the roll (issue #353 R1), and which of it
    // this outcome delivers. A miss whose price is one of the player's
    // choices delivers the stated miss only once it is paid ([price]); a
    // weak hit whose cost is still the player's to choose delivers the hit
    // and leaves the cost ([cost]); an Enter the Fray whose fight is still
    // only offered, or declined, delivers its hit as the opening the roll
    // won, never a blow struck ([fight]).
    // `noCost`, `spend`: the block check's mends (blockCheck.js; issue #402,
    // change 3a) — R1, a weak hit whose outcome names no cost; R2, a hit whose
    // effect waits on the player's spend.
    text: ({ resolution, noCost = false, spend = null }) => {
      const shown = stakesShown(resolution?.stakes ?? null);
      const outcome = resolution?.outcome ?? null;
      const lines = shown.map(s => (s.kind === "hit" ? `On a hit: ${s.text}` : `On a miss: ${s.text}${s.cost ? ` (${s.cost})` : ""}`));
      const hit  = shown.some(s => s.kind === "hit");
      const miss = shown.some(s => s.kind === "miss");
      const priceChoice = resolution?.priceChoice ?? null;
      let deliver = "";
      if (isHit(outcome) && hit && spend) {
        deliver = `This is a ${outcome === "strong_hit" ? "strong" : "weak"} hit: it gives ${spend.gives}, and the player has not spent them. `
          + "The hit as stated is what that spend may buy, not what is done — the [spend] line says how far the narration goes.";
      } else if (isHit(outcome) && hit && fightNotBegun(resolution?.fightOffer)) {
        deliver = `This is a ${outcome === "strong_hit" ? "strong" : "weak"} hit: the hit as stated is the opening this roll has won — ` +
          "where it puts them — not a blow already struck. The [fight] line says how far the narration goes.";
      } else if (outcome === "strong_hit" && hit) deliver = "This is a strong hit: deliver the hit as stated.";
      else if (outcome === "weak_hit" && hit && resolution?.openChoice) deliver = "This is a weak hit: deliver the hit as stated. Its cost is the player's choice, and is not chosen yet — the [cost] line says how to leave it.";
      else if (outcome === "weak_hit" && hit && noCost) deliver = "This is a weak hit: deliver the hit as stated. The move outcome names no cost or complication, and none is added.";
      else if (outcome === "weak_hit" && hit) deliver = `This is a weak hit: deliver the hit as stated, ${WEAK_HIT_COST_CLAUSE}.`;
      else if (outcome === "miss" && miss && priceChoiceOpen(priceChoice)) deliver = `This is ${priceAlternative(priceChoice).miss}: the stated miss is the price it offers, not a price paid — the [price] line says where it stands.`;
      else if (outcome === "miss" && miss) deliver = "This is a miss: deliver the miss as stated — it is what this miss costs.";
      else if (outcome === "miss") deliver = "This is a miss: the hit did not come. Its cost is the move outcome's, not a stated one.";
      return `The player saw these before rolling:${items(lines)}${deliver ? `\n  ${deliver}` : ""}`;
    },
  }),
  price: Object.freeze({
    list: ({ resolution }) => (resolution?.priceChoice?.status === "declined" ? "NOT SO" : "NOT YET"), check: "judge",
    text: ({ resolution }) => {
      const priceChoice = resolution.priceChoice;
      const told  = priceAlternative(priceChoice);
      const price = stakesLine(priceChoice.price);
      if (priceChoice.status === "declined") {
        return "THE PRICE WAS NOT PAID. " +
          `${told.declined}: no price is paid${priceChoice.stated ? ", and the miss stated before the roll does not come to pass" : ""}. ` +
          told.after;
      }
      return `THE PRICE IS THE PLAYER'S CHOICE. ${told.offered}${price ? ` The price it offers: ${price}` : ""} ${told.show}`;
    },
    // Issue #399, D2: the breach, from what the narrator's line says.
    judge: ({ resolution }) => {
      const priceChoice = resolution?.priceChoice ?? {};
      if (priceChoice.status === "declined") {
        return `The narration tells a price paid for this miss${priceChoice.stated ? ", or the miss stated before the roll come to pass," : ""} `
          + "though the player chose the other way instead of paying it. The hardship or threat the miss confronts them with, left open, breaks nothing.";
      }
      const price = stakesLine(priceChoice.price)?.replace(/[.!]+$/, "") ?? null;
      return `The narration tells as paid the price this miss offers${price ? ` (${price})` : ""}, though the player has not chosen yet whether `
        + "to pay it. That price shown arriving, the hardship or threat it brings about to cost them, breaks nothing.";
    },
  }),
  // R2 of the block check (blockCheck.js; issue #402, change 3a): a hit whose
  // effect waits on the player's spend — Repair's points, spent on the card
  // after its roll. Four rounds told the mending done, and a cost besides,
  // with the sheet unchanged (round 10's a57: "your supplies run thinner").
  spend: Object.freeze({
    list: "NOT YET", check: "logged",
    text: ({ spend }) => `${String(spend?.gives ?? "WHAT THIS MOVE GIVES").toUpperCase()} ARE NOT SPENT YET. `
      + `This move gives ${spend?.gives ?? "what it gives"}, and the player spends them on the card that follows. `
      + `Until then ${spend?.decides ?? "what they buy"} is not decided, and nothing more is used up: tell the work begun — `
      + "the effort, the hands on it — not what it fixes, and no supply or other cost it takes.",
  }),
  cost: Object.freeze({
    list: "NOT YET", check: "judge",
    text: ({ resolution }) => {
      const openChoice = resolution.openChoice;
      if (openChoice.kind === "any") {
        const amount = Number.isFinite(openChoice.amount) && openChoice.amount > 0 ? ` (-${openChoice.amount})` : "";
        const times  = Number.isFinite(openChoice.count) && openChoice.count > 1 ? `${openChoice.count} suffer moves` : "a suffer move";
        return "THE COST IS THE PLAYER'S CHOICE. " +
          `This result costs ${times}${amount}, and which is the player's to choose: momentum, health, spirit, supply, ` +
          "a companion's health or the vehicle's integrity. A card asks them; they have not chosen. " +
          "Show the trouble that brings the cost — what goes wrong, what presses on them — and stop before saying what it takes: " +
          `${NO_COST_PAID}. Which of those it is, the player decides. Never mention the card or the choice.`;
      }
      const options = (Array.isArray(openChoice.options) ? openChoice.options : []).map(o => stakesLine(o)).filter(Boolean);
      return "THE COST IS THE PLAYER'S CHOICE. Part of this result is the player's to choose, on a card they have not answered yet. It offers:" +
        `${items(options)}\n  What every option has in common has happened: narrate it. Where they differ is the cost, and no cost has been paid: ` +
        `narrate none of them as taken — ${NO_COST_PAID}. Bring the beat to where the cost falls due, and stop there. ` +
        "Never mention the card or the choice.";
    },
    judge: ({ resolution }) => {
      const openChoice = resolution?.openChoice ?? {};
      const options = openChoice.kind === "any" ? [] : (Array.isArray(openChoice.options) ? openChoice.options : []).map(o => stakesLine(o)).filter(Boolean);
      const paid = "something spent, used up, run short, lost or damaged, harm or strain taken, or time or ground lost";
      return options.length
        ? `The narration tells as paid a cost the player has not chosen yet (the choices: ${options.join("; ")}): ${paid}. What every `
          + "choice has in common, and the trouble that brings the cost, break nothing."
        : "The narration tells as paid a cost the player has not chosen yet, to momentum, health, spirit, supply, a companion's health or "
          + `the vehicle's integrity: ${paid}. The trouble that brings the cost, pressing on them, breaks nothing.`;
    },
  }),
  chosen: Object.freeze({
    list: "TELL", check: "floor",
    text: ({ resolution, speaker }) => {
      const who = String(speaker ?? "").trim() || "The player";
      const labels = resolution.chosen.labels.join("; then ");
      return `${who} chose ${labels}. Tell what it cost them.`;
    },
  }),
  "chosen-since": Object.freeze({
    list: "TELL", check: "floor",
    text: ({ pick }) => `Since the last narration, ${pick.who} chose ${pick.labels.join("; then ")}. `
      + "Show what it has cost them, in a sentence, before the beat goes on.",
  }),
  fight: Object.freeze({
    list: ({ resolution }) => (resolution?.fightOffer?.status === "declined" ? "NOT SO" : "NOT YET"), check: "judge",
    text: ({ resolution }) => {
      const fightOffer = resolution.fightOffer;
      const footing = fightOffer.position === "in_control" ? " The footing this roll gave them: the upper hand."
        : fightOffer.position === "bad_spot" ? " The footing this roll gave them: the back foot."
          : "";
      if (fightOffer.status === "declined") {
        return "THE FIGHT WAS NOT BEGUN. " +
          "This Enter the Fray is rolled, and the player chose to look for a way out instead of beginning the fight. " +
          "No blow is struck by either side: no shot is fired, and nothing and no one is hit, damaged or hurt. " +
          "Show the stand-off at its edge — where each side stands, what is drawn or aimed — and leave how they get clear " +
          `untold: the move that decides it comes after this narration.${footing}`;
      }
      return "THE FIGHT IS STILL ONLY OFFERED. " +
        "This Enter the Fray is rolled, but the fight has not begun: a card asks the player whether to begin it or look " +
        "for a way out, and they have not answered. " +
        "Bring the scene to the moment before the first blow, and stop there: where each side stands, what is drawn, " +
        `aimed or closing, and who has the advantage.${footing} ` +
        "Nobody has struck yet: no shot is fired, no blow lands, nothing and no one is hit, damaged or hurt, and neither " +
        "side breaks off or gives way. Where the stakes or the player's line have the fight opening — a first salvo, a " +
        "first strike — show it as what they are placed to do, about to happen, never as done. Never mention the card or the choice.";
    },
    judge: ({ resolution }) => (resolution?.fightOffer?.status === "declined"
      ? "The narration has a blow struck (a shot fired, anyone or anything hit, damaged or hurt), or the characters already clear of the "
        + "fight, though the player chose to look for a way out instead of beginning it. A stand-off at its edge, sides placed and weapons "
        + "drawn or aimed, breaks nothing."
      : "The narration has the fight begun (a blow struck or landed, a shot fired, anyone or anything hit, damaged or hurt, or a side "
        + "breaking off or giving way), though the player has not chosen yet to begin it. The moment before the first blow, sides placed "
        + "and weapons drawn, aimed or closing, a strike about to come, breaks nothing."),
  }),
  // A blow in a fight is not its end (FIGHT-PAST-ITS-END, the eighth live
  // round: the cutter was told destroyed four times, a38–a43, while the track
  // filled and the attacks went on). Only Take Decisive Action decides a
  // fight; on a full track the foe is beaten in all but that blow. `fight`
  // rides on the line: { label, full } — narrator.js fightStandingOf.
  foe: Object.freeze({
    list: "NOT SO", check: "judge",
    text: ({ fight = null } = {}) => {
      const which = fight?.label ? ` (${fight.label})` : "";
      return fight?.full
        ? `THE FIGHT'S TRACK IS FULL${which}. The foe is beaten in all but the deciding blow, and that blow is the player's `
          + "Take Decisive Action — not this one. Tell the foe broken open and at bay: never destroyed, dead, wrecked, fled, "
          + "surrendered or beaten."
        : `THE FIGHT IS NOT DECIDED${which}. Only Take Decisive Action ends it: this blow hurts, drives back or corners the `
          + "foe — never tell the foe destroyed, dead, wrecked, fled, surrendered or beaten.";
    },
    judge: () => "The narration tells the fight as over — the foe destroyed, dead, wrecked, fled, surrendered or beaten — "
      + "though no Take Decisive Action has decided it.",
  }),
  vow: Object.freeze({
    list: "TELL", check: "floor",
    // The vow's name rides on its line (issue #399's audit N13): a round's
    // check held every [vow] line to the first fulfilment's vow.
    carry: ({ resolution }) => ({ vowName: resolution?.moveTarget ?? null }),
    text: () => "THE VOW IS FULFILLED. " +
      "This move fulfils a vow. Say what the vow set out to find, do or learn, and only as far as the " +
      "story holds it: what the recent scene and your instructions state — a hidden plan's truth only " +
      "where your instructions say this beat ends that vow. Never write that an answer is known, named, " +
      "found or proved without stating it in this narration. Where the story holds no answer — no name, " +
      "no face, no place — the vow ends on what was done, and the narration says plainly what is still " +
      "not known.",
  }),
  recommit: Object.freeze({
    list: "NOT YET", check: "logged",
    text: () => "The player chooses whether to recommit or give it up; tell neither as done.",
  }),
  milestone: Object.freeze({
    list: "TELL", check: "logged",
    text: ({ resolution }) => `Tell the headway as the scene has shown it${resolution?.moveTarget ? `: ${String(resolution.moveTarget).trim()}` : ""}.`,
  }),
  oracle: Object.freeze({
    list: ({ part }) => (part === "not" ? "NOT SO" : "TELL"), check: "judge",
    text: ({ oracle, part }) => {
      const { answer, asked } = oracle;
      if (part === "not") {
        const opposite = answer === "NO" ? "yes" : "no";
        return `Nothing in the prose may say, show or imply ${opposite}, or leave it open.`;
      }
      return `The answer is ${answer}${asked ? `: to "${asked}", the oracle says ${answer.toLowerCase()}` : ""}. ` +
        "It is the table's answer and it is not yours to change: narrate a scene in which it is " +
        "true. Where RECENT NARRATION said otherwise, bring the scene into line with the answer here — what " +
        "was seen or heard was a recording, a relay, an echo or a mistake, or it has stopped — " +
        "and say so in the story.";
    },
    // The question is said with both parts: round 9's NOT SO went out as
    // "Nothing in the prose may say, show or imply no, or leave it open", with
    // nothing to say what "no" answers, and the judge read it backwards.
    judge: ({ oracle, part }) => {
      const { answer, asked } = oracle ?? {};
      const to = asked ? ` to "${asked}"` : "";
      return part === "not"
        ? `The narration says, shows or implies the opposite of the oracle's answer${to}: the oracle answered ${answer}. A narration that `
          + "tells it as the oracle answered breaks nothing."
        : `The narration leaves the oracle's answer${to} untold, or tells it otherwise: the oracle answered ${answer}. A narration in which `
          + "it is so, said or shown, breaks nothing.";
    },
  }),
  match: Object.freeze({
    list: "TELL", check: "certain",
    text: () => "This roll came with a match: tell its twist as something that happens in the scene, " +
      "and never write the word \"match\".",
  }),
  premise: Object.freeze({
    list: "NOT SO", check: "judge",
    // The refusal's code rides on its line, for its trip words (issue #399's
    // audit N13: a round tripped every [premise] line on one refusal's words).
    carry: ({ refusal }) => ({ refusalCode: refusal?.code ?? null }),
    text: ({ refusal }) => {
      const claim = refusal?.premise?.claim ? cap(refusal.premise.claim) : "What the line sets about";
      const never = refusal?.premise?.never ? `: never ${refusal.premise.never}` : "";
      return `${claim} is not so — ${sentence(refusal?.why ?? "the sheet says otherwise")} `
        + `The line sets about it: narrate the attempt meeting the facts, never the premise as real${never}.`;
    },
    judge: ({ refusal }) => {
      const claim = String(refusal?.premise?.claim ?? "").trim() || "what the line sets about";
      const never = refusal?.premise?.never ? ` (${refusal.premise.never})` : "";
      return `The narration tells ${claim} as real${never}. It is not so — ${sentence(refusal?.why ?? "the sheet says otherwise")} `
        + "The attempt meeting the facts breaks nothing.";
    },
  }),
  // Retired from the pre-post judge by the measure (D10: it caught one breach
  // of four, and read a foe's shot as the move made); the audit is still asked.
  offer: Object.freeze({
    list: "NOT YET", check: "logged",
    text: ({ offer }) => `${moveName(offer)} is only offered. It has not been made, and nothing it would decide has happened: `
      + `narrate up to the point where it would begin and stop there — a course laid in is not yet flown, a wound bared is `
      + `not yet treated, a question put is not yet answered. The prose never performs the move; the closing sentence offers it.`,
    judge: ({ offer }) => `The narration tells as done what ${moveName(offer)} would decide${OFFER_DECIDES[offer] ? ` (${OFFER_DECIDES[offer]})` : ""}, `
      + "though the move is only offered, not made. The beat brought to where the move would begin breaks nothing.",
  }),
  overridden: Object.freeze({
    list: "TELL", check: "logged",
    text: ({ note }) => `The roll was made at the GM's word; the sheet says ${String(note ?? "").replace(/^rolled at the GM's word:\s*/i, "").replace(/\.$/, "")} — `
      + `tell the result as the GM ruled it, and nothing gained beyond what the result gives.`,
  }),
  // Retired from the pre-post judge by the measure (D10: five wrong flags of
  // eight — a foe's attack beginning read as a fight under way); the audit is still asked.
  state: Object.freeze({
    list: "NOT SO", check: "logged",
    text: ({ fact }) => fact,
    judge: ({ fact }) => stateBreach(fact),
  }),
  // Certain since issue #399 D9: its harm clause is held in code (checks.js
  // harmViolations) — round 8 burned the character on three beats whose price
  // took no health (HARM-TOLD-WITHOUT-A-COST). Never a judge's.
  sheet: Object.freeze({
    list: "NOT SO", check: "certain",
    text: ({ mode, refused }) => (mode !== "paced"
      ? "Nothing on a sheet changes but what TELL names."
      : refused
        ? `No move was rolled for this line, and none will be. Nothing on a character's sheet changes — no wound is treated or `
          + `healed, no harm taken, no supplies gained or spent, no damage repaired, no bond or progress made.`
        : `Nothing on a character's sheet changes — no wound is treated or healed, no harm taken, no supplies gained or spent, `
          + `no damage repaired, no bond or progress made: a line that sets about one of those has begun it, and the move that `
          + `decides it is still to be made.`),
  }),
  apparatus: Object.freeze({
    list: "NOT SO", check: "certain",
    text: ({ offer }) => `Never write the dice, a number off a sheet, an outcome's name, or a move's name${offer ? " — save the one closing offer line" : ""} — and never a word about how this narration is built.`,
  }),
  // A move pressed on a card or a panel, with no line of the player's (issue
  // #388 #10, BUTTON-ROLL-SPEAKS-FOR-THE-CHARACTER): the fifth live long
  // haul's a82, a bonded Develop pressed on a card, was told "You tell Tamsin
  // plainly that she is the one person on these docks you would trust", the
  // Chronicle filed it, and a85's answer quoted it as Mira's words.
  unsaid: Object.freeze({
    list: "NOT SO", check: "judge",
    text: () => "No line of the player's made this move — it was made from a button or the map. The character says, asks, promises " +
      "and confesses nothing in this narration, in quotes or told (\"you tell her that …\"): what they say is the player's. " +
      "Tell what the move does, and what the others do and say.",
    judge: () => "The player's character (\"you\") speaks — says, asks, promises or confesses something, in quotes or told (\"you tell her that …\").",
  }),
  // What the line names elsewhere (issue #393 D6, overhaul 8 —
  // CHARACTERS-MOVED-BY-THE-NARRATION): the sixth live long haul's a64, "I
  // find Tamsin at her ledger stall", was narrated "The walk to the Hollow
  // Spire docks takes the better part of the morning" — another settlement.
  // Judge-class, tripped by the other place's or person's name (checks.js).
  whereabouts: Object.freeze({
    list: "NOT SO", check: "judge",
    text: ({ here = null, underway = null, places = [], people = [] }) => {
      const at = here ? `The characters are at ${here}.` : underway ? `The characters are between places, on the expedition ${underway}.` : "";
      const there = places.length
        ? `${namesList(places)} ${places.length === 1 ? "is another place" : "are other places"}: they reach ${places.length === 1 ? "it" : "them"} `
          + "only by a journey's move — never narrate them walking or arriving there."
        : "";
      const who = people.map(p => `${p.name} is ${p.where}, not here.`).join(" ");
      return [at, there, who].filter(Boolean).join(" ");
    },
    judge: ({ places = [], people = [] }) => `The narration has the characters walk to, travel to or arrive at ${places.length ? namesList(places) : "another place"}`
      + `${people.length ? `, or has ${namesList(people)} with them in person` : ""} — with no journey's move.`,
  }),
  // Where the characters are, by the record (CHARACTERS-MOVED-BY-THE-NARRATION,
  // the seventh live round): the record held at a60–a64 — five frames naming
  // the Hollow Spire docks were refused for it — and the prose posted anyway
  // ("The skiff clears the ring and noses down toward Hollow Spire's docks"),
  // and the beats after it followed the prose. Certain: the fact block's frame,
  // its present and the prose are read against the record before the
  // narration posts (checks.js hereViolations). Never on a journey's own move.
  // A journey's arrival (PEOPLE-WAITING-AT-THE-ARRIVAL: the first-session
  // re-records had the Hollow Spire dockmaster waiting at both ends of both
  // journeys). Whoever was not with the characters as they set out is where
  // the record has them. Held by [here]'s people reading alone (checks.js):
  // the journey's own move speaks of the places it crosses.
  arrival: Object.freeze({
    list: "NOT SO", check: "certain",
    text: ({ here = null, people = [] } = {}) => `The characters arrive at ${here}. Whoever was not with them as they set out `
      + `is where the record has them — ${people.map(p => `${p.name} ${p.where}`).join("; ")}: never waiting at ${here}, `
      + "nor arriving with the characters.",
  }),
  here: Object.freeze({
    list: "NOT SO", check: "certain",
    text: ({ here = null, underway = null } = {}) => (here
      ? `The characters are at ${here}: they go to another place only by a journey's move — never narrate them reaching one — `
        + `and the fact block's "location" is a spot within ${here}.`
      : `The characters are between places, on the expedition ${underway}: they reach a place only by the journey's move — `
        + "never narrate them arriving at one."),
  }),
  // What the dice decided about what the player's line names (issue #389
  // #2, LINE-CLAIM-OVER-THE-DICE — the maintainer: "Players can't overrule
  // dice"): the sixth live long haul's a77 went "down to the cutter's wreck"
  // that the dice had sent fleeing (a41), and the narration followed the line.
  // Judge-class, tripped by the subject's name in the prose (checks.js).
  // Retired from both judges by the measure (issue #399 D10): put as the
  // breach, its sentence still flagged 22 narrations of 77 in the pre-post
  // judge, 3 of them right, and the audit missed or misread it. The narrator
  // is told it; no judge reads it.
  dice: Object.freeze({
    list: "NOT SO", check: "logged",
    text: ({ subject, fact }) => `What the dice decided stands — ${subject}: ${fact}. A line that takes otherwise for granted `
      + "does not make it so: tell what is there.",
  }),
  // A second-person set-piece's character is "you" (issue #389 #4,
  // OPENING-IN-THE-THIRD-PERSON: three of the sixth live round's six openings
  // were told "Mira is counting the water ration…" against their PERSPECTIVE
  // block). Held by its certain check (checks.js personViolations); the
  // names ride on the line.
  person: Object.freeze({
    list: "NOT SO", check: "certain",
    text: ({ names = [] } = {}) => `The player's character is "you", for the whole narration: never ${names.length ? names.map(n => `"${n}"`).join(" or ") : "their name"} `
      + "outside quoted speech, and never \"she\" or \"he\" for them.",
  }),
  // A set-piece's MATERIAL rule, held by its certain check (checks.js
  // materialViolations; issue #388 #11). Its words ride on the line.
  material: Object.freeze({
    list: "NOT SO", check: "certain",
    text: () => "A result's words are the oracle's, never the prose's: no word of a result is written as it was rolled — " +
      "not as a name, not as a label, not its words together. Write what it means here, in words of your own.",
  }),
});

/** Names as a list: "A", "A and B", "A, B and C". */
const namesList = (xs) => {
  const names = (Array.isArray(xs) ? xs : []).map(x => String(x?.name ?? x ?? "").trim()).filter(Boolean);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
};

const line = (kind, input = {}) => {
  const row = OBLIGATION_KINDS[kind];
  if (!row) throw new Error(`no obligation kind "${kind}"`);
  const list = typeof row.list === "function" ? row.list(input) : row.list;
  // A judge line may say to the judge what it trips on in its own words (checks.js judgeNarration).
  return { kind, list, text: row.text(input), ...(typeof row.judge === "function" ? { judge: row.judge(input) } : {}),
    // What a check reads beside the words, where a row carries it ([vow]'s name, [premise]'s refusal code).
    ...(typeof row.carry === "function" ? row.carry(input) : {}) };
};

/**
 * One obligation line of `kind`, built by its row: `{ kind, list, text }`,
 * with `judge` where the row has one. For the lines built outside this file
 * (sceneTurns.js sceneObligations), so a kind's words and class live on its
 * row alone.
 *
 * @param {string} kind
 * @param {Object} [input] — what the row's builders read
 * @returns {{ kind: string, list: string, text: string, judge?: string }}
 */
export function obligationLine(kind, input = {}) {
  return line(kind, input);
}

// ─────────────────────────────────────────────────────────────────────────────
// [state] — what the sheet says of what the beat touches
// ─────────────────────────────────────────────────────────────────────────────

/** A sheet's full relationship track: ten boxes of four ticks. */
const FULL_TRACK = 40;

/** Whether `name` is said in `text` — the whole name, or a first or last name of three letters or more, as a whole word. */
function namedIn(text, name) {
  const t = ` ${String(text ?? "").toLowerCase().replace(/[^a-z0-9'’\s-]+/g, " ")} `;
  const n = String(name ?? "").trim().toLowerCase();
  if (!n || t.trim() === "") return false;
  const words = [n, ...n.split(/\s+/).filter(w => w.length >= 3)];
  return words.some(w => t.includes(` ${w} `));
}

// A line that reads as fighting, for "no fight is under way".
const FIGHTING = /\b(fire|firing|fired|open(?:s|ed)? fire|shoot|shooting|shot|strike|striking|attack|attacking|swing|swings|stab|slash|lunge|salvo|broadside|charge at|ram)\b/i;

/**
 * The [state] facts of a beat: only what it touches, never the sheet entire
 * (the CHARACTER block lists that, in the same words — situation.js
 * connectionStanding). A connection the line, the move's target or the
 * scene's cast names, whose relationship is full and unbonded, or that is
 * lost; "no fight is under way" when the line reads as fighting and none is
 * open. Bounded: at most four lines.
 *
 * @param {{ situation?: Object|null, line?: string, target?: string|null, cast?: string[] }} input
 * @returns {string[]}
 */
function stateFacts({ situation = null, line = "", target = null, cast = [] } = {}) {
  const roller = situation?.roller ?? null;
  if (!roller) return [];
  const pc = roller.name || "The character";
  const out = [];
  const touched = (name) => namedIn(line, name) || namedIn(target, name)
    || (Array.isArray(cast) && cast.some(c => String(c ?? "").trim().toLowerCase() === String(name ?? "").trim().toLowerCase()));
  for (const c of Array.isArray(roller.connections) ? roller.connections : []) {
    if (!c?.name || !touched(c.name)) continue;
    if (c.lost) out.push(`${c.name} is no longer ${pc}'s connection: the bond was severed.`);
    else if (!c.bonded && Number(c.ticks ?? 0) >= FULL_TRACK) out.push(`${c.name} is ${pc}'s connection, not a bond: their relationship is full and no bond is forged.`);
    else if (!c.bonded) out.push(`${c.name} is ${pc}'s connection, not a bond: no bond is forged.`);
  }
  const fights = situation?.tracks?.fights;
  if (Array.isArray(fights) && !fights.length && FIGHTING.test(String(line ?? ""))) out.push("No fight is under way.");
  return out.slice(0, 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// The table's cards for a result — unansweredCardsFor
// ─────────────────────────────────────────────────────────────────────────────

const allMessages = () => globalThis.game?.messages?.contents ?? [];
// A choice card answered: resolved, or a pick on it (resultUpgrade.js reads a
// pick on the outcome's card the same way — consequenceChosen).
const answered = (f) => f?.resolved === true || (Array.isArray(f?.pickedIndices) && f.pickedIndices.length > 0)
  || (Array.isArray(f?.pickedSuffers) && f.pickedSuffers.length > 0);

// The meters an option's step takes from when its number is below zero.
const COST_METERS = Object.freeze(["momentum", "health", "spirit", "supply", "integrity", "companionHealth"]);

/** Whether one step of a choice option takes something from the character: a suffer move, a loss, a price, a complication. */
function stepCosts(step) {
  if (!step || typeof step !== "object") return false;
  if (typeof step.suffer === "string" && step.suffer) return true;
  if (step.kind === "any" || step.complication === true || step.route === "pay_the_price") return true;
  return COST_METERS.some(k => Number(step[k]) < 0);
}

/**
 * Whether a result's choice puts a cost in the player's hands: "Make a suffer
 * move" (`kind: "any"`), or an enumerated choice one of whose options — or a
 * step of its `chain` — is a cost (Heal's weak hit: the recovery, "then Lose
 * Momentum (-2)" or "then Sacrifice Resources (-2)"). A choice between gains
 * alone (+2 momentum, or +1 on the next move) offers none.
 */
function promptOffersCost(prompt) {
  if (prompt?.kind === "any") return true;
  return (Array.isArray(prompt?.options) ? prompt.options : [])
    .some(o => (Array.isArray(o?.chain) ? o.chain : [o]).some(stepCosts));
}

/** The outcome's choice cards for a result (an upgrade's own, or the original's). */
function choiceCardsOf(input) {
  const upgradeOf = typeof input.upgradeOf === "string" && input.upgradeOf ? input.upgradeOf : null;
  const ids = [upgradeOf, input._id, input.resolutionId].filter(id => typeof id === "string" && id);
  // The upgraded outcome's own choice card carries the original's id and
  // `upgraded` (reconcileChoices); a price's cards are no choice of the outcome.
  return ids.length ? allMessages().map(m => m?.flags?.[MODULE_ID]).filter(f =>
    f?.sufferCard === true && f.sufferPrompt && ids.includes(f.resolutionId)
    && f.superseded !== true && f.priceCard !== true && (f.upgraded === true) === !!upgradeOf) : [];
}

/**
 * The cost of a result that is still its player's to choose when the result
 * is narrated (known-issues COST-NARRATED-BEFORE-IT-IS-CHOSEN — the long
 * haul's third live run, a59: a Heal weak hit's narration spent the supplies
 * before its card asked: Lose Momentum, or Sacrifice Resources?). Open when no
 * card of the outcome has a pick and the choice — the first such card's, else
 * the resolution's own (`consequences.sufferPrompt`) — offers a cost. Null
 * once a pick is made, for a choice that costs nothing, and for a miss's price
 * that is a choice of its own (`priceChoice` — [price] tells that one).
 */
function openCostChoice(input, cards) {
  if (input.priceChoice) return null;
  if (cards.some(answered)) return null;
  const prompt = cards[0]?.sufferPrompt ?? input.consequences?.sufferPrompt ?? null;
  if (!prompt || !promptOffersCost(prompt)) return null;
  return {
    kind:    prompt.kind === "any" ? "any" : "enumerated",
    options: (Array.isArray(prompt.options) ? prompt.options : []).map(o => String(o?.label ?? "").trim()).filter(Boolean),
    amount:  Number.isFinite(Number(prompt.amount)) && prompt.kind === "any" ? Number(prompt.amount) : null,
    count:   Number.isFinite(Number(prompt.count)) && prompt.kind === "any" ? Number(prompt.count) : null,
  };
}

/**
 * The cost the player chose on the outcome's card before this narration — a
 * held result kept by the pick (heldResult.js keepHeldResultForChoice), a
 * round whose entry's card was answered before the round was narrated: the
 * options the card records (`chosenIndex`, `pickedIndices` → its prompt's
 * labels; `pickedSuffers` for "Make a suffer move"). Null with no pick, and
 * for a choice that costs nothing.
 */
function chosenCost(input, cards) {
  if (input.priceChoice) return null;
  const card = cards.find(answered);
  if (!card || !promptOffersCost(card.sufferPrompt)) return null;
  const options = Array.isArray(card.sufferPrompt.options) ? card.sufferPrompt.options : [];
  const picked = Number.isInteger(card.chosenIndex) ? [card.chosenIndex]
    : Array.isArray(card.pickedIndices) ? card.pickedIndices.filter(Number.isInteger) : [];
  const labels = picked.map(i => String(options[i]?.label ?? "").trim()).filter(Boolean);
  if (!labels.length && Array.isArray(card.pickedSuffers)) {
    for (const s of card.pickedSuffers) if (typeof s === "string" && s.trim()) labels.push(s.replace(/_/g, " ").trim());
  }
  return labels.length ? { labels } : null;
}

/**
 * Where the fight an Enter the Fray offered stands when that roll is narrated
 * (known-issues FIGHT-NARRATED-BEFORE-IT-IS-BEGUN — the long haul's third live
 * run, a27). "Combat is offered, not forced" (decisions.md): the fight's card
 * — the threshold card, posted after the roll's card and before its narration
 * — decides whether there is a fight. Read from the card the roll posted, by
 * its resolution's id (combatThreshold.js findThresholdCard): "offered" while
 * it is unanswered, "declined" once the way out is taken, and null once the
 * fight is begun — or when the roll posted no card: an open fight with that
 * foe was resumed, and nothing was offered.
 */
function fightOfferOf(input) {
  if (input?.moveId !== "enter_the_fray") return null;
  const card = [input.upgradeOf, input._id, input.resolutionId]
    .filter(id => typeof id === "string" && id).map(findThresholdCard).find(Boolean) ?? null;
  const f = card?.flags?.[MODULE_ID];
  if (!f || f.thresholdTaken === "fray") return null;
  return {
    status:   f.thresholdTaken === "wayOut" ? "declined" : "offered",
    position: f.position === "in_control" || f.position === "bad_spot" ? f.position : null,
  };
}

/**
 * What the table has answered, and has still to answer, about a result as its
 * narration takes it (narrator.js — beside settlePriceChoice): `openChoice`,
 * the cost that is its player's to choose and not yet chosen; `chosen`, the
 * cost they chose before this narration (`{ labels }`); `fightOffer`, the
 * fight an Enter the Fray offered and no one has begun. Each only when it is
 * so — `{}` when nothing is. Any client may ask: the cards are the table's.
 * Never throws — a card that cannot be read leaves its line out.
 *
 * @param {Object|null} input — a resolution, or a round entry's narration input
 * @returns {{ openChoice?: Object, chosen?: { labels: string[] }, fightOffer?: Object }}
 */
export function unansweredCardsFor(input) {
  if (!input || typeof input !== "object") return {};
  try {
    const cards = choiceCardsOf(input);
    const openChoice = openCostChoice(input, cards);
    const chosen = openChoice ? null : chosenCost(input, cards);
    const fightOffer = fightOfferOf(input);
    return { ...(openChoice ? { openChoice } : {}), ...(chosen ? { chosen } : {}), ...(fightOffer ? { fightOffer } : {}) };
  } catch (err) {
    console.warn(`${MODULE_ID} | the table's cards could not be read for the narration:`, err?.message ?? err);
    return {};
  }
}

/**
 * The costs chosen after their result's narration that no narration has told
 * yet (design §8.4, D10): the choice cards the pick stamped
 * `pickedAfterNarration` (sufferCard.js), answered, with no `toldBy`, not
 * superseded or X-Carded — any roller's (in solo play it is the roller's next
 * beat; at a table, whoever speaks next). `except`: the resolutions the
 * narration is itself of (their own cards are [chosen]). Any client may read
 * them; the canonical GM stamps `toldBy` once the narration's card posts
 * (markChosenCostsTold). Never throws.
 *
 * @param {{ except?: string[] }} [opts]
 * @returns {Array<{ cardId: string, resolutionId: string|null, who: string, labels: string[] }>}
 */
export function choicesChosenSince({ except = [] } = {}) {
  try {
    const skip = new Set((except ?? []).filter(Boolean));
    const out = [];
    for (const m of allMessages()) {
      const f = m?.flags?.[MODULE_ID];
      if (!f?.sufferCard || f.pickedAfterNarration !== true || f.toldBy || f.superseded === true || f.xCarded === true) continue;
      if (!answered(f) || skip.has(f.resolutionId)) continue;
      const picked = chosenCost({ priceChoice: null }, [f]);
      if (!picked) continue;
      const actor = typeof f.actorId === "string" ? (globalThis.game?.actors?.get?.(f.actorId) ?? null) : null;
      out.push({ cardId: m.id, resolutionId: f.resolutionId ?? null, who: String(actor?.name ?? "").trim() || "The player", labels: picked.labels });
    }
    return out.slice(0, 4);
  } catch (err) {
    console.warn(`${MODULE_ID} | the costs chosen since could not be read:`, err?.message ?? err);
    return [];
  }
}

/**
 * Stamp each told cost's card `toldBy` — the narration that told it — once
 * its card is on the table (canonical GM; a player's own key cannot, and the
 * next GM narration tells them again — accepted). A stamp the world refuses
 * is retried by the next narration. Never throws.
 *
 * @param {Array<{ cardId: string }>} picks
 * @param {string|null} narrationId
 * @returns {Promise<void>}
 */
export async function markChosenCostsTold(picks, narrationId) {
  if (!Array.isArray(picks) || !picks.length || !narrationId || globalThis.game?.user?.isGM !== true) return;
  for (const pick of picks) {
    const message = globalThis.game?.messages?.get?.(pick.cardId) ?? null;
    await message?.update?.({ [`flags.${MODULE_ID}.toldBy`]: narrationId })
      .catch(err => console.warn(`${MODULE_ID} | the told cost's card ${pick.cardId} could not be stamped — the next narration tells it again:`, err?.message ?? err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Building them
// ─────────────────────────────────────────────────────────────────────────────

/** The yes/no answer an oracle follow-up narrates, read from the card's result line ("d100 = 97 → NO"). */
function oracleAnswerOf(oracle) {
  if (oracle?.kind !== "oracle_yes_no") return null;
  const answer = /→\s*(yes|no)\b/i.exec(String(oracle.rolledLine ?? ""))?.[1]?.toUpperCase() ?? null;
  if (!answer) return null;
  const asked = String(oracle.question ?? "").replace(/\s+/g, " ").trim().replace(/"/g, "'");
  return { answer, asked };
}

/**
 * The kinds a move's result carries: the generic ones, then what its contract
 * row's `obliges` names (table.js — [vow] on a fulfilment's hit, [milestone],
 * [recommit] on a progress move's miss, [fight] while its fight is not
 * begun), then what the table's cards say ([chosen], [price], [cost]).
 */
function resultObligations(resolution, { speaker = null, entry = false } = {}) {
  const out = [];
  const r = resolution ?? {};
  const obliges = new Set(contractFor(r.moveId)?.obliges ?? []);
  if (r.outcome) out.push(line("outcome", { resolution: r, entry }));
  if (stakesShown(r.stakes ?? null).length) out.push(line("stakes", { resolution: r }));
  if (obliges.has("vow") && isHit(r.outcome)) out.push(line("vow", { resolution: r }));
  if (obliges.has("milestone")) out.push(line("milestone", { resolution: r }));
  if (r.chosen && Array.isArray(r.chosen.labels) && r.chosen.labels.length) out.push(line("chosen", { resolution: r, speaker }));
  if (r.isMatch === true) out.push(line("match", { resolution: r }));
  if (priceChoiceOpen(r.priceChoice)) out.push(line("price", { resolution: r }));
  if (r.openChoice && (r.openChoice.kind === "any" || (Array.isArray(r.openChoice.options) && r.openChoice.options.some(o => stakesLine(o)))))
    out.push(line("cost", { resolution: r }));
  if (obliges.has("fight") && fightNotBegun(r.fightOffer)) out.push(line("fight", { resolution: r }));
  // A blow in the open fight (FIGHT-PAST-ITS-END): read by the narrator off the fight's track.
  if (obliges.has("foe") && r.fightStanding && typeof r.fightStanding === "object") {
    out.push({ ...line("foe", { fight: r.fightStanding }), fight: r.fightStanding });
  }
  if (obliges.has("recommit") && r.outcome === "miss") out.push(line("recommit", { resolution: r }));
  if (r.gateNote) out.push(line("overridden", { note: r.gateNote }));
  return mendResultLines(out, r);
}

/**
 * The result's lines, checked against the move's own data before they are
 * sent and mended where the fault is certain (blockCheck.js; issue #402,
 * change 3a, D3): R1 — a weak hit whose outcome names no cost is not asked for
 * one; R2 — a hit whose effect waits on the player's spend tells the work
 * begun, and its spend NOT YET. Pure.
 *
 * @param {Array<Object>} lines — the result's lines, as resultObligations built them
 * @param {Object} r — the resolution
 * @returns {Array<Object>}
 */
function mendResultLines(lines, r) {
  const faults = instructionFaults({ lines, moveId: r?.moveId ?? null, outcome: r?.outcome ?? null, consequences: r?.consequences ?? null });
  if (!faults.length) return lines;
  const spend = faults.some(f => f.rule === "R2") ? SPEND_EFFECTS[r.moveId] : null;
  const noCost = faults.some(f => f.rule === "R1");
  const out = lines.map(o => (o.kind === "stakes" ? line("stakes", { resolution: r, noCost, spend }) : o));
  if (spend) {
    const at = out.findIndex(o => o.kind === "stakes");
    out.splice(at >= 0 ? at + 1 : out.length, 0, line("spend", { spend }));
  }
  return out;
}

/** Words a line asks to travel by (a journey's own words: "go", "fly", "a course"…). */
const TRAVEL_WORDS = /\b(?:go|goes|going|went|head|heads|heading|fly|flies|flying|flew|travel\w*|course|plot\w*|jump\w*|burn\w*|set\s+out|make\s+for|sail\w*|journey\w*|return\w*|back\s+to|take\s+(?:the|her|my|our)\s+[\w\s'’-]{0,30}?\s+(?:to|there|across))\b/i;

/**
 * Whether a Set a Course that arrived was rolled from a typed line with no
 * word of travel in it — a journey the reader made of a line that sought
 * someone elsewhere (overhaul 8, D7; or the Mischief dial's reading). Its
 * narration says the crossing in a sentence ([journey]).
 *
 * @param {Object|null} resolution
 * @param {string} said — the player's line
 * @param {boolean} madeLine — pressed on a card, with no line
 * @returns {boolean}
 */
function journeyUnasked(resolution, said, madeLine) {
  if (madeLine === true || resolution?.moveId !== "set_a_course" || !isHit(resolution?.outcome)) return false;
  const text = String(said ?? "").trim();
  return !!text && !TRAVEL_WORDS.test(text);
}

/**
 * The obligations of a narration. Pure (the table's cards are read before,
 * by unansweredCardsFor, and settled on the resolution).
 *
 * Modes:
 *   "paced"       a line narrated with no roll — its offer, its refusal, the state, the sheet, the apparatus
 *   "move"        a move's narration — its result's kinds (resultObligations), the state, the sheet, the apparatus
 *   "round-entry" one entry of a Batch Mode round — a rolled move's result kinds, or a refused entry's premise
 *   "round"       the round as a whole — the state, the sheet, the apparatus
 *   "oracle"      an oracle follow-up — a yes/no answer told and its opposite not so
 *   "set-piece"   an opening, a closing or a spotlight — its rolled words never
 *                 written as rolled ([material]: `material`, sceneSeeds.js rolledWordsOf);
 *                 in second person, its character "you" ([person]: `person`)
 *
 * @param {{ mode: "paced"|"move"|"round-entry"|"round"|"oracle"|"set-piece", resolution?: Object|null, refusal?: Object|null,
 *   offer?: string|null, note?: string|null, oracle?: Object|null, situation?: Object|null, line?: string,
 *   cast?: string[], speaker?: string|null,
 *   material?: { words: string[], pairs: string[][], onRecord: string[] }|null,
 *   person?: { names: string[] }|null,
 *   dice?: Array<{ subject: string, fact: string, words: string[] }>,
 *   whereabouts?: { here: string|null, underway: string|null, places: Array<{ name: string }>,
 *     people: Array<{ name: string, where: string }>, words: string[] }|null,
 *   here?: { here: string|null, underway: string|null, places: Array<{ id: string, name: string }>,
 *     people: Array<{ name: string, where: string, placeName: string|null }>, markers: string[] }|null,
 *   madeLine?: boolean }} input — `madeLine`: a move pressed on a card, its line the card's ([unsaid]);
 *   `person`: a second-person narration's character — a set-piece's, or a beat of play's — by the names
 *   the prose must not call them ([person]); `here`: where the record has the characters, the other
 *   places and the people at one (whereabouts.js hereOf) — [here] on a beat of play but a journey's move
 * @returns {Array<{ kind: string, list: string, text: string }>}
 */
export function obligationsFor({ mode, resolution = null, refusal = null, offer = null, note = null, oracle = null,
  situation = null, line: said = "", cast = [], speaker = null, chosenSince = [], material = null, person = null, madeLine = false,
  dice = [], whereabouts = null, here = null, quotes = [] } = {}) {
  const out = [];
  // The lines of speech the session's narrations already gave ([quote]).
  const repeated = () => (Array.isArray(quotes) && quotes.length ? [{ ...line("quote"), quotes: [...quotes] }] : []);
  const journey = mode === "move" && JOURNEY_MOVES.has(resolution?.moveId);
  // Where the characters are, by the record (CHARACTERS-MOVED-BY-THE-NARRATION,
  // round 7) — every beat of play but a journey's own move. Its data rides on
  // the line for its certain check (checks.js hereViolations).
  const atPlace = (!journey && here && typeof here === "object" && (here.here || here.underway)) ? here : null;
  // A journey's hit that arrives: who is elsewhere, and was not with them as
  // they set out (whereabouts.js hereOf `arriving`), is not at the arrival.
  const arrivalAt = (journey && ARRIVAL_MOVES.has(resolution?.moveId) && isHit(resolution?.outcome)
    && here && typeof here === "object" && here.here && Array.isArray(here.people) && here.people.length) ? here : null;
  const arrived = () => (arrivalAt ? [{ ...line("arrival", { here: arrivalAt.here, people: arrivalAt.people.slice(0, ARRIVAL_PEOPLE_TOLD) }),
    here: arrivalAt.here, places: [], people: arrivalAt.people, markers: [] }] : []);
  const where = () => (atPlace ? [{ ...line("here", atPlace),
    here: atPlace.here ?? null, underway: atPlace.here ? null : (atPlace.underway ?? null),
    places: Array.isArray(atPlace.places) ? atPlace.places : [],
    people: Array.isArray(atPlace.people) ? atPlace.people : [],
    markers: Array.isArray(atPlace.markers) ? atPlace.markers : [] }] : []);
  // What the line names elsewhere (issue #393 D6) — never on a journey's own
  // move: Set a Course and the expedition moves are how the characters get there.
  // With [here] told, its first sentence is [here]'s.
  const elsewhere = () => {
    const w = whereabouts && typeof whereabouts === "object" ? whereabouts : null;
    if (!w || (!(w.places ?? []).length && !(w.people ?? []).length)) return [];
    if (journey) return [];
    const told = atPlace ? { ...w, here: null, underway: null } : w;
    return [{ ...line("whereabouts", told), words: Array.isArray(w.words) ? w.words : [] }];
  };
  // A second-person beat of play's character is "you" (BEAT-IN-THE-THIRD-PERSON,
  // round 7: a11, a69, a72) — as a set-piece's is (issue #389 #4).
  const personNames = Array.isArray(person?.names) ? [...new Set(person.names.map(n => String(n ?? "").trim()).filter(n => n.length >= 2))] : [];
  const you = () => (personNames.length ? [{ ...line("person", { names: personNames }), names: personNames }] : []);
  // What the dice decided about what the line names: told after the state (issue #389 #2).
  const decided = () => (Array.isArray(dice) ? dice : []).filter(f => f?.subject && f?.fact).map(f => line("dice", f));
  const state = () => stateFacts({ situation, line: said, target: resolution?.moveTarget ?? null, cast })
    .map(fact => line("state", { fact }));
  // A cost chosen after its narration, told here — a beat of play (D10).
  const since = () => (Array.isArray(chosenSince) ? chosenSince : []).filter(p => p?.labels?.length).map(pick => line("chosen-since", { pick }));
  if (mode === "paced") {
    out.push(...since());
    if (refusal?.premise) out.push(line("premise", { refusal }));
    if (offer) out.push(line("offer", { offer }));
    out.push(...state());
    out.push(...where());
    out.push(...elsewhere());
    out.push(...decided());
    out.push(line("sheet", { mode, refused: !!refusal }));
    out.push(line("apparatus", { offer }));
    out.push(...you());
    out.push(...repeated());
  } else if (mode === "move") {
    out.push(...since());
    out.push(...resultObligations(resolution ?? (note ? { gateNote: note } : null), { speaker }));
    if (journeyUnasked(resolution, said, madeLine)) out.push(line("journey", { place: resolution.moveTarget ?? null }));
    out.push(...arrived());
    if (madeLine === true) out.push(line("unsaid"));
    out.push(...state());
    out.push(...where());
    out.push(...elsewhere());
    out.push(...decided());
    out.push(line("sheet", { mode }));
    out.push(line("apparatus", {}));
    out.push(...you());
    out.push(...repeated());
  } else if (mode === "round-entry") {
    if (resolution && resolution.kind === "move") out.push(...resultObligations(resolution, { speaker, entry: true }));
    else if (refusal?.premise) out.push(line("premise", { refusal }));
  } else if (mode === "round") {
    // A Batch Mode round is a beat of play, held to a move's lines (issue
    // #399's audit N28): where the characters are, what the lines name
    // elsewhere, what the dice decided of what they name, "you" in a
    // second-person game, and no line of speech said again. The caller leaves
    // `here` and `whereabouts` out of a round that holds a journey's move.
    out.push(...since());
    out.push(...state());
    out.push(...where());
    out.push(...elsewhere());
    out.push(...decided());
    out.push(line("sheet", { mode }));
    out.push(line("apparatus", {}));
    out.push(...you());
    out.push(...repeated());
  } else if (mode === "oracle") {
    // A journey's complication, told at the arrival (narrator.js
    // narrateOracleFollowup): held to the place, as a beat of play is
    // (PEOPLE-WAITING-AT-THE-ARRIVAL, round 8's a72).
    out.push(...where());
    const answer = oracleAnswerOf(oracle);
    if (answer) {
      out.push(line("oracle", { oracle: answer, part: "tell" }));
      out.push(line("oracle", { oracle: answer, part: "not" }));
    }
    // The table's words are no more the story's here than in a beat of play
    // (issue #397, Code fix 4: TABLE-WORDS-IN-THE-FICTION).
    out.push(line("apparatus", {}));
  } else if (mode === "set-piece") {
    const words = Array.isArray(material?.words) ? material.words.filter(w => typeof w === "string" && w) : [];
    if (words.length) {
      out.push({ ...line("material"), words,
        pairs: Array.isArray(material.pairs) ? material.pairs : [],
        onRecord: Array.isArray(material.onRecord) ? material.onRecord : [] });
    }
    out.push(...you());
    // A session's opening, closing and spotlight too (issue #397, Code fix 4:
    // round 1's a15 opening said "because Wits 3 is a lot of thinking").
    out.push(line("apparatus", {}));
  }
  return out;
}

/**
 * The one line a card carries for a move that could not be made (D3) — "No
 * Heal — nothing to heal: Mira's health is 5 of 5 and no wound is marked." —
 * on the paced card its line was narrated on, on the not-rolled notice of a
 * forced move, on a round's refused card. The narration is told the same
 * refusal as NOT SO [premise]; one wording for both.
 *
 * @param {{ moveId: string, why: string }} refusal — contracts/gate.js refusalOf
 * @returns {string}
 */
export function refusalNote(refusal) {
  const why = String(refusal?.why ?? "").trim().replace(/\.$/, "");
  return `No ${moveName(refusal?.moveId)} — ${why || "it cannot be made now"}.`;
}

/**
 * The block: WHAT THIS NARRATION MUST TELL, AND MUST NOT — the lists in order,
 * a tag a line. '' for none. `heading` is the block's markdown level (a
 * round's entries take theirs under `####`).
 *
 * @param {Array<{ kind: string, list: string, text: string }>} obligations
 * @param {{ heading?: string }} [opts]
 * @returns {string}
 */
export function formatObligationsBlock(obligations, { heading = "##" } = {}) {
  const list = Array.isArray(obligations) ? obligations.filter(o => o?.kind && o.text) : [];
  if (!list.length) return "";
  const parts = [`${heading} WHAT THIS NARRATION MUST TELL, AND MUST NOT`];
  for (const name of OBLIGATION_LISTS) {
    const lines = list.filter(o => o.list === name);
    if (!lines.length) continue;
    parts.push([LIST_HEADINGS[name], ...lines.map(o => `- [${o.kind}] ${o.text}`)].join("\n"));
  }
  return parts.join("\n\n");
}
