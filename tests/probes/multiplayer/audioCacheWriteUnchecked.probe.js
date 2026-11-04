/**
 * PROBE — MP-05 AUDIO-CACHE-WRITE-UNCHECKED (ninth audit, area multiplayer) — NEEDS A DECISION
 *
 * What the user does: a keyed client that is not the canonical GM (a player
 * with their own ElevenLabs key, or the second GM) synthesises a clip and
 * relays its bytes to the canonical GM as `audio.cache.write { hash, b64 }`
 * (src/audio/index.js:365–378 commitToCache) so the GM files it in the
 * world's audio cache for everyone. Any client can emit the same message with
 * any hash and any bytes.
 *
 * What happens: handleCacheWrite (src/audio/index.js:429–437) decodes the
 * bytes and writes them as `<hash>.mp3` with no check at all — not that the
 * hash is a clip key of any narrator card's segment under the world's voice
 * settings, not whether that clip is already cached. FilePicker.upload
 * overwrites: a relayed write under a real narration's hash REPLACES the
 * audio every client plays for that card (a cache hit is never re-checked —
 * the very risk W81's comment names at :452–456, closed only for
 * `audio.synth.request`). The GM cannot verify the bytes against the hash —
 * the key is the text's, not the audio's.
 *
 * What should happen: rules/reachability.md §8 — a relayed payload is bounded
 * to what the UI could have produced. Two options, which is why this needs a
 * decision:
 *   A. keep the path, bound it: accept a write only for a hash that is the
 *      clip key of a segment of a narrator card in chat under the world's
 *      voice / model / speed, and never over an existing clip (an honest
 *      duplicate write is a no-op — the keyed player already plays its own
 *      blob URL);
 *   B. retire the path: since issue #326 W79 a keyed player asks the GM for
 *      the cached clip first and plays its own synthesis from a blob URL;
 *      the GM-side cache write buys other clients a cache hit only at the
 *      cost of trusting relayed bytes. Drop `audio.cache.write`; a keyed GM
 *      caches on its own Play.
 * Either way an existing clip is never overwritten by a relayed write, and a
 * hash that is no card segment's key is never filed — the two assertions.
 *
 * Controls: the GM's own synthesis is filed once; a second honest relayed
 * write of an uncached clip is filed (today's happy path).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/audio/elevenlabs.js", () => ({ synthesise: vi.fn(async ({ text }) => new TextEncoder().encode(text)) }));

import { registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from "../../../src/audio/index.js";
import { cacheKey, write as cacheWrite, _resetAudioCacheStateForTests } from "../../../src/audio/cache.js";

const MODULE_ID = "starforged-companion";
const FP = () => foundry.applications.apps.FilePicker.implementation;

const WORLD = { narratorVoiceId: "voice-narrator", npcVoiceId: "voice-npc", modelId: "eleven_flash_v2_5", speed: 1.0 };
const SPEC  = { voiceId: WORLD.narratorVoiceId, modelId: WORLD.modelId, speed: WORLD.speed };
const CARD_PROSE = "The hull groans and holds.";

let savedEmit;
let savedMessages;

beforeEach(() => {
  FP()._reset();
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, "sk_gm_key");
  game.settings._store.set(`${MODULE_ID}.audio.narratorVoiceId`, WORLD.narratorVoiceId);
  game.settings._store.set(`${MODULE_ID}.audio.npcVoiceId`, WORLD.npcVoiceId);
  game.settings._store.set(`${MODULE_ID}.audio.modelId`, WORLD.modelId);
  game.settings._store.set(`${MODULE_ID}.audio.speed`, WORLD.speed);
  savedMessages = game.messages;
  game.messages = { contents: [{ id: "card-1", flags: { [MODULE_ID]: { narratorCard: true, narrationText: CARD_PROSE, sessionId: "s1" } } }] };
  game.socket._reset();
  savedEmit = game.socket.emit;
  game.socket.emit = () => {};
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

async function deliver(payload) {
  for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h(payload);
}

const b64 = (text) => btoa(text);
const uploadsOf = (hash) => FP()._uploads.filter(u => u.file.name === `${hash}.mp3`);

describe("MP-05 a relayed audio cache write is bounded to what the UI could send", () => {
  it("control: an honest relayed write of an uncached card segment is filed once", async () => {
    const hash = await cacheKey({ ...SPEC, text: CARD_PROSE });
    await deliver({ kind: "audio.cache.write", hash, mime: "audio/mpeg", b64: b64("real mp3 bytes") });
    expect(uploadsOf(hash)).toHaveLength(1);
  });

  it("a relayed write never replaces a clip that is already cached (the narration every client plays)", async () => {
    const hash = await cacheKey({ ...SPEC, text: CARD_PROSE });
    await cacheWrite(hash, new TextEncoder().encode("the real narration"));   // the GM's own clip, cached
    expect(uploadsOf(hash)).toHaveLength(1);

    await deliver({ kind: "audio.cache.write", hash, mime: "audio/mpeg", b64: b64("something else entirely") });
    // FAILS today: the relayed bytes are uploaded over the cached clip (a second upload of <hash>.mp3).
    expect(uploadsOf(hash)).toHaveLength(1);
  });

  it("a hash that is no narrator card segment's clip key under the world's voices is not filed", async () => {
    const forged = await cacheKey({ ...SPEC, text: "Not a line of any card in this chat." });
    await deliver({ kind: "audio.cache.write", hash: forged, mime: "audio/mpeg", b64: b64("bytes") });
    // FAILS today: any 64-hex hash is filed.
    expect(uploadsOf(forged)).toHaveLength(0);
  });
});
