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

import { CampaignStateSchema, MOVES, rankName } from "./schemas.js";
import { interpretMove }         from "./moves/interpreter.js";
import { resolveMove, withPayThePriceSeed, mapConsequences, buildLoremasterContext } from "./moves/resolver.js";
import { buildMischiefAside }    from "./moves/mischief.js";
import { persistResolution }     from "./moves/persistResolution.js";
import { progressPerMilestoneLine, planRewardGrant } from "./moves/rewards.js";
import {
  buildBurnState,
  renderBurnButtonHtml,
  registerBurnMomentumHook,
  requesterOwnsActor,
} from "./moves/burnMomentum.js";
import {
  buildImproveState,
  renderImproveButtonHtml,
  registerImproveResultHook,
} from "./moves/improveResult.js";
import { upgradeStepRecord, describeUpgradeStep, retryUpgradeStep, closeUpgradesForLaterMove } from "./moves/resultUpgrade.js";
import { registerSufferCardHook, summarizeSufferCalls } from "./moves/sufferCard.js";
import {
  scanForApplicableAbilities,
  getCommandVehicleActor,
} from "./moves/abilityScanner.js";
import { enrichInterpretationStatValue, enrichProgressTicks, enrichBondedDevelop, enrichForcedMoveStat, resolveHealPatient, resolveAidedAlly, enrichBondAdds, legacyTrackNamed, legacyTrackScores } from "./moves/statEnrichment.js";
import { rollChallengeDice }     from "./moves/resolver.js";
import { markLegacyTrack, legacyProgress, deferLegacyXp, payDeferredLegacyXp } from "./moves/legacyTracks.js";
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
import { isClockCommand, handleClockCommand, applyClockAdvances, registerClocksPanelHooks } from "./clocks/clocks.js";
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
  registerXCardRedirectHook,
  registerPublishedReflectionHook,
} from "./narration/narrator.js";
import { isNarratorCommand, handleNarratorCommand } from "./narration/narratorDebug.js";
import { parseIronswornProgressRoll, classifyProgressRoll, ironswornRollKind, planNativeRollNarration } from "./narration/nativeProgressRoll.js";
import { invalidateActorCache, recalculateMomentumBounds, getPlayerActors, isPlayerCharacterActor, readVows, readCharacterSnapshot, readMomentumState, markVowProgress, completeVowItem, applyMeterChanges, applyCompanionHealthChange, readSheetLegacy, recordGrantedReward, setSharedVowReward, setBondItemRank, setBondItemTicks, setVowItemTrack } from "./character/actorBridge.js";
import { mirrorLegacyToSheets, registerLegacySheetSyncHook, backfillLegacySheets } from "./multiplayer/sharedLegacies.js";
import { registerPrivateChannelSettings } from "./private-channel/index.js";
import { ensureHelpJournal } from "./help/helpJournal.js";
import { openSectorCreator } from "./sectors/sectorPanel.js";
import { openSystemTruthsDialog, generateLoreRecap, recordSystemTruths, reconcileSystemTruths, holdsTruths } from "./truths/generator.js";

