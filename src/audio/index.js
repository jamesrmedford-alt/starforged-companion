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

// Keyless playback: a client without an ElevenLabs key asks the canonical GM to
// synthesise + cache an uncached clip, then plays the resulting file. Each
// request is awaited per content-hash (multiple waiters allowed) with a
// timeout; the GM signals completion over the socket.
const SYNTH_REQUEST_TIMEOUT_MS = 30_000;
const _pendingSynth  = new Map();   // hash -> Set<resolve>
const _synthInFlight = new Set();   // hashes the GM is currently synthesising

/** Test-only — clear the keyless-synthesis wait/in-flight state. */
export function _resetSynthStateForTests() { _pendingSynth.clear(); _synthInFlight.clear(); }

// Cards we have already auto-played, by message id. Persisted to localStorage
// so a player reconnecting mid-session doesn't hear every card replayed from
// the beginning — the in-memory Set was wiped on page reload, making every
// card look unplayed to onNarratorCardRendered (F14 / autoplay-on-reconnect).
// Click-to-play is unaffected; this only gates the automatic path.
let _autoplayedCardIds = null;   // lazy — initialised on first use

function _loadAutoplayedIds() {
  try {
    const worldId = globalThis.game?.world?.id ?? "unknown";
    const raw = globalThis.localStorage?.getItem(`${MODULE_ID}:${worldId}:autoplayedCards`);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (err) {
    console.warn(`${MODULE_ID} | audio: failed to load autoplay state from localStorage:`, err?.message ?? err);
    return new Set();
  }
}

function _saveAutoplayedIds(ids) {
  try {
    const worldId = globalThis.game?.world?.id ?? "unknown";
    globalThis.localStorage?.setItem(
      `${MODULE_ID}:${worldId}:autoplayedCards`,
      JSON.stringify([...ids]),
    );
  } catch (err) {
    console.warn(`${MODULE_ID} | audio: failed to persist autoplay state to localStorage:`, err?.message ?? err);
  }
}

/** Test-only — resets the autoplay guard so the next call re-reads storage. */
export function _resetAutoplayGuardForTests() { _autoplayedCardIds = null; }

/**
 * Should this card auto-play right now? Returns true at most once per card id
 * across page reloads — the first call claims it and returns true; subsequent
 * calls (re-renders or reconnects) return false (F14). Persists to localStorage.
 *
 * @param {string} cardId  message.id
 * @returns {boolean}
 */
export function claimAutoplayOnce(cardId) {
  if (cardId == null) return false;
  if (_autoplayedCardIds === null) _autoplayedCardIds = _loadAutoplayedIds();
  if (_autoplayedCardIds.has(cardId)) return false;
  _autoplayedCardIds.add(cardId);
  _saveAutoplayedIds(_autoplayedCardIds);
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
  // No ElevenLabs key required here: PLAYING audio (a cached MP3) needs no key.
  // A key is only needed to SYNTHESISE an uncached clip; a keyless client asks
  // the GM to generate it (see requestGmSynthesis). This lets players hear
  // narrator audio without ever configuring their own key.
  return true;
}

/** True when this client holds an ElevenLabs key (can synthesise locally). */
function hasElevenLabsKey() {
  const key = getSetting("elevenLabsApiKey", "");
  return typeof key === "string" && key.trim().length > 0;
}

function getVoiceConfig() {
  return {
    narratorVoiceId: getSetting("audio.narratorVoiceId", ""),
    npcVoiceId:      getSetting("audio.npcVoiceId", ""),
    npcVoiceByKey:   {
      feminine:  getSetting("audio.npcVoiceFeminine",  ""),
      masculine: getSetting("audio.npcVoiceMasculine", ""),
      neutral:   getSetting("audio.npcVoiceNeutral",   ""),
    },
    modelId:         getSetting("audio.modelId", "eleven_flash_v2_5"),
    speed:           Number(getSetting("audio.speed", 1.0)) || 1.0,
  };
}

/**
 * Map a pronoun set to a voice key (v1.7.11 finding F). Mirrors the
 * portrait-descriptor mapping in connection.js so art and audio agree.
 * @param {string} pronouns
 * @returns {"feminine"|"masculine"|"neutral"}
 */
export function pronounsToVoiceKey(pronouns) {
  const p = String(pronouns ?? "").toLowerCase();
  if (p.startsWith("she")) return "feminine";
  if (p.startsWith("he"))  return "masculine";
  return "neutral";
}

/**
 * Resolve the NPC voice for a card from its focal connection's pronouns
 * (v1.7.11 finding F). A narrator card stamps `matchedEntityIds`; when those
 * resolve to connection records sharing one gender, the matching pronoun-keyed
 * voice is used. Mixed genders, no matched NPC, or an unset pronoun voice all
 * fall back to the single `npcVoiceId` — so this is strictly an improvement
 * over the prior one-voice-for-every-NPC behaviour, never a regression.
 *
 * @param {ChatMessage} message
 * @param {ReturnType<typeof getVoiceConfig>} voices
 * @returns {Promise<string>} the resolved NPC voice id
 */
export async function resolveNpcVoiceForCard(message, voices) {
  const fallback = voices.npcVoiceId;
  try {
    const ids = message?.flags?.[MODULE_ID]?.matchedEntityIds;
    if (!Array.isArray(ids) || !ids.length) return fallback;

    const { getConnection } = await import("../entities/connection.js");
    const keys = new Set();
    for (const id of ids) {
      const rec = getConnection(id);            // null for non-connection ids
      if (rec?.pronouns) keys.add(pronounsToVoiceKey(rec.pronouns));
    }
    if (keys.size !== 1) return fallback;        // none, or ambiguous → fallback

    const [key] = [...keys];
    return voices.npcVoiceByKey?.[key] || fallback;
  } catch (err) {
    console.debug?.(`${MODULE_ID} | resolveNpcVoiceForCard failed:`, err?.message ?? err);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Cache + generate pipeline
// ---------------------------------------------------------------------------

/**
 * Build the playback segments for a chat card: split prose, resolve
 * cache hits, generate misses, return `{ src, voice, text }` entries
 * in prose order.
 */
async function buildPlayableSegments(prose, { npcVoiceId } = {}) {
  const voices = getVoiceConfig();
  const npcVoice = npcVoiceId || voices.npcVoiceId;   // caller may override per focal NPC (finding F)
  const parts  = splitSegments(prose);
  const out    = [];
  for (const p of parts) {
    const voiceId = p.voice === SEGMENT_VOICE.NPC
      ? npcVoice
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
      if (hasElevenLabsKey()) {
        const bytes = await synthesise({
          apiKey:  getSetting("elevenLabsApiKey", ""),
          voiceId,
          modelId: voices.modelId,
          text:    p.text,
          speed:   voices.speed,
          stream:  false,
        });
        src = await commitToCache(hash, bytes);
      } else {
        // No key on this client — ask the GM to synthesise + cache it, then
        // play the resulting file. Players never need their own key.
        src = await requestGmSynthesis(hash, {
          voiceId,
          modelId: voices.modelId,
          text:    p.text,
          speed:   voices.speed,
        });
        if (!src) {
          throw new Error("Narrator audio isn't ready yet — ask the GM to play this card once, then try again.");
        }
      }
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
    switch (payload.kind) {
      case "audio.cache.write":   return handleCacheWrite(payload);
      case "audio.synth.request": return handleSynthRequest(payload);
      case "audio.synth.done":    return resolvePendingSynth(payload.hash);
      default: return;
    }
  });
}

// GM-side: a keyed client synthesised a clip and relayed the bytes for caching.
async function handleCacheWrite(payload) {
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
}

// GM-side: a keyless client asked us to synthesise + cache a clip it can't make
// itself. Dedupe against the cache and the in-flight set, then signal done so
// the requester (and any other waiters) can play the cached file.
async function handleSynthRequest(payload) {
  if (!isCanonicalGM()) return;
  const hash = typeof payload.hash === "string" ? payload.hash : "";
  const spec = payload.spec;
  if (!hash) return;
  const signalDone = () => game.socket?.emit?.(AUDIO_SOCKET_NAME, { kind: "audio.synth.done", hash });
  try {
    if (await cacheLookup(hash)) { signalDone(); return; }   // already cached
    if (_synthInFlight.has(hash)) return;                     // a prior request is making it; its done covers us
    _synthInFlight.add(hash);
    try {
      const apiKey = getSetting("elevenLabsApiKey", "");
      if (apiKey && String(apiKey).trim() && spec) {
        const bytes = await synthesise({
          apiKey,
          voiceId: spec.voiceId,
          modelId: spec.modelId,
          text:    spec.text,
          speed:   spec.speed,
          stream:  false,
        });
        await cacheWrite(hash, bytes);
        const cap = Number(getSetting("audio.cacheMaxBytes", 200 * 1024 * 1024)) || 0;
        if (cap > 0) {
          evictIfOverflow(cap).catch(err =>
            console.warn(`${MODULE_ID} | audio cache eviction (keyless synth) failed:`, err),
          );
        }
      }
    } finally {
      _synthInFlight.delete(hash);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | audio GM-synthesis (keyless request) failed:`, err);
  }
  signalDone();   // success, already-cached, or failure — always unblock waiters
}

// Requester side: resolve everyone waiting on this hash.
function resolvePendingSynth(hash) {
  const set = _pendingSynth.get(hash);
  if (!set) return;
  _pendingSynth.delete(hash);
  for (const resolve of set) resolve();
}

// Keyless client: ask the canonical GM to synthesise + cache `hash`, wait for
// the done signal (or time out), then return the now-cached path (or null).
async function requestGmSynthesis(hash, spec) {
  const ready = new Promise((resolve) => {
    let set = _pendingSynth.get(hash);
    if (!set) { set = new Set(); _pendingSynth.set(hash, set); }
    set.add(resolve);
    setTimeout(() => { set.delete(resolve); resolve(); }, SYNTH_REQUEST_TIMEOUT_MS);
  });
  game.socket?.emit?.(AUDIO_SOCKET_NAME, { kind: "audio.synth.request", hash, spec });
  await ready;
  return await cacheLookup(hash);
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
    // userInitiated: a deliberate Play click should surface failures (finding
    // H — players got silence with no diagnostic); autoplay stays quiet.
    await togglePlayback(message, fresh, rawProse, true);
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

async function togglePlayback(message, btn, rawProse, userInitiated = false) {
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
    // Pick the NPC voice from the card's focal connection pronouns (finding F).
    const npcVoiceId = await resolveNpcVoiceForCard(message, getVoiceConfig());
    const segments = await buildPlayableSegments(rawProse, { npcVoiceId });
    if (segments.length === 0) {
      // No synthesisable text. Previously a silent no-op — a player clicking
      // Play saw nothing happen with no explanation (finding H). Tell them.
      console.warn(`${MODULE_ID} | audio: no playable segments for card ${message?.id}`);
      setButtonLabel(btn, "idle");
      if (userInitiated) {
        notifyAudioFailure("This narration has no readable text to play.");
      }
      return;
    }
    const volume = Number(getSetting("audio.volume", 0.8)) || 0.8;
    session = new PlaybackSession({
      cardId:   message.id,
      segments,
      volume,
      onStateChange: (s) => setButtonLabel(btn, btnLabelFromState(s)),
      // Playback errors (Sound.load / Sound.play failures) don't propagate
      // to togglePlayback's outer catch — they're caught by PlaybackSession
      // internally. Surface them here with the same console.error + toast.
      onError: (err) => {
        const detail = typeof err?.message === "string" && err.message
          ? err.message
          : "Audio unavailable";
        console.error(`${MODULE_ID} | narrator audio playback failed (card ${message?.id}):`, err);
        if (userInitiated) {
          notifyAudioFailure(`Narrator audio unavailable: ${detail}`);
        }
      },
    });
    _sessionsByCardId.set(message, session);
    await session.play();
  } catch (err) {
    // Synthesis / segmentation failures (buildPlayableSegments throws).
    console.error(`${MODULE_ID} | audio toggle failed:`, err);
    setButtonLabel(btn, "error");
    btn.setAttribute("disabled", "true");
    const detail = typeof err?.message === "string" && err.message ? err.message : "Audio unavailable";
    btn.setAttribute("title", detail);
    // Surface the real reason on a deliberate click (finding H): the button
    // alone flipping to a disabled "Unavailable" left players guessing whether
    // it was a bad key, a missing voice id, or a synth failure.
    if (userInitiated) {
      notifyAudioFailure(`Narrator audio unavailable: ${detail}`);
    }
  }
}

/**
 * Surface an audio failure to the user. Best-effort — `ui` is absent in
 * tests/headless, so guard the whole chain.
 */
function notifyAudioFailure(message) {
  try {
    globalThis.ui?.notifications?.warn?.(`Starforged Companion: ${message}`);
  } catch (err) {
    console.warn(`${MODULE_ID} | audio: notification surface failed:`, err?.message ?? err);
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
