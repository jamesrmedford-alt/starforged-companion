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
 * and emits a socket message to the audio GM, which then writes
 * the MP3 to `worlds/${worldId}/audio/` — when it holds no ElevenLabs
 * key itself; a keyed GM makes and caches its own clips (issue #338 D10).
 * The audio GM (gmGate.isAudioGM) is the lowest-id active GM holding an
 * ElevenLabs key, else the canonical GM: the canonical GM is chosen by the
 * Claude key, and a keyless one answered every keyless player's Play with
 * "no clip" while a keyed co-GM stood down (issue #342 Z67).
 * After the first generation, subsequent clients hit the cache. See
 * AUDIO_SOCKET_NAME below.
 */

import { splitSegments, proseToHtml, SEGMENT_VOICE } from "./segments.js";
import {
  cacheKey,
  isCachePathFor,
  lookup         as cacheLookup,
  lookupDetailed as cacheLookupDetailed,
  write          as cacheWrite,
} from "./cache.js";
import { synthesise } from "./elevenlabs.js";
import {
  PlaybackSession,
  PLAYBACK_STATE,
  markGestureReceived,
  userGestureReceived,
  stopActivePlayback,
} from "./playback.js";
import { isAudioGM, hasKeyedActiveGM, hasAudioKeyedActiveGM } from "../multiplayer/gmGate.js";

const MODULE_ID = "starforged-companion";
export const AUDIO_SOCKET_NAME = `module.${MODULE_ID}`;

const _sessionsByCardId = new WeakMap();

// A card's load generation: each Play takes it, its Stop bumps it, and a load
// that finishes under an older one never plays. Stop pressed while a card was
// still Loading (the synthesis, before any session existed) was undone when
// the load finished — the narration started after Stop (issue #322 V14).
const _loadGenerationByCard = new WeakMap();
const cardLoadGeneration = (message) => _loadGenerationByCard.get(message) ?? 0;
const cancelCardLoad     = (message) => _loadGenerationByCard.set(message, cardLoadGeneration(message) + 1);
let _gestureOverlayShown = false;

// Keyless playback: a client without an ElevenLabs key asks the audio GM to
// synthesise + cache an uncached clip, then plays the resulting file. Each
// request is awaited per content-hash (multiple waiters allowed) with a
// timeout; the GM signals completion over the socket with the file's path.
const SYNTH_REQUEST_TIMEOUT_MS = 30_000;
const _pendingSynth  = new Map();   // hash -> Set<resolve>
// Canonical GM: hash -> the one synthesis + cache write of that clip, awaited by
// this client's own playback and by every keyless player's request for it
// (synthesiseToCacheOnce).
const _synthInFlight = new Map();
// …and hash -> its bytes, once synthesised: the audio GM's own playback plays
// them while the upload goes on (synthesisedBytesOnce — issue #348 PT12).
const _synthBytesInFlight = new Map();

// A keyed Player who may not browse the cache asks the audio GM whether a
// clip is already there (`audio.cache.ask` → `audio.cache.found`) before
// synthesising it on their own key (issue #326 W79). Lookup only: the GM never
// synthesises for an ask, and its answer resolves only these waiters — never a
// keyless player's synthesis wait.
const CACHE_ASK_TIMEOUT_MS = 4_000;
const _pendingCacheAsk = new Map();   // hash -> Set<resolve>

// Audio GM: hash -> the bytes of a clip it made whose cache upload failed —
// the world's storage refused it (The Forge's Assets Library full). The next
// Play or keyless request for the clip retries the upload with these bytes;
// it used to synthesise — and ElevenLabs bill — the clip again every time
// (issue #345 AA61). Newest kept, at most UNSAVED_CLIP_CAP (a clip is at most
// a few hundred KB), for as long as the page is open; the GM is told once
// (`_toldUnsavedClip`).
const UNSAVED_CLIP_CAP = 32;
const _unsavedClips = new Map();
let _toldUnsavedClip = false;

// What a keyless player is told when the GM made their clip but the world's
// storage refused it (`audio.synth.done` with `unsaved`): the GM playing the
// card again does not help — the storage has to accept the upload.
const UNSAVED_CLIP_PLAYER_MESSAGE = "Narrator audio couldn't be saved to the world's file storage — it refused the GM's upload. Ask the GM to check the world's storage (on The Forge, the Assets Library's space), then try again.";

/** Test-only — clear the keyless-synthesis wait/in-flight state. */
export function _resetSynthStateForTests() {
  _pendingSynth.clear(); _synthInFlight.clear(); _synthBytesInFlight.clear(); _pendingCacheAsk.clear();
  _unsavedClips.clear(); _toldUnsavedClip = false;
}

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

// This client's start: a narrator card auto-plays only when it was created
// after it. Foundry renders the recent chat log at every page load, so on a
// browser whose played-list (claimAutoplayOnce) lacked those ids — a new
// device, cleared site data, the first load after turning auto-play on —
// every old card claimed auto-play, and the player's first click anywhere
// played an hours-old narration (issue #322 V15). In server time when Foundry
// gives it, since a message's `timestamp` is the server's; a minute's margin
// covers a card posted while this client loaded.
const NEW_CARD_MARGIN_MS = 60 * 1000;
const serverNow = () => {
  const t = Number(globalThis.game?.time?.serverTime);
  return Number.isFinite(t) && t > 0 ? t : Date.now();
};
let _clientStartedAt = serverNow();

/** Called from the module's ready hook: this client's start, in server time. */
export function markAudioClientReady() { _clientStartedAt = serverNow(); }

/** Was this card created since this client started (an old chat-log card is not)? */
function isCardNewHere(message) {
  const ts = Number(message?.timestamp ?? Date.parse(message?.flags?.[MODULE_ID]?.timestamp ?? ""));
  if (!Number.isFinite(ts)) return true;
  return ts >= _clientStartedAt - NEW_CARD_MARGIN_MS;
}

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
 *
 * Only the first segment is resolved before this returns — its failure fails
 * the Play, as every segment's used to. The rest are resolved one after
 * another in the background while it plays: each later entry's `src` is a
 * promise the PlaybackSession awaits when it reaches it. Every segment of the
 * card used to be synthesised — and, on the audio GM, uploaded — one after
 * another before a word was heard, so a long narration sat on "Loading…" for
 * the sum of them (issue #348 PT12). Synthesis still starts only on Play:
 * nothing is made before it. `cancelled()` is asked before each later
 * segment starts: a Play stopped meanwhile synthesises — bills — no more.
 *
 * @param {string} prose
 * @param {{ npcVoiceId?: string, cancelled?: () => boolean }} [opts]
 * @returns {Promise<Array<{ voice: string, text: string, src: string|Promise<string> }>>}
 */
async function buildPlayableSegments(prose, { npcVoiceId, cancelled = () => false } = {}) {
  const voices = getVoiceConfig();
  const npcVoice = npcVoiceId || voices.npcVoiceId;   // caller may override per focal NPC (finding F)
  // Every segment's voice is known before anything is made.
  const specs = splitSegments(prose).map(p => {
    const voiceId = p.voice === SEGMENT_VOICE.NPC ? npcVoice : voices.narratorVoiceId;
    if (!voiceId) throw new Error(`audio: ${p.voice} voice ID is not configured`);
    return { voice: p.voice, text: p.text, voiceId };
  });
  if (!specs.length) return [];

  const out = [{ voice: specs[0].voice, text: specs[0].text, src: await resolveSegmentSrc(specs[0], voices) }];
  let previous = Promise.resolve();
  for (const spec of specs.slice(1)) {
    const src = previous.then(() => {
      if (cancelled()) throw new Error("audio: playback stopped before this segment was made");
      return resolveSegmentSrc(spec, voices);
    });
    // Handled here: the session reports a failure when it reaches the segment,
    // and a segment after a failed one is never made.
    src.catch(() => {});
    previous = src;
    out.push({ voice: spec.voice, text: spec.text, src });
  }
  return out;
}

/**
 * One segment's playable source: the cached clip, else the clip made where an
 * ElevenLabs key lives —
 *   - the audio GM makes it on its key, caches it, and plays its bytes at once
 *     (the upload goes on behind: it used to be waited for before a word was
 *     heard — issue #348 PT12);
 *   - any other client asks the audio GM to make it when a GM holding a key
 *     is connected — a keyed client too: it used to synthesise on its own key
 *     while the audio GM made the same clip on its own, each billed, and the
 *     keyed GM files no relayed bytes (D10), so it was made again at the GM's
 *     next Play (known-issues AUDIO-KEYED-NONCANONICAL-DUP). A keyed client the
 *     GM could not serve still makes it itself;
 *   - with no keyed GM connected, a keyed client makes it on its own key and
 *     relays the bytes to the GM to cache (D11);
 *   - a keyless audio GM fails at once, naming where the key goes (W80).
 *
 * @param {{ voice: string, text: string, voiceId: string }} spec
 * @param {ReturnType<typeof getVoiceConfig>} voices
 * @returns {Promise<string>}
 */
async function resolveSegmentSrc(spec, voices) {
  const synthSpec = { voiceId: spec.voiceId, modelId: voices.modelId, text: spec.text, speed: voices.speed };
  const hash = await cacheKey(synthSpec);
  const found = await cacheLookupDetailed(hash);
  if (found.path) return found.path;

  if (hasElevenLabsKey() && isAudioGM()) {
    // The audio GM writes the cache itself, and shares the synthesis with any
    // player's request for the same clip.
    return blobUrlOf(await synthesisedBytesOnce(hash, synthSpec, getSetting("elevenLabsApiKey", "")));
  }
  if (hasElevenLabsKey() && !hasAudioKeyedActiveGM()) return synthesiseOnOwnKey(hash, synthSpec, found);
  if (isAudioGM()) {
    // A keyless request goes to the audio GM — this client, with no GM
    // holding a key (isAudioGM falls back to the canonical GM). A socket
    // emit never reaches its sender, so the request sat out its 30 s
    // timeout on itself and then told the GM to "ask the GM" (issue #326
    // W80). Fail at once and name where the key goes.
    throw new Error("Narrator audio needs an ElevenLabs API key — add one in Companion Settings → About.");
  }
  // Ask the audio GM to synthesise + cache it, then play the resulting file.
  // Players never need their own key.
  const answer = await requestGmSynthesis(hash, synthSpec);
  if (answer.src) return answer.src;
  // A keyed client the GM could not serve makes the clip itself.
  if (hasElevenLabsKey()) return synthesiseOnOwnKey(hash, synthSpec, found);
  // The GM made the clip and the world's storage refused it: say so — "ask
  // the GM to play it" sent the player round the same refusal (issue #345
  // AA61).
  throw new Error(answer.unsaved
    ? UNSAVED_CLIP_PLAYER_MESSAGE
    : "Narrator audio isn't ready yet — ask the GM to play this card once, then try again.");
}

/**
 * A keyed client that is not the audio GM makes a clip on its own key. A
 * default Player may not browse the cache, so a cached clip read as a miss
 * and every play was synthesised — billed — again on their key, its bytes
 * re-sent for a re-upload (issue #326 W79): it asks the audio GM for the
 * cached file first.
 */
async function synthesiseOnOwnKey(hash, synthSpec, found) {
  if (!found.browsed && !globalThis.game?.user?.isGM) {
    const cached = await askGmForCachedPath(hash);
    if (cached) return cached;
  }
  const bytes = await synthesise({ apiKey: getSetting("elevenLabsApiKey", ""), ...synthSpec, stream: false });
  return commitToCache(hash, bytes);
}

/**
 * Canonical GM: synthesise one clip and write it to the cache, once per hash.
 * This client's own playback and every keyless player's request for the same
 * clip await the same promise, so the clip is synthesised — and billed by
 * ElevenLabs — and uploaded once. The two paths used to run side by side: a
 * narrator card renders on every client at once, so with Auto-play on (or the
 * GM and a player both pressing Play) each segment was made twice (issue #321
 * U59).
 *
 * A clip whose upload failed keeps its bytes (`_unsavedClips`): the next call
 * for it uploads them again instead of synthesising it — every retry billed
 * the clip again (issue #345 AA61).
 *
 * @param {string} hash
 * @param {{ voiceId: string, modelId: string, text: string, speed: number }} spec
 * @param {string} apiKey
 * @returns {Promise<{ bytes: ArrayBuffer|Uint8Array|Blob, path: string|null }>}
 *   the clip, and its cache path (null when the write failed)
 */
function synthesiseToCacheOnce(hash, spec, apiKey) {
  let pending = _synthInFlight.get(hash);
  if (!pending) {
    const bytes = (async () => _unsavedClips.get(hash) ?? await synthesise({
      apiKey,
      voiceId: spec.voiceId,
      modelId: spec.modelId,
      text:    spec.text,
      speed:   spec.speed,
      stream:  false,
    }))();
    pending = (async () => {
      const made = await bytes;
      const path = await writeToCache(hash, made);
      if (path) _unsavedClips.delete(hash);
      else holdUnsavedClip(hash, made);
      return { bytes: made, path };
    })().finally(() => { _synthInFlight.delete(hash); _synthBytesInFlight.delete(hash); });
    _synthInFlight.set(hash, pending);
    _synthBytesInFlight.set(hash, bytes);
  }
  return pending;
}

/**
 * Audio GM: the bytes of a clip made — or being made — once (synthesiseToCacheOnce),
 * as soon as they are synthesised; its upload goes on behind (issue #348 PT12).
 *
 * @returns {Promise<ArrayBuffer|Uint8Array|Blob>}
 */
function synthesisedBytesOnce(hash, spec, apiKey) {
  const pending = synthesiseToCacheOnce(hash, spec, apiKey);
  // Handled here: a failed synthesis rejects the bytes, which the caller awaits.
  pending.catch(() => {});
  return _synthBytesInFlight.get(hash) ?? pending.then(made => made.bytes);
}

/**
 * Canonical GM: write a clip to the cache; the path, or null when the write
 * failed — a throw, or an upload the world refused (`cache.write` → null,
 * issue #322 V26), which used to pass unreported. A failure is logged, and the
 * GM told once that players cannot hear narrator audio until the world's
 * storage accepts uploads (issue #345 AA61).
 */
async function writeToCache(hash, bytes) {
  let path = null;
  try {
    path = await cacheWrite(hash, bytes);
  } catch (err) {
    console.warn(`${MODULE_ID} | audio cache write (GM-direct) failed:`, err);
  }
  if (path) return path;
  console.warn(`${MODULE_ID} | audio cache write (GM-direct): clip ${String(hash).slice(0, 8)}… was not saved — the world's storage refused the upload; its bytes are kept for a retry.`);
  if (!_toldUnsavedClip) {
    _toldUnsavedClip = true;
    notifyAudioFailure("Narrator audio couldn't be saved — the world's file storage refused the upload, so players can't hear narrator audio until it accepts uploads (on The Forge, check the Assets Library has space). Your game keeps the clips it made and uploads them again on the next Play, without paying for them again.");
  }
  return null;
}

/** Keep a made clip whose upload failed, newest last, at most UNSAVED_CLIP_CAP. */
function holdUnsavedClip(hash, bytes) {
  _unsavedClips.delete(hash);
  _unsavedClips.set(hash, bytes);
  while (_unsavedClips.size > UNSAVED_CLIP_CAP) _unsavedClips.delete(_unsavedClips.keys().next().value);
}

/**
 * A keyed client that is not the audio GM: relay the synthesised bytes to
 * the audio GM, which writes them to the cache when it holds no key of its
 * own (fire-and-forget; handleCacheWrite), and resolve to the blob URL of the
 * in-memory bytes so playback can begin without waiting for the GM-side write.
 */
async function commitToCache(hash, bytes) {
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
  return blobUrlOf(bytes);
}

/** An in-memory blob URL for synthesised bytes. */
function blobUrlOf(bytes) {
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
      case "audio.synth.done":    return resolvePendingSynth(payload.hash, payload.path, payload.unsaved === true);
      case "audio.cache.ask":     return handleCacheAsk(payload);
      case "audio.cache.found":   return resolvePendingCacheAsk(payload.hash, payload.path);
      default: return;
    }
  });
}

