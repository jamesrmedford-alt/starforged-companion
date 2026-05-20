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

function ensureGestureListener() {
  if (_gestureReceived) return;
  // In headless / node-test environments there is no document — gesture
  // tracking is a no-op and callers fall back to markGestureReceived().
  if (typeof document === "undefined") return;
  const onGesture = () => {
    if (_gestureReceived) return;
    _gestureReceived = true;
    document.removeEventListener("click",   onGesture, true);
    document.removeEventListener("keydown", onGesture, true);
    document.removeEventListener("touchstart", onGesture, true);
    while (_gestureWaiters.length) {
      const resolve = _gestureWaiters.shift();
      try { resolve(); } catch (err) {
        console.warn(`${MODULE_ID} | playback gesture waiter threw:`, err);
      }
    }
  };
  document.addEventListener("click",      onGesture, true);
  document.addEventListener("keydown",    onGesture, true);
  document.addEventListener("touchstart", onGesture, true);
}

/**
 * Resolves once a user gesture has been observed. If a gesture has
 * already been received this session, resolves synchronously.
 */
export function waitForUserGesture() {
  if (_gestureReceived) return Promise.resolve();
  ensureGestureListener();
  return new Promise(resolve => _gestureWaiters.push(resolve));
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
   */
  constructor({ cardId, segments, volume = 0.8, onStateChange } = {}) {
    this.cardId       = String(cardId ?? "");
    this.segments     = Array.isArray(segments) ? segments.slice() : [];
    this.volume       = clamp01(volume);
    this._onState     = typeof onStateChange === "function" ? onStateChange : () => {};
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
      // Foundry v13 Sound only supports pause/start/stop/end/load events —
      // attaching an "error" listener throws synchronously. Failures during
      // load or decode surface via sound.play()'s promise rejection below.
      sound.addEventListener?.("end",  finish, { once: true });
      sound.addEventListener?.("stop", finish, { once: true });
      sound.play({ volume: this.volume }).then(
        // Some Sound implementations resolve play() at completion; others at start.
        // If play() resolves AND no 'end' event has fired, we still treat the
        // resolved promise as a hint that the sound is done.
        () => setTimeout(finish, 0),
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
    console.warn(`${MODULE_ID} | playback failed:`, err);
    this._setState(PLAYBACK_STATE.ERROR);
  }
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0.8;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
