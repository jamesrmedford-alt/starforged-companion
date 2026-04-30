// src/narration/narrator.js
// Core narration module — calls Claude API and posts narration chat cards.
// Runs on whichever client triggered the move; no GM dependency, no socket relay.

import { apiPost } from '../api-proxy.js';
import {
  buildNarratorSystemPrompt,
  buildNarratorUserMessage,
  buildSceneUserMessage,
  buildCampaignRecapUserMessage,
  resolveNarrationPerspective,
} from './narratorPrompt.js';

const MODULE_ID      = 'starforged-companion';
const ANTHROPIC_URL  = 'https://api.anthropic.com/v1/messages';
const RETRY_DELAY_MS = 5000;

// Tracks whether a campaign recap has been injected into the narrator prompt
// for the current session. Reset when the session ID changes.
let _lastRecapInjectedSessionId = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Narrate the consequence of a resolved move.
 * Builds the prompt, calls Claude, posts the narration card.
 * On any failure, posts a fallback card and returns null — never blocks the move result.
 *
 * @param {Object} resolution    — MoveResolutionSchema from resolver.js
 * @param {Object} contextPacket — ContextPacketSchema from assembler.js
 * @param {Object} campaignState — CampaignStateSchema
 * @param {Object} [options]
 * @returns {Promise<string|null>} narration text, or null on failure/disabled
 */
export async function narrateResolution(resolution, contextPacket, campaignState, options = {}) {
  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) return null;

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn(`${MODULE_ID} | narrateResolution: Claude API key not configured`);
    await postFallbackCard(resolution);
    return null;
  }

  const character    = getActiveCharacter(campaignState);

  // Inject campaign recap into the system prompt for the first narration of a session
  let recapContext = '';
  if (shouldInjectRecapThisCall(campaignState)) {
    recapContext = await getCampaignRecap(campaignState).catch(() => '');
  }

  const systemPrompt = buildNarratorSystemPrompt(campaignState, settings, character, recapContext);
  const userMessage  = buildNarratorUserMessage(
    resolution,
    resolution.playerNarration ?? '',
    settings.narrationLength
  );

  try {
    const narration = await callNarratorAPI({
      apiKey,
      systemPrompt,
      userMessage,
      model:     settings.narrationModel,
      maxTokens: settings.narrationMaxTokens,
    });

    if (!narration?.trim()) {
      await postFallbackCard(resolution);
      return null;
    }

    if (recapContext) markRecapInjected(campaignState?.currentSessionId);
    await postNarrationCard(narration, resolution, campaignState);
    return narration;

  } catch (err) {
    // Rate limit — retry once after 5 s
    if (isRateLimit(err)) {
      try {
        await delay(RETRY_DELAY_MS);
        const narration = await callNarratorAPI({
          apiKey, systemPrompt, userMessage,
          model:     settings.narrationModel,
          maxTokens: settings.narrationMaxTokens,
        });
        if (narration?.trim()) {
          if (recapContext) markRecapInjected(campaignState?.currentSessionId);
          await postNarrationCard(narration, resolution, campaignState);
          return narration;
        }
      } catch {
        // Fall through to fallback card
      }
    }

    console.error(`${MODULE_ID} | narrateResolution failed:`, err);
    await postFallbackCard(resolution);
    return null;
  }
}

/**
 * Post a styled narration chat card.
 * Separated from narrateResolution so integration tests can call it directly.
 *
 * @param {string} narrationText
 * @param {Object} resolution     — MoveResolutionSchema
 * @param {Object} [campaignState] — CampaignStateSchema (provides session fields)
 * @returns {Promise<ChatMessage>}
 */