// GM-side: a keyed client synthesised a clip and relayed the bytes for
// caching. A relayed payload is checked against what the UI could send
// (rules/reachability.md §8; issue #330 D11 — W81's rule for its sibling
// request): the GM cannot check the bytes — the key is the text's, not the
// audio's — so it files them only under the clip key of a segment of a
// narrator card in chat under the world's voices, and never over a clip that
// is cached or that this client is making. Unchecked, a forged write under a
// real narration's hash replaced the audio every client plays for that card,
// and any hash was filed. A GM that holds an ElevenLabs key files none: it
// makes its own clips, and the relay serves a keyed player at a keyless GM's
// table (D11's reason) — at a keyed GM's table it only let any user pre-fill
// the audio of a card nobody had played yet with bytes of their own, served
// to every later Play (issue #338 D10).
async function handleCacheWrite(payload) {
  if (!isAudioGM()) return;
  if (hasElevenLabsKey()) {
    console.debug(`${MODULE_ID} | audio cache relay: this GM holds an ElevenLabs key and makes its own clips — the relayed clip is not filed.`);
    return;
  }
  const hash = typeof payload.hash === "string" ? payload.hash : "";
  if (!hash || typeof payload.b64 !== "string") return;
  try {
    if (_synthInFlight.has(hash) || await cacheLookup(hash)) {
      console.debug(`${MODULE_ID} | audio cache relay: clip ${hash.slice(0, 8)}… is already cached — not overwritten.`);
      return;
    }
    if (!(await isNarratorCardClipKey(hash))) {
      console.warn(`${MODULE_ID} | audio cache relay refused: ${hash.slice(0, 8)}… is no narrator card segment's clip key.`);
      return;
    }
    await cacheWrite(hash, base64ToBytes(payload.b64));
  } catch (err) {
    console.warn(`${MODULE_ID} | audio cache GM-relay write failed:`, err);
  }
}

