// tests/probes/infra/audioAutoplayHistoricalCard.probe.test.js
//
// PROBE (infra audit) — AUDIO-AUTOPLAY-OLD-CARD.
//
// With "Auto-play narrator audio" on, onNarratorCardRendered claims autoplay
// for every narrator card it renders whose id is not yet in this browser's
// localStorage list (claimAutoplayOnce, F14). Foundry renders the recent chat
// log on every page load, so on a client whose list lacks those ids — a new
// device / browser, cleared site data, or simply the first reload after
// turning autoplay on — every historical card claims autoplay; the first one
// rendered (the oldest in the batch) gets the gesture overlay, and the user's
// first click anywhere plays that hours-old narration. F14's stated goal was
// that a reconnecting player does not hear old cards replayed; nothing checks
// that the card is new (message.timestamp vs. this client's load).
//
// Asserts an old card rendered at load does not autoplay. FAILS today.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/audio/cache.js', () => ({
  cacheKey:        vi.fn(),
  lookup:          vi.fn(),
  write:           vi.fn(),
  evictIfOverflow: vi.fn(),
}));

import { onNarratorCardRendered } from '../../../src/audio/index.js';
import { cacheKey, lookup } from '../../../src/audio/cache.js';
import { stopActivePlayback } from '../../../src/audio/playback.js';
import { parseHTML, StubElement, setListenerResultSink } from '../../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const PROSE = 'Two hours ago, the hull groaned and held.';

let savedHTMLElement, savedDocument, docClickHandlers;
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); };

beforeEach(() => {
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  savedDocument = globalThis.document;
  docClickHandlers = [];
  globalThis.document = {
    createElement: (tag) => new StubElement(tag),
    addEventListener: (type, fn) => { if (type === 'click') docClickHandlers.push(fn); },
    removeEventListener: (type, fn) => { docClickHandlers = docClickHandlers.filter(h => h !== fn); },
  };
  setListenerResultSink(() => {});
  foundry.audio.Sound._reset();
  cacheKey.mockResolvedValue('c'.repeat(64));
  lookup.mockResolvedValue(`worlds/test-world/audio/cc/${'c'.repeat(64)}.mp3`);   // already cached
  for (const [key, value] of Object.entries({
    'audio.enabled':         true,
    'audio.clientEnabled':   true,
    'audio.autoplay':        true,     // this player turned auto-play on
    'audio.narratorVoiceId': 'voice-narrator',
    'audio.npcVoiceId':      'voice-npc',
  })) game.settings._store.set(`${MODULE_ID}.${key}`, value);
});

afterEach(async () => {
  await stopActivePlayback();
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
  globalThis.document = savedDocument;
});

describe('PROBE AUDIO-AUTOPLAY-OLD-CARD — chat-log render on page load', () => {
  it('a narrator card posted hours before this page loaded does not autoplay on the first click', async () => {
    const postedAt = Date.now() - 2 * 60 * 60 * 1000;
    const oldCard = {
      id: 'old-card-1',
      timestamp: postedAt,
      flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE, timestamp: new Date(postedAt).toISOString() } },
    };
    // Foundry renders the recent chat log at load: this card's render hook runs.
    const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
    await onNarratorCardRendered(oldCard, root);

    // The player's first click anywhere (e.g. on the canvas).
    for (const h of [...docClickHandlers]) h({ type: 'click' });
    await flush();

    // Actual today: the two-hour-old narration starts playing.
    expect(foundry.audio.Sound._instances).toHaveLength(0);
  });
});
