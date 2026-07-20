/**
 * STARFORGED COMPANION
 * src/audio/playback.js — foundry.audio.Sound wrapper for narrator cards
 *
 * One PlaybackSession per chat card. Segments play sequentially in
 * prose order; pause/stop/play apply to the whole session regardless of
 * which segment is active.
 *
 * The user-gesture autoplay constraint (Foundry / browser autoplay
 * policy) is handled by deferring playback until the next user click
 * anywhere in the document if no gesture has been observed yet. The
 * play-button click itself counts as a gesture, so click-to-play
 * always works on the first card; autoplay needs the gesture-priming
 * overlay (rendered by src/audio/index.js on the first card of a
 * session).
 */

const MODULE_ID = "starforged-companion";

export const PLAYBACK_STATE = Object.freeze({
  IDLE:    "idle",
  LOADING: "loading",
  PLAYING: "playing",
  PAUSED:  "paused",
  STOPPED: "stopped",
  ERROR:   "error",
});

let _gestureReceived = false;
const _gestureWaiters = [];

// Single-active-playback guard. Only one PlaybackSession may play at a time.
// Narrator cards rendered in fast succession (e.g. an autoplay burst, or
// several moves resolving quickly) would otherwise each spin up an
// independent session and overlap into a loud cacophony. Starting any
// session stops whichever session was previously active, so playback is
// always "latest wins, no overlap".
let _activeSession = null;

function _claimActivePlayback(session) {
  const prev = _activeSession;
  // Claim first, THEN stop the previous one — so prev.stop()'s own release
  // (which only nulls _activeSession when it still points at prev) cannot
  // clobber this fresh claim.
  _activeSession = session;
  if (prev && prev !== session) {
    Promise.resolve(prev.stop()).catch(err =>
      console.warn(`${MODULE_ID} | playback: stopping prior session failed:`, err));
  }
}

function _releaseActivePlayback(session) {
  if (_activeSession === session) _activeSession = null;
}

/** Test-only — clears the single-active-playback registry between cases. */
export function _resetActivePlaybackForTests() { _activeSession = null; }

/**
 * Stop whatever session is currently playing, if any. Backs the per-card
 * "Stop" button so a narration that runs excessively long (or the wrong one
 * in a burst) can be halted from any visible card. No-op when nothing is
 * active. Returns a promise that resolves once the stop has been issued.
 */
export function stopActivePlayback() {
  const s = _activeSession;
  if (!s) return Promise.resolve(false);
  return Promise.resolve(s.stop()).then(() => true).catch(() => false);
}

export function userGestureReceived() {
  return _gestureReceived;
}

/** Manual override — used by the click-to-play handler since the click itself is a gesture. */
export function markGestureReceived() {
  if (_gestureReceived) return;
  _gestureReceived = true;
  while (_gestureWaiters.length) _gestureWaiters.shift()();
}

/** Test-only reset. */
export function _resetGestureForTests() {
  _gestureReceived = false;
  _gestureWaiters.length = 0;
}

/**
 * HTMLAudioElement adapter for in-memory blob URLs. Blob URLs must bypass
 * foundry.audio.Sound — Foundry may apply path-normalisation that corrupts
 * the blob: scheme into an invalid server-relative path, producing a silent
 * 404 on playback. The adapter exposes the same surface as foundry.audio.Sound
 * (load/play/pause/stop/addEventListener) so PlaybackSession doesn't need
 * special-case logic.
 */
function _createBlobAudioAdapter(src) {
  const el = new globalThis.Audio(src);
  const _stopListeners = [];
  return {
    async load() { /* HTMLAudioElement loads lazily on play(); no-op. */ },
    async play({ volume = 1 } = {}) {
      el.volume = Math.max(0, Math.min(1, Number(volume) || 1));
      return el.play();
    },
    async pause() { el.pause(); },
    async stop() {
      el.pause();
      el.currentTime = 0;
      const cbs = _stopListeners.splice(0);
      for (const cb of cbs) {
        try { cb(); } catch (err) {
          console.warn(`${MODULE_ID} | blob audio stop-listener failed:`, err);
        }
      }
    },
    addEventListener(event, cb, opts) {
      if (event === "end")  { el.addEventListener("ended", cb, opts); return; }
      if (event === "stop") { _stopListeners.push(cb); return; }
      // "pause", "start", "load" — not needed by PlaybackSession; silently ignored.
    },
  };
}

/**
 * One playback session per chat card. Sequentially plays an array of
 * `{ voice, src, text }` segments where `src` is a path or URL the
 * Foundry Sound class can load.
 */
export class PlaybackSession {
  /**
   * @param {Object} args
   * @param {string} args.cardId
   * @param {Array<{ voice: string, src: string, text: string }>} args.segments
   * @param {number} [args.volume=0.8]   — 0..1, applied to each segment
   * @param {Function} [args.onStateChange]  — (newState) => void
   * @param {Function} [args.onError]        — (err) => void, called by _fail
   */
  constructor({ cardId, segments, volume = 0.8, onStateChange, onError } = {}) {
    this.cardId       = String(cardId ?? "");
    this.segments     = Array.isArray(segments) ? segments.slice() : [];
    this.volume       = clamp01(volume);
    this._onState     = typeof onStateChange === "function" ? onStateChange : () => {};
    this._onError     = typeof onError === "function" ? onError : () => {};
    this._state       = PLAYBACK_STATE.IDLE;
    this._currentIdx  = 0;
    this._currentSound = null;
    this._stopped     = false;
  }