// What the narrator can return: Narration Max Tokens (16000 by default), at
// the four characters a token the module budgets with (narratorPrompt.js
// estimateTokens).
const NARRATION_CHARS_PER_TOKEN = 4;
const DEFAULT_NARRATION_MAX_TOKENS = 16000;

/** Did a GM post this chat message? Read from the user list by the author's id. */
function messageAuthorIsGM(message) {
  const author = message?.author;
  const id = (typeof author === "string" ? author : author?.id) ?? message?._source?.author ?? null;
  const user = (id && globalThis.game?.users?.get?.(id)) || (author && typeof author === "object" ? author : null);
  return !!user?.isGM;
}

/**
 * Whether a chat message counts as a narrator card for audio: its Play button
 * and auto-play (onNarratorCardRendered), and the clip key a relayed synthesis
 * or cache write is checked against (isNarratorCardClipKey). Foundry lets any
 * user post a message with any module flags, so a player's message carrying
 * narrator flags and a novel got a Play button on every client and keyed a
 * synthesis on the GM's ElevenLabs key — X51's bound took its text from any
 * card (issue #342 D8, option A). With a keyed GM connected
 * (hasKeyedActiveGM — the only client that narrates then) only a GM-authored
 * message counts; a player-authored one counts only when no keyed GM is
 * connected (a `RUN_ON.CLAUDE` command or oracle follow-up narrated on the
 * author's own key), and no longer than the narrator can return.
 *
 * @param {ChatMessage} message
 * @param {string} text — the narration the card would voice
 * @returns {boolean}
 */
