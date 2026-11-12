/* global expectConsoleError */
/**
 * STARFORGED COMPANION
 * tests/unit/audioPlayStartsAtFirstSegment.test.js
 *
 * Issue #348 PT12 — a long delay between pressing ▶ Play and narration audio
 * starting. buildPlayableSegments made every segment of the card — narrator
 * and NPC stretches, one after another — before the PlaybackSession was
 * created, and on the audio GM each one was synthesised AND uploaded to the
 * cache before the next began: a three-segment narration waited for three
 * syntheses and three uploads before a word was heard. Now the first segment
 * is made and plays; the later ones are made one after another behind it,
 * and the GM plays a clip's bytes as soon as they are synthesised, its upload
 * going on behind. Nothing is made before Play (no pre-synthesis), and a Play
 * stopped meanwhile makes no more segments.
 *
 * Known-issues XCARD-AUDIO-PLAYING — narrator audio already playing when the
 * X-Card was played kept playing: the card's `xCarded` flag lands as an
 * update that re-renders the card, and the render hook only hid the Play
 * button. It now stops that card's narration — playing, paused or loading.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn() }));

import { onNarratorCardRendered, registerAudioSocket, _resetSynthStateForTests } from '../../src/audio/index.js';
import { _resetAudioCacheStateForTests } from '../../src/audio/cache.js';
import { synthesise } from '../../src/audio/elevenlabs.js';
import { stopActivePlayback, _resetActivePlaybackForTests } from '../../src/audio/playback.js';
import { parseHTML, StubElement, setListenerResultSink } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const PROSE = 'Vance turns from the viewport. <npc>"Not today, pilot."</npc> He walks out, and the hatch seals behind him.';
const FP = () => foundry.applications.apps.FilePicker.implementation;
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); };

let savedHTMLElement, savedMessages, savedUpload;
let synthGates, uploadGates;
const releaseSynth  = () => synthGates.shift()?.(new ArrayBuffer(16));
const releaseUpload = () => uploadGates.shift()?.();

beforeEach(() => {
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  setListenerResultSink(() => {});
  foundry.audio.Sound._reset();
  FP()._reset();
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  _resetActivePlaybackForTests();
  synthGates = [];
  uploadGates = [];
  vi.mocked(synthesise).mockReset();
  vi.mocked(synthesise).mockImplementation(() => new Promise(r => synthGates.push(r)));   // ElevenLabs takes a few seconds
  savedUpload = FP().upload;
  const accept = savedUpload;
  FP().upload = vi.fn((...args) => new Promise(r => uploadGates.push(() => r(accept(...args)))));   // the upload takes its time too
  for (const [key, value] of Object.entries({
    'audio.enabled': true, 'audio.clientEnabled': true,
    'audio.narratorVoiceId': 'voice-narrator', 'audio.npcVoiceId': 'voice-npc',
    elevenLabsApiKey: 'sk_gm_key',                          // the GM holds the key: the audio GM
  })) game.settings._store.set(`${MODULE_ID}.${key}`, value);
  savedMessages = game.messages;
  game.messages = { contents: [] };
  game.socket._reset();
  registerAudioSocket();
});

afterEach(async () => {
  await stopActivePlayback();
  // Anything still held is let go, so nothing waits past the test.
  while (synthGates.length) releaseSynth();
  while (uploadGates.length) releaseUpload();
  await flush();
  FP().upload = savedUpload;
  game.messages = savedMessages;
  game.socket._reset();
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
  game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);
});

/** The GM's narrator card, rendered with Play and Stop. */
async function gmCard(id, flags = {}) {
  const message = { id, flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE, ...flags } } };
  const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button><button data-action="audioStop" hidden></button>`);
  await onNarratorCardRendered(message, root);
  return {
    message,
    play: root.querySelector('[data-action="audioPlayToggle"]'),
    stop: root.querySelector('[data-action="audioStop"]'),
  };
}

/** The card's X-Card update lands: the card re-renders with its `xCarded` flag. */
async function xCard(message) {
  message.flags[MODULE_ID].xCarded = true;
  const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
  await onNarratorCardRendered(message, root);
  await flush();
}

describe('issue #348 PT12 — narration starts at its first segment', () => {
  it('a three-segment card plays once its first segment is made — the others are made behind it', async () => {
    const { play } = await gmCard('msg-three');
    play.click();
    await flush();
    expect(synthesise, 'nothing is made before Play is pressed (setup)').toHaveBeenCalledTimes(1);

    releaseSynth(); await flush();     // the first segment is synthesised

    // It waited for every segment — three syntheses, three uploads — first.
    expect(play.getAttribute('data-state')).toBe('playing');
    expect(foundry.audio.Sound._instances).toHaveLength(1);
    // …and the GM plays its bytes while the upload goes on.
    expect(FP().upload).toHaveBeenCalledTimes(1);
    expect(uploadGates).toHaveLength(1);
    // The second segment is being made meanwhile, one at a time.
    expect(synthesise).toHaveBeenCalledTimes(2);

    releaseSynth(); await flush();
    foundry.audio.Sound._instances[0]._fire('end'); await flush();
    expect(foundry.audio.Sound._instances).toHaveLength(2);    // the NPC line plays next
    expect(synthesise.mock.calls[1][0]).toMatchObject({ voiceId: 'voice-npc' });

    releaseSynth(); await flush();
    foundry.audio.Sound._instances[1]._fire('end'); await flush();
    expect(foundry.audio.Sound._instances).toHaveLength(3);
    foundry.audio.Sound._instances[2]._fire('end'); await flush();
    expect(play.getAttribute('data-state')).toBe('idle');
    expect(synthesise).toHaveBeenCalledTimes(3);
  });

  it('a Stop while the first segment plays makes no more segments — no more billed', async () => {
    const { play, stop } = await gmCard('msg-stop');
    play.click(); await flush();
    releaseSynth(); await flush();
    expect(play.getAttribute('data-state')).toBe('playing');
    expect(synthesise).toHaveBeenCalledTimes(2);   // the second is under way

    stop.click(); await flush();
    releaseSynth(); await flush();                 // it lands after the Stop

    expect(synthesise, 'the third segment is never made').toHaveBeenCalledTimes(2);
    expect(foundry.audio.Sound._instances).toHaveLength(1);
    expect(play.getAttribute('data-state')).toBe('idle');
  });

  it('control: a later segment that cannot be made fails the session when it is reached', async () => {
    expectConsoleError(/narrator audio playback failed|playback failed/);
    const { play } = await gmCard('msg-fail');
    play.click(); await flush();
    releaseSynth(); await flush();
    synthGates.shift()(Promise.reject(new Error('ElevenLabs 503')));   // the second segment fails
    await flush();
    foundry.audio.Sound._instances[0]._fire('end'); await flush();
    expect(play.getAttribute('data-state')).toBe('error');
    expect(synthesise, 'nothing after the failed segment is made').toHaveBeenCalledTimes(2);
  });
});

describe('XCARD-AUDIO-PLAYING — the X-Card stops the narration it removes', () => {
  it('a narration playing when its card is X-carded stops', async () => {
    const { message, play } = await gmCard('msg-x-playing');
    play.click(); await flush();
    releaseSynth(); await flush();
    const sound = foundry.audio.Sound._instances[0];
    expect(sound._state, 'it is playing (setup)').toBe('playing');

    await xCard(message);

    expect(sound._state).toBe('stopped');
    // The rest of it is never made.
    releaseSynth(); await flush();
    expect(synthesise).toHaveBeenCalledTimes(2);
    expect(foundry.audio.Sound._instances).toHaveLength(1);
  });

  it('a narration still loading when its card is X-carded never plays', async () => {
    const { message, play } = await gmCard('msg-x-loading');
    play.click(); await flush();
    expect(play.getAttribute('data-state')).toBe('loading');

    await xCard(message);
    releaseSynth(); await flush();

    expect(foundry.audio.Sound._instances).toEqual([]);
  });

  it('control: another card\'s narration plays on', async () => {
    const other = await gmCard('msg-x-other');
    other.play.click(); await flush();
    releaseSynth(); await flush();
    const sound = foundry.audio.Sound._instances[0];

    const { message } = await gmCard('msg-x-removed');
    await xCard(message);

    expect(sound._state).toBe('playing');
  });
});
