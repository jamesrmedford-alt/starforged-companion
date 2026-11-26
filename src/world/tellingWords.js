/**
 * STARFORGED COMPANION
 * src/world/tellingWords.js — the telling words of a passage, stemmed
 *
 * The floor two checks read a passage by: whether a narration's prose tells
 * a hidden plan's truth (skeletons.js `proseTellsTruth`, known-issues
 * VOW-FULFILLED-WITH-NOBODY-NAMED), and whether a scene's question is the
 * player's (factContinuity/provenance.js, overhaul 2 §7.2). The same words,
 * stemmed the same way, on both sides of each comparison. A leaf module: it
 * reads nothing, so a reader of it reads no plan.
 */

/**
 * Words too common to show that a passage tells a truth: function words, and
 * the general ones a narration and a truth share by chance ("thing", "still").
 */
const TRUTH_COMMON = new Set([
  "about", "above", "after", "again", "against", "along", "already", "also", "always", "among", "around", "away",
  "back", "because", "been", "before", "behind", "being", "below", "between", "both", "came", "come", "could",
  "does", "done", "down", "each", "even", "ever", "every", "from", "gave", "give", "goes", "gone", "have",
  "having", "here", "hers", "into", "itself", "just", "keep", "kept", "know", "known", "least", "less", "like",
  "made", "make", "many", "might", "more", "most", "much", "must", "near", "never", "none", "once", "only",
  "onto", "other", "others", "over", "own", "past", "really", "same", "says", "said", "shall", "should", "since",
  "some", "someone", "something", "still", "such", "take", "taken", "than", "that", "their", "theirs", "them",
  "then", "there", "these", "they", "thing", "things", "this", "those", "through", "under", "until", "upon",
  "very", "want", "wants", "were", "what", "when", "where", "whether", "which", "while", "whom", "whose",
  "will", "with", "within", "without", "would", "your", "yours",
]);

/**
 * Whether a vow's name asks who — "Find who is raiding the Cinder Expanse
 * lanes", "Learn whose hand signed the tasking", "Unmask the broker". Such a
 * vow is won by a name (VOW-FULFILLED-UNANSWERED: five live long hauls running
 * fulfilled theirs with "No name is written yet" — the plan's truth held none,
 * and the fulfilment may tell nothing more than its truth). Read by the plan's
 * decision (narratorPrompt.js DECIDE NOW) and its filing (secrets.js); words
 * only, so its readers read no plan.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function vowAsksWho(name) {
  return /\b(?:who|whom|whose)\b|\b(?:unmask|identify)\b/i.test(String(name ?? ""));
}

/** The words of a name or a passage, lower-cased, for whole-word matching. */
export function words(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
}

/**
 * A word as it is compared: without its possessive, its plural or its -ing /
 * -ed ending, a final "e" or a doubled last letter — so "raiding", "raided"
 * and "raids" are one word, as are "lane" and "lanes", "name" and "named".
 * Rough on purpose: the same rule is applied to both sides.
 */
function wordStem(word) {
  let w = String(word).replace(/'s?$/, "");
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && /(?:ch|sh|x|z|ss)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  if (w.length > 3 && w.at(-1) === w.at(-2)) w = w.slice(0, -1);
  return w;
}

/**
 * The stems of a passage's telling words: four letters or more, none of the
 * common ones.
 *
 * @param {string} passage
 * @returns {Set<string>}
 */
export function tellingStems(passage) {
  return new Set(words(passage).filter(w => w.length >= 4 && !TRUTH_COMMON.has(w)).map(wordStem).filter(s => s.length >= 3));
}
