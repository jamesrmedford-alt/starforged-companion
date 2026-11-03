// STARFORGED COMPANION
// tests/unit/audioKeylessCanonicalGm.test.js
//
// A keyless canonical GM's Play fails at once and says where the key goes
// (issue #326 W80).
//
// With audio on and no ElevenLabs key — the default: the world and client
// switches are on, so every narrator card shows Play — the canonical GM's
// Play took the keyless branch and asked the canonical GM to synthesise the
// clip: itself. A socket emit never reaches its sender and only the canonical
// GM answers, so the button sat on "Loading…" for the 30 s request timeout,
// then told the GM to "ask the GM to play this card once". The canonical GM
// never relays to itself now: without a key it fails at once, naming
// Companion Settings → About.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/audio/cache.js", () => {
  const lookup = vi.fn(async () => null);
  return {
    cacheKey: vi.fn(async () => "c".repeat(64)),
    lookup,
    lookupDetailed: vi.fn(async (hash) => ({ path: (await lookup(hash)) ?? null, browsed: true })),
    write: vi.fn(),
  };
});
vi.mock("../../src/audio/elevenlabs.js", () => ({ synthesise: vi.fn() }));

import { onNarratorCardRendered, registerAudioSocket, _resetSynthStateForTests } from "../../src/audio/index.js";
import { lookup } from "../../src/audio/cache.js";
import { synthesise } from "../../src/audio/elevenlabs.js";
import { stopActivePlayback } from "../../src/audio/playback.js";
import { parseHTML, StubElement, setListenerResultSink } from "../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";
const PROSE = "The hull groans and holds.";
let savedHTMLElement, restoreUser, savedWarn;
const toasts = [];

beforeEach(() => {
  vi.useFakeTimers();
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  setListenerResultSink(() => {});
  _resetSynthStateForTests();
  vi.mocked(lookup).mockResolvedValue(null);
  vi.mocked(synthesise).mockReset();
  for (const [key, value] of Object.entries({
    "audio.enabled": true, "audio.clientEnabled": true,
    "audio.narratorVoiceId": "voice-narrator", "audio.npcVoiceId": "voice-npc",
  })) game.settings._store.set(`${MODULE_ID}.${key}`, value);
  game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);   // no key on this client
  game.socket._reset();
  registerAudioSocket();
  restoreUser = withUser({ isGM: true });   // tests/setup.js: one active GM, this client — the canonical GM
  toasts.length = 0;
  globalThis.ui ??= {};
  globalThis.ui.notifications ??= {};
  savedWarn = globalThis.ui.notifications.warn;
  globalThis.ui.notifications.warn = (msg) => { toasts.push(msg); };
});

afterEach(async () => {
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
  await stopActivePlayback();
  game.socket._reset();
  globalThis.ui.notifications.warn = savedWarn;
  restoreUser();
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
});

async function pressPlay(id = "msg-gm") {
  const message = { id, flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
  const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
  await onNarratorCardRendered(message, root);
  const play = root.querySelector('[data-action="audioPlayToggle"]');
  play.click();
  await vi.advanceTimersByTimeAsync(1);
  return play;
}

const synthRequests = () => (game.socket._emitted ?? []).filter(e => e.payload?.kind === "audio.synth.request");

describe("a keyless canonical GM presses Play (issue #326 W80)", () => {
  it("sends itself no synthesis request and fails at once", async () => {
    expectConsoleError(/audio toggle failed: Narrator audio needs an ElevenLabs API key/);
    const play = await pressPlay();
    expect({ selfRequests: synthRequests().length, state: play.getAttribute("data-state") })
      .toEqual({ selfRequests: 0, state: "error" });
    expect(synthesise).not.toHaveBeenCalled();
  });

  it("says the ElevenLabs key is missing and where it goes", async () => {
    expectConsoleError(/audio toggle failed/);
    const play = await pressPlay();
    expect(play.getAttribute("title")).toMatch(/needs an ElevenLabs API key — add one in Companion Settings → About/);
    expect(play.getAttribute("title")).not.toMatch(/ask the GM/);
    expect(toasts).toEqual([expect.stringMatching(/Narrator audio unavailable: Narrator audio needs an ElevenLabs API key/)]);
  });

  it("control: a clip another GM already cached still plays for the keyless GM", async () => {
    vi.mocked(lookup).mockResolvedValue(`worlds/test-world/audio/cc/${"c".repeat(64)}.mp3`);
    const play = await pressPlay("msg-cached");
    await vi.advanceTimersByTimeAsync(10);
    expect(play.getAttribute("data-state")).toBe("playing");
    expect(synthRequests()).toHaveLength(0);
  });

  it("control: a keyless player still asks the canonical GM for the clip", async () => {
    expectConsoleError(/audio toggle failed: Narrator audio isn't ready yet/);   // no GM answers here; the wait times out
    restoreUser();
    restoreUser = asPlayer();
    await pressPlay("msg-player");
    expect(synthRequests()).toHaveLength(1);
  });
});
