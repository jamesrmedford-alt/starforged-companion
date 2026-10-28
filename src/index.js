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

import { CampaignStateSchema, MOVES }   from "./schemas.js";
import { interpretMove }         from "./moves/interpreter.js";
import { resolveMove }           from "./moves/resolver.js";
import { buildMischiefAside }    from "./moves/mischief.js";
import { persistResolution }     from "./moves/persistResolution.js";
import { progressPerMilestoneLine, planRewardGrant } from "./moves/rewards.js";
import {
  buildBurnState,
  renderBurnButtonHtml,
  registerBurnMomentumHook,
} from "./moves/burnMomentum.js";
import {
  buildImproveState,
  renderImproveButtonHtml,
  registerImproveResultHook,
} from "./moves/improveResult.js";
import { registerSufferCardHook } from "./moves/sufferCard.js";
import {
  scanForApplicableAbilities,
  getCommandVehicleActor,
} from "./moves/abilityScanner.js";
import { enrichInterpretationStatValue, enrichProgressTicks } from "./moves/statEnrichment.js";
import { rollChallengeDice }     from "./moves/resolver.js";
import { rollYesNo, rollOracle, ORACLE_TABLES } from "./oracles/roller.js";
import {
  openSetFlagDialog,
  openChangeYourFateDialog,
  openTakeABreakDialog,
} from "./safety/sessionDialogs.js";
import {
  openBeginSessionDialog,
  openEndSessionDialog,
} from "./safety/sessionLifecycleDialogs.js";
import { isClockCommand, handleClockCommand } from "./clocks/clocks.js";
import { isRepairCommand, handleRepairCommand } from "./moves/repair.js";
import {
  isShipEnvisionCommand,
  handleShipEnvisionCommand,
  isShipHistoryCommand,
  handleShipHistoryCommand,
} from "./entities/shipEnvision.js";
import {
  isOracleAddCommand,
  handleOracleAddCommand,
  rehydrateCustomOracles,
} from "./oracles/customOracles.js";
import { initSpeechInput, disableSpeechInput } from "./input/speechInput.js";
import {
  narrateResolution,
  interrogateScene,
  postSessionRecap,
  postCampaignRecap,
  getCampaignRecap,
  narrateAndPostVowSwearing,
  registerRollingSummaryRefreshHook,
  registerPublishedReflectionHook,
} from "./narration/narrator.js";
import { isNarratorCommand, handleNarratorCommand } from "./narration/narratorDebug.js";
import { parseIronswornProgressRoll, classifyProgressRoll, ironswornRollKind, planNativeRollNarration } from "./narration/nativeProgressRoll.js";
import { invalidateActorCache, recalculateMomentumBounds, getPlayerActors, readVows, markVowProgress, completeVowItem, applyMeterChanges, awardXP, recordGrantedReward, setSharedVowReward, setBondItemRank } from "./character/actorBridge.js";
import { registerPrivateChannelSettings } from "./private-channel/index.js";
import { ensureHelpJournal } from "./help/helpJournal.js";
import { openSectorCreator } from "./sectors/sectorPanel.js";
import { openSystemTruthsDialog, generateLoreRecap } from "./truths/generator.js";

import {
  openProgressTracks,
  registerProgressTrackHooks,
  getActiveCombatPosition,
  listProgressTracks,
  markProgressById,
  addProgressTrack,
  completeProgressTrack,
  updateTrackFields,
} from "./ui/progressTracks.js";
import { applyExpeditionProgress, finishExpedition, legacyRewardTicks, selectExpeditionTrack, planRecommit } from "./moves/expedition.js";
import { selectSectorSite } from "./sectors/precursorSites.js";
import { finishVow, shouldPayFulfilledVow } from "./moves/vow.js";
import { isBattleStationsCommand, renderBattleStationsCardHtml } from "./moves/battleStations.js";
import {
  isShipMapCommand,
  generateShipMapForActor,
  findShipMapScene,
  registerShipMapSceneHooks,
} from "./moves/shipMapScene.js";
import { applyCombatProgress, finishCombat as finishCombatTrack, selectCombatTrack } from "./moves/combat.js";
import { buildCombatThresholdHtml, buildWayOutHtml, WAY_OUT_MOVES } from "./moves/combatThreshold.js";
import {
  enterCombatTracker,
  endCombatTracker,
  applyCombatPositionToTrack,
  registerCombatTrackerHooks,
  registerCombatTrackerSettings,
} from "./moves/combatTracker.js";
import { selectConnection, planDevelopRelationship, buildConnectionSuggestion, shouldForgeBond } from "./moves/developRelationship.js";
import { handleBondCommand } from "./moves/bondCommand.js";
import { postReachMilestoneCard } from "./moves/milestonePicker.js";
import { planReachMilestone, buildMilestoneSuggestion, marksForSourceRank } from "./moves/milestone.js";
import {
  extractRiders,
  collectFiringRiders,
  partitionRiders,
  applyMeterRiders,
} from "./moves/consequenceRiders.js";
import { promptRiders } from "./moves/riderDialog.js";

import { registerEntityPanelHooks } from "./ui/entityPanel.js";
import { registerChroniclePanelHooks } from "./character/chroniclePanel.js";

import {
  confirmInterpretation,
  registerSettings    as registerUISettings,
  registerSettingsHooks,
  getMischiefDial,
  getAutoRecapEnabled,
  getSessionGapHours,
  getRecapGmOnly,
  getShipPositioningEnabled,
  getShipAutoMoveOnCourse,
} from "./ui/settingsPanel.js";

import {
  initWorldJournals,
  parseJournalCommand,
  executeJournalCommand,
} from "./world/worldJournal.js";
import {
  installConsoleInterceptor,
  flushErrorLogBuffer,
  registerErrorLogSocket,
} from "./logging/errorLog.js";
import { flushApiTransactionLogBuffer } from "./logging/apiTransactionLog.js";
import { showMoveRoll, showD100 } from "./dice/diceAnimation.js";

import {
  openCompanionToolbar,
  registerCompanionToolbarSettings,
} from "./ui/companionToolbar.js";
import { registerLayoutSettings, initLayoutMode } from "./ui/layoutMode.js";

