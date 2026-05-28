// src/narration/narrator.js
// Core narration module — calls Claude API and posts narration chat cards.
// Runs on whichever client triggered the move; no GM dependency, no socket relay.

import { apiPost } from '../api-proxy.js';
import {
  buildNarratorSystemPrompt,
  buildNarratorUserMessage,
  buildSceneUserMessage,
  buildCampaignRecapUserMessage,
  buildPacedNarrativeUserMessage,
  formatEntityCard,
} from './narratorPrompt.js';
import { resolveRelevance } from '../context/relevanceResolver.js';
import { extractSidecar }     from '../factContinuity/sidecarParser.js';
import { applySidecar }       from '../factContinuity/ledgers.js';
import { inferShipPosition }  from '../factContinuity/shipPosition.js';
import { startScene }         from '../factContinuity/sceneLifecycle.js';
import { runConsistencyCheck } from '../factContinuity/consistencyCheck.js';
import {
  runCombinedDetectionPass,
  routeEntityDrafts,
  routeWorldJournalResults,
  appendGenerativeTierUpdates,
  PACED_NARRATIVE_MOVE_ID,
  PACED_NARRATIVE_OUTCOME,
} from '../entities/entityExtractor.js';
import { getConnection }  from '../entities/connection.js';
import { getSettlement }  from '../entities/settlement.js';
import { getFaction }     from '../entities/faction.js';
import { getShip }        from '../entities/ship.js';
import { getPlanet }      from '../entities/planet.js';
import { getLocation }    from '../entities/location.js';
import { getCreature }    from '../entities/creature.js';
import { buildCampaignTruthsBlock } from '../system/campaignTruths.js';
import { getChronicleEntries } from '../character/chronicle.js';
import { scheduleChronicleEntry } from '../character/chronicleWriter.js';
import { readCharacterSnapshot, getPlayerActors } from '../character/actorBridge.js';

const ENTITY_GETTERS = {
  connection: getConnection,
  settlement: getSettlement,
  faction:    getFaction,
  ship:       getShip,
  planet:     getPlanet,
  location:   getLocation,
  creature:   getCreature,
};

const LOCATION_GETTERS = {
  settlement: getSettlement,
  location:   getLocation,
  planet:     getPlanet,
};

const MODULE_ID      = 'starforged-companion';
const ANTHROPIC_URL  = 'https://api.anthropic.com/v1/messages';
const RETRY_DELAY_MS = 5000;

// Extra tokens reserved for the fact-continuity sidecar JSON when it ships
// alongside narrator prose. A typical sidecar with 2–4 newTruths and 2–4
// stateChanges runs ~150–250 tokens; we budget 300 to leave the prose its
// full configured length plus comfortable headroom for the structured
// block. Without this, maxTokens hits mid-JSON and the truncated fence
// leaks into the chat card (observed on Forge with v1.3.0).
const SIDECAR_TOKEN_HEADROOM = 300;

/**
 * Compute the maxTokens budget for a narrator API call, adding headroom
 * for the fact-continuity sidecar when the feature is enabled. Reads the
 * setting defensively (try/catch) so unit tests without registered
 * settings still get the headroom.
 */
function maxTokensWithSidecar(baseMaxTokens) {
  let fcEnabled = true;
  try {
    fcEnabled = globalThis.game?.settings?.get?.(MODULE_ID, 'factContinuity.enabled') ?? true;
  } catch {
    fcEnabled = true;
  }
  return fcEnabled ? (baseMaxTokens ?? 0) + SIDECAR_TOKEN_HEADROOM : baseMaxTokens;
}

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
 * @param {Object} [options.relevance] — Pre-resolved RelevanceResult from
 *   the createChatMessage pipeline (lets the caller insert a clarification
 *   dialog between resolveRelevance and narration). If omitted, resolveRelevance
 *   is called internally.
 * @returns {Promise<string|null>} narration text, or null on failure/disabled
 */
