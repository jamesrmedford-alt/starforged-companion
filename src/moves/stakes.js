/**
 * STARFORGED COMPANION
 * src/moves/stakes.js — the stakes stated before a roll (issue #353 R1)
 *
 * A miss's cost often had nothing to do with what was attempted: every miss
 * that pays the price rolled the Pay the Price table, so a scan's miss came
 * back "You are delayed or put at a disadvantage" with nothing behind it
 * (alpha 23 playtest). The rule's first choice is "make the most obvious
 * negative outcome happen" (Pay the Price).
 *
 * The move interpreter now says, from the scene, what a hit would get the
 * character and what a miss would cost — its most obvious negative outcome —
 * and may name one suffer move the miss costs (`missSuffer`). The Confirm
 * dialog shows both before the roll; a miss that pays the price pays the one
 * stated (decided, maintainer 2026-11-13: the stated outcome is a miss's
 * default price, the Pay the Price table the alternative — rolled when no
 * miss was stated, or with the world setting off), through the same suffer
 * executors and receipts a burn undoes; and the narrator is told the stakes
 * and delivers the one the outcome calls for.
 *
 * Built from the scene only — never from a hidden plan: the stakes are shown
 * on the roller's screen before the roll, and the plans are the GM's.
 */

const MODULE_ID = "starforged-companion";

/** The world setting: a miss that pays the price pays the stated stakes (default on). */
export const STAKES_SETTING = "missPaysStatedStakes";

/** The longest stakes line kept (a line, not a paragraph). */
export const STAKES_LINE_MAX = 200;

/**
 * The suffer moves a stated miss may name: the routes Pay the Price's table
 * annotates (src/oracles/tables/payThePrice.js) — Lose Momentum among them
 * since issue #354 P2-12, for being "delayed or put at a disadvantage". The
 * names as the narrator, the dialog and the Pay the Price card show them.
 */
export const STATED_SUFFER_MOVES = Object.freeze({
  endure_harm:           "Endure Harm",
  endure_stress:         "Endure Stress",
  lose_momentum:         "Lose Momentum",
  sacrifice_resources:   "Sacrifice Resources",
  withstand_damage:      "Withstand Damage",
  companion_takes_a_hit: "Companion Takes a Hit",
});

/**
 * The stated suffer moves that land on one of the roller's vehicles or
 * companions, which the interpreter may name (`missSuffer.target`, issue #364
 * ACTION-STAT-VEHICLE-PRICE-NO-TARGET).
 */
const TARGETED_SUFFER_MOVES = new Set(["withstand_damage", "companion_takes_a_hit"]);

/** The longest vehicle or companion name kept as a stated suffer move's target. */
const SUFFER_TARGET_MAX = 60;

/** A stated suffer move's target as the interpreter named it: a trimmed, single-line name, or null. */
function sufferTargetName(value) {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim();
  return s && s.length <= SUFFER_TARGET_MAX ? s : null;
}

/** One stakes line: a trimmed, single-line string within STAKES_LINE_MAX, or null. */
function stakesLine(value) {
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > STAKES_LINE_MAX ? `${s.slice(0, STAKES_LINE_MAX - 1).trimEnd()}…` : s;
}

/**
 * The interpreter's `stakes` as the module keeps them: a hit line, a miss
 * line, and the miss's suffer move — a known one, 1–3 — only beside a miss
 * line. A Withstand Damage or Companion Takes a Hit keeps the vehicle or
 * companion the interpreter named for it (`target`, a name — resolved to the
 * roller's own asset before the roll, statEnrichment.js
 * resolveStatedSufferTarget; issue #364 ACTION-STAT-VEHICLE-PRICE-NO-TARGET).
 * Null when it gave neither line. Pure.
 *
 * @param {*} raw
 * @returns {{ hit: string|null, miss: string|null, missSuffer: { move: string, amount: number, target?: string }|null }|null}
 */