import { resolveRelevance } from "./context/relevanceResolver.js";
import { suppressScene, postXCardCard, clearXCard } from "./context/safety.js";
import { startScene, endScene, mergeOwnedFields } from "./factContinuity/sceneLifecycle.js";
import { rollSessionIfDue, registerSessionActivityHook, SESSION_MINT_FIELDS } from "./session/lifecycle.js";
import { getCurrentSiteKind } from "./entities/location.js";
import { recordOracleResult } from "./oracles/oracleMemory.js";
import { openCorrectionDialog } from "./factContinuity/correctionDialog.js";
import { handleFactContinuityCommand } from "./factContinuity/chatCommands.js";
import { requestOracleNarration } from "./oracles/oracleFollowup.js";
import { inferShipPosition } from "./factContinuity/shipPosition.js";
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
import { registerSwearVowHandler, registerSharedVowSocket, registerSharedVowSyncHook, registerRewardChoiceHook, swearSharedVowForAll, registerPlayerVowHook, registerPlayerVowSwearHook, registerPlayerVowLinkHook } from "./session/swearVow.js";
import { onChatMessageRender }    from "./system/chatHooks.js";
import {
  isMigrateEntitiesCommand,
  handleMigrateEntitiesCommand,
} from "./entities/migrator.js";
import { registerSectorOverviewSync } from "./sectors/sectorOverview.js";
import {
  registerSectorSceneHooks,
  moveCommandVehicleTokenToDestination,
  syncCommandVehicleTokenToPosition,
} from "./sectors/sectorSceneHooks.js";
import { isCanonicalGM, advertiseClaudeKeyPresence } from "./multiplayer/gmGate.js";
import { registerGmRelaySocket, announceGmRelayReady, requestGmAction } from "./multiplayer/gmRelay.js";
import { relayCardAction } from "./moves/cardActions.js";
import { advanceClocksOnPayThePrice } from "./clocks/payThePriceClocks.js";
import { takeNextMoveAdd, clearPersistedNextMoveAdd } from "./moves/nextMoveAdd.js";
import { registerSharedSupplyHook } from "./multiplayer/sharedSupply.js";
import {
  DEFAULT_NARRATOR_VOICE_ID,
  DEFAULT_NPC_VOICE_ID,
  DEFAULT_NPC_FEMININE_VOICE_ID,
} from "./audio/elevenlabs.js";
import { getEntityDocument, readEntityFlag } from "./entities/registry.js";
import { resolveSpeakerActorId, messageAuthorId } from "./multiplayer/speaker.js";
import { RUN_ON, dispatchChatCommand } from "./multiplayer/commandRouting.js";

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
    // Keep the keyed-GM routing registry in sync the moment a GM enters or
    // clears their key, so the single-emitter pipeline always runs on a GM
    // that actually holds a key (see gmGate.js / advertiseClaudeKeyPresence).
    onChange: () => { advertiseClaudeKeyPresence().catch(() => {}); },
  });

  // Keyed-GM routing registry — world-scoped list of GM user IDs whose client
  // currently holds a Claude key. The narration/move pipeline runs on exactly
  // one GM client (isCanonicalGM); this lets it pick a GM that actually has a
  // key instead of the bare lowest-userId GM, which silently broke every move
  // when a keyless player was promoted to GM. User IDs only are stored here —
  // never the key — so issue #209 (keys never leave the browser) still holds.
  game.settings.register(MODULE_ID, "keyedGmUserIds", {
    name:    "Keyed GM registry",
    scope:   "world",
    config:  false,
    type:    Array,
    default: [],
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

  game.settings.register(MODULE_ID, "sectorArtEnabled", {
    name:    "Generate Sector Background Art",
    hint:    "Generate a background image (via OpenRouter, FLUX.2 Pro by default) for each new sector. Requires the OpenRouter API key.",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "shipMapEnabled", {
    name:    "Generate Ship Deck-Plan Maps (Battle Stations!)",
    hint:    "Build a deck-plan Scene with the 11 shipboard-combat stations pinned when a command vehicle is created or finalised. You can also build one on demand with the !shipmap chat command.",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "shipMapArtEnabled", {
    name:    "Generate Ship Deck-Plan Art",
    hint:    "When ship deck-plan maps are enabled, generate a top-down deck-plan background image (via OpenRouter) for each ship map. Requires the OpenRouter API key; falls back to a schematic hull outline when off or unavailable.",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "shipMapVisionEnabled", {
    name:    "Place Stations on Deck-Plan Art (Vision)",
    hint:    "When deck-plan art is generated, ask a vision-capable Claude model to locate each station on the image so the pins land on the compartments the art drew. Requires the Claude API key. Falls back to the fixed schematic layout when off, without a key, or when the result is unreliable.",
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

  game.settings.register(MODULE_ID, "sectorEntityPortraitsEnabled", {
    name:    "Generate Sector Entity Portraits",
    hint:    "Auto-finalize each settlement created by the Sector Creator and generate its portrait + token image. Requires the OpenRouter API key.",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, "autoSeedStarship", {
    name:    "Auto-Seed Starship Details",
    hint:    "Roll the starship Type / First Look / Mission oracles, install matching modules, write the Notes, and generate a portrait AT CREATION. Off by default — new starships are created blank so you can set them up first, then populate them with the ✦ Finalise button in the Entities panel.",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, "autoSeedConnection", {
    name:    "Auto-Seed NPC / Connection Details",
    hint:    "Roll the Character First Look / Initial Disposition / Role / Goal oracles into a new NPC card's Characteristics, write a Notes introduction, and generate a portrait AT CREATION. Off by default — new NPC cards are created blank; populate them with the ✦ Finalise button in the Entities panel.",
    scope:   "world",
    config:  true,
    type:    Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, "speechInputEnabled", {
    name:     "Push-to-Talk",
    hint:     "Push-to-talk speech input (adds a 🎙 button to the chat bar). On by default for every player; this is a per-player, per-device setting — turn it off here if you don't want it. Requires a Chromium-based browser and microphone permission.",
    scope:    "client",
    config:   true,
    type:     Boolean,
    default:  true,
    onChange: (value) => {
      if (!value) {
        disableSpeechInput();
        return;
      }
      initSpeechInput();
      // The chat's render hooks add the 🎙 button only when it re-renders.
      const chatRoot = globalThis.ui?.chat?.element ?? globalThis.document?.body;
      if (chatRoot) injectPushToTalkButton(chatRoot);
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

  // -------------------------------------------------------------------------
  // Audio narration (issue #221 (Audio Narration))
  //
  // World-scoped GM controls: master toggle, voice IDs, model, speed, cache
  // cap. Client-scoped per-player controls: API key, client enable, volume,
  // autoplay. The Companion Settings panel surfaces these through a dedicated
  // Audio tab; none of them appear in Foundry's default Configure Settings
  // dialog.
  // -------------------------------------------------------------------------
  game.settings.register(MODULE_ID, "audio.enabled", {
    name: "Audio narration enabled", scope: "world", config: false,
    type: Boolean, default: true,
  });
  // Auto-apply asset consequence riders (momentum/meters/integrity/progress
  // from a move's outcome) so the player doesn't adjust resources by hand.
  // Optional/choice/ambiguous-progress riders still prompt. GM can disable.
  game.settings.register(MODULE_ID, "riders.autoApply", {
    name: "Auto-apply asset consequence riders",
    hint: "When a move's outcome triggers an asset effect (e.g. +1 momentum on a strong hit), apply it automatically. Optional or 'choose one' effects ask first. Effects are read from the asset text using the GM's Claude key (the same one narration uses, via the GM client) — players don't need their own key.",
    scope: "world", config: true, type: Boolean, default: true,
  });
  game.settings.register(MODULE_ID, "audio.narratorVoiceId", {
    name: "Narrator voice ID", scope: "world", config: false,
    type: String, default: DEFAULT_NARRATOR_VOICE_ID,
  });
  game.settings.register(MODULE_ID, "audio.npcVoiceId", {
    name: "NPC voice ID", scope: "world", config: false,
    type: String, default: DEFAULT_NPC_VOICE_ID,
  });
  // Pronoun-keyed NPC voices (v1.7.11 finding F). When set, an NPC card's
  // focal connection picks the voice matching its established pronouns;
  // empty falls back to audio.npcVoiceId so existing worlds are unchanged.
  // Feminine defaults to Rachel (21m00…) so she/her NPCs sound distinct from
  // the narrator out of the box.
  game.settings.register(MODULE_ID, "audio.npcVoiceFeminine", {
    name: "NPC voice — feminine (she/her)", scope: "world", config: false,
    type: String, default: DEFAULT_NPC_FEMININE_VOICE_ID,
  });
  game.settings.register(MODULE_ID, "audio.npcVoiceMasculine", {
    name: "NPC voice — masculine (he/him)", scope: "world", config: false,
    type: String, default: "",
  });
  game.settings.register(MODULE_ID, "audio.npcVoiceNeutral", {
    name: "NPC voice — neutral (they/them)", scope: "world", config: false,
    type: String, default: "",
  });
  game.settings.register(MODULE_ID, "audio.modelId", {
    name: "ElevenLabs model", scope: "world", config: false,
    type: String, default: "eleven_flash_v2_5",
  });
  game.settings.register(MODULE_ID, "audio.speed", {
    name: "Playback speed", scope: "world", config: false,
    type: Number, default: 1.0, range: { min: 0.7, max: 1.5, step: 0.1 },
  });
  game.settings.register(MODULE_ID, "audio.cacheMaxBytes", {
    name: "Audio cache size cap (bytes)", scope: "world", config: false,
    type: Number, default: 200 * 1024 * 1024,
  });

  game.settings.register(MODULE_ID, "elevenLabsApiKey", {
    name: "ElevenLabs API Key",
    hint: "Your ElevenLabs API key. Stored locally in your browser — never sent to Foundry's server.",
    scope: "client", config: false, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "audio.clientEnabled", {
    name: "Enable audio narration on this client", scope: "client",
    config: false, type: Boolean, default: true,
  });
  game.settings.register(MODULE_ID, "audio.volume", {
    name: "Audio volume", scope: "client", config: false,
    type: Number, default: 0.8, range: { min: 0, max: 1, step: 0.05 },
  });
  game.settings.register(MODULE_ID, "audio.autoplay", {
    name: "Auto-play narrator audio", scope: "client", config: false,
    type: Boolean, default: false,
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
 * Resume the session in progress on world load, or close it out and start a
 * new one when it is over — End a Session marked it, or nothing was posted to
 * chat for SESSION_IDLE_HOURS (rollSessionIfDue, src/session/lifecycle.js).
 * A reload mid-session resumes it however long the session has run; it used
 * to re-mint any reload four hours after the mint (issue #286 C4).
 *
 * Mutates campaignState; the caller persists SESSION_MINT_FIELDS. Exported
 * for unit testing; called from the ready hook (canonical GM).
 *
 * @param {Object} campaignState
 * @returns {Promise<Object>} the same campaignState
 */
export async function initSessionId(campaignState) {
  if (!(await rollSessionIfDue(campaignState))) {
    console.log(`${MODULE_ID} | Resuming session: ${campaignState.currentSessionId}`);
    return campaignState;
  }
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


// ─────────────────────────────────────────────────────────────────────────────
// CHAT COMMAND ROUTING — who runs which command
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ordered command routes — first match wins, exactly the order the old
 * if-chain checked predicates in (some predicates overlap textually).
 * `run` receives the ChatMessage. Each route's `runOn` policy (AUTHOR /
 * CANONICAL_GM / CLAUDE) is applied by src/multiplayer/commandRouting.js.
 * Exported for the routing matrix (tests/unit/multiplayerRouting.test.js),
 * which runs every route under every table shape on the multi-client harness.
 */
export const CHAT_COMMAND_ROUTES = [
  { name: "@scene",            match: isSceneQuery,              runOn: RUN_ON.CLAUDE,       run: handleSceneQueryCommand },
  { name: "!sector",           match: isSectorCommand,           runOn: RUN_ON.AUTHOR,       run: handleSectorCommand },
  { name: "!x",                match: isXCardCommand,            runOn: RUN_ON.CANONICAL_GM, run: handleXCardCommand },
  { name: "!at",               match: isAtCommand,               runOn: RUN_ON.AUTHOR,       run: handleAtCommand },
  // !journal assigns the in-flight work synchronously (before any await) so
  // callers that grab it right after `ChatMessage.create()` resolves can await
  // the full journal write chain. See getLastJournalCommandPromise().
  { name: "!journal",          match: isJournalCommand,          runOn: RUN_ON.AUTHOR,
    run: (message) => (_lastJournalCommandWork = handleJournalCommand(message)) },
  { name: "!scene",            match: isSceneCommand,            runOn: RUN_ON.AUTHOR,       run: handleSceneCommand },
  { name: "!truth / !state",   match: isFactContinuityCommand,   runOn: RUN_ON.AUTHOR,       run: handleFactContinuityCommand },
  { name: "!truths",           match: isTruthsCommand,           runOn: RUN_ON.AUTHOR,       run: handleTruthsCommand },
  { name: "!lore",             match: isLoreCommand,             runOn: RUN_ON.AUTHOR,       run: handleLoreCommand },
  { name: "!sfc encounter",    match: isEncounterCommand,        runOn: RUN_ON.AUTHOR,       run: handleEncounterCommand },
  { name: "!recap",            match: isRecapCommand,            runOn: RUN_ON.CLAUDE,       run: handleRecapCommand },
  { name: "!recap (GM-only)",  match: isDeniedRecapCommand,      runOn: RUN_ON.AUTHOR,       run: handleDeniedRecapCommand },
  { name: "!pace",             match: isPaceCommand,             runOn: RUN_ON.AUTHOR,       run: handlePaceCommand },
  // !narrator debug shows this browser's own capture of the last narrator
  // request (narration/narratorDebug.js), so it runs where it was typed.
  { name: "!narrator",         match: isNarratorCommand,         runOn: RUN_ON.AUTHOR,       run: handleNarratorCommand },
  { name: "!migrate-entities", match: isMigrateEntitiesCommand,  runOn: RUN_ON.AUTHOR,       run: handleMigrateEntitiesCommand },
  { name: "!oracle",           match: isOracleCommand,           runOn: RUN_ON.AUTHOR,       run: handleOracleCommand },
  { name: "!pay-the-price",    match: isPayThePriceCommand,      runOn: RUN_ON.AUTHOR,       run: handlePayThePriceCommand },
  { name: "!bond",             match: isBondCommand,             runOn: RUN_ON.AUTHOR,       run: handleBondCommand },
  { name: "!sever",            match: isSeverCommand,            runOn: RUN_ON.AUTHOR,       run: handleSeverCommand },
  // Session safety / lifecycle — DialogV2 surfaces on the typist's screen;
  // their world writes relay to the GM from the dialogs' own apply paths.
  { name: "!flag",             match: isFlagCommand,             runOn: RUN_ON.AUTHOR,       run: () => openSetFlagDialog() },
  { name: "!fate",             match: isFateCommand,             runOn: RUN_ON.AUTHOR,       run: () => openChangeYourFateDialog() },
  { name: "!break",            match: isBreakCommand,            runOn: RUN_ON.AUTHOR,       run: () => openTakeABreakDialog() },
  { name: "!begin-session",    match: isBeginSessionCommand,     runOn: RUN_ON.AUTHOR,       run: () => openBeginSessionDialog() },
  { name: "!end-session",      match: isEndSessionCommand,       runOn: RUN_ON.AUTHOR,       run: () => openEndSessionDialog() },
  { name: "!incite",           match: isIncitingIncidentCommand, runOn: RUN_ON.CLAUDE,       run: handleIncitingIncidentCommand },
  { name: "!reveal-site",      match: isRevealSiteCommand,       runOn: RUN_ON.AUTHOR,       run: handleRevealSiteCommand },
  { name: "!clear-site",       match: isClearSiteCommand,        runOn: RUN_ON.AUTHOR,       run: handleClearSiteCommand },
  { name: "!clock",            match: isClockCommand,            runOn: RUN_ON.AUTHOR,       run: handleClockCommand },
  { name: "!repair",           match: isRepairCommand,           runOn: RUN_ON.AUTHOR,       run: handleRepairCommand },
  { name: "!stations",         match: isBattleStationsCommand,   runOn: RUN_ON.AUTHOR,       run: handleBattleStationsCommand },
  { name: "!shipmap",          match: isShipMapCommand,          runOn: RUN_ON.AUTHOR,       run: handleShipMapCommand },
  { name: "!ship envision",    match: isShipEnvisionCommand,     runOn: RUN_ON.CLAUDE,       run: handleShipEnvisionCommand },
  { name: "!ship history",     match: isShipHistoryCommand,      runOn: RUN_ON.CLAUDE,       run: handleShipHistoryCommand },
  { name: "!oracle-add",       match: isOracleAddCommand,        runOn: RUN_ON.AUTHOR,       run: handleOracleAddCommand },
  { name: "!roll",             match: isRollCommand,             runOn: RUN_ON.AUTHOR,       run: handleRollCommand },
];

/**
 * @scene — scene interrogation. Resets the recent move-density window so the
 * pacing classifier doesn't carry over a run of MOVE decisions. RUN_ON.CLAUDE:
 * it calls Claude on the keyed canonical GM when one is connected; otherwise
 * on the author's client, which narrates and relays the narrator side-data to
 * the canonical GM (issue #286 D2).
 *
 * It asks about the scene in progress, so it continues that scene (issue #286
 * A4): interrogateScene starts one only when none is active (on the canonical
 * GM). It used to end the scene first, so the answer was written without the
 * frame, truths, state or CORRECTED list it was asked about. Scenes end at
 * `!scene end`, End Session, the 4-hour re-mint and closeWorld.
 */
async function handleSceneQueryCommand(message) {
  const text     = message.content?.trim() ?? "";
  const question = text.replace(/^@scene\s*/i, "").trim();
  if (!question) {
    console.debug(`${MODULE_ID} | @scene: empty question — nothing to ask.`);
    return;
  }
  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  resetRecentDensity();
  // Full speaker resolution (token selection → bound character →
  // ownership → fallback) — the bound-character-only read this
  // replaces attributed every @scene to the default PC in multiplayer.
  await interrogateScene(question, campaignState, {
    speakerActorId: resolveSpeakerActorId(message, campaignState),
  });
}

/** !truths — open the system World Truths dialog (GM only). */
function handleTruthsCommand() {
  if (!game.user.isGM) {
    ui.notifications.warn("!truths is GM-only.");
    return;
  }
  openSystemTruthsDialog();
}

/** !lore — generate and post the narrator world-truths recap (GM only). */
async function handleLoreCommand() {
  if (!game.user.isGM) {
    ui.notifications.warn("!lore is GM-only.");
    return;
  }
  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  await generateLoreRecap(campaignState).catch(err =>
    console.error(`${MODULE_ID} | !lore failed:`, err)
  );
}

/** !sfc encounter <name> — spawn a canonical foundry-ironsworn encounter. */
async function handleEncounterCommand(message) {
  const name = parseEncounterCommand(message.content);
  if (!name) return;
  await spawnEncounter(name).catch(err =>
    console.error(`${MODULE_ID} | encounter spawn failed:`, err)
  );
}

/** !recap [session [N] | campaign] — post a recap (RUN_ON.CLAUDE: Claude call). */
async function handleRecapCommand(message) {
  const text = message.content?.trim() ?? "";
  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  if (/^!recap\s+session(?:\s+(\d+))?/i.test(text)) {
    await postSessionRecap(campaignState, null);
  } else {
    await postCampaignRecap(campaignState);
  }
}

/** A player's `!recap` while the "Recap GM-only" setting is on. */
function handleDeniedRecapCommand() {
  ui.notifications?.warn("Starforged Companion: !recap is GM-only (the GM can change this in Companion Settings).");
}

/**
 * !stations — post the Battle Stations! shipboard-combat play aid (the 11 crew
 * roles). Any player may invoke; it's a static reference card.
 */
async function handleBattleStationsCommand() {
  await ChatMessage.create({
    content: renderBattleStationsCardHtml(),
    flags:   { [MODULE_ID]: { battleStationsCard: true } },
  }).catch(err => console.warn(`${MODULE_ID} | !stations card failed:`, err?.message ?? err));
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
 *   6. (retired 2026-07) the context packet is no longer built — narrator
 *      context flows through buildNarratorExtras (FACTION-PACKET-DEAD)
 *   7. postMoveResult() posts HTML move result card
 *   8. narrateResolution() calls Claude directly, posts narration card
 *   9. persistResolution() applies meter/track changes to character and campaign state
 */
export function registerChatHook() {
  Hooks.on("createChatMessage", async (message) => {
    // Chat commands (`@scene`, `!…`) — routed before the move pipeline. Every
    // command is consumed on EVERY client (so plain-narration handling below
    // never sees one) but executes only where its run-on policy says.
    if (await dispatchChatCommand(message, CHAT_COMMAND_ROUTES)) return;

    if (!isPlayerNarration(message)) return;

    // Single-emitter gate. The createChatMessage hook fires on every
    // connected client; without this gate, every client ran pacing →
    // interpretation → narration → persistence, producing duplicate
    // narrator cards (real + fallback, since players' BYOK keys were
    // empty) and red permission toasts on non-GM clients trying to
    // write campaignState / create JournalEntryPages. The canonical
    // GM (lowest-userId active GM) is now the sole pipeline runner;
    // players just type and watch the narration appear.
    if (!isCanonicalGM()) return;

    // Session-active gate. Pre-session (the Session Panel's Begin
    // Session button has not been pressed yet, or End Session has
    // flipped the flag back to false), plain typed narration must NOT
    // trigger the implicit move-pipeline / paced-narrator path —
    // players can interact with cards (X-Card, draft Confirm/Dismiss,
    // recap Refresh) and run explicit narration commands (@scene,
    // !oracle yes, !pay-the-price, !lore — all caught by earlier
    // predicates above) without burning Claude credit on every chat
    // message during setup. See `src/session/lifecycle.js`.
    try {
      const { isSessionActive } = await import("./session/lifecycle.js");
      const cs = game.settings.get(MODULE_ID, "campaignState");
      if (!isSessionActive(cs)) return;
    } catch (err) {
      // Defensive: if the import or read fails, fail-OPEN — treat the
      // session as active and run the pipeline. The downside of
      // fail-closed is "narration completely stops working on a
      // module-load edge case", which is worse than "pre-session
      // narration runs once".
      console.warn(`${MODULE_ID} | session-active gate check failed (failing open):`, err?.message ?? err);
    }

    // Resolve the speaking player's character — message.author.character
    // first, then ownership scan, then campaignState fallback. Pre-gate,
    // the pipeline always picked campaignState.characterIds[0] regardless
    // of who spoke; the narrator described Player A's PC even when Player
    // B was the one typing.
    const speakerActorId = resolveSpeakerActorId(
      message,
      game.settings.get(MODULE_ID, "campaignState"),
    );

    const narration = message.content;
    const apiKeyForPacing = game.settings.get(MODULE_ID, "claudeApiKey");

    // Per-message bypass — the "Roll <move>" button on an NWMA card re-posts
    // the player's input with `bypassPacing: true` so the classifier is
    // skipped and the move pipeline runs immediately. Cheaper than the
    // campaignState-scoped `!roll` flag and avoids any GM-write race.
    const bypassPacing = message.flags?.[MODULE_ID]?.bypassPacing === true;

    // The NWMA card also carries `forcedMoveId` — the move the pacing
    // classifier nominated. Honoring it skips the LLM interpretation and
    // prevents the re-classifier from picking a different move (e.g. the
    // input "search for Doctor Chen" reads as gather_information once the
    // pacing context is gone, even when the classifier nominated
    // make_a_connection).
    const forcedMoveId = typeof message.flags?.[MODULE_ID]?.forcedMoveId === "string"
      ? message.flags[MODULE_ID].forcedMoveId
      : null;

    // The Token-drag set_a_course affordance (fact-continuity §20.4b)
    // also forces a move. The destination name flows in via
    // `forcedMoveTarget` so the resolver / position-update path can
    // pick it up without re-interpreting the prose.
    const forcedMoveTarget = typeof message.flags?.[MODULE_ID]?.forcedMoveTarget === "string"
      ? message.flags[MODULE_ID].forcedMoveTarget
      : null;
    // A connection picker also names the connection's host Actor id — the
    // stable key the develop / forge branches resolve by (issue #301 B01).
    const forcedMoveTargetId = typeof message.flags?.[MODULE_ID]?.forcedMoveTargetId === "string"
      ? message.flags[MODULE_ID].forcedMoveTargetId
      : null;
    const tokenDragSetCourse = message.flags?.[MODULE_ID]?.tokenDragSetCourse ?? null;

    // Pacing classifier — decides whether to run the move pipeline, narrate
    // only, or narrate with an inline move suggestion. The classifier runs
    // freely; only the MOVE branch claims the pendingMove lock below.
    const preState  = game.settings.get(MODULE_ID, "campaignState");
    const character = getActiveCharacterForPacing(preState, speakerActorId);
    let pacingResult = { runMove: true, decision: "MOVE", suggestedMove: null };
    if (!bypassPacing) {
      try {
        pacingResult = await routePacedInput({
          playerText: narration,
          campaignState: preState,
          character,
          apiKey: apiKeyForPacing,
          speakerActorId,
        });
      } catch (err) {
        console.error(`${MODULE_ID} | pacing router failed; falling through to move pipeline:`, err);
      }
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
    try {
      await game.settings.set(MODULE_ID, "campaignState", campaignState);
    } catch (err) {
      // The claim never landed. `campaignState` is this client's cached
      // setting value (Foundry returns it by reference): left set, the flag
      // refused every later move here until a reload (issue #302).
      campaignState.pendingMove = false;
      console.error(`${MODULE_ID} | could not claim the move lock:`, err);
      ui.notifications?.error?.("Starforged Companion: the move could not start — the world did not save it. Try again.");
      return;
    }

    const apiKey = apiKeyForPacing;
    const dial   = getMischiefDial();

    try {
      // Resolve the single active combat track's position once. Fed to the
      // interpreter so it only proposes position-appropriate combat moves
      // (constrainMoveToPosition forces the result legal), and reused below for
      // the Take Decisive Action bad-spot downgrade. null out of combat, or when
      // there are zero/multiple active combat tracks.
      const combatPosition = await getActiveCombatPosition();

      const interpretation = forcedMoveId
        ? buildForcedInterpretation(forcedMoveId, narration, dial, forcedMoveTarget, forcedMoveTargetId)
        : await interpretMove(narration, {
            campaignState,
            mischiefLevel: dial,
            apiKey,
            combatPosition,
          });

      if (interpretation.mischiefApplied) {
        interpretation._mischiefAside = buildMischiefAside(
          interpretation.rationale ?? "",
          interpretation.moveId,
          interpretation.statUsed,
          dial
        );
      }

      // The ROLLER's character (decisions.md → "Multiplayer attribution"):
      // the speaker resolved from the message, first PC only as fallback.
      // One actor drives the ability scan, the stat substitution it offers,
      // and the stat values read below — scanning PC A's assets but reading
      // PC B's stats offered substitutions B doesn't have.
      const speakerActor = speakerActorId ? game.actors?.get(speakerActorId) : null;
      const rollerActor  = speakerActor ?? getPlayerActors()[0] ?? null;

      // Scan the character's assets + the command vehicle's modules for
      // abilities that apply to the chosen move. Surfaced on the
      // confirmation dialog as opt-in checkboxes — accepted abilities
      // add their +N to interpretation.adds before the dice are rolled.
      const commandShipForScan      = getCommandVehicleActor(campaignState);
      const applicableAbilities = await scanForApplicableAbilities({
        moveId:           interpretation.moveId,
        moveName:         interpretation.moveName,
        narration,
        characterActor:   rollerActor,
        commandShipActor: commandShipForScan,
        apiKey,
      }).catch(err => {
        console.warn(`${MODULE_ID} | ability scan failed:`, err);
        return [];
      });
      interpretation.applicableAbilities = applicableAbilities;

      // Extract structured consequence riders from the applicable abilities now
      // (pre-roll, during the confirm-dialog wait) so they're ready to apply the
      // instant the outcome is known. No key / nothing applicable → []; the
      // post-roll step then no-ops and the ability text is just surfaced.
      interpretation.extractedRiders =
        (game.settings.get(MODULE_ID, "riders.autoApply") !== false && applicableAbilities.length)
          ? await extractRiders({
              abilities: applicableAbilities,
              moveName:  interpretation.moveName,
              apiKey,
            }).catch(err => {
              console.warn(`${MODULE_ID} | rider extraction failed:`, err?.message ?? err);
              return [];
            })
          : [];

      const accepted = await confirmInterpretation(interpretation);
      if (!accepted) return;

      // Apply opt-in adds from abilities the player kept checked in the
      // dialog. confirmInterpretation mutates interpretation.appliedAbilityAdds.
      const abilityAdds = Number(interpretation.appliedAbilityAdds ?? 0);
      if (abilityAdds > 0) {
        interpretation.adds = (interpretation.adds ?? 0) + abilityAdds;
      }

      // Take a Break → "Move on": a single-use +1 on the next action roll (not
      // a progress move). Consumed from the working copy (so persistResolution's
      // clone can't resurrect it) and from the stored campaignState.
      const breakAdd = takeNextMoveAdd(campaignState, interpretation.moveId);
      if (breakAdd > 0) {
        interpretation.adds = (interpretation.adds ?? 0) + breakAdd;
        await clearPersistedNextMoveAdd();
      }

      // Stat substitution — when an asset ability (e.g. Empath's
      // "roll +heart in place of the listed stat") was offered AND the
      // player picked it on the confirm dialog, swap the move stat
      // before stat-value enrichment reads the actor sheet. The dialog
      // has already gated the value to one of the offered stats.
      const subStat = typeof interpretation.appliedStatReplacement === 'string'
        ? interpretation.appliedStatReplacement.trim()
        : '';
      if (subStat) {
        interpretation.statSubstitutedFrom = interpretation.statUsed;
        interpretation.statUsed = subStat;
      }

      // Fill in statValue from the speaker's character sheet. The
      // interpreter system prompt explicitly tells the model to leave
      // statValue at 0 and have the calling code fill it in (see
      // interpreter.js line 149); pre-this-fix nothing did, so every
      // action move resolved as actionDie + 0 + adds — players saw
      // "+iron (0)" and "Action: 6 + 0 = 6" on every chat card.
      enrichInterpretationStatValue(rollerActor, interpretation, campaignState);

      // Progress moves score from live module data (combat/expedition journal
      // tracks, actor vow Items, connection records) — the fix for pipeline
      // progress rolls always resolving at score 0 (nothing ever copied a
      // track's ticks into statValue, so Take Decisive Action and the victory
      // card's Attempt to Fulfill could never hit). Also returns the resolved
      // combat track's own position for the TDA downgrade below. No-op for
      // action moves.
      const tickInfo = await enrichProgressTicks(interpretation, {
        listTracks: () => listProgressTracks(),
        readAllVows: async () => {
          const actors = getPlayerActors();
          // Speaker-first so a name tie resolves to the roller's own vow copy.
          actors.sort((a, b) =>
            (a.id === speakerActorId ? -1 : 0) - (b.id === speakerActorId ? -1 : 0));
          return actors.flatMap(a => readVows(a).map(v => ({ ...v, actorId: a.id })));
        },
        listConnections: async () => {
          const conn = await import("./entities/connection.js");
          return (campaignState.connectionIds ?? [])
            .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
            .filter(Boolean);
        },
      }).catch(err => {
        console.warn(`${MODULE_ID} | progress tick enrichment failed:`, err?.message ?? err);
        return null;
      });

      // A roll started from a track (a Progress Tracks row, an expedition
      // card) names it by id. When that track was deleted or finished
      // meanwhile, nothing is rolled — and it says so: a same-named sibling is
      // a different fight, and a score of 0 would be a certain miss with its
      // consequences (issue #306 R06).
      if (interpretation.moveTargetId
          && (tickInfo?.source === "combat" || tickInfo?.source === "expedition")
          && !tickInfo.trackId) {
        await postTrackGoneCard(interpretation).catch(err =>
          console.warn(`${MODULE_ID} | track-gone card failed:`, err?.message ?? err));
        return;
      }

      // Take Decisive Action — the resolver applies the bad-spot downgrade
      // (play kit p. 5). Prefer the enriched track's own position (exact even
      // with several open fights, where getActiveCombatPosition returns null);
      // fall back to the single-active-track position resolved at the top of
      // this block. resolveMove gates the downgrade on moveId, so passing a
      // position for every move is safe (no-op for non-TDA moves).
      const resolvedPosition =
        (interpretation.moveId === "take_decisive_action" && tickInfo?.combatState)
          ? tickInfo.combatState
          : combatPosition;
      // Site-aware waypoint seeds (SITE-WAYPOINT-BLIND): when the crew's
      // current location is a vault or derelict, explore_a_waypoint rolls
      // that site's canonical interior tables.
      const currentSite = getCurrentSiteKind(campaignState);
      const resolution = resolveMove(interpretation, campaignState, { combatPosition: resolvedPosition, currentSite });
      // resolveMove leaves the id to its caller. The move card's Burn / Improve
      // flags and the narration card both carry it, and superseding the
      // original narration after an upgrade finds that card by it — with no id
      // the struck-through pre-burn prose was never struck and kept reaching
      // the narrator's recent-narration ring (issue #300 F02).
      resolution._id = foundry.utils.randomID();

      // Fact-continuity §20 — when a travel move with ARRIVAL semantics
      // resolves to a non-miss, the ship arrived at the destination the
      // player named. Infer the new position and write it onto the
      // command vehicle BEFORE the assembler builds the context packet so
      // Section 6.5 reflects the arrival on this same turn.
      //
      // Cluster C: finish_an_expedition joins set_a_course — both mean
      // "you reach your destination" on a hit (play kit). The
      // undertake_an_expedition waypoint move stays deliberately unwired:
      // a hit marks progress, not arrival.
      const arrivalMove =
        resolution.moveId === "set_a_course"
        || resolution.moveId === "finish_an_expedition";
      if (
        arrivalMove
        && resolution.outcome !== "miss"
        && getShipPositioningEnabled()
        && getShipAutoMoveOnCourse()
        && game.user.isGM
      ) {
        await maybeUpdateShipPositionFromName(
          interpretation.moveTarget,
          campaignState,
          tokenDragSetCourse ? "scene_token"
            : resolution.moveId === "finish_an_expedition" ? "expedition"
            : "set_a_course",
        );

        // Keep the campaign's "current location" in step with the arrival —
        // previously only a manual !at wrote currentLocationId, so travelling
        // by move left the narrator options / entity-panel highlight pointing
        // at the last !at (LOCATION-DUAL-STORE fix). Same resolver as !at; a
        // destination that isn't a tracked entity leaves the store untouched.
        const arrivedAt = resolveCurrentLocationName(interpretation.moveTarget ?? "", campaignState);
        if (arrivedAt) {
          campaignState.currentLocationId   = arrivedAt.id;
          campaignState.currentLocationType = arrivedAt.type;
        } else if (interpretation.moveTarget) {
          console.debug(`${MODULE_ID} | arrival: "${interpretation.moveTarget}" is not a tracked location — currentLocation unchanged.`);
        }

        // §20.4b — when the move was initiated by a Token drag and we
        // succeeded, also move the Token to the destination Note's
        // coordinates. On a miss the Token never moved (the drag was
        // cancelled in the preUpdateToken hook), so no snap-back is
        // needed.
        if (tokenDragSetCourse) {
          await moveCommandVehicleTokenToDestination(tokenDragSetCourse).catch(err =>
            console.warn(`${MODULE_ID} | Token-drag commit failed:`, err),
          );
        }

        // F15 (folded into F16 Phase F): surface a follow-up card so the
        // user sees that the token moved + which destination. Before this
        // wire, the position update fired silently and players hit F16's
        // "narrator says something happened, sheet shows nothing" trust
        // gap on every Set a Course. The card is informational —
        // SufferChoiceDialog handles the actual meter changes from the
        // weak-hit choice in parallel.
        await postSetACourseFeedbackCard(
          interpretation.moveTarget,
          resolution,
        ).catch(err => console.warn(`${MODULE_ID} | Set a Course feedback card failed:`, err?.message ?? err));
      }

      // Exploration lifecycle — Undertake an Expedition (and Explore a Waypoint)
      // mark progress on the shared expedition track. Resolve-or-create the
      // track (rank inferred by the interpreter) and mark one rank-step. GM-only
      // (progress-track writes go to the hidden tracks journal); the feedback
      // card tells the player what was marked and that they can re-rank.
      if (resolution.consequences?.expeditionProgress && game.user.isGM) {
        try {
          const result = await applyExpeditionProgress(
            { moveTarget: interpretation.moveTarget, expeditionRank: interpretation.expeditionRank },
            {
              listTracks:   () => listProgressTracks(),
              createTrack:  (data) => addProgressTrack(data),
              markProgress: (id) => markProgressById(id),
            },
          );
          if (result?.track) {
            // Link the new expedition to the undiscovered site its destination
            // confidently names (exact/substring/type keyword — never the
            // sole-undiscovered guess), searched across every sector at once
            // (issue #300 F07). Finishing then reveals THIS site instead of
            // re-guessing by name — the audit's "expedition→site linkage is
            // name-fuzzy" gap.
            if (result.created) {
              try {
                const linked = selectSectorSite(campaignState.sectors, result.track.label, {
                  requireLabelMatch: true,
                  activeSectorId:    campaignState.activeSectorId ?? null,
                });
                if (linked) await updateTrackFields(result.track.id, { siteId: linked.site.id });
              } catch (err) {
                console.debug(`${MODULE_ID} | expedition→site link skipped:`, err?.message ?? err);
              }
            }
            await postExpeditionProgressCard(result).catch(err =>
              console.warn(`${MODULE_ID} | expedition progress card failed:`, err?.message ?? err));
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | expedition progress failed:`, err?.message ?? err);
        }
      }

      // Legacy-track marks (Make a Discovery / Confront Chaos). Mutate the
      // legacy track in place — persistResolution (below, GM-gated) deep-clones
      // and persists campaignState, so no separate write is needed.
      if (resolution.consequences?.legacyMark && game.user.isGM) {
        const { track, ticks } = resolution.consequences.legacyMark;
        if (track && ticks > 0) {
          addLegacyTicks(campaignState, track, ticks);
          await postLegacyMarkCard(track, ticks).catch(err =>
            console.warn(`${MODULE_ID} | legacy mark card failed:`, err?.message ?? err));
        }
      }

      // Companion Takes a Hit strong hit — direct +1 companion health, no dialog.
      if ((resolution.consequences?.companionHealthChange ?? 0) !== 0 && game.user.isGM) {
        try {
          const { applyMeterChanges } = await import("./character/actorBridge.js");
          if (rollerActor) {
            await applyMeterChanges(rollerActor, { companionHealth: resolution.consequences.companionHealthChange });
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | companion health change failed:`, err?.message ?? err);
        }
      }

      // Develop Your Relationship (audit 3.14) — GM-gated. An un-bonded
      // connection marks its own relationship track ("no roll, mark progress");
      // a bonded connection marks the bonds legacy track per the rolled outcome
      // (§3.3.5: strong 2 / weak 1 / miss 0), and a match raises its rank by one.
      if (resolution.consequences?.developRelationship && game.user.isGM) {
        try {
          const conn = await import("./entities/connection.js");
          // Preserve each connection's host actor id (the value stored in
          // connectionIds); connection._id is a separate generated id that the
          // write helpers (getEntityDocument → game.actors.get) do not accept.
          const connections = (campaignState.connectionIds ?? [])
            .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
            .filter(Boolean);
          // A picker's host id first — without it, a picked un-bonded
          // connection fell back to the sole bonded one (issue #301 B01).
          const target = selectConnection(connections, interpretation.moveTarget ?? null,
            { hostId: interpretation.moveTargetId ?? null });
          const plan   = planDevelopRelationship(target, resolution.outcome, resolution.isMatch);

          if (plan.action === "bond-legacy") {
            if (plan.ticks > 0) addLegacyTicks(campaignState, "bonds", plan.ticks);
            if (plan.raiseRank && plan.newRank && plan.connection.__hostId) {
              await conn.updateConnection(plan.connection.__hostId, { rank: plan.newRank }).catch(err =>
                console.warn(`${MODULE_ID} | develop: rank raise failed:`, err?.message ?? err));
              // Mirror onto the PCs' bond Items so CHARACTER STATE shows the
              // raised rank (NARR-BOND-RANK-STALE).
              await setBondItemRank(
                { connectionId: plan.connection.__hostId, name: plan.connection.name },
                plan.newRank,
              ).catch(err =>
                console.warn(`${MODULE_ID} | develop: bond rank mirror failed:`, err?.message ?? err));
            }
            await postDevelopRelationshipCard(plan).catch(err =>
              console.warn(`${MODULE_ID} | develop card failed:`, err?.message ?? err));
          } else if (plan.action === "connection-progress" && plan.connection.__hostId) {
            await conn.markRelationshipProgress(plan.connection.__hostId, plan.marks).catch(err =>
              console.warn(`${MODULE_ID} | develop: progress mark failed:`, err?.message ?? err));
            await postDevelopRelationshipCard(plan).catch(err =>
              console.warn(`${MODULE_ID} | develop card failed:`, err?.message ?? err));
          }
          // action "none" → no resolvable connection; the move card's otherEffect
          // already tells the player to develop a relationship.
        } catch (err) {
          console.warn(`${MODULE_ID} | develop relationship failed:`, err?.message ?? err);
        }
      }

      // Reach a Milestone (no-roll quest move) — mark progress on the target vow
      // per its rank. The old resolver returned progressMarked:1 with a null
      // progressTrackId, so the persist gate never marked anything (playtest:
      // "successes are not granting progress on this Vow"). Now GM-gated and
      // driven by planReachMilestone (sole open vow → auto-mark; several → picker).
      if (resolution.consequences?.reachMilestone && game.user.isGM) {
        await applyReachMilestone(rollerActor, interpretation.moveTarget ?? null)
          .catch(err => console.warn(`${MODULE_ID} | reach a milestone failed:`, err?.message ?? err));
      }

      // Swear an Iron Vow — the vow is sworn regardless of outcome; the resolver
      // applies the momentum (+2 strong / +1 weak) and complication. GM-gated.
      if (resolution.moveId === "swear_an_iron_vow" && game.user.isGM) {
        // #248 Theme C: an inciting "⚔ Swear this vow" click routes through this
        // move so it actually rolls (+heart → momentum/complication, credited to
        // the clicker). Now that the roll has resolved, create the shared vow from
        // the original card's incitingMeta — swearSharedVowForAll posts its own
        // (richer, ranked) vow-swearing scene + connection + crisis clock + reward.
        // A plain typed swear (no inciting card) just gets the generic scene.
        const incitingSwearId = message.flags?.[MODULE_ID]?.incitingSwearMessageId ?? null;
        const incitingMsg = incitingSwearId ? game.messages?.get?.(incitingSwearId) : null;
        if (incitingSwearId && !incitingMsg) {
          console.warn(`${MODULE_ID} | inciting swear: original card ${incitingSwearId} not found — no vow created`);
        }
        if (incitingMsg) {
          await swearSharedVowForAll(incitingMsg).catch(err =>
            console.warn(`${MODULE_ID} | inciting swear creation failed:`, err?.message ?? err));
        } else {
          await narrateAndPostVowSwearing({
            vow: { name: interpretation.moveTarget ?? null, rank: null },
            campaignState,
          }).catch(err => console.warn(`${MODULE_ID} | vow-swearing scene failed:`, err?.message ?? err));
        }
      }

      // Forge a Bond hit (strong or weak) — mark connection as bonded and pay
      // bonds legacy. The Bolster/Expand Influence choice is surfaced in the
      // card text; it affects connection influence (tracked manually on the
      // character sheet).
      if (resolution.consequences?.forgeABond && game.user.isGM) {
        try {
          const conn = await import("./entities/connection.js");
          const connections = (campaignState.connectionIds ?? [])
            .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
            .filter(Boolean);
          // The same resolution enrichment scored (issue #301 B01): the
          // picker's host id, then the name, never a bonded fallback.
          const target = selectConnection(connections, interpretation.moveTarget ?? null,
            { hostId: interpretation.moveTargetId ?? null, unbonded: true });
          if (target?.__hostId && !target.bonded) {
            await conn.forgeBond(target.__hostId).catch(err =>
              console.warn(`${MODULE_ID} | forge bond: forgeBond failed:`, err?.message ?? err));
            // Same rank ladder as vow/expedition completion rewards.
            const ticks = legacyRewardTicks(target.rank, 0);
            if (ticks > 0) addLegacyTicks(campaignState, "bonds", ticks);
            await postForgeABondCard(target, ticks).catch(err =>
              console.warn(`${MODULE_ID} | forge bond card failed:`, err?.message ?? err));
          } else if (target?.bonded) {
            console.debug(`${MODULE_ID} | forge bond: "${target.name}" is already bonded — payoff already made.`);
          } else {
            console.warn(`${MODULE_ID} | forge bond: no connection matched "${interpretation.moveTarget ?? "?"}" — nothing forged.`);
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | forge a bond failed:`, err?.message ?? err);
        }
      }

      // Finish an Expedition — complete the open expedition track and pay its
      // rank's legacy reward (weak hit pays one rank lower) onto discoveries.
      if (resolution.consequences?.finishExpedition && game.user.isGM) {
        try {
          const fin = await finishExpedition(
            {
              moveTarget:   interpretation.moveTarget,
              moveTargetId: interpretation.moveTargetId ?? null,
              ranksDown:    resolution.consequences.finishExpedition.ranksDown ?? 0,
            },
            {
              listTracks:   () => listProgressTracks(),
              completeTrack: (id) => completeProgressTrack(id),
            },
          );
          if (fin?.track) {
            if (fin.legacyTicks > 0) addLegacyTicks(campaignState, "discoveries", fin.legacyTicks);
            await postExpeditionFinishCard(fin).catch(err =>
              console.warn(`${MODULE_ID} | expedition finish card failed:`, err?.message ?? err));

            // Reaching the end of an expedition discovers any unexplored sector
            // site it led to (precursor vault / derelict). Mutate the in-memory
            // campaignState so the discovered flag rides along with the pending
            // persistResolution write below (setState is a no-op here); the
            // scene pin + passage and the location Actor update apply at once.
            try {
              const { revealSectorSite, postSiteDiscoveryCard } = await import("./sectors/siteDiscovery.js");
              const revealed = await revealSectorSite(fin.track?.label ?? interpretation.moveTarget, {
                source:   "expedition",
                siteId:   fin.track?.siteId ?? null,
                getState: () => campaignState,
                setState: () => {},
              });
              if (revealed) await postSiteDiscoveryCard(revealed);
            } catch (err) {
              console.warn(`${MODULE_ID} | site reveal on finish-expedition failed:`, err?.message ?? err);
            }
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | finish expedition failed:`, err?.message ?? err);
        }
      }

      // Finish an Expedition MISS — offer the play kit's recommit as a click
      // (roll both challenge dice, clear filled boxes equal to the lowest,
      // raise the rank one step) instead of advisory text the GM applies by
      // hand. The track stays open either way; the button is optional.
      if (resolution.moveId === "finish_an_expedition" && resolution.outcome === "miss" && game.user.isGM) {
        try {
          const track = selectExpeditionTrack(await listProgressTracks(), interpretation.moveTarget ?? null,
            { trackId: interpretation.moveTargetId ?? null });
          if (track) {
            await postRecommitOfferCard(track).catch(err =>
              console.warn(`${MODULE_ID} | recommit offer card failed:`, err?.message ?? err));
          } else {
            console.debug(`${MODULE_ID} | recommit offer skipped — no open expedition matched "${interpretation.moveTarget ?? "?"}".`);
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | recommit offer failed:`, err?.message ?? err);
        }
      }

      // Fulfill Your Vow — close the target vow everywhere it lives and pay the
      // payoff once. Vows are dual-stored: journal `vow` tracks and actor vow
      // Items (the live store for inciting / shared / hand-made vows —
      // milestones mark items). A hit must complete BOTH forms: pre-fix this
      // branch only completed journal tracks, so item-stored vows closed
      // nothing when fulfilled through the pipeline. Weak hit pays one rank
      // lower (ranksDown: 1). Legacy ticks always land on the pipeline's own
      // campaignState object (persisted once, later) — payFulfilledVowNative's
      // internal legacy write is reserved for the native-sheet hook, where no
      // pipeline persist could clobber it.
      if (resolution.consequences?.fulfillVow && game.user.isGM) {
        try {
          const ranksDown = resolution.consequences.fulfillVow.ranksDown ?? 0;
          const fin = await finishVow(
            { moveTarget: interpretation.moveTarget, ranksDown },
            {
              listTracks:    () => listProgressTracks(),
              completeTrack: (id) => completeProgressTrack(id),
            },
          );
          // The enriched vow name — the exact item the roll scored against —
          // is the most reliable key; the journal track label and the raw
          // moveTarget are fallbacks.
          const vowName =
            (tickInfo?.source === "vow" ? tickInfo.label : null)
            ?? fin?.track?.label
            ?? interpretation.moveTarget
            ?? null;
          // The roller and the Item the roll scored: completion and payoff
          // resolve THAT vow, never another PC's same-named one (issue #301
          // B02). trackId is a journal track's id on the journal fallback —
          // it then matches no Item and the roller's name match applies.
          const vowKey = {
            actorId: rollerActor?.id ?? null,
            itemId:  tickInfo?.source === "vow" ? (tickInfo.trackId ?? null) : null,
          };
          const itemDone = await completeVowItemByName(vowName, vowKey);

          if (fin?.track) {
            if (fin.legacyTicks > 0) addLegacyTicks(campaignState, "quests", fin.legacyTicks);
            await postFulfillVowCard(fin).catch(err =>
              console.warn(`${MODULE_ID} | fulfill vow card failed:`, err?.message ?? err));
            // Journal path already paid the quests legacy — deliver only the
            // connection deepen + promised reward. Sets fulfilPaid, so a later
            // native-sheet roll of the same vow can't double-pay.
            if (itemDone) await payFulfilledVowNative(vowName, resolution.outcome, { skipLegacy: true, ...vowKey });
          } else if (itemDone) {
            // Item-only vow (no journal twin): legacy on the pipeline's
            // campaignState, deepen + reward via the shared payoff, then a
            // fulfil card synthesized from the item.
            const ticks = legacyRewardTicks(itemDone.rank, ranksDown);
            if (ticks > 0) addLegacyTicks(campaignState, "quests", ticks);
            await payFulfilledVowNative(vowName, resolution.outcome, { skipLegacy: true, ...vowKey });
            await postFulfillVowCard({ track: { label: itemDone.name, rank: itemDone.rank }, legacyTicks: ticks }).catch(err =>
              console.warn(`${MODULE_ID} | fulfill vow card failed:`, err?.message ?? err));
          } else {
            console.warn(`${MODULE_ID} | fulfil: hit but no vow track or item matched "${vowName ?? "?"}" — nothing completed.`);
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | fulfill vow failed:`, err?.message ?? err);
        }
      }

      // Forsake Your Vow — actually clear the vow (VOW-FORSAKE-COSMETIC fix:
      // the costs used to be presented while the vow item/track stayed open).
      // Every copy is marked completed + flagged forsaken (audit-preserving —
      // nothing is deleted), the journal twin closes, and a still-promised
      // reward flips to lost. No legacy pays — the vow was abandoned, not
      // achieved. The resolver's cost sufferPrompt rides separately.
      if (resolution.consequences?.forsakeVow && game.user.isGM) {
        try {
          // The roller's own vow first (issue #301 B02) — never another PC's
          // vow that shares the name.
          const { primary, copies } = resolveVowItemCopies(interpretation.moveTarget ?? null,
            { actorId: rollerActor?.id ?? null });
          const fin = await finishVow(
            { moveTarget: interpretation.moveTarget ?? primary?.item?.name ?? null, ranksDown: 0 },
            {
              listTracks:    () => listProgressTracks(),
              completeTrack: (id) => completeProgressTrack(id),
            },
          ).catch(() => null); // journal twin close — legacyTicks deliberately unused
          if (primary) {
            for (const { actor, item } of copies) {
              if (item.system?.completed !== true) {
                await completeVowItem(actor, item.id).catch(err =>
                  console.warn(`${MODULE_ID} | forsake: complete failed:`, err?.message ?? err));
              }
              await item.setFlag?.(MODULE_ID, "forsaken", true).catch(() => {});
            }
            const rewardCopy = copies.find(({ item }) =>
              item.flags?.[MODULE_ID]?.reward?.status === "promised");
            if (rewardCopy) {
              const f = rewardCopy.item.flags[MODULE_ID];
              await setSharedVowReward(f.vowId, { ...f.reward, status: "lost" }).catch(() => {});
            }
            await postForsakeVowCard(primary.item.name).catch(err =>
              console.warn(`${MODULE_ID} | forsake card failed:`, err?.message ?? err));
          } else if (fin?.track) {
            await postForsakeVowCard(fin.track.label).catch(err =>
              console.warn(`${MODULE_ID} | forsake card failed:`, err?.message ?? err));
          } else {
            console.warn(`${MODULE_ID} | forsake: no vow matched "${interpretation.moveTarget ?? "?"}" — nothing cleared.`);
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | forsake vow failed:`, err?.message ?? err);
        }
      }

      // Combat lifecycle — Enter the Fray creates/reuses the combat track (rank
      // inferred from narration). Strike and Clash mark progress directly (×2 or
      // ×1). Position is written after the track exists. Take Decisive Action and
      // Face Defeat complete the track. All GM-gated (track journal writes).
      let thresholdPosted = false;
      if (resolution.consequences?.enterCombat && game.user.isGM) {
        try {
          // Combat is offered, not forced (#241): post a threshold decision card —
          // Enter the Fray (which creates the track, at a suggested-but-adjustable
          // rank, optionally linked to the vow it serves) vs. a way out. Skip when
          // already in this fight (a matching open combat track exists); later
          // combat moves just mark progress on it. Enter the Fray's own outcome
          // position rides the card so it lands on the track at creation.
          const existing = selectCombatTrack(await listProgressTracks(), interpretation.moveTarget ?? null);
          if (!existing || existing.completed) {
            const vowNames = (readVows(speakerActor) ?? [])
              .filter(v => v && !v.completed).map(v => v.name).filter(Boolean);
            await postCombatThresholdCard({
              label:         interpretation.moveTarget ?? "the enemy",
              suggestedRank: interpretation.combatRank,
              vowNames,
              position:      resolution.consequences.combatPosition ?? null,
              actorId:       speakerActor?.id ?? null,
            }).catch(err =>
              console.warn(`${MODULE_ID} | combat threshold card failed:`, err?.message ?? err));
            thresholdPosted = true;
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | combat threshold failed:`, err?.message ?? err);
        }
      }

      let combatProgressTrack = null;
      if ((resolution.consequences?.combatProgress ?? 0) > 0 && game.user.isGM) {
        try {
          const count = resolution.consequences.combatProgress;
          const result = await applyCombatProgress(
            { moveTarget: interpretation.moveTarget, combatRank: interpretation.combatRank, markCount: count },
            {
              listTracks:   () => listProgressTracks(),
              createTrack:  (data) => addProgressTrack(data),
              markProgress: (id) => markProgressById(id),
            },
          );
          if (result?.track) {
            combatProgressTrack = result.track;
            await postCombatProgressCard(result).catch(err =>
              console.warn(`${MODULE_ID} | combat progress card failed:`, err?.message ?? err));
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | combat progress failed:`, err?.message ?? err);
        }
      }

      // The fight this move was about — the one its progress marked (or
      // created), else the move's target by the same ladder, else the sole
      // open fight. Resolved once, for two readers: the move's position is
      // written to it (the single-active-fight lookup left every position
      // unwritten while two fights were open, so Take Decisive Action's
      // bad-spot downgrade could never apply there — issue #306 R05), and the
      // move card's Finish the Fight button names it, so the roll it starts
      // scores this fight and no other (TDA-BUTTON-NO-TARGET).
      let moveFight = null;
      if (game.user.isGM && (resolution.consequences?.combatPosition || TDA_OFFER_MOVES.has(resolution.moveId))) {
        try {
          moveFight = combatProgressTrack
            ?? selectCombatTrack(await listProgressTracks(), interpretation.moveTarget ?? null,
              { trackId: interpretation.moveTargetId ?? null });
        } catch (err) {
          console.warn(`${MODULE_ID} | combat fight lookup failed:`, err?.message ?? err);
        }
      }

      if (resolution.consequences?.combatPosition && game.user.isGM) {
        try {
          const pipelinePos = resolution.consequences.combatPosition;
          if (moveFight) {
            await applyCombatPositionToTrack(moveFight.id, pipelinePos, speakerActor);
          } else if (thresholdPosted) {
            // Enter the Fray: the track doesn't exist yet — the position rides
            // the threshold card's flags and lands at track creation.
            console.debug(`${MODULE_ID} | combat position "${pipelinePos}" rides the threshold card — track not created yet.`);
          } else {
            console.warn(`${MODULE_ID} | combat position "${pipelinePos}" matched no open fight ("${interpretation.moveTarget ?? "?"}") — not written.`);
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | combat position failed:`, err?.message ?? err);
        }
      }

      if (resolution.consequences?.endCombat && game.user.isGM) {
        try {
          const result = await finishCombatTrack(
            { moveTarget: interpretation.moveTarget, moveTargetId: interpretation.moveTargetId ?? null },
            {
              listTracks:    () => listProgressTracks(),
              completeTrack: (id) => completeProgressTrack(id),
            },
          );
          if (result?.track) {
            await postCombatFinishCard(result).catch(err =>
              console.warn(`${MODULE_ID} | combat finish card failed:`, err?.message ?? err));
            // Delete the Foundry combat tracker for this track
            await endCombatTracker(result.track.id).catch(err =>
              console.warn(`${MODULE_ID} | combat tracker close failed:`, err?.message ?? err));
            // Won fight that served a vow → surface the milestone (#241). Win =
            // a hit on Take Decisive Action / Battle (not Face Defeat). Marks
            // scale by the fight's rank; a weak-hit win is one fewer (min 1).
            const wonFight = resolution.moveId !== "face_defeat"
              && (resolution.outcome === "strong_hit" || resolution.outcome === "weak_hit");
            if (wonFight && result.track.linkedVowName) {
              const marks = Math.max(1,
                marksForSourceRank(result.track.rank) - (resolution.outcome === "weak_hit" ? 1 : 0));
              await postFightVowMilestoneCard(result.track.linkedVowName, marks, rollerActor?.id ?? null).catch(err =>
                console.warn(`${MODULE_ID} | fight-vow milestone card failed:`, err?.message ?? err));
              // Deliver the vow's promised concrete reward (#241 Phase 2), scaled
              // by the win; one-time (status flips so a re-win can't re-grant).
              await grantLinkedVowReward(result.track.linkedVowName, resolution.outcome, { actorId: rollerActor?.id ?? null }).catch(err =>
                console.warn(`${MODULE_ID} | grant linked vow reward failed:`, err?.message ?? err));
            }
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | finish combat failed:`, err?.message ?? err);
        }
      }

      // TDA weak hit — roll decisive_action_cost d100 and post a visible card.
      // Entry 1-40 carries sufferRoute {move:"any", amount:2} which opens the
      // B1 generic suffer picker so the player can choose which move takes -2.
      if (resolution.consequences?.rollDecisiveActionCost && game.user.isGM) {
        await postDecisiveActionCostCard(rollerActor?.id ?? null).catch(err =>
          console.warn(`${MODULE_ID} | decisive action cost card failed:`, err?.message ?? err));
      }

      // Face Defeat — roll pay_the_price d100, post a visible card, and dispatch
      // any routable suffer entry (same behaviour as typing !pay-the-price).
      // Capture the PtP reversals (clocks advanced + suffer meter applied) so the
      // burn button can undo them when the player burns momentum to upgrade the outcome.
      let ptpReversals = null;
      if (resolution.consequences?.routePayThePrice && game.user.isGM) {
        ptpReversals = await postFaceDefeatPayThePriceCard(rollerActor?.id ?? null).catch(err => {
          console.warn(`${MODULE_ID} | face defeat PtP card failed:`, err?.message ?? err);
          return null;
        });
      }

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
        // (The pendingClarification campaignState marker written around this
        // prompt had no reader and was removed in the 2026-10 audit.)
        const selection = await ClarificationDialog.prompt(campaignState, relevance);
        relevance = applyClarificationSelection(relevance, selection);
      }

      // Step 8 (retired 2026-07, FACTION-PACKET-DEAD): the assembler context
      // packet was built here and passed to narrateResolution, whose packet
      // parameter was never read — a Loremaster-era conduit. The narrator's
      // context flows entirely through buildNarratorExtras (which now carries
      // the packet's load-bearing WJ sections: threats, faction landscape,
      // confirmed lore). See decisions.md → "The context packet is retired".

      // Step 9: post move result card. Determine burn eligibility against the
      // active character so the card can carry a 🔥 Burn Momentum button when
      // the dice would actually improve under burn.
      const burnActor   = rollerActor;
      const burnState   = buildBurnState(resolution, burnActor, ptpReversals);
      // Post-roll "improve the result" affordance (finding G) — e.g. Fugitive's
      // "improve the result to a strong hit" at the cost of filling its clock.
      // Driven by the same abilities surfaced pre-roll on the confirm dialog.
      const improveState = buildImproveState(resolution, interpretation.applicableAbilities, burnActor);
      // "Reach a Milestone" suggestion (playtest: surface vow progress on a
      // success). Eligible on a quest-advancing hit when the PC has an open vow;
      // clicking marks progress without retyping the move. See moves/milestone.js.
      const milestoneState = buildMilestoneSuggestion(
        resolution, readVows(burnActor), MOVES[resolution.moveId]?.category ?? null,
      );
      const { getConnection: _getConn } = await import("./entities/connection.js");
      const _activeConns = (campaignState.connectionIds ?? [])
        .map(hostId => { const c = _getConn(hostId); return c ? { ...c, __hostId: hostId } : null; })
        .filter(Boolean);
      const connectionState = buildConnectionSuggestion(
        resolution, _activeConns, MOVES[resolution.moveId]?.category ?? null,
      );
      const moveResultMessage = await postMoveResult(
        resolution,
        interpretation._mischiefAside ?? null,
        burnState,
        improveState,
        milestoneState,
        connectionState,
        moveFight,
      );

      // Step 10: narrate the consequence directly via Claude — no GM dependency
      await narrateResolution(resolution, campaignState, { relevance, speakerActorId });

      // Only the GM can write world-scoped settings (campaignState).
      // Players trigger the pipeline but defer persistence to the GM's client.
      if (game.user.isGM) {
        await persistResolution(resolution, campaignState, speakerActorId);
        // The original outcome is on the sheet: open the card's Burn Momentum /
        // Improve Result buttons. They stay disabled (and their GM handlers
        // refuse) until this stamp — a burn clicked during the narration above
        // applied the upgraded outcome, then this persist added the original
        // on top of it (issue #300 F02). The click handlers diff the upgraded
        // outcome against the recorded original.
        const recorded = {
          ...(burnState    ? { [`flags.${MODULE_ID}.burn.originalApplied`]:    true } : {}),
          ...(improveState ? { [`flags.${MODULE_ID}.improve.originalApplied`]: true } : {}),
        };
        if (moveResultMessage && Object.keys(recorded).length) {
          await moveResultMessage.update(recorded).catch(err =>
            console.warn(`${MODULE_ID} | burn / improve metadata update failed:`, err));
        }

        // The move is resolved, persisted, and narrated — the critical section
        // the concurrency lock guards (campaignState writes + narration) is now
        // complete. Release the lock HERE, before the interactive rider prompt.
        // applyMoveConsequenceRiders can open a GM dialog (riderDialog.js); if it
        // held the lock, an unanswered or unnoticed dialog left
        // campaignState.pendingMove = true and every subsequent player input hit
        // the "a move is already being resolved" guard — the v1.7.12 lockup
        // (known-issues PLAYTEST-1712 M/N, fixed here). The finally above
        // re-releases idempotently for the throw / cancelled-confirm paths.
        await releasePendingMoveLock();

        // Auto-apply asset consequence riders from this outcome — meters and
        // progress — so the player never adjusts resources by hand. Runs after
        // persistResolution so the move's own consequences land first; optional
        // / choice / ambiguous-progress riders prompt. That prompt no longer
        // holds the move lock (released just above). GM-gated (world writes).
        await applyMoveConsequenceRiders(resolution, interpretation, campaignState, burnActor)
          .catch(err => console.warn(`${MODULE_ID} | consequence riders failed:`, err?.message ?? err));
      }

    } catch (err) {
      console.error(`${MODULE_ID} | Move interpretation failed:`, err);
      ui.notifications.error(
        "Starforged Companion: Move interpretation failed. " +
        "Check your API key in module settings and try again."
      );
    } finally {
      // Safety net: always release the lock, even if the pipeline threw or the
      // confirm dialog was cancelled before the success-path release below ran.
      // Idempotent — when the early release already cleared it, this no-ops.
      await releasePendingMoveLock();
    }
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Release the move-concurrency lock (`campaignState.pendingMove`).
 *
 * Idempotent and safe to call more than once. The move pipeline releases the
 * lock on the success path *before* the interactive consequence-rider prompt,
 * so an unanswered or unnoticed GM dialog can't wedge the lock and block all
 * subsequent narration (PLAYTEST-1712 M/N — the v1.7.12 lockup). The pipeline's
 * `finally` calls this again as a safety net for the throw / cancelled-confirm
 * paths. Re-reads the latest campaignState each call so it never clobbers
 * writes made during the pipeline (entity records, progress ticks, recap
 * caches). World-scoped write → effective on the GM client only.
 */
export async function releasePendingMoveLock() {
  const latestState = game.settings.get(MODULE_ID, "campaignState");
  if (!latestState?.pendingMove) return;   // already released — cheap no-op
  // Write a copy: `get` returns this client's cached value, and clearing the
  // flag on it before a write that failed made the retry (the pipeline's
  // finally) read "released" and skip — the world kept the lock (issue #302).
  await game.settings.set(MODULE_ID, "campaignState", { ...latestState, pendingMove: false }).catch(err =>
    console.error(`${MODULE_ID} | Failed to release pendingMove lock:`, err),
  );
}

/** Drop the owning actor's cached snapshot when one of its Items changes — this client's cache only. */
function invalidateItemOwnerSnapshot(item) {
  const ownerId = item?.parent?.id;
  if (ownerId) invalidateActorCache(ownerId);
}

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
  // A PC's vows, bonds and assets are embedded Items, changed on the native
  // sheet without an updateActor — the cached snapshot behind the narrator's
  // CHARACTER block kept the old progress until something else touched the
  // actor (issue #286 C5).
  Hooks.on("createItem", invalidateItemOwnerSnapshot);
  Hooks.on("updateItem", invalidateItemOwnerSnapshot);
  Hooks.on("deleteItem", invalidateItemOwnerSnapshot);

  Hooks.on("updateActor", (actor, changes, _options, userId) => {
    if (!actor.hasPlayerOwner) return;

    // Invalidate the cached snapshot so the next context build reads fresh data
    invalidateActorCache(actor.id);

    // Skip if this is our own write — actorBridge already handled the cache
    if (userId === game.user.id) return;

    // If condition debilities changed, recalculate momentum bounds — on
    // exactly one client (momentumRecalcRunsHere).
    if (!foundry.utils.hasProperty(changes, "system.debility")) return;
    if (!momentumRecalcRunsHere(actor, userId)) return;
    recalculateMomentumBounds(actor).catch(err => {
      console.error(`${MODULE_ID} | updateActor: momentum recalc failed`, err);
    });
  });
}

/**
 * Which client re-derives momentum max/reset (and clamps momentum) after
 * ANOTHER user changed a PC's debilities directly — e.g. on the vendor sheet,
 * which bypasses actorBridge.setDebility. Exactly one client may run it:
 * players lack permission on each other's PCs, and two runners would
 * double-write.
 *
 *   - Edited by a player → the canonical GM runs it (the player's own client
 *     skips its own write).
 *   - Edited by a GM → the PC's owner runs it: the lowest-id active non-GM
 *     user with OWNER permission. The editing GM's client skips its own write,
 *     and the canonical GM must not also run it.
 *   - Edited by a GM while no non-GM owner is connected → the canonical GM
 *     runs it, unless it is the editor itself (an own write — skipped like
 *     every own write; debug-logged).
 *
 * Exported for unit testing.
 *
 * @param {Actor} actor
 * @param {string} updaterId  the userId the updateActor hook reported
 * @returns {boolean}
 */
export function momentumRecalcRunsHere(actor, updaterId) {
  const me = game.user;
  if (!me || !updaterId || updaterId === me.id) return false;
  const users   = Array.from(game.users ?? []);
  const updater = game.users?.get?.(updaterId) ?? users.find(u => u?.id === updaterId) ?? null;

  if (!updater?.isGM) return isCanonicalGM();

  const owners = users.filter(u => u?.active && !u.isGM && userOwnsActor(actor, u));
  if (owners.length) {
    let runner = owners[0];
    for (const u of owners) if (u.id < runner.id) runner = u;
    return runner.id === me.id;
  }
  if (isCanonicalGM()) return true;
  console.debug(`${MODULE_ID} | updateActor: ${actor?.name ?? "PC"} debilities changed by a GM with no owner connected — momentum recalc is the canonical GM's (skipped there if it made the edit itself).`);
  return false;
}

// OWNER permission check that also works on test doubles without
// testUserPermission (inspects the ownership map; 3 === OWNER).
function userOwnsActor(actor, user) {
  if (!actor || !user) return false;
  if (typeof actor.testUserPermission === "function") return !!actor.testUserPermission(user, "OWNER");
  const ownership = actor.ownership ?? {};
  return ownership[user.id] === 3 || ownership.default === 3;
}


// Actor-hosted entity typeKeys whose flag record denormalises `name`
// (registry.js HOST_COLLECTION === 'actor'). Faction/creature are
// journal-hosted and out of scope for the rename sync.
const RENAME_SYNC_TYPES = new Set(["connection", "ship", "settlement", "planet", "location"]);

/**
 * Keep entity flag records in sync with Actor renames (v1.7.10 playtest
 * finding #2). The Entities panel and narrator context read the record's
 * denormalised `name`; before this hook, renaming an Actor in the sidebar
 * left the registration-time snapshot in place ("Ship" after a rename to
 * "Kobayashi 8") until a Finalise happened to rewrite it. Actor name is
 * authoritative (matches seedStarshipActor / seedConnectionActor).
 *
 * Canonical-GM gated: updateActor fires on every connected client and the
 * flag write is world-scoped — exactly one client should emit it. The echo
 * update (flags only, no `name` key) fails the changes.name guard, so the
 * hook cannot recurse. Drift that predates this hook is repaired at ready
 * by syncEntityRecordNames (migrator.js).
 *
 * Exported for unit testing.
 */
export function syncEntityRecordNameOnUpdate(actor, changes, _options, _userId) {
  try {
    const newName = changes?.name;
    if (typeof newName !== "string" || !newName) return;
    if (!isCanonicalGM()) return;

    const entityType = actor?.flags?.[MODULE_ID]?.entityType;
    if (!RENAME_SYNC_TYPES.has(entityType)) return;

    const record = actor.flags?.[MODULE_ID]?.[entityType];
    if (!record || record.name === newName) return;

    actor.update({
      [`flags.${MODULE_ID}.${entityType}.name`]:      newName,
      [`flags.${MODULE_ID}.${entityType}.updatedAt`]: new Date().toISOString(),
    }).catch(err =>
      console.warn(`${MODULE_ID} | rename sync: record update failed for ${actor.id}:`, err?.message ?? err));
  } catch (err) {
    console.warn(`${MODULE_ID} | rename sync hook threw:`, err?.message ?? err);
  }
}

function registerEntityRenameSyncHook() {
  Hooks.on("updateActor", syncEntityRecordNameOnUpdate);
}

/**
 * Narrate NATIVE foundry-ironsworn vow/connection progress rolls (#236
 * follow-up). When a player rolls a vow (or connection) progress on the system
 * character sheet, the system posts only its own roll card and fires no hook,
 * so the Companion never narrated it. This createChatMessage hook detects that
 * card, classifies it as a vow or connection resolution, and narrates the
 * already-determined outcome via narrateResolution — WITHOUT re-rolling.
 *
 * Single-emitter on the ROLLER's own client (the message author): exactly one
 * client narrates — the one that made the roll and holds the Claude key —
 * matching the pipeline's no-GM-dependency narration (#248 Theme D). The old
 * isCanonicalGM gate produced nothing when the Claude key lived on a player's
 * client, not the GM's. Anything it can't act on (action rolls, expedition/
 * combat progress, our own cards, unparseable shapes) is skipped with a debug
 * breadcrumb on the deciding client (decisions.md → "No silent failures"). See
 * nativeProgressRoll.js for the vendor-coupling note.
 */
function registerNativeProgressRollHook() {
  Hooks.on("createChatMessage", (message) => {
    try {
      // Narration runs on the ROLLER's own client — the one that made the roll
      // and (per #209) holds the Claude key — mirroring the move pipeline's
      // "no GM dependency" narration (Step 10 above). Gating this to the
      // canonical GM (the old behaviour) silently produced nothing on tables
      // where the Claude key lives on a player's client, not the GM's
      // (#248 Theme D; decisions.md → "No silent failures"). Other clients
      // correctly stand down here — not a failure, so no log.
      // Unlike the chat-command AUTHOR policy, an author-less message is NOT
      // treated as ours here — a native roll card always carries its roller.
      const authorId = messageAuthorId(message);
      const isRoller = authorId != null && authorId === game?.user?.id;

      const content = String(message?.content ?? "");
      const parsed  = isRoller ? parseIronswornProgressRoll(content) : null;
      const moveId  = (isRoller && parsed) ? classifyProgressRoll(parsed, (source) => {
        // Fallback discriminator: read the source progress Item's subtype off
        // the speaker actor (the system serialises only the track name).
        try {
          const actor = message?.speaker?.actor ? game.actors?.get(message.speaker.actor) : null;
          const src   = String(source ?? "").trim().toLowerCase();
          if (!actor || !src) return null;
          const item = actor.items?.find?.(i =>
            i?.type === "progress" && String(i?.name ?? "").trim().toLowerCase() === src);
          const subtype = String(item?.system?.subtype ?? "").toLowerCase();
          if (subtype.includes("vow"))        return "vow";
          if (subtype.includes("connection")) return "connection";
          return null;
        } catch (err) {
          console.warn(`${MODULE_ID} | native-roll: subtype lookup for "${source}" threw:`, err?.message ?? err);
          return null;
        }
      }) : null;

      // No silent failures (decisions.md): map the facts to act/skip + reason +
      // level, then always log the decision on this (the deciding) client.
      const rollKind = (isRoller && !parsed) ? ironswornRollKind(content) : "progress";
      const plan = planNativeRollNarration({ isRoller, rollKind, parsed, moveId });
      if (plan.log === "warn") {
        console.warn(`${MODULE_ID} | native-roll: ${plan.reason} — skipping (a vendor card-shape change?)`);
      } else if (plan.log === "debug") {
        const tag = parsed ? ` "${parsed.source || "?"}"` : "";
        console.debug(plan.act
          ? `${MODULE_ID} | native-roll: narrating ${moveId} (${parsed.outcome}) for${tag}`
          : `${MODULE_ID} | native-roll: ${plan.reason}${tag} — skipping`);
      }
      if (!plan.act) return;

      const moveName     = moveId === "fulfill_your_vow" ? "Fulfill Your Vow" : "Forge a Bond";
      const outcomeLabel = parsed.outcome === "strong_hit" ? "Strong Hit"
        : parsed.outcome === "weak_hit" ? "Weak Hit" : "Miss";

      import("./narration/narrator.js").then(({ narrateResolution }) => {
        const campaignState = game.settings.get(MODULE_ID, "campaignState");
        const resolution = {
          _id:             `native-${message.id}`,
          moveId,
          moveName,
          outcome:         parsed.outcome,
          outcomeLabel,
          isProgressMove:  true,
          statUsed:        null,
          statValue:       0,
          adds:            0,
          progressScore:   parsed.score,
          challengeDice:   parsed.challengeDice,
          playerNarration: parsed.source ? `Resolving: ${parsed.source}` : "",
        };
        // Narrate-only: the system already rolled; we do NOT re-roll or re-apply
        // mechanics, just narrate the outcome.
        return narrateResolution(resolution, campaignState);
      }).catch(err =>
        console.warn(`${MODULE_ID} | native progress-roll narration failed:`, err?.message ?? err));
    } catch (err) {
      console.warn(`${MODULE_ID} | native progress-roll hook threw:`, err?.message ?? err);
    }
  });
}

/**
 * Register the `createActor` hook that oracle-seeds a freshly-created
 * starship Actor. Lets the user create a starship via the sidebar and
 * walk away with type / first-look / mission filled in on the Notes
 * tab, and a portrait if the OpenRouter key is configured.
 *
 * Gating:
 *  - Canonical GM only (writes go through actor.update which world-scopes
 *    through Foundry's permission model; createActor fires on every client,
 *    so exactly one GM seeds)
 *  - type === "starship"
 *  - Skipped when `autoSeedStarship` setting is false
 *  - Skipped when the actor already carries detail (non-empty notes,
 *    or a populated flag.ship.type / flag.ship.firstLook from
 *    createShip-with-seed / migrator)
 *
 * The hook fires synchronously but the seed work is async and fire-and-
 * forget — Foundry doesn't await Hooks.on callbacks anyway. Errors
 * inside seedStarshipActor are logged, not surfaced.
 */
function registerStarshipSeedHook() {
  Hooks.on("createActor", (actor) => {
    try {
      // Single emitter: createActor fires on every client; two GMs would
      // both seed (duplicate oracle rolls / notes / portrait calls).
      if (!isCanonicalGM()) return;
      if (actor?.type !== "starship") return;

      // Read the setting synchronously at fire time (a deferred read inside the
      // async block below would race a test's temp-setting restore).
      const autoSeed = game.settings.get(MODULE_ID, "autoSeedStarship");

      // Defer the import so this module file stays parse-only at init.
      // The hook itself returns synchronously; work runs after.
      import("./entities/ship.js").then(async (mod) => {
        const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
        if (autoSeed) {
          // Opt-in: fully populate at creation (oracles/modules/notes/art).
          if (mod.starshipHasSeedDetail(actor)) {
            console.log(`${MODULE_ID} | starship seed: skipping ${actor.id} (already populated)`);
            return;
          }
          await mod.seedStarshipActor(actor, state).catch(err =>
            console.warn(`${MODULE_ID} | starship seed failed for ${actor.id}:`, err));
        } else {
          // Default: create blank but register so it shows in the Entities
          // panel with a ✦ Finalise button (finalize-first, FOLDER-002).
          await mod.registerStarshipActorLight(actor, state).catch(err =>
            console.warn(`${MODULE_ID} | starship light-register failed for ${actor.id}:`, err));
        }
      }).catch(err =>
        console.warn(`${MODULE_ID} | starship seed: dynamic import failed:`, err));
    } catch (err) {
      console.warn(`${MODULE_ID} | createActor starship-seed hook threw:`, err);
    }
  });

  // NPC / connection cards: roll the Character oracles into Characteristics,
  // compose Notes, and fire a silent portrait — the connection analogue of the
  // starship seed above. connectionNeedsSeed() filters out PCs (no connection
  // flag) and already-seeded cards.
  Hooks.on("createActor", (actor) => {
    try {
      if (!isCanonicalGM()) return;   // single emitter — see the starship seed above
      if (actor?.type !== "character") return;
      if (!game.settings.get(MODULE_ID, "autoSeedConnection")) return;

      import("./entities/connection.js").then(async (mod) => {
        if (!mod.connectionNeedsSeed(actor)) return;
        const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
        await mod.seedConnectionActor(actor, state).catch(err =>
          console.warn(`${MODULE_ID} | connection seed failed for ${actor.id}:`, err));
      }).catch(err =>
        console.warn(`${MODULE_ID} | connection seed: dynamic import failed:`, err));
    } catch (err) {
      console.warn(`${MODULE_ID} | createActor connection-seed hook threw:`, err);
    }
  });
}

/**
 * Keep a starship Actor's `isCommandVehicle` flag in sync with whether it
 * carries the STARSHIP / Command Vehicle asset. This is the registration
 * signal the narrator's command-vehicle resolution depends on.
 *
 * Triggers:
 *  - createItem / deleteItem — when a Command Vehicle asset is added to or
 *    removed from a starship Actor, recompute that ship's flag.
 *  - ready (once) — reconcile ships created before asset-detection shipped,
 *    so an existing command vehicle (like one made via the sidebar) gets
 *    flagged without the user having to re-add the asset.
 *
 * Canonical-GM gated (world-scoped writes, single emitter — createItem /
 * deleteItem fire on every client). The sync helper writes only on a status
 * change, so the ready-scan is idempotent. A single tracked starship is still
 * resolved as the command vehicle via the lone-ship fallback even if nothing
 * here ever flags it.
 */
function registerCommandVehicleHook() {
  const onAssetChange = (item) => {
    try {
      if (!isCanonicalGM()) return;   // single emitter for the world-scoped flag write
      if (item?.type !== "asset") return;
      const actor = item.parent;
      if (actor?.type !== "starship") return;
      if (!/command vehicle/i.test(String(item.system?.category ?? ""))) return;

      import("./entities/ship.js").then(async (mod) => {
        const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
        await mod.syncCommandVehicleFlag(actor, state).catch(err =>
          console.warn(`${MODULE_ID} | command-vehicle sync failed for ${actor.id}:`, err));
      }).catch(err =>
        console.warn(`${MODULE_ID} | command-vehicle sync: dynamic import failed:`, err));
    } catch (err) {
      console.warn(`${MODULE_ID} | command-vehicle item hook threw:`, err);
    }
  };

  Hooks.on("createItem", onAssetChange);
  Hooks.on("deleteItem", onAssetChange);

  Hooks.once("ready", () => {
    try {
      if (!isCanonicalGM()) return;
      import("./entities/ship.js").then(async (mod) => {
        const state     = game.settings.get(MODULE_ID, "campaignState") ?? {};
        const starships = (game.actors?.contents ?? []).filter(a => a?.type === "starship");
        for (const actor of starships) {
          await mod.syncCommandVehicleFlag(actor, state).catch(err =>
            console.warn(`${MODULE_ID} | command-vehicle ready sync failed for ${actor.id}:`, err));
        }
      }).catch(err =>
        console.warn(`${MODULE_ID} | command-vehicle ready scan: dynamic import failed:`, err));
    } catch (err) {
      console.warn(`${MODULE_ID} | command-vehicle ready hook threw:`, err);
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
  // v13: the IC / OOC / EMOTE classification lives on `message.style`
  // (CONST.CHAT_MESSAGE_STYLES), NOT on `message.type` — in v13 `type` is the
  // document subtype ("base"), so the legacy string check further down is a
  // no-op there and was silently letting emotes, whispers, and rolls through
  // to the narrator. Emote-style messages in particular are never
  // move-triggering narration: they are `/em` roleplay flavor, or — the case
  // that surfaced this — a foundry-ironsworn system alert posted when an
  // asset/module is added to an actor (an italic "<em>Added Grappler</em>"
  // with the ship as speaker, EMOTE style, and no module flag, so the
  // foundry-ironsworn flag check below can't catch it). Reject emote / whisper
  // / roll up front using the style and the document's own arrays.
  const EMOTE = globalThis.CONST?.CHAT_MESSAGE_STYLES?.EMOTE ?? 3;
  if (message.style === EMOTE) return false;
  if (Array.isArray(message.whisper) && message.whisper.length > 0) return false;
  if (Array.isArray(message.rolls) && message.rolls.length > 0) return false;

  // Legacy v12 string-type guard — harmless no-op on v13 (type is "base"),
  // retained for v12 worlds where message.type still carries the style.
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
  // EXCEPTION: messages re-posted by the NWMA "Roll <move>" button carry
  // `bypassPacing: true` and ARE player narration (just with the classifier
  // skipped); they must reach the move pipeline.
  const flags = message.flags?.[MODULE_ID];
  if (flags && !flags.bypassPacing) return false;

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
  // Match exactly "@scene" or "@scene …" — not "@scenery" / "@scenes"
  // (predicate-matrix exclusivity per Priority 3 of the behaviour-coverage audit).
  if (!/^@scene(\s|$)/i.test(text)) return false;
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
  // Match exactly "!recap" or "!recap …" — not "!recapify".
  if (!/^!recap(\s|$)/i.test(text)) return false;
  if (message.flags?.[MODULE_ID]?.recapCard) return false;
  if (getRecapGmOnly()) {
    const user = message.author ?? game.users?.get(message.user);
    return user?.isGM ?? false;
  }
  return true;
}

/**
 * A `!recap` that isRecapCommand rejected only because the "Recap GM-only"
 * setting is on and a player typed it. Routed separately so the typist is told
 * why nothing happened instead of the command vanishing (decisions.md → "No
 * silent failures").
 */
export function isDeniedRecapCommand(message) {
  const text = message.content?.trim() ?? "";
  if (!/^!recap(\s|$)/i.test(text)) return false;
  if (message.flags?.[MODULE_ID]?.recapCard) return false;
  return !isRecapCommand(message);
}

/**
 * Determine whether a chat message is a !sector command.
 * Matches exactly "!sector" or "!sector …" — not "!sectoral" / "!sectoring"
 * (predicate-matrix exclusivity per Priority 3 of the behaviour-coverage audit).
 */
export function isSectorCommand(message) {
  const text = message.content?.trim() ?? "";
  return /^!sector(\s|$)/i.test(text);
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
 * Determine whether a chat message is an !oracle command.
 *   !oracle yes [odds] [question text]
 *   !oracle <tableId> [question text]   (any registered oracle table)
 * Anyone may invoke — no state mutation. Odds default to 50/50 if omitted.
 * Valid odds keys and shorthand aliases:
 *   small_chance | small             → ≤ 10
 *   unlikely                         → ≤ 25
 *   50_50 | 50/50 | even             → ≤ 50  (default)
 *   likely                           → ≤ 75
 *   almost_certain | certain | sure  → ≤ 90
 */
export function isOracleCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.oracleCommandCard) return false;
  return /^!oracle(\s|$)/i.test(text);
}

/**
 * Determine whether a chat message is a !pay-the-price (or !ptp) command —
 * the manual fate-move variant. Any player may invoke; the handler rolls
 * the d100 table and posts the result as a chat card. No state mutation.
 *
 *   !pay-the-price [question?]
 *   !ptp [question?]
 */
export function isPayThePriceCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.payThePriceCard) return false;
  return /^!(pay-the-price|ptp)(\s|$)/i.test(text);
}

/**
 * Determine whether a chat message is a !bond command — the bonded-path
 * variant of Develop Your Relationship per play kit p. 3.
 *   !bond [rank] [name]
 * Anyone may invoke; the author rolls and any lasting effect (legacy ticks,
 * rank raise, +momentum) relays to the canonical GM (src/moves/bondCommand.js).
 */
export function isBondCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.bondCommandCard) return false;
  return /^!bond(\s|$)/i.test(text);
}

/** !flag opens the Set a Flag dialog (play kit p. 1). */
export function isFlagCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.safetyFlagCard) return false;
  return /^!flag(\s|$)/i.test(text);
}

/** !fate opens the Change Your Fate dialog (play kit p. 1). */
export function isFateCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.safetyFateCard) return false;
  return /^!fate(\s|$)/i.test(text);
}

/** !break opens the Take a Break dialog (play kit p. 1). */
export function isBreakCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.takeBreakCard) return false;
  return /^!break(\s|$)/i.test(text);
}

/** !begin-session opens the Begin a Session dialog (play kit p. 1). */
export function isBeginSessionCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.sessionLifecycleCard) return false;
  return /^!begin-session(\s|$)/i.test(text);
}

/** !end-session opens the End a Session dialog (play kit p. 1). */
export function isEndSessionCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.sessionLifecycleCard) return false;
  return /^!end-session(\s|$)/i.test(text);
}

/**
 * !incite (alias !inciting-incident) — envision the campaign's inciting
 * incident (rulebook "Begin your adventure", step 1). Ignores our own posted
 * card so it never self-triggers.
 */
export function isIncitingIncidentCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.incitingIncidentCard) return false;
  return /^!(incite|inciting-incident)(\s|$)/i.test(text);
}

/**
 * Roll the spark, ask the narrator to compose the inciting incident, and post
 * the card. Runs exactly once (chat routing, RUN_ON.CLAUDE): on the keyed
 * canonical GM when one is connected — so the premise canon, entity detection,
 * tier update and narrator side-data all land — else on the author's client
 * (its own key), where those GM-only writes are skipped and debug-logged.
 */
async function handleIncitingIncidentCommand(_message) {
  try {
    const { runIncitingIncident } = await import("./session/incitingIncident.js");
    const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
    await runIncitingIncident(campaignState);
  } catch (err) {
    console.warn(`${MODULE_ID} | inciting incident command failed:`, err?.message ?? err);
  }
}

/**
 * !reveal-site <name> — manually discover an unexplored sector site (precursor
 * vault / derelict), charting it on the sector map. GM-only. Ignores our own
 * discovery card so it never self-triggers.
 */
export function isRevealSiteCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.siteDiscovered) return false;
  return /^!reveal-site(\s|$)/i.test(text);
}

/**
 * !clear-site <name> — mark a discovered site fully explored
 * (unexplored → visited → cleared; SITE-NO-COMPLETION fix, 2026-07).
 * GM-only, mirrors !reveal-site.
 */
export function isClearSiteCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]) return false;
  return /^!clear-site(\s|$)/i.test(text);
}

async function handleClearSiteCommand(message) {
  if (!game.user?.isGM) {
    ui.notifications?.warn("Clearing a site is available to GMs only.");
    return;
  }
  const text  = message.content?.trim() ?? "";
  const label = text.replace(/^!clear-site\s*/i, "").trim();
  try {
    const { clearSectorSite } = await import("./sectors/siteDiscovery.js");
    const cleared = await clearSectorSite(label || null);
    if (cleared) {
      await ChatMessage.create({
        content: `<div class="starforged-companion-card"><h3>◈ Site Cleared — ${escapeChatHtml(cleared.site.name)}</h3><p>The ${cleared.site.type === "vault" ? "vault" : "derelict"} is fully explored. Its secrets are yours — or spent.</p></div>`,
        flags:   { [MODULE_ID]: { siteCleared: true, siteId: cleared.site.id } },
      });
    } else {
      ui.notifications?.info("No matching discovered site to clear.");
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | clear-site command failed:`, err?.message ?? err);
  }
}

/**
 * Reveal the named (or sole undiscovered) site and announce it. GM-gated —
 * world-setting writes require GM. Runs only on the authoring client (chat
 * routing, RUN_ON.AUTHOR) since it creates a shared chat document.
 */
async function handleRevealSiteCommand(message) {
  if (!game.user?.isGM) {
    ui.notifications?.warn("Revealing a site is available to GMs only.");
    return;
  }
  const text  = message.content?.trim() ?? "";
  const label = text.replace(/^!reveal-site\s*/i, "").trim();
  try {
    const { revealSectorSite, postSiteDiscoveryCard } = await import("./sectors/siteDiscovery.js");
    const revealed = await revealSectorSite(label || null, { source: "manual" });
    if (revealed) {
      await postSiteDiscoveryCard(revealed);
    } else {
      ui.notifications?.info("No matching unexplored site to reveal.");
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | reveal-site command failed:`, err?.message ?? err);
  }
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
/**
 * Build a minimal interpretation when the move ID is supplied by the caller
 * (the NWMA suggestion button). Skips the Claude API entirely. Stat defaults
 * to the move's first listed stat; the confirmation dialog still lets the
 * player override.
 */
function buildForcedInterpretation(moveId, narration, mischiefLevel, moveTarget = null, moveTargetId = null) {
  const moveData = MOVES[moveId];
  const statUsed = moveData?.stat?.[0] ?? null;
  const moveName = moveId.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return {
    playerNarration:  narration,
    inputMethod:      "chat",
    mischiefLevel,
    moveId,
    moveName,
    statUsed,
    statValue:        0,
    adds:             0,
    isProgressMove:   moveData?.progressMove === true,
    progressTicks:    0,
    moveTarget:       typeof moveTarget === "string" && moveTarget.trim() ? moveTarget.trim() : null,
    // The target's stable id when the card that forced the move knows it: a
    // connection picker's host Actor id (selectConnection), or a progress
    // track's id for Take Decisive Action / Finish an Expedition from a
    // Progress Tracks row or an expedition card (selectCombatTrack /
    // selectExpeditionTrack, issue #306 R06), for Take Decisive Action from
    // a combat move card, and for Battle from an Enter the Fray card
    // (TDA-BUTTON-NO-TARGET) — resolved before any name.
    moveTargetId:     typeof moveTargetId === "string" && moveTargetId ? moveTargetId : null,
    rationale:        "Move nominated by pacing classifier; player confirmed via suggestion button.",
    mischiefApplied:  false,
    confidence:       "high",
    playerConfirmed:  false,
  };
}

/**
 * Emit a console warning when the stored Claude API key obviously isn't
 * an Anthropic key. Anthropic keys are `sk-ant-…`; OpenRouter keys are
 * `sk-or-v1-…` and a common copy-paste mistake. This is best-effort —
 * we never block module load on key format.
 */
function warnIfClaudeKeyLooksWrong() {
  try {
    const raw = game.settings.get(MODULE_ID, "claudeApiKey") ?? "";
    const key = String(raw).trim();
    if (!key) return;                                  // empty is fine — caller will surface
    if (key.startsWith("sk-ant-")) return;             // looks right
    const prefix = `${key.slice(0, 9)}…`;
    if (key.startsWith("sk-or-v1-")) {
      console.warn(
        `${MODULE_ID} | The stored Claude API key starts with "sk-or-v1-" ` +
        `(OpenRouter format). This will 401 against Anthropic. ` +
        `Move it to the OpenRouter field in Companion Settings → About.`,
      );
      return;
    }
    console.warn(
      `${MODULE_ID} | The stored Claude API key does not start with "sk-ant-" ` +
      `(prefix: ${prefix}). Anthropic keys begin with "sk-ant-". ` +
      `Verify in Companion Settings → About.`,
    );
  } catch (err) {
    console.warn(`${MODULE_ID} | warnIfClaudeKeyLooksWrong failed:`, err?.message ?? err);
  }
}

/**
 * Resolve the character snapshot the pacing classifier should see.
 *
 * @param {Object}        campaignState
 * @param {string|null}   speakerActorId — preferred actor; falls back to
 *   campaignState.characterIds[0] then the first player-owned PC.
 *
 * Previously this read `game.journal.get(characterIds[0])`, which was
 * wrong on two counts: characters are Actors (not Journal entries), and
 * `characterIds` is never written by the module (always []). The function
 * therefore always returned null, leaving the pacing classifier without
 * any character context.
 */
function getActiveCharacterForPacing(campaignState, speakerActorId = null) {
  try {
    const actorId = speakerActorId
                 ?? campaignState?.characterIds?.[0]
                 ?? null;
    const actor = actorId
      ? game.actors?.get(actorId)
      : (game.actors?.find(a => a?.type === "character" && a?.hasPlayerOwner && !a?.flags?.[MODULE_ID]?.entityType) ?? null);
    if (!actor) return null;
    return { name: actor.name ?? null };
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

// Map of chat-friendly odds aliases to canonical ORACLE_ODDS keys.
const ODDS_ALIASES = new Map([
  ["small_chance",  "small_chance"], ["small", "small_chance"],
  ["unlikely",      "unlikely"],
  ["50_50",         "50_50"],        ["50/50", "50_50"], ["even", "50_50"],
  ["likely",        "likely"],
  ["almost_certain","almost_certain"], ["certain", "almost_certain"], ["sure", "almost_certain"],
]);

/**
 * Handle an !oracle chat command. Any player may invoke; runs once, on the
 * authoring client (its dice are the only dice).
 *
 *   !oracle yes [odds] [question?]     — Ask the Oracle (yes/no)
 *   !oracle <tableId> [question?]      — roll any registered oracle table
 *                                        (built-in or a custom !oracle-add one)
 *
 * The yes/no form posts a card with the d100 result, the threshold for the
 * chosen odds, the yes/no answer, and (on a match) a "MATCH" badge prompting
 * the GM/player to envision an extreme result or twist. Anything else posts
 * the usage card.
 */
async function handleOracleCommand(message) {
  const text  = message.content?.trim() ?? "";
  const parts = text.slice("!oracle".length).trim().split(/\s+/);

  if (parts[0] && !/^yes(-no)?$/i.test(parts[0])) {
    const tableId = resolveOracleTableId(parts[0]);
    if (tableId) {
      await handleOracleTableCommand(message, tableId, parts.slice(1).join(" "));
      return;
    }
  }

  if (!parts[0] || !/^yes(-no)?$/i.test(parts[0])) {
    await ChatMessage.create({
      content: `<div class="sf-oracle-card"><strong>Oracle</strong> <p>Usage: <code>!oracle yes [odds] [question?]</code> or <code>!oracle &lt;table-id&gt; [question?]</code><br>Odds: <code>small</code> · <code>unlikely</code> · <code>50/50</code> · <code>likely</code> · <code>certain</code> (default <code>50/50</code>)${parts[0] ? `<br>No oracle table named <code>${escapeChatHtml(parts[0])}</code>.` : ""}</p></div>`,
      flags:   { [MODULE_ID]: { oracleCommandCard: true } },
    });
    return;
  }

  // Resolve odds — if parts[1] is a known odds alias use it, else fall back
  // to 50/50 and treat parts[1..] as the question.
  let oddsKey  = "50_50";
  let question = parts.slice(1).join(" ");
  if (parts[1]) {
    const aliased = ODDS_ALIASES.get(parts[1].toLowerCase());
    if (aliased) {
      oddsKey  = aliased;
      question = parts.slice(2).join(" ");
    }
  }

  const result = rollYesNo(oddsKey, { question });
  void showD100(result.roll);   // 3D dice for the d100 (fire-and-forget, fail-open)
  const oddsLabel = oddsKey === "50_50" ? "50/50" : oddsKey.replace(/_/g, " ");
  const matchBadge = result.isMatch
    ? ` <em>· MATCH — envision an extreme result or twist</em>`
    : "";

  const qBlock = question
    ? `<p><em>${escapeChatHtml(question)}</em></p>`
    : "";

  await ChatMessage.create({
    content: `<div class="sf-oracle-card"><strong>Ask the Oracle (${escapeChatHtml(oddsLabel)})</strong>${qBlock}<p>d100 = <strong>${result.roll}</strong> ≤ ${result.threshold}? <strong>${result.answer.toUpperCase()}</strong>${matchBadge}</p></div>`,
    flags:   {
      [MODULE_ID]: {
        oracleCommandCard: true,
        // Structured payload for the canonical GM's oracle-memory capture
        // hook (narrator-context audit 2026-07 — raw oracle results had no
        // memory home). The command may run on a player client that cannot
        // write world settings, so the card carries the data and the GM
        // ledgers it.
        oracleMemory: {
          name:     `Ask the Oracle (${oddsLabel})`,
          question,
          answer:   `${result.answer.toUpperCase()}${result.isMatch ? " (MATCH — extreme/twist)" : ""}`,
        },
      },
    },
  });

  // Narration follow-up — runs once, where a Claude key lives (the author's
  // client, else the canonical GM). Reuses the same `oracle_followup` mode as
  // Pay the Price below so safety, tone, scene anchor, and length come from
  // the configured narrator settings.
  requestOracleNarration({
    kind:           "oracle_yes_no",
    oracleName:     `Ask the Oracle (${oddsLabel})`,
    question,
    rolledLine:     `d100 = ${result.roll} ${result.answer === "yes" ? "≤" : ">"} ${result.threshold} → ${result.answer.toUpperCase()}${result.isMatch ? " (MATCH — extreme/twist)" : ""}`,
    speakerActorId: resolveSpeakerActorId(message, game.settings.get(MODULE_ID, "campaignState")),
  });
}

/**
 * Resolve a typed table id against the registered oracle tables (built-in and
 * custom): exact id first, then case-insensitive. Null when nothing matches.
 *
 * @param {string} raw
 * @returns {string|null}
 */
function resolveOracleTableId(raw) {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  if (Object.prototype.hasOwnProperty.call(ORACLE_TABLES, id)) return id;
  const lo = id.toLowerCase();
  return Object.keys(ORACLE_TABLES).find(k => k.toLowerCase() === lo) ?? null;
}

/**
 * `!oracle <tableId> [question?]` — roll one registered oracle table and post
 * the result card, carrying the same `oracleMemory` payload as the yes/no card
 * so the canonical GM ledgers it (registerOracleMemoryCaptureHook).
 *
 * @param {ChatMessage} message
 * @param {string} tableId   a key of ORACLE_TABLES
 * @param {string} question  optional context text
 */
async function handleOracleTableCommand(message, tableId, question) {
  let result;
  try {
    result = rollOracle(tableId);
  } catch (err) {
    console.warn(`${MODULE_ID} | !oracle ${tableId}: roll failed:`, err?.message ?? err);
    await ChatMessage.create({
      content: `<div class="sf-oracle-card"><strong>Oracle</strong> <p>Rolling <code>${escapeChatHtml(tableId)}</code> failed — see the browser console.</p></div>`,
      flags:   { [MODULE_ID]: { oracleCommandCard: true } },
    });
    return;
  }
  const die = result.die ?? 100;
  // 3D dice for d100 tables only (fire-and-forget, fail-open); custom d4/d6/…
  // tables post without the animation.
  if (die === 100) void showD100(result.roll);

  const tableName = result.tableName ?? tableId;
  const qBlock = question ? `<p><em>${escapeChatHtml(question)}</em></p>` : "";
  await ChatMessage.create({
    content: `<div class="sf-oracle-card"><strong>Oracle: ${escapeChatHtml(tableName)}</strong>${qBlock}<p>d${die} = <strong>${result.roll}</strong> · ${escapeChatHtml(result.result)}</p></div>`,
    flags:   {
      [MODULE_ID]: {
        oracleCommandCard: true,
        oracleTableId:     tableId,
        oracleMemory:      { name: tableName, question, answer: result.result },
      },
    },
  });

  requestOracleNarration({
    kind:           "oracle_table",
    oracleName:     tableName,
    question,
    rolledLine:     `d${die} = ${result.roll} → ${result.result}`,
    speakerActorId: resolveSpeakerActorId(message, game.settings.get(MODULE_ID, "campaignState")),
  });
}

/**
 * Handle a !pay-the-price (or !ptp) chat command. Rolls the d100 Pay the
 * Price table and posts the result. Any player may invoke; runs once, on the
 * authoring client. A routed suffer lands on the typist's PC (the player owns
 * it, so the meter write works from their client); the countdown-clock advance
 * is GM-only and relayed to the canonical GM (src/clocks/payThePriceClocks.js).
 *
 *   !pay-the-price [question?]
 *   !ptp [question?]
 *
 * The question text is optional context — the table itself just produces a
 * d100 + consequence string. The fate-move (`pay_the_price`) flow in the
 * resolver already surfaces this same table as an advisory seed on every
 * eligible move's miss card; this command lets the player or GM invoke it
 * directly without going through a move pipeline.
 */
async function handlePayThePriceCommand(message) {
  const text = message.content?.trim() ?? "";
  const head = /^!(pay-the-price|ptp)\b/i.exec(text)?.[0] ?? "!pay-the-price";
  const question = text.slice(head.length).trim();

  const { rollOracle } = await import("./oracles/roller.js");
  let result;
  try {
    result = rollOracle("pay_the_price");
  } catch (err) {
    console.warn(`${MODULE_ID} | !pay-the-price: roll failed:`, err);
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>Pay the Price</strong> <p>Roll failed — see console.</p></div>`,
      flags:   { [MODULE_ID]: { payThePriceCard: true } },
    });
    return;
  }

  void showD100(result.roll);   // 3D dice for the d100 (fire-and-forget, fail-open)

  const qBlock = question
    ? `<p><em>${escapeChatHtml(question)}</em></p>`
    : "";

  // F16 Phase E: rolled entries carrying a `sufferRoute` annotation auto-fire
  // the corresponding suffer executor against the active character. Narrative
  // entries (no sufferRoute) pass through unchanged — narrator and GM resolve.
  const routeFooter = result.sufferRoute
    ? `<p><em>Routes to ${escapeChatHtml(result.sufferRoute.move)} (-${result.sufferRoute.amount}).</em></p>`
    : "";

  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>Pay the Price</strong>${qBlock}<p>d100 = <strong>${result.roll}</strong> · ${escapeChatHtml(result.result)}</p>${routeFooter}</div>`,
    flags:   {
      [MODULE_ID]: {
        payThePriceCard: true,
        sufferRoute:     result.sufferRoute ?? null,
        oracleMemory:    { name: "Pay the Price", question, answer: result.result },
      },
    },
  });

  // Credit the roller: a routed suffer lands on the PC of the player who typed
  // the command, not the first PC in the world.
  const speakerActorId = resolveSpeakerActorId(message, game.settings.get(MODULE_ID, "campaignState"));
  if (result.sufferRoute) {
    await dispatchPayThePriceSufferRoute(result.sufferRoute, speakerActorId).catch(err =>
      console.warn(`${MODULE_ID} | !pay-the-price: suffer dispatch failed:`, err?.message ?? err),
    );
  }

  // Countdown clocks advance on the canonical GM (world/actor writes) — run
  // locally there, relayed from a player's client.
  await requestGmAction("payThePrice.advanceClocks", {}).catch(err =>
    console.warn(`${MODULE_ID} | !pay-the-price: clock advance failed:`, err?.message ?? err));

  // Narration follow-up — once, where a Claude key lives (oracleFollowup.js).
  requestOracleNarration({
    kind:       "pay_the_price",
    oracleName: "Pay the Price",
    question,
    rolledLine: `d100 = ${result.roll} → ${result.result}`,
    speakerActorId,
  });
}

/**
 * Oracle-memory capture (narrator-context audit 2026-07): every `!oracle` /
 * `!pay-the-price` result card carries a structured `oracleMemory` flag; the
 * canonical GM ledgers it into `campaignState.recentOracles` so the narrator
 * is always told what the dice established (system-prompt section [3b]).
 * The commands themselves run on whichever client typed them — possibly a
 * player who cannot write world settings — hence capture-on-GM via the hook.
 */
function registerOracleMemoryCaptureHook() {
  Hooks.on("createChatMessage", (message) => {
    try {
      if (!isCanonicalGM()) return;
      const entry = message?.flags?.[MODULE_ID]?.oracleMemory;
      if (!entry || typeof entry !== "object") return;

      const campaignState = game.settings.get(MODULE_ID, "campaignState");
      const stored = recordOracleResult(campaignState, entry);
      if (!stored) return;
      game.settings.set(MODULE_ID, "campaignState", campaignState).catch(err =>
        console.warn(`${MODULE_ID} | oracle-memory: persist failed:`, err?.message ?? err));
    } catch (err) {
      console.warn(`${MODULE_ID} | oracle-memory capture failed:`, err?.message ?? err);
    }
  });
}

/**
 * F16 Phase F (F15 fold-in): post an informational follow-up card to chat
 * when Set a Course resolves to a non-miss, so players can see that the
 * ship-position update fired. Before this card, F15 surfaced as "narrator
 * describes arrival, but did the token actually move?" trust gap on every
 * resolution.
 *
 * The card is purely informational — the weak-hit choice consequences
 * (suffer −2, two −1s, or complication at destination) are handled
 * separately by the SufferChoiceDialog (Phase D).
 *
 * @param {string|null} destination — interpretation.moveTarget
 * @param {Object} resolution — full move resolution from resolveMove()
 */
async function postSetACourseFeedbackCard(destination, resolution) {
  const dest = destination ? escapeChatHtml(destination) : "the destination";
  const outcomeLine = resolution.outcome === "strong_hit"
    ? `<p>Token moved to <strong>${dest}</strong>. Course held cleanly (+1 momentum).</p>`
    : resolution.outcome === "weak_hit"
      ? `<p>Token moved to <strong>${dest}</strong>. Arrived with cost or complication — see the suffer prompt for your choice.</p>`
      : `<p>Token did not move (course not held).</p>`;
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>Set a Course resolved</strong>${outcomeLine}</div>`,
      flags:   { [MODULE_ID]: { setACourseFeedback: true, outcome: resolution.outcome } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postSetACourseFeedbackCard: chat post failed:`, err?.message ?? err);
  }
}

/**
 * Exploration lifecycle feedback — confirm an expedition progress mark and,
 * when the track was just auto-created at the interpreter-inferred rank, tell
 * the player they can re-rank it in the Progress Tracks panel (the inference
 * is a best guess, so it stays cheap to correct). See moves/expedition.js.
 *
 * @param {{ track: Object, created: boolean }} result
 */
async function postExpeditionProgressCard({ track, created }) {
  const label = escapeChatHtml(track?.label ?? "Expedition");
  const rank  = escapeChatHtml(String(track?.rank ?? "dangerous").replace(/^\w/, c => c.toUpperCase()));
  const boxes = Math.floor(Number(track?.ticks ?? 0) / 4);
  const body  = created
    ? `<p>New expedition <strong>${label}</strong> (${rank}) begun — progress marked (${boxes}/10 boxes). If the rank looks off, adjust it in the Progress Tracks panel.</p>`
    : `<p>Progress marked on <strong>${label}</strong> (${rank}) — ${boxes}/10 boxes.</p>`;
  const finishBtn = `<div class="sf-milestone-suggest-row">` +
    `<button type="button" class="sf-followup-btn" data-action="sf-finish-expedition" ` +
    `title="Roll to finish the expedition (progress roll)">🗺 Finish the Expedition</button></div>`;
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>Expedition</strong>${body}${finishBtn}</div>`,
      // trackId / trackLabel: the Finish button forwards them as
      // forcedMoveTargetId / forcedMoveTarget so the finish roll resolves THIS
      // expedition even with several open, same-named ones included
      // (EXPEDITION-FINISH-TARGET fix; issue #306 R06).
      flags:   { [MODULE_ID]: { expeditionProgressCard: true, created: created === true, trackLabel: track?.label ?? null, trackId: track?.id ?? null } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postExpeditionProgressCard: chat post failed:`, err?.message ?? err);
  }
}

/**
 * A roll started from a track the table has since deleted or finished: say
 * nothing was rolled (issue #306 R06). Posted instead of the move — never
 * against a same-named sibling, never at a score of 0.
 *
 * @param {{ moveName?: string, moveTarget?: string|null }} interpretation
 */
async function postTrackGoneCard(interpretation) {
  const label = escapeChatHtml(interpretation?.moveTarget ?? "That track");
  const move  = escapeChatHtml(interpretation?.moveName ?? "The roll");
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>${move} — not rolled</strong>`
      + `<p><strong>${label}</strong> is no longer open: it was deleted or finished before the roll. Nothing was rolled.</p></div>`,
    flags:   { [MODULE_ID]: { trackGoneCard: true } },
  });
}

// ── Finish an Expedition miss: recommit offer (play kit) ─────────────────────

async function postRecommitOfferCard(track) {
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>Expedition — recommit?</strong>`
      + `<p>The way to <strong>${escapeChatHtml(track.label ?? "your destination")}</strong> is lost to you — for now. `
      + `You may abandon the expedition (leave the track as it stands), or <em>recommit</em>: `
      + `roll both challenge dice, clear filled boxes equal to the lowest, and raise the expedition's rank by one.</p>`
      + `<div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn" data-action="sf-recommit" `
      + `title="Roll challenge dice, clear the lowest die's boxes, raise the rank">🔁 Recommit to the Expedition</button></div></div>`,
    flags: { [MODULE_ID]: { recommitOfferCard: true, trackId: track.id, trackLabel: track.label ?? null } },
  });
}

// GM-side: execute the recommit mechanics on an open expedition track.
async function performRecommit(trackId) {
  try {
    const track = (await listProgressTracks()).find(t => t.id === trackId);
    if (!track || track.completed) {
      console.warn(`${MODULE_ID} | recommit: track ${trackId} missing or already completed.`);
      return;
    }
    const dice = rollChallengeDice();
    const plan = planRecommit(track.ticks, track.rank, dice);
    await updateTrackFields(trackId, { ticks: plan.newTicks, rank: plan.newRank });
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>Recommitted: ${escapeChatHtml(track.label ?? "Expedition")}</strong>`
        + `<p>Challenge dice ${dice[0]}, ${dice[1]} — cleared <strong>${plan.clearedBoxes}</strong> box${plan.clearedBoxes === 1 ? "" : "es"} `
        + `(now ${Math.floor(plan.newTicks / 4)}/10) and the expedition hardens to <strong>${escapeChatHtml(plan.newRank)}</strong>. `
        + `The journey continues.</p></div>`,
      flags: { [MODULE_ID]: { recommitCard: true, trackId, newRank: plan.newRank, newTicks: plan.newTicks } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | recommit failed:`, err?.message ?? err);
  }
}

// Wire the recommit button — a journal write, so non-canonical clients relay.
function registerRecommitHook() {
  if (registerRecommitHook._installed) return;
  registerRecommitHook._installed = true;
  onChatMessageRender((message, root) => {
    const f = message?.flags?.[MODULE_ID];
    if (!f?.recommitOfferCard) return;
    const btn = root.querySelector('[data-action="sf-recommit"]');
    if (!btn) return;
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener("click", async (event) => {
      event.preventDefault(); event.stopPropagation();
      fresh.disabled = true;
      if (isCanonicalGM()) {
        await performRecommit(f.trackId);
      } else {
        try {
          game.socket?.emit?.(`module.${MODULE_ID}`, { kind: "expedition.recommit", trackId: f.trackId });
        } catch (err) {
          console.warn(`${MODULE_ID} | recommit relay emit failed:`, err?.message ?? err);
          fresh.disabled = false;
        }
      }
    });
  });
}

// GM-side socket receiver for player recommit clicks.
function registerRecommitSocket() {
  if (registerRecommitSocket._installed) return;
  if (!game?.socket?.on) return;
  registerRecommitSocket._installed = true;
  game.socket.on(`module.${MODULE_ID}`, async (payload) => {
    try {
      if (!payload || payload.kind !== "expedition.recommit") return;
      if (!isCanonicalGM()) return;
      await performRecommit(payload.trackId);
    } catch (err) {
      console.warn(`${MODULE_ID} | recommit socket handler failed:`, err?.message ?? err);
    }
  });
}

const LEGACY_LABELS = { discoveries: "Discoveries", quests: "Quests", bonds: "Bonds" };

/**
 * Add ticks to a legacy track on campaignState (capped at the 40-tick / 10-box
 * maximum), creating the entry if absent. Mutates in place; the caller (or its
 * pipeline) persists campaignState.
 *
 * Newly FILLED boxes award XP — 2 per box, 1 once the track has been cleared
 * (play kit rule 1.12) — to every player character (legacy tracks are shared
 * crew tracks in this module, like the shared supply), with a chat note. The
 * award is fire-and-forget so call sites stay synchronous; failures warn.
 * LEGACY-XP-DEAD fix: ticks used to accrue here with no XP ever awarded — the
 * awarding path (persistResolution.markLegacyProgress) required a consequence
 * field no resolver set.
 *
 * @returns {number} newly filled boxes
 */
export function addLegacyTicks(campaignState, key, ticks) {
  campaignState.legacyTracks ??= {};
  const t = campaignState.legacyTracks[key] ?? { ticks: 0, cleared: false };
  const boxesBefore = Math.floor((t.ticks ?? 0) / 4);
  t.ticks = Math.min((t.ticks ?? 0) + ticks, 40);
  const newBoxes = Math.floor(t.ticks / 4) - boxesBefore;
  campaignState.legacyTracks[key] = t;
  if (newBoxes > 0) {
    awardLegacyBoxXP(key, newBoxes, newBoxes * (t.cleared ? 1 : 2)).catch(err =>
      console.warn(`${MODULE_ID} | legacy XP award failed:`, err?.message ?? err));
  }
  return newBoxes;
}

/** Award legacy-box XP to every player character and post the earned-XP note. */
async function awardLegacyBoxXP(key, boxes, xp) {
  for (const actor of getPlayerActors()) {
    await awardXP(actor, xp).catch(err =>
      console.warn(`${MODULE_ID} | awardXP failed for ${actor?.name ?? actor?.id}:`, err?.message ?? err));
  }
  const label = LEGACY_LABELS[key] ?? key;
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>${escapeChatHtml(label)} legacy — box filled</strong><p>+${xp} XP earned (${boxes} box${boxes === 1 ? "" : "es"} filled). Spend it on new assets or upgrades (Earn Experience).</p></div>`,
    flags:   { [MODULE_ID]: { legacyXpCard: true, track: key, boxes, xp } },
  }).catch(err => console.warn(`${MODULE_ID} | legacy XP card failed:`, err?.message ?? err));
}

/** Feedback for a Make a Discovery / Confront Chaos legacy mark. */
async function postLegacyMarkCard(track, ticks) {
  const label = LEGACY_LABELS[track] ?? track;
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>${escapeChatHtml(label)} legacy</strong><p>Marked ${ticks} tick${ticks === 1 ? "" : "s"} on your ${escapeChatHtml(String(label).toLowerCase())} legacy track.</p></div>`,
      flags:   { [MODULE_ID]: { legacyMarkCard: true, track, ticks } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postLegacyMarkCard: chat post failed:`, err?.message ?? err);
  }
}

/** Feedback for Finish an Expedition — track completed + legacy reward. */
async function postExpeditionFinishCard({ track, legacyTicks }) {
  const label = escapeChatHtml(track?.label ?? "Expedition");
  const reward = legacyTicks > 0
    ? `Marked ${legacyTicks} tick${legacyTicks === 1 ? "" : "s"} on your Discoveries legacy track.`
    : `No legacy reward (a weak hit on a troublesome expedition).`;
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>Expedition complete</strong><p><strong>${label}</strong> is finished. ${reward}</p></div>`,
      flags:   { [MODULE_ID]: { expeditionFinishCard: true, legacyTicks } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postExpeditionFinishCard: chat post failed:`, err?.message ?? err);
  }
}

// ── Combat threshold (#241): offer Enter the Fray vs. a way out ──────────────

async function postCombatThresholdCard({ label, suggestedRank, vowNames, position = null, actorId = null }) {
  try {
    await ChatMessage.create({
      content: buildCombatThresholdHtml({ label, suggestedRank, vowNames, position }),
      // position/actorId: Enter the Fray's own outcome position (in control on
      // a strong hit, bad spot on a miss) rides here — the combat track doesn't
      // exist yet when the consequence fires, so createCombatTrackFromThreshold
      // applies it at creation. The weak-hit choose-one stashes its pick into
      // the same flag (sufferDialog combat-position executor).
      flags:   { [MODULE_ID]: { combatThresholdCard: true, label: label ?? null, position, actorId } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postCombatThresholdCard: chat post failed:`, err?.message ?? err);
  }
}

// GM-side: create (or resume) the combat track from a threshold choice, carrying
// the chosen rank, objective, the vow it serves, and Enter the Fray's carried
// opening position. Reuses applyCombatProgress so a double-click resumes the
// same fight instead of duplicating it. Exported so Quench can drive it.
export async function createCombatTrackFromThreshold({ label, rank, vowName, objective, position = null, actorId = null }) {
  const result = await applyCombatProgress(
    {
      moveTarget:    label ?? "the enemy",
      combatRank:    rank,
      markCount:     0,
      objective:     objective || null,
      linkedVowName: vowName || null,
    },
    {
      listTracks:   () => listProgressTracks(),
      createTrack:  (data) => addProgressTrack(data),
      markProgress: (id) => markProgressById(id),
    },
  );
  if (result?.track) {
    await postCombatTrackCard(result).catch(err =>
      console.warn(`${MODULE_ID} | combat track card failed:`, err?.message ?? err));
    await enterCombatTracker(result.track.id, getPlayerActors()).catch(err =>
      console.warn(`${MODULE_ID} | combat tracker open failed:`, err?.message ?? err));
    if (position === "in_control" || position === "bad_spot") {
      const actor = (actorId ? game.actors?.get(actorId) : null) ?? getPlayerActors()[0] ?? null;
      await applyCombatPositionToTrack(result.track.id, position, actor).catch(err =>
        console.warn(`${MODULE_ID} | threshold position apply failed:`, err?.message ?? err));
    }
  }
  return result;
}

// Wire the threshold card's buttons. Enter the Fray is a privileged world write
// (creates a track), so non-canonical clients relay to the GM over the module
// socket; the way out just posts a narration nudge (any client may post chat).
function registerCombatThresholdHook() {
  if (registerCombatThresholdHook._installed) return;
  registerCombatThresholdHook._installed = true;
  onChatMessageRender((message, root) => {
    if (!message?.flags?.[MODULE_ID]?.combatThresholdCard) return;
    const enterBtn = root.querySelector('[data-action="sf-enter-fray"]');
    const wayBtn   = root.querySelector('[data-action="sf-way-out"]');
    const readChoice = () => ({
      label:     message.flags[MODULE_ID].label ?? "the enemy",
      rank:      root.querySelector('.sf-threshold-rank')?.value
                 || root.querySelector('.sf-combat-threshold')?.dataset?.suggestedRank,
      vowName:   root.querySelector('.sf-threshold-vow')?.value || "",
      objective: root.querySelector('.sf-threshold-objective')?.value || "",
      // Enter the Fray's carried opening position + whose sheet mirrors it —
      // read at click time so a weak-hit choice stashed after the card posted
      // (sufferDialog combat-position executor) is picked up too. The socket
      // relay spreads the whole choice, so non-canonical clients carry it.
      position:  message.flags[MODULE_ID].position ?? null,
      actorId:   message.flags[MODULE_ID].actorId ?? null,
    });
    const disable = () => { if (enterBtn) enterBtn.disabled = true; if (wayBtn) wayBtn.disabled = true; };

    if (enterBtn) {
      const fresh = enterBtn.cloneNode(true);
      enterBtn.replaceWith(fresh);
      fresh.addEventListener("click", async (event) => {
        event.preventDefault(); event.stopPropagation();
        const choice = readChoice();
        disable();
        if (isCanonicalGM()) {
          await createCombatTrackFromThreshold(choice).catch(err =>
            console.warn(`${MODULE_ID} | enter the fray failed:`, err?.message ?? err));
        } else {
          try {
            game.socket?.emit?.(`module.${MODULE_ID}`, { kind: "combat.enterFray", ...choice });
          } catch (err) {
            console.warn(`${MODULE_ID} | enter-fray relay emit failed:`, err?.message ?? err);
          }
        }
      });
    }
    if (wayBtn) {
      const freshWay = wayBtn.cloneNode(true);
      wayBtn.replaceWith(freshWay);
      freshWay.addEventListener("click", async (event) => {
        event.preventDefault(); event.stopPropagation();
        disable();
        try {
          await ChatMessage.create({
            content: buildWayOutHtml(),
            flags:   { [MODULE_ID]: { wayOutCard: true } },
          });
        } catch (err) {
          console.warn(`${MODULE_ID} | way-out card failed:`, err?.message ?? err);
        }
      });
    }
  });
}

// Wire the way-out card's off-ramp buttons: each posts the matching forced
// move (Face Danger / Compel / Secure an Advantage) so choosing an exit rolls
// it instead of leaving the player to retype the move. Any client may post —
// the canonical GM's pipeline picks the message up.
function registerWayOutHook() {
  if (registerWayOutHook._installed) return;
  registerWayOutHook._installed = true;
  onChatMessageRender((message, root) => {
    if (!message?.flags?.[MODULE_ID]?.wayOutCard) return;
    for (const btn of root.querySelectorAll('[data-action="sf-way-out-move"]')) {
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      fresh.addEventListener("click", async (event) => {
        event.preventDefault(); event.stopPropagation();
        const move = WAY_OUT_MOVES.find(m => m.moveId === fresh.dataset.moveId);
        if (!move) {
          console.warn(`${MODULE_ID} | way-out: unknown move id "${fresh.dataset.moveId}"`);
          return;
        }
        root.querySelectorAll('[data-action="sf-way-out-move"]').forEach(b => { b.disabled = true; });
        try {
          await ChatMessage.create({
            content: move.narration,
            flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: move.moveId } },
          });
        } catch (err) {
          console.error(`${MODULE_ID} | way-out move post failed:`, err?.message ?? err);
          root.querySelectorAll('[data-action="sf-way-out-move"]').forEach(b => { b.disabled = false; });
        }
      });
    }
  });
}

