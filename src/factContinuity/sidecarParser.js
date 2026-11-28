/**
 * STARFORGED COMPANION
 * src/factContinuity/sidecarParser.js
 *
 * Extracts the structured sidecar JSON block from narrator output.
 * See issue #227 (Fact Continuity) §7.
 *
 * The narrator is instructed to emit prose followed by a single fenced JSON
 * block of shape:
 *
 *   ```json
 *   {
 *     "newTruths":     [{ "subject": "Vance", "fact": "Walks with a limp" }],
 *     "stateChanges":  [{ "subject": "scene", "attribute": "lighting", "value": "dim" }]
 *   }
 *   ```
 *
 * extractSidecar() returns { prose, sidecar, parseError } where:
 *   - prose      — the input with the fenced block stripped (no trailing whitespace
 *                  beyond a single newline). When no block is present, the input
 *                  is returned unchanged.
 *   - sidecar    — parsed object with `newTruths` and `stateChanges` arrays,
 *                  or null when absent / malformed.
 *   - parseError — Error when a block was present but JSON.parse failed.
 *
 * The sidecar's fence is recognised however the model tags it: ```json (the
 * instructed form), "``` json", or a bare ``` whose body is a JSON object
 * (issue #321 U41 — a bare fence used to post the raw JSON on the card and
 * drop the turn's facts). Raw sidecar JSON never reaches the prose — nor
 * does one written with no fence at all, after the prose on its own line
 * (SIDECAR-UNFENCED).
 *
 * This module is pure — no I/O, no globals.
 *
 * The narrative skeleton's keys (issue #353): `plans` (the narrator's decision
 * of what is true about a subject it was asked to decide, or a correction
 * where its prose contradicted one), `openQuestions` (a question the prose
 * poses that the characters are meant to answer) and `reveals` (what this
 * beat showed of a plan — a clue, the truth, an escalation step played, an
 * ending — Phase 2), `countdown` (a countdown the prose started, made a
 * tension clock — Phase 3) and `newThreats` (an enemy or danger the prose
 * introduced, given a hidden plan — issue #354 P2-29). Normalised and bounded by
 * src/world/skeletons.js, and applied on the canonical GM by
 * src/world/secrets.js applyPlanSideData.
 *
 * A session set-piece's key (issue #381): `builtFrom`, the narration's account
 * of its rolled material — which words of its prose are each numbered result
 * (session/sceneSeeds.js formatMaterial asks for it, the session_vignette
 * mode's addendum says how). Normalised here (normaliseBuiltFrom) and read by
 * narrator.js applyNarratorSidecar, which marks the scene's seeds with it.
 */

import { normalisePlans, normaliseOpenQuestions, normaliseReveals, normaliseCountdown, normaliseNewThreats } from '../world/skeletons.js';
import { splitPronounMark, normalisePronounList, pronounsFor } from './pronouns.js';

// Matches each complete ``` … ``` fence in the response. Group 1 is the
// `json` info string when present (spaces before it allowed); group 2 is the
// body. The narrator is instructed to emit exactly one block, but if the model
// emits multiple we take the last one — it is the most recent assertion of
// state.
//
// `[\s\S]` rather than `.` so the body may span lines. Non-greedy so multiple
// blocks (when they occur) match individually rather than collapsing.
const FENCE_PATTERN = /```[ \t]*(json)?\s*\n?([\s\S]*?)\n?```/gi;

// The opening of a fence no later ``` closes (see the unclosed tail below).
const OPENING_FENCE = /^```[ \t]*(json)?\s*/i;

// One or two backticks at the very end: a closing fence cut off mid-way.
const PARTIAL_CLOSING_FENCE = /\s*`{1,2}\s*$/u;

const TRUNCATED_MESSAGE =
  'Sidecar opening fence found but no closing fence — narrator response likely truncated by maxTokens.';

/**
 * Pull the last fenced JSON block from raw narrator text and parse it.
 *
 * @param {string} rawText — full narrator response (prose + sidecar)
 * @returns {{ prose: string, sidecar: object|null, parseError: Error|null }}
 */
