/**
 * STARFORGED COMPANION
 * tests/unit/audioAutoplayHistoricalCard.test.js
 *
 * Issue #322 V15 (the audit's audioAutoplayHistoricalCard probe,
 * AUDIO-AUTOPLAY-OLD-CARD): with "Auto-play narrator audio" on,
 * onNarratorCardRendered claimed auto-play for every narrator card it rendered
 * whose id was not in this browser's played-list (claimAutoplayOnce, F14).
 * Foundry renders the recent chat log at every page load, so on a browser
 * whose list lacked those ids — a new device, cleared site data, the first
 * load after turning auto-play on — every old card claimed it, and the
 * player's first click anywhere played an hours-old narration. Only a card
 * created since this client started (its server timestamp, a minute's
 * margin) auto-plays now.
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

import { onNarratorCardRendered, markAudioClientReady, _resetAutoplayGuardForTests } from '../../src/audio/index.js';
import { cacheKey, lookup } from '../../src/audio/cache.js';
import { stopActivePlayback } from '../../src/audio/playback.js';
import { parseHTML, StubElement, setListenerResultSink } from '../helpers/cardDom.js';

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

describe('chat-log render on page load (AUDIO-AUTOPLAY-OLD-CARD)', () => {
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

    // The two-hour-old narration used to start playing.
    expect(foundry.audio.Sound._instances).toHaveLength(0);
  });

  it('control: a card created after this client started auto-plays on the first click', async () => {
    _resetAutoplayGuardForTests();
    markAudioClientReady();
    const newCard = {
      id: 'new-card-1',
      timestamp: Date.now() + 1000,
      flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } },
    };
    const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
    await onNarratorCardRendered(newCard, root);
    for (const h of [...docClickHandlers]) h({ type: 'click' });
    await flush();
    await vi.waitFor(() => expect(foundry.audio.Sound._instances.length).toBeGreaterThan(0));
  });

  it('an old card still plays when its Play button is clicked', async () => {
    _resetAutoplayGuardForTests();
    const oldCard = { id: 'old-card-2', timestamp: Date.now() - 3 * 60 * 60 * 1000,
      flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
    const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
    await onNarratorCardRendered(oldCard, root);
    expect(foundry.audio.Sound._instances).toHaveLength(0);
    root.querySelector('[data-action="audioPlayToggle"]').click();
    await vi.waitFor(() => expect(foundry.audio.Sound._instances.length).toBeGreaterThan(0));
  });
});
