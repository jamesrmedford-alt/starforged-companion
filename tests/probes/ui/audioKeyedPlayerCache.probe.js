/**
 * Probe UI-10 — AUDIO-KEYED-PLAYER-REBILLS (DUPLICATE — a billed call per play)
 *
 * What the user does: a player who entered their own ElevenLabs key (the About
 * tab offers players the field: "the ElevenLabs key enables narrator audio on
 * your client") presses ▶ Play on a narrator card — one the GM has already
 * played, so the clip is in worlds/<world>/audio/. Or replays a card, or has
 * Auto-play on.
 *
 * What happens: buildPlayableSegments looks the clip up with cache.lookup →
 * FilePicker.browse, which a default Player may not use ("Use File Browser" is
 * Trusted Player and above — the reason U60 stopped keyless players browsing).
 * The refusal reads as a miss (cache.js:110 `catch { return null; }`), and only
 * hits are memoised, so EVERY play of every segment is synthesised again on
 * the player's key (billed per character) and its bytes re-sent to the GM for
 * a re-upload of a file that already exists. The help says "Re-narrating the
 * same prose plays instantly". Keyless players don't pay this: they ask the GM,
 * who answers with the path (U60).
 *
 * What should happen: a cached clip plays from the cache for a keyed Player too
 * (e.g. on a refused browse, ask the canonical GM for the path as the keyless
 * path does, before synthesising).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/audio/elevenlabs.js", () => ({ synthesise: vi.fn(async () => new Uint8Array([1, 2, 3])) }));

import { onNarratorCardRendered, registerAudioSocket } from "../../../src/audio/index.js";
import { cacheKey, _resetAudioCacheStateForTests } from "../../../src/audio/cache.js";
import { synthesise } from "../../../src/audio/elevenlabs.js";
import { stopActivePlayback } from "../../../src/audio/playback.js";
import { parseHTML, StubElement, setListenerResultSink } from "../../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";
const PROSE = "The hull groans and holds.";
const FP = () => foundry.applications.apps.FilePicker.implementation;

let savedHTMLElement, savedBrowse, savedCreateObjectURL, restoreUser;

beforeEach(async () => {
  silenceConsoleErrors();
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  setListenerResultSink(() => {});
  foundry.audio.Sound._reset();
  FP()._reset();
  _resetAudioCacheStateForTests();
  synthesise.mockClear();
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
  FP()._files.add(`worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`);

  // Foundry: FilePicker.browse needs FILES_BROWSE ("Use File Browser", Trusted Player+).
  savedBrowse = FP().browse;
  FP().browse = async (...args) => {
    if (!game.user.isGM && !game.user.isTrusted) throw new Error("You do not have permission to browse the host file system");
    return savedBrowse(...args);
  };
  game.socket._reset();
  registerAudioSocket();
  restoreUser = withUser({ isGM: false, id: "player-1", isTrusted: false });
});

afterEach(async () => {
  await stopActivePlayback();
  FP().browse = savedBrowse;
  URL.createObjectURL = savedCreateObjectURL;
  restoreUser();
  game.socket._reset();
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
  game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);
});

async function playCard(id) {
  const message = { id, flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
  const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
  await onNarratorCardRendered(message, root);
  root.querySelector('[data-action="audioPlayToggle"]').click();
  await vi.waitFor(() => expect(foundry.audio.Sound._instances.length + synthesise.mock.calls.length).toBeGreaterThan(0));
}

describe("UI-10 a keyed Player's Play of a cached clip", () => {
  it("control: a Trusted Player (may browse) plays the cached file and synthesises nothing", async () => {
    game.user.isTrusted = true;
    await playCard("msg-trusted");
    expect(synthesise).not.toHaveBeenCalled();
  });

  it("a default Player with an ElevenLabs key plays the cached clip without a new ElevenLabs call", async () => {
    await playCard("msg-player");
    // FAILS today: the refused browse reads as a miss — synthesised (billed) again.
    expect(synthesise).toHaveBeenCalledTimes(0);
  });
});
