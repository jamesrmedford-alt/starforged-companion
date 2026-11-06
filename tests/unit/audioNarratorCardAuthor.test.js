/**
 * Only a GM's narrator card is a narrator card for audio while a keyed GM is
 * connected (issue #342 D8, AUDIO-SYNTH-BOUND-ANY-AUTHOR — the maintainer's
 * option A).
 *
 * Issue #331 X51 bounded a relayed `audio.synth.request` to "a narrator
 * card's line in the world's voices" (isNarratorCardClipKey,
 * src/audio/index.js): the GM synthesises — on its own ElevenLabs key — only
 * text some chat message's `flags[MODULE].narrationText` holds. The check
 * read every message in the log and never asked who posted it. Any user may
 * create a chat message with any module flags, so a player could post one
 * whose `narrationText` is the novel X51's own test refuses, then ask for it:
 * the bound passed and the GM's key was billed. Nor was the relay the only
 * door: such a message got a Play button on every client
 * (onNarratorCardRendered checked no author), and the GM's own Play — or its
 * auto-play — synthesised it on the GM's key with no clip-key bound at all.
 * With a keyed GM connected (hasKeyedActiveGM — the only client that narrates
 * then) only a GM-authored message counts as a narrator card: its Play
 * button, its auto-play, the clip key a relayed synthesis or cache write is
 * checked against. A player-authored one counts only when no keyed GM is
 * connected (a RUN_ON.CLAUDE command or oracle follow-up narrated on the
 * author's own key), its text no longer than the narrator can return.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn(async ({ text }) => new TextEncoder().encode(text)) }));

import { registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests, onNarratorCardRendered } from '../../src/audio/index.js';
import { cacheKey, _resetAudioCacheStateForTests } from '../../src/audio/cache.js';
import { synthesise } from '../../src/audio/elevenlabs.js';
import { parseHTML, StubElement } from '../helpers/cardDom.js';
import { markGestureReceived, stopActivePlayback } from '../../src/audio/playback.js';

const MODULE_ID = 'starforged-companion';
const FP = () => foundry.applications.apps.FilePicker.implementation;
const WORLD = { narratorVoiceId: 'voice-narrator', npcVoiceId: 'voice-npc', modelId: 'eleven_flash_v2_5', speed: 1.0 };
const SPEC  = { voiceId: WORLD.narratorVoiceId, modelId: WORLD.modelId, speed: WORLD.speed };
const NOVEL = 'Read this whole novel aloud, on the GM\'s credit. '.repeat(40).trim();
const LINE  = 'The hull groans and holds.';
// The stub client is the GM (tests/setup.js game.user — 'test-user-gm'), so it is canonical.
const GM = { id: 'test-user-gm', name: 'Gina', isGM: true, active: true };
const PLAYER = { id: 'pl-1', name: 'Pat', isGM: false, active: true };

let savedEmit, savedMessages, savedHTMLElement;

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
  game.settings._store.set(`${MODULE_ID}.audio.enabled`, true);
  game.settings._store.set(`${MODULE_ID}.audio.clientEnabled`, true);
  // A keyed GM is at the table: every real narration is posted by her client.
  game.settings._store.set(`${MODULE_ID}.keyedGmUserIds`, [GM.id]);
  game.users._set([GM, PLAYER]);
  savedMessages = game.messages;
  game.socket._reset();
  savedEmit = game.socket.emit;
  game.socket.emit = () => {};
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  registerAudioSocket();
});

afterEach(() => {
  game.socket.emit = savedEmit;
  game.socket._reset();
  game.messages = savedMessages;
  globalThis.HTMLElement = savedHTMLElement;
  game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  for (const k of ['elevenLabsApiKey', 'audio.narratorVoiceId', 'audio.npcVoiceId', 'audio.modelId', 'audio.speed',
    'audio.enabled', 'audio.clientEnabled', 'audio.autoplay', 'keyedGmUserIds', 'narrationMaxTokens']) {
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

const askFor = async (text) => {
  const spec = { ...SPEC, text };
  await deliver({ kind: 'audio.synth.request', hash: await cacheKey(spec), spec });
};

/** The card as onNarratorCardRendered binds it: is its Play button shown? */
async function playButtonShown(message) {
  const root = parseHTML(
    `<div class="sf-narration-prose">${message.flags[MODULE_ID].narrationText}</div>` +
    '<button data-action="audioPlayToggle" hidden></button><button data-action="audioStop" hidden></button>',
  );
  await onNarratorCardRendered(message, root);
  return !root.querySelector('[data-action="audioPlayToggle"]').hasAttribute('hidden');
}

