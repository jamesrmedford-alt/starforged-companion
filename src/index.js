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
import { assembleContextPacket } from "./context/assembler.js";
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
import { rollActionDie, rollChallengeDice, calcActionScore, calcOutcome } from "./moves/resolver.js";
import { rollYesNo }             from "./oracles/roller.js";
import { ORACLE_ODDS }           from "./schemas.js";
import {
  openSetFlagDialog,
  openChangeYourFateDialog,
  openTakeABreakDialog,
} from "./safety/sessionDialogs.js";
import {
  openBeginSessionDialog,
  openEndSessionDialog,
} from "./safety/sessionLifecycleDialogs.js";
import { isClockCommand, handleClockCommand, openClocksPanel } from "./clocks/clocks.js";
import { isRepairCommand, handleRepairCommand } from "./moves/repair.js";
import {
  isShipEnvisionCommand,
  handleShipEnvisionCommand,
  isShipHistoryCommand,
  handleShipHistoryCommand,
} from "./entities/shipEnvision.js";
import { openCustomOraclesPanel } from "./oracles/customOracles.js";
import {
  isOracleAddCommand,
  handleOracleAddCommand,
  rehydrateCustomOracles,
} from "./oracles/customOracles.js";
import { initSpeechInput }       from "./input/speechInput.js";
import {
  narrateResolution,
  interrogateScene,
  postSessionRecap,
  postCampaignRecap,
  narrateAndPostVowSwearing,
} from "./narration/narrator.js";
import { parseIronswornProgressRoll, classifyProgressRoll, ironswornRollKind, planNativeRollNarration } from "./narration/nativeProgressRoll.js";
import { invalidateActorCache, recalculateMomentumBounds, getPlayerActors, readVows, markVowProgress, completeVowItem, applyMeterChanges, awardXP, recordGrantedReward, setSharedVowReward } from "./character/actorBridge.js";
import { openChroniclePanel } from "./character/chroniclePanel.js";
import { openSessionPanel, SessionPanelApp } from "./ui/sessionPanel.js";
import { openPrivateChannel, registerPrivateChannelSettings, isPrivateChannelEnabled } from "./private-channel/index.js";
import { ensureHelpJournal } from "./help/helpJournal.js";
import { openSectorCreator } from "./sectors/sectorPanel.js";
import { openSystemTruthsDialog, generateLoreRecap } from "./truths/generator.js";

import {
  openProgressTracks,
  registerProgressTrackHooks,
  getActiveCombatPosition,
  getActiveCombatTrack,
  listProgressTracks,
  markProgressById,
  addProgressTrack,
  completeProgressTrack,
} from "./ui/progressTracks.js";
import { applyExpeditionProgress, finishExpedition, legacyRewardTicks } from "./moves/expedition.js";
import { finishVow, shouldPayFulfilledVow } from "./moves/vow.js";
import { isBattleStationsCommand, renderBattleStationsCardHtml } from "./moves/battleStations.js";
import {
  isShipMapCommand,
  generateShipMapForActor,
  findShipMapScene,
  registerShipMapSceneHooks,
} from "./moves/shipMapScene.js";
import { applyCombatProgress, finishCombat as finishCombatTrack, selectCombatTrack } from "./moves/combat.js";
import { buildCombatThresholdHtml, WAY_OUT_PROMPT } from "./moves/combatThreshold.js";
import {
  enterCombatTracker,
  endCombatTracker,
  applyCombatPositionToTrack,
  registerCombatTrackerHooks,
  registerCombatTrackerSettings,
} from "./moves/combatTracker.js";
import { selectConnection, planDevelopRelationship, buildConnectionSuggestion, shouldForgeBond } from "./moves/developRelationship.js";
import { planReachMilestone, buildMilestoneSuggestion, marksForSourceRank } from "./moves/milestone.js";
import {
  extractRiders,
  collectFiringRiders,
  partitionRiders,
  applyMeterRiders,
} from "./moves/consequenceRiders.js";
import { promptRiders } from "./moves/riderDialog.js";

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
import { showMoveRoll, showActionRoll, showD100 } from "./dice/diceAnimation.js";