function countsAsNarratorCard(message, text) {
  if (messageAuthorIsGM(message)) return true;
  if (hasKeyedActiveGM()) return false;
  const maxTokens = Number(getSetting("narrationMaxTokens", DEFAULT_NARRATION_MAX_TOKENS)) || DEFAULT_NARRATION_MAX_TOKENS;
  return String(text ?? "").length <= maxTokens * NARRATION_CHARS_PER_TOKEN;
}

/**
 * Whether `hash` is the clip key of a segment of a narrator card in chat
 * under the world's voices — a clip a keyed client's Play could have made
 * (buildPlayableSegments, the NPC voice by resolveNpcVoiceForCard). Newest
 * card first; an X-carded card plays nothing, so it keys nothing.
 *
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function isNarratorCardClipKey(hash) {
  const voices   = getVoiceConfig();
  const messages = Array.from(globalThis.game?.messages?.contents ?? []).reverse();
  for (const message of messages) {
    const f = message?.flags?.[MODULE_ID];
    if (typeof f?.narrationText !== "string" || !f.narrationText.trim() || f.xCarded) continue;
    if (!countsAsNarratorCard(message, f.narrationText)) continue;
    const npcVoiceId = await resolveNpcVoiceForCard(message, voices);
    for (const p of splitSegments(f.narrationText)) {
      const voiceId = p.voice === SEGMENT_VOICE.NPC ? (npcVoiceId || voices.npcVoiceId) : voices.narratorVoiceId;
      if (!voiceId) continue;
      if (await cacheKey({ text: p.text, voiceId, modelId: voices.modelId, speed: voices.speed }) === hash) return true;
    }
  }
  return false;
}

// GM-side: a keyless client asked us to synthesise + cache a clip it can't make
// itself. Dedupe against the cache and the clip's in-flight synthesis — this
// client's own playback's or an earlier request's (synthesiseToCacheOnce) —
// then signal done with the cached file's path, so the requester (and any
// other waiters) can play it: a default Player may not browse the cache
// directory (FilePicker "Use File Browser" is Trusted Player and above), so a
// done signal with only the hash left them "not ready" every time, and on The
// Forge only the upload's own response names the file (issue #321 U60).
async function handleSynthRequest(payload) {
  if (!isAudioGM()) return;
  const hash = typeof payload.hash === "string" ? payload.hash : "";
  const spec = payload.spec;
  if (!hash) return;
  // A relayed payload is checked (rules/reachability.md §8): the hash must be
  // the clip key of the spec it asks for. Unchecked, any client could bill
  // arbitrary text to the GM's ElevenLabs key, or file audio under a real
  // narration's hash that every client then plays (issue #326 W81). Refused
  // quietly — no done signal, so waiters for the real clip are not unblocked.
  if (spec && typeof spec === "object") {
    let expected = null;
    try { expected = await cacheKey(spec); }
    catch (err) { console.warn(`${MODULE_ID} | audio synthesis request: clip key failed:`, err?.message ?? err); }
    if (expected !== hash) {
      console.warn(`${MODULE_ID} | audio synthesis request refused: hash ${hash.slice(0, 8)}… is not its spec's clip key.`);
      return;
    }
    // And the spec is one the UI could ask for: a segment of a narrator card
    // in chat, in one of the world's voices at the world's model and speed.
    // A forged request with an honestly computed hash was synthesised on the
    // GM's key with any voice (a premium or cloned one), any model (eleven_v3
    // at twice Flash's price), any speed and any text (issue #331 X51).
    if (!(await isNarratorCardClipKey(hash))) {
      console.warn(`${MODULE_ID} | audio synthesis request refused: ${hash.slice(0, 8)}… is no narrator card's line in the world's voices.`);
      return;
    }
  }
  // `unsaved`: the clip was made but the world's storage refused its upload —
  // the player is told that, not "ask the GM to play it" (issue #345 AA61).
  const signalDone = (path, unsaved = false) => game.socket?.emit?.(AUDIO_SOCKET_NAME,
    { kind: "audio.synth.done", hash, path: path ?? null, ...(unsaved && !path ? { unsaved: true } : {}) });
  let path = null;
  let unsaved = false;
  try {
    path = await cacheLookup(hash);
    if (path) { signalDone(path); return; }                  // already cached
    const apiKey = getSetting("elevenLabsApiKey", "");
    // A clip made earlier whose upload failed needs no key: only its upload is retried.
    if (_synthInFlight.has(hash) || _unsavedClips.has(hash) || (apiKey && String(apiKey).trim() && spec)) {
      const made = await synthesiseToCacheOnce(hash, spec, apiKey);
      path = made.path;
      unsaved = !path && made.bytes != null;
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | audio GM-synthesis (keyless request) failed:`, err);
  }
  signalDone(path, unsaved);   // success, already-cached, or failure — always unblock waiters
}

// GM-side: a keyed Player who may not browse the cache asks whether a clip is
// already there (issue #326 W79). Lookup only — an ask never synthesises (it
// carries no spec, and its answer must not bill the GM) — but it joins this
// clip's in-flight synthesis, so a clip being made is not made twice, and
// uploads again a clip this GM made whose upload the world refused.
async function handleCacheAsk(payload) {
  if (!isAudioGM()) return;
  const hash = typeof payload.hash === "string" ? payload.hash : "";
  if (!hash) return;
  let path = null;
  try {
    path = await cacheLookup(hash);
    // A clip this GM made whose upload the world refused is uploaded again —
    // its held bytes, nothing synthesised, no key needed: the asker otherwise
    // made it again on their own key (known-issues
    // AUDIO-KEYED-PLAYER-STORAGE-REFUSED).
    if (!path && (_synthInFlight.has(hash) || _unsavedClips.has(hash))) ({ path } = await synthesiseToCacheOnce(hash, null, ""));
  } catch (err) {
    console.warn(`${MODULE_ID} | audio cache ask failed:`, err?.message ?? err);
  }
  game.socket?.emit?.(AUDIO_SOCKET_NAME, { kind: "audio.cache.found", hash, path: path ?? null });
}

// Requester side: resolve the asks waiting on this hash with the GM's answer
// (relayedClipPath) — a forged one is no answer: they keep waiting.
function resolvePendingCacheAsk(hash, path) {
  const set = _pendingCacheAsk.get(hash);
  if (!set) return;
  const src = relayedClipPath(hash, path);
  if (src === undefined) return;
  _pendingCacheAsk.delete(hash);
  for (const resolve of set) resolve(src);
}

/**
 * What a GM's `audio.synth.done` / `audio.cache.found` answers for a clip: its
 * path when it is one the GM's cache could name (cache.js isCachePathFor —
 * `worlds/<world>/audio/<xx>/<hash>.mp3`, or a Forge Assets Library URL),
 * null for the GM's "no clip", and undefined for anything else. A relayed
 * value is bounded to what the sender could honestly send (rules/
 * reachability.md §8, the W81 / D11 / X51 rule): the socket does not say who
 * sent it, and any path ending in `/<hash>.mp3` was played — another user's
 * emit naming their own file replaced the narration a keyless player waited
 * for, and the GM's real answer then found no waiter (issue #337 Y42). Two
 * forgeries still pass (known-issues AUDIO-FORGE-ORIGIN-SHARED): a file
 * another Forge account keeps in The Forge's Assets Library under the clip's
 * name, in a world on The Forge (see isCachePathFor); and a forged "no clip"
 * (`path: null`), which has the GM's honest answer's form and cannot be told
 * from it — it ends the wait early with "not ready": a nuisance, not a
 * substitution.
 *
 * @param {string} hash
 * @param {*} path
 * @returns {string|null|undefined}
 */
