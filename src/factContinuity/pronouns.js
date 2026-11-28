/**
 * STARFORGED COMPANION
 * src/factContinuity/pronouns.js — a person's pronouns, kept with the scene frame (issue #402, change 2)
 *
 * Round 10's customs clerk was "her" from a26 to a43 and "he" at a53: across
 * the break between sessions 2 and 3, and nowhere else. A pronoun lived only
 * on an entity's card, and the clerk had none (her first draft card is a55's).
 * Inside a scene the narrator is shown its own recent prose and kept her; the
 * opening of session 3 was told "With them at the end: customs clerk", and
 * nothing more.
 *
 * A fact block's `present` and `remote` entries may carry a pronoun —
 * "customs clerk (she/her)". The first one given for a person is kept with the
 * frame (ledgers.js applySceneFrame) — carried across a scene's turn and on
 * the record's frame events — and given back: in THE SCENE, in the opening's
 * "With them at the end", and to the audit's recorded identities. A recorded
 * person's card, once there is one, wins. This is no new store of people: the
 * frame already lists them, and the pronoun rides on its entries.
 *
 * Stored as a list, `[{ name, pronouns }]`: a name is no object key (a name
 * with a full stop in it is a nested path to a Foundry update).
 *
 * Pure: no imports, no I/O.
 */

/** The subject pronoun a set begins with. */
const SUBJECT = '(?:she|he|they|it|xe|ze|ey|fae|ve)';

/** A set of pronouns, as written: "she/her", "they/them/theirs". */
const SET = new RegExp(`^${SUBJECT}/[a-z]+(?:/[a-z]+)?$`);

/** A pronoun set at the end of a frame entry: "customs clerk (she/her)", "Vance [he/him]". */
const MARK = new RegExp(`\\s*[([]\\s*(${SUBJECT}\\s*/\\s*[a-z]+(?:\\s*/\\s*[a-z]+)?)\\s*[)\\]]\\s*$`, 'i');

/** The most pronoun entries a frame keeps (its people). */
export const PRONOUNS_KEPT = 16;

const keyOf = (name) => String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * A pronoun set, normalised — "she/her" — or '' for anything that is none.
 *
 * @param {*} raw
 * @returns {string}
 */
export function normalisePronouns(raw) {
  const set = String(raw ?? '').toLowerCase().replace(/\s+/g, '');
  return SET.test(set) ? set : '';
}

/**
 * A frame entry and the pronoun set marked at its end: "customs clerk
 * (she/her)" → { name: "customs clerk", pronouns: "she/her" }. An entry with
 * no mark is its name, with none.
 *
 * @param {string} entry
 * @returns {{ name: string, pronouns: string }}
 */
export function splitPronounMark(entry) {
  const text = String(entry ?? '').trim();
  const m = MARK.exec(text);
  if (!m) return { name: text, pronouns: '' };
  const name = text.slice(0, m.index).trim();
  const pronouns = normalisePronouns(m[1]);
  return name && pronouns ? { name, pronouns } : { name: text, pronouns: '' };
}

/**
 * A frame's pronoun list, normalised: one entry a person, the first kept.
 *
 * @param {*} list
 * @param {number} [cap]
 * @returns {Array<{ name: string, pronouns: string }>}
 */
