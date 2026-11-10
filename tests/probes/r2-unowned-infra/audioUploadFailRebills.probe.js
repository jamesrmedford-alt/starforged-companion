/**
 * R2I — AUDIO-UPLOAD-FAIL-REBILLS (DUPLICATE + UX, low; refused-upload path)
 *
 * The audio GM makes a keyless player's clip (handleSynthRequest →
 * synthesiseToCacheOnce, src/audio/index.js:544-585 / 338-355 at 22bdbeb):
 * ElevenLabs bills the synthesis, then the clip is uploaded to the cache. When
 * the world's storage refuses the upload — v13 FilePicker.upload resolves
 * false; uploadedPath returns null (net/uploadResult.js, issue #322 V26) —
 * writeToCache (index.js:358-365) returns null without a word (it logs only a
 * throw), the in-flight entry is dropped, and the GM answers `audio.synth.done`
 * with path null. The player is told "Narrator audio isn't ready yet — ask the
 * GM to play this card once, then try again." (index.js:314). Trying again
 * re-sends the request, and the GM synthesises — bills — the same clip again,
 * with the same refused upload: every retry the advice asks for is another
 * ElevenLabs charge, and nobody is told the cache upload is what failed. The
 * bytes were in hand; only the upload needed retrying.
 *
 * Scenario: GM holds the ElevenLabs key; the world refuses audio uploads (e.g.
 * The Forge's Assets Library full). A keyless player presses Play on the
 * narrator card → "not ready"; presses Play again, as told.
 *
 * Expected: the clip is synthesised once (the second request re-tries the
 * upload with the bytes already made, or is refused without billing).
 * Actual: synthesise is called twice.
 * Control: with uploads working, the second request is served from the cache
 * (one synthesis) — the request path itself is sound.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn() }));

import { registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from '../../../src/audio/index.js';
import { cacheKey, _resetAudioCacheStateForTests } from '../../../src/audio/cache.js';
import { synthesise } from '../../../src/audio/elevenlabs.js';

const MODULE_ID = 'starforged-companion';
const PROSE = 'The hull groans and holds.';
const SPEC = { voiceId: 'voice-narrator', modelId: 'eleven_flash_v2_5', text: PROSE, speed: 1 };
const FP = () => foundry.applications.apps.FilePicker.implementation;

let savedMessages, savedUpload;
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); };

/** A keyless player's client asks the audio GM for the clip (its socket message). */
async function playerRequests(hash) {
  for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) {
    await h({ kind: 'audio.synth.request', hash, spec: SPEC });
  }
  await flush();
}
const doneSignals = () => (game.socket._emitted ?? []).filter(e => e.payload?.kind === 'audio.synth.done');

beforeEach(() => {
  FP()._reset();
  savedUpload = FP().upload;
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  vi.mocked(synthesise).mockReset();
  vi.mocked(synthesise).mockImplementation(async () => new ArrayBuffer(16));
  for (const [key, value] of Object.entries({
    'audio.enabled':         true,
    'audio.clientEnabled':   true,
    'audio.narratorVoiceId': 'voice-narrator',
    'audio.npcVoiceId':      'voice-npc',
    'elevenLabsApiKey':      'sk_gm_key',          // the GM holds the key (the audio GM)
  })) game.settings._store.set(`${MODULE_ID}.${key}`, value);
  savedMessages = game.messages;
  game.messages = { contents: [{ id: 'msg-1', flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } }] };
  game.socket._reset();
  registerAudioSocket();
});

afterEach(() => {
  FP().upload = savedUpload;
  game.messages = savedMessages;
  game.socket._reset();
  for (const k of ['audio.enabled', 'audio.clientEnabled', 'audio.narratorVoiceId', 'audio.npcVoiceId', 'elevenLabsApiKey']) {
    game.settings._store.delete(`${MODULE_ID}.${k}`);
  }
});

describe('R2I AUDIO-UPLOAD-FAIL-REBILLS — a refused cache upload does not bill the clip again on the retry', () => {
  it('the world refuses the upload: the player\'s retry does not bill the clip again', async () => {
    FP().upload = vi.fn(async () => false);         // v13: the server reported an error
    const hash = await cacheKey(SPEC);

    await playerRequests(hash);                      // first Play → "not ready yet — ask the GM…, then try again"
    expect(doneSignals()).toHaveLength(1);
    expect(doneSignals()[0].payload.path).toBeNull();

    await playerRequests(hash);                      // "…then try again"
    expect(doneSignals()).toHaveLength(2);
    expect(FP().upload).toHaveBeenCalledTimes(2);    // the upload was retried — fine
    expect(synthesise).toHaveBeenCalledTimes(1);     // the clip was already made and billed once
  });

  it('control: with uploads working, the retry is served from the cache — one synthesis', async () => {
    const hash = await cacheKey(SPEC);
    await playerRequests(hash);
    await playerRequests(hash);
    expect(doneSignals().map(e => e.payload.path)).toEqual([
      `worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`,
      `worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`,
    ]);
    expect(synthesise).toHaveBeenCalledTimes(1);
  });
});
