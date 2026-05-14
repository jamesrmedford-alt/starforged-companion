/**
 * STARFORGED COMPANION
 * src/index.js — Module entry point
 *
 * Session 3 changes:
 *   — confirmInterpretation() stub removed; real dialog imported from ui/settingsPanel.js
 *   — persistResolution() stub removed; full implementation imported from moves/persistResolution.js
 *   — mischiefLevel setting removed; now mischiefDial registered by ui/settingsPanel.js
 *   — UI panels (progressTracks, entityPanel, settingsPanel) wired via toolbar buttons
 *   — All three UI hook registrations called from ready hook
 *
 * Post-session 3 fixes:
 *   — buildMischiefAside called with correct four-argument signature
 *   — getSceneControlButtons updated for Foundry v13 (controls is Object, not Array)
 *   — message.author → message.user (Foundry v13 rename)
 *   — CONST.CHAT_MESSAGE_TYPES replaced with string literals (v13 compatibility)
 *   — injectPushToTalkButton rewritten without jQuery (removed in v13)
 *
 * Narrator feature (replaces Loremaster):
 *   — loremaster.js deleted; no more @lm socket relay or GM-account dependency
 *   — narrateResolution() from narration/narrator.js replaces triggerLoremaster()
 *   — Narration runs on whichever client triggered the move
 */

import { CampaignStateSchema }   from "./schemas.js";
import { assembleContextPacket } from "./context/assembler.js";
import { interpretMove }         from "./moves/interpreter.js";
import { resolveMove }           from "./moves/resolver.js";
import { buildMischiefAside }    from "./moves/mischief.js";
import { persistResolution }     from "./moves/persistResolution.js";
import { initSpeechInput }       from "./input/speechInput.js";
import {
  narrateResolution,
  interrogateScene,
  postSessionRecap,
  postCampaignRecap,
} from "./narration/narrator.js";
import { invalidateActorCache, recalculateMomentumBounds } from "./character/actorBridge.js";
import { openChroniclePanel } from "./character/chroniclePanel.js";
import { ensureHelpJournal } from "./help/helpJournal.js";
import { openSectorCreator } from "./sectors/sectorPanel.js";
import { openSystemTruthsDialog, generateLoreRecap } from "./truths/generator.js";

import {
  openProgressTracks,
  registerProgressTrackHooks,
} from "./ui/progressTracks.js";

import {
  openEntityPanel,
  registerEntityPanelHooks,
} from "./ui/entityPanel.js";

import {
  confirmInterpretation,
  registerSettings    as registerUISettings,
  registerSettingsHooks,
  openSettingsPanel,
  getMischiefDial,
  getAutoRecapEnabled,
  getSessionGapHours,
  getRecapGmOnly,
} from "./ui/settingsPanel.js";

import {
  initWorldJournals,
  parseJournalCommand,
  executeJournalCommand,
} from "./world/worldJournal.js";

import {
  openWorldJournalPanel,
} from "./world/worldJournalPanel.js";

import { resolveRelevance } from "./context/relevanceResolver.js";
import { suppressScene } from "./context/safety.js";
import { startScene, endScene } from "./factContinuity/sceneLifecycle.js";
import { openCorrectionDialog } from "./factContinuity/correctionDialog.js";
import {
  strikeTruth as fcStrikeTruth,
  setTruth as fcSetTruth,
  strikeStateValue as fcStrikeStateValue,
  setStateValue as fcSetStateValue,
  resolveSubject as fcResolveSubject,
  subjectKey as fcSubjectKey,
} from "./factContinuity/ledgers.js";
import {
  routePacedInput,
  applyPaceCommand,
  markForceNextAsMove,
  resetRecentDensity,
} from "./pacing/router.js";
import {
  isEncounterCommand,
  parseEncounterCommand,
  spawnEncounter,
} from "./system/encounterSpawn.js";
import {
  ClarificationDialog,
  applyClarificationSelection,
} from "./world/clarificationDialog.js";
import { registerDraftCardHooks } from "./entities/entityExtractor.js";

const MODULE_ID = "starforged-companion";

// In-flight !journal command promise. Foundry's createChatMessage hook is
// fire-and-forget for async handlers, so callers (notably integration tests)
// have no way to await the journal write chain after posting the message.
// We assign this synchronously inside the hook before the first await so
// callers can read it right after `await ChatMessage.create(...)` resolves.
let _lastJournalCommandWork = null;
export function getLastJournalCommandPromise() {
  return _lastJournalCommandWork;
}

/**
 * Read the fact-continuity master toggle. Defaults to enabled when the
 * setting hasn't been registered (early init, unit-test contexts).
 */