export async function narrateResolution(resolution, contextPacket, campaignState, options = {}) {
  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) return null;

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn(`${MODULE_ID} | narrateResolution: Claude API key not configured`);
    await postFallbackCard(resolution, campaignState);
    return null;
  }

  const character    = getActiveCharacter(campaignState, options?.speakerActorId);

  // First narration of a session implicitly starts a scene if none is active.
  // See docs/fact-continuity-scope.md §9.1.
  await ensureSceneStarted(campaignState, 'first_narration_move_resolution');

  // Inject campaign recap into the system prompt for the first narration of a session
  let recapContext = '';
  if (shouldInjectRecapThisCall(campaignState)) {
    recapContext = await getCampaignRecap(campaignState).catch(() => '');
  }

  // Phase 2 — relevance resolver runs before the narrator call:
  //   - Picks the narrator-permission block (discovery / interaction / embellishment)
  //   - Identifies which entity records to inject as cards
  // The pipeline (index.js) may pass in a pre-resolved relevance after a
  // clarification dialog has run. Otherwise we resolve internally.
  let relevance = options.relevance ?? null;
  if (!relevance) {
    try {
      relevance = await resolveRelevance(
        resolution.playerNarration ?? '',
        resolution.moveId,
        resolution.outcome,
        campaignState,
      );
    } catch (err) {
      console.warn(`${MODULE_ID} | narrator: resolveRelevance failed; defaulting to embellishment:`, err);
      relevance = {
        resolvedClass: 'embellishment',
        entityIds:     [],
        entityTypes:   [],
        matchedNames:  [],
        needsClarification: false,
        referenceType: 'none',
      };
    }
  }

  if (relevance.needsClarification) {
    console.log(
      `${MODULE_ID} | narrator: needsClarification=true reached narrateResolution — ` +
      `proceeding as ${relevance.resolvedClass} (caller did not run clarification dialog).`
    );
  }

  const entityCards = collectEntityCards(relevance.entityIds, relevance.entityTypes);
  const currentLocationCard = formatCurrentLocation(campaignState);
  const activeSectorBlock   = formatActiveSector(campaignState);
  const campaignTruthsBlock = await buildCampaignTruthsBlock(campaignState).catch(err => {
    console.warn(`${MODULE_ID} | narrator: campaignTruths build failed:`, err);
    return '';
  });
  const entityNamesById = collectEntityNamesById(relevance.entityIds, relevance.entityTypes);

  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, recapContext,
    {
      mode:                'move_resolution',
      narratorClass:       relevance.resolvedClass,
      entityCards,
      currentLocationCard,
      activeSectorBlock,
      oracleSeeds:         resolution.oracleSeeds ?? null,
      campaignTruthsBlock,
      matchedEntityIds:    relevance.entityIds ?? [],
      playerNarration:     resolution.playerNarration ?? '',
      entityNamesById,
      audioMarkupEnabled:  audioMarkupEnabledFromSettings(),
    },
  );
  const userMessage  = buildNarratorUserMessage(
    resolution,
    resolution.playerNarration ?? '',
    settings.narrationLength
  );

  try {
    const raw = await callNarratorAPI({
      apiKey,
      systemPrompt,
      userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(settings.narrationMaxTokens),
    });
    const narration = applyNarratorSidecar(raw, campaignState, {
      moveId:           resolution?.moveId,
      matchedEntityIds: relevance.entityIds ?? [],
      playerNarration:  resolution.playerNarration ?? '',
    });

    if (!narration?.trim()) {
      await postFallbackCard(resolution, campaignState);
      return null;
    }

    if (recapContext) markRecapInjected(campaignState?.currentSessionId);
    await postNarrationCard(narration, resolution, campaignState, {
      matchedEntityIds: relevance.entityIds ?? [],
    });
    await runPostNarrationPasses(narration, resolution, relevance, campaignState);
    scheduleChronicleEntry({
      narrationText: narration,
      campaignState,
      moveId:        resolution.moveId,
      outcome:       resolution.outcome,
      kind:          'move',
    });
    return narration;

  } catch (err) {
    // Rate limit — retry once after 5 s
    if (isRateLimit(err)) {
      try {
        await delay(RETRY_DELAY_MS);
        const raw = await callNarratorAPI({
          apiKey, systemPrompt, userMessage,
          model:     settings.narrationModel,
          maxTokens: maxTokensWithSidecar(settings.narrationMaxTokens),
        });
        const narration = applyNarratorSidecar(raw, campaignState, {
          moveId:           resolution?.moveId,
          matchedEntityIds: relevance.entityIds ?? [],
          playerNarration:  resolution.playerNarration ?? '',
        });
        if (narration?.trim()) {
          if (recapContext) markRecapInjected(campaignState?.currentSessionId);
          await postNarrationCard(narration, resolution, campaignState);
          await runPostNarrationPasses(narration, resolution, relevance, campaignState);
          scheduleChronicleEntry({
            narrationText: narration,
            campaignState,
            moveId:        resolution.moveId,
            outcome:       resolution.outcome,
            kind:          'move',
          });
          return narration;
        }
      } catch (retryErr) {
        console.error(`${MODULE_ID} | narrateResolution retry failed:`, retryErr);
      }
    }

    console.error(`${MODULE_ID} | narrateResolution failed:`, err);
    await postFallbackCard(resolution, campaignState);
    return null;
  }
}


// ---------------------------------------------------------------------------
// Post-narration passes — combined detection + generative tier updates
// ---------------------------------------------------------------------------

const ASYNC_DETECTION_DELAY_MS = 2000;

/**
 * Schedule the post-narration passes specified in narrator-entity-discovery
 * scope §14, step 9. Returns the dispatched promise so tests can await it.
 *
 * Routing:
 *   - discovery + make_a_connection + (strong_hit|weak_hit)
 *       → SYNCHRONOUS detection + auto-create connection
 *   - discovery + any other move
 *       → ASYNCHRONOUS detection (~2 s) + GM-only draft card
 *   - interaction + matched entities
 *       → ASYNCHRONOUS generative-tier update
 *   - embellishment / no relevant outcome
 *       → no pass
 */
