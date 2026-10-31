// tests/probes/infra/audioDoubleSynthesis.probe.test.js
//
// PROBE (infra audit) — AUDIO-DOUBLE-SYNTH.
//
// The canonical GM dedupes keyless players' `audio.synth.request`s against
// `_synthInFlight` — but its OWN playback path (buildPlayableSegments →
// synthesise → commitToCache) never enters that set, and handleSynthRequest
// only checks the cache, which the GM's own synthesis has not written yet. A
// narrator card renders on every client at once, so with Auto-play on (or the
// GM and a player both pressing Play) the GM's own synthesis and a player's
// request for the same clip run side by side: every segment is synthesised —
// and billed by ElevenLabs — twice, and uploaded twice.
//
// Asserts one ElevenLabs call per clip. FAILS today.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn() }));

import { onNarratorCardRendered, registerAudioSocket, AUDIO_SOCKET_NAME } from '../../../src/audio/index.js';
import { cacheKey, _resetAudioCacheStateForTests } from '../../../src/audio/cache.js';
import { synthesise } from '../../../src/audio/elevenlabs.js';
import { stopActivePlayback } from '../../../src/audio/playback.js';
import { parseHTML, StubElement, setListenerResultSink } from '../../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const PROSE = 'The hull groans and holds.';

let savedHTMLElement, release;
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };

beforeEach(() => {
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  setListenerResultSink(() => {});
  foundry.audio.Sound._reset();
  foundry.applications.apps.FilePicker.implementation._reset();
  _resetAudioCacheStateForTests();
  const gates = [];
  synthesise.mockImplementation(() => new Promise(r => gates.push(r)));   // ElevenLabs takes a few seconds
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

describe('PROBE AUDIO-DOUBLE-SYNTH — GM playback and a player request for the same clip', () => {
  it('synthesises the clip once', async () => {
    const message = { id: 'msg-dup', flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
    const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
    await onNarratorCardRendered(message, root);

    // The GM presses Play (or auto-play starts) …
    root.querySelector('[data-action="audioPlayToggle"]').click();
    await vi.waitFor(() => expect(synthesise).toHaveBeenCalledTimes(1));

    // … and a keyless player's client asks the GM for the same clip.
    const spec = { voiceId: 'voice-narrator', modelId: 'eleven_flash_v2_5', text: PROSE, speed: 1 };
    const hash = await cacheKey(spec);
    for (const h of game.socket._handlers.get(AUDIO_SOCKET_NAME) ?? []) {
      h({ kind: 'audio.synth.request', hash, spec });
    }
    await flush();
    release(); await flush();
    release(); await flush();

    // Actual today: 2 — the GM bills the same text twice.
    expect(synthesise).toHaveBeenCalledTimes(1);
  });
});
