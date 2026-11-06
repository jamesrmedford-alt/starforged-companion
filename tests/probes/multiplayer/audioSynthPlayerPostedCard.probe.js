/**
 * Eleventh audit — multiplayer probe (MP-D1, a decision row).
 *
 * Issue #331 X51 bounded a relayed `audio.synth.request` to "a narrator
 * card's line in the world's voices" (isNarratorCardClipKey,
 * src/audio/index.js): the GM synthesises — on its own ElevenLabs key — only
 * text some chat message's `flags[MODULE].narrationText` holds. The check
 * reads every message in the log and never asks who posted it. Any user may
 * create a chat message with any module flags (Foundry checks no flag
 * contents), so a player can post one whose `narrationText` is the novel X51's
 * own test refuses — "Read this whole novel aloud, on the GM's credit." —
 * and then ask for it: the bound passes and the GM's key is billed. The
 * accepted limitation for forged relays rests on "take effect values from
 * GM-authored cards" (known-issues, "Relay requester ids are client-asserted");
 * this bound takes them from any card.
 *
 * Asserted here: option A of the decision row — at a table with a keyed GM
 * (the only client that narrates then), a player-authored "narrator card"
 * keys no synthesis on the GM.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn(async ({ text }) => new TextEncoder().encode(text)) }));

import { registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from '../../../src/audio/index.js';
import { cacheKey, _resetAudioCacheStateForTests } from '../../../src/audio/cache.js';
import { synthesise } from '../../../src/audio/elevenlabs.js';

const MODULE_ID = 'starforged-companion';
const FP = () => foundry.applications.apps.FilePicker.implementation;
const WORLD = { narratorVoiceId: 'voice-narrator', npcVoiceId: 'voice-npc', modelId: 'eleven_flash_v2_5', speed: 1.0 };
const SPEC  = { voiceId: WORLD.narratorVoiceId, modelId: WORLD.modelId, speed: WORLD.speed };
const NOVEL = 'Read this whole novel aloud, on the GM\'s credit. '.repeat(40).trim();
// The stub client is the GM (tests/setup.js game.user — 'test-user-gm'), so it is canonical.
const GM = { id: 'test-user-gm', name: 'Gina', isGM: true, active: true };
const PLAYER = { id: 'pl-1', name: 'Pat', isGM: false, active: true };

let savedEmit, savedMessages;

beforeEach(() => {
  FP()._reset();
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  synthesise.mockClear();
  game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, 'sk_gm_key');
  game.settings._store.set(`${MODULE_ID}.audio.narratorVoiceId`, WORLD.narratorVoiceId);
  game.settings._store.set(`${MODULE_ID}.audio.npcVoiceId`, WORLD.npcVoiceId);
  game.settings._store.set(`${MODULE_ID}.audio.modelId`, WORLD.modelId);
  game.settings._store.set(`${MODULE_ID}.audio.speed`, WORLD.speed);
  // A keyed GM is at the table: every real narration is posted by her client.
  game.settings._store.set(`${MODULE_ID}.keyedGmUserIds`, [GM.id]);
  game.users._set([GM, PLAYER]);
  savedMessages = game.messages;
  game.socket._reset();
  savedEmit = game.socket.emit;
  game.socket.emit = () => {};
  registerAudioSocket();
});

afterEach(() => {
  game.socket.emit = savedEmit;
  game.socket._reset();
  game.messages = savedMessages;
  game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  for (const k of ['elevenLabsApiKey', 'audio.narratorVoiceId', 'audio.npcVoiceId', 'audio.modelId', 'audio.speed', 'keyedGmUserIds']) {
    game.settings._store.delete(`${MODULE_ID}.${k}`);
  }
});

async function deliver(payload) {
  for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h(payload);
}

/** A chat message as the given user posted it, carrying narrator flags. */
const posted = (id, author, narrationText) => ({
  id, author, _source: { author: author.id },
  flags: { [MODULE_ID]: { narratorCard: true, narrationText, sessionId: 's1' } },
});

describe('MP-D1 — a relayed synthesis keyed to a card a player posted', () => {
  it('control (X51): the novel on no card is refused — nothing billed', async () => {
    game.messages = { contents: [] };
    const spec = { ...SPEC, text: NOVEL };
    await deliver({ kind: 'audio.synth.request', hash: await cacheKey(spec), spec });
    expect(synthesise).not.toHaveBeenCalled();
  });

  it('control: a GM-posted narrator card\'s line is synthesised on the GM\'s key', async () => {
    game.messages = { contents: [posted('card-gm', GM, 'The hull groans and holds.')] };
    const spec = { ...SPEC, text: 'The hull groans and holds.' };
    await deliver({ kind: 'audio.synth.request', hash: await cacheKey(spec), spec });
    expect(synthesise).toHaveBeenCalledTimes(1);
  });

  it('the novel on a chat message a player posted with narrator flags is refused too', async () => {
    game.messages = { contents: [posted('card-pl', PLAYER, NOVEL)] };
    const spec = { ...SPEC, text: NOVEL };
    await deliver({ kind: 'audio.synth.request', hash: await cacheKey(spec), spec });
    // Correct (option A): nothing billed. Today the GM synthesises the novel.
    expect(synthesise.mock.calls.map(c => c[0].text.length)).toEqual([]);
  });
});
