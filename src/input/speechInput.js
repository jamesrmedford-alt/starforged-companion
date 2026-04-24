/**
 * STARFORGED COMPANION
 * src/input/speechInput.js — Push-to-talk via Web Speech API
 *
 * Responsibilities:
 * - Initialise the Web Speech API recognition instance
 * - Expose start() and stop() for the push-to-talk button in index.js
 * - Auto-inject transcription into the Foundry chat input on recognition end
 * - Degrade gracefully on unsupported browsers (Firefox, Safari)
 * - Provide visual feedback states on the PTT button
 *
 * Capture policy:
 *   Audio is captured ONLY while the button is physically held.
 *   mousedown / touchstart → start()
 *   mouseup / touchend / mouseleave → stop()
 *   No audio is captured outside an active button hold.
 *
 * Auto-inject:
 *   On recognition end, transcription is written directly into the Foundry
 *   chat textarea and submitted. The chat input remains available as a
 *   fallback — if the transcription is wrong, the player can retype.
 *
 * Browser support:
 *   Chrome / Edge (Chromium): full support
 *   Firefox: SpeechRecognition not available — graceful no-op
 *   Safari: partial / behind flag — treated as unsupported
 *
 * The initialised instance is stored on window._sfSpeechInput so
 * index.js can call start() and stop() from the PTT button handlers
 * without importing this module directly into the hook scope.
 */

const MODULE_ID = "starforged-companion";

// Button state CSS classes
const CLASS_LISTENING  = "sf-ptt-listening";
const CLASS_PROCESSING = "sf-ptt-processing";
const CLASS_ERROR      = "sf-ptt-error";


// ─────────────────────────────────────────────────────────────────────────────
// INITIALISATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialise the speech input system.
 * Called from index.js on the "ready" hook when speechInputEnabled is true,
 * and again via onChange when the setting is toggled on mid-session.
 *
 * Stores the controller on window._sfSpeechInput for PTT button access.
 * Safe to call multiple times — reinitialises cleanly if already set up.
 */
export function initSpeechInput() {
  // Check browser support before doing anything
  if (!isSpeechSupported()) {
    console.warn(`${MODULE_ID} | Web Speech API not available in this browser. Push-to-talk requires Chrome or Edge.`);

    // Warn the user once — they may not know why the button doesn't work
    if (typeof ui !== "undefined") {
      ui.notifications?.warn(
        "Starforged Companion: Push-to-talk requires a Chromium-based browser (Chrome or Edge). " +
        "Speech input is not available in Firefox or Safari.",
        { permanent: false }
      );
    }

    // Install a no-op so button handlers don't throw
    window._sfSpeechInput = createNoOpController();
    return;
  }

  const language = readLanguageSetting();
  const controller = createSpeechController(language);

  window._sfSpeechInput = controller;
  console.log(`${MODULE_ID} | Speech input initialised. Language: ${language}`);
}


// ─────────────────────────────────────────────────────────────────────────────
// SPEECH CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create and return a speech controller object.
 * Wraps a SpeechRecognition instance with start/stop lifecycle management.
 *
 * @param {string} language — BCP 47 language tag, e.g. "en-US"
 * @returns {{ start: Function, stop: Function, destroy: Function }}
 */
function createSpeechController(language) {
  // SpeechRecognition is vendor-prefixed in some Chromium builds
  const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  // Configuration
  recognition.lang          = language;
  recognition.continuous    = false;   // Stop after first result — PTT is a single utterance
  recognition.interimResults = false;  // Final results only — no live partial text
  recognition.maxAlternatives = 1;

  let isActive = false;

  // ── Event handlers ─────────────────────────────────────────────────────────

  recognition.onstart = () => {
    isActive = true;
    setButtonState(CLASS_LISTENING);
    console.log(`${MODULE_ID} | Speech recognition started`);
  };

  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (!transcript) return;

    console.log(`${MODULE_ID} | Transcription: "${transcript}"`);
    injectTranscription(transcript);
  };

  recognition.onend = () => {
    isActive = false;
    setButtonState(null);   // Clear all state classes
    console.log(`${MODULE_ID} | Speech recognition ended`);
  };

  recognition.onerror = (event) => {
    isActive = false;
    console.warn(`${MODULE_ID} | Speech recognition error: ${event.error}`);

    // Distinguish between user-caused and system errors
    if (event.error === "no-speech") {
      // Silent hold — not an error from the user's perspective, just clear state
      setButtonState(null);
    } else if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      setButtonState(CLASS_ERROR);
      notifyMicrophoneBlocked();
    } else {
      setButtonState(CLASS_ERROR);
      // Clear error state after a short delay so it doesn't stick
      setTimeout(() => setButtonState(null), 2000);
    }
  };

  // ── Controller API ─────────────────────────────────────────────────────────

  return {
    /**
     * Start capturing audio.
     * Called on mousedown / touchstart on the PTT button.
     * Safe to call when already active — browser ignores duplicate starts.
     */
    start() {
      if (isActive) return;
      try {
        setButtonState(CLASS_LISTENING);
        recognition.start();
      } catch (err) {
        // InvalidStateError thrown if recognition is already running
        // This can happen with very fast button taps — ignore silently
        console.warn(`${MODULE_ID} | recognition.start() called in invalid state:`, err.message);
      }
    },

    /**
     * Stop capturing audio and trigger transcription.
     * Called on mouseup / touchend / mouseleave on the PTT button.
     * Transitions button to "processing" state while the API finalises.
     */
    stop() {
      if (!isActive) return;
      try {
        setButtonState(CLASS_PROCESSING);
        recognition.stop();
        // onresult fires before onend — transcription happens there
        // onend then clears the button state
      } catch (err) {
        console.warn(`${MODULE_ID} | recognition.stop() called in invalid state:`, err.message);
        setButtonState(null);
      }
    },

    /**
     * Clean up the recognition instance.
     * Called if the module is disabled mid-session.
     */
    destroy() {
      try {
        recognition.abort();
      } catch {
        // Already stopped — ignore
      }
      setButtonState(null);
      window._sfSpeechInput = createNoOpController();
    },
  };
}