export function runPostNarrationPasses(
  narrationText, resolution, relevance, campaignState,
) {
  if (!resolution || !relevance) return Promise.resolve();
  const cls = relevance.resolvedClass;

  if (cls === 'embellishment') return Promise.resolve();

  // Discovery class
  if (cls === 'discovery') {
    const isMakeAConnection = resolution.moveId === 'make_a_connection';
    const isHit = resolution.outcome === 'strong_hit' || resolution.outcome === 'weak_hit';

    if (isMakeAConnection && !isHit) {
      // Per scope §9: no entity creation on a miss
      return Promise.resolve();
    }
    if (isMakeAConnection) {
      // Synchronous — driver awaits so the draft + auto-creation appear
      // in chat at the same moment as the narration.
      return runDiscoveryDetection(
        narrationText, resolution, campaignState,
        {
          autoCreateConnection: true,
          connectionSeed:       resolution.oracleSeeds?.connectionSeed ?? null,
        },
      );
    }

    // Other discovery-class moves — async ~2 s, fire and forget.
    setTimeout(() => {
      runDiscoveryDetection(narrationText, resolution, campaignState, {})
        .catch(err => console.error(`${MODULE_ID} | post-narration detection failed:`, err));
    }, ASYNC_DETECTION_DELAY_MS);
    return Promise.resolve();
  }

  // Interaction class — generative tier update only
  if (cls === 'interaction' && Array.isArray(relevance.entityIds) && relevance.entityIds.length) {
    setTimeout(() => {
      const refs = relevance.entityIds.map((id, i) => ({
        journalId: id,
        type:      relevance.entityTypes?.[i],
      }));
      appendGenerativeTierUpdates(
        narrationText,
        refs,
        campaignState?.currentSessionId,
        campaignState?.sessionNumber,
      ).catch(err =>
        console.error(`${MODULE_ID} | post-narration tier update failed:`, err),
      );
    }, ASYNC_DETECTION_DELAY_MS);
  }

  return Promise.resolve();
}

