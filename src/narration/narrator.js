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
import { resolveRelevance, collectAllEntities } from '../context/relevanceResolver.js';
import { extractSidecar }     from '../factContinuity/sidecarParser.js';
import { applySidecar, applySceneFrame } from '../factContinuity/ledgers.js';
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
import { getConnection, listConnections }  from '../entities/connection.js';
import { getSettlement, listSettlements }  from '../entities/settlement.js';
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
// alongside narrator prose. Sized for the post-Cluster-A contract: required
// stateChanges (NPC location/condition, ~45–90 tokens on an active turn) +
// newTruths for intent/stakes (~20–60) + the sceneFrame snapshot (~50–75) +
// fence/key overhead (~25) — a heavy turn runs ~240–290 and the
// inciting-incident premise addendum can reach ~400. We budget 500 so the
// tightest call sites (@scene at base 200) cannot clip the sidecar even on a
// full-length answer. maxTokens is a cap, not a target — unused headroom
// costs nothing. A truncated sidecar is silently expensive now: the
// defensive strip in extractSidecar keeps the prose clean, but the turn
// loses its frame update and required emissions (watch for the
// "truncated by maxTokens" parseError warning in console).
const SIDECAR_TOKEN_HEADROOM = 500;

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
  // See docs/fact-continuity/fact-continuity-scope.md §9.1.
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
      party:               buildPartyContext(character?.name ?? null),
      audioMarkupEnabled:  audioMarkupEnabledFromSettings(),
    },
  );
  const userMessage  = buildNarratorUserMessage(
    resolution,
    resolution.playerNarration ?? '',
    settings.narrationLength,
    character?.name ?? null,
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
export async function interrogateScene(question, campaignState, options = {}) {
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
  // Multiplayer speaker disambiguation — the @scene intercept passes the
  // resolved speaker (token selection / author binding / ownership).
  // `actorId` is the legacy option name; both are honoured.
  const speakerActorId = options?.speakerActorId ?? options?.actorId ?? null;
  const character      = getActiveCharacter(campaignState, speakerActorId);
  // The @scene intercept in index.js already calls startScene; this guard
  // covers any direct interrogateScene callers that bypass the chat hook.
  await ensureSceneStarted(campaignState, 'first_narration_scene_interrogation');
  // SECTOR-001 anchors (see formatActiveSector() above) ensure paced and
  // scene-query paths get the same establishments + current-location
  // context as the move-pipeline path.
  const currentLocationCard = formatCurrentLocation(campaignState);
  const activeSectorBlock   = formatActiveSector(campaignState);

  // Narrator-memory A2.5 — lexical relevance on the scene path, same as
  // paced narration: matched entity cards + real ledger scoping.
  const relevance = await resolvePathRelevance(question, campaignState);

  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '',
    {
      mode:            'scene_interrogation',
      playerNarration: question,
      currentLocationCard,
      activeSectorBlock,
      entityCards:      relevance.entityCards,
      matchedEntityIds: relevance.entityIds,
      entityNamesById:  relevance.entityNamesById,
      party:            buildPartyContext(character?.name ?? null),
      audioMarkupEnabled: audioMarkupEnabledFromSettings(),
    },
  );

  const contextLimit  = getSceneContextCards();
  const recentContext = getRecentNarrationContext(sessionId, contextLimit);
  const sentenceTarget = getSceneResponseLength();
  const userMessage   = buildSceneUserMessage(
    question, recentContext, sentenceTarget, character?.name ?? null,
  );

  try {
    const raw = await callNarratorAPI({
      apiKey,
      systemPrompt,
      userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(200),
    });
    const response = applyNarratorSidecar(raw, campaignState, {
      moveId: null, playerNarration: question, matchedEntityIds: relevance.entityIds,
    });

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
        const response = applyNarratorSidecar(raw, campaignState, {
          moveId: null, playerNarration: question, matchedEntityIds: relevance.entityIds,
        });
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
 * Append a narration card after a raw oracle / table chat-command card. The
 * raw card has already been posted by the caller; this helper posts a follow-
 * up card flagged `oracleNarrationCard: true` that renders the rolled result
 * as 2–3 sentences of in-fiction prose in the configured tone.
 *
 * Silent skip — no fallback card, no error toast — when any of these is true:
 *   - the Claude API key is unset (so the feature is opt-in via key config)
 *   - the X-Card is active (scene paused; never narrate during suppression)
 *   - the narrator-enabled toggle is off in module settings
 *
 * Reuses the narrator's `oracle_followup` mode (added to
 * narratorPrompt.js's ROLE_DESCRIPTIONS) so safety / tone / perspective /
 * length / sector / location / character context all flow through the same
 * `buildNarratorSystemPrompt` path the move pipeline uses.
 *
 * @param {Object}  args
 * @param {string}  args.kind            — `oracle_yes_no` | `pay_the_price` (extensible)
 * @param {string}  args.oracleName      — e.g. "Ask the Oracle (50/50)" or "Pay the Price"
 * @param {string}  [args.question]      — optional player-supplied question text
 * @param {string}  args.rolledLine      — the structured roll line, e.g.
 *                                          "d100 = 47 → An ally is exposed to harm"
 * @param {Object}  args.campaignState
 * @returns {Promise<string|null>} the rendered narration text or null on silent skip / failure
 */
export async function narrateOracleFollowup({
  kind, oracleName, question = '', rolledLine, campaignState,
}) {
  const sessionId = campaignState?.currentSessionId ?? null;

  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) return null;

  if (campaignState?.xCardActive) return null;

  const apiKey = getApiKey();
  if (!apiKey) return null;

  const character = getActiveCharacter(campaignState);
  // Reuse the same sector + current-location anchors the paced / scene paths
  // use so the narrator references the right place + established names.
  const currentLocationCard = formatCurrentLocation(campaignState);
  const activeSectorBlock   = formatActiveSector(campaignState);
  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '',
    {
      mode:               'oracle_followup',
      playerNarration:    question,
      currentLocationCard,
      activeSectorBlock,
      audioMarkupEnabled: audioMarkupEnabledFromSettings(),
    },
  );

  const sentenceTarget = settings.narrationLength ?? 3;
  const recentContext  = getRecentNarrationContext(sessionId, getNarratorContextCards());
  const userMessage    = buildOracleUserMessage({
    oracleName, question, rolledLine, recentContext, sentenceTarget,
  });

  try {
    const raw = await callNarratorAPI({
      apiKey, systemPrompt, userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(220),
    });
    const text = applyNarratorSidecar(raw, campaignState, { moveId: null, playerNarration: question });

    if (!text?.trim()) return null;

    await postOracleNarrationCard({ text, kind, oracleName, sessionId });
    return text;
  } catch (err) {
    if (isRateLimit(err)) {
      try {
        await delay(RETRY_DELAY_MS);
        const raw = await callNarratorAPI({
          apiKey, systemPrompt, userMessage,
          model:     settings.narrationModel,
          maxTokens: maxTokensWithSidecar(220),
        });
        const text = applyNarratorSidecar(raw, campaignState, { moveId: null, playerNarration: question });
        if (text?.trim()) {
          await postOracleNarrationCard({ text, kind, oracleName, sessionId });
          return text;
        }
      } catch (retryErr) {
        console.error(`${MODULE_ID} | narrateOracleFollowup retry failed:`, retryErr);
      }
    }
    console.error(`${MODULE_ID} | narrateOracleFollowup failed:`, err);
    return null;
  }
}