function relayedClipPath(hash, path) {
  if (path == null) return null;
  if (isCachePathFor(hash, path)) return path;
  console.warn(`${MODULE_ID} | audio: an answer for clip ${String(hash).slice(0, 8)}… names no file of the GM's audio cache — ignored.`);
  return undefined;
}

// Keyed Player who may not browse: ask the audio GM for a clip's cached
// path; null when there is none, no GM is online, or no answer comes in time.
async function askGmForCachedPath(hash) {
  const gmOnline = Array.from(globalThis.game?.users ?? []).some(u => u?.isGM && u?.active);
  if (!gmOnline) return null;
  const answer = new Promise((resolve) => {
    let set = _pendingCacheAsk.get(hash);
    if (!set) { set = new Set(); _pendingCacheAsk.set(hash, set); }
    set.add(resolve);
    setTimeout(() => { set.delete(resolve); resolve(null); }, CACHE_ASK_TIMEOUT_MS);
  });
  game.socket?.emit?.(AUDIO_SOCKET_NAME, { kind: "audio.cache.ask", hash });
  return answer;
}

// Requester side: resolve everyone waiting on this hash with the GM's answer
// (relayedClipPath) — a forged one is no answer: they keep waiting for the
// GM's, or time out to "not ready". `unsaved` (the GM made the clip and the
// world's storage refused it) only changes what a "no clip" tells the player;
// a forged one is the forged "no clip"'s nuisance (see relayedClipPath).
function resolvePendingSynth(hash, path, unsaved = false) {
  const set = _pendingSynth.get(hash);
  if (!set) return;
  const src = relayedClipPath(hash, path);
  if (src === undefined) return;
  _pendingSynth.delete(hash);
  for (const resolve of set) resolve({ src, unsaved: src === null && unsaved });
}