// GM-side socket: a non-canonical client chose Enter the Fray; create the track.
function registerCombatThresholdSocket() {
  if (registerCombatThresholdSocket._installed) return;
  if (!game?.socket?.on) return;
  registerCombatThresholdSocket._installed = true;
  game.socket.on(`module.${MODULE_ID}`, async (payload) => {
    try {
      if (!payload || payload.kind !== "combat.enterFray") return;
      if (!isCanonicalGM()) return;
      await createCombatTrackFromThreshold(payload);
    } catch (err) {
      console.warn(`${MODULE_ID} | enter-fray socket handler failed:`, err?.message ?? err);
    }
  });
}

// ── Won-fight vow milestone (#241): surface the vow the fight served ─────────

// Exported for unit testing.
export async function postFightVowMilestoneCard(vowName, marks, actorId = null) {
  // The linked vow's rank + connection link — read from the vow the card's
  // buttons will act on: the roller's own (resolveVowItemCopies; the milestone
  // button marks resolveVowHolderActor's). The first PC's same-named vow used
  // to supply them, so 🤝 Deepen could name another PC's connection (issue
  // #301 B02). Open vows only, as before.
  const { primary } = resolveVowItemCopies(vowName, { actorId });
  const item = primary?.item?.system?.completed === true ? null : (primary?.item ?? null);
  const vowRank        = item?.system?.rank ?? null;
  const connectionName = item?.flags?.[MODULE_ID]?.linkedConnectionName ?? null;
  const safeVow   = escapeChatHtml(vowName ?? "your vow");
  const deepenBtn = connectionName
    ? ` <button type="button" class="entity-btn" data-action="sf-deepen-bond">🤝 Deepen your bond with ${escapeChatHtml(connectionName)}</button>`
    : "";
  try {
    await ChatMessage.create({
      content: `<div class="sf-card sf-fight-vow"><div class="sf-card-header">⚔ Victory — a milestone toward your vow</div>`
        + `<div class="sf-card-body"><p>You won the fight serving &ldquo;${safeVow}&rdquo;.</p>`
        + `<p><button type="button" class="entity-btn" data-action="sf-mark-milestone">⚑ Mark milestone (×${marks})</button> `
        + `<button type="button" class="entity-btn" data-action="sf-fulfill-vow">🏁 Attempt to Fulfill</button>${deepenBtn}</p></div></div>`,
      // actorId: the PC whose winning roll ended the fight — the milestone
      // marks their copy of the vow (credit the roller).
      flags: { [MODULE_ID]: { fightVowCard: true, vowName, marks, connectionName, vowRank, actorId } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postFightVowMilestoneCard: chat post failed:`, err?.message ?? err);
  }
}

// GM-side: mark the linked vow `marks` times (scaled by the fight's rank), on
// the PC that actually holds the vow — the card's roller when they hold it,
// else whichever PC does (resolveVowHolderActor). Shared-vow copies on the
// other PCs follow via the updateItem sync hook. Exported for the won-fight
// card's relay handler (src/moves/cardActions.js applyFightVowMarkMilestone).
export async function markLinkedVowMilestone(vowName, marks, actorId = null) {
  await applyReachMilestone(resolveVowHolderActor(vowName, actorId), vowName ?? null, marks).catch(err =>
    console.warn(`${MODULE_ID} | mark linked vow failed:`, err?.message ?? err));
}

/**
 * The PC that holds the named vow, preferring `preferredActorId` (the roller /
 * the card's actor) when that PC has a copy. Falls back to the PC owning the
 * resolved vow item, then the preferred actor, then the first PC — never
 * blindly the first PC when another PC is the one holding the vow.
 * Exported for unit testing.
 *
 * @param {string|null} vowName
 * @param {string|null} [preferredActorId]
 * @returns {Actor|null}
 */
export function resolveVowHolderActor(vowName, preferredActorId = null) {
  const preferred = preferredActorId ? (game.actors?.get?.(preferredActorId) ?? null) : null;
  const { primary, copies } = resolveVowItemCopies(vowName, { actorId: preferred?.id ?? null });
  if (preferred && copies.some(({ actor }) => actor?.id === preferred.id)) return preferred;
  return primary?.actor ?? preferred ?? getPlayerActors()[0] ?? null;
}

// GM-side: deepen the connection a vow served, by `marks` rank-based marks on
// its relationship track. Exported for the won-fight card's relay handler
// (src/moves/cardActions.js applyFightVowDeepenBond).
export async function deepenLinkedConnection(connectionName, marks) {
  try {
    const conn = await import("./entities/connection.js");
    const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
    const connections = (campaignState.connectionIds ?? [])
      .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
      .filter(Boolean);
    const target = selectConnection(connections, connectionName ?? null);
    if (target?.__hostId) {
      await conn.markRelationshipProgress(target.__hostId, Math.max(1, marks));
      await postDeepenBondCard(target.name ?? connectionName, Math.max(1, marks));
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | deepen connection failed:`, err?.message ?? err);
  }
}

async function postDeepenBondCard(name, marks) {
  try {
    await ChatMessage.create({
      content: `<div class="sf-card sf-deepen-bond"><div class="sf-card-body"><p>🤝 Your bond with <strong>${escapeChatHtml(name ?? "your connection")}</strong> deepens — +${marks} milestone${marks === 1 ? "" : "s"} of relationship progress.</p></div></div>`,
      flags:   { [MODULE_ID]: { deepenBondCard: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postDeepenBondCard: chat post failed:`, err?.message ?? err);
  }
}

// Resolve the vow a payoff targets and collect every copy of it across PCs.
// Payoffs used to match by exact lowercased name only, while creation/sync/
// reward-link key on the vowId flag — so a renamed vow (or a stale
// linkedVowName snapshot on a combat track / victory card) rolled hits that
// completed nothing and paid nothing (VOW-RENAME-PAYOFF fix). Resolution
// ladder mirrors selectMilestoneVow: exact name → substring (either way) →
// sole open vow; copies then collect by the shared vowId flag when present,
// else by the resolved item's exact name.
//
// The fallback rungs never resolve a DIFFERENT open vow for a name that
// matches a vow already completed: fulfilling vow A completes A first, and
// the later rungs used to resolve another open vow B — the payoff then
// stamped fulfilPaid on B, deepened B's connection and granted B's reward.
// So an exact match on a completed vow skips the substring rung, and any
// match on a completed vow skips the sole-open-vow rung (which is for a name
// that matches NOTHING — a fully renamed vow).
//
// The roller's own vow comes first (issue #301 B02). `itemId` — the exact
// Item a roll scored — outranks every name; then, with `actorId`, that PC's
// own exact-name vow (open, else completed: the sheet or the pipeline may
// have closed it before the payoff runs). Two PCs' INDEPENDENT vows can share
// a name (both "Background Vow", different vowIds), and the global ladder
// below took whichever PC came first — another PC's vow was completed,
// forsaken, stamped paid and rewarded, its rank set the legacy and its
// connection was deepened. The global ladder applies only when the roller
// holds no such vow.
//
// @param {string|null} vowName
// @param {{ actorId?: string|null, itemId?: string|null }} [opts]
// @returns {{ primary: {actor, item}|null, copies: Array<{actor, item}> }}
export function resolveVowItemCopies(vowName, { actorId = null, itemId = null } = {}) {
  const all  = collectPlayerVowItems();
  const open = all.filter(e => e.item.system?.completed !== true);
  const lo   = String(vowName ?? "").trim().toLowerCase();
  let primary = rollerVowEntry(all, lo, { actorId, itemId });
  const completedMatch = (score) => !!lo && all.some(e =>
    e.item.system?.completed === true && vowNameMatch(e, lo) >= score);
  if (!primary && lo) {
    primary = open.find(e => vowNameMatch(e, lo) === 2) ?? null;
    // An exact name for a vow that is already completed outranks a substring
    // match on another open vow: fulfilling "Find the ship" completes it
    // first, and the substring rung used to resolve the open "Find the ship's
    // captain" instead (payFulfilledVowNative's all-copies fallback then
    // finds the completed vow by its exact name).
    if (!primary && !completedMatch(2)) {
      primary = open.find(e => vowNameMatch(e, lo) === 1) ?? null;
    }
  }
  if (!primary && open.length === 1 && !completedMatch(1)) primary = open[0];
  if (!primary) return { primary: null, copies: [] };
  return { primary, copies: collectVowCopies(all, primary) };
}

// The roller's vow entry for resolveVowItemCopies: the scored Item by id (the
// roller's copy when several PCs carry the id — a duplicated actor keeps its
// items' ids), else the roller's exact-name vow, open before completed.
function rollerVowEntry(all, lo, { actorId = null, itemId = null } = {}) {
  if (typeof itemId === "string" && itemId) {
    const byId = all.filter(e => e.item.id === itemId);
    const hit  = byId.find(e => e.actor?.id === actorId) ?? byId[0] ?? null;
    if (hit) return hit;
  }
  if (!actorId || !lo) return null;
  const own = all.filter(e => e.actor?.id === actorId && vowNameMatch(e, lo) === 2);
  return own.find(e => e.item.system?.completed !== true) ?? own[0] ?? null;
}

// Name-ladder score of a vow entry against a lowercased target: 2 exact,
// 1 substring (either way), 0 no match.
function vowNameMatch(entry, lo) {
  const n = (entry.item.name ?? "").trim().toLowerCase();
  if (!n || !lo) return 0;
  if (n === lo) return 2;
  return (n.includes(lo) || lo.includes(n)) ? 1 : 0;
}

// Every PC's vow Items, as { actor, item } entries (completed ones included).
function collectPlayerVowItems() {
  const all = [];
  for (const actor of getPlayerActors()) {
    const items = actor.items?.contents ?? (Array.isArray(actor.items) ? actor.items : []);
    for (const item of items) {
      if (item?.type === "progress" && item.system?.subtype === "vow") all.push({ actor, item });
    }
  }
  return all;
}

// Every copy of `primary`'s vow across PCs — by the shared vowId flag when
// present, else by the item's exact name.
function collectVowCopies(all, primary) {
  const vowId = primary.item.flags?.[MODULE_ID]?.vowId ?? null;
  const primaryName = (primary.item.name ?? "").toLowerCase();
  return all.filter(e =>
    vowId
      ? e.item.flags?.[MODULE_ID]?.vowId === vowId
      : (e.item.name ?? "").toLowerCase() === primaryName);
}

// GM-side: deliver the linked vow's promised concrete reward (#241 Phase 2) when
// the fight is won, scaled by the outcome. One-time — the reward's status flips
// from "promised" so a re-win can't re-grant it. `noteIfAbsent` (the fulfil
// path sets it) posts a visible note when NO reward was ever chosen — the
// reward-choice card was ignored at swear time — so a reward-less fulfilment
// stops being a silent mystery. Win-path calls leave it off (a fight can
// legitimately precede the reward pick).
//
// The reward goes to the PC that holds the vow — the roller's copy when they
// hold one (`actorId`), else the copy carrying the promised reward — never
// blindly the first PC (credit the roller). `copies` lets the fulfil payoff
// pass the copies it already resolved: by then the vow is completed, and
// resolveVowItemCopies only resolves OPEN vows, so a fresh lookup found
// nothing and the promised reward was never granted.
async function grantLinkedVowReward(vowName, outcome, { noteIfAbsent = false, actorId = null, copies: knownCopies = null } = {}) {
  const copies = Array.isArray(knownCopies) && knownCopies.length
    ? knownCopies
    : resolveVowItemCopies(vowName, { actorId }).copies;
  let reward = null, vowId = null, anyRewardFlag = false, rewardHolder = null;
  for (const { actor, item } of copies) {
    const r = item?.flags?.[MODULE_ID]?.reward;
    if (r) anyRewardFlag = true;
    if (r?.status === "promised") { reward = r; vowId = item.flags[MODULE_ID].vowId; rewardHolder = actor ?? null; break; }
  }
  if (!reward) {
    if (noteIfAbsent && copies.length && !anyRewardFlag) {
      await ChatMessage.create({
        content: `<div class="sf-ptp-card"><p>ℹ No concrete reward was chosen when this vow was sworn (the reward-choice card was never answered), so none is granted with its fulfilment.</p></div>`,
        flags:   { [MODULE_ID]: { rewardAbsentNote: true, vowName: vowName ?? null } },
      }).catch(err => console.warn(`${MODULE_ID} | reward-absent note failed:`, err?.message ?? err));
    }
    return;
  }

  const plan = planRewardGrant(reward, outcome);
  const rollerCopy = actorId ? copies.find(({ actor }) => actor?.id === actorId) : null;
  const pc   = rollerCopy?.actor ?? rewardHolder ?? getPlayerActors()[0] ?? null;
  if (plan.status === "granted" && pc) {
    if (plan.form === "supply" || plan.form === "momentum") {
      await applyMeterChanges(pc, { [plan.form]: plan.amount ?? 1 }).catch(err =>
        console.warn(`${MODULE_ID} | grant reward meter failed:`, err?.message ?? err));
    } else {
      await recordGrantedReward(pc, reward).catch(err =>
        console.warn(`${MODULE_ID} | grant reward record failed:`, err?.message ?? err));
    }
  }
  if (vowId) await setSharedVowReward(vowId, { ...reward, status: plan.status }).catch(() => {});
  await postRewardGrantCard(reward, plan).catch(err =>
    console.warn(`${MODULE_ID} | reward grant card failed:`, err?.message ?? err));
}

async function postRewardGrantCard(reward, plan) {
  const note = plan.withString
    ? ' <em>(with a string — the narrator will introduce a complication)</em>'
    : plan.amount ? ` <em>(+${plan.amount} ${plan.form})</em>` : "";
  const body = plan.status === "granted"
    ? `🎁 Reward earned: <strong>${escapeChatHtml(reward.description)}</strong>${note}`
    : `Reward lost: <strong>${escapeChatHtml(reward.description)}</strong> slipped away.`;
  await ChatMessage.create({
    content: `<div class="sf-card sf-reward-grant"><div class="sf-card-body"><p>${body}</p></div></div>`,
    flags:   { [MODULE_ID]: { rewardGrantCard: true } },
  });
}

// Native payoffs (a vow's fulfilment, a bond's forging) being paid on this
// client — claimed synchronously so two that arrive together pay once.
const _nativePayoffsInFlight = new Set();

// #248 B2: a fulfilled vow pays its linked connection (deepen, scaled by the
// vow's rank) and grants its promised reward (scaled by outcome). Item vows
// (inciting / hand-made) are fulfilled on the foundry-ironsworn sheet, which
// bypasses the journal-track fulfill branch AND never touches our legacy tracks,
// so this also marks the Quests legacy. GM-side (world writes); idempotent per
// vow via the fulfilPaid flag. Exported for unit testing.
//
// `actorId` is the roller; `itemId` the vow Item the roll scored (the
// pipeline knows it). The roller's own vow — open or already completed — is
// the one paid, before any other PC's vow of the same name (issue #301 B02:
// another PC's independent, still-open "Background Vow" took the stamp, the
// reward, the legacy rank and the connection deepen).
export async function payFulfilledVowNative(vowName, outcome, { skipLegacy = false, actorId = null, itemId = null } = {}) {
  // vowId-first resolution with a name ladder — a renamed vow or stale
  // linkedVowName snapshot still resolves (VOW-RENAME-PAYOFF). The completed
  // filter is bypassed here: the vendor sheet — or the pipeline's
  // completeVowItemByName — may have already marked the copies completed
  // before this payoff runs, so fall back to searching ALL copies with the
  // same name ladder (exact, then substring), preferring the roller's, and
  // then collect EVERY PC's copy of that vow (by vowId, else name).
  // Collecting only the first PC's copy made a shared vow's reward land on the
  // first PC instead of the roller.
  let { primary, copies } = resolveVowItemCopies(vowName, { actorId, itemId });
  if (!primary) {
    const lo  = String(vowName ?? "").trim().toLowerCase();
    const all = collectPlayerVowItems();
    const exact = all.filter(e => vowNameMatch(e, lo) === 2);
    const named = exact.length ? exact : all.filter(e => vowNameMatch(e, lo) === 1);
    primary = (actorId ? named.find(e => e.actor?.id === actorId) : null) ?? named[0] ?? null;
    copies  = primary ? collectVowCopies(all, primary) : [];
  }
  const item = primary?.item ?? null;
  if (!item) {
    console.debug(`${MODULE_ID} | native-fulfil: no vow item named "${vowName ?? "?"}" — no payoff`);
    return;
  }
  // Pay once per vow — checked and stamped across EVERY copy, so the
  // bookkeeping survives any single copy being deleted or renamed (it used
  // to live only on the first-matched copy).
  const allCopies = copies?.length ? copies : [primary];
  if (allCopies.some(({ item: i }) => i.flags?.[MODULE_ID]?.fulfilPaid)) return;
  // Claimed before the first await (issue #306 R04). The paid flag lands only
  // when its write returns, so two fulfilments of one vow arriving together —
  // a duplicate sheet roll — both passed the check above and both paid:
  // twice the legacy, and the XP of any box it filled. The payoff runs on the
  // canonical GM only, so a claim on this client covers the table.
  const claim = `vow:${item.flags?.[MODULE_ID]?.vowId ?? allCopies.map(c => c.item.id).sort().join(",")}`;
  if (_nativePayoffsInFlight.has(claim)) {
    console.debug(`${MODULE_ID} | native-fulfil: "${item.name}" is already being paid — not paid twice.`);
    return;
  }
  _nativePayoffsInFlight.add(claim);
  try {
    await payFulfilledVowCopies(item, allCopies, vowName, outcome, { skipLegacy, actorId });
  } finally {
    _nativePayoffsInFlight.delete(claim);
  }
}

/** payFulfilledVowNative's payoff, once its claim is held. */
async function payFulfilledVowCopies(item, allCopies, vowName, outcome, { skipLegacy, actorId }) {
  for (const { item: i } of allCopies) {
    await i.setFlag?.(MODULE_ID, "fulfilPaid", true).catch(() => {});
  }

  const rank      = item.system?.rank ?? null;
  const ranksDown = outcome === "weak_hit" ? 1 : 0;

  // Quests legacy — the vendor's native fulfil doesn't credit our legacy tracks.
  // skipLegacy: the pipeline fulfil branch pays legacy on its own campaignState
  // object (persisted once at pipeline end) and passes true so this fresh
  // read-modify-write can't race/clobber that persist.
  if (!skipLegacy) {
    try {
      const ticks = legacyRewardTicks(rank, ranksDown);
      if (ticks > 0) {
        // A copy (legacy tracks included): get() returns the cached value,
        // which a refused write must leave as it was (rules/foundry-api.md).
        const stored = game.settings.get(MODULE_ID, "campaignState") ?? {};
        const cs = { ...stored, legacyTracks: foundry.utils.deepClone(stored.legacyTracks ?? {}) };
        addLegacyTicks(cs, "quests", ticks);
        await game.settings.set(MODULE_ID, "campaignState", cs);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | native-fulfil: legacy award failed:`, err?.message ?? err);
    }
  }

  // Deepen the linked connection (scaled by the vow's rank).
  const connectionName = item.flags?.[MODULE_ID]?.linkedConnectionName ?? null;
  if (connectionName) {
    await deepenLinkedConnection(connectionName, marksForSourceRank(rank)).catch(err =>
      console.warn(`${MODULE_ID} | native-fulfil: deepen connection failed:`, err?.message ?? err));
  }

  // Grant the promised reward (one-time; scaled by outcome). The fulfil path
  // surfaces a note when no reward was ever chosen.
  await grantLinkedVowReward(vowName, outcome, { noteIfAbsent: true, actorId, copies: allCopies }).catch(err =>
    console.warn(`${MODULE_ID} | native-fulfil: grant reward failed:`, err?.message ?? err));
}

// GM-side: mark every copy of the resolved vow completed (shared vows exist
// as one copy per PC; copies collect by vowId, so a renamed copy still
// closes — VOW-RENAME-PAYOFF). Pipeline Fulfill Your Vow companion to
// actorBridge.completeVowItem. Returns { name, rank } of the resolved vow,
// or null when nothing matched. `actorId` / `itemId` (the roller, the scored
// Item) resolve the roller's own vow first — another PC's same-named vow used
// to be the one completed (issue #301 B02).
async function completeVowItemByName(vowName, { actorId = null, itemId = null } = {}) {
  const { primary, copies } = resolveVowItemCopies(vowName, { actorId, itemId });
  if (!primary) return null;
  let anyDone = false;
  for (const { actor, item } of copies) {
    if (item.system?.completed === true) continue;
    const done = await completeVowItem(actor, item.id).catch(err => {
      console.warn(`${MODULE_ID} | completeVowItemByName failed:`, err?.message ?? err);
      return false;
    });
    anyDone = anyDone || done;
  }
  return anyDone ? { name: primary.item.name, rank: primary.item.system?.rank ?? null } : null;
}

// GM-gated companion to registerNativeProgressRollHook: when a vow is fulfilled
// via the native foundry-ironsworn sheet roll, apply the module payoff (legacy +
// connection deepen + promised reward). Narration is handled separately, on the
// roller's keyed client; this runs on the canonical GM (world writes), reading
// the same broadcast roll card. Fail-safe + logs every skip (decisions.md).
function registerNativeFulfilConsequenceHook() {
  if (registerNativeFulfilConsequenceHook._installed) return;
  registerNativeFulfilConsequenceHook._installed = true;
  Hooks.on("createChatMessage", (message) => {
    try {
      if (!isCanonicalGM()) return;
      const parsed = parseIronswornProgressRoll(message?.content ?? "");
      if (!parsed) return;
      const moveId = classifyProgressRoll(parsed, (source) => {
        try {
          const actor = message?.speaker?.actor ? game.actors?.get(message.speaker.actor) : null;
          const src   = String(source ?? "").trim().toLowerCase();
          if (!actor || !src) return null;
          const it = actor.items?.find?.(i =>
            i?.type === "progress" && String(i?.name ?? "").trim().toLowerCase() === src);
          const subtype = String(it?.system?.subtype ?? "").toLowerCase();
          if (subtype.includes("vow"))        return "vow";
          // The module (and vendor Connections tab) store connection progress
          // items as subtype "bond" — accept both spellings.
          if (subtype.includes("connection") || subtype.includes("bond")) return "connection";
          return null;
        } catch (err) {
          console.warn(`${MODULE_ID} | native-fulfil: subtype lookup threw:`, err?.message ?? err);
          return null;
        }
      });
      if (shouldPayFulfilledVow({ moveId, outcome: parsed.outcome })) {
        // The sheet roll's speaker is the PC who rolled — their copy gets the reward.
        payFulfilledVowNative(parsed.source, parsed.outcome, {
          actorId: typeof message?.speaker?.actor === "string" ? message.speaker.actor : null,
        }).catch(err =>
          console.warn(`${MODULE_ID} | native-fulfil consequence failed:`, err?.message ?? err));
      } else if (shouldForgeBond({ moveId, outcome: parsed.outcome })) {
        // BOND-NATIVE-FORGE fix — a Forge a Bond rolled on the vendor sheet
        // used to narrate only; the record kept bonded:false and no legacy.
        payForgedBondNative(parsed.source).catch(err =>
          console.warn(`${MODULE_ID} | native-forge consequence failed:`, err?.message ?? err));
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | native-fulfil consequence hook threw:`, err?.message ?? err);
    }
  });
}

// GM-side companion to registerNativeFulfilConsequenceHook for Forge a Bond:
// flip the record to bonded and pay the rank-scaled bonds legacy, exactly as
// the pipeline forgeABond branch does. Idempotent — an already-bonded
// connection pays nothing (the bond can only forge once). Exported for unit
// testing.
export async function payForgedBondNative(connectionName) {
  let claim = null;
  try {
    const conn = await import("./entities/connection.js");
    const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
    const connections = (campaignState.connectionIds ?? [])
      .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
      .filter(Boolean);
    const target = selectConnection(connections, connectionName ?? null);
    if (!target?.__hostId) {
      console.debug(`${MODULE_ID} | native-forge: no connection matched "${connectionName ?? "?"}" — no payoff.`);
      return;
    }
    if (target.bonded) return; // pay once — the bond can only forge once
    // Claimed before the first await, as payFulfilledVowNative does: two
    // rolls arriving together both found the bond unforged and both paid the
    // bonds legacy (issue #306 R04's sibling).
    if (_nativePayoffsInFlight.has(`bond:${target.__hostId}`)) {
      console.debug(`${MODULE_ID} | native-forge: "${target.name ?? connectionName}" is already being forged — not paid twice.`);
      return;
    }
    claim = `bond:${target.__hostId}`;
    _nativePayoffsInFlight.add(claim);

    await conn.forgeBond(target.__hostId);
    const ticks = legacyRewardTicks(target.rank, 0);
    if (ticks > 0) {
      // Read after the await and written as a copy: the snapshot above may
      // be stale by now, and a refused write must leave the cache as it was.
      const stored = game.settings.get(MODULE_ID, "campaignState") ?? {};
      const cs = { ...stored, legacyTracks: foundry.utils.deepClone(stored.legacyTracks ?? {}) };
      addLegacyTicks(cs, "bonds", ticks);
      await game.settings.set(MODULE_ID, "campaignState", cs);
    }
    await postForgeABondCard(target, ticks).catch(err =>
      console.warn(`${MODULE_ID} | native-forge card failed:`, err?.message ?? err));
  } catch (err) {
    console.warn(`${MODULE_ID} | native-forge payoff failed:`, err?.message ?? err);
  } finally {
    if (claim) _nativePayoffsInFlight.delete(claim);
  }
}

// Wire the won-fight card's buttons (wireFightVowButtons) on every render.
function registerFightVowMilestoneHook() {
  if (registerFightVowMilestoneHook._installed) return;
  registerFightVowMilestoneHook._installed = true;
  onChatMessageRender((message, root) => wireFightVowButtons(message, root));
}

/**
 * Wire the won-fight card's buttons. "⚑ Mark milestone" and "🤝 Deepen your
 * bond" are one-shot GM-gated world writes: a click relays to the canonical GM
 * ("fightVow.markMilestone" / "fightVow.deepenBond" →
 * src/moves/cardActions.js), which applies the card's own values once and
 * stamps `resolvedActions.<action>`; an action already applied renders
 * disabled, and a click that is not delivered (no GM) re-arms its button.
 * "🏁 Attempt to Fulfill" posts the existing fulfill_your_vow bridge (the
 * pipeline handles it).
 *
 * Exported for unit testing.
 */
export function wireFightVowButtons(message, root) {
  const f = message?.flags?.[MODULE_ID];
  if (!f?.fightVowCard) return;

  const wireRelay = (dataAction, kind, action) => {
    const btn = root?.querySelector?.(`[data-action="${dataAction}"]`);
    if (!btn) return;
    if (f.resolvedActions?.[action]) {
      btn.disabled = true;
      return;
    }
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener("click", async (event) => {
      event.preventDefault(); event.stopPropagation();
      fresh.disabled = true;
      await relayCardAction({
        kind,
        payload:    { messageId: message?.id ?? null },
        isResolved: () => !!liveCardFlags(message)?.resolvedActions?.[action],
        restore:    () => { fresh.disabled = false; },
      });
    });
  };

  wireRelay("sf-mark-milestone", "fightVow.markMilestone", "markMilestone");
  wireRelay("sf-deepen-bond",    "fightVow.deepenBond",    "deepenBond");

  const fulfilBtn = root?.querySelector?.('[data-action="sf-fulfill-vow"]');
  if (fulfilBtn) {
    const fresh = fulfilBtn.cloneNode(true);
    fulfilBtn.replaceWith(fresh);
    fresh.addEventListener("click", async (event) => {
      event.preventDefault(); event.stopPropagation();
      fresh.disabled = true;
      await ChatMessage.create({
        content: "Attempt to fulfill your vow.",
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "fulfill_your_vow", forcedMoveTarget: f.vowName ?? null } },
      }).catch(err =>
        console.warn(`${MODULE_ID} | fight-vow action failed:`, err?.message ?? err));
    });
  }
}

// The live module flags of a rendered card — the ChatMessage in game.messages
// carries the latest update (e.g. a resolved stamp written by the GM).
function liveCardFlags(message) {
  const live = message?.id ? (game.messages?.get?.(message.id) ?? null) : null;
  return (live ?? message)?.flags?.[MODULE_ID] ?? null;
}

async function postCombatTrackCard({ track, created }) {
  const label = escapeChatHtml(track?.label ?? "Combat");
  const rank  = track?.rank ? ` (${track.rank})` : "";
  const body  = created
    ? `Created combat track <strong>${label}</strong>${rank}. This fight's progress lives in the Progress Tracks panel.`
    : `Resumed combat track <strong>${label}</strong>${rank}.`;
  // Battle is the alternative to the blow-by-blow track: one roll resolves the
  // whole fight (and ends this track via endCombat). Only offered when the
  // track is freshly established — once progress is on the track, the player
  // has already committed to the blow-by-blow.
  const battleBtn = created
    ? ` <button type="button" data-action="sf-battle" class="entity-btn" title="Resolve the entire fight with a single roll instead of the blow-by-blow track">⚔ Battle instead</button>`
    : "";
  const battleHint = created
    ? `<p class="sf-card-hint">Prefer to settle it in one stroke? <strong>Battle</strong> resolves the whole fight with a single roll instead of marking the track move by move.</p>`
    : "";
  // Stakes up front (#241): how the fight advances, its objective, and the vow
  // it serves (winning is a milestone on that vow).
  const objLine = track?.objective
    ? `<p class="sf-stakes"><strong>Objective:</strong> ${escapeChatHtml(track.objective)}</p>` : "";
  const vowLine = track?.linkedVowName
    ? `<p class="sf-stakes"><em>Winning this fight is a milestone on your vow: &ldquo;${escapeChatHtml(track.linkedVowName)}&rdquo;.</em></p>` : "";
  const stakesLine = `<p class="sf-stakes"><em>${escapeChatHtml(progressPerMilestoneLine(track?.rank ?? "dangerous"))}</em></p>`;
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>Enter the Fray</strong><p>${body}</p>`
        + objLine + vowLine + stakesLine
        + `<p><button type="button" data-action="openProgressTracks" class="entity-btn">⊕ Open Progress Tracks</button>${battleBtn}</p>`
        + battleHint
        + `</div>`,
      // trackId / trackLabel: Battle forwards them as forcedMoveTargetId /
      // forcedMoveTarget, so it ends this fight while another is open.
      flags:   { [MODULE_ID]: { combatTrackCard: true, created, trackId: track?.id ?? null, trackLabel: track?.label ?? null } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postCombatTrackCard: chat post failed:`, err?.message ?? err);
  }
}

async function postCombatProgressCard({ track, marksApplied }) {
  const label = escapeChatHtml(track?.label ?? "Combat");
  const times = marksApplied === 1 ? "once" : `${marksApplied} times`;
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>Combat progress</strong><p>Marked progress ${times} on <strong>${label}</strong>.</p></div>`,
      flags:   { [MODULE_ID]: { combatProgressCard: true, marksApplied } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postCombatProgressCard: chat post failed:`, err?.message ?? err);
  }
}

async function postDevelopRelationshipCard(plan) {
  const name = escapeChatHtml(plan?.connection?.name || "your connection");
  let body;
  if (plan.action === "bond-legacy") {
    body = plan.ticks > 0
      ? `Marked ${plan.ticks} tick${plan.ticks === 1 ? "" : "s"} on your bonds legacy track for your bond with <strong>${name}</strong>.`
      : `No bonds legacy progress with <strong>${name}</strong> this time.`;
    if (plan.raiseRank && plan.newRank) {
      body += ` Match — ${name}'s rank rises to <strong>${escapeChatHtml(plan.newRank)}</strong>.`;
    }
  } else {
    body = `Marked progress on your relationship with <strong>${name}</strong>.`;
  }
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>Develop Your Relationship</strong><p>${body}</p></div>`,
      flags:   { [MODULE_ID]: { developRelationshipCard: true, action: plan.action } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postDevelopRelationshipCard: chat post failed:`, err?.message ?? err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reach a Milestone — mark progress on the target vow per its rank.
// Shared by the pipeline handler (the reach_a_milestone move) and the
// result-card suggestion button. GM-gated writes inherited via markVowProgress.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve and mark a Reach a Milestone for the given actor. `target` is the
 * optional named vow (interpretation.moveTarget); null lets planReachMilestone
 * auto-select the sole open vow or, when several are open, post a picker card.
 *
 * @param {Actor|null} actor
 * @param {string|null} target
 */
async function applyReachMilestone(actor, target, marks = 1) {
  // GM-only: vow Item writes are GM-gated (PERSIST-001), and the result card
  // must not claim progress on a client that can't write. In solo-GM play the
  // player is the GM, so this is the normal path. `marks` > 1 applies a major
  // milestone (a won fight scaled by its rank — #241); shared-vow copies on the
  // other PCs are kept in lockstep by the updateItem sync hook.
  if (!actor || !game.user?.isGM) {
    console.debug(`${MODULE_ID} | reach a milestone: ${actor ? "not a GM client" : "no player character"} — nothing marked.`);
    return;
  }
  const plan = planReachMilestone(readVows(actor), target);
  if (plan.action === "mark") {
    const ticks = plan.ticks * Math.max(1, Math.floor(marks) || 1);
    await markVowProgress(actor, plan.vow.id, ticks);
    await postReachMilestoneCard(plan.vow, ticks);
  } else if (plan.action === "pick") {
    await postMilestonePickerCard(plan.vows, actor.id);
  }
  // action "none" → no open vow to mark; the move card's otherEffect already
  // tells the player Reach a Milestone marks vow progress.
}

/**
 * Post a picker when several vows are open and none was named. Each button
 * relays one vow to the canonical GM (wireMilestonePickerButtons →
 * milestone.pick → src/moves/milestonePicker.js applyMilestonePick).
 */
async function postMilestonePickerCard(vows, actorId) {
  const rows = (vows ?? []).map(v =>
    `<button type="button" class="sf-followup-btn" data-action="sf-milestone-pick" ` +
    `data-vow-id="${escapeChatHtml(v.id ?? "")}" data-actor-id="${escapeChatHtml(actorId ?? "")}">` +
    `${escapeChatHtml(v.name || "vow")} <em>(${escapeChatHtml(v.rank ?? "")})</em></button>`,
  ).join("");
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>⚑ Reach a Milestone</strong>` +
        `<p>Which vow advances?</p><div class="sf-milestone-picker">${rows}</div></div>`,
      // choices: what the GM-side "milestone.pick" handler validates a relayed
      // click against (src/moves/milestonePicker.js applyMilestonePick).
      flags:   { [MODULE_ID]: {
        milestonePicker: true, resolved: false,
        choices: (vows ?? []).map(v => ({ vowId: v.id ?? "", actorId: actorId ?? "" })),
      } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postMilestonePickerCard: chat post failed:`, err?.message ?? err);
  }
}

/**
 * Post a picker card listing active connections so the player can choose which
 * one to develop or attempt to bond with. action is "develop" | "forge".
 * Forge shows only unbonded connections; develop shows all active ones.
 */
async function postConnectionPickerCard(connections, action) {
  const eligible = action === "forge"
    ? connections.filter(c => !c.bonded)
    : connections;
  if (!eligible.length) return;
  const label = action === "develop" ? "🤝 Develop Relationship" : "🔗 Forge a Bond";
  const rows = eligible.map(c =>
    `<button type="button" class="sf-followup-btn" data-action="sf-connection-pick" ` +
    `data-host-id="${escapeChatHtml(c.__hostId ?? "")}" ` +
    `data-pick-action="${escapeChatHtml(action)}" ` +
    `data-connection-name="${escapeChatHtml(c.name ?? "")}">` +
    `${escapeChatHtml(c.name || "connection")} <em>(${escapeChatHtml(c.rank ?? "")})</em></button>`,
  ).join("");
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>${label}</strong>` +
        `<p>Which connection?</p><div class="sf-milestone-picker">${rows}</div></div>`,
      // choices: what the GM-side "connection.pick" handler validates a
      // relayed click against (src/moves/cardActions.js).
      flags: { [MODULE_ID]: {
        connectionPicker: true, pickAction: action, resolved: false,
        choices: eligible.map(c => ({ hostId: c.__hostId ?? "", name: c.name ?? "" })),
      } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postConnectionPickerCard: chat post failed:`, err?.message ?? err);
  }
}

async function postCombatFinishCard({ track }) {
  const label = escapeChatHtml(track?.label ?? "Combat");
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>Fight over</strong><p><strong>${label}</strong> marked complete.</p></div>`,
      flags:   { [MODULE_ID]: { combatFinishCard: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postCombatFinishCard: chat post failed:`, err?.message ?? err);
  }
}