function buildOracleUserMessage({
  oracleName, question, rolledLine, recentContext, sentenceTarget,
}) {
  const recent = (recentContext && recentContext.length > 0)
    ? `\n\nRECENT NARRATION (most recent last):\n${recentContext.join('\n\n---\n\n')}`
    : '';
  const q = question?.trim() ? `Question or context: ${question.trim()}\n` : '';
  return (
    `The player invoked the oracle:\n` +
    `Oracle: ${oracleName}\n` +
    q +
    `Mechanical result: ${rolledLine}\n` +
    `${recent}\n\n` +
    `Render this result as ${sentenceTarget} sentence(s) of in-fiction prose anchored to ` +
    `the current scene. Do not repeat the dice number or the literal table text — transform ` +
    `it into narrative.`
  );
}

async function postOracleNarrationCard({ text, kind, oracleName, sessionId }) {
  const header = oracleName || (kind === 'pay_the_price' ? 'Pay the Price' : 'Oracle');
  await ChatMessage.create({
    content: `<div class="sf-oracle-narration-card"><strong>${escapeHtml(header)} — narration</strong><p>${escapeHtml(text)}</p></div>`,
    flags:   {
      [MODULE_ID]: {
        oracleNarrationCard: true,
        narrationKind:       kind,
        sessionId:           sessionId ?? '',
      },
    },
  });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a Begin Session opening vignette via the narrator API and return the
 * prose text. The caller is responsible for posting the chat card; see
 * `src/session/galleyVignette.js` for the participant-enumeration + card-post
 * wrapper.
 *
 * Silent skip with `null` return when the Claude API key is unset, the
 * narrator-enabled toggle is off, or the X-Card is active.
 *
 * Tone is overridden to wry+absurd via the `session_vignette` mode (see
 * narratorPrompt.js ROLE_DESCRIPTIONS) regardless of any campaign tone
 * setting — Begin Session is always intentionally light.
 *
 * @param {Object} args
 * @param {string} args.userMessage    — pre-built vignette prompt body
 *                                       (active/absent rosters, sector context,
 *                                       generation instructions)
 * @param {Object} args.campaignState
 * @returns {Promise<string|null>}
 */
export async function narrateSessionVignette({ userMessage, campaignState }) {
  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) return null;
  if (campaignState?.xCardActive)  return null;

  const apiKey = getApiKey();
  if (!apiKey) return null;

  const character = getActiveCharacter(campaignState);
  const currentLocationCard = formatCurrentLocation(campaignState);
  const activeSectorBlock   = formatActiveSector(campaignState);
  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '',
    {
      mode:               'session_vignette',
      playerNarration:    '',
      currentLocationCard,
      activeSectorBlock,
      audioMarkupEnabled: audioMarkupEnabledFromSettings(),
    },
  );

  try {
    const raw = await callNarratorAPI({
      apiKey, systemPrompt, userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(380),  // 4-6 sentences, comfortable headroom
    });
    const text = applyNarratorSidecar(raw, campaignState, { moveId: null, playerNarration: '' });
    return (text && text.trim()) ? text : null;
  } catch (err) {
    if (isRateLimit(err)) {
      try {
        await delay(RETRY_DELAY_MS);
        const raw = await callNarratorAPI({
          apiKey, systemPrompt, userMessage,
          model:     settings.narrationModel,
          maxTokens: maxTokensWithSidecar(380),
        });
        const text = applyNarratorSidecar(raw, campaignState, { moveId: null, playerNarration: '' });
        return (text && text.trim()) ? text : null;
      } catch (retryErr) {
        console.error(`${MODULE_ID} | narrateSessionVignette retry failed:`, retryErr);
      }
    }
    console.error(`${MODULE_ID} | narrateSessionVignette failed:`, err);
    return null;
  }
}

