/**
 * Issue #337 Y42 AUDIO-DONE-PATH-UNBOUNDED — a clip path that comes back
 * from the GM is played only when the GM's audio cache could have named it.
 *
 * A keyless player presses Play (or has Auto-play on): their client asks the
 * canonical GM to synthesise the clip and waits up to 30 s for
 * `audio.synth.done`. Another logged-in user emitted from the console
 * `{ kind: "audio.synth.done", hash, path: "https://evil.example/…/<hash>.mp3" }`
 * — the hash is the card segment's clip key, which every client can compute —
 * and `resolvePendingSynth` accepted any string ending in `/<hash>.mp3`: the
 * waiting player's Sound loaded the forger's file as the narration, and the
 * GM's real done then found no waiter. The keyed Player's cache ask
 * (`audio.cache.found`, issue #326 W79) had the same suffix check. A relayed
 * value is bounded to what the sender could honestly send (rules/
 * reachability.md §8; the W81 / D11 / X51 rule, applied here to the two
 * relays that come back from the GM): the path must be the world's own
 * `worlds/<world>/audio/<xx>/<hash>.mp3` or a Forge Assets Library URL ending
 * in `/<hash>.mp3` (cache.js `isCachePathFor`). Anything else is no answer —
 * the waiter keeps waiting for the GM's, or times out to "not ready".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn(async () => new Uint8Array([1, 2, 3])) }));

import { onNarratorCardRendered, registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from '../../src/audio/index.js';
import { cacheKey, isCachePathFor, _resetAudioCacheStateForTests } from '../../src/audio/cache.js';
import { synthesise } from '../../src/audio/elevenlabs.js';
import { stopActivePlayback } from '../../src/audio/playback.js';
import { parseHTML, StubElement, setListenerResultSink } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const PROSE = 'The hull groans and holds.';
const FP = () => foundry.applications.apps.FilePicker.implementation;

let savedHTMLElement, savedEmit, savedBrowse, restoreUser, hash;
const sent = [];

beforeEach(async () => {
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  setListenerResultSink(() => {});
  foundry.audio.Sound._reset();
  FP()._reset();
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  synthesise.mockClear();
  sent.length = 0;
  for (const [key, value] of Object.entries({
    'audio.enabled': true, 'audio.clientEnabled': true,
    'audio.narratorVoiceId': 'voice-narrator', 'audio.npcVoiceId': 'voice-npc',
    'audio.modelId': 'eleven_flash_v2_5', 'audio.speed': 1.0,
  })) game.settings._store.set(`${MODULE_ID}.${key}`, value);
  game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);   // a keyless player
  hash = await cacheKey({ text: PROSE, voiceId: 'voice-narrator', modelId: 'eleven_flash_v2_5', speed: 1.0 });

  game.socket._reset();
  savedEmit = game.socket.emit;
  game.socket.emit = (event, payload) => { if (event === AUDIO_SOCKET_NAME) sent.push(payload); };
  savedBrowse = FP().browse;
  registerAudioSocket();
  restoreUser = asPlayer();
});

afterEach(async () => {
  await stopActivePlayback();
  FP().browse = savedBrowse;
  game.socket.emit = savedEmit;
  restoreUser();
  game.socket._reset();
  game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
});

/** Deliver a socket payload to this client's handlers, as another client's emit would. */
async function deliver(payload) {
  for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h(payload);
}

