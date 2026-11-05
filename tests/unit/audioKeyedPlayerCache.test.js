// STARFORGED COMPANION
// tests/unit/audioKeyedPlayerCache.test.js
//
// A keyed default Player plays a cached clip from the cache, with no new
// ElevenLabs call (issue #326 W79).
//
// A player who entered their own ElevenLabs key presses Play on a card the GM
// already played — its clip is in worlds/<world>/audio/. buildPlayableSegments
// looked the clip up with cache.lookup → FilePicker.browse, which a default
// Player may not use ("Use File Browser" is Trusted Player and above). The
// refusal read as a miss and only hits are memoised, so EVERY play of every
// segment was synthesised again on the player's key (billed per character)
// and its bytes re-sent to the GM for a re-upload of a file that already
// existed. A keyed Player whose browse failed now asks the canonical GM for
// the cached path (`audio.cache.ask`, lookup only) before synthesising.
//
// One process plays both clients: the player's ask runs the REAL GM handler
// under the GM's identity, and the GM's answer is delivered back.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/audio/elevenlabs.js", () => ({ synthesise: vi.fn(async () => new Uint8Array([1, 2, 3])) }));

import { onNarratorCardRendered, registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from "../../src/audio/index.js";
import { cacheKey, _resetAudioCacheStateForTests } from "../../src/audio/cache.js";
import { synthesise } from "../../src/audio/elevenlabs.js";
import { stopActivePlayback } from "../../src/audio/playback.js";
import { parseHTML, StubElement, setListenerResultSink } from "../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";
const PROSE = "The hull groans and holds.";
const FP = () => foundry.applications.apps.FilePicker.implementation;
const GM = { isGM: true, id: "test-user-gm" };

let savedHTMLElement, savedBrowse, savedCreateObjectURL, savedEmit, restoreUser, cachedPath;
let gmAnswers = true;          // the canonical GM's client is connected and answering
const sent = [];

/** Deliver a socket payload to this process's handlers, as another client would. */
function deliver(payload) {
  setTimeout(() => (game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []).forEach(h => h(payload)), 0);
}

beforeEach(async () => {
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  setListenerResultSink(() => {});
  foundry.audio.Sound._reset();
  FP()._reset();
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  synthesise.mockClear();
  gmAnswers = true;
  sent.length = 0;
  savedCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = () => "blob:test";
  for (const [key, value] of Object.entries({
    "audio.enabled": true, "audio.clientEnabled": true,
    "audio.narratorVoiceId": "voice-narrator", "audio.npcVoiceId": "voice-npc",
    "audio.modelId": "eleven_flash_v2_5", "audio.speed": 1.0,
    elevenLabsApiKey: "sk_player_key",
  })) game.settings._store.set(`${MODULE_ID}.${key}`, value);

  // The GM already played the card: its clip is in the cache.
  const hash = await cacheKey({ text: PROSE, voiceId: "voice-narrator", modelId: "eleven_flash_v2_5", speed: 1.0 });
  cachedPath = `worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`;
  FP()._files.add(cachedPath);

  // Foundry: FilePicker.browse needs FILES_BROWSE ("Use File Browser", Trusted Player+).
  savedBrowse = FP().browse;
  FP().browse = async (...args) => {
    if (!game.user.isGM && !game.user.isTrusted) throw new Error("You do not have permission to browse the host file system");
    return savedBrowse(...args);
  };

  game.socket._reset();
  savedEmit = game.socket.emit;
  game.socket.emit = (event, payload) => {
    if (event !== AUDIO_SOCKET_NAME) return;
    sent.push(payload);
    if (payload?.kind === "audio.cache.ask" && gmAnswers) {
      // The canonical GM's client receives it: its real handler runs as the GM.
      setTimeout(async () => {
        const asTheGm = withUser(GM);
        try {
          for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h(payload);
        } finally { asTheGm(); }
      }, 0);
    } else if (payload?.kind === "audio.cache.found") {
      deliver(payload);
    }
  };
  registerAudioSocket();
  restoreUser = withUser({ isGM: false, id: "player-1", isTrusted: false });
});

afterEach(async () => {
  await stopActivePlayback();
  FP().browse = savedBrowse;
  URL.createObjectURL = savedCreateObjectURL;
  game.socket.emit = savedEmit;
  restoreUser();
  game.socket._reset();
  game.users._set([{ id: "test-user-gm", isGM: true, active: true }]);
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
  game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);
});

async function playCard(id, text = PROSE) {
  const message = { id, flags: { [MODULE_ID]: { narratorCard: true, narrationText: text } } };
  const root = parseHTML(`<div class="sf-narration-prose">${text}</div><button data-action="audioPlayToggle" hidden></button>`);
  await onNarratorCardRendered(message, root);
  const play = root.querySelector('[data-action="audioPlayToggle"]');
  play.click();
  await vi.waitFor(() => expect(["playing", "error"]).toContain(play.getAttribute("data-state")), { timeout: 6_000 });
  return play;
}

