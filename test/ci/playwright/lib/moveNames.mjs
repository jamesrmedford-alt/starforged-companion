// A move named in what a player typed (decisions.md → "A player is never made
// to name a move").
//
// What a player types stays in the fiction: the table reads the line and
// decides what it is. A test's player therefore never names a move, and a
// run's review counts the lines that did. This is that count — pure, from the
// module's own move list (src/schemas.js MOVES).
//
// It is a count to start reading from, not a verdict. A move's name of two
// words or more is looked for as a phrase, its verb in any tense and "your"
// as any possessive ("I fulfil my vow", "forging a bond", "we set a course").
// Several are also plain English — "pay the price", "face danger" — and are
// listed all the same: the reader decides. A one-word move (Heal, Strike,
// Repair) is an ordinary verb, so it counts only where it is written as a
// name: capitalised inside a sentence ("rolling Heal", "a Resupply"). The
// rules' own vocabulary counts too ("roll", "milestone", "mark progress"),
// and so does the word of a move's name that is the game's own term for what
// the move works on, said alone (MOVE_WORDS: "the waypoint").

import { MOVES } from "../../../../src/schemas.js";

/** A move's id as its name: "develop_your_relationship" → "Develop Your Relationship". */
export const moveLabel = (id) => String(id ?? "").replace(/_scene_challenge$/, "").split("_").filter(Boolean)
  .map((w, i) => (i > 0 && /^(?:a|an|the|of)$/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(" ");

const IRREGULAR = {
  make: "ma(?:ke|kes|de|king)", take: "t(?:ake|akes|ook|aking|aken)", undertake: "undert(?:ake|akes|ook|aking|aken)",
  swear: "sw(?:ear|ears|ore|orn|earing)", set: "set(?:s|ting)?", begin: "beg(?:in|ins|an|un|inning)",
  pay: "pa(?:y|ys|id|ying)", lose: "los(?:e|es|t|ing)", withstand: "withst(?:and|ands|ood|anding)",
  overcome: "overc(?:ome|omes|ame|oming)", fulfill: "fulfil+(?:s|ed|ing)?",
};
const POSSESSIVE = "(?:your|my|our|her|his|their|the|this|that)";
/** A verb in any tense: its stem with the common endings, or its own forms. */
const verb = (w) => IRREGULAR[w] ?? `${w.replace(/e$/, "")}(?:e|es|ed|ing)?`;

const ids = Object.keys(MOVES).filter(id => !id.endsWith("_scene_challenge"));
const PHRASES = ids.filter(id => id.includes("_")).map((id) => {
  const [first, ...rest] = id.split("_");
  const tail = rest.map(w => (w === "your" ? POSSESSIVE : w === "a" || w === "an" ? "an?" : w));
  return { id, re: new RegExp(`\\b${verb(first)}\\s+${tail.join("\\s+")}\\b`, "i") };
});
const SINGLE = ids.filter(id => !id.includes("_"));
/**
 * The words of a move's name, beyond its verb, that are the game's own term
 * for what the move works on — a line in the fiction has no call for them,
 * and they name the move said alone: "toward the waypoint where the call is
 * coming from" (the fourth live run's a29) is Explore a Waypoint by its
 * name's own word, and was not counted; "the oracle" is Ask the Oracle's.
 * Every other word of a move's name is plain English and counts only inside
 * the name: "Will you be my connection here?" (a7) is a plea, not Make a
 * Connection named. Each is a word of the move it names (src/schemas.js
 * MOVES; tests/unit/exploreRoundFour.test.js holds every move's words to
 * this list or to plain English).
 */
export const MOVE_WORDS = Object.freeze({ waypoint: "explore_a_waypoint", oracle: "ask_the_oracle" });
const WORD_RES = Object.entries(MOVE_WORDS).map(([word, id]) => ({ word, id, re: new RegExp(`\\b${word}s?\\b`, "i") }));
/** A one-word move written as a name: capitalised, and not the first word of a sentence. */
const SINGLE_RE = new RegExp(`(?<=(?:[a-z,;:)"’']|\\bI) )(${SINGLE.map(id => moveLabel(id)).join("|")})\\b`, "g");
const RULES_WORDS = [
  { id: "roll", re: /\broll(?:s|ed|ing)?\b(?!\s+(?:of|up|out|over|down|away|past|back|into|onto|across|through|under|off|aside|clear|my|her|his)\b)/i },
  { id: "milestone", re: /\bmilestones?\b/i },
  { id: "mark progress", re: /\bmark(?:s|ed|ing)?\s+progress\b/i },
  { id: "strong hit / weak hit", re: /\b(?:strong|weak)\s+hit\b/i },
  { id: "momentum", re: /\b(?:burn(?:s|ed|ing)?\s+momentum|\+\d\s+momentum)\b/i },
  { id: "a stat", re: /(?:^|\s)\+\s?(?:edge|heart|iron|shadow|wits)\b/i },
];

/**
 * The moves and rules words a line names, as labels — empty for a line that
 * stays in the fiction. A command (`!…`) or a scene question (`@scene …`) is
 * not a line of play and names nothing.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function movesNamedIn(text) {
  const line = String(text ?? "").trim();
  if (!line || /^[!@]/.test(line)) return [];
  const out = [];
  for (const p of PHRASES) if (p.re.test(line)) out.push(moveLabel(p.id));
  for (const m of line.matchAll(SINGLE_RE)) out.push(m[1]);
  // A move's own word, where its name is not already counted ("Explore a Waypoint" is one name, not two).
  for (const w of WORD_RES) if (w.re.test(line) && !out.includes(moveLabel(w.id))) out.push(w.word);
  for (const w of RULES_WORDS) if (w.re.test(line)) out.push(w.id);
  return [...new Set(out)];
}