// Keyless client: ask the audio GM to synthesise + cache `hash`, wait for
// the done signal (or time out), then return the path it names — or, without
// one, the cache lookup's (a Trusted Player may browse; a Player may not) —
// and whether the GM made the clip but could not save it (issue #345 AA61).
async function requestGmSynthesis(hash, spec) {
  const ready = new Promise((resolve) => {
    let set = _pendingSynth.get(hash);
    if (!set) { set = new Set(); _pendingSynth.set(hash, set); }
    set.add(resolve);
    setTimeout(() => { set.delete(resolve); resolve(null); }, SYNTH_REQUEST_TIMEOUT_MS);
  });
  game.socket?.emit?.(AUDIO_SOCKET_NAME, { kind: "audio.synth.request", hash, spec });
  const answer = await ready;
  const src = answer?.src ?? await cacheLookup(hash);
  return { src, unsaved: !src && answer?.unsaved === true };
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
  // The X-Card removed this narration (issue #321 U07): no Play button — its
  // audio stays hidden, as the card renders it — and audio of it already
  // playing, or still loading, stops. The flag lands as an update, which
  // re-renders the card on every client; the narration used to play on to
  // its end (known-issues XCARD-AUDIO-PLAYING).
  if (message?.flags?.[MODULE_ID]?.xCarded) {
    await silenceCard(message);
    return;
  }
  if (!audioEnabledForThisClient()) return;
  if (!(root instanceof HTMLElement)) return;

  const playBtn = root.querySelector('[data-action="audioPlayToggle"]');
  if (!playBtn) return;

  // Strip <npc>…</npc> from displayed prose. The original card HTML may
  // include the markup (postNarrationCard renders the raw prose); we
  // replace it once at render time.
  const proseEl = root.querySelector(".sf-narration-prose");
  const rawProse = message.flags?.[MODULE_ID]?.narrationText ?? proseEl?.textContent ?? "";
  // A message a player posted with narrator flags is no narrator card while a
  // keyed GM is connected: no Play button, no auto-play — a GM's Play of it
  // was billed on the GM's key with no bound at all (issue #342 D8).
  if (!countsAsNarratorCard(message, rawProse)) return;
  if (proseEl) {
    // Escaped, with the prose's Markdown emphasis rendered as the card's own
    // sink does (proseToHtml) — textContent put the "*Savela*" asterisks back
    // (issue #348 PT13).
    proseEl.innerHTML = proseToHtml(rawProse);
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
      cancelCardLoad(message);   // a load still in flight stays silent
      await stopActivePlayback();
      setButtonLabel(fresh, "idle");
    });
  }

  // Optional auto-play — once per card. A re-render (e.g. after the card's
  // "Roll <move>" button updates the message) must not replay the audio (F14).
  if (getSetting("audio.autoplay", false) === true && isCardNewHere(message) && claimAutoplayOnce(message.id)) {
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

/**
 * Stop this card's audio on this client: a load still in flight never plays
 * (its generation is taken), segments still being made are not made, and a
 * session playing or paused is stopped. Other cards' audio is left alone.
 *
 * @param {ChatMessage} message
 */
async function silenceCard(message) {
  cancelCardLoad(message);
  const session = _sessionsByCardId.get(message);
  if (!session) return;
  _sessionsByCardId.delete(message);
  if (session.state === PLAYBACK_STATE.STOPPED || session.state === PLAYBACK_STATE.IDLE) return;
  try {
    await session.stop();
  } catch (err) {
    console.warn(`${MODULE_ID} | audio: stopping an X-carded card's narration failed:`, err?.message ?? err);
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
    // Resuming settles only when the narration ends (the session's
    // onStateChange labels the button meanwhile), so label from the state it
    // ended in — a fixed "playing" here left a finished card showing Pause.
    await session.play();
    setButtonLabel(btn, btnLabelFromState(session.state));
    return;
  }

  setButtonLabel(btn, "loading");
  const generation = cardLoadGeneration(message);
  const stopped    = () => cardLoadGeneration(message) !== generation;
  // The segments still being made once playback starts stop being made when
  // this Play is stopped — its Stop, the X-Card, or another card taking over
  // (buildPlayableSegments' `cancelled`).
  let started = null;
  const cancelled = () => stopped() || message?.flags?.[MODULE_ID]?.xCarded === true
    || started?.state === PLAYBACK_STATE.STOPPED || started?.state === PLAYBACK_STATE.ERROR;
  try {
    // Pick the NPC voice from the card's focal connection pronouns (finding F).
    const npcVoiceId = await resolveNpcVoiceForCard(message, getVoiceConfig());
    const segments = await buildPlayableSegments(rawProse, { npcVoiceId, cancelled });
    // Stop was pressed while this loaded — or the X-Card took the narration
    // (XCARD-AUDIO-PLAYING): the card stays as Stop left it.
    if (stopped() || message?.flags?.[MODULE_ID]?.xCarded === true) return;
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
    // The setting as stored: PlaybackSession clamps it to 0..1 (a missing or
    // unreadable value plays at 0.8). `|| 0.8` here turned a 0% slider into
    // 80% (issue #306 R09).
    const volume = getSetting("audio.volume", 0.8);
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
    started = session;
    await session.play();
  } catch (err) {
    // Synthesis / segmentation failures (buildPlayableSegments throws).
    console.error(`${MODULE_ID} | audio toggle failed:`, err);
    if (stopped()) return;   // stopped meanwhile: no error to show on an idle card
    setButtonLabel(btn, "error");
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
      // Clickable: its title (the reason) says "try again" for the keyless
      // and transient cases, and a click retries. Disabled, it stayed dead
      // until the card re-rendered — after the GM cached the clip a player
      // could not try again (issue #322 V13).
      btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Unavailable — retry';
      btn.removeAttribute("disabled");
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
