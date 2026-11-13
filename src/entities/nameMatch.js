/**
 * STARFORGED COMPANION
 * src/entities/nameMatch.js — one thing under more than one name
 *
 * Issue #354 P2-16 / P2-17 / P2-18. The module told two names apart by
 * comparing them whole: "Archer" was not "Vuldar Archer", so an NPC the table
 * had met was offered again as a new one; "blockade corridor" was not "the
 * corridor", so the facts the narration established about a place went to the
 * Lore journal, never to the place's own record. And the names the module
 * itself gives things came out in three styles — "the corridor", "The Escort".
 *
 * This module is PURE — no Foundry globals, no I/O, no imports. It decides
 * whether two names can be one thing's, and how a generated name is written.
 * Its callers (entityExtractor.js, siteDiscovery.js) hand it names already
 * reduced by their own rules (a title stripped, lower case) where that
 * matters, and keep the decision about what a match means: the dedupe gate
 * treats any match as "already known"; lore routing takes only an unambiguous
 * one.
 */

const ARTICLES = new Set(["the", "a", "an"]);

/** Words a title-cased name keeps in lower case, unless they lead it. */
const SMALL_WORDS = new Set(["a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or", "by", "from", "with"]);

/**
 * A name's words: lower case, punctuation dropped (an apostrophe inside a
 * word kept), one leading article dropped.
 *
 * @param {string} name
 * @returns {string[]}
 */
