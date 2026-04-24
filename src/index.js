/**
 * STARFORGED COMPANION
 * src/index.js — Module entry point
 *
 * Responsibilities:
 * - Register all Foundry settings
 * - Register all hooks
 * - Check for Loremaster at runtime and warn if absent
 * - Wire up the chat input listener and push-to-talk button
 *
 * Foundry v13: uses ApplicationV2 for all UI panels.
 * All other document/settings APIs are stable from v12.
 */

import { CampaignStateSchema }   from "./schemas.js";
import { assembleContextPacket } from "./context/assembler.js";
import { interpretMove }         from "./moves/interpreter.js";
import { resolveMove }           from "./moves/resolver.js";
import { ProgressTrackPanel }    from "./ui/progressTracks.js";
import { EntityPanel }           from "./ui/entityPanel.js";
import { initSpeechInput }       from "./input/speechInput.js";

const MODULE_ID = "starforged-companion";


// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register all module settings.
 * Called on the "init" hook before any game data is available.
 */
function registerSettings() {

  // Campaign state — world-scoped, persists across sessions
  game.settings.register(MODULE_ID, "campaignState", {
    name: "Campaign State",
    hint: "Persistent campaign data including World Truths, safety config, and entity records.",
    scope: "world",
    config: false,
    type: Object,
    default: { ...CampaignStateSchema },
  });

  // Claude API key — client-scoped so it never touches the server
  game.settings.register(MODULE_ID, "claudeApiKey", {
    name: "Claude API Key",
    hint: "Your Anthropic API key. Stored locally in your browser — never sent to Foundry's server.",
    scope: "client",
    config: true,
    type: String,
    default: "",
  });

  // Art generation API key — client-scoped for the same reason
  game.settings.register(MODULE_ID, "artApiKey", {
    name: "Art Generation API Key",
    hint: "API key for your chosen art generation backend (Replicate, fal.ai, or DALL-E).",
    scope: "client",
    config: true,
    type: String,
    default: "",
  });

  // Mischief dial — world-scoped default, overridable per session
  game.settings.register(MODULE_ID, "mischiefLevel", {
    name: "Mischief Dial",
    hint: "Controls how liberally the module interprets player narration. Serious / Balanced / Chaotic.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      serious:  "Serious — literal interpretation",
      balanced: "Balanced — occasional organic misreads",
      chaotic:  "Chaotic — deliberate misinterpretation for comic effect",
    },
    default: "balanced",
  });

  // Speech input toggle
  game.settings.register(MODULE_ID, "speechInputEnabled", {
    name: "Push-to-Talk",
    hint: "Enable push-to-talk speech input. Requires a Chromium-based browser and microphone permission.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: (value) => {
      if (value) initSpeechInput();
    },
  });

  // Speech input language
  game.settings.register(MODULE_ID, "speechLanguage", {
    name: "Speech Input Language",
    hint: "BCP 47 language tag for speech recognition, e.g. en-US, en-GB.",
    scope: "client",
    config: true,
    type: String,
    default: "en-US",
  });

  // Art backend selection
  game.settings.register(MODULE_ID, "artBackend", {
    name: "Art Generation Backend",
    hint: "External API used for generating entity portraits.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      replicate: "Replicate",
      fal:       "fal.ai",
      dalle:     "DALL-E (OpenAI)",
    },
    default: "replicate",
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// LOREMASTER RUNTIME CHECK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check that Loremaster is installed and active.
 * Called on the "ready" hook when game.modules is populated.
 *
 * Loremaster is distributed via Patreon and is not in the Foundry package registry,
 * so it cannot be declared as a manifest dependency. This runtime check surfaces
 * a clear, actionable warning to the GM instead.
 *
 * Replace "loremaster" below with Loremaster's actual module ID once confirmed.
 */
function checkLoremaster() {
  if (!game.user.isGM) return;

  const loremaster = game.modules.get("loremaster");

  if (!loremaster) {
    ui.notifications.warn(
      "Starforged Companion: Loremaster is not installed. " +
      "This module requires Loremaster to handle narration. " +
      "Install it via the Loremaster Patreon before running a session.",
      { permanent: true }
    );
    return;
  }

  if (!loremaster.active) {
    ui.notifications.warn(
      "Starforged Companion: Loremaster is installed but not active. " +
      "Enable it in your module list.",
      { permanent: true }
    );
  }
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
 *   3. Confirmation UI shown — player may override the interpretation
 *   4. resolveMove() rolls dice, calculates outcome, applies consequences
 *   5. assembleContextPacket() builds the Loremaster context packet
 *   6. Context packet is posted to chat as a flagged message for Loremaster to consume
 */
function registerChatHook() {
  Hooks.on("createChatMessage", async (message) => {
    if (!isPlayerNarration(message)) return;

    const narration      = message.content;
    const campaignState  = game.settings.get(MODULE_ID, "campaignState");
    const mischiefLevel  = game.settings.get(MODULE_ID, "mischiefLevel");
    const apiKey         = game.settings.get(MODULE_ID, "claudeApiKey");

    try {
      const interpretation = await interpretMove(narration, {
        campaignState,
        mischiefLevel,
        apiKey,
      });

      // Show confirmation UI; player may override stat or move choice.
      // Returns the (possibly modified) interpretation, or null if cancelled.
      const confirmed = await confirmInterpretation(interpretation);
      if (!confirmed) return;

      const resolution = await resolveMove(confirmed, campaignState);
      const packet     = await assembleContextPacket(resolution, campaignState);

      await postMoveResult(resolution, packet);
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
 * Show the move confirmation UI.
 * Returns the confirmed (possibly player-modified) interpretation, or null if cancelled.
 *
 * Stub — replaced by ApplicationV2 dialog once UI panels are built.
 * Auto-confirms for now so the full pipeline can be tested end-to-end.
 */
async function confirmInterpretation(interpretation) {
  // TODO: Replace with ApplicationV2 confirmation dialog (ui/settingsPanel.js)
  console.log(`${MODULE_ID} | Move interpreted:`, interpretation);
  return interpretation;
}

/**
 * Post the resolved move result to chat.
 * The Loremaster context packet is attached as a flag — Loremaster reads it from there.
 * Mischief is not signalled in the card; the result reads as a straightforward outcome.
 */
async function postMoveResult(resolution, packet) {
  await ChatMessage.create({
    content: formatMoveResult(resolution),
    flags: {
      [MODULE_ID]: {
        moveResolution: true,
        resolutionId:      resolution._id,
        loremasterContext: packet.assembled,
      },
    },
    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
  });
}

/**
 * Format a move resolution as an HTML chat card.
 * Shows: move name, stat used, dice values, outcome label, narrative consequence.
 */
function formatMoveResult(resolution) {
  const outcomeClass = {
    strong_hit: "sf-strong-hit",
    weak_hit:   "sf-weak-hit",
    miss:       "sf-miss",
  }[resolution.outcome] ?? "";

  const addsStr = resolution.adds ? ` + ${resolution.adds}` : "";
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
    </div>
  `.trim();
}

/**
 * Persist the move resolution to the campaign state.
 * Updates the current session's resolution list and any affected meters/tracks.
 * Full implementation deferred until entity management layer is built.
 */
async function persistResolution(resolution, campaignState) {
  const updated = foundry.utils.deepClone(campaignState);
  updated.updatedAt = new Date().toISOString();
  // TODO: append resolution._id to current session, apply meter/track changes
  await game.settings.set(MODULE_ID, "campaignState", updated);
}


// ─────────────────────────────────────────────────────────────────────────────
// PUSH-TO-TALK BUTTON
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inject the push-to-talk button into the Foundry chat controls bar.
 *
 * Uses both mouse and touch events — The Forge is accessible on mobile/tablet
 * and the button must be a comfortable hold target, not a small icon.
 *
 * Capture policy: audio is only captured while the button is physically held.
 * On release, recognition ends and the transcription is auto-injected into chat.
 * No audio is captured outside of an active button hold.
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
 * Settings must be registered here so they exist before "ready".
 */
Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initialising`);
  registerSettings();
});

/**
 * "ready" — all modules loaded, game data available.
 */
Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Ready`);
  checkLoremaster();
  registerChatHook();

  if (game.settings.get(MODULE_ID, "speechInputEnabled")) {
    initSpeechInput();
  }

  if (game.user.isGM) {
    ProgressTrackPanel.render(true);
    EntityPanel.render(true);
  }
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
