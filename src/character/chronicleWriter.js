// src/character/chronicleWriter.js
//
// Automatic chronicle entries — generates a one-sentence narrative beat from
// a passage of narrator prose and writes it to the chronicle of the active PC.
//
// Two callers in production: narrateResolution (move pipeline) and
// narratePacedInput (paced narration). Both fire-and-forget through
// scheduleChronicleEntry so the chronicle write does not block the chat card.
//
// Gated on the `chronicleAutoEntry` setting (default true; registered in
// src/ui/settingsPanel.js).
//
// GM-only on the writer side — `addChronicleEntry` calls `JournalEntry.create`
// + `page.setFlag`, both of which need a permitted client. Non-GM clients
// no-op silently; the GM client picks the entries up on its own narration
// passes. Same PERSIST-001 constraint as meter writes.

import { apiPost } from '../api-proxy.js';
import { addChronicleEntry } from './chronicle.js';
import { getPlayerActors } from './actorBridge.js';
import { passesSalience, getSalienceThreshold } from '../world/salience.js';

const MODULE_ID     = 'starforged-companion';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const DELAY_MS      = 2000;
const MAX_TOKENS    = 200;

const VALID_TYPES = new Set([
  'revelation', 'relationship', 'scar', 'discovery', 'moment',
]);

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
 * @param {"move"|"paced"} args.kind
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
  narrationText, campaignState, moveId, outcome, kind,
}) {
  if (!isAutoEntryEnabled())              return null;
  if (!globalThis.game?.user?.isGM)       return null;
  if (!narrationText?.trim())             return null;

  const actorId = resolveActorId(campaignState);
  if (!actorId)                           return null;

  const apiKey = readApiKey();
  if (!apiKey)                            return null;

  const generated = await callChronicleAPI({
    apiKey,
    narrationText,
    moveId,
    outcome,
    kind,
  }).catch(err => {
    console.warn(`${MODULE_ID} | chronicle writer: Haiku call failed:`, err);
    return null;
  });
  if (!generated?.text) return null;

  // Per-channel salience floor (docs/decisions.md → auto-capture salience gate).
  // Fail-open: an unrated beat passes rather than silently dropping (F20).
  if (!passesSalience(generated.salience, getSalienceThreshold('chronicle'))) {
    return null;
  }

  const entry = {
    type:      VALID_TYPES.has(generated.type) ? generated.type : 'moment',
    text:      generated.text,
    moveId:    moveId ?? '',
    sessionId: campaignState?.currentSessionId ?? '',
    automated: true,
  };

  try {
    await addChronicleEntry(actorId, entry);
    return entry;
  } catch (err) {
    console.warn(`${MODULE_ID} | chronicle writer: addChronicleEntry failed:`, err);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Haiku call
// ─────────────────────────────────────────────────────────────────────────────

async function callChronicleAPI({ apiKey, narrationText, moveId, outcome, kind }) {
  const contextLines = [];
  if (kind === 'move' && moveId) {
    contextLines.push(`Move: ${moveId}`);
    if (outcome) contextLines.push(`Outcome: ${outcome}`);
  } else if (kind === 'paced') {
    contextLines.push('Context: paced narration — no move was rolled.');
  }
  const contextBlock = contextLines.length
    ? `## CONTEXT\n\n${contextLines.join('\n')}\n\n`
    : '';

  const userMessage =
    `${contextBlock}## NARRATION\n\n${narrationText.trim()}`;

  const body = {
    model: readModel(),
    max_tokens: MAX_TOKENS,
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

  const data = await apiPost(ANTHROPIC_URL, headers, body);
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

// campaignState.characterIds is never written by the module, so the stored
// value is effectively always []. Fall back to actorBridge — the same source
// the assembler uses — so the chronicle writer actually runs.
function resolveActorId(campaignState) {
  const ids = campaignState?.characterIds ?? [];
  if (ids[0]) return ids[0];
  try {
    return getPlayerActors()[0]?.id ?? null;
  } catch {
    return null;
  }
}
