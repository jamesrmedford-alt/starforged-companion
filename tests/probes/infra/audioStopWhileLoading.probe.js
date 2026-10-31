// tests/probes/infra/audioStopWhileLoading.probe.test.js
//
// PROBE (infra audit) — AUDIO-STOP-WHILE-LOADING.
//
// The narrator card's Stop button calls stopActivePlayback() and labels the
// card idle. While the card is still "Loading…" (ElevenLabs synthesis of the
// segments — seconds per segment) no PlaybackSession exists yet, so Stop stops
// nothing: when synthesis finishes, togglePlayback builds the session and
// plays it anyway. F09 (AUDIO-STOP-LOADING) fixed a Stop during Sound.load()
// inside a session; a Stop during the synthesis phase before the session is
// still ignored. Typical case: an autoplayed long narration the GM cuts off.
//
// Asserts a Stop pressed during loading keeps the card silent. FAILS today.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/audio/cache.js', () => ({
  cacheKey:        vi.fn(),
  lookup:          vi.fn(),
  write:           vi.fn(),
  evictIfOverflow: vi.fn(),
}));
vi.mock('../../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn() }));
vi.mock('../../../src/multiplayer/gmGate.js', async (orig) => ({ ...(await orig()), isCanonicalGM: () => true }));

import { onNarratorCardRendered } from '../../../src/audio/index.js';
import { cacheKey, lookup, write, evictIfOverflow } from '../../../src/audio/cache.js';
import { synthesise } from '../../../src/audio/elevenlabs.js';
import { stopActivePlayback } from '../../../src/audio/playback.js';
import { parseHTML, StubElement, setListenerResultSink } from '../../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const PROSE = 'The hull groans and holds. <npc>"We are not done yet."</npc> Vance says.';
const HASH = 'a'.repeat(64);

let savedHTMLElement;
let releaseSynth;

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };

beforeEach(() => {
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  setListenerResultSink(() => {});
  foundry.audio.Sound._reset();
  cacheKey.mockResolvedValue(HASH);
  lookup.mockResolvedValue(null);                                   // uncached → synthesise
  write.mockResolvedValue(`worlds/test-world/audio/aa/${HASH}.mp3`);
  evictIfOverflow.mockResolvedValue(0);
  const gates = [];
  synthesise.mockImplementation(() => new Promise(r => gates.push(r)));
  releaseSynth = () => gates.splice(0).forEach(r => r(new ArrayBuffer(8)));
  for (const [key, value] of Object.entries({
    'audio.enabled':         true,
    'audio.clientEnabled':   true,
    'audio.narratorVoiceId': 'voice-narrator',
    'audio.npcVoiceId':      'voice-npc',
    'elevenLabsApiKey':      'sk_test_key',
  })) game.settings._store.set(`${MODULE_ID}.${key}`, value);
});

afterEach(async () => {
  await stopActivePlayback();
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
});

describe('PROBE AUDIO-STOP-WHILE-LOADING — Stop during synthesis', () => {
  it('a Stop pressed while the card is still loading keeps the narration silent', async () => {
    const message = { id: 'msg-stop', flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
    const root = parseHTML(
      `<div class="sf-narration-prose">${PROSE}</div>` +
      `<button data-action="audioPlayToggle" hidden></button>` +
      `<button data-action="audioStop" hidden></button>`,
    );
    await onNarratorCardRendered(message, root);
    const play = root.querySelector('[data-action="audioPlayToggle"]');
    const stop = root.querySelector('[data-action="audioStop"]');

    play.click();
    await vi.waitFor(() => expect(synthesise).toHaveBeenCalled());
    expect(play.getAttribute('data-state')).toBe('loading');

    stop.click();                  // the user cuts the narration off before any sound
    await flush();
    expect(play.getAttribute('data-state')).toBe('idle');   // the card says it stopped

    for (let i = 0; i < 4; i++) { releaseSynth(); await flush(); }   // synthesis finishes

    const sounding = foundry.audio.Sound._instances.filter(s => s._state === 'playing');
    // Actual today: 1 — the narration starts playing after Stop, button reads Pause.
    expect(sounding).toHaveLength(0);
    expect(play.getAttribute('data-state')).toBe('idle');
  });
});
