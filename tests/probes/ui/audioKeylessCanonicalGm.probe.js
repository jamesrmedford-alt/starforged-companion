/**
 * Probe UI-12 — AUDIO-KEYLESS-GM-WAITS-ON-ITSELF (UX)
 *
 * What the user does: the GM (the canonical GM — solo, or the table's only GM)
 * has audio on but has not entered an ElevenLabs key yet — the default: the
 * world and client switches are on, so every narrator card shows ▶ Play — and
 * presses Play.
 *
 * What happens: buildPlayableSegments takes the keyless branch
 * (audio/index.js:263) and calls requestGmSynthesis, which emits
 * `audio.synth.request` to the canonical GM — this very client. A socket emit
 * never reaches its sender, and only the canonical GM answers, so nobody
 * answers: the button sits on "Loading…" for SYNTH_REQUEST_TIMEOUT_MS (30 s),
 * then the GM is told "Narrator audio isn't ready yet — ask the GM to play this
 * card once, then try again." The same dead request goes out at a two-GM table
 * whose canonical GM is keyless — players are told no GM with a key is online
 * while the other GM has one.
 *
 * What should happen: the canonical GM never relays to itself; without a key
 * it fails at once and says the ElevenLabs key is missing (About tab).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/audio/cache.js", () => ({ cacheKey: vi.fn(async () => "c".repeat(64)), lookup: vi.fn(async () => null), write: vi.fn() }));
vi.mock("../../../src/audio/elevenlabs.js", () => ({ synthesise: vi.fn() }));

import { onNarratorCardRendered, registerAudioSocket, _resetSynthStateForTests } from "../../../src/audio/index.js";
import { stopActivePlayback } from "../../../src/audio/playback.js";
import { parseHTML, StubElement, setListenerResultSink } from "../../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";
const PROSE = "The hull groans and holds.";
let savedHTMLElement;

beforeEach(() => {
  silenceConsoleErrors();
  vi.useFakeTimers();
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  setListenerResultSink(() => {});
  _resetSynthStateForTests();
  for (const [key, value] of Object.entries({
    "audio.enabled": true, "audio.clientEnabled": true,
    "audio.narratorVoiceId": "voice-narrator", "audio.npcVoiceId": "voice-npc",
  })) game.settings._store.set(`${MODULE_ID}.${key}`, value);
  game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);   // keyless GM
  game.socket._reset();
  registerAudioSocket();
  // tests/setup.js: one active GM, this client — the canonical GM.
  game.user.isGM = true;
});

afterEach(async () => {
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
  await stopActivePlayback();
  game.socket._reset();
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
});

async function pressPlay() {
  const message = { id: "msg-gm", flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
  const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
  await onNarratorCardRendered(message, root);
  const play = root.querySelector('[data-action="audioPlayToggle"]');
  play.click();
  await vi.advanceTimersByTimeAsync(1);
  return play;
}

describe("UI-12 a keyless canonical GM's Play", () => {
  it("does not send itself a synthesis request, and fails at once", async () => {
    const play = await pressPlay();
    await vi.advanceTimersByTimeAsync(1000);
    const selfRequests = (game.socket._emitted ?? []).filter(e => e.payload?.kind === "audio.synth.request").length;
    // FAILS today: one request to itself, and the button is still "loading" a second later.
    expect({ selfRequests, state: play.getAttribute("data-state") }).toEqual({ selfRequests: 0, state: "error" });
  });

  it("control: today the error comes only after the 30 s request timeout, telling the GM to ask the GM", async () => {
    const play = await pressPlay();
    await vi.advanceTimersByTimeAsync(29_000);
    expect(play.getAttribute("data-state")).toBe("loading");
    await vi.advanceTimersByTimeAsync(1_500);
    expect(play.getAttribute("data-state")).toBe("error");
    expect(play.getAttribute("title")).toMatch(/ask the GM to play this card once/);
  });
});