export async function postNarrationCard(narrationText, resolution, campaignState) {
  return ChatMessage.create({
    content: `
      <div class="sf-narration-card">
        <div class="sf-narration-label">◈ Narrator</div>
        <div class="sf-narration-prose">${narrationText}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        narratorCard:  true,
        narrationCard: true,                              // kept for backwards compat
        narrationText: narrationText,
        sessionId:     campaignState?.currentSessionId ?? null,
        sessionNumber: campaignState?.sessionNumber     ?? null,
        moveId:        resolution?.moveId               ?? null,
        outcome:       resolution?.outcome              ?? null,
        resolutionId:  resolution?._id                  ?? '',
        timestamp:     new Date().toISOString(),
      },
    },
  });
}

/**
 * Retrieve the last N narration card texts from the current session.
 * Reads from chat history — not from the chronicle — to reflect the immediate scene.
 *
 * @param {string} sessionId
 * @param {number} [limit=3]
 * @returns {string}
 */
export function getRecentNarrationContext(sessionId, limit = 3) {
  try {
    return (game.messages?.contents ?? [])
      .filter(m =>
        m.flags?.[MODULE_ID]?.narratorCard &&
        m.flags?.[MODULE_ID]?.sessionId === sessionId
      )
      .slice(-limit)
      .map(m => m.flags?.[MODULE_ID]?.narrationText)
      .filter(Boolean)
      .join('\n\n');
  } catch {
    return '';
  }
}

/**
 * Assemble and post a session recap card from chat history.
 * No Claude API call — reads narrator card flags from game.messages.
 *
 * @param {Object} campaignState
 * @param {string|null} sessionId  — null = current session
 * @returns {Promise<void>}
 */
export async function postSessionRecap(campaignState, sessionId = null) {
  const targetId = sessionId ?? campaignState?.currentSessionId ?? null;
  const sessionNum = campaignState?.sessionNumber ?? null;

  const messages = (game.messages?.contents ?? []).filter(m => {
    const flags = m.flags?.[MODULE_ID];
    if (!flags?.narratorCard) return false;
    if (targetId === null) return true;
    return flags.sessionId === targetId;
  });

  if (!messages.length) {
    return ChatMessage.create({
      content: `
        <div class="sf-recap-session-card">
          <div class="sf-recap-label">◈ Session Recap</div>
          <div class="sf-recap-empty">No narrated moves found for this session.</div>
        </div>
      `.trim(),
    });
  }

  const outcomes = { strong_hit: 0, weak_hit: 0, miss: 0 };
  const moveLines = [];
  let matchContext = null;

  for (const msg of messages) {
    const f = msg.flags[MODULE_ID];
    const moveName = f.moveId
      ? f.moveId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : null;
    const outcome  = f.outcome ?? null;
    const text     = f.narrationText ?? '';
    const firstSentence = text.split(/[.!?]/)[0]?.trim() ?? '';

    if (outcome && outcomes[outcome] !== undefined) outcomes[outcome]++;
    if (f.isMatch) matchContext = moveName;

    if (moveName && outcome) {
      const outcomeLabel = outcome.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      moveLines.push(`• ${moveName} → ${outcomeLabel}${firstSentence ? ': ' + firstSentence : ''}`);
    } else if (text) {
      moveLines.push(`• ${firstSentence}`);
    }
  }

  const totalMoves = messages.length;
  const summaryParts = [`${totalMoves} move${totalMoves !== 1 ? 's' : ''} resolved.`];
  if (outcomes.strong_hit > 0) summaryParts.push(`${outcomes.strong_hit} strong hit${outcomes.strong_hit !== 1 ? 's' : ''}.`);
  if (matchContext) summaryParts.push(`A match was rolled — ${matchContext}.`);

  const sessionLabel = sessionNum ? `Session ${sessionNum}` : 'Current Session';

  return ChatMessage.create({
    content: `
      <div class="sf-recap-session-card">
        <div class="sf-recap-label">◈ Session Recap</div>
        <div class="sf-recap-session-title">${sessionLabel} — ${new Date().toLocaleDateString()}</div>
        <div class="sf-recap-moves">${moveLines.join('<br>')}</div>
        <div class="sf-recap-summary">${summaryParts.join(' ')}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        recapCard:    true,
        recapType:    'session',
        sessionId:    targetId,
        sessionNumber: sessionNum,
      },
    },
  });
}