const kinds = () => sent.map(p => p.kind);

describe("a keyed Player's Play of a clip the GM cached (issue #326 W79)", () => {
  it("control: a Trusted Player (may browse) plays the cached file and asks nobody", async () => {
    game.user.isTrusted = true;
    const play = await playCard("msg-trusted");
    expect(play.getAttribute("data-state")).toBe("playing");
    expect(synthesise).not.toHaveBeenCalled();
    expect(kinds()).toEqual([]);
    expect(foundry.audio.Sound._instances.map(s => s.src)).toContain(cachedPath);
  });

  it("a default Player plays the cached clip: no new ElevenLabs call, no re-upload", async () => {
    const play = await playCard("msg-player");
    expect(play.getAttribute("data-state")).toBe("playing");
    expect(synthesise).not.toHaveBeenCalled();
    expect(kinds()).toEqual(["audio.cache.ask", "audio.cache.found"]);
    expect(kinds()).not.toContain("audio.cache.write");
    expect(foundry.audio.Sound._instances.map(s => s.src)).toContain(cachedPath);
  });

  it("replaying it asks again and still bills nothing", async () => {
    await playCard("msg-player-1");
    await stopActivePlayback();
    await playCard("msg-player-2");
    expect(synthesise).not.toHaveBeenCalled();
  });

  it("control: a clip that is not cached is synthesised once on the player's key and relayed", async () => {
    const text = "Prose the GM never played.";
    const play = await playCard("msg-uncached", text);
    expect(play.getAttribute("data-state")).toBe("playing");
    expect(synthesise).toHaveBeenCalledTimes(1);
    expect(synthesise.mock.calls[0][0].apiKey).toBe("sk_player_key");
    expect(kinds()).toEqual(["audio.cache.ask", "audio.cache.found", "audio.cache.write"]);
  });

  it("control: with no GM online the player synthesises at once, without asking", async () => {
    game.users._set([{ id: "test-user-gm", isGM: true, active: false }, { id: "player-1", isGM: false, active: true }]);
    const play = await playCard("msg-no-gm");
    expect(play.getAttribute("data-state")).toBe("playing");
    expect(synthesise).toHaveBeenCalledTimes(1);
    expect(kinds()).not.toContain("audio.cache.ask");
  });

  it("an unanswered ask times out and the player synthesises the clip", async () => {
    gmAnswers = false;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const message = { id: "msg-silent-gm", flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
      const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
      await onNarratorCardRendered(message, root);
      const play = root.querySelector('[data-action="audioPlayToggle"]');
      play.click();
      await vi.waitFor(() => expect(kinds()).toContain("audio.cache.ask"));
      expect(synthesise).not.toHaveBeenCalled();                 // waiting for the GM's answer
      await vi.advanceTimersByTimeAsync(4_100);
      await vi.waitFor(() => expect(play.getAttribute("data-state")).toBe("playing"));
      expect(synthesise).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the GM's answer to a cache ask (issue #326 W79)", () => {
  it("never synthesises: an uncached clip is answered with no path", async () => {
    restoreUser();
    restoreUser = withUser(GM);
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, "sk_gm_key");
    const hash = await cacheKey({ text: "Never played.", voiceId: "voice-narrator", modelId: "eleven_flash_v2_5", speed: 1.0 });
    for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h({ kind: "audio.cache.ask", hash });
    expect(synthesise).not.toHaveBeenCalled();
    expect(sent).toEqual([{ kind: "audio.cache.found", hash, path: null }]);
  });

  it("is not a done signal: a keyless player's synthesis wait is not released by it", async () => {
    // A keyless player waits on `audio.synth.done`; a `cache.found` with no
    // path for the same hash must not tell them the clip failed.
    restoreUser();
    restoreUser = asPlayer();
    game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);
    gmAnswers = false;
    const message = { id: "msg-keyless", flags: { [MODULE_ID]: { narratorCard: true, narrationText: "Fresh prose." } } };
    const root = parseHTML(`<div class="sf-narration-prose">Fresh prose.</div><button data-action="audioPlayToggle" hidden></button>`);
    await onNarratorCardRendered(message, root);
    const play = root.querySelector('[data-action="audioPlayToggle"]');
    play.click();
    await vi.waitFor(() => expect(kinds()).toContain("audio.synth.request"));
    const { hash } = sent.find(p => p.kind === "audio.synth.request");
    for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h({ kind: "audio.cache.found", hash, path: null });
    await new Promise(r => setTimeout(r, 20));
    expect(play.getAttribute("data-state")).toBe("loading");   // still waiting for the GM's synthesis
    // The GM's done names the clip's own cache slot (issue #337 Y42: only a
    // path the GM's cache could name is played).
    for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h({ kind: "audio.synth.done", hash, path: `worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3` });
    await vi.waitFor(() => expect(play.getAttribute("data-state")).toBe("playing"));
  });
});