/**
 * Compose the campaign's inciting incident — the dramatic opening event that
 * launches the campaign and sets up the first vow (rulebook "Begin your
 * adventure", step 1). Grounded in the established World Truths, starting
 * sector, local connection, and character, plus the oracle spark carried in
 * `userMessage`. Returns prose (4-6 sentences) ending with a single
 * `Suggested vow: … (<rank>)` line, or null when narration is disabled / no key
 * / the call fails (the caller falls back to an oracle-spark-only card).
 *
 * @param {{ userMessage: string, campaignState: Object }} args
 * @returns {Promise<string|null>}
 */
export async function narrateIncitingIncident({ userMessage, campaignState }) {
  const settings = getNarratorSettings();
  if (!settings.narrationEnabled) return null;
  if (campaignState?.xCardActive)  return null;

  const apiKey = getApiKey();
  if (!apiKey) return null;

  const character = getActiveCharacter(campaignState);
  const currentLocationCard = formatCurrentLocation(campaignState);
  const activeSectorBlock   = formatActiveSector(campaignState);
  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '',
    {
      mode:               'inciting_incident',
      playerNarration:    '',
      currentLocationCard,
      activeSectorBlock,
      audioMarkupEnabled: audioMarkupEnabledFromSettings(),
    },
  );

  const run = async () => {
    const raw = await callNarratorAPI({
      apiKey, systemPrompt, userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(480),  // 4-6 sentences + the suggested-vow line
    });
    const text = applyNarratorSidecar(raw, campaignState, { moveId: null, playerNarration: '' });
    return (text && text.trim()) ? text : null;
  };

  try {
    return await run();
  } catch (err) {
    if (isRateLimit(err)) {
      try {
        await delay(RETRY_DELAY_MS);
        return await run();
      } catch (retryErr) {
        console.error(`${MODULE_ID} | narrateIncitingIncident retry failed:`, retryErr);
      }
    }
    console.error(`${MODULE_ID} | narrateIncitingIncident failed:`, err);
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

  // Narrator-memory A2.5 — run the relevance resolver on the paced path so
  // matched entity records are injected as ENTITIES IN SCENE cards and the
  // ledger's entity scoping works off real matched IDs. With moveId=null the
  // resolver is purely lexical (no API call). Scene-frame `present` names
  // are unioned into the match text so the active conversation partner's
  // record stays injected even on turns that don't name them.
  const relevance = await resolvePathRelevance(playerText, campaignState);

  const systemPrompt = buildNarratorSystemPrompt(
    campaignState, settings, character, '',
    {
      mode:            'paced_narrative',
      playerNarration: playerText,
      currentLocationCard,
      activeSectorBlock,
      entityCards:      relevance.entityCards,
      matchedEntityIds: relevance.entityIds,
      entityNamesById:  relevance.entityNamesById,
      party:            buildPartyContext(character?.name ?? null),
      audioMarkupEnabled: audioMarkupEnabledFromSettings(),
    },
  );

  const recentContext = getRecentNarrationContext(sessionId, getNarratorContextCards());
  const sentenceTarget = settings.narrationLength ?? 3;
  const userMessage = buildPacedNarrativeUserMessage(
    playerText, recentContext, sentenceTarget, suggestedMove, character?.name ?? null,
  );

  try {
    const raw = await callNarratorAPI({
      apiKey, systemPrompt, userMessage,
      model:     settings.narrationModel,
      maxTokens: maxTokensWithSidecar(settings.narrationMaxTokens),
    });
    const text = applyNarratorSidecar(raw, campaignState, {
      moveId: null, playerNarration: playerText, matchedEntityIds: relevance.entityIds,
    });

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
        const text = applyNarratorSidecar(raw, campaignState, {
          moveId: null, playerNarration: playerText, matchedEntityIds: relevance.entityIds,
        });
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
export function formatActiveSector(campaignState) {
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

  // Established settlements WITH their rolled attributes (PLAYTEST-1712 T).
  // Surfacing each settlement's Authority and Trouble stops the narrator
  // inventing an official or governing figure for a settlement whose Authority
  // is "none / lawless" (the playtest created an "Administrator of Hypatia" for
  // a lawless settlement), and anchors new fiction to the established troubles.
  // Falls back to the map-data names when the Settlement Actor records can't be
  // read (e.g. mid-migration).
  let settlementLines = [];
  try {
    settlementLines = listSettlements(campaignState)
      .filter(s => s && (!s.sectorId || s.sectorId === id))
      .map(s => {
        const bits = [];
        if (s.authority) bits.push(`Authority: ${s.authority}`);
        if (s.trouble)   bits.push(`Trouble: ${s.trouble}`);
        return `- ${s.name}${bits.length ? ` (${bits.join('; ')})` : ''}`;
      });
  } catch (err) {
    console.debug?.(`${MODULE_ID} | formatActiveSector: settlement read failed:`, err?.message ?? err);
  }
  if (!settlementLines.length) {
    settlementLines = (sector.mapData?.settlements ?? [])
      .map(s => s?.name).filter(Boolean).map(n => `- ${n}`);
  }
  if (settlementLines.length) {
    lines.push(
      '',
      'Established settlements (reuse these names and respect each one\'s ' +
      'Authority and Trouble — do not invent a new settlement for the same ' +
      'place, and do not introduce an official, administrator, or governing ' +
      'figure for a settlement whose Authority is none or lawless):',
      ...settlementLines,
    );
  }

  // Established NPCs in this sector (PLAYTEST-1712 T). Listing the existing cast
  // with their roles pushes the narrator to build on them — especially when
  // envisioning an inciting incident — rather than always cold-inventing a new
  // NPC. Capped so a large campaign can't bloat the prompt.
  let npcLines = [];
  try {
    npcLines = listConnections(campaignState)
      .filter(c => c && (!c.sectorId || c.sectorId === id))
      .slice(0, 12)
      .map(c => `- ${c.name}${c.role ? ` — ${c.role}` : ''}`);
  } catch (err) {
    console.debug?.(`${MODULE_ID} | formatActiveSector: connection read failed:`, err?.message ?? err);
  }
  if (npcLines.length) {
    lines.push(
      '',
      'Established NPCs in this sector (prefer building on these — their goals, ' +
      'troubles, and relationships — over inventing parallel new ones):',
      ...npcLines,
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
        // Narrator-memory A1 — scene answers are narrator prose and feed
        // the recent-narration ring + session recap. Audited consumers:
        // the correction/audio render hooks no-op (no button markup on
        // this card), burn-supersede requires a resolutionId.
        narratorCard:  true,
        narrationText: responseText,
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
 * sidecar removed. See docs/fact-continuity/fact-continuity-scope.md §7–8.
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
      // Narrator-memory A2 — resolve sidecar subjects against the full
      // entity roster so a confirmed NPC's truths/state land entity-keyed
      // (not as text subjects). Without this, entity-scoped ledger
      // filtering never matches and entries are only found by name
      // mention. Tolerant: an empty roster degrades to text subjects.
      let entities = [];
      try {
        entities = collectAllEntities(campaignState);
      } catch (err) {
        console.debug?.(`${MODULE_ID} | factContinuity: entity roster collect failed:`, err?.message ?? err);
      }

      applySidecar(filteredSidecar, {
        campaignState,
        sessionId: campaignState.currentSessionId ?? null,
        sceneId:   campaignState.currentSceneId   ?? null,
        moveId:    ctx.moveId ?? null,
        asserter:  'narrator',
        entities,
      });

      // Narrator-memory A4 — merge the scene-frame snapshot (full
      // replacement; omitted frame keeps the previous one). Gated on its
      // own setting so the frame can be disabled independently.
      let frameEnabled = true;
      try {
        frameEnabled = game.settings.get(MODULE_ID, 'factContinuity.sceneFrame') ?? true;
      } catch (err) {
        // Unregistered (unit tests, early init) — default on.
        console.debug?.(`${MODULE_ID} | factContinuity: sceneFrame setting read failed:`, err?.message ?? err);
      }
      if (frameEnabled && sidecar.sceneFrame) {
        applySceneFrame(sidecar.sceneFrame, campaignState);
      }

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

/**
 * Multiplayer speaker disambiguation — build the PARTY section payload for
 * buildNarratorSystemPrompt extras. Returns null in solo play (one PC or
 * fewer): no roster, no prompt cost. The speaking name comes from the
 * already-resolved active character so the roster and the CHARACTER block
 * always agree.
 *
 * @param {string|null} speakingName
 * @returns {{ names: string[], speaking: string|null }|null}
 */
function buildPartyContext(speakingName = null) {
  try {
    const names = (getPlayerActors() ?? [])
      .map(a => a?.name)
      .filter(n => typeof n === 'string' && n.trim());
    if (names.length < 2) return null;
    return { names, speaking: speakingName ?? null };
  } catch (err) {
    console.debug?.(`${MODULE_ID} | narrator: party context build failed:`, err?.message ?? err);
    return null;
  }
}

/**
 * Narrator-memory A2.5 — relevance resolution for the non-move narrator
 * paths (paced narrative, scene interrogation). Purely lexical: moveId is
 * null, so resolveRelevance never reaches its Haiku Phase-2 classifier.
 *
 * The active scene frame's `present` names are unioned into the match text
 * so entities who are in the scene stay matched — and therefore keep their
 * ENTITIES IN SCENE card and their entity-scoped ledger entries — on turns
 * where the player's own message doesn't name them ("What does that even
 * mean?"). See docs/narrator/narrator-memory-architecture.md.
 *
 * Never throws; returns empty arrays on any failure so narration proceeds
 * with the thinner context rather than failing the turn.
 *
 * @param {string} playerText
 * @param {Object} campaignState
 * @returns {Promise<{ entityIds: string[], entityCards: string[],
 *                     entityNamesById: Map<string,string> }>}
 */
async function resolvePathRelevance(playerText, campaignState) {
  const empty = { entityIds: [], entityCards: [], entityNamesById: new Map() };
  try {
    const present = Array.isArray(campaignState?.sceneFrame?.present)
      ? campaignState.sceneFrame.present.filter(p => typeof p === 'string' && p.trim())
      : [];
    const matchText = present.length
      ? `${playerText ?? ''}\n${present.join(', ')}`
      : (playerText ?? '');

    const relevance = await resolveRelevance(matchText, null, null, campaignState);
    const ids   = relevance?.entityIds   ?? [];
    const types = relevance?.entityTypes ?? [];
    return {
      entityIds:       ids,
      entityCards:     collectEntityCards(ids, types),
      entityNamesById: collectEntityNamesById(ids, types),
    };
  } catch (err) {
    console.warn(`${MODULE_ID} | narrator: path relevance resolution failed:`, err);
    return empty;
  }
}

/**
 * Narrator-memory A3 — how many recent narrator cards feed the paced /
 * oracle-followup user message. World setting `narratorContextCards`,
 * default 3, clamped 1–10. Scene interrogation keeps its own
 * `sceneContextCards` setting.
 */
function getNarratorContextCards() {
  try {
    const v = Number(game.settings.get(MODULE_ID, 'narratorContextCards'));
    if (!Number.isFinite(v)) return 3;
    return Math.max(1, Math.min(10, Math.round(v)));
  } catch {
    return 3;
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
      factContinuitySceneFrame:     game.settings.get(MODULE_ID, 'factContinuity.sceneFrame')       ?? true,
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
      factContinuitySceneFrame:      true,
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

export function getActiveCharacter(campaignState, speakerActorId = null) {
  try {
    // Prefer the speaker if one was resolved upstream from the chat
    // message (token selection / author binding / ownership) — without
    // this, every narration in a 2-player session described whichever PC
    // happened to be first in campaignState, regardless of who actually
    // typed. A stale speaker id (deleted actor) falls back to the
    // campaign's resolved PCs rather than dropping character context.
    const ids = speakerActorId
      ? [speakerActorId, ..._resolveCharacterIds(campaignState)]
      : _resolveCharacterIds(campaignState);
    if (!ids.length) return null;
    let actor = null;
    for (const id of ids) {
      actor = game.actors?.get?.(id);
      if (actor) break;
    }
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
    const { getCommandVehicleActorId, updateShip } = await import('../entities/ship.js');
    // updateShip resolves by Actor id — the record's `_id` is a module GUID
    // and threw "Ship actor not found" on every write here (finding #5).
    const cvActorId = getCommandVehicleActorId(campaignState);
    if (!cvActorId) return;
    const position = inferShipPosition(dest, campaignState, { source: 'narrator_sidecar' });
    await updateShip(cvActorId, { position });

    // Cluster C — the map follows the fiction (see index.js
    // maybeUpdateShipPositionFromName for the chat-command twin).
    const { syncCommandVehicleTokenToPosition } = await import('../sectors/sectorSceneHooks.js');
    await syncCommandVehicleTokenToPosition(position, campaignState).catch(err =>
      console.debug?.(`${MODULE_ID} | shipPosition: sidecar token sync failed:`, err?.message ?? err));
  } catch (err) {
    console.debug?.(`${MODULE_ID} | shipPosition: sidecar update for "${dest}" failed:`, err?.message ?? err);
  }
}
