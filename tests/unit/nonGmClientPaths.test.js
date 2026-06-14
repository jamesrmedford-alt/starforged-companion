/**
 * STARFORGED COMPANION
 * tests/unit/nonGmClientPaths.test.js
 *
 * Regression guards for PLAYTEST-1712 non-GM user-experience findings.
 *
 * The v1.7.12 playtesting session revealed that non-GM audio failures are
 * NOT caused by isGM render gates — they are caused by client-scoped
 * settings (audio.clientEnabled, elevenLabsApiKey) that are off/empty by
 * default and not discoverable in the standard settings panel. This file
 * pins that diagnosis and guards against future changes introducing an
 * unintended isGM gate on the audio path.
 *
 * Tests in this file run as a non-GM player by default (see beforeEach).
 * They use vi.mock() to stub the cache and gmGate layers so the test
 * environment does not need live FilePicker or a real Foundry socket.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the imports they affect.
// ---------------------------------------------------------------------------

vi.mock('../../src/audio/cache.js', () => ({
  cacheKey:        vi.fn().mockResolvedValue('deadbeefdeadbeef'),
  lookup:          vi.fn().mockResolvedValue(null),
  write:           vi.fn().mockResolvedValue('/worlds/test/audio/deadbeef.mp3'),
  evictIfOverflow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/multiplayer/gmGate.js', () => ({
  isCanonicalGM: vi.fn().mockReturnValue(true),
}));

// ---------------------------------------------------------------------------
// Imports (resolved after mocks are hoisted).
// ---------------------------------------------------------------------------

import {
  audioEnabledForThisClient,
  registerAudioSocket,
  AUDIO_SOCKET_NAME,
} from '../../src/audio/index.js';

import { write as mockWrite } from '../../src/audio/cache.js';
import { isCanonicalGM }     from '../../src/multiplayer/gmGate.js';

const MODULE_ID = 'starforged-companion';

// ---------------------------------------------------------------------------
// audioEnabledForThisClient() — client-scoped settings gate, not an isGM gate
// ---------------------------------------------------------------------------

describe('audioEnabledForThisClient — non-GM player context', () => {
  let restore;

  beforeEach(() => {
    restore = asPlayer();
    game.settings._store.clear();
  });

  afterEach(() => restore());

  it('returns false when audio.clientEnabled is false even if world audio is on', () => {
    // PLAYTEST-1712 H: the most common new-player state. World audio is
    // enabled by the GM, but the player has not enabled it on their client
    // (the Audio tab in Companion Settings). The play button is shown
    // (onNarratorCardRendered checks this gate) — but audio never starts.
    game.settings._store.set(`${MODULE_ID}.audio.enabled`,       true);
    game.settings._store.set(`${MODULE_ID}.audio.clientEnabled`, false);
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`,    'sk_test');
    expect(audioEnabledForThisClient()).toBe(false);
  });

  it('returns false when the elevenLabsApiKey is absent even with both toggles on', () => {
    // Player enabled audio on their client but has not configured their
    // personal ElevenLabs key. This is finding H's root cause: the key
    // is client-scoped and blank by default.
    game.settings._store.set(`${MODULE_ID}.audio.enabled`,       true);
    game.settings._store.set(`${MODULE_ID}.audio.clientEnabled`, true);
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`,    '');
    expect(audioEnabledForThisClient()).toBe(false);
  });

  it('returns false when world audio is off, regardless of client settings', () => {
    // GM has not enabled audio at the world level. Player-side settings
    // don't matter.
    game.settings._store.set(`${MODULE_ID}.audio.enabled`,       false);
    game.settings._store.set(`${MODULE_ID}.audio.clientEnabled`, true);
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`,    'sk_test');
    expect(audioEnabledForThisClient()).toBe(false);
  });

  it('returns true for a non-GM client when all three settings gates pass', () => {
    // This is the critical assertion: audioEnabledForThisClient() has NO
    // isGM gate. A properly-configured non-GM client should get audio.
    // If this test passes but audio still fails in production, the bug is
    // downstream in synthesis or playback — not in this gate.
    game.settings._store.set(`${MODULE_ID}.audio.enabled`,       true);
    game.settings._store.set(`${MODULE_ID}.audio.clientEnabled`, true);
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`,    'sk_test_key');
    expect(audioEnabledForThisClient()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// registerAudioSocket() — GM-side relay for non-GM client cache writes
//
// When a non-GM client synthesises audio, it can't write to the server-side
// audio/ directory. Instead it emits a socket payload with the raw bytes;
// the canonical GM's registerAudioSocket() handler receives it and writes
// the file. This test suite guards that relay contract.
// ---------------------------------------------------------------------------

describe('registerAudioSocket — GM relay contract', () => {
  beforeEach(() => {
    game.socket._reset();
    vi.clearAllMocks();
    vi.mocked(isCanonicalGM).mockReturnValue(true);
    vi.mocked(mockWrite).mockResolvedValue('/worlds/test/audio/deadbeef.mp3');
    // Disable the cache-cap so evictIfOverflow isn't triggered.
    game.settings._store.set(`${MODULE_ID}.audio.cacheMaxBytes`, 0);
  });

  afterEach(() => {
    game.socket._reset();
  });

  it('registers a handler on the module socket channel', () => {
    registerAudioSocket();
    expect(game.socket._handlers.has(AUDIO_SOCKET_NAME)).toBe(true);
    expect(game.socket._handlers.get(AUDIO_SOCKET_NAME).length).toBeGreaterThan(0);
  });

  it('handler ignores payloads when this client is not the canonical GM', async () => {
    vi.mocked(isCanonicalGM).mockReturnValue(false);
    registerAudioSocket();
    const [handler] = game.socket._handlers.get(AUDIO_SOCKET_NAME);
    await handler({ kind: 'audio.cache.write', hash: 'abc', b64: btoa('x') });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('handler calls cacheWrite when canonical GM receives a non-GM client relay', async () => {
    registerAudioSocket();
    const [handler] = game.socket._handlers.get(AUDIO_SOCKET_NAME);

    // Simulate what commitToCache() emits from a non-GM client.
    const audioData = 'simulated-audio-bytes';
    await handler({
      kind: 'audio.cache.write',
      hash: 'deadbeefdeadbeef',
      b64:  btoa(audioData),
    });

    expect(mockWrite).toHaveBeenCalledOnce();
    expect(mockWrite).toHaveBeenCalledWith(
      'deadbeefdeadbeef',
      expect.any(Uint8Array),
    );
  });

  it('handler ignores payloads with an unrecognised kind', async () => {
    registerAudioSocket();
    const [handler] = game.socket._handlers.get(AUDIO_SOCKET_NAME);
    await handler({ kind: 'audio.other.event', hash: 'abc', b64: btoa('x') });
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('handler ignores null and non-object payloads', async () => {
    registerAudioSocket();
    const [handler] = game.socket._handlers.get(AUDIO_SOCKET_NAME);
    await handler(null);
    await handler('a string');
    await handler(42);
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