export function normalisePronounList(list, cap = PRONOUNS_KEPT) {
  const out = [];
  const seen = new Set();
  for (const e of Array.isArray(list) ? list : []) {
    const name = typeof e?.name === 'string' ? e.name.replace(/\s+/g, ' ').trim() : '';
    const pronouns = normalisePronouns(e?.pronouns);
    const key = keyOf(name);
    if (!name || !pronouns || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, pronouns });
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * The pronouns a list gives a person, by name (case and spacing aside), or ''.
 *
 * @param {*} list
 * @param {string} name
 * @returns {string}
 */
export function pronounsIn(list, name) {
  const key = keyOf(name);
  if (!key) return '';
  return normalisePronounList(list, Infinity).find(e => keyOf(e.name) === key)?.pronouns ?? '';
}

/**
 * The first one given, kept: `prior`'s entries, then `given`'s for the people
 * `prior` has none for.
 *
 * @param {*} prior
 * @param {*} given
 * @returns {Array<{ name: string, pronouns: string }>}
 */
export function keptPronouns(prior, given) {
  return normalisePronounList([...normalisePronounList(prior, Infinity), ...normalisePronounList(given, Infinity)]);
}

/**
 * The entries of a list for these people alone.
 *
 * @param {*} list
 * @param {string[]} names
 * @returns {Array<{ name: string, pronouns: string }>}
 */
export function pronounsFor(list, names) {
  const wanted = new Set((Array.isArray(names) ? names : []).map(keyOf).filter(Boolean));
  return normalisePronounList(list).filter(e => wanted.has(keyOf(e.name)));
}

/**
 * A person's name with their pronouns, as THE SCENE and the opening say it:
 * "customs clerk (she/her)". The card's, when a recorded person has them
 * (`card`), win over the frame's.
 *
 * @param {string} name
 * @param {{ frame?: *, card?: string }} [from] — the frame's list; the card's set
 * @returns {string}
 */
export function withPronouns(name, { frame = null, card = '' } = {}) {
  const text = String(name ?? '').trim();
  if (!text) return '';
  const set = normalisePronouns(card) || pronounsIn(frame, text);
  return set ? `${text} (${set})` : text;
}

// ─────────────────────────────────────────────────────────────────────────────
// The pronoun-change check — logged only until it is measured (D2's half)
// ─────────────────────────────────────────────────────────────────────────────

const FEMININE = /\b(?:she|her|hers|herself)\b/gi;
const MASCULINE = /\b(?:he|him|his|himself)\b/gi;

/** A set's gender as the check reads it: "f", "m", or "n" (they, it, any other). */
function genderOf(set) {
  const subject = String(set ?? '').split('/')[0];
  return subject === 'she' ? 'f' : subject === 'he' ? 'm' : 'n';
}

/** A handle's last words that say too little alone: "the hook man" is read as "hook man". */
const GENERIC_HEADS = new Set(['man', 'woman', 'figure', 'person', 'one', 'voice', 'boy', 'girl', 'kid', 'stranger']);

/**
 * What a person is called by in prose: each word of a name ("Tamsin",
 * "Okoro"); a handle's last word ("the clerk"), or its last two where that
 * word says too little alone ("hook man").
 */
function callWords(name) {
  const words = String(name ?? '').split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}'’-]/gu, '')).filter(Boolean);
  if (!words.length) return [];
  if (/^\p{Lu}/u.test(words[0])) return words.filter(w => w.length >= 3);
  const last = words[words.length - 1].toLowerCase();
  if (GENERIC_HEADS.has(last)) return words.length > 1 ? [words.slice(-2).join(' ')] : [];
  return last.length >= 3 ? [last] : [];
}

const mentions = (sentence, words) => words.some(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\b`, 'i').test(sentence));

/**
 * The words in a sentence that stand for someone or something else a she or a
 * he could be: another person by a common noun ("the man at your shoulder",
 * "a dock hand"), or a vessel ("her flank" is the cutter's). A sentence that
 * holds one is not read.
 */
const OTHER_SOMEONE = /\b(?:man|men|woman|women|boy|girl|kid|child|guard|guards|officer|clerk|dockhand|stranger|figure|crew|crewman|pilot|captain|merchant|trader|broker|foreman|dockmaster|courier|watcher|someone|anyone|everyone|nobody|ship|cutter|hauler|freighter|vessel|shuttle|craft|frigate|corvette|tug|barge|station)s?\b/i;

/** A sentence with its quoted speech taken out — what is said is about anyone — to its end where a quote runs on. */
const unquoted = (s) => s.replace(/["“][^"”]*["”]/g, ' ').replace(/["“][^"”]*$/, ' ').replace(/\s+/g, ' ').trim();

/**
 * A name in a sentence — any capitalised word past its first, and a first
 * word that owns something ("Voss's face") — other than one of `own`: someone
 * or somewhere else.
 */
function namesAnother(sentence, own) {
  const raw = sentence.split(/\s+/);
  const words = raw.map(w => w.replace(/^[^\p{L}]+|[^\p{L}'’]+$/gu, ''));
  return words.some((w, i) => {
    const bare = w.replace(/['’]s$/, '');
    if (!/^\p{Lu}\p{Ll}/u.test(bare) || own.has(bare.toLowerCase())) return false;
    return i > 0 || bare !== w;
  });
}

/** Whether a sentence names the person only as an owner ("Tamsin's chair") — no one it can hand a pronoun on from. */
function namedAsOwner(sentence, words) {
  let named = 0;
  for (const w of words) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\b(['’]s)?`, 'gi');
    for (let m = re.exec(sentence); m; m = re.exec(sentence)) {
      if (!m[1]) return false;
      named += 1;
    }
  }
  return named > 0;
}