import {
  openProgressTracks,
  registerProgressTrackHooks,
  getActiveCombatPosition,
  listProgressTracks,
  markProgressById,
  adjustProgressById,
  addProgressTrack,
  completeProgressTrack,
  updateTrackFields,
  getProgressTrack,
} from "./ui/progressTracks.js";
import { applyExpeditionProgress, finishExpedition, legacyRewardTicks, selectExpeditionTrack, planRecommit } from "./moves/expedition.js";
import { selectSectorSite } from "./sectors/precursorSites.js";
import { finishVow, shouldPayFulfilledVow, selectVowTrack } from "./moves/vow.js";
import { isBattleStationsCommand, renderBattleStationsCardHtml } from "./moves/battleStations.js";
import {
  isShipMapCommand,
  generateShipMapForActor,
  findShipMapScene,
  registerShipMapSceneHooks,
} from "./moves/shipMapScene.js";
import { applyCombatProgress, finishCombat as finishCombatTrack, selectCombatTrack, selectRollerFight } from "./moves/combat.js";
import { buildCombatThresholdHtml, WAY_OUT_MOVES, thresholdPositionLine } from "./moves/combatThreshold.js";
import {
  enterCombatTracker,
  endCombatTracker,
  applyCombatPositionToTrack,
  registerCombatTrackerHooks,
  registerCombatTrackerSettings,
} from "./moves/combatTracker.js";
import { selectConnection, connectionsNamedByFragment, planDevelopRelationship, buildConnectionSuggestion, shouldForgeBond } from "./moves/developRelationship.js";
import { handleBondCommand } from "./moves/bondCommand.js";
import { postReachMilestoneCard } from "./moves/milestonePicker.js";
import { planReachMilestone, buildMilestoneSuggestion, marksForSourceRank, selectFulfilVow, namesCompletedVow } from "./moves/milestone.js";
import {
  extractRiders,
  collectFiringRiders,
  partitionRiders,
  applyMeterRiders,
  normaliseRider,
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

import { resolveRelevance, wholeWordsFit } from "./context/relevanceResolver.js";
import { suppressScene, postXCardCard, clearXCard } from "./context/safety.js";
import { startScene, endScene, mergeOwnedFields, persistCampaignStateFields } from "./factContinuity/sceneLifecycle.js";
import { rollSessionIfDue, registerSessionActivityHook, SESSION_MINT_FIELDS, isSessionActive } from "./session/lifecycle.js";
import { getCurrentSiteKind } from "./entities/location.js";
import { recordOracleResult } from "./oracles/oracleMemory.js";
import { openCorrectionDialog } from "./factContinuity/correctionDialog.js";
import { handleFactContinuityCommand } from "./factContinuity/chatCommands.js";
import { requestOracleNarration } from "./oracles/oracleFollowup.js";
import { inferShipPosition, inferShipPositionFromEntityId } from "./factContinuity/shipPosition.js";
import {
  routePacedInput,
  consumeForceMove,
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
import { registerSwearVowHandler, registerSharedVowSyncHook, registerRewardChoiceHook, swearSharedVowForAll, registerPlayerVowHook, registerPlayerVowSwearHook, registerPlayerVowLinkHook } from "./session/swearVow.js";
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
import { isCanonicalGM, hasKeyedActiveGM, advertiseClaudeKeyPresence } from "./multiplayer/gmGate.js";
import { registerGmRelaySocket, announceGmRelayReady, requestGmAction } from "./multiplayer/gmRelay.js";
import { relayCardAction } from "./moves/cardActions.js";
import { advanceClocksOnPayThePrice } from "./clocks/payThePriceClocks.js";
import { takeNextMoveAdd, clearPersistedNextMoveAdd, grantNextMoveBonus, consumeNextMoveBonus } from "./moves/nextMoveAdd.js";
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

/**
 * The world refused the keyed-GM registry write a GM's key change made
 * (claudeApiKey's onChange). The rejection was swallowed whole: every client
 * kept routing Claude work as before — the key just pasted never used, the
 * table still keyless — with no word to anyone (issue #337 Y40). Warned as
 * the ready-time advertise is, and the GM who changed the key is told. Only
 * a reload retries it: saving the same key again changes no setting.
 *
 * @param {Error} err
 */
function warnKeyAdvertiseRefused(err) {
  console.warn(`${MODULE_ID} | keyed-GM advertise failed:`, err);
  let keyed = true;
  try { keyed = !!game.settings.get(MODULE_ID, "claudeApiKey"); }
  catch (e) { console.debug?.(`${MODULE_ID} | keyed-GM advertise: key state unread:`, e?.message ?? e); }
  ui.notifications?.warn?.(keyed
    ? "Starforged Companion: your Claude key could not be registered for the table (the world did not save it) — the table will not route its narration to your key until you reload Foundry."
    : "Starforged Companion: your cleared Claude key could not be unregistered for the table (the world did not save it) — narration may still be routed to your client until you reload Foundry.");
}

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
    onChange: () => { advertiseClaudeKeyPresence().catch(warnKeyAdvertiseRefused); },
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
    name:     "Speech Input Language",
    hint:     "BCP 47 language tag for speech recognition, e.g. en-US, en-GB.",
    scope:    "client",
    config:   true,
    type:     String,
    default:  "en-US",
    // The language is read when the speech controller is built, so a change
    // was ignored until a reload (issue #326 W87): rebuild it, as the
    // Push-to-Talk switch does (#306 R10). Push-to-talk switched off stays off.
    onChange: () => {
      if (game.settings.get(MODULE_ID, "speechInputEnabled")) initSpeechInput();
    },
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
 * `!scene end`, End Session and the 4-hour re-mint.
 */
async function handleSceneQueryCommand(message) {
  const text     = message.content?.trim() ?? "";
  const question = text.replace(/^@scene\s*/i, "").trim();
  if (!question) {
    console.debug(`${MODULE_ID} | @scene: empty question — nothing to ask.`);
    return;
  }
  // A working copy: the answer mints a scene and applies its sidecar on the
  // object it is given, and a refused write must leave this client's cached
  // setting as the world has it (issue #329 X09).
  const campaignState = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
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
  const session = /^!recap\s+session(?:\s+(\d+))?/i.exec(text);
  if (session) {
    // `!recap session 3` recaps session 3 — the number was matched and dropped,
    // so every N recapped the current session (issue #322 V05).
    await postSessionRecap(campaignState, null, { sessionNumber: session[1] ? Number(session[1]) : null });
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
 *
 * A forced move a claimed card button posted (`deferWhileBusy`) that arrives
 * while another move holds the lock is held and run when the lock frees —
 * see deferForcedMove (issue #325 W02) — and one that arrives before a
 * session has begun is held until one does (issue #329 X14).
 */
export function registerChatHook() {
  const onMessage = async (message) => {
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
    // The author is told why nothing happened (issue #329 X14): the line just
    // sat in chat, and a card button's forced move vanished. A claimed card's
    // forced move is held until a session begins, as the move lock holds it
    // (issue #325 W02) — its button reads taken everywhere.
    let sessionActive = true;
    try {
      sessionActive = isSessionActive(game.settings.get(MODULE_ID, "campaignState"));
    } catch (err) {
      // Defensive: if the read fails, fail-OPEN — treat the session as
      // active and run the pipeline. The downside of fail-closed is
      // "narration completely stops working on a module-load edge case",
      // which is worse than "pre-session narration runs once".
      console.warn(`${MODULE_ID} | session-active gate check failed (failing open):`, err?.message ?? err);
    }
    if (!sessionActive) {
      const held = message.flags?.[MODULE_ID]?.deferWhileBusy === true;
      if (held) {
        deferForcedMove(message, { untilSession: true });
        markHeldUntilSession(message, true);
      }
      await postSessionGateNotice(message, { held }).catch(err =>
        console.warn(`${MODULE_ID} | the no-session notice failed:`, err?.message ?? err));
      return;
    }
    _sessionGateTold.clear();

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
    // The connection a forced Swear an Iron Vow is sworn to — its card's: the
    // inciting vow's target, or the one a sheet-made vow is linked to. +1, or
    // +2 when bonded (issue #325 W18).
    const swearToConnection = typeof message.flags?.[MODULE_ID]?.swearToConnection === "string"
      ? message.flags[MODULE_ID].swearToConnection
      : null;

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

    // A player with no character of their own, at a table of two or more PCs,
    // is not rolled as another player's PC (issue #326 D8, following #321
    // U23's rule): resolveSpeakerActorId gave them none — the first PC is only
    // a GM's, or the one PC's in solo play — and the pipeline's own fallback
    // to the first PC rolled the move with that PC's stats, landed its meters
    // on it and named it the roller. They are told, and nothing is rolled.
    if (!speakerActorId && getPlayerActors().length >= 2) {
      await postNoCharacterNotice(message).catch(err =>
        console.warn(`${MODULE_ID} | no-character notice failed:`, err?.message ?? err));
      return;
    }

    // Concurrency guard — one move at a time. A second narration that arrives
    // while a pipeline is running would otherwise race on campaignState writes
    // and post duplicate narration cards.
    const campaignState = game.settings.get(MODULE_ID, "campaignState");
    if (campaignState.pendingMove) {
      // A claimed card's forced move is held, not dropped: its button reads
      // taken everywhere, so a drop lost the action (issue #325 W02).
      if (message.flags?.[MODULE_ID]?.deferWhileBusy === true) {
        deferForcedMove(message);
        return;
      }
      ui?.notifications?.info(
        "Starforged Companion: A move is already being resolved. " +
        "Please wait for the current narration to complete.",
        { permanent: false }
      );
      return;
    }

    // Claim the lock before any async work so other clients see it immediately.
    // The claimant rides it: if their browser goes, the next canonical GM
    // releases a lock nobody holds (releaseLockOfDisconnectedGM, issue #325
    // W25). So does the claim's own token: this pipeline releases the lock
    // only while the store still holds this claim — after a handover its GM
    // may have claimed it again for a later move (issue #329 X08).
    const lockClaim = foundry.utils.randomID();
    campaignState.pendingMove = true;
    campaignState.pendingMoveBy = game.user?.id ?? null;
    campaignState.pendingMoveClaim = lockClaim;
    try {
      await game.settings.set(MODULE_ID, "campaignState", campaignState);
    } catch (err) {
      // The claim never landed. `campaignState` is this client's cached
      // setting value (Foundry returns it by reference): left set, the flag
      // refused every later move here until a reload (issue #302).
      campaignState.pendingMove = false;
      campaignState.pendingMoveBy = null;
      campaignState.pendingMoveClaim = null;
      console.error(`${MODULE_ID} | could not claim the move lock:`, err);
      ui.notifications?.error?.("Starforged Companion: the move could not start — the world did not save it. Try again.");
      return;
    }
    // Whether this move has released its lock. Once it has, the lock may be
    // another move's: the early release below lets the next move start while
    // this one's rider prompt is open, so this move's finally must not clear
    // it again (issue #315 S01).
    let lockReleased = false;

    const apiKey = apiKeyForPacing;
    const dial   = getMischiefDial();

    try {
      // A `!roll` is spent by the line that runs — this one, now it holds the
      // lock — never by one the lock or the no-character check refused (issue
      // #331 X37). Inside the try: the finally releases the lock whatever it does.
      if (pacingResult.forced) await consumeForceMove(campaignState);

      // The roller's combat position, resolved once: their own in the open
      // fight, else the fight's when one is open (position is per character —
      // issue #322 V03: one PC's bad spot remapped another's Strike to Clash).
      // Fed to the interpreter so it only proposes position-appropriate combat
      // moves (constrainMoveToPosition forces the result legal), and reused
      // below for the Take Decisive Action bad-spot downgrade. null out of
      // combat, or when it cannot be told which fight applies.
      const combatPosition = await getActiveCombatPosition(speakerActorId ?? getPlayerActors()[0]?.id ?? null);

      const interpretation = forcedMoveId
        ? buildForcedInterpretation(forcedMoveId, narration, dial, forcedMoveTarget, forcedMoveTargetId)
        : await interpretMove(narration, {
            campaignState,
            mischiefLevel: dial,
            apiKey,
            combatPosition,
          });
      if (swearToConnection && interpretation?.moveId === "swear_an_iron_vow") {
        interpretation.swearToConnection = swearToConnection;
      }
      // A forced move whose stat is a choice rolls the one its narration's
      // approach fits — a stat-only interpretation — not its first listed
      // stat (issue #321 U04). No key keeps the listed stat.
      if (forcedMoveId) {
        await enrichForcedMoveStat(interpretation, {
          interpret: apiKey
            ? (text, moveId) => interpretMove(text, { campaignState, mischiefLevel: dial, apiKey, expectedMoveSlug: moveId })
            : null,
        });
      }

      if (interpretation.mischiefApplied) {
        // The aside plays on the gap between what the player SAID and the move
        // the Trickster chose — the narration, not the model's rationale
        // (issue #326 W50: the fight-reframe lines never fired).
        interpretation._mischiefAside = buildMischiefAside(
          narration ?? "",
          interpretation.moveId,
          interpretation.statUsed,
          dial
        );
      }

      // Take Decisive Action scores one fight's progress. With two or more
      // fights open and none named — a typed "I take decisive action", or a
      // combat card whose fight nothing named — it would score nothing: a
      // certain miss. Ask which fight instead of rolling; each pick posts the
      // move again with that fight's id (TDA-BUTTON-NO-TARGET). Strike and
      // Clash mark one fight's progress and Undertake an Expedition one
      // expedition's: unnamed among several, they made a phantom track (issue
      // #321 U16), so they ask too — a named destination is its own
      // expedition, or a new one.
      const whichTrackType =
        ["take_decisive_action", "strike", "clash"].includes(interpretation.moveId) ? "combat"
        : interpretation.moveId === "undertake_an_expedition" ? "expedition"
        : null;
      if (whichTrackType && !interpretation.moveTargetId) {
        const tracks = await listProgressTracks().catch(err => {
          console.warn(`${MODULE_ID} | which-${whichTrackType === "combat" ? "fight" : "expedition"} lookup failed:`, err?.message ?? err);
          return [];
        });
        const open   = tracks.filter(t => t.type === whichTrackType && !t.completed);
        const target = interpretation.moveTarget ?? null;
        const unresolved = whichTrackType === "combat"
          ? !selectCombatTrack(open, target)
          : !(typeof target === "string" && target.trim());
        if (open.length >= 2 && unresolved) {
          await postWhichFightCard({
            moveId:    interpretation.moveId,
            moveName:  interpretation.moveName,
            narration,
            actorId:   speakerActorId ?? null,
            fights:    open,
            trackType: whichTrackType,
          }).catch(err =>
            console.warn(`${MODULE_ID} | which-${whichTrackType === "combat" ? "fight" : "expedition"} card failed:`, err?.message ?? err));
          return;
        }
      }

      // The ROLLER's character (decisions.md → "Multiplayer attribution"):
      // the speaker resolved from the message. The first PC is the fallback
      // only where resolveSpeakerActorId leaves none and the move still runs —
      // no PC of the author's own at a one-PC (or empty) table; a PC-less
      // player at a table of several was told above (issue #326 D8).
      // One actor drives the ability scan, the stat substitution it offers,
      // and the stat values read below — scanning PC A's assets but reading
      // PC B's stats offered substitutions B doesn't have.
      const speakerActor = speakerActorId ? game.actors?.get(speakerActorId) : null;
      const rollerActor  = speakerActor ?? getPlayerActors()[0] ?? null;

      // Every PC's vows, each copy with its holder — speaker first so a name
      // tie resolves to the roller's own copy.
      const readAllVows = async () => {
        const actors = getPlayerActors();
        actors.sort((a, b) =>
          (a.id === speakerActorId ? -1 : 0) - (b.id === speakerActorId ? -1 : 0));
        return actors.flatMap(a => readVows(a).map(v => ({ ...v, actorId: a.id })));
      };

      // Fulfill Your Vow scores one vow's progress. Naming none while the
      // roller — or, holding none, the table — has several open, it scored
      // nothing: a certain miss. Ask which vow instead of rolling; each pick
      // posts the move again with that vow's copy, as the roller (issue #321
      // U02). A shared vow's copies are one vow (selectFulfilVow).
      if (interpretation.moveId === "fulfill_your_vow" && !interpretation.moveTargetId) {
        const { vow, choices, completed } = selectFulfilVow(await readAllVows(), interpretation.moveTarget ?? null,
          { rollerActorId: rollerActor?.id ?? null });
        // It names a vow that is already fulfilled: nothing is rolled, and no
        // other vow is scored in its place (issue #325 W29).
        if (!vow && completed) {
          await postTrackGoneCard(interpretation).catch(err =>
            console.warn(`${MODULE_ID} | track-gone card failed:`, err?.message ?? err));
          return;
        }
        if (!vow && choices.length >= 2) {
          await postWhichVowCard({ narration, actorId: rollerActor?.id ?? null, vows: choices }).catch(err =>
            console.warn(`${MODULE_ID} | which-vow card failed:`, err?.message ?? err));
          return;
        }
      }

      // Continue a Legacy rolls each legacy track by name. Naming none, it
      // scored 0 — "progress (0 ticks)", a certain miss — and nothing on the
      // card said no track was found (issue #331 X63). Ask which track
      // instead of rolling: the card offers all three, each rolled once.
      if (interpretation.moveId === "continue_a_legacy" && !legacyTrackNamed(interpretation.moveTarget)) {
        const stored = game.settings.get(MODULE_ID, "campaignState") ?? campaignState;
        await postWhichLegacyCard({
          narration, actorId: rollerActor?.id ?? null, tracks: legacyTrackScores(stored?.legacyTracks ?? {}),
        }).catch(err => console.warn(`${MODULE_ID} | which-legacy card failed:`, err?.message ?? err));
        return;
      }

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
      // The active connection records, each with its host Actor id (the
      // `connectionIds` entry the write helpers take) as `__hostId`.
      const listConnections = async () => {
        const conn = await import("./entities/connection.js");
        return (campaignState.connectionIds ?? [])
          .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
          .filter(Boolean);
      };
      const tickInfo = await enrichProgressTicks(interpretation, {
        listTracks: () => listProgressTracks(),
        readAllVows,
        // The crew's shared legacy tracks as they stand (Overcome
        // Destruction, Continue a Legacy — issue #330 D6).
        readLegacyTracks: async () => (game.settings.get(MODULE_ID, "campaignState") ?? campaignState)?.legacyTracks ?? {},
        rollerActorId: rollerActor?.id ?? null,
        listConnections,
      }).catch(err => {
        console.warn(`${MODULE_ID} | progress tick enrichment failed:`, err?.message ?? err);
        return null;
      });

      // Develop Your Relationship with a bonded connection is a roll +rank: the
      // connection is resolved before the dice and its rank is the stat (issue
      // #314 Q06 — the schema lists no stat, so a bonded development rolled +0
      // where `!bond` rolled +rank). The develop branch below marks the
      // connection resolved here, by its id.
      await enrichBondedDevelop(interpretation, { listConnections }).catch(err => {
        console.warn(`${MODULE_ID} | bonded develop enrichment failed:`, err?.message ?? err);
        return null;
      });

      // The "not rolled" guards come before any +1 is taken: a move that is
      // not rolled pays no add, and both decisions put the +1 on the next
      // action roll MADE — a claim that adds nothing leaves it pending (issue
      // #331 X17: a forced Battle on a fight that had ended ate Take a
      // Break's +1 and the roller's own, then rolled nothing).
      //
      // A roll started from a track (a Progress Tracks row, an expedition
      // card, a "Which vow?" pick) names it by id. When that track was
      // deleted or finished meanwhile, nothing is rolled — and it says so: a
      // same-named sibling is a different fight, and a score of 0 would be a
      // certain miss with its consequences (issue #306 R06, #321 U02).
      if (interpretation.moveTargetId
          && (tickInfo?.source === "combat" || tickInfo?.source === "expedition" || tickInfo?.source === "vow")
          && !tickInfo.trackId) {
        await postTrackGoneCard(interpretation).catch(err =>
          console.warn(`${MODULE_ID} | track-gone card failed:`, err?.message ?? err));
        return;
      }
      // Battle is an action roll, so the guard above (progress moves) let a
      // Battle naming a finished fight by id roll in full — its +2 momentum
      // or a Pay the Price for a fight that was over (issue #325 W11).
      if (interpretation.moveId === "battle" && interpretation.moveTargetId) {
        const fights = await listProgressTracks().catch(() => []);
        const fight  = fights.find(t => t.id === interpretation.moveTargetId);
        if (!fight || fight.completed) {
          await postTrackGoneCard(interpretation).catch(err =>
            console.warn(`${MODULE_ID} | track-gone card failed:`, err?.message ?? err));
          return;
        }
      }

      // Take a Break → "Move on": a single-use +1 on the next action roll (not
      // a progress move). Consumed from the working copy (so persistResolution's
      // clone can't resurrect it) and from the stored campaignState. Taken
      // after the enrichment, on the roll kind it resolved: a bonded Develop
      // Your Relationship (no roll by its data) rolls +rank and takes the +1
      // (issue #326 W48 — it was taken by the next roll after it).
      const rollKind = interpretation.rollKind ?? null;
      const breakAdd = takeNextMoveAdd(campaignState, interpretation.moveId, { rollKind });
      if (breakAdd > 0) {
        interpretation.adds = (interpretation.adds ?? 0) + breakAdd;
        await clearPersistedNextMoveAdd();
      }
      // "+1 on your next move" the roller earned (Secure an Advantage, Gain
      // Ground): their own, on their next action roll — claimed on the store
      // first, so a refused claim adds nothing (issue #322 V02).
      const bonusAdd = await consumeNextMoveBonus(campaignState, rollerActor?.id ?? null, interpretation.moveId, { rollKind });
      if (bonusAdd > 0) {
        interpretation.adds = (interpretation.adds ?? 0) + bonusAdd;
      }
      // Heal: the patient — an ally the care is for, or a companion — resolved
      // before the dice; the recovery card checks and heals them, not the
      // healer (issue #325 W04).
      resolveHealPatient(interpretation, rollerActor, { players: getPlayerActors() });
      // Aid Your Ally: the ally whose benefits a hit is (issue #325 W17).
      resolveAidedAlly(interpretation, rollerActor, { players: getPlayerActors() });
      // A bonded Test Your Relationship adds +1; a vow sworn to a connection
      // +1, to a bonded one +2 (issue #325 W18).
      const bondAdd = await enrichBondAdds(interpretation, { listConnections }).catch(err => {
        console.warn(`${MODULE_ID} | bond add enrichment failed:`, err?.message ?? err);
        return 0;
      });
      if (bondAdd > 0) interpretation.adds = (interpretation.adds ?? 0) + bondAdd;

      // Take Decisive Action — the resolver applies the bad-spot downgrade
      // (play kit p. 5). Prefer the scored fight's position for the roller —
      // their own there, else the fight's (enrichProgressTicks; exact even
      // with several open fights, where getActiveCombatPosition can return
      // null); fall back to the position resolved at the top of this block.
      // resolveMove gates the downgrade on moveId, so passing a position for
      // every move is safe (no-op for non-TDA moves).
      const resolvedPosition =
        (interpretation.moveId === "take_decisive_action" && tickInfo?.combatState)
          ? tickInfo.combatState
          : combatPosition;
      // Site-aware waypoint seeds (SITE-WAYPOINT-BLIND): when the crew's
      // current location is a vault or derelict, explore_a_waypoint rolls
      // that site's canonical interior tables.
      const currentSite = getCurrentSiteKind(campaignState);
      // The roller's momentum as the dice are rolled: negative and matching the
      // action die, it cancels the die (resolver cancelsActionDie). Never read,
      // a -3 momentum never cancelled a 3 (issue #311 P01).
      const momentum = rollerActor ? readMomentumState(rollerActor).value : null;
      // Aid Your Ally resolves as Gain Ground while a fight is open, else as
      // Secure an Advantage (issue #325 W17).
      const inFight = interpretation.moveId === "aid_your_ally"
        && (await listProgressTracks().catch(() => [])).some(t => t.type === "combat" && !t.completed);
      const resolution = resolveMove(interpretation, campaignState, { combatPosition: resolvedPosition, currentSite, momentum, inFight });
      // resolveMove leaves the id to its caller. The move card's Burn / Improve
      // flags and the narration card both carry it, and superseding the
      // original narration after an upgrade finds that card by it — with no id
      // the struck-through pre-burn prose was never struck and kept reaching
      // the narrator's recent-narration ring (issue #300 F02).
      resolution._id = foundry.utils.randomID();

      // The outcome's effects beyond the roller's meters and its choice card —
      // an arrival, the expedition's progress, a legacy mark, the companion's
      // health, the fight's threshold, progress, position and end — through
      // the one applier Burn Momentum and Improve Result also run, for what
      // their upgraded outcome adds over this one (UPGRADE-PIPELINE-EFFECTS).
      // The fight the move was about comes back for its cards.
      const { moveFight } = await applyOutcomeEffects({
        resolution, interpretation, campaignState, rollerActor, speakerActor, tokenDragSetCourse,
      });

      // Develop Your Relationship (audit 3.14) — GM-gated. An un-bonded
      // connection marks its own relationship track ("no roll, mark progress");
      // a bonded connection pays the rolled outcome (§3.3.5,
      // BONDED_DEVELOP_OUTCOMES: strong 2 bonds-legacy ticks / weak +2
      // momentum / miss nothing), and a strong hit with a match raises its rank
      // by one (issue #322 V01).
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
            // A Test Your Relationship hit develops with the test's own roll,
            // whose consequences cannot know the connection is bonded: its weak
            // hit's +2 momentum joins them here, before the card and the
            // persist, so it is credited to the roller with the move's other
            // meters. Develop Your Relationship's roll carries it from the
            // resolver already.
            if (plan.momentum > 0 && resolution.moveId !== "develop_your_relationship" && resolution.consequences) {
              resolution.consequences.momentumChange =
                Number(resolution.consequences.momentumChange ?? 0) + plan.momentum;
            }
            if (plan.raiseRank && plan.newRank && plan.connection.__hostId) {
              await conn.updateConnection(plan.connection.__hostId, { rank: plan.newRank }).catch(err =>
                console.warn(`${MODULE_ID} | develop: rank raise failed:`, err?.message ?? err));
              // Mirror onto the PCs' bond Items so CHARACTER STATE shows the
              // raised rank (NARR-BOND-RANK-STALE). The Items are keyed by the
              // record's `_id`, not the host Actor id (issue #314 Q04 — the
              // host id matched nothing, and the name fallback hid it until a
              // rename).
              await setBondItemRank(
                { connectionId: plan.connection._id, name: plan.connection.name },
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
        // The oath scene is the roller's, as the move narration is.
        if (incitingMsg) {
          await swearSharedVowForAll(incitingMsg, { speakerActorId: rollerActor?.id ?? null }).catch(err =>
            console.warn(`${MODULE_ID} | inciting swear creation failed:`, err?.message ?? err));
        } else {
          await narrateAndPostVowSwearing({
            vow: { name: interpretation.moveTarget ?? null, rank: null },
            campaignState,
            speakerActorId: rollerActor?.id ?? null,
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
            // site it led to (precursor vault / derelict). The discovered flag
            // is folded into the in-memory campaignState so it rides along with
            // the pending persistResolution write below (revealSectorSite sets
            // it on a copy — issue #326 W51); the scene pin + passage and the
            // location Actor update apply at once.
            try {
              const { revealSectorSite, postSiteDiscoveryCard } = await import("./sectors/siteDiscovery.js");
              const revealed = await revealSectorSite(fin.track?.label ?? interpretation.moveTarget, {
                source:   "expedition",
                siteId:   fin.track?.siteId ?? null,
                getState: () => campaignState,
                setState: (next) => { campaignState.sectors = next.sectors; },
              });
              if (revealed) {
                noteUnsavedOnCopy(campaignState, { step: "site", sectorId: revealed.sector?.id ?? null,
                  siteId: revealed.site?.id ?? null, name: revealed.site?.name ?? null });
                await postSiteDiscoveryCard(revealed);
              }
            } catch (err) {
              console.warn(`${MODULE_ID} | site reveal on finish-expedition failed:`, err?.message ?? err);
            }
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | finish expedition failed:`, err?.message ?? err);
        }
      }

      // Finish the Scene (issue #326 D6) — the scene concludes on every
      // outcome: its challenge track completes and its tension clock retires
      // here, before a weak hit's or miss's Pay the Price (routed below) could
      // advance the clock of a scene that has ended.
      if (resolution.consequences?.finishScene && game.user.isGM) {
        try {
          const { finishSceneChallenge } = await import("./moves/sceneChallenge.js");
          const { retireClock } = await import("./clocks/clocks.js");
          const fin = await finishSceneChallenge(
            { moveTarget: interpretation.moveTarget ?? null, moveTargetId: interpretation.moveTargetId ?? null },
            {
              listTracks:    () => listProgressTracks(),
              completeTrack: (id) => completeProgressTrack(id),
              retireClock:   (id) => retireClock(id),
            },
          );
          if (fin?.track) {
            await postSceneFinishCard(fin.track).catch(err =>
              console.warn(`${MODULE_ID} | scene finish card failed:`, err?.message ?? err));
          } else {
            console.warn(`${MODULE_ID} | finish the scene: no open scene challenge matched "${interpretation.moveTarget ?? "?"}" — nothing finished.`);
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | finish the scene failed:`, err?.message ?? err);
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

      // Fulfill Your Vow and Forge a Bond MISS — the same recommit, offered as
      // a click on the vow scored or the connection forged (issue #330 D1):
      // "roll both challenge dice, take the lowest value, clear that number
      // of progress boxes, and raise the rank by one". It was advisory text
      // the GM applied by hand to the vow's copies or the connection's record
      // and its bond Items.
      if (resolution.outcome === "miss" && game.user.isGM
          && (resolution.moveId === "fulfill_your_vow" || resolution.moveId === "forge_a_bond")) {
        try {
          if (resolution.moveId === "fulfill_your_vow") {
            const vowName = (tickInfo?.source === "vow" ? tickInfo.label : null) ?? interpretation.moveTarget ?? null;
            const itemId  = tickInfo?.source === "vow" ? (tickInfo.trackId ?? null) : null;
            if (vowName) await postVowRecommitOfferCard({ vowName, itemId, actorId: rollerActor?.id ?? null });
            else console.debug(`${MODULE_ID} | vow recommit offer skipped — no vow was scored.`);
          } else {
            const conn = await import("./entities/connection.js");
            const connections = (campaignState.connectionIds ?? [])
              .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
              .filter(Boolean);
            const target = selectConnection(connections, interpretation.moveTarget ?? null,
              { hostId: interpretation.moveTargetId ?? null, unbonded: true });
            if (target?.__hostId && !target.bonded) await postBondRecommitOfferCard(target, rollerActor?.id ?? null);
            else console.debug(`${MODULE_ID} | bond recommit offer skipped — no un-bonded connection matched "${interpretation.moveTarget ?? "?"}".`);
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
          // The vow the roll scored names the journal twin to close — a
          // fulfilment that names none (the Attempt to Fulfill button) fell to
          // the sole open journal vow, another vow's twin (issue #326 W44).
          const scoredVowName = tickInfo?.source === "vow" ? (tickInfo.label ?? null) : null;
          const fin = await finishVow(
            { moveTarget: scoredVowName ?? interpretation.moveTarget, ranksDown },
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
          // A vow already fulfilled on the sheet carries `fulfilPaid` (the
          // native payoff's claim — the vendor leaves the Item open, so it can
          // be fulfilled again here): its Quests legacy is paid, and the write
          // below paid it a second time (issue #325 W28).
          const legacyPaid = resolveVowItemCopies(vowName, vowKey).copies
            .some(({ item }) => item?.flags?.[MODULE_ID]?.fulfilPaid === true);
          const itemDone = await completeVowItemByName(vowName, vowKey);

          if (fin?.track) {
            if (fin.legacyTicks > 0 && !legacyPaid) addLegacyTicks(campaignState, "quests", fin.legacyTicks);
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
            const ticks = legacyPaid ? 0 : legacyRewardTicks(itemDone.rank, ranksDown);
            if (ticks > 0) addLegacyTicks(campaignState, "quests", ticks);
            await payFulfilledVowNative(vowName, resolution.outcome, { skipLegacy: true, ...vowKey });
            await postFulfillVowCard({ track: { label: itemDone.name, rank: itemDone.rank }, legacyTicks: ticks, legacyPaid }).catch(err =>
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

      // TDA weak hit — roll decisive_action_cost d100 and post a visible card.
      // Entry 1-40 carries sufferRoute {move:"any", amount:2} which opens the
      // B1 generic suffer picker so the player can choose which move takes -2.
      if (resolution.consequences?.rollDecisiveActionCost && game.user.isGM) {
        await postDecisiveActionCostCard(rollerActor?.id ?? null).catch(err =>
          console.warn(`${MODULE_ID} | decisive action cost card failed:`, err?.message ?? err));
      }

      // A result that routes Pay the Price (a Face Danger / Strike / Set a
      // Course … miss, Face Defeat) — roll pay_the_price d100, post a visible
      // card under the move that paid it, and dispatch any routable suffer
      // entry (as typing !pay-the-price does). Capture the PtP reversals
      // (clocks advanced + suffer meter applied) so the burn button can undo
      // them when the player burns momentum to upgrade the outcome.
      let ptpReversals = null;
      if (resolution.consequences?.routePayThePrice && game.user.isGM) {
        const ptp = await postMovePayThePriceCard(rollerActor?.id ?? null, resolution.moveName ?? null, resolution._id ?? null).catch(err => {
          console.warn(`${MODULE_ID} | ${resolution.moveName ?? "move"} PtP card failed:`, err?.message ?? err);
          return null;
        });
        ptpReversals = ptp?.reversals ?? null;
        // The move's narration depicts this card's price — the one the table
        // pays; the resolver rolled none for it (issue #321 U03).
        resolution.oracleSeeds = withPayThePriceSeed(resolution.oracleSeeds, resolution.moveId, ptp?.price ?? null);
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
      // What the move was made against: its suffer-choice card changes that
      // vehicle, companion or fight (issue #309), and so does the choice card
      // an upgrade of its result posts (issue #311 P03).
      const moveTargets = {
        vehicleActorId:  interpretation.vehicleActorId ?? null,
        companionItemId: interpretation.companionItemId ?? null,
        combatTrackId:   moveFight?.id ?? null,
        // Heal's patient: its recovery is checked against and applied to them
        // (issue #325 W04). Absent for every other move.
        ...(interpretation.patientActorId ? { patientActorId: interpretation.patientActorId } : {}),
        ...(interpretation.patientCompanionItemId ? { patientCompanionItemId: interpretation.patientCompanionItemId } : {}),
        // Aid Your Ally's ally: a hit's benefits — the choice card's too —
        // are theirs (issue #325 W17).
        ...(interpretation.allyActorId && resolution.consequences?.beneficiary === "ally"
          ? { allyActorId: interpretation.allyActorId } : {}),
      };
      // What an upgrade of this result needs to apply the upgraded outcome's
      // other effects as this pipeline applied the original's — the move's
      // target, its id and the ranks the interpreter inferred
      // (applyOutcomeEffects; UPGRADE-PIPELINE-EFFECTS).
      const moveContext = {
        moveTarget:     interpretation.moveTarget ?? null,
        moveTargetId:   interpretation.moveTargetId ?? null,
        combatRank:     interpretation.combatRank ?? null,
        expeditionRank: interpretation.expeditionRank ?? null,
      };
      const burnActor   = rollerActor;
      const burnState   = buildBurnState(resolution, burnActor, ptpReversals, moveTargets, moveContext);
      // Post-roll "improve the result" affordance (finding G) — e.g. Fugitive's
      // "improve the result to a strong hit" at the cost of filling its clock.
      // Driven by the same abilities surfaced pre-roll on the confirm dialog.
      // A miss's Pay the Price is undone by either upgrade (issue #311 P05).
      const improveState = buildImproveState(resolution, interpretation.applicableAbilities, burnActor, ptpReversals, moveTargets, moveContext);
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
        rollerActor?.id ?? null,
      );

      // Step 10: narrate the consequence directly via Claude — no GM dependency.
      // The result card is on the table: the result is applied below whatever
      // happens to its narration. narrateResolution posts a fallback card when
      // the Claude call fails, but when the narrator card and that fallback
      // are both refused its rejection skipped the persist — the strong hit
      // showed and never landed (issue #322 V09).
      await narrateResolution(resolution, campaignState, { relevance, speakerActorId }).catch(err => {
        console.warn(`${MODULE_ID} | the move's narration could not be posted — its result is applied all the same:`, err?.message ?? err);
        ui.notifications?.warn?.("Starforged Companion: the narration could not be posted to chat; the move's result was still applied.");
      });

      // Only the GM can write world-scoped settings (campaignState).
      // Players trigger the pipeline but defer persistence to the GM's client.
      if (game.user.isGM) {
        // What the move was made against rides onto its suffer-choice card,
        // so a choice changes that vehicle, companion or fight (issue #309).
        // A refused record is not a failed interpretation: the move resolved
        // and its meters stand, so the pipeline goes on — what the record
        // carried is on the GMs' card, with a Retry (issue #331 X18).
        try {
          await persistResolution(resolution, campaignState, speakerActorId, moveTargets);
        } catch (err) {
          if (!err?.moveRecordRefused) throw err;
          console.error(`${MODULE_ID} | ${err.message}`);
          await reportUnsavedMoveRecord(campaignState, {
            actorId: rollerActor?.id ?? null, moveName: resolution.moveName ?? null, error: String(err.cause?.message ?? err.cause ?? err.message),
          });
        }
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
        // This roller's earlier move cards: their Burn / Improve belonged to
        // the moves being made then — closed now this one has resolved (issue
        // #326 D4). Canonical GM: the pipeline runs there.
        await closeUpgradesForLaterMove(rollerActor?.id ?? null, resolution._id ?? null).catch(err =>
          console.warn(`${MODULE_ID} | closing earlier move cards' upgrades failed:`, err?.message ?? err));

        // The move is resolved, persisted, and narrated — the critical section
        // the concurrency lock guards (campaignState writes + narration) is now
        // complete. Release the lock HERE, before the interactive rider prompt.
        // applyMoveConsequenceRiders can open a GM dialog (riderDialog.js); if it
        // held the lock, an unanswered or unnoticed dialog left
        // campaignState.pendingMove = true and every subsequent player input hit
        // the "a move is already being resolved" guard — the v1.7.12 lockup
        // (known-issues PLAYTEST-1712 M/N, fixed here). The finally below
        // releases for the throw / cancelled-confirm paths, and retries a
        // release that was refused here.
        lockReleased = await releasePendingMoveLock(lockClaim);

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
      // Safety net: release the lock if the pipeline threw or the confirm
      // dialog was cancelled before the success-path release above ran, or
      // that release was refused. Never once it has landed: a later move may
      // hold the lock by now (issue #315 S01).
      if (!lockReleased) await releasePendingMoveLock(lockClaim);
    }
  };
  Hooks.on("createChatMessage", onMessage);
  // A held forced move runs once a campaignState write leaves the lock free
  // — the pipeline's own release, a stale lock cleared at load (issue #325
  // W02).
  Hooks.on("updateSetting", (setting) => drainDeferredForcedMoves(setting, onMessage));
  // A GM who leaves mid-move takes their lock with them (issue #325 W25).
  Hooks.on("userConnected", (user, connected) => {
    releaseLockOfDisconnectedGM(user, connected).catch(err =>
      console.warn(`${MODULE_ID} | releasing a departed GM's move lock failed:`, err?.message ?? err));
  });
}

// ── A move lock whose GM is gone (issue #325 W25) ──────────────────────────

/**
 * `userConnected(user, false)`: a GM who held the move lock left — their
 * browser crashed, closed or dropped mid-move. With two GMs, canonicity passes
 * to the other at once, but the only stale-lock reset was the `ready` hook of
 * the client canonical at its own load: every move was refused ("A move is
 * already being resolved") until such a GM reloaded. The new canonical GM
 * releases a lock the departed user held (`pendingMoveBy` — or, on a lock from
 * before the claimant was stamped, held by nobody named) and whispers the GMs
 * that the move may be incomplete.
 *
 * @param {User} user — the user who connected or left
 * @param {boolean} connected
 */
async function releaseLockOfDisconnectedGM(user, connected) {
  if (connected || !user?.isGM || !isCanonicalGM()) return;
  const cs = game.settings.get(MODULE_ID, "campaignState");
  if (!cs?.pendingMove) return;
  const holder = cs.pendingMoveBy ?? null;
  if (holder && holder !== user.id) return;
  const released = await releasePendingMoveLock();
  if (!released) return;
  console.warn(`${MODULE_ID} | ${user.name ?? user.id} left while a move was being resolved — the move lock is released.`);
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>Move lock released</strong><p>${escapeChatHtml(user.name ?? "A GM")} disconnected while a move was being resolved. The table can move again; that move's narration or its result may be incomplete — check its card.</p></div>`,
    whisper: gmUserIds(),
    flags:   { [MODULE_ID]: { moveLockReleasedCard: true } },
  }).catch(err => console.warn(`${MODULE_ID} | move-lock card failed:`, err?.message ?? err));
}

/**
 * The move lock a world load finds on the canonical GM: stale — returned as
 * `{ claim }` for the ready reset to clear — unless another user who is
 * connected holds it. Then that GM's pipeline is mid-move and the lock stands
 * (issue #335 Y07: a co-GM's load released it mid-narration). The handover's
 * rule above: the claimant's departure is the event that matters (W25). A
 * lock that names no claimant (from before W25), or that this client's own
 * earlier page held, is stale.
 *
 * @param {Object} state — campaignState with `pendingMove` set
 * @returns {{ claim: string|null }|null}
 */
function staleMoveLockAtReady(state) {
  const holder = state?.pendingMoveBy ?? null;
  const user = holder && holder !== game.user?.id ? game.users?.get?.(holder) : null;
  if (user?.active) {
    console.log(`${MODULE_ID} | The move lock is held by ${user.name ?? holder}, who is connected and resolving a move — not reset on ready.`);
    return null;
  }
  return { claim: state?.pendingMoveClaim ?? null };
}

// ── Forced moves held while another move is resolved (issue #325 W02) ───────

// Message ids, oldest first, of forced moves a claimed card button posted
// while another move held the lock — this client's: only the canonical GM
// runs the pipeline. Held in memory: a reload loses them (the claim stands).
const _deferredForcedMoves = [];
// Ids of held moves already handed back to the pipeline once: one that meets
// the lock again (another move claimed it first) keeps its place at the front.
const _drainedForcedMoves = new Set();

/**
 * Hold a forced move that met the move lock. A card button's GM handler
 * (cardActions.js: "⚑ Mark Progress on Vow", a "Which vow?" pick, a
 * connection pick, a waypoint's 🔭 / 🌀) claims its GM-authored card and then
 * posts the move; dropped at the lock, the claim stood — the button read
 * "⚑ Milestone marked" everywhere — and the milestone, fulfil roll,
 * development or discovery was lost. The commonest case was the button's own
 * move: its card is posted before the narration and the lock released after
 * the persist, so the buttons are live for the whole narration.
 *
 * @param {ChatMessage} message — carries `flags[MODULE_ID].deferWhileBusy`
 */
function deferForcedMove(message, { untilSession = false } = {}) {
  const id = message?.id ?? null;
  if (!id || _deferredForcedMoves.includes(id)) return;
  if (_drainedForcedMoves.has(id)) _deferredForcedMoves.unshift(id);
  else _deferredForcedMoves.push(id);
  ui?.notifications?.info(untilSession
    ? "Starforged Companion: No session has begun — the move will be rolled once Begin a Session starts one."
    : "Starforged Companion: A move is already being resolved — the next one will be rolled when it completes.",
  { permanent: false });
}

// Authors told — since a message last passed the session gate — that no
// session has begun: one notice each for their typed lines, not one per line.
const _sessionGateTold = new Set();

/**
 * Tell the author of a message the session gate stopped why nothing happened
 * (issue #329 X14 — the line sat in chat, and a card button's forced move
 * vanished, with no word and not even a console line): whispered to the
 * author and the GMs. A typed line's author is told once until a message
 * passes the gate again; a button's forced move is told every time. A
 * button's forced move is the card's roller's, and a relayed press posts it
 * on the GM — its author — so the roller's players are told too: the one who
 * pressed, or whose card a GM pressed (issue #335 Y17).
 *
 * @param {ChatMessage} message
 * @param {{ held?: boolean }} [opts] — the forced move is held until a session begins
 * @returns {Promise<void>}
 */
async function postSessionGateNotice(message, { held = false } = {}) {
  const forced   = !!message?.flags?.[MODULE_ID]?.forcedMoveId;
  const authorId = messageAuthorId(message);
  const rollerPlayerIds = forced ? speakerOwnerIds(message) : [];
  if (!forced) {
    if (authorId && _sessionGateTold.has(authorId)) {
      console.debug(`${MODULE_ID} | session gate: no session has begun — line not narrated (its author was told).`);
      return;
    }
    if (authorId) _sessionGateTold.add(authorId);
  }
  const how = "Begin a Session (the Session panel, or <code>!begin-session</code>)";
  const body = !forced
    ? `No session has begun, so this was not narrated and no move was rolled. Press ${how} to start play.`
    : held
      ? `No session has begun — this move will be rolled once ${how} starts one.`
      : `This move was not rolled: no session has begun. Press ${how}, then press the button again.`;
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>No session has begun</strong><p>${body}</p></div>`,
    whisper: [...new Set([authorId, ...rollerPlayerIds, ...gmUserIds()].filter(Boolean))],
    // A forced move told to press again names the post the gate dropped: the
    // client that posted it re-arms its button (the inciting ⚔ — issue #337 Y36).
    flags:   { [MODULE_ID]: { sessionGateNotice: true, ...(forced && !held && message?.id ? { gatedMessageId: message.id } : {}) } },
  });
}

/**
 * The players of a forced move's roller: the non-GM users who own the
 * message's speaking PC (the GMs are whispered anyway).
 *
 * @param {ChatMessage} message
 * @returns {string[]}
 */
function speakerOwnerIds(message) {
  const actorId = message?.speaker?.actor ?? null;
  const actor   = actorId ? (game.actors?.get?.(actorId) ?? null) : null;
  if (!actor) return [];
  return Array.from(game.users ?? []).filter(u => u && !u.isGM && userOwnsActor(actor, u)).map(u => u.id);
}

/**
 * Stamp a forced move held until a session begins — or clear it once it is
 * handed back to the pipeline. Its line in chat (posted as the roller) then
 * says so for the whole table, beside the claimed card's "taken" button
 * (issue #335 Y17; renderHeldUntilSessionNote). On the canonical GM, which
 * posted the relayed move; fire-and-forget.
 *
 * @param {ChatMessage} message — the held forced move
 * @param {boolean} held
 */
function markHeldUntilSession(message, held) {
  if (!message?.update || !!liveCardFlags(message)?.heldUntilSession === held) return;
  message.update({ [`flags.${MODULE_ID}.heldUntilSession`]: held }).catch(err =>
    console.warn(`${MODULE_ID} | marking a held move ${held ? "held" : "released"} failed:`, err?.message ?? err));
}

/**
 * A forced move held until a session begins shows it on its line — on every
 * client, while no session is active (a hold lost to a reload says nothing
 * once one has begun: FORCED-MOVE-HOLD-RELOAD).
 *
 * @param {ChatMessage} message
 * @param {HTMLElement} root
 */
function renderHeldUntilSessionNote(message, root) {
  if (!liveCardFlags(message)?.heldUntilSession) return;
  let active = true;
  try { active = isSessionActive(game.settings.get(MODULE_ID, "campaignState")); }
  catch (err) { console.debug?.(`${MODULE_ID} | held-move note: session state unread:`, err?.message ?? err); }
  if (active) return;
  const at = root?.querySelector?.(".message-content") ?? root;
  if (!at?.insertAdjacentHTML || at.querySelector?.(".sf-held-until-session")) return;
  at.insertAdjacentHTML("beforeend",
    `<p class="sf-held-until-session"><em>⏸ Held — no session has begun. This move will be rolled once Begin a Session starts one.</em></p>`);
}
onChatMessageRender((message, root) => renderHeldUntilSessionNote(message, root));

/**
 * On a campaignState write that leaves the move lock free, hand the oldest
 * held forced move back to the pipeline — on the canonical GM only. One per
 * write: the move it starts claims the lock, and its release (another write)
 * hands over the next. A held message deleted meanwhile is skipped.
 *
 * @param {{ key?: string }} setting — the updateSetting hook's document
 * @param {(message: ChatMessage) => Promise<void>} runPipeline
 */
function drainDeferredForcedMoves(setting, runPipeline) {
  if (setting?.key !== `${MODULE_ID}.campaignState`) return;
  if (!_deferredForcedMoves.length || !isCanonicalGM()) return;
  const state = game.settings.get(MODULE_ID, "campaignState");
  if (state?.pendingMove) return;
  // Held until a session begins: the gate would only hold it again (issue #329 X14).
  if (!isSessionActive(state)) return;
  let message = null;
  while (!message && _deferredForcedMoves.length) {
    const id = _deferredForcedMoves.shift();
    message = game.messages?.get?.(id) ?? null;
    if (message) _drainedForcedMoves.add(id);
  }
  if (!message) return;
  const id = message.id;
  markHeldUntilSession(message, false);
  // A move that stops before claiming the lock writes nothing: ask again
  // once it settles, so the queue cannot stall behind it.
  Promise.resolve(runPipeline(message))
    .catch(err => console.warn(`${MODULE_ID} | a held forced move failed:`, err?.message ?? err))
    .finally(() => {
      if (!_deferredForcedMoves.includes(id)) _drainedForcedMoves.delete(id);
      drainDeferredForcedMoves(setting, runPipeline);
    });
}


// ─────────────────────────────────────────────────────────────────────────────
// OUTCOME EFFECTS — one applier for the pipeline and the result upgrades
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The current-location pick ({ id, type, entity }, as resolveCurrentLocationName
 * returns) for a place known by its host document id — a settlement, location
 * or planet — or null. An arrival whose destination came by id (a token
 * dropped on a sector pin) sets the current location by it (issue #321 U52).
 *
 * @param {string|null} id
 * @returns {{ id: string, type: string, entity: Object }|null}
 */
function currentLocationForEntityId(id) {
  if (!id) return null;
  for (const type of ["settlement", "location", "planet"]) {
    const entity = readEntityFlag(type, getEntityDocument(type, id));
    if (entity) return { id, type, entity };
  }
  return null;
}

/**
 * Apply an outcome's effects beyond the roller's meters and its choice card —
 * what the pipeline applies from the resolver's consequence flags: an arrival
 * (Set a Course), the expedition's progress, a legacy mark, the companion's
 * health, a fight's threshold card, progress, position and end, with a won
 * fight's payoff. Runs on the canonical GM.
 *
 * One applier, two callers (UPGRADE-PIPELINE-EFFECTS — Burn Momentum and
 * Improve Result swapped the meters, reverted the miss's Pay the Price and
 * reconciled the choice card, and nothing else of the upgraded outcome ran: a
 * Strike burned from a miss to a strong hit marked no progress and stayed in
 * the miss's bad spot, an Undertake an Expedition improved from a miss marked
 * no progress):
 *   - the move pipeline, for the rolled outcome (`against` null): every effect;
 *   - the upgrades (applyUpgradedOutcomeEffects), for the upgraded outcome
 *     against the recorded original: what it adds — progress marks beyond the
 *     original's, a changed position, the expedition progress or legacy the
 *     original did not mark, the companion's health difference, an arrival the
 *     miss never made, the payoff of a fight the miss lost. An effect the
 *     original produced is never repeated. The fight the original's card named
 *     (`targets.combatTrackId`) is the one marked and positioned; gone or
 *     finished by then, nothing is marked (as a choice card's progress, issue
 *     #309 N04). An Enter the Fray whose threshold card still waits gets its
 *     new opening position on that card.
 *
 * @param {Object} args
 * @param {Object} args.resolution — moveId, outcome, consequences, _id
 * @param {{ moveTarget?: string|null, moveTargetId?: string|null, combatRank?: string|null,
 *   expeditionRank?: string|null, companionItemId?: string|null }} args.interpretation
 * @param {Object} args.campaignState — the caller's working copy. The pipeline's legacy mark
 *   and arrival location are written to it (persistResolution saves them); an upgrade's are
 *   saved at once (writeLegacyTicks, persistCampaignStateFields)
 * @param {Actor|null} args.rollerActor — credited with the companion's health and a won fight
 * @param {Actor|null} args.speakerActor — whose sheet mirrors the position
 * @param {{ outcome: string, consequences: Object, resolutionId?: string|null }|null} [args.against]
 *   — the recorded original, for an upgrade
 * @param {{ combatTrackId?: string|null }|null} [args.targets] — the fight the original's card
 *   named, for an upgrade
 * @param {Object|null} [args.tokenDragSetCourse] — the pipeline's token-drag payload
 * @returns {Promise<{ moveFight: Object|null, applied: string[], notApplied: string[] }>}
 *   moveFight — the fight the move was about: the one its progress marked (or created),
 *   else the stamped or selected open fight, else the one it ended; applied / notApplied —
 *   what the effects did, in words, for an upgrade's card
 */
async function applyOutcomeEffects({
  resolution, interpretation, campaignState, rollerActor, speakerActor,
  against = null, targets = null, tokenDragSetCourse = null,
}) {
  const applied    = [];
  const notApplied = [];
  const out = { moveFight: null, applied, notApplied };
  if (!game.user?.isGM) return out;

  const next       = resolution.consequences ?? {};
  const orig       = against?.consequences ?? {};
  const upgrade    = against !== null;
  const isHit      = (outcome) => outcome === "strong_hit" || outcome === "weak_hit";
  const moveTarget = interpretation?.moveTarget ?? null;

  // Fact-continuity §20 — when a travel move with ARRIVAL semantics
  // resolves to a non-miss, the ship arrived at the destination the
  // player named. Infer the new position and write it onto the
  // command vehicle BEFORE the narrator builds its context so
  // Section 6.5 reflects the arrival on this same turn.
  //
  // Cluster C: finish_an_expedition joins set_a_course — both mean
  // "you reach your destination" on a hit (play kit). The
  // undertake_an_expedition waypoint move stays deliberately unwired:
  // a hit marks progress, not arrival. An upgrade arrives only when the
  // recorded outcome was the miss that did not.
  const arrivalMove =
    resolution.moveId === "set_a_course"
    || resolution.moveId === "finish_an_expedition";
  if (
    arrivalMove
    && resolution.outcome !== "miss"
    && !(upgrade && against.outcome !== "miss")
    && getShipPositioningEnabled()
    && getShipAutoMoveOnCourse()
  ) {
    // A Set a Course started by dropping the ship's token on a sector pin
    // names its destination by the pin's settlement Actor (forcedMoveTargetId
    // → moveTargetId): arrive at that settlement by its id, not by a name a
    // rename leaves behind or a namesake in another sector matches first
    // (issue #321 U52). Finish an Expedition's moveTargetId is a track's.
    const destinationId = resolution.moveId === "set_a_course"
      ? (interpretation?.moveTargetId ?? null)
      : null;
    await maybeUpdateShipPositionFromName(
      moveTarget,
      campaignState,
      tokenDragSetCourse ? "scene_token"
        : resolution.moveId === "finish_an_expedition" ? "expedition"
        : "set_a_course",
      { entityId: destinationId },
    );

    // Keep the campaign's "current location" in step with the arrival —
    // previously only a manual !at wrote currentLocationId, so travelling
    // by move left the narrator options / entity-panel highlight pointing
    // at the last !at (LOCATION-DUAL-STORE fix). Same resolver as !at; a
    // destination that isn't a tracked entity leaves the store untouched.
    const arrivedAt = currentLocationForEntityId(destinationId)
      ?? resolveCurrentLocationName(moveTarget ?? "", campaignState);
    if (arrivedAt) {
      campaignState.currentLocationId   = arrivedAt.id;
      campaignState.currentLocationType = arrivedAt.type;
      // The pipeline's persistResolution saves its working copy; an upgrade's
      // location is saved here, beside the ship record just written.
      if (upgrade) {
        await persistCampaignStateFields(campaignState, ["currentLocationId", "currentLocationType"], "arrival after an upgrade");
      } else {
        noteUnsavedOnCopy(campaignState, { step: "arrival", locationId: arrivedAt.id, locationType: arrivedAt.type,
          name: arrivedAt.entity?.name ?? moveTarget ?? null });
      }
    } else if (moveTarget) {
      console.debug(`${MODULE_ID} | arrival: "${moveTarget}" is not a tracked location — currentLocation unchanged.`);
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
    // weak-hit choice in parallel. Set a Course's only: a Finish an
    // Expedition arrival was told "Course held cleanly (+1 momentum)" (the
    // move grants none) or "see the suffer prompt" (it has none), beside
    // its own "Expedition complete" card (issue #326 W46).
    if (resolution.moveId === "set_a_course") {
      await postSetACourseFeedbackCard(
        moveTarget,
        resolution,
      ).catch(err => console.warn(`${MODULE_ID} | Set a Course feedback card failed:`, err?.message ?? err));
    }
    applied.push(`arrived at ${moveTarget ?? "the destination"}`);
  }

  // Exploration lifecycle — Undertake an Expedition (and Explore a Waypoint)
  // mark progress on the shared expedition track. Resolve-or-create the
  // track (rank inferred by the interpreter) and mark one rank-step. GM-only
  // (progress-track writes go to the hidden tracks journal); the feedback
  // card tells the player what was marked and that they can re-rank.
  if (next.expeditionProgress && !orig.expeditionProgress) {
    try {
      const result = await applyExpeditionProgress(
        { moveTarget, moveTargetId: interpretation?.moveTargetId ?? null, expeditionRank: interpretation?.expeditionRank },
        {
          listTracks:   () => listProgressTracks(),
          createTrack:  (data) => addProgressTrack(data),
          markProgress: (id) => markProgressById(id),
        },
      );
      if (result && !result.track) {
        // Several open and none named, or the named one is over: nothing
        // marked, and no phantom begun (issue #321 U16).
        console.warn(`${MODULE_ID} | expedition progress: ${result.reason === "gone" ? "the move's expedition is over" : "more than one expedition is open and none was named"} — not marked.`);
        notApplied.push(`expedition progress — ${result.reason === "gone" ? "its expedition is over" : "which expedition?"}`);
      }
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
        await postExpeditionProgressCard({ ...result, actorId: rollerActor?.id ?? null }).catch(err =>
          console.warn(`${MODULE_ID} | expedition progress card failed:`, err?.message ?? err));
        applied.push(`progress marked on the ${result.track.label ?? "expedition"} expedition`);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | expedition progress failed:`, err?.message ?? err);
      notApplied.push("expedition progress");
    }
  }

  // Legacy-track marks (Make a Discovery / Confront Chaos). The pipeline
  // mutates its working copy in place — persistResolution deep-clones and
  // persists campaignState, so no separate write is needed. An upgrade's
  // mark is saved now, its box XP once the save lands (writeLegacyTicks).
  const legacy = legacyMarkAdded(next.legacyMark, orig.legacyMark);
  if (legacy) {
    const { track, ticks } = legacy;
    const label = String(LEGACY_LABELS[track] ?? track).toLowerCase();
    try {
      if (upgrade) {
        const failed = await writeLegacyTicks(track, ticks);
        if (failed.length) {
          await postPayoffFailureCard({ source: "legacyXp", failures: failed }).catch(err =>
            console.warn(`${MODULE_ID} | legacy XP failure card failed:`, err?.message ?? err));
        }
      } else {
        addLegacyTicks(campaignState, track, ticks);
      }
      await postLegacyMarkCard(track, ticks).catch(err =>
        console.warn(`${MODULE_ID} | legacy mark card failed:`, err?.message ?? err));
      applied.push(`${ticks} tick${ticks === 1 ? "" : "s"} on the ${label} legacy`);
    } catch (err) {
      console.warn(`${MODULE_ID} | legacy mark failed:`, err?.message ?? err);
      notApplied.push(`the ${label} legacy mark`);
    }
  }

  // Companion Takes a Hit strong hit — direct +1 health to the companion
  // the roll was made for (its asset's track). It went to the PC's meters,
  // which have no companion health, and was dropped (issue #309 N03). An
  // upgrade applies the difference: a miss's -1 improved to the strong
  // hit's +1 heals 2.
  const companionDelta = Number(next.companionHealthChange ?? 0) - Number(orig.companionHealthChange ?? 0);
  if (companionDelta !== 0 && rollerActor) {
    const healed = await applyCompanionHealthChange(rollerActor, companionDelta,
      { itemId: interpretation?.companionItemId ?? null });
    const signed = `${companionDelta > 0 ? "+" : ""}${companionDelta}`;
    if (!healed.ok) {
      ui.notifications?.warn?.(`Starforged Companion: the companion's health change was not applied (${healed.reason}) — apply it on the asset.`);
      notApplied.push(`companion health ${signed} (${healed.reason})`);
    } else {
      applied.push(`companion health ${signed}`);
    }
  }

  // Secure an Advantage's strong hit — "take both": the +1 on the roller's
  // next move beside the +2 momentum (the weak hit's and Gain Ground's are a
  // choice card's pick, granted by the pick). Recorded for the roller and
  // added to their next action roll (consumeNextMoveBonus); it was card text
  // alone (issue #322 V02). An upgrade grants what its outcome adds.
  const nextBonus = Number(next.nextMoveBonus ?? 0) - Number(orig.nextMoveBonus ?? 0);
  // Aid Your Ally: the ally takes it (issue #325 W17).
  const allyActor = next.beneficiary === "ally" && interpretation?.allyActorId
    ? (game.actors?.get?.(interpretation.allyActorId) ?? null) : null;
  const bonusTaker = isPlayerCharacterActor(allyActor) ? allyActor : rollerActor;
  if (nextBonus > 0) {
    try {
      const granted = await grantNextMoveBonus(bonusTaker?.id ?? null, nextBonus, resolution.moveId ?? null);
      if (granted.ok) applied.push(`+${nextBonus} on ${bonusTaker?.name ?? "the roller"}'s next move`);
      else notApplied.push(`+${nextBonus} on the next move — no character to give it to`);
    } catch (err) {
      console.warn(`${MODULE_ID} | next-move bonus failed:`, err?.message ?? err);
      notApplied.push(`+${nextBonus} on the next move`);
    }
  }

  // Combat lifecycle — Enter the Fray creates/reuses the combat track (rank
  // inferred from narration). Strike and Clash mark progress directly (×2 or
  // ×1). Position is written after the track exists. Take Decisive Action and
  // Face Defeat complete the track. All GM-gated (track journal writes).
  let thresholdPosted = false;
  if (next.enterCombat && !upgrade) {
    try {
      // Combat is offered, not forced (#241): post a threshold decision card —
      // Enter the Fray (which creates the track, at a suggested-but-adjustable
      // rank, optionally linked to the vow it serves) vs. a way out. Skip when
      // already in this fight (a matching open combat track exists); later
      // combat moves just mark progress on it. Enter the Fray's own outcome
      // position rides the card so it lands on the track at creation. An
      // upgrade posts none: the original outcome's card is waiting, and its
      // position is changed below.
      const existing = selectCombatTrack(await listProgressTracks(), moveTarget);
      if (!existing || existing.completed) {
        const vowNames = (readVows(speakerActor) ?? [])
          .filter(v => v && !v.completed).map(v => v.name).filter(Boolean);
        await postCombatThresholdCard({
          label:         moveTarget ?? "the enemy",
          suggestedRank: interpretation?.combatRank,
          vowNames,
          position:      next.combatPosition ?? null,
          actorId:       speakerActor?.id ?? null,
          resolutionId:  resolution._id ?? null,
        }).catch(err =>
          console.warn(`${MODULE_ID} | combat threshold card failed:`, err?.message ?? err));
        thresholdPosted = true;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | combat threshold failed:`, err?.message ?? err);
    }
  }

  // Progress marks: the pipeline resolves-or-creates on the move's target. An
  // upgrade marks the fight the original's card named, by id — or nothing,
  // when that fight is over; never a fight selected now (issue #309 N04).
  // With no fight named (the original found none) it resolves-or-creates as
  // the pipeline does.
  const marks     = Math.max(0, Number(next.combatProgress ?? 0) - Number(orig.combatProgress ?? 0));
  const stampedId = upgrade ? (targets?.combatTrackId ?? null) : null;
  const stamped   = stampedId ? await getProgressTrack(stampedId).catch(() => null) : null;
  const stampedOpen = stamped?.type === "combat" && !stamped.completed ? stamped : null;
  let combatProgressTrack = null;
  if (marks > 0) {
    const times = marks === 1 ? "once" : `${marks} times`;
    try {
      if (stampedId) {
        if (stampedOpen) {
          let track = stampedOpen;
          let marksApplied = 0;
          for (let i = 0; i < marks; i++) {
            const updated = await markProgressById(stampedOpen.id);
            if (updated) { track = updated; marksApplied++; }
          }
          combatProgressTrack = track;
          await postCombatProgressCard({ track, marksApplied }).catch(err =>
            console.warn(`${MODULE_ID} | combat progress card failed:`, err?.message ?? err));
          applied.push(`progress marked ${times} on ${track.label ?? "the fight"}`);
        } else {
          console.warn(`${MODULE_ID} | combat progress: the move's fight ${stampedId} is over or gone — ×${marks} not marked.`);
          notApplied.push(`combat progress ×${marks} — its fight is over`);
        }
      } else {
        const result = await applyCombatProgress(
          { moveTarget, moveTargetId: interpretation?.moveTargetId ?? null, combatRank: interpretation?.combatRank, markCount: marks },
          {
            listTracks:   () => listProgressTracks(),
            createTrack:  (data) => addProgressTrack(data),
            markProgress: (id) => markProgressById(id),
          },
        );
        if (result && !result.track) {
          // Several fights open and none named, or the named one is over:
          // nothing marked, and no phantom fight (issue #321 U16).
          console.warn(`${MODULE_ID} | combat progress: ${result.reason === "gone" ? "the move's fight is over" : "more than one fight is open and none was named"} — ×${marks} not marked.`);
          notApplied.push(`combat progress ×${marks} — ${result.reason === "gone" ? "its fight is over" : "which fight?"}`);
        }
        if (result?.track) {
          combatProgressTrack = result.track;
          await postCombatProgressCard(result).catch(err =>
            console.warn(`${MODULE_ID} | combat progress card failed:`, err?.message ?? err));
          applied.push(`progress marked ${times} on ${result.track.label ?? "the fight"}`);
        }
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | combat progress failed:`, err?.message ?? err);
      notApplied.push(`combat progress ×${marks}`);
    }
  }

  // The fight this move was about — the one its progress marked (or
  // created), else the move's target by the same ladder, else the sole
  // open fight. Resolved once, for two readers: the move's position is
  // written to it (the single-active-fight lookup left every position
  // unwritten while two fights were open, so Take Decisive Action's
  // bad-spot downgrade could never apply there — issue #306 R05), and the
  // move card's Finish the Fight button names it, so the roll it starts
  // scores this fight and no other (TDA-BUTTON-NO-TARGET). An upgrade holds
  // to the fight its card named: open, it is the fight; over, there is none.
  if (next.combatPosition || TDA_OFFER_MOVES.has(resolution.moveId) || stampedId) {
    try {
      if (combatProgressTrack) out.moveFight = combatProgressTrack;
      else if (stampedId) out.moveFight = stampedOpen;
      else {
        const tracks  = await listProgressTracks();
        const trackId = interpretation?.moveTargetId ?? null;
        // Two fights open and no foe named: the roller's own fight — the one
        // recording their position (issue #326 W45; the position was written
        // nowhere and their next Strike steered by the stale one).
        out.moveFight = selectCombatTrack(tracks, moveTarget, { trackId })
          ?? (!moveTarget && !trackId ? selectRollerFight(tracks, speakerActor?.id ?? rollerActor?.id ?? null) : null);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | combat fight lookup failed:`, err?.message ?? err);
    }
  }

  // Aid Your Ally in a fight: the ally's own position (issue #325 W17).
  const allyPosition = next.allyCombatPosition ?? null;
  if (allyPosition && allyPosition !== (orig.allyCombatPosition ?? null) && isPlayerCharacterActor(allyActor)) {
    try {
      const fight = out.moveFight ?? selectCombatTrack(await listProgressTracks(), moveTarget,
        { trackId: interpretation?.moveTargetId ?? null });
      if (fight) {
        await applyCombatPositionToTrack(fight.id, allyPosition, allyActor);
        applied.push(`${allyActor.name} ${allyPosition === "in_control" ? "in control" : "in a bad spot"}`);
      } else {
        notApplied.push(`${allyActor.name}'s position — no open fight matched`);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | ally combat position failed:`, err?.message ?? err);
      notApplied.push(`${allyActor.name}'s position`);
    }
  }

  const position = next.combatPosition ?? null;
  if (position && position !== (orig.combatPosition ?? null)) {
    const label = position === "in_control" ? "in control" : "in a bad spot";
    try {
      if (out.moveFight) {
        await applyCombatPositionToTrack(out.moveFight.id, position, speakerActor);
        applied.push(label);
      } else if (thresholdPosted) {
        // Enter the Fray: the track doesn't exist yet — the position rides
        // the threshold card's flags and lands at track creation.
        console.debug(`${MODULE_ID} | combat position "${position}" rides the threshold card — track not created yet.`);
      } else if (upgrade && next.enterCombat && await stashPositionOnThresholdCard(against.resolutionId ?? null, position)) {
        // The original's threshold card still waits for its Enter the Fray:
        // the upgraded opening position replaces the recorded one on it.
        applied.push(`${label} once you enter the fight`);
      } else {
        console.warn(`${MODULE_ID} | combat position "${position}" matched no open fight ("${moveTarget ?? "?"}") — not written.`);
        notApplied.push(`${label} — no open fight matched`);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | combat position failed:`, err?.message ?? err);
      notApplied.push(label);
    }
  }

  if (next.endCombat && !upgrade) {
    try {
      const fin = await finishCombatTrack(
        { moveTarget, moveTargetId: interpretation?.moveTargetId ?? null },
        {
          listTracks:    () => listProgressTracks(),
          completeTrack: (id) => completeProgressTrack(id),
        },
      );
      if (fin?.track) {
        // The fight this move ended, for its card's upgrades: a Battle burned
        // from a miss to a hit wins it (below).
        out.moveFight ??= fin.track;
        await postCombatFinishCard(fin).catch(err =>
          console.warn(`${MODULE_ID} | combat finish card failed:`, err?.message ?? err));
        // Delete the Foundry combat tracker for this track
        await endCombatTracker(fin.track.id).catch(err =>
          console.warn(`${MODULE_ID} | combat tracker close failed:`, err?.message ?? err));
        // Won fight that served a vow → surface the milestone (#241). Win =
        // a hit on Take Decisive Action / Battle (not Face Defeat).
        if (resolution.moveId !== "face_defeat" && isHit(resolution.outcome) && fin.track.linkedVowName) {
          await applyWonFightPayoff(fin.track, resolution.outcome, rollerActor);
        }
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | finish combat failed:`, err?.message ?? err);
    }
  } else if (next.endCombat && upgrade && resolution.moveId !== "face_defeat"
      && isHit(resolution.outcome) && !isHit(against.outcome)) {
    // A Battle lost on the recorded miss is won on the upgraded hit: the
    // fight it ended (its card named it; finished by now) pays off. A win
    // already paid on a weak hit is not paid again on a strong one.
    if (stamped?.linkedVowName) {
      await applyWonFightPayoff(stamped, resolution.outcome, rollerActor);
      applied.push(`the fight won — a milestone toward ${stamped.linkedVowName}`);
    } else if (!stamped) {
      console.debug(`${MODULE_ID} | won fight: the upgraded ${resolution.moveId} names no fight — no payoff.`);
    }
  }

  return out;
}

/**
 * Burn Momentum's and Improve Result's applier (their hooks' `applyEffects`):
 * the upgraded outcome's effects for what it adds over the recorded original,
 * on the canonical GM. The upgrading PC is the roller and the speaker.
 *
 * @param {{ resolution: Object, against: Object, interpretation: Object, targets: Object,
 *   actor: Actor|null, campaignState: Object }} args — resultUpgrade.js applyUpgradedOutcomeEffects
 * @returns {Promise<{ applied: string[], notApplied: string[] }>}
 */
async function applyUpgradedOutcomeEffects({ resolution, against, interpretation, targets, actor, campaignState }) {
  const { applied, notApplied } = await applyOutcomeEffects({
    resolution, interpretation, campaignState, against, targets,
    rollerActor: actor, speakerActor: actor,
  });
  return { applied, notApplied };
}

/**
 * The legacy mark an outcome adds over another's: all of it when the other
 * marked none (or another track), else the ticks beyond the other's; null
 * when nothing is added.
 *
 * @param {{ track: string, ticks: number }|null|undefined} next
 * @param {{ track: string, ticks: number }|null|undefined} orig
 * @returns {{ track: string, ticks: number }|null}
 */
function legacyMarkAdded(next, orig) {
  if (!next?.track || !(Number(next.ticks) > 0)) return null;
  const ticks = orig?.track === next.track ? Number(next.ticks) - Number(orig.ticks ?? 0) : Number(next.ticks);
  return ticks > 0 ? { track: next.track, ticks } : null;
}

/**
 * A won fight that served a vow: the victory card (its milestone marks scale
 * by the fight's rank; a weak-hit win is one fewer, min 1) and the vow's
 * promised reward (#241 Phase 2), scaled by the win and one-time — the status
 * flips so a re-win can't re-grant. A grant that does not land is told to the
 * GMs, with a Retry (issue #306 R04). Shared by the pipeline's end-of-fight
 * branch and a Battle upgraded from a lost miss.
 *
 * @param {{ rank?: string, linkedVowName: string }} track — the fight
 * @param {"strong_hit"|"weak_hit"} outcome
 * @param {Actor|null} rollerActor
 */
async function applyWonFightPayoff(track, outcome, rollerActor) {
  const marks = Math.max(1, marksForSourceRank(track.rank) - (outcome === "weak_hit" ? 1 : 0));
  await postFightVowMilestoneCard(track.linkedVowName, marks, rollerActor?.id ?? null).catch(err =>
    console.warn(`${MODULE_ID} | fight-vow milestone card failed:`, err?.message ?? err));
  const granted = await grantLinkedVowReward(track.linkedVowName, outcome, { actorId: rollerActor?.id ?? null }).catch(err => {
    console.warn(`${MODULE_ID} | grant linked vow reward failed:`, err?.message ?? err);
    return null;
  });
  if (granted && !granted.ok) {
    await postPayoffFailureCard({
      source: "fight", vowName: track.linkedVowName, vowId: granted.vowId ?? null,
      actorId: rollerActor?.id ?? null, outcome, failures: [granted],
    }).catch(err => console.warn(`${MODULE_ID} | fight reward failure card failed:`, err?.message ?? err));
  }
}

/**
 * An Enter the Fray upgraded while its threshold card still waits: put the
 * upgraded opening position on the card — its flag, which
 * createCombatTrackFromThreshold applies at track creation (as the weak hit's
 * "You are in control" choice does), and its line — in place of the recorded
 * outcome's. The card is the one the original resolution posted
 * (`resolutionId`); a card from before cards carried it is not found.
 *
 * @param {string|null} resolutionId — the original resolution's
 * @param {"in_control"|"bad_spot"} position
 * @returns {Promise<boolean>} whether a card was updated
 */
async function stashPositionOnThresholdCard(resolutionId, position) {
  if (!resolutionId) return false;
  const card = (game.messages?.contents ?? []).find(m =>
    m?.flags?.[MODULE_ID]?.combatThresholdCard === true && m.flags[MODULE_ID].resolutionId === resolutionId);
  if (!card) return false;
  const line    = thresholdPositionLine(position);
  const content = String(card.content ?? "");
  const current = /<p>⚑ [^<]*<strong>[^<]*<\/strong>\.<\/p>/;
  const updated = current.test(content)
    ? content.replace(current, line)
    : content.replace("</p>", `</p>${line}`);
  await card.update({ [`flags.${MODULE_ID}.position`]: position, content: updated });
  return true;
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
 * `finally` calls this as a safety net for the throw / cancelled-confirm paths
 * and to retry a refused release — only while that move has not released its
 * lock: once it has, the lock may be a later move's (issue #315 S01).
 * Re-reads the latest campaignState each call so it never clobbers writes made
 * during the pipeline (entity records, progress ticks, recap caches).
 * World-scoped write → effective on the GM client only.
 *
 * A pipeline passes its claim's token: it releases the lock only while the
 * store still holds that claim. Its lock may have been released while its GM
 * was away (the W25 handover) and claimed again, by that GM, for a later
 * move — whose lock the returning pipeline used to clear mid-narration,
 * letting a third pipeline run beside it (issue #329 X08). A lock from before
 * claims carried a token is released as before. The handover and the ready
 * reset release without a token, and only a lock whose claimant is gone: the
 * handover the departed GM's (or one naming nobody), the ready reset one no
 * other connected user holds — and only while the store still holds the lock
 * it found (issue #335 Y07; staleMoveLockAtReady).
 *
 * @param {string|null} [claim] — the releasing pipeline's `pendingMoveClaim`
 * @returns {Promise<boolean>} whether the lock is free now, or no longer this
 *   claim's — false when the release was refused (the caller retries it)
 */
export async function releasePendingMoveLock(claim = null) {
  const latestState = game.settings.get(MODULE_ID, "campaignState");
  if (!latestState?.pendingMove) return true;   // already released — cheap no-op
  if (claim && latestState.pendingMoveClaim && latestState.pendingMoveClaim !== claim) {
    console.debug?.(`${MODULE_ID} | the move lock is another move's claim now — not released.`);
    return true;
  }
  // Write a copy: `get` returns this client's cached value, and clearing the
  // flag on it before a write that failed made the retry (the pipeline's
  // finally) read "released" and skip — the world kept the lock (issue #302).
  return game.settings.set(MODULE_ID, "campaignState", { ...latestState, pendingMove: false, pendingMoveBy: null, pendingMoveClaim: null }).then(() => true, err => {
    console.error(`${MODULE_ID} | Failed to release pendingMove lock:`, err);
    return false;
  });
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
 * - Invalidate the cached character snapshot on EVERY update — this client's
 *   cache only — so the next roll and context build read fresh state from the
 *   Actor document. Not gated on `hasPlayerOwner`: that is false for every PC
 *   in solo-GM play (and for a PC the GM plays at a group table), whose sheet
 *   edits otherwise never reached rolls or the narrator (issue #321 U01).
 * - If a player-owned PC's condition debilities changed, recalculate momentum
 *   bounds so the Actor's momentum stays within the new valid range.
 *
 * The momentum recalc ignores updates made by this client
 * (userId === game.user.id): actorBridge's own writes keep the bounds.
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
    // Invalidate the cached snapshot so the next roll / context build reads
    // fresh data — every actor, whoever owns it.
    invalidateActorCache(actor.id);

    // The momentum recalc below is for player-owned PCs, edited by another user.
    if (!actor.hasPlayerOwner) return;
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
 * Which client narrates a native sheet roll: the keyed-runner ladder of
 * RUN_ON.CLAUDE and requestOracleNarration (decisions.md "Claude calls run
 * where a key lives, exactly once"). A keyed GM is connected → the canonical
 * GM, which is keyed by construction, so the call succeeds and its narrator
 * side-data applies; otherwise → the roller's own client, with its own key.
 * The createChatMessage hook fires on every client and each reaches the same
 * answer, so no relay is needed. Unlike the chat-command AUTHOR policy, an
 * author-less message is nobody's roll — a native roll card always carries
 * its roller.
 *
 * @param {ChatMessage} message
 * @returns {boolean}
 */
function nativeRollNarratesHere(message) {
  if (hasKeyedActiveGM()) return isCanonicalGM();
  const authorId = messageAuthorId(message);
  return authorId != null && authorId === game?.user?.id;
}

/**
 * The subtype lookup both native-roll hooks hand classifyProgressRoll — the
 * narration hook below and the canonical GM's payoff hook
 * (registerNativeFulfilConsequenceHook) — so the two always agree on what a
 * sheet roll was. The vendor sets a moveDsId only for a vow, so a connection's
 * roll is told apart by the source progress Item's subtype, read off the
 * speaker actor (the system serialises only the track name). The module and
 * the vendor's Connections tab store a connection as subtype "bond": the
 * narration hook accepted only "connection", so a sheet-rolled Forge a Bond
 * was paid but never narrated (issue #321 U21).
 *
 * @param {ChatMessage} message  the native roll card
 * @param {string} label         the calling hook, for the log line
 * @returns {(source: string) => ('vow'|'connection'|null)}
 */
function nativeProgressSubtypeLookup(message, label) {
  return (source) => {
    try {
      const actor = message?.speaker?.actor ? game.actors?.get(message.speaker.actor) : null;
      const src   = String(source ?? "").trim().toLowerCase();
      if (!actor || !src) return null;
      const item = actor.items?.find?.(i =>
        i?.type === "progress" && String(i?.name ?? "").trim().toLowerCase() === src);
      const subtype = String(item?.system?.subtype ?? "").toLowerCase();
      if (subtype.includes("vow")) return "vow";
      if (subtype.includes("connection") || subtype.includes("bond")) return "connection";
      return null;
    } catch (err) {
      console.warn(`${MODULE_ID} | ${label}: subtype lookup for "${source}" threw:`, err?.message ?? err);
      return null;
    }
  };
}

/**
 * Narrate NATIVE foundry-ironsworn vow/connection progress rolls (#236
 * follow-up). When a player rolls a vow (or connection) progress on the system
 * character sheet, the system posts only its own roll card and fires no hook,
 * so the Companion never narrated it. This createChatMessage hook detects that
 * card, classifies it as a vow or connection resolution, and narrates the
 * already-determined outcome via narrateResolution — WITHOUT re-rolling.
 *
 * Narrated exactly once, where a Claude key lives (nativeRollNarratesHere —
 * decisions.md "Claude calls run where a key lives, exactly once"): the keyed
 * canonical GM when one is connected, else the roller's own client with its
 * own key. Narrating only on the roller gave a keyless player "Narration
 * unavailable" at a table whose GM holds the key (issue #321 U11); the older
 * canonical-GM-only gate produced nothing when only a player held a key
 * (#248 Theme D). The narration is the roller's: their PC is the narrator's
 * CHARACTER. Anything it can't act on (action rolls, expedition/combat
 * progress, our own cards, unparseable shapes) is skipped with a debug
 * breadcrumb on the deciding client (decisions.md → "No silent failures"). See
 * nativeProgressRoll.js for the vendor-coupling note.
 */
function registerNativeProgressRollHook() {
  Hooks.on("createChatMessage", (message) => {
    try {
      // Every client reads the same keyed-GM registry and user list, so one
      // decides it narrates and the others stand down — not a failure, so no log.
      const narratesHere = nativeRollNarratesHere(message);

      const content = String(message?.content ?? "");
      const parsed  = narratesHere ? parseIronswornProgressRoll(content) : null;
      const moveId  = (narratesHere && parsed)
        ? classifyProgressRoll(parsed, nativeProgressSubtypeLookup(message, "native-roll"))
        : null;

      // No silent failures (decisions.md): map the facts to act/skip + reason +
      // level, then always log the decision on this (the deciding) client.
      const rollKind = (narratesHere && !parsed) ? ironswornRollKind(content) : "progress";
      const plan = planNativeRollNarration({ narratesHere, rollKind, parsed, moveId });
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
        // A working copy: narrateResolution starts the scene and applies the
        // sidecar on it (issue #335 Y04, the X09 rule).
        const campaignState = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
        // The roller's PC (the sheet's speaker), not this client's own.
        const speakerActorId = resolveSpeakerActorId(message, campaignState);
        const isMatch = Array.isArray(parsed.challengeDice) && parsed.challengeDice.length >= 2
          && parsed.challengeDice[0] === parsed.challengeDice[1];
        const resolution = {
          _id:             `native-${message.id}`,
          moveId,
          moveName,
          outcome:         parsed.outcome,
          outcomeLabel,
          isMatch,
          isProgressMove:  true,
          statUsed:        null,
          statValue:       0,
          adds:            0,
          progressScore:   parsed.score,
          challengeDice:   parsed.challengeDice,
          playerNarration: parsed.source ? `Resolving: ${parsed.source}` : "",
        };
        // The narrator's MOVE OUTCOME — the move, its score and outcome and
        // what the outcome means — as a pipeline resolution carries it: a
        // sheet-rolled Fulfill Your Vow was narrated from "Resolving: …"
        // alone (issue #325 W20).
        resolution.consequences = mapConsequences(moveId, parsed.outcome, isMatch);
        resolution.loremasterContext = buildLoremasterContext({ ...resolution, rollKind: "progress" });
        // Narrate-only: the system already rolled; we do NOT re-roll or re-apply
        // mechanics, just narrate the outcome.
        return narrateResolution(resolution, campaignState, { speakerActorId });
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
 *  - world load — reconcile ships created before asset-detection shipped,
 *    so an existing command vehicle (like one made via the sidebar) gets
 *    flagged without the user having to re-add the asset. This runs from
 *    the module's own ready handler, so the scan runs at once: a
 *    Hooks.once("ready") registered while "ready" is dispatching is never
 *    called (Foundry's Hooks.callAll iterates a copy of the handler list), and
 *    the scan never ran (issue #321 U22).
 *
 * Canonical-GM gated (world-scoped writes, single emitter — createItem /
 * deleteItem fire on every client). The sync helper writes only on a status
 * change, so the load scan is idempotent. A single tracked starship is still
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

  // The world-load reconcile — now, not on a "ready" that has already begun.
  try {
    if (!isCanonicalGM()) return;
    import("./entities/ship.js").then(async (mod) => {
      const state     = game.settings.get(MODULE_ID, "campaignState") ?? {};
      const starships = (game.actors?.contents ?? []).filter(a => a?.type === "starship");
      for (const actor of starships) {
        await mod.syncCommandVehicleFlag(actor, state).catch(err =>
          console.warn(`${MODULE_ID} | command-vehicle load sync failed for ${actor.id}:`, err));
      }
    }).catch(err =>
      console.warn(`${MODULE_ID} | command-vehicle load scan: dynamic import failed:`, err));
  } catch (err) {
    console.warn(`${MODULE_ID} | command-vehicle load scan threw:`, err);
  }
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
/**
 * True when chat content is a foundry-ironsworn chat card: its root element
 * carries one of the system's own classes (`ironsworn-message`,
 * `ironsworn-roll`, …). Issue #325 W08.
 *
 * @param {string} text — trimmed message content
 * @returns {boolean}
 */
function isIronswornSystemCard(text) {
  const root = /^<([a-z][a-z0-9-]*)\b([^>]*)>/i.exec(String(text ?? ""));
  if (!root) return false;
  const cls = /\bclass\s*=\s*(["'])([^"']*)\1/i.exec(root[2]);
  return !!cls && /(?:^|\s)ironsworn-[a-z-]+(?:\s|$)/i.test(cls[2]);
}

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

  // A foundry-ironsworn chat card — a move's "Send to chat" reference
  // (sf-move-chat-message.ts posts `<article class='ironsworn-message …'>`
  // with no flags, no roll and the user's alias): the system's own markup at
  // the root, never something a player typed. It passed every check above,
  // and the canonical GM paced, interpreted and rolled the move's rules text
  // for the player who only shared it (issue #325 W08).
  if (isIronswornSystemCard(text)) return false;

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
async function handleIncitingIncidentCommand(message) {
  try {
    const { runIncitingIncident } = await import("./session/incitingIncident.js");
    // A working copy: the narration mints its scene and applies its sidecar
    // on it (issue #335 Y04 — the cached setting kept what a refused write lost).
    const campaignState = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
    // A premise the world refuses is told to the line's author too (issue #336 Y33).
    await runIncitingIncident(campaignState, { authorId: messageAuthorId(message) });
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
    let cleared;
    try {
      cleared = await clearSectorSite(label || null);
    } catch (err) {
      // Refused: nothing changed on this client either (issue #326 W51).
      ui.notifications?.error(`The site could not be marked cleared — the world did not take the write. Try again.`);
      throw err;
    }
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
    let revealed;
    try {
      revealed = await revealSectorSite(label || null, { source: "manual" });
    } catch (err) {
      // Refused: nothing changed on this client either, so a retry reveals it
      // (issue #326 W51).
      ui.notifications?.error(`The site could not be revealed — the world did not take the write. Try again.`);
      throw err;
    }
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

  // A working copy: startScene / endScene set or clear the scene fields on
  // the object they are given before their write, and a write the world
  // refused left this client's cache with a scene the world never opened (or
  // closed one it kept) — the GM's next narration continued the phantom scene
  // and its sidecar persist wrote it into the world (issue #329 X10).
  const campaignState = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
  const priorSceneId  = campaignState.currentSceneId ?? null;
  const storedSceneId = () => game.settings.get(MODULE_ID, "campaignState")?.currentSceneId ?? null;
  const notSaved = (what) => `Scene ${what} not saved — the world did not take the write. Try again.`;

  let resultLine = "";
  try {
    if (verb === "start") {
      const id = await startScene(campaignState, { reason: "scene_command" });
      // The card says what the world holds: the write's refusal is only
      // logged by the scene lifecycle.
      resultLine = !id ? "Scene start failed."
        : storedSceneId() !== id ? notSaved("start")
        : `Scene started — <code>${id}</code>.`;
    } else {
      const summary = await endScene(campaignState, { reason: "scene_command" });
      resultLine = priorSceneId && storedSceneId() === priorSceneId
        ? notSaved("end")
        : `Scene ended — migrated ${summary.migrated} entity truth${summary.migrated === 1 ? "" : "s"}, ` +
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
    // The qualifiers each type takes are named — a qualifier outside them is
    // refused too (issue #326 W62).
    ui.notifications.warn(
      'Invalid !journal command. Format: !journal <type> "Name" qualifier — text  ' +
      '(types: faction hostile|neutral|allied|unknown, location <type>, ' +
      'lore confirmed|rumour, threat immediate|active|looming|resolved).'
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
 * (the NWMA suggestion button, the way-out and Battle buttons …), without
 * interpreting the move. The stat starts as the move's first listed stat; the
 * pipeline then reads the narration for it when the move lists several
 * (enrichForcedMoveStat — issue #321 U04), and the confirm dialog shows it.
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
    // a combat move card or a which-fight pick, and for Battle from an Enter
    // the Fray card (TDA-BUTTON-NO-TARGET) — resolved before any name.
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

// Map of chat-friendly odds aliases to canonical ORACLE_ODDS keys. The play
// kit names two of the five odds with two words — "small chance" and "almost
// certain" — which are looked up before the one-word aliases (issue #321 U64:
// only the first word was checked, so "almost certain" rolled at 50/50 and
// "small chance" left "chance" in the question).
const ODDS_ALIASES = new Map([
  ["small_chance",  "small_chance"], ["small", "small_chance"], ["small chance", "small_chance"],
  ["unlikely",      "unlikely"],
  ["50_50",         "50_50"],        ["50/50", "50_50"], ["even", "50_50"],
  ["likely",        "likely"],
  ["almost_certain","almost_certain"], ["certain", "almost_certain"], ["sure", "almost_certain"],
  ["almost certain", "almost_certain"],
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

  // Resolve odds — a two-word alias (parts[1..2]) first, then a one-word
  // alias (parts[1]); else fall back to 50/50 and treat parts[1..] as the
  // question.
  let oddsKey  = "50_50";
  let question = parts.slice(1).join(" ");
  const twoWord = parts[2] ? ODDS_ALIASES.get(`${parts[1]} ${parts[2]}`.toLowerCase()) : null;
  const oneWord = parts[1] ? ODDS_ALIASES.get(parts[1].toLowerCase()) : null;
  if (twoWord) {
    oddsKey  = twoWord;
    question = parts.slice(3).join(" ");
  } else if (oneWord) {
    oddsKey  = oneWord;
    question = parts.slice(2).join(" ");
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

  // The narration the card asks for travels on it: the canonical GM narrates
  // what the card carries, never a relayed payload's text (issue #331 X49).
  const narration = {
    kind:           "oracle_yes_no",
    oracleName:     `Ask the Oracle (${oddsLabel})`,
    question,
    rolledLine:     `d100 = ${result.roll} ${result.answer === "yes" ? "≤" : ">"} ${result.threshold} → ${result.answer.toUpperCase()}${result.isMatch ? " (MATCH — extreme/twist)" : ""}`,
    speakerActorId: resolveSpeakerActorId(message, game.settings.get(MODULE_ID, "campaignState")),
  };
  const card = await ChatMessage.create({
    content: `<div class="sf-oracle-card"><strong>Ask the Oracle (${escapeChatHtml(oddsLabel)})</strong>${qBlock}<p>d100 = <strong>${result.roll}</strong> ≤ ${result.threshold}? <strong>${result.answer.toUpperCase()}</strong>${matchBadge}</p></div>`,
    flags:   {
      [MODULE_ID]: {
        oracleCommandCard: true,
        oracleNarration:   narration,
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
  requestOracleNarration({ ...narration, messageId: card?.id ?? null });
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
  // The active sector's region: a Fleet "Starship Mission" or Starship Type
  // "Multipurpose" row rolls that region's mission table, the Terminus one
  // with no sector (issue #338 D5 — the Sector Creator picks by region too).
  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  const region = (campaignState?.sectors ?? []).find(s => s?.id === campaignState?.activeSectorId)?.region ?? null;
  let result;
  try {
    result = rollOracle(tableId, { region });
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
  const narration = {
    kind:           "oracle_table",
    oracleName:     tableName,
    question,
    rolledLine:     `d${die} = ${result.roll} → ${result.result}`,
    speakerActorId: resolveSpeakerActorId(message, campaignState),
  };
  const card = await ChatMessage.create({
    content: `<div class="sf-oracle-card"><strong>Oracle: ${escapeChatHtml(tableName)}</strong>${qBlock}<p>d${die} = <strong>${result.roll}</strong> · ${escapeChatHtml(result.result)}</p></div>`,
    flags:   {
      [MODULE_ID]: {
        oracleCommandCard: true,
        oracleTableId:     tableId,
        oracleMemory:      { name: tableName, question, answer: result.result },
        // What the GM narrates — the card's, never a relay's (issue #331 X49).
        oracleNarration:   narration,
      },
    },
  });

  requestOracleNarration({ ...narration, messageId: card?.id ?? null });
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
  // the corresponding suffer executor against the active character — each leaf
  // of a "Roll twice" (issue #314 Q03). Narrative entries (no route) pass
  // through unchanged — narrator and GM resolve.
  // Credit the roller: a routed suffer lands on the PC of the player who typed
  // the command, not the first PC in the world. It runs on the canonical GM
  // (relayed from a player's client, as the clocks below are): Sacrifice
  // Resources marks every ally sharing the supply unprepared with the roller,
  // and a player's client may not update another player's PC — the ally's
  // write was refused and the ally sat at 0 supply without the impact
  // (issue #325 W10).
  const speakerActorId = resolveSpeakerActorId(message, game.settings.get(MODULE_ID, "campaignState"));
  // A player with no character of their own resolves to none at a table of
  // several (issue #321 U23), and the canonical GM rightly refuses their route
  // — another player's PC never pays it (#326 D8) — but said nothing: the card
  // read "Routes to endure_harm (-1)" and nobody was harmed (issue #337 Y43).
  // Refused here, before the card: it says the price was not applied, and the
  // player is told why, as a move they narrate is.
  const noPayer = !!result.sufferRoutes?.length && !speakerActorId && !game.user?.isGM;
  const narration = {
    kind:       "pay_the_price",
    oracleName: "Pay the Price",
    question,
    rolledLine: `d100 = ${result.roll} → ${result.result}`,
    speakerActorId,
  };
  const routesLine = noPayer
    ? sufferRoutesFooter(result.sufferRoutes, { notApplied: `${escapeChatHtml(game.user?.name ?? "the player who rolled it")} has no character of their own to pay it` })
    : sufferRoutesFooter(result.sufferRoutes);
  const card = await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>Pay the Price</strong>${qBlock}<p>d100 = <strong>${result.roll}</strong> · ${escapeChatHtml(result.result)}</p>${routesLine}</div>`,
    flags:   {
      [MODULE_ID]: {
        payThePriceCard: true,
        sufferRoutes:    result.sufferRoutes,
        oracleMemory:    { name: "Pay the Price", question, answer: result.result },
        // What the GM narrates — the card's, never a relay's (issue #331 X49).
        oracleNarration: narration,
      },
    },
  });
  if (noPayer) {
    console.debug?.(`${MODULE_ID} | !pay-the-price: ${game.user?.name ?? "this player"} has no character of their own — the price is not applied (they are told).`);
    await postNoCharacterNotice(message, { price: true }).catch(err =>
      console.warn(`${MODULE_ID} | !pay-the-price: no-character notice failed:`, err?.message ?? err));
  } else if (result.sufferRoutes?.length) {
    await requestGmAction("payThePrice.suffer", { routes: result.sufferRoutes, actorId: speakerActorId }).catch(err =>
      console.warn(`${MODULE_ID} | !pay-the-price: suffer dispatch failed:`, err?.message ?? err));
  }

  // Countdown clocks advance on the canonical GM (world/actor writes) — run
  // locally there, relayed from a player's client.
  await requestGmAction("payThePrice.advanceClocks", {}).catch(err =>
    console.warn(`${MODULE_ID} | !pay-the-price: clock advance failed:`, err?.message ?? err));

  // Narration follow-up — once, where a Claude key lives (oracleFollowup.js).
  requestOracleNarration({ ...narration, messageId: card?.id ?? null });
}

/**
 * Oracle-memory capture (narrator-context audit 2026-07): every `!oracle` /
 * `!pay-the-price` result card carries a structured `oracleMemory` flag; the
 * canonical GM ledgers it into `campaignState.recentOracles` so the narrator
 * is always told what the dice established (system-prompt section [3b]).
 * The commands themselves run on whichever client typed them — possibly a
 * player who cannot write world settings — hence capture-on-GM via the hook.
 */
// The ring's read-modify-writes, one at a time on this client: two oracle
// cards inside one write round trip each read the ring before the other's
// write landed, and the second write dropped the first result (issue #331
// X44 — the CLOCK-LOST-UPDATE shape; serialiseClockWrite's queue).
let _oracleMemoryWrites = Promise.resolve();

function registerOracleMemoryCaptureHook() {
  Hooks.on("createChatMessage", (message) => {
    try {
      if (!isCanonicalGM()) return;
      const entry = message?.flags?.[MODULE_ID]?.oracleMemory;
      if (!entry || typeof entry !== "object") return;
      _oracleMemoryWrites = _oracleMemoryWrites.then(() => captureOracleResult(entry));
    } catch (err) {
      console.warn(`${MODULE_ID} | oracle-memory capture failed:`, err?.message ?? err);
    }
  });
}

/** One oracle result onto the ring, read when its turn in the queue comes. Never rejects. */
async function captureOracleResult(entry) {
  try {
    // A copy, with its own ring (rules/foundry-api.md): recordOracleResult
    // pushed onto the cached ring, so a refused write left the GM's cache
    // holding a result the world did not (issue #326 W51).
    const cached = game.settings.get(MODULE_ID, "campaignState") ?? {};
    const campaignState = {
      ...cached,
      recentOracles: Array.isArray(cached.recentOracles) ? [...cached.recentOracles] : [],
    };
    const stored = recordOracleResult(campaignState, entry);
    if (!stored) return;
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
  } catch (err) {
    console.warn(`${MODULE_ID} | oracle-memory: persist failed:`, err?.message ?? err);
  }
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
 * @param {{ track: Object, created: boolean, actorId?: string|null }} result —
 *   `actorId`: the PC who marked the progress; the card's 🗺 Finish posts as
 *   them, whoever presses it (issue #329 X05)
 */
async function postExpeditionProgressCard({ track, created, actorId = null }) {
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
      flags:   { [MODULE_ID]: { expeditionProgressCard: true, created: created === true, trackLabel: track?.label ?? null, trackId: track?.id ?? null, actorId } },
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

/**
 * Take Decisive Action with two or more fights open and none named: ask which
 * fight, instead of rolling a score of nothing — a certain miss
 * (TDA-BUTTON-NO-TARGET). Strike and Clash ask the same, and Undertake an
 * Expedition which expedition (`trackType` "expedition"): unnamed among
 * several they marked a phantom track (issue #321 U16). Posted in place of
 * the move; nothing is rolled or written. Each open track gets a button
 * (wireWhichFightButtons) that posts the move again with that track's id,
 * credited to the original roller.
 *
 * @param {{ moveId: string, moveName?: string, narration?: string,
 *   actorId?: string|null, fights: Array<{ id: string, label?: string,
 *   rank?: string, ticks?: number }>, trackType?: "combat"|"expedition" }} opts
 */
async function postWhichFightCard({ moveId, moveName, narration, actorId = null, fights, trackType = "combat" }) {
  const expedition = trackType === "expedition";
  const noun = expedition ? "expedition" : "fight";
  const buttons = fights.map(t => {
    const rank  = escapeChatHtml(String(t.rank ?? "dangerous").replace(/^\w/, c => c.toUpperCase()));
    const boxes = Math.floor(Number(t.ticks ?? 0) / 4);
    const label = escapeChatHtml(t.label ?? (expedition ? "Expedition" : "Combat"));
    return `<button type="button" class="sf-followup-btn" data-action="sf-which-fight" data-track-id="${escapeChatHtml(t.id)}" `
      + `title="Roll for this ${noun}">${expedition ? "🗺" : "⚔"} ${label} — ${rank}, ${boxes}/10 boxes</button>`;
  }).join("");
  const choose = moveId === "take_decisive_action" ? "the fight to finish" : `the ${noun}`;
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>${escapeChatHtml(moveName ?? "Take Decisive Action")} — which ${noun}?</strong>`
      + `<p>More than one ${noun} is open and nothing named this one. Choose ${choose} — nothing has been rolled yet.</p>`
      + `<div class="sf-milestone-suggest-row">${buttons}</div></div>`,
    // fights: the open fights' ids and names when asked — a pick forwards its
    // fight as forcedMoveTargetId / forcedMoveTarget. actorId: the roller, the
    // pick's speaker, so the move stays theirs whoever clicks.
    flags: { [MODULE_ID]: {
      whichFightCard: true, moveId, narration: narration ?? null, actorId,
      fights: fights.map(t => ({ id: t.id, label: t.label ?? null })),
    } },
  });
}

/**
 * Fulfill Your Vow with several vows open and none named: ask which vow,
 * instead of rolling a score of nothing — a certain miss (issue #321 U02).
 * Posted in place of the move; nothing is rolled or written. Each distinct
 * vow (selectFulfilVow — a shared vow once, as the roller's copy when they
 * hold one) gets a button (wireWhichVowButtons) whose pick the canonical GM
 * applies once (gmRelay "fulfilVow.pick" → cardActions.applyFulfilVowPick):
 * the move is posted again with that copy's id, as the roller.
 *
 * @param {{ narration?: string, actorId?: string|null,
 *   vows: Array<{ id: string, name?: string, rank?: string|number, ticks?: number }> }} opts
 */
async function postWhichVowCard({ narration, actorId = null, vows }) {
  const buttons = vows.map(v => {
    const rank  = escapeChatHtml(rankName(v.rank).replace(/^\w/, c => c.toUpperCase()));
    const boxes = Math.floor(Number(v.ticks ?? 0) / 4);
    return `<button type="button" class="sf-followup-btn" data-action="sf-which-vow" data-item-id="${escapeChatHtml(v.id)}" `
      + `title="Roll this vow's progress">🏁 ${escapeChatHtml(v.name || "Vow")} — ${rank}, ${boxes}/10 boxes</button>`;
  }).join("");
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>Fulfill Your Vow — which vow?</strong>`
      + `<p>More than one vow is open and nothing named this one. Choose the vow to fulfill — nothing has been rolled yet.</p>`
      + `<div class="sf-milestone-suggest-row">${buttons}</div></div>`,
    // choices: the offered vow copies — a pick must be one of them and
    // forwards its copy as forcedMoveTargetId / forcedMoveTarget. actorId:
    // the roller, the pick's speaker, so the move stays theirs.
    flags: { [MODULE_ID]: {
      whichVowCard: true, narration: narration ?? null, actorId,
      choices: vows.map(v => ({ itemId: v.id, name: v.name ?? null })),
    } },
  });
}

/**
 * Continue a Legacy naming no legacy track: ask which, instead of rolling a
 * score of nothing (issue #331 X63). Posted in place of the move; nothing is
 * rolled or written. The move rolls each legacy track, so every track keeps
 * its button: a pick relays to the canonical GM ("legacy.pick" →
 * cardActions.applyLegacyTrackPick), which claims that track on the card
 * (`legacyRolled.<track>`) and posts the move once for it, as the roller.
 *
 * @param {{ narration?: string, actorId?: string|null,
 *   tracks: Array<{ track: string, label: string, ticks: number, cleared?: boolean }> }} opts
 */
async function postWhichLegacyCard({ narration, actorId = null, tracks }) {
  const buttons = tracks.map(t => {
    const boxes = Math.floor(Number(t.ticks ?? 0) / 4);
    return `<button type="button" class="sf-followup-btn" data-action="sf-which-legacy" data-track="${escapeChatHtml(t.track)}" `
      + `title="Roll this legacy track's progress">⚑ ${escapeChatHtml(t.label)} — ${boxes}/10 boxes${t.cleared ? " (cleared)" : ""}</button>`;
  }).join("");
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>Continue a Legacy — which legacy track?</strong>`
      + `<p>Continue a Legacy rolls each legacy track, and this roll named none. Choose a track to roll — each can be rolled once from this card; nothing has been rolled yet.</p>`
      + `<div class="sf-milestone-suggest-row">${buttons}</div></div>`,
    // tracks: the offered tracks — a pick must be one of them and forwards
    // its label as forcedMoveTarget. actorId: the roller, the pick's speaker.
    flags: { [MODULE_ID]: {
      whichLegacyCard: true, narration: narration ?? null, actorId,
      tracks: tracks.map(t => ({ track: t.track, label: t.label })),
    } },
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

/**
 * GM-side: execute the recommit mechanics on an open expedition track — the
 * offer card's claim (cardActions.applyRecommitOffer, gmRelay
 * "expedition.recommit", issue #321 U20) runs it once per card.
 *
 * @param {string} trackId
 * @returns {Promise<{ ok: boolean, reason?: "no-track"|"write-refused" }>}
 *   "write-refused": the track write failed and nothing changed
 */
export async function performRecommit(trackId) {
  let track = null;
  try {
    track = (await listProgressTracks()).find(t => t.id === trackId);
  } catch (err) {
    console.warn(`${MODULE_ID} | recommit: the tracks could not be read — nothing recommitted:`, err?.message ?? err);
    return { ok: false, reason: "write-refused" };
  }
  if (!track || track.completed) {
    console.warn(`${MODULE_ID} | recommit: track ${trackId} missing or already completed.`);
    return { ok: false, reason: "no-track" };
  }
  const dice = rollChallengeDice();
  const plan = planRecommit(track.ticks, track.rank, dice);
  try {
    await updateTrackFields(trackId, { ticks: plan.newTicks, rank: plan.newRank });
  } catch (err) {
    console.warn(`${MODULE_ID} | recommit failed — the track was not changed:`, err?.message ?? err);
    return { ok: false, reason: "write-refused" };
  }
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>Recommitted: ${escapeChatHtml(track.label ?? "Expedition")}</strong>`
      + `<p>Challenge dice ${dice[0]}, ${dice[1]} — cleared <strong>${plan.clearedBoxes}</strong> box${plan.clearedBoxes === 1 ? "" : "es"} `
      + `(now ${Math.floor(plan.newTicks / 4)}/10) and the expedition hardens to <strong>${escapeChatHtml(plan.newRank)}</strong>. `
      + `The journey continues.</p></div>`,
    flags: { [MODULE_ID]: { recommitCard: true, trackId, newRank: plan.newRank, newTicks: plan.newTicks } },
  }).catch(err => console.warn(`${MODULE_ID} | recommit card failed:`, err?.message ?? err));
  return { ok: true };
}

// ── Fulfill Your Vow / Forge a Bond miss: recommit offers (issue #330 D1) ──

async function postVowRecommitOfferCard({ vowName, itemId = null, actorId = null }) {
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>Vow — recommit?</strong>`
      + `<p>A complication undoes <strong>${escapeChatHtml(vowName)}</strong>. `
      + `You may Forsake Your Vow, or <em>recommit</em>: roll both challenge dice, clear filled boxes equal to the lowest, `
      + `and raise the vow's rank by one.</p>`
      + `<div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn" data-action="sf-vow-recommit" `
      + `title="Roll challenge dice, clear the lowest die's boxes, raise the vow's rank">🔁 Recommit to the Vow</button></div></div>`,
    flags: { [MODULE_ID]: { vowRecommitOfferCard: true, vowName, itemId, actorId } },
  }).catch(err => console.warn(`${MODULE_ID} | vow recommit offer card failed:`, err?.message ?? err));
}

async function postBondRecommitOfferCard(target, actorId = null) {
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>Bond — recommit?</strong>`
      + `<p>A conflicting motivation stands between you and <strong>${escapeChatHtml(target.name ?? "your connection")}</strong>. `
      + `You may <em>recommit</em>: roll both challenge dice, clear filled boxes on the relationship track equal to the lowest, `
      + `and raise the connection's rank by one.</p>`
      + `<div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn" data-action="sf-bond-recommit" `
      + `title="Roll challenge dice, clear the lowest die's boxes, raise the connection's rank">🔁 Recommit to the Bond</button></div></div>`,
    flags: { [MODULE_ID]: { bondRecommitOfferCard: true, hostId: target.__hostId, connectionName: target.name ?? null, actorId } },
  }).catch(err => console.warn(`${MODULE_ID} | bond recommit offer card failed:`, err?.message ?? err));
}

/** The "Recommitted" card: the dice, the boxes cleared, the new rank. */
async function postRecommittedCard(label, dice, plan, what, flags) {
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>Recommitted: ${escapeChatHtml(label)}</strong>`
      + `<p>Challenge dice ${dice[0]}, ${dice[1]} — cleared <strong>${plan.clearedBoxes}</strong> box${plan.clearedBoxes === 1 ? "" : "es"} `
      + `(now ${Math.floor(plan.newTicks / 4)}/10) and the ${what} rises to <strong>${escapeChatHtml(plan.newRank)}</strong>.</p></div>`,
    flags: { [MODULE_ID]: { recommitCard: true, newRank: plan.newRank, newTicks: plan.newTicks, ...flags } },
  }).catch(err => console.warn(`${MODULE_ID} | recommit card failed:`, err?.message ?? err));
}

/** The short card a recommit of a fulfilled vow gets: nothing was recommitted. */
async function postVowRecommitFulfilledCard(vowName) {
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>🔁 Recommit to the Vow</strong>`
      + `<p><strong>${escapeChatHtml(vowName ?? "That vow")}</strong> is already fulfilled — nothing was recommitted.</p></div>`,
    flags: { [MODULE_ID]: { vowRecommitFulfilledCard: true, vowName: vowName ?? null } },
  }).catch(err => console.warn(`${MODULE_ID} | vow recommit: the fulfilled-vow card failed:`, err?.message ?? err));
}

/**
 * GM-side: recommit to a vow after a Fulfill Your Vow miss (issue #330 D1) —
 * the offer card's claim (cardActions.applyVowRecommitOffer, gmRelay
 * "vow.recommit") runs it once per card. Rolls the challenge dice once and
 * writes the plan to every open copy of the roller's vow (by its vowId — a
 * shared vow is one vow) and to its journal twin, the rank stepped once,
 * never past epic. The roller's copy is written first: refused, nothing
 * changed. A vow fulfilled since the offer posted — a later roll, a
 * crewmate's fulfilment, the sheet — is refused (`vow-completed`, a short
 * card): a fulfilled vow's track never moves (issue #331 X20's rule), and the
 * press lowered it and raised its rank on every copy (issue #335 Y10). Its
 * move cannot be burned or improved (a progress roll), so nothing else
 * retires the offer.
 *
 * @param {{ vowName?: string|null, itemId?: string|null, actorId?: string|null }} vow
 * @returns {Promise<{ ok: boolean, reason?: "no-vow"|"vow-completed"|"write-refused" }>}
 */
export async function performVowRecommit({ vowName = null, itemId = null, actorId = null } = {}) {
  const { primary, copies } = resolveVowItemCopies(vowName, { actorId, itemId });
  if (primary?.item?.system?.completed === true) {
    console.warn(`${MODULE_ID} | vow recommit: "${primary.item.name ?? vowName ?? "?"}" is fulfilled — nothing recommitted.`);
    await postVowRecommitFulfilledCard(primary.item.name ?? vowName);
    return { ok: false, reason: "vow-completed" };
  }
  let twin = null;
  try {
    twin = selectVowTrack((await listProgressTracks()).filter(t => !t.completed), primary?.item?.name ?? vowName);
  } catch (err) {
    console.warn(`${MODULE_ID} | vow recommit: the progress tracks could not be read:`, err?.message ?? err);
  }
  if (!primary && !twin) {
    console.warn(`${MODULE_ID} | vow recommit: no open vow "${vowName ?? "?"}" — nothing recommitted.`);
    return { ok: false, reason: "no-vow" };
  }
  const ticks = primary ? Number(primary.item.system?.current ?? 0) : Number(twin.ticks ?? 0);
  const dice  = rollChallengeDice();
  const plan  = planRecommit(ticks, rankName(primary ? primary.item.system?.rank : twin.rank), dice);
  const next  = { ticks: plan.newTicks, rank: plan.newRank };
  if (primary) {
    const first = await setVowItemTrack(primary.actor, primary.item.id, next);
    if (!first.ok) return { ok: false, reason: "write-refused" };
    for (const { actor, item } of copies) {
      if (item.id === primary.item.id && actor?.id === primary.actor?.id) continue;
      if (item.system?.completed === true) continue;   // a fulfilled copy's track never moves
      const res = await setVowItemTrack(actor, item.id, next);
      if (!res.ok) console.warn(`${MODULE_ID} | vow recommit: ${actor?.name ?? "a"} copy was not changed (${res.reason}).`);
    }
  }
  if (twin) {
    try {
      await updateTrackFields(twin.id, next);
    } catch (err) {
      if (!primary) {
        console.warn(`${MODULE_ID} | vow recommit failed — the track was not changed:`, err?.message ?? err);
        return { ok: false, reason: "write-refused" };
      }
      console.warn(`${MODULE_ID} | vow recommit: the vow's journal track was not changed:`, err?.message ?? err);
    }
  }
  await postRecommittedCard(primary?.item?.name ?? twin?.label ?? vowName ?? "Vow", dice, plan, "vow's rank",
    { vowName: primary?.item?.name ?? twin?.label ?? vowName ?? null });
  return { ok: true };
}

/**
 * GM-side: recommit to a bond after a Forge a Bond miss (issue #330 D1) —
 * cardActions.applyBondRecommitOffer, gmRelay "bond.recommit". The record's
 * relationship track and rank change, written through to every PC's bond
 * Item (setBondItemTicks / setBondItemRank — BOND-ITEM-MIRROR).
 *
 * @param {{ hostId?: string|null }} bond
 * @returns {Promise<{ ok: boolean, reason?: "no-connection"|"write-refused" }>}
 */
export async function performBondRecommit({ hostId = null } = {}) {
  const conn   = await import("./entities/connection.js");
  const record = hostId ? conn.getConnection(hostId) : null;
  if (!record || record.active === false || record.bonded) {
    console.warn(`${MODULE_ID} | bond recommit: connection ${hostId ?? "?"} is gone, lost or bonded — nothing recommitted.`);
    return { ok: false, reason: "no-connection" };
  }
  const dice = rollChallengeDice();
  const plan = planRecommit(Number(record.relationshipTicks ?? 0), rankName(record.rank), dice);
  try {
    await conn.updateConnection(hostId, { relationshipTicks: plan.newTicks, rank: plan.newRank });
  } catch (err) {
    console.warn(`${MODULE_ID} | bond recommit failed — the connection was not changed:`, err?.message ?? err);
    return { ok: false, reason: "write-refused" };
  }
  const keys = { connectionId: record._id ?? hostId, name: record.name ?? null };
  await setBondItemTicks(keys, plan.newTicks).catch(err =>
    console.warn(`${MODULE_ID} | bond recommit: bond item ticks mirror failed:`, err?.message ?? err));
  await setBondItemRank(keys, plan.newRank).catch(err =>
    console.warn(`${MODULE_ID} | bond recommit: bond item rank mirror failed:`, err?.message ?? err));
  await conn.addHistoryEntry(hostId, `Recommitted after a failed Forge a Bond — ${plan.clearedBoxes} box${plan.clearedBoxes === 1 ? "" : "es"} cleared, rank now ${plan.newRank}.`)
    .catch(err => console.warn(`${MODULE_ID} | bond recommit: history entry failed:`, err?.message ?? err));
  await postRecommittedCard(record.name ?? "Connection", dice, plan, "connection's rank", { hostId });
  return { ok: true };
}

// Wire the recommit button. A click relays to the canonical GM
// ("expedition.recommit" → cardActions.applyRecommitOffer), which claims the
// GM-authored offer card (`recommitted`) before recommitting: once, whoever
// presses and however often the card re-renders (issue #321 U20 — a local
// disable re-armed on every other client and on a re-render). A click that is
// not delivered re-arms the button.
// The recommit offers and the GM action each one relays: an expedition's,
// and a vow's or a bond's (issue #330 D1).
const RECOMMIT_OFFERS = [
  { flag: "recommitOfferCard",     action: "sf-recommit",      kind: "expedition.recommit" },
  { flag: "vowRecommitOfferCard",  action: "sf-vow-recommit",  kind: "vow.recommit" },
  { flag: "bondRecommitOfferCard", action: "sf-bond-recommit", kind: "bond.recommit" },
];

function registerRecommitHook() {
  if (registerRecommitHook._installed) return;
  registerRecommitHook._installed = true;
  onChatMessageRender((message, root) => {
    const f = message?.flags?.[MODULE_ID];
    const offer = f ? RECOMMIT_OFFERS.find(o => f[o.flag]) : null;
    if (!offer) return;
    const btn = root.querySelector(`[data-action="${offer.action}"]`);
    if (!btn) return;
    if (liveCardFlags(message)?.recommitted) {
      btn.disabled = true;
      return;
    }
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener("click", async (event) => {
      event.preventDefault(); event.stopPropagation();
      fresh.disabled = true;
      await relayCardAction({
        kind:       offer.kind,
        payload:    { messageId: message?.id ?? null },
        isResolved: () => !!liveCardFlags(message)?.recommitted,
        restore:    () => { fresh.disabled = false; },
      });
    });
  });
}

const LEGACY_LABELS = { discoveries: "Discoveries", quests: "Quests", bonds: "Bonds" };

/**
 * Add ticks to a legacy track on campaignState, creating the entry if absent.
 * Mutates in place; the caller (or its pipeline) persists campaignState. The
 * arithmetic is moves/legacyTracks.js markLegacyTrack: filling the tenth box
 * clears the track, which starts again with the overflow and counts the
 * cycle (`cycles`, `cleared`) — it used to cap at 40 ticks, so every later
 * mark was lost and no XP followed (issue #316 T02).
 *
 * Newly FILLED boxes award XP — 2 per box, 1 once the track has been cleared
 * (play kit rule 1.12), each box at the rate of the cycle it filled in — to
 * every player character (legacy tracks are shared crew tracks in this
 * module, like the shared supply), with a chat note. The award is owed by
 * the copy the ticks were marked on and paid once the write that saves that
 * copy has landed (payDeferredLegacyXp — persistResolution's write for the
 * move pipeline's working copy, bond.apply's and writeLegacyTicks' own): it
 * was paid at the mark, so a refused persist awarded XP for ticks never
 * saved (issue #326 W52). LEGACY-XP-DEAD fix: ticks used to accrue here with
 * no XP ever awarded — the awarding path (persistResolution.markLegacyProgress)
 * required a consequence field no resolver set. `awardXp: false` owes
 * nothing: the caller awards it itself.
 *
 * @returns {{ boxes: number, xp: number, cleared: boolean }} the boxes this
 *   mark filled, the XP they earn (per character) and whether it cleared the
 *   track
 */
export function addLegacyTicks(campaignState, key, ticks, { awardXp = true } = {}) {
  campaignState.legacyTracks ??= {};
  const before = legacyProgress(campaignState.legacyTracks[key]);
  const marked = markLegacyTrack(campaignState.legacyTracks[key], ticks);
  campaignState.legacyTracks[key] = marked.track;
  noteUnsavedOnCopy(campaignState, { step: "legacy", track: key, ticks });
  if (awardXp && legacyProgress(marked.track) > before) {
    // Once the copy is saved, every PC's sheet shows the mark — and the XP a
    // filled box earns (issue #326 D3). A PC whose sheet write is refused is
    // told to the GMs, with a Retry for that sheet alone (issue #309 N06).
    deferLegacyXp(campaignState, async () => {
      const failed = await payLegacyMark(key, marked.boxes, marked.xp, { clearedNow: marked.cleared });
      if (failed.length) await postPayoffFailureCard({ source: "legacyXp", failures: failed });
    });
  }
  return { boxes: marked.boxes, xp: marked.xp, cleared: marked.cleared };
}

// What a working copy holds that only the write saving it puts in the world —
// the move pipeline's legacy marks, an arrival, a site reveal — as payoff
// steps, by the copy (issue #331 X18). Read when persistResolution's write is
// refused: the GMs' card lists them, and its Retry applies each alone.
const UNSAVED_ON_COPY = new WeakMap();

function noteUnsavedOnCopy(campaignState, step) {
  if (!campaignState || typeof campaignState !== "object" || !step) return;
  const steps = UNSAVED_ON_COPY.get(campaignState) ?? [];
  steps.push(step);
  UNSAVED_ON_COPY.set(campaignState, steps);
}

/**
 * The move's record — persistResolution's one campaignState write — was
 * refused: the roller's meters (written before it) stand, and the working
 * copy's legacy marks, arrival and site reveal never reached the world. Tell
 * the GM running the pipeline why (not the API key — the move resolved), and
 * put each owed step on the GMs' payoff failure card, whose Retry applies it
 * alone (issue #331 X18; the #306 R04 / #315 S08 / #326 W52 rule).
 *
 * @param {Object} campaignState — the pipeline's working copy
 * @param {{ actorId?: string|null, moveName?: string|null, error?: string }} ctx
 */
async function reportUnsavedMoveRecord(campaignState, { actorId = null, moveName = null, error = "" } = {}) {
  const failures = (UNSAVED_ON_COPY.get(campaignState) ?? []).map(step => ({ ...step, reason: "refused", error }));
  UNSAVED_ON_COPY.delete(campaignState);
  const move = moveName ? `${moveName}'s` : "The move's";
  ui.notifications?.error?.(`Starforged Companion: the world did not save ${move} record — the roller's meters stand. `
    + (failures.length ? "What it marked is on the GMs' card, with a Retry." : "Nothing else it changed needs a Retry."));
  if (!failures.length) return;
  await postPayoffFailureCard({ source: "persist", actorId, failures }).catch(err =>
    console.warn(`${MODULE_ID} | the move record's failure card failed:`, err?.message ?? err));
}

/**
 * Pay the legacy-box XP a saved working copy owes (addLegacyTicks). Call
 * once the write that saved its ticks has landed; reports, never throws.
 * Exported for bond.apply (src/moves/bondCommand.js).
 *
 * @param {Object} campaignState — the copy the ticks were marked on
 * @returns {Promise<void>}
 */
export async function awardSavedLegacyXp(campaignState) {
  try {
    await payDeferredLegacyXp(campaignState);
  } catch (err) {
    console.warn(`${MODULE_ID} | legacy XP award failed:`, err?.message ?? err);
  }
}

/**
 * Mark a legacy track and save it at once — a payoff outside the move
 * pipeline (a vow fulfilled or a bond forged on the sheet, a payoff Retry).
 * Written on a copy: get() returns the cached value, which a refused write
 * must leave as it was (rules/foundry-api.md). The XP of a box it fills is
 * awarded only once the write has landed — it was awarded first, so a refused
 * write paid XP for ticks that were never saved (issue #306 R04).
 *
 * @param {"quests"|"bonds"|"discoveries"} key
 * @param {number} ticks
 * @returns {Promise<Array<Object>>} the box XP awards that did not land
 *   (awardLegacyBoxXP) — the ticks did; rejects when the world refuses the
 *   legacy write itself
 */
async function writeLegacyTicks(key, ticks) {
  const stored = game.settings.get(MODULE_ID, "campaignState") ?? {};
  const cs = { ...stored, legacyTracks: foundry.utils.deepClone(stored.legacyTracks ?? {}) };
  const marked = addLegacyTicks(cs, key, ticks, { awardXp: false });
  await game.settings.set(MODULE_ID, "campaignState", cs);
  return payLegacyMark(key, marked.boxes, marked.xp, { clearedNow: marked.cleared });
}

/**
 * A saved legacy mark reaches every player character's sheet — or `pcs`, a
 * Retry's — and the earned-XP note posts once any sheet shows a filled box
 * (issue #326 D3). The shared track is canonical; each PC's Starforged sheet
 * mirrors it (`system.legacies.<track>`, src/multiplayer/sharedLegacies.js),
 * where the sheet derives and spends the XP — the module wrote the XP to
 * `system.xp`, a field that sheet does not have. Each sheet stands alone: a
 * refused write is returned as a failed step (`xp`, its PC and the XP the
 * box earned), which the payoff puts on the GMs' failure card, whose Retry
 * mirrors that PC's sheet alone — never the ticks again (issue #309 N06).
 *
 * @param {"quests"|"bonds"|"discoveries"} key
 * @param {number} boxes — newly filled boxes (0: a mark that filled none)
 * @param {number} xp — per PC
 * @param {{ pcs?: Actor[]|null, clearedNow?: boolean }} [opts] — a Retry's PC;
 *   every PC when absent. `clearedNow`: this mark filled the tenth box, so
 *   the note says the track has cleared and started again
 * @returns {Promise<Array<{ step: "xp", pcId: string|null, xp: number, track: string, boxes: number, reason: string, error: string }>>}
 */
async function payLegacyMark(key, boxes, xp, { pcs = null, clearedNow = false } = {}) {
  const { written, failed: refused } = await mirrorLegacyToSheets(key, { pcs });
  const failed = refused.map(({ actor, error }) =>
    ({ step: "xp", pcId: actor?.id ?? null, xp, track: key, boxes, reason: "refused", error }));
  if (boxes <= 0 || !written.length) return failed;
  const label = LEGACY_LABELS[key] ?? key;
  // Named when not every PC was given it: a Retry's PC, or the PCs whose
  // sheets took it beside a refused one.
  const who = pcs || failed.length
    ? written.map(a => escapeChatHtml(a?.name ?? "")).filter(Boolean)
    : [];
  const clearedNote = clearedNow
    ? ` The track is filled and cleared — it starts again from its first box, and each box earns 1 XP from now on.`
    : "";
  await ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>${escapeChatHtml(label)} legacy — box filled</strong><p>+${xp} XP earned${who.length ? ` by ${who.join(", ")}` : ""} (${boxes} box${boxes === 1 ? "" : "es"} filled).${clearedNote} It shows on the character sheet&rsquo;s Legacies tab &mdash; spend it there on new assets or upgrades (Earn Experience).</p></div>`,
    flags:   { [MODULE_ID]: { legacyXpCard: true, track: key, boxes, xp, ...(clearedNow ? { cleared: true } : {}) } },
  }).catch(err => console.warn(`${MODULE_ID} | legacy XP card failed:`, err?.message ?? err));
  return failed;
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

/**
 * Tell a player with no character of their own that their move was not rolled
 * (issue #326 D8) — or, for a `!ptp` (`price`), that its price was not applied
 * (issue #337 Y43): whispered to the author (and the GMs), flagged so it never
 * reads as narration.
 *
 * @param {ChatMessage} message — the player's narration, or their `!ptp`
 * @param {{ price?: boolean }} [opts]
 * @returns {Promise<void>}
 */
async function postNoCharacterNotice(message, { price = false } = {}) {
  const authorId = messageAuthorId(message);
  const whisper  = [...new Set([authorId, ...gmUserIds()].filter(Boolean))];
  const body = price
    ? `<strong>No character to pay the price</strong><p>You don&rsquo;t have a character of your own yet, so this price was not applied &mdash; another player&rsquo;s character can&rsquo;t pay it for you. Ask the GM to assign you a character (or set one as yours under User Configuration), then try again.</p>`
    : `<strong>No character to roll for</strong><p>You don&rsquo;t have a character of your own yet, so this move was not rolled &mdash; another player&rsquo;s character can&rsquo;t make it for you. Ask the GM to assign you a character (or set one as yours under User Configuration), then try again.</p>`;
  await ChatMessage.create({
    content: `<div class="sf-ptp-card">${body}</div>`,
    whisper,
    flags: { [MODULE_ID]: { noCharacterNotice: true } },
  });
}

/** Feedback for Finish the Scene — the challenge finished, its clock retired (issue #326 D6). */
async function postSceneFinishCard(track) {
  const label = escapeChatHtml(track?.label ?? "Scene challenge");
  const clock = track?.tensionClockId ? " Its danger clock is retired." : "";
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>Scene finished</strong><p><strong>${label}</strong> is concluded.${clock}</p></div>`,
      flags:   { [MODULE_ID]: { sceneFinishCard: true, trackId: track?.id ?? null } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postSceneFinishCard: chat post failed:`, err?.message ?? err);
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

async function postCombatThresholdCard({ label, suggestedRank, vowNames, position = null, actorId = null, resolutionId = null }) {
  try {
    await ChatMessage.create({
      content: buildCombatThresholdHtml({ label, suggestedRank, vowNames, position }),
      // position/actorId: Enter the Fray's own outcome position (in control on
      // a strong hit, bad spot on a miss) rides here — the combat track doesn't
      // exist yet when the consequence fires, so createCombatTrackFromThreshold
      // applies it at creation. The weak-hit choose-one stashes its pick into
      // the same flag (sufferDialog combat-position executor).
      // resolutionId: the Enter the Fray this card answers — an upgrade of its
      // result (Burn Momentum / Improve Result) changes the position here while
      // the card still waits (stashPositionOnThresholdCard).
      flags:   { [MODULE_ID]: { combatThresholdCard: true, label: label ?? null, position, actorId, resolutionId } },
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
      beginsFight:   true,    // a new foe is a new fight, whatever else is open (issue #321 U16)
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

// Wire the threshold card's buttons. One choice per card, claimed on the
// canonical GM (relayed "combat.threshold" → cardActions.applyCombatThresholdChoice,
// issue #329 X06): Enter the Fray creates the fight's track, Find another way
// posts the way-out card. A card already taken renders both disabled; a press
// that is not delivered (no GM) re-arms them. The presser's rank, vow and
// objective ride the relay; the label, carried position and roller are the
// card's own.
function registerCombatThresholdHook() {
  if (registerCombatThresholdHook._installed) return;
  registerCombatThresholdHook._installed = true;
  onChatMessageRender((message, root) => {
    if (!message?.flags?.[MODULE_ID]?.combatThresholdCard) return;
    const found = [["sf-enter-fray", "fray"], ["sf-way-out", "wayOut"]]
      .map(([action, choice]) => ({ btn: root.querySelector(`[data-action="${action}"]`), choice }))
      .filter(x => x.btn);
    if (!found.length) return;
    if (liveCardFlags(message)?.thresholdTaken) {
      for (const { btn } of found) btn.disabled = true;
      return;
    }
    const wired = found.map(({ btn, choice }) => {
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      return { btn: fresh, choice };
    });
    const buttons = wired.map(w => w.btn);
    for (const { btn, choice } of wired) {
      btn.addEventListener("click", async (event) => {
        event.preventDefault(); event.stopPropagation();
        const input = {
          rank:      root.querySelector('.sf-threshold-rank')?.value
                     || root.querySelector('.sf-combat-threshold')?.dataset?.suggestedRank,
          vowName:   root.querySelector('.sf-threshold-vow')?.value || "",
          objective: root.querySelector('.sf-threshold-objective')?.value || "",
        };
        for (const b of buttons) b.disabled = true;
        await relayCardAction({
          kind:       "combat.threshold",
          payload:    { messageId: message?.id ?? null, choice, ...input },
          isResolved: () => !!liveCardFlags(message)?.thresholdTaken,
          restore:    () => { for (const b of buttons) b.disabled = false; },
        });
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
    const buttons = () => root.querySelectorAll('[data-action="sf-way-out-move"]');
    // One off-ramp per card, claimed on the canonical GM (`wayOutTaken`,
    // cardActions.applyWayOutPick): disabled only in the clicker's DOM, a
    // re-render rolled the off-ramp again (issue #325 W11).
    if (liveCardFlags(message)?.wayOutTaken) {
      buttons().forEach(b => { b.disabled = true; });
      return;
    }
    for (const btn of buttons()) {
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      fresh.addEventListener("click", async (event) => {
        event.preventDefault(); event.stopPropagation();
        const move = WAY_OUT_MOVES.find(m => m.moveId === fresh.dataset.moveId);
        if (!move) {
          console.warn(`${MODULE_ID} | way-out: unknown move id "${fresh.dataset.moveId}"`);
          return;
        }
        buttons().forEach(b => { b.disabled = true; });
        await relayCardAction({
          kind:       "wayOut.pick",
          payload:    { messageId: message?.id ?? null, moveId: move.moveId, actorId: clickerActorId() },
          isResolved: () => !!liveCardFlags(message)?.wayOutTaken,
          restore:    () => buttons().forEach(b => { b.disabled = false; }),
        });
      });
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
  const vowId          = item?.flags?.[MODULE_ID]?.vowId ?? null;
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
      // marks their copy of the vow (credit the roller). vowId: the vow whose
      // payoff ledger 🤝 Deepen records on (deepenVowConnectionOnce).
      flags: { [MODULE_ID]: { fightVowCard: true, vowName, vowId, marks, connectionName, vowRank, actorId } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postFightVowMilestoneCard: chat post failed:`, err?.message ?? err);
  }
}

// GM-side: mark the linked vow `marks` times (scaled by the fight's rank), on
// the PC that actually holds the vow — the card's roller when they hold it,
// else whichever PC does (resolveVowHolderActor). Shared-vow copies on the
// other PCs follow via the updateItem sync hook. Exported for the won-fight
// card's relay handler (src/moves/cardActions.js applyFightVowMarkMilestone),
// which stamps the card applied only on { ok: true }: a refused mark, or no
// open vow to mark, used to be swallowed here and the card stamped anyway
// (issue #306 R04).
//
// @returns {Promise<{ ok: boolean, reason?: string, error?: string }>}
export async function markLinkedVowMilestone(vowName, marks, actorId = null) {
  try {
    // The card's vow is already fulfilled: nothing to mark, and no other vow
    // marked in its place (issue #325 W29).
    if (linkedVowCompleted(vowName, actorId)) return { ok: false, reason: "vow-completed" };
    const action = await applyReachMilestone(resolveVowHolderActor(vowName, actorId), vowName ?? null, marks);
    if (action === "mark" || action === "pick") return { ok: true };
    console.warn(`${MODULE_ID} | mark linked vow: no open vow "${vowName ?? "?"}" to mark — nothing marked.`);
    return { ok: false, reason: "no-vow" };
  } catch (err) {
    console.warn(`${MODULE_ID} | mark linked vow failed:`, err?.message ?? err);
    return { ok: false, reason: "refused", error: errText(err) };
  }
}

/**
 * True when the vow a won-fight card serves is already complete — its holder's
 * copy by name (resolveVowItemCopies prefers the roller's) is completed, and no
 * open vow carries the name. Its card's buttons are retired (issue #325 W29).
 *
 * @param {string|null} vowName
 * @param {string|null} [actorId]
 * @returns {boolean}
 */
function linkedVowCompleted(vowName, actorId = null) {
  if (!String(vowName ?? "").trim()) return false;
  const vows = getPlayerActors().flatMap(a => readVows(a).map(v => ({ ...v, actorId: a.id })));
  const mine = actorId ? vows.filter(v => v.actorId === actorId) : [];
  return namesCompletedVow(mine.length ? mine : vows, vowName);
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
// (src/moves/cardActions.js applyFightVowDeepenBond); a fulfilment's payoff
// and its Retry run it too. Reports, never throws: a refused write, and a
// connection no longer found by that name (renamed or deleted), used to be
// swallowed here — the bond silently not deepened (issue #306 R04).
//
// @returns {Promise<{ ok: boolean, reason?: string, error?: string }>}
export async function deepenLinkedConnection(connectionName, marks) {
  try {
    const target = await findOpenConnection(connectionName);
    if (!target?.__hostId) {
      console.warn(`${MODULE_ID} | deepen connection: no connection matched "${connectionName ?? "?"}" — nothing deepened.`);
      return { ok: false, reason: "not-found" };
    }
    const conn = await import("./entities/connection.js");
    await conn.markRelationshipProgress(target.__hostId, Math.max(1, marks));
    await postDeepenBondCard(target.name ?? connectionName, Math.max(1, marks));
    return { ok: true };
  } catch (err) {
    console.warn(`${MODULE_ID} | deepen connection failed:`, err?.message ?? err);
    return { ok: false, reason: "refused", error: errText(err) };
  }
}

/**
 * The won-fight card's 🤝 Deepen (issue #326 D1): a vow sworn for a
 * connection deepens it once. The card's deepen and the vow's fulfilment
 * (payFulfilledVowCopies) each deepened it by the vow's rank marks — one vow,
 * two deepens. Whichever lands first pays: it is recorded on the vow's payoff
 * ledger (`fulfilPayoff.deepen`, every copy), which the fulfilment and its
 * Retry already skip a landed step by; a press after the fulfilment's deepen
 * finds it there and deepens nothing (decisions.md → "A vow deepens its
 * connection once").
 *
 * @param {{ vowName?: string|null, vowId?: string|null, actorId?: string|null,
 *   connectionName?: string|null, marks?: number }} card
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: string }>}
 */
export async function deepenVowConnectionOnce({ vowName = null, vowId = null, actorId = null, connectionName = null, marks = 1 } = {}) {
  const copies = payoffVowCopies({ vowId, vowName, actorId });
  if (payoffStepLanded(copies, "deepen")) {
    await postDeepenAlreadyPaidCard(connectionName, vowName);
    return { ok: true, skipped: true, reason: "already-deepened" };
  }
  const res = await deepenLinkedConnection(connectionName, marks);
  if (res?.ok) await recordPayoffStep(copies, "deepen");
  return res;
}

async function postDeepenAlreadyPaidCard(connectionName, vowName) {
  try {
    await ChatMessage.create({
      content: `<div class="sf-card sf-deepen-bond"><div class="sf-card-body"><p>🤝 Your bond with <strong>${escapeChatHtml(connectionName ?? "your connection")}</strong> has already deepened for &ldquo;${escapeChatHtml(vowName ?? "this vow")}&rdquo; — a vow deepens it once.</p></div></div>`,
      flags:   { [MODULE_ID]: { deepenBondCard: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | deepen already paid: chat post failed:`, err?.message ?? err);
  }
}

// The campaign's connection a name resolves to (selectConnection's ladder),
// as its record plus `__hostId`; null when none does.
async function findOpenConnection(connectionName) {
  const conn = await import("./entities/connection.js");
  const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
  const connections = (campaignState.connectionIds ?? [])
    .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
    .filter(Boolean);
  return selectConnection(connections, connectionName ?? null);
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
// 1 one inside the other as whole words, either way (issue #325 W30), 0 no
// match.
function vowNameMatch(entry, lo) {
  const n = (entry.item.name ?? "").trim().toLowerCase();
  if (!n || !lo) return 0;
  if (n === lo) return 2;
  return wholeWordsFit(n, lo) ? 1 : 0;
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
//
// Claimed before it is given (issue #306 R04): the status flips on every copy
// first, so nothing grants it twice, and "🎁 Reward earned" is posted only
// once the grant has landed. Both writes' failures were swallowed — the
// status flipped after a refused grant (the reward lost with no word), or
// stayed "promised" after a granted one (granted again by the next win).
// Reports, never throws: a refused claim is step "reward" (nothing given), a
// refused grant after the claim is step "rewardGrant", carrying what to give.
//
// @returns {Promise<{ ok: boolean, skipped?: boolean, step?: string,
//   reason?: string, error?: string, vowId?: string|null }>}
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
    return { ok: true, skipped: true };
  }

  const plan = planRewardGrant(reward, outcome);
  const rollerCopy = actorId ? copies.find(({ actor }) => actor?.id === actorId) : null;
  const pc   = rollerCopy?.actor ?? rewardHolder ?? getPlayerActors()[0] ?? null;
  if (vowId && !(await setSharedVowReward(vowId, { ...reward, status: plan.status }))) {
    return { ok: false, step: "reward", reason: "refused", vowId, rewardDescription: reward.description ?? null };
  }
  if (plan.status === "granted") {
    const given = await giveReward(pc, reward, plan);
    if (!given.ok) {
      return {
        ...given, step: "rewardGrant", vowId, pcId: pc?.id ?? null,
        reward: { description: reward.description ?? null, form: reward.form ?? null }, plan,
      };
    }
  }
  await postRewardGrantCard(reward, plan).catch(err =>
    console.warn(`${MODULE_ID} | reward grant card failed:`, err?.message ?? err));
  return { ok: true, vowId };
}

// Give a granted reward to `pc`: a supply / momentum boost, or the record of
// gear, an asset, a contact or knowledge on its sheet.
// @returns {Promise<{ ok: boolean, reason?: string, error?: string }>}
async function giveReward(pc, reward, plan) {
  if (!pc) return { ok: false, reason: "no-pc" };
  try {
    if (plan?.form === "supply" || plan?.form === "momentum") {
      await applyMeterChanges(pc, { [plan.form]: plan.amount ?? 1 });
    } else if (!(await recordGrantedReward(pc, reward))) {
      return { ok: false, reason: "refused" };
    }
    return { ok: true };
  } catch (err) {
    console.warn(`${MODULE_ID} | grant reward failed:`, err?.message ?? err);
    return { ok: false, reason: "refused", error: errText(err) };
  }
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
  // The paid flag is the durable claim: nothing is paid until it has landed
  // on a copy (issue #309 N05). A refusal used to be swallowed and the steps
  // ran anyway; with this client's in-flight claim released afterwards, a
  // later duplicate fulfilment found no paid flag and paid it all again.
  let claimed = false;
  for (const { item: i } of allCopies) {
    if (typeof i?.setFlag !== "function") continue;
    try {
      await i.setFlag(MODULE_ID, "fulfilPaid", true);
      claimed = true;
    } catch (err) {
      console.warn(`${MODULE_ID} | native-fulfil: "${i.name ?? i.id}" could not be marked paid:`, err?.message ?? err);
    }
  }

  // The vendor's rank is a ChallengeRank number (issue #325 W01): its name.
  const rank      = item.system?.rank != null ? rankName(item.system.rank) : null;
  const ranksDown = outcome === "weak_hit" ? 1 : 0;
  const legacyTicks    = skipLegacy ? 0 : legacyRewardTicks(rank, ranksDown);
  const connectionName = item.flags?.[MODULE_ID]?.linkedConnectionName ?? null;
  const marks          = marksForSourceRank(rank);
  // A step the vow's ledger records as landed is never paid again — the
  // ledger a Retry reads (issue #309 N05: a fulfilment that ran after a Retry,
  // or after a refused claim, paid every step again).
  const owed = (step) => !payoffStepLanded(allCopies, step);

  // Each step that lands is recorded on every copy (the Retry's ledger); each
  // that does not is told to the GMs on one card (issue #306 R04 — every
  // failure here went to the console only, and could not be retried).
  const failures = [];
  if (!claimed) {
    // Unclaimed, nothing is applied: the GMs' Retry applies the steps, once.
    if (legacyTicks > 0 && owed("legacy")) failures.push({ step: "legacy", track: "quests", ticks: legacyTicks, reason: "unclaimed" });
    if (connectionName && owed("deepen"))  failures.push({ step: "deepen", connectionName, marks, reason: "unclaimed" });
    const promised = allCopies.find(({ item: i }) => i?.flags?.[MODULE_ID]?.reward?.status === "promised");
    if (promised && owed("reward")) {
      failures.push({ step: "reward", reason: "unclaimed", rewardDescription: promised.item.flags[MODULE_ID].reward.description ?? null });
    }
  } else {
    const settle = async (step, res, detail) => {
      if (res?.ok) {
        if (!res.skipped) await recordPayoffStep(allCopies, step);
        failures.push(...(res.xpFailures ?? []));   // the legacy's box XP that did not land (issue #309 N06)
      } else {
        failures.push({ ...detail, ...res, step: res?.step ?? step });
      }
    };

    // Quests legacy — the vendor's native fulfil doesn't credit our legacy tracks.
    // skipLegacy: the pipeline fulfil branch pays legacy on its own campaignState
    // object (persisted once at pipeline end) and passes true so this fresh
    // read-modify-write can't race/clobber that persist.
    if (legacyTicks > 0 && owed("legacy")) {
      await settle("legacy", await runLegacyStep("quests", legacyTicks), { track: "quests", ticks: legacyTicks });
    }

    // Deepen the linked connection (scaled by the vow's rank).
    if (connectionName && owed("deepen")) {
      await settle("deepen", await deepenLinkedConnection(connectionName, marks), { connectionName, marks });
    }

    // Grant the promised reward (one-time; scaled by outcome). The fulfil path
    // surfaces a note when no reward was ever chosen.
    if (owed("reward")) {
      await settle("reward", await grantLinkedVowReward(vowName, outcome, { noteIfAbsent: true, actorId, copies: allCopies }), {});
    }
  }

  if (failures.length) {
    await postPayoffFailureCard({
      source: "fulfil", vowName: item.name ?? vowName ?? null, vowId: item.flags?.[MODULE_ID]?.vowId ?? null,
      actorId, outcome, failures,
    }).catch(err => console.warn(`${MODULE_ID} | native-fulfil: failure card failed:`, err?.message ?? err));
  }
}

// GM-side: mark every copy of the resolved vow completed (shared vows exist
// as one copy per PC; copies collect by vowId, so a renamed copy still
// closes — VOW-RENAME-PAYOFF). Pipeline Fulfill Your Vow companion to
// actorBridge.completeVowItem. Returns { name, rank } of the resolved vow,
// or null when nothing matched. `actorId` / `itemId` (the roller, the scored
// Item) resolve the roller's own vow first — another PC's same-named vow used
// to be the one completed (issue #301 B02). `rank` is the rank's NAME: the
// Item holds the vendor's ChallengeRank number, which paid every vow as a
// dangerous one and threw in the fulfil card (issue #325 W01).
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
  const rank = primary.item.system?.rank;
  return anyDone ? { name: primary.item.name, rank: rank != null ? rankName(rank) : null } : null;
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
      const moveId = classifyProgressRoll(parsed, nativeProgressSubtypeLookup(message, "native-fulfil"));
      // The sheet roll's speaker is the PC who rolled.
      const actorId = typeof message?.speaker?.actor === "string" ? message.speaker.actor : null;
      if (shouldPayFulfilledVow({ moveId, outcome: parsed.outcome })) {
        // Their copy gets the reward.
        payFulfilledVowNative(parsed.source, parsed.outcome, { actorId }).catch(err =>
          console.warn(`${MODULE_ID} | native-fulfil consequence failed:`, err?.message ?? err));
      } else if (shouldForgeBond({ moveId, outcome: parsed.outcome })) {
        // BOND-NATIVE-FORGE fix — a Forge a Bond rolled on the vendor sheet
        // used to narrate only; the record kept bonded:false and no legacy.
        // The roller's bond Item names the connection (issue #330 D5).
        payForgedBondNative(parsed.source, { actorId }).catch(err =>
          console.warn(`${MODULE_ID} | native-forge consequence failed:`, err?.message ?? err));
      } else if (parsed.outcome === "miss" && (moveId === "fulfill_your_vow" || moveId === "forge_a_bond")) {
        // A sheet roll's miss gets the recommit the pipeline offers (issue
        // #330 D1). The hook acted on hits only, so the player recommitted by
        // hand: the boxes cleared and the rank raised on every copy of the
        // vow, or on the connection's record and its bond Items (issue #331
        // X62).
        offerSheetMissRecommit(moveId, parsed.source, actorId).catch(err =>
          console.warn(`${MODULE_ID} | native recommit offer failed:`, err?.message ?? err));
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | native-fulfil consequence hook threw:`, err?.message ?? err);
    }
  });
}

/**
 * The 🔁 Recommit offer for a Fulfill Your Vow or Forge a Bond missed on the
 * sheet (issue #331 X62) — the card the pipeline posts on its own miss (issue
 * #330 D1). A vow: the roller's vow Item of the roll's name (its copies, by
 * their vowId, are recommitted together). A bond: the connection
 * `findSheetBondConnection` resolves — a bond made by hand on the sheet
 * resolves to none, and a connection already bonded has no bond to recommit
 * to, so neither gets an offer.
 *
 * @param {"fulfill_your_vow"|"forge_a_bond"} moveId
 * @param {string|null} source — the roll card's source: the progress Item's name
 * @param {string|null} actorId — the roller
 */
async function offerSheetMissRecommit(moveId, source, actorId) {
  const name = String(source ?? "").trim();
  if (!name) return;
  if (moveId === "fulfill_your_vow") {
    const actor = actorId ? (game.actors?.get?.(actorId) ?? null) : null;
    const item  = actor?.items?.find?.(i => i?.type === "progress"
      && /vow/i.test(String(i?.system?.subtype ?? ""))
      && String(i?.name ?? "").trim().toLowerCase() === name.toLowerCase()) ?? null;
    await postVowRecommitOfferCard({ vowName: item?.name ?? name, itemId: item?.id ?? null, actorId });
    return;
  }
  const target = await findSheetBondConnection(name, actorId);
  if (target?.__hostId && !target.bonded) await postBondRecommitOfferCard(target, actorId);
  else console.debug(`${MODULE_ID} | bond recommit offer skipped — "${name}" is no un-bonded connection the module tracks.`);
}

/**
 * The module connection a Forge a Bond rolled on the sheet is about (issue
 * #330 D5): the roller's bond Item of that name, by the record id it carries
 * (`flags[MODULE].connectionId`, written by every creator — a renamed
 * connection's Item still finds its record), else the one active connection
 * of exactly that name. Never a fallback to another connection: the sheet
 * roll names its Item exactly, so a name no module connection has is a bond
 * the player made by hand, which the module does not track — the ladder's
 * sole-active rung forged the crew's one connection instead. The decided
 * Forge a Bond fallback (issue #301 B01) stays the pipeline's, whose target
 * the narration may only half name.
 *
 * @param {string|null} itemName — the roll card's source: the bond Item's name
 * @param {string|null} [actorId] — the roller (the roll card's speaker)
 * @returns {Promise<Object|null>} the record with `__hostId`, or null
 */
async function findSheetBondConnection(itemName, actorId = null) {
  const conn = await import("./entities/connection.js");
  const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
  const connections = (campaignState.connectionIds ?? [])
    .map(hostId => { const c = conn.getConnection(hostId); return c ? { ...c, __hostId: hostId } : null; })
    .filter(c => c && c.active !== false);
  const wanted = String(itemName ?? "").trim().toLowerCase();
  if (!wanted) return null;
  const actor = actorId ? (game.actors?.get?.(actorId) ?? null) : null;
  const item = actor?.items?.find?.(i => i?.type === "progress"
    && /bond|connection/i.test(String(i?.system?.subtype ?? ""))
    && String(i?.name ?? "").trim().toLowerCase() === wanted) ?? null;
  const keyedId = item?.flags?.[MODULE_ID]?.connectionId ?? null;
  if (keyedId) return connections.find(c => c._id === keyedId || c.__hostId === keyedId) ?? null;
  const named = connections.filter(c => String(c.name ?? "").trim().toLowerCase() === wanted);
  return named.length === 1 ? named[0] : null;
}

// GM-side companion to registerNativeFulfilConsequenceHook for Forge a Bond:
// flip the record to bonded and pay the rank-scaled bonds legacy, exactly as
// the pipeline forgeABond branch does. Idempotent — an already-bonded
// connection pays nothing (the bond can only forge once). Exported for unit
// testing.
export async function payForgedBondNative(connectionName, { actorId = null } = {}) {
  let claim = null;
  try {
    const conn = await import("./entities/connection.js");
    const target = await findSheetBondConnection(connectionName, actorId);
    if (!target?.__hostId) {
      console.debug(`${MODULE_ID} | native-forge: no module connection is "${connectionName ?? "?"}" — nothing forged.`);
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
    // The bonds legacy, read and written after the await (writeLegacyTicks).
    // A refused write is told to the GMs, with a Retry, and the forge card
    // says the legacy is not yet marked (issue #306 R04 — it was logged, and
    // the card claimed the ticks).
    const ticks  = legacyRewardTicks(target.rank, 0);
    const legacy = ticks > 0 ? await runLegacyStep("bonds", ticks) : { ok: true };
    await postForgeABondCard(target, ticks, { legacyPending: !legacy.ok }).catch(err =>
      console.warn(`${MODULE_ID} | native-forge card failed:`, err?.message ?? err));
    // A refused legacy, or a box XP award that did not land (issue #309 N06).
    const failures = legacy.ok ? (legacy.xpFailures ?? []) : [{ step: "legacy", track: "bonds", ticks, ...legacy }];
    if (failures.length) {
      await postPayoffFailureCard({
        source: "forge", connectionName: target.name ?? connectionName ?? null, failures,
      }).catch(err => console.warn(`${MODULE_ID} | native-forge: failure card failed:`, err?.message ?? err));
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | native-forge payoff failed:`, err?.message ?? err);
  } finally {
    if (claim) _nativePayoffsInFlight.delete(claim);
  }
}

// ── Payoff steps that fail on their own (issue #306 R04) ─────────────────────
//
// A vow fulfilled on the sheet, a won fight's promised reward and a bond
// forged on the sheet each apply writes after the move: a legacy, a
// connection's progress, a reward. Each used to swallow its own failure into
// the console — the step lost, nobody told, nothing to retry. Each step now
// returns { ok: true } once its writes have landed, or { ok: false, reason,
// error? }; the ones that did not land go to the GMs on one whispered card
// (postPayoffFailureCard) whose Retry re-runs only them, once ("payoff.retry"
// → src/moves/cardActions.js applyPayoffRetry → retryPayoffSteps). A
// fulfilment's steps are also recorded on every copy of the vow as they land
// (`fulfilPayoff`), so a Retry skips one that did.

const errText = (err) => String(err?.message ?? err ?? "unknown error");

/**
 * A legacy mark as a payoff step (writeLegacyTicks); reports, never throws.
 * Once the ticks land the step is done: a box XP award that did not land
 * rides along as `xpFailures`, a step of its own per PC — re-running the
 * legacy would add its ticks again (issue #309 N06).
 */
async function runLegacyStep(track, ticks) {
  let xpFailures;
  try {
    xpFailures = await writeLegacyTicks(track, ticks);
  } catch (err) {
    console.warn(`${MODULE_ID} | ${track} legacy write failed:`, err?.message ?? err);
    return { ok: false, reason: "refused", error: errText(err) };
  }
  return xpFailures.length ? { ok: true, xpFailures } : { ok: true };
}

// A fulfilment's ledger — has `step` landed? (any copy recording it counts)
function payoffStepLanded(copies, step) {
  return copies.some(({ item }) => item?.flags?.[MODULE_ID]?.fulfilPayoff?.[step] === true);
}

// Record a landed step on every copy. Bookkeeping: a refused write is warned,
// not reported — the step itself landed.
async function recordPayoffStep(copies, step) {
  for (const { item } of copies) {
    if (typeof item?.setFlag !== "function") continue;
    const ledger = item.flags?.[MODULE_ID]?.fulfilPayoff ?? {};
    await item.setFlag(MODULE_ID, "fulfilPayoff", { ...ledger, [step]: true }).catch(err =>
      console.warn(`${MODULE_ID} | payoff ledger write failed on "${item.name ?? item.id}":`, err?.message ?? err));
  }
}

// Every copy of a payoff card's vow (completed ones included): by its vowId,
// else by its exact name, the roller's copy first.
function payoffVowCopies({ vowId = null, vowName = null, actorId = null } = {}) {
  const all = collectPlayerVowItems();
  if (vowId) {
    const byId = all.filter(e => e.item.flags?.[MODULE_ID]?.vowId === vowId);
    if (byId.length) return byId;
  }
  const lo = String(vowName ?? "").trim().toLowerCase();
  const exact = lo ? all.filter(e => vowNameMatch(e, lo) === 2) : [];
  const primary = (actorId ? exact.find(e => e.actor?.id === actorId) : null) ?? exact[0] ?? null;
  return primary ? collectVowCopies(all, primary) : [];
}

const gmUserIds = () => Array.from(game.users ?? []).filter(u => u?.isGM).map(u => u.id);

// The PC meter each suffer move changes — a failure card line shows it as it stands.
const SUFFER_METERS = { lose_momentum: "momentum", endure_harm: "health", endure_stress: "spirit", sacrifice_resources: "supply" };

const PAYOFF_REASONS = {
  "refused":   "the world did not save it",
  "site-gone": "the site is no longer on the sector map",
  "unclaimed": "the vow could not be marked paid, so nothing was applied",
  "not-found": "no connection by that name is open — renamed or deleted?",
  "no-vow":    "no open vow by that name",
  "no-pc":     "no player character to receive it",
};

const PAYOFF_TITLES = {
  fulfil:      (c) => `Vow payoff incomplete — “${c.vowName ?? "your vow"}”`,
  fight:       (c) => `Victory reward incomplete — “${c.vowName ?? "your vow"}”`,
  forge:       (c) => `Bond payoff incomplete — ${c.connectionName ?? "the bond"}`,
  fightButton: (c) => `Victory card not applied — “${c.vowName ?? "your vow"}”`,
  legacyXp:    ()  => `Legacy not shown on a character sheet`,
  suffer:      (c) => `Consequence not applied — ${game.actors?.get?.(c.actorId)?.name ?? "your character"}`,
  upgrade:     (c) => `Upgraded result not fully applied — ${game.actors?.get?.(c.actorId)?.name ?? "your character"}`,
  session:     ()  => `Session momentum not given`,
  sessionClocks: () => `Session-start clock advance not saved`,
  rider:       (c) => `Asset effects not applied — ${game.actors?.get?.(c.actorId)?.name ?? "your character"}`,
  persist:     (c) => `Move not saved — ${game.actors?.get?.(c.actorId)?.name ?? "your character"}`,
};

/**
 * Tell the GMs which payoff steps did not land: one card, whispered to every
 * GM, listing each step — what it would apply, why it did not, and the value
 * it changes as it stands now. A save that reached the world but lost its
 * confirmation looks the same as a refused one, so the GM can check before
 * pressing Retry, which re-runs only these steps, once
 * (wirePayoffRetryButton). `retryable: false` (a won-fight card's button,
 * which is itself the retry: its action stays unapplied) posts the report
 * without one. Exported for that button's GM-side handler.
 *
 * @param {{ source: "fulfil"|"fight"|"forge"|"fightButton"|"legacyXp"|"suffer"|"upgrade"|"session"|"sessionClocks"|"rider"|"persist", vowName?: string|null,
 *   vowId?: string|null, actorId?: string|null, outcome?: string|null,
 *   connectionName?: string|null, failures: Array<Object>, retryable?: boolean }} card
 */
export async function postPayoffFailureCard({ source, vowName = null, vowId = null, actorId = null, outcome = null, connectionName = null, failures, retryable = true }) {
  const context = { source, vowName, vowId, actorId, outcome, connectionName };
  const lines = [];
  for (const f of failures) lines.push(`<li>${await describePayoffFailure(f, context)}</li>`);
  const title = (PAYOFF_TITLES[source] ?? PAYOFF_TITLES.fulfil)(context);
  const footer = retryable
    ? `<p class="sf-card-hint">Check these values before retrying: a save that reached the world but lost its confirmation looks the same as a refused one. Only GMs see this card.</p>`
      + `<div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn" data-action="sf-payoff-retry" `
      + `title="Apply the steps above again — once">↻ Retry these steps</button></div>`
    : `<p class="sf-card-hint">Its button on the victory card is live again — press it to retry. Only GMs see this card.</p>`;
  await ChatMessage.create({
    content: `<div class="sf-ptp-card sf-payoff-failure"><strong>${escapeChatHtml(title)}</strong>`
      + `<p>Not applied:</p><ul>${lines.join("")}</ul>${footer}</div>`,
    whisper: gmUserIds(),
    // steps: what a Retry re-runs — read from this GM-authored card, never
    // from the click (src/moves/cardActions.js applyPayoffRetry).
    flags: { [MODULE_ID]: {
      payoffFailureCard: true, retryable, resolved: false, ...context,
      steps: failures.map(payoffStepRecord),
    } },
  });
}

// What a Retry needs of a failed step — its display fields stay on the card's text.
function payoffStepRecord(f) {
  switch (f?.step) {
    case "legacy":      return { step: "legacy", track: f.track ?? null, ticks: f.ticks ?? 0 };
    case "deepen":      return { step: "deepen", connectionName: f.connectionName ?? null, marks: f.marks ?? 1 };
    case "rewardGrant": return { step: "rewardGrant", pcId: f.pcId ?? null, reward: f.reward ?? null, plan: f.plan ?? null };
    case "milestone":   return { step: "milestone", marks: f.marks ?? 1 };
    case "xp":          return { step: "xp", pcId: f.pcId ?? null, xp: f.xp ?? 0, track: f.track ?? null, boxes: f.boxes ?? 1 };
    case "suffer":      return { step: "suffer", call: f.call ?? null, opts: f.opts ?? {} };
    case "upgrade":     return upgradeStepRecord(f);
    case "momentum":    return { step: "momentum", pcId: f.pcId ?? null, amount: f.amount ?? 1, sessionId: f.sessionId ?? null, award: f.award ?? null };
    case "clocks":      return { step: "clocks", sessionId: f.sessionId ?? null,
      clocks: (Array.isArray(f.clocks) ? f.clocks : []).map(c => ({ _id: c?._id ?? null, name: c?.name ?? null, filled: c?.filled ?? 0, segments: c?.segments ?? null })) };
    case "rider":       return { step: "rider", rider: f.rider ?? null, track: f.track ?? null, shipActorId: f.shipActorId ?? null };
    case "arrival":     return { step: "arrival", locationId: f.locationId ?? null, locationType: f.locationType ?? null, name: f.name ?? null };
    case "site":        return { step: "site", sectorId: f.sectorId ?? null, siteId: f.siteId ?? null, name: f.name ?? null };
    default:            return { step: f?.step ?? "reward" };
  }
}

// One failed step, as a line of the GM card: what, why, and its value now.
async function describePayoffFailure(f, { vowName, actorId }) {
  const why = escapeChatHtml(PAYOFF_REASONS[f.reason] ?? f.reason ?? "it failed")
    + (f.error ? ` <span class="sf-card-hint">(${escapeChatHtml(f.error)})</span>` : "");
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  try {
    switch (f.step) {
      case "legacy": {
        const track = game.settings.get(MODULE_ID, "campaignState")?.legacyTracks?.[f.track];
        const now   = track?.ticks ?? 0;
        return `${escapeChatHtml(LEGACY_LABELS[f.track] ?? f.track)} legacy: +${plural(f.ticks, "tick")} — ${why}. It stands at ${now}/40 ticks now${track?.cleared ? " (cleared)" : ""}.`;
      }
      case "deepen": {
        const target = await findOpenConnection(f.connectionName);
        const now = target ? ` It stands at ${Number(target.relationshipTicks ?? 0)}/40 ticks now.` : "";
        return `Your bond with ${escapeChatHtml(f.connectionName ?? "your connection")}: +${plural(f.marks, "milestone")} of relationship progress — ${why}.${now}`;
      }
      case "suffer": {
        // A suffer pick's write (issue #309 N07): the PC meter it changes, as it stands now.
        const pc    = actorId ? (game.actors?.get?.(actorId) ?? null) : null;
        const meter = f.call?.kind === "meter" ? f.call.meterKey : SUFFER_METERS[f.call?.sufferId];
        const value = meter ? readCharacterSnapshot(pc)?.meters?.[meter] : undefined;
        const now   = value !== undefined ? ` ${escapeChatHtml(pc?.name ?? "")}'s ${meter} stands at ${value} now.` : "";
        return `${escapeChatHtml(summarizeSufferCalls([f.call]))} for ${escapeChatHtml(pc?.name ?? "the character")} — ${why}.${now}`;
      }
      case "upgrade":
        // A burn's or an improvement's write after its claim (issue #311 P06).
        return describeUpgradeStep(f, why);
      case "momentum": {
        // A PC's Begin / End a Session momentum (issue #311 P08).
        const pc  = f.pcId ? (game.actors?.get?.(f.pcId) ?? null) : null;
        const who = escapeChatHtml(pc?.name ?? "a character");
        const now = pc ? ` ${who}'s momentum stands at ${readCharacterSnapshot(pc)?.meters?.momentum ?? "?"} now.` : "";
        return `+${f.amount ?? 1} momentum for ${who}${f.award ? ` (${escapeChatHtml(f.award)})` : ""} — ${why}.${now}`;
      }
      case "rider":
        // An asset effect after a move (issue #315 S08).
        return describeRiderStep(f, why, actorId);
      case "arrival": {
        // A move's arrival whose record the world refused (issue #331 X18).
        const stored = game.settings.get(MODULE_ID, "campaignState") ?? {};
        const here   = stored.currentLocationId ? (currentLocationForEntityId(stored.currentLocationId)?.entity?.name ?? "another place") : "nowhere";
        return `The crew's current location: ${escapeChatHtml(f.name ?? "the destination")} — ${why}. It is ${escapeChatHtml(here)} now.`;
      }
      case "site": {
        // A move's site reveal whose record the world refused (issue #331 X18).
        const sector = (game.settings.get(MODULE_ID, "campaignState")?.sectors ?? []).find(x => x?.id === f.sectorId);
        const site   = sector?.mapData?.discoveries?.find?.(d => d?.id === f.siteId);
        const now    = !site ? " It is no longer on the map." : site.discovered ? " It is charted now." : " It is still uncharted on the map.";
        return `The site ${escapeChatHtml(f.name ?? "it reached")} charted as discovered — ${why}.${now}`;
      }
      case "clocks": {
        // A session-start campaign clock advance the world refused (issue #316 T04).
        const live = game.settings.get(MODULE_ID, "campaignState")?.clocks ?? [];
        const parts = (f.clocks ?? []).map(c => {
          const now = live.find(x => x._id === c._id);
          const standing = now ? ` (stands at ${now.filled ?? 0}/${now.segments} now)` : " (no longer on the list)";
          return `${escapeChatHtml(c.name ?? "a clock")} to ${c.filled}/${c.segments ?? "?"}${standing}`;
        });
        return `Begin a Session's campaign clock advance: ${parts.join("; ")} — ${why}. The oracle's roll stands; Retry saves it without rolling again.`;
      }
      case "xp": {
        // A legacy mark's write to a PC's sheet (issue #326 D3): the sheet's
        // legacy, and the XP it shows, as they stand now.
        const pc    = f.pcId ? (game.actors?.get?.(f.pcId) ?? null) : null;
        const who   = escapeChatHtml(pc?.name ?? "a character");
        const label = escapeChatHtml(LEGACY_LABELS[f.track] ?? f.track);
        const now   = pc ? ` ${who}'s sheet shows ${readSheetLegacy(pc, f.track)} ${label} ticks and ${readCharacterSnapshot(pc)?.xp?.value ?? 0} XP now.` : "";
        const earned = f.xp > 0 ? ` (+${f.xp} XP earned by a filled box)` : "";
        return `The ${label} legacy on ${who}'s character sheet${earned} — ${why}.${now}`;
      }
      case "milestone": {
        const vow = readVows(resolveVowHolderActor(vowName, actorId)).find(v => v.name === vowName && !v.completed);
        const now = vow ? ` It stands at ${vow.ticks}/40 ticks now.` : "";
        return `⚑ Milestone ×${f.marks ?? 1} on “${escapeChatHtml(vowName ?? "your vow")}” — ${why}.${now}`;
      }
      case "rewardGrant": {
        const pc   = f.pcId ? (game.actors?.get?.(f.pcId) ?? null) : null;
        const who  = escapeChatHtml(pc?.name ?? "the character");
        const form = f.plan?.form;
        const meter = (form === "supply" || form === "momentum") ? readCharacterSnapshot(pc)?.meters?.[form] : undefined;
        const now  = meter !== undefined ? ` ${who}'s ${form} stands at ${meter} now; this adds ${f.plan?.amount ?? 1}.` : "";
        return `The promised reward “${escapeChatHtml(f.reward?.description ?? "your reward")}” — recorded as earned, but not given to ${who}: ${why}.${now}`;
      }
      default:
        return `The promised reward${f.rewardDescription ? ` “${escapeChatHtml(f.rewardDescription)}”` : ""} — ${why}; nothing was given.`;
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | payoff failure line failed:`, err?.message ?? err);
    return `${escapeChatHtml(f.step ?? "A step")} — ${why}.`;
  }
}

/**
 * The GM side of a payoff card's Retry, once the card is claimed: each step
 * runs again unless a fulfilment's ledger says it landed meanwhile, and any
 * that fail again go on a fresh card with its own Retry. Every value comes
 * from the GM-authored card. Exported for src/moves/cardActions.js
 * applyPayoffRetry.
 *
 * @param {Object} card — the failure card's module flags
 * @returns {Promise<Array<Object>>} the steps that failed again
 */
export async function retryPayoffSteps(card) {
  const fulfil = card?.source === "fulfil";
  const copies = (fulfil || card?.source === "fight") ? payoffVowCopies(card ?? {}) : [];
  const failures = [];
  for (const s of Array.isArray(card?.steps) ? card.steps : []) {
    const ledgerStep = s?.step === "rewardGrant" ? "reward" : s?.step;
    // A PC's box XP is on no ledger: only this card's Retry gives it.
    const onLedger = fulfil && s?.step !== "xp";
    if (onLedger && payoffStepLanded(copies, ledgerStep)) continue;
    const res = await runPayoffStep(s, card, copies);
    if (res?.ok) {
      if (onLedger && !res.skipped) await recordPayoffStep(copies, ledgerStep);
      failures.push(...(res.xpFailures ?? []));
    } else {
      failures.push({ ...s, ...res, step: res?.step ?? s?.step });
    }
  }
  if (failures.length) {
    await postPayoffFailureCard({
      source: card.source, vowName: card.vowName ?? null, vowId: card.vowId ?? null, actorId: card.actorId ?? null,
      outcome: card.outcome ?? null, connectionName: card.connectionName ?? null, failures,
    }).catch(err => console.warn(`${MODULE_ID} | payoff retry: failure card failed:`, err?.message ?? err));
  }
  return failures;
}

// Run one failed step again. The card is GM-authored, but its values are still
// checked: a legacy is one of the three tracks, 1–40 ticks.
async function runPayoffStep(s, card, copies) {
  switch (s?.step) {
    case "legacy": {
      const ticks = Math.floor(Number(s.ticks));
      if (!LEGACY_LABELS[s.track] || !(ticks > 0 && ticks <= 40)) return { ok: false, reason: "invalid step" };
      return runLegacyStep(s.track, ticks);
    }
    case "deepen":
      return deepenLinkedConnection(s.connectionName ?? null, Math.max(1, Math.floor(Number(s.marks)) || 1));
    case "reward":
      if (!copies.length) return { ok: false, reason: "no-vow" };
      return grantLinkedVowReward(card.vowName ?? null, card.outcome ?? null, { actorId: card.actorId ?? null, copies });
    case "suffer": {
      // A suffer pick's refused write, applied for the card's PC (issue #309 N07).
      const { runSufferResolution, isRetryableSufferCall } = await import("./moves/sufferDialog.js");
      const pc = card?.actorId ? (game.actors?.get?.(card.actorId) ?? null) : null;
      if (!isRetryableSufferCall(s.call)) return { ok: false, reason: "invalid step" };
      if (!isPlayerCharacterActor(pc)) return { ok: false, reason: "no-pc" };
      const [res] = await runSufferResolution([s.call], pc, s.opts ?? {});
      return res?.ok === false ? { ...res, ok: false } : { ok: true };
    }
    case "upgrade":
      // A burn's or an improvement's write refused after its claim (issue #311 P06).
      return retryUpgradeStep(s);
    case "rider":
      // An asset effect the world refused after a move (issue #315 S08).
      return retryRiderStep(s, card?.actorId ?? null);
    case "arrival": {
      // A move's arrival whose record the world refused (issue #331 X18):
      // the place it reached, written onto the latest store.
      const located = currentLocationForEntityId(typeof s.locationId === "string" ? s.locationId : null);
      if (!located || located.type !== s.locationType) return { ok: false, reason: "invalid step" };
      try {
        const stored = game.settings.get(MODULE_ID, "campaignState") ?? {};
        await game.settings.set(MODULE_ID, "campaignState", { ...stored, currentLocationId: located.id, currentLocationType: located.type });
        return { ok: true };
      } catch (err) {
        console.warn(`${MODULE_ID} | payoff retry: the arrival was refused again:`, err?.message ?? err);
        return { ok: false, reason: "refused", error: errText(err) };
      }
    }
    case "site": {
      // A move's site reveal whose record the world refused (issue #331 X18).
      const { saveSiteDiscovered } = await import("./sectors/siteDiscovery.js");
      return saveSiteDiscovered({ sectorId: s.sectorId ?? null, siteId: s.siteId ?? null });
    }
    case "clocks": {
      // A session-start clock advance the world refused: the rolled fills are
      // saved, never rolled again, and a clock already there is left (issue #316 T04).
      const entries = (Array.isArray(s.clocks) ? s.clocks : [])
        .filter(c => typeof c?._id === "string" && c._id && Number.isInteger(Number(c.filled)) && Number(c.filled) >= 1 && Number(c.filled) <= 10)
        .map(c => ({ _id: c._id, filled: Number(c.filled) }));
      if (!entries.length) return { ok: false, reason: "invalid step" };
      return applyClockAdvances(entries);
    }
    case "momentum": {
      // A PC's session momentum the world refused — that PC's alone (issue #311 P08).
      const amount = Math.floor(Number(s.amount));
      if (!(amount >= 1 && amount <= 2)) return { ok: false, reason: "invalid step" };
      const pc = s.pcId ? (game.actors?.get?.(s.pcId) ?? null) : null;
      if (!isPlayerCharacterActor(pc)) return { ok: false, reason: "no-pc" };
      try {
        await applyMeterChanges(pc, { momentum: amount });
        return { ok: true };
      } catch (err) {
        console.warn(`${MODULE_ID} | payoff retry: momentum for ${pc.name} refused again:`, err?.message ?? err);
        return { ok: false, reason: "refused", error: String(err?.message ?? err) };
      }
    }
    case "xp": {
      // A legacy mark's sheet write for one PC — the ticks already landed on
      // the shared track (issue #309 N06); the sheet shows the XP it earns
      // (issue #326 D3).
      const xp = Math.floor(Number(s.xp));
      if (!LEGACY_LABELS[s.track] || !(xp >= 0 && xp <= 20)) return { ok: false, reason: "invalid step" };
      const pc = s.pcId ? (game.actors?.get?.(s.pcId) ?? null) : null;
      if (!isPlayerCharacterActor(pc)) return { ok: false, reason: "no-pc" };
      const [failed] = await payLegacyMark(s.track, Math.max(0, Math.floor(Number(s.boxes)) || 0), xp, { pcs: [pc] });
      return failed ? { ...failed, ok: false } : { ok: true };
    }
    case "rewardGrant": {
      const pc = s.pcId ? (game.actors?.get?.(s.pcId) ?? null) : null;
      const given = await giveReward(pc, s.reward, s.plan);
      if (given.ok) {
        await postRewardGrantCard(s.reward, s.plan).catch(err =>
          console.warn(`${MODULE_ID} | reward grant card failed:`, err?.message ?? err));
      }
      return given;
    }
    default:
      return { ok: false, reason: "invalid step" };
  }
}

/**
 * Wire a payoff failure card's "↻ Retry these steps": one press relays to the
 * canonical GM ("payoff.retry" → src/moves/cardActions.js applyPayoffRetry),
 * which claims the card before re-running anything; a claimed card renders
 * disabled, and a press that is not delivered re-arms the button.
 *
 * Exported so tests and Quench can drive it with a synthetic message + root.
 */
export function wirePayoffRetryButton(message, root) {
  const f = message?.flags?.[MODULE_ID];
  if (!f?.payoffFailureCard) return;
  const btn = root?.querySelector?.('[data-action="sf-payoff-retry"]');
  if (!btn) return;
  if (liveCardFlags(message)?.resolved) {
    btn.disabled = true;
    btn.textContent = "↻ Retried";
    return;
  }
  const fresh = btn.cloneNode(true);
  btn.replaceWith(fresh);
  fresh.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    fresh.disabled = true;
    await relayCardAction({
      kind:       "payoff.retry",
      payload:    { messageId: message?.id ?? null },
      isResolved: () => !!liveCardFlags(message)?.resolved,
      restore:    () => { fresh.disabled = false; },
    });
  });
}
onChatMessageRender((message, root) => wirePayoffRetryButton(message, root));

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
 * "🏁 Attempt to Fulfill" relays too ("fulfilVow.attempt" — wireFulfilAttempt):
 * the GM claims the card and posts the roller's Fulfill Your Vow once.
 *
 * Exported for unit testing.
 */
export function wireFightVowButtons(message, root) {
  const f = message?.flags?.[MODULE_ID];
  if (!f?.fightVowCard) return;

  // The vow this card serves is fulfilled: its milestone and 🏁 are retired
  // on every client and render — pressed, they acted on the PC's other vow
  // (issue #325 W29).
  if (linkedVowCompleted(f.vowName ?? null, typeof f.actorId === "string" ? f.actorId : null)) {
    for (const action of ["sf-mark-milestone", "sf-fulfill-vow"]) {
      const btn = root?.querySelector?.(`[data-action="${action}"]`);
      if (btn) btn.disabled = true;
    }
  }

  const wireRelay = (dataAction, kind, action) => {
    const btn = root?.querySelector?.(`[data-action="${dataAction}"]`);
    if (!btn || btn.disabled) return;
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
  wireFulfilAttempt(message, root, "sf-fulfill-vow");
}

// The live module flags of a rendered card — the ChatMessage in game.messages
// carries the latest update (e.g. a resolved stamp written by the GM).
function liveCardFlags(message) {
  const live = message?.id ? (game.messages?.get?.(message.id) ?? null) : null;
  return (live ?? message)?.flags?.[MODULE_ID] ?? null;
}

/**
 * The speaker a card's forced follow-up posts as: the card's roller (its
 * `actorId`), whoever presses the button. The pipeline credits a message's
 * speaker — with none, its author, and a GM's press fell to the campaign's
 * first PC: 🏁 scored and paid that PC's vow, ⚔ rolled Take Decisive Action
 * with their position and momentum (issue #329 X05; decisions.md →
 * "Multiplayer attribution"). Nothing when the card names no roller (an older
 * card): the author's, as before. (The 🏁 buttons relay to the GM, which
 * speaks as the roller itself — cardActions.applyAttemptFulfilVow.)
 *
 * @param {ChatMessage} message — the card
 * @returns {{ speaker?: { actor: string } }}
 */
function cardRollerSpeaker(message) {
  const actorId = message?.flags?.[MODULE_ID]?.actorId;
  return typeof actorId === "string" && actorId ? { speaker: { actor: actorId } } : {};
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
      : plan.momentum > 0
        ? `Your bond with <strong>${name}</strong> holds — take +${plan.momentum} momentum.`
        : `No lasting benefit from your bond with <strong>${name}</strong> this time.`;
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
 * @returns {Promise<"mark"|"pick"|"none"|null>} what it did — null when it
 *   could not act here (no PC, not a GM client); rejects when the mark's
 *   write is refused
 */
async function applyReachMilestone(actor, target, marks = 1) {
  // GM-only: vow Item writes are GM-gated (PERSIST-001), and the result card
  // must not claim progress on a client that can't write. In solo-GM play the
  // player is the GM, so this is the normal path. `marks` > 1 applies a major
  // milestone (a won fight scaled by its rank — #241); shared-vow copies on the
  // other PCs are kept in lockstep by the updateItem sync hook.
  if (!actor || !game.user?.isGM) {
    console.debug(`${MODULE_ID} | reach a milestone: ${actor ? "not a GM client" : "no player character"} — nothing marked.`);
    return null;
  }
  const plan = planReachMilestone(readVows(actor), target);
  if (plan.action === "mark") {
    const ticks = plan.ticks * Math.max(1, Math.floor(marks) || 1);
    await markVowProgress(actor, plan.vow.id, ticks);
    await postReachMilestoneCard(plan.vow, ticks);
  } else if (plan.action === "pick") {
    // The marks ride the picker: a won fight's ×2 that falls to the picker
    // (its vow renamed since) marked the picked vow once (issue #326 W43).
    await postMilestonePickerCard(plan.vows, actor.id, marks);
  }
  // action "none" → no open vow to mark; the move card's otherEffect already
  // tells the player Reach a Milestone marks vow progress.
  return plan.action;
}

/**
 * Post a picker when several vows are open and none was named. Each button
 * relays one vow to the canonical GM (wireMilestonePickerButtons →
 * milestone.pick → src/moves/milestonePicker.js applyMilestonePick). `marks`
 * (a won fight's milestone count, #241) rides each choice, so the pick marks
 * the vow that many times (issue #326 W43).
 */
async function postMilestonePickerCard(vows, actorId, marks = 1) {
  const count = Math.max(1, Math.floor(Number(marks)) || 1);
  const rows = (vows ?? []).map(v =>
    `<button type="button" class="sf-followup-btn" data-action="sf-milestone-pick" ` +
    `data-vow-id="${escapeChatHtml(v.id ?? "")}" data-actor-id="${escapeChatHtml(actorId ?? "")}">` +
    `${escapeChatHtml(v.name || "vow")} <em>(${escapeChatHtml(v.rank ?? "")})</em></button>`,
  ).join("");
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>⚑ Reach a Milestone${count > 1 ? ` (×${count})` : ""}</strong>` +
        `<p>Which vow advances?</p><div class="sf-milestone-picker">${rows}</div></div>`,
      // choices: what the GM-side "milestone.pick" handler validates a relayed
      // click against, and the marks it applies (src/moves/milestonePicker.js
      // applyMilestonePick).
      flags:   { [MODULE_ID]: {
        milestonePicker: true, resolved: false,
        choices: (vows ?? []).map(v => ({ vowId: v.id ?? "", actorId: actorId ?? "", marks: count })),
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
 * `connections` null reads the active connection records (the GM-side
 * "connection.suggest" handler, issue #325 W11). Returns the posted card, or
 * null when there was nothing to offer or the post failed.
 *
 * @param {Array<Object>|null} connections — records with `__hostId`
 * @param {"develop"|"forge"} action
 * @returns {Promise<ChatMessage|null>}
 */
export async function postConnectionPickerCard(connections, action) {
  if (!Array.isArray(connections)) connections = await activeConnectionRecords();
  const eligible = action === "forge"
    ? connections.filter(c => !c.bonded)
    : connections;
  if (!eligible.length) return null;
  const label = action === "develop" ? "🤝 Develop Relationship" : "🔗 Forge a Bond";
  const rows = eligible.map(c =>
    `<button type="button" class="sf-followup-btn" data-action="sf-connection-pick" ` +
    `data-host-id="${escapeChatHtml(c.__hostId ?? "")}" ` +
    `data-pick-action="${escapeChatHtml(action)}" ` +
    `data-connection-name="${escapeChatHtml(c.name ?? "")}">` +
    `${escapeChatHtml(c.name || "connection")} <em>(${escapeChatHtml(c.rank ?? "")})</em></button>`,
  ).join("");
  try {
    return await ChatMessage.create({
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
    return null;
  }
}

/** The active connection records, each with its host Actor id as `__hostId`. */
async function activeConnectionRecords() {
  const { getConnection: gc } = await import("./entities/connection.js");
  const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
  return (state.connectionIds ?? [])
    .map(hostId => { const c = gc(hostId); return c ? { ...c, __hostId: hostId } : null; })
    .filter(c => c && c.active !== false);
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
  const routeFooter = result.sufferRoutes.length
    ? `<p><em>Triggers: ${result.sufferRoutes.map(r => `choose a suffer move (-${r.amount})`).join("; ")}.</em></p>`
    : "";
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>Decisive Action — Cost</strong><p>d100 = <strong>${result.roll}</strong> · ${escapeChatHtml(result.result)}</p>${routeFooter}</div>`,
      flags:   { [MODULE_ID]: { decisiveActionCostCard: true, sufferRoutes: result.sufferRoutes } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postDecisiveActionCostCard: chat post failed:`, err?.message ?? err);
    return;
  }
  await dispatchPayThePriceSufferRoutes(result.sufferRoutes, actorId, "decisive action cost");
}

/**
 * The Pay the Price a rolled result routes (`routePayThePrice` — a Face
 * Danger, Strike, Set a Course … miss, Face Defeat): roll the table, post the
 * card under the move that paid it, land its suffer routes on the roller and
 * advance the countdown clocks. Its price seeds the move's own narration
 * (the caller's withPayThePriceSeed), so it asks for no narration of its own.
 *
 * @param {string|null} actorId — the roller
 * @param {string|null} moveName — the move that paid it ("Face Danger")
 * @param {string|null} [resolutionId] — the move's resolution: a choice the
 *   price leaves the player (Endure Harm / Stress at 0 — issue #329 X03) is
 *   bound to it, so an upgrade of the move retires it
 * @returns {Promise<{ reversals: Object, price: string }|null>}
 */
async function postMovePayThePriceCard(actorId = null, moveName = null, resolutionId = null) {
  const { rollOracle } = await import("./oracles/roller.js");
  let result;
  try {
    result = rollOracle("pay_the_price");
  } catch (err) {
    console.warn(`${MODULE_ID} | ${moveName ?? "move"} pay_the_price roll failed:`, err);
    return null;
  }
  void showD100(result.roll);   // 3D dice for the d100 (fire-and-forget, fail-open)
  // The price is recorded under the move that paid it: the card and RECENT
  // ORACLE RESULTS said "Face Defeat" for every routed price — a Face Danger
  // miss included — a defeat that never happened (issue #325 W03).
  const paidFor = typeof moveName === "string" && moveName.trim() ? moveName.trim() : "";
  const qBlock  = paidFor ? `<p><em>${escapeChatHtml(paidFor)}</em></p>` : "";
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>Pay the Price</strong>${qBlock}<p>d100 = <strong>${result.roll}</strong> · ${escapeChatHtml(result.result)}</p>${sufferRoutesFooter(result.sufferRoutes)}</div>`,
      flags:   {
        [MODULE_ID]: {
          payThePriceCard: true,
          sufferRoutes:    result.sufferRoutes,
          oracleMemory:    { name: "Pay the Price", question: paidFor, answer: result.result },
        },
      },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postMovePayThePriceCard: chat post failed:`, err?.message ?? err);
    return null;
  }

  // Dispatch the suffer executors first (before clock advance) so meter changes
  // land before the burn button is visible. The receipts are what landed — each
  // route's — so the upgrade reversal undoes only that.
  const landed = await dispatchPayThePriceSufferRoutes(result.sufferRoutes, actorId, `${paidFor || "move"} PtP`, { resolutionId });
  const sufferMeterDeltas = landed.flatMap(ptpMeterReceipts);

  const clocksAdvanced = await advanceClocksOnPayThePrice().catch(err => {
    console.warn(`${MODULE_ID} | ${paidFor || "move"} PtP clock advance failed:`, err?.message ?? err);
    return [];
  });

  // No follow-up narration: the move's own narration is seeded with this
  // price (withPayThePriceSeed, issue #321 U03) and depicts it. A second
  // oracle narration told the price again, independently — free to
  // contradict it — for one Claude call more (issue #325 W03).

  // reversals — what the price did, for an upgrade to undo; price — the
  // result the card shows, which the move's narration is seeded with.
  return { reversals: { clocksAdvanced: clocksAdvanced ?? [], sufferMeterDeltas }, price: result.result };
}

/**
 * The PC-meter losses a Pay the Price route actually caused, for the upgrade
 * reversal to refund: the move the dispatcher ran — "companion in harm's way"
 * runs Endure Harm with no companion — and each meter's before and after, so
 * a loss at 0 refunds nothing. Only the four PC meters; Withstand Damage and
 * Companion Takes a Hit change a vehicle or a companion, which a burn does not
 * reverse. The table's annotation stood in for it, so a burn raised health a
 * clamped loss never took and skipped the fallback's real one (issue #311 P04).
 * Harm or stress past the meter is taken as momentum (`momentumLoss`, issue
 * #314 Q02): that is a receipt of its own, which an improvement refunds and a
 * burn's reset replaces.
 *
 * @param {Object|null} landed — dispatchPayThePriceSufferRoute's result
 * @returns {Array<{ move: string, meterKey: string, amount: number, actorId: string|null, before: number, after: number, overflow?: true }>}
 */
function ptpMeterReceipts(landed) {
  const meterKey = SUFFER_METERS[landed?.move];
  if (!meterKey || landed.skipped) return [];
  const receipts = [];
  const amount = Number(landed.before) - Number(landed.after);
  if (amount > 0) {
    receipts.push({ move: landed.move, meterKey, amount, actorId: landed.actorId ?? null, before: landed.before, after: landed.after });
  }
  const m = landed.momentumLoss;
  if (m && m.taken > 0) {
    receipts.push({ move: landed.move, meterKey: "momentum", amount: m.taken, actorId: landed.actorId ?? null, before: m.before, after: m.after, overflow: true });
  }
  return receipts;
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

/** "Epic" for a rank name or the vendor's ChallengeRank number (issue #325 W01); "unknown" for none. */
function rankDisplayLabel(rank) {
  if (rank == null || rank === "") return "unknown";
  const name = rankName(rank);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

async function postFulfillVowCard({ track, legacyTicks, legacyPaid = false }) {
  const rankLabel = rankDisplayLabel(track.rank);
  // Fulfilled on the sheet first: its legacy was paid then (issue #325 W28).
  const legacyLine = legacyPaid
    ? "Quests legacy track: already marked when it was fulfilled on the sheet."
    : `Quests legacy track: <strong>+${legacyTicks} tick${legacyTicks !== 1 ? "s" : ""}</strong> marked.`;
  try {
    await ChatMessage.create({
      content: `<div class="sf-card sf-card--vow-fulfilled"><div class="sf-card-header">⚑ Vow Fulfilled: ${escapeHtml(track.label ?? "vow")}</div><div class="sf-card-body"><p>The <strong>${rankLabel}</strong> vow is complete. ${legacyLine}</p></div></div>`,
      flags: { [MODULE_ID]: { fulfillVowCard: true, trackLabel: track.label, legacyTicks } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postFulfillVowCard: chat post failed:`, err?.message ?? err);
  }
}

// `legacyPending`: the bonds legacy's write did not land — the card says it is
// not yet marked rather than claiming the ticks (the GMs have a Retry).
async function postForgeABondCard(connection, legacyTicks, { legacyPending = false } = {}) {
  const nameLabel = connection.name ?? "connection";
  const rankLabel = rankDisplayLabel(connection.rank);
  const legacyLine = legacyPending
    ? `Bonds legacy track: not yet marked (${rankLabel} rank).`
    : `Bonds legacy track: <strong>+${legacyTicks} tick${legacyTicks !== 1 ? "s" : ""}</strong> marked (${rankLabel} rank).`;
  try {
    await ChatMessage.create({
      content: `<div class="sf-card sf-card--forge-bond"><div class="sf-card-header">⚑ Bond Forged: ${escapeHtml(nameLabel)}</div><div class="sf-card-body"><p>${escapeHtml(nameLabel)} is now bonded. ${legacyLine}</p><p class="sf-stakes"><em>${escapeHtml(progressPerMilestoneLine(connection.rank ?? "dangerous"))}</em></p><p><em>Choose: <strong>Bolster Influence</strong> (add +2) or <strong>Expand Influence</strong> (second role, add +1).</em></p></div></div>`,
      flags: { [MODULE_ID]: { forgeABondCard: true, connectionName: nameLabel, legacyTicks } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postForgeABondCard: chat post failed:`, err?.message ?? err);
  }
}

/**
 * The Pay the Price card's footer: "Routes to endure_harm (-1), endure_stress (-1)." — nothing for none.
 * `notApplied` (markup, escaped by the caller) says why the routes were not applied (issue #337 Y43).
 */
function sufferRoutesFooter(routes, { notApplied = null } = {}) {
  if (!routes?.length) return "";
  const list = routes.map(r => `${escapeChatHtml(r.move)} (-${r.amount})`).join(", ");
  return notApplied
    ? `<p><em>Routes to ${list} &mdash; not applied: ${notApplied}.</em></p>`
    : `<p><em>Routes to ${list}.</em></p>`;
}

/**
 * Dispatch each route a Pay the Price roll landed on, in order, once — a
 * "Roll twice" lands every leaf's (issue #314 Q03: the leaves' routes were
 * dropped, so "You are harmed / You are stressed" cost nothing). A route whose
 * dispatch throws is logged and the next still runs.
 *
 * @param {Array<Object>} routes — rollOracle's `sufferRoutes`
 * @param {string|null} actorId
 * @param {string} where — for the log
 * @returns {Promise<Array<Object>>} the executors' results that came back (ptpMeterReceipts reads them)
 */
/**
 * gmRelay handler for "payThePrice.suffer" — runs on the canonical GM (issue
 * #325 W10). A typed `!ptp` rolls on its author's client (RUN_ON.AUTHOR); its
 * suffer routes land here, on the typist's PC (`actorId`), where every write
 * they make — the allies Sacrifice Resources marks unprepared with the roller
 * (issue #315 S07) among them — is allowed. The requester must own that PC or
 * be a GM; a player with no PC of their own is refused rather than handed
 * another player's. Each route is checked against the suffer moves the table
 * annotates (a known move, an amount of 1–3).
 *
 * @param {{ routes?: Array<{ move: string, amount: number, soloFallback?: string }>, actorId?: string|null }} payload
 * @param {{ requesterId?: string|null, requester?: User|null, requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<{ applied: boolean, reason?: string, landed?: Array<Object> }>}
 */
export async function applyPayThePriceSufferFromRelay(payload = {}, ctx = {}) {
  const { SUFFER_EXECUTORS } = await import("./moves/sufferExecutor.js");
  const known  = (move) => typeof move === "string" && (move === "any" || Object.hasOwn(SUFFER_EXECUTORS, move));
  const routes = (Array.isArray(payload.routes) ? payload.routes : []).slice(0, 4).filter(r =>
    r && known(r.move) && Number.isInteger(r.amount) && r.amount >= 1 && r.amount <= 3
    && (r.soloFallback === undefined || r.soloFallback === null || known(r.soloFallback)));
  if (!routes.length) return { applied: false, reason: "no-routes" };

  const actorId = typeof payload.actorId === "string" && payload.actorId ? payload.actorId : null;
  const actor   = actorId ? (game.actors?.get?.(actorId) ?? null) : null;
  if (actorId && !isPlayerCharacterActor(actor)) {
    console.warn(`${MODULE_ID} | !pay-the-price: ${actorId} is not a player character — the price is not applied.`);
    return { applied: false, reason: "not-a-pc" };
  }
  if (actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | !pay-the-price: user ${ctx?.requesterId ?? "?"} may not pay ${actor?.name ?? "a price with no PC of their own"} — refused.`);
    return { applied: false, reason: "not-owner" };
  }
  const landed = await dispatchPayThePriceSufferRoutes(routes, actor?.id ?? null, "!pay-the-price");
  return { applied: true, landed };
}

async function dispatchPayThePriceSufferRoutes(routes, actorId, where, { resolutionId = null } = {}) {
  const landed = [];
  for (const route of routes ?? []) {
    const res = await dispatchPayThePriceSufferRoute(route, actorId, { resolutionId }).catch(err => {
      console.warn(`${MODULE_ID} | ${where}: suffer dispatch (${route?.move}) failed:`, err?.message ?? err);
      return null;
    });
    if (res) landed.push(res);
  }
  return landed;
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
 * @param {{ resolutionId?: string|null }} [opts] — the move that paid the
 *   price: the at-0 choice an Endure Harm / Stress leaves is bound to it
 *   (issue #329 X03)
 * @returns {Promise<Object|undefined>} the executor's result with the move it
 *   ran (`move` — the fallback, when taken) and the PC (`actorId`); nothing
 *   for an "any" route, which posts a picker
 */
async function dispatchPayThePriceSufferRoute(route, actorId = null, { resolutionId = null } = {}) {
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

  const landed = await executeSuffer(move, actor, {
    amount: route.amount ?? 1,
    itemId,
    isMiss: true,  // Pay the Price always implies a miss context.
    resolutionId,
  });
  return { ...landed, move, actorId: actor.id };
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
  // Strict: a severance is permanent, so a name that matches nobody severs
  // nobody, and a bare `!sever` acts only when one connection is active —
  // never the develop ladder's sole-bonded guess (issue #321 U14). The typed
  // name is a whole-word fragment OF the connection's name, and a fragment
  // that fits several severs none of them (issue #325 W30).
  const target = selectConnection(connections, arg || null, { strict: true });
  if (!target?.__hostId) {
    const fits = arg ? connectionsNamedByFragment(connections, arg) : [];
    ui.notifications?.warn(fits.length > 1
      ? `Starforged Companion: "${arg}" fits ${fits.length} connections (${fits.map(c => c.name).join(", ")}) — type more of the name. Nobody was severed.`
      : `Starforged Companion: no active connection matched "${arg || ""}"${arg ? "" : " — name the connection (!sever <name>) when several are active"}.`);
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
  // A refused write sets nothing, and the card says so (issue #326 W51).
  const marked = await markForceNextAsMove(campaignState);
  await ChatMessage.create({
    content: marked
      ? `<div class="sf-pace-card"><strong>Pacing</strong> <p>Next undecorated input will route to the move interpreter, bypassing the classifier.</p></div>`
      : `<div class="sf-pace-card"><strong>Pacing</strong> <p>!roll was not recorded — the world did not take the write. Try again.</p></div>`,
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

  // A copy: a refused write must leave this client's cached state as it was
  // (issue #321 U58).
  const campaignState = { ...game.settings.get(MODULE_ID, "campaignState") };

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
    // The name is the Actor's — model text a GM confirmed, or typed on the
    // sheet — so it is escaped, as every sibling card escapes its names
    // (issue #336 Y28).
    content: `<p>Current location set to <strong>${escapeChatHtml(match.entity.name)}</strong> (${escapeChatHtml(match.type)}).</p>`,
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
 * Exported so the move-resolution path, the Entities panel's "Set as
 * current location" (issue #321 U56) and the token-drag arrival reach the
 * same logic.
 *
 * `opts.entityId` names the destination by its host document id when the
 * caller knows it (the Entities panel's place; a token dropped on a sector
 * pin): the position is that place's, and the name only a fallback for an id
 * that resolves to no settlement / planet / location (issue #321 U52, U56).
 */
export async function maybeUpdateShipPositionFromName(name, campaignState, source = "manual", { entityId = null } = {}) {
  if (!getShipPositioningEnabled()) return null;
  const ref = typeof name === "string" ? name.trim() : "";
  if (!ref && !entityId) return null;
  if (!game.user?.isGM) return null;            // world-scoped write — GM only

  try {
    const { getCommandVehicleActorId, updateShip } = await import("./entities/ship.js");
    // updateShip resolves by Actor id — the record's `_id` is a module GUID
    // and threw "Ship actor not found" on every write here (finding #5).
    const cvActorId = getCommandVehicleActorId(campaignState);
    if (!cvActorId) return null;
    const position = (entityId ? inferShipPositionFromEntityId(entityId, campaignState, { source }) : null)
      ?? (ref ? inferShipPosition(ref, campaignState, { source }) : null);
    if (!position) return null;
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
  const arg   = parts.join(" ");
  // `new` and `list` are subcommands only as the whole argument: a sector
  // named "New Hope" or "List of Stars" is switched to by its name — `!sector
  // New Hope` opened the Sector Creator (issue #322 V10).
  const sub   = parts.length === 1 ? arg.toLowerCase() : null;

  // A copy: a refused switch must leave this client's cached state as it was
  // (issue #321 U58).
  const campaignState = { ...game.settings.get(MODULE_ID, "campaignState") };

  // Bare `!sector` — show usage (SECTOR-SWITCH-001: it used to do nothing).
  // Whispered to the typist; it's help text, not table news.
  if (!arg) {
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
      `<li>${escapeChatHtml(s.name)} (${escapeChatHtml(s.regionLabel)})${campaignState.activeSectorId === s.id ? " <em>[active]</em>" : ""}</li>`
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
  const name   = arg;
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
    content: `<p>Active sector switched to <strong>${escapeChatHtml(match.name)}</strong>.</p>`,
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
 * riders prompt. A mark that is the outcome's own resolves to the sole track
 * when unambiguous, else the picker. Posts a summary of what landed and what did not; a write
 * the world refused goes to the GMs, with a Retry for it alone (issue #315
 * S08). GM-gated by the caller.
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

  // One outcome per rider that ran: { rider, ok, reason?, error?, track?, shipActorId? }.
  const outcomes = [];
  const withShip = (results) => results.map(o => (o.rider.resource === "integrity" ? { ...o, shipActorId } : o));

  // Automatic meter riders — apply immediately.
  outcomes.push(...withShip(await applyMeterRiders(automatic, { characterActor, shipActorId })));

  // Progress riders: a mark that is the outcome's own — not "you may", not one
  // of a "choose one" — marks the sole track when there is exactly one; the
  // rest go to the picker with the other prompted riders. One track settles
  // where an optional or exclusive mark goes, never whether it is taken: the
  // shortcut marked those unasked, and beside the alternative the player chose
  // (issue #315 S02). A finished track is archived, never a target: counted,
  // a sole finished expedition was marked unasked (issue #315 S06). With no
  // open track a mark has nowhere to go, and the summary says so.
  const tracks = (await listProgressTracks().catch(() => [])).filter(t => !t.completed);
  const promptList = [];
  for (const r of prompted) {
    if (r.resource === "progress" && !tracks.length) {
      outcomes.push({ rider: r, ok: false, reason: "no-track" });
    } else if (r.resource === "progress" && !r.optional && !r.choiceGroup && tracks.length === 1) {
      outcomes.push(await applyProgressRider(r, tracks[0]));
    } else {
      promptList.push(r);
    }
  }

  // Prompt for optional / choice / ambiguous-progress riders.
  if (promptList.length) {
    const { apply, progress } = await promptRiders(promptList, tracks);
    outcomes.push(...withShip(await applyMeterRiders(apply.filter(r => r.resource !== "progress"),
      { characterActor, shipActorId })));
    for (const { rider, trackId } of progress ?? []) {
      outcomes.push(await applyProgressRider(rider, tracks.find(t => t.id === trackId) ?? { id: trackId }));
    }
  }

  await reportRiderOutcomes(outcomes, characterActor);
}

/**
 * One progress rider's marks on its track — its amount, either sign (issue
 * #315 S03) — applied once the track's save has landed: a refused save is
 * said, never summarised as marked (issue #315 S08).
 *
 * @param {Object} rider
 * @param {{ id: string, label?: string }} track
 * @returns {Promise<Object>} the rider's outcome
 */
async function applyProgressRider(rider, track) {
  const at = { rider, track: { id: track.id, label: track.label ?? null } };
  try {
    // The track as it stands now: it can finish while the prompt is open, or
    // before a Retry (issue #315 S06).
    const current = await getProgressTrack(track.id);
    if (!current) return { ...at, ok: false, reason: "track-gone" };
    if (current.completed) return { ...at, ok: false, reason: "track-done" };
    const marked = await adjustProgressById(track.id, rider.amount);
    if (!marked) return { ...at, ok: false, reason: "track-gone" };
    return { ...at, track: { id: marked.id, label: marked.label }, ok: true };
  } catch (err) {
    console.warn(`${MODULE_ID} | consequence riders: progress on "${track.label ?? track.id}" failed:`, err?.message ?? err);
    return { ...at, ok: false, reason: "refused", error: errText(err) };
  }
}

// Why an asset effect did not land — said on the summary card.
const RIDER_NOT_APPLIED = {
  "refused":    "the world did not save it (the GMs have a Retry)",
  "no-pc":      "no character to change",
  "no-vehicle": "no command vehicle to change",
  "battered":   "the vehicle is battered: a Repair must clear that before integrity can rise",
  "track-gone": "its track is gone",
  "track-done": "its track is finished",
  "no-track":   "no open progress track",
};

/** An asset effect's line: what it does, on which track, from which asset. */
function riderLine({ rider, track }) {
  const what = track ? `${rider.label} → ${track.label ?? "a track"}` : rider.label;
  return `${escapeChatHtml(what)}${rider.assetName ? ` <em>(${escapeChatHtml(rider.assetName)})</em>` : ""}`;
}

/**
 * The summary of a move's asset effects — the ones that landed, and the ones
 * that did not with why — and, for each write the world refused, a step on
 * the GMs' payoff failure card, whose Retry applies that effect alone.
 *
 * @param {Array<Object>} outcomes — one per rider that ran
 * @param {Actor|null} characterActor — the roller, whose meters the effects change
 */
async function reportRiderOutcomes(outcomes, characterActor) {
  const applied = outcomes.filter(o => o.ok);
  const missed  = outcomes.filter(o => !o.ok);
  if (!applied.length && !missed.length) return;
  const list = (rows) => `<ul>${rows.map(o => `<li>${riderLine(o)}${o.ok ? "" : ` — ${escapeChatHtml(RIDER_NOT_APPLIED[o.reason] ?? o.reason ?? "it failed")}`}</li>`).join("")}</ul>`;
  // A supply loss that exhausted the crew's supply marked unprepared (issue
  // #331 X16): the line is the write's, shared by its riders — said once.
  const notes = [...new Set(applied.map(o => o.note).filter(Boolean))].map(n => `<p>${n}.</p>`).join("");
  const body = applied.length
    ? `<strong>✦ Asset effects applied</strong>${list(applied)}${notes}${missed.length ? `<p>Not applied:</p>${list(missed)}` : ""}`
    : `<strong>✦ Asset effects not applied</strong>${list(missed)}`;
  await ChatMessage.create({
    content: `<div class="sf-rider-summary">${body}</div>`,
    flags:   { [MODULE_ID]: { riderSummary: true } },
  }).catch(err => console.warn(`${MODULE_ID} | rider summary card failed:`, err?.message ?? err));

  const failures = missed.filter(o => o.reason === "refused").map(o => ({
    step: "rider", rider: o.rider, track: o.track ?? null, shipActorId: o.shipActorId ?? null,
    reason: o.reason, error: o.error ?? null,
  }));
  if (failures.length) {
    await postPayoffFailureCard({ source: "rider", actorId: characterActor?.id ?? null, failures })
      .catch(err => console.warn(`${MODULE_ID} | rider failure card failed:`, err?.message ?? err));
  }
}

/**
 * A payoff card's line for a `rider` step: the effect, and the value it
 * changes as it stands now — the track's ticks, the ship's integrity or the
 * PC's meter.
 */
async function describeRiderStep(f, why, actorId) {
  const rider = f.rider ?? {};
  const what  = riderLine({ rider: { label: rider.label ?? "An asset effect", assetName: rider.assetName ?? "" }, track: f.track ?? null });
  if (rider.resource === "progress") {
    const track = f.track?.id ? await getProgressTrack(f.track.id) : null;
    return `${what} — ${why}.${track ? ` It stands at ${Number(track.ticks ?? 0)}/40 ticks now.` : ""}`;
  }
  if (rider.resource === "integrity") {
    const { getShip } = await import("./entities/ship.js");
    const ship = f.shipActorId ? getShip(f.shipActorId) : null;
    return `${what} — ${why}.${ship ? ` ${escapeChatHtml(ship.name ?? "The ship")}'s integrity stands at ${ship.integrity} now.` : ""}`;
  }
  const pc    = actorId ? (game.actors?.get?.(actorId) ?? null) : null;
  const value = readCharacterSnapshot(pc)?.meters?.[rider.resource];
  const now   = value !== undefined ? ` ${escapeChatHtml(pc?.name ?? "")}'s ${escapeChatHtml(rider.resource)} stands at ${value} now.` : "";
  return `${what} for ${escapeChatHtml(pc?.name ?? "the character")} — ${why}.${now}`;
}

/**
 * A payoff card's `rider` step, applied again: the one asset effect the world
 * refused after a move (issue #315 S08) — the card's PC's meters, its ship's
 * integrity or its track. The card is GM-authored, but its rider is still
 * validated as the extractor's output is.
 *
 * @param {Object} s — the step: { rider, track, shipActorId }
 * @param {string|null} actorId — the card's PC
 * @returns {Promise<{ ok: boolean, reason?: string, error?: string }>}
 */
async function retryRiderStep(s, actorId) {
  const rider = normaliseRider({ ...s?.rider, condition: "any" }, s?.rider?.assetName ?? "");
  if (!rider) return { ok: false, reason: "invalid step" };
  if (rider.resource === "progress") {
    if (!s.track?.id) return { ok: false, reason: "invalid step" };
    const { ok, reason, error } = await applyProgressRider(rider, s.track);
    return { ok, reason, error };
  }
  const pc = rider.resource === "integrity" ? null : (actorId ? (game.actors?.get?.(actorId) ?? null) : null);
  if (rider.resource !== "integrity" && !isPlayerCharacterActor(pc)) return { ok: false, reason: "no-pc" };
  const [{ ok, reason, error }] = await applyMeterRiders([rider], { characterActor: pc, shipActorId: s.shipActorId ?? null });
  return { ok, reason, error };
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
async function postMoveResult(resolution, aside = null, burnState = null, improveState = null, milestoneState = null, connectionState = null, fight = null, rollerActorId = null) {
  // 3D dice (Dice So Nice) for the action + challenge dice, fed the values the
  // resolver already rolled so the animation matches the card. Fire-and-forget
  // and fail-open — never blocks or breaks the result post. A no-roll move
  // rolled nothing to show.
  if (resolution.rollKind !== "none") void showMoveRoll(resolution);
  const combatMove = TDA_OFFER_MOVES.has(resolution.moveId);
  const namedFight = combatMove && fight?.id ? fight : null;
  return ChatMessage.create({
    content: formatMoveResult(resolution, aside, burnState, improveState, milestoneState, connectionState, namedFight),
    flags: {
      [MODULE_ID]: {
        moveResolution: true,
        resolutionId:   resolution._id,
        // The roller: whose reward a waypoint match's alternative is, and who
        // may take it (cardActions.js applyWaypointOraclePick, issue #316 T06).
        ...(rollerActorId ? { actorId: rollerActorId } : {}),
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
  // The card offers Burn Momentum or Improve Result: its follow-ups say to
  // take them first — a follow-up is the roller's next move, which closes
  // them (issue #326 D4; issue #330 D2: ⚑ taken first spent the burn).
  const upgradeOffered = !!(burnState?.canBurn || improveState?.canImprove);

  // Progress moves roll no action die — the score is the track's filled boxes
  // (statValue carries the ticks; progressScore = floor(ticks / 4)). Rendering
  // them through the action-move template printed "+ (0)" and "Action: 0 + N
  // = 0" against a real outcome. A no-roll move (resolver rollKind "none" —
  // Make a Discovery, Reach a Milestone …) has no dice and no outcome to
  // show: it printed "+null (0)" and a "Miss" (issue #316 T05).
  const noRoll = resolution.rollKind === "none";
  const statLine = noRoll
    ? `no action roll — the move's effect applies as written`
    : resolution.isProgressMove
      ? `progress (${resolution.statValue} ticks)`
      : `+${resolution.statUsed} (${resolution.statValue})${resolution.statRule ? `, ${escapeChatHtml(resolution.statRule)}` : ""}`;
  const diceLine = noRoll
    ? ""
    : resolution.isProgressMove
      ? `Progress: <strong>${resolution.progressScore}</strong>
        &nbsp;|&nbsp;
        Challenge: ${resolution.challengeDice[0]}, ${resolution.challengeDice[1]}${matchStr}`
      : `Action: ${resolution.actionDieCancelled
          ? `<s>${resolution.actionDie}</s> (cancelled by momentum -${resolution.actionDie})`
          : resolution.actionDie} + ${resolution.statValue}${addsStr}
        = <strong>${resolution.actionScore}</strong>
        &nbsp;|&nbsp;
        Challenge: ${resolution.challengeDice[0]}, ${resolution.challengeDice[1]}${matchStr}`;

  return `
    <div class="sf-move-result ${outcomeClass}">
      <div class="sf-move-name">${resolution.moveName}</div>
      <div class="sf-move-stat">${statLine}</div>
      ${diceLine ? `<div class="sf-move-dice">
        ${diceLine}
      </div>` : ""}
      ${noRoll ? "" : `<div class="sf-move-outcome">${resolution.outcomeLabel}</div>`}
      ${resolution.consequences.otherEffect
        ? `<div class="sf-move-effect">${resolution.consequences.otherEffect}</div>`
        : ""}
      ${aside
        ? `<div class="sf-move-aside">🎲 ${aside}</div>`
        : ""}
      ${renderBurnButtonHtml(burnState)}
      ${renderImproveButtonHtml(improveState)}
      ${renderMilestoneSuggestionHtml(milestoneState, upgradeOffered)}
      ${renderConnectionSuggestionHtml(connectionState, upgradeOffered)}
      ${upgradeOffered && (milestoneState?.eligible || connectionState?.eligible)
        ? `<p class="sf-card-hint">${UPGRADE_FIRST_HINT}</p>`
        : ""}
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
 * Wire the waypoint-match oracle button (Make a Discovery / Confront Chaos).
 * A click relays to the canonical GM ("waypoint.oracle" →
 * src/moves/cardActions.js applyWaypointOraclePick), which claims the card
 * once (`waypointRewardClaimed`), retires the pending ordinary choice and
 * posts the forced follow-up as the roller. The click used to post the move
 * from the clicker's client and only disable its own button: a re-render
 * re-armed it from the unchanged flags, and the match's alternative — the
 * rule's "instead" — stacked on the ordinary +2 momentum (issue #316 T06). A
 * card already claimed, by either reward, renders the button disabled; a click
 * that is not delivered re-arms it. Exported so Quench can drive it with a
 * synthetic message + root.
 */
export function wireWaypointOracleButton(message, root) {
  const oracleMove = message?.flags?.[MODULE_ID]?.waypointOracleCard;
  if (!oracleMove) return;
  const btn = root?.querySelector?.('[data-action="sf-waypoint-oracle"]');
  if (!btn) return;
  const claimed = liveCardFlags(message)?.waypointRewardClaimed;
  if (claimed) {
    btn.disabled = true;
    btn.title = claimed === "ordinary"
      ? "The ordinary reward was taken — the match's alternative no longer applies"
      : "Taken";
    return;
  }
  const fresh = btn.cloneNode(true);
  btn.replaceWith(fresh);
  fresh.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    fresh.disabled = true;
    await relayCardAction({
      kind:       "waypoint.oracle",
      payload:    { messageId: message?.id ?? null },
      isResolved: () => !!liveCardFlags(message)?.waypointRewardClaimed,
      restore:    () => { fresh.disabled = false; },
    });
  });
}
onChatMessageRender((message, root) => wireWaypointOracleButton(message, root));

// A move card's follow-ups beside its open upgrades (issue #330 D2): the
// follow-up is the roller's next move, and their next move closes the card's
// Burn Momentum / Improve Result (issue #326 D4) — so they come first.
const UPGRADE_FIRST_HINT = "Burn momentum or improve the result first — a follow-up below is your next move, and closes them.";
const UPGRADE_FIRST_TITLE = " — burn momentum or improve the result first: this is your next move, and closes them";

/**
 * Render the "Reach a Milestone" suggestion button for a move-result card.
 * Returns "" when not eligible. Clicking marks vow progress without retyping
 * the move (wireMilestoneSuggestionButton). `upgradeOffered`: the card offers
 * a burn or an improvement, which its titles say to take first.
 */
function renderMilestoneSuggestionHtml(milestoneState, upgradeOffered = false) {
  if (!milestoneState?.eligible) return "";
  const first = upgradeOffered ? UPGRADE_FIRST_TITLE : "";
  return `<div class="sf-milestone-suggest-row">` +
    `<button type="button" class="sf-followup-btn" data-action="sf-reach-milestone" ` +
    `title="Mark progress on your vow per its rank${first}">⚑ Mark Progress on Vow</button>` +
    `<button type="button" class="sf-followup-btn" data-action="sf-attempt-fulfill-vow" ` +
    `title="Roll to fulfill your vow (progress roll)${first}">🏁 Attempt to Fulfill Vow</button>` +
    `</div>`;
}

/**
 * Render the "Develop Relationship / Forge a Bond" suggestion buttons for a
 * move-result card. Returns "" when not eligible. Clicking opens a connection
 * picker (wireConnectionSuggestionButtons / wireConnectionPickerButtons).
 * `upgradeOffered` as for the milestone row.
 */
function renderConnectionSuggestionHtml(connectionState, upgradeOffered = false) {
  if (!connectionState?.eligible) return "";
  const first = upgradeOffered ? UPGRADE_FIRST_TITLE : "";
  return `<div class="sf-milestone-suggest-row">` +
    `<button type="button" class="sf-followup-btn" data-action="sf-develop-relationship" ` +
    `title="Mark progress on a connection's relationship track${first}">🤝 Develop Relationship</button>` +
    `<button type="button" class="sf-followup-btn" data-action="sf-forge-bond" ` +
    `title="Attempt to forge a bond with a connection (progress roll)${first}">🔗 Forge a Bond</button>` +
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
    // A copy: the lock reset and the session mint below change it before the
    // write, and get() hands back the cached value — a refused write left the
    // GM's cache on a session the world never minted (gate closed, a new id
    // on this client's narrator cards), which the next whole-object write
    // carried in (issue #331 X40). A refused mint is retried at the next load
    // or Begin a Session.
    const prevState = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});

    // Reset a stale pendingMove lock — left set if Foundry was closed mid-move.
    // Only a lock nobody connected can still be resolving: held by nobody
    // named, by this client's own earlier page, or by a user who is not
    // active — the W25 handover's rule (releaseLockOfDisconnectedGM). A
    // co-GM who is connected holds a live lock: this GM's load mid-narration
    // released it, and the next line ran a second pipeline beside that one
    // (issue #335 Y07). Its own release (claim token, X08), or the handover
    // when it leaves, frees it.
    const staleLock = prevState.pendingMove ? staleMoveLockAtReady(prevState) : null;
    if (staleLock) {
      prevState.pendingMove = false;
      prevState.pendingMoveBy = null;
      prevState.pendingMoveClaim = null;
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
    // scene fields itself. The lock fields are written only to clear the stale
    // lock found above, and only while the store still holds it — a live lock
    // left alone, or a move claimed during these awaits, keeps its own. With
    // nothing to write (no stale lock, no new session) nothing is written: the
    // merge starts from this client's cache, which can lag a co-GM's latest
    // write — the live lock's own release among them — and would carry the old
    // value back over it (issue #335 Y07).
    initSessionId(prevState).then(updated => {
      const latest = game.settings.get(MODULE_ID, "campaignState") ?? {};
      const clearLock = !!staleLock && !!latest.pendingMove && (latest.pendingMoveClaim ?? null) === staleLock.claim;
      const minted = (updated?.currentSessionId ?? null) !== priorSessionId;
      if (!clearLock && !minted) return undefined;
      const fields = [
        ...(clearLock ? ["pendingMove", "pendingMoveBy", "pendingMoveClaim"] : []),
        ...(minted ? SESSION_MINT_FIELDS : []),
      ];
      return game.settings.set(MODULE_ID, "campaignState", mergeOwnedFields(updated, fields, "session start"));
    }).then(async () => {
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

      // The campaign's truths follow the World Truths dialog's newest save
      // (issue #322 V34): a world whose truths were saved in the dialog before
      // each save was written through gets them in worldTruths now, and one
      // never linked links its newest save — before the setup card asks.
      await reconcileSystemTruths().catch(err =>
        console.warn(`${MODULE_ID} | ready: reconciling the World Truths failed:`, err));

      // Notify the GMs if no World Truths have been established yet — posted
      // once (this canonical-GM block) and whispered to every GM: it went to
      // this client's GM alone, so a second GM never saw it (issue #331 X54).
      if (!game.settings.get(MODULE_ID, "campaignState")?.worldTruthsSet) {
        ChatMessage.create({
          content: `<div class="sf-card sf-card--setup">
            <div class="sf-card-header">◈ Campaign Setup</div>
            <p>No World Truths have been established for this campaign.</p>
            <button data-action="openTruthsDialog">Set World Truths ▸</button>
          </div>`,
          flags:   { [MODULE_ID]: { setupCard: true } },
          whisper: gmUserIds(),
        }).catch(err =>
          console.warn(`${MODULE_ID} | truths setup card failed:`, err)
        );
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
    // These migrations write world documents: the canonical GM runs them —
    // two GMs whose clients reconnected together each ran them (issue #326
    // W54). The help journal, macros and World Journal gate themselves.
    if (isCanonicalGM()) import("./entities/migrator.js").then(async ({ flattenSectorActorFolders, scaffoldPcShipFolders, migrateJournalConnectionsToActors, backfillNpcCardSheets, syncEntityRecordNames, moveRecordNotesToSheets, registerUnlistedEntityActors }) => {
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
      try {
        // Known-issues NOTES-PROMOTED-BEFORE — a detail promoted to an NPC
        // card's or ship's record notes before issue #329 X12 made the sheet's
        // Notes tab canonical moves to the tab, where it is shown again.
        const notes = await moveRecordNotesToSheets();
        if (notes.moved || notes.cleared) {
          console.log(`${MODULE_ID} | record notes: moved ${notes.moved} card(s)' promoted details to the Notes tab, cleared ${notes.cleared} duplicate copy(ies)`);
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | record notes move failed:`, err?.message ?? err);
      }
      try {
        // Issue #337 Y34 — an entity Actor whose registration the world
        // refused (a sidebar ship, a draft-confirmed NPC card) is listed.
        // After the connection migration, whose swap it must not duplicate.
        const unlisted = await registerUnlistedEntityActors();
        if (unlisted.listed) {
          console.log(`${MODULE_ID} | entity registration: listed ${unlisted.listed} unregistered entity Actor(s)`);
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | entity registration repair failed:`, err?.message ?? err);
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
  // #326 D3: the shared legacy tracks on every PC's sheet — a sheet edit flows
  // back; the canonical GM backfills the sheets once the world is ready.
  registerLegacySheetSyncHook();
  if (isCanonicalGM()) {
    backfillLegacySheets().catch(err =>
      console.warn(`${MODULE_ID} | legacy sheet backfill failed:`, err?.message ?? err));
  }
  registerEntityRenameSyncHook();
  registerStarshipSeedHook();
  registerCommandVehicleHook();
  registerNativeProgressRollHook();
  registerNativeFulfilConsequenceHook();   // #248 B2: native-sheet vow fulfil → deepen bond + grant reward + legacy
  registerOracleMemoryCaptureHook();       // narrator-context 2026-07: !oracle / !ptp results → campaignState.recentOracles
  registerRollingSummaryRefreshHook();     // #286 B7: rolling summary regen after a narrator card posts, off the narration's path
  registerXCardRedirectHook();             // #321 U07: the X-Card's redirect is cleared once the first narration after it posts
  registerSessionActivityHook();           // #286 C4: chat activity keeps the session alive (lastSessionTimestamp)
  registerPublishedReflectionHook();       // #286 D1: a published Private Channel reflection's NPC developments → their cards
  registerProgressTrackHooks();
  registerClocksPanelHooks();
  registerCombatTrackerHooks();
  registerEntityPanelHooks();
  registerChroniclePanelHooks();             // #306 R11: the open Chronicle panel shows edits the GM applied
  registerDraftCardHooks();
  registerSectorOverviewSync();
  registerSectorSceneHooks();
  registerShipMapSceneHooks();
  // Audio narration — socket relay for cache writes from non-GM clients.
  import("./audio/index.js").then(({ registerAudioSocket, markAudioClientReady }) => {
    registerAudioSocket();
    // Only a narrator card created after this client's start auto-plays —
    // never the chat log rendered at load (issue #322 V15).
    markAudioClientReady();
  }).catch(err => console.warn(`${MODULE_ID} | audio socket registration failed:`, err));
  // Shared inciting-vow — the cross-PC progress sync (no-op on non-canonical
  // clients). Its reward and link picks relay through GM_ACTIONS (issue #325
  // W11: "vow.reward", "vow.link").
  registerSharedVowSyncHook();
  // Reward-choice card (#241 Phase 2) — pick a proposed reward or write your own.
  registerRewardChoiceHook();
  // Player-authored vows (#248 B1) — a vow made on the sheet gets the same setup
  // (reward proposal + ⚔ Swear it roll). GM-gated createItem detection.
  registerPlayerVowHook();
  // Combat threshold (#241) — Enter the Fray vs. way out: button wiring + the
  // GM-side enter-fray relay (track creation is GM-gated).
  registerCombatThresholdHook();
  registerWayOutHook();
  // Recommit relays through gmRelay "expedition.recommit" (issue #321 U20).
  registerRecommitHook();
  // Won-fight vow milestone (#241) — Mark milestone / Fulfill / Deepen bond on a
  // won linked fight; mark + deepen relay to the canonical GM through gmRelay
  // ("fightVow.*" → src/moves/cardActions.js), one-shot per card.
  registerFightVowMilestoneHook();
  registerSettingsHooks();
  // Both upgrades re-narrate through the pipeline's narrator and apply the
  // upgraded outcome's other effects through its applier
  // (UPGRADE-PIPELINE-EFFECTS).
  registerBurnMomentumHook({
    narrate:      narrateResolution,
    applyEffects: applyUpgradedOutcomeEffects,
  });
  registerImproveResultHook({
    narrate:      narrateResolution,
    applyEffects: applyUpgradedOutcomeEffects,
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
 * The card is whispered to every GM on ready when no truths are established.
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
  // Relayed to the canonical GM, which claims the card once (`battleClaimed`)
  // and posts the forced Battle — the card's own track by id and name — as
  // the clicker's PC (cardActions.applyCombatTrackBattle). It was posted
  // from the clicker's client and disabled only there: a re-render, or
  // another client, rolled Battle again on a finished fight (issue #325 W11).
  const battleBtn = root?.querySelector?.('[data-action="sf-battle"]');
  if (battleBtn) {
    if (liveCardFlags(message)?.battleClaimed) {
      battleBtn.disabled = true;
      return;
    }
    const freshBattle = battleBtn.cloneNode(true);
    battleBtn.replaceWith(freshBattle);
    freshBattle.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      freshBattle.disabled = true;
      await relayCardAction({
        kind:       "combatTrack.battle",
        payload:    { messageId: message?.id ?? null, actorId: clickerActorId() },
        isResolved: () => !!liveCardFlags(message)?.battleClaimed,
        restore:    () => { freshBattle.disabled = false; },
      });
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
      // pipeline then resolves the sole open fight, or asks which fight.
      const trackId    = message.flags[MODULE_ID].combatTrackId ?? null;
      const trackLabel = message.flags[MODULE_ID].combatTrackLabel ?? null;
      await ChatMessage.create({
        content: trackLabel
          ? `Take decisive action to seize the objective — ${trackLabel}.`
          : "Take decisive action to seize the objective.",
        ...cardRollerSpeaker(message),
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
 * Wire a "which fight?" card's buttons (postWhichFightCard). A pick posts the
 * move again — the forced-move bridge every roll button uses — with that
 * fight's id and name, spoken as the original roller so the move stays
 * theirs whoever clicks. One pick per card: every button disables on click,
 * and the pick is stamped on the card where this client may update it (the
 * GM, its author) so re-renders and other clients show it; a player's click
 * disables locally, as the pacing card's Roll does.
 *
 * Exported so tests and Quench can drive it with a synthetic message + root.
 */
export function wireWhichFightButtons(message, root) {
  const f = message?.flags?.[MODULE_ID];
  if (!f?.whichFightCard) return;
  const buttons = [...(root?.querySelectorAll?.('[data-action="sf-which-fight"]') ?? [])];
  if (!buttons.length) return;

  const picked = liveCardFlags(message)?.whichFightPicked ?? null;
  if (picked) {
    for (const b of buttons) b.disabled = true;
    return;
  }

  const fresh = buttons.map(btn => {
    const clone = btn.cloneNode(true);
    btn.replaceWith(clone);
    return clone;
  });
  for (const btn of fresh) {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const fight = (f.fights ?? []).find(t => t.id === btn.dataset.trackId);
      if (!fight) return;
      for (const b of fresh) b.disabled = true;
      try {
        try {
          await message.update({ [`flags.${MODULE_ID}.whichFightPicked`]: fight.id });
        } catch (err) {
          // A player may not update the GM's card: the local disable stands.
          console.debug?.(`${MODULE_ID} | which-fight stamp skipped (non-owner):`, err?.message ?? err);
        }
        await ChatMessage.create({
          content: f.narration || `Take decisive action to seize the objective — ${fight.label ?? "the fight"}.`,
          ...(f.actorId ? { speaker: { actor: f.actorId } } : {}),
          flags:   { [MODULE_ID]: {
            bypassPacing: true, forcedMoveId: f.moveId ?? "take_decisive_action",
            forcedMoveTargetId: fight.id,
            ...(fight.label ? { forcedMoveTarget: fight.label } : {}),
          } },
        });
      } catch (err) {
        console.error(`${MODULE_ID} | which-fight pick failed:`, err);
        for (const b of fresh) b.disabled = false;
      }
    });
  }
}
onChatMessageRender((message, root) => wireWhichFightButtons(message, root));

/**
 * Wire a "which vow?" card's buttons (postWhichVowCard, issue #321 U02). A
 * pick relays to the canonical GM ("fulfilVow.pick" →
 * cardActions.applyFulfilVowPick), which claims the GM-authored card
 * (`resolved`) and posts the move once, as the roller; a re-render or another
 * client finds the claim. A click that is not delivered re-arms the buttons.
 *
 * Exported so tests and Quench can drive it with a synthetic message + root.
 */
export function wireWhichVowButtons(message, root) {
  const f = message?.flags?.[MODULE_ID];
  if (!f?.whichVowCard) return;
  const buttons = [...(root?.querySelectorAll?.('[data-action="sf-which-vow"]') ?? [])];
  if (!buttons.length) return;
  if (liveCardFlags(message)?.resolved) {
    for (const b of buttons) b.disabled = true;
    return;
  }
  const fresh = buttons.map(btn => {
    const clone = btn.cloneNode(true);
    btn.replaceWith(clone);
    return clone;
  });
  for (const btn of fresh) {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      for (const b of fresh) b.disabled = true;
      await relayCardAction({
        kind:       "fulfilVow.pick",
        payload:    { messageId: message?.id ?? null, itemId: btn.dataset.itemId || null },
        isResolved: () => !!liveCardFlags(message)?.resolved,
        restore:    () => { for (const b of fresh) b.disabled = false; },
      });
    });
  }
}
onChatMessageRender((message, root) => wireWhichVowButtons(message, root));

/**
 * Wire a "which legacy track?" card's buttons (postWhichLegacyCard, issue
 * #331 X63). Each track's pick relays to the canonical GM ("legacy.pick" →
 * cardActions.applyLegacyTrackPick), which claims that track on the card
 * (`legacyRolled.<track>`) and posts the move once for it, as the roller; a
 * re-render or another client finds the claim. The other tracks stay
 * pickable — Continue a Legacy rolls each. A click that is not delivered
 * re-arms its button.
 */
function wireWhichLegacyButtons(message, root) {
  if (!message?.flags?.[MODULE_ID]?.whichLegacyCard) return;
  const rolled = liveCardFlags(message)?.legacyRolled ?? {};
  for (const btn of [...(root?.querySelectorAll?.('[data-action="sf-which-legacy"]') ?? [])]) {
    const track = btn.dataset.track;
    if (rolled[track]) {
      btn.disabled = true;
      continue;
    }
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      fresh.disabled = true;
      await relayCardAction({
        kind:       "legacy.pick",
        payload:    { messageId: message?.id ?? null, track },
        isResolved: () => !!liveCardFlags(message)?.legacyRolled?.[track],
        restore:    () => { fresh.disabled = false; },
      });
    });
  }
}
onChatMessageRender((message, root) => wireWhichLegacyButtons(message, root));

/**
 * Wire the "⚑ Mark Progress on Vow" suggestion button on a move-result card.
 * A click relays to the canonical GM ("milestone.suggestion" →
 * cardActions.applyMilestoneSuggestion), which claims the GM-authored card
 * (`milestoneMarked`) and posts the forced reach_a_milestone once, as the
 * card's roller — the pipeline then marks the roller's vow (sole open vow →
 * auto-mark; several → picker). The flag was read and never written, so a
 * second client, or a re-render, marked the vow again (issue #321 U20). A
 * click that is not delivered re-arms the button.
 *
 * Exported so Quench can drive it with a synthetic message + root.
 */
export function wireMilestoneSuggestionButton(message, root) {
  const f = message?.flags?.[MODULE_ID];
  if (!f?.milestoneSuggestion?.eligible) return;
  const btn = root?.querySelector?.('[data-action="sf-reach-milestone"]');
  if (!btn) return;

  if (liveCardFlags(message)?.milestoneMarked) {
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
    await relayCardAction({
      kind:       "milestone.suggestion",
      payload:    { messageId: message?.id ?? null, actorId: clickerActorId() },
      isResolved: () => !!liveCardFlags(message)?.milestoneMarked,
      restore:    () => { fresh.disabled = false; },
    });
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
 * A click relays to the canonical GM ("fulfilVow.attempt" →
 * cardActions.applyAttemptFulfilVow), which claims the GM-authored card
 * (`fulfilAttempted`) and posts the forced fulfill_your_vow once, as the
 * card's roller, naming the roller's sole open vow (when the card was posted)
 * by its Item id; with several, the pipeline asks which. The pipeline handles
 * the progress roll, narration, track closure and the quests legacy reward.
 *
 * Exported so Quench can drive it with a synthetic message + root.
 */
export function wireAttemptFulfillVowButton(message, root) {
  if (!message?.flags?.[MODULE_ID]?.milestoneSuggestion?.eligible) return;
  wireFulfilAttempt(message, root, "sf-attempt-fulfill-vow");
}
onChatMessageRender((message, root) => wireAttemptFulfillVowButton(message, root));

// A card's "🏁 Attempt to Fulfill" (the move card's and the won-fight card's):
// one press per card. The click disabled only the clicker's DOM button, so the
// player and the GM — or one client after a re-render — each rolled the vow
// again (known-issues FULFIL-BUTTON-LOCAL-DISABLE). It relays; a card already
// pressed renders it disabled, and a click that is not delivered re-arms it.
function wireFulfilAttempt(message, root, dataAction) {
  const btn = root?.querySelector?.(`[data-action="${dataAction}"]`);
  if (!btn || btn.disabled) return;
  if (liveCardFlags(message)?.fulfilAttempted) {
    btn.disabled = true;
    return;
  }
  const fresh = btn.cloneNode(true);
  btn.replaceWith(fresh);
  fresh.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    fresh.disabled = true;
    await relayCardAction({
      kind:       "fulfilVow.attempt",
      payload:    { messageId: message?.id ?? null, actorId: clickerActorId() },
      isResolved: () => !!liveCardFlags(message)?.fulfilAttempted,
      restore:    () => { fresh.disabled = false; },
    });
  });
}

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
        ...cardRollerSpeaker(message),
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
  const pairs = [["sf-develop-relationship", "develop"], ["sf-forge-bond", "forge"]];
  const allButtons = () => pairs.map(([a]) => root?.querySelector?.(`[data-action="${a}"]`)).filter(Boolean);
  // One picker per card, claimed on the canonical GM
  // (`connectionSuggestionTaken`, cardActions.applyConnectionSuggestion): each
  // press posted a fresh picker from the clicker's client, so two presses
  // developed the relationship twice (issue #325 W11).
  if (liveCardFlags(message)?.connectionSuggestionTaken) {
    allButtons().forEach(b => { b.disabled = true; });
    return;
  }
  for (const [dataAction, pickAction] of pairs) {
    const btn = root?.querySelector?.(`[data-action="${dataAction}"]`);
    if (!btn) continue;
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      allButtons().forEach(b => { b.disabled = true; });
      await relayCardAction({
        kind:       "connection.suggest",
        payload:    { messageId: message?.id ?? null, pickAction },
        isResolved: () => !!liveCardFlags(message)?.connectionSuggestionTaken,
        restore:    () => allButtons().forEach(b => { b.disabled = false; }),
      });
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
// typed message (selected token → bound character → owned PC → the first PC
// only for a GM or in solo play). A player who owns none of those (an
// observer) sends null rather than another player's PC, which the GM-side
// handler would refuse as not theirs.
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
  if (game.user?.isGM) return actorId;
  const actor = actorId ? (game.actors?.get?.(actorId) ?? null) : null;
  if (actor && userOwnsActor(actor, game.user)) return actorId;
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
      // As the narrating PC the card recorded: the pipeline credits the
      // message's speaker, and with none it resolved the clicker — the GM
      // pressing Roll on Pat's card rolled Kira's action with the GM's first
      // PC's stats (issue #325 W09).
      const narrator = typeof f.actorId === "string" && f.actorId ? game.actors?.get(f.actorId) : null;
      await ChatMessage.create({
        content: f.playerText,
        ...(narrator ? { speaker: { actor: narrator.id, alias: narrator.name } } : {}),
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
 * worldTruthsSet remains controlled by createJournalEntryPage, which records
 * a page that holds at least one truth (holdsTruths).
 */
Hooks.on("createJournalEntry", async (entry) => {
  if (!isCanonicalGM()) return;   // single emitter for the campaignState write
  if (entry.flags?.[MODULE_ID]) return;

  const systemTitle = game.i18n?.localize?.("IRONSWORN.JOURNALENTRYPAGES.TypeTruth") ?? "";
  if (!systemTitle || entry.name !== systemTitle) return;

  // A copy: a refused write must not leave this client's cached setting
  // claiming the journal is linked (rules/foundry-api.md).
  const campaignState = { ...game.settings.get(MODULE_ID, "campaignState") };
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
 * Content has one <h2> per truth category saved — one is enough (holdsTruths).
 *
 * Every save counts, not only the first: each Save in the dialog creates a NEW
 * journal, and the newest is the campaign's truths. `worldTruthsJournalId` used
 * to stay on the first journal once `worldTruthsSet` was true, so `!lore`
 * summarised — and wrote "The Story So Far" into — the superseded truths
 * (issue #321 U65). And each save's truths are the narrator's too:
 * recordSystemTruths parses the page into `campaignState.worldTruths`, which
 * only the Playtest Quickstart used to write — truths chosen in the dialog
 * reached `!lore` alone (issue #322 V34).
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

  // The page must hold at least one truth — one category saved is a save
  // (an `<h2>` with a truth under it); it wanted two `<h2>`, so a one-truth
  // save never reached the narrator (issue #325 W35).
  const content = page.text?.content ?? "";
  if (!holdsTruths(content)) return;

  const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
  if (campaignState.worldTruthsSet && campaignState.worldTruthsJournalId === entry.id) return; // Already recorded

  // The saved truths become the campaign's — parsed into worldTruths, which
  // the narrator reads, as well as linked for !lore (issue #322 V34). Owned
  // fields onto the latest store; a refused write leaves the cached setting
  // as it was, and claims nothing.
  try {
    await recordSystemTruths(entry.id, content);
  } catch (err) {
    console.error(`${MODULE_ID} | createJournalEntryPage: failed to persist truths state:`, err);
    return;
  }

  // Dismiss the setup notification card if it is still in chat
  const setupCard = game.messages?.contents?.find(
    m => m.flags?.[MODULE_ID]?.setupCard
  );
  if (setupCard) await setupCard.delete().catch(() => {});

  ui?.notifications?.info("Starforged Companion: World Truths recorded.");
});

/**
 * updateJournalEntryPage — an edit of the campaign's saved "Setting Truths"
 * page is parsed into `campaignState.worldTruths`, as its save was (issue #337
 * Y39). The dialog has no edit mode — each Save makes a new journal — so a
 * wording is tweaked on the page; only the page's creation was read, so the
 * narrator's WORLD TRUTHS block and the vow scene's Iron truth kept the
 * pre-edit text until the next world load while `!lore` read the page live
 * (rules/reachability.md §5). The linked journal only: a superseded save is
 * not the campaign's truths (the newest save wins). The module's own World
 * Truths journal (the Playtest Quickstart's) is skipped by its flags: its
 * page's flag holds the truths and the page text is a printout of them that
 * this parser cannot read back (its sub-table line is an italic paragraph
 * before the quest starter) — the World Truths dialog revises them.
 */
Hooks.on("updateJournalEntryPage", async (page, changed) => {
  if (!isCanonicalGM()) return;   // single emitter for the campaignState write
  if (!foundry.utils.hasProperty(changed ?? {}, "text.content")) return;   // a text edit, not a rename

  const entry = page?.parent;
  if (!entry) return;
  if (page.type !== "text") return;
  if (page.flags?.[MODULE_ID]) return;
  if (entry.flags?.[MODULE_ID]) return;

  const systemTitle = game.i18n?.localize?.("IRONSWORN.JOURNALENTRYPAGES.TypeTruth") ?? "";
  if (!systemTitle || entry.name !== systemTitle) return;
  if (game.settings.get(MODULE_ID, "campaignState")?.worldTruthsJournalId !== entry.id) return;

  // A page edited down to no truth (or "The Story So Far" `!lore` adds beside
  // it) keeps the stored truths, as the dialog's empty save does.
  const content = page.text?.content ?? "";
  if (!holdsTruths(content)) return;

  try {
    await recordSystemTruths(entry.id, content);
  } catch (err) {
    console.error(`${MODULE_ID} | updateJournalEntryPage: failed to persist the edited truths:`, err);
  }
});
