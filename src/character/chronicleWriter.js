// src/character/chronicleWriter.js
//
// Automatic chronicle entries — generates a one-sentence narrative beat from
// a passage of narrator prose and writes it to the chronicle of the PC the
// narration is about: the roller's / speaker's PC (`actorId`), or for a Batch
// Mode round the acting character the scribe names (`characters`). Every
// entry went to the first PC (CHRONICLE-FIRST-PC); the first PC is now only
// the fallback for a narration that names none.
//
// Three callers in production: narrateResolution (move pipeline),
// narratePacedInput (paced narration) and narrateRound (a Batch Mode round,
// issue #340 — one entry per round). All fire-and-forget through
// scheduleChronicleEntry so the chronicle write does not block the chat card.
//
// Gated on the `chronicleAutoEntry` setting (default true; registered in
// src/ui/settingsPanel.js).
//
// GM-only on the writer side: non-GM clients no-op silently; the GM client
// picks the entries up on its own narration passes. The write itself goes to
// the canonical GM (`requestChronicleEdit` — local there, relayed from another
// GM), the Chronicle's one writer, so it can't race a player's edit applied
// there (issue #306 R11).

import { apiPost } from '../api-proxy.js';
import { requestChronicleEdit, CHRONICLE_AUTO_TYPES } from './chronicle.js';
import { getPlayerActors, isPlayerCharacterActor } from './actorBridge.js';
import { passesSalience, getSalienceThreshold } from '../world/salience.js';
import { isNarrationXCarded } from '../context/safety.js';

const MODULE_ID     = 'starforged-companion';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-5-5';

const DELAY_MS      = 2000;
const MAX_TOKENS    = 260;   // was 200 — Haiku 5.5 counts the same text as about 30% more tokens than Haiku 4.5 (the narration model may be Haiku)

// The types the prompt below offers — the Chronicle panel's type select lists
// each (CHRONICLE_ENTRY_TYPES includes them: issue #322 V33).
const VALID_TYPES = new Set(CHRONICLE_AUTO_TYPES);

const SYSTEM_PROMPT = `You are the chronicle scribe for an Ironsworn: Starforged tabletop RPG companion. Your job is to capture one dramatic beat from a short passage of narrator prose as a single chronicle entry.

## OUTPUT

Return ONLY a JSON object — no markdown fences, no preamble, no text outside the JSON:

{
  "type": "revelation" | "relationship" | "scar" | "discovery" | "moment",
  "salience": "trivial" | "scene" | "notable" | "significant" | "defining",
  "text": "<one short sentence in plain prose>"
}

## GUIDANCE

The chronicle is a narrative story record, not a mechanical one. Capture what changed in the fiction — a fact surfaced, a relationship shifted, a scar taken, a place found, a moment held.

  - revelation: a fact, secret, or truth was surfaced
  - relationship: a connection deepened, strained, or was established
  - scar: physical or emotional harm taken; a mark the character will carry
  - discovery: a new place, faction, NPC, or piece of the world encountered
  - moment: an emotionally significant beat that doesn't fit the others

Salience — rate how much this beat changes the character's ongoing story, so fleeting scene texture does not flood the chronicle:

  - defining: a turning point in the character's arc.
  - significant: a durable development — a bond formed, a scar taken, or a truth that changes how the character sees their journey.
  - notable: a meaningful beat that may echo later.
  - scene: matters only in the current moment.
  - trivial: incidental flavour.

Be sparing: most narration is "scene" or "trivial".

Constraints:
  - One sentence, plain prose, present or past tense — pick what reads naturally.
  - Max 30 words. Shorter is better. No subordinate clauses if you can avoid them.
  - Never mention dice, moves, momentum, debilities, hits, misses, or any module mechanic.
  - Never reference panels, records, journals, or any tooling concern.
  - Use specific nouns from the prose when present (names, places, objects).
  - Do not invent details that aren't in the prose.`;


// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schedule a chronicle entry write. Fire-and-forget — the chat card has
 * already been posted by the caller; this runs ~2 s later so detection
 * passes and the chronicle write don't both land in the same tick.
 *
 * @param {Object} args
 * @param {string} args.narrationText
 * @param {Object} args.campaignState
 * @param {string} [args.moveId]    — present for move-pipeline calls
 * @param {string} [args.outcome]   — present for move-pipeline calls
 * @param {"move"|"paced"|"round"} args.kind
 * @param {string|null} [args.actorId]  — the narration's PC: the roller's or
 *   speaker's (move, paced)
 * @param {Array<{actorId: string, name: string}>} [args.characters] — a
 *   round's acting characters; the scribe names the one the beat is about
 * @param {string|null} [args.narrationId] — the narration's id, stamped on the
 *   entry so the X-Card can take it back (XCARD-CHRONICLE)
 */
export function scheduleChronicleEntry(args) {
  if (!isAutoEntryEnabled()) return;
  setTimeout(() => {
    writeChronicleEntry(args).catch(err =>
      console.warn(`${MODULE_ID} | chronicle writer failed:`, err));
  }, DELAY_MS);
}

/**
 * Generate and persist a chronicle entry synchronously. Exposed for tests
 * and for integration paths that want to await the write.
 *
 * @param {Object} args
 * @returns {Promise<Object|null>}  — the entry written (or null if skipped)
 */
export async function writeChronicleEntry({
  narrationText, campaignState, moveId, outcome, kind, actorId: narrationActorId = null, characters = null,
  narrationId = null,
}) {
  if (!isAutoEntryEnabled())              return null;
  if (!globalThis.game?.user?.isGM)       return null;
  if (!narrationText?.trim())             return null;
  // The X-Card may have removed the narration before the scribe ran, or while
  // its call is out (below): nothing is written from the removed prose
  // (XCARD-CHRONICLE — the capture's XCARD-LATE-CAPTURE rule).
  if (isNarrationXCarded(narrationId))    return null;

  const cast = roundCast(characters);
  if (!resolveActorId(campaignState, { actorId: narrationActorId, cast })) return null;

  const apiKey = readApiKey();
  if (!apiKey)                            return null;

  const generated = await callChronicleAPI({
    apiKey,
    narrationText,
    moveId,
    outcome,
    kind,
    cast,
  }).catch(err => {
    console.warn(`${MODULE_ID} | chronicle writer: Haiku call failed:`, err);
    return null;
  });
  if (!generated?.text) return null;
  if (isNarrationXCarded(narrationId)) return null;

  // Per-channel salience floor (docs/decisions.md → auto-capture salience gate).
  // Fail-open: an unrated beat passes rather than silently dropping (F20).
  if (!passesSalience(generated.salience, getSalienceThreshold('chronicle'))) {
    return null;
  }

  // The PC the beat is about: the narration's own, or the round character
  // the scribe named (CHRONICLE-FIRST-PC).
  const actorId = resolveActorId(campaignState, { actorId: narrationActorId, cast, named: generated.character });
  if (!actorId) return null;

  const entry = {
    type:      VALID_TYPES.has(generated.type) ? generated.type : 'moment',
    text:      generated.text,
    moveId:    moveId ?? '',
    sessionId: campaignState?.currentSessionId ?? '',
    automated: true,
    // The X-Card's finish removes the entry by it (retractNarrationChronicle).
    ...(typeof narrationId === 'string' && narrationId ? { narrationId } : {}),
  };

  try {
    const res = await requestChronicleEdit(actorId, { op: 'add', entry });
    if (!res?.ok || res.result?.applied === false) {
      console.warn(`${MODULE_ID} | chronicle writer: the entry was not written (${res?.reason ?? res?.result?.reason ?? 'unknown'}).`);
      return null;
    }
    return entry;
  } catch (err) {
    console.warn(`${MODULE_ID} | chronicle writer: the chronicle edit failed:`, err);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Haiku call
// ─────────────────────────────────────────────────────────────────────────────

async function callChronicleAPI({ apiKey, narrationText, moveId, outcome, kind, cast = [] }) {
  const contextLines = [];
  if (kind === 'move' && moveId) {
    contextLines.push(`Move: ${moveId}`);
    if (outcome) contextLines.push(`Outcome: ${outcome}`);
  } else if (kind === 'paced') {
    contextLines.push('Context: paced narration — no move was rolled.');
  } else if (kind === 'round') {
    contextLines.push('Context: one round in which several characters acted at once — capture the beat that changed the most.');
  }
  // Whose chronicle a round's beat belongs in: the scribe names the
  // character it is about (CHRONICLE-FIRST-PC).
  if (cast.length > 1) {
    contextLines.push(`Characters: ${cast.map(c => c.name).join(', ')}`);
    contextLines.push('Add "character": the name, exactly as listed, of the character this beat is about.');
  }
  const contextBlock = contextLines.length
    ? `## CONTEXT\n\n${contextLines.join('\n')}\n\n`
    : '';

  const userMessage =
    `${contextBlock}## NARRATION\n\n${narrationText.trim()}`;

  const model = readModel();
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    // Its 200-token JSON on a thinking-by-default model (issue #325 W27).
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMessage }],
  };

  const headers = {
    'x-api-key':         apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta':    'prompt-caching-2024-07-31',
  };

  const data = await apiPost(ANTHROPIC_URL, headers, body, { label: "chronicleWriter" });
  const text = (data?.content ?? [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');
  if (!text) return null;

  return parseEntry(text);
}

function parseEntry(rawText) {
  try {
    const cleaned = String(rawText ?? '')
      .replace(/```(?:json)?|```/g, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object')   return null;
    const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
    if (!text)                                   return null;
    return {
      type: typeof parsed.type === 'string' ? parsed.type.toLowerCase() : 'moment',
      salience: typeof parsed.salience === 'string' ? parsed.salience.toLowerCase() : null,
      character: typeof parsed.character === 'string' ? parsed.character.trim() : null,
      text,
    };
  } catch {
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Settings + state lookup
// ─────────────────────────────────────────────────────────────────────────────

function isAutoEntryEnabled() {
  try {
    const v = globalThis.game?.settings?.get?.(MODULE_ID, 'chronicleAutoEntry');
    return v ?? true;
  } catch {
    return true;
  }
}

function readApiKey() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, 'claudeApiKey') || null;
  } catch {
    return null;
  }
}

function readModel() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, 'narrationModel') || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