export function normaliseStakes(raw) {
  if (!raw || typeof raw !== "object") return null;
  const hit  = stakesLine(raw.hit);
  const miss = stakesLine(raw.miss);
  if (!hit && !miss) return null;
  let missSuffer = null;
  const s = raw.missSuffer;
  if (miss && s && typeof s === "object" && typeof s.move === "string" && Object.hasOwn(STATED_SUFFER_MOVES, s.move)) {
    const n = Number(s.amount ?? 1);
    const target = TARGETED_SUFFER_MOVES.has(s.move) ? sufferTargetName(s.target) : null;
    missSuffer = { move: s.move, amount: Number.isInteger(n) ? Math.min(3, Math.max(1, n)) : 1, ...(target ? { target } : {}) };
  }
  return { hit, miss, missSuffer };
}

/** Whether a miss pays the stated stakes (the world setting, default on). Fail-open: on. */
export function statedPriceEnabled() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, STAKES_SETTING) !== false;
  } catch {
    return true;
  }
}

/**
 * Stakes as the interpretation carries them: with `priceStated` — whether a
 * miss pays the stated miss (one was stated, the move's miss pays a price,
 * and the setting is on) — fixed when they are read, so the dialog shows what
 * the roll then pays. A move whose miss pays no price (`missPays` false —
 * Enter the Fray's bad spot, Swear an Iron Vow's obstacle, the resist rolls)
 * has no price for the stated miss to be: the dialog showed "On a miss: …
 * (Endure Harm −1)" and the narrator was told "it is what this miss costs",
 * and nothing charged it (issue #362 AC02).
 *
 * @param {Object|null} stakes — normaliseStakes'
 * @param {boolean} [missPays] — whether the move's miss pays a price
 *   (resolver.js missPaysPrice): routed, or a choice that pays it (Sojourn's)
 * @returns {Object|null}
 */
export function withPriceSource(stakes, missPays = false) {
  if (!stakes) return null;
  return { ...stakes, priceStated: !!stakes.miss && missPays === true && statedPriceEnabled() };
}

/**
 * The price a miss pays when it is the stated one: the miss line, and its
 * suffer move as a Pay the Price route (Companion Takes a Hit falls back to
 * Endure Harm with no companion, as the table's route does). Null when the
 * stakes state no price — the table is rolled.
 *
 * A stated Withstand Damage or Companion Takes a Hit lands on what the move
 * was made against (issue #362 D11, decided — the move's targets forwarded
 * to the price): the support vehicle it was rolled for (`vehicleItemId`), the
 * companion it was rolled for or tends (`companionItemId`,
 * `patientCompanionItemId`). They landed on the command vehicle and the first
 * companion whatever the line named. A move rolled on an action stat has no
 * such target — "I gun the hoverbike across the gap", Face Danger +edge — so
 * its stated damage still went to the starship: with none of its own, the
 * price lands on the vehicle or companion the interpreter named for it
 * (`missSuffer.target`), resolved to the roller's asset before the roll
 * (`missSuffer.vehicleItemId` / `companionItemId`, statEnrichment.js
 * resolveStatedSufferTarget — issue #364 ACTION-STAT-VEHICLE-PRICE-NO-TARGET).
 * With neither, those defaults stand.
 *
 * @param {Object|null} stakes — the interpretation's (withPriceSource)
 * @param {{ vehicleItemId?: string|null, companionItemId?: string|null, patientCompanionItemId?: string|null }|null} [targets]
 *   — the move's (its interpretation, statEnrichment's)
 * @returns {{ price: string, sufferRoutes: Array<{ move: string, amount: number, soloFallback?: string,
 *   vehicleItemId?: string, companionItemId?: string }> }|null}
 */
export function statedPrice(stakes, targets = null) {
  if (!stakes?.priceStated || !stakes.miss) return null;
  const s = stakes.missSuffer;
  const route = s && Object.hasOwn(STATED_SUFFER_MOVES, s.move)
    ? { move: s.move, amount: s.amount, ...(s.move === "companion_takes_a_hit" ? { soloFallback: "endure_harm" } : {}),
      ...routeTarget(s.move, targets, s) }
    : null;
  return { price: stakes.miss, sufferRoutes: route ? [route] : [] };
}