describe('a relayed synthesis keyed to a card a player posted', () => {
  it('control (X51): the novel on no card is refused — nothing billed', async () => {
    game.messages = { contents: [] };
    await askFor(NOVEL);
    expect(synthesise).not.toHaveBeenCalled();
  });

  it('control: a GM-posted narrator card\'s line is synthesised on the GM\'s key', async () => {
    game.messages = { contents: [posted('card-gm', GM, LINE)] };
    await askFor(LINE);
    expect(synthesise).toHaveBeenCalledTimes(1);
  });

  it('the novel on a chat message a player posted with narrator flags is refused too', async () => {
    game.messages = { contents: [posted('card-pl', PLAYER, NOVEL)] };
    await askFor(NOVEL);
    // The GM synthesised the 1,959-character novel.
    expect(synthesise.mock.calls.map(c => c[0].text.length)).toEqual([]);
  });

  it('with no keyed GM connected, a player\'s card counts — narrated on their own key (RUN_ON.CLAUDE)', async () => {
    game.settings._store.set(`${MODULE_ID}.keyedGmUserIds`, []);
    game.messages = { contents: [posted('card-pl', PLAYER, LINE)] };
    await askFor(LINE);
    expect(synthesise).toHaveBeenCalledTimes(1);
  });

  it('…but not one longer than the narrator can return', async () => {
    game.settings._store.set(`${MODULE_ID}.keyedGmUserIds`, []);
    game.settings._store.set(`${MODULE_ID}.narrationMaxTokens`, 300);   // the panel's minimum: ~1,200 characters
    game.messages = { contents: [posted('card-pl', PLAYER, NOVEL)] };
    await askFor(NOVEL);
    expect(synthesise).not.toHaveBeenCalled();
  });
});

describe('the other doors: the card\'s Play button and auto-play', () => {
  it('a player-posted narrator card shows no Play button while a keyed GM is connected', async () => {
    expect(await playButtonShown(posted('card-pl', PLAYER, NOVEL))).toBe(false);
  });

  it('…and is not auto-played on the GM\'s client', async () => {
    game.settings._store.set(`${MODULE_ID}.audio.autoplay`, true);
    markGestureReceived();   // the GM has clicked this session: auto-play would start at once
    const message = { ...posted('card-pl-auto', PLAYER, NOVEL), timestamp: Date.now() };
    await playButtonShown(message);
    await new Promise(r => setTimeout(r, 0));
    // The GM's auto-play synthesised the novel on the GM's key, with no bound at all.
    expect(synthesise).not.toHaveBeenCalled();
    await stopActivePlayback();
  });

  it('control: a GM-posted narrator card shows its Play button', async () => {
    expect(await playButtonShown(posted('card-gm', GM, LINE))).toBe(true);
  });

  it('control: with no keyed GM connected, a player-posted card shows its Play button', async () => {
    game.settings._store.set(`${MODULE_ID}.keyedGmUserIds`, []);
    expect(await playButtonShown(posted('card-pl', PLAYER, LINE))).toBe(true);
  });
});

describe('the relayed cache write is bound the same way', () => {
  it('a keyless GM files no clip keyed to a player-posted card while a keyed GM is connected', async () => {
    // A keyless GM files relayed clips (issue #338 D10); the keyed (Claude) GM is connected.
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, '');
    game.messages = { contents: [posted('card-pl', PLAYER, LINE)] };
    const hash = await cacheKey({ ...SPEC, text: LINE });
    await deliver({ kind: 'audio.cache.write', hash, mime: 'audio/mpeg', b64: btoa('forged bytes') });
    expect(FP()._uploads.filter(u => u.file.name === `${hash}.mp3`)).toHaveLength(0);
  });

  it('control: …and files one keyed to a GM-posted card', async () => {
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, '');
    game.messages = { contents: [posted('card-gm', GM, LINE)] };
    const hash = await cacheKey({ ...SPEC, text: LINE });
    await deliver({ kind: 'audio.cache.write', hash, mime: 'audio/mpeg', b64: btoa('the bytes') });
    expect(FP()._uploads.filter(u => u.file.name === `${hash}.mp3`)).toHaveLength(1);
  });
});
