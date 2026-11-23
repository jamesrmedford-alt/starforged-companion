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
 * Not recorded: a placeholder figure's identity revealed by a narration
 * (entityExtractor.js applyEntityRenames — the narrator named them itself,
 * and the rename is the X-Card's to take back) and that take-back. Both write
 * the card's record before its name, so the sidebar's rename sync, which
 * records a GM's rename, sees nothing to follow.
 */

import { serialiseCampaignStateWrite } from '../multiplayer/campaignStateChain.js';
import { subjectKey, XCARD_RETRACTED_BY, SUPERSEDED_RETRACTED_BY } from './ledgers.js';

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
 * @returns {Array}
 */
export function withNameChange(list, change) {
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
  return next.slice(-NAME_CHANGES_CAP);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
 * Whether a text names a change's old name — whole, or by the part the new
 * name does not share — as a name: matched as written (a name's capitals),
 * whole words only. Pure.
 *
 * @param {string} text
 * @param {Object} change
 * @returns {boolean}
 */
export function mentionsOldName(text, change) {
  const t = typeof text === 'string' ? text : '';
  if (!t) return false;
  const forms = [clean(change?.from), distinctivePart(change?.from, change?.to)].filter(Boolean);
  return forms.some(f => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(f)}(?![\\p{L}\\p{N}])`, 'u').test(t));
}

/**
 * The changes a call is told: each made this session, and each whose old name
 * is in a text the call sends. Pure.
 *
 * @param {Array} changes — campaignState.nameChanges
 * @param {{ texts?: string[], sessionId?: string|null }} [opts]
 * @returns {Array}
 */
export function dueNameChanges(changes, { texts = [], sessionId = null } = {}) {
  const sources = (Array.isArray(texts) ? texts : [texts]).filter(t => typeof t === 'string' && t);
  return (Array.isArray(changes) ? changes : [])
    .map(normaliseNameChange)
    .filter(Boolean)
    .filter(c => (sessionId && c.sessionId === sessionId) || sources.some(t => mentionsOldName(t, c)));
}

function changeLine(c) {
  const how = c.kind === 'corrected' ? 'corrected by the table' : 'renamed by the table';
  return `- "${c.from}" is now "${c.to}"${c.about ? ` (${c.about})` : ''} — ${how}.`;
}

/**
 * The narrator's note (its context, every mode): the changes due, or ''.
 *
 * @param {Array} changes
 * @param {{ texts?: string[], sessionId?: string|null }} [opts]
 * @returns {string}
 */
export function formatNameChangesBlock(changes, opts = {}) {
  const due = dueNameChanges(changes, opts);
  if (!due.length) return '';
  return `${NAME_CHANGES_HEADING}\n\n` +
    `Each of these is one person, place or ship with one name. Older lines in this prompt ` +
    `(earlier sessions, lore, plans, clocks, truths, the recent scene) may still use the old name: ` +
    `read it as the new one, and write only the new one. The old name is not an alias, a nickname, ` +
    `a former name or something people call them — never say or suggest that it is.\n\n` +
    due.map(changeLine).join('\n');
}

/**
 * The same note for a helper that writes from the session's prose (the session
 * summary): the changes due, or ''.
 *
 * @param {Array} changes
 * @param {{ texts?: string[], sessionId?: string|null }} [opts]
 * @returns {string}
 */
export function formatNameChangesForSource(changes, opts = {}) {
  const due = dueNameChanges(changes, opts);
  if (!due.length) return '';
  return `## NAMES THE TABLE CHANGED — one name each\n\n` +
    `Where the narration above uses an old name, it means the new one. Write only the new name; ` +
    `the old one is not an alias or another name they go by.\n\n` +
    due.map(changeLine).join('\n');
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
    return written;
  } catch (err) {
    console.warn(`${MODULE_ID} | recording the name change "${change?.from}" → "${change?.to}" failed:`, err?.message ?? err);
    return false;
  }
}