/**
 * A stated route's vehicle or companion: the move's own (its targets), else
 * the one the stated suffer move names (`stated` — the stakes' missSuffer,
 * resolved) — `{}` for none, or for another suffer move.
 */
function routeTarget(move, targets, stated = null) {
  const id = (v) => (typeof v === "string" && v ? v : null);
  if (move === "withstand_damage") {
    const vehicle = id(targets?.vehicleItemId) ?? id(stated?.vehicleItemId);
    return vehicle ? { vehicleItemId: vehicle } : {};
  }
  if (move === "companion_takes_a_hit") {
    const companion = id(targets?.companionItemId) ?? id(targets?.patientCompanionItemId) ?? id(stated?.companionItemId);
    return companion ? { companionItemId: companion } : {};
  }
  return {};
}

/**
 * "Endure Harm −1" — a stated suffer move as the dialog and the narrator show
 * it. A Withstand Damage or Companion Takes a Hit names the vehicle or
 * companion it will land on when that is known before the roll — "Withstand
 * Damage −1 · Hoverbike" (`targetName`, statEnrichment.js
 * nameStatedSufferTarget; issue #364 STATED-TARGET-NOT-SHOWN). The dialog
 * showed the suffer move alone: with a starship in orbit and a hoverbike
 * under them, the player could not tell which a miss would damage. Never the
 * interpreter's own word for it (`target`), which may name nothing the
 * roller has.
 *
 * @param {{ move?: string, amount?: number, targetName?: string }|null} route — the stakes' missSuffer
 * @returns {string}
 */
export function sufferRouteLabel(route) {
  const name = STATED_SUFFER_MOVES[route?.move];
  if (!name) return "";
  const target = TARGETED_SUFFER_MOVES.has(route.move) ? sufferTargetName(route.targetName) : null;
  return `${name} −${route.amount ?? 1}${target ? ` · ${target}` : ""}`;
}

/** The roll's stat that is a vehicle's or a companion's own track, by the suffer move that damages it. */
const TARGET_TRACK_STATS = Object.freeze({ withstand_damage: "integrity", companion_takes_a_hit: "companion_health" });

/**
 * Whether a stated miss's Withstand Damage or Companion Takes a Hit is known,
 * before the roll, to land on the vehicle or companion it names — the one
 * resolved for it (`missSuffer.vehicleItemId` / `companionItemId`,
 * statEnrichment.js resolveStatedSufferTarget). Only then do the stakes name
 * it (issue #364 STATED-TARGET-NOT-SHOWN): what the dialog shows is what the
 * miss does.
 *
 * The move's own vehicle or companion takes the price first (statedPrice,
 * issue #362 D11), so a target is not known to take it when the move:
 *   - already has another of its own (`routeTarget`, as the price is routed);
 *   - is rolled on that kind of asset's own track (+integrity, +a companion's
 *     health), or an ability the dialog offers may swap its stat for one —
 *     the roll's vehicle or companion is resolved at the roll, after the
 *     dialog (statEnrichment.js enrichInterpretationStatValue);
 *   - is a Heal, whose patient may be a companion (resolveHealPatient, at the
 *     roll) — for a companion's hit.
 * Pure.
 *
 * @param {Object|null} stakes — the interpretation's, its missSuffer resolved
 * @param {{ moveId?: string, statUsed?: string|null, applicableAbilities?: Array<Object>, vehicleItemId?: string|null,
 *   companionItemId?: string|null, patientCompanionItemId?: string|null }|null} [move] — the interpretation
 * @returns {boolean}
 */
export function statedTargetLands(stakes, move = null) {
  const s = stakes?.missSuffer;
  if (!s || !TARGETED_SUFFER_MOVES.has(s.move)) return false;
  const named = s.move === "withstand_damage" ? s.vehicleItemId : s.companionItemId;
  if (typeof named !== "string" || !named) return false;
  const lands = routeTarget(s.move, move, s);
  if ((lands.vehicleItemId ?? lands.companionItemId ?? null) !== named) return false;
  const track = TARGET_TRACK_STATS[s.move];
  if (move?.statUsed === track) return false;
  const abilities = Array.isArray(move?.applicableAbilities) ? move.applicableAbilities : [];
  if (abilities.some(a => a?.statReplacement === track)) return false;
  return !(s.move === "companion_takes_a_hit" && move?.moveId === "heal");
}