/** Press Play on a narrator card and wait until the client has asked the GM (`kind`) for the clip. */
async function pressPlay(id, kind = 'audio.synth.request') {
  const message = { id, flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
  const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
  await onNarratorCardRendered(message, root);
  const play = root.querySelector('[data-action="audioPlayToggle"]');
  play.click();
  await vi.waitFor(() => expect(sent.some(p => p.kind === kind && p.hash === hash)).toBe(true));
  return play;
}

const playedSources = () => foundry.audio.Sound._instances.map(s => s.src);
const cachePath = () => `worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`;
const settle = () => new Promise(r => setTimeout(r, 50));

describe('a keyless player plays only a path the GM\'s cache could name (issue #337 Y42)', () => {
  it('control: the honest done with the GM\'s cache path plays the clip', async () => {
    const play = await pressPlay('msg-honest');
    await deliver({ kind: 'audio.synth.done', hash, path: cachePath() });
    await vi.waitFor(() => expect(play.getAttribute('data-state')).toBe('playing'));
    expect(playedSources()).toContain(cachePath());
  });

  it('a done naming an external URL is not played — the player waits on, and plays the GM\'s real clip', async () => {
    const play = await pressPlay('msg-forged');
    const evil = `https://evil.example/anything/${hash}.mp3`;   // ends in /<hash>.mp3 — passed the old check
    await deliver({ kind: 'audio.synth.done', hash, path: evil });
    await settle();

    expect(playedSources()).not.toContain(evil);
    expect(play.getAttribute('data-state')).toBe('loading');      // still waiting for the GM

    await deliver({ kind: 'audio.synth.done', hash, path: cachePath() });   // the GM's real done
    await vi.waitFor(() => expect(play.getAttribute('data-state')).toBe('playing'));
    expect(playedSources()).toEqual([cachePath()]);
  });

  it('a path in the world\'s audio folder that is not this clip\'s slot is not played', async () => {
    const play = await pressPlay('msg-elsewhere');
    const other = hash.startsWith('00') ? '11' : '00';
    for (const path of [
      `worlds/test-world/audio/${other}/${hash}.mp3`,                         // another fanout folder
      `worlds/test-world/audio/${hash.slice(0, 2)}/../../../uploads/${hash}.mp3`,
      `worlds/other-world/audio/${hash.slice(0, 2)}/${hash}.mp3`,
      `/worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`,
    ]) await deliver({ kind: 'audio.synth.done', hash, path });
    await settle();

    expect(playedSources()).toEqual([]);
    expect(play.getAttribute('data-state')).toBe('loading');
  });

  it('control: The Forge\'s Assets Library URL for the clip plays', async () => {
    const play = await pressPlay('msg-forge');
    const forge = `https://assets.forge-vtt.com/5f1a2b3c4d/worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`;
    await deliver({ kind: 'audio.synth.done', hash, path: forge });
    await vi.waitFor(() => expect(play.getAttribute('data-state')).toBe('playing'));
    expect(playedSources()).toContain(forge);
  });

  it('control: the GM\'s "no clip" (path null) still releases the wait at once', async () => {
    expectConsoleError(/audio toggle failed: Narrator audio isn't ready yet/);
    const play = await pressPlay('msg-failed');
    await deliver({ kind: 'audio.synth.done', hash, path: null });
    await vi.waitFor(() => expect(play.getAttribute('data-state')).toBe('error'));
    expect(playedSources()).toEqual([]);
  });

  it('a keyed Player\'s cache ask: a forged `audio.cache.found` is no answer; the GM\'s plays the cached file', async () => {
    game.settings._store.set(`${MODULE_ID}.elevenLabsApiKey`, 'sk_player_key');
    // A default Player may not browse the cache (FilePicker "Use File Browser" is Trusted Player+).
    FP().browse = async () => { throw new Error('You do not have permission to browse the host file system'); };
    const play = await pressPlay('msg-keyed', 'audio.cache.ask');

    await deliver({ kind: 'audio.cache.found', hash, path: `https://evil.example/${hash}.mp3` });
    await settle();
    expect(playedSources()).toEqual([]);
    expect(play.getAttribute('data-state')).toBe('loading');

    await deliver({ kind: 'audio.cache.found', hash, path: cachePath() });
    await vi.waitFor(() => expect(play.getAttribute('data-state')).toBe('playing'));
    expect(playedSources()).toEqual([cachePath()]);
    expect(synthesise).not.toHaveBeenCalled();
  });
});

describe('isCachePathFor — the paths the audio cache can name for a clip', () => {
  it('the world\'s own slot for the clip, and a Forge Assets Library URL ending in its file name', () => {
    expect(isCachePathFor(hash, cachePath())).toBe(true);
    expect(isCachePathFor(hash, `https://assets.forge-vtt.com/u1/worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`)).toBe(true);
  });

  it('nothing else', () => {
    for (const path of [
      `https://assets.forge-vtt.com.evil.example/${hash}.mp3`,
      `http://assets.forge-vtt.com/${hash}.mp3`,
      `https://assets.forge-vtt.com/${hash}.mp3?x=1`,
      `https://evil.example/${hash}.mp3`,
      `blob:https://evil.example/${hash}.mp3`,
      `worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3x`,
      cachePath().replace(hash, hash.toUpperCase()),
      null, undefined, 42, {},
    ]) expect(isCachePathFor(hash, path), String(path)).toBe(false);
    expect(isCachePathFor('not-a-hash', 'worlds/test-world/audio/no/not-a-hash.mp3')).toBe(false);
  });
});
