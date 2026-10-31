// tests/probes/infra/audioErrorNoRetry.probe.test.js
//
// PROBE (infra audit) — AUDIO-ERROR-NO-RETRY.
//
// A keyless player clicks Play on a card the GM has not cached yet. The GM
// answers (here: its synthesis failed / it has no key / the 30 s wait ran out)
// and togglePlayback throws "Narrator audio isn't ready yet — ask the GM to
// play this card once, then try again." Its catch sets the button to
// "Unavailable" AND `disabled`, and nothing re-enables it: the card's button
// is only rebuilt when the message re-renders. So once the GM has played the
// card (the clip is now cached) the player cannot "try again" as told —
// clicks on the disabled button are swallowed until a reload. The same holds
// for any transient failure (ElevenLabs 429 / timeout).
//
// Asserts a second click after the clip becomes available plays it. FAILS
// today.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/audio/cache.js', () => ({
  cacheKey:        vi.fn(),
  lookup:          vi.fn(),
  write:           vi.fn(),
  evictIfOverflow: vi.fn(),
}));
vi.mock('../../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn() }));

import { onNarratorCardRendered, registerAudioSocket, AUDIO_SOCKET_NAME } from '../../../src/audio/index.js';
import { cacheKey, lookup } from '../../../src/audio/cache.js';
import { synthesise } from '../../../src/audio/elevenlabs.js';
import { stopActivePlayback } from '../../../src/audio/playback.js';
import { parseHTML, StubElement, setListenerResultSink } from '../../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const PROSE = 'The hull groans and holds.';
const HASH = 'b'.repeat(64);
const CACHED = `worlds/test-world/audio/bb/${HASH}.mp3`;

let savedHTMLElement, savedEmit, restoreUser;
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };

beforeEach(() => {
  silenceConsoleErrors();                 // the first attempt logs its failure, as it should
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  setListenerResultSink(() => {});
  foundry.audio.Sound._reset();
  restoreUser = asPlayer();                // keyless player
  cacheKey.mockResolvedValue(HASH);
  lookup.mockResolvedValue(null);          // not cached yet
  for (const [key, value] of Object.entries({
    'audio.enabled':         true,
    'audio.clientEnabled':   true,
    'audio.narratorVoiceId': 'voice-narrator',
    'audio.npcVoiceId':      'voice-npc',
  })) game.settings._store.set(`${MODULE_ID}.${key}`, value);
  game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);

  // The GM's reply: it always signals done (success, cached, or failure).
  game.socket._reset();
  savedEmit = game.socket.emit;
  game.socket.emit = (event, payload) => {
    if (payload?.kind !== 'audio.synth.request') return;
    setTimeout(() => (game.socket._handlers.get(event) ?? [])
      .forEach(h => h({ kind: 'audio.synth.done', hash: payload.hash })), 0);
  };
  registerAudioSocket();
});

afterEach(async () => {
  await stopActivePlayback();
  game.socket.emit = savedEmit;
  game.socket._reset();
  restoreUser();
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
});

describe('PROBE AUDIO-ERROR-NO-RETRY — "try again" after a failed first attempt', () => {
  it('Play works on the second click once the clip is available', async () => {
    const message = { id: 'msg-retry', flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
    const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
    await onNarratorCardRendered(message, root);
    const play = root.querySelector('[data-action="audioPlayToggle"]');

    play.click();
    await vi.waitFor(() => expect(play.getAttribute('data-state')).toBe('error'));
    expect(play.getAttribute('title')).toMatch(/try again/);    // the card tells the player to retry
    expect(synthesise).not.toHaveBeenCalled();                  // keyless: the GM was asked instead

    lookup.mockResolvedValue(CACHED);   // the GM has now played (and cached) the card
    play.click();                       // "…then try again"
    await flush();

    // Actual today: the button is still disabled, the click is swallowed, nothing plays.
    expect(play.hasAttribute('disabled')).toBe(false);
    expect(foundry.audio.Sound._instances.map(s => s.src)).toContain(CACHED);
  });
});
