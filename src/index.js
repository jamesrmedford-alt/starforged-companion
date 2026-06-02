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
import {
  buildBurnState,
  renderBurnButtonHtml,
  registerBurnMomentumHook,
} from "./moves/burnMomentum.js";
import {
  scanForApplicableAbilities,
  getCommandVehicleActor,
} from "./moves/abilityScanner.js";
import { enrichInterpretationStatValue } from "./moves/statEnrichment.js";
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
} from "./narration/narrator.js";
import { invalidateActorCache, recalculateMomentumBounds, getPlayerActors } from "./character/actorBridge.js";
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
  getShipPositioningEnabled,
  getShipAutoMoveOnCourse,
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
import { onChatMessageRender }    from "./system/chatHooks.js";
import {
  isMigrateEntitiesCommand,
  handleMigrateEntitiesCommand,
} from "./entities/migrator.js";
import { registerSectorOverviewSync } from "./sectors/sectorOverview.js";
import {
  registerSectorSceneHooks,
  moveCommandVehicleTokenToDestination,
} from "./sectors/sectorSceneHooks.js";
import { isCanonicalGM }              from "./multiplayer/gmGate.js";
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
    hint:    "When a new starship Actor is created with empty notes, roll the starship Type / First Look / Mission oracles and write them to the actor's Notes field. Triggers a silent portrait generation if an OpenRouter API key is configured. Disable to keep new starships blank.",
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

  // -------------------------------------------------------------------------
  // Audio narration (docs/audio/audio-narration-scope.md)
  //
  // World-scoped GM controls: master toggle, voice IDs, model, speed, cache
  // cap. Client-scoped per-player controls: API key, client enable, volume,
  // autoplay. The Companion Settings panel surfaces these through a dedicated
  // Audio tab; none of them appear in Foundry's default Configure Settings
  // dialog.
  // -------------------------------------------------------------------------
  game.settings.register(MODULE_ID, "audio.enabled", {
    name: "Audio narration enabled", scope: "world", config: false,
    type: Boolean, default: false,
  });
  game.settings.register(MODULE_ID, "audio.narratorVoiceId", {
    name: "Narrator voice ID", scope: "world", config: false,
    type: String, default: "21m00Tcm4TlvDq8ikWAM",
  });
  game.settings.register(MODULE_ID, "audio.npcVoiceId", {
    name: "NPC voice ID", scope: "world", config: false,
    type: String, default: "pNInz6obpgDQGcFmaJgB",
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
    config: false, type: Boolean, default: false,
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
      // See docs/fact-continuity/fact-continuity-scope.md §9.1.
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
      const interpretation = forcedMoveId
        ? buildForcedInterpretation(forcedMoveId, narration, dial, forcedMoveTarget)
        : await interpretMove(narration, {
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

      // Take Decisive Action — auto-detect the bound combat track's
      // position so the resolver can apply the bad-spot downgrade
      // (play kit p. 5). Returns null if there are zero or multiple
      // active combat tracks; the downgrade is skipped in both cases.
      const combatPosition = interpretation.moveId === "take_decisive_action"
        ? await getActiveCombatPosition()
        : null;

      const resolution = resolveMove(interpretation, campaignState, { combatPosition });

      // Fact-continuity §20 — when set_a_course resolves to a non-miss,
      // the ship arrived at the destination the player named. Infer the
      // new position and write it onto the command vehicle BEFORE the
      // assembler builds the context packet so Section 6.5 reflects
      // the arrival on this same turn.
      if (
        resolution.moveId === "set_a_course"
        && resolution.outcome !== "miss"
        && getShipPositioningEnabled()
        && getShipAutoMoveOnCourse()
        && game.user.isGM
      ) {
        await maybeUpdateShipPositionFromName(
          interpretation.moveTarget,
          campaignState,
          tokenDragSetCourse ? "scene_token" : "set_a_course",
        );

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
      const burnActor   = getPlayerActors()[0] ?? null;
      const burnState   = buildBurnState(resolution, burnActor);
      const moveResultMessage = await postMoveResult(
        resolution,
        interpretation._mischiefAside ?? null,
        burnState,
      );

      // Step 10: narrate the consequence directly via Claude — no GM dependency
      await narrateResolution(resolution, packet, campaignState, { relevance, speakerActorId });

      // Only the GM can write world-scoped settings (campaignState).
      // Players trigger the pipeline but defer persistence to the GM's client.
      if (game.user.isGM) {
        await persistResolution(resolution, campaignState);
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
      if (!game.settings.get(MODULE_ID, "autoSeedStarship")) return;

      // Defer the import so this module file stays parse-only at init.
      // The hook itself returns synchronously; seeding runs after.
      import("./entities/ship.js").then(async (mod) => {
        if (mod.starshipHasSeedDetail(actor)) {
          console.log(`${MODULE_ID} | starship seed: skipping ${actor.id} (already populated)`);
          return;
        }
        const state = game.settings.get(MODULE_ID, "campaignState") ?? {};
        await mod.seedStarshipActor(actor, state).catch(err =>
          console.warn(`${MODULE_ID} | starship seed failed for ${actor.id}:`, err));
      }).catch(err =>
        console.warn(`${MODULE_ID} | starship seed: dynamic import failed:`, err));
    } catch (err) {
      console.warn(`${MODULE_ID} | createActor starship-seed hook threw:`, err);
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
      : (game.actors?.find(a => a?.type === "character" && a?.hasPlayerOwner) ?? null);
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
      campaignState.legacyTracks ??= {};
      const t = campaignState.legacyTracks.bonds ?? { ticks: 0, cleared: false };
      t.ticks = Math.min(t.ticks + ticksOnBonds, 40);
      campaignState.legacyTracks.bonds = t;
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
    const { getCommandVehicle, updateShip } = await import("./entities/ship.js");
    const cv = getCommandVehicle(campaignState);
    if (!cv?._id) return null;
    const position = inferShipPosition(ref, campaignState, { source });
    await updateShip(cv._id, { position });
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
 * Post the resolved move result to chat.
 * Returns the created ChatMessage so the caller can attach Loremaster context.
 */
async function postMoveResult(resolution, aside = null, burnState = null) {
  return ChatMessage.create({
    content: formatMoveResult(resolution, aside, burnState),
    flags: {
      [MODULE_ID]: {
        moveResolution: true,
        resolutionId:   resolution._id,
        ...(burnState ? { burn: burnState } : {}),
      },
    },
    // No type field — defaults to "base", which is valid in both v12 and v13.
    // "other" was removed as a valid type in v13 and must not be used.
  });
}

/**
 * Format a move resolution as an HTML chat card.
 */
function formatMoveResult(resolution, aside = null, burnState = null) {
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
      ${renderBurnButtonHtml(burnState)}
    </div>
  `.trim();
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
  console.log(`${MODULE_ID} | Initialising`);
  registerCoreSettings();
  registerUISettings();
  registerPrivateChannelSettings();
  registerCompanionControlLayer();
});

/**
 * Register an empty Canvas InteractionLayer for the Companion's own
 * scene-control group (F16). A top-level scene-control group must reference a
 * canvas layer; selecting the group activates that layer. We don't draw
 * anything — the layer exists only so the group is selectable without hijacking
 * Foundry's token tools (where the buttons previously lived and vanished when
 * another group was selected).
 *
 * The layer MUST mount into the `interface` canvas group: in v13 every core
 * interaction layer (tokens/notes/walls) lives there, while `primary` is the
 * world-space placeable-mesh group that never draws an InteractionLayer. A
 * layer registered under `primary` stays undrawn, so the group can't complete
 * SceneControls.activate() on click and the tool row never appears. (We do NOT
 * mirror foundry-ironsworn's sceneButtons.ts here — its `group: "primary"` is
 * a stale 2022 value and its own toolbar group is broken the same way in v13.)
 */
function registerCompanionControlLayer() {
  try {
    const InteractionLayer = foundry?.canvas?.layers?.InteractionLayer;
    if (!InteractionLayer || !globalThis.CONFIG?.Canvas?.layers) return;
    class StarforgedCompanionLayer extends InteractionLayer {
      static get layerOptions() {
        return foundry.utils.mergeObject(super.layerOptions, {
          zIndex: 180,
          name:   "starforgedCompanion",
        });
      }
      get placeables() { return []; }
    }
    CONFIG.Canvas.layers.starforgedCompanion = {
      layerClass: StarforgedCompanionLayer,
      // Track whatever group the core interaction layers use (verified
      // 'interface' in v13) so this can't silently go stale; fall back to the
      // literal if no core layer is registered yet.
      group:      CONFIG.Canvas.layers.tokens?.group ?? "interface",
    };
  } catch (err) {
    console.warn(`${MODULE_ID} | could not register companion control layer:`, err);
  }
}

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Ready`);

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
    import("./entities/migrator.js").then(async ({ flattenSectorActorFolders }) => {
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
    }).catch(err => console.warn(`${MODULE_ID} | sector-folder flatten dynamic import failed:`, err));
  }

  registerChatHook();
  registerActorHook();
  registerStarshipSeedHook();
  registerCommandVehicleHook();
  registerProgressTrackHooks();
  registerEntityPanelHooks();
  registerDraftCardHooks();
  registerSectorOverviewSync();
  registerSectorSceneHooks();
  // Audio narration — socket relay for cache writes from non-GM clients.
  import("./audio/index.js").then(({ registerAudioSocket }) => {
    registerAudioSocket();
  }).catch(err => console.warn(`${MODULE_ID} | audio socket registration failed:`, err));
  registerSettingsHooks();
  registerBurnMomentumHook({
    narrate:  narrateResolution,
    persist:  persistResolution,
    assemble: assembleContextPacket,
  });

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
  // next world load. See docs/fact-continuity/fact-continuity-scope.md §9.2.
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
 * Build the Companion's toolbar tools as an object keyed by tool name. Shared
 * between the dedicated Companion control group (F16) and the legacy tokens-group
 * fallback. `onChange` exists because v13 requires it on the tool object, but it
 * is never called for button:true tools — the real handlers are bound in the
 * renderSceneControls hook below (two-hook pattern).
 */
function buildCompanionTools() {
  const isGM = game.user.isGM;
  return {
    sfSession:      { name: "sfSession",      title: "Session",             icon: "fas fa-play-circle", button: true, onChange: () => openSessionPanel() },
    progressTracks: { name: "progressTracks", title: "Progress Tracks",     icon: "fas fa-tasks",       button: true, onChange: () => openProgressTracks() },
    entityPanel:    { name: "entityPanel",    title: "Entities",            icon: "fas fa-users",       button: true, onChange: () => openEntityPanel() },
    chronicle:      { name: "chronicle",      title: "Character Chronicle", icon: "fas fa-book-open",    button: true, onChange: () => openChroniclePanel() },
    sfPrivateChannel:{ name: "sfPrivateChannel", title: "Private Channel",   icon: "fas fa-comment-dots", button: true, visible: isPrivateChannelEnabled(), onChange: () => openPrivateChannel() },
    sfSettings:     { name: "sfSettings",     title: "Companion Settings",  icon: "fas fa-shield-alt",   button: true, visible: isGM, onChange: () => openSettingsPanel() },
    sectorCreator:  { name: "sectorCreator",  title: "Sector Creator",      icon: "fas fa-map",          button: true, visible: isGM, onChange: () => {} },
    worldJournal:   { name: "worldJournal",   title: "World Journal",       icon: "fas fa-book",         button: true, visible: isGM, onChange: () => {} },
    worldTruths:    { name: "worldTruths",    title: "World Truths",        icon: "fas fa-scroll",       button: true, visible: isGM, onChange: () => {} },
    clocks:         { name: "clocks",         title: "Clocks",              icon: "fas fa-clock",        button: true, onChange: () => {} },
    customOracles:  { name: "customOracles",  title: "Custom Oracles",      icon: "fas fa-table-list",   button: true, visible: isGM, onChange: () => {} },
  };
}

Hooks.on("getSceneControlButtons", (controls) => {
  const tools = buildCompanionTools();

  // Preferred: the Companion's own top-level scene-control group (F16) so the
  // buttons no longer ride inside Foundry's token tools (where selecting any
  // other group hid them, with no way back). v13 — controls is an Object keyed
  // by group name; v12 — controls is an Array. The group's backing canvas
  // layer is registered in registerCompanionControlLayer() (must be the
  // `interface` group — see the note there). Wrapped defensively: any failure
  // falls back to the tokens group so the buttons can never fully disappear.
  let placedInOwnGroup = false;
  try {
    const group = {
      name:       "starforgedCompanion",
      title:      "Starforged Companion",
      icon:       "fas fa-meteor",
      layer:      "starforgedCompanion",
      visible:    true,
      // v13's SceneControls.activate() → #preActivate → #onToolChange → #onChange
      // chain does `group.tools[group.activeTool].onChange(...)` during every
      // group transition. Without an activeTool, `tools[undefined]` is undefined
      // and the onChange read throws — aborting the click and leaving the user
      // unable to switch groups. Point this at a tool whose onChange is a no-op
      // (`clocks`) so the preActivate call is benign and doesn't pop a panel as
      // a side effect. Must be a non-GM-gated key so it resolves for player
      // clients too.
      activeTool: "clocks",
      tools,
    };
    if (Array.isArray(controls)) {
      controls.push(group);
      placedInOwnGroup = true;
    } else if (controls && typeof controls === "object") {
      controls.starforgedCompanion = group;
      placedInOwnGroup = true;
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | companion control group registration failed:`, err);
  }

  // Fallback: if the dedicated group couldn't be placed (unexpected controls
  // shape), register into the tokens group as before so the buttons still show.
  if (!placedInOwnGroup) {
    const tokenControls = controls?.tokens ?? controls?.token;
    if (!tokenControls) {
      console.warn(`${MODULE_ID} | No control group available — buttons not registered`);
      return;
    }
    tokenControls.tools ??= {};
    Object.assign(tokenControls.tools, tools);
  }
});

// Foundry v13 doesn't invoke a tool's onChange when the user *clicks* it
// (it does call it during group activate — see the activeTool comment above —
// but that's a different code path). Attach click listeners directly after the
// toolbar renders so the buttons actually do something on click.
Hooks.on("renderSceneControls", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  const buttonMap = {
    sfSession:      () => openSessionPanel(),
    progressTracks: () => openProgressTracks(),
    entityPanel:    () => openEntityPanel(),
    chronicle:      () => openChroniclePanel(),
    sfPrivateChannel: () => openPrivateChannel(),
    sfSettings:     () => openSettingsPanel(),
    sectorCreator:  () => openSectorCreator(),
    worldJournal:   () => openWorldJournalPanel(),
    worldTruths:    () => openSystemTruthsDialog(),
    clocks:         () => openClocksPanel(),
    customOracles:  () => openCustomOraclesPanel(),
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
 * (docs/audio/audio-narration-scope.md §9). The button is rendered hidden by
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
      } catch {
        // Player clients fall back to a local-only disable above.
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
