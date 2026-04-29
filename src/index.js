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
import { isLocalProxyReachable, proxyModeDescription } from "./api-proxy.js";
import { narrateResolution } from "./narration/narrator.js";
import { invalidateActorCache, recalculateMomentumBounds } from "./character/actorBridge.js";
import { openChroniclePanel } from "./character/chroniclePanel.js";

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


// ─────────────────────────────────────────────────────────────────────────────
// CHAT MESSAGE HOOK — MOVE INTERPRETATION PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

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

      // Step 7: post move result card
      await postMoveResult(
        resolution,
        interpretation._mischiefAside ?? null
      );

      // Step 8: narrate the consequence directly via Claude — no GM dependency
      await narrateResolution(resolution, packet, campaignState);

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
    if (foundry.utils.hasProperty(changes, "system.debilities")) {
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
function isPlayerNarration(message) {
  // String literal type checks — v13 compatible
  const type = message.type;
  if (type === "ooc" || type === "roll" || type === "whisper") return false;

  // Skip messages already processed by this module
  if (message.flags?.[MODULE_ID]?.moveResolution) return false;
  if (message.flags?.[MODULE_ID]?.narrationCard)  return false;

  // Ironsworn system messages posted by sendToChat() in chat-alert.ts
  if (message.flags?.['foundry-ironsworn']) return false;
  if (message.speaker?.alias === 'Ironsworn') return false;

  // message.author is correct for both v12 and v13.
  // message.user was the old name — accessing it in v13 logs a deprecation warning.
  const user = message.author ?? game.users?.get(message.user);
  if (user?.isGM) return false;

  const text = message.content?.trim() ?? "";

  // No meaningful text content — system-generated empty or near-empty messages
  if (text.length < 10) return false;

  // Escape character — prefix with \ to bypass the pipeline entirely
  if (text.startsWith("\\")) return false;

  // @ and / commands are not player narration
  if (text.startsWith("@")) return false;
  if (text.startsWith("/")) return false;

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

  // Session ID — GM writes to world-scoped settings; players read from state
  if (game.user.isGM) {
    const campaignState = game.settings.get(MODULE_ID, "campaignState");
    const updated = initSessionId(campaignState);
    game.settings.set(MODULE_ID, "campaignState", updated).catch(err => {
      console.error(`${MODULE_ID} | Failed to persist session ID:`, err);
    });
  }

  // Check proxy health — warn GM if local proxy is not running
  // (On The Forge this always returns true and no warning is shown)
  isLocalProxyReachable().then(reachable => {
    if (!reachable) {
      ui.notifications.warn(
        "Starforged Companion: Claude proxy is not running. " +
        "Run 'npm run proxy' (or proxy/start.sh) in the module folder before interpreting moves. " +
        `Proxy mode: ${proxyModeDescription()}`,
        { permanent: true }
      );
    } else {
      console.log(`${MODULE_ID} | Proxy reachable: ${proxyModeDescription()}`);
    }
  });

  registerChatHook();
  registerActorHook();
  registerProgressTrackHooks();
  registerEntityPanelHooks();
  registerSettingsHooks();

  if (game.settings.get(MODULE_ID, "speechInputEnabled")) {
    initSpeechInput();
  }
});

Hooks.once("closeWorld", async () => {
  if (!game.user.isGM) return;
  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  campaignState.lastSessionTimestamp = new Date().toISOString();
  await game.settings.set(MODULE_ID, "campaignState", campaignState);
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
      name:    "chronicle",
      title:   "Character Chronicle",
      icon:    "fas fa-book-open",
      button:  true,
      onClick: () => openChroniclePanel(),
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
