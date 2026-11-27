/**
 * STARFORGED COMPANION
 * src/narration/proseVariety.js — what keeps one beat from reading like the last
 *
 * Issue #354 P2-20, P2-22, P2-27 (the alpha 23 playtest, part 2). Pure: no
 * Foundry globals, no I/O. narrator.js reads the session's last narrator cards
 * and hands their prose in; narratorPrompt.js renders what comes back.
 *
 * Three things the playtest's narrations had in common, and what answers each:
 *
 *   - **Length.** The Length setting counted sentences, so the sentences grew:
 *     at Length 3 a beat ran 120–200 words, clause stacked on clause, hard to
 *     follow read aloud. A length is now a word budget with a sentence cap
 *     (lengthBudget) — the setting's number is how many sentences of ordinary
 *     length the budget is worth.
 *   - **Repeated images.** One simile ("the way an usher…") came back in three
 *     narrations, and nearly every beat leaned on a strained comparison. The
 *     comparisons the recent cards used are pulled out (recentImages) and
 *     listed for the narrator as images not to reuse.
 *   - **One shape.** Every beat was built the same way: a long opening
 *     sentence, one NPC line, the same recurring details, the close. A shape
 *     is picked for each beat (pickBeatShape), never the previous beat's.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Length — a word budget, a sentence cap, short sentences (P2-20)
// ─────────────────────────────────────────────────────────────────────────────

/** The words one step of the Length setting is worth: a sentence of ordinary length. */
export const WORDS_PER_SENTENCE = 22;
/** …and the most a step may run to: the budget's ceiling. */
export const WORDS_PER_SENTENCE_CEILING = 28;
/** The longest one sentence should run. */
export const SENTENCE_WORDS_MAX = 30;
/** …when the narration is read aloud (audio narration on): one breath. */
export const AUDIO_SENTENCE_WORDS_MAX = 18;
/** How many sentences the budget may be split into, per step: short sentences need room. */
export const SENTENCES_PER_STEP = 1.5;

const roundTo5 = (n) => Math.max(5, Math.round(n / 5) * 5);

/**
 * A narration's length as a budget: about `words` words, never more than
 * `maxWords`, in at most `maxSentences` sentences, none longer than
 * `sentenceWords` words.
 *
 * @param {number} sentenceTarget — the Length setting (a round's: roundSentenceTarget)
 * @param {{ audio?: boolean }} [opts] — `audio`: the narration is read aloud
 * @returns {{ steps: number, words: number, maxWords: number, maxSentences: number, sentenceWords: number, audio: boolean }}
 */
export function lengthBudget(sentenceTarget, { audio = false } = {}) {
  const steps = Math.max(1, Math.round(Number(sentenceTarget)) || 3);
  return {
    steps,
    words:         roundTo5(steps * WORDS_PER_SENTENCE),
    maxWords:      roundTo5(steps * WORDS_PER_SENTENCE_CEILING),
    maxSentences:  Math.ceil(steps * SENTENCES_PER_STEP),
    sentenceWords: audio ? AUDIO_SENTENCE_WORDS_MAX : SENTENCE_WORDS_MAX,
    audio:         audio === true,
  };
}

/**
 * The budget as the narrator reads it, e.g. "about 65 words — never more than
 * 85 — in at most 5 sentences".
 *
 * @param {number} sentenceTarget
 * @param {{ audio?: boolean }} [opts]
 * @returns {string}
 */
export function lengthPhrase(sentenceTarget, opts = {}) {
  const b = lengthBudget(sentenceTarget, opts);
  return `about ${b.words} words — never more than ${b.maxWords} — in at most ${b.maxSentences} sentence${b.maxSentences !== 1 ? 's' : ''}`;
}

/**
 * How the sentences inside the budget are built: short, one idea each — and
 * shorter still when the narration is read aloud.
 *
 * @param {number} sentenceTarget
 * @param {{ audio?: boolean }} [opts]
 * @returns {string}
 */
