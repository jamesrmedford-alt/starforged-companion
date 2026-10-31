// tests/probes/infra/audioKeylessBrowseRefused.probe.test.js
//
// PROBE (infra audit) — AUDIO-KEYLESS-NEEDS-BROWSE.
//
// Keyless playback: the player asks the canonical GM to synthesise + cache a
// clip; the GM writes it and broadcasts `audio.synth.done` carrying ONLY the
// hash; the player then finds the file itself with cache.lookup(), i.e.
// FilePicker.browse("data", "worlds/<id>/audio/<hh>"). Browsing needs Foundry's
// "Use File Browser" (FILES_BROWSE) permission, which by default only Trusted
// Players and above hold — a plain PLAYER's browse is refused, lookup()
// swallows the refusal as a miss, and the player gets "Narrator audio isn't
// ready yet — ask the GM to play this card once" every time, even right after
// the GM cached the clip. (A keyed PLAYER likewise never gets a cache hit and
// re-synthesises every clip on its own credits.)
//
// The fake FilePicker below models that refusal for non-GM users. The GM
// knows the path it wrote (cache.write returns it) and could send it in the
// done signal. Asserts the keyless player plays the GM-cached clip. FAILS
// today.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/audio/elevenlabs.js', () => ({ synthesise: vi.fn() }));

import { onNarratorCardRendered, registerAudioSocket } from '../../../src/audio/index.js';
import { _resetAudioCacheStateForTests } from '../../../src/audio/cache.js';
import { stopActivePlayback } from '../../../src/audio/playback.js';
import { parseHTML, StubElement, setListenerResultSink } from '../../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const PROSE = 'The hull groans and holds.';

let savedHTMLElement, savedEmit, savedBrowse, restoreUser, gmWrote;
let browseAllowed = false;   // a Trusted Player (control) may browse

beforeEach(() => {
  silenceConsoleErrors();
  savedHTMLElement = globalThis.HTMLElement;
  globalThis.HTMLElement = StubElement;
  setListenerResultSink(() => {});
  foundry.audio.Sound._reset();
  _resetAudioCacheStateForTests();
  const fp = foundry.applications.apps.FilePicker.implementation;
  fp._reset();
  savedBrowse = fp.browse;
  fp.browse = async (source, path) => {
    // Foundry refuses FilePicker.browse to a user without FILES_BROWSE
    // (default role: Trusted Player) — a plain player here.
    if (!game.user.isGM && !browseAllowed) throw new Error('You do not have permission to browse files');
    return savedBrowse(source, path);
  };
  restoreUser = asPlayer();
  for (const [key, value] of Object.entries({
    'audio.enabled':         true,
    'audio.clientEnabled':   true,
    'audio.narratorVoiceId': 'voice-narrator',
    'audio.npcVoiceId':      'voice-npc',
  })) game.settings._store.set(`${MODULE_ID}.${key}`, value);
  game.settings._store.delete(`${MODULE_ID}.elevenLabsApiKey`);   // keyless player

  // The canonical GM (another client): synthesises, writes the file where
  // cache.write puts it, then signals done with the hash.
  gmWrote = [];
  game.socket._reset();
  savedEmit = game.socket.emit;
  game.socket.emit = (event, payload) => {
    if (payload?.kind !== 'audio.synth.request') return;
    const path = `worlds/test-world/audio/${payload.hash.slice(0, 2)}/${payload.hash}.mp3`;
    fp._files.add(path);
    gmWrote.push(path);
    setTimeout(() => (game.socket._handlers.get(event) ?? [])
      .forEach(h => h({ kind: 'audio.synth.done', hash: payload.hash })), 0);
  };
  registerAudioSocket();
});

afterEach(async () => {
  await stopActivePlayback();
  foundry.applications.apps.FilePicker.implementation.browse = savedBrowse;
  game.socket.emit = savedEmit;
  game.socket._reset();
  restoreUser();
  setListenerResultSink(null);
  globalThis.HTMLElement = savedHTMLElement;
});

describe('PROBE AUDIO-KEYLESS-NEEDS-BROWSE — keyless player without File Browser permission', () => {
  it('control — a Trusted Player (may browse) plays the GM-cached clip today', async () => {
    browseAllowed = true;
    const text = 'Control prose for a trusted player.';
    const message = { id: 'msg-trusted', flags: { [MODULE_ID]: { narratorCard: true, narrationText: text } } };
    const root = parseHTML(`<div class="sf-narration-prose">${text}</div><button data-action="audioPlayToggle" hidden></button>`);
    await onNarratorCardRendered(message, root);
    const play = root.querySelector('[data-action="audioPlayToggle"]');
    play.click();
    await vi.waitFor(() => expect(['playing', 'error']).toContain(play.getAttribute('data-state')));
    expect(play.getAttribute('data-state')).toBe('playing');
    browseAllowed = false;
  });

  it('plays the clip the GM just synthesised and cached for it', async () => {
    const message = { id: 'msg-keyless', flags: { [MODULE_ID]: { narratorCard: true, narrationText: PROSE } } };
    const root = parseHTML(`<div class="sf-narration-prose">${PROSE}</div><button data-action="audioPlayToggle" hidden></button>`);
    await onNarratorCardRendered(message, root);
    const play = root.querySelector('[data-action="audioPlayToggle"]');

    play.click();
    await vi.waitFor(() => expect(['playing', 'error']).toContain(play.getAttribute('data-state')));

    expect(gmWrote).toHaveLength(1);                         // the GM did cache it
    // Actual today: state "error", title "Narrator audio isn't ready yet — ask the GM …", no Sound.
    expect(play.getAttribute('data-state')).toBe('playing');
    expect(foundry.audio.Sound._instances.map(s => s.src)).toContain(gmWrote[0]);
  });
});