async function runDiscoveryDetection(narrationText, resolution, campaignState, options) {
  try {
    const detection = await runCombinedDetectionPass(
      narrationText,
      resolution.moveId,
      resolution.outcome,
      campaignState,
    );
    await routeWorldJournalResults(detection.worldJournal, campaignState);
    await routeEntityDrafts(detection.entities, campaignState, {
      autoCreateConnection: options.autoCreateConnection === true,
      connectionSeed:       options.connectionSeed ?? null,
      sessionId:            campaignState?.currentSessionId ?? '',
    });
  } catch (err) {
    console.error(`${MODULE_ID} | runDiscoveryDetection failed:`, err);
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
export async function postNarrationCard(narrationText, resolution, campaignState, options = {}) {
  const matchedEntityIds = Array.isArray(options.matchedEntityIds) ? options.matchedEntityIds : [];
  return ChatMessage.create({
    content: `
      <div class="sf-narration-card">
        <div class="sf-narration-label">◈ Narrator</div>
        <div class="sf-narration-prose">${narrationText}</div>
        <div class="sf-narration-footer">
          <button class="sf-audio-play-btn" data-action="audioPlayToggle" aria-label="Play narrator audio" hidden>
            <i class="fas fa-play"></i> Play
          </button>
          <button class="sf-audio-stop-btn" data-action="audioStop" aria-label="Stop narrator audio" hidden>
            <i class="fas fa-stop"></i> Stop
          </button>
          <button class="sf-correct-fact-btn" data-action="openCorrectionDialog" aria-label="Correct a fact">
            <i class="fas fa-list-check"></i> Correct a fact
          </button>
        </div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        narratorCard:     true,
        narrationCard:    true,                              // kept for backwards compat
        narrationText:    narrationText,
        sessionId:        campaignState?.currentSessionId ?? null,
        sessionNumber:    campaignState?.sessionNumber     ?? null,
        moveId:           resolution?.moveId               ?? null,
        outcome:          resolution?.outcome              ?? null,
        resolutionId:     resolution?._id                  ?? '',
        matchedEntityIds,
        timestamp:        new Date().toISOString(),
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
      .filter(m => {
        const f = m.flags?.[MODULE_ID];
        if (!f?.narratorCard) return false;
        if (f.sessionId !== sessionId) return false;
        // Defensive excludes — even if a future code path co-marks a system
        // card as a narratorCard, none of these should ever feed back into
        // the narrator's user message. Avoids module-meta leaking into prose.
        if (f.worldJournalContradiction) return false;
        if (f.worldJournalCard) return false;
        if (f.recapCard) return false;
        if (f.draftEntityCard) return false;
        if (Array.isArray(m.whisper) && m.whisper.length) return false;
        return true;
      })
      .slice(-limit)
      .map(m => m.flags?.[MODULE_ID]?.narrationText)
      .filter(Boolean)
      .join('\n\n');
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: getRecentNarrationContext failed:`, err);
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
      flags: {
        [MODULE_ID]: {
          recapCard:    true,
          recapType:    'session',
          recapEmpty:   true,
        },
      },
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
  const chronicleLength = await _getChronicleLength(campaignState);

  if (!options.forceRefresh && cache?.text && cache.chronicleLength === chronicleLength) {
    return cache.text;
  }

  const apiKey = getApiKey();
  if (!apiKey) return '';

  const chronicleEntries = await _getChronicleEntries(campaignState);
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
      maxTokens: maxTokensWithSidecar(600),
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
        flags: {
          [MODULE_ID]: {
            recapCard:    true,
            recapType:    'campaign',
            recapEmpty:   true,
          },
        },
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
export async function interrogateScene(question, campaignState, _options = {}) {
  const sessionId = campaignState?.currentSessionId ?? null;

  if (!getSceneQueryEnabled()) {
    await postSceneFallbackCard(question, 'Scene queries are disabled in module settings.', sessionId);
    return null;
  }

  if (campaignState?.xCardActive) {
    await postSceneFallbackCard(question, 'Scene paused — X-Card is active.', sessionId);
    return null;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn(`${MODULE_ID} | interrogateScene: Claude API key not configured`);
    await postSceneFallbackCard(question, 'Scene query unavailable — Claude API key not configured.', sessionId);
    return null;
  }

  const settings = getNarratorSettings();
  const character    = getActiveCharacter(campaignState);
  // The @scene intercept in index.js already calls startScene; this guard
  // covers any direct interrogateScene callers that bypass the chat hook.
  await ensureSceneStarted(campaignState, 'first_narration_scene_interrogation');
  // SECTOR-001 anchors (see formatActiveSector() above) ensure paced and
  // scene-query paths get the same establishments + current-location
  // context as the move-pipeline path.
  const currentLocationCard = formatCurrentLocation(campaignState);
  const activeSectorBlock   = formatActiveSector(campaignState);
  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '',
    {
      mode:            'scene_interrogation',
      playerNarration: question,
      currentLocationCard,
      activeSectorBlock,
      audioMarkupEnabled: audioMarkupEnabledFromSettings(),
    },
  );

  const contextLimit  = getSceneContextCards();
  const recentContext = getRecentNarrationContext(sessionId, contextLimit);
  const sentenceTarget = getSceneResponseLength();
  const userMessage   = buildSceneUserMessage(question, recentContext, sentenceTarget);

  try {
    const raw = await callNarratorAPI({
      apiKey,
      systemPrompt,
      userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(200),
    });
    const response = applyNarratorSidecar(raw, campaignState, { moveId: null, playerNarration: question });

    if (!response?.trim()) {
      await postSceneFallbackCard(question, 'Scene query returned no content — try again.', sessionId);
      return null;
    }

    await postSceneCard(question, response, sessionId);
    return response;

  } catch (err) {
    if (isRateLimit(err)) {
      try {
        await delay(RETRY_DELAY_MS);
        const raw = await callNarratorAPI({
          apiKey, systemPrompt, userMessage,
          model:     settings.narrationModel,
          maxTokens: maxTokensWithSidecar(200),
        });
        const response = applyNarratorSidecar(raw, campaignState, { moveId: null, playerNarration: question });
        if (response?.trim()) {
          await postSceneCard(question, response, sessionId);
          return response;
        }
      } catch (retryErr) {
        console.error(`${MODULE_ID} | interrogateScene retry failed:`, retryErr);
      }
    }
    console.error(`${MODULE_ID} | interrogateScene failed:`, err);
    await postSceneFallbackCard(question, 'Scene query failed — check your API key and proxy.', sessionId);
    return null;
  }
}

/**
 * Run a narrator-only response for the pacing classifier's NARRATIVE and
 * NARRATIVE_WITH_MOVE_AVAILABLE decisions. No move is rolled, no move card is
 * posted, no chronicle entry — just a narrator card continuing the fiction
 * directly from the player's input.
 *
 * @param {string} playerText        — raw player narration
 * @param {Object} campaignState
 * @param {Object} [options]
 * @param {string|null} [options.suggestedMove] — when set, the narrator is
 *   instructed to end with an italicized inline hint nominating this move
 * @returns {Promise<string|null>}   — narration text, or null on failure/disabled
 */
export async function narratePacedInput(playerText, campaignState, options = {}) {
  const sessionId = campaignState?.currentSessionId ?? null;
  const suggestedMove = options.suggestedMove ?? null;

  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) return null;

  if (campaignState?.xCardActive) {
    // Don't run the narrator while the scene is paused.
    return null;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn(`${MODULE_ID} | narratePacedInput: Claude API key not configured`);
    return null;
  }

  const character    = getActiveCharacter(campaignState, options?.speakerActorId);
  await ensureSceneStarted(campaignState, 'first_narration_paced');
  // Paced narrator previously had zero sector / current-location context and
  // would invent new settlement names for places that already exist (SECTOR-001).
  // Both anchors closed in the same pass — see formatActiveSector() above.
  const currentLocationCard = formatCurrentLocation(campaignState);
  const activeSectorBlock   = formatActiveSector(campaignState);
  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '',
    {
      mode:            'paced_narrative',
      playerNarration: playerText,
      currentLocationCard,
      activeSectorBlock,
      audioMarkupEnabled: audioMarkupEnabledFromSettings(),
    },
  );

  const recentContext = getRecentNarrationContext(sessionId, 3);
  const sentenceTarget = settings.narrationLength ?? 3;
  const userMessage = buildPacedNarrativeUserMessage(
    playerText, recentContext, sentenceTarget, suggestedMove,
  );

  try {
    const raw = await callNarratorAPI({
      apiKey, systemPrompt, userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(settings.narrationMaxTokens),
    });
    const text = applyNarratorSidecar(raw, campaignState, { moveId: null, playerNarration: playerText });

    if (!text?.trim()) return null;

    await postPacedNarrativeCard(text, playerText, sessionId, suggestedMove);
    schedulePacedDetection(text, campaignState);
    scheduleChronicleEntry({
      narrationText: text,
      campaignState,
      kind:          'paced',
    });
    return text;
  } catch (err) {
    if (isRateLimit(err)) {
      try {
        await delay(RETRY_DELAY_MS);
        const raw = await callNarratorAPI({
          apiKey, systemPrompt, userMessage,
          model:     settings.narrationModel,
          maxTokens: maxTokensWithSidecar(settings.narrationMaxTokens),
        });
        const text = applyNarratorSidecar(raw, campaignState, { moveId: null, playerNarration: playerText });
        if (text?.trim()) {
          await postPacedNarrativeCard(text, playerText, sessionId, suggestedMove);
          schedulePacedDetection(text, campaignState);
          scheduleChronicleEntry({
            narrationText: text,
            campaignState,
            kind:          'paced',
          });
          return text;
        }
      } catch (retryErr) {
        console.error(`${MODULE_ID} | narratePacedInput retry failed:`, retryErr);
      }
    }
    console.error(`${MODULE_ID} | narratePacedInput failed:`, err);
    return null;
  }
}

/**
 * Schedule the paced-narrative detection pass. Fire-and-forget; matches
 * the async ~2 s pattern used by the non-make_a_connection discovery
 * branch in `runPostNarrationPasses` so the narration card settles
 * before the GM-only draft card appears.
 *
 * @param {string} narrationText
 * @param {Object} campaignState
 */
export function schedulePacedDetection(narrationText, campaignState) {
  setTimeout(() => {
    runPacedDetection(narrationText, campaignState)
      .catch(err => console.error(`${MODULE_ID} | paced detection failed:`, err));
  }, ASYNC_DETECTION_DELAY_MS);
}

/**
 * Run the paced-narrative detection pass synchronously and route the
 * results. Drafts route through the GM-only review card surface (Path 2)
 * — `autoCreateConnection` is never set, so the make_a_connection
 * auto-create branch can't fire from this path. World Journal results
 * route through the §4 routing rule unchanged.
 *
 * Exposed for direct testing; production calls go through
 * `schedulePacedDetection`.
 *
 * @param {string} narrationText
 * @param {Object} campaignState
 * @returns {Promise<void>}
 */
export async function runPacedDetection(narrationText, campaignState) {
  try {
    const detection = await runCombinedDetectionPass(
      narrationText,
      PACED_NARRATIVE_MOVE_ID,
      PACED_NARRATIVE_OUTCOME,
      campaignState,
    );
    await routeWorldJournalResults(detection.worldJournal, campaignState);
    await routeEntityDrafts(detection.entities, campaignState, {
      autoCreateConnection: false,
      sessionId:            campaignState?.currentSessionId ?? '',
      source:               'paced_narrative',
    });
  } catch (err) {
    console.error(`${MODULE_ID} | runPacedDetection failed:`, err);
  }
}

async function postPacedNarrativeCard(narrationText, playerText, sessionId, suggestedMove) {
  const suggestionClass = suggestedMove ? ' sf-narration-card--with-suggestion' : '';
  const buttonRow = suggestedMove
    ? `<div class="sf-paced-actions"><button type="button" class="sf-paced-roll-btn" data-action="sf-paced-roll">Roll ${escapeChatHtml(formatMoveLabel(suggestedMove))}</button></div>`
    : '';
  return ChatMessage.create({
    content: `
      <div class="sf-narration-card sf-narration-card--paced${suggestionClass}">
        <div class="sf-narration-label">◈ Narrator</div>
        <div class="sf-narration-prose">${narrationText}</div>
        ${buttonRow}
        <div class="sf-narration-footer">
          <button class="sf-audio-play-btn" data-action="audioPlayToggle" aria-label="Play narrator audio" hidden>
            <i class="fas fa-play"></i> Play
          </button>
          <button class="sf-audio-stop-btn" data-action="audioStop" aria-label="Stop narrator audio" hidden>
            <i class="fas fa-stop"></i> Stop
          </button>
          <button class="sf-correct-fact-btn" data-action="openCorrectionDialog" aria-label="Correct a fact">
            <i class="fas fa-list-check"></i> Correct a fact
          </button>
        </div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        narratorCard:     true,
        narrationCard:    true,                  // back-compat
        pacedNarrative:   true,
        narrationText:    narrationText,
        playerText:       playerText,
        suggestedMove:    suggestedMove ?? null,
        sessionId:        sessionId ?? null,
        matchedEntityIds: [],
        timestamp:        new Date().toISOString(),
      },
    },
  });
}

function escapeChatHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoveLabel(moveId) {
  return String(moveId ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || 'Move';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build entity-card strings for the matched entities returned by the relevance
 * resolver. Used to populate the "ENTITIES IN SCENE" section of the narrator
 * system prompt.
 */
function collectEntityCards(ids, types) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const cards = [];
  for (let i = 0; i < ids.length; i++) {
    const journalId = ids[i];
    const type      = types?.[i];
    if (!journalId || !type) continue;
    const getter = ENTITY_GETTERS[type];
    if (!getter) continue;
    let entity = null;
    try {
      entity = getter(journalId);
    } catch (err) {
      console.warn(`${MODULE_ID} | narrator: load entity (${type} ${journalId}) failed:`, err);
      continue;
    }
    if (!entity) continue;
    const card = formatEntityCard(entity, type);
    if (card) cards.push(card);
  }
  return cards;
}

/**
 * Build a { entityId → name } map for the matched entities. Used by the
 * fact-continuity ledger block in narratorPrompt.js so entity-subject lines
 * render with display names rather than journal IDs.
 */
function collectEntityNamesById(ids, types) {
  const map = new Map();
  if (!Array.isArray(ids) || !ids.length) return map;
  for (let i = 0; i < ids.length; i++) {
    const journalId = ids[i];
    const type      = types?.[i];
    if (!journalId || !type) continue;
    const getter = ENTITY_GETTERS[type];
    if (!getter) continue;
    try {
      const e = getter(journalId);
      if (e?.name) map.set(journalId, e.name);
    } catch (err) {
      console.warn(`${MODULE_ID} | narrator: collectEntityNamesById (${type} ${journalId}) failed:`, err);
    }
  }
  return map;
}

/**
 * Build the current-location card from campaignState.currentLocationId.
 * Returns empty string when no current location is set or the record cannot
 * be resolved.
 */
function formatCurrentLocation(campaignState) {
  const id   = campaignState?.currentLocationId;
  const type = campaignState?.currentLocationType;
  if (!id || !type) return '';
  const getter = LOCATION_GETTERS[type];
  if (!getter) return '';
  let entity = null;
  try {
    entity = getter(id);
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: load currentLocation (${type} ${id}) failed:`, err);
    return '';
  }
  if (!entity) return '';
  return formatEntityCard(entity, type);
}

/**
 * Build the active-sector anchor block for the narrator system prompt.
 *
 * The paced-narrative and scene-interrogation narrator paths previously had
 * no sector context whatsoever and would freely invent settlement names for
 * places the player was already inside. The move-pipeline narrator got
 * sector content through `buildSectorSection` in the assembler, but the
 * other two paths never call the assembler.
 *
 * This helper emits a directive block — not just a list — so the model is
 * pushed to *reuse* the established settlement names rather than inventing
 * alternatives. Returns empty string when no active sector is set.
 */
function formatActiveSector(campaignState) {
  const id     = campaignState?.activeSectorId;
  if (!id) return '';
  const sector = (campaignState?.sectors ?? []).find(s => s.id === id);
  if (!sector) return '';

  const lines = [];
  lines.push(`Active sector: ${sector.name}`);
  const regionLabel = sector.regionLabel ?? sector.region;
  if (regionLabel) lines.push(`Region: ${regionLabel}`);
  if (sector.trouble) lines.push(`Trouble: ${sector.trouble}`);
  if (sector.faction) lines.push(`Faction control: ${sector.faction}`);

  const settlements = (sector.mapData?.settlements ?? [])
    .map(s => s?.name)
    .filter(Boolean);
  if (settlements.length) {
    lines.push(
      `Established settlements in this sector: ${settlements.join(', ')}.`,
    );
    lines.push(
      `When the scene is set in a settlement, reuse one of the established ` +
      `names above. Do not invent a new settlement name for the same place.`,
    );
  }

  return lines.join('\n');
}

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

async function postSceneFallbackCard(question, reason, sessionId) {
  return ChatMessage.create({
    content: `
      <div class="sf-scene-card sf-scene-fallback">
        <div class="sf-scene-label">◈ Scene</div>
        <div class="sf-scene-question">${question}</div>
        <div class="sf-scene-error">${reason}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        sceneResponse:    true,
        sceneFallback:    true,
        sceneQuestion:    question,
        sceneFailReason:  reason,
        sessionId:        sessionId ?? null,
      },
    },
  });
}

async function postFallbackCard(resolution, campaignState = null) {
  const moveInfo = resolution?.moveName && resolution?.outcomeLabel
    ? `${resolution.moveName}: ${resolution.outcomeLabel}`
    : 'Move resolved.';
  const fallbackProse = `${moveInfo} — narration unavailable.`;

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
        // Match the success-path narratorCard flag shape so recap readers
        // (`getRecentNarrationContext`, `_collectAllChronicleEntries`) and
        // the live-Quench narrator-card assertion can locate the fallback
        // alongside real narrations.
        narratorCard:      true,
        narrationCard:     true,
        narrationFallback: true,
        narrationText:     fallbackProse,
        sessionId:         campaignState?.currentSessionId ?? null,
        sessionNumber:     campaignState?.sessionNumber     ?? null,
        moveId:            resolution?.moveId               ?? null,
        outcome:           resolution?.outcome              ?? null,
        resolutionId:      resolution?._id                  ?? '',
        matchedEntityIds:  [],
        timestamp:         new Date().toISOString(),
      },
    },
  });
}

/**
 * Process a raw narrator API response: strip the fenced JSON sidecar from
 * the prose, apply it to the active-scene ledgers in campaignState, and
 * persist campaignState in the background. Returns the prose with the
 * sidecar removed. See docs/fact-continuity-scope.md §7–8.
 *
 * Failures (missing block, JSON parse error, persistence write rejected)
 * never block the narrator: the prose is always returned, only ledger
 * updates are skipped.
 *
 * @param {string} rawText
 * @param {Object} campaignState
 * @param {Object} [ctx]
 * @param {string|null} [ctx.moveId]
 * @returns {string} prose with the sidecar block removed
 */
/**
 * Ensure an active fact-continuity scene exists before a narrator call.
 * If `currentSceneId` is null, assigns one by calling startScene with the
 * given reason. Tolerates failure (player clients can't write world
 * settings; the in-memory mutation still happens).
 *
 * @param {Object} campaignState
 * @param {string} reason — diagnostic only ("first_narration", "paced_narrative", …)
 */
async function ensureSceneStarted(campaignState, reason) {
  if (!campaignState) return;
  let enabled = true;
  try {
    enabled = game.settings.get(MODULE_ID, 'factContinuity.enabled') ?? true;
  } catch (err) {
    console.debug?.(`${MODULE_ID} | ensureSceneStarted: setting lookup failed; defaulting to enabled:`, err);
  }
  if (!enabled) return;
  if (campaignState.currentSceneId) return;
  await startScene(campaignState, { reason });
}

function applyNarratorSidecar(rawText, campaignState, ctx = {}) {
  // Master gate — when fact-continuity is disabled, return the raw text
  // unchanged. The sidecar instruction is also suppressed at the prompt
  // layer so well-behaved narrators won't emit a fence in this state, but
  // skip the parse just in case to avoid mutating ledgers silently.
  let enabled = true;
  try {
    enabled = game.settings.get(MODULE_ID, 'factContinuity.enabled') ?? true;
  } catch (err) {
    // Setting not registered (unit tests, very early init). Default to on.
    console.debug?.(`${MODULE_ID} | factContinuity: setting lookup failed; defaulting to enabled:`, err);
  }
  if (!enabled) return rawText;

  const { prose, sidecar, parseError } = extractSidecar(rawText);

  if (parseError) {
    console.warn(`${MODULE_ID} | factContinuity: sidecar parse failed:`, parseError);
  }

  if (sidecar && campaignState) {
    // Fact-continuity §20 — the "ship" subject is special-cased. A
    // stateChange with subject === "ship" and attribute === "position"
    // is routed to the command vehicle's persistent position field,
    // NOT to sceneState. We pull those entries out before applySidecar
    // sees them so the ledger stays clean and the assembler reads the
    // new position from the Ship Actor on the next turn.
    const shipPositionChanges = [];
    const otherChanges = [];
    for (const c of sidecar.stateChanges ?? []) {
      const subject   = typeof c?.subject === 'string' ? c.subject.trim().toLowerCase() : '';
      const attribute = typeof c?.attribute === 'string' ? c.attribute.trim().toLowerCase() : '';
      if (subject === 'ship' && attribute === 'position') {
        shipPositionChanges.push(c);
      } else {
        otherChanges.push(c);
      }
    }
    const filteredSidecar = { ...sidecar, stateChanges: otherChanges };

    try {
      applySidecar(filteredSidecar, {
        campaignState,
        sessionId: campaignState.currentSessionId ?? null,
        sceneId:   campaignState.currentSceneId   ?? null,
        moveId:    ctx.moveId ?? null,
        asserter:  'narrator',
      });
      game.settings.set(MODULE_ID, 'campaignState', campaignState).catch(err =>
        console.warn(`${MODULE_ID} | factContinuity: campaignState persist failed:`, err),
      );
    } catch (err) {
      console.warn(`${MODULE_ID} | factContinuity: applySidecar threw:`, err);
    }

    if (shipPositionChanges.length) {
      applyShipPositionChanges(shipPositionChanges, campaignState).catch(err =>
        console.debug?.(`${MODULE_ID} | shipPosition: sidecar update failed:`, err?.message ?? err),
      );
    }
  }

  // Phase E — optional Haiku audit of the prose against the active-scene
  // ledger. Gated inside runConsistencyCheck on the
  // factContinuity.consistencyCheck setting; fire-and-forget.
  if (campaignState && prose?.trim()) {
    runConsistencyCheck(prose, campaignState, {
      matchedEntityIds:  ctx.matchedEntityIds ?? [],
      currentLocationId: campaignState.currentLocationId ?? null,
      playerNarration:   ctx.playerNarration ?? '',
    }).catch(err =>
      console.warn(`${MODULE_ID} | factContinuity: consistencyCheck dispatch failed:`, err),
    );
  }

  return prose ?? rawText;
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

/**
 * Read the audio.enabled world toggle. Used by buildNarratorSystemPrompt
 * call sites to conditionally include the NPC-markup instruction.
 * Defaults to false (audio is opt-in).
 */
function audioMarkupEnabledFromSettings() {
  try {
    return game.settings.get(MODULE_ID, 'audio.enabled') === true;
  } catch {
    return false;
  }
}

function getNarratorSettings() {
  try {
    return {
      narrationEnabled:        game.settings.get(MODULE_ID, 'narrationEnabled')      ?? true,
      narrationModel:          game.settings.get(MODULE_ID, 'narrationModel')        ?? 'claude-sonnet-4-5-20250929',
      narrationPerspective:    game.settings.get(MODULE_ID, 'narrationPerspective')  ?? 'auto',
      narrationTone:           game.settings.get(MODULE_ID, 'narrationTone')         ?? 'wry',
      narrationLength:         game.settings.get(MODULE_ID, 'narrationLength')       ?? 3,
      narrationInstructions:   game.settings.get(MODULE_ID, 'narrationInstructions') ?? '',
      narrationMaxTokens:      game.settings.get(MODULE_ID, 'narrationMaxTokens')    ?? 300,
      factContinuityEnabled:        game.settings.get(MODULE_ID, 'factContinuity.enabled')          ?? true,
      factContinuityLedgerInContext:game.settings.get(MODULE_ID, 'factContinuity.ledgerInContext')  ?? true,
      factContinuityMaxLedgerTokens:game.settings.get(MODULE_ID, 'factContinuity.maxLedgerTokens')  ?? 400,
    };
  } catch (err) {
    console.error(`${MODULE_ID} | narrator: getNarratorSettings failed; falling back to hardcoded defaults:`, err);
    return {
      narrationEnabled:        true,
      narrationModel:          'claude-sonnet-4-5-20250929',
      narrationPerspective:    'auto',
      narrationTone:           'wry',
      narrationLength:         3,
      narrationInstructions:   '',
      narrationMaxTokens:      300,
      factContinuityEnabled:         true,
      factContinuityLedgerInContext: true,
      factContinuityMaxLedgerTokens: 400,
      _error:                err,
    };
  }
}

function getApiKey() {
  try {
    return game.settings.get(MODULE_ID, 'claudeApiKey') || null;
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: claudeApiKey settings read failed:`, err);
    return null;
  }
}

function getActiveCharacter(campaignState, speakerActorId = null) {
  try {
    // Prefer the speaker if one was resolved upstream from the chat
    // message author — without this, every narration in a 2-player
    // session described whichever PC happened to be first in
    // campaignState, regardless of who actually typed.
    const ids = speakerActorId
      ? [speakerActorId]
      : _resolveCharacterIds(campaignState);
    if (!ids.length) return null;
    const actor = game.actors?.get?.(ids[0]);
    if (!actor) return null;
    const snap = readCharacterSnapshot(actor);
    if (!snap) return null;
    const notes = actor.getFlag?.(MODULE_ID, 'narratorNotes')
      ?? actor.system?.biography
      ?? '';
    return {
      name:           snap.name,
      description:    actor.system?.description ?? '',
      narratorNotes:  notes,
      meters:         snap.meters,
    };
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: getActiveCharacter failed:`, err);
    return null;
  }
}

function getSceneQueryEnabled() {
  try {
    return game.settings.get(MODULE_ID, 'sceneQueryEnabled') ?? true;
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: sceneQueryEnabled settings read failed:`, err);
    return true;
  }
}

