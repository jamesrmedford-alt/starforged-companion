/* global expectConsoleError, withUser */
// STARFORGED COMPANION
// tests/unit/audioKeyedClientAsksKeyedGm.test.js
//
// Known-issues AUDIO-KEYED-NONCANONICAL-DUP — a keyed client that was not the
// audio GM synthesised a clip on its own key while the audio GM could make
// the same clip on its own: the in-flight map is per client, so both billed
// it, and a keyed GM files no relayed bytes (issue #338 D10), so the GM's
// next Play made it once more. A keyed client now asks the audio GM to make
// the clip whenever a GM holding an ElevenLabs key is connected — "calls run
// where a key lives, exactly once" — and makes it on its own key only when
// none is, or when the GM could not serve it.
//
// Known-issues AUDIO-KEYED-PLAYER-STORAGE-REFUSED (issue #345 AA61's
// residual) — a keyed default Player's `audio.cache.ask` did not retry the
// upload of a clip the GM held after the world's storage refused it, so the
// player synthesised it again on their own key. The GM now answers the ask by
// uploading its held clip — its bytes, nothing synthesised.
//
// One process plays both clients: the player's socket message runs the REAL
// GM handler under the GM's identity (and the GM's own ElevenLabs key — each
// browser's key is its own), and the GM's answer is delivered back.

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
const GM = { isGM: true, id: "test-user-gm", isTrusted: true };
const PLAYER = { isGM: false, id: "player-1", isTrusted: false };
// Each browser holds its own ElevenLabs key (a client setting).
const KEYS = { "test-user-gm": "sk_gm_key", "player-1": "sk_player_key" };

let savedHTMLElement, savedBrowse, savedUpload, savedEmit, savedGet, savedMessages, restoreUser, cachedPath;
let gmAnswers = true;
const sent = [];
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); };

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
  synthesise.mockReset();
  synthesise.mockImplementation(async () => new Uint8Array([1, 2, 3]));
  gmAnswers = true;
  sent.length = 0;
  for (const [key, value] of Object.entries({
    "audio.enabled": true, "audio.clientEnabled": true,
    "audio.narratorVoiceId": "voice-narrator", "audio.npcVoiceId": "voice-npc",
    "audio.modelId": "eleven_flash_v2_5", "audio.speed": 1.0,
  })) game.settings._store.set(`${MODULE_ID}.${key}`, value);
  savedGet = game.settings.get;
  game.settings.get = function (mod, key) {
    if (mod === MODULE_ID && key === "elevenLabsApiKey") return KEYS[game.user.id] ?? "";
    return savedGet.call(this, mod, key);
  };
  game.users._set([{ id: GM.id, isGM: true, active: true }, { id: PLAYER.id, isGM: false, active: true }]);

  const hash = await cacheKey({ text: PROSE, voiceId: "voice-narrator", modelId: "eleven_flash_v2_5", speed: 1.0 });
  cachedPath = `worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`;

  // The narrator card the GM posted, in chat on every client.
  savedMessages = game.messages;
  game.messages = { contents: [{ id: "msg-1", author: GM.id, flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } }] };

  // FilePicker.browse needs "Use File Browser" (Trusted Player and above).
  savedBrowse = FP().browse;
  FP().browse = async (...args) => {
    if (!game.user.isGM && !game.user.isTrusted) throw new Error("You do not have permission to browse the host file system");
    return savedBrowse(...args);
  };
  savedUpload = FP().upload;

  game.socket._reset();
  savedEmit = game.socket.emit;
  game.socket.emit = (event, payload) => {
    if (event !== AUDIO_SOCKET_NAME) return;
    sent.push(payload);
    if ((payload?.kind === "audio.cache.ask" || payload?.kind === "audio.synth.request") && gmAnswers) {
      // The GM's client receives it: its real handler runs as the GM.
      setTimeout(async () => {
        const asTheGm = withUser(GM);
        try {
          for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h(payload);
        } finally { asTheGm(); }
      }, 0);
    } else if (payload?.kind === "audio.cache.found" || payload?.kind === "audio.synth.done") {
      deliver(payload);
    }
  };
  registerAudioSocket();
  restoreUser = withUser(PLAYER);
});