/**
 * Get the campaign recap text — from cache if valid, or generate via Claude.
 * Uses the chronicle length from campaignState to detect stale caches.
 *
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {boolean} [options.forceRefresh]
 * @returns {Promise<string>}
 */
export async function getCampaignRecap(campaignState, options = {}) {
  const cache = campaignState?.campaignRecapCache;
  const chronicleLength = _getChronicleLength(campaignState);

  if (!options.forceRefresh && cache?.text && cache.chronicleLength === chronicleLength) {
    return cache.text;
  }

  const apiKey = getApiKey();
  if (!apiKey) return '';

  const chronicleEntries = _getChronicleEntries(campaignState);
  if (!chronicleEntries.length) return '';

  const settings    = getNarratorSettings();
  const character   = getActiveCharacter(campaignState);
  const systemPrompt = buildNarratorSystemPrompt(campaignState, settings, character);
  const userMessage  = buildCampaignRecapUserMessage(chronicleEntries);

  try {
    const text = await callNarratorAPI({
      apiKey,
      systemPrompt,
      userMessage,
      model:     settings.narrationModel,
      maxTokens: 600,
    });

    if (text?.trim() && game.user?.isGM) {
      const updated = game.settings.get(MODULE_ID, 'campaignState') ?? campaignState;
      updated.campaignRecapCache = {
        text:            text,
        generatedAt:     new Date().toISOString(),
        chronicleLength: chronicleLength,
      };
      await game.settings.set(MODULE_ID, 'campaignState', updated);
    }

    return text ?? '';
  } catch (err) {
    console.error(`${MODULE_ID} | getCampaignRecap failed:`, err);
    return '';
  }
}

/**
 * Generate and post a campaign recap card.
 * Posts from cache immediately if available; otherwise calls Claude (Sonnet, cached).
 *
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {boolean} [options.forceRefresh]  — ignore cache
 * @param {boolean} [options.silent]        — skip the chat card (used for context injection only)
 * @returns {Promise<string>}               — the recap text
 */
export async function postCampaignRecap(campaignState, options = {}) {
  const text = await getCampaignRecap(campaignState, options);

  if (!text?.trim()) {
    if (!options.silent) {
      await ChatMessage.create({
        content: `
          <div class="sf-recap-campaign-card">
            <div class="sf-recap-label">◈ Campaign Recap</div>
            <div class="sf-recap-empty">No campaign history available yet. Play some sessions first!</div>
          </div>
        `.trim(),
      });
    }
    return '';
  }

  if (!options.silent) {
    const isGM = game.user?.isGM ?? false;
    const paragraphs = text.split(/\n\n+/).map(p => `<p>${p.trim()}</p>`).join('');
    await ChatMessage.create({
      content: `
        <div class="sf-recap-campaign-card">
          <div class="sf-recap-label">◈ Campaign Recap</div>
          <div class="sf-recap-prose">${paragraphs}</div>
          ${isGM ? '<div class="sf-recap-actions"><button class="sf-recap-refresh" data-action="refreshCampaignRecap">↻ Refresh</button></div>' : ''}
        </div>
      `.trim(),
      flags: {
        [MODULE_ID]: {
          recapCard: true,
          recapType: 'campaign',
        },
      },
    });
  }

  return text;
}

/**
 * Return whether the campaign recap should be injected into the narrator prompt
 * for this narration call (first call of a new session only).
 *
 * @param {Object} campaignState
 * @returns {boolean}
 */
export function shouldInjectRecapThisCall(campaignState) {
  const sessionId = campaignState?.currentSessionId;
  if (!sessionId) return false;
  if (_lastRecapInjectedSessionId === sessionId) return false;
  return true;
}