function getSceneResponseLength() {
  try {
    return game.settings.get(MODULE_ID, 'sceneResponseLength') ?? 2;
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: sceneResponseLength settings read failed:`, err);
    return 2;
  }
}

function getSceneContextCards() {
  try {
    return game.settings.get(MODULE_ID, 'sceneContextCards') ?? 3;
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: sceneContextCards settings read failed:`, err);
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

// campaignState.characterIds is never written by the module, so the stored
// value is effectively always []. Fall back to actorBridge — the same source
// the assembler uses — so the recap actually reads chronicle entries.
function _resolveCharacterIds(campaignState) {
  const ids = campaignState?.characterIds ?? [];
  if (ids.length) return ids;
  try {
    return getPlayerActors().map(a => a.id);
  } catch {
    return [];
  }
}

/**
 * Aggregate chronicle entries (oldest first) across every PC in the campaign.
 * Each entry is annotated with `actorId` so a single combined sort by
 * timestamp produces a coherent campaign timeline.
 */
async function _collectAllChronicleEntries(campaignState) {
  const ids = _resolveCharacterIds(campaignState);
  if (!ids.length) return [];

  const aggregated = [];
  for (const actorId of ids) {
    try {
      const entries = await getChronicleEntries(actorId);
      for (const entry of entries ?? []) {
        if (entry) aggregated.push({ ...entry, _actorId: actorId });
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | narrator: getChronicleEntries(${actorId}) failed:`, err);
    }
  }

  aggregated.sort((a, b) => {
    const ta = a.timestamp ?? '';
    const tb = b.timestamp ?? '';
    if (ta === tb) return 0;
    return ta < tb ? -1 : 1;
  });
  return aggregated;
}

/**
 * Count chronicle entries across every PC. Used to detect stale recap caches.
 */
async function _getChronicleLength(campaignState) {
  try {
    const entries = await _collectAllChronicleEntries(campaignState);
    return entries.length;
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: _getChronicleLength failed:`, err);
    return 0;
  }
}

/**
 * Read chronicle entries as formatted strings for the campaign recap prompt.
 */
async function _getChronicleEntries(campaignState) {
  try {
    const entries = await _collectAllChronicleEntries(campaignState);
    return entries.map(e => {
      const date    = e.timestamp ? new Date(e.timestamp).toLocaleDateString() : '';
      const session = e.sessionNumber ? `Session ${e.sessionNumber}` : '';
      const header  = [session, date].filter(Boolean).join(' — ');
      const body    = e.text ?? e.content ?? '';
      return header ? `[${header}]\n${body}` : body;
    }).filter(Boolean);
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: _getChronicleEntries failed:`, err);
    return [];
  }
}

/**
 * Apply sidecar state changes with subject === "ship" and attribute ===
 * "position" to the command vehicle's persistent position record
 * (fact-continuity scope §20.4). Multiple entries collapse to the last
 * — the narrator only meaningfully asserts one position per turn, and
 * preserving every intermediate is noise.
 *
 * Quietly no-ops when no command vehicle is registered or the feature
 * is gated off. Errors are swallowed at debug — the narrator's
 * primary output (the prose) has already posted by this point.
 */
async function applyShipPositionChanges(changes, campaignState) {
  if (!Array.isArray(changes) || !changes.length) return;
  // Feature gate is checked lazily so this module stays import-safe in
  // unit tests where `game.settings` may be partial.
  let enabled = true;
  try { enabled = game.settings.get(MODULE_ID, 'factContinuity.shipPositioning') !== false; }
  catch { enabled = true; }
  if (!enabled) return;
  if (!game.user?.isGM) return;

  const last = changes[changes.length - 1];
  const dest = typeof last?.value === 'string' ? last.value.trim() : '';
  if (!dest) return;

  try {
    const { getCommandVehicle, updateShip } = await import('../entities/ship.js');
    const cv = getCommandVehicle(campaignState);
    if (!cv?._id) return;
    const position = inferShipPosition(dest, campaignState, { source: 'narrator_sidecar' });
    await updateShip(cv._id, { position });
  } catch (err) {
    console.debug?.(`${MODULE_ID} | shipPosition: sidecar update for "${dest}" failed:`, err?.message ?? err);
  }
}
