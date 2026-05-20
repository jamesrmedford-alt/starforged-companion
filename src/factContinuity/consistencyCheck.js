/**
 * STARFORGED COMPANION
 * src/factContinuity/consistencyCheck.js
 *
 * Optional post-narration audit pass. After every narration the prose is
 * compared against the active-scene ledger (binding truths + current
 * state) by a Haiku call. High-confidence contradictions surface on the
 * existing GM-only Narrative Review card, augmented in Phase E with a
 * "Retract the offending fact" button that opens the correction dialog.
 *
 * fact-continuity scope §11. Off by default — gated on the
 * `factContinuity.consistencyCheck` world setting.
 *
 * Telemetry for every audit (including low/medium-confidence results) is
 * appended to the existing Pacing Telemetry journal on a new
 * "Consistency Check" page (scope §17 Phase E item 32).
 */

import { apiPost }              from '../api-proxy.js';
import { buildLedgerBlock }     from '../narration/narratorPrompt.js';
import { applyStateTransition } from '../entities/entityExtractor.js';
import { logConsistencyDecision } from '../pacing/telemetry.js';

const MODULE_ID     = 'starforged-companion';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const HAIKU_MODEL   = 'claude-haiku-4-5-20251001';
const MAX_TOKENS    = 250;

/**
 * Run the consistency-check audit on a piece of narrator prose.
 *
 * Reads `factContinuity.consistencyCheck` from settings; if false, returns
 * an empty result without making the API call. Always returns
 * `{ contradictions: [...] }`; never throws.
 *
 * @param {string} prose
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {string[]} [options.matchedEntityIds]
 * @param {string|null} [options.currentLocationId]
 * @param {string} [options.playerNarration]
 * @returns {Promise<{ contradictions: Array<Object>, dispatched: boolean }>}
 */
export async function runConsistencyCheck(prose, campaignState, options = {}) {
  const enabled = readSettingBoolean('factContinuity.consistencyCheck', false);
  if (!enabled) return { contradictions: [], dispatched: false };
  if (!prose?.trim() || !campaignState) {
    return { contradictions: [], dispatched: false };
  }

  const apiKey = readApiKey();
  if (!apiKey) return { contradictions: [], dispatched: false };

  const ledger = buildLedgerBlock(campaignState, {
    matchedEntityIds:  options.matchedEntityIds ?? [],
    currentLocationId: options.currentLocationId ?? campaignState.currentLocationId ?? null,
    playerNarration:   options.playerNarration ?? '',
    maxTokens:         Infinity,
  });

  // Nothing to audit against — no ledger means nothing can be contradicted.
  if (!ledger.truths && !ledger.state) {
    return { contradictions: [], dispatched: false };
  }

  const systemPrompt = buildAuditPrompt(ledger.truths, ledger.state, prose);
  const startedAt    = Date.now();

  let contradictions = [];
  try {
    const text = await callHaiku(apiKey, systemPrompt);
    contradictions = parseAuditResponse(text);
  } catch (err) {
    console.warn(`${MODULE_ID} | consistencyCheck: Haiku call failed:`, err);
    contradictions = [];
  }

  const elapsedMs = Date.now() - startedAt;

  let dispatched = false;
  for (const c of contradictions) {
    if (c.confidence !== 'high') continue;
    try {
      await applyStateTransition({
        entryType:        'factContinuity',
        change:           'contradicted',
        name:             c.subject ?? '(unknown)',
        newValue:         c.evidence ?? '',
        summary:          c.violated ?? '',
        truthId:          c.truthId  ?? null,
        matchedEntityIds: options.matchedEntityIds ?? [],
      }, campaignState);
      dispatched = true;
    } catch (err) {
      console.warn(`${MODULE_ID} | consistencyCheck: dispatch failed:`, err);
    }
  }

  // Telemetry — fire-and-forget, GM-gated inside logConsistencyDecision.
  logConsistencyDecision({
    sceneId:       campaignState.currentSceneId ?? null,
    sessionId:     campaignState.currentSessionId ?? null,
    sessionNumber: campaignState.sessionNumber ?? null,
    prose,
    contradictions,
    elapsedMs,
    dispatched,
  }).catch(err => console.warn(`${MODULE_ID} | consistencyCheck: telemetry failed:`, err));

  return { contradictions, dispatched };
}

/**
 * Build the audit system prompt per scope §11.1. Exported for testing.
 */
export function buildAuditPrompt(truthsBlock, stateBlock, narration) {
  return [
    'You are auditing an Ironsworn: Starforged narrator response for',
    'internal consistency against the binding truths and current state of',
    'the active scene. Return JSON only.',
    '',
    'ACTIVE SCENE TRUTHS:',
    truthsBlock?.trim() || '(none)',
    '',
    'ACTIVE SCENE STATE:',
    stateBlock?.trim() || '(none)',
    '',
    'NARRATION:',
    narration.trim(),
    '',
    'Return:',
    '{',
    '  "contradictions": [',
    '    { "subject": string, "violated": string, "evidence": string,',
    '      "kind": "truth" | "state", "confidence": "high" | "medium" | "low" }',
    '  ]',
    '}',
    '',
    'Return an empty array if the narration honours the scene ledger.',
    'Do NOT return contradictions for facts not in the ledger above — your',
    'job is consistency with prior assertions, not plausibility judgement.',
  ].join('\n');
}

/**
 * Parse the Haiku audit response. Robust against fenced code blocks and
 * prose preamble. Returns an array; missing / malformed input → []. Each
 * element is normalised to the documented shape, with unknown confidences
 * coerced to "low".
 *
 * Exported for testing.
 */
export function parseAuditResponse(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) return [];
  const stripped = stripFences(rawText).trim();
  if (!stripped) return [];

  let parsed = null;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // Fall back: extract the first object in the string.
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try { parsed = JSON.parse(match[0]); } catch { return []; }
  }

  const list = Array.isArray(parsed?.contradictions) ? parsed.contradictions : [];
  return list
    .filter(c => c && typeof c === 'object')
    .map(c => ({
      subject:    typeof c.subject    === 'string' ? c.subject.trim()    : '',
      violated:   typeof c.violated   === 'string' ? c.violated.trim()   : '',
      evidence:   typeof c.evidence   === 'string' ? c.evidence.trim()   : '',
      kind:       c.kind === 'state' ? 'state' : 'truth',
      confidence: normaliseConfidence(c.confidence),
      truthId:    typeof c.truthId    === 'string' ? c.truthId.trim()    : null,
    }))
    .filter(c => c.subject && c.violated);
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function callHaiku(apiKey, systemPrompt) {
  const body = {
    model:      HAIKU_MODEL,
    max_tokens: MAX_TOKENS,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: 'Audit the narration above against the scene ledger.' }],
  };
  const headers = {
    'Content-Type':      'application/json',
    'x-api-key':         apiKey,
    'anthropic-version': '2023-06-01',
  };
  const data = await apiPost(ANTHROPIC_URL, headers, body);
  const text = (data?.content ?? [])
    .filter(b => b?.type === 'text')
    .map(b => b.text)
    .join('');
  if (!text) throw new Error('Consistency-check API returned no text content.');
  return text;
}

function normaliseConfidence(v) {
  const s = String(v ?? '').toLowerCase();
  if (s === 'high' || s === 'medium' || s === 'low') return s;
  return 'low';
}

function stripFences(text) {
  return String(text)
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '');
}

function readSettingBoolean(key, fallback) {
  try {
    const v = globalThis.game?.settings?.get?.(MODULE_ID, key);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function readApiKey() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, 'claudeApiKey') ?? '';
  } catch {
    return '';
  }
}
