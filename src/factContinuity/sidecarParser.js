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
 * ending — Phase 2) and `countdown` (a countdown the prose started, made a
 * tension clock — Phase 3). Normalised and bounded by
 * src/world/skeletons.js, and applied on the canonical GM by
 * src/world/secrets.js applyPlanSideData.
 */

import { normalisePlans, normaliseOpenQuestions, normaliseReveals, normaliseCountdown } from '../world/skeletons.js';

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

  // Take the last block in the response. Strip every block from the prose so
  // the player never sees JSON regardless of how many the model emitted.
  const last  = blocks[blocks.length - 1];
  const prose = stripBlocks(rawText, blocks);

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
const BARE_SIDECAR_START = /(^|\n)[ \t]*\{\s*"(?:newTruths|stateChanges|sceneFrame|plans|openQuestions|reveals|countdown)"\s*:/g;

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
    newTruths:     Array.isArray(parsed.newTruths)    ? parsed.newTruths    : [],
    stateChanges:  Array.isArray(parsed.stateChanges) ? parsed.stateChanges : [],
    sceneFrame:    normaliseSceneFrame(parsed.sceneFrame),
    plans:         normalisePlans(parsed.plans),
    openQuestions: normaliseOpenQuestions(parsed.openQuestions),
    reveals:       normaliseReveals(parsed.reveals),
    countdown:     normaliseCountdown(parsed.countdown),
  };
}

/**
 * Normalise the optional scene-frame snapshot (fact-continuity Cluster A4 —
 * see docs/narrator/narrator-memory-architecture.md). Shape:
 *
 *   { "location": "Lyra's graveyard", "present": ["Venri Quint", "Vance"],
 *     "situation": "Hailing Vance across the debris field",
 *     "question": "Will Vance let them board?", "questionAnswered": false }
 *
 * Returns null when absent or unusable so callers can keep the previous
 * frame. String fields are trimmed; `present` keeps non-empty strings only.
 */
function normaliseSceneFrame(frame) {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return null;
  const location  = typeof frame.location  === 'string' ? frame.location.trim()  : '';
  const situation = typeof frame.situation === 'string' ? frame.situation.trim() : '';
  const present   = Array.isArray(frame.present)
    ? frame.present.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim())
    : [];
  if (!location && !situation && !present.length) return null;
  // The scene's question — what is being decided here — and whether this
  // beat answered it (issue #353 R2; kept by ledgers.applySceneFrame).
  const question  = typeof frame.question === 'string' ? frame.question.replace(/\s+/g, ' ').trim().slice(0, SCENE_QUESTION_MAX) : '';
  return {
    location, present, situation,
    ...(question ? { question } : {}),
    ...(frame.questionAnswered === true ? { questionAnswered: true } : {}),
  };
}

/** The longest scene question kept (a question, not a paragraph). */
const SCENE_QUESTION_MAX = 160;
