/**
 * STARFORGED COMPANION
 * src/audio/index.js — narrator-card audio orchestrator
 *
 * Wired from the `renderChatMessage` hook in src/index.js. Decides
 * whether audio applies to a given card, segments the prose, kicks off
 * generation (cache-first), and binds the play control.
 *
 * Generation happens lazily on play-button click by default. With
 * `audio.autoplay` set and the user-gesture gate satisfied, generation
 * starts as soon as the card renders.
 *
 * Multi-client cache writes: each client generates locally on demand
 * and emits a socket message to the canonical GM, which then writes
 * the MP3 to `worlds/${worldId}/audio/`. After the first generation,
 * subsequent clients hit the cache. See AUDIO_SOCKET_NAME below.
 */

import { splitSegments, stripMarkup, SEGMENT_VOICE } from "./segments.js";
import {
  cacheKey,
  lookup as cacheLookup,
  write  as cacheWrite,
  evictIfOverflow,
} from "./cache.js";
import { synthesise } from "./elevenlabs.js";
import {
  PlaybackSession,
  PLAYBACK_STATE,
  markGestureReceived,
  userGestureReceived,
  stopActivePlayback,
} from "./playback.js";
import { isCanonicalGM } from "../multiplayer/gmGate.js";

const MODULE_ID = "starforged-companion";
export const AUDIO_SOCKET_NAME = `module.${MODULE_ID}`;

const _sessionsByCardId = new WeakMap();
let _gestureOverlayShown = false;

// Cards we have already auto-played, by message id. A narrator card re-renders
// on every update (e.g. clicking its "Roll <move>" button updates the message),
// and onNarratorCardRendered runs each time — without this guard, autoplay
// would re-fire on every re-render and replay the audio (F14). Click-to-play is
// unaffected; this only gates the automatic path.
const _autoplayedCardIds = new Set();

/** Test-only — clears the autoplay-once guard between cases. */
export function _resetAutoplayGuardForTests() { _autoplayedCardIds.clear(); }

/**
 * Should this card auto-play right now? True at most once per card id — the
 * first call for a given id claims it and returns true; subsequent calls (card
 * re-renders, e.g. after its "Roll <move>" button updates the message) return
 * false so autoplay never replays the audio (F14). Mutates the guard set.
 *
 * @param {string} cardId  message.id
 * @returns {boolean}
 */
export function claimAutoplayOnce(cardId) {
  if (cardId == null) return false;
  if (_autoplayedCardIds.has(cardId)) return false;
  _autoplayedCardIds.add(cardId);
  return true;
}

// ---------------------------------------------------------------------------
// Setting accessors
// ---------------------------------------------------------------------------

