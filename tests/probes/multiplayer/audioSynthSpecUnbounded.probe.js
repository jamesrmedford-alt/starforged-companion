/**
 * PROBE — MP-01 AUDIO-SYNTH-SPEC-UNBOUNDED (ninth audit, area multiplayer)
 *
 * What the user does: a player's browser console (or any macro) emits an
 * `audio.synth.request` on the module socket — the message a keyless player's
 * ▶ Play sends the canonical GM — but with a spec the module's own UI could
 * never produce: a premium / cloned voice id that is not one of the world's
 * configured voices, the dearest ElevenLabs model instead of the world's, a
 * speed the world does not use, or text that is no segment of any narrator
 * card in the chat log. Its hash is computed honestly (cacheKey(spec)).
 *
 * What happens: handleSynthRequest (src/audio/index.js:447–479) checks only
 * that the hash is the spec's own clip key (issue #326 W81, :457–465) and then
 * synthesises the spec on the GM's ElevenLabs key (:471–473) and files it.
 * Nothing bounds voiceId / modelId / speed / text to the world's settings or
 * to a card's prose, so a forged request bills arbitrary text, on any voice,
 * at the priciest model, to the GM.
 *
 * What should happen: rules/reachability.md §8 and the accepted trust model
 * (known-issues "Relay requester ids are client-asserted": "handlers clamp and
 * validate values … so a forged request can only do what the UI could have
 * done"). The UI can only ask for a segment of a narrator card, in one of the
 * world's configured voices (audio.narratorVoiceId / npcVoiceId / the three
 * pronoun voices — all world-scoped, src/index.js:440–470), at the world's
 * model and speed. Anything else is refused like a hash mismatch: nothing
 * billed, nothing filed.
 *
 * Controls: an honest request (the card's narrator segment, the world's
 * narrator voice, model and speed) is synthesised and cached once; W81's
 * hash-mismatch refusal still holds.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/audio/elevenlabs.js", () => ({ synthesise: vi.fn(async ({ text }) => new TextEncoder().encode(text)) }));

import { registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from "../../../src/audio/index.js";
import { cacheKey, _resetAudioCacheStateForTests } from "../../../src/audio/cache.js";
import { synthesise } from "../../../src/audio/elevenlabs.js";

const MODULE_ID = "starforged-companion";
const FP = () => foundry.applications.apps.FilePicker.implementation;

// The world's audio configuration (world-scoped settings the GM set).
const WORLD = { narratorVoiceId: "voice-narrator", npcVoiceId: "voice-npc", modelId: "eleven_flash_v2_5", speed: 1.0 };
const SPEC  = { voiceId: WORLD.narratorVoiceId, modelId: WORLD.modelId, speed: WORLD.speed };
const CARD_PROSE = "The hull groans and holds. <npc>Hold fast, all of you.</npc>";
const NARRATOR_SEGMENT = "The hull groans and holds. ";

let savedEmit;
let savedMessages;
const emitted = [];

beforeEach(() => {
  FP()._reset();
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  synthesise.mockClear();
  game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, "sk_gm_key");   // the canonical GM's key
  game.settings._store.set(`${MODULE_ID}.audio.narratorVoiceId`, WORLD.narratorVoiceId);
  game.settings._store.set(`${MODULE_ID}.audio.npcVoiceId`, WORLD.npcVoiceId);
  game.settings._store.set(`${MODULE_ID}.audio.modelId`, WORLD.modelId);
  game.settings._store.set(`${MODULE_ID}.audio.speed`, WORLD.speed);
  // The one narrator card in the chat log — the only prose a Play could ask for.
  savedMessages = game.messages;
  game.messages = { contents: [{ id: "card-1", flags: { [MODULE_ID]: { narratorCard: true, narrationText: CARD_PROSE, sessionId: "s1" } } }] };
  game.socket._reset();
  emitted.length = 0;
  savedEmit = game.socket.emit;
  game.socket.emit = (event, payload) => { if (event === AUDIO_SOCKET_NAME) emitted.push(payload); };
  registerAudioSocket();
});

afterEach(() => {
  game.socket.emit = savedEmit;
  game.socket._reset();
  game.messages = savedMessages;
  for (const k of ["elevenLabsApiKey", "audio.narratorVoiceId", "audio.npcVoiceId", "audio.modelId", "audio.speed"]) {
    game.settings._store.delete(`${MODULE_ID}.${k}`);
  }
});

/** Deliver a payload to the GM's socket handlers, as another client's emit would. */
async function deliver(payload) {
  for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h(payload);
}

const uploaded = () => FP()._uploads.map(u => u.file.name);
const outcome  = () => ({ billed: synthesise.mock.calls.length, filed: uploaded() });

describe("MP-01 the GM bounds a relayed synthesis request to what the UI could send", () => {
  it("control: the card's narrator segment in the world's narrator voice is synthesised and cached once", async () => {
    const spec = { ...SPEC, text: NARRATOR_SEGMENT };
    const hash = await cacheKey(spec);
    await deliver({ kind: "audio.synth.request", hash, spec });
    expect(outcome()).toEqual({ billed: 1, filed: [`${hash}.mp3`] });
    expect(emitted).toEqual([{ kind: "audio.synth.done", hash, path: expect.stringMatching(new RegExp(`/${hash}\\.mp3$`)) }]);
  });

  it("control (W81): a hash that is not its spec's clip key is still refused", async () => {
    const real = await cacheKey({ ...SPEC, text: NARRATOR_SEGMENT });
    await deliver({ kind: "audio.synth.request", hash: real, spec: { ...SPEC, text: "Something else entirely." } });
    expect(outcome()).toEqual({ billed: 0, filed: [] });
  });

  it("a voice id that is none of the world's configured voices is refused — nothing billed on the GM's key", async () => {
    const spec = { ...SPEC, voiceId: "premium-cloned-voice-id", text: NARRATOR_SEGMENT };
    const hash = await cacheKey(spec);   // an honest hash for a forged spec
    await deliver({ kind: "audio.synth.request", hash, spec });
    // FAILS today: synthesised on the GM's key with the forged voice and filed.
    expect(outcome()).toEqual({ billed: 0, filed: [] });
  });

  it("a model that is not the world's (the priciest one, 1.0 credit/char) is refused", async () => {
    const spec = { ...SPEC, modelId: "eleven_v3", text: NARRATOR_SEGMENT };
    const hash = await cacheKey(spec);
    await deliver({ kind: "audio.synth.request", hash, spec });
    // FAILS today: billed at eleven_v3 although the world plays Flash v2.5.
    expect(outcome()).toEqual({ billed: 0, filed: [] });
  });

  it("text that is no segment of any narrator card in the chat log is refused", async () => {
    const spec = { ...SPEC, text: "Read this whole novel aloud, on the GM's credit." };
    const hash = await cacheKey(spec);
    await deliver({ kind: "audio.synth.request", hash, spec });
    // FAILS today: any text with an honest hash is billed and filed under that hash.
    expect(outcome()).toEqual({ billed: 0, filed: [] });
  });
});
