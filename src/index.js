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
 *
 * Post-session 3 fixes:
 *   — buildMischiefAside called with correct four-argument signature
 *   — getSceneControlButtons updated for Foundry v13 (controls is Object, not Array)
 *   — message.author → message.user (Foundry v13 rename)
 *   — CONST.CHAT_MESSAGE_TYPES replaced with string literals (v13 compatibility)
 *   — injectPushToTalkButton rewritten without jQuery (removed in v13)
 */

import { CampaignStateSchema }   from "./schemas.js";
import { assembleContextPacket } from "./context/assembler.js";
import { interpretMove }         from "./moves/interpreter.js";
import { resolveMove }           from "./moves/resolver.js";
import { buildMischiefAside }    from "./moves/mischief.js";
import { persistResolution }     from "./moves/persistResolution.js";
import { initSpeechInput }       from "./input/speechInput.js";

import {
  registerLoremasterSettings,
  checkLoremaster,
  attachLoremasterContext,
} from "./loremaster.js";

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
    config:  true,
    type:    String,
    default: "",
  });

  game.settings.register(MODULE_ID, "artApiKey", {
    name:    "Art Generation API Key",
    hint:    "API key for your chosen art generation backend (Replicate, fal.ai, or DALL-E).",
    scope:   "client",
    config:  true,
    type:    String,
    default: "",
  });

  game.settings.register(MODULE_ID, "artBackend", {
    name:    "Art Generation Backend",
    hint:    "External API used for generating entity portraits.",
    scope:   "world",
    config:  true,
    type:    String,
    choices: {
      replicate: "Replicate",
      fal:       "fal.ai",
      dalle:     "DALL-E (OpenAI)",
    },
    default: "dalle",
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

  // Claude proxy base URL — required to route API calls through the local
  // proxy (proxy/claude-proxy.mjs) which bypasses Electron renderer CORS.
  // Default assumes the proxy is running on the same machine as Foundry.
  game.settings.register(MODULE_ID, "claudeProxyUrl", {
    name:    "Claude Proxy URL",
    hint:    "Base URL of the local Claude proxy server. Run 'npm run proxy' in the module folder before starting a session. Default: http://127.0.0.1:3001",
    scope:   "world",
    config:  true,
    type:    String,
    default: "http://127.0.0.1:3001",
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
    const dial          = getMischiefDial();

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
      const packet     = await assembleContextPacket(resolution, campaignState);

      const chatMessage = await postMoveResult(
        resolution,
        interpretation._mischiefAside ?? null
      );
      await attachLoremasterContext(chatMessage, packet.assembled);

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
 * Uses string literals for message types — CONST.CHAT_MESSAGE_TYPES was
 * restructured in Foundry v13 and the constants can no longer be relied on.
 *
 * Excluded:
 * - OOC and roll message types
 * - Messages already containing move resolution markup (avoids re-processing)
 * - GM messages (GM narrates through Loremaster directly)
 * - Messages starting with "/" (commands) or "@" (direct Loremaster calls)
 */
function isPlayerNarration(message) {
  // String literal type checks — v13 compatible
  const type = message.type;
  if (type === "ooc" || type === "roll" || type === "whisper") return false;

  if (message.flags?.[MODULE_ID]?.moveResolution) return false;

  // message.user is the v13 name; message.author is the v12 name — support both
  const user = message.user ?? game.users?.get(message.author);
  if (user?.isGM) return false;

  if (message.content?.startsWith("/")) return false;
  if (message.content?.startsWith("@")) return false;

  return true;
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
    // "other" string literal — avoids CONST.CHAT_MESSAGE_TYPES.OTHER (v13 compat)
    type: "other",
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
  registerLoremasterSettings();
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Ready`);

  checkLoremaster();
  registerChatHook();
  registerProgressTrackHooks();
  registerEntityPanelHooks();
  registerSettingsHooks();

  if (game.settings.get(MODULE_ID, "speechInputEnabled")) {
    initSpeechInput();
  }
});

/**
 * getSceneControlButtons — add toolbar buttons for the three UI panels.
 *
 * Foundry v13 changed this hook: controls is now a plain Object keyed by
 * group name rather than an Array. Both formats are handled here.
 */
Hooks.on("getSceneControlButtons", (controls) => {
  const controlsArray = Array.isArray(controls)
    ? controls
    : Object.values(controls);

  // v12 uses "token", v13 may use "tokens" — check both
  const group = controlsArray.find(c => c.name === "token" || c.name === "tokens");
  if (!group) return;

  if (!Array.isArray(group.tools)) group.tools = [];

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
 * renderChatLog — inject PTT button when speech is enabled.
 * html is HTMLElement in v13, jQuery object in v12 — injectPushToTalkButton handles both.
 */
Hooks.on("renderChatLog", (_chatLog, html, _data) => {
  if (game.settings.get(MODULE_ID, "speechInputEnabled")) {
    injectPushToTalkButton(html);
  }
});
