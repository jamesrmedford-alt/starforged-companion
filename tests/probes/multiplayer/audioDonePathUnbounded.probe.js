/**
 * PROBE — MP-03 AUDIO-DONE-PATH-UNBOUNDED (tenth audit, area multiplayer)
 *
 * What the user does: a keyless player (no ElevenLabs key — the ordinary
 * player, who "never needs their own key") presses Play on a narrator card,
 * or has Auto-play on. Their client asks the canonical GM to synthesise the
 * clip (`audio.synth.request`) and waits up to 30 s for `audio.synth.done`
 * (src/audio/index.js:588-597). Another logged-in user at the table emits,
 * from the browser console or a macro, `{ kind: "audio.synth.done", hash,
 * path: "https://evil.example/<hash>.mp3" }` — the hash is the card
 * segment's clip key, computable by anyone from the card's text and the
 * world's voice settings.
 *
 * What happens: `resolvePendingSynth` (:577-583) accepts any string that
 * ends in `/<hash>.mp3` and hands it to the PlaybackSession, whose Sound
 * loads absolute URLs ("accepts Foundry-relative paths in addition to
 * absolute URLs", cache.js:83). The waiting player plays the forger's audio
 * in place of the narration, and the GM's real `done`, arriving later,
 * finds no waiter. With Auto-play on every narrator card opens this window
 * on every keyless client, so a forger who watches the chat can replace the
 * table's narration audio at will. `audio.cache.found` (:552-558, the keyed
 * Player's W79 ask) has the same check.
 *
 * What should happen: a relayed value is bounded to what the UI could send
 * (rules/reachability.md §8; decisions.md "A relayed payload is checked
 * against what the UI could send" — the W81 / D11 / X51 / X53 rule applied
 * to the two audio relays' siblings in the other direction). The honest
 * `done` names the GM's cache path — `worlds/<world>/audio/<xx>/<hash>.mp3`
 * on native Foundry, or The Forge's assets origin — so only such a path
 * should be played; anything else is no path.
 *
 * Control: the honest `done` with the GM's cache path plays the clip.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/multiplayer/audioDonePathUnbounded.probe.js
 */

/* global asPlayer */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn(async () => new Uint8Array([1, 2, 3])) }));

import { onNarratorCardRendered, registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from '../../../src/audio/index.js';
import { cacheKey, _resetAudioCacheStateForTests } from '../../../src/audio/cache.js';
import { stopActivePlayback } from '../../../src/audio/playback.js';
import { parseHTML, StubElement, setListenerResultSink } from '../../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const PROSE = 'The hull groans and holds.';
const FP = () => foundry.applications.apps.FilePicker.implementation;

let savedHTMLElement, savedEmit, restoreUser, hash;
const sent = [];

beforeEach(async () => {
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  setListenerResultSink(() => {});
  foundry.audio.Sound._reset();
  FP()._reset();
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
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
  registerAudioSocket();
  restoreUser = asPlayer();
});

afterEach(async () => {
  await stopActivePlayback();
  game.socket.emit = savedEmit;
  restoreUser();
  game.socket._reset();
  game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
});

/** Deliver a socket payload to this client's handlers, as another client's emit would. */
async function deliver(payload) {
  for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h(payload);
}

/** Press Play on a narrator card and wait until the client has asked the GM for the clip. */
async function pressPlay(id) {
  const message = { id, flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
  const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
  await onNarratorCardRendered(message, root);
  const play = root.querySelector('[data-action="audioPlayToggle"]');
  play.click();
  await vi.waitFor(() => expect(sent.some(p => p.kind === 'audio.synth.request' && p.hash === hash)).toBe(true));
  return play;
}

const playedSources = () => foundry.audio.Sound._instances.map(s => s.src);

describe('MP-03 a forged audio.synth.done names an external URL', () => {
  it('control: the honest done with the GM\'s cache path plays the clip', async () => {
    const play = await pressPlay('msg-honest');
    const cachePath = `worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`;
    await deliver({ kind: 'audio.synth.done', hash, path: cachePath });
    await vi.waitFor(() => expect(play.getAttribute('data-state')).toBe('playing'));
    expect(playedSources()).toContain(cachePath);
  });

  it('a done whose path is not the GM\'s audio cache is not played', async () => {
    const play = await pressPlay('msg-forged');
    const evil = `https://evil.example/anything/${hash}.mp3`;   // ends in /<hash>.mp3 — passes today's check
    await deliver({ kind: 'audio.synth.done', hash, path: evil });
    await new Promise(r => setTimeout(r, 50));

    // Expected: no path — the waiter keeps waiting for the GM's real done (or times out to
    // "not ready"); the external file is never loaded.
    // Actual: the card goes "playing" and the Sound loads https://evil.example/…/<hash>.mp3.
    expect(playedSources()).not.toContain(evil);
    expect.soft(play.getAttribute('data-state')).not.toBe('playing');
  });
});
