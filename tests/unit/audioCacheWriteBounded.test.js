/**
 * Issue #330 D11 — a relayed audio cache write is bounded.
 *
 * A keyed client that is not the canonical GM relays its synthesised clip as
 * `audio.cache.write { hash, b64 }` (commitToCache) so the GM files it for
 * everyone. handleCacheWrite wrote the bytes as `<hash>.mp3` with no check:
 * not that the hash is a clip key of any narrator card's segment under the
 * world's voices, nor whether the clip was already cached — and
 * FilePicker.upload overwrites, so a forged write under a real narration's
 * hash replaced the audio every client plays for that card (the risk issue
 * #326 W81 closed for `audio.synth.request` only). Decided (option A): keep
 * the path, bound it — only a narrator card segment's key, never over an
 * existing clip.
 *
 * The GM here holds no ElevenLabs key: the relay serves a keyed player at a
 * keyless GM's table, and a GM with a key files no relayed clip at all
 * (issue #338 D10, tests/unit/audioCacheRelayKeyedGm.test.js).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/audio/elevenlabs.js", () => ({ synthesise: vi.fn(async ({ text }) => new TextEncoder().encode(text)) }));

import { registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from "../../src/audio/index.js";
import { cacheKey, write as cacheWrite, _resetAudioCacheStateForTests } from "../../src/audio/cache.js";

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
  game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);   // a keyless GM (issue #338 D10)
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

describe("issue #330 D11 — a relayed audio cache write is bounded to what the UI could send", () => {
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
    expect(uploadsOf(hash)).toHaveLength(1);
  });

  it("a hash that is no narrator card segment's clip key under the world's voices is not filed", async () => {
    const forged = await cacheKey({ ...SPEC, text: "Not a line of any card in this chat." });
    await deliver({ kind: "audio.cache.write", hash: forged, mime: "audio/mpeg", b64: b64("bytes") });
    expect(uploadsOf(forged)).toHaveLength(0);
  });

  it("a segment of an X-carded card is not filed — its card plays nothing", async () => {
    game.messages = { contents: [{ id: "card-1", flags: { [MODULE_ID]: { narratorCard: true, narrationText: CARD_PROSE, xCarded: true } } }] };
    const hash = await cacheKey({ ...SPEC, text: CARD_PROSE });
    await deliver({ kind: "audio.cache.write", hash, mime: "audio/mpeg", b64: b64("bytes") });
    expect(uploadsOf(hash)).toHaveLength(0);
  });

  it("an NPC line of a card is filed under the world's NPC voice — and not under another voice", async () => {
    game.messages = { contents: [{ id: "card-2", flags: { [MODULE_ID]: { narratorCard: true, narrationText: 'She leans in. <npc>"Pay up."</npc>' } } }] };
    const npcHash = await cacheKey({ voiceId: WORLD.npcVoiceId, modelId: WORLD.modelId, speed: WORLD.speed, text: '"Pay up."' });
    const wrong   = await cacheKey({ voiceId: "voice-other", modelId: WORLD.modelId, speed: WORLD.speed, text: '"Pay up."' });
    await deliver({ kind: "audio.cache.write", hash: wrong, mime: "audio/mpeg", b64: b64("bytes") });
    await deliver({ kind: "audio.cache.write", hash: npcHash, mime: "audio/mpeg", b64: b64("bytes") });
    expect(uploadsOf(wrong)).toHaveLength(0);
    expect(uploadsOf(npcHash)).toHaveLength(1);
  });

  it("a second honest write of the same clip is not filed again", async () => {
    const hash = await cacheKey({ ...SPEC, text: CARD_PROSE });
    await deliver({ kind: "audio.cache.write", hash, mime: "audio/mpeg", b64: b64("first") });
    await deliver({ kind: "audio.cache.write", hash, mime: "audio/mpeg", b64: b64("second") });
    expect(uploadsOf(hash)).toHaveLength(1);
  });
});