function getSetting(key, fallback) {
  try {
    const v = game.settings.get(MODULE_ID, key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function audioEnabledForThisClient() {
  if (getSetting("audio.enabled", false) !== true) return false;
  if (getSetting("audio.clientEnabled", false) !== true) return false;
  const key = getSetting("elevenLabsApiKey", "");
  return typeof key === "string" && key.trim().length > 0;
}

function getVoiceConfig() {
  return {
    narratorVoiceId: getSetting("audio.narratorVoiceId", ""),
    npcVoiceId:      getSetting("audio.npcVoiceId", ""),
    modelId:         getSetting("audio.modelId", "eleven_flash_v2_5"),
    speed:           Number(getSetting("audio.speed", 1.0)) || 1.0,
  };
}

// ---------------------------------------------------------------------------
// Cache + generate pipeline
// ---------------------------------------------------------------------------

/**
 * Build the playback segments for a chat card: split prose, resolve
 * cache hits, generate misses, return `{ src, voice, text }` entries
 * in prose order.
 */
async function buildPlayableSegments(prose) {
  const voices = getVoiceConfig();
  const parts  = splitSegments(prose);
  const out    = [];
  for (const p of parts) {
    const voiceId = p.voice === SEGMENT_VOICE.NPC
      ? voices.npcVoiceId
      : voices.narratorVoiceId;
    if (!voiceId) {
      throw new Error(`audio: ${p.voice} voice ID is not configured`);
    }
    const hash = await cacheKey({
      text:    p.text,
      voiceId,
      modelId: voices.modelId,
      speed:   voices.speed,
    });
    let src = await cacheLookup(hash);
    if (!src) {
      const bytes = await synthesise({
        apiKey:  getSetting("elevenLabsApiKey", ""),
        voiceId,
        modelId: voices.modelId,
        text:    p.text,
        speed:   voices.speed,
        stream:  false,
      });
      src = await commitToCache(hash, bytes);
    }
    out.push({ voice: p.voice, src, text: p.text });
  }
  return out;
}

/**
 * Commit synthesized bytes to the cache. On the canonical GM client we
 * write directly; on other clients we serialize and emit to the GM via
 * Foundry's socket layer, then resolve to the blob URL of the in-memory
 * bytes so playback can begin without waiting for the GM-side write.
 */
async function commitToCache(hash, bytes) {
  if (isCanonicalGM()) {
    try {
      const path = await cacheWrite(hash, bytes);
      const cap  = Number(getSetting("audio.cacheMaxBytes", 200 * 1024 * 1024)) || 0;
      if (cap > 0) {
        evictIfOverflow(cap).catch(err =>
          console.warn(`${MODULE_ID} | audio cache eviction sweep failed:`, err),
        );
      }
      return path;
    } catch (err) {
      console.warn(`${MODULE_ID} | audio cache write (GM-direct) failed:`, err);
    }
  } else {
    // Non-GM client: kick a fire-and-forget GM relay. Playback uses the
    // local blob URL in the meantime.
    try {
      const b64 = await bytesToBase64(bytes);
      game.socket?.emit?.(AUDIO_SOCKET_NAME, {
        kind: "audio.cache.write",
        hash,
        mime: "audio/mpeg",
        b64,
      });
    } catch (err) {
      console.warn(`${MODULE_ID} | audio cache GM relay emit failed:`, err);
    }
  }
  // Fall back to an in-memory blob URL.
  const blob = bytes instanceof Blob
    ? bytes
    : new Blob([bytes instanceof ArrayBuffer ? bytes : bytes.buffer], { type: "audio/mpeg" });
  return URL.createObjectURL(blob);
}

async function bytesToBase64(bytes) {
  const blob = bytes instanceof Blob
    ? bytes
    : new Blob([bytes instanceof ArrayBuffer ? bytes : bytes.buffer], { type: "audio/mpeg" });
  const ab = await blob.arrayBuffer();
  let binary = "";
  const view = new Uint8Array(ab);
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const view = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return view;
}

// ---------------------------------------------------------------------------
// Socket handlers
// ---------------------------------------------------------------------------

/**
 * Register socket listeners. Called once on `ready` from src/index.js.
 */
export function registerAudioSocket() {
  if (!globalThis.game?.socket?.on) return;
  game.socket.on(AUDIO_SOCKET_NAME, async (payload) => {
    if (!payload || typeof payload !== "object") return;
    if (payload.kind !== "audio.cache.write") return;
    if (!isCanonicalGM()) return;
    try {
      const bytes = base64ToBytes(payload.b64 ?? "");
      await cacheWrite(payload.hash, bytes);
      const cap = Number(getSetting("audio.cacheMaxBytes", 200 * 1024 * 1024)) || 0;
      if (cap > 0) {
        evictIfOverflow(cap).catch(err =>
          console.warn(`${MODULE_ID} | audio cache eviction (GM-relay) failed:`, err),
        );
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | audio cache GM-relay write failed:`, err);
    }
  });
}

// ---------------------------------------------------------------------------
// Chat-card binding
// ---------------------------------------------------------------------------

/**
 * Called from the renderChatMessage hook for every narrator card.
 * Decides whether to surface the play button, attaches the click
 * handler, and applies the stripped prose to the card's prose element.
 */
export async function onNarratorCardRendered(message, root) {
  if (!audioEnabledForThisClient()) return;
  if (!(root instanceof HTMLElement)) return;

  const playBtn = root.querySelector('[data-action="audioPlayToggle"]');
  if (!playBtn) return;

  // Strip <npc>…</npc> from displayed prose. The original card HTML may
  // include the markup (postNarrationCard renders the raw prose); we
  // replace it once at render time.
  const proseEl = root.querySelector(".sf-narration-prose");
  const rawProse = message.flags?.[MODULE_ID]?.narrationText ?? proseEl?.textContent ?? "";
  if (proseEl) {
    const cleaned = stripMarkup(rawProse);
    // textContent — preserves whitespace, no HTML injection.
    proseEl.textContent = cleaned;
  }

  // Unhide the button now that we know audio applies on this client.
  playBtn.removeAttribute("hidden");

  // Clone-replace to drop any listener attached on a prior render.
  const fresh = playBtn.cloneNode(true);
  playBtn.replaceWith(fresh);
  setButtonLabel(fresh, "idle");

  fresh.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    markGestureReceived();
    await togglePlayback(message, fresh, rawProse);
  });

  // Stop button — halts whatever is currently playing (the single active
  // session, which may belong to a different card in a burst) and resets
  // this card's play button to idle. Lets the GM cut off a narration that
  // runs excessively long. Unhidden alongside Play; clone-replaced to drop
  // any stale listener from a prior render.
  const stopBtn = root.querySelector('[data-action="audioStop"]');
  if (stopBtn) {
    stopBtn.removeAttribute("hidden");
    const freshStop = stopBtn.cloneNode(true);
    stopBtn.replaceWith(freshStop);
    freshStop.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await stopActivePlayback();
      setButtonLabel(fresh, "idle");
    });
  }

  // Optional auto-play — once per card. A re-render (e.g. after the card's
  // "Roll <move>" button updates the message) must not replay the audio (F14).
  if (getSetting("audio.autoplay", false) === true && claimAutoplayOnce(message.id)) {
    if (!userGestureReceived()) {
      showGestureOverlay(root, async () => {
        await togglePlayback(message, fresh, rawProse);
      });
    } else {
      togglePlayback(message, fresh, rawProse).catch(err =>
        console.warn(`${MODULE_ID} | audio autoplay failed:`, err),
      );
    }
  }
}

async function togglePlayback(message, btn, rawProse) {
  let session = _sessionsByCardId.get(message);
  if (session && session.state === PLAYBACK_STATE.PLAYING) {
    await session.pause();
    setButtonLabel(btn, "paused");
    return;
  }
  if (session && session.state === PLAYBACK_STATE.PAUSED) {
    await session.play();
    setButtonLabel(btn, "playing");
    return;
  }

  setButtonLabel(btn, "loading");
  try {
    const segments = await buildPlayableSegments(rawProse);
    if (segments.length === 0) {
      setButtonLabel(btn, "idle");
      return;
    }
    const volume = Number(getSetting("audio.volume", 0.8)) || 0.8;
    session = new PlaybackSession({
      cardId:   message.id,
      segments,
      volume,
      onStateChange: (s) => setButtonLabel(btn, btnLabelFromState(s)),
    });
    _sessionsByCardId.set(message, session);
    await session.play();
  } catch (err) {
    console.warn(`${MODULE_ID} | audio toggle failed:`, err);
    setButtonLabel(btn, "error");
    btn.setAttribute("disabled", "true");
    btn.setAttribute("title", typeof err?.message === "string" ? err.message : "Audio unavailable");
  }
}

function btnLabelFromState(state) {
  switch (state) {
    case PLAYBACK_STATE.LOADING: return "loading";
    case PLAYBACK_STATE.PLAYING: return "playing";
    case PLAYBACK_STATE.PAUSED:  return "paused";
    case PLAYBACK_STATE.ERROR:   return "error";
    case PLAYBACK_STATE.STOPPED:
    case PLAYBACK_STATE.IDLE:
    default:                     return "idle";
  }
}

function setButtonLabel(btn, label) {
  if (!btn) return;
  btn.setAttribute("data-state", label);
  switch (label) {
    case "loading":
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading…';
      btn.setAttribute("disabled", "true");
      break;
    case "playing":
      btn.innerHTML = '<i class="fas fa-pause"></i> Pause';
      btn.removeAttribute("disabled");
      break;
    case "paused":
      btn.innerHTML = '<i class="fas fa-play"></i> Resume';
      btn.removeAttribute("disabled");
      break;
    case "error":
      btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Unavailable';
      btn.setAttribute("disabled", "true");
      break;
    case "idle":
    default:
      btn.innerHTML = '<i class="fas fa-play"></i> Play';
      btn.removeAttribute("disabled");
      break;
  }
}

function showGestureOverlay(root, onGesture) {
  if (_gestureOverlayShown) return;
  _gestureOverlayShown = true;
  const overlay = document.createElement("div");
  overlay.className = "sf-audio-gesture-overlay";
  overlay.textContent = "Click anywhere to enable audio playback";
  const cleanup = () => {
    overlay.remove();
    document.removeEventListener("click", handler, true);
    markGestureReceived();
    onGesture?.();
  };
  const handler = () => cleanup();
  document.addEventListener("click", handler, true);
  // Place on the card root so it's positioned above the card.
  root.style.position = root.style.position || "relative";
  root.appendChild(overlay);
}
