// PROBE SESS-4 (thirteenth audit, area "session / audio / private channel")
// — a narrator-audio cache upload that never answers leaves its clip's entry in
// `_synthInFlight` for the rest of the audio GM's page load: every later
// request and every later Play of that clip joins the dead promise.
//
// synthesiseToCacheOnce (src/audio/index.js) keeps one promise per clip hash:
//
//     pending = (async () => { const bytes = …synthesise…; const path = await writeToCache(hash, bytes); … })()
//       .finally(() => _synthInFlight.delete(hash));
//
// The synthesis is bounded (fetchWithTimeout), the upload is not: cache.write
// awaits FilePicker.createDirectory and FilePicker.upload (Foundry's own
// request — on The Forge, its Assets Library API) with no deadline. An upload
// that stalls — the fault src/net/fetchWithTimeout.js exists for — never
// settles, so the `finally` never runs. From then on, on this GM:
//   - handleSynthRequest finds `_synthInFlight.has(hash)` and awaits it: no
//     `audio.synth.done` is ever sent (its own contract: "success,
//     already-cached, or failure — always unblock waiters"), so every keyless
//     player's Play of that card waits out 30 s and reads "isn't ready yet —
//     ask the GM to play this card once, then try again", every time;
//   - the GM's own Play of the card sits on "Loading…" for good (Stop resets
//     the button; the next Play joins the same dead promise).
// The made clip (billed once) is never retried: AA61's held-bytes retry is
// reached only when the upload settles.
//
// Correct behaviour asserted: a player's retry, made after the upload that
// never answered (their own 30 s wait has run out), is answered with a done
// signal.
//
//   npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sess/audioSynthInFlightWedged.probe.js

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn() }));

import { registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from '../../../src/audio/index.js';
import { cacheKey, _resetAudioCacheStateForTests } from '../../../src/audio/cache.js';
import { synthesise } from '../../../src/audio/elevenlabs.js';

const MODULE_ID = 'starforged-companion';
const PROSE = 'The hull groans and holds.';
const SPEC = { voiceId: 'voice-narrator', modelId: 'eleven_flash_v2_5', text: PROSE, speed: 1 };
const FP = () => foundry.applications.apps.FilePicker.implementation;
const cachePath = (hash) => `worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`;

const AUDIO_SETTINGS = {
  'audio.enabled': true, 'audio.clientEnabled': true,
  'audio.narratorVoiceId': 'voice-narrator', 'audio.npcVoiceId': 'voice-npc',
  elevenLabsApiKey: 'sk_gm_key',                      // this GM holds the key: the audio GM
};
let savedMessages, savedUpload;

beforeEach(() => {
  FP()._reset();
  savedUpload = FP().upload;
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  vi.mocked(synthesise).mockReset();
  vi.mocked(synthesise).mockImplementation(async () => new ArrayBuffer(16));
  for (const [key, value] of Object.entries(AUDIO_SETTINGS)) game.settings._store.set(`${MODULE_ID}.${key}`, value);
  savedMessages = game.messages;
  game.messages = { contents: [{ id: 'msg-1', flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } }] };
  game.socket._reset();
  registerAudioSocket();
});

afterEach(() => {
  FP().upload = savedUpload;
  game.messages = savedMessages;
  game.socket._reset();
  for (const k of Object.keys(AUDIO_SETTINGS)) game.settings._store.delete(`${MODULE_ID}.${k}`);
});

/** A keyless player's client asks the audio GM for the clip. Not awaited: the handler may never settle. */
function playerRequests(hash) {
  for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) {
    Promise.resolve(h({ kind: 'audio.synth.request', hash, spec: SPEC })).catch(() => {});
  }
}
const doneSignals = () => (game.socket._emitted ?? []).filter(e => e.payload?.kind === 'audio.synth.done');
// Real turns of the event loop (the clip key is a crypto.subtle digest): everything
// that can settle has settled after these — the wedge needs no clock to show.
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise(r => setTimeout(r, 0)); };

describe('the audio GM and a cache upload that never answers', () => {
  it('control: a request is answered with the cached path; a retry is served from the cache', async () => {
    const hash = await cacheKey(SPEC);
    playerRequests(hash);
    await settle();
    playerRequests(hash);
    await settle();
    expect(doneSignals().map(e => e.payload.path)).toEqual([cachePath(hash), cachePath(hash)]);
    expect(synthesise).toHaveBeenCalledTimes(1);
  });

  it("a player's retry, after an upload that never answered, is answered", async () => {
    const hash = await cacheKey(SPEC);
    const accept = savedUpload;
    let uploads = 0;
    FP().upload = vi.fn((...args) => (uploads++ === 0 ? new Promise(() => {}) : accept(...args)));   // only the first stalls

    playerRequests(hash);
    await settle();
    expect(synthesise, 'the clip was made — and billed (setup)').toHaveBeenCalledTimes(1);
    expect(FP().upload, 'its upload was sent and is unanswered (setup)').toHaveBeenCalledTimes(1);

    // The player's own wait ran out at 30 s ("isn't ready yet … then try again").
    // Later they try again; uploads work now.
    playerRequests(hash);
    await settle();
    playerRequests(hash);                              // … and again
    await settle();

    expect(
      doneSignals().length,
      'no audio.synth.done was ever sent: the retry joined the clip\'s dead entry in _synthInFlight',
    ).toBeGreaterThanOrEqual(1);
  });
});
