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
// A shape for each beat (P2-27)
// ─────────────────────────────────────────────────────────────────────────────

/** The ways a beat can be built. `hint` is what the narrator reads. */
export const BEAT_SHAPES = Object.freeze([
  Object.freeze({ id: 'action',   hint: 'Open on what someone does. Any speech comes after it.' }),
  Object.freeze({ id: 'dialogue', hint: 'Open on a line of speech, and let what happens follow from it.' }),
  Object.freeze({ id: 'brief',    hint: 'Keep this one brief: two or three short sentences, well under the length budget, no scene-setting.' }),
  Object.freeze({ id: 'detail',   hint: 'Build the beat around one concrete thing a character sees, hears or feels — one, not a list.' }),
  Object.freeze({ id: 'other',    hint: 'Open on someone other than the acting character — what they are doing as this lands — if someone else is in the scene; otherwise on the place.' }),
]);

// A step that visits every shape before any repeats (coprime with the count).
const SHAPE_STEP = 2;

function hashOf(seed) {
  let h = 0;
  for (const ch of String(seed ?? '')) h = (h * 31 + ch.codePointAt(0)) % 9973;
  return h;
}

/**
 * The shape for a beat: by its place in the session (`beatIndex`, the
 * narrations before it), so two beats in a row never share one and nothing
 * need be stored; the session (`seed`) decides where the cycle starts.
 *
 * @param {{ beatIndex?: number, seed?: string|null }} [at]
 * @returns {{ id: string, hint: string }}
 */
export function pickBeatShape({ beatIndex = 0, seed = null } = {}) {
  const n = Math.max(0, Math.floor(Number(beatIndex)) || 0);
  return BEAT_SHAPES[(hashOf(seed) + n * SHAPE_STEP) % BEAT_SHAPES.length];
}