export function sentenceRule(sentenceTarget, opts = {}) {
  const b = lengthBudget(sentenceTarget, opts);
  return b.audio
    ? `This narration is read aloud: short sentences, one idea each, none over about ${b.sentenceWords} words. Never stack clauses to fit more in.`
    : `Short sentences, one idea each, none over about ${b.sentenceWords} words. Never stack clauses to fit more in.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recently used images (P2-22, P2-27)
// ─────────────────────────────────────────────────────────────────────────────

/** The narrator cards whose comparisons are listed (the newest). */
export const IMAGE_SOURCE_CARDS = 6;
/** The most images listed. */
export const IMAGES_LISTED_MAX = 8;
/** The most words of one image kept. */
const IMAGE_WORDS_MAX = 12;

// A comparison's opening: "like a/an/the/some(one|thing)…", "as if / as
// though…", "the way a/an/the/some(one)…", "as <word> as a/an/the…". Each runs
// to the end of its clause. Cheap on purpose: a miss costs one unlisted image,
// a false match one harmless line.
const COMPARISON_OPENINGS = [
  /\blike (?:a|an|the|some|someone|something|one)\b[^.,;:!?()"“”\n—–]*/gi,
  /\bas (?:if|though)\b[^.,;:!?()"“”\n—–]*/gi,
  /\bthe way (?:a|an|the|some|someone|something)\b[^.,;:!?()"“”\n—–]*/gi,
  /\bas \w+ as (?:a|an|the)\b[^.,;:!?()"“”\n—–]*/gi,
];

/**
 * The comparisons a passage of narration makes, in the order they appear:
 * each the simile's own words, clipped to a dozen.
 *
 * @param {string} text — narrator prose
 * @returns {string[]}
 */
export function extractComparisons(text) {
  const prose = typeof text === 'string' ? text.replace(/<[^>]*>/g, ' ').replace(/[*_]/g, '') : '';
  if (!prose.trim()) return [];
  const found = [];
  for (const pattern of COMPARISON_OPENINGS) {
    for (const m of prose.matchAll(pattern)) {
      const words = m[0].replace(/\s+/g, ' ').trim().split(' ');
      // "like the others", "as if so": too short to be an image.
      if (words.length < 4) continue;
      found.push({ at: m.index, phrase: words.slice(0, IMAGE_WORDS_MAX).join(' ') + (words.length > IMAGE_WORDS_MAX ? '…' : '') });
    }
  }
  return found.sort((a, b) => a.at - b.at).map(f => f.phrase);
}

/**
 * The images the recent narrations used, newest first, each once — what the
 * narrator is told not to reuse.
 *
 * @param {string[]} narrations — narrator prose, oldest first (the session's last cards)
 * @param {{ cards?: number, limit?: number }} [opts]
 * @returns {string[]}
 */
export function recentImages(narrations, { cards = IMAGE_SOURCE_CARDS, limit = IMAGES_LISTED_MAX } = {}) {
  const texts = (Array.isArray(narrations) ? narrations : []).filter(t => typeof t === 'string' && t.trim()).slice(-cards);
  const seen = new Set();
  const out  = [];
  for (const text of texts.reverse()) {
    for (const phrase of extractComparisons(text)) {
      const key = phrase.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(phrase);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Details already worn (NARRATION-REFRAINS-RISING, the seventh live round)
// ─────────────────────────────────────────────────────────────────────────────

/** A detail is worn when it is in this many of the recent narrations… */
export const WORN_IN_CARDS = 3;
/** …of the newest this many. */
export const WORN_SOURCE_CARDS = 6;
/** The most worn details listed. */
export const WORN_LISTED_MAX = 6;

// Words that carry no detail of their own: the grammar, the generic verbs of
// narration, and the scene's ordinary motion.
const WORN_STOP = new Set(`about above across after again against along also although among another around away back because
before behind being below beneath beside between beyond both cannot could does doing done down during each either else enough
even ever every from have having here hers herself himself into itself just least less like little many more most much must
near neither never next nothing once only onto other others ours over perhaps quite rather same says said should since some
something somewhere soon still such than that their theirs them then there these they thing things this those though through
till together toward towards under until upon very what when where whether which while whom whose will with within without
would yours your yourself looks look looked turns turn turned takes take took gives give gave makes make made goes went comes
come came keeps keep kept holds held lets sets puts gets says asks asked tells told knows know knew sees seen seem seems
seemed wait waits waiting moment long first last next time again already almost quiet quietly slowly enough
the and her his him you she was for but not all one out now too has had its who how why can did get got let may our own say
see way yet off are any few new old two put set ask own lot far yes per via nor than its ago due end met use
you're you’re you've you’ve you'll you’ll it's it’s that's that’s decide decided decides stop stops stopped start starts started
stay stays stayed past short someone second`.split(/\s+/).filter(Boolean));

/**
 * A narration's content words, in order: lowercase, three letters or more
 * ("pen", "boy"), no stop word and no name. Italic words are words — a
 * ship's name, a stressed one; the closing offer line is its caller's to
 * leave out, where it was given (narrator.js beatVariety; issue #399's audit
 * N32 — every italic span was dropped here).
 */
function detailWords(text, names) {
  const prose = String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/[*_]/g, ' ').toLowerCase();
  return prose.split(/[^\p{L}'’-]+/u)
    .map(w => w.replace(/^['’-]+|['’-]+$/g, '').replace(/['’]s$/, ''))
    .map(w => (w.length >= 3 && !WORN_STOP.has(w) && !names.has(w) ? w : null));
}

/**
 * The names a narration writes that the record may not hold — a word written
 * with a capital in the middle of a sentence ("the Cinder Wren", "Ashen
 * Wake"): round 8's worn lists named "ashen wake" and "cinder wren", set by
 * `!truth set`, as details (THE-REFRAINS-THE-LIST-CANNOT-NAME).
 *
 * @param {string} text
 * @returns {string[]}
 */
function namesWrittenIn(text) {
  const out = [];
  // Emphasis off first: a ship's name in italics ("the *Kestrel*") is a name.
  for (const m of String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/[*_]/g, '').matchAll(/(?<=[\p{Ll},;:)] )\p{Lu}[\p{L}'’-]*(?: \p{Lu}[\p{L}'’-]*)*/gu)) out.push(m[0]);
  return out;
}

/** How many words a line of speech has before a narration saying it again is a repeat ([quote]). */
const QUOTE_MIN_WORDS = 6;

/** A line of speech, for comparing: lowercase, its punctuation gone. */
const quoteKey = (s) => String(s ?? '').toLowerCase().replace(/[’]/g, "'").replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * The lines of speech a narration quotes, each sentence of a quotation on its
 * own, compared as words alone — of QUOTE_MIN_WORDS words or more. Its fact
 * block is left out. Round 8's a92 gave Tamsin a84's line again, word for
 * word: "Then you're in it as deep as I am" (THE-REFRAINS-THE-LIST-CANNOT-NAME).
 * Pure.
 *
 * @param {string} text — a narration
 * @param {{ min?: number }} [opts]
 * @returns {string[]}
 */
export function quotedLinesOf(text, { min = QUOTE_MIN_WORDS } = {}) {
  const prose = String(text ?? '').replace(/```[\s\S]*?```/g, ' ');
  const out = [];
  for (const m of prose.matchAll(/["“]([^"”\n]{1,600})["”]/g)) {
    for (const sentence of m[1].split(/(?<=[.!?…])\s+/)) {
      const key = quoteKey(sentence);
      if (key && key.split(' ').length >= min) out.push(key);
    }
  }
  return out;
}

/**
 * The lines of speech the session's narrations have already given, for the
 * certain [quote] (checks.js): each narration's, once — but one the player's
 * own line holds, which a narration may say back. Pure.
 *
 * @param {string[]} narrations — the session's narrator prose
 * @param {{ line?: string }} [opts] — this beat's player line
 * @returns {string[]}
 */
export function linesAlreadySaid(narrations, { line = '' } = {}) {
  const own = quoteKey(line);
  const said = new Set();
  for (const text of Array.isArray(narrations) ? narrations : []) {
    for (const q of quotedLinesOf(text)) if (!own.includes(q)) said.add(q);
  }
  return [...said];
}

/**
 * The details the recent narrations kept coming back to — the seventh live
 * round's cold read: "Tamsin's pen stops, scratches or hangs in almost every
 * beat she appears in", "the ledger boy has stopped counting", "turns on her
 * dead drive"; 39 words and phrases were in a third or more of a session's
 * narrations (19 in round 4). A word or a pair of words, names apart, in
 * WORN_IN_CARDS of the newest WORN_SOURCE_CARDS narrations; a pair before the
 * words it holds, the most-worn first. What the narrator is told to reach past.
 *
 * @param {string[]} narrations — narrator prose, oldest first (the session's last cards), a card's closing
 *   offer line left out where it offered a move (narrator.js beatVariety)
 * @param {{ names?: string[], keep?: string[], cards?: number, min?: number, limit?: number }} [opts] — `names`: the
 *   story's names (people, places, ships), never listed — a name is the story's, not a refrain; `keep`: the
 *   scene's own words and the player's line — what the scene is about is no refrain either
 * @returns {string[]}
 */
export function wornDetails(narrations, { names = [], keep = [], cards = WORN_SOURCE_CARDS, min = WORN_IN_CARDS, limit = WORN_LISTED_MAX } = {}) {
  const texts = (Array.isArray(narrations) ? narrations : []).filter(t => typeof t === 'string' && t.trim()).slice(-cards);
  if (texts.length < min) return [];
  const nameWords = new Set([...(names ?? []), ...(keep ?? []), ...texts.flatMap(namesWrittenIn)]
    .flatMap(n => String(n ?? '').toLowerCase().split(/[^\p{L}'’-]+/u))
    .map(w => w.replace(/['’]s$/, '')).filter(w => w.length >= 3));
  const df = new Map();       // phrase → in how many narrations
  const newest = new Map();   // phrase → the newest narration it is in
  texts.forEach((text, i) => {
    const words = detailWords(text, nameWords);
    const seen = new Set();
    for (let k = 0; k < words.length; k++) {
      if (!words[k]) continue;
      seen.add(words[k]);
      if (words[k + 1]) seen.add(`${words[k]} ${words[k + 1]}`);
    }
    for (const p of seen) { df.set(p, (df.get(p) ?? 0) + 1); newest.set(p, i); }
  });
  const worn = [...df.entries()].filter(([, n]) => n >= min)
    .sort((a, b) => (b[1] - a[1]) || ((newest.get(b[0]) ?? 0) - (newest.get(a[0]) ?? 0))
      || (b[0].split(' ').length - a[0].split(' ').length));
  const out = [];
  for (const [phrase] of worn) {
    // A word a listed pair holds is the pair's; a pair holding a listed word replaces it.
    if (phrase.includes(' ')) {
      for (const w of phrase.split(' ')) { const at = out.indexOf(w); if (at >= 0) out.splice(at, 1); }
    } else if (out.some(p => p.includes(' ') && p.split(' ').includes(phrase))) continue;
    if (!out.includes(phrase)) out.push(phrase);
    if (out.length >= limit) break;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// A shape for each beat (P2-27)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The ways a beat can be built. `hint` is what the narrator reads — said of
 * the narration ("its first sentence…"), never as a director's imperative:
 * "Open on someone other than the acting character" came back as prose,
 * "Open on the hatch, not you." (issue #377 item 2,
 * NARRATION-WRITES-ITS-SHAPE-DIRECTIVE — two of 28 narrated lines in the long
 * haul's first live run).
 */
export const BEAT_SHAPES = Object.freeze([
  Object.freeze({ id: 'action',   hint: 'Its first sentence shows what someone does; any speech comes after.' }),
  Object.freeze({ id: 'dialogue', hint: 'Its first sentence is a line someone speaks, and what happens follows from it.' }),
  Object.freeze({ id: 'brief',    hint: 'It is brief: two or three short sentences, well under the length budget, with no scene-setting.' }),
  Object.freeze({ id: 'detail',   hint: 'It is built around one concrete thing a character sees, hears or feels — one, not a list.' }),
  Object.freeze({ id: 'other',    hint: 'Its first sentence is about someone other than the acting character — what they are doing as this lands — if someone else is in the scene; otherwise about the place.' }),
]);

// A step that visits every shape before any repeats (coprime with the count).
const SHAPE_STEP = 2;

function hashOf(seed) {
  let h = 0;
  for (const ch of String(seed ?? '')) h = (h * 31 + ch.codePointAt(0)) % 9973;
  return h;
}

/**
 * The shape for a beat: by its place in the session (`beatIndex`, the beats
 * before it — narrator.js beatVariety counts the session's beat cards, never
 * its other narrator cards, issue #362 AC72), so two beats in a row never
 * share one; the session (`seed`) decides where the cycle starts. A session
 * with a beat already written follows that beat's shape instead
 * (beatShapeAfter), whatever cards have left chat since.
 *
 * @param {{ beatIndex?: number, seed?: string|null }} [at]
 * @returns {{ id: string, hint: string }}
 */
export function pickBeatShape({ beatIndex = 0, seed = null } = {}) {
  const n = Math.max(0, Math.floor(Number(beatIndex)) || 0);
  return BEAT_SHAPES[(hashOf(seed) + n * SHAPE_STEP) % BEAT_SHAPES.length];
}

/**
 * The shape that follows `shapeId` in the cycle — the next beat's, given the
 * shape the beat before it was written in (its card's `beatShape` stamp;
 * narrator.js beatVariety). The same step pickBeatShape takes, so a session
 * whose cards are all in chat is shaped as it was by their count. Null for
 * anything that is no shape's id.
 *
 * @param {string|null} shapeId
 * @returns {{ id: string, hint: string }|null}
 */
export function beatShapeAfter(shapeId) {
  const at = BEAT_SHAPES.findIndex(s => s.id === shapeId);
  return at < 0 ? null : BEAT_SHAPES[(at + SHAPE_STEP) % BEAT_SHAPES.length];
}
