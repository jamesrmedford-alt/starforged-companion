/**
 * STARFORGED COMPANION
 * src/factContinuity/nameChanges.js — the names the table changed, told
 * wherever the old name can still reach a prompt (issue #377 item 1,
 * known-issues CORRECTION-AND-RENAME-DO-NOT-REACH-THE-RECORD).
 *
 * A GM's rename of a card — an NPC, a ship, a place, a faction — renames the
 * card, its bond Items and the vows linked to it, and nothing else: the World
 * Journal's lore and event lines, earlier sessions' summaries, a hidden plan's
 * subject and its clock, the Chronicle and the scene's own truths filed under
 * the old name all keep it. A table's correction of a name (`!truth strike` of
 * "is named the Ashen Wake" and `!truth set` of "is named the Cinder Wren", or
 * a Replace) is named under CORRECTED in its own scene alone, at the place the
 * fact was asserted. Handed two names for one thing and nothing saying one had
 * replaced the other, the narrator made both true — "Tamsin Okoro. Though the
 * docks swear she's Vey" — and every helper after it recorded the alias.
 *
 * The issue's option 1, as recommended: a change is recorded once
 * (`campaignState.nameChanges`, written only by the table's rename and
 * correction paths, on the GM) and told wherever the old name can still reach
 * a prompt — the narrator's context in every mode (the campaign recap's
 * included) and the session summary's source. A change is told while it was
 * made this session (the recent scene the ring carries is this session's) or
 * while the old name — whole, or the part of it the new one does not share
 * ("Vey") — is in the text the call sends. Nothing is rewritten in the stores
 * (option 2): the note is what says which name is current.
 *
 * A name is also written cut short — "the Wake" for the Ashen Wake, "Vey" for
 * Tamsin Vey — and the note gave the old name whole: one step after "Ashen
 * Wake" was corrected to "Cinder Wren" the narrator wrote "The Wake's boarding
 * lock", from a recent scene that said "the Wake" (the long haul's third live
 * run, a46; known-issues CORRECTED-NAME-SHORT-FORM). A change's line now names
 * each short form the call's own text uses on its own, and what to write for
 * it (`shortFormsInUse`); such a form alone also makes an earlier session's
 * change due. Never a word the new name keeps, nor one another name in play
 * holds: "Tamsin" is no old name of Tamsin Okoro's.
 *
 * Not recorded: a placeholder figure's identity revealed by a narration
 * (entityExtractor.js applyEntityRenames — the narrator named them itself,
 * and the rename is the X-Card's to take back) and that take-back. Both write
 * the card's record before its name, so the sidebar's rename sync, which
 * records a GM's rename, sees nothing to follow.
 */

import { serialiseCampaignStateWrite } from '../multiplayer/campaignStateChain.js';
import { subjectKey, XCARD_RETRACTED_BY, SUPERSEDED_RETRACTED_BY } from './ledgers.js';
import { recordEvent } from '../record/record.js';

const MODULE_ID = 'starforged-companion';

/** How many changes a campaign keeps — the newest. */
export const NAME_CHANGES_CAP = 40;

/** The heading the narrator's context gives the notes. */
export const NAME_CHANGES_HEADING = '## NAMES THE TABLE CHANGED';

const KINDS = new Set(['renamed', 'corrected']);

/** A word that leads into a name: "is named", "is called", "goes by"… */
const NAMING = /\b(?:named|called|known as|goes by|go by|went by|christened|dubbed|calls (?:him|her|them|it)(?:self|selves)?|name is|name was|names? (?:are|were))\b/i;

/** Lower-case words a name may hold between its capitalised ones ("Wake of Ashes"). */
const NAME_CONNECTORS = new Set(['of', 'the', 'de', 'du', 'da', 'del', 'della', 'van', 'von', 'la', 'le', 'al', 'el', 'bin', 'ibn', 'and']);