/** A round's acting characters that are player characters, `{ actorId, name }`, each once. */
function roundCast(characters) {
  const out = [];
  for (const c of Array.isArray(characters) ? characters : []) {
    const id = typeof c?.actorId === 'string' ? c.actorId : null;
    if (!id || out.some(o => o.actorId === id) || !isPC(id)) continue;
    out.push({ actorId: id, name: String(c.name ?? '').trim() || id });
  }
  return out;
}

/** Whether `actorId` names a player character in this world. */
function isPC(actorId) {
  try {
    return isPlayerCharacterActor(globalThis.game?.actors?.get?.(actorId) ?? null);
  } catch {
    return false;
  }
}

/**
 * The PC whose chronicle an entry goes to (CHRONICLE-FIRST-PC — every entry
 * went to the first PC): the narration's own PC (the roller's or speaker's);
 * for a round, the acting character the scribe named (`named`), else the
 * round's first acting character; only for a narration that names no PC the
 * campaign's first PC — `characterIds` (never written by the module, so
 * effectively []) or the first player Actor, the same source the assembler
 * uses.
 *
 * @param {Object} campaignState
 * @param {{ actorId?: string|null, cast?: Array<{actorId: string, name: string}>, named?: string|null }} [who]
 * @returns {string|null}
 */
function resolveActorId(campaignState, { actorId = null, cast = [], named = null } = {}) {
  if (typeof actorId === 'string' && actorId && isPC(actorId)) return actorId;
  if (cast.length) {
    const key = String(named ?? '').trim().toLowerCase();
    return (key ? cast.find(c => c.name.toLowerCase() === key) : null)?.actorId ?? cast[0].actorId;
  }
  const ids = campaignState?.characterIds ?? [];
  if (ids[0]) return ids[0];
  try {
    return getPlayerActors()[0]?.id ?? null;
  } catch {
    return null;
  }
}
