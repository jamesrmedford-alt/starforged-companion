/**
 * STARFORGED COMPANION
 * tests/unit/audio.test.js
 *
 * Coverage for the audio narration module (docs/audio/audio-narration-scope.md):
 *   - segments.js (splitSegments, stripMarkup)
 *   - cache.js (cacheKey, lookup, write, evictIfOverflow)
 *   - elevenlabs.js (ELEVENLABS_MODELS, synthesise, fetchSubscription)
 *   - playback.js (PlaybackSession state machine + gesture queue)
 *   - index.js (audioEnabledForThisClient, segmentation orchestration)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  splitSegments,
  stripMarkup,
  SEGMENT_VOICE,
} from '../../src/audio/segments.js';

import {
  cacheKey,
  lookup as cacheLookup,
  write  as cacheWrite,
} from '../../src/audio/cache.js';

import {
  ELEVENLABS_MODELS,
  DEFAULT_NARRATOR_VOICE_ID,
  DEFAULT_NPC_VOICE_ID,
  synthesise,
  fetchSubscription,
} from '../../src/audio/elevenlabs.js';

import {
  PlaybackSession,
  PLAYBACK_STATE,
  markGestureReceived,
  userGestureReceived,
  waitForUserGesture,
  _resetGestureForTests,
  _resetActivePlaybackForTests,
  stopActivePlayback,
} from '../../src/audio/playback.js';

import {
  audioEnabledForThisClient,
} from '../../src/audio/index.js';

const MODULE_ID = 'starforged-companion';

beforeEach(() => {
  globalThis.fetch = vi.fn();
  globalThis.foundry.applications.apps.FilePicker.implementation._reset();
  globalThis.foundry.audio.Sound._reset();
  _resetGestureForTests();
  _resetActivePlaybackForTests();
  // Default settings — tests override as needed.
  globalThis.game.settings._store.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});


// ─────────────────────────────────────────────────────────────────────────────
// segments.js
// ─────────────────────────────────────────────────────────────────────────────

describe('splitSegments', () => {
  it('returns one narrator segment for prose with no <npc> tags', () => {
    const segs = splitSegments('The lights flicker once and steady themselves.');
    expect(segs).toEqual([
      { voice: 'narrator', text: 'The lights flicker once and steady themselves.' },
    ]);
  });

  it('splits on a single <npc>…</npc> into three segments (narrator, npc, narrator)', () => {
    const segs = splitSegments('Vance leans on the rail. <npc>"You\'re early."</npc> The lights flicker.');
    expect(segs).toHaveLength(3);
    expect(segs[0].voice).toBe('narrator');
    expect(segs[1]).toEqual({ voice: 'npc', text: '"You\'re early."' });
    expect(segs[2].voice).toBe('narrator');
    expect(segs[2].text).toContain('The lights flicker.');
  });

  it('handles multiple <npc> blocks in order', () => {
    const segs = splitSegments(
      '<npc>"Stop right there."</npc> She does not move. <npc>"I said stop."</npc>',
    );
    expect(segs.map(s => s.voice)).toEqual(['npc', 'narrator', 'npc']);
    expect(segs[0].text).toBe('"Stop right there."');
    expect(segs[2].text).toBe('"I said stop."');
  });

  it('returns empty array for empty / non-string input', () => {
    expect(splitSegments('')).toEqual([]);
    expect(splitSegments(undefined)).toEqual([]);
    expect(splitSegments(null)).toEqual([]);
  });

  it('drops empty <npc></npc> shells while keeping the surrounding narrator text', () => {
    const segs = splitSegments('Narration <npc></npc> continues.');
    expect(segs.every(s => s.text.trim().length > 0)).toBe(true);
    expect(segs.every(s => s.voice === SEGMENT_VOICE.NARRATOR)).toBe(true);
    expect(segs.map(s => s.text.trim()).join(' ')).toBe('Narration continues.');
  });

  it('exposes SEGMENT_VOICE constants', () => {
    expect(SEGMENT_VOICE.NARRATOR).toBe('narrator');
    expect(SEGMENT_VOICE.NPC).toBe('npc');
  });
});

describe('stripMarkup', () => {
  it('removes <npc> wrappers while preserving the inner text verbatim', () => {
    expect(stripMarkup('A <npc>"hi"</npc> B')).toBe('A "hi" B');
  });

  it('leaves prose untouched when no tags present', () => {
    expect(stripMarkup('plain prose')).toBe('plain prose');
  });

  it('is idempotent', () => {
    const once = stripMarkup('A <npc>"hi"</npc> B');
    expect(stripMarkup(once)).toBe(once);
  });

  it('returns empty string for non-string input', () => {
    expect(stripMarkup(null)).toBe('');
    expect(stripMarkup(undefined)).toBe('');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// cache.js
// ─────────────────────────────────────────────────────────────────────────────

describe('cacheKey', () => {
  it('produces a stable 64-char hex hash for identical inputs', async () => {
    const a = await cacheKey({ text: 'hi', voiceId: 'v1', modelId: 'm1', speed: 1.0 });
    const b = await cacheKey({ text: 'hi', voiceId: 'v1', modelId: 'm1', speed: 1.0 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs when text changes by one character', async () => {
    const a = await cacheKey({ text: 'hi',  voiceId: 'v', modelId: 'm', speed: 1 });
    const b = await cacheKey({ text: 'hi!', voiceId: 'v', modelId: 'm', speed: 1 });
    expect(a).not.toBe(b);
  });

  it('differs when voice / model / speed change', async () => {
    const base = { text: 'hi', voiceId: 'v', modelId: 'm', speed: 1 };
    const a = await cacheKey(base);
    expect(a).not.toBe(await cacheKey({ ...base, voiceId: 'w' }));
    expect(a).not.toBe(await cacheKey({ ...base, modelId: 'n' }));
    expect(a).not.toBe(await cacheKey({ ...base, speed: 1.1 }));
  });

  it('normalises speed to 2 decimal places (1.0 and 1.00 collide)', async () => {
    const a = await cacheKey({ text: 'hi', voiceId: 'v', modelId: 'm', speed: 1.0 });
    const b = await cacheKey({ text: 'hi', voiceId: 'v', modelId: 'm', speed: 1.00 });
    expect(a).toBe(b);
  });
});

describe('cache.lookup / cache.write', () => {
  it('write() persists bytes; lookup() returns the path', async () => {
    const hash = 'a'.repeat(64);
    const path = await cacheWrite(hash, new ArrayBuffer(8));
    expect(path).toBe(`worlds/test-world/audio/aa/${hash}.mp3`);
    const hit = await cacheLookup(hash);
    expect(hit).toBe(`worlds/test-world/audio/aa/${hash}.mp3`);
  });

  it('lookup() returns null for an unknown hash', async () => {
    const hash = 'b'.repeat(64);
    expect(await cacheLookup(hash)).toBeNull();
  });

  it('lookup() returns null for malformed hashes (defensive)', async () => {
    expect(await cacheLookup('too-short')).toBeNull();
    expect(await cacheLookup(null)).toBeNull();
    expect(await cacheLookup(undefined)).toBeNull();
  });

  it('write() rejects malformed hashes', async () => {
    silenceConsoleErrors();
    await expect(cacheWrite('short', new ArrayBuffer(8))).rejects.toThrow(/invalid hash/);
  });

  it('write() accepts ArrayBuffer, Uint8Array, and Blob', async () => {
    const h1 = '1'.repeat(64);
    const h2 = '2'.repeat(64);
    const h3 = '3'.repeat(64);
    await expect(cacheWrite(h1, new ArrayBuffer(4))).resolves.toMatch(/\.mp3$/);
    await expect(cacheWrite(h2, new Uint8Array([1, 2, 3, 4]))).resolves.toMatch(/\.mp3$/);
    await expect(cacheWrite(h3, new Blob([new Uint8Array([5])], { type: 'audio/mpeg' }))).resolves.toMatch(/\.mp3$/);
  });

  it('write() rejects non-bytes payload', async () => {
    silenceConsoleErrors();
    const hash = '4'.repeat(64);
    await expect(cacheWrite(hash, { not: 'bytes' })).rejects.toThrow(/ArrayBuffer/);
  });

  // AUDIO-002 — The Forge stores uploaded files in the user's Assets
  // Library and returns an absolute https://assets.forge-vtt.com/... URL
  // in the upload response. The constructed local path does not exist
  // on Forge and 404s on playback. write() must return the upload
  // response's path so playback uses the Forge URL.
  it('write() returns the upload response path when present (Forge)', async () => {
    const fp = globalThis.foundry.applications.apps.FilePicker.implementation;
    const origUpload = fp.upload;
    const forgeUrl = 'https://assets.forge-vtt.com/abc/audio/55/55'.padEnd(95, '5') + '.mp3';
    fp.upload = async (source, dir, file) => {
      fp._dirs.add(dir);
      fp._files.add(forgeUrl);
      fp._uploads.push({ source, dir, file });
      return { status: 'success', path: forgeUrl };
    };
    try {
      const hash = '5'.repeat(64);
      const path = await cacheWrite(hash, new ArrayBuffer(8));
      expect(path).toBe(forgeUrl);
    } finally {
      fp.upload = origUpload;
    }
  });

  it('lookup() returns the browse listing path verbatim (Forge URL passthrough)', async () => {
    const fp = globalThis.foundry.applications.apps.FilePicker.implementation;
    const hash = '6'.repeat(64);
    const forgeUrl = `https://assets.forge-vtt.com/abc/audio/66/${hash}.mp3`;
    fp._files.add(forgeUrl);
    const origBrowse = fp.browse;
    fp.browse = async (source, path) => {
      if (path === `worlds/test-world/audio/${hash.slice(0, 2)}`) {
        return { files: [forgeUrl], dirs: [] };
      }
      return { files: [], dirs: [] };
    };
    try {
      expect(await cacheLookup(hash)).toBe(forgeUrl);
    } finally {
      fp.browse = origBrowse;
    }
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// elevenlabs.js
// ─────────────────────────────────────────────────────────────────────────────

describe('ELEVENLABS_MODELS', () => {
  it('includes Flash v2.5 with creditMultiplier 0.5', () => {
    const flash = ELEVENLABS_MODELS.find(m => m.id === 'eleven_flash_v2_5');
    expect(flash).toBeDefined();
    expect(flash.creditMultiplier).toBe(0.5);
  });

  it('every entry has id, label, creditMultiplier', () => {
    for (const m of ELEVENLABS_MODELS) {
      expect(typeof m.id).toBe('string');
      expect(typeof m.label).toBe('string');
      expect(typeof m.creditMultiplier).toBe('number');
    }
  });

  it('exports the two sample voice IDs', () => {
    expect(DEFAULT_NARRATOR_VOICE_ID).toMatch(/^[A-Za-z0-9]+$/);
    expect(DEFAULT_NPC_VOICE_ID).toMatch(/^[A-Za-z0-9]+$/);
    expect(DEFAULT_NARRATOR_VOICE_ID).not.toBe(DEFAULT_NPC_VOICE_ID);
  });
});

describe('synthesise', () => {
  it('throws when the API key is missing', async () => {
    silenceConsoleErrors();
    await expect(synthesise({ apiKey: '', voiceId: 'v', modelId: 'm', text: 'hi' }))
      .rejects.toThrow(/key missing/);
  });

  it('throws when voiceId / modelId / text missing', async () => {
    silenceConsoleErrors();
    await expect(synthesise({ apiKey: 'k', voiceId: '',  modelId: 'm', text: 'hi' })).rejects.toThrow();
    await expect(synthesise({ apiKey: 'k', voiceId: 'v', modelId: '',  text: 'hi' })).rejects.toThrow();
    await expect(synthesise({ apiKey: 'k', voiceId: 'v', modelId: 'm', text: '   ' })).rejects.toThrow();
  });

  it('issues a POST with xi-api-key header and JSON body containing the speed', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true, status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
      text: async () => '',
    });
    await synthesise({
      apiKey: 'sk_live_xyz', voiceId: 'v1', modelId: 'eleven_flash_v2_5',
      text: 'hello', speed: 1.2,
    });
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/v1/text-to-speech/v1');
    expect(opts.method).toBe('POST');
    expect(opts.headers['xi-api-key']).toBe('sk_live_xyz');
    expect(opts.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body);
    expect(body.model_id).toBe('eleven_flash_v2_5');
    expect(body.voice_settings.speed).toBe(1.2);
  });

  it('clamps speed to [0.7, 1.5]', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true, status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
      text: async () => '',
    });
    await synthesise({ apiKey: 'k', voiceId: 'v', modelId: 'm', text: 'hi', speed: 0.1 });
    expect(JSON.parse(globalThis.fetch.mock.calls[0][1].body).voice_settings.speed).toBe(0.7);

    await synthesise({ apiKey: 'k', voiceId: 'v', modelId: 'm', text: 'hi', speed: 10 });
    expect(JSON.parse(globalThis.fetch.mock.calls[1][1].body).voice_settings.speed).toBe(1.5);
  });

  it('hits the /stream endpoint when stream:true', async () => {
    const fakeResponse = { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0), text: async () => '' };
    globalThis.fetch.mockResolvedValueOnce(fakeResponse);
    const result = await synthesise({
      apiKey: 'k', voiceId: 'v', modelId: 'm', text: 'hi', stream: true,
    });
    expect(globalThis.fetch.mock.calls[0][0]).toMatch(/\/stream$/);
    expect(result).toBe(fakeResponse);
  });

  it('surfaces 401 with a key-prefix hint', async () => {
    expectConsoleError();   // we expect a warn (captured as warn, but allow defensively)
    globalThis.fetch.mockResolvedValueOnce({
      ok: false, status: 401,
      arrayBuffer: async () => new ArrayBuffer(0),
      text: async () => '{"error":"invalid"}',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(synthesise({
      apiKey: 'sk-or-v1-wrong-provider', voiceId: 'v', modelId: 'm', text: 'hi',
    })).rejects.toThrow(/401/);
    const msg = warn.mock.calls.map(c => c.join(' ')).join('\n');
    expect(msg).toMatch(/sk-or-/);
  });
});

describe('fetchSubscription', () => {
  it('returns used / limit / resetUnix', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({
        character_count: 1234,
        character_limit: 10000,
        next_character_count_reset_unix: 1717200000,
      }),
      text: async () => '',
    });
    const result = await fetchSubscription('k');
    expect(result).toEqual({ used: 1234, limit: 10000, resetUnix: 1717200000 });
  });

  it('uses the GET /v1/user/subscription endpoint with xi-api-key', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ character_count: 0, character_limit: 0 }),
      text: async () => '',
    });
    await fetchSubscription('k');
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/v1/user/subscription');
    expect(opts.method).toBe('GET');
    expect(opts.headers['xi-api-key']).toBe('k');
  });

  it('handles missing resetUnix gracefully', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ character_count: 10, character_limit: 100 }),
      text: async () => '',
    });
    const result = await fetchSubscription('k');
    expect(result.resetUnix).toBeNull();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// playback.js
// ─────────────────────────────────────────────────────────────────────────────

describe('PlaybackSession', () => {
  it('starts idle and plays through a single-segment session', async () => {
    const session = new PlaybackSession({
      cardId: 'c1',
      segments: [{ voice: 'narrator', src: '/a.mp3', text: 'a' }],
      volume:   0.6,
    });
    expect(session.state).toBe(PLAYBACK_STATE.IDLE);
    const playPromise = session.play();
    // Wait a tick so the segment's 'end' listener is attached (the sound is
    // created and loaded asynchronously). Completion is driven by the 'end'
    // event now, not by play()'s start-time resolution (F11).
    await new Promise(r => setTimeout(r, 0));
    const sound = globalThis.foundry.audio.Sound._instances[0];
    sound._fire('end');
    await playPromise;
    // Final state should drop back to idle once segments complete
    expect([PLAYBACK_STATE.IDLE, PLAYBACK_STATE.PLAYING]).toContain(session.state);
  });

  it('plays segments sequentially', async () => {
    const session = new PlaybackSession({
      cardId: 'c2',
      segments: [
        { voice: 'narrator', src: '/a.mp3', text: 'a' },
        { voice: 'npc',      src: '/b.mp3', text: 'b' },
      ],
      volume: 0.5,
    });
    // Begin the session, but don't await until we've fed end events
    const playPromise = session.play();
    // Wait a tick for first sound creation
    await new Promise(r => setTimeout(r, 0));
    // Fire end on each sound as it's instantiated
    while (globalThis.foundry.audio.Sound._instances.length > 0) {
      const s = globalThis.foundry.audio.Sound._instances.shift();
      s._fire('end');
      await new Promise(r => setTimeout(r, 0));
    }
    await playPromise;
    expect(session.state).toBe(PLAYBACK_STATE.IDLE);
  });

  // F11 regression: the next segment must NOT begin until the current one's
  // 'end' fires. Foundry v13 Sound.play() resolves at START; if completion were
  // taken from that promise, both the narrator and NPC segments would be
  // created and play on top of each other.
  it('does not start the next segment until the current one ends (F11)', async () => {
    const Sound = globalThis.foundry.audio.Sound;
    Sound._reset();
    const session = new PlaybackSession({
      cardId: 'f11',
      segments: [
        { voice: 'narrator', src: '/a.mp3', text: 'a' },
        { voice: 'npc',      src: '/b.mp3', text: 'b' },
      ],
    });
    const playPromise = session.play();
    await new Promise(r => setTimeout(r, 0));

    // Only the FIRST segment's sound should exist; the second must wait.
    expect(Sound._instances.length).toBe(1);

    Sound._instances[0]._fire('end');           // first finishes
    await new Promise(r => setTimeout(r, 0));

    // Now — and only now — the second segment is created.
    expect(Sound._instances.length).toBe(2);
    Sound._instances[1]._fire('end');
    await playPromise;
    expect(session.state).toBe(PLAYBACK_STATE.IDLE);
  });

  it('stop() transitions to STOPPED', async () => {
    const session = new PlaybackSession({
      cardId: 'c3',
      segments: [{ voice: 'narrator', src: '/x.mp3', text: 'x' }],
    });
    await session.stop();
    expect(session.state).toBe(PLAYBACK_STATE.STOPPED);
  });

  // AUDIO-001 — Foundry v13 Sound.addEventListener throws for unsupported
  // events. _playOneSound previously attached an "error" listener and went
  // straight to the ERROR state before play() ran. The fix removes the
  // listener and relies on play()'s promise rejection; this test pins
  // both the no-attach behaviour and the rejection-routed failure path.
  it('_playOneSound does not attach an "error" listener (Foundry v13 throws on unsupported events)', async () => {
    const session = new PlaybackSession({
      cardId: 'c4',
      segments: [{ voice: 'narrator', src: '/x.mp3', text: 'x' }],
    });
    const playPromise = session.play();
    await new Promise(r => setTimeout(r, 0));
    const sound = globalThis.foundry.audio.Sound._instances[0];
    expect(sound).toBeDefined();
    expect(sound._listeners.error).toBeUndefined();
    expect(Object.keys(sound._listeners)).toEqual(expect.arrayContaining(['end', 'stop']));
    sound._fire('end');
    await playPromise;
    expect(session.state).toBe(PLAYBACK_STATE.IDLE);
  });

  it('routes a play() rejection to the ERROR state instead of throwing synchronously', async () => {
    const SoundClass = globalThis.foundry.audio.Sound;
    const origPlay = SoundClass.prototype.play;
    SoundClass.prototype.play = async function() {
      this._state = 'playing';
      throw new Error('404 not found');
    };
    try {
      const session = new PlaybackSession({
        cardId: 'c5',
        segments: [{ voice: 'narrator', src: '/missing.mp3', text: 'x' }],
      });
      await session.play();
      expect(session.state).toBe(PLAYBACK_STATE.ERROR);
    } finally {
      SoundClass.prototype.play = origPlay;
    }
  });

  // No-overlap guard — starting a second session must stop the first so
  // narrator cards rendered in fast succession never play over each other.
  it('starting a second session stops the first (single active playback)', async () => {
    const first = new PlaybackSession({
      cardId: 'overlap-1',
      segments: [{ voice: 'narrator', src: '/first.mp3', text: 'first' }],
    });
    first.play();                                   // do not await — it stays PLAYING
    await new Promise(r => setTimeout(r, 0));
    expect(first.state).toBe(PLAYBACK_STATE.PLAYING);

    const second = new PlaybackSession({
      cardId: 'overlap-2',
      segments: [{ voice: 'narrator', src: '/second.mp3', text: 'second' }],
    });
    second.play();                                  // claims playback, stops `first`
    await new Promise(r => setTimeout(r, 0));

    expect(first.state).toBe(PLAYBACK_STATE.STOPPED);
    expect(second.state).toBe(PLAYBACK_STATE.PLAYING);
  });

  it('a completed session releases the active slot so the next can play cleanly', async () => {
    const first = new PlaybackSession({
      cardId: 'release-1',
      segments: [{ voice: 'narrator', src: '/a.mp3', text: 'a' }],
    });
    const p1 = first.play();
    await new Promise(r => setTimeout(r, 0));
    globalThis.foundry.audio.Sound._instances[0]._fire('end');   // complete naturally
    await p1;
    expect(first.state).toBe(PLAYBACK_STATE.IDLE);

    // A later session starting does NOT re-stop the already-finished first.
    const second = new PlaybackSession({
      cardId: 'release-2',
      segments: [{ voice: 'narrator', src: '/b.mp3', text: 'b' }],
    });
    second.play();
    await new Promise(r => setTimeout(r, 0));
    expect(second.state).toBe(PLAYBACK_STATE.PLAYING);
    expect(first.state).toBe(PLAYBACK_STATE.IDLE);   // unchanged — was released on completion
  });

  it('stopActivePlayback() stops the current session and is a no-op when nothing is active', async () => {
    // Nothing playing yet → resolves false, no throw.
    await expect(stopActivePlayback()).resolves.toBe(false);

    const session = new PlaybackSession({
      cardId: 'skip-1',
      segments: [{ voice: 'narrator', src: '/long.mp3', text: 'long' }],
    });
    session.play();                                  // becomes the active session
    await new Promise(r => setTimeout(r, 0));
    expect(session.state).toBe(PLAYBACK_STATE.PLAYING);

    await expect(stopActivePlayback()).resolves.toBe(true);   // the skip button path
    expect(session.state).toBe(PLAYBACK_STATE.STOPPED);

    // Slot released — a second stop is a no-op again.
    await expect(stopActivePlayback()).resolves.toBe(false);
  });
});

describe('user-gesture queue', () => {
  it('userGestureReceived() is false initially', () => {
    expect(userGestureReceived()).toBe(false);
  });

  it('markGestureReceived() flips the flag and resolves pending waiters', async () => {
    const pending = waitForUserGesture();
    markGestureReceived();
    await pending;
    expect(userGestureReceived()).toBe(true);
  });

  it('waitForUserGesture() resolves synchronously after gesture seen', async () => {
    markGestureReceived();
    await expect(waitForUserGesture()).resolves.toBeUndefined();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// audioEnabledForThisClient
// ─────────────────────────────────────────────────────────────────────────────

describe('audioEnabledForThisClient', () => {
  it('returns false when audio.enabled is false', () => {
    game.settings._store.set(`${MODULE_ID}.audio.enabled`, false);
    game.settings._store.set(`${MODULE_ID}.audio.clientEnabled`, true);
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, 'k');
    expect(audioEnabledForThisClient()).toBe(false);
  });

  it('returns false when audio.clientEnabled is false', () => {
    game.settings._store.set(`${MODULE_ID}.audio.enabled`, true);
    game.settings._store.set(`${MODULE_ID}.audio.clientEnabled`, false);
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, 'k');
    expect(audioEnabledForThisClient()).toBe(false);
  });

  it('returns false when the elevenLabsApiKey is empty', () => {
    game.settings._store.set(`${MODULE_ID}.audio.enabled`, true);
    game.settings._store.set(`${MODULE_ID}.audio.clientEnabled`, true);
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, '');
    expect(audioEnabledForThisClient()).toBe(false);
  });

  it('returns true when all three preconditions are met', () => {
    game.settings._store.set(`${MODULE_ID}.audio.enabled`, true);
    game.settings._store.set(`${MODULE_ID}.audio.clientEnabled`, true);
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, 'sk_xyz');
    expect(audioEnabledForThisClient()).toBe(true);
  });
});