/** Surrounding punctuation a word is compared and joined without. */
const EDGE_PUNCT = /^[\s"'“”‘’*_()[\]{}<>«»,.;:!?—–-]+|[\s"'“”‘’*_()[\]{}<>«»,.;:!?—–-]+$/gu;

function clean(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

function same(a, b) {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

function wordsOf(text) {
  return clean(text).split(' ').map(w => w.replace(EDGE_PUNCT, '')).filter(Boolean);
}

function isCapitalised(word) {
  return /^\p{Lu}/u.test(word);
}

/**
 * The name a run of words holds: its longest run of capitalised words, with
 * the lower-case connectors a name may have between them, and the words
 * before that run. Empty when it holds none.
 *
 * @param {string[]} words
 * @returns {{ name: string, before: string[] }}
 */
function nameIn(words) {
  let best = { start: -1, end: -1 };
  for (let i = 0; i < words.length; i += 1) {
    if (!isCapitalised(words[i])) continue;
    let end = i;
    let j = i + 1;
    while (j < words.length) {
      if (isCapitalised(words[j])) { end = j; j += 1; continue; }
      if (NAME_CONNECTORS.has(words[j].toLowerCase()) && j + 1 < words.length && isCapitalised(words[j + 1])) { j += 1; continue; }
      break;
    }
    if (end - i > best.end - best.start) best = { start: i, end };
    i = end;
  }
  if (best.start < 0) return { name: '', before: words };
  return { name: words.slice(best.start, best.end + 1).join(' '), before: words.slice(0, best.start) };
}

/**
 * The name one fact gives and another corrects, when the two say the same
 * thing but for a name, and say it as a name — "is named the Ashen Wake" and
 * "is named the Cinder Wren" → { from: "Ashen Wake", to: "Cinder Wren" }. A
 * correction of where, who or what with a name in it ("docked at Bleakhold" →
 * "docked at Vigil Reach") is no rename and returns null: the words before
 * the name must say it is one ("named", "called", "known as", "goes by"…).
 * Pure.
 *
 * @param {string} oldFact
 * @param {string} newFact
 * @returns {{ from: string, to: string }|null}
 */
export function nameSwapOf(oldFact, newFact) {
  const a = wordsOf(oldFact);
  const b = wordsOf(newFact);
  if (!a.length || !b.length) return null;
  let p = 0;
  while (p < a.length && p < b.length && same(a[p], b[p])) p += 1;
  let s = 0;
  while (s < a.length - p && s < b.length - p && same(a[a.length - 1 - s], b[b.length - 1 - s])) s += 1;
  const oldMid = nameIn(a.slice(p, a.length - s));
  const newMid = nameIn(b.slice(p, b.length - s));
  if (!oldMid.name || !newMid.name || same(oldMid.name, newMid.name)) return null;
  // A name and a longer or shorter form of it ("Tamsin", "Tamsin Vey") are one name.
  const has = (outer, inner) => {
    const w = new Set(wordsOf(outer).map(x => x.toLowerCase()));
    return wordsOf(inner).every(x => w.has(x.toLowerCase()));
  };
  if (has(oldMid.name, newMid.name) || has(newMid.name, oldMid.name)) return null;
  const lead = (mid) => [...a.slice(0, p), ...mid.before].join(' ');
  if (!NAMING.test(lead(oldMid)) || !NAMING.test([...b.slice(0, p), ...newMid.before].join(' '))) return null;
  return { from: oldMid.name, to: newMid.name };
}

/**
 * The name a table's `!truth` correction changes, or null. A name is
 * corrected in two commands as often as in one Replace — the long haul's
 * player struck "raider cutter — is named the Ashen Wake" and set "raider
 * cutter — is named the Cinder Wren" — so each command is read against the
 * other half on the same subject: a set against the strikes standing on its
 * subject (this scene's, and those an earlier scene of this session kept), a
 * strike against the truths still standing on its subject. The X-Card's
 * removals and an upgrade's superseded facts are no correction of the
 * table's. Pure.
 *
 * @param {Object} campaignState — the command's working copy, after it ran
 * @param {Object} args
 * @param {Object} args.subject — the resolved subject
 * @param {string} args.fact — the fact the command set, or struck
 * @param {boolean} [args.struck] — true for a strike
 * @param {string|null} [args.truthId] — the truth the command wrote or struck (not its own other half)
 * @param {string|null} [args.about] — what the subject is, as the note says it
 * @returns {Object|null} a change for recordNameChange / withNameChange
 */
export function nameCorrectionOf(campaignState, { subject, fact, struck = false, truthId = null, about = null } = {}) {
  const key = subjectKey(subject);
  if (!key || !clean(fact)) return null;
  const truths = Array.isArray(campaignState?.sceneTruths) ? campaignState.sceneTruths : [];
  const onSubject = (t) => t && t.id !== truthId && subjectKey(t.subject) === key && clean(t.fact);
  let pairs;
  if (struck) {
    pairs = truths.filter(t => onSubject(t) && !t.retracted).map(t => [fact, t.fact]);
  } else {
    const bare = truths.filter(t => onSubject(t) && t.retracted && !t.correctedTo
      && t.retractedBy !== XCARD_RETRACTED_BY && t.retractedBy !== SUPERSEDED_RETRACTED_BY);
    const sessionId = campaignState?.currentSessionId ?? null;
    const kept = (sessionId && campaignState?.sessionRetractions?.sessionId === sessionId)
      ? (campaignState.sessionRetractions.facts ?? []).filter(f => f?.subjectKey === key && clean(f.fact))
      : [];
    pairs = [...bare, ...kept].map(t => [t.fact, fact]);
  }
  for (const [was, now] of pairs) {
    const swap = nameSwapOf(was, now);
    if (swap) return { ...swap, kind: 'corrected', about: clean(about) || null };
  }
  return null;
}

/**
 * A change as it is stored, or null when it is none: two names, different
 * once spaces and case are set aside.
 *
 * @param {Object} change — { from, to, kind?, about?, entityId?, sessionId?, at? }
 * @returns {Object|null}
 */
export function normaliseNameChange(change) {
  const from = clean(change?.from);
  const to   = clean(change?.to);
  if (!from || !to || same(from, to)) return null;
  return {
    from,
    to,
    kind:      KINDS.has(change?.kind) ? change.kind : 'renamed',
    about:     clean(change?.about) || null,
    entityId:  typeof change?.entityId === 'string' && change.entityId ? change.entityId : null,
    sessionId: typeof change?.sessionId === 'string' && change.sessionId ? change.sessionId : null,
    at:        Number.isFinite(change?.at) ? change.at : Date.now(),
  };
}

/**
 * The stored list with one more change, newest last. A name changed again
 * carries its earlier names with it (A → B then B → C: A is now C as well); a
 * change that undoes one (B back to A) drops the one it undoes; a name changed
 * twice keeps its newest. Pure.
 *
 * @param {Array} list — campaignState.nameChanges
 * @param {Object} change
 * @param {{ cap?: number }} [opts] — how many are kept, the newest: the stored
 *   list's cap; `Infinity` for the session record's fold of every change the
 *   campaign made (record/read.js)
 * @returns {Array}
 */
export function withNameChange(list, change, { cap = NAME_CHANGES_CAP } = {}) {
  const c = normaliseNameChange(change);
  const kept = (Array.isArray(list) ? list : []).filter(e => normaliseNameChange(e));
  if (!c) return kept;
  const next = [];
  for (const e of kept) {
    if (same(e.from, c.to) && same(e.to, c.from)) continue;          // undone
    if (same(e.from, c.from)) continue;                               // changed again: the newest stands
    const carried = same(e.to, c.from) ? { ...e, to: c.to } : e;      // A → B, B → C: A is C now
    if (same(carried.from, carried.to)) continue;
    next.push(carried);
  }
  next.push(c);
  return Number.isFinite(cap) ? next.slice(-cap) : next;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A pattern for a name in a text, whole words only: as written, or in any case (`flags` 'giu'). */
function wholeWords(s, flags = 'gu') {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(s)}(?![\\p{L}\\p{N}])`, flags);
}

/**
 * Where the names as they stand now are written in a text — each one's
 * spans, whole words, in any case ("Tamsin Okoro", "Tamsin okoro"). Pure.
 *
 * @param {string} text
 * @param {string[]} names
 * @returns {Array<[number, number]>}
 */
function spansOfNames(text, names) {
  const spans = [];
  const lower = text.toLowerCase();
  for (const name of new Set(names.map(clean).filter(Boolean))) {
    if (!lower.includes(name.toLowerCase())) continue;
    for (const m of text.matchAll(wholeWords(name, 'giu'))) spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

/**
 * Whether [from, to) of a text is written inside one of those names, longer
 * than it — so part of that name: "Tamsin" in "Tamsin Okoro", "Vey" in
 * "Vey's Lantern" (known-issues NEW-NAME-WRITTEN-TWICE).
 */
function insideName(spans, from, to) {
  return spans.some(([a, b]) => a <= from && to <= b && b - a > to - from);
}

/** The part of an old name its new name does not share ("Tamsin Vey" → "Tamsin Okoro": "Vey"), or ''. */
function distinctivePart(from, to) {
  const shared = new Set(wordsOf(to).map(w => w.toLowerCase()));
  const words = wordsOf(from);
  const own = words.filter(w => !shared.has(w.toLowerCase()));
  if (!own.length || own.length === words.length) return '';
  const part = own.join(' ');
  // Only a part that stands in the name as one run, and is a name's word.
  if (!clean(from).includes(part) || part.length < 3 || !isCapitalised(part)) return '';
  return part;
}

/**
 * Whether a text holds a change's old name whole, or the part the new name
 * does not share, as written — not inside its new name or another name as it
 * stands now (`current`): a text that writes "Tamsin Okoro" holds no
 * "Tamsin" of Tamsin → Tamsin Okoro.
 */
function holdsOldName(text, change, current = []) {
  const forms = [clean(change?.from), distinctivePart(change?.from, change?.to)].filter(Boolean);
  return forms.some((form) => {
    const hits = [...text.matchAll(wholeWords(form))];
    if (!hits.length) return false;
    const standing = spansOfNames(text, [change?.to ?? '', ...current]);
    return hits.some(m => !insideName(standing, m.index, m.index + m[0].length));
  });
}

/**
 * Words that stand before a name without being part of it, capitalised or
 * not: a sentence's opening word ("The Wake's guns", "Then Vey laughs") and a
 * title ("Captain Vey"). Any other capitalised word beside a name's word makes
 * the two one name ("Juro Vey", "Silent Wake").
 */
const LEAD_WORDS = new Set([
  'the', 'a', 'an', 'and', 'but', 'or', 'so', 'yet', 'then', 'when', 'while', 'if', 'as', 'at', 'in', 'on', 'to',
  'for', 'from', 'with', 'without', 'by', 'of', 'off', 'into', 'onto', 'over', 'under', 'behind', 'before', 'after',
  'beyond', 'beside', 'between', 'across', 'against', 'aboard', 'above', 'below', 'near', 'past', 'through',
  'toward', 'towards', 'inside', 'outside', 'until', 'since', 'once', 'now', 'here', 'there', 'where', 'that',
  'this', 'not', 'only', 'even', 'still', 'both', 'her', 'his', 'their', 'its', 'your', 'my', 'our',
  'captain', 'commander', 'doctor', 'dr', 'mr', 'mrs', 'ms', 'miss', 'sir', 'lady', 'lord', 'madam', 'chief',
  'officer', 'lieutenant', 'sergeant', 'admiral', 'governor', 'brother', 'sister', 'father', 'mother', 'elder', 'master',
]);

// The word right before, and right after, a name's word in its sentence:
// spaces between them, and the marks a name is set off with ("the *Wake*").
const WORD_BEFORE = /([\p{L}\p{N}][\p{L}\p{N}'’-]*)[ \t]+[*_"“‘]*$/u;
const WORD_AFTER  = /^[*_"”’]*[ \t]+[*_"“‘]*([\p{L}\p{N}][\p{L}\p{N}'’-]*)/u;

/** A name's words that can stand for it alone: capitalised, three letters or more, no connector. */
function nameWordsOf(name) {
  return wordsOf(name).filter(w => isCapitalised(w) && w.length >= 3 && !NAME_CONNECTORS.has(w.toLowerCase()));
}

/** A name's own words, lower-cased, its connectors aside ("The Wake of Ashes": wake, ashes). */
const ownWordsOf = (name) => new Set(wordsOf(name).map(w => w.toLowerCase()).filter(w => !NAME_CONNECTORS.has(w)));

/**
 * How the texts use one word of a name, as written (a name's capital, whole
 * words): `alone` — as a name by itself, a word before it in its sentence
 * ("the Wake's guns", "calls me Vey", "Captain Vey"), `article` of those after
 * "the"; `other` — beside another capitalised word, so part of another name
 * ("Juro Vey", "Silent Wake", "Wake Station"), or written inside a name as it
 * stands now (`current`: "Vey" in "Vey's Lantern"). A use inside the name it is a
 * word of — written whole, or beside another of its words — and one with
 * nothing before it — its capital may only open the sentence ("Wake up.") —
 * count as neither. Pure.
 *
 * @param {string[]} texts
 * @param {string} word
 * @param {string} name — the name it is a word of
 * @param {string[]} [current] — the names as they stand now (the changes' new names)
 * @returns {{ alone: number, other: number, article: number }}
 */
function usesOfNameWord(texts, word, name, current = []) {
  const uses = { alone: 0, other: 0, article: 0 };
  const asWord = (s) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(s)}(?![\\p{L}\\p{N}])`, 'gu');
  const own = ownWordsOf(name);
  for (const text of texts) {
    const hits = [...text.matchAll(asWord(word))];
    if (!hits.length) continue;
    const whole = [...text.matchAll(asWord(clean(name)))].map(m => [m.index, m.index + m[0].length]);
    const standing = current.length ? spansOfNames(text, current) : [];
    for (const m of hits) {
      if (whole.some(([from, to]) => m.index >= from && m.index < to)) continue;                       // the name itself
      if (insideName(standing, m.index, m.index + m[0].length)) { uses.other += 1; continue; }          // another name, as it stands
      const prev = WORD_BEFORE.exec(text.slice(Math.max(0, m.index - 64), m.index))?.[1] ?? null;
      const next = WORD_AFTER.exec(text.slice(m.index + word.length, m.index + word.length + 64))?.[1] ?? null;
      if ((prev && own.has(prev.toLowerCase())) || (next && own.has(next.toLowerCase()))) continue;   // …or its words, otherwise arranged
      if (next && isCapitalised(next) && !/^I(?:['’]|$)/u.test(next)) { uses.other += 1; continue; }
      if (!prev) continue;
      if (isCapitalised(prev) && !LEAD_WORDS.has(prev.toLowerCase())) { uses.other += 1; continue; }
      uses.alone += 1;
      if (prev.toLowerCase() === 'the') uses.article += 1;
    }
  }
  return uses;
}

/**
 * The short forms of a change's old name that the texts use on their own, and
 * what to write for each: "the Wake" → "the Wren" for "Ashen Wake" → "Cinder
 * Wren", "Vey" → "Okoro" for "Tamsin Vey" → "Tamsin Okoro" (known-issues
 * CORRECTED-NAME-SHORT-FORM). A short form is one word of the old name. Never
 * a word the new name keeps ("Tamsin"), a word of another name the table
 * changed, or one the texts also use inside another name ("Juro Vey") — that
 * word is not this name's alone. What is written for it is the new name's
 * word in the same place (its first for a first, its last for a last) when
 * that word is the new name's alone too, else the new name whole. Pure.
 *
 * @param {Object} change — normalised
 * @param {string[]} texts — what the call sends
 * @param {Array} [changes] — every stored change, normalised: the other names in play
 * @param {string[]} [current] — the names as they stand now: a word written
 *   inside one of them is part of that name ("Vey" in "Vey's Lantern")
 * @param {string[]} [context] — the rest of the call (a user message's system
 *   prompt): a form it never makes, but a word it uses inside another name is
 *   not this name's alone
 * @returns {Array<{ old: string, write: string }>}
 */
function shortFormsInUse(change, texts, changes = [], current = changes.map(o => o.to), context = []) {
  const oldWords = nameWordsOf(change.from);
  if (oldWords.length < 2 || !texts.length) return [];
  const ownOld = ownWordsOf(change.from);
  const ownNew = ownWordsOf(change.to);
  const others = new Set();
  for (const o of changes) {
    if (same(o.to, change.to)) continue;   // this name, or an earlier name of the same thing
    for (const w of [...ownWordsOf(o.from), ...ownWordsOf(o.to)]) others.add(w);
  }
  const newWords = nameWordsOf(change.to);
  const forms = [];
  for (const word of new Set(oldWords)) {
    const lower = word.toLowerCase();
    if (ownNew.has(lower) || others.has(lower)) continue;
    const uses = usesOfNameWord(texts, word, change.from, current);
    if (!uses.alone || uses.other) continue;
    if (context.length && usesOfNameWord(context, word, change.from, current).other) continue;
    const twin = newWords.length < 2 ? null
      : word === oldWords.at(-1) ? newWords.at(-1)
        : word === oldWords[0] ? newWords[0]
          : null;
    const twinIsOwn = !!twin && !ownOld.has(twin.toLowerCase()) && !others.has(twin.toLowerCase())
      && !usesOfNameWord([...texts, ...context], twin, change.to, current).other;
    const article = uses.article * 2 >= uses.alone;
    const write = twinIsOwn ? twin : change.to;
    forms.push({
      old:   article ? `the ${word}` : word,
      write: article && !/^the\s/i.test(write) ? `the ${write}` : write,
    });
  }
  return forms;
}

/**
 * Whether a text names a change's old name — whole, by the part the new name
 * does not share, or cut short to one word of it on its own ("the Wake") — as
 * a name: matched as written (a name's capitals), whole words only. An old
 * name written inside its new one, or inside another name as it stands now,
 * is that name: "Tamsin Okoro" names no "Tamsin" (known-issues
 * NEW-NAME-WRITTEN-TWICE — the change was told wherever its new name was
 * written). Pure.
 *
 * @param {string} text
 * @param {Object} change
 * @param {{ current?: string[] }} [opts] — the other names as they stand now (the stored changes' new names)
 * @returns {boolean}
 */
export function mentionsOldName(text, change, { current = [] } = {}) {
  const t = typeof text === 'string' ? text : '';
  if (!t) return false;
  if (holdsOldName(t, change, current)) return true;
  const c = normaliseNameChange(change);
  return !!c && shortFormsInUse(c, [t], [c], [c.to, ...current]).length > 0;
}

/**
 * A text with each changed name written as its new one — what a view of the
 * session record shows (record/read.js; issue #382, decision D5). The stored
 * text is not changed: nothing in a store is rewritten (decisions.md, "A
 * correction of a name"). Three forms of an old name are written anew, each
 * where it stands as a name, as written (a name's capitals), whole words only:
 *   - the whole name ("Ashen Wake" → "Cinder Wren");
 *   - the part the new name does not share, as that part of the new name
 *     ("Vey" → "Okoro" for Tamsin Vey → Tamsin Okoro);
 *   - its short form — the last capitalised word of a name of several words —
 *     when it follows "the" or carries "'s", does not open its sentence, is
 *     not part of another name beside it ("Silent Wake", "Wake Station") and
 *     is a word of no other name in play: the new name whole ("the Wake's
 *     registry" → "the Cinder Wren's registry").
 * None is written where it already stands inside a name as it is now — its
 * own new name, another change's, another record's (`otherNames`), in any
 * case: "Tamsin" in "Tamsin Okoro" is the new name, and for Tamsin → Tamsin
 * Okoro "tied the vow to Tamsin Okoro" read "… Tamsin Okoro Okoro" on the
 * Session Log pages and in the recap (known-issues NEW-NAME-WRITTEN-TWICE).
 * Every form is found in the text as stored and each place written once —
 * the longest form first, so "Tamsin Vey" is written whole before its
 * "Tamsin" — never in what another change wrote there.
 * Pure.
 *
 * @param {string} text
 * @param {Array} changes — the changes in play, folded (withNameChange)
 * @param {{ otherNames?: string[] }} [opts] — the other names in play (the
 *   records' current names): a word of one of them is never a short form
 * @returns {string}
 */
export function writeNewNames(text, changes, { otherNames = [] } = {}) {
  const src = typeof text === 'string' ? text : '';
  const all = (Array.isArray(changes) ? changes : []).map(normaliseNameChange).filter(Boolean);
  if (!src || !all.length) return src;
  const others = Array.isArray(otherNames) ? otherNames : [];
  const standing = spansOfNames(src, [...all.map(c => c.to), ...others]);
  const edits = [];
  const edit = (from, to, write) => {
    if (!insideName(standing, from, to)) edits.push({ from, to, write, order: edits.length });
  };
  for (const c of all) {
    for (const m of src.matchAll(wholeWords(c.from))) edit(m.index, m.index + m[0].length, c.to);
    const part = distinctivePart(c.from, c.to);
    if (part) {
      const write = distinctivePart(c.to, c.from) || c.to;
      for (const m of src.matchAll(wholeWords(part))) edit(m.index, m.index + m[0].length, write);
    }
    for (const s of shortFormEdits(src, c, all, others)) edit(s.from, s.to, s.write);
  }
  edits.sort((x, y) => (y.to - y.from) - (x.to - x.from) || x.order - y.order);
  const kept = [];
  for (const e of edits) if (!kept.some(k => e.from < k.to && k.from < e.to)) kept.push(e);
  kept.sort((x, y) => x.from - y.from);
  let out = '';
  let at = 0;
  for (const e of kept) {
    out += src.slice(at, e.from) + e.write;
    at = e.to;
  }
  return out + src.slice(at);
}

/**
 * Where a text cuts a change's old name short, and what is written there
 * (writeNewNames' third form): the last capitalised word of an old name of
 * several, after "the" or before "'s", not opening its sentence, not beside
 * another capitalised word or one of its own name's, and a word of neither
 * the new name nor another name in play. Pure.
 *
 * @param {string} text
 * @param {Object} c — the change, normalised
 * @param {Array} all — every change in play, normalised
 * @param {string[]} otherNames
 * @returns {Array<{ from: number, to: number, write: string }>}
 */
function shortFormEdits(text, c, all, otherNames) {
  const words = nameWordsOf(c.from);
  const last = words.length >= 2 ? words.at(-1) : null;
  if (!last || ownWordsOf(c.to).has(last.toLowerCase())) return [];
  const lower = last.toLowerCase();
  const taken = [...otherNames, ...all.filter(o => !same(o.to, c.to)).flatMap(o => [o.from, o.to])]
    .filter(n => !same(n, c.from) && !same(n, c.to))
    .some(n => ownWordsOf(n).has(lower));
  if (taken) return [];
  const own = ownWordsOf(c.from);
  const bare = c.to.replace(/^the\s+/i, '');
  const out = [];
  for (const m of text.matchAll(wholeWords(last))) {
    const at = m.index;
    const prev = WORD_BEFORE.exec(text.slice(Math.max(0, at - 64), at))?.[1] ?? null;
    const rest = text.slice(at + last.length, at + last.length + 64);
    const next = WORD_AFTER.exec(rest)?.[1] ?? null;
    if (!prev) continue;                                                     // opens its sentence
    if (own.has(prev.toLowerCase()) || (next && own.has(next.toLowerCase()))) continue;
    if (next && isCapitalised(next) && !/^I(?:['’]|$)/u.test(next)) continue; // part of another name
    if (isCapitalised(prev) && !LEAD_WORDS.has(prev.toLowerCase())) continue;
    const article = prev.toLowerCase() === 'the';
    const possessive = /^['’]s(?![\p{L}\p{N}])/u.test(rest);
    if (!article && !possessive) continue;
    out.push({ from: at, to: at + last.length, write: article ? bare : c.to });
  }
  return out;
}

/** The texts a call sends, as given: the non-empty strings. */
function sourcesOf(texts) {
  return (Array.isArray(texts) ? texts : [texts]).filter(t => typeof t === 'string' && t);
}

/**
 * The changes a call is told: each made this session, and each whose old name
 * — whole, in part or cut short — is in a text the call sends. Pure.
 *
 * @param {Array} changes — campaignState.nameChanges
 * @param {{ texts?: string[], sessionId?: string|null }} [opts]
 * @returns {Array}
 */
export function dueNameChanges(changes, { texts = [], sessionId = null } = {}) {
  const sources = sourcesOf(texts);
  const all = (Array.isArray(changes) ? changes : []).map(normaliseNameChange).filter(Boolean);
  // The names as they stand now: an old name inside one of them is no mention of it.
  const current = all.map(c => c.to);
  return all.filter(c => (sessionId && c.sessionId === sessionId) || sources.some(t => mentionsOldName(t, c, { current })));
}

/** A change's line in a note, up to its short forms: `- "Ashen Wake" is now "Cinder Wren"`. */
const lineHead = (c) => `- "${c.from}" is now "${c.to}"`;

/**
 * Whether a note the call already carries (`told`) has a change's line,
 * naming each short form in `forms` — so the change is told there.
 */
function toldIn(told, c, forms) {
  const at = told.indexOf(lineHead(c));
  if (at < 0) return false;
  const end = told.indexOf('\n', at);
  const line = end < 0 ? told.slice(at) : told.slice(at, end);
  return forms.every(f => line.includes(`for "${f.old}" write "`));
}

/**
 * A note's lines: one for each change due, with the short forms of its old
 * name the call's texts use — read over all of them together, beside every
 * stored change, so a word another name holds anywhere in the call is not
 * listed. '' when no change is due.
 *
 * `context` is the rest of the call — a user message's system prompt: read
 * for the names it holds, never for a change it makes due. `told` is a note
 * the call carries already: a change whose line it holds, naming every short
 * form this line would name, is left out — a user message is told what its
 * system prompt's note does not (known-issues NAME-NOTE-MISSES-THE-USER-MESSAGE).
 *
 * @param {Array} changes — campaignState.nameChanges
 * @param {{ texts?: string[], sessionId?: string|null, context?: string[], told?: string }} [opts]
 * @returns {string}
 */
function changeLines(changes, opts = {}) {
  const due = dueNameChanges(changes, opts);
  if (!due.length) return '';
  const sources = sourcesOf(opts.texts ?? []);
  const around = sourcesOf(opts.context ?? []);
  const told = typeof opts.told === 'string' ? opts.told : '';
  const all = (Array.isArray(changes) ? changes : []).map(normaliseNameChange).filter(Boolean);
  return due.map((c) => {
    const how = c.kind === 'corrected' ? 'corrected by the table' : 'renamed by the table';
    // The old name as the call's own text cuts it short, and what to write for it.
    const forms = shortFormsInUse(c, sources, all, all.map(o => o.to), around);
    if (told && toldIn(told, c, forms)) return '';
    const short = forms.length
      ? ` The old name cut short is the old name too: ${forms.map(f => `for "${f.old}" write "${f.write}"`).join('; ')}.`
      : '';
    return `${lineHead(c)}${c.about ? ` (${c.about})` : ''} — ${how}.${short}`;
  }).filter(Boolean).join('\n');
}

/**
 * The narrator's note (its context, every mode, and a call's user message
 * for what its own text calls for that the system prompt's note does not
 * tell): the changes due, each with the short forms of its old name the texts
 * use, or ''.
 *
 * @param {Array} changes
 * @param {{ texts?: string[], sessionId?: string|null, context?: string[], told?: string }} [opts] —
 *   `context`, `told`: the rest of the call and the note it carries (changeLines)
 * @returns {string}
 */
export function formatNameChangesBlock(changes, opts = {}) {
  const lines = changeLines(changes, opts);
  if (!lines) return '';
  return `${NAME_CHANGES_HEADING}\n\n` +
    `Each of these is one person, place or ship with one name. Older lines in this prompt ` +
    `(earlier sessions, lore, plans, clocks, truths, the recent scene) may still use the old name: ` +
    `read it as the new one, and write only the new one. The old name is not an alias, a nickname, ` +
    `a former name or something people call them — never say or suggest that it is. ` +
    // The long haul's second live run (issue #377 item 1): told the old name was
    // no alias, the narrator made the change itself a story — a name "crossed
    // out and written again", which a voice then asked about for a session and
    // the recap recorded ("your friend now goes by Tamsin Okoro").
    `The change is the table's correction, not something that happened in the story: in the ` +
    `fiction the new name has always been the name — nobody renamed anyone, crossed a name out ` +
    `or wrote it again, and no character remembers it otherwise.\n\n` +
    lines;
}

/**
 * Put a changed name on the session record (issue #382) — called by each
 * writer of `campaignState.nameChanges` once its write has landed, so every
 * view of the record writes the new name: the stored list is capped and tells
 * the narrator; the record keeps every change the campaign made. A change the
 * store does not hold (its write was refused, or its scene changed) is not
 * recorded. tests/unit/sessionRecordEvents.test.js fails on a `withNameChange`
 * writer that does not call this.
 *
 * @param {Object} change — { from, to, kind?, about?, entityId? }
 * @returns {boolean} whether it was recorded
 */
export function recordNameChanged(change) {
  const c = normaliseNameChange(change);
  if (!c) return false;
  let stored = [];
  try { stored = globalThis.game?.settings?.get?.(MODULE_ID, 'campaignState')?.nameChanges ?? []; } catch { stored = []; }
  if (!(Array.isArray(stored) ? stored : []).some(e => same(e?.from, c.from) && same(e?.to, c.to))) return false;
  return recordEvent('name.changed', {
    ref: { entity: c.entityId },
    d: { from: c.from, to: c.to, how: c.kind, about: c.about },
  });
}

/**
 * Record a change on the stored campaignState, on this client's write chain —
 * the canonical GM's, which every caller already is (the sidebar's rename sync,
 * `!truth` on its relay). Never throws.
 *
 * @param {Object} change — { from, to, kind, about?, entityId?, sessionId? }
 * @param {string} [label]
 * @returns {Promise<boolean>} whether a change was written
 */
export async function recordNameChange(change, label = 'name change') {
  if (!normaliseNameChange(change)) return false;
  if (!globalThis.game?.settings?.set || !globalThis.game?.user?.isGM) return false;
  try {
    let written = false;
    await serialiseCampaignStateWrite(() => {
      const latest = globalThis.game.settings.get(MODULE_ID, 'campaignState') ?? {};
      const cs = { ...latest };
      cs.nameChanges = withNameChange(latest.nameChanges,
        { ...change, sessionId: change.sessionId ?? latest.currentSessionId ?? null });
      written = true;
      return globalThis.game.settings.set(MODULE_ID, 'campaignState', cs);
    }, label);
    if (written) recordNameChanged(change);
    return written;
  } catch (err) {
    console.warn(`${MODULE_ID} | recording the name change "${change?.from}" → "${change?.to}" failed:`, err?.message ?? err);
    return false;
  }
}