  get state() { return this._state; }

  /**
   * Begin (or resume) playback. Returns when the whole session is
   * complete, or rejects on error.
   */
  async play() {
    if (this._state === PLAYBACK_STATE.PLAYING) return;
    // Stop any other session before we make a sound — prevents overlap.
    _claimActivePlayback(this);
    if (this._state === PLAYBACK_STATE.PAUSED && this._currentSound) {
      this._setState(PLAYBACK_STATE.PLAYING);
      try {
        if (typeof this._currentSound.play === "function") {
          await this._currentSound.play({ volume: this.volume });
        }
        return this._resumeAfterCurrent();
      } catch (err) {
        return this._fail(err);
      }
    }

    this._stopped = false;
    this._currentIdx = 0;
    this._setState(PLAYBACK_STATE.LOADING);
    try {
      await this._playFromCurrent();
    } catch (err) {
      this._fail(err);
    }
  }

  async pause() {
    if (this._state !== PLAYBACK_STATE.PLAYING) return;
    this._setState(PLAYBACK_STATE.PAUSED);
    if (this._currentSound && typeof this._currentSound.pause === "function") {
      try { await this._currentSound.pause(); } catch (err) {
        console.warn(`${MODULE_ID} | playback pause failed:`, err);
      }
    }
  }

  async stop() {
    this._stopped = true;
    this._setState(PLAYBACK_STATE.STOPPED);
    if (this._currentSound && typeof this._currentSound.stop === "function") {
      try { await this._currentSound.stop(); } catch (err) {
        console.warn(`${MODULE_ID} | playback stop failed:`, err);
      }
    }
    this._currentSound = null;
    _releaseActivePlayback(this);
  }

  async _playFromCurrent() {
    if (this._stopped) return;
    while (this._currentIdx < this.segments.length) {
      if (this._stopped) return;
      const seg = this.segments[this._currentIdx];
      this._currentSound = await this._createSound(seg.src);
      this._setState(PLAYBACK_STATE.PLAYING);
      await this._playOneSound(this._currentSound);
      this._currentIdx++;
    }
    if (!this._stopped) {
      this._setState(PLAYBACK_STATE.IDLE);
      _releaseActivePlayback(this);
    }
  }

  _resumeAfterCurrent() {
    return new Promise((resolve, reject) => {
      const onEnd = () => {
        this._currentIdx++;
        this._playFromCurrent().then(resolve, reject);
      };
      this._currentSound?.addEventListener?.("end", onEnd, { once: true });
    });
  }

  async _createSound(src) {
    // Blob URLs are in-memory client-side objects. Route them through the
    // HTMLAudioElement adapter so Foundry's path-normalisation (which may
    // mangle blob: into a server-relative URL) is bypassed entirely. Falls
    // back to the Sound class when Audio is unavailable (e.g. test env).
    if (typeof src === "string" && src.startsWith("blob:") &&
        typeof globalThis.Audio !== "undefined") {
      return _createBlobAudioAdapter(src);
    }
    if (globalThis.foundry?.audio?.Sound) {
      const Sound = globalThis.foundry.audio.Sound;
      const sound = new Sound(src);
      if (typeof sound.load === "function") {
        await sound.load();
      }
      return sound;
    }
    // Test-environment fallback — tests inject their own sound stub. If
    // none is present, fall through with a no-op object so the session
    // completes without crashing the chat render.
    return { play: async () => {}, pause: async () => {}, stop: async () => {},
             addEventListener: () => {}, _src: src };
  }

  async _playOneSound(sound) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => { if (settled) return; settled = true; resolve(); };
      const fail   = (err) => { if (settled) return; settled = true; reject(err); };
      // Completion is signalled by the Sound's 'end' (clip finished) or 'stop'
      // (interrupted) event — NOT by play()'s promise. Foundry v13 Sound.play()
      // resolves at playback START, so finishing on it would advance to the next
      // segment immediately and play it on top of this one (F11: the two NPC/
      // narrator voices overlapped). We only listen for end/stop here.
      //
      // Foundry v13 Sound only supports pause/start/stop/end/load events —
      // attaching an "error" listener throws synchronously. Failures during
      // load or decode surface via sound.play()'s promise rejection below.
      sound.addEventListener?.("end",  finish, { once: true });
      sound.addEventListener?.("stop", finish, { once: true });
      // Guard: a Sound implementation that never emits 'end' (or resolves play()
      // only at completion) must still advance — fall back to the resolved
      // play() promise so the queue can't deadlock, but only as a last resort.
      Promise.resolve(sound.play({ volume: this.volume })).then(
        () => { if (sound?.addEventListener == null) finish(); },
        fail,
      );
    });
  }

  _setState(next) {
    if (this._state === next) return;
    this._state = next;
    try { this._onState(next); } catch (err) {
      console.warn(`${MODULE_ID} | playback onStateChange threw:`, err);
    }
  }

  _fail(err) {
    console.error(`${MODULE_ID} | playback failed:`, err);
    this._setState(PLAYBACK_STATE.ERROR);
    _releaseActivePlayback(this);
    try { this._onError(err); } catch (cbErr) {
      console.warn(`${MODULE_ID} | playback onError callback threw:`, cbErr);
    }
  }
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0.8;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
