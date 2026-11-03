// STARFORGED COMPANION
// tests/unit/audioSynthRequestValidation.test.js
//
// The canonical GM synthesises only a request whose hash is its spec's clip
// key (issue #326 W81).
//
// Any connected client may send the canonical GM an `audio.synth.request`
// { hash, spec } on the module socket — normally a keyless player's Play, but
// the socket accepts any payload from any client. handleSynthRequest checked
// only that `hash` was a string and `spec` was present, then synthesised
// `spec.text` on the GM's ElevenLabs key and uploaded it as `<hash>.mp3`. A
// stale or hand-made request billed arbitrary text to the GM's key, and one
// pairing a real narration's hash with other text filed that audio under the
// narration's name — every client that played the card heard it (a cache hit
// is never re-checked). A relayed payload is client-asserted
// (rules/reachability.md §8): the GM now recomputes cacheKey(spec) and refuses
// a mismatch.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/audio/elevenlabs.js", () => ({ synthesise: vi.fn(async ({ text }) => new TextEncoder().encode(text)) }));

import { registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from "../../src/audio/index.js";
import { cacheKey, _resetAudioCacheStateForTests } from "../../src/audio/cache.js";
import { synthesise } from "../../src/audio/elevenlabs.js";

const MODULE_ID = "starforged-companion";
const FP = () => foundry.applications.apps.FilePicker.implementation;
const SPEC = { voiceId: "voice-narrator", modelId: "eleven_flash_v2_5", speed: 1.0 };
const REAL_TEXT = "The hull groans and holds.";

let savedEmit;
const emitted = [];

beforeEach(() => {
  FP()._reset();
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  synthesise.mockClear();
  game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, "sk_gm_key");   // the canonical GM's key
  game.socket._reset();
  emitted.length = 0;
  savedEmit = game.socket.emit;
  game.socket.emit = (event, payload) => { if (event === AUDIO_SOCKET_NAME) emitted.push(payload); };
  registerAudioSocket();
});

afterEach(() => {
  game.socket.emit = savedEmit;
  game.socket._reset();
  game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);
});

/** Deliver a payload to the GM's socket handlers, as another client's emit would. */
async function deliver(payload) {
  for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h(payload);
}

const uploaded = () => FP()._uploads.map(u => u.file.name);

describe("the GM checks a synthesis request against its clip key (issue #326 W81)", () => {
  it("control: a request whose hash is its spec's clip key is synthesised and cached once", async () => {
    const spec = { ...SPEC, text: REAL_TEXT };
    const hash = await cacheKey(spec);
    await deliver({ kind: "audio.synth.request", hash, spec });
    expect(synthesise).toHaveBeenCalledTimes(1);
    expect(uploaded()).toEqual([`${hash}.mp3`]);
    expect(emitted).toEqual([{ kind: "audio.synth.done", hash, path: expect.stringMatching(new RegExp(`/${hash}\\.mp3$`)) }]);
  });

  it("a request pairing a narration's hash with other text is refused — nothing billed, nothing filed", async () => {
    const real = await cacheKey({ ...SPEC, text: REAL_TEXT });
    await deliver({ kind: "audio.synth.request", hash: real, spec: { ...SPEC, text: "Something else entirely, read in the narrator's voice." } });
    expect({ billed: synthesise.mock.calls.length, filed: uploaded() }).toEqual({ billed: 0, filed: [] });
    expect(getCapturedWarns().join("\n")).toMatch(/audio synthesis request refused: hash .* is not its spec's clip key/);
  });

  it("a hand-made hash for arbitrary text is refused", async () => {
    await deliver({ kind: "audio.synth.request", hash: "0".repeat(64), spec: { ...SPEC, text: "Bill this to the GM." } });
    expect({ billed: synthesise.mock.calls.length, filed: uploaded() }).toEqual({ billed: 0, filed: [] });
  });

  it("a refused request sends no done signal, so a waiter for the real clip is not told it failed", async () => {
    const real = await cacheKey({ ...SPEC, text: REAL_TEXT });
    await deliver({ kind: "audio.synth.request", hash: real, spec: { ...SPEC, voiceId: "voice-npc", text: REAL_TEXT } });
    expect(emitted).toEqual([]);
  });

  it("control: the real clip's request after a refused one is still served", async () => {
    const spec = { ...SPEC, text: REAL_TEXT };
    const real = await cacheKey(spec);
    await deliver({ kind: "audio.synth.request", hash: real, spec: { ...SPEC, text: "A forgery." } });
    await deliver({ kind: "audio.synth.request", hash: real, spec });
    expect(synthesise).toHaveBeenCalledTimes(1);
    expect(synthesise.mock.calls[0][0].text).toBe(REAL_TEXT);
    expect(uploaded()).toEqual([`${real}.mp3`]);
  });
});