/**
 * Mark the campaign recap as injected for the current session.
 * Called after the first narration of a session succeeds.
 *
 * @param {string} sessionId
 */
export function markRecapInjected(sessionId) {
  _lastRecapInjectedSessionId = sessionId;
}

/**
 * Respond to a free-form scene interrogation from the player.
 * Posts a scene card to chat — no dice, no move, no chronicle entry.
 *
 * @param {string} question       — the player's question (stripped of @scene prefix)
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {string} [options.actorId]  — requesting player's actor ID (unused; reserved)
 * @returns {Promise<string|null>}    — response text, or null on failure/disabled
 */
export async function interrogateScene(question, campaignState, options = {}) {
  if (!getSceneQueryEnabled()) return null;

  if (campaignState?.xCardActive) return null;

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn(`${MODULE_ID} | interrogateScene: Claude API key not configured`);
    return null;
  }

  const settings = getNarratorSettings();
  const character    = getActiveCharacter(campaignState);
  const systemPrompt = buildNarratorSystemPrompt(campaignState, settings, character);

  const sessionId     = campaignState?.currentSessionId ?? null;
  const contextLimit  = getSceneContextCards();
  const recentContext = getRecentNarrationContext(sessionId, contextLimit);
  const sentenceTarget = getSceneResponseLength();
  const userMessage   = buildSceneUserMessage(question, recentContext, sentenceTarget);

  try {
    const response = await callNarratorAPI({
      apiKey,
      systemPrompt,
      userMessage,
      model:     settings.narrationModel,
      maxTokens: 200,
    });

    if (!response?.trim()) return null;

    await postSceneCard(question, response, sessionId);
    return response;

  } catch (err) {
    if (isRateLimit(err)) {
      try {
        await delay(RETRY_DELAY_MS);
        const response = await callNarratorAPI({
          apiKey, systemPrompt, userMessage,
          model:     settings.narrationModel,
          maxTokens: 200,
        });
        if (response?.trim()) {
          await postSceneCard(question, response, sessionId);
          return response;
        }
      } catch {
        // Fall through — no fallback card for scene queries
      }
    }
    console.error(`${MODULE_ID} | interrogateScene failed:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function postSceneCard(question, responseText, sessionId) {
  return ChatMessage.create({
    content: `
      <div class="sf-scene-card">
        <div class="sf-scene-label">◈ Scene</div>
        <div class="sf-scene-question">${question}</div>
        <div class="sf-scene-prose">${responseText}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        sceneResponse: true,
        sceneText:     responseText,
        sceneQuestion: question,
        sessionId:     sessionId ?? null,
      },
    },
  });
}