async function postDecisiveActionCostCard(actorId = null) {
  const { rollOracle } = await import("./oracles/roller.js");
  let result;
  try {
    result = rollOracle("decisive_action_cost");
  } catch (err) {
    console.warn(`${MODULE_ID} | decisive_action_cost roll failed:`, err);
    return;
  }
  void showD100(result.roll);   // 3D dice for the d100 (fire-and-forget, fail-open)
  const routeFooter = result.sufferRoute
    ? `<p><em>Triggers: choose a suffer move (-${result.sufferRoute.amount}).</em></p>`
    : "";
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>Decisive Action — Cost</strong><p>d100 = <strong>${result.roll}</strong> · ${escapeChatHtml(result.result)}</p>${routeFooter}</div>`,
      flags:   { [MODULE_ID]: { decisiveActionCostCard: true, sufferRoute: result.sufferRoute ?? null } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postDecisiveActionCostCard: chat post failed:`, err?.message ?? err);
    return;
  }
  if (result.sufferRoute) {
    await dispatchPayThePriceSufferRoute(result.sufferRoute, actorId).catch(err =>
      console.warn(`${MODULE_ID} | decisive action cost suffer dispatch failed:`, err?.message ?? err));
  }
}

async function postFaceDefeatPayThePriceCard(actorId = null) {
  const { rollOracle } = await import("./oracles/roller.js");
  let result;
  try {
    result = rollOracle("pay_the_price");
  } catch (err) {
    console.warn(`${MODULE_ID} | face defeat pay_the_price roll failed:`, err);
    return null;
  }
  void showD100(result.roll);   // 3D dice for the d100 (fire-and-forget, fail-open)
  const routeFooter = result.sufferRoute
    ? `<p><em>Routes to ${escapeChatHtml(result.sufferRoute.move)} (-${result.sufferRoute.amount}).</em></p>`
    : "";
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>Pay the Price</strong><p>d100 = <strong>${result.roll}</strong> · ${escapeChatHtml(result.result)}</p>${routeFooter}</div>`,
      flags:   {
        [MODULE_ID]: {
          payThePriceCard: true,
          sufferRoute:     result.sufferRoute ?? null,
          oracleMemory:    { name: "Pay the Price", question: "Face Defeat", answer: result.result },
        },
      },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postFaceDefeatPayThePriceCard: chat post failed:`, err?.message ?? err);
    return null;
  }

  // Dispatch suffer executor first (before clock advance) so meter changes land
  // before the burn button is visible. Track which route fired so the burn
  // reversal can undo only what was actually applied.
  let sufferMeterDelta = null;
  if (result.sufferRoute) {
    await dispatchPayThePriceSufferRoute(result.sufferRoute, actorId).catch(err =>
      console.warn(`${MODULE_ID} | face defeat PtP suffer dispatch failed:`, err?.message ?? err));
    // Only track simple PC-meter routes; withstand_damage / companion_takes_a_hit
    // affect vehicle/companion stats and are excluded from auto-reversal.
    const { move, amount } = result.sufferRoute;
    const REVERSIBLE = { endure_harm: "health", endure_stress: "spirit", sacrifice_resources: "supply", lose_momentum: "momentum" };
    if (REVERSIBLE[move]) {
      sufferMeterDelta = { move, amount: amount ?? 1, meterKey: REVERSIBLE[move] };
    }
  }

  const clocksAdvanced = await advanceClocksOnPayThePrice().catch(err => {
    console.warn(`${MODULE_ID} | face defeat PtP clock advance failed:`, err?.message ?? err);
    return [];
  });

  requestOracleNarration({
    kind:           "pay_the_price",
    oracleName:     "Pay the Price",
    question:       "Face Defeat",
    rolledLine:     `d100 = ${result.roll} → ${result.result}`,
    speakerActorId: actorId,
  });

  return { clocksAdvanced: clocksAdvanced ?? [], sufferMeterDelta };
}