/** Each sentence with the speech in it taken out — a quote that runs on from the sentence before as well. */
function narrationOf(sentences) {
  let open = false;
  return sentences.map(s => {
    let text = s;
    if (open) {
      const close = text.search(/["”]/);
      if (close < 0) return '';            // still inside the speech
      text = text.slice(close + 1);
    }
    open = (text.match(/["“”]/g) ?? []).length % 2 === 1;
    return unquoted(text);
  });
}

/** Where in a sentence it first calls the person, or -1. */
function mentionAt(sentence, words) {
  let at = -1;
  for (const w of words) {
    const m = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}\\b`, 'i').exec(sentence);
    if (m && (at < 0 || m.index < at)) at = m.index;
  }
  return at;
}

/**
 * The sentences of a narration that give a person on record another pronoun
 * (issue #402, change 2). Read outside quoted speech, in a sentence that
 * names one person alone — by a name's words, or a handle's last word ("the
 * clerk") — after the name, and in the sentence after it while that names no
 * one else: a she or a he that is not theirs. A sentence that names another
 * person, or holds a common noun for one or for a vessel ("the man", "her
 * flank" — the cutter's), is not read; "it" and "they" are never read as one
 * (an object, a group). Measured on the kept runs before it may ask again
 * (decisions.md, issue #402 change 2); logged only. Pure.
 *
 * @param {string} prose
 * @param {Array<{ name: string, pronouns: string }>} people — each person's set on record
 * @param {{ others?: string[] }} [opts] — the other names in play: a sentence that names one is not read
 * @returns {Array<{ name: string, pronouns: string, found: string, quote: string, after?: string }>} `after`:
 *   the sentence that named them, when the pronoun is in the next
 */
export function pronounBreaks(prose, people, { others = [] } = {}) {
  // The narration alone: no markup, no offer line ("*… could be a Compel.*").
  const text = String(prose ?? '').replace(/<[^>]+>/g, ' ').replace(/\*[^*]*\*/g, ' ');
  const sentences = text.split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?\p{Lu})/u).map(s => s.trim()).filter(Boolean);
  const told = narrationOf(sentences);
  const onRecord = normalisePronounList(people, Infinity).filter(p => callWords(p.name).length);
  const out = [];
  for (const person of onRecord) {
    const words = callWords(person.name);
    const own = new Set(words.map(w => w.toLowerCase()));
    const rivals = [...onRecord.filter(p => p !== person).map(p => p.name), ...(Array.isArray(others) ? others : [])]
      .filter(n => keyOf(n) !== keyOf(person.name)).map(callWords).filter(w => w.length);
    // Another someone, or a vessel, by a common noun — the person's own handle aside.
    const elsewhere = (s) => {
      const re = new RegExp(OTHER_SOMEONE.source, 'gi');
      for (let m = re.exec(s); m; m = re.exec(s)) if (!own.has(m[0].toLowerCase().replace(/s$/, ''))) return true;
      return false;
    };
    const gender = genderOf(person.pronouns);
    const wrong = gender === 'f' ? [MASCULINE] : gender === 'm' ? [FEMININE] : [FEMININE, MASCULINE];
    // In the sentence that names them, "him" is whom they act on — someone else.
    const firstWrong = (s, own) => wrong.map(re => {
      const all = s.match(new RegExp(re.source, 'gi')) ?? [];
      return all.find(w => !(own && w.toLowerCase() === 'him')) ?? null;
    }).find(Boolean) ?? null;
    const ownNames = new Set(words.flatMap(w => w.toLowerCase().split(/\s+/)));
    const clear = (s) => !rivals.some(r => mentions(s, r)) && !elsewhere(s) && !namesAnother(s, ownNames);
    for (let i = 0; i < sentences.length; i += 1) {
      const here = told[i];
      const at = mentionAt(here, words);
      if (at < 0 || !clear(here)) continue;
      // After the name in its own sentence; then the next, while it names no
      // one else — from a sentence where they act, not one that names what is theirs.
      const span = [{ s: here.slice(at), quote: sentences[i], own: true }];
      const next = told[i + 1] ?? '';
      if (next && clear(next) && !namedAsOwner(here, words)) span.push({ s: next, quote: sentences[i + 1], own: false });
      for (const { s, quote, own } of span) {
        const hit = firstWrong(s, own);
        if (!hit) continue;
        if (!out.some(o => o.name === person.name && o.quote === quote)) {
          out.push({ name: person.name, pronouns: person.pronouns, found: hit.toLowerCase(), quote, ...(quote !== sentences[i] ? { after: sentences[i] } : {}) });
        }
        break;
      }
    }
  }
  return out;
}