afterEach(async () => {
  await stopActivePlayback();
  await flush();
  FP().browse = savedBrowse;
  FP().upload = savedUpload;
  game.settings.get = savedGet;
  game.socket.emit = savedEmit;
  game.messages = savedMessages;
  restoreUser();
  game.socket._reset();
  game.users._set([{ id: "test-user-gm", isGM: true, active: true }]);
  game.settings._store.delete(`${MODULE_ID}.audioKeyedGmUserIds`);
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
});

async function playCard(id) {
  const message = { id, author: GM.id, flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
  const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
  await onNarratorCardRendered(message, root);
  const play = root.querySelector('[data-action="audioPlayToggle"]');
  play.click();
  await vi.waitFor(() => expect(["playing", "error"]).toContain(play.getAttribute("data-state")), { timeout: 6_000 });
  return play;
}

const billedTo = () => synthesise.mock.calls.map(c => c[0].apiKey);
const kinds = () => sent.map(p => p.kind);

describe("AUDIO-KEYED-NONCANONICAL-DUP — a keyed client asks the keyed audio GM, once", () => {
  beforeEach(() => {
    // The GM's game told the table it holds an ElevenLabs key (issue #342 Z67).
    game.settings._store.set(`${MODULE_ID}.audioKeyedGmUserIds`, [GM.id]);
  });

  it("a keyed player's Play is made by the GM, once — and the GM's own Play then plays the cached clip", async () => {
    const play = await playCard("msg-player");
    expect(play.getAttribute("data-state")).toBe("playing");
    // The player made it on their own key, and the GM made it again.
    expect(billedTo()).toEqual(["sk_gm_key"]);
    expect(kinds()).toContain("audio.synth.request");
    expect(kinds()).not.toContain("audio.cache.write");
    expect(foundry.audio.Sound._instances.map(s => s.src)).toContain(cachedPath);

    await stopActivePlayback();
    const restore = withUser(GM);
    try {
      const gmPlay = await playCard("msg-gm");
      expect(gmPlay.getAttribute("data-state")).toBe("playing");
    } finally { restore(); }
    expect(billedTo(), "the GM's Play bills nothing more").toEqual(["sk_gm_key"]);
  });

  it("a keyed player the GM could not serve makes the clip on their own key", async () => {
    // The GM's own ElevenLabs call fails (its quota spent): it answers "no clip".
    expectConsoleError(/audio GM-synthesis \(keyless request\) failed/);
    synthesise.mockImplementation(async ({ apiKey }) => {
      if (apiKey === "sk_gm_key") throw new Error("ElevenLabs 401: quota exceeded");
      return new Uint8Array([1, 2, 3]);
    });
    const play = await playCard("msg-gm-cannot");
    expect(play.getAttribute("data-state")).toBe("playing");
    expect(billedTo()).toEqual(["sk_gm_key", "sk_player_key"]);
    expect(kinds()).toContain("audio.synth.request");
  });
});

describe("AUDIO-KEYED-PLAYER-STORAGE-REFUSED — the GM answers a cache ask by uploading its held clip", () => {
  it("a clip the GM made whose upload was refused is uploaded again for the asking player — nothing billed twice", async () => {
    // The GM plays the card first; the world's storage refuses that upload.
    let refuse = 1;
    FP().upload = vi.fn(async (...args) => (refuse-- > 0 ? false : savedUpload(...args)));
    const restore = withUser(GM);
    try {
      expect((await playCard("msg-gm-first")).getAttribute("data-state")).toBe("playing");
      await flush();
    } finally { restore(); }
    await stopActivePlayback();
    expect(billedTo(), "the GM made it (setup)").toEqual(["sk_gm_key"]);
    expect(FP()._files.has(cachedPath), "not saved (setup)").toBe(false);

    // A keyed default Player (no audio-keyed GM advertised: the player's ask path).
    const play = await playCard("msg-player-ask");

    expect(play.getAttribute("data-state")).toBe("playing");
    // The ask found nothing, and the player made it again on their own key.
    expect(billedTo()).toEqual(["sk_gm_key"]);
    expect(kinds()).toEqual(["audio.cache.ask", "audio.cache.found"]);
    expect(FP()._files.has(cachedPath)).toBe(true);
    expect(foundry.audio.Sound._instances.map(s => s.src)).toContain(cachedPath);
  });
});
