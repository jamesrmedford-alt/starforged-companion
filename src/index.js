/**
 * STARFORGED COMPANION
 * src/index.js — Module entry point
 *
 * Session 3 changes:
 *   — confirmInterpretation() stub removed; real dialog imported from ui/settingsPanel.js
 *   — persistResolution() stub removed; full implementation imported from moves/persistResolution.js
 *   — checkLoremaster() removed; configurable version imported from loremaster.js
 *   — Loremaster flag attachment now via attachLoremasterContext() from loremaster.js
 *   — mischiefLevel setting removed; now mischiefDial registered by ui/settingsPanel.js
 *   — UI panels (progressTracks, entityPanel, settingsPanel) wired via toolbar buttons
 *   — All three UI hook registrations called from ready hook
 */

import { CampaignStateSchema }   from "./schemas.js";
import { assembleContextPacket } from "./context/assembler.js";
import { interpretMove }         from "./moves/interpreter.js";
import { resolveMove }           from "./moves/resolver.js";
import { buildMischiefAside }    from "./moves/mischief.js";
import { persistResolution }     from "./moves/persistResolution.js";
import { initSpeechInput }       from "./input/speechInput.js";

// Loremaster integration (replaces hardcoded placeholder + inline checkLoremaster)
import {
  registerLoremasterSettings,
  checkLoremaster,
  attachLoremasterContext,
} from "./loremaster.js";

// UI panels — Session 3
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
} from "./ui/settingsPanel.js";

const MODULE_ID = "starforged-companion";


// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register core module settings.
 * Safety config, mischief dial, and Loremaster settings are registered by
 * their respective modules (called below). Only campaign-infrastructure
 * settings live here.
 */
