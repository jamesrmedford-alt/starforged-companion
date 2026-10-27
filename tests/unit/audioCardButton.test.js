/**
 * STARFORGED COMPANION
 * tests/unit/audioCardButton.test.js
 *
 * The narrator card's Play / Pause / Resume button (onNarratorCardRendered →
 * togglePlayback), driven by clicks on the card's markup. Resuming a paused
 * narration settles only when playback ends, and the button was then set to
 * "playing" — so a finished card showed Pause (AUDIO-RESUME-LABEL, found
 * while fixing issue #300 F08).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/audio/cache.js', () => ({
  cacheKey:        vi.fn(),
  lookup:          vi.fn(),
  write:           vi.fn(),
  evictIfOverflow: vi.fn(),
}));

import { onNarratorCardRendered } from '../../src/audio/index.js';
import { cacheKey, lookup } from '../../src/audio/cache.js';
import { stopActivePlayback } from '../../src/audio/playback.js';
import { parseHTML, StubElement, setListenerResultSink } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const PROSE = 'The hull groans and holds.';

let savedHTMLElement;
let pending;

beforeEach(() => {
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  pending = [];
  setListenerResultSink(p => pending.push(p));
  foundry.audio.Sound._reset();
  // Set per test: the global afterEach's restoreAllMocks clears mock implementations.
  cacheKey.mockResolvedValue('deadbeefdeadbeef');
  lookup.mockResolvedValue('/worlds/test/audio/deadbeef.mp3');   // cached: nothing to synthesise
  for (const [key, value] of Object.entries({
    'audio.enabled':         true,
    'audio.clientEnabled':   true,
    'audio.narratorVoiceId': 'voice-narrator',
    'audio.npcVoiceId':      'voice-npc',
  })) game.settings._store.set(`${MODULE_ID}.${key}`, value);
});

afterEach(async () => {
  await stopActivePlayback();
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
});

async function renderCard() {
  const message = { id: 'msg-1', flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
  const root = parseHTML(
    `<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`,
  );
  await onNarratorCardRendered(message, root);
  const button = root.querySelector('[data-action="audioPlayToggle"]');
  return { state: () => button.getAttribute('data-state'), click: () => button.click() };
}

describe('narrator card audio button', () => {
  it('reads Play once a resumed narration has finished — not Pause', async () => {
    const card = await renderCard();
    card.click();                                                      // play
    await vi.waitFor(() => expect(card.state()).toBe('playing'));
    card.click();                                                      // pause
    await vi.waitFor(() => expect(card.state()).toBe('paused'));
    card.click();                                                      // resume
    await vi.waitFor(() => expect(card.state()).toBe('playing'));

    foundry.audio.Sound._instances.at(-1)._fire('end');               // the narration finishes
    await Promise.all(pending);
    expect(card.state()).toBe('idle');
  });

  it('reads Pause while a resumed narration is still playing', async () => {
    const card = await renderCard();
    card.click();
    await vi.waitFor(() => expect(card.state()).toBe('playing'));
    card.click();
    await vi.waitFor(() => expect(card.state()).toBe('paused'));
    card.click();
    await vi.waitFor(() => expect(card.state()).toBe('playing'));
    expect(foundry.audio.Sound._instances).toHaveLength(1);           // the same segment resumed, nothing new loaded
  });
});