async function postFallbackCard(resolution) {
  const moveInfo = resolution?.moveName && resolution?.outcomeLabel
    ? `${resolution.moveName}: ${resolution.outcomeLabel}`
    : 'Move resolved.';

  return ChatMessage.create({
    content: `
      <div class="sf-narration-card sf-narration-fallback">
        <div class="sf-narration-label">◈ Narrator</div>
        <div class="sf-narration-prose">${moveInfo}</div>
        <div class="sf-narration-error">Narration unavailable — check your API key and proxy.</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        narrationCard:     true,
        narrationFallback: true,
        resolutionId:      resolution?._id ?? '',
      },
    },
  });
}

async function callNarratorAPI({ apiKey, systemPrompt, userMessage, model, maxTokens }) {
  const body = {
    model,
    max_tokens: maxTokens ?? 300,
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMessage }],
  };

  const headers = {
    'Content-Type':      'application/json',
    'x-api-key':         apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta':    'prompt-caching-2024-07-31',
  };

  const data = await apiPost(ANTHROPIC_URL, headers, body);

  const text = (data.content ?? [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  if (!text) throw new Error('Narrator API returned no text content.');
  return text;
}

function getNarratorSettings() {
  try {
    return {
      narrationEnabled:      game.settings.get(MODULE_ID, 'narrationEnabled')      ?? true,
      narrationModel:        game.settings.get(MODULE_ID, 'narrationModel')        ?? 'claude-sonnet-4-5-20250929',
      narrationPerspective:  game.settings.get(MODULE_ID, 'narrationPerspective')  ?? 'auto',
      narrationTone:         game.settings.get(MODULE_ID, 'narrationTone')         ?? 'wry',
      narrationLength:       game.settings.get(MODULE_ID, 'narrationLength')       ?? 3,
      narrationInstructions: game.settings.get(MODULE_ID, 'narrationInstructions') ?? '',
      narrationMaxTokens:    game.settings.get(MODULE_ID, 'narrationMaxTokens')    ?? 300,
    };
  } catch {
    return {
      narrationEnabled:      true,
      narrationModel:        'claude-sonnet-4-5-20250929',
      narrationPerspective:  'auto',
      narrationTone:         'wry',
      narrationLength:       3,
      narrationInstructions: '',
      narrationMaxTokens:    300,
    };
  }
}

function getApiKey() {
  try {
    return game.settings.get(MODULE_ID, 'claudeApiKey') || null;
  } catch {
    return null;
  }
}

function getActiveCharacter(campaignState) {
  try {
    const ids = campaignState?.characterIds ?? [];
    if (!ids.length) return null;
    const entry = game.journal?.get(ids[0]);
    if (!entry) return null;
    const page = entry.pages?.contents?.[0];
    return page?.flags?.[MODULE_ID]?.character ?? null;
  } catch {
    return null;
  }
}

function getSceneQueryEnabled() {
  try {
    return game.settings.get(MODULE_ID, 'sceneQueryEnabled') ?? true;
  } catch {
    return true;
  }
}

function getSceneResponseLength() {
  try {
    return game.settings.get(MODULE_ID, 'sceneResponseLength') ?? 2;
  } catch {
    return 2;
  }
}

function getSceneContextCards() {
  try {
    return game.settings.get(MODULE_ID, 'sceneContextCards') ?? 3;
  } catch {
    return 3;
  }
}

function isRateLimit(err) {
  return err?.message?.includes('429') ||
    err?.message?.toLowerCase().includes('rate limit');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Count chronicle entries from the campaign's character chronicle journal.
 * Returns 0 if no chronicle is available — cache will be treated as valid
 * until entries are created.
 */
function _getChronicleLength(campaignState) {
  try {
    const ids = campaignState?.characterIds ?? [];
    if (!ids.length) return 0;
    const entry = game.journal?.get(ids[0]);
    if (!entry) return 0;
    const page = entry.pages?.contents?.find(p =>
      p.flags?.[MODULE_ID]?.chroniclePage
    );
    const entries = page?.flags?.[MODULE_ID]?.entries ?? [];
    return entries.length;
  } catch {
    return 0;
  }
}

/**
 * Read chronicle entries as formatted strings for the campaign recap prompt.
 */
function _getChronicleEntries(campaignState) {
  try {
    const ids = campaignState?.characterIds ?? [];
    if (!ids.length) return [];
    const entry = game.journal?.get(ids[0]);
    if (!entry) return [];
    const page = entry.pages?.contents?.find(p =>
      p.flags?.[MODULE_ID]?.chroniclePage
    );
    const entries = page?.flags?.[MODULE_ID]?.entries ?? [];
    return entries
      .slice()
      .sort((a, b) => (a.timestamp ?? '') < (b.timestamp ?? '') ? -1 : 1)
      .map(e => {
        const date = e.timestamp ? new Date(e.timestamp).toLocaleDateString() : '';
        const session = e.sessionNumber ? `Session ${e.sessionNumber}` : '';
        const header = [session, date].filter(Boolean).join(' — ');
        return header ? `[${header}]\n${e.text ?? e.content ?? ''}` : (e.text ?? e.content ?? '');
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