async function postForsakeVowCard(vowName) {
  try {
    await ChatMessage.create({
      content: `<div class="sf-card sf-card--vow-forsaken"><div class="sf-card-header">⛓ Vow Forsaken: ${escapeHtml(vowName ?? "vow")}</div><div class="sf-card-body"><p>The vow is struck. Envision the fallout — the iron remembers. Any promised reward is lost; resolve the costs on the choice card.</p></div></div>`,
      flags: { [MODULE_ID]: { forsakeVowCard: true, vowName: vowName ?? null } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postForsakeVowCard: chat post failed:`, err?.message ?? err);
  }
}

async function postFulfillVowCard({ track, legacyTicks }) {
  const rankLabel = track.rank ? track.rank.charAt(0).toUpperCase() + track.rank.slice(1) : "unknown";
  try {
    await ChatMessage.create({
      content: `<div class="sf-card sf-card--vow-fulfilled"><div class="sf-card-header">⚑ Vow Fulfilled: ${escapeHtml(track.label ?? "vow")}</div><div class="sf-card-body"><p>The <strong>${rankLabel}</strong> vow is complete. Quests legacy track: <strong>+${legacyTicks} tick${legacyTicks !== 1 ? "s" : ""}</strong> marked.</p></div></div>`,
      flags: { [MODULE_ID]: { fulfillVowCard: true, trackLabel: track.label, legacyTicks } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postFulfillVowCard: chat post failed:`, err?.message ?? err);
  }
}

async function postForgeABondCard(connection, legacyTicks) {
  const nameLabel = connection.name ?? "connection";
  const rankLabel = connection.rank ? connection.rank.charAt(0).toUpperCase() + connection.rank.slice(1) : "unknown";
  try {
    await ChatMessage.create({
      content: `<div class="sf-card sf-card--forge-bond"><div class="sf-card-header">⚑ Bond Forged: ${escapeHtml(nameLabel)}</div><div class="sf-card-body"><p>${escapeHtml(nameLabel)} is now bonded. Bonds legacy track: <strong>+${legacyTicks} tick${legacyTicks !== 1 ? "s" : ""}</strong> marked (${rankLabel} rank).</p><p class="sf-stakes"><em>${escapeHtml(progressPerMilestoneLine(connection.rank ?? "dangerous"))}</em></p><p><em>Choose: <strong>Bolster Influence</strong> (add +2) or <strong>Expand Influence</strong> (second role, add +1).</em></p></div></div>`,
      flags: { [MODULE_ID]: { forgeABondCard: true, connectionName: nameLabel, legacyTicks } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postForgeABondCard: chat post failed:`, err?.message ?? err);
  }
}

/**
 * F16 Phase E: dispatch a Pay-the-Price sufferRoute annotation into the
 * suffer executors. `soloFallback` swaps the route when the rolled entry
 * says "companion in harm's way" but the PC has no companion asset —
 * routes to Endure Harm instead. The dialog (Phase D) lets the GM modify
 * the magnitude before dispatch; if no dialog is available (test env or
 * no-app-v2), the default -1 magnitude fires directly.
 *
 * Credit the roller (decisions.md → "Multiplayer attribution"): the harm lands
 * on `actorId` — the PC whose move missed / who typed `!ptp` — with the first
 * PC only as the fallback when no speaker resolved.
 *
 * @param {{ move: string, amount: number, soloFallback?: string }} route
 * @param {string|null} [actorId]
 */
async function dispatchPayThePriceSufferRoute(route, actorId = null) {
  const { executeSuffer } = await import("./moves/sufferExecutor.js");

  const actor = (actorId ? game.actors?.get?.(actorId) : null) ?? getPlayerActors()[0] ?? null;
  if (!actor) {
    console.warn(`${MODULE_ID} | dispatchPayThePriceSufferRoute: no active character`);
    return;
  }

  // "any" means "player chooses which suffer move" — post the non-blocking B1
  // picker card (never a blocking dialog; see sufferCard.js).
  if (route.move === "any") {
    const { postSufferChoiceCard } = await import("./moves/sufferCard.js");
    await postSufferChoiceCard({
      sufferPrompt: { kind: "any", amount: route.amount ?? 2, count: 1 },
      actor,
      executorOpts: { isMiss: true },
    });
    return;
  }

  // companion_takes_a_hit needs an item id. If the PC has a companion
  // asset, surface it; otherwise fall back to Endure Harm (the "you are,
  // if alone" branch in the entry text).
  let move = route.move;
  let itemId = null;
  if (move === "companion_takes_a_hit") {
    const companion = actor.items?.find?.(i => i?.system?.category?.toLowerCase?.() === "companion");
    if (companion) {
      itemId = companion.id;
    } else if (route.soloFallback) {
      move = route.soloFallback;
    }
  }

  return executeSuffer(move, actor, {
    amount: route.amount ?? 1,
    itemId,
    isMiss: true,  // Pay the Price always implies a miss context.
  });
}

/** !sever <name> — GM-only: mark a connection lost/severed (kept inactive). */
export function isSeverCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.severCommandCard) return false;
  return /^!sever(\s|$)/i.test(text);
}

// The missing severance affordance (2026-07 soft-spot cleanup): `active` was
// never set false by any flow, so a lost bond stayed narrator-visible forever.
// Uses connection.js loseConnection (active:false + flags cleared + history
// entry) — audit-preserving; the record is kept, not deleted.
async function handleSeverCommand(message) {
  if (!game.user?.isGM) {
    ui.notifications?.warn("!sever is GM-only (writes the connection record).");
    return;
  }
  const arg = (message.content?.trim() ?? "").slice("!sever".length).trim();
  const conn = await import("./entities/connection.js");
  const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
  const connections = (campaignState.connectionIds ?? [])
    .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
    .filter(Boolean);
  const target = selectConnection(connections, arg || null);
  if (!target?.__hostId) {
    ui.notifications?.warn(
      `Starforged Companion: no active connection matched "${arg || ""}"${arg ? "" : " — name the connection (!sever <name>) when several are active"}.`);
    return;
  }
  await conn.loseConnection(target.__hostId, "Severed (!sever).");
  await ChatMessage.create({
    content: `<div class="sf-card sf-sever-card"><div class="sf-card-header">💔 Connection severed: ${escapeChatHtml(target.name)}</div><div class="sf-card-body"><p>The relationship is lost. The record is kept (inactive) for the campaign history; the narrator stops treating them as an ally. Envision what this costs you.</p></div></div>`,
    flags:   { [MODULE_ID]: { severCommandCard: true, connectionName: target.name ?? null } },
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
    ["settlement", campaignState?.settlementIds ?? []],
    ["location",   campaignState?.locationIds   ?? []],
    ["planet",     campaignState?.planetIds     ?? []],
  ];

  // Two-pass match — exact name first, then prefix, then substring.
  // Reads go through the entity registry: settlements/locations/planets are
  // Actor-hosted post-migration, and the original journal-page read here
  // never matched them — `!at <settlement>` reported "not found" for every
  // sector-created place (v1.7.10 finding #5 fallout).
  const candidates = [];
  for (const [type, ids] of groups) {
    for (const id of ids) {
      try {
        const data = readEntityFlag(type, getEntityDocument(type, id));
        if (data?.name) {
          candidates.push({ id, type, entity: data, lc: data.name.toLowerCase() });
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | resolveCurrentLocationName: ${type} ${id} failed:`, err);
      }
    }
  }

  return candidates.find(c => c.lc === target)
      ?? candidates.find(c => c.lc.startsWith(target))
      ?? candidates.find(c => c.lc.includes(target))
      ?? null;
}

/**
 * Handle a programmatic !x (X-Card) message — one that reached
 * createChatMessage (a macro's ChatMessage.create, a socket-relayed post).
 * Typed `!x` never gets here: the chatMessage hook (settingsPanel.js) cancels
 * it before creation and raises the X-Card itself.
 *
 * Runs on the canonical GM only (chat routing, RUN_ON.CANONICAL_GM): it sets
 * the world-scoped xCardActive flag (suppressScene) and posts the X-Card card
 * once (postXCardCard, which carries the GM "Resume" button). With no GM
 * connected the routing warns the author instead — there is no author
 * fallback, since a player client cannot write the flag.
 */
async function handleXCardCommand(_message) {
  const recorded = await suppressScene();
  await postXCardCard({ recorded: recorded !== false, reason: "not-saved" });
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

  // Fact-continuity §20 — when ship positioning is enabled, treat the
  // GM's `!at` as "the party (and their ship) is here." Infer the
  // position from the same name the player typed and persist it on
  // the command vehicle.
  await maybeUpdateShipPositionFromName(arg, campaignState, "at_command");

  await ChatMessage.create({
    content: `<p>Current location set to <strong>${match.entity.name}</strong> (${match.type}).</p>`,
    flags:   { [MODULE_ID]: { atCommandCard: true } },
  });
}

/**
 * Update the command vehicle's persistent position from a free-text
 * destination name. Quietly no-ops when the feature is disabled or no
 * command vehicle is registered. Errors are logged at debug level —
 * a missed position write does not block the originating chat command
 * (`!at`, `set_a_course`) and does not throw into the pipeline.
 *
 * Exported so the move-resolution path and the future Token-drag
 * handler can both reach the same logic.
 */
export async function maybeUpdateShipPositionFromName(name, campaignState, source = "manual") {
  if (!getShipPositioningEnabled()) return null;
  const ref = typeof name === "string" ? name.trim() : "";
  if (!ref) return null;
  if (!game.user?.isGM) return null;            // world-scoped write — GM only

  try {
    const { getCommandVehicleActorId, updateShip } = await import("./entities/ship.js");
    // updateShip resolves by Actor id — the record's `_id` is a module GUID
    // and threw "Ship actor not found" on every write here (finding #5).
    const cvActorId = getCommandVehicleActorId(campaignState);
    if (!cvActorId) return null;
    const position = inferShipPosition(ref, campaignState, { source });
    await updateShip(cvActorId, { position });

    // Cluster C — the map follows the fiction: move the sector-scene Token
    // to the new position. The drag path already moved its own Token
    // (moveCommandVehicleTokenToDestination), so scene_token skips the sync.
    if (source !== "scene_token") {
      await syncCommandVehicleTokenToPosition(position, campaignState).catch(err =>
        console.debug?.(`${MODULE_ID} | shipPosition: token sync failed:`, err?.message ?? err));
    }
    return position;
  } catch (err) {
    console.debug?.(`${MODULE_ID} | shipPosition: update from "${ref}" failed:`, err?.message ?? err);
    return null;
  }
}

/**
 * Handle !sector chat commands (runs on the authoring client only).
 *   !sector            — usage (whispered to the typist)
 *   !sector new        — open the sector creator (GM only)
 *   !sector list       — list all created sectors
 *   !sector {name}     — switch active sector (GM only)
 */
async function handleSectorCommand(message) {
  const text  = message.content?.trim() ?? "";
  const parts = text.slice("!sector".length).trim().split(/\s+/);
  const sub   = parts[0]?.toLowerCase() ?? "";

  const campaignState = game.settings.get(MODULE_ID, "campaignState");

  // Bare `!sector` — show usage (SECTOR-SWITCH-001: it used to do nothing).
  // Whispered to the typist; it's help text, not table news.
  if (!sub) {
    await ChatMessage.create({
      content: "<p><strong>Sectors:</strong> <code>!sector list</code> — list sectors · " +
        "<code>!sector new</code> — create one (GM) · <code>!sector &lt;name&gt;</code> — switch the active sector (GM).</p>",
      flags:   { [MODULE_ID]: { sectorUsage: true } },
      whisper: game.user?.id ? [game.user.id] : [],
    });
    return;
  }

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

  // !sector {name} — switch active sector (GM only — writes campaignState).
  // SECTOR-SWITCH-001: a player's switch used to fall through silently.
  if (!game.user.isGM) {
    ui.notifications.warn("!sector <name> (switching the active sector) is GM-only.");
    return;
  }
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
}

/**
 * Handle the !shipmap command — build (or rebuild) the command vehicle's
 * deck-plan Scene with the 11 shipboard-combat stations pinned (Battle
 * Stations! mini-game Phase A). GM-only: Scene creation is a world write.
 *
 *   !shipmap          — create the deck plan (reports if one already exists)
 *   !shipmap rebuild  — delete the existing deck plan and generate a fresh one
 */
async function handleShipMapCommand(message) {
  if (!game.user?.isGM) {
    ui.notifications?.warn("Starforged Companion: !shipmap is available to GMs only.");
    return;
  }

  const text    = message.content?.trim() ?? "";
  const sub     = text.replace(/^!(shipmap|ship-map|deckplan)\s*/i, "").trim().toLowerCase();
  const rebuild = ["rebuild", "new", "regen", "regenerate"].includes(sub);

  const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
  const actor = getCommandVehicleActor(campaignState);
  if (!actor) {
    await ChatMessage.create({
      content: "<p>No command vehicle is registered yet. Create your starship first, then run <code>!shipmap</code>.</p>",
      flags:   { [MODULE_ID]: { shipMapCard: true } },
    });
    return;
  }

  const ship     = actor.flags?.[MODULE_ID]?.ship ?? {};
  const existing = findShipMapScene(actor.id);

  if (existing && !rebuild) {
    await ChatMessage.create({
      content: `<p><strong>${escapeHtml(actor.name)}</strong> already has a deck plan: @UUID[${existing.uuid}]{${escapeHtml(existing.name)}}. ` +
        `Run <code>!shipmap rebuild</code> to generate a fresh one.</p>`,
      flags:   { [MODULE_ID]: { shipMapCard: true } },
    });
    return;
  }

  ui.notifications?.info("Starforged Companion: building the ship deck plan…");

  // Rebuild: drop the previous Scene first so repeated runs don't pile up
  // duplicate deck plans.
  if (existing && rebuild) {
    await existing.delete?.().catch(err =>
      console.warn(`${MODULE_ID} | !shipmap: deleting old scene failed:`, err?.message ?? err));
  }

  const scene = await generateShipMapForActor(actor, ship, campaignState, { force: true });
  if (!scene) {
    await ChatMessage.create({
      content: "<p>Ship deck-plan generation failed — see the browser console for details.</p>",
      flags:   { [MODULE_ID]: { shipMapCard: true } },
    });
    return;
  }

  await ChatMessage.create({
    content: `<div class="sf-card sf-card--ship-map">` +
      `<div class="sf-card-header">⚙ Deck Plan Ready</div>` +
      `<div class="sf-card-body">` +
      `<p>Battle stations! @UUID[${scene.uuid}]{${escapeHtml(scene.name)}} is ready — the 11 shipboard-combat stations are pinned on the deck plan.</p>` +
      `<p class="sf-card-hint">Click a station pin to see what that crew role does. Position is tracked per character; Aid Your Ally hands control between crew.</p>` +
      `</div></div>`,
    flags: { [MODULE_ID]: { shipMapCard: true } },
  });
}

/**
 * Post the resolved move result to chat.
 * Returns the created ChatMessage so the caller can attach Loremaster context.
 */
/**
 * Apply this outcome's asset consequence riders (consequence-riders feature).
 * Automatic meter riders apply silently; optional / "choose one" / progress
 * riders prompt. Progress marks resolve to the sole track when unambiguous,
 * else the picker. Posts a summary of what was applied. GM-gated by the caller.
 *
 * @param {Object} resolution
 * @param {Object} interpretation — carries extractedRiders from the pre-roll pass
 * @param {Object} campaignState
 * @param {Actor|null} characterActor
 */
async function applyMoveConsequenceRiders(resolution, interpretation, campaignState, characterActor) {
  const extracted = interpretation?.extractedRiders;
  if (!Array.isArray(extracted) || !extracted.length) return;

  const firing = collectFiringRiders(extracted, resolution.outcome, resolution.isMatch);
  if (!firing.length) return;

  const { automatic, prompted } = partitionRiders(firing);
  const shipActorId = getCommandVehicleActor(campaignState)?.id
    ?? (await import("./entities/ship.js")).getCommandVehicleActorId?.(campaignState)
    ?? null;

  const appliedSummary = [];

  // Automatic meter riders — apply immediately.
  const autoApplied = await applyMeterRiders(automatic, { characterActor, shipActorId });
  appliedSummary.push(...autoApplied);

  // Progress riders: auto-mark when there's exactly one track (unambiguous),
  // otherwise route to the picker with the rest of the prompted riders.
  const tracks = await listProgressTracks().catch(() => []);
  const promptList = [];
  for (const r of prompted) {
    if (r.resource === "progress" && tracks.length === 1) {
      await markProgressById(tracks[0].id).catch(() => {});
      appliedSummary.push({ label: `${r.label} → ${tracks[0].label}`, assetName: r.assetName });
    } else {
      promptList.push(r);
    }
  }

  // Prompt for optional / choice / ambiguous-progress riders.
  if (promptList.length) {
    const { apply, progress } = await promptRiders(promptList, tracks);
    const chosenMeters = await applyMeterRiders(apply.filter(r => r.resource !== "progress"),
      { characterActor, shipActorId });
    appliedSummary.push(...chosenMeters);
    for (const { rider, trackId } of progress ?? []) {
      const track = await markProgressById(trackId).catch(() => null);
      if (track) appliedSummary.push({ label: `${rider.label} → ${track.label}`, assetName: rider.assetName });
    }
  }

  if (appliedSummary.length) {
    const rows = appliedSummary
      .map(a => `<li>${a.label}${a.assetName ? ` <em>(${a.assetName})</em>` : ""}</li>`)
      .join("");
    await ChatMessage.create({
      content: `<div class="sf-rider-summary"><strong>✦ Asset effects applied</strong><ul>${rows}</ul></div>`,
      flags:   { [MODULE_ID]: { riderSummary: true } },
    }).catch(err => console.warn(`${MODULE_ID} | rider summary card failed:`, err?.message ?? err));
  }
}

// Combat blow-by-blow moves after which the player may want to cash in the
// combat progress track via Take Decisive Action. Their result cards carry a
// "Take Decisive Action" button. Enter the Fray (fight just started — no
// progress yet), Take Decisive Action itself, Face Defeat, and Battle are
// excluded.
const TDA_OFFER_MOVES = new Set(["strike", "clash", "gain_ground", "react_under_fire"]);

/**
 * @param {{ id: string, label?: string }|null} [fight] — a combat move's own
 *   fight (the pipeline's moveFight): stamped as combatTrackId /
 *   combatTrackLabel and named on the Finish the Fight button, which forwards
 *   them so the roll it starts scores this fight (TDA-BUTTON-NO-TARGET).
 */
async function postMoveResult(resolution, aside = null, burnState = null, improveState = null, milestoneState = null, connectionState = null, fight = null) {
  // 3D dice (Dice So Nice) for the action + challenge dice, fed the values the
  // resolver already rolled so the animation matches the card. Fire-and-forget
  // and fail-open — never blocks or breaks the result post.
  void showMoveRoll(resolution);
  const combatMove = TDA_OFFER_MOVES.has(resolution.moveId);
  const namedFight = combatMove && fight?.id ? fight : null;
  return ChatMessage.create({
    content: formatMoveResult(resolution, aside, burnState, improveState, milestoneState, connectionState, namedFight),
    flags: {
      [MODULE_ID]: {
        moveResolution: true,
        resolutionId:   resolution._id,
        ...(combatMove ? { combatMoveCard: true } : {}),
        ...(namedFight ? { combatTrackId: namedFight.id, combatTrackLabel: namedFight.label ?? null } : {}),
        ...(waypointOracleFor(resolution) ? { waypointOracleCard: waypointOracleFor(resolution) } : {}),
        ...(burnState ? { burn: burnState } : {}),
        ...(improveState ? { improve: improveState } : {}),
        ...(milestoneState ? { milestoneSuggestion: milestoneState } : {}),
        ...(connectionState ? { connectionSuggestion: connectionState } : {}),
      },
    },
    // No type field — defaults to "base", which is valid in both v12 and v13.
    // "other" was removed as a valid type in v13 and must not be used.
  });
}

/**
 * Format a move resolution as an HTML chat card.
 */
function formatMoveResult(resolution, aside = null, burnState = null, improveState = null, milestoneState = null, connectionState = null, fight = null) {
  const outcomeClass = {
    strong_hit: "sf-strong-hit",
    weak_hit:   "sf-weak-hit",
    miss:       "sf-miss",
  }[resolution.outcome] ?? "";

  const addsStr  = resolution.adds    ? ` + ${resolution.adds}` : "";
  const matchStr = resolution.isMatch ? " ✦ Match"              : "";

  // Progress moves roll no action die — the score is the track's filled boxes
  // (statValue carries the ticks; progressScore = floor(ticks / 4)). Rendering
  // them through the action-move template printed "+ (0)" and "Action: 0 + N
  // = 0" against a real outcome.
  const statLine = resolution.isProgressMove
    ? `progress (${resolution.statValue} ticks)`
    : `+${resolution.statUsed} (${resolution.statValue})`;
  const diceLine = resolution.isProgressMove
    ? `Progress: <strong>${resolution.progressScore}</strong>
        &nbsp;|&nbsp;
        Challenge: ${resolution.challengeDice[0]}, ${resolution.challengeDice[1]}${matchStr}`
    : `Action: ${resolution.actionDie} + ${resolution.statValue}${addsStr}
        = <strong>${resolution.actionScore}</strong>
        &nbsp;|&nbsp;
        Challenge: ${resolution.challengeDice[0]}, ${resolution.challengeDice[1]}${matchStr}`;

  return `
    <div class="sf-move-result ${outcomeClass}">
      <div class="sf-move-name">${resolution.moveName}</div>
      <div class="sf-move-stat">${statLine}</div>
      <div class="sf-move-dice">
        ${diceLine}
      </div>
      <div class="sf-move-outcome">${resolution.outcomeLabel}</div>
      ${resolution.consequences.otherEffect
        ? `<div class="sf-move-effect">${resolution.consequences.otherEffect}</div>`
        : ""}
      ${aside
        ? `<div class="sf-move-aside">🎲 ${aside}</div>`
        : ""}
      ${renderBurnButtonHtml(burnState)}
      ${renderImproveButtonHtml(improveState)}
      ${renderMilestoneSuggestionHtml(milestoneState)}
      ${renderConnectionSuggestionHtml(connectionState)}
      ${TDA_OFFER_MOVES.has(resolution.moveId)
        ? `<div class="sf-combat-followup"><button type="button" class="sf-followup-btn" data-action="sf-take-decisive-action" title="Roll your combat progress against the challenge dice to seize the objective">⚔ Attempt to Finish the Fight${fight?.label ? `: ${escapeChatHtml(fight.label)}` : ""}</button></div>`
        : ""}
      ${waypointOracleFor(resolution) === "make_a_discovery"
        ? `<div class="sf-combat-followup"><button type="button" class="sf-followup-btn" data-action="sf-waypoint-oracle" title="The match reveals something wondrous — roll Make a Discovery (marks the discoveries legacy)">🔭 Make a Discovery</button></div>`
        : ""}
      ${waypointOracleFor(resolution) === "confront_chaos"
        ? `<div class="sf-combat-followup"><button type="button" class="sf-followup-btn" data-action="sf-waypoint-oracle" title="The match exposes something dire — roll Confront Chaos">🌀 Confront Chaos</button></div>`
        : ""}
    </div>
  `.trim();
}

/**
 * Which follow-up oracle move an Explore a Waypoint MATCH offers on its result
 * card: strong hit + match reveals something wondrous (Make a Discovery), miss
 * + match exposes something dire (Confront Chaos). These were advisory prose
 * seeds only until the 2026-07 soft-spot cleanup gave them one-click buttons.
 *
 * @param {{ moveId?: string, outcome?: string, isMatch?: boolean }} resolution
 * @returns {"make_a_discovery"|"confront_chaos"|null}
 */
export function waypointOracleFor(resolution) {
  if (resolution?.moveId !== "explore_a_waypoint" || !resolution?.isMatch) return null;
  if (resolution.outcome === "strong_hit") return "make_a_discovery";
  if (resolution.outcome === "miss")       return "confront_chaos";
  return null;
}

/**
 * Wire the waypoint-match oracle button — posts the forced follow-up move
 * (Make a Discovery / Confront Chaos); the canonical GM's pipeline resolves
 * it. Exported so Quench can drive it with a synthetic message + root.
 */
export function wireWaypointOracleButton(message, root) {
  const oracleMove = message?.flags?.[MODULE_ID]?.waypointOracleCard;
  if (!oracleMove) return;
  const btn = root?.querySelector?.('[data-action="sf-waypoint-oracle"]');
  if (!btn) return;
  const fresh = btn.cloneNode(true);
  btn.replaceWith(fresh);
  fresh.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    fresh.disabled = true;
    try {
      await ChatMessage.create({
        content: oracleMove === "make_a_discovery"
          ? "I follow what the waypoint revealed — making a discovery."
          : "I face the chaos the waypoint exposed.",
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: oracleMove } },
      });
    } catch (err) {
      console.error(`${MODULE_ID} | waypoint oracle button failed:`, err);
      fresh.disabled = false;
    }
  });
}
onChatMessageRender((message, root) => wireWaypointOracleButton(message, root));