function registerCoreSettings() {

  // Campaign state — world-scoped, persists across sessions
  game.settings.register(MODULE_ID, "campaignState", {
    name: "Campaign State",
    hint: "Persistent campaign data including World Truths, safety config, and entity records.",
    scope:  "world",
    config: false,
    type:   Object,
    default: { ...CampaignStateSchema },
  });

  // Claude API key — client-scoped so it never touches Foundry's server
  game.settings.register(MODULE_ID, "claudeApiKey", {
    name: "Claude API Key",
    hint: "Your Anthropic API key. Stored locally in your browser — never sent to Foundry's server.",
    scope:  "client",
    config: true,
    type:   String,
    default: "",
  });

  // Art generation API key — client-scoped for the same reason
  game.settings.register(MODULE_ID, "artApiKey", {
    name: "Art Generation API Key",
    hint: "API key for your chosen art generation backend (Replicate, fal.ai, or DALL-E).",
    scope:  "client",
    config: true,
    type:   String,
    default: "",
  });

  // Art backend selection
  game.settings.register(MODULE_ID, "artBackend", {
    name: "Art Generation Backend",
    hint: "External API used for generating entity portraits.",
    scope:  "world",
    config: true,
    type:   String,
    choices: {
      replicate: "Replicate",
      fal:       "fal.ai",
      dalle:     "DALL-E (OpenAI)",
    },
    default: "dalle",
  });

  // Speech input toggle
  game.settings.register(MODULE_ID, "speechInputEnabled", {
    name: "Push-to-Talk",
    hint: "Enable push-to-talk speech input. Requires a Chromium-based browser and microphone permission.",
    scope:  "client",
    config: true,
    type:   Boolean,
    default: false,
    onChange: (value) => {
      if (value) initSpeechInput();
    },
  });

  // Speech input language
  game.settings.register(MODULE_ID, "speechLanguage", {
    name: "Speech Input Language",
    hint: "BCP 47 language tag for speech recognition, e.g. en-US, en-GB.",
    scope:  "client",
    config: true,
    type:   String,
    default: "en-US",
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// CHAT MESSAGE HOOK — MOVE INTERPRETATION PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intercept outgoing chat messages and route player narration through
 * the move interpretation pipeline before passing context to Loremaster.
 *
 * Pipeline:
 *   1. Player narration arrives (typed or speech-transcribed)
 *   2. interpretMove() calls Claude API → returns identified move + stat + rationale
 *   3. Mischief aside generated (if mischiefApplied) and stored on interpretation
 *   4. MoveConfirmDialog shown — player accepts or re-interprets
 *   5. resolveMove() rolls dice, calculates outcome, applies consequences
 *   6. assembleContextPacket() builds the 7-section Loremaster context packet
 *   7. postMoveResult() posts HTML chat card + attaches context via attachLoremasterContext()
 *   8. persistResolution() applies meter/track changes to character and campaign state
 */
function registerChatHook() {
  Hooks.on("createChatMessage", async (message) => {
    if (!isPlayerNarration(message)) return;

    const narration     = message.content;
    const campaignState = game.settings.get(MODULE_ID, "campaignState");
    const apiKey        = game.settings.get(MODULE_ID, "claudeApiKey");
    const dial          = getMischiefDial();  // 'lawful' | 'balanced' | 'chaotic'

    try {
      // Step 2: interpret
      const interpretation = await interpretMove(narration, {
        campaignState,
        mischiefLevel: dial,
        apiKey,
      });

      // Step 3: generate aside before showing dialog so the player sees it
      if (interpretation.mischiefApplied) {
        interpretation._mischiefAside = buildMischiefAside(interpretation, dial);
      }

      // Step 4: show confirmation dialog — returns true (accept) or false (reject)
      const accepted = await confirmInterpretation(interpretation);
      if (!accepted) return;

      // Step 5–6: resolve + assemble
      const resolution = resolveMove(interpretation, campaignState);
      const packet     = await assembleContextPacket(resolution, campaignState);

      // Step 7: post result + attach Loremaster context
      const chatMessage = await postMoveResult(
        resolution,
        interpretation._mischiefAside ?? null
      );
      await attachLoremasterContext(chatMessage, packet.assembled);

      // Step 8: persist meter/track changes
      await persistResolution(resolution, campaignState);

    } catch (err) {
      console.error(`${MODULE_ID} | Move interpretation failed:`, err);
      ui.notifications.error(
        "Starforged Companion: Move interpretation failed. " +
        "Check your API key in module settings and try again."
      );
    }
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine whether a chat message is player narration that should be
 * routed through the move interpretation pipeline.
 *
 * Excluded:
 * - Roll and OOC message types
 * - Messages already containing move resolution markup (avoids re-processing)
 * - GM messages (GM narrates through Loremaster directly)
 * - Messages starting with "/" (commands) or "@" (direct Loremaster calls)
 */
function isPlayerNarration(message) {
  if (message.type === CONST.CHAT_MESSAGE_TYPES.OOC)  return false;
  if (message.type === CONST.CHAT_MESSAGE_TYPES.ROLL)  return false;
  if (message.flags?.[MODULE_ID]?.moveResolution)      return false;
  if (game.users.get(message.author)?.isGM)            return false;
  if (message.content?.startsWith("/"))                return false;
  if (message.content?.startsWith("@"))                return false;
  return true;
}

/**
 * Post the resolved move result to chat.
 * Returns the created ChatMessage so the caller can attach Loremaster context to it.
 *
 * @param {Object}      resolution
 * @param {string|null} aside        — mischief aside text, or null
 * @returns {Promise<ChatMessage>}
 */
async function postMoveResult(resolution, aside = null) {
  return ChatMessage.create({
    content: formatMoveResult(resolution, aside),
    flags: {
      [MODULE_ID]: {
        moveResolution: true,
        resolutionId:   resolution._id,
        // loremasterContext is attached separately via attachLoremasterContext()
        // so the flag path is controlled by loremaster.js, not hardcoded here.
      },
    },
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
  });
}

/**
 * Format a move resolution as an HTML chat card.
 * Shows: move name, stat used, dice values, outcome label, narrative consequence.
 * Mischief aside, when present, appears at the bottom in a subdued dashed-border
 * block — a footnote, not a headline.
 */
function formatMoveResult(resolution, aside = null) {
  const outcomeClass = {
    strong_hit: "sf-strong-hit",
    weak_hit:   "sf-weak-hit",
    miss:       "sf-miss",
  }[resolution.outcome] ?? "";

  const addsStr  = resolution.adds ? ` + ${resolution.adds}` : "";
  const matchStr = resolution.isMatch ? " ✦ Match" : "";

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
 * Uses both mouse and touch events for The Forge mobile/tablet compatibility.
 * Audio is captured only while the button is physically held.
 */
function injectPushToTalkButton(html) {
  const controls = html.find("#chat-controls");
  if (!controls.length) return;

  const button = $(`
    <button
      type="button"
      id="sf-ptt-button"
      class="sf-ptt-button"
      title="Push to Talk — hold to speak"
      aria-label="Push to Talk"
    >🎙</button>
  `);

  controls.prepend(button);

  button.on("mousedown touchstart", (e) => {
    e.preventDefault();
    window._sfSpeechInput?.start();
    button.addClass("sf-ptt-active");
  });

  button.on("mouseup touchend mouseleave", (e) => {
    e.preventDefault();
    window._sfSpeechInput?.stop();
    button.removeClass("sf-ptt-active");
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "init" — earliest safe point. Game data not yet available.
 * All settings must be registered here so they exist before "ready".
 */
Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initialising`);

  // Core campaign settings (campaignState, API keys, art backend, speech)
  registerCoreSettings();

  // Safety config, mischief dial (ui/settingsPanel.js)
  registerUISettings();

  // Loremaster module ID and flag path (loremaster.js)
  registerLoremasterSettings();
});

/**
 * "ready" — all modules loaded, game data available.
 */
Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Ready`);

  // Check Loremaster presence using configured module ID
  checkLoremaster();

  // Register move pipeline chat hook
  registerChatHook();

  // Register UI panel live-refresh hooks
  registerProgressTrackHooks();
  registerEntityPanelHooks();

  // Register X-Card /x chat hook
  registerSettingsHooks();

  // Start speech input if enabled
  if (game.settings.get(MODULE_ID, "speechInputEnabled")) {
    initSpeechInput();
  }
});

/**
 * "getSceneControlButtons" — add toolbar buttons for the three UI panels.
 * Appended to the token controls group. Adjust group name if your Foundry
 * layout uses a different control set.
 */
Hooks.on("getSceneControlButtons", (controls) => {
  const group = controls.find(c => c.name === "token");
  if (!group) return;

  group.tools.push(
    {
      name:    "progressTracks",
      title:   "Progress Tracks",
      icon:    "fas fa-tasks",
      button:  true,
      onClick: () => openProgressTracks(),
    },
    {
      name:    "entityPanel",
      title:   "Entities",
      icon:    "fas fa-users",
      button:  true,
      onClick: () => openEntityPanel(),
    },
    {
      name:    "sfSettings",
      title:   "Companion Settings",
      icon:    "fas fa-shield-alt",
      button:  true,
      visible: game.user.isGM,
      onClick: () => openSettingsPanel(),
    },
  );
});

/**
 * "renderChatLog" — chat UI is available.
 * Inject the push-to-talk button if speech input is enabled.
 */
Hooks.on("renderChatLog", (_chatLog, html, _data) => {
  if (game.settings.get(MODULE_ID, "speechInputEnabled")) {
    injectPushToTalkButton(html);
  }
});
