// STARFORGED COMPANION
// tests/unit/audioUploadRefusedNoRebill.test.js
//
// Issue #345 AA61 (AUDIO-UPLOAD-FAIL-REBILLS) — a refused narrator-audio
// upload made every retry bill the GM's ElevenLabs key again, and nobody was
// told the upload was what failed.
//
// The audio GM makes a keyless player's clip (handleSynthRequest →
// synthesiseToCacheOnce): ElevenLabs bills the synthesis, then the clip is
// uploaded to the cache. When the world's storage refuses the upload — v13
// FilePicker.upload resolves false, so cache.write returns null (uploadedPath,
// issue #322 V26) — writeToCache returned null without a word, the in-flight
// entry was dropped with the bytes, and the GM answered `audio.synth.done`
// with path null. The player was told "ask the GM to play this card once, then
// try again"; trying again (or the GM's own replay) synthesised — billed — the
// same clip again, against the same refused upload.
//
// Now the audio GM keeps a made clip's bytes after a failed upload: the next
// Play or request uploads them again instead of making the clip again. The GM
// is told once that the world's storage refused it, and the done signal says
// the clip was made but not saved (`unsaved: true`), so the waiting player is
// told the world's storage refused the GM's upload.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn() }));

import { onNarratorCardRendered, registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from '../../src/audio/index.js';
import { cacheKey, _resetAudioCacheStateForTests } from '../../src/audio/cache.js';
import { synthesise } from '../../src/audio/elevenlabs.js';
import { stopActivePlayback } from '../../src/audio/playback.js';
import { parseHTML, StubElement, setListenerResultSink } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.elevenLabsApiKey`;
const PROSE = 'The hull groans and holds.';
const SPEC = { voiceId: 'voice-narrator', modelId: 'eleven_flash_v2_5', text: PROSE, speed: 1 };
const FP = () => foundry.applications.apps.FilePicker.implementation;
const cachePath = (hash) => `worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`;
const STORAGE_TOLD = /^Starforged Companion: Narrator audio couldn't be saved — the world's file storage refused the upload, so players can't hear narrator audio/;

let savedMessages, savedUpload, savedHTMLElement;
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); };

const AUDIO_SETTINGS = {
  'audio.enabled':         true,
  'audio.clientEnabled':   true,
  'audio.narratorVoiceId': 'voice-narrator',
  'audio.npcVoiceId':      'voice-npc',
};

function baseSetup() {
  FP()._reset();
  savedUpload = FP().upload;
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  vi.mocked(synthesise).mockReset();
  vi.mocked(synthesise).mockImplementation(async () => new ArrayBuffer(16));
  for (const [key, value] of Object.entries(AUDIO_SETTINGS)) game.settings._store.set(`${MODULE_ID}.${key}`, value);
  savedMessages = game.messages;
  game.messages = { contents: [{ id: 'msg-1', flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } }] };
  game.socket._reset();
}

function baseTeardown() {
  FP().upload = savedUpload;
  game.messages = savedMessages;
  game.socket._reset();
  for (const k of [...Object.keys(AUDIO_SETTINGS), 'elevenLabsApiKey']) game.settings._store.delete(`${MODULE_ID}.${k}`);
}

/** The world's storage refuses `n` uploads (v13: the server reported an error), then accepts them. */
function refuseUploads(n = Infinity) {
  const accept = savedUpload;
  let refused = 0;
  FP().upload = vi.fn(async (...args) => {
    if (refused < n) { refused++; return false; }
    return accept(...args);
  });
}

describe('issue #345 AA61 — the audio GM: a refused cache upload is retried, not billed again', () => {
  /** A keyless player's client asks the audio GM for the clip (its socket message). */
  async function playerRequests(hash) {
    for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) {
      await h({ kind: 'audio.synth.request', hash, spec: SPEC });
    }
    await flush();
  }
  const doneSignals = () => (game.socket._emitted ?? []).filter(e => e.payload?.kind === 'audio.synth.done');

  /** The GM's own narrator card, rendered with its Play button. */
  async function gmCard(id) {
    const message = { id, flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
    const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
    await onNarratorCardRendered(message, root);
    return root.querySelector('[data-action="audioPlayToggle"]');
  }

  beforeEach(() => {
    baseSetup();
    savedHTMLElement = globalThis.HTMLElement;
    globalThis.HTMLElement = StubElement;
    setListenerResultSink(() => {});
    foundry.audio.Sound._reset();
    game.settings._store.set(KEY, 'sk_gm_key');      // the GM holds the key (the audio GM)
    registerAudioSocket();
  });

  afterEach(async () => {
    await stopActivePlayback();
    setListenerResultSink(null);
    globalThis.HTMLElement = savedHTMLElement;
    baseTeardown();
  });

  it('the world refuses the upload: the player\'s retry does not bill the clip again', async () => {
    refuseUploads();
    const hash = await cacheKey(SPEC);

    await playerRequests(hash);                      // first Play → the upload is refused
    expect(doneSignals()).toHaveLength(1);
    expect(doneSignals()[0].payload.path).toBeNull();

    await playerRequests(hash);                      // "…then try again"
    expect(doneSignals()).toHaveLength(2);
    expect(FP().upload).toHaveBeenCalledTimes(2);    // the upload was retried — fine
    expect(synthesise).toHaveBeenCalledTimes(1);     // the clip was already made and billed once
  });

  it('the done signal says the clip was made but not saved', async () => {
    refuseUploads();
    const hash = await cacheKey(SPEC);
    await playerRequests(hash);
    expect(doneSignals().map(e => e.payload)).toEqual([{ kind: 'audio.synth.done', hash, path: null, unsaved: true }]);
  });

  it('once the storage accepts uploads again, the retry saves the clip made before — still one synthesis', async () => {
    refuseUploads(1);
    const hash = await cacheKey(SPEC);

    await playerRequests(hash);                      // refused
    await playerRequests(hash);                      // accepted: the same bytes are filed
    await playerRequests(hash);                      // served from the cache: no upload, no synthesis

    expect(doneSignals().map(e => e.payload.path)).toEqual([null, cachePath(hash), cachePath(hash)]);
    expect(doneSignals()[1].payload).not.toHaveProperty('unsaved');
    expect(FP().upload).toHaveBeenCalledTimes(2);
    expect(synthesise).toHaveBeenCalledTimes(1);
    expect(FP()._uploads).toHaveLength(1);           // the one stored file
  });

  it('the GM is told once that the world\'s storage refused the clip', async () => {
    const warn = vi.spyOn(ui.notifications, 'warn');
    refuseUploads();
    const hash = await cacheKey(SPEC);

    await playerRequests(hash);
    await playerRequests(hash);
    await playerRequests(hash);

    expect(warn.mock.calls.map(c => c[0]).filter(m => STORAGE_TOLD.test(m))).toHaveLength(1);
    // Each refused write is logged, where nothing was said.
    expect(getCapturedWarns().filter(w => /was not saved — the world's storage refused the upload/.test(w))).toHaveLength(3);
  });

  it('the GM\'s own replay after a refused upload plays the clip it made without billing it again', async () => {
    refuseUploads();
    const first = await gmCard('msg-gm-1');
    first.click();
    await vi.waitFor(() => expect(first.getAttribute('data-state')).toBe('playing'));
    await stopActivePlayback();

    const replay = await gmCard('msg-gm-2');         // the same narration, played again
    replay.click();
    await vi.waitFor(() => expect(replay.getAttribute('data-state')).toBe('playing'));

    expect(synthesise).toHaveBeenCalledTimes(1);
    expect(FP().upload).toHaveBeenCalledTimes(2);    // its upload retried each time
  });

  it('control: with uploads working, the retry is served from the cache — one synthesis', async () => {
    const hash = await cacheKey(SPEC);
    await playerRequests(hash);
    await playerRequests(hash);
    expect(doneSignals().map(e => e.payload)).toEqual([
      { kind: 'audio.synth.done', hash, path: cachePath(hash) },
      { kind: 'audio.synth.done', hash, path: cachePath(hash) },
    ]);
    expect(synthesise).toHaveBeenCalledTimes(1);
  });

  it('control: a failed synthesis (nothing made, nothing billed) is no unsaved clip — the next request tries again', async () => {
    vi.mocked(synthesise).mockRejectedValueOnce(new Error('ElevenLabs 503'));
    const hash = await cacheKey(SPEC);
    await playerRequests(hash);
    await playerRequests(hash);
    expect(doneSignals().map(e => e.payload)).toEqual([
      { kind: 'audio.synth.done', hash, path: null },
      { kind: 'audio.synth.done', hash, path: cachePath(hash) },
    ]);
    expect(synthesise).toHaveBeenCalledTimes(2);
  });
});

// One process plays both clients, as in audioKeylessPlayback.test.js: the
// player's socket request runs the REAL GM handler under the GM's identity
// (with the GM's ElevenLabs key), and the GM's done signal is delivered back
// to the player — the producer and the consumer of `unsaved` both run.
describe('issue #345 AA61 — the keyless player is told the world\'s storage refused the clip', () => {
  const GM = { isGM: true, id: 'test-user-gm' };
  let restoreUser, savedEmit;

  beforeEach(() => {
    baseSetup();
    savedHTMLElement = globalThis.HTMLElement;
    globalThis.HTMLElement = StubElement;
    setListenerResultSink(() => {});
    foundry.audio.Sound._reset();
    game.settings._store.delete(KEY);                // the player's client holds no key
    restoreUser = asPlayer();
    game.messages = { contents: [] };
    savedEmit = game.socket.emit;
    game.socket.emit = (event, payload) => {
      if (event !== AUDIO_SOCKET_NAME) return;
      if (payload?.kind === 'audio.synth.request') {
        setTimeout(async () => {
          const asTheGm = withUser(GM);
          game.settings._store.set(KEY, 'sk_gm_key');
          try {
            for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) await h(payload);
          } finally {
            game.settings._store.delete(KEY);
            asTheGm();
          }
        }, 0);
      } else if (payload?.kind === 'audio.synth.done') {
        setTimeout(() => (game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []).forEach(h => h(payload)), 0);
      }
    };
    registerAudioSocket();
  });

  afterEach(async () => {
    await stopActivePlayback();
    game.socket.emit = savedEmit;
    restoreUser();
    setListenerResultSink(null);
    globalThis.HTMLElement = savedHTMLElement;
    baseTeardown();
  });

  async function playCard(id) {
    const message = { id, flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
    game.messages.contents.push(message);
    const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
    await onNarratorCardRendered(message, root);
    const play = root.querySelector('[data-action="audioPlayToggle"]');
    play.click();
    await vi.waitFor(() => expect(['playing', 'error']).toContain(play.getAttribute('data-state')));
    return play;
  }

  it('a refused upload: the player is told the world\'s storage refused it, not to ask the GM to play the card', async () => {
    expectConsoleError(/audio toggle failed: Narrator audio couldn't be saved to the world's file storage/);
    const warn = vi.spyOn(ui.notifications, 'warn');
    refuseUploads();

    const play = await playCard('msg-refused');

    expect(play.getAttribute('data-state')).toBe('error');
    expect(play.getAttribute('title')).toMatch(/couldn't be saved to the world's file storage/);
    expect(play.getAttribute('title')).not.toMatch(/ask the GM to play this card once/);
    expect(warn.mock.calls.map(c => c[0])).toContain(
      'Starforged Companion: Narrator audio unavailable: Narrator audio couldn\'t be saved to the world\'s file storage — it refused the GM\'s upload. Ask the GM to check the world\'s storage (on The Forge, the Assets Library\'s space), then try again.');
  });

  it('…and pressing Play again once the storage accepts uploads plays the clip made the first time', async () => {
    expectConsoleError(/audio toggle failed: Narrator audio couldn't be saved/);
    refuseUploads(1);
    const hash = await cacheKey(SPEC);

    const first = await playCard('msg-retry');
    expect(first.getAttribute('data-state')).toBe('error');
    const again = await playCard('msg-retry-2');

    expect(again.getAttribute('data-state')).toBe('playing');
    expect(foundry.audio.Sound._instances.map(s => s.src)).toContain(cachePath(hash));
    expect(synthesise).toHaveBeenCalledTimes(1);
  });

  it('control: a synthesis that failed still reads "not ready yet"', async () => {
    expectConsoleError(/audio toggle failed: Narrator audio isn't ready yet/);
    vi.mocked(synthesise).mockRejectedValueOnce(new Error('ElevenLabs 503'));

    const play = await playCard('msg-503');

    expect(play.getAttribute('data-state')).toBe('error');
    expect(play.getAttribute('title')).toMatch(/isn't ready yet — ask the GM to play this card once/);
  });
});
