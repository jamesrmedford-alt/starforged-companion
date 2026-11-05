/**
 * STARFORGED COMPANION
 * tests/unit/audioCacheNoSweep.test.js
 *
 * Issue #322 V16 (the audit's audioCacheCapNeverEnforced probe,
 * AUDIO-CACHE-CAP-DEAD): the help documented "Audio Cache Max — Maximum
 * on-disk size of the audio cache. Default: 200 MB", and every clip the
 * canonical GM cached fired evictIfOverflow(cap). The sweep browsed every
 * fan-out directory and sent a HEAD per cached file, then deleted through
 * `FilePicker.implementation.delete` — which Foundry v13's client FilePicker
 * does not have — so it evicted nothing, ever (on The Forge every size also
 * read 0), while the GM's client paid for a full-tree scan every 10 minutes of
 * synthesis. A module cannot delete files on v13, so the sweep, its setting
 * and its help row are gone; the help says the cache is trimmed by hand.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/audio/elevenlabs.js", () => ({ synthesise: vi.fn(async () => new ArrayBuffer(16)) }));

import * as cache from "../../src/audio/cache.js";
import { registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from "../../src/audio/index.js";
import { PAGES } from "../../src/help/helpJournal.js";
import { productionSources } from "../helpers/sourceScan.js";

const MODULE_ID = "starforged-companion";
const page = (name) => PAGES.find(p => p.name === name)?.text?.content ?? "";

describe("the audio cache has no size-cap sweep", () => {
  let savedFetch;
  beforeEach(() => {
    cache._resetAudioCacheStateForTests();
    foundry.applications.apps.FilePicker.implementation._reset();
    savedFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ ok: true, headers: { get: () => null } }));
  });
  afterEach(() => {
    globalThis.fetch = savedFetch;
    vi.restoreAllMocks();
  });

  it("the module exports no eviction sweep (Foundry v13's client cannot delete a file)", () => {
    expect(cache.evictIfOverflow).toBeUndefined();
    expect(foundry.applications.apps.FilePicker.implementation.delete).toBeUndefined();   // as in v13
  });

  // The sweep ran after the canonical GM cached a clip — its own synthesis for
  // a keyless player's request, or the bytes a keyed player relayed — so the
  // test drives those two paths (src/audio/index.js), not the bare write.
  it("the GM caching a clip, synthesised or relayed, scans nothing: no browse of the cache tree, no HEAD per file", async () => {
    const fp = foundry.applications.apps.FilePicker.implementation;
    for (const sub of ["aa", "bb"]) {
      fp._dirs.add(`worlds/test-world/audio/${sub}`);
      fp._files.add(`worlds/test-world/audio/${sub}/${sub.repeat(32)}.mp3`);
    }
    for (const [key, value] of Object.entries({
      "audio.enabled": true, "audio.clientEnabled": true, "elevenLabsApiKey": "sk_gm_key",
    })) game.settings._store.set(`${MODULE_ID}.${key}`, value);
    _resetSynthStateForTests();
    game.socket._reset();
    registerAudioSocket();
    const send = (payload) => { for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) h(payload); };
    const browse = vi.spyOn(fp, "browse");

    // Two narrator cards' lines: the GM synthesises (issue #331 X51) and files
    // a relayed clip of (issue #330 D11) only a narrator card's line in chat.
    game.settings._store.set(`${MODULE_ID}.audio.narratorVoiceId`, "voice-narrator");
    const savedMessages = game.messages;
    game.messages = { contents: [
      { id: "card-0", flags: { [MODULE_ID]: { narratorCard: true, narrationText: "The hull holds." } } },
      { id: "card-1", flags: { [MODULE_ID]: { narratorCard: true, narrationText: "The airlock cycles." } } },
    ] };
    const spec = { voiceId: "voice-narrator", modelId: "eleven_flash_v2_5", text: "The hull holds.", speed: 1 };
    send({ kind: "audio.synth.request", hash: await cache.cacheKey(spec), spec });   // the GM synthesises and caches
    await vi.waitFor(() => expect(fp._uploads).toHaveLength(1));
    // A keyed player's clip of the other card's line.
    const relayed = await cache.cacheKey({ voiceId: "voice-narrator", modelId: "eleven_flash_v2_5", text: "The airlock cycles.", speed: 1 });
    send({ kind: "audio.cache.write", hash: relayed, b64: "AQID" });
    await vi.waitFor(() => expect(fp._uploads).toHaveLength(2));
    game.messages = savedMessages;
    game.settings._store.delete(`${MODULE_ID}.audio.narratorVoiceId`);
    for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));          // a fire-and-forget sweep would run now

    expect(browse.mock.calls.filter(([, dir]) => dir === "worlds/test-world/audio")).toHaveLength(0);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ method: "HEAD" }));
    game.socket._reset();
  });

  it("no production code registers or reads the cap's setting, and the help no longer documents it", () => {
    const users = productionSources().filter(({ code }) => /audio\.cacheMaxBytes|evictIfOverflow/.test(code)).map(({ file }) => file);
    expect(users).toEqual([]);
    expect(page("Settings Reference")).not.toContain("Audio Cache Max");
    expect(page("Audio Narration")).toMatch(/never trimmed automatically/);
  });
});