/**
 * Render the "Reach a Milestone" suggestion button for a move-result card.
 * Returns "" when not eligible. Clicking marks vow progress without retyping
 * the move (wireMilestoneSuggestionButton).
 */
function renderMilestoneSuggestionHtml(milestoneState) {
  if (!milestoneState?.eligible) return "";
  return `<div class="sf-milestone-suggest-row">` +
    `<button type="button" class="sf-followup-btn" data-action="sf-reach-milestone" ` +
    `title="Mark progress on your vow per its rank">⚑ Mark Progress on Vow</button>` +
    `<button type="button" class="sf-followup-btn" data-action="sf-attempt-fulfill-vow" ` +
    `title="Roll to fulfill your vow (progress roll)">🏁 Attempt to Fulfill Vow</button>` +
    `</div>`;
}

/**
 * Render the "Develop Relationship / Forge a Bond" suggestion buttons for a
 * move-result card. Returns "" when not eligible. Clicking opens a connection
 * picker (wireConnectionSuggestionButtons / wireConnectionPickerButtons).
 */
function renderConnectionSuggestionHtml(connectionState) {
  if (!connectionState?.eligible) return "";
  return `<div class="sf-milestone-suggest-row">` +
    `<button type="button" class="sf-followup-btn" data-action="sf-develop-relationship" ` +
    `title="Mark progress on a connection's relationship track">🤝 Develop Relationship</button>` +
    `<button type="button" class="sf-followup-btn" data-action="sf-forge-bond" ` +
    `title="Attempt to forge a bond with a connection (progress roll)">🔗 Forge a Bond</button>` +
    `</div>`;
}

