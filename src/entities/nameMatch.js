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

/** A word's letters in alphabetical order: two words with the same are each other's letters rearranged. */
const sortedLetters = (word) => [...word].sort().join("");

/** A word with each doubled letter written once. */
const singleLetters = (word) => word.replace(/(.)\1+/g, "$1");

/**
 * Two words one of which is a small misspelling of the other: "valdur" for
 * "vuldar" (the same letters, the vowels in another order), "suton" for
 * "sutton" (a doubled letter written once). Both five letters or more, the
 * same first letter, the same consonants in the same order, at most two
 * letters apart — and the same letters, or the same word once its doubled
 * letters are single. Deliberately narrow — "maren" and "marek" are two
 * people, and so are "soren" and "seren", "maria" and "mario", "simon" and
 * "simone": a vowel changed, added or dropped is another name, not a typo
 * (issue #362 AC17 — any two names that differed only in their vowels were
 * one person's, so his sister was never offered and her facts went on his
 * card).
 *
 * @param {string} a — lower case
 * @param {string} b — lower case
 * @returns {boolean}
 */
export function misspelledWord(a, b) {
  if (a === b || a.length < 5 || b.length < 5) return false;
  if (a[0] !== b[0] || Math.abs(a.length - b.length) > 1) return false;
  if (skeleton(a) !== skeleton(b) || editDistance(a, b, 2) > 2) return false;
  return sortedLetters(a) === sortedLetters(b) || singleLetters(a) === singleLetters(b);
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
 * The titles a person's name may lead with: the honorifics the name index
 * strips (relevanceResolver.js HONORIFIC_PREFIXES) and the titles the module
 * writes into NPC names as their role (connection.js NAME_TITLE_ROLES) — the
 * set entityExtractor.js normalizeEntityName strips before the entity gates
 * compare people. Kept here because this module imports nothing;
 * nameMatch.test.js fails when either source gains a title this set lacks.
 */
const PERSON_TITLES = new Set([
  "dr", "mr", "mrs", "ms", "mx", "miss",
  "cmdr", "commander", "captain", "capt", "cap", "cpt",
  "lt", "lieutenant", "sgt", "sergeant",
  "gen", "general", "col", "colonel", "maj", "major",
  "prof", "professor", "rev", "reverend",
  "sir", "dame", "lord", "lady",
  "administrator", "admiral", "ambassador", "chancellor", "chief", "councilor", "councillor",
  "director", "doctor", "elder", "foreman", "governor", "magistrate", "overseer", "warden",
]);

/**
 * A person's name without its leading title — and a leading article before
 * it: "Captain Reyes" → "Reyes", "Dr. Chen" → "Chen", "the Captain Reyes" →
 * "Reyes". A name that is a title alone keeps it ("the Captain"): nothing is
 * left to call them by. The rest is returned as written.
 *
 * @param {string} name
 * @returns {string}
 */
export function withoutTitle(name) {
  if (typeof name !== "string") return "";
  const words = name.trim().split(/\s+/).filter(Boolean);
  const at = words.length > 1 && ARTICLES.has(words[0].toLowerCase()) ? 1 : 0;
  const first = (words[at] ?? "").toLowerCase().replace(/\.$/, "");
  return words.length - at > 1 && PERSON_TITLES.has(first) ? words.slice(at + 1).join(" ") : name.trim();
}

/**
 * Whether a name is a title and nothing more, an article aside: "the
 * Captain", "Doctor", "Dr." — who it is depends on the scene, not the name.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isBareTitle(name) {
  const words = nameWords(name);
  return words.length === 1 && PERSON_TITLES.has(words[0]);
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

/**
 * The words that say what a site is, by the location type they make it
 * (entityExtractor.js detectedSiteType; a location's kind words below).
 */
export const SITE_TYPE_WORDS = [
  ["vault",    /^vaults?$/],
  ["derelict", /^(?:derelicts?|wrecks?|wreckage|hulks?)$/],
];

/**
 * The words that say what kind of place a record is, beside its name — by
 * the kind of record. The module's own words for each: the record's type,
 * the detection prompt's gloss of it ("settlement: named community, station,
 * outpost"; "location: named specific place (derelict, vault, structure,
 * site)"), a location's types (entities/location.js) and the words that make
 * a detected site a derelict or a vault (SITE_TYPE_WORDS). A plural counts.
 */
const PLACE_KIND_WORDS = {
  settlement: new Set(["settlement", "community", "station", "outpost"]),
  location:   new Set(["location", "structure", "site", "station", "anomaly", "ruin"]),
  planet:     new Set(["planet"]),
};

/** Whether a (lower-case) word says what kind of place a record of that kind is. */
function isPlaceKindWord(word, kind) {
  const words = PLACE_KIND_WORDS[kind];
  if (!words) return false;
  if (words.has(word) || words.has(word.replace(/s$/, ""))) return true;
  return kind === "location" && SITE_TYPE_WORDS.some(([, re]) => re.test(word));
}

/**
 * The words an expedition's label may hold beside the place it is for, that
 * say only that it is a journey there — the module's own words for one:
 *   - the move's nouns: "expedition" (the move, its track, the label its plan
 *     is given — "the expedition to ‹name›", resolver.js
 *     expeditionPlanRequest) and "journey" (the interpreter's and the
 *     classifier's word for it: "any journey toward a destination that is
 *     not a charted, known place"). A plural counts.
 *   - the prepositions that only say "towards": to, toward, towards, for,
 *     into.
 * A preposition that places the destination beside the known place — beyond,
 * near, past, outside, off, under, above, behind, around, of … — is not one:
 * that is what makes "the wreck beyond Bleakhold" another place than
 * Bleakhold. The one list (placeNameAndLittleElse's `journey`,
 * withoutJourneyWords).
 */
const JOURNEY_NOUNS = new Set(["expedition", "journey"]);
const TOWARDS_WORDS = new Set(["to", "toward", "towards", "for", "into"]);

/** Whether a (lower-case) word says only that a label is a journey to its place. */
function isJourneyWord(word) {
  return TOWARDS_WORDS.has(word) || JOURNEY_NOUNS.has(word) || JOURNEY_NOUNS.has(word.replace(/s$/, ""));
}

/**
 * An expedition's label with the journey's own words (isJourneyWord, the one
 * list) taken off its edges, and the article that leads them — what is left
 * is the destination as it would be typed alone:
 *   - before it, an article and the journey words: "the expedition to Bleak"
 *     → "Bleak", "a journey toward Bleakhold Station" → "Bleakhold Station";
 *     an article after them is the place's own and stays ("expedition to the
 *     gap" → "the gap");
 *   - after it, the journey's nouns, with the article before the label's
 *     first word, which is theirs: "the Bleak expedition" → "Bleak".
 * The words between are kept as typed. A preposition that places the
 * destination beside the known place is no journey word, so "the wreck
 * beyond Bleakhold" comes back whole. "" when nothing but journey words and
 * articles is left: they name no place.
 *
 * The caller is index.js resolveCurrentLocationName, for an expedition's own
 * label (`journeyWords`): its rungs that compare the label whole — a name it
 * begins, a fragment of a name — compared the journey words too, so "the
 * expedition to Bleak" recorded a new uncharted site though "Bleak" is for
 * Bleakhold (issue #364 EXPEDITION-JOURNEY-WORDS-FRAGMENT). Pure.
 *
 * @param {string} label
 * @returns {string}
 */
export function withoutJourneyWords(label) {
  const words = String(label ?? "").trim().split(/\s+/).filter(Boolean);
  const bare    = (w) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const article = (w) => ARTICLES.has(bare(w));
  const journey = (w) => isJourneyWord(bare(w));
  // Before it: the run of articles and journey words, up to its last journey word.
  let from = 0;
  for (let i = 0; i < words.length && (article(words[i]) || journey(words[i])); i++) {
    if (journey(words[i])) from = i + 1;
  }
  // After it: the journey words that end it, and then the article that leads it.
  let to = words.length;
  while (to > from && journey(words[to - 1])) to--;
  if (to < words.length && from === 0 && to > 1 && article(words[0])) from = 1;
  const kept = words.slice(from, to);
  return kept.every(article) ? "" : kept.join(" ");
}

/**
 * Whether a destination's label is a known place's name and little else:
 * the name's words, together and in order, and around them nothing but
 * articles and words that say what kind of place it is — "Bleakhold
 * Station", "the Bleakhold settlement", "Bleakhold outpost" for the
 * settlement Bleakhold; "the Kovash Hulk wreck" for the location Kovash Hulk.
 * A longer label is another place's: "Archer's rendezvous — the gap" is not
 * the settlement Archer, nor "the wreck beyond Bleakhold" Bleakhold (issue
 * #364 COURSE-NEW-LABEL-CONTAINS-SETTLEMENT — a rule, the maintainer's
 * decision; the caller is index.js resolveCurrentLocationName, for a travel
 * move asking whether its destination is a place the campaign knows).
 *
 * `journey` — the label is an expedition's own (the destination an Undertake
 * an Expedition typed as one names, kept as its track's label): the
 * journey's own words are little else too (isJourneyWord), so "the
 * expedition to Bleakhold", "the Bleakhold expedition" and "a journey toward
 * Bleakhold Station" are for Bleakhold, and "the expedition to the wreck
 * beyond Bleakhold" is not (issue #364
 * EXPEDITION-NEW-LABEL-CONTAINS-SETTLEMENT).
 *
 * @param {string} label — the destination, as the move names it
 * @param {string} placeName — the known place's name
 * @param {"settlement"|"location"|"planet"} kind — the place's record type
 * @param {{ journey?: boolean }} [opts]
 * @returns {boolean}
 */
export function placeNameAndLittleElse(label, placeName, kind, { journey = false } = {}) {
  const outer = nameWords(label);
  const inner = nameWords(placeName);
  if (!inner.length || outer.length < inner.length) return false;
  const little = (w) => ARTICLES.has(w) || isPlaceKindWord(w, kind) || (journey && isJourneyWord(w));
  for (let at = 0; at + inner.length <= outer.length; at++) {
    if (!inner.every((w, i) => w === outer[at + i])) continue;
    if (outer.slice(0, at).every(little) && outer.slice(at + inner.length).every(little)) return true;
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
