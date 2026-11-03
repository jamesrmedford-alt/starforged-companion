/**
 * STARFORGED COMPANION
 * tests/unit/audioStopWhileLoading.test.js
 *
 * Issue #322 V14 (the audit's audioStopWhileLoading probe,
 * AUDIO-STOP-WHILE-LOADING): the narrator card's Stop button calls
 * stopActivePlayback() and labels the card idle. While the card was still
 * "Loading…" (ElevenLabs synthesis — seconds per segment) no PlaybackSession
 * existed, so Stop stopped nothing: when synthesis finished, togglePlayback
 * built the session and played it anyway (typically an autoplayed long
 * narration the GM cut off). Each Play takes the card's load generation now;
 * Stop bumps it, and a load that finishes under an older one never plays.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/audio/cache.js', () => {
  const lookup = vi.fn();
  return {
    cacheKey:        vi.fn(),
    lookup,
    // The mocked lookup's answer, from a browse that worked (issue #326 W79).
    lookupDetailed:  vi.fn(async (hash) => ({ path: (await lookup(hash)) ?? null, browsed: true })),
    write:           vi.fn(),
  };
});
vi.mock('../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn() }));
vi.mock('../../src/multiplayer/gmGate.js', async (orig) => ({ ...(await orig()), isCanonicalGM: () => true }));

import { onNarratorCardRendered } from '../../src/audio/index.js';
import { cacheKey, lookup, write } from '../../src/audio/cache.js';
import { synthesise } from '../../src/audio/elevenlabs.js';
import { stopActivePlayback } from '../../src/audio/playback.js';
import { parseHTML, StubElement, setListenerResultSink } from '../helpers/cardDom.js';

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

describe('Stop during synthesis keeps the card silent (AUDIO-STOP-WHILE-LOADING)', () => {
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
    // It started playing after Stop, the button reading Pause.
    expect(sounding).toHaveLength(0);
    expect(play.getAttribute('data-state')).toBe('idle');
  });

  it('a Play after the Stop plays — the Stop cancelled only the load in flight', async () => {
    const message = { id: 'msg-stop-2', flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
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
    stop.click();
    await flush();
    play.click();                  // Play again, while the first load is still out
    await flush();
    for (let i = 0; i < 6; i++) { releaseSynth(); await flush(); }

    await vi.waitFor(() => expect(play.getAttribute('data-state')).toBe('playing'));
    expect(foundry.audio.Sound._instances.filter(s => s._state === 'playing')).toHaveLength(1);
  });
});
