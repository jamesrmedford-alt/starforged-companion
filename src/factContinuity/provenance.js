/**
 * STARFORGED COMPANION
 * src/factContinuity/provenance.js — where a scene's question comes from, and
 * what play let go (overhaul 2, "scenes that begin and end, and facts that
 * know where they came from"; slice 1)
 *
 * The long haul's fourth live run (known-issues REFRAIN-OUTLIVES-THE-QUESTION):
 * session 3 held "the second hail light" in 15 of its 17 narrations of play.
 * Each time play left the scene's question unanswered for SCENE_QUESTION_BEATS
 * beats it was released — and the very next fact block set it again in other
 * words, from the narrator's own hook: "Will Mira answer the second hail
 * before the pilot's offer lapses?", "Which channel will Mira answer?", "Who
 * will answer the second hail light?", "Who is on the second hail channel?".
 * The count restarted on every new wording, and "do not bring it back" was
 * advice.
 *
 * Two rules, in code, over the beat's own words — the floor a plan's reveal is
 * checked by (world/tellingWords.js `tellingStems`, the same words stemmed the
 * same way):
 *
 *   - **The question is the player's** (`playersQuestion`): set only on a beat
 *     with the player's words, and only when it shares a telling word with
 *     them — a name is no evidence (the player names whom they talk to). A
 *     beat no line prompted sets none.
 *   - **A lapsed question stays lapsed**: released, it goes onto the frame's
 *     `letGo` list (`letGoEntry`, at most LET_GO_MAX, the newest kept). A later
 *     question sharing one of its stems that the beat's player words do not
 *     hold is that question again, and is not set; nor is a Now line that
 *     carries it (`touchesLetGo`).
 *
 * The ground a narration is checked against is its caller's (`groundOf`): the
 * player's line for a move, a paced line, a round's lines, the question typed
 * to an oracle. Pure; no Foundry access.
 */

import { tellingStems } from '../world/tellingWords.js';

/** How many let-go questions a scene's frame keeps, the newest first to stay. */
const LET_GO_MAX = 4;

/** The longest ground a narration is checked against (a typed line, a round's few). */
const GROUND_MAX_CHARS = 4000;

/** The longest let-go text kept (a question, as the sidecar parser bounds one). */
const LET_GO_TEXT_MAX = 160;

/**
 * The modes whose fact block may set the scene's question: a beat of play the
 * player's words prompted. A clock vignette, the oath scene, the inciting
 * incident and a session vignette (a bookend) set none (overhaul 2 §7.2).
 */
export const QUESTION_MODES = Object.freeze(new Set([
  'move_resolution', 'paced_narrative', 'round_resolution', 'oracle_followup',
]));

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * The ground a narration's fact block is checked against: the beat's player
 * words. Each narration's caller builds it from what it has — the move's
 * written line, the paced line, a round's lines, the oracle's typed question.
 *
 * @param {{ line?: string, lines?: string[] }} [words]
 * @returns {{ line: string }}
 */
export function groundOf({ line = '', lines = [] } = {}) {
  const all = [line, ...(Array.isArray(lines) ? lines : [])].map(clean).filter(Boolean).join('\n');
  return { line: all.slice(0, GROUND_MAX_CHARS) };
}

/**
 * A ground as it crossed a socket (a relayed fact block): bounded, strings only.
 *
 * @param {unknown} ground
 * @returns {{ line: string }}
 */
export function normaliseGround(ground) {
  const line = ground && typeof ground === 'object' && typeof ground.line === 'string' ? ground.line : '';
  return groundOf({ line });
}

/** The telling stems of `text` that are not the stems of a name it is about. */
function ownStems(text, about) {
  const own = tellingStems(text);
  for (const a of Array.isArray(about) ? about : []) for (const s of tellingStems(a)) own.delete(s);
  return own;
}

/**
 * Whether `text` shares one of its own telling words with `ground`. A text
 * with no telling word of its own shares nothing — unlike a plan's reveal
 * (`proseTellsTruth`), where a truth with no words of its own is taken as
 * told: here the claim is that the table's words said it.
 *
 * @param {string} ground — the beat's player words
 * @param {string} text
 * @param {{ about?: string[] }} [opts] — names that are no evidence
 * @returns {boolean}
 */
function sharesTellingWord(ground, text, { about = [] } = {}) {
  const own = ownStems(text, about);
  if (!own.size) return false;
  const said = tellingStems(ground);
  for (const s of own) if (said.has(s)) return true;
  return false;
}

/**
 * A let-go list as stored on a frame: entries with a text and its stems,
 * bounded. Anything else is dropped.
 *
 * @param {unknown} list
 * @returns {Array<{ text: string, stems: string[] }>}
 */
export function normaliseLetGo(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const e of list) {
    const text = e && typeof e === 'object' && typeof e.text === 'string' ? clean(e.text).slice(0, LET_GO_TEXT_MAX) : '';
    if (!text || out.some(o => o.text === text)) continue;
    const stems = Array.isArray(e.stems) ? e.stems.filter(s => typeof s === 'string' && s) : [];
    out.push({ text, stems: [...new Set(stems)] });
  }
  return out.slice(-LET_GO_MAX);
}

/**
 * The entry a released question leaves on the let-go list: its words, and its
 * own telling stems — the names it is about left out, so a later question
 * that names the same character is not the same question for that alone.
 *
 * @param {string} question
 * @param {{ about?: string[] }} [opts]
 * @returns {{ text: string, stems: string[] }|null}
 */
export function letGoEntry(question, { about = [] } = {}) {
  const text = clean(question).slice(0, LET_GO_TEXT_MAX);
  if (!text) return null;
  return { text, stems: [...ownStems(text, about)] };
}

/**
 * The let-go list with `entry` added — the newest kept, LET_GO_MAX at most,
 * one entry a text.
 *
 * @param {unknown} list
 * @param {{ text: string, stems: string[] }|null} entry
 * @returns {Array<{ text: string, stems: string[] }>}
 */
export function withLetGo(list, entry) {
  const kept = normaliseLetGo(list).filter(e => e.text !== entry?.text);
  return normaliseLetGo(entry ? [...kept, entry] : kept);
}

/**
 * Whether `text` carries a let-go question: it shares a stem of one that the
 * beat's player words do not hold. A line that names the stem takes the hook
 * up, and the text stands.
 *
 * @param {string} text — a question or a Now line
 * @param {string} line — the beat's player words ('' for none)
 * @param {unknown} letGo — the frame's list
 * @returns {boolean}
 */
export function touchesLetGo(text, line, letGo) {
  const list = normaliseLetGo(letGo);
  if (!list.length || !clean(text)) return false;
  const said = tellingStems(line);
  const words = tellingStems(text);
  for (const e of list) {
    for (const s of e.stems) if (!said.has(s) && words.has(s)) return true;
  }
  return false;
}

/**
 * The scene's question as the player's words allow it (overhaul 2 §7.2): the
 * question, or '' when a beat with no player words asks it, when it shares no
 * telling word with them, or when it is a let-go question again.
 *
 * @param {string} question — the fact block's
 * @param {string} line — the beat's player words ('' for none)
 * @param {unknown} letGo — the frame's let-go list
 * @param {{ about?: string[] }} [opts] — the PCs' names, the command vehicle's
 * @returns {string}
 */
export function playersQuestion(question, line, letGo, { about = [] } = {}) {
  const q = clean(question);
  if (!q || !clean(line)) return '';
  if (!sharesTellingWord(line, q, { about })) return '';
  if (touchesLetGo(q, line, letGo)) return '';
  return q;
}