function factContinuityEnabledFromSettings() {
  try {
    return game.settings?.get(MODULE_ID, "factContinuity.enabled") !== false;
  } catch {
    return true;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────

function registerCoreSettings() {
  game.settings.register(MODULE_ID, "campaignState", {
    name:    "Campaign State",
    hint:    "Persistent campaign data including World Truths, safety config, and entity records.",
    scope:   "world",
    config:  false,
    type:    Object,
    default: { ...CampaignStateSchema },
  });

  game.settings.register(MODULE_ID, "claudeApiKey", {
    name:    "Claude API Key",
    hint:    "Your Anthropic API key. Stored locally in your browser — never sent to Foundry's server.",
    scope:   "client",
    config:  false,
    type:    String,
    default: "",
  });

  // OpenRouter API key — the user's BYOK credential for image generation.
  // OpenRouter is the only image backend; calls go directly from the browser
  // to openrouter.ai/api/v1/chat/completions.
  game.settings.register(MODULE_ID, "openRouterApiKey", {
    name:    "OpenRouter API Key",
    hint:    "OpenRouter API key for image generation. Get one at openrouter.ai. Stored locally in your browser.",
    scope:   "client",
    config:  false,
    type:    String,
    default: "",
  });

  game.settings.register(MODULE_ID, "openRouterImageModel", {
    name:    "OpenRouter Image Model",
    hint:    "OpenRouter model identifier for image generation. Default: black-forest-labs/flux.2-pro.",
    scope:   "world",
    config:  true,
    type:    String,
    default: "black-forest-labs/flux.2-pro",
  });

  game.settings.register(MODULE_ID, "locationArtSource", {
    name:    "Location Background Art Source",
    hint:    "Choose system-bundled location art (free) or OpenRouter generation (paid). Auto prefers system art when available.",
    scope:   "world",
    config:  true,
    type:    String,
    choices: {
      auto:       "Auto (system art first, OpenRouter fallback)",
      kirin:      "System — illustrated (Kirin)",
      rains:      "System — photorealistic (Rains)",
      openrouter: "Always generate via OpenRouter",
    },
    default: "auto",
  });

  game.settings.register(MODULE_ID, "sectorArtEnabled", {
    name:    "Generate Sector Background Art",
    hint:    "Generate a background image (via OpenRouter, FLUX.2 Pro by default) for each new sector. Requires the OpenRouter API key.",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "sectorNarratorStubsEnabled", {
    name:    "Generate Sector Narrator Stubs",
    hint:    "Generate atmospheric descriptions for new sectors and settlements. Requires Claude API Key.",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "speechInputEnabled", {
    name:     "Push-to-Talk",
    hint:     "Enable push-to-talk speech input. Requires a Chromium-based browser and microphone permission.",
    scope:    "client",
    config:   true,
    type:     Boolean,
    default:  false,
    onChange: (value) => {
      if (value) initSpeechInput();
    },
  });

  game.settings.register(MODULE_ID, "speechLanguage", {
    name:    "Speech Input Language",
    hint:    "BCP 47 language tag for speech recognition, e.g. en-US, en-GB.",
    scope:   "client",
    config:  true,
    type:    String,
    default: "en-US",
  });
}


/**
 * Log a one-line summary of the current art-generation configuration and
 * surface the most common misconfiguration (no OpenRouter key while sector
 * art is enabled) to the GM as a permanent toast.
 *
 * Exported for unit testing.
 */
export function logArtBackendStatus() {
  try {
    const openRouterKeySet = !!game.settings.get(MODULE_ID, "openRouterApiKey");
    const sectorArt        = game.settings.get(MODULE_ID, "sectorArtEnabled");
    const orModel          = game.settings.get(MODULE_ID, "openRouterImageModel");

    console.log(
      `${MODULE_ID} | Art status: sectorArtEnabled=${sectorArt}, ` +
      `openRouterKey=${openRouterKeySet ? "set" : "unset"}, ` +
      `openRouterModel=${orModel}`
    );

    if (!openRouterKeySet && sectorArt) {
      ui.notifications?.warn(
        "Starforged Companion: Sector art is enabled but no OpenRouter API key is set. " +
        "Open Companion Settings → About and paste your OpenRouter key (sk-or-v1-...) to enable art.",
        { permanent: true }
      );
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | logArtBackendStatus failed:`, err);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// SESSION ID MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate or restore a session ID on world load.
 * Reuses the existing ID when the last session was < 4 hours ago (handles
 * page reloads mid-session). Otherwise starts a new session, incrementing
 * sessionNumber and recording the start timestamp.
 *
 * Exported for unit testing; called from the ready hook (GM only).
 */
export function initSessionId(campaignState) {
  const last   = campaignState.lastSessionTimestamp;
  const recent = last && (Date.now() - new Date(last)) < 4 * 3_600_000;

  if (campaignState.currentSessionId && recent) {
    console.log(`${MODULE_ID} | Resuming session: ${campaignState.currentSessionId}`);
    return campaignState;
  }

  campaignState.currentSessionId    = foundry.utils.randomID();
  campaignState.sessionNumber       = (campaignState.sessionNumber ?? 0) + 1;
  campaignState.lastSessionTimestamp = new Date().toISOString();

  console.log(
    `${MODULE_ID} | New session: ${campaignState.currentSessionId} ` +
    `(#${campaignState.sessionNumber})`
  );

  return campaignState;
}


// ────────────────────────────────────────────���────────────────────────────────
// SESSION START DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return true when a world load should be treated as the start of a new session
 * for auto-recap purposes — i.e. the lastSessionTimestamp gap exceeds the
 * configured threshold.
 *
 * Exported for unit testing.
 *
 * @param {Object} campaignState
 * @param {number} [gapHours]  — override the setting (for tests)
 * @returns {boolean}
 */
export function isNewSessionStart(campaignState, gapHours) {
  const last = campaignState?.lastSessionTimestamp;
  if (!last) return false;
  const threshold = gapHours ?? getSessionGapHours();
  const hoursSince = (Date.now() - new Date(last)) / 3_600_000;
  return hoursSince > threshold;
}


// ──────────────────────────────────────────���─────────────────────────────────���
// CHAT MESSAGE HOOK — MOVE INTERPRETATION PIPELINE
// ────────────────────────────────────────────────────���────────────────────────

/**
 * Intercept outgoing chat messages and route player narration through
 * the move interpretation pipeline.
 *
 * Pipeline:
 *   1. Player narration arrives (typed or speech-transcribed)
 *   2. interpretMove() calls Claude API → returns identified move + stat + rationale
 *   3. Mischief aside generated (if mischiefApplied) and stored on interpretation
 *   4. MoveConfirmDialog shown — player accepts or re-interprets
 *   5. resolveMove() rolls dice, calculates outcome, applies consequences
 *   6. assembleContextPacket() builds the 7-section context packet
 *   7. postMoveResult() posts HTML move result card
 *   8. narrateResolution() calls Claude directly, posts narration card
 *   9. persistResolution() applies meter/track changes to character and campaign state
 */
export function registerChatHook() {
  Hooks.on("createChatMessage", async (message) => {
    // Scene query — intercept before move pipeline.
    // @scene starts a new scene moment in the fiction, so reset the recent
    // move-density window so the pacing classifier doesn't carry over the
    // previous scene's run of MOVE decisions.
    if (isSceneQuery(message)) {
      const text     = message.content?.trim() ?? "";
      const question = text.replace(/^@scene\s*/i, "").trim();
      if (!question) return;
      const campaignState = game.settings.get(MODULE_ID, "campaignState");
      resetRecentDensity();
      // Fact continuity: every @scene begins a new scene moment. Flush any
      // unended prior scene and assign a fresh scene ID before narration.
      // See docs/fact-continuity-scope.md §9.1.
      if (factContinuityEnabledFromSettings()) {
        await startScene(campaignState, { reason: "@scene_intercept" });
      }
      await interrogateScene(question, campaignState, {
        actorId: message.author?.character?.id,
      });
      return;
    }

    // !sector command — intercept before move pipeline
    if (isSectorCommand(message)) {
      await handleSectorCommand(message);
      return;
    }

    // !x command — X-Card. Suppresses the scene immediately. Any player can use
    // it. The chatMessage hook (settingsPanel.js) handles typed input by
    // cancelling the message before creation; this branch handles cases where
    // !x reaches createChatMessage anyway (programmatic ChatMessage.create,
    // socket-relayed posts, etc.) so the X-Card flag flips reliably.
    if (isXCardCommand(message)) {
      await handleXCardCommand(message);
      return;
    }

    // !at command — set or clear the current location (intercept before move pipeline)
    if (isAtCommand(message)) {
      await handleAtCommand(message);
      return;
    }

    // !journal command — manual World Journal entry (intercept before move pipeline)
    if (isJournalCommand(message)) {
      // Assign the in-flight work synchronously (before any await) so callers
      // that grab it after `ChatMessage.create()` resolves can await the full
      // journal write chain. See getLastJournalCommandPromise().
      _lastJournalCommandWork = handleJournalCommand(message);
      await _lastJournalCommandWork;
      return;
    }

    // !scene start | !scene end — fact-continuity scene lifecycle (GM only)
    if (isSceneCommand(message)) {
      await handleSceneCommand(message);
      return;
    }

    // !truth strike|set, !state strike|set — fact-continuity corrections
    if (isFactContinuityCommand(message)) {
      await handleFactContinuityCommand(message);
      return;
    }

    // !truths command — open the system World Truths dialog (GM only)
    if (isTruthsCommand(message)) {
      if (!game.user.isGM) {
        ui.notifications.warn("!truths is GM-only.");
        return;
      }
      openSystemTruthsDialog();
      return;
    }

    // !lore command — generate and post narrator world truths recap (GM only)
    if (isLoreCommand(message)) {
      if (!game.user.isGM) {
        ui.notifications.warn("!lore is GM-only.");
        return;
      }
      const campaignState = game.settings.get(MODULE_ID, "campaignState");
      await generateLoreRecap(campaignState).catch(err =>
        console.error(`${MODULE_ID} | !lore failed:`, err)
      );
      return;
    }

    // !sfc encounter command — spawn a canonical foundry-ironsworn encounter
    if (isEncounterCommand(message)) {
      const name = parseEncounterCommand(message.content);
      if (name) {
        await spawnEncounter(name).catch(err =>
          console.error(`${MODULE_ID} | encounter spawn failed:`, err)
        );
      }
      return;
    }

    // !recap command — intercept before move pipeline
    if (isRecapCommand(message)) {
      const text = message.content?.trim() ?? "";
      const campaignState = game.settings.get(MODULE_ID, "campaignState");

      const sessionMatch = text.match(/^!recap\s+session(?:\s+(\d+))?/i);
      if (sessionMatch) {
        // !recap session or !recap session N
        await postSessionRecap(campaignState, null);
      } else {
        // !recap or !recap campaign
        await postCampaignRecap(campaignState);
      }
      return;
    }

    // !pace command — GM-only pacing scene override
    if (isPaceCommand(message)) {
      await handlePaceCommand(message);
      return;
    }

    // !roll command — force the next undecorated input through the move pipeline
    if (isRollCommand(message)) {
      await handleRollCommand(message);
      return;
    }

    if (!isPlayerNarration(message)) return;

    const narration = message.content;
    const apiKeyForPacing = game.settings.get(MODULE_ID, "claudeApiKey");

    // Pacing classifier — decides whether to run the move pipeline, narrate
    // only, or narrate with an inline move suggestion. The classifier runs
    // freely; only the MOVE branch claims the pendingMove lock below.
    const preState  = game.settings.get(MODULE_ID, "campaignState");
    const character = getActiveCharacterForPacing(preState);
    let pacingResult = { runMove: true, decision: "MOVE", suggestedMove: null };
    try {
      pacingResult = await routePacedInput({
        playerText: narration,
        campaignState: preState,
        character,
        apiKey: apiKeyForPacing,
      });
    } catch (err) {
      console.error(`${MODULE_ID} | pacing router failed; falling through to move pipeline:`, err);
    }
    if (!pacingResult.runMove) return;

    // Concurrency guard — one move at a time. A second narration that arrives
    // while a pipeline is running would otherwise race on campaignState writes
    // and post duplicate narration cards.
    const campaignState = game.settings.get(MODULE_ID, "campaignState");
    if (campaignState.pendingMove) {
      ui?.notifications?.info(
        "Starforged Companion: A move is already being resolved. " +
        "Please wait for the current narration to complete.",
        { permanent: false }
      );
      return;
    }

    // Claim the lock before any async work so other clients see it immediately.
    campaignState.pendingMove = true;
    await game.settings.set(MODULE_ID, "campaignState", campaignState);

    const apiKey = apiKeyForPacing;
    const dial   = getMischiefDial();

    try {
      const interpretation = await interpretMove(narration, {
        campaignState,
        mischiefLevel: dial,
        apiKey,
      });

      if (interpretation.mischiefApplied) {
        interpretation._mischiefAside = buildMischiefAside(
          interpretation.rationale ?? "",
          interpretation.moveId,
          interpretation.statUsed,
          dial
        );
      }

      const accepted = await confirmInterpretation(interpretation);
      if (!accepted) return;

      const resolution = resolveMove(interpretation, campaignState);

      // Step 7: relevance resolver — picks the narrator-permission block
      // and identifies which entity records to inject as cards. For hybrid
      // moves with implicit references, we pause the pipeline for a
      // clarification dialog before continuing.
      let relevance = await resolveRelevance(
        resolution.playerNarration ?? narration,
        resolution.moveId,
        resolution.outcome,
        campaignState,
      ).catch(err => {
        console.warn(`${MODULE_ID} | relevance resolver failed:`, err);
        return {
          resolvedClass: 'embellishment', entityIds: [], entityTypes: [],
          matchedNames: [], needsClarification: false, referenceType: 'none',
        };
      });

      if (relevance.needsClarification) {
        // Mark pendingClarification on campaignState so other clients can
        // observe a paused pipeline (GM can read state). Cleared before
        // narration is requested.
        if (game.user.isGM) {
          campaignState.pendingClarification = {
            resolutionId: resolution._id ?? null,
            moveId:       resolution.moveId,
            referenceType: relevance.referenceType,
            postedAt:     new Date().toISOString(),
          };
          await game.settings.set(MODULE_ID, "campaignState", campaignState).catch(() => {});
        }

        const selection = await ClarificationDialog.prompt(campaignState, relevance);
        relevance = applyClarificationSelection(relevance, selection);

        if (game.user.isGM) {
          campaignState.pendingClarification = null;
          await game.settings.set(MODULE_ID, "campaignState", campaignState).catch(() => {});
        }
      }

      // Step 8: build the context packet using the resolved class + matches
      const packet = await assembleContextPacket(resolution, campaignState, {
        narratorClass:      relevance.resolvedClass,
        matchedEntityIds:   relevance.entityIds,
        matchedEntityTypes: relevance.entityTypes,
      });

      // Step 9: post move result card
      await postMoveResult(
        resolution,
        interpretation._mischiefAside ?? null
      );

      // Step 10: narrate the consequence directly via Claude — no GM dependency
      await narrateResolution(resolution, packet, campaignState, { relevance });

      // Only the GM can write world-scoped settings (campaignState).
      // Players trigger the pipeline but defer persistence to the GM's client.
      if (game.user.isGM) {
        await persistResolution(resolution, campaignState);
      }

    } catch (err) {
      console.error(`${MODULE_ID} | Move interpretation failed:`, err);
      ui.notifications.error(
        "Starforged Companion: Move interpretation failed. " +
        "Check your API key in module settings and try again."
      );
    } finally {
      // Always release the lock, even if the pipeline threw. Re-read the
      // latest state so we don't overwrite changes made during the pipeline
      // (entity records, progress ticks, recap caches, etc).
      const latestState = game.settings.get(MODULE_ID, "campaignState");
      latestState.pendingMove = false;
      await game.settings.set(MODULE_ID, "campaignState", latestState).catch(err =>
        console.error(`${MODULE_ID} | Failed to release pendingMove lock:`, err)
      );
    }
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the updateActor hook.
 * Fires when any Actor document is updated — including by other clients.
 *
 * Responsibilities:
 * - Invalidate the cached character snapshot so the next context packet build
 *   reads fresh state from the Actor document.
 * - If the change touches condition debilities, recalculate momentum bounds so
 *   the Actor's momentum stays within the new valid range.
 *
 * Ignores updates made by this client (userId === game.user.id) because
 * actorBridge already invalidates the cache after its own writes.
 */
function registerActorHook() {
  Hooks.on("updateActor", (actor, changes, _options, userId) => {
    if (!actor.hasPlayerOwner) return;

    // Invalidate the cached snapshot so the next context build reads fresh data
    invalidateActorCache(actor.id);

    // Skip if this is our own write — actorBridge already handled the cache
    if (userId === game.user.id) return;

    // If condition debilities changed, recalculate momentum bounds
    if (foundry.utils.hasProperty(changes, "system.debility")) {
      recalculateMomentumBounds(actor).catch(err => {
        console.error(`${MODULE_ID} | updateActor: momentum recalc failed`, err);
      });
    }
  });
}

/**
 * Determine whether a chat message is player narration that should be
 * routed through the move interpretation pipeline.
 *
 * Uses string literals for message types — CONST.CHAT_MESSAGE_TYPES was
 * restructured in Foundry v13 and the constants can no longer be relied on.
 *
 * Excluded:
 * - OOC, roll, and whisper message types
 * - Messages already processed by this module (move result cards, narration cards)
 * - GM messages
 * - Messages starting with "\" (escape), "@" (direct commands), or "/" (slash commands)
 */
export function isPlayerNarration(message) {
  // String literal type checks — v13 compatible
  const type = message.type;
  if (type === "ooc" || type === "roll" || type === "whisper") return false;

  // Skip ANY message bearing a module flag — these are all programmatically
  // posted cards (move cards, narrator cards, recap cards, pace/roll
  // confirmations, scene responses, sector commands, entity drafts, world
  // journal cards, x-card cards, etc.) and must never be treated as player
  // narration. Earlier builds filtered by named flag, which silently broke
  // when a new card type was added without updating this filter — the
  // empty-state recap card had no flag at all and was ingested by the
  // narrator as if the player had said "<div class=...>No campaign history
  // available yet</div>", producing prose like "you speak the HTML aloud".
  if (message.flags?.[MODULE_ID]) return false;

  // Ironsworn system messages posted by sendToChat() in chat-alert.ts
  if (message.flags?.['foundry-ironsworn']) return false;
  if (message.speaker?.alias === 'Ironsworn') return false;

  const text = message.content?.trim() ?? "";

  // No meaningful text content — system-generated empty or near-empty messages
  if (text.length < 10) return false;

  // Escape character — prefix with \ to bypass the pipeline entirely
  if (text.startsWith("\\")) return false;

  // @ and / commands are not player narration
  if (text.startsWith("@")) return false;
  if (text.startsWith("/")) return false;

  // Module commands (! prefix) are not player narration
  if (text.startsWith("!")) return false;

  return true;
}

/**
 * Determine whether a chat message is a scene interrogation query.
 * Scene queries start with "@scene" (case-insensitive) and are not themselves
 * scene response cards.
 */
export function isSceneQuery(message) {
  const text = message.content?.trim() ?? "";
  if (!text.toLowerCase().startsWith("@scene")) return false;
  if (message.flags?.[MODULE_ID]?.sceneResponse) return false;
  return true;
}

/**
 * Determine whether a chat message is a /recap command.
 * Recap commands start with "/recap" (case-insensitive).
 * When recapGmOnly is true, only GM users can trigger them.
 */
export function isRecapCommand(message) {
  const text = message.content?.trim() ?? "";
  if (!text.toLowerCase().startsWith("!recap")) return false;
  if (message.flags?.[MODULE_ID]?.recapCard) return false;
  if (getRecapGmOnly()) {
    const user = message.author ?? game.users?.get(message.user);
    return user?.isGM ?? false;
  }
  return true;
}

/**
 * Determine whether a chat message is a !sector command.
 */
export function isSectorCommand(message) {
  const text = message.content?.trim() ?? "";
  return text.toLowerCase().startsWith("!sector");
}

/**
 * Determine whether a chat message is an !x (X-Card) command.
 * Matches "!x" exactly (trimmed, case-insensitive). Excludes module-posted
 * X-Card cards so we never re-trigger on our own card.
 */
export function isXCardCommand(message) {
  const text = message.content?.trim().toLowerCase() ?? "";
  if (text !== "!x") return false;
  if (message.flags?.[MODULE_ID]?.type === "xcard") return false;
  if (message.flags?.[MODULE_ID]?.xcardCard) return false;
  return true;
}

/**
 * Determine whether a chat message is an !at command.
 *   !at [name] — set current location by name (matches settlement/location/planet)
 *   !at        — clear current location
 */
export function isAtCommand(message) {
  const text = message.content?.trim() ?? "";
  if (!text.toLowerCase().startsWith("!at")) return false;
  // Must be exactly "!at" or "!at " — don't match "!atlas" etc.
  return text.length === 3 || /^!at\s/i.test(text);
}

/**
 * Determine whether a chat message is a !journal command.
 */
export function isJournalCommand(message) {
  const text = message.content?.trim() ?? "";
  return /^!journal\s/i.test(text);
}

/**
 * Determine whether a chat message is a !truths command.
 * GM-only — opens the foundry-ironsworn World Truths dialog.
 */
export function isTruthsCommand(message) {
  const text = message.content?.trim() ?? "";
  return text.toLowerCase() === "!truths";
}

/**
 * Determine whether a chat message is a !lore command.
 * GM-only — generates an atmospheric narrator recap of the world truths.
 */
export function isLoreCommand(message) {
  const text = message.content?.trim() ?? "";
  return text.toLowerCase() === "!lore";
}

/**
 * Determine whether a chat message is a !pace command.
 *   !pace hot | quiet | clear | status
 */
export function isPaceCommand(message) {
  const text = message.content?.trim() ?? "";
  if (!/^!pace(\s|$)/i.test(text)) return false;
  if (message.flags?.[MODULE_ID]?.paceCommandCard) return false;
  return true;
}

/**
 * Determine whether a chat message is a !roll command.
 *   !roll — force the next undecorated input through the move pipeline
 *           (bypasses the pacing classifier).
 */
export function isRollCommand(message) {
  const text = message.content?.trim().toLowerCase() ?? "";
  if (text !== "!roll") return false;
  if (message.flags?.[MODULE_ID]?.rollCommandCard) return false;
  return true;
}

/**
 * Determine whether a chat message is a !scene command.
 *   !scene start | !scene end
 * GM-only. fact-continuity scope §9.1 / §9.2.
 */
export function isSceneCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.sceneCommand) return false;
  return /^!scene\s+(start|end)\b/i.test(text);
}

/**
 * Determine whether a chat message is a !truth or !state correction
 * command. fact-continuity scope §10.3.
 *
 *   !truth strike <id-prefix>
 *   !truth set <subject> <fact>
 *   !state strike <subject> <attribute>
 *   !state set <subject> <attribute>=<value>
 */
export function isFactContinuityCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.factContinuityCommand) return false;
  return /^!(truth|state)\s+/i.test(text);
}

/**
 * Handle a !scene command. GM-only. Posts a confirmation card flagged
 * `sceneCommand: true` so it never bleeds through isPlayerNarration on the
 * next turn (PR #94).
 */
async function handleSceneCommand(message) {
  if (!game.user.isGM) {
    ui.notifications.warn("!scene is GM-only (writes campaign state).");
    return;
  }
  if (!factContinuityEnabledFromSettings()) {
    ui.notifications.warn("!scene requires Fact Continuity to be enabled in Companion Settings.");
    return;
  }

  const text = (message.content ?? "").trim();
  const verb = /^!scene\s+(start|end)\b/i.exec(text)?.[1]?.toLowerCase();
  if (verb !== "start" && verb !== "end") return;

  const campaignState = game.settings.get(MODULE_ID, "campaignState");

  let resultLine = "";
  try {
    if (verb === "start") {
      const id = await startScene(campaignState, { reason: "scene_command" });
      resultLine = id
        ? `Scene started — <code>${id}</code>.`
        : "Scene start failed.";
    } else {
      const summary = await endScene(campaignState, { reason: "scene_command" });
      resultLine =
        `Scene ended — migrated ${summary.migrated} entity truth${summary.migrated === 1 ? "" : "s"}, ` +
        `archived ${summary.archived} lore entr${summary.archived === 1 ? "y" : "ies"}.`;
    }
  } catch (err) {
    console.error(`${MODULE_ID} | handleSceneCommand failed:`, err);
    resultLine = "!scene failed — see the browser console.";
  }

  await ChatMessage.create({
    content: `
      <div class="sf-scene-command-card">
        <div class="sf-scene-command-label">◈ Scene Lifecycle</div>
        <div class="sf-scene-command-body">${resultLine}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        sceneCommand: true,
        verb,
      },
    },
  });
}

/**
 * Handle !truth / !state correction commands. fact-continuity scope §10.3.
 *
 * Grammar:
 *   !truth strike <id-prefix>
 *   !truth set <subject> <fact-text>
 *   !state strike <subject> <attribute>
 *   !state set <subject> <attribute>=<value>
 *
 * Subjects accepted as bare words ("Vance", "scene") or as quoted strings
 * for multi-word subjects ("\"Covenant officer\"", "\"cargo bay\""). For
 * !state set, the attribute and value are separated by an unquoted `=`.
 */
async function handleFactContinuityCommand(message) {
  const text = (message.content ?? "").trim();
  const isGM = !!game.user?.isGM;

  if (!factContinuityEnabledFromSettings()) {
    ui.notifications.warn("Fact Continuity is disabled in Companion Settings.");
    return;
  }

  const verbMatch = /^!(truth|state)\s+(strike|set)\s+(.*)$/i.exec(text);
  if (!verbMatch) {
    ui.notifications.warn('Usage: !truth strike <id> | !truth set <subject> <fact> | !state strike <subject> <attribute> | !state set <subject> <attribute>=<value>');
    return;
  }
  const [, domain, verb, restRaw] = verbMatch;
  const rest = restRaw.trim();

  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  const ctx = { isGM, actor: isGM ? "gm" : "player" };

  let resultLine = "";
  try {
    if (domain.toLowerCase() === "truth" && verb.toLowerCase() === "strike") {
      const struck = fcStrikeTruth(rest, campaignState, ctx);
      resultLine = struck
        ? `Truth <code>${struck.id.slice(0, 8)}</code> struck.`
        : `No matching truth (id or unique 4+ char prefix required, and you must have permission).`;
    } else if (domain.toLowerCase() === "truth" && verb.toLowerCase() === "set") {
      const parsed = parseSubjectAndRest(rest);
      if (!parsed) {
        ui.notifications.warn('Usage: !truth set <subject> <fact-text>');
        return;
      }
      const subject = fcResolveSubject(parsed.subject, campaignState);
      const truth   = fcSetTruth(subject, parsed.rest, campaignState, ctx);
      resultLine = truth
        ? `Truth recorded: <em>${escapeHtml(parsed.subject)} — ${escapeHtml(parsed.rest)}</em>.`
        : `Truth not recorded — empty subject or fact.`;
    } else if (domain.toLowerCase() === "state" && verb.toLowerCase() === "strike") {
      const parsed = parseSubjectAndRest(rest);
      if (!parsed?.rest) {
        ui.notifications.warn('Usage: !state strike <subject> <attribute>');
        return;
      }
      const subject = fcResolveSubject(parsed.subject, campaignState);
      const ok      = fcStrikeStateValue(fcSubjectKey(subject), parsed.rest.trim(), campaignState);
      resultLine = ok
        ? `State <code>${escapeHtml(parsed.subject)} — ${escapeHtml(parsed.rest.trim())}</code> struck.`
        : `No matching state entry.`;
    } else if (domain.toLowerCase() === "state" && verb.toLowerCase() === "set") {
      const parsed = parseSubjectAndRest(rest);
      const eqIdx  = parsed?.rest?.indexOf("=") ?? -1;
      if (!parsed || eqIdx < 1) {
        ui.notifications.warn('Usage: !state set <subject> <attribute>=<value>');
        return;
      }
      const attribute = parsed.rest.slice(0, eqIdx).trim();
      const value     = parsed.rest.slice(eqIdx + 1).trim();
      const subject   = fcResolveSubject(parsed.subject, campaignState);
      const result    = fcSetStateValue(fcSubjectKey(subject), attribute, value, campaignState);
      resultLine = result
        ? `State recorded: <em>${escapeHtml(parsed.subject)} — ${escapeHtml(attribute)}: ${escapeHtml(value)}</em>.`
        : `State not recorded — empty attribute or value.`;
    } else {
      ui.notifications.warn('Unrecognised !truth / !state form.');
      return;
    }

    if (resultLine) {
      // Persist after a successful mutation.
      try {
        await game.settings.set(MODULE_ID, "campaignState", campaignState);
      } catch (err) {
        console.warn(`${MODULE_ID} | handleFactContinuityCommand: persist failed:`, err);
      }
    }
  } catch (err) {
    console.error(`${MODULE_ID} | handleFactContinuityCommand failed:`, err);
    resultLine = "Command failed — see the browser console.";
  }

  await ChatMessage.create({
    content: `
      <div class="sf-fc-command-card">
        <div class="sf-fc-command-label">◈ Fact Continuity</div>
        <div class="sf-fc-command-body">${resultLine}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        factContinuityCommand: true,
        domain: domain.toLowerCase(),
        verb:   verb.toLowerCase(),
      },
    },
  });
}

/**
 * Parse "<subject> <rest>" with subject either a quoted string or a single
 * bare word. Returns { subject, rest } or null on malformed input.
 */
function parseSubjectAndRest(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('"')) {
    const close = trimmed.indexOf('"', 1);
    if (close < 0) return null;
    const subject = trimmed.slice(1, close).trim();
    const rest    = trimmed.slice(close + 1).trim();
    return subject ? { subject, rest } : null;
  }
  const space = trimmed.search(/\s/);
  if (space < 0) return { subject: trimmed, rest: '' };
  const subject = trimmed.slice(0, space).trim();
  const rest    = trimmed.slice(space + 1).trim();
  return subject ? { subject, rest } : null;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Handle a !journal command. GM-only — World Journal writes require world-
 * scoped permissions. Posts a confirmation card on success or a notification
 * on rejection.
 */
async function handleJournalCommand(message) {
  if (!game.user.isGM) {
    ui.notifications.warn("!journal is GM-only (writes campaign state).");
    return;
  }

  const parsed = parseJournalCommand(message.content?.trim() ?? "");
  if (!parsed) {
    ui.notifications.warn(
      'Invalid !journal command. Format: !journal <type> "Name" qualifier — text  ' +
      '(types: faction, location, lore, threat).'
    );
    return;
  }

  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  try {
    const result = await executeJournalCommand(parsed, campaignState);
    if (!result) {
      ui.notifications.warn(`!journal ${parsed.type} failed — see console for details.`);
      return;
    }
    await ChatMessage.create({
      content:
        `<p><strong>World Journal updated:</strong> ${parsed.type} — ` +
        `<em>${escapeChatHtml(parsed.name)}</em>` +
        (parsed.qualifier ? ` (${escapeChatHtml(parsed.qualifier)})` : '') +
        `</p>`,
      flags:   { [MODULE_ID]: { worldJournalCard: true } },
    });
  } catch (err) {
    console.error(`${MODULE_ID} | !journal command failed:`, err);
    ui.notifications.error("!journal command failed. Check console for details.");
  }
}

/**
 * Load the active character for the pacing classifier. Returns a minimal
 * { name, connections } object — the classifier doesn't need full stat
 * state. Returns null when no character is set.
 */
function getActiveCharacterForPacing(campaignState) {
  try {
    const ids = campaignState?.characterIds ?? [];
    if (!ids.length) return null;
    const entry = game.journal?.get?.(ids[0]);
    const page  = entry?.pages?.contents?.[0];
    const data  = page?.flags?.[MODULE_ID]?.character;
    if (!data) return null;
    return { name: data.name ?? null };
  } catch {
    return null;
  }
}

/**
 * Handle a !pace chat command. GM-only — writes world-scoped campaignState.
 */
async function handlePaceCommand(message) {
  if (!game.user.isGM) {
    ui.notifications?.warn("!pace is GM-only (writes campaign state).");
    return;
  }
  const text = message.content?.trim() ?? "";
  const arg  = text.slice("!pace".length).trim().split(/\s+/)[0] ?? "";

  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  const result = await applyPaceCommand(campaignState, arg);

  const body = result.status.includes("\n")
    ? `<pre class="sf-pace-status">${escapeChatHtml(result.status)}</pre>`
    : `<p>${escapeChatHtml(result.status)}</p>`;

  await ChatMessage.create({
    content: `<div class="sf-pace-card"><strong>Pacing</strong> ${body}</div>`,
    flags:   { [MODULE_ID]: { paceCommandCard: true } },
  });
}

/**
 * Handle a !roll chat command — forces the next undecorated input through
 * the move pipeline regardless of the classifier's decision. GM-only.
 */
async function handleRollCommand(_message) {
  if (!game.user.isGM) {
    ui.notifications?.warn("!roll is GM-only (writes campaign state).");
    return;
  }
  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  await markForceNextAsMove(campaignState);
  await ChatMessage.create({
    content: `<div class="sf-pace-card"><strong>Pacing</strong> <p>Next undecorated input will route to the move interpreter, bypassing the classifier.</p></div>`,
    flags:   { [MODULE_ID]: { rollCommandCard: true } },
  });
}

function escapeChatHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Resolve a name fragment to an entity record by scanning settlement, location,
 * and planet collections in that priority order. Case-insensitive prefix match
 * before falling back to substring match.
 *
 * @param {string} name
 * @param {Object} campaignState
 * @returns {{ id: string, type: string, entity: Object }|null}
 */
export function resolveCurrentLocationName(name, campaignState) {
  const target = name?.trim().toLowerCase();
  if (!target) return null;

  const groups = [
    ["settlement", campaignState?.settlementIds ?? [], "settlement"],
    ["location",   campaignState?.locationIds   ?? [], "location"],
    ["planet",     campaignState?.planetIds     ?? [], "planet"],
  ];

  // Two-pass match — exact name first, then prefix, then substring.
  const candidates = [];
  for (const [type, ids, flagKey] of groups) {
    for (const journalId of ids) {
      try {
        const entry = game.journal?.get(journalId);
        const page  = entry?.pages?.contents?.[0];
        const data  = page?.flags?.[MODULE_ID]?.[flagKey];
        if (data?.name) {
          candidates.push({ id: journalId, type, entity: data, lc: data.name.toLowerCase() });
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | resolveCurrentLocationName: ${type} ${journalId} failed:`, err);
      }
    }
  }

  return candidates.find(c => c.lc === target)
      ?? candidates.find(c => c.lc.startsWith(target))
      ?? candidates.find(c => c.lc.includes(target))
      ?? null;
}

/**
 * Handle the !x (X-Card) command. Activates suppressScene so the assembler
 * blocks creative content for the rest of the scene, and posts a visible
 * X-Card card so other players see the scene was paused.
 *
 * Runs on whichever client received the createChatMessage event. The setting
 * write requires GM permissions; on player clients it logs a warning and the
 * GM client's hook fires the actual persist. The card is posted from the
 * client that called the handler — that's fine, ChatMessage.create relays.
 */
async function handleXCardCommand(_message) {
  await suppressScene();

  // Only one client should post the response card to avoid duplicates.
  // Prefer the GM; if no GM is online, the message author's client posts it.
  if (!game.user.isGM) return;

  await ChatMessage.create({
    content: `
      <div class="starforged-move-card xcard-card">
        <div class="move-header">
          <span class="move-type">X-Card</span>
        </div>
        <div class="move-body">
          <p class="xcard-message">
            Scene paused. Current content is suppressed.<br>
            The story will redirect at the next narration beat.
          </p>
        </div>
      </div>
    `.trim(),
    flags: { [MODULE_ID]: { type: "xcard", xcardCard: true } },
  });
}

/**
 * Handle !at chat commands.
 *   !at [name] — set currentLocationId / currentLocationType
 *   !at        — clear currentLocationId / currentLocationType
 *
 * GM-only — world-scoped settings cannot be written by player clients.
 */
async function handleAtCommand(message) {
  const text = message.content?.trim() ?? "";
  const arg  = text.slice("!at".length).trim();

  if (!game.user.isGM) {
    ui.notifications.warn("!at is GM-only (writes campaign state).");
    return;
  }

  const campaignState = game.settings.get(MODULE_ID, "campaignState");

  if (!arg) {
    campaignState.currentLocationId   = null;
    campaignState.currentLocationType = null;
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
    await ChatMessage.create({
      content: "<p><strong>Current location cleared.</strong></p>",
      flags:   { [MODULE_ID]: { atCommandCard: true } },
    });
    return;
  }

  const match = resolveCurrentLocationName(arg, campaignState);
  if (!match) {
    ui.notifications.warn(`No settlement, location, or planet named "${arg}" found.`);
    return;
  }

  campaignState.currentLocationId   = match.id;
  campaignState.currentLocationType = match.type;
  await game.settings.set(MODULE_ID, "campaignState", campaignState);
  await ChatMessage.create({
    content: `<p>Current location set to <strong>${match.entity.name}</strong> (${match.type}).</p>`,
    flags:   { [MODULE_ID]: { atCommandCard: true } },
  });
}

/**
 * Handle !sector chat commands.
 *   !sector new        — open the sector creator (GM only)
 *   !sector list       — list all created sectors
 *   !sector {name}     — switch active sector
 */
async function handleSectorCommand(message) {
  const text  = message.content?.trim() ?? "";
  const parts = text.slice("!sector".length).trim().split(/\s+/);
  const sub   = parts[0]?.toLowerCase() ?? "";

  const campaignState = game.settings.get(MODULE_ID, "campaignState");

  if (sub === "new") {
    if (!game.user.isGM) {
      ui.notifications.warn("!sector new is available to GMs only.");
      return;
    }
    openSectorCreator();
    return;
  }

  if (sub === "list") {
    const sectors = campaignState.sectors ?? [];
    if (!sectors.length) {
      await ChatMessage.create({
        content: "<p>No sectors created yet. Type <code>!sector new</code> to create one.</p>",
        flags:   { [MODULE_ID]: { sectorList: true, sectorListEmpty: true } },
      });
      return;
    }
    const lines = sectors.map(s =>
      `<li>${s.name} (${s.regionLabel})${campaignState.activeSectorId === s.id ? " <em>[active]</em>" : ""}</li>`
    ).join("");
    await ChatMessage.create({
      content: `<p><strong>Sectors:</strong></p><ul>${lines}</ul>`,
      flags: { [MODULE_ID]: { sectorList: true } },
    });
    return;
  }

  // !sector {name} — switch active sector
  if (sub && game.user.isGM) {
    const name   = parts.join(" ");
    const match  = (campaignState.sectors ?? []).find(
      s => s.name.toLowerCase() === name.toLowerCase()
    );
    if (!match) {
      ui.notifications.warn(`Sector "${name}" not found. Use !sector list to see all sectors.`);
      return;
    }
    campaignState.activeSectorId = match.id;
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
    await ChatMessage.create({
      content: `<p>Active sector switched to <strong>${match.name}</strong>.</p>`,
      flags: { [MODULE_ID]: { sectorSwitch: true } },
    });
    return;
  }
}

/**
 * Post the resolved move result to chat.
 * Returns the created ChatMessage so the caller can attach Loremaster context.
 */
async function postMoveResult(resolution, aside = null) {
  return ChatMessage.create({
    content: formatMoveResult(resolution, aside),
    flags: {
      [MODULE_ID]: {
        moveResolution: true,
        resolutionId:   resolution._id,
      },
    },
    // No type field — defaults to "base", which is valid in both v12 and v13.
    // "other" was removed as a valid type in v13 and must not be used.
  });
}

/**
 * Format a move resolution as an HTML chat card.
 */
function formatMoveResult(resolution, aside = null) {
  const outcomeClass = {
    strong_hit: "sf-strong-hit",
    weak_hit:   "sf-weak-hit",
    miss:       "sf-miss",
  }[resolution.outcome] ?? "";

  const addsStr  = resolution.adds    ? ` + ${resolution.adds}` : "";
  const matchStr = resolution.isMatch ? " ✦ Match"              : "";

  return `
    <div class="sf-move-result ${outcomeClass}">
      <div class="sf-move-name">${resolution.moveName}</div>
      <div class="sf-move-stat">+${resolution.statUsed} (${resolution.statValue})</div>
      <div class="sf-move-dice">
        Action: ${resolution.actionDie} + ${resolution.statValue}${addsStr}
        = <strong>${resolution.actionScore}</strong>
        &nbsp;|&nbsp;
        Challenge: ${resolution.challengeDice[0]}, ${resolution.challengeDice[1]}${matchStr}
      </div>
      <div class="sf-move-outcome">${resolution.outcomeLabel}</div>
      ${resolution.consequences.otherEffect
        ? `<div class="sf-move-effect">${resolution.consequences.otherEffect}</div>`
        : ""}
      ${aside
        ? `<div class="sf-move-aside">🎲 ${aside}</div>`
        : ""}
    </div>
  `.trim();
}

/**
 * Inject the push-to-talk button into the Foundry chat controls bar.
 *
 * Rewritten without jQuery — Foundry v13 removed jQuery from the global scope.
 * The renderChatLog hook now passes a plain HTMLElement, not a jQuery object.
 * Uses the standard DOM API throughout.
 */
function injectPushToTalkButton(html) {
  // html may be an HTMLElement (v13) or jQuery object (v12) — normalise to Element
  const root = html instanceof HTMLElement ? html : html[0] ?? html;
  if (!root) return;

  const controls = root.querySelector("#chat-controls");
  if (!controls) return;

  const button = document.createElement("button");
  button.type        = "button";
  button.id          = "sf-ptt-button";
  button.className   = "sf-ptt-button";
  button.title       = "Push to Talk — hold to speak";
  button.setAttribute("aria-label", "Push to Talk");
  button.textContent = "🎙";

  button.addEventListener("mousedown",  (e) => { e.preventDefault(); window._sfSpeechInput?.start(); });
  button.addEventListener("touchstart", (e) => { e.preventDefault(); window._sfSpeechInput?.start(); }, { passive: false });
  button.addEventListener("mouseup",    (e) => { e.preventDefault(); window._sfSpeechInput?.stop(); });
  button.addEventListener("touchend",   (e) => { e.preventDefault(); window._sfSpeechInput?.stop(); });
  button.addEventListener("mouseleave", (e) => { window._sfSpeechInput?.stop(); });

  controls.prepend(button);
}


// ─────────────────────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────────────────────

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initialising`);
  registerCoreSettings();
  registerUISettings();
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Ready`);

  // Log the art-generation configuration and surface the most common
  // misconfiguration (no OpenRouter key while sector art is enabled) to the GM.
  if (game.user.isGM) {
    logArtBackendStatus();
  }

  // Session ID — GM writes to world-scoped settings; players read from state
  if (game.user.isGM) {
    const prevState = game.settings.get(MODULE_ID, "campaignState");

    // Reset a stale pendingMove lock — left set if Foundry was closed mid-move.
    if (prevState.pendingMove) {
      prevState.pendingMove = false;
      console.log(`${MODULE_ID} | Reset stale pendingMove lock on ready`);
    }

    const wasNewSession = isNewSessionStart(prevState);
    const updated = initSessionId(prevState);
    game.settings.set(MODULE_ID, "campaignState", updated).then(async () => {
      // Auto-recap: post campaign recap when a new session is detected
      if (wasNewSession && getAutoRecapEnabled()) {
        const freshState = game.settings.get(MODULE_ID, "campaignState");
        await postCampaignRecap(freshState, { silent: false }).catch(err => {
          console.error(`${MODULE_ID} | Auto-recap failed:`, err);
        });
      }

      // Notify GM if no World Truths have been established yet
      const freshState = game.settings.get(MODULE_ID, "campaignState");
      if (!freshState.worldTruthsSet) {
        ChatMessage.create({
          content: `<div class="sf-card sf-card--setup">
            <div class="sf-card-header">◈ Campaign Setup</div>
            <p>No World Truths have been established for this campaign.</p>
            <button data-action="openTruthsDialog">Set World Truths ▸</button>
          </div>`,
          flags:   { [MODULE_ID]: { setupCard: true } },
          whisper: [game.user.id],
        }).catch(err =>
          console.warn(`${MODULE_ID} | truths setup card failed:`, err)
        );
      }

      // Fallback — link the system's truths journal if truths were set before
      // the createJournalEntryPage hook was wired, or if the ID was never stored.
      if (!freshState.worldTruthsJournalId) {
        const systemTitle = game.i18n?.localize?.("IRONSWORN.JOURNALENTRYPAGES.TypeTruth") ?? "";
        if (systemTitle) {
          const truthsJournal = game.journal?.contents?.find(j => j.name === systemTitle);
          if (truthsJournal) {
            freshState.worldTruthsJournalId = truthsJournal.id;
            freshState.worldTruthsSet       = true;
            game.settings.set(MODULE_ID, "campaignState", freshState).catch(err =>
              console.warn(`${MODULE_ID} | ready: fallback truths link failed:`, err)
            );
          }
        }
      }
    }).catch(err => {
      console.error(`${MODULE_ID} | Failed to persist session ID:`, err);
    });
  }

  if (game.user.isGM) {
    ensureHelpJournal().catch(err =>
      console.warn(`${MODULE_ID} | Help journal creation failed:`, err.message)
    );

    // World Journal — create the folder + four category journals if missing.
    // Phase 3 only writes; the combined detection pass that auto-populates is
    // Phase 4. Errors are logged and do not block the rest of the ready hook.
    initWorldJournals().catch(err =>
      console.warn(`${MODULE_ID} | World Journal init failed:`, err?.message ?? err)
    );
  }

  registerChatHook();
  registerActorHook();
  registerProgressTrackHooks();
  registerEntityPanelHooks();
  registerDraftCardHooks();
  registerSettingsHooks();

  // Pacing recent-density buffer is in-memory; clear it on world load so a
  // returning session doesn't inherit the previous run's MOVE count.
  resetRecentDensity();

  if (game.settings.get(MODULE_ID, "speechInputEnabled")) {
    initSpeechInput();
  }
});

Hooks.once("closeWorld", async () => {
  if (!game.user.isGM) return;
  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  // Fact continuity: flush any active scene before the world closes so
  // truths migrate to entity tiers / WJ Lore rather than vanishing on the
  // next world load. See docs/fact-continuity-scope.md §9.2.
  if (factContinuityEnabledFromSettings() && campaignState?.currentSceneId) {
    try {
      await endScene(campaignState, { reason: "session_close" });
    } catch (err) {
      console.warn(`${MODULE_ID} | closeWorld: endScene failed:`, err);
    }
  }
  campaignState.lastSessionTimestamp = new Date().toISOString();
  await game.settings.set(MODULE_ID, "campaignState", campaignState);
});

Hooks.on("getSceneControlButtons", (controls) => {
  console.log(`${MODULE_ID} | getSceneControlButtons fired, keys:`,
    Object.keys(controls ?? {}));

  // v13: controls is an object keyed by group name
  // Access tokens group directly — do not use Object.values or find()
  const tokenControls = controls?.tokens ?? controls?.token;
  console.log(`${MODULE_ID} | tokenControls:`, tokenControls?.name,
    "tools:", Object.keys(tokenControls?.tools ?? {}));

  if (!tokenControls) {
    console.warn(`${MODULE_ID} | No token controls found — buttons not registered`);
    return;
  }

  // v13: tools is an object keyed by tool name
  // Do NOT reassign tokenControls.tools — add keys to whatever is there
  tokenControls.tools ??= {};

  // v13: use onChange not onClick — confirmed from official API docs
  tokenControls.tools.progressTracks = {
    name:     "progressTracks",
    title:    "Progress Tracks",
    icon:     "fas fa-tasks",
    button:   true,
    onChange: () => openProgressTracks(),
  };
  tokenControls.tools.entityPanel = {
    name:     "entityPanel",
    title:    "Entities",
    icon:     "fas fa-users",
    button:   true,
    onChange: () => openEntityPanel(),
  };
  tokenControls.tools.chronicle = {
    name:     "chronicle",
    title:    "Character Chronicle",
    icon:     "fas fa-book-open",
    button:   true,
    onChange: () => openChroniclePanel(),
  };
  tokenControls.tools.sfSettings = {
    name:     "sfSettings",
    title:    "Companion Settings",
    icon:     "fas fa-shield-alt",
    button:   true,
    visible:  game.user.isGM,
    onChange: () => openSettingsPanel(),
  };
  tokenControls.tools.sectorCreator = {
    name:     "sectorCreator",
    title:    "Sector Creator",
    icon:     "fas fa-map",
    button:   true,
    visible:  game.user.isGM,
    onChange: () => {},
  };
  tokenControls.tools.worldJournal = {
    name:     "worldJournal",
    title:    "World Journal",
    icon:     "fas fa-book",
    button:   true,
    visible:  game.user.isGM,
    onChange: () => {},
  };
  tokenControls.tools.worldTruths = {
    name:     "worldTruths",
    title:    "World Truths",
    icon:     "fas fa-scroll",
    button:   true,
    visible:  game.user.isGM,
    onChange: () => {},
  };
});

// Foundry v13 does not invoke onChange for `button: true` tools registered via
// getSceneControlButtons. Attach click listeners directly after the toolbar
// renders so the buttons actually do something.
Hooks.on("renderSceneControls", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  const buttonMap = {
    progressTracks: () => openProgressTracks(),
    entityPanel:    () => openEntityPanel(),
    chronicle:      () => openChroniclePanel(),
    sfSettings:     () => openSettingsPanel(),
    sectorCreator:  () => openSectorCreator(),
    worldJournal:   () => openWorldJournalPanel(),
    worldTruths:    () => openSystemTruthsDialog(),
  };

  for (const [name, handler] of Object.entries(buttonMap)) {
    const btn = root.querySelector(`[data-tool="${name}"]`);
    if (!btn) continue;
    // Replace the node to drop any listeners attached on a previous render.
    btn.replaceWith(btn.cloneNode(true));
    const freshBtn = root.querySelector(`[data-tool="${name}"]`);
    freshBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      handler();
    });
  }
});

/**
 * renderChatLog — inject PTT button when speech is enabled.
 * html is HTMLElement in v13, jQuery object in v12 — injectPushToTalkButton handles both.
 */
Hooks.on("renderChatLog", (_chatLog, html, _data) => {
  if (game.settings.get(MODULE_ID, "speechInputEnabled")) {
    injectPushToTalkButton(html);
  }
});

/**
 * renderChatMessage — wire the "Set World Truths" button on setup notification cards.
 * The card is whispered to the GM on ready when no truths are established.
 */
Hooks.on("renderChatMessage", (message, html) => {
  if (!message.flags?.[MODULE_ID]?.setupCard) return;
  const root = html instanceof HTMLElement ? html : html[0];
  root?.querySelector('[data-action="openTruthsDialog"]')
    ?.addEventListener("click", () => openSystemTruthsDialog());
});

/**
 * renderChatMessage — wire the "Correct a fact" button on narrator cards
 * (fact-continuity scope §10.2). Two-hook pattern per CLAUDE.md: the card
 * HTML is rendered with the button in postNarrationCard /
 * postPacedNarrativeCard; click handlers are attached here at render time.
 */
Hooks.on("renderChatMessage", (message, html) => {
  if (!message.flags?.[MODULE_ID]?.narratorCard) return;
  if (!factContinuityEnabledFromSettings()) return;
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  const btn = root.querySelector('[data-action="openCorrectionDialog"]');
  if (!btn) return;
  // Clone-replace to drop any listener attached on a prior render.
  const fresh = btn.cloneNode(true);
  btn.replaceWith(fresh);
  fresh.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openCorrectionDialog(message).catch(err =>
      console.error(`${MODULE_ID} | openCorrectionDialog failed:`, err),
    );
  });
});

/**
 * renderChatMessage — wire the "↻ Refresh" button on campaign recap cards.
 * The button is rendered for the GM on every non-empty campaign recap card
 * (`src/narration/narrator.js` postCampaignRecap). Forces a regeneration that
 * bypasses the chronicle-length cache.
 */
Hooks.on("renderChatMessage", (message, html) => {
  const f = message.flags?.[MODULE_ID];
  if (!f?.recapCard || f.recapType !== "campaign") return;
  const root = html instanceof HTMLElement ? html : html[0];
  const btn = root?.querySelector('[data-action="refreshCampaignRecap"]');
  if (!btn) return;
  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!game.user?.isGM) {
      ui?.notifications?.warn("Refreshing the campaign recap is GM-only.");
      return;
    }
    btn.disabled = true;
    try {
      const fresh = game.settings.get(MODULE_ID, "campaignState");
      await postCampaignRecap(fresh, { forceRefresh: true });
    } catch (err) {
      console.error(`${MODULE_ID} | refreshCampaignRecap failed:`, err);
      ui?.notifications?.warn("Campaign recap refresh failed. Check console.");
    } finally {
      btn.disabled = false;
    }
  });
});

/**
 * createJournalEntry — capture worldTruthsJournalId the moment the system's
 * "Setting Truths" journal is created, before the page and its content exist.
 *
 * saveTruths() in sf-truths.vue creates the JournalEntry first and the page
 * in a separate async call. When the page content ends up empty (async timing
 * gap in the TruthCategory.randomize() chain), the createJournalEntryPage hook
 * below correctly rejects the empty page via its <h2> guard, leaving
 * worldTruthsJournalId unset. This hook closes that gap by capturing the ID
 * at journal creation time regardless of future page content.
 *
 * worldTruthsSet remains controlled by createJournalEntryPage and still
 * requires ≥2 <h2> elements.
 */
Hooks.on("createJournalEntry", async (entry) => {
  if (!game.user.isGM) return;
  if (entry.flags?.[MODULE_ID]) return;

  const systemTitle = game.i18n?.localize?.("IRONSWORN.JOURNALENTRYPAGES.TypeTruth") ?? "";
  if (!systemTitle || entry.name !== systemTitle) return;

  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  if (campaignState.worldTruthsSet) return; // Already recorded with real content

  campaignState.worldTruthsJournalId = entry.id;
  await game.settings.set(MODULE_ID, "campaignState", campaignState).catch(err =>
    console.error(`${MODULE_ID} | createJournalEntry: failed to persist journal id:`, err)
  );
});

/**
 * createJournalEntryPage — detect when the system's World Truths dialog saves truths.
 *
 * saveTruths() in sf-truths.vue creates the JournalEntry first, then the page in a
 * separate call. The createJournalEntry hook fires before the page exists (pages.size
 * is 0 at that point), so we listen on createJournalEntryPage instead — the parent
 * journal is accessible as page.parent and is fully constructed.
 *
 * The system journal name matches i18n key IRONSWORN.JOURNALENTRYPAGES.TypeTruth
 * ("Setting Truths" in English). No module flags are written on either document.
 * Content has ≥2 <h2> elements — one per truth category saved.
 */
Hooks.on("createJournalEntryPage", async (page) => {
  if (!game.user.isGM) return;

  const entry = page.parent;
  if (!entry) return;

  // Page must be plain text with no flags from our module
  if (page.type !== "text") return;
  if (page.flags?.[MODULE_ID]) return;
  if (entry.flags?.[MODULE_ID]) return;

  // Journal name must match the system's i18n key (locale-safe at runtime)
  const systemTitle = game.i18n?.localize?.("IRONSWORN.JOURNALENTRYPAGES.TypeTruth") ?? "";
  if (!systemTitle || entry.name !== systemTitle) return;

  // Content must have ≥2 <h2> elements — a real truths journal has up to 14
  const content = page.text?.content ?? "";
  if ((content.match(/<h2/gi) ?? []).length < 2) return;

  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  if (campaignState.worldTruthsSet) return; // Already recorded

  campaignState.worldTruthsSet       = true;
  campaignState.worldTruthsJournalId = entry.id;
  await game.settings.set(MODULE_ID, "campaignState", campaignState).catch(err =>
    console.error(`${MODULE_ID} | createJournalEntryPage: failed to persist truths state:`, err)
  );

  // Dismiss the setup notification card if it is still in chat
  const setupCard = game.messages?.contents?.find(
    m => m.flags?.[MODULE_ID]?.setupCard
  );
  if (setupCard) await setupCard.delete().catch(() => {});

  ui?.notifications?.info("Starforged Companion: World Truths recorded.");
});
