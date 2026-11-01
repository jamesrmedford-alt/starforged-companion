// STARFORGED COMPANION
// tests/unit/audioSynthesisOnce.test.js
//
// The canonical GM synthesises each narrator clip once, whether its own
// playback or a keyless player's request asks first (issue #321 U59).
//
// The canonical GM deduped keyless players' `audio.synth.request`s against an
// in-flight set — but its OWN playback path (buildPlayableSegments →
// synthesise → cache write) never entered that set, and the request handler
// only checked the cache, which the GM's own synthesis had not written yet. A
// narrator card renders on every client at once, so with Auto-play on (or the
// GM and a player both pressing Play) the GM's synthesis and a player's
// request for the same clip ran side by side: every segment was synthesised —
// and billed by ElevenLabs — twice, and uploaded twice. Both paths now await
// one per-hash promise.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn() }));

import { onNarratorCardRendered, registerAudioSocket, AUDIO_SOCKET_NAME, _resetSynthStateForTests } from '../../src/audio/index.js';
import { cacheKey, _resetAudioCacheStateForTests } from '../../src/audio/cache.js';
import { synthesise } from '../../src/audio/elevenlabs.js';
import { stopActivePlayback } from '../../src/audio/playback.js';
import { parseHTML, StubElement, setListenerResultSink } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const PROSE = 'The hull groans and holds.';
const SPEC = { voiceId: 'voice-narrator', modelId: 'eleven_flash_v2_5', text: PROSE, speed: 1 };

let savedHTMLElement, release;
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };

/** A keyless player's client asks the canonical GM for a clip (its socket message). */
function playerRequests(hash) {
  for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) {
    h({ kind: 'audio.synth.request', hash, spec: SPEC });
  }
}

/** The GM's own narrator card, rendered with its Play button. */
async function gmCard(id) {
  const message = { id, flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
  const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
  await onNarratorCardRendered(message, root);
  return root.querySelector('[data-action="audioPlayToggle"]');
}

const doneSignals = () => (game.socket._emitted ?? []).filter(e => e.payload?.kind === 'audio.synth.done');

beforeEach(() => {
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  setListenerResultSink(() => {});
  foundry.audio.Sound._reset();
  foundry.applications.apps.FilePicker.implementation._reset();
  _resetAudioCacheStateForTests();
  _resetSynthStateForTests();
  vi.mocked(synthesise).mockReset();
  const gates = [];
  vi.mocked(synthesise).mockImplementation(() => new Promise(r => gates.push(r)));   // ElevenLabs takes a few seconds
  release = () => gates.splice(0).forEach(r => r(new ArrayBuffer(16)));
  for (const [key, value] of Object.entries({
    'audio.enabled':         true,
    'audio.clientEnabled':   true,
    'audio.narratorVoiceId': 'voice-narrator',
    'audio.npcVoiceId':      'voice-npc',
    'elevenLabsApiKey':      'sk_gm_key',          // the canonical GM holds the key
  })) game.settings._store.set(`${MODULE_ID}.${key}`, value);
  game.socket._reset();
  registerAudioSocket();
});

afterEach(async () => {
  await stopActivePlayback();
  game.socket._reset();
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
});

describe('the canonical GM synthesises a clip once (issue #321 U59)', () => {
  it('its own playback first, then a player request for the same clip: one synthesis, one upload', async () => {
    const play = await gmCard('msg-dup');
    play.click();
    await vi.waitFor(() => expect(synthesise).toHaveBeenCalledTimes(1));

    const hash = await cacheKey(SPEC);
    playerRequests(hash);
    await flush();
    release(); await flush();
    release(); await flush();

    expect(synthesise).toHaveBeenCalledTimes(1);
    expect(foundry.applications.apps.FilePicker.implementation._uploads).toHaveLength(1);
    expect(doneSignals()).toHaveLength(1);                       // the player is told it is ready
    await vi.waitFor(() => expect(play.getAttribute('data-state')).toBe('playing'));
  });

  it('a player request first, then the GM presses Play: the playback waits for that synthesis', async () => {
    const hash = await cacheKey(SPEC);
    playerRequests(hash);
    await vi.waitFor(() => expect(synthesise).toHaveBeenCalledTimes(1));

    const play = await gmCard('msg-dup-2');
    play.click();
    await flush();
    release(); await flush();
    release(); await flush();

    expect(synthesise).toHaveBeenCalledTimes(1);
    expect(foundry.applications.apps.FilePicker.implementation._uploads).toHaveLength(1);
    await vi.waitFor(() => expect(play.getAttribute('data-state')).toBe('playing'));
    expect(foundry.audio.Sound._instances.map(s => s.src)).toContain(`worlds/test-world/audio/${hash.slice(0, 2)}/${hash}.mp3`);
  });

  it('a failed synthesis is not remembered — the next request tries again', async () => {
    const hash = await cacheKey(SPEC);
    vi.mocked(synthesise).mockRejectedValueOnce(new Error('ElevenLabs 503'));
    playerRequests(hash);
    await flush();
    expect(doneSignals()).toHaveLength(1);                       // the waiting player is still released
    expect(getCapturedWarns().some(w => /keyless request\) failed: ElevenLabs 503/.test(w))).toBe(true);

    playerRequests(hash);
    await vi.waitFor(() => expect(synthesise).toHaveBeenCalledTimes(2));
    release(); await flush();
    expect(foundry.applications.apps.FilePicker.implementation._uploads).toHaveLength(1);
  });
});