/**
 * Inject the push-to-talk button into the Foundry chat controls bar.
 *
 * Rewritten without jQuery — Foundry v13 removed jQuery from the global scope.
 * The renderChatLog hook now passes a plain HTMLElement, not a jQuery object.
 *
 * v13 sidebar restructure: the `#chat-controls` id is no longer present in
 * the ApplicationV2 chat tab. v13 wraps the input form in `<section
 * class="chat-controls">` (note: class, not id) inside the chat panel.
 * The selector chain below tries the v13 class selector first, then falls
 * back to a chain of older / alternate selectors so the button still
 * appears across version churn. A console warning fires when no selector
 * matches — without it, the function used to return silently and the user
 * thought the feature was broken.
 */
const PTT_HOST_SELECTORS = [
  ".chat-controls",            // v13: <section class="chat-controls">
  "#chat-controls",            // v12 legacy id
  "#chat form",                // any nested form under the chat container
  '[data-application-part="input"]',  // ApplicationV2 input part
  "section.chat-form",
];

function injectPushToTalkButton(html) {
  // html may be an HTMLElement (v13) or jQuery object (v12) — normalise to Element
  const root = html instanceof HTMLElement ? html : html[0] ?? html;
  if (!root) return;

  // Idempotent: if the button is already injected (e.g. renderChatLog
  // fires multiple times across re-renders), bail.
  if (root.querySelector?.("#sf-ptt-button")) return;

  let controls = null;
  for (const sel of PTT_HOST_SELECTORS) {
    controls = root.querySelector(sel);
    if (controls) break;
  }
  if (!controls) {
    console.warn(
      `${MODULE_ID} | PTT button: no chat-controls container found in renderChatLog ` +
      `root. Tried: ${PTT_HOST_SELECTORS.join(", ")}. Speech-input setting is enabled ` +
      `but the button will not appear. Please report the Foundry version so the ` +
      `selector list can be updated.`,
    );
    return;
  }

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
  button.addEventListener("mouseleave", () => { window._sfSpeechInput?.stop(); });
  // The system interrupts a touch (a notification, a gesture) with touchcancel,
  // not touchend; without this, listening never stops (issue #293).
  button.addEventListener("touchcancel", () => { window._sfSpeechInput?.stop(); });

  controls.prepend(button);
}


// ─────────────────────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────────────────────

Hooks.once("init", () => {
  installConsoleInterceptor();
  console.log(`${MODULE_ID} | Initialising`);
  registerCoreSettings();
  registerCombatTrackerSettings();
  registerUISettings();
  registerPrivateChannelSettings();
  registerCompanionToolbarSettings();
  registerLayoutSettings();
});