export function extractSidecar(rawText) {
  if (typeof rawText !== 'string' || !rawText.length) {
    return { prose: rawText ?? '', sidecar: null, parseError: null };
  }

  // The fences that hold a sidecar, in order. A `json`-tagged fence always
  // does; an untagged one only when its body is a JSON object — narration
  // carries no code, so a fenced object is the model's sidecar.
  const blocks = [];
  let pairedEnd = 0;
  for (const m of rawText.matchAll(FENCE_PATTERN)) {
    pairedEnd = m.index + m[0].length;
    const body = (m[2] ?? '').trim();
    if (m[1] || isObjectBody(body)) {
      blocks.push({ start: m.index, end: pairedEnd, body, closed: true });
    }
  }

  // An opening fence after the last complete one has no closing ``` — most
  // often maxTokens cut the response mid-sidecar (observed on Forge with
  // v1.3.0), sometimes the model just never closed it. Strip from the opening
  // fence forward so the JSON never bleeds into the chat card, and parse what
  // is there: a complete object is applied, a truncated one surfaces a
  // parseError so the caller logs the cause and no partial data reaches the
  // ledger.
  const openIdx = rawText.indexOf('```', pairedEnd);
  if (openIdx >= 0) {
    const opening = rawText.slice(openIdx).match(OPENING_FENCE);
    const body    = rawText.slice(openIdx + opening[0].length).replace(PARTIAL_CLOSING_FENCE, '').trim();
    if (opening[1] || isObjectBody(body)) {
      blocks.push({ start: openIdx, end: rawText.length, body, closed: false });
    }
  }

  // No fence at all: a sidecar object the model wrote bare after the prose
  // showed on the card as prose, and its facts were lost (known-issues
  // SIDECAR-UNFENCED). A trailing object on its own line that opens with a
  // sidecar key is the sidecar — complete, or cut off (a parseError).
  if (!blocks.length) {
    const bare = trailingBareSidecar(rawText);
    if (bare) blocks.push(bare);
  }

  if (!blocks.length) return { prose: rawText, sidecar: null, parseError: null };

  // Take the last block in the response: it is the model's latest word on
  // the state. The prose ends at the first block — what the model writes
  // after it, a note about the block or a corrected one, is its working,
  // never narration (issue #389 #3, SIDECAR-NOTE-IN-THE-PROSE: the sixth
  // live long haul's a17 opening was posted ending "Hmm — correction to the
  // block above, which should stand as written but…", the text between its
  // two blocks; of 392 recorded narrator replies with a block, it was the
  // only one with any text after its first). A reply that opens on its block
  // keeps the old reading: every block stripped, the rest the prose.
  const last  = blocks[blocks.length - 1];
  const head  = rawText.slice(0, blocks[0].start).replace(/\s+$/u, '');
  const prose = head || stripBlocks(rawText, blocks);

  let sidecar = null;
  let parseError = null;
  try {
    const parsed = JSON.parse(last.body);
    sidecar = normaliseSidecar(parsed);
  } catch (err) {
    if (!last.closed) parseError = new Error(TRUNCATED_MESSAGE);
    else parseError = err instanceof Error ? err : new Error(String(err));
  }

  return { prose, sidecar, parseError };
}

// A line that opens a bare sidecar object: `{` and, first, one of its keys.
const BARE_SIDECAR_START = /(^|\n)[ \t]*\{\s*"(?:newTruths|stateChanges|sceneFrame|plans|openQuestions|reveals|countdown|newThreats|builtFrom)"\s*:/g;

/**
 * The sidecar object written with no fence: the first line, from the end of
 * the text back, that opens with a sidecar key and runs to the end of the
 * reply. `closed` when it parses whole; otherwise it was cut off.
 *
 * @param {string} rawText
 * @returns {{ start: number, end: number, body: string, closed: boolean }|null}
 */
function trailingBareSidecar(rawText) {
  const starts = [...rawText.matchAll(BARE_SIDECAR_START)].map(m => m.index + m[1].length);
  for (const start of starts) {
    const body = rawText.slice(start).trim();
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;   // not this line — or cut off, below
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { start, end: rawText.length, body, closed: true };
    }
  }
  // None parses to the end: the last one is a sidecar cut off mid-object.
  if (!starts.length) return null;
  const start = starts[starts.length - 1];
  return { start, end: rawText.length, body: rawText.slice(start).trim(), closed: false };
}

