// src/narration/narrator.js
// Core narration module — calls Claude API and posts narration chat cards.
// Runs on whichever client triggered the move; no GM dependency, no socket relay.

import { apiPost } from '../api-proxy.js';
import {
  buildNarratorSystemPrompt,
  buildNarratorUserMessage,
  buildSceneUserMessage,
  resolveNarrationPerspective,
} from './narratorPrompt.js';

const MODULE_ID      = 'starforged-companion';
const ANTHROPIC_URL  = 'https://api.anthropic.com/v1/messages';
const RETRY_DELAY_MS = 5000;

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
  const systemPrompt = buildNarratorSystemPrompt(campaignState, settings, character);
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