/** The lines a dialog shows: the hit, and the miss when it is the price. Empty for no stakes. */
export function stakesShown(stakes) {
  if (!stakes) return [];
  const out = [];
  if (stakes.hit) out.push({ kind: "hit", text: stakes.hit });
  if (stakes.miss && stakes.priceStated) {
    out.push({ kind: "miss", text: stakes.miss, cost: stakes.missSuffer ? sufferRouteLabel(stakes.missSuffer) : "" });
  }
  return out;
}

/**
 * The narrator's STAKES block (issue #353 R1): what the player saw before
 * the roll, and which of it this outcome delivers. '' with nothing shown.
 *
 * A miss whose price is one of the player's choices (`priceChoice`,
 * resolver.js settlePriceChoice — Explore a Waypoint's with a match: Confront
 * Chaos instead; Sojourn's: the community's need, taken on with a vow,
 * instead) delivers the stated miss only once it is paid: while the choice is
 * open, or once the price is declined, the block points at the price-choice
 * block that says so (formatPriceChoiceBlock). It was told "it is what this
 * miss costs" about a price nothing had charged (issue #364
 * EXPLORE-WAYPOINT-MATCH-MISS-ADVISORY; Sojourn's —
 * SOJOURN-MISS-PRICE-NARRATED-BEFORE-CHOICE).
 *
 * A weak hit whose cost is its player's choice, not yet made (`openChoice`,
 * resultUpgrade.js withUnansweredCards — Heal's "Lose Momentum (-2) OR
 * Sacrifice Resources (-2)"), delivers the hit and leaves the cost to the
 * block that says how (formatOpenChoiceBlock): told to deliver the hit "with
 * the cost … the move outcome names", the narration paid one before the card
 * had asked (the long haul's third live run, a59).
 *
 * An Enter the Fray whose fight is still only offered, or was declined for a
 * way out (`fightOffer`, resultUpgrade.js withUnansweredCards), delivers its
 * hit as the opening the roll won, never as a blow struck: its stated hit —
 * "open with a clean salvo before she can bring her own guns to bear" — was
 * to be delivered "as stated", and was, under a card still asking whether to
 * fight (the same run, a27). The block on the fight says how far to go
 * (formatFightOfferBlock).
 *
 * @param {Object|null} stakes — the resolution's
 * @param {string|null} outcome — "strong_hit" | "weak_hit" | "miss"
 * @param {{ priceChoice?: { status?: string, instead?: string }|null, openChoice?: Object|null,
 *   fightOffer?: { status?: string }|null }} [opts] — the resolution's price choice, as it stands; the cost
 *   still its player's to choose; the fight its Enter the Fray offered, while no one has begun it
 * @returns {string}
 */