/** True when a fence body is a JSON object (parsed or not). */
function isObjectBody(body) {
  return body.startsWith('{');
}

/**
 * Remove every sidecar block from the response. Trailing whitespace is
 * trimmed so the prose ends cleanly without trailing blank lines.
 */
function stripBlocks(rawText, blocks) {
  let out = rawText;
  // Iterate in reverse so earlier indices remain valid as we splice.
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    out = out.slice(0, blocks[i].start) + out.slice(blocks[i].end);
  }
  return out.replace(/\s+$/u, '');
}

/**
 * Coerce a parsed sidecar object into the canonical shape. Missing arrays
 * become empty arrays; non-array fields are treated as empty. Non-object
 * input returns null so the caller treats it as a parse failure. Also run on
 * side-data relayed from a player's client (applyRelayedNarratorSidecar).
 */
export function normaliseSidecar(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return {
    newTruths:     Array.isArray(parsed.newTruths)    ? withFrom(parsed.newTruths)    : [],
    stateChanges:  Array.isArray(parsed.stateChanges) ? withFrom(parsed.stateChanges) : [],
    sceneFrame:    normaliseSceneFrame(parsed.sceneFrame),
    plans:         normalisePlans(parsed.plans),
    openQuestions: normaliseOpenQuestions(parsed.openQuestions),
    reveals:       normaliseReveals(parsed.reveals),
    countdown:     normaliseCountdown(parsed.countdown),
    newThreats:    normaliseNewThreats(parsed.newThreats),
    builtFrom:     normaliseBuiltFrom(parsed.builtFrom),
  };
}

/** The two places a narrator fact may say it comes from (overhaul 2 §5.2). */
const FROM_VALUES = new Set(['line', 'result']);

/**
 * A fact's `from` as the narrator gave it (overhaul 2 §5.2, D5): "line" —
 * the player's line says it — or "result" — the move's outcome or the
 * oracle's answer decides it — else null: absent, misspelled, another value,
 * a non-string. Untagged is the narrator's own colour. Case and spaces aside.
 *
 * @param {unknown} from
 * @returns {"line"|"result"|null}
 */
function normaliseFrom(from) {
  const v = typeof from === 'string' ? from.trim().toLowerCase() : '';
  return FROM_VALUES.has(v) ? v : null;
}

/**
 * A fact list with each object entry's `from` normalised — kept when it is
 * one of FROM_VALUES, left off otherwise (an untagged fact is colour, and its
 * shape is as it was) — other entries as they were (applySidecar skips them).
 */
function withFrom(list) {
  return list.map((e) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return e;
    const { from, ...rest } = e;
    const tag = normaliseFrom(from);
    return tag ? { ...rest, from: tag } : rest;
  });
}

/** The most entries a set-piece's account is read for (a scene has a handful of seeds). */
const BUILT_FROM_MAX = 12;
/** The longest run of words an entry names ("three to eight words"). */
const BUILT_FROM_WORDS_MAX = 160;

/**
 * Normalise a session set-piece's account of its material (issue #381):
 *
 *   "builtFrom": [{ "n": 1, "words": "counts the debts on her fingers" },
 *                 { "n": 2, "words": "a jar with a taped lid", "second": true }]
 *
 * `n` is the number the MATERIAL block gave the result, `words` the words of
 * the prose that are it, `second` true when the narration set the result aside
 * for its second. An entry with no usable number or no words is dropped, a
 * number named twice keeps its first entry, and anything that is no list is
 * no account ([]). Pure and tolerant: a malformed account never blocks a
 * narration.
 *
 * @param {unknown} raw
 * @returns {Array<{ n: number, words: string, second: boolean }>}
 */
function normaliseBuiltFrom(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const n = typeof entry.n === 'string' && /^\d+$/.test(entry.n.trim()) ? Number(entry.n.trim()) : entry.n;
    if (!Number.isInteger(n) || n < 1 || n > BUILT_FROM_MAX) continue;
    const words = typeof entry.words === 'string' ? entry.words.replace(/\s+/g, ' ').trim().slice(0, BUILT_FROM_WORDS_MAX) : '';
    if (!words || out.some(e => e.n === n)) continue;
    out.push({ n, words, second: entry.second === true });
    if (out.length >= BUILT_FROM_MAX) break;
  }
  return out;
}

