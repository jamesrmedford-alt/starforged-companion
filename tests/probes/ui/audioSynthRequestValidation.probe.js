/**
 * Probe UI-11 — AUDIO-SYNTH-REQUEST-UNCHECKED (LATENT — rules/reachability.md §8)
 *
 * What the user does: any connected client sends the canonical GM an
 * `audio.synth.request` { hash, spec } on the module socket — normally a
 * keyless player's Play (audio/index.js requestGmSynthesis), but the socket
 * accepts any payload from any client.
 *
 * What happens: handleSynthRequest (audio/index.js:422) checks only that `hash`
 * is a string and `spec` is present. It synthesises `spec.text` with
 * `spec.voiceId` / `spec.modelId` on the GM's ElevenLabs key and uploads the
 * result as `<hash>.mp3` — it never checks that the hash is the clip key of
 * that spec (cache.cacheKey). So a stale or hand-made request bills arbitrary
 * text to the GM's key, and a request that pairs a real narration's hash with
 * other text files that audio under the narration's name: every client that
 * plays the card hears it (a cache hit is never re-checked). §8: a relayed
 * payload is client-asserted — validate it against what the UI could produce.
 *
 * What should happen: the GM recomputes cacheKey(spec) and refuses a request
 * whose hash does not match (signalling done with no path).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/audio/elevenlabs.js", () => ({ synthesise: vi.fn(async ({ text }) => new TextEncoder().encode(text)) }));

import { registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from "../../../src/audio/index.js";
import { cacheKey, _resetAudioCacheStateForTests } from "../../../src/audio/cache.js";
import { synthesise } from "../../../src/audio/elevenlabs.js";

const MODULE_ID = "starforged-companion";
const FP = () => foundry.applications.apps.FilePicker.implementation;
const SPEC = { voiceId: "voice-narrator", modelId: "eleven_flash_v2_5", speed: 1.0 };

beforeEach(() => {
  FP()._reset();
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  synthesise.mockClear();
  game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, "sk_gm_key");   // the canonical GM's key
  game.socket._reset();
  registerAudioSocket();
});

afterEach(() => {
  game.socket._reset();
  game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);
});

async function deliver(payload) {
  for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h(payload);
}

describe("UI-11 the GM checks a synthesis request against its clip key", () => {
  it("control: a request whose hash is its spec's clip key is synthesised and cached once", async () => {
    const spec = { ...SPEC, text: "The hull groans and holds." };
    const hash = await cacheKey(spec);
    await deliver({ kind: "audio.synth.request", hash, spec });
    expect(synthesise).toHaveBeenCalledTimes(1);
    expect(FP()._uploads.map(u => u.file.name)).toEqual([`${hash}.mp3`]);
  });

  it("a request pairing a narration's hash with other text is refused — nothing billed, nothing filed", async () => {
    const real = await cacheKey({ ...SPEC, text: "The hull groans and holds." });
    await deliver({ kind: "audio.synth.request", hash: real, spec: { ...SPEC, text: "Something else entirely, read in the narrator's voice." } });
    // FAILS today: synthesised on the GM's key and uploaded as the narration's clip.
    expect({ billed: synthesise.mock.calls.length, filed: FP()._uploads.map(u => u.file.name) })
      .toEqual({ billed: 0, filed: [] });
  });
});