import {
  openWorldJournalPanel,
} from "./world/worldJournalPanel.js";
import {
  openCompanionToolbar,
  registerCompanionToolbarSettings,
} from "./ui/companionToolbar.js";

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
import { registerSharedSupplyHook } from "./multiplayer/sharedSupply.js";
import { getEntityDocument, readEntityFlag } from "./entities/registry.js";
import { resolveSpeakerActorId }      from "./multiplayer/speaker.js";

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
    type: String, default: "fNmw8sukfGuvWVOp33Ge",
  });
  game.settings.register(MODULE_ID, "audio.npcVoiceId", {
    name: "NPC voice ID", scope: "world", config: false,
    type: String, default: "pNInz6obpgDQGcFmaJgB",
  });
  // Pronoun-keyed NPC voices (v1.7.11 finding F). When set, an NPC card's
  // focal connection picks the voice matching its established pronouns;
  // empty falls back to audio.npcVoiceId so existing worlds are unchanged.
  // Feminine defaults to Rachel (21m00…) so she/her NPCs sound distinct from
  // the narrator out of the box.
  game.settings.register(MODULE_ID, "audio.npcVoiceFeminine", {
    name: "NPC voice — feminine (she/her)", scope: "world", config: false,
    type: String, default: "21m00Tcm4TlvDq8ikWAM",
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
      // See issue #227 (Fact Continuity) §9.1.
      if (factContinuityEnabledFromSettings()) {
        await startScene(campaignState, { reason: "@scene_intercept" });
      }
      // Full speaker resolution (token selection → bound character →
      // ownership → fallback) — the bound-character-only read this
      // replaces attributed every @scene to the default PC in multiplayer.
      await interrogateScene(question, campaignState, {
        speakerActorId: resolveSpeakerActorId(message, campaignState),
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

    // !migrate-entities command — GM-only one-time storage migration
    if (isMigrateEntitiesCommand(message)) {
      await handleMigrateEntitiesCommand(message);
      return;
    }

    // !oracle yes/no command — any player; no state mutation
    if (isOracleCommand(message)) {
      await handleOracleCommand(message);
      return;
    }

    // !pay-the-price (alias !ptp) — roll the d100 Pay the Price table
    // and post the result as a chat card. Any player; no state mutation.
    if (isPayThePriceCommand(message)) {
      await handlePayThePriceCommand(message);
      return;
    }

    // !bond <rank> command — bonded Develop Your Relationship (play kit p. 3)
    if (isBondCommand(message)) {
      await handleBondCommand(message);
      return;
    }

    // Session safety / lifecycle commands — open DialogV2 surfaces.
    if (isFlagCommand(message))         { openSetFlagDialog();         return; }
    if (isFateCommand(message))         { openChangeYourFateDialog();  return; }
    if (isBreakCommand(message))        { openTakeABreakDialog();      return; }
    if (isBeginSessionCommand(message)) { openBeginSessionDialog();    return; }
    if (isEndSessionCommand(message))   { openEndSessionDialog();      return; }
    if (isIncitingIncidentCommand(message)) { await handleIncitingIncidentCommand(message); return; }
    if (isRevealSiteCommand(message))   { await handleRevealSiteCommand(message); return; }

    // !clock command — create / advance / list campaign and tension clocks
    if (isClockCommand(message)) {
      await handleClockCommand(message);
      return;
    }

    // !repair — vehicle repair point-spend dialog (play kit p. 7)
    if (isRepairCommand(message)) {
      await handleRepairCommand(message);
      return;
    }

    // !stations — post the Battle Stations! shipboard-combat play aid (the 11
    // crew roles). Any player may invoke; it's a static reference card.
    if (isBattleStationsCommand(message)) {
      await ChatMessage.create({
        content: renderBattleStationsCardHtml(),
        flags:   { [MODULE_ID]: { battleStationsCard: true } },
      }).catch(err => console.warn(`${MODULE_ID} | !stations card failed:`, err?.message ?? err));
      return;
    }

    // !shipmap — build (or rebuild) the command vehicle's deck-plan Scene with
    // the shipboard-combat stations pinned. GM-only (Scene creation is a world
    // write).
    if (isShipMapCommand(message)) {
      await handleShipMapCommand(message);
      return;
    }

    // !ship envision / !ship history — roll supplementary ship oracles,
    // generate narrator prose, post a card, append a dated section to
    // system.notes (GM-only on the write). Any player may invoke.
    if (isShipEnvisionCommand(message)) {
      await handleShipEnvisionCommand(message);
      return;
    }
    if (isShipHistoryCommand(message)) {
      await handleShipHistoryCommand(message);
      return;
    }

    // !oracle-add command — GM-only; opens a dialog to define a custom table
    if (isOracleAddCommand(message)) {
      await handleOracleAddCommand(message);
      return;
    }

    // !roll command — force the next undecorated input through the move pipeline
    if (isRollCommand(message)) {
      await handleRollCommand(message);
      return;
    }

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
    await game.settings.set(MODULE_ID, "campaignState", campaignState);

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
        ? buildForcedInterpretation(forcedMoveId, narration, dial, forcedMoveTarget)
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

      // Scan the character's assets + the command vehicle's modules for
      // abilities that apply to the chosen move. Surfaced on the
      // confirmation dialog as opt-in checkboxes — accepted abilities
      // add their +N to interpretation.adds before the dice are rolled.
      const characterActorForScan   = getPlayerActors()[0] ?? null;
      const commandShipForScan      = getCommandVehicleActor(campaignState);
      const applicableAbilities = await scanForApplicableAbilities({
        moveId:           interpretation.moveId,
        moveName:         interpretation.moveName,
        narration,
        characterActor:   characterActorForScan,
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
      const speakerActor = speakerActorId ? game.actors?.get(speakerActorId) : null;
      enrichInterpretationStatValue(speakerActor, interpretation, campaignState);

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
      const resolution = resolveMove(interpretation, campaignState, { combatPosition: resolvedPosition });

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
          const companionActor = speakerActor ?? getPlayerActors()[0] ?? null;
          if (companionActor) {
            await applyMeterChanges(companionActor, { companionHealth: resolution.consequences.companionHealthChange });
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
          const target = selectConnection(connections, interpretation.moveTarget ?? null);
          const plan   = planDevelopRelationship(target, resolution.outcome, resolution.isMatch);

          if (plan.action === "bond-legacy") {
            if (plan.ticks > 0) addLegacyTicks(campaignState, "bonds", plan.ticks);
            if (plan.raiseRank && plan.newRank && plan.connection.__hostId) {
              await conn.updateConnection(plan.connection.__hostId, { rank: plan.newRank }).catch(err =>
                console.warn(`${MODULE_ID} | develop: rank raise failed:`, err?.message ?? err));
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
        await applyReachMilestone(getPlayerActors()[0] ?? null, interpretation.moveTarget ?? null)
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
          const target = selectConnection(connections, interpretation.moveTarget ?? null);
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
            { moveTarget: interpretation.moveTarget, ranksDown: resolution.consequences.finishExpedition.ranksDown ?? 0 },
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
          const itemDone = await completeVowItemByName(vowName);

          if (fin?.track) {
            if (fin.legacyTicks > 0) addLegacyTicks(campaignState, "quests", fin.legacyTicks);
            await postFulfillVowCard(fin).catch(err =>
              console.warn(`${MODULE_ID} | fulfill vow card failed:`, err?.message ?? err));
            // Journal path already paid the quests legacy — deliver only the
            // connection deepen + promised reward. Sets fulfilPaid, so a later
            // native-sheet roll of the same vow can't double-pay.
            if (itemDone) await payFulfilledVowNative(vowName, resolution.outcome, { skipLegacy: true });
          } else if (itemDone) {
            // Item-only vow (no journal twin): legacy on the pipeline's
            // campaignState, deepen + reward via the shared payoff, then a
            // fulfil card synthesized from the item.
            const ticks = legacyRewardTicks(itemDone.rank, ranksDown);
            if (ticks > 0) addLegacyTicks(campaignState, "quests", ticks);
            await payFulfilledVowNative(vowName, resolution.outcome, { skipLegacy: true });
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
          const { primary, copies } = resolveVowItemCopies(interpretation.moveTarget ?? null);
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
            await postCombatProgressCard(result).catch(err =>
              console.warn(`${MODULE_ID} | combat progress card failed:`, err?.message ?? err));
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | combat progress failed:`, err?.message ?? err);
        }
      }

      if (resolution.consequences?.combatPosition && game.user.isGM) {
        try {
          const pipelinePos = resolution.consequences.combatPosition;
          const track = await getActiveCombatTrack();
          if (track) {
            await applyCombatPositionToTrack(track.id, pipelinePos, speakerActor);
          } else if (thresholdPosted) {
            // Enter the Fray: the track doesn't exist yet — the position rides
            // the threshold card's flags and lands at track creation.
            console.debug(`${MODULE_ID} | combat position "${pipelinePos}" rides the threshold card — track not created yet.`);
          } else {
            console.warn(`${MODULE_ID} | combat position "${pipelinePos}" had no single active combat track to write to.`);
          }
        } catch (err) {
          console.warn(`${MODULE_ID} | combat position failed:`, err?.message ?? err);
        }
      }

      if (resolution.consequences?.endCombat && game.user.isGM) {
        try {
          const result = await finishCombatTrack(
            { moveTarget: interpretation.moveTarget },
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
              await postFightVowMilestoneCard(result.track.linkedVowName, marks).catch(err =>
                console.warn(`${MODULE_ID} | fight-vow milestone card failed:`, err?.message ?? err));
              // Deliver the vow's promised concrete reward (#241 Phase 2), scaled
              // by the win; one-time (status flips so a re-win can't re-grant).
              await grantLinkedVowReward(result.track.linkedVowName, resolution.outcome).catch(err =>
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
        await postDecisiveActionCostCard().catch(err =>
          console.warn(`${MODULE_ID} | decisive action cost card failed:`, err?.message ?? err));
      }

      // Face Defeat — roll pay_the_price d100, post a visible card, and dispatch
      // any routable suffer entry (same behaviour as typing !pay-the-price).
      // Capture the PtP reversals (clocks advanced + suffer meter applied) so the
      // burn button can undo them when the player burns momentum to upgrade the outcome.
      let ptpReversals = null;
      if (resolution.consequences?.routePayThePrice && game.user.isGM) {
        ptpReversals = await postFaceDefeatPayThePriceCard().catch(err => {
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

      // Step 9: post move result card. Determine burn eligibility against the
      // active character so the card can carry a 🔥 Burn Momentum button when
      // the dice would actually improve under burn.
      const burnActor   = speakerActor ?? getPlayerActors()[0] ?? null;
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
      );

      // Step 10: narrate the consequence directly via Claude — no GM dependency
      await narrateResolution(resolution, packet, campaignState, { relevance, speakerActorId });

      // Only the GM can write world-scoped settings (campaignState).
      // Players trigger the pipeline but defer persistence to the GM's client.
      if (game.user.isGM) {
        await persistResolution(resolution, campaignState, speakerActorId);
        // Mark the move card so the Burn handler knows the original
        // consequences have been written to the actor. Without this flag,
        // a burn click after persistence would double-reverse the meter
        // change (or, when persistence hasn't fired yet, the click would
        // assume it had and over-apply).
        if (burnState && moveResultMessage) {
          await moveResultMessage.update({
            [`flags.${MODULE_ID}.burn.originalApplied`]: true,
          }).catch(err => console.warn(`${MODULE_ID} | burn metadata update failed:`, err));
        }
        // Same flag for the improve affordance (finding G): once the original
        // outcome's consequences are on the sheet, the click handler must diff
        // against them rather than re-applying from zero.
        if (improveState && moveResultMessage) {
          await moveResultMessage.update({
            [`flags.${MODULE_ID}.improve.originalApplied`]: true,
          }).catch(err => console.warn(`${MODULE_ID} | improve metadata update failed:`, err));
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
  latestState.pendingMove = false;
  await game.settings.set(MODULE_ID, "campaignState", latestState).catch(err =>
    console.error(`${MODULE_ID} | Failed to release pendingMove lock:`, err),
  );
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
      const authorId = message?.author?.id ?? message?.author ?? message?.user?.id ?? message?.user ?? null;
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
        return narrateResolution(resolution, {}, campaignState);
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
 *  - GM only (writes go through actor.update which world-scopes through
 *    Foundry's permission model)
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
      if (!game.user?.isGM) return;
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
      if (!game.user?.isGM) return;
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
 * GM-gated (world-scoped writes). The sync helper writes only on a status
 * change, so the ready-scan is idempotent. A single tracked starship is still
 * resolved as the command vehicle via the lone-ship fallback even if nothing
 * here ever flags it.
 */
function registerCommandVehicleHook() {
  const onAssetChange = (item) => {
    try {
      if (!game.user?.isGM) return;
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
      if (!game.user?.isGM) return;
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
 * Determine whether a chat message is an !oracle yes/no command.
 *   !oracle yes [odds] [question text]
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
 *   !bond <rank>
 * Anyone may invoke; the GM-gate only fires when the outcome demands state
 * changes (legacy track / +momentum), which the handler routes through
 * the existing campaign-state writer.
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
 * the card. Runs only on the authoring client — it creates a shared chat
 * document, so unlike a local dialog it must fire exactly once.
 */
async function handleIncitingIncidentCommand(message) {
  if (message?.author?.id && message.author.id !== game.user?.id) return;
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
 * Reveal the named (or sole undiscovered) site and announce it. GM-gated —
 * world-setting writes require GM. Runs only on the authoring client since it
 * creates a shared chat document.
 */
async function handleRevealSiteCommand(message) {
  if (message?.author?.id && message.author.id !== game.user?.id) return;
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
/**
 * Build a minimal interpretation when the move ID is supplied by the caller
 * (the NWMA suggestion button). Skips the Claude API entirely. Stat defaults
 * to the move's first listed stat; the confirmation dialog still lets the
 * player override.
 */
function buildForcedInterpretation(moveId, narration, mischiefLevel, moveTarget = null) {
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
 * Handle an !oracle yes/no chat command. Any player may invoke.
 *
 *   !oracle yes [odds] [question?]
 *
 * Posts a card with the d100 result, the threshold for the chosen odds,
 * the yes/no answer, and (on a match) a "MATCH" badge prompting the
 * GM/player to envision an extreme result or twist.
 */
async function handleOracleCommand(message) {
  const text  = message.content?.trim() ?? "";
  const parts = text.slice("!oracle".length).trim().split(/\s+/);

  // Only "yes" / "yes-no" form is implemented; reject anything else with help.
  if (!parts[0] || !/^yes(-no)?$/i.test(parts[0])) {
    await ChatMessage.create({
      content: `<div class="sf-oracle-card"><strong>Oracle</strong> <p>Usage: <code>!oracle yes [odds] [question?]</code><br>Odds: <code>small</code> · <code>unlikely</code> · <code>50/50</code> · <code>likely</code> · <code>certain</code> (default <code>50/50</code>)</p></div>`,
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
    flags:   { [MODULE_ID]: { oracleCommandCard: true } },
  });

  // Fire-and-forget narration follow-up (silent skip if Claude key is unset).
  // Reuses the same `oracle_followup` mode as Pay the Price below so safety,
  // tone, scene anchor, and length come from the configured narrator settings.
  scheduleOracleNarration({
    kind:       "oracle_yes_no",
    oracleName: `Ask the Oracle (${oddsLabel})`,
    question,
    rolledLine: `d100 = ${result.roll} ${result.answer === "yes" ? "≤" : ">"} ${result.threshold} → ${result.answer.toUpperCase()}${result.isMatch ? " (MATCH — extreme/twist)" : ""}`,
  });
}

/**
 * Handle a !pay-the-price (or !ptp) chat command. Rolls the d100 Pay the
 * Price table and posts the result. Any player may invoke; no state mutation.
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
    flags:   { [MODULE_ID]: { payThePriceCard: true, sufferRoute: result.sufferRoute ?? null } },
  });

  if (result.sufferRoute) {
    await dispatchPayThePriceSufferRoute(result.sufferRoute).catch(err =>
      console.warn(`${MODULE_ID} | !pay-the-price: suffer dispatch failed:`, err?.message ?? err),
    );
  }

  await advanceClocksOnPayThePrice().catch(err =>
    console.warn(`${MODULE_ID} | !pay-the-price: clock advance failed:`, err?.message ?? err));

  // Fire-and-forget narration follow-up — see scheduleOracleNarration below.
  scheduleOracleNarration({
    kind:       "pay_the_price",
    oracleName: "Pay the Price",
    question,
    rolledLine: `d100 = ${result.roll} → ${result.result}`,
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
      // trackLabel: the Finish button forwards it as forcedMoveTarget so the
      // finish roll resolves THIS expedition even with several open
      // (EXPEDITION-FINISH-TARGET fix).
      flags:   { [MODULE_ID]: { expeditionProgressCard: true, created: created === true, trackLabel: track?.label ?? null } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postExpeditionProgressCard: chat post failed:`, err?.message ?? err);
  }
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
            content: `<div class="sf-card sf-way-out"><div class="sf-card-body"><p>🚪 <em>${escapeChatHtml(WAY_OUT_PROMPT)}</em></p></div></div>`,
            flags:   { [MODULE_ID]: { wayOutCard: true } },
          });
        } catch (err) {
          console.warn(`${MODULE_ID} | way-out card failed:`, err?.message ?? err);
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

async function postFightVowMilestoneCard(vowName, marks) {
  // Look up the linked vow on the roster for its rank + connection link.
  let connectionName = null, vowRank = null;
  for (const actor of getPlayerActors()) {
    const item = (actor.items ?? []).find(i =>
      i.type === "progress" && i.system?.subtype === "vow"
      && (i.name ?? "").toLowerCase() === String(vowName ?? "").toLowerCase()
      && !i.system?.completed);
    if (item) {
      vowRank        = item.system?.rank ?? null;
      connectionName = item.flags?.[MODULE_ID]?.linkedConnectionName ?? null;
      break;
    }
  }
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
      flags: { [MODULE_ID]: { fightVowCard: true, vowName, marks, connectionName, vowRank } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postFightVowMilestoneCard: chat post failed:`, err?.message ?? err);
  }
}

// GM-side: mark the linked vow `marks` times (scaled by the fight's rank).
async function markLinkedVowMilestone(vowName, marks) {
  await applyReachMilestone(getPlayerActors()[0] ?? null, vowName ?? null, marks).catch(err =>
    console.warn(`${MODULE_ID} | mark linked vow failed:`, err?.message ?? err));
}

// GM-side: deepen the connection a vow served, by `marks` rank-based marks on
// its relationship track.
async function deepenLinkedConnection(connectionName, marks) {
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
// @returns {{ primary: {actor, item}|null, copies: Array<{actor, item}> }}
export function resolveVowItemCopies(vowName) {
  const all = [];
  for (const actor of getPlayerActors()) {
    const items = actor.items?.contents ?? (Array.isArray(actor.items) ? actor.items : []);
    for (const item of items) {
      if (item?.type === "progress" && item.system?.subtype === "vow") all.push({ actor, item });
    }
  }
  const open = all.filter(e => e.item.system?.completed !== true);
  const lo   = String(vowName ?? "").trim().toLowerCase();
  let primary = null;
  if (lo) {
    primary = open.find(e => (e.item.name ?? "").toLowerCase() === lo)
      ?? open.find(e => {
        const n = (e.item.name ?? "").toLowerCase();
        return n && (n.includes(lo) || lo.includes(n));
      })
      ?? null;
  }
  if (!primary && open.length === 1) primary = open[0];
  if (!primary) return { primary: null, copies: [] };

  const vowId = primary.item.flags?.[MODULE_ID]?.vowId ?? null;
  const primaryName = (primary.item.name ?? "").toLowerCase();
  const copies = all.filter(e =>
    vowId
      ? e.item.flags?.[MODULE_ID]?.vowId === vowId
      : (e.item.name ?? "").toLowerCase() === primaryName);
  return { primary, copies };
}

// GM-side: deliver the linked vow's promised concrete reward (#241 Phase 2) when
// the fight is won, scaled by the outcome. One-time — the reward's status flips
// from "promised" so a re-win can't re-grant it.
async function grantLinkedVowReward(vowName, outcome) {
  const { copies } = resolveVowItemCopies(vowName);
  let reward = null, vowId = null;
  for (const { item } of copies) {
    const r = item?.flags?.[MODULE_ID]?.reward;
    if (r?.status === "promised") { reward = r; vowId = item.flags[MODULE_ID].vowId; break; }
  }
  if (!reward) return;

  const plan = planRewardGrant(reward, outcome);
  const pc   = getPlayerActors()[0] ?? null;
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

// #248 B2: a fulfilled vow pays its linked connection (deepen, scaled by the
// vow's rank) and grants its promised reward (scaled by outcome). Item vows
// (inciting / hand-made) are fulfilled on the foundry-ironsworn sheet, which
// bypasses the journal-track fulfill branch AND never touches our legacy tracks,
// so this also marks the Quests legacy. GM-side (world writes); idempotent per
// vow via the fulfilPaid flag.
async function payFulfilledVowNative(vowName, outcome, { skipLegacy = false } = {}) {
  // vowId-first resolution with a name ladder — a renamed vow or stale
  // linkedVowName snapshot still resolves (VOW-RENAME-PAYOFF). The completed
  // filter is bypassed here: the vendor sheet may have already marked the
  // rolled copy completed before this payoff runs, so fall back to searching
  // ALL copies when no open one matches.
  let { primary } = resolveVowItemCopies(vowName);
  if (!primary) {
    for (const a of getPlayerActors()) {
      const items = a.items?.contents ?? (Array.isArray(a.items) ? a.items : []);
      const found = items.find(i =>
        i.type === "progress" && i.system?.subtype === "vow"
        && (i.name ?? "").toLowerCase() === String(vowName ?? "").toLowerCase());
      if (found) { primary = { actor: a, item: found }; break; }
    }
  }
  const item = primary?.item ?? null;
  if (!item) {
    console.debug(`${MODULE_ID} | native-fulfil: no vow item named "${vowName ?? "?"}" — no payoff`);
    return;
  }
  if (item.flags?.[MODULE_ID]?.fulfilPaid) return;        // pay once per vow
  await item.setFlag?.(MODULE_ID, "fulfilPaid", true).catch(() => {});

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
        const cs = game.settings.get(MODULE_ID, "campaignState") ?? {};
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

  // Grant the promised reward (one-time; scaled by outcome).
  await grantLinkedVowReward(vowName, outcome).catch(err =>
    console.warn(`${MODULE_ID} | native-fulfil: grant reward failed:`, err?.message ?? err));
}

// GM-side: mark every copy of the resolved vow completed (shared vows exist
// as one copy per PC; copies collect by vowId, so a renamed copy still
// closes — VOW-RENAME-PAYOFF). Pipeline Fulfill Your Vow companion to
// actorBridge.completeVowItem. Returns { name, rank } of the resolved vow,
// or null when nothing matched.
async function completeVowItemByName(vowName) {
  const { primary, copies } = resolveVowItemCopies(vowName);
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
        payFulfilledVowNative(parsed.source, parsed.outcome).catch(err =>
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
// connection pays nothing (the bond can only forge once).
async function payForgedBondNative(connectionName) {
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

    await conn.forgeBond(target.__hostId);
    const ticks = legacyRewardTicks(target.rank, 0);
    if (ticks > 0) {
      addLegacyTicks(campaignState, "bonds", ticks);
      await game.settings.set(MODULE_ID, "campaignState", campaignState);
    }
    await postForgeABondCard(target, ticks).catch(err =>
      console.warn(`${MODULE_ID} | native-forge card failed:`, err?.message ?? err));
  } catch (err) {
    console.warn(`${MODULE_ID} | native-forge payoff failed:`, err?.message ?? err);
  }
}

// Wire the won-fight card's buttons. Mark/deepen are GM-gated world writes, so
// non-canonical clients relay over the socket; Attempt to Fulfill posts the
// existing fulfill_your_vow bridge (the pipeline handles it).
function registerFightVowMilestoneHook() {
  if (registerFightVowMilestoneHook._installed) return;
  registerFightVowMilestoneHook._installed = true;
  onChatMessageRender((message, root) => {
    const f = message?.flags?.[MODULE_ID];
    if (!f?.fightVowCard) return;
    const wire = (action, fn) => {
      const btn = root.querySelector(`[data-action="${action}"]`);
      if (!btn) return;
      const fresh = btn.cloneNode(true);
      btn.replaceWith(fresh);
      fresh.addEventListener("click", async (event) => {
        event.preventDefault(); event.stopPropagation();
        fresh.disabled = true;
        await fn().catch(err =>
          console.warn(`${MODULE_ID} | fight-vow action failed:`, err?.message ?? err));
      });
    };
    wire("sf-mark-milestone", async () => {
      if (isCanonicalGM()) return markLinkedVowMilestone(f.vowName, f.marks);
      game.socket?.emit?.(`module.${MODULE_ID}`, { kind: "vow.markMilestone", vowName: f.vowName, marks: f.marks });
    });
    wire("sf-fulfill-vow", async () => {
      await ChatMessage.create({
        content: "Attempt to fulfill your vow.",
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "fulfill_your_vow", forcedMoveTarget: f.vowName ?? null } },
      });
    });
    wire("sf-deepen-bond", async () => {
      const marks = marksForSourceRank(f.vowRank);
      if (isCanonicalGM()) return deepenLinkedConnection(f.connectionName, marks);
      game.socket?.emit?.(`module.${MODULE_ID}`, { kind: "connection.deepen", connectionName: f.connectionName, marks });
    });
  });
}

// GM-side socket for the won-fight card's relayed actions.
function registerFightVowSocket() {
  if (registerFightVowSocket._installed) return;
  if (!game?.socket?.on) return;
  registerFightVowSocket._installed = true;
  game.socket.on(`module.${MODULE_ID}`, async (payload) => {
    try {
      if (!payload || !isCanonicalGM()) return;
      if (payload.kind === "vow.markMilestone") await markLinkedVowMilestone(payload.vowName, payload.marks);
      else if (payload.kind === "connection.deepen") await deepenLinkedConnection(payload.connectionName, payload.marks);
    } catch (err) {
      console.warn(`${MODULE_ID} | fight-vow socket handler failed:`, err?.message ?? err);
    }
  });
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
      flags:   { [MODULE_ID]: { combatTrackCard: true, created } },
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
  if (!actor || !game.user?.isGM) return;
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

async function postReachMilestoneCard(vow, ticks) {
  const name = escapeChatHtml(vow?.name || "your vow");
  const rank = escapeChatHtml(vow?.rank ?? "");
  try {
    await ChatMessage.create({
      content: `<div class="sf-ptp-card"><strong>⚑ Reach a Milestone</strong>` +
        `<p>Marked progress on <strong>${name}</strong> — +${ticks} tick${ticks === 1 ? "" : "s"}${rank ? ` (${rank} rank)` : ""}.</p></div>`,
      flags:   { [MODULE_ID]: { reachMilestoneCard: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postReachMilestoneCard: chat post failed:`, err?.message ?? err);
  }
}

/**
 * Post a picker when several vows are open and none was named. Each button
 * marks one vow; the handler in wireMilestonePickerButtons applies it.
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
      flags:   { [MODULE_ID]: { milestonePicker: true, resolved: false } },
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
      flags: { [MODULE_ID]: { connectionPicker: true, pickAction: action, resolved: false } },
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

async function postDecisiveActionCostCard() {
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
    await dispatchPayThePriceSufferRoute(result.sufferRoute).catch(err =>
      console.warn(`${MODULE_ID} | decisive action cost suffer dispatch failed:`, err?.message ?? err));
  }
}

async function postFaceDefeatPayThePriceCard() {
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
      flags:   { [MODULE_ID]: { payThePriceCard: true, sufferRoute: result.sufferRoute ?? null } },
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
    await dispatchPayThePriceSufferRoute(result.sufferRoute).catch(err =>
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

  scheduleOracleNarration({
    kind:       "pay_the_price",
    oracleName: "Pay the Price",
    question:   "Face Defeat",
    rolledLine: `d100 = ${result.roll} → ${result.result}`,
  });

  return { clocksAdvanced: clocksAdvanced ?? [], sufferMeterDelta };
}

/**
 * Advance countdown clocks in response to a Pay the Price. The module's clock
 * contract is that tension clocks advance when you Pay the Price (clocks.js
 * header; issue #203 (Clocks)) — wiring that was documented but never
 * built (playtest finding #10: "I had a pay the price this session, but the vow
 * clock is unmoved"). This advances, by one segment:
 *   - every active campaignState tension clock (the !clock / Clocks panel), and
 *   - the countdown clock on each player character's active vows (e.g. the
 *     inciting incident's "Dani's captivity" clock, stored on the vow item).
 * Campaign clocks are untouched (they advance at Begin a Session). GM-gated —
 * world/actor writes are GM-only, so on a player client this is a silent no-op.
 */
async function advanceClocksOnPayThePrice() {
  if (!game.user?.isGM) return [];
  const advanced = [];

  try {
    const { advanceTensionClocksForPayThePrice } = await import("./clocks/clocks.js");
    for (const c of await advanceTensionClocksForPayThePrice()) {
      advanced.push({ _id: c._id, name: c.name, type: "tension", filled: c.filled, segments: c.segments, triggered: c.triggered });
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | advanceClocksOnPayThePrice: tension clocks failed:`, err?.message ?? err);
  }

  try {
    const { getPlayerActors, advanceVowClocks } = await import("./character/actorBridge.js");
    for (const actor of getPlayerActors()) {
      for (const v of await advanceVowClocks(actor)) {
        advanced.push({ actorId: v.actorId, itemId: v.itemId, name: v.name, type: "vow", filled: v.ticks, segments: v.max, triggered: v.triggered });
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | advanceClocksOnPayThePrice: vow clocks failed:`, err?.message ?? err);
  }

  if (!advanced.length) return advanced;
  const lines = advanced.map(a =>
    `<li>${escapeChatHtml(a.name)} — ${a.filled}/${a.segments}${a.triggered ? " <strong>(TRIGGERED)</strong>" : ""}</li>`,
  ).join("");
  try {
    await ChatMessage.create({
      content: `<div class="sf-clock-card"><strong>⏳ The clock turns</strong><p>Paying the price advances the countdown:</p><ul>${lines}</ul></div>`,
      flags:   { [MODULE_ID]: { clockCard: true, payThePriceAdvance: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | advanceClocksOnPayThePrice: card post failed:`, err?.message ?? err);
  }

  // Fire-and-forget vignette for any clock that just triggered — the
  // narrative beat for when a deadline arrives or a threat materialises.
  const justTriggered = advanced.filter(a => a.triggered);
  if (justTriggered.length) {
    setTimeout(async () => {
      try {
        const { narrateClockAdvancement } = await import("./narration/narrator.js");
        const cs = game.settings.get(MODULE_ID, "campaignState") ?? {};
        for (const cd of justTriggered) {
          const text = await narrateClockAdvancement({ clock: cd, campaignState: cs });
          if (text) {
            await ChatMessage.create({
              content: `<div class="sf-clock-card"><strong>⚠ TRIGGERED — </strong><em>${escapeChatHtml(text)}</em></div>`,
              flags:   { [MODULE_ID]: { clockCard: true, clockVignetteCard: true } },
            });
          }
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | advanceClocksOnPayThePrice: trigger vignette failed:`, err?.message ?? err);
      }
    }, 0);
  }

  return advanced;
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
 * @param {{ move: string, amount: number, soloFallback?: string }} route
 */
async function dispatchPayThePriceSufferRoute(route) {
  const { getPlayerActors } = await import("./character/actorBridge.js");
  const { executeSuffer } = await import("./moves/sufferExecutor.js");

  const actor = getPlayerActors()[0] ?? null;
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

/**
 * Async-queue an oracle-narration follow-up card. Used by every chat command
 * that rolls a one-shot oracle table (`!oracle yes`, `!pay-the-price`, future
 * extensions). Runs `narrateOracleFollowup` in a fresh microtask so the raw
 * oracle-result card has already landed and the chat-render hook has already
 * fired by the time the narrator API call starts — guaranteeing chat order
 * is `<raw card> → <narration card>`.
 *
 * Silent skip if the Claude API key is unset, the X-Card is active, or the
 * narrator-enabled toggle is off (see `narrateOracleFollowup` in
 * `src/narration/narrator.js`).
 *
 * @param {Object} args — passed through verbatim to narrateOracleFollowup
 */
function scheduleOracleNarration(args) {
  setTimeout(async () => {
    try {
      const { narrateOracleFollowup } = await import("./narration/narrator.js");
      const campaignState = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {};
      await narrateOracleFollowup({ ...args, campaignState });
    } catch (err) {
      console.warn(`${MODULE_ID} | scheduleOracleNarration: narration follow-up failed:`, err?.message ?? err);
    }
  }, 0);
}

// Rank → +X adds for the bonded-path Develop Your Relationship roll
// (play kit p. 3: troublesome=+1; dangerous=+2; formidable=+3; extreme=+4; epic=+5).
const BOND_ROLL_ADDS = {
  troublesome: 1,
  dangerous:   2,
  formidable:  3,
  extreme:     4,
  epic:        5,
};

/**
 * Handle a !bond <rank> chat command — bonded Develop Your Relationship.
 *
 * Per play kit p. 3: when developing a relationship with a bonded
 * connection, skip the normal progress mark. Instead, roll +their rank
 * (troublesome=+1 ... epic=+5) and:
 *   strong hit → mark 2 ticks on bonds legacy track
 *   strong + match → also offer to raise the connection's rank by 1
 *   weak hit → +2 momentum
 *   miss → no lasting benefit
 */
async function handleBondCommand(message) {
  const text = message.content?.trim() ?? "";
  const arg  = text.slice("!bond".length).trim().split(/\s+/)[0]?.toLowerCase() ?? "";

  if (!arg || !(arg in BOND_ROLL_ADDS)) {
    await ChatMessage.create({
      content: `<div class="sf-bond-card"><strong>Develop Your Relationship (bonded)</strong> <p>Usage: <code>!bond &lt;rank&gt;</code><br>Rank: <code>troublesome</code> · <code>dangerous</code> · <code>formidable</code> · <code>extreme</code> · <code>epic</code></p></div>`,
      flags:   { [MODULE_ID]: { bondCommandCard: true } },
    });
    return;
  }

  const adds          = BOND_ROLL_ADDS[arg];
  const actionDie     = rollActionDie();
  const challengeDice = rollChallengeDice();
  const actionScore   = calcActionScore(actionDie, 0, adds);
  const { outcome, isMatch } = calcOutcome(actionScore, challengeDice);

  // 3D dice for the bond roll (fire-and-forget, fail-open).
  void showActionRoll(actionDie, challengeDice);

  const matchBadge = isMatch ? " ✦ MATCH" : "";
  let body, momentumChange = 0, ticksOnBonds = 0;

  switch (outcome) {
    case "strong_hit":
      ticksOnBonds = 2;
      body = `<strong>Strong hit${matchBadge}.</strong> Mark 2 ticks on your bonds legacy track.${isMatch ? " You may also envision how recent events bolstered your connection's standing and raise their rank by one (if not already epic)." : ""}`;
      break;
    case "weak_hit":
      momentumChange = 2;
      body = `<strong>Weak hit${matchBadge}.</strong> Take +2 momentum.`;
      break;
    case "miss":
      body = `<strong>Miss${matchBadge}.</strong> Take no lasting benefit.`;
      break;
  }

  // GM-only state writes — only fire if there's an actual effect.
  if (game.user?.isGM && (ticksOnBonds > 0 || momentumChange > 0)) {
    const campaignState = game.settings.get(MODULE_ID, "campaignState");
    if (ticksOnBonds > 0) {
      // Route through addLegacyTicks so filled boxes award XP like every
      // other legacy write (this used to be a duplicate inline tick bump).
      addLegacyTicks(campaignState, "bonds", ticksOnBonds);
    }
    await game.settings.set(MODULE_ID, "campaignState", campaignState);

    if (momentumChange > 0) {
      const actor = game.user?.character ?? getPlayerActors()[0];
      if (actor) {
        const { applyMeterChanges } = await import("./character/actorBridge.js");
        await applyMeterChanges(actor, { momentum: momentumChange });
      }
    }
  }

  await ChatMessage.create({
    content: `<div class="sf-bond-card"><strong>Develop Your Relationship (bonded, ${escapeChatHtml(arg)})</strong><p>Action: ${actionDie} + ${adds} = <strong>${actionScore}</strong> vs Challenge ${challengeDice[0]}, ${challengeDice[1]}</p><p>${body}</p></div>`,
    flags:   { [MODULE_ID]: { bondCommandCard: true } },
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

async function postMoveResult(resolution, aside = null, burnState = null, improveState = null, milestoneState = null, connectionState = null) {
  // 3D dice (Dice So Nice) for the action + challenge dice, fed the values the
  // resolver already rolled so the animation matches the card. Fire-and-forget
  // and fail-open — never blocks or breaks the result post.
  void showMoveRoll(resolution);
  return ChatMessage.create({
    content: formatMoveResult(resolution, aside, burnState, improveState, milestoneState, connectionState),
    flags: {
      [MODULE_ID]: {
        moveResolution: true,
        resolutionId:   resolution._id,
        ...(TDA_OFFER_MOVES.has(resolution.moveId) ? { combatMoveCard: true } : {}),
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
function formatMoveResult(resolution, aside = null, burnState = null, improveState = null, milestoneState = null, connectionState = null) {
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
        ? `<div class="sf-combat-followup"><button type="button" class="sf-followup-btn" data-action="sf-take-decisive-action" title="Roll your combat progress against the challenge dice to seize the objective">⚔ Attempt to Finish the Fight</button></div>`
        : ""}
    </div>
  `.trim();
}

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
  button.addEventListener("mouseleave", (e) => { window._sfSpeechInput?.stop(); });

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
  // the viewport, so it works with or without a map loaded.
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

  registerChatHook();
  registerActorHook();
  registerSharedSupplyHook();   // crew-shared supply track (co-op/guided rule)
  registerEntityRenameSyncHook();
  registerStarshipSeedHook();
  registerCommandVehicleHook();
  registerNativeProgressRollHook();
  registerNativeFulfilConsequenceHook();   // #248 B2: native-sheet vow fulfil → deepen bond + grant reward + legacy
  registerProgressTrackHooks();
  registerCombatTrackerHooks();
  registerEntityPanelHooks();
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
  // Won-fight vow milestone (#241) — Mark milestone / Fulfill / Deepen bond on a
  // won linked fight; mark + deepen are GM-gated and relayed for other clients.
  registerFightVowMilestoneHook();
  registerFightVowSocket();
  registerSettingsHooks();
  registerBurnMomentumHook({
    narrate:  narrateResolution,
    persist:  persistResolution,
    assemble: assembleContextPacket,
  });
  registerImproveResultHook({
    narrate:  narrateResolution,
    persist:  persistResolution,
    assemble: assembleContextPacket,
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
        await ChatMessage.create({
          content: "Battle — resolve the fight in a single, decisive clash.",
          flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "battle" } },
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
      await ChatMessage.create({
        content: "Take decisive action to seize the objective.",
        flags:   { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "take_decisive_action" } },
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
 * several vows are open and none was named). Clicking one marks that vow and
 * resolves the card so it can't fire twice.
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
      for (const b of root.querySelectorAll('[data-action="sf-milestone-pick"]')) b.disabled = true;
      // GM-only: vow Item writes are GM-gated (PERSIST-001). In solo-GM play the
      // player is the GM, so this is the normal path.
      if (!game.user?.isGM) return;
      try {
        const actorId = fresh.dataset.actorId || null;
        const vowId   = fresh.dataset.vowId || null;
        const actor   = (actorId && game.actors?.get?.(actorId)) || getPlayerActors()[0] || null;
        const vow     = readVows(actor).find(v => v.id === vowId);
        if (actor && vow) {
          const { milestoneTicks } = await import("./moves/milestone.js");
          const ticks = milestoneTicks(vow.rank);
          await markVowProgress(actor, vow.id, ticks);
          await postReachMilestoneCard(vow, ticks);
        }
        await message.update({ [`flags.${MODULE_ID}.resolved`]: true })
          .catch(err => console.warn(`${MODULE_ID} | milestone picker resolve update failed:`, err?.message ?? err));
      } catch (err) {
        console.error(`${MODULE_ID} | Milestone picker click failed:`, err);
      }
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
      await ChatMessage.create({
        content: trackLabel ? `Finish the expedition — ${trackLabel}.` : "Finish the expedition.",
        flags:   { [MODULE_ID]: {
          bypassPacing: true, forcedMoveId: "finish_an_expedition",
          ...(trackLabel ? { forcedMoveTarget: trackLabel } : {}),
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
 * posts a forced move message (develop_your_relationship or forge_a_bond) with
 * the connection name embedded so the interpreter can resolve the target.
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
      for (const b of root.querySelectorAll('[data-action="sf-connection-pick"]')) b.disabled = true;
      if (!game.user?.isGM) return;
      try {
        const pickAction = fresh.dataset.pickAction;
        const name = fresh.dataset.connectionName || "connection";
        const moveId = pickAction === "develop" ? "develop_your_relationship" : "forge_a_bond";
        const content = pickAction === "develop"
          ? `Develop my relationship with ${name}.`
          : `Forge a bond with ${name}.`;
        await ChatMessage.create({
          content,
          flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: moveId } },
        });
        await message.update({ [`flags.${MODULE_ID}.resolved`]: true })
          .catch(err => console.warn(`${MODULE_ID} | connection picker resolve update failed:`, err?.message ?? err));
      } catch (err) {
        console.error(`${MODULE_ID} | Connection picker click failed:`, err);
      }
    });
  }
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