export function formatStakesBlock(stakes, outcome, { priceChoice = null, openChoice = null, fightOffer = null } = {}) {
  const shown = stakesShown(stakes);
  if (!shown.length) return "";
  const lines = ["## STAKES STATED BEFORE THE ROLL", "", "The player saw these before rolling:"];
  for (const s of shown) {
    lines.push(s.kind === "hit" ? `- On a hit: ${s.text}` : `- On a miss: ${s.text}${s.cost ? ` (${s.cost})` : ""}`);
  }
  const hit  = shown.some(s => s.kind === "hit");
  const miss = shown.some(s => s.kind === "miss");
  let deliver = "";
  if ((outcome === "strong_hit" || outcome === "weak_hit") && hit && fightNotBegun(fightOffer)) {
    deliver = `This is a ${outcome === "strong_hit" ? "strong" : "weak"} hit: the hit as stated is the opening this roll has won — ` +
      "where it puts them — not a blow already struck. The block on the fight, below, says how far the narration goes.";
  } else if (outcome === "strong_hit" && hit) deliver = "This is a strong hit: deliver the hit as stated.";
  else if (outcome === "weak_hit" && hit && openChoice) deliver = "This is a weak hit: deliver the hit as stated. Its cost is the player's choice, and is not chosen yet — the block on the cost, below, says how to leave it.";
  else if (outcome === "weak_hit" && hit) deliver = "This is a weak hit: deliver the hit as stated, with the cost or complication the move outcome names.";
  else if (outcome === "miss" && miss && priceChoiceOpen(priceChoice)) deliver = `This is ${priceAlternative(priceChoice).miss}: the stated miss is the price it offers, not a price paid — the block on the price, below, says where it stands.`;
  else if (outcome === "miss" && miss) deliver = "This is a miss: deliver the miss as stated — it is what this miss costs.";
  else if (outcome === "miss") deliver = "This is a miss: the hit did not come. Its cost is the move outcome's, not a stated one.";
  if (deliver) lines.push("", deliver);
  return lines.join("\n");
}

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
 * priceChoiceOf). Each: `miss` — what the STAKES block calls the miss;
 * `offered` and `show` — the choice still open; `declined` and `after` — the
 * price declined (the block puts "no price is paid" between them).
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

/**
 * The narrator's block for a miss whose price is one of the player's choices
 * (issue #364 EXPLORE-WAYPOINT-MATCH-MISS-ADVISORY — Explore a Waypoint's
 * miss with a match: Pay the Price, or Confront Chaos instead; and
 * SOJOURN-MISS-PRICE-NARRATED-BEFORE-CHOICE — Sojourn's miss: no relief and
 * the price, or the community's need taken on with a vow), as the choice
 * stands when the narration is written (resolver.js settlePriceChoice): not
 * yet made — the price is shown arriving, never paid; declined — no price is
 * paid, and what was taken instead tells what comes. '' once the price is
 * paid (the seed and the stakes deliver it), and for a result with no such
 * choice.
 *
 * @param {{ price?: string, stated?: boolean, instead?: string, status?: string }|null} priceChoice
 * @returns {string}
 */
export function formatPriceChoiceBlock(priceChoice) {
  if (!priceChoiceOpen(priceChoice)) return "";
  const told  = priceAlternative(priceChoice);
  const price = stakesLine(priceChoice.price);
  if (priceChoice.status === "declined") {
    return [
      "## THE PRICE WAS NOT PAID",
      "",
      `${told.declined}: no price is paid` +
      `${priceChoice.stated ? ", and the miss stated before the roll does not come to pass" : ""}. ` +
      told.after,
    ].join("\n");
  }
  return [
    "## THE PRICE IS THE PLAYER'S CHOICE",
    "",
    `${told.offered}${price ? ` The price it offers: ${price}` : ""}`,
    told.show,
  ].join("\n");
}

// What no cost still to be chosen may be narrated as, whichever it turns out to be.
const NO_COST_PAID = "nothing spent, used up, run short, lost or damaged, no harm or strain taken, and no time or ground lost";

/**
 * The narrator's block for a result whose cost is its player's choice, not
 * yet made when the narration is written (`openChoice` — resultUpgrade.js
 * withUnansweredCards; known-issues COST-NARRATED-BEFORE-IT-IS-CHOSEN): the
 * outcome line names the costs it may be ("Lose Momentum (-2) OR Sacrifice
 * Resources (-2)"), the card that asks which posts after the narration, and
 * the narration chose for the player — "the cracked tube gives out half-used,
 * and the tape runs short", before Lose Momentum or Sacrifice Resources was
 * picked (the long haul's third live run, a59). The narration tells what
 * every option has in common and stops short of what differs: the cost.
 * '' with no such choice open.
 *
 * @param {{ kind?: string, options?: string[], amount?: number|null, count?: number|null }|null} openChoice
 * @returns {string}
 */
