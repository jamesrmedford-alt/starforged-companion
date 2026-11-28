/**
 * STARFORGED COMPANION
 * src/moves/contracts/blockCheck.js — the instruction block, checked before it is sent (issue #402, change 3a)
 *
 * Every check the module had read the narrator's output. Round 10's narrator
 * mostly did what it was told; its faults came from what it was told, and a
 * check of the output cannot see a fault in the input. Here the TELL / NOT
 * YET / NOT SO block is read against the module's own data where it is put
 * together (obligations.js obligationsFor), and a fault the code can mend is
 * mended there (D3: what is certain — R1, R2); one it cannot is reported to
 * the GM (R3).
 *
 *   R1  a weak hit's line asks for "the cost or complication the move outcome
 *       names" only when the outcome names one. Round 10's a57, Repair, a weak
 *       hit: its outcome — "Gain repair points: facility 3, field 1 … Same
 *       spend options" — names none, and the narration made one up ("your
 *       supplies run thinner than you left them", supply 5 throughout).
 *   R2  an effect that waits on a spend or a choice is NOT YET. A Repair's hit
 *       gives repair points; the mending is what the player spends them on,
 *       after. Its stakes promised the mending ("On a hit: The plating holds…"),
 *       and four rounds told it done with integrity unchanged (round 5's a60,
 *       round 6's a62, round 7's a56, round 9's a58, round 10's a57).
 *   R3  a plan handed over for its reveal names one culprit, someone the story
 *       has met (world/storyPeople.js). Round 10's a75 revealed "the foreman"
 *       and "Talia Tolari", a name the code had appended and nobody had met.
 *
 * Pure. Each check reads what the block says and the data it was built from,
 * so it reads a kept run's recorded block as it reads one being built. It
 * reads no plan itself: R3 is handed the people a plan's truth names
 * (skeletons.js peopleNamedIn, by its caller), so the hidden plans' model
 * keeps its few readers (tests/unit/secretsStayHidden.test.js).
 */

/** The weak hit's clause that asks for the outcome's cost (obligations.js `stakes`). */
export const WEAK_HIT_COST_CLAUSE = "with the cost or complication the move outcome names";

/** A move outcome's words that name a cost or a complication. */
const COST_WORDS = /\b(?:costs?|complicat\w*|counterblow|danger|peril|bad spot|demand|setback|fallout|interruption|ominous|undermined|strained|short|uncertain|unforeseen|ask something more|more remains|suffer|Pay the Price|Lose Momentum|Sacrifice Resources)\b/i;

/**
 * The moves whose hit is an effect that waits on a spend: what it gives is
 * spent by the player after the narration (R2). Repair's points are spent on
 * the card that follows its roll (index.js `repairPointsOf`, the 🔧 Spend
 * button): until then nothing is mended.
 */
export const SPEND_EFFECTS = Object.freeze({
  repair: Object.freeze({ gives: "repair points", decides: "what it mends" }),
});

const isHit = (outcome) => outcome === "strong_hit" || outcome === "weak_hit";

/**
 * Whether a move's outcome names a cost or a complication: a suffer move or a
 * price it routes to, a meter it takes, or words that say one (COST_WORDS).
 * Takes the resolver's consequences (resolver.js mapConsequences) or, from a
 * recorded block, the outcome's words alone. Pure.
 *
 * @param {Object|string|null} consequences
 * @returns {boolean}
 */
export function outcomeNamesACost(consequences) {
  if (typeof consequences === "string") return COST_WORDS.test(consequences);
  const c = consequences && typeof consequences === "object" ? consequences : {};
  if (c.sufferPrompt || c.routePayThePrice === true) return true;
  if (["healthChange", "spiritChange", "supplyChange", "momentumChange"].some(k => Number.isFinite(c[k]) && c[k] < 0)) return true;
  return COST_WORDS.test(String(c.otherEffect ?? ""));
}

/**
 * The block's faults R1 and R2, from its lines and the move it narrates.
 * Pure.
 *
 * @param {{ lines: Array<{ kind?: string, text?: string }>, moveId?: string|null, outcome?: string|null,
 *   consequences?: Object|string|null }} block
 * @returns {Array<{ rule: "R1"|"R2", kind: string, why: string }>}
 */
export function instructionFaults({ lines = [], moveId = null, outcome = null, consequences = null } = {}) {
  const out = [];
  const all = Array.isArray(lines) ? lines : [];
  const stakes = all.find(o => o?.kind === "stakes");
  // Only on the outcome's own data: with none, whether it names a cost is not known, and the line stands.
  if (outcome === "weak_hit" && stakes && consequences != null && String(stakes.text ?? "").includes(WEAK_HIT_COST_CLAUSE)
    && !outcomeNamesACost(consequences)) {
    out.push({ rule: "R1", kind: "stakes", why: "the weak hit's line asks for a cost the move outcome does not name" });
  }
  const spend = SPEND_EFFECTS[moveId] ?? null;
  if (spend && isHit(outcome) && !all.some(o => o?.kind === "spend")) {
    out.push({ rule: "R2", kind: "spend", why: `the hit gives ${spend.gives}, and ${spend.decides} waits on the player's spend` });
  }
  return out;
}

/**
 * R3: whether a plan handed over for its reveal names one culprit, someone
 * the story has met. Null when it does; else the fault — no one named, more
 * than one, or someone the story has not met. Pure.
 *
 * @param {Array<{ name: string, met: boolean }>} people — whom the plan's truth names (skeletons.js
 *   peopleNamedIn, read against world/storyPeople.js)
 * @returns {{ rule: "R3", why: string, named: Array<{ name: string, met: boolean }> }|null}
 */
export function revealFault(people) {
  const named = Array.isArray(people) ? people.filter(p => p && typeof p.name === "string" && p.name) : [];
  if (!named.length) return { rule: "R3", why: "it names no one", named };
  if (named.length > 1) return { rule: "R3", why: `it names ${named.length} people as the one behind it`, named };
  if (!named[0].met) return { rule: "R3", why: "it names someone the story has not met", named };
  return null;
}