Hooks.once("ready", () => {
  registerErrorLogSocket();   // GM listens for relayed non-GM client errors
  flushErrorLogBuffer();
  flushApiTransactionLogBuffer();
  // Advertise this client's Claude-key presence so the single-emitter pipeline
  // routes to a keyed GM (no-op for non-GMs; writes only when state changes).
  advertiseClaudeKeyPresence().catch((err) =>
    console.warn(`${MODULE_ID} | keyed-GM advertise failed:`, err));
  console.log(`${MODULE_ID} | Ready`);

  // Show the floating Companion launcher. It replaces the old scene-controls
  // group, which was inert whenever no scene was active (canvas.ready === false
  // — the normal state for theater-of-the-mind play). The toolbar is pinned to
  // the viewport, so it works with or without a map loaded. The layout is
  // applied first, so a phone opens straight into the compact toolbar (#293).
  try { initLayoutMode(); }
  catch (err) { console.warn(`${MODULE_ID} | could not apply the layout:`, err); }
  try { openCompanionToolbar(); }
  catch (err) { console.warn(`${MODULE_ID} | could not open companion toolbar:`, err); }

  // Log the art-generation configuration and surface the most common
  // misconfiguration (no OpenRouter key while sector art is enabled) to the GM.
  if (game.user.isGM) {
    logArtBackendStatus();
  }

  // Re-register any custom oracle tables defined in previous sessions
  // (campaignState.customOracles). Memory-only registration; persistence
  // is via campaignState.
  try { rehydrateCustomOracles(); }
  catch (err) { console.warn(`${MODULE_ID} | rehydrateCustomOracles failed:`, err); }

  // Session ID — world-scoped write (plus the auto-recap Claude call), so a
  // single emitter: the canonical GM. With two GMs connected, plain isGM ran
  // the re-mint / stale-scene close / auto-recap once per GM. Players read
  // from state.
  if (isCanonicalGM()) {
    const prevState = game.settings.get(MODULE_ID, "campaignState");

    // Reset a stale pendingMove lock — left set if Foundry was closed mid-move.
    if (prevState.pendingMove) {
      prevState.pendingMove = false;
      console.log(`${MODULE_ID} | Reset stale pendingMove lock on ready`);
    }

    const wasNewSession = isNewSessionStart(prevState);
    const priorSessionId = prevState.currentSessionId ?? null;

    // NARR-SESSION-SCENE (narrator-context audit 2026-07): when the session
    // is over, its scene closes before the new one is minted, so its truths
    // migrate to their durable homes instead of rendering into the next
    // session's mixed memory; a session nobody ended first gets its rolling
    // summary brought up to date (rollSessionIfDue). Both await, so only the
    // fields this writes are merged onto the store — endScene persists the
    // scene fields itself.
    initSessionId(prevState).then(updated =>
      game.settings.set(MODULE_ID, "campaignState",
        mergeOwnedFields(updated, ["pendingMove", ...SESSION_MINT_FIELDS], "session start")),
    ).then(async () => {
      const freshState = game.settings.get(MODULE_ID, "campaignState");
      // Auto-recap: post campaign recap when a new session is detected
      if (wasNewSession && getAutoRecapEnabled()) {
        await postCampaignRecap(freshState, { silent: false }).catch(err => {
          console.error(`${MODULE_ID} | Auto-recap failed:`, err);
        });
      } else if (freshState.currentSessionId !== priorSessionId) {
        // A new session's first narration carries the campaign recap from
        // its cache (buildNarratorExtras) — refresh it now, off that path.
        getCampaignRecap(freshState).catch(err =>
          console.warn(`${MODULE_ID} | campaign recap refresh failed:`, err?.message ?? err));
      }

      // Notify GM if no World Truths have been established yet
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
    // X-Card resume — clearXCard flips the world-scoped xCardActive flag back
    // off (GM-only write). Exposed on the module API for macros / the console:
    //   game.modules.get("starforged-companion").api.clearXCard()
    const xcardMod = game.modules.get(MODULE_ID);
    if (xcardMod) xcardMod.api = { ...(xcardMod.api ?? {}), clearXCard };

    ensureHelpJournal().catch(err =>
      console.warn(`${MODULE_ID} | Help journal creation failed:`, err.message)
    );

    // ✦ Playtest Quickstart — expose the orchestrator on the module API and
    // ensure the hotbar Macro exists (the Macro body is a one-liner into
    // the API so its logic lives in tested module code).
    import("./session/quickstart.js").then(({ runPlaytestQuickstart, ensureQuickstartMacro }) => {
      const mod = game.modules.get(MODULE_ID);
      if (mod) mod.api = { ...(mod.api ?? {}), runPlaytestQuickstart };
      return ensureQuickstartMacro();
    }).catch(err =>
      console.warn(`${MODULE_ID} | Quickstart macro setup failed:`, err?.message ?? err)
    );

    // ✦ Campaign Start — full campaign-launch sequence (quickstart → envision
    // ship → finalize connections → begin session → inciting incident).
    import("./session/campaignStart.js").then(({ runCampaignStart, ensureCampaignStartMacro }) => {
      const mod = game.modules.get(MODULE_ID);
      if (mod) mod.api = { ...(mod.api ?? {}), runCampaignStart };
      return ensureCampaignStartMacro();
    }).catch(err =>
      console.warn(`${MODULE_ID} | Campaign Start macro setup failed:`, err?.message ?? err)
    );

    // World Journal — create the folder + four category journals if missing.
    // Phase 3 only writes; the combined detection pass that auto-populates is
    // Phase 4. Errors are logged and do not block the rest of the ready hook.
    initWorldJournals().catch(err =>
      console.warn(`${MODULE_ID} | World Journal init failed:`, err?.message ?? err)
    );

    // One-time sector-folder flatten — moves every settlement / planet /
    // location Actor out of the legacy per-type subfolder (Sectors/<Name>/
    // Settlements) into a flat per-sector folder (Sectors/<Name>). Idempotent:
    // when nothing needs moving the function walks the actor list once and
    // returns. Reports counts to the console so the GM can see what changed.
    import("./entities/migrator.js").then(async ({ flattenSectorActorFolders, scaffoldPcShipFolders, migrateJournalConnectionsToActors, backfillNpcCardSheets, syncEntityRecordNames }) => {
      try {
        const state   = game.settings.get(MODULE_ID, "campaignState");
        const summary = await flattenSectorActorFolders(state);
        if (summary.moved || summary.foldersDeleted) {
          console.log(
            `${MODULE_ID} | sector-folder flatten: ` +
            `moved ${summary.moved} actor(s), removed ${summary.foldersDeleted} empty legacy folder(s)`
          );
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | sector-folder flatten failed:`, err?.message ?? err);
      }
      try {
        const scaffold = await scaffoldPcShipFolders();
        if (scaffold.moved) {
          console.log(`${MODULE_ID} | folder scaffold: filed ${scaffold.moved} loose actor(s) into PCs/Starships`);
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | folder scaffold failed:`, err?.message ?? err);
      }
      try {
        const state = game.settings.get(MODULE_ID, "campaignState");
        const conn  = await migrateJournalConnectionsToActors(state);
        if (conn.migrated) {
          console.log(`${MODULE_ID} | connection migration: moved ${conn.migrated} journal connection(s) to NPC-card Actors`);
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | connection migration failed:`, err?.message ?? err);
      }
      try {
        // v1.7.10 findings #1/#4 — pin the Starforged sheet on pre-existing
        // NPC cards (runs after the journal migration so migrated cards are
        // covered in the same pass).
        const sheets = await backfillNpcCardSheets();
        if (sheets.updated) {
          console.log(`${MODULE_ID} | NPC-card sheet backfill: pinned Starforged sheet on ${sheets.updated} card(s)`);
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | NPC-card sheet backfill failed:`, err?.message ?? err);
      }
      try {
        // v1.7.10 finding #2 — reconcile entity record names with Actor
        // renames that happened before the live sync hook existed.
        const state = game.settings.get(MODULE_ID, "campaignState");
        const names = await syncEntityRecordNames(state);
        if (names.synced) {
          console.log(`${MODULE_ID} | entity name sync: reconciled ${names.synced} record(s) to their Actor names`);
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | entity name sync failed:`, err?.message ?? err);
      }
    }).catch(err => console.warn(`${MODULE_ID} | sector-folder flatten dynamic import failed:`, err));
  }

  registerGmRelaySocket();   // canonical-GM action relay (player-invoked world writes)
  // Relays emitted while this GM's client was still loading reached no
  // listener and were dropped; tell players the relay is live so they can
  // re-send state (onGmRelayReady — e.g. their Private Lines). Canonical GM
  // only; a debug no-op elsewhere.
  announceGmRelayReady();
  registerChatHook();
  registerActorHook();
  registerSharedSupplyHook();   // crew-shared supply track (co-op/guided rule)
  registerEntityRenameSyncHook();
  registerStarshipSeedHook();
  registerCommandVehicleHook();
  registerNativeProgressRollHook();
  registerNativeFulfilConsequenceHook();   // #248 B2: native-sheet vow fulfil → deepen bond + grant reward + legacy
  registerOracleMemoryCaptureHook();       // narrator-context 2026-07: !oracle / !ptp results → campaignState.recentOracles
  registerRollingSummaryRefreshHook();     // #286 B7: rolling summary regen after a narrator card posts, off the narration's path
  registerSessionActivityHook();           // #286 C4: chat activity keeps the session alive (lastSessionTimestamp)
  registerPublishedReflectionHook();       // #286 D1: a published Private Channel reflection's NPC developments → their cards
  registerProgressTrackHooks();
  registerCombatTrackerHooks();
  registerEntityPanelHooks();
  registerChroniclePanelHooks();             // #306 R11: the open Chronicle panel shows edits the GM applied
  registerDraftCardHooks();
  registerSectorOverviewSync();
  registerSectorSceneHooks();
  registerShipMapSceneHooks();
  // Audio narration — socket relay for cache writes from non-GM clients.
  import("./audio/index.js").then(({ registerAudioSocket }) => {
    registerAudioSocket();
  }).catch(err => console.warn(`${MODULE_ID} | audio socket registration failed:`, err));
  // Shared inciting-vow — GM-side relay (any player can swear it for the crew)
  // and the cross-PC progress sync. Both no-op on non-canonical clients.
  registerSharedVowSocket();
  registerSharedVowSyncHook();
  // Reward-choice card (#241 Phase 2) — pick a proposed reward or write your own.
  registerRewardChoiceHook();
  // Player-authored vows (#248 B1) — a vow made on the sheet gets the same setup
  // (reward proposal + ⚔ Swear it roll). GM-gated createItem detection.
  registerPlayerVowHook();
  // Combat threshold (#241) — Enter the Fray vs. way out: button wiring + the
  // GM-side enter-fray relay (track creation is GM-gated).
  registerCombatThresholdHook();
  registerCombatThresholdSocket();
  registerWayOutHook();
  registerRecommitHook();
  registerRecommitSocket();
  // Won-fight vow milestone (#241) — Mark milestone / Fulfill / Deepen bond on a
  // won linked fight; mark + deepen relay to the canonical GM through gmRelay
  // ("fightVow.*" → src/moves/cardActions.js), one-shot per card.
  registerFightVowMilestoneHook();
  registerSettingsHooks();
  registerBurnMomentumHook({
    narrate:  narrateResolution,
    persist:  persistResolution,
  });
  registerImproveResultHook({
    narrate:  narrateResolution,
    persist:  persistResolution,
  });
  // Suffer choices are a non-blocking chat card (never a modal dialog inside the
  // move lock — see sufferCard.js); wire its buttons.
  registerSufferCardHook();

  // Pacing recent-density buffer is in-memory; clear it on world load so a
  // returning session doesn't inherit the previous run's MOVE count.
  resetRecentDensity();

  // One-time API-key format sanity check. The settings dialog trims on save
  // but does not validate; an OpenRouter key (`sk-or-v1-…`) pasted into the
  // Claude field will silently store and 401 every call. A one-line warn
  // here makes that obvious in the console without blocking module load.
  warnIfClaudeKeyLooksWrong();

  if (game.settings.get(MODULE_ID, "speechInputEnabled")) {
    initSpeechInput();
  }
});

Hooks.once("closeWorld", async () => {
  if (!game.user.isGM) return;
  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  // Fact continuity: flush any active scene before the world closes so
  // truths migrate to entity tiers / WJ Lore rather than vanishing on the
  // next world load. See issue #227 (Fact Continuity) §9.2.
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

/**
 * Inject the PTT button when speech is enabled. The v13 ApplicationV2 chat
 * sidebar fires multiple hook names depending on Foundry build (renderChatLog
 * stayed for back-compat, renderChatPanel and renderChatTab show up on some
 * builds). Bind to all known candidates — the function is idempotent (returns
 * early if the button already exists), so multiple fires are safe.
 */
const PTT_RENDER_HOOKS = ["renderChatLog", "renderChatPanel", "renderChatTab"];
for (const hookName of PTT_RENDER_HOOKS) {
  Hooks.on(hookName, (_app, html, _data) => {
    if (game.settings.get(MODULE_ID, "speechInputEnabled")) {
      injectPushToTalkButton(html);
    }
  });
}

/**
 * Wire the "Set World Truths" button on setup notification cards.
 * The card is whispered to the GM on ready when no truths are established.
 */
onChatMessageRender((message, root) => {
  if (!message.flags?.[MODULE_ID]?.setupCard) return;
  root.querySelector('[data-action="openTruthsDialog"]')
    ?.addEventListener("click", () => openSystemTruthsDialog());
});

/**
 * Wire the buttons on the Enter the Fray combat-track card:
 *  - "Open Progress Tracks" (playtest finding #9: the combat track lives only
 *    in the module panel and players couldn't find it) opens the panel where
 *    the fight's progress, rank, and in-control / bad-spot position live.
 *  - "Battle instead" (only present on freshly-created tracks) re-posts a forced
 *    battle move to resolve the whole fight in one roll.
 *
 * Exported so Quench can drive it with a synthetic message + root (same pattern
 * as the audio card handlers).
 */
export function wireCombatTrackCardButtons(message, root) {
  if (!message?.flags?.[MODULE_ID]?.combatTrackCard) return;

  const btn = root?.querySelector?.('[data-action="openProgressTracks"]');
  if (btn) {
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openProgressTracks();
    });
  }

  // "Battle instead" — resolve the whole fight in one roll. Re-posts a forced
  // battle move (same forced-move bridge as the NWMA "Roll <move>" button).
  // battle's resolver sets endCombat, so the track created by Enter the Fray
  // is closed when the move resolves.
  const battleBtn = root?.querySelector?.('[data-action="sf-battle"]');
  if (battleBtn) {
    const freshBattle = battleBtn.cloneNode(true);
    battleBtn.replaceWith(freshBattle);
    freshBattle.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      freshBattle.disabled = true;
      try {
        // The card's own track rides the move by id (and name), so Battle
        // ends this fight even while another is open — without it, two open
        // fights left Battle ending neither. Older cards carry no id.
        const trackId    = message.flags[MODULE_ID].trackId ?? null;
        const trackLabel = message.flags[MODULE_ID].trackLabel ?? null;
        await ChatMessage.create({
          content: trackLabel
            ? `Battle — resolve the fight against ${trackLabel} in a single, decisive clash.`
            : "Battle — resolve the fight in a single, decisive clash.",
          flags:   { [MODULE_ID]: {
            bypassPacing: true, forcedMoveId: "battle",
            ...(trackId ? { forcedMoveTargetId: trackId } : {}),
            ...(trackLabel ? { forcedMoveTarget: trackLabel } : {}),
          } },
        });
      } catch (err) {
        console.error(`${MODULE_ID} | Battle button failed:`, err);
        freshBattle.disabled = false;
      }
    });
  }
}
onChatMessageRender((message, root) => wireCombatTrackCardButtons(message, root));

/**
 * Wire the "Correct a fact" button on narrator cards
 * (fact-continuity scope §10.2). Two-hook pattern per CLAUDE.md: the card
 * HTML is rendered with the button in postNarrationCard /
 * postPacedNarrativeCard; click handlers are attached here at render time.
 */
onChatMessageRender((message, root) => {
  if (!message.flags?.[MODULE_ID]?.narratorCard) return;
  if (!factContinuityEnabledFromSettings()) return;

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
 * Wire the "▶ Play" audio button on narrator cards
 * (issue #221 (Audio Narration) §9). The button is rendered hidden by
 * postNarrationCard / postPacedNarrativeCard; this hook unhides it and
 * binds playback when the player has opted in on this client.
 */
onChatMessageRender((message, root) => {
  if (!message.flags?.[MODULE_ID]?.narratorCard) return;
  // Dynamic import keeps module load order tolerant — audio code is
  // optional and shouldn't block chat rendering if it fails to load.
  import("./audio/index.js").then(({ onNarratorCardRendered }) => {
    onNarratorCardRendered(message, root).catch(err =>
      console.warn(`${MODULE_ID} | audio render failed:`, err),
    );
  }).catch(err => console.warn(`${MODULE_ID} | audio module load failed:`, err));
});

// Wire the "⚔ Swear this vow" button on inciting-incident cards
// (Cluster B — src/session/swearVow.js owns the handler + execution).
registerSwearVowHandler();
// Wire the ⚔ Swear it (roll) button on player-authored vow setup cards (#248 B1).
registerPlayerVowSwearHook();
// Wire the 🤝 Link button on player-authored vow setup cards (#248 B-link).
registerPlayerVowLinkHook();

/**
 * Wire the "↻ Refresh" button on campaign recap cards.
 * The button is rendered for the GM on every non-empty campaign recap card
 * (`src/narration/narrator.js` postCampaignRecap). Forces a regeneration that
 * bypasses the chronicle-length cache.
 */
onChatMessageRender((message, root) => {
  const f = message.flags?.[MODULE_ID];
  if (!f?.recapCard || f.recapType !== "campaign") return;
  const btn = root.querySelector('[data-action="refreshCampaignRecap"]');
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
 * Wire the "Take Decisive Action" button on combat move result cards
 * (Strike / Clash / Gain Ground / React Under Fire). One click re-posts a
 * forced take_decisive_action move so the player can cash in the combat
 * progress track without retyping — same forced-move bridge as the NWMA
 * "Roll <move>" button. The confirm dialog still appears, so the action is
 * never fired silently.
 *
 * Exported so Quench can drive it with a synthetic message + root (same
 * pattern as the audio card handlers).
 */
export function wireTakeDecisiveActionButton(message, root) {
  if (!message?.flags?.[MODULE_ID]?.combatMoveCard) return;
  const btn = root?.querySelector?.('[data-action="sf-take-decisive-action"]');
  if (!btn) return;
  const fresh = btn.cloneNode(true);
  btn.replaceWith(fresh);
  fresh.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    fresh.disabled = true;
    try {
      // The card's own fight rides the roll by id (and name), so with two
      // fights open the roll scores this one — not nothing, a certain miss
      // (TDA-BUTTON-NO-TARGET). A fight finished or deleted meanwhile rolls
      // nothing and says so (issue #306 R06). Cards without the stamp (older
      // ones, or a move whose fight nothing named) post no target: the
      // pipeline then resolves the sole open fight.
      const trackId    = message.flags[MODULE_ID].combatTrackId ?? null;
      const trackLabel = message.flags[MODULE_ID].combatTrackLabel ?? null;
      await ChatMessage.create({
        content: trackLabel
          ? `Take decisive action to seize the objective — ${trackLabel}.`
          : "Take decisive action to seize the objective.",
        flags:   { [MODULE_ID]: {
          bypassPacing: true, forcedMoveId: "take_decisive_action",
          ...(trackId ? { forcedMoveTargetId: trackId } : {}),
          ...(trackLabel ? { forcedMoveTarget: trackLabel } : {}),
        } },
      });
    } catch (err) {
      console.error(`${MODULE_ID} | Take Decisive Action button failed:`, err);
      fresh.disabled = false;
    }
  });
}
onChatMessageRender((message, root) => wireTakeDecisiveActionButton(message, root));

/**
 * Wire the "⚑ Reach a Milestone" suggestion button on a move-result card.
 * Clicking marks vow progress (sole open vow → auto-mark; several → picker)
 * via the same applyReachMilestone path the move uses. Disabled after one use
 * (flag `milestoneMarked`) so a card can't double-mark on re-render. GM-gated
 * writes are inherited from markVowProgress.
 *
 * Exported so Quench can drive it with a synthetic message + root.
 */
export function wireMilestoneSuggestionButton(message, root) {
  const f = message?.flags?.[MODULE_ID];
  if (!f?.milestoneSuggestion?.eligible) return;
  const btn = root?.querySelector?.('[data-action="sf-reach-milestone"]');
  if (!btn) return;

  if (f.milestoneMarked) {
    btn.disabled = true;
    btn.textContent = "⚑ Milestone marked";
    return;
  }

  const fresh = btn.cloneNode(true);
  btn.replaceWith(fresh);
  fresh.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    fresh.disabled = true;
    try {
      // Multiplayer fix (#236-follow-up): post a forced reach_a_milestone move
      // so the canonical GM runs the progress mark + narration, exactly like the
      // Attempt-to-Fulfill-Vow button. The old direct applyReachMilestone() call
      // was GM-gated and silently no-op'd for players (the click did nothing).
      await ChatMessage.create({
        content: "Mark progress on your vow.",
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "reach_a_milestone" } },
      });
    } catch (err) {
      console.error(`${MODULE_ID} | Reach a Milestone suggestion failed:`, err);
      fresh.disabled = false;
    }
  });
}
onChatMessageRender((message, root) => wireMilestoneSuggestionButton(message, root));

/**
 * Wire the per-vow buttons on a Reach a Milestone picker card (posted when
 * several vows are open and none was named). Clicking one asks the canonical
 * GM to mark that vow and resolve the card (milestone.pick →
 * src/moves/milestonePicker.js applyMilestonePick, idempotent per card). The
 * vow write is GM-gated, so a player's click used to disable the buttons and
 * silently do nothing; it now relays.
 *
 * Exported so Quench can drive it with a synthetic message + root.
 */
export function wireMilestonePickerButtons(message, root) {
  const f = message?.flags?.[MODULE_ID];
  if (!f?.milestonePicker) return;
  const btns = root?.querySelectorAll?.('[data-action="sf-milestone-pick"]') ?? [];
  if (f.resolved) {
    for (const b of btns) b.disabled = true;
    return;
  }
  for (const btn of btns) {
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const all = root.querySelectorAll('[data-action="sf-milestone-pick"]');
      for (const b of all) b.disabled = true;
      // Not delivered (no GM connected — requestGmAction already told the
      // user), refused, or never resolved → re-arm the buttons so the pick
      // can be retried.
      await relayCardAction({
        kind:    "milestone.pick",
        payload: {
          messageId: message?.id ?? null,
          actorId:   fresh.dataset.actorId || null,
          vowId:     fresh.dataset.vowId || null,
        },
        isResolved: () => !!liveCardFlags(message)?.resolved,
        restore:    () => { for (const b of all) b.disabled = false; },
      });
    });
  }
}
onChatMessageRender((message, root) => wireMilestonePickerButtons(message, root));

/**
 * Wire the "🏁 Attempt to Fulfill Vow" button on move-result cards.
 * Appears alongside "Mark Progress on Vow" when a vow milestone is eligible.
 * Clicking posts a forced fulfill_your_vow move so the interpreter, narrator,
 * and pipeline handle the progress roll, narration, track closure, and quests
 * legacy reward automatically.
 *
 * Exported so Quench can drive it with a synthetic message + root.
 */
export function wireAttemptFulfillVowButton(message, root) {
  const f = message?.flags?.[MODULE_ID];
  if (!f?.milestoneSuggestion?.eligible) return;
  const btn = root?.querySelector?.('[data-action="sf-attempt-fulfill-vow"]');
  if (!btn) return;
  const fresh = btn.cloneNode(true);
  btn.replaceWith(fresh);
  fresh.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    fresh.disabled = true;
    try {
      await ChatMessage.create({
        content: "Attempt to fulfill your vow.",
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "fulfill_your_vow" } },
      });
    } catch (err) {
      console.error(`${MODULE_ID} | Attempt to Fulfill Vow button failed:`, err);
      fresh.disabled = false;
    }
  });
}
onChatMessageRender((message, root) => wireAttemptFulfillVowButton(message, root));

/**
 * Wire the "🗺 Finish the Expedition" button on expedition progress cards.
 * Clicking posts a forced finish_an_expedition move so the interpreter,
 * narrator, and pipeline handle the progress roll, narration, track closure,
 * and discoveries legacy reward automatically.
 *
 * Exported so Quench can drive it with a synthetic message + root.
 */
export function wireFinishExpeditionButton(message, root) {
  if (!message?.flags?.[MODULE_ID]?.expeditionProgressCard) return;
  const btn = root?.querySelector?.('[data-action="sf-finish-expedition"]');
  if (!btn) return;
  const fresh = btn.cloneNode(true);
  btn.replaceWith(fresh);
  fresh.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    fresh.disabled = true;
    try {
      // Carry the card's own expedition label as the move target so the
      // finish roll scores and completes THIS track even when several
      // expeditions are open (EXPEDITION-FINISH-TARGET fix). Older cards
      // without the flag fall back to the sole-open-track ladder.
      const trackLabel = message.flags[MODULE_ID].trackLabel ?? null;
      const trackId    = message.flags[MODULE_ID].trackId ?? null;
      await ChatMessage.create({
        content: trackLabel ? `Finish the expedition — ${trackLabel}.` : "Finish the expedition.",
        flags:   { [MODULE_ID]: {
          bypassPacing: true, forcedMoveId: "finish_an_expedition",
          ...(trackLabel ? { forcedMoveTarget: trackLabel } : {}),
          ...(trackId ? { forcedMoveTargetId: trackId } : {}),
        } },
      });
    } catch (err) {
      console.error(`${MODULE_ID} | Finish the Expedition button failed:`, err);
      fresh.disabled = false;
    }
  });
}
onChatMessageRender((message, root) => wireFinishExpeditionButton(message, root));

/**
 * Wire the "🤝 Develop Relationship" and "🔗 Forge a Bond" buttons on
 * connection-category move result cards. Clicking opens a connection picker
 * card so the player can choose which connection to act on.
 *
 * Exported so Quench can drive it with a synthetic message + root.
 */
export function wireConnectionSuggestionButtons(message, root) {
  const f = message?.flags?.[MODULE_ID];
  if (!f?.connectionSuggestion?.eligible) return;
  for (const [dataAction, pickAction] of [
    ["sf-develop-relationship", "develop"],
    ["sf-forge-bond", "forge"],
  ]) {
    const btn = root?.querySelector?.(`[data-action="${dataAction}"]`);
    if (!btn) continue;
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      fresh.disabled = true;
      try {
        const { getConnection: gc } = await import("./entities/connection.js");
        const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
        const connections = (state.connectionIds ?? [])
          .map(hostId => { const c = gc(hostId); return c ? { ...c, __hostId: hostId } : null; })
          .filter(c => c && c.active !== false);
        await postConnectionPickerCard(connections, pickAction);
      } catch (err) {
        console.error(`${MODULE_ID} | Connection suggestion button failed:`, err);
        fresh.disabled = false;
      }
    });
  }
}
onChatMessageRender((message, root) => wireConnectionSuggestionButtons(message, root));

/**
 * Wire the per-connection buttons on a connection picker card. Clicking one
 * relays the pick to the canonical GM ("connection.pick" →
 * src/moves/cardActions.js applyConnectionPick), which posts the forced move
 * (develop_your_relationship or forge_a_bond) ONCE — speaking as the clicker's
 * PC so the pipeline credits the roller — and stamps the card resolved. The
 * picker is often authored by someone other than the clicker, so the clicker's
 * own client could not stamp it, and a second click re-rolled the move. A
 * click that is not delivered (no GM connected) re-arms the buttons.
 *
 * Exported so Quench can drive it with a synthetic message + root.
 */
export function wireConnectionPickerButtons(message, root) {
  const f = message?.flags?.[MODULE_ID];
  if (!f?.connectionPicker) return;
  const btns = root?.querySelectorAll?.('[data-action="sf-connection-pick"]') ?? [];
  if (f.resolved) {
    for (const b of btns) b.disabled = true;
    return;
  }
  for (const btn of btns) {
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const all = root.querySelectorAll('[data-action="sf-connection-pick"]');
      for (const b of all) b.disabled = true;
      await relayCardAction({
        kind:    "connection.pick",
        payload: {
          messageId:      message?.id ?? null,
          hostId:         fresh.dataset.hostId || null,
          connectionName: fresh.dataset.connectionName || null,
          actorId:        clickerActorId(),
        },
        isResolved: () => !!liveCardFlags(message)?.resolved,
        restore:    () => { for (const b of all) b.disabled = false; },
      });
    });
  }
}

// The PC a card-button click on THIS client acts for — the same ladder as a
// typed message (selected token → bound character → owned PC → first PC).
// A player who owns none of those (an observer) sends null rather than the
// first PC, which the GM-side handler would refuse as not theirs.
function clickerActorId() {
  let speakerActor = null;
  try {
    speakerActor = ChatMessage.getSpeaker?.()?.actor ?? null;
  } catch (err) {
    console.debug(`${MODULE_ID} | card click: ChatMessage.getSpeaker failed — using the user's PC:`, err?.message ?? err);
  }
  const actorId = resolveSpeakerActorId(
    { author: game.user ?? null, speaker: { actor: speakerActor } },
    game.settings.get(MODULE_ID, "campaignState"),
  );
  if (!actorId || game.user?.isGM) return actorId;
  const actor = game.actors?.get?.(actorId) ?? null;
  if (userOwnsActor(actor, game.user)) return actorId;
  console.debug(`${MODULE_ID} | card click: this user owns no player character — the GM resolves the speaker.`);
  return null;
}
onChatMessageRender((message, root) => wireConnectionPickerButtons(message, root));

/**
 * Wire the "Roll <move>" button on NWMA cards.
 * The button appears beneath the italicized move hint on paced-narrative
 * cards whose classifier decision was NARRATIVE_WITH_MOVE_AVAILABLE. On
 * click we re-post the original player input as a fresh chat message with
 * `bypassPacing: true` so the classifier is skipped and the move pipeline
 * runs immediately.
 */
onChatMessageRender((message, root) => {
  const f = message.flags?.[MODULE_ID];
  if (!f?.pacedNarrative || !f?.suggestedMove || !f?.playerText) return;
  const btn = root.querySelector('[data-action="sf-paced-roll"]');
  if (!btn) return;

  // Disable any previously-clicked button after re-render so the same NWMA
  // card never fires the move twice.
  if (f.rolled) {
    btn.disabled = true;
    btn.textContent = "Rolled";
    return;
  }

  btn.addEventListener("click", async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    btn.disabled = true;
    try {
      // Mark the source card as rolled so re-renders don't re-arm the button.
      // Best-effort: only the GM can mutate other users' messages.
      try {
        await message.update({ [`flags.${MODULE_ID}.rolled`]: true });
      } catch (err) {
        // Player clients fall back to a local-only disable above.
        console.debug?.(`${MODULE_ID} | rolled-flag update skipped (non-owner):`, err?.message ?? err);
      }
      await ChatMessage.create({
        content: f.playerText,
        flags:   { [MODULE_ID]: {
          bypassPacing:        true,
          fromPacedSuggestion: true,
          forcedMoveId:        f.suggestedMove,
        } },
      });
    } catch (err) {
      console.error(`${MODULE_ID} | NWMA roll button failed:`, err);
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
  if (!isCanonicalGM()) return;   // single emitter for the campaignState write
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
  if (!isCanonicalGM()) return;   // single emitter for the campaignState write

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