export function formatOpenChoiceBlock(openChoice) {
  if (!openChoice || typeof openChoice !== "object") return "";
  const options = (Array.isArray(openChoice.options) ? openChoice.options : [])
    .map(o => stakesLine(o)).filter(Boolean);
  if (openChoice.kind === "any") {
    const amount = Number.isFinite(openChoice.amount) && openChoice.amount > 0 ? ` (-${openChoice.amount})` : "";
    const times  = Number.isFinite(openChoice.count) && openChoice.count > 1 ? `${openChoice.count} suffer moves` : "a suffer move";
    return [
      "## THE COST IS THE PLAYER'S CHOICE",
      "",
      `This result costs ${times}${amount}, and which is the player's to choose: momentum, health, spirit, supply, ` +
      "a companion's health or the vehicle's integrity. A card asks them after this narration; they have not chosen.",
      "Show the trouble that brings the cost — what goes wrong, what presses on them — and stop before saying what it takes: " +
      `${NO_COST_PAID}. Which of those it is, the player decides. Never mention the card or the choice.`,
    ].join("\n");
  }
  if (!options.length) return "";
  return [
    "## THE COST IS THE PLAYER'S CHOICE",
    "",
    "Part of this result is the player's to choose, on a card they have not answered yet. It offers:",
    ...options.map(o => `- ${o}`),
    "What every option has in common has happened: narrate it. Where they differ is the cost, and no cost has been paid: " +
    `narrate none of them as taken — ${NO_COST_PAID}. Bring the beat to where the cost falls due, and stop there. ` +
    "Never mention the card or the choice.",
  ].join("\n");
}

/** Whether an Enter the Fray's fight has not been begun: still offered, or declined for a way out. */
function fightNotBegun(fightOffer) {
  return fightOffer?.status === "offered" || fightOffer?.status === "declined";
}

/**
 * The narrator's block for an Enter the Fray whose fight has not been begun
 * when its roll is narrated (`fightOffer` — resultUpgrade.js
 * withUnansweredCards; known-issues FIGHT-NARRATED-BEFORE-IT-IS-BEGUN).
 * "Combat is offered, not forced" (decisions.md): the roll posts a card that
 * asks whether to begin the fight or look for a way out, and its narration,
 * written under that card, had already fired — "Your first salvo takes her
 * forward plating" (the long haul's third live run, a27). While the card is
 * unanswered the narration brings the scene to the moment before the first
 * blow — positions taken, the footing the roll gave — and no further; once
 * the way out is taken, no blow is struck at all. '' once the fight is begun,
 * and for any other move.
 *
 * @param {{ status?: string, position?: string|null }|null} fightOffer
 * @returns {string}
 */
export function formatFightOfferBlock(fightOffer) {
  if (!fightNotBegun(fightOffer)) return "";
  const footing = fightOffer.position === "in_control" ? " The footing this roll gave them: the upper hand."
    : fightOffer.position === "bad_spot" ? " The footing this roll gave them: the back foot."
      : "";
  if (fightOffer.status === "declined") {
    return [
      "## THE FIGHT WAS NOT BEGUN",
      "",
      "This Enter the Fray is rolled, and the player chose to look for a way out instead of beginning the fight. " +
      "No blow is struck by either side: no shot is fired, and nothing and no one is hit, damaged or hurt. " +
      "Show the stand-off at its edge — where each side stands, what is drawn or aimed — and leave how they get clear " +
      `untold: the move that decides it comes after this narration.${footing}`,
    ].join("\n");
  }
  return [
    "## THE FIGHT IS STILL ONLY OFFERED",
    "",
    "This Enter the Fray is rolled, but the fight has not begun: a card asks the player whether to begin it or look " +
    "for a way out, and they have not answered.",
    "Bring the scene to the moment before the first blow, and stop there: where each side stands, what is drawn, " +
    `aimed or closing, and who has the advantage.${footing}`,
    "Nobody has struck yet: no shot is fired, no blow lands, nothing and no one is hit, damaged or hurt, and neither " +
    "side breaks off or gives way. Where the stakes or the player's line have the fight opening — a first salvo, a " +
    "first strike — show it as what they are placed to do, about to happen, never as done. Never mention the card or the choice.",
  ].join("\n");
}