export function nameWords(name) {
  if (typeof name !== "string") return [];
  const words = name.toLowerCase()
    .replace(/[^\p{L}\p{N}'’\s-]+/gu, " ")
    .split(/[\s-]+/)
    .map(w => w.replace(/^['’]+|['’]+$/g, ""))
    .filter(Boolean);
  return words.length > 1 && ARTICLES.has(words[0]) ? words.slice(1) : words;
}

/** A word's consonant skeleton: its first letter, then its consonants, doubles collapsed. */
function skeleton(word) {
  const rest = word.slice(1).replace(/[aeiouy]/g, "");
  return (word[0] + rest).replace(/(.)\1+/g, "$1");
}

/** Levenshtein distance, stopping once it passes `max`. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * Two words one of which is a small misspelling of the other: "valdur" for
 * "vuldar", "suton" for "sutton". Both five letters or more, the same first
 * letter, the same consonants in the same order, at most two letters apart.
 * Deliberately narrow — "maren" and "marek" are two people.
 *
 * @param {string} a — lower case
 * @param {string} b — lower case
 * @returns {boolean}
 */
export function misspelledWord(a, b) {
  if (a === b || a.length < 5 || b.length < 5) return false;
  if (a[0] !== b[0] || Math.abs(a.length - b.length) > 1) return false;
  return skeleton(a) === skeleton(b) && editDistance(a, b, 2) <= 2;
}

/**
 * Whether two people's names can be one person's:
 *   - "same"     — the same words;
 *   - "part"     — one is a single word, the other's first or last name
 *                  ("Archer" / "Vuldar Archer"; the scene frame's rule for a
 *                  PC, spotlight.js frameNamesPc, issue #322 V20);
 *   - "spelling" — the same number of words, one of them a small misspelling
 *                  (misspelledWord) and the rest the same.
 * null when they are not.
 *
 * @param {string} a
 * @param {string} b
 * @returns {"same"|"part"|"spelling"|null}
 */
export function personNameMatch(a, b) {
  const x = nameWords(a);
  const y = nameWords(b);
  if (!x.length || !y.length) return null;
  if (x.length === y.length) {
    const differing = x.filter((w, i) => w !== y[i]).length;
    if (!differing) return "same";
    if (differing === 1 && x.every((w, i) => w === y[i] || misspelledWord(w, y[i]))) return "spelling";
    return null;
  }
  const [one, full] = x.length < y.length ? [x, y] : [y, x];
  if (one.length !== 1) return null;
  const word = one[0];
  const ends = [full[0], full[full.length - 1]];
  return ends.some(e => e === word || misspelledWord(e, word)) ? "part" : null;
}

/**
 * Whether one place's (or thing's) name is inside another's as whole words:
 * "corridor" in "blockade corridor", "Kessan mine" in "the old Kessan mine".
 * Articles aside, either way round; the same words is a match too.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function nameWithin(a, b) {
  const x = nameWords(a);
  const y = nameWords(b);
  if (!x.length || !y.length) return false;
  const [inner, outer] = x.length <= y.length ? [x, y] : [y, x];
  for (let at = 0; at + inner.length <= outer.length; at++) {
    if (inner.every((w, i) => w === outer[at + i])) return true;
  }
  return false;
}

/** A name for comparing whole: lower case, single spaces, no leading article. */
export function nameKey(name) {
  return String(name ?? "").toLowerCase().replace(/\s+/g, " ").trim().replace(/^(?:the|a|an)\s+/, "");
}

/**
 * Whether one name is the other with something tacked on after a separator:
 * "Raiders: closing in", "Raiders (two ships)", "Raiders — the Red Fleet",
 * "Raiders; the blockade" are all "Raiders" with more said. Either way round;
 * case, spacing and a leading article aside. The same name is not a variant.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function suffixedName(a, b) {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y || x.length === y.length) return false;
  const [shorter, longer] = x.length < y.length ? [x, y] : [y, x];
  return longer.startsWith(shorter) && /^\s*[:;(—–]|^\s+-\s/.test(longer.slice(shorter.length));
}

/** Words a subject's name is compared without ("Free the Kessan miners" is "free kessan miners"). */
const SUBJECT_FILLER = new Set(["the", "a", "an", "of", "and", "to", "in", "on", "at"]);

/**
 * Whether two names can be one subject's — what a hidden plan or a threat is
 * about (issue #354 P2-30; the tolerant matching of P2-16, for things that
 * are not always people):
 *   - the same words, articles and filler aside ("The Escort", "the escort");
 *   - one of them the other with more after a separator (suffixedName);
 *   - one of them the start or the end of the other, by whole words — two
 *     words or more ("Unknown entity breaching the blockade" inside a longer
 *     telling of it), or a single word that is the other's last ("Archer" for
 *     "Vuldar Archer", "corridor" for "blockade corridor"). A single leading
 *     word is not enough: "Hull" is not "Hull breach";
 *   - the same number of words, one a small misspelling (misspelledWord).
 * Names with no word in common never match — "the second presence" and "the
 * escort" are one enemy only to someone who read the scene.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function sameSubject(a, b) {
  if (suffixedName(a, b)) return true;
  const x = nameWords(a).filter(w => !SUBJECT_FILLER.has(w));
  const y = nameWords(b).filter(w => !SUBJECT_FILLER.has(w));
  if (!x.length || !y.length) return false;
  const eq = (w, v) => w === v || misspelledWord(w, v);
  if (x.length === y.length) {
    const differing = x.filter((w, i) => w !== y[i]).length;
    return differing === 0 || (differing === 1 && x.every((w, i) => eq(w, y[i])));
  }
  const [inner, outer] = x.length < y.length ? [x, y] : [y, x];
  const atEnd = inner.every((w, i) => eq(w, outer[outer.length - inner.length + i]));
  if (inner.length === 1) return atEnd;
  return atEnd || inner.every((w, i) => eq(w, outer[i]));
}

/**
 * A name the module gives something — a working label, a figure the story
 * has not named — written one way: single spaces, each all-lower-case word
 * capitalised (a word already carrying a capital is left as written, so "ISV
 * Savela" and "McKay" stand), the small words ("of", "the") lower case unless
 * they lead. `stripArticle` drops a leading article: a place's working label
 * ("the corridor" → "Corridor"). Not for a person's — "The Escort" keeps its
 * article, which is what marks a figure still to be named (entityExtractor.js
 * isPlaceholderName).
 *
 * @param {string} name
 * @param {{ stripArticle?: boolean }} [opts]
 * @returns {string}
 */
export function generatedName(name, { stripArticle = false } = {}) {
  if (typeof name !== "string") return "";
  let words = name.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (stripArticle && words.length > 1 && ARTICLES.has(words[0].toLowerCase())) words = words.slice(1);
  return words.map((word, i) => {
    if (word !== word.toLowerCase()) return word;                  // already carries a capital
    if (i > 0 && SMALL_WORDS.has(word) && !/[—–:]$/.test(words[i - 1])) return word;
    return word.replace(/\p{L}/u, c => c.toUpperCase());
  }).join(" ");
}

/**
 * A lore title written one way: single spaces, no closing full stop, its
 * first letter a capital. The rest is left as the narration wrote it — a
 * proper noun inside it keeps its capital, and nothing is lower-cased.
 *
 * @param {string} title
 * @returns {string}
 */
export function loreTitle(title) {
  if (typeof title !== "string") return "";
  return title.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "")
    .replace(/^(\P{L}*)(\p{L})/u, (_m, lead, first) => lead + first.toUpperCase());
}