/**
 * Create a no-op controller for unsupported browsers.
 * The PTT button handlers call start() and stop() unconditionally —
 * this prevents them from throwing when speech is not supported.
 */
function createNoOpController() {
  return {
    start:   () => {},
    stop:    () => {},
    destroy: () => {},
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// TRANSCRIPTION INJECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inject the transcribed text into the Foundry chat input and submit it.
 *
 * Auto-inject on recognition end — no review step. The player speaks,
 * the text appears in chat and submits. If it's wrong, they retype.
 * Frictionless experience takes priority over error prevention.
 *
 * Foundry's chat textarea is #chat-message. Submission is handled by
 * dispatching an Enter keydown event — the same path as manual typing.
 */
function injectTranscription(transcript) {
  try {
    const chatInput = document.querySelector("#chat-message");
    if (!chatInput) {
      console.warn(`${MODULE_ID} | Chat input not found — cannot inject transcription.`);
      return;
    }

    // Set value and dispatch input event so Foundry's reactive listeners fire
    chatInput.value = transcript;
    chatInput.dispatchEvent(new Event("input", { bubbles: true }));

    // Submit by dispatching Enter keydown
    // Foundry listens for this to send the chat message
    chatInput.dispatchEvent(new KeyboardEvent("keydown", {
      key:      "Enter",
      code:     "Enter",
      keyCode:  13,
      which:    13,
      bubbles:  true,
    }));

    console.log(`${MODULE_ID} | Transcription injected and submitted: "${transcript}"`);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to inject transcription:`, err);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// BUTTON STATE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set the visual state of the PTT button.
 * Clears all state classes then applies the new one.
 *
 * States:
 *   sf-ptt-listening  — mic is active, capturing audio (button held)
 *   sf-ptt-processing — button released, waiting for final result
 *   sf-ptt-error      — something went wrong (mic blocked, etc.)
 *   null              — idle state, no class applied
 *
 * @param {string|null} stateClass
 */
function setButtonState(stateClass) {
  const button = document.querySelector("#sf-ptt-button");
  if (!button) return;

  button.classList.remove(CLASS_LISTENING, CLASS_PROCESSING, CLASS_ERROR);
  if (stateClass) {
    button.classList.add(stateClass);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether the Web Speech API is available.
 * Returns false in Firefox, Safari (without flag), and non-browser contexts.
 */
function isSpeechSupported() {
  return typeof window !== "undefined" &&
    (typeof window.SpeechRecognition !== "undefined" ||
     typeof window.webkitSpeechRecognition !== "undefined");
}

/**
 * Read the speech language setting from Foundry module settings.
 * Falls back to "en-US" if settings are not available (test context).
 */
function readLanguageSetting() {
  try {
    return game.settings.get(MODULE_ID, "speechLanguage") ?? "en-US";
  } catch {
    return "en-US";
  }
}

/**
 * Notify the user that microphone access has been blocked.
 * Shown once — the user needs to grant permission in browser settings.
 */
function notifyMicrophoneBlocked() {
  console.error(`${MODULE_ID} | Microphone access denied.`);
  if (typeof ui !== "undefined") {
    ui.notifications?.error(
      "Starforged Companion: Microphone access was denied. " +
      "To use push-to-talk, allow microphone access for this site in your browser settings.",
      { permanent: true }
    );
  }
}