/**
 * Normalise the optional scene-frame snapshot (fact-continuity Cluster A4 —
 * see docs/narrator/narrator-memory-architecture.md). Shape:
 *
 *   { "location": "Lyra's graveyard", "present": ["Venri Quint (she/her)", "Vance"],
 *     "situation": "Hailing Vance across the debris field",
 *     "question": "Will Vance let them board?", "questionAnswered": false }
 *
 * Returns null when absent or unusable so callers can keep the previous
 * frame. String fields are trimmed; `present` keeps non-empty strings only,
 * each its name alone: a pronoun set marked on an entry goes to `pronouns`,
 * [{ name, pronouns }] (issue #402, change 2 — factContinuity/pronouns.js).
 */
function normaliseSceneFrame(frame) {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return null;
  const location  = typeof frame.location  === 'string' ? frame.location.trim()  : '';
  const situation = typeof frame.situation === 'string' ? frame.situation.trim() : '';
  const listed    = Array.isArray(frame.present)
    ? frame.present.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim())
    : [];
  // Who is here in person, and who is heard or seen over a comm, a screen or a
  // call (`remote` — CHARACTERS-MOVED-BY-THE-NARRATION, round 7: a57's comm call
  // put Tamsin in "present", and the record read her as at Bleakhold). A
  // present entry the narration marked as on the comm goes under remote.
  const present = [];
  const remote = [];
  // An entry may carry its person's pronouns — "customs clerk (she/her)"
  // (issue #402, change 2): the name is the entry's, the set is kept apart.
  const pronouns = [];
  const unmarked = (entry) => {
    let name = entry;
    let set = '';
    let onComm = false;
    for (let pass = 0; pass < 2; pass += 1) {
      const split = splitPronounMark(name);
      if (split.pronouns) { name = split.name; set = set || split.pronouns; }
      const bare = name.replace(COMM_MARK, '').trim();
      if (bare !== name && bare) { name = bare; onComm = true; }
    }
    if (set) pronouns.push({ name, pronouns: set });
    return { name, onComm };
  };
  for (const p of listed) {
    const { name, onComm } = unmarked(p);
    if (onComm) remote.push(name); else present.push(name);
  }
  for (const r of Array.isArray(frame.remote) ? frame.remote : []) {
    const name = typeof r === 'string' && r.trim() ? unmarked(r.trim()).name : '';
    if (name && !remote.includes(name)) remote.push(name);
  }
  if (!location && !situation && !present.length && !remote.length) return null;
  // The scene's question — what is being decided here — and whether this
  // beat answered it (issue #353 R2; kept by ledgers.applySceneFrame).
  const question  = typeof frame.question === 'string' ? frame.question.replace(/\s+/g, ' ').trim().slice(0, SCENE_QUESTION_MAX) : '';
  // A frame already read — a relayed block, re-normalised on the GM — keeps
  // the list it carries, for the people it lists.
  const kept = pronounsFor([...pronouns, ...normalisePronounList(frame.pronouns)], [...present, ...remote]);
  return {
    location, present, situation,
    ...(remote.length ? { remote } : {}),
    ...(kept.length ? { pronouns: kept } : {}),
    ...(question ? { question } : {}),
    ...(frame.questionAnswered === true ? { questionAnswered: true } : {}),
  };
}

/** A present entry's own mark that its person is not here in person: "Tamsin Okoro (on comms)", "Vance — over the comm". */
const COMM_MARK = /\s*(?:[([]\s*|[—–,-]\s*)(?:on|over|via|by|through)\s+(?:the\s+|a\s+)?(?:comms?|comm[- ]?link|radio|vid(?:eo)?(?:[- ]?link)?|screen|channel|call|hail)\s*[)\]]?\s*$/i;

/** The longest scene question kept (a question, not a paragraph). */
const SCENE_QUESTION_MAX = 160;
